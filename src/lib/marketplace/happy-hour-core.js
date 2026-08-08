import "server-only";

import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings.js";

// Read + multiplier side of Happy Hour. DB/settings only (no consumables/badges/quests), so the hot awardXp
// path can import activeXpMultiplier without pulling in a dependency cycle. The donate/grant actions live in
// happy-hour.js. Both share the same catalog constants below.

// ONE THRESHOLD, ONE MULTIPLIER. The pack donates until the rally fills, that summons a x2 event, and that is
// the whole mechanic.
//
// It used to be a ladder — x2 base, then +1 at a 5,000 pool, +2 at 15,000, +3 at 40,000 — and the ladder did
// not survive contact with the rally that feeds it. RALLY_TRIGGER was also 15,000, and a rally handed its pool
// to the event it summoned, so every rally event was born holding exactly enough to satisfy the +2 rung and
// opened at x4: the ceiling, instantly, before anyone could donate a coin toward it. The meter the event was
// built around was already full at second one. Measured on the 2026-08-08 event: eight members spent eight days
// filling the rally, it fired at x4, and NOBODY donated during the two hours it ran, because there was nothing
// left to buy. One flat multiplier is what the ladder was pretending to be.
export const HAPPY_HOUR_MULT = 2;
export const RALLY_KEY = "hh_rally_gold";
// When the current rally cycle began. Donations are tallied from here so the members who summoned an event get
// the credit on it — see collectRallyDonors in happy-hour.js.
export const RALLY_SINCE_KEY = "hh_rally_since";
export const RALLY_TRIGGER = 15000;
export const HAPPY_HOUR_HOURS = 2;

export async function getActiveEvent() {
    return db.queryOne(`SELECT * FROM mkt_happy_hour WHERE ends_at > NOW() ORDER BY started_at DESC LIMIT 1`).catch(() => null);
}

// Flat, and deliberately ignores base_mult/pool_gold — older rows carry a ladder value that no longer means
// anything, and the pool is now just a record of what the pack chipped in to summon this.
export function eventMultiplier(ev) {
    return ev ? HAPPY_HOUR_MULT : 1;
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
        // Include the viewer's gold here too — without it the rally-screen donate buttons were always disabled.
        const [rallyRaw, goldRow] = await Promise.all([
            getSetting(RALLY_KEY).catch(() => 0),
            buyerId ? db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null) : null,
        ]);
        const rally = Number(rallyRaw) || 0;
        return { active: false, gold: goldRow?.gold || 0, rally: { pool: rally, trigger: RALLY_TRIGGER, remaining: Math.max(0, RALLY_TRIGGER - rally) } };
    }
    const [mine, gold, donorRows] = await Promise.all([
        buyerId ? db.queryOne(`SELECT gold FROM mkt_happy_hour_donation WHERE event_id = $1 AND buyer_id = $2`, [ev.id, buyerId]).catch(() => null) : null,
        buyerId ? db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null) : null,
        // Who chipped in to summon it — for the "Happy Hour started!" recap everyone sees.
        db.query(
            `SELECT COALESCE(NULLIF(b.display_name,''), b.alias, 'A member') AS name, b.alias, d.gold
               FROM mkt_happy_hour_donation d JOIN mkt_buyer b ON b.id = d.buyer_id
              WHERE d.event_id = $1 AND d.gold > 0 ORDER BY d.gold DESC LIMIT 8`,
            [ev.id]
        ).catch(() => []),
    ]);
    const myDonation = Number(mine?.gold || 0);
    // Next personal reward tier (mirrors REWARD_TIERS in happy-hour.js).
    const tiers = [1000, 5000, 15000];
    const nextReward = tiers.find((t) => myDonation < t) || null;
    return {
        active: true,
        id: ev.id,
        resource: ev.resource,
        endsAt: ev.ends_at,
        endsInSecs: Math.max(0, Math.floor((new Date(ev.ends_at).getTime() - Date.now()) / 1000)),
        // What the pack chipped in to summon this. A record, not a lever — it no longer moves the multiplier.
        pool: Number(ev.pool_gold) || 0,
        multiplier: eventMultiplier(ev),
        myDonation,
        nextReward,
        gold: gold?.gold || 0,
        donors: (donorRows || []).map((r) => ({ name: r.name, alias: r.alias || null, gold: Number(r.gold) || 0 })),
    };
}

// ── Admin actions (db only) ────────────────────────────────────────────────────────────────────────
// No baseMult argument: a Happy Hour is x2, always. `startPool` is the gold the rally raised to summon it and
// is stored for the recap only. Returns the row so the caller can credit its donors.
export async function startHappyHour({ hours = HAPPY_HOUR_HOURS, startPool = 0 } = {}) {
    const h = Math.max(1, Math.min(24, Math.floor(Number(hours) || HAPPY_HOUR_HOURS)));
    const pool = Math.max(0, Math.floor(Number(startPool) || 0));
    const ev = await db
        .queryOne(`INSERT INTO mkt_happy_hour (kind, resource, base_mult, pool_gold, ends_at) VALUES ('happy_hour', 'xp', $1, $2, NOW() + ($3 || ' hours')::interval) RETURNING *`, [HAPPY_HOUR_MULT, pool, String(h)])
        .catch(() => null);
    invalidateEventCache();
    return { ok: Boolean(ev), event: ev, endsAt: ev?.ends_at, multiplier: HAPPY_HOUR_MULT, hours: h };
}

export async function endHappyHour() {
    await db.query(`UPDATE mkt_happy_hour SET ends_at = NOW() WHERE ends_at > NOW()`).catch(() => {});
    invalidateEventCache();
    return { ok: true };
}

export async function addToHappyHourPool(amount) {
    const ev = await getActiveEvent();
    if (!ev) return { ok: false, error: "no_event" };
    await db.query(`UPDATE mkt_happy_hour SET pool_gold = pool_gold + $2 WHERE id = $1`, [ev.id, Math.max(0, Math.floor(Number(amount) || 0))]).catch(() => {});
    invalidateEventCache();
    return { ok: true, ...(await getHappyHourState(null)) };
}
