import "server-only";

import { db } from "@/lib/db";

// ── HOW MUCH IS THIS ACTUALLY BEING PLAYED ───────────────────────────────────────────────────────────────────
// Luke: "how many of them there are... what the average session looks like... and what the mean session time is
// and what the max session time is. You should be able to calculate session time based on the activity."
//
// You can, and the only judgement call is where one visit ends and the next begins. Everything else is counting.
//
// ── WHY THE GAP IS TEN MINUTES AND NOT THIRTY ────────────────────────────────────────────────────────────────
// Thirty is the web-analytics default and it is wrong for this game. Measured over 105,085 real gaps: 92.3% are
// under ONE minute, 96.2% under three, and past about ten the histogram is FLAT — thirty to sixty gaps in every
// single minute bucket from 11 through 60. A flat tail carries no information about whether it is still the
// same visit; those are just "came back later" at assorted delays.
//
// At thirty minutes the longest day on record reads as one 3h56m session. At ten it resolves into what it
// actually was — three or four separate visits with breaks in them. Luke, on seeing the first version: "any
// events that are ten minutes apart are probably not the same session, right? They took a little break."
//
// The threshold is exported rather than buried so the screen can print it, because a session number without
// its gap is not a number anybody can argue with.
export const SESSION_GAP_MIN = 10;

// A day here is the SHOP's day. Vercel runs UTC, and a UTC boundary falls at 7pm in Montgomery — which would
// cut every evening's play in half and report it as two days.
const TZ = "America/Chicago";

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pctile = (a, p) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

/**
 * Sessions for one window, straight off mkt_activity_event.
 *
 * The whole thing is one window function: mark an event as starting a session when the gap behind it is bigger
 * than the threshold, then running-sum those marks to get a session id per member. No temp tables, no loop.
 */
async function sessionRows(days) {
    return db.query(
        `WITH ev AS (
            SELECT buyer_id, created_at,
                   LAG(created_at) OVER (PARTITION BY buyer_id ORDER BY created_at) AS prev
              FROM mkt_activity_event
             WHERE buyer_id IS NOT NULL AND created_at >= NOW() - ($1 || ' days')::interval
         ), marked AS (
            SELECT buyer_id, created_at,
                   CASE WHEN prev IS NULL OR created_at - prev > ($2 || ' minutes')::interval THEN 1 ELSE 0 END AS starts
              FROM ev
         ), grouped AS (
            SELECT buyer_id, created_at,
                   SUM(starts) OVER (PARTITION BY buyer_id ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS sid
              FROM marked
         )
         SELECT buyer_id, sid, COUNT(*)::int AS events,
                EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/60.0 AS mins,
                MIN(created_at) AS started
           FROM grouped GROUP BY buyer_id, sid`,
        [days, SESSION_GAP_MIN],
    ).catch(() => []);
}

export async function getEngagement({ days = 1 } = {}) {
    const d = Math.max(1, Math.min(90, Number(days) || 1));

    const [rows, registered, act1, act7, act30, dau, names] = await Promise.all([
        sessionRows(d),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer`, []).catch(() => null),
        db.queryOne(`SELECT COUNT(DISTINCT buyer_id)::int AS n FROM mkt_activity_event WHERE buyer_id IS NOT NULL AND created_at >= NOW() - INTERVAL '1 day'`, []).catch(() => null),
        db.queryOne(`SELECT COUNT(DISTINCT buyer_id)::int AS n FROM mkt_activity_event WHERE buyer_id IS NOT NULL AND created_at >= NOW() - INTERVAL '7 days'`, []).catch(() => null),
        db.queryOne(`SELECT COUNT(DISTINCT buyer_id)::int AS n FROM mkt_activity_event WHERE buyer_id IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'`, []).catch(() => null),
        db.query(
            `SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS day,
                    COUNT(DISTINCT buyer_id)::int AS players, COUNT(*)::int AS events
               FROM mkt_activity_event
              WHERE buyer_id IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'
              GROUP BY day ORDER BY day`, []).catch(() => []),
        db.query(`SELECT id, COALESCE(NULLIF(display_name,''), alias) AS nm FROM mkt_buyer`, []).catch(() => []),
    ]);

    const nameOf = Object.fromEntries((names || []).map((n) => [n.id, n.nm || "Member"]));
    const mins = rows.map((r) => Number(r.mins) || 0);
    const evs = rows.map((r) => Number(r.events) || 0);

    // Per player: how many visits, and how long across all of them.
    const per = new Map();
    for (const r of rows) {
        const cur = per.get(r.buyer_id) || { sessions: 0, mins: 0, events: 0, longest: 0 };
        const m = Number(r.mins) || 0;
        cur.sessions += 1; cur.mins += m; cur.events += Number(r.events) || 0;
        if (m > cur.longest) cur.longest = m;
        per.set(r.buyer_id, cur);
    }
    const playerMins = [...per.values()].map((v) => v.mins);

    // ── ONE-EVENT VISITS MEASURE ZERO, AND THAT IS REPORTED RATHER THAN HIDDEN ───────────────────────────
    // A session's length is the span from its first event to its last, so a visit that fired one event is
    // zero minutes by definition. Averaging them in drags the mean down; dropping them silently inflates it.
    // Both numbers are published and the screen shows the count.
    const real = mins.filter((m) => m > 0);

    // How the players split by how long they played — the mean and the median are far apart in this game and
    // the shape is the thing that explains why.
    const buckets = [
        { label: "under 15m", n: 0 }, { label: "15m – 1h", n: 0 },
        { label: "1 – 3h", n: 0 }, { label: "3h+", n: 0 },
    ];
    for (const v of per.values()) {
        const m = v.mins;
        if (m < 15) buckets[0].n += 1; else if (m < 60) buckets[1].n += 1;
        else if (m < 180) buckets[2].n += 1; else buckets[3].n += 1;
    }

    const top = [...per.entries()]
        .sort((a, b) => b[1].mins - a[1].mins).slice(0, 15)
        .map(([id, v]) => ({
            id, name: nameOf[id] || "Member",
            mins: Math.round(v.mins), sessions: v.sessions,
            longest: Math.round(v.longest), events: v.events,
        }));

    return {
        days: d,
        gapMinutes: SESSION_GAP_MIN,
        registered: registered?.n || 0,
        active1: act1?.n || 0,
        active7: act7?.n || 0,
        active30: act30?.n || 0,
        players: per.size,
        sessions: rows.length,
        events: evs.reduce((a, b) => a + b, 0),
        sessionsPerPlayer: per.size ? rows.length / per.size : 0,
        session: {
            mean: mean(mins), meanReal: mean(real), median: pctile(mins, 0.5),
            p90: pctile(mins, 0.9), max: mins.length ? Math.max(...mins) : 0,
            zero: mins.length - real.length,
        },
        perPlayer: {
            mean: mean(playerMins), median: pctile(playerMins, 0.5),
            max: playerMins.length ? Math.max(...playerMins) : 0,
        },
        eventsPerSession: { mean: mean(evs), median: pctile(evs, 0.5), max: evs.length ? Math.max(...evs) : 0 },
        totalHours: playerMins.reduce((a, b) => a + b, 0) / 60,
        buckets,
        top,
        daily: (dau || []).map((r) => ({ date: r.day, players: Number(r.players) || 0, events: Number(r.events) || 0 })),
    };
}
