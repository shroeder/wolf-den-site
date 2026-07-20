import "server-only";

import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings.js";

// Read + multiplier side of Happy Hour. DB/settings only (no consumables/badges/quests), so the hot awardXp
// path can import activeXpMultiplier without pulling in a dependency cycle. The donate/grant actions live in
// happy-hour.js. Both share the same catalog constants below.

// Extra multiplier ADDED to base_mult once the shared pool crosses each gold threshold.
export const BREAKPOINTS = [
    { at: 0, add: 0 },
    { at: 5000, add: 1 },
    { at: 15000, add: 2 },
    { at: 40000, add: 3 },
];
export const RALLY_KEY = "hh_rally_gold";
export const RALLY_TRIGGER = 15000;

export async function getActiveEvent() {
    return db.queryOne(`SELECT * FROM mkt_event WHERE ends_at > NOW() ORDER BY started_at DESC LIMIT 1`).catch(() => null);
}

export function eventMultiplier(ev) {
    if (!ev) return 1;
    const pool = Number(ev.pool_gold) || 0;
    let add = 0;
    for (const b of BREAKPOINTS) if (pool >= b.at) add = b.add;
    return (Number(ev.base_mult) || 2) + add;
}

// The next breakpoint to chase (null once maxed), for the donation meter.
export function nextBreakpoint(ev) {
    const pool = Number(ev.pool_gold) || 0;
    for (let i = 0; i < BREAKPOINTS.length; i += 1) {
        const b = BREAKPOINTS[i];
        if (pool < b.at) return { at: b.at, mult: (Number(ev.base_mult) || 2) + b.add, remaining: b.at - pool, from: BREAKPOINTS[i - 1]?.at || 0 };
    }
    return null;
}

// ── Cached XP multiplier for the hot awardXp path (events change slowly; a short TTL avoids a query per XP).
let _cache = { at: 0, mult: 1 };
export function invalidateEventCache() { _cache = { at: 0, mult: 1 }; }
export async function activeXpMultiplier() {
    const now = Date.now();
    if (now - _cache.at < 8000) return _cache.mult;
    const ev = await getActiveEvent().catch(() => null);
    const mult = ev && ev.resource === "xp" ? eventMultiplier(ev) : 1;
    _cache = { at: now, mult };
    return mult;
}

// Player-facing state (banner + donate meter). Shows the RALLY progress when no event is live.
export async function getHappyHourState(buyerId) {
    const ev = await getActiveEvent();
    if (!ev) {
        const rally = Number(await getSetting(RALLY_KEY).catch(() => 0)) || 0;
        return { active: false, rally: { pool: rally, trigger: RALLY_TRIGGER, remaining: Math.max(0, RALLY_TRIGGER - rally) } };
    }
    const [mine, gold] = await Promise.all([
        buyerId ? db.queryOne(`SELECT gold FROM mkt_event_donation WHERE event_id = $1 AND buyer_id = $2`, [ev.id, buyerId]).catch(() => null) : null,
        buyerId ? db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null) : null,
    ]);
    const myDonation = Number(mine?.gold || 0);
    // Next personal reward tier (mirrors REWARD_TIERS in happy-hour.js).
    const tiers = [1000, 5000, 15000];
    const nextReward = tiers.find((t) => myDonation < t) || null;
    return {
        active: true,
        resource: ev.resource,
        endsAt: ev.ends_at,
        endsInSecs: Math.max(0, Math.floor((new Date(ev.ends_at).getTime() - Date.now()) / 1000)),
        pool: Number(ev.pool_gold) || 0,
        multiplier: eventMultiplier(ev),
        baseMult: Number(ev.base_mult) || 2,
        next: nextBreakpoint(ev),
        myDonation,
        nextReward,
        gold: gold?.gold || 0,
    };
}

// ── Admin actions (db only) ────────────────────────────────────────────────────────────────────────
export async function startHappyHour({ hours = 2, baseMult = 2, startPool = 0 } = {}) {
    const h = Math.max(1, Math.min(24, Math.floor(Number(hours) || 2)));
    const base = Math.max(2, Math.min(3, Math.floor(Number(baseMult) || 2)));
    const pool = Math.max(0, Math.floor(Number(startPool) || 0));
    const ev = await db
        .queryOne(`INSERT INTO mkt_event (kind, resource, base_mult, pool_gold, ends_at) VALUES ('happy_hour', 'xp', $1, $2, NOW() + ($3 || ' hours')::interval) RETURNING *`, [base, pool, String(h)])
        .catch(() => null);
    invalidateEventCache();
    return { ok: Boolean(ev), endsAt: ev?.ends_at, baseMult: base, hours: h };
}

export async function endHappyHour() {
    await db.query(`UPDATE mkt_event SET ends_at = NOW() WHERE ends_at > NOW()`).catch(() => {});
    invalidateEventCache();
    return { ok: true };
}

export async function addToHappyHourPool(amount) {
    const ev = await getActiveEvent();
    if (!ev) return { ok: false, error: "no_event" };
    await db.query(`UPDATE mkt_event SET pool_gold = pool_gold + $2 WHERE id = $1`, [ev.id, Math.max(0, Math.floor(Number(amount) || 0))]).catch(() => {});
    invalidateEventCache();
    return { ok: true, ...(await getHappyHourState(null)) };
}
