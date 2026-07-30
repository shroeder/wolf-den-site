import "server-only";

import { db } from "@/lib/db";
import { isWebPushEnabled } from "@/lib/push/web-push.js";

// ── WHO CAN WE ACTUALLY REACH? ───────────────────────────────────────────────────────────────────────────────
// Three separate audiences, constantly confused for one another:
//   1. BROWSER push  (mkt_web_push)   — the one that matters; every member notification rides on it.
//   2. PHONE-APP push (mkt_push_token) — FCM devices, only useful once the app is installed.
//   3. LOCATION      (mkt_visitor.geo_*) — opt-in browser geolocation, precise lat/lng. Distinct from the
//      IP-derived `city`, which we get for nearly everyone without asking and is NOT a granted permission.
//
// The VAPID keypair was rotated 2026-07-25. Subscriptions created before that are signed for the OLD public
// key, so the push service rejects them with a 403 — and broadcastWebPush only prunes on 404/410, meaning
// they sit in the table forever looking healthy. They're surfaced as `stale` here.
const VAPID_ROTATED_AT = "2026-07-25";

export async function getNotifyAudience() {
    const [counts, web, tokens, geo, geoRecent] = await Promise.all([
        db.queryOne(
            `SELECT (SELECT COUNT(*)::int FROM mkt_buyer) AS members,
                    (SELECT COUNT(*)::int FROM mkt_web_push) AS web_subs,
                    (SELECT COUNT(DISTINCT buyer_id)::int FROM mkt_web_push) AS web_members,
                    (SELECT COUNT(*)::int FROM mkt_web_push WHERE created_at < '${VAPID_ROTATED_AT}') AS web_stale,
                    (SELECT COUNT(*)::int FROM mkt_push_token WHERE token IS NOT NULL AND token <> '') AS app_tokens,
                    (SELECT COUNT(*)::int FROM mkt_visitor WHERE geo_lat IS NOT NULL) AS geo_grants,
                    (SELECT COUNT(*)::int FROM mkt_visitor WHERE city IS NOT NULL) AS city_known,
                    (SELECT COUNT(*)::int FROM mkt_visitor) AS visitors`
        ).catch(() => null),

        // One row per subscribed browser. `everSent` leans on sendWebPush stamping last_used_at only on a
        // successful send, so a row where it's still equal to created_at has never actually received anything.
        db.query(
            `SELECT COALESCE(NULLIF(b.display_name,''), b.alias, b.email, 'unknown') AS name,
                    b.alias, b.email,
                    w.user_agent,
                    TO_CHAR(w.created_at   AT TIME ZONE 'America/Chicago','MM-DD HH24:MI') AS created_ct,
                    TO_CHAR(w.last_used_at AT TIME ZONE 'America/Chicago','MM-DD HH24:MI') AS last_used_ct,
                    (w.last_used_at > w.created_at + INTERVAL '5 seconds') AS ever_sent,
                    (w.created_at < '${VAPID_ROTATED_AT}') AS stale,
                    CASE
                        WHEN w.endpoint LIKE '%apple%'   THEN 'Apple (Safari/iOS)'
                        WHEN w.endpoint LIKE '%mozilla%' THEN 'Mozilla (Firefox)'
                        WHEN w.endpoint LIKE '%fcm%' OR w.endpoint LIKE '%google%' THEN 'Google (Chrome/Edge)'
                        ELSE 'other'
                    END AS service
               FROM mkt_web_push w LEFT JOIN mkt_buyer b ON b.id = w.buyer_id
              ORDER BY w.last_used_at DESC NULLS LAST`
        ).catch(() => []),

        db.query(
            `SELECT COALESCE(platform, 'unknown') AS platform, COUNT(*)::int AS n
               FROM mkt_push_token WHERE token IS NOT NULL AND token <> '' GROUP BY 1 ORDER BY n DESC`
        ).catch(() => []),

        // Granted precise location. Joined to the member when the visitor is signed in; anonymous otherwise.
        db.query(
            `SELECT COALESCE(NULLIF(b.display_name,''), b.alias, b.email) AS name,
                    v.city, v.region, v.country,
                    ROUND(v.geo_lat::numeric, 4)::float AS lat,
                    ROUND(v.geo_lng::numeric, 4)::float AS lng,
                    ROUND(v.geo_accuracy::numeric, 0)::int AS accuracy_m,
                    TO_CHAR(v.geo_at AT TIME ZONE 'America/Chicago','MM-DD HH24:MI') AS geo_at_ct,
                    (v.buyer_id IS NOT NULL) AS is_member,
                    v.device, v.browser
               FROM mkt_visitor v LEFT JOIN mkt_buyer b ON b.id = v.buyer_id
              WHERE v.geo_lat IS NOT NULL
              ORDER BY v.geo_at DESC NULLS LAST LIMIT 100`
        ).catch(() => []),

        // IP-derived city coverage, for contrast — this is NOT a granted permission.
        db.query(
            `SELECT city, COUNT(*)::int AS n FROM mkt_visitor
              WHERE city IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 12`
        ).catch(() => []),
    ]);

    const c = counts || {};
    const members = c.members || 0;
    const webMembers = c.web_members || 0;
    const pct = members ? Math.round((webMembers / members) * 100) : 0;

    const flags = [];
    if (!isWebPushEnabled()) {
        flags.push({ sev: "warn", text: "VAPID_PRIVATE_KEY is NOT set on this server — browser push is switched off entirely and every send silently no-ops." });
    } else {
        flags.push({ sev: "good", text: "Browser push is configured (VAPID key present)." });
    }
    flags.push({ sev: pct >= 30 ? "good" : "info", text: `${webMembers} of ${members} members (${pct}%) have notifications switched on in a browser.` });
    if (c.web_stale) {
        flags.push({ sev: "warn", text: `${c.web_stale} subscription${c.web_stale === 1 ? " was" : "s were"} created before the ${VAPID_ROTATED_AT} VAPID rotation — the push service rejects them (403) and they are never auto-pruned. Those members must re-enable notifications.` });
    }
    const never = (web || []).filter((r) => !r.ever_sent).length;
    if (never) flags.push({ sev: "info", text: `${never} subscription${never === 1 ? " has" : "s have"} never received a successful push.` });
    if (!c.app_tokens) flags.push({ sev: "info", text: "No phone-app push tokens registered, so app pushes reach nobody. Browser push is the only live channel." });
    flags.push({ sev: "info", text: `${c.geo_grants || 0} of ${c.visitors || 0} visitors granted precise location. IP-derived city is known for ${c.city_known || 0} without asking.` });

    return {
        configured: isWebPushEnabled(),
        summary: {
            members,
            webSubs: c.web_subs || 0,
            webMembers,
            webPct: pct,
            webStale: c.web_stale || 0,
            appTokens: c.app_tokens || 0,
            geoGrants: c.geo_grants || 0,
            cityKnown: c.city_known || 0,
            visitors: c.visitors || 0,
            vapidRotatedAt: VAPID_ROTATED_AT,
        },
        web: (web || []).map((r) => ({
            name: r.name, alias: r.alias, email: r.email, service: r.service,
            device: shortUa(r.user_agent), createdCt: r.created_ct, lastUsedCt: r.last_used_ct,
            everSent: Boolean(r.ever_sent), stale: Boolean(r.stale),
        })),
        appTokens: (tokens || []).map((r) => ({ platform: r.platform, n: r.n })),
        geo: (geo || []).map((r) => ({
            name: r.name || null, isMember: Boolean(r.is_member), city: r.city, region: r.region, country: r.country,
            lat: r.lat, lng: r.lng, accuracyM: r.accuracy_m, geoAtCt: r.geo_at_ct,
            device: r.device, browser: r.browser,
        })),
        cities: (geoRecent || []).map((r) => ({ city: r.city, n: r.n })),
        flags,
    };
}

// "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit…" → "Android · Chrome"-ish. Just enough to tell devices apart.
function shortUa(ua) {
    const s = String(ua || "");
    if (!s) return "unknown device";
    const os = /iPhone|iPad/i.test(s) ? "iPhone/iPad"
        : /Android/i.test(s) ? "Android"
        : /Windows/i.test(s) ? "Windows"
        : /Mac OS X/i.test(s) ? "Mac"
        : /Linux/i.test(s) ? "Linux" : "device";
    const br = /Edg\//i.test(s) ? "Edge"
        : /OPR\//i.test(s) ? "Opera"
        : /Firefox/i.test(s) ? "Firefox"
        : /Chrome/i.test(s) ? "Chrome"
        : /Safari/i.test(s) ? "Safari" : "browser";
    return `${os} · ${br}`;
}
