import "server-only";

import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";

// HAPPY HOUR — a timed server-wide multiplier that the community strengthens by donating gold. Crossing a
// breakpoint steps the multiplier up. The multiplier boosts XP in awardXp (which cascades to gold + pet-XP).

// Extra multiplier ADDED to base_mult once the shared pool crosses each gold threshold.
const BREAKPOINTS = [
    { at: 0, add: 0 },
    { at: 5000, add: 1 },
    { at: 15000, add: 2 },
    { at: 40000, add: 3 },
];

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
    for (const b of BREAKPOINTS) {
        if (pool < b.at) return { at: b.at, mult: (Number(ev.base_mult) || 2) + b.add, remaining: b.at - pool, from: BREAKPOINTS[BREAKPOINTS.indexOf(b) - 1]?.at || 0 };
    }
    return null;
}

// ── Cached XP multiplier for the hot awardXp path (events change slowly; a short TTL avoids a query per XP).
let _cache = { at: 0, mult: 1 };
export async function activeXpMultiplier() {
    const now = Date.now();
    if (now - _cache.at < 8000) return _cache.mult;
    const ev = await getActiveEvent().catch(() => null);
    const mult = ev && ev.resource === "xp" ? eventMultiplier(ev) : 1;
    _cache = { at: now, mult };
    return mult;
}

// The player-facing state (banner + donate meter).
export async function getHappyHourState(buyerId) {
    const ev = await getActiveEvent();
    if (!ev) return { active: false };
    const mine = buyerId ? await db.queryOne(`SELECT gold FROM mkt_event_donation WHERE event_id = $1 AND buyer_id = $2`, [ev.id, buyerId]).catch(() => null) : null;
    const gold = buyerId ? await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null) : null;
    return {
        active: true,
        resource: ev.resource,
        endsAt: ev.ends_at,
        endsInSecs: Math.max(0, Math.floor((new Date(ev.ends_at).getTime() - Date.now()) / 1000)),
        pool: Number(ev.pool_gold) || 0,
        multiplier: eventMultiplier(ev),
        baseMult: Number(ev.base_mult) || 2,
        next: nextBreakpoint(ev),
        myDonation: Number(mine?.gold || 0),
        gold: gold?.gold || 0,
    };
}

// A member donates gold into the pool. Charged atomically; bumps the pool + their tally.
export async function donateToHappyHour(buyerId, amount) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const gold = Math.max(1, Math.floor(Number(amount) || 0));
    const ev = await getActiveEvent();
    if (!ev) return { ok: false, error: "no_event" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, gold]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    await db.query(`UPDATE mkt_event SET pool_gold = pool_gold + $2 WHERE id = $1`, [ev.id, gold]).catch(() => {});
    await db.query(`INSERT INTO mkt_event_donation (event_id, buyer_id, gold) VALUES ($1, $2, $3) ON CONFLICT (event_id, buyer_id) DO UPDATE SET gold = mkt_event_donation.gold + $3`, [ev.id, buyerId, gold]).catch(() => {});
    await trackActivity(buyerId, "happy_hour_donate", { gold }).catch(() => {});
    _cache = { at: 0, mult: 1 }; // invalidate so the boost reflects immediately
    return { ok: true, gold: paid.gold, ...(await getHappyHourState(buyerId)) };
}

// ── Admin ──────────────────────────────────────────────────────────────────────────────────────────
export async function startHappyHour({ hours = 2, baseMult = 2 } = {}) {
    const h = Math.max(1, Math.min(24, Math.floor(Number(hours) || 2)));
    const base = Math.max(2, Math.min(3, Math.floor(Number(baseMult) || 2)));
    const ev = await db
        .queryOne(`INSERT INTO mkt_event (kind, resource, base_mult, ends_at) VALUES ('happy_hour', 'xp', $1, NOW() + ($2 || ' hours')::interval) RETURNING *`, [base, String(h)])
        .catch(() => null);
    _cache = { at: 0, mult: 1 };
    return { ok: Boolean(ev), endsAt: ev?.ends_at, baseMult: base, hours: h };
}

export async function endHappyHour() {
    await db.query(`UPDATE mkt_event SET ends_at = NOW() WHERE ends_at > NOW()`).catch(() => {});
    _cache = { at: 0, mult: 1 };
    return { ok: true };
}

// Admin: feed the pool from a real-world in-store donation (so real generosity strengthens it too).
export async function addToHappyHourPool(amount) {
    const ev = await getActiveEvent();
    if (!ev) return { ok: false, error: "no_event" };
    const gold = Math.max(0, Math.floor(Number(amount) || 0));
    await db.query(`UPDATE mkt_event SET pool_gold = pool_gold + $2 WHERE id = $1`, [ev.id, gold]).catch(() => {});
    _cache = { at: 0, mult: 1 };
    return { ok: true, ...(await getHappyHourState(null)) };
}
