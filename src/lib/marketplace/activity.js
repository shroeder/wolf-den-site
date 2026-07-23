import "server-only";

import { db } from "@/lib/db";

// Granular customer-action telemetry. trackActivity is best-effort + non-blocking (never breaks the action
// it's logging). Events are short keys with optional meta; the admin app maps them to friendly labels.

// Client-firable events (via /api/marketplace/track). page_view covers ALL traffic incl. anonymous.
export const CLIENT_EVENTS = new Set([
    "page_view", "view_profile", "shop_search", "shop_filter", "inspect_item",
    "view_boss", "view_leaderboard", "browse_shop", "view_vendor", "view_inventory",
    "share_location", "view_bounties",
]);

// Pull the eight scalar context columns + a JSONB blob for the rest out of a device/geo context object.
function splitContext(ctx) {
    const c = ctx || {};
    const context = {
        latitude: c.latitude || null,
        longitude: c.longitude || null,
        timezone: c.timezone || null,
        lang: c.lang || null,
        screen: c.screen || null,
        viewport: c.viewport || null,
        referrer: c.referrer || null,
        connection: c.connection || null,
    };
    const hasContext = Object.values(context).some(Boolean);
    return { c, context, hasContext };
}

// Log an event. buyerId OR anonId identifies who; path is set for page views; ctx carries device/geo (see
// request-context.js + the client beacon). Best-effort, non-blocking.
export async function trackActivity(buyerId, event, meta = null, { path = null, anonId = null, ctx = null } = {}) {
    if (!event || (!buyerId && !anonId)) return;
    const { c, context, hasContext } = splitContext(ctx);
    await db
        .query(
            `INSERT INTO mkt_activity_event
                (buyer_id, event, meta, path, anon_id, ip, user_agent, device, browser, os, country, region, city, context)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
                buyerId || null, String(event).slice(0, 40), meta ? JSON.stringify(meta) : null,
                path ? String(path).slice(0, 200) : null, anonId ? String(anonId).slice(0, 48) : null,
                c.ip || null, c.userAgent || null, c.device || null, c.browser || null, c.os || null,
                c.country || null, c.region || null, c.city || null, hasContext ? JSON.stringify(context) : null,
            ]
        )
        .catch(() => {});
}

// Roll up one row per visitor (keyed by anon_id — every browser has one, member or not). first_seen,
// landing_path, referrer + all attribution are FIRST-TOUCH (set on insert only, never overwritten);
// device/geo/last_seen/events keep freshening.
export async function recordVisitor({ anonId, buyerId = null, ctx = null, path = null, attr = null } = {}) {
    if (!anonId) return;
    const c = ctx || {};
    const a = attr || {};
    const s = (v) => (v ? String(v).slice(0, 120) : null);
    await db
        .query(
            `INSERT INTO mkt_visitor
                (anon_id, buyer_id, first_seen, last_seen, events, ip, user_agent, device, browser, os,
                 country, region, city, latitude, longitude, timezone, lang, screen, landing_path, referrer,
                 utm_source, utm_medium, utm_campaign, utm_term, utm_content, click_id, source_kind)
             VALUES ($1,$2,NOW(),NOW(),1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                     $18,$19,$20,$21,$22,$23,$24)
             ON CONFLICT (anon_id) DO UPDATE SET
                last_seen = NOW(),
                events    = mkt_visitor.events + 1,
                buyer_id  = COALESCE(EXCLUDED.buyer_id, mkt_visitor.buyer_id),
                ip        = COALESCE(EXCLUDED.ip, mkt_visitor.ip),
                user_agent= COALESCE(EXCLUDED.user_agent, mkt_visitor.user_agent),
                device    = COALESCE(EXCLUDED.device, mkt_visitor.device),
                browser   = COALESCE(EXCLUDED.browser, mkt_visitor.browser),
                os        = COALESCE(EXCLUDED.os, mkt_visitor.os),
                country   = COALESCE(EXCLUDED.country, mkt_visitor.country),
                region    = COALESCE(EXCLUDED.region, mkt_visitor.region),
                city      = COALESCE(EXCLUDED.city, mkt_visitor.city),
                latitude  = COALESCE(EXCLUDED.latitude, mkt_visitor.latitude),
                longitude = COALESCE(EXCLUDED.longitude, mkt_visitor.longitude),
                timezone  = COALESCE(EXCLUDED.timezone, mkt_visitor.timezone),
                lang      = COALESCE(EXCLUDED.lang, mkt_visitor.lang),
                screen    = COALESCE(EXCLUDED.screen, mkt_visitor.screen)`,
            [
                String(anonId).slice(0, 48), buyerId || null,
                c.ip || null, c.userAgent || null, c.device || null, c.browser || null, c.os || null,
                c.country || null, c.region || null, c.city || null, c.latitude || null, c.longitude || null,
                c.timezone || null, c.lang || null, c.screen || null,
                path ? String(path).slice(0, 200) : null, s(a.referrer) || c.referrer || null,
                s(a.utm_source), s(a.utm_medium), s(a.utm_campaign), s(a.utm_term), s(a.utm_content),
                s(a.click_id), s(a.source_kind),
            ]
        )
        .catch(() => {});
}

// Store precise, opt-in browser geolocation on the visitor (far more accurate than IP geo). Latest wins.
export async function recordPreciseGeo({ anonId, buyerId = null, lat = null, lng = null, accuracy = null } = {}) {
    if (!anonId || lat == null || lng == null) return;
    await db
        .query(
            `UPDATE mkt_visitor
                SET geo_lat = $2, geo_lng = $3, geo_accuracy = $4, geo_at = NOW(),
                    buyer_id = COALESCE($5, buyer_id)
              WHERE anon_id = $1`,
            [String(anonId).slice(0, 48), Number(lat), Number(lng), accuracy != null ? Number(accuracy) : null, buyerId || null]
        )
        .catch(() => {});
}

// Recent visitors (anonymous + members), newest activity first — powers the admin "Visitors" view.
export async function recentVisitors({ limit = 100 } = {}) {
    const rows = await db
        .query(
            `SELECT v.anon_id, v.buyer_id, v.first_seen, v.last_seen, v.events, v.ip, v.device, v.browser, v.os,
                    v.country, v.region, v.city, v.timezone, v.lang, v.screen, v.landing_path, v.referrer,
                    v.utm_source, v.utm_campaign, v.source_kind, v.geo_lat, v.geo_lng, v.geo_accuracy,
                    b.display_name, b.alias
               FROM mkt_visitor v LEFT JOIN mkt_buyer b ON b.id = v.buyer_id
              ORDER BY v.last_seen DESC LIMIT $1`,
            [Math.min(300, Math.max(1, Number(limit) || 100))]
        )
        .catch(() => []);
    return rows.map((r) => ({
        anonId: r.anon_id,
        buyerId: r.buyer_id || null,
        who: r.display_name || r.alias || (r.buyer_id ? "Member" : "Anonymous"),
        isMember: Boolean(r.buyer_id),
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        events: r.events,
        ip: r.ip || null,
        device: r.device || null,
        browser: r.browser || null,
        os: r.os || null,
        country: r.country || null,
        region: r.region || null,
        city: r.city || null,
        timezone: r.timezone || null,
        lang: r.lang || null,
        screen: r.screen || null,
        landing: r.landing_path || null,
        referrer: r.referrer || null,
        source: r.utm_source || null,
        campaign: r.utm_campaign || null,
        sourceKind: r.source_kind || null,
        preciseGeo: r.geo_lat != null && r.geo_lng != null ? { lat: r.geo_lat, lng: r.geo_lng, accuracy: r.geo_accuracy } : null,
    }));
}

// A member's recent granular actions (for the drill-down), newest first.
export async function memberActivityFeed(buyerId, limit = 80) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT event, meta, created_at FROM mkt_activity_event WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`, [buyerId, Math.min(200, limit)]).catch(() => []);
    return rows.map((r) => ({ event: r.event, meta: r.meta || null, at: r.created_at }));
}

// Activity counts per member over a window (default 30 days) — drives most/least-active ranking.
export async function activityCounts(buyerIds, days = 30) {
    if (!buyerIds?.length) return new Map();
    const rows = await db
        .query(
            `SELECT buyer_id, COUNT(*)::int AS n, MAX(created_at) AS last_at
               FROM mkt_activity_event
              WHERE buyer_id = ANY($1) AND created_at > NOW() - ($2 || ' days')::interval
              GROUP BY buyer_id`,
            [buyerIds, String(days)]
        )
        .catch(() => []);
    return new Map(rows.map((r) => [r.buyer_id, { count: r.n, lastAt: r.last_at }]));
}

// Site-wide telemetry dashboard: recent live feed + engagement reports over a window (hours).
// audience filters everything to signed-in members, anonymous visitors, or all traffic — the admin app's
// Activity screen toggles between them. Also returns a per-person rollup (people) for the chosen audience.
export async function telemetryDashboard({ hours = 168, feedLimit = 120, audience = "all" } = {}) {
    const win = `${Math.max(1, Math.min(720, Number(hours) || 168))} hours`;
    // Audience clause on mkt_activity_event (whitelisted → safe to inline). `A` = with the `a.` feed alias.
    const aud = audience === "members" ? " AND buyer_id IS NOT NULL" : audience === "anon" ? " AND buyer_id IS NULL" : "";
    const audA = audience === "members" ? " AND a.buyer_id IS NOT NULL" : audience === "anon" ? " AND a.buyer_id IS NULL" : "";
    const wantMembers = audience !== "anon";
    const wantAnon = audience !== "members";
    const [feed, topEvents, topPages, totals, hourly, devices, countries, cities, sourceKinds, topSources, campaigns, memberPeople, anonPeople, bucketRow] = await Promise.all([
        db.query(
            `SELECT a.event, a.path, a.meta, a.created_at, a.buyer_id, a.anon_id, a.device, a.browser, a.os,
                    a.country, a.region, a.city, b.display_name, b.alias
               FROM mkt_activity_event a LEFT JOIN mkt_buyer b ON b.id = a.buyer_id
              WHERE a.created_at > NOW() - $2::interval${audA}
              ORDER BY a.created_at DESC LIMIT $1`,
            [Math.min(300, feedLimit), win]
        ).catch(() => []),
        db.query(`SELECT event, COUNT(*)::int AS n FROM mkt_activity_event WHERE created_at > NOW() - $1::interval${aud} GROUP BY event ORDER BY n DESC LIMIT 25`, [win]).catch(() => []),
        db.query(`SELECT path, COUNT(*)::int AS n FROM mkt_activity_event WHERE event = 'page_view' AND path IS NOT NULL AND created_at > NOW() - $1::interval${aud} GROUP BY path ORDER BY n DESC LIMIT 25`, [win]).catch(() => []),
        db.queryOne(
            `SELECT COUNT(*)::int AS events,
                    COUNT(DISTINCT buyer_id)::int AS users,
                    COUNT(DISTINCT anon_id) FILTER (WHERE buyer_id IS NULL)::int AS anons
               FROM mkt_activity_event WHERE created_at > NOW() - $1::interval${aud}`,
            [win]
        ).catch(() => null),
        // Traffic chart — hourly buckets for short windows, daily buckets once it spans more than ~2 days.
        db.query(
            (Number(hours) || 168) > 48
                ? `SELECT to_char(date_trunc('day', created_at), 'MM-DD') AS bucket, COUNT(*)::int AS n
                     FROM mkt_activity_event WHERE created_at > NOW() - $1::interval${aud}
                    GROUP BY 1 ORDER BY 1`
                : `SELECT to_char(date_trunc('hour', created_at), 'MM-DD HH24:00') AS bucket, COUNT(*)::int AS n
                     FROM mkt_activity_event WHERE created_at > NOW() - $1::interval${aud}
                    GROUP BY 1 ORDER BY 1`,
            [win]
        ).catch(() => []),
        db.query(`SELECT device, COUNT(*)::int AS n FROM mkt_activity_event WHERE device IS NOT NULL AND created_at > NOW() - $1::interval${aud} GROUP BY device ORDER BY n DESC`, [win]).catch(() => []),
        db.query(`SELECT country, COUNT(*)::int AS n FROM mkt_activity_event WHERE country IS NOT NULL AND created_at > NOW() - $1::interval${aud} GROUP BY country ORDER BY n DESC LIMIT 15`, [win]).catch(() => []),
        db.query(`SELECT city, region, country, COUNT(*)::int AS n FROM mkt_activity_event WHERE city IS NOT NULL AND created_at > NOW() - $1::interval${aud} GROUP BY city, region, country ORDER BY n DESC LIMIT 15`, [win]).catch(() => []),
        // Acquisition: how visitors seen in the window first arrived (first-touch attribution on the rollup).
        db.query(`SELECT COALESCE(NULLIF(source_kind,''), 'direct') AS kind, COUNT(*)::int AS n FROM mkt_visitor WHERE last_seen > NOW() - $1::interval GROUP BY kind ORDER BY n DESC`, [win]).catch(() => []),
        db.query(`SELECT COALESCE(NULLIF(utm_source,''), NULLIF(referrer,''), 'direct') AS src, COUNT(*)::int AS n FROM mkt_visitor WHERE last_seen > NOW() - $1::interval GROUP BY src ORDER BY n DESC LIMIT 12`, [win]).catch(() => []),
        db.query(`SELECT utm_campaign AS campaign, COUNT(*)::int AS n FROM mkt_visitor WHERE utm_campaign IS NOT NULL AND last_seen > NOW() - $1::interval GROUP BY campaign ORDER BY n DESC LIMIT 10`, [win]).catch(() => []),
        // Per-person rollup: one row per member with their event count / last-seen (drill-in by id).
        wantMembers
            ? db.query(
                  `SELECT b.id, b.display_name, b.alias, COUNT(*)::int AS n, MAX(a.created_at) AS last_at
                     FROM mkt_activity_event a JOIN mkt_buyer b ON b.id = a.buyer_id
                    WHERE a.created_at > NOW() - $1::interval
                    GROUP BY b.id ORDER BY n DESC LIMIT 60`,
                  [win]
              ).catch(() => [])
            : Promise.resolve([]),
        // Per-person rollup: one row per anonymous visitor (keyed by anon_id) with device / place.
        wantAnon
            ? db.query(
                  `SELECT anon_id, COUNT(*)::int AS n, MAX(created_at) AS last_at,
                          MAX(device) AS device, MAX(browser) AS browser, MAX(os) AS os, MAX(ip) AS ip,
                          MAX(city) AS city, MAX(region) AS region, MAX(country) AS country
                     FROM mkt_activity_event
                    WHERE buyer_id IS NULL AND anon_id IS NOT NULL AND created_at > NOW() - $1::interval
                    GROUP BY anon_id ORDER BY n DESC LIMIT 60`,
                  [win]
              ).catch(() => [])
            : Promise.resolve([]),
        // Activity-volume buckets (respecting the audience lens): today (store-local) + rolling 3/7/30 days.
        db.queryOne(
            `SELECT
                COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date)::int AS today,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '3 days')::int  AS d3,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int  AS d7,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS d30
               FROM mkt_activity_event WHERE TRUE${aud}`
        ).catch(() => null),
    ]);
    return {
        feed: feed.map((r) => {
            let meta = r.meta;
            if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = null; } }
            const place = [r.city, r.region, r.country].filter(Boolean).join(", ") || null;
            return {
                event: r.event, path: r.path || null, meta, at: r.created_at,
                who: r.display_name || r.alias || (r.buyer_id ? "Member" : "Anonymous"),
                anon: !r.display_name && !r.alias,
                device: r.device || null, browser: r.browser || null, os: r.os || null, place,
            };
        }),
        topEvents: topEvents.map((r) => ({ event: r.event, n: r.n })),
        topPages: topPages.map((r) => ({ path: r.path, n: r.n })),
        totals: { events: totals?.events || 0, users: totals?.users || 0, anons: totals?.anons || 0 },
        // Rolling windows over the SAME audience lens (the top-of-dashboard "today / 3d / 7d / 30d" counts).
        buckets: { today: bucketRow?.today || 0, d3: bucketRow?.d3 || 0, d7: bucketRow?.d7 || 0, d30: bucketRow?.d30 || 0 },
        hourly: hourly.map((r) => ({ bucket: r.bucket, n: r.n })),
        devices: devices.map((r) => ({ device: r.device, n: r.n })),
        topCountries: countries.map((r) => ({ country: r.country, n: r.n })),
        topCities: cities.map((r) => ({ city: [r.city, r.region, r.country].filter(Boolean).join(", "), n: r.n })),
        sourceKinds: sourceKinds.map((r) => ({ kind: r.kind, n: r.n })),
        topSources: topSources.map((r) => ({ source: r.src, n: r.n })),
        campaigns: campaigns.map((r) => ({ campaign: r.campaign, n: r.n })),
        audience,
        people: {
            members: memberPeople.map((r) => ({ id: r.id, name: r.display_name || r.alias || "Member", alias: r.alias || null, n: r.n, lastAt: r.last_at })),
            anon: anonPeople.map((r) => ({
                anonId: r.anon_id,
                n: r.n,
                lastAt: r.last_at,
                device: r.device || null,
                browser: r.browser || null,
                os: r.os || null,
                ip: r.ip || null,
                place: [r.city, r.region, r.country].filter(Boolean).join(", ") || null,
            })),
        },
    };
}

// Drill-in: WHO performed a specific action over the window (powers "tap a category → itemized who-did-what").
export async function eventDrill({ event, hours = 168, audience = "all", limit = 200 } = {}) {
    if (!event) return { event: null, rows: [] };
    const win = `${Math.max(1, Math.min(720, Number(hours) || 168))} hours`;
    const audA = audience === "members" ? " AND a.buyer_id IS NOT NULL" : audience === "anon" ? " AND a.buyer_id IS NULL" : "";
    const rows = await db
        .query(
            `SELECT a.event, a.path, a.meta, a.created_at, a.buyer_id, a.anon_id, a.device, a.ip, a.city, a.region, a.country,
                    b.display_name, b.alias
               FROM mkt_activity_event a LEFT JOIN mkt_buyer b ON b.id = a.buyer_id
              WHERE a.event = $1 AND a.created_at > NOW() - $2::interval${audA}
              ORDER BY a.created_at DESC LIMIT $3`,
            [event, win, Math.min(500, Number(limit) || 200)]
        )
        .catch(() => []);
    return {
        event,
        rows: rows.map((r) => {
            let meta = r.meta;
            if (typeof meta === "string") {
                try {
                    meta = JSON.parse(meta);
                } catch {
                    meta = null;
                }
            }
            return {
                who: r.display_name || r.alias || (r.buyer_id ? "Member" : "Anonymous"),
                buyerId: r.buyer_id || null,
                anonId: r.buyer_id ? null : r.anon_id || null,
                anon: !r.display_name && !r.alias,
                meta,
                path: r.path || null,
                at: r.created_at,
                device: r.device || null,
                ip: r.ip || null,
                place: [r.city, r.region, r.country].filter(Boolean).join(", ") || null,
            };
        }),
    };
}

// Drill-in: the visitors who arrived via a given traffic source / channel (click a source → who came from it).
// Pass `kind` (a source_kind bucket like paid/social/direct) OR `source` (the utm_source/referrer label shown
// in the Top sources list).
export async function sourceDrill({ kind = null, source = null, hours = 168, limit = 200 } = {}) {
    const win = `${Math.max(1, Math.min(720, Number(hours) || 168))} hours`;
    let where = "v.last_seen > NOW() - $1::interval";
    const params = [win];
    if (kind) {
        if (kind === "direct") {
            where += ` AND COALESCE(NULLIF(v.source_kind,''),'direct') = 'direct'`;
        } else {
            params.push(kind);
            where += ` AND v.source_kind = $${params.length}`;
        }
    } else if (source) {
        params.push(source);
        where += ` AND COALESCE(NULLIF(v.utm_source,''), NULLIF(v.referrer,''), 'direct') = $${params.length}`;
    }
    params.push(Math.min(500, Number(limit) || 200));
    const rows = await db
        .query(
            `SELECT v.anon_id, v.buyer_id, v.first_seen, v.last_seen, v.events, v.landing_path, v.referrer,
                    v.utm_source, v.utm_campaign, v.source_kind, v.device, v.browser, v.os, v.ip, v.city, v.region, v.country,
                    b.display_name, b.alias
               FROM mkt_visitor v LEFT JOIN mkt_buyer b ON b.id = v.buyer_id
              WHERE ${where}
              ORDER BY v.last_seen DESC LIMIT $${params.length}`,
            params
        )
        .catch(() => []);
    return {
        kind: kind || null,
        source: source || null,
        visitors: rows.map((r) => ({
            anonId: r.anon_id,
            becameMember: r.buyer_id ? { id: r.buyer_id, name: r.display_name || r.alias || "Member" } : null,
            events: r.events || 0,
            firstSeen: r.first_seen,
            lastSeen: r.last_seen,
            landingPath: r.landing_path || null,
            referrer: r.referrer || null,
            source: r.utm_source || r.referrer || r.source_kind || "direct",
            campaign: r.utm_campaign || null,
            device: r.device || null,
            browser: r.browser || null,
            os: r.os || null,
            ip: r.ip || null,
            place: [r.city, r.region, r.country].filter(Boolean).join(", ") || null,
        })),
    };
}

// Real-time firehose: the newest activity events across the WHOLE site (members + anonymous), keyed by the
// row id so a client can poll incrementally. Pass `sinceId` to get only events newer than the last one you
// saw (returns them newest-first); omit it for the initial page. Powers the admin "Live Feed" screen.
export async function liveFeed({ sinceId = null, limit = 60 } = {}) {
    const lim = Math.min(200, Math.max(1, Number(limit) || 60));
    const since = sinceId == null ? null : String(sinceId);
    const rows = await db
        .query(
            `SELECT a.id, a.event, a.path, a.meta, a.created_at, a.buyer_id, a.anon_id, a.device, a.browser, a.os,
                    a.ip, a.city, a.region, a.country, b.display_name, b.alias
               FROM mkt_activity_event a LEFT JOIN mkt_buyer b ON b.id = a.buyer_id
              WHERE ($1::bigint IS NULL OR a.id > $1::bigint)
              ORDER BY a.id DESC LIMIT $2`,
            [since, lim]
        )
        .catch(() => []);
    const events = rows.map((r) => {
        let meta = r.meta;
        if (typeof meta === "string") {
            try {
                meta = JSON.parse(meta);
            } catch {
                meta = null;
            }
        }
        return {
            id: Number(r.id),
            event: r.event,
            path: r.path || null,
            meta,
            at: r.created_at,
            who: r.display_name || r.alias || (r.buyer_id ? "Member" : "Anonymous"),
            buyerId: r.buyer_id || null,
            anonId: r.buyer_id ? null : r.anon_id || null,
            anon: !r.display_name && !r.alias,
            device: r.device || null,
            browser: r.browser || null,
            os: r.os || null,
            ip: r.ip || null,
            place: [r.city, r.region, r.country].filter(Boolean).join(", ") || null,
        };
    });
    return { events, lastId: events.length ? Math.max(...events.map((e) => e.id)) : sinceId == null ? 0 : Number(sinceId) };
}
