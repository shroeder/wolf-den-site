import "server-only";

import { db } from "@/lib/db";

// ── TOWN EVENT (RAID) TELEMETRY ──────────────────────────────────────────────────────────────────────────────
// Owner insight into the auto-spawning town events: are they firing at the intended cadence (1-3/day, evening
// weighted), is anyone actually SHOWING UP, and did the rally push reach any devices. That last one matters —
// raids silently reached nobody for a while because the pushes weren't awaited, so "notified" is a first-class
// metric here rather than something you have to infer from participation.
//
// Owner TEST spawns (meta.silent = true) are excluded from every cadence/participation number and reported
// separately; counting them would make the schedule look ~5x hotter than it is.

const REAL = `COALESCE(meta->>'silent','false') <> 'true'`;
const TARGET_MIN = 1;
const TARGET_MAX = 3;

export async function getTownTelemetry() {
    const [summary, cadence, hours, participation, types, recent, top, live] = await Promise.all([
        db.queryOne(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ${REAL})::int AS real,
                    COUNT(*) FILTER (WHERE NOT (${REAL}))::int AS silent,
                    COUNT(*) FILTER (WHERE ${REAL} AND (started_at AT TIME ZONE 'America/Chicago')::date
                                                       = (NOW() AT TIME ZONE 'America/Chicago')::date)::int AS today,
                    COUNT(*) FILTER (WHERE ${REAL} AND (started_at AT TIME ZONE 'America/Chicago')::date
                                                       = (NOW() AT TIME ZONE 'America/Chicago')::date - 1)::int AS yesterday,
                    MIN(started_at AT TIME ZONE 'America/Chicago')::text AS first_ct,
                    MAX(started_at AT TIME ZONE 'America/Chicago')::text AS last_ct
               FROM mkt_town_event`
        ).catch(() => null),

        // Per-CENTRAL-day cadence. Dates come back as ::text — never build a JS Date from a Postgres date or
        // prod (UTC) reads today as yesterday.
        db.query(
            `SELECT (started_at AT TIME ZONE 'America/Chicago')::date::text AS day,
                    COUNT(*) FILTER (WHERE ${REAL})::int AS real,
                    COUNT(*) FILTER (WHERE NOT (${REAL}))::int AS silent,
                    STRING_AGG(TO_CHAR(started_at AT TIME ZONE 'America/Chicago','HH24:MI'), ', '
                               ORDER BY started_at) FILTER (WHERE ${REAL}) AS times
               FROM mkt_town_event
              WHERE started_at > NOW() - INTERVAL '14 days'
              GROUP BY 1 ORDER BY 1 DESC`
        ).catch(() => []),

        db.query(
            `SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE 'America/Chicago')::int AS hour,
                    COUNT(*)::int AS n
               FROM mkt_town_event WHERE ${REAL} GROUP BY 1 ORDER BY 1`
        ).catch(() => []),

        db.queryOne(
            `WITH ev AS (
                 SELECT e.id, COUNT(h.buyer_id)::int AS fighters
                   FROM mkt_town_event e LEFT JOIN mkt_town_event_hit h ON h.event_id = e.id
                  WHERE ${REAL.replace(/meta/g, "e.meta")}
                  GROUP BY e.id
             )
             SELECT COUNT(*)::int AS events,
                    COALESCE(ROUND(AVG(fighters)::numeric, 1), 0)::float AS avg_fighters,
                    COUNT(*) FILTER (WHERE fighters = 0)::int AS empty_events,
                    COALESCE(MAX(fighters), 0)::int AS best_turnout
               FROM ev`
        ).catch(() => null),

        db.query(
            `SELECT e.kind, COUNT(DISTINCT e.id)::int AS n,
                    COUNT(*) FILTER (WHERE e.status = 'defeated')::int AS killed,
                    COALESCE(ROUND(AVG(f.fighters)::numeric, 1), 0)::float AS avg_fighters
               FROM mkt_town_event e
               LEFT JOIN (SELECT event_id, COUNT(*)::int AS fighters FROM mkt_town_event_hit GROUP BY 1) f
                      ON f.event_id = e.id
              WHERE ${REAL.replace(/meta/g, "e.meta")}
              GROUP BY e.kind ORDER BY n DESC`
        ).catch(() => []),

        // Recent raids incl. how many devices the rally push actually reached (meta.pushWeb / meta.pushApp,
        // stamped at spawn). NULL = spawned before we recorded it, 0 = genuinely nobody notified.
        db.query(
            `SELECT e.id::text AS id, e.kind, e.status, e.hp, e.hp_max,
                    TO_CHAR(e.started_at AT TIME ZONE 'America/Chicago','MM-DD HH24:MI') AS started_ct,
                    COALESCE((e.meta->>'silent') = 'true', false) AS silent,
                    (e.meta->>'wave')::int AS wave,
                    (e.meta->>'pushWeb')::int AS push_web,
                    (e.meta->>'pushApp')::int AS push_app,
                    COUNT(h.buyer_id)::int AS fighters,
                    COALESCE(SUM(h.damage), 0)::int AS damage
               FROM mkt_town_event e LEFT JOIN mkt_town_event_hit h ON h.event_id = e.id
              GROUP BY e.id, e.kind, e.status, e.hp, e.hp_max, e.started_at, e.meta
              ORDER BY e.started_at DESC LIMIT 40`
        ).catch(() => []),

        db.query(
            `SELECT COALESCE(NULLIF(b.display_name,''), b.alias, 'member') AS name, b.alias,
                    COUNT(DISTINCT h.event_id)::int AS raids,
                    COALESCE(SUM(h.damage), 0)::int AS damage,
                    COALESCE(SUM(h.hits), 0)::int AS hits
               FROM mkt_town_event_hit h
               JOIN mkt_town_event e ON e.id = h.event_id AND ${REAL.replace(/meta/g, "e.meta")}
               LEFT JOIN mkt_buyer b ON b.id = h.buyer_id
              GROUP BY 1, 2 ORDER BY damage DESC LIMIT 15`
        ).catch(() => []),

        db.queryOne(
            `SELECT id::text AS id, kind, hp, hp_max,
                    GREATEST(0, EXTRACT(EPOCH FROM (ends_at - NOW()))::int) AS secs_left
               FROM mkt_town_event WHERE status = 'active' LIMIT 1`
        ).catch(() => null),
    ]);

    const p = participation || {};
    const emptyPct = p.events ? Math.round((p.empty_events / p.events) * 100) : 0;
    const todayN = summary?.today ?? 0;

    // Auto-flagged findings — the things worth acting on, in plain English.
    const flags = [];
    if (todayN > TARGET_MAX) flags.push({ sev: "warn", text: `${todayN} real raids today — above the ${TARGET_MIN}-${TARGET_MAX}/day target. Consider lowering the peak spawn chance.` });
    else if (todayN === 0) flags.push({ sev: "info", text: "No real raid yet today. Peak window is 5–8pm CT." });
    else flags.push({ sev: "good", text: `${todayN} real raid${todayN === 1 ? "" : "s"} today — inside the ${TARGET_MIN}-${TARGET_MAX}/day target.` });

    if (emptyPct >= 50 && p.events >= 2) flags.push({ sev: "warn", text: `${emptyPct}% of real raids drew ZERO fighters. Check that the rally push is reaching devices.` });
    else if (p.events >= 2) flags.push({ sev: "good", text: `Average turnout ${p.avg_fighters} fighters (best ${p.best_turnout}).` });

    const notified = (recent || []).filter((r) => !r.silent && r.push_web != null);
    const reachedNobody = notified.filter((r) => (r.push_web || 0) === 0).length;
    if (notified.length && reachedNobody === notified.length) {
        flags.push({ sev: "warn", text: `The rally push reached 0 devices on all ${notified.length} recorded raid${notified.length === 1 ? "" : "s"} — pushes are configured but nobody is being notified.` });
    } else if (notified.length) {
        const avgReach = Math.round(notified.reduce((a, r) => a + (r.push_web || 0), 0) / notified.length);
        flags.push({ sev: "good", text: `Rally push reaching ~${avgReach} browser${avgReach === 1 ? "" : "s"} per raid.` });
    } else {
        flags.push({ sev: "info", text: "No raid has recorded its push reach yet — the next spawn will." });
    }

    if (summary?.silent) flags.push({ sev: "info", text: `${summary.silent} silent owner test spawn${summary.silent === 1 ? "" : "s"} excluded from these numbers.` });

    return {
        summary: {
            total: summary?.total ?? 0,
            real: summary?.real ?? 0,
            silent: summary?.silent ?? 0,
            today: todayN,
            yesterday: summary?.yesterday ?? 0,
            firstCt: summary?.first_ct || null,
            lastCt: summary?.last_ct || null,
            targetMin: TARGET_MIN,
            targetMax: TARGET_MAX,
        },
        live: live ? { id: live.id, kind: live.kind, hp: Number(live.hp), hpMax: Number(live.hp_max), secsLeft: Number(live.secs_left) } : null,
        participation: {
            events: p.events ?? 0,
            avgFighters: p.avg_fighters ?? 0,
            emptyEvents: p.empty_events ?? 0,
            emptyPct,
            bestTurnout: p.best_turnout ?? 0,
        },
        cadence: (cadence || []).map((r) => ({ day: r.day, real: r.real, silent: r.silent, times: r.times || "" })),
        hours: (hours || []).map((r) => ({ hour: r.hour, n: r.n })),
        types: (types || []).map((r) => ({ kind: r.kind, n: r.n, killed: r.killed, avgFighters: r.avg_fighters })),
        recent: (recent || []).map((r) => ({
            id: r.id, kind: r.kind, status: r.status, startedCt: r.started_ct, silent: r.silent,
            hp: Number(r.hp), hpMax: Number(r.hp_max), wave: r.wave ?? 1,
            pushWeb: r.push_web, pushApp: r.push_app, fighters: r.fighters, damage: r.damage,
        })),
        top: (top || []).map((r) => ({ name: r.name, alias: r.alias, raids: r.raids, damage: r.damage, hits: r.hits })),
        flags,
    };
}
