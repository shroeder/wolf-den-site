import "server-only";

import { db } from "@/lib/db";

// SAILING — an async "send your boat out and back" loop. You dispatch a voyage, it sails to the island and
// returns over real-world hours, and on its RETURN you collect the haul. Upgrading Speed shortens the trip;
// Luck fattens the reward. Voyages also earn boat XP → boat levels (shown with stars) and re-skins every 10.
// State is derived from departed_at/returns_at so it resolves lazily on read — no cron. Owner-gated for now.

export const BASE_VOYAGE_MS = 4 * 60 * 60 * 1000;   // a fresh wood boat: 4h round trip
const SPEED_STEP = 0.90;                            // each Speed level → 10% faster (multiplicative)
const MIN_VOYAGE_MS = 25 * 60 * 1000;               // floor so it can't trivialize to nothing
const MAX_LEVEL = 50;
export const MAX_SPEED_LEVEL = 12;
export const MAX_LUCK_LEVEL = 12;
const XP_PER_VOYAGE = 25;

// Boat art per tier. Only tier 1 exists so far; higher tiers fall back until their art is generated.
const BOAT_ART = {
    1: "/images/sailing/boat-tier1-wood.png",
};
export const OCEAN_BG = "/images/sailing/ocean-bg.png";
export const ISLAND_ART = "/images/sailing/island.png";

// --- pure curves (safe to import anywhere) -------------------------------------------------------------
export function boatLevel(xp) {
    return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1);
}
export function boatXpForLevel(level) {
    return Math.max(0, (level - 1) * (level - 1) * 50); // inverse of boatLevel
}
export function boatTier(level) {
    return Math.floor((Math.max(1, level) - 1) / 10) + 1; // new hull every 10 levels
}
export function boatArt(level) {
    const tier = boatTier(level);
    return BOAT_ART[tier] || BOAT_ART[Math.max(...Object.keys(BOAT_ART).map(Number))];
}
export function voyageDurationMs(speedLevel = 0) {
    return Math.max(MIN_VOYAGE_MS, Math.round(BASE_VOYAGE_MS * Math.pow(SPEED_STEP, Math.max(0, speedLevel))));
}
function upgradeCost(nextLevel) {
    return 400 * (nextLevel + 1) * (nextLevel + 1); // escalating gold, evaluated on the level you're buying
}

// Reward rolled at collection. Luck lifts the floor and the jackpot odds; boat level nudges the base up.
function rollHaul(luckLevel, level) {
    const luckMult = 1 + luckLevel * 0.12;
    const base = 55 + level * 7;
    const jackpot = Math.random() < Math.min(0.4, 0.06 + luckLevel * 0.03);
    const swing = 0.75 + Math.random() * 0.6;               // 0.75x .. 1.35x
    const gold = Math.round(base * luckMult * swing * (jackpot ? 2.2 : 1));
    return { gold, xp: XP_PER_VOYAGE, jackpot };
}

// --- state ---------------------------------------------------------------------------------------------
function decorate(row) {
    const xp = row?.boat_xp || 0;
    const level = boatLevel(xp);
    const speedLevel = row?.speed_level || 0;
    const luckLevel = row?.luck_level || 0;
    const level0Xp = boatXpForLevel(level);
    const nextXp = boatXpForLevel(Math.min(MAX_LEVEL, level + 1));
    const span = Math.max(1, nextXp - level0Xp);

    const departedAt = row?.departed_at ? new Date(row.departed_at).getTime() : null;
    const returnsAt = row?.returns_at ? new Date(row.returns_at).getTime() : null;
    const now = Date.now();
    let status = "idle";
    let progress = 0;
    if (departedAt && returnsAt) {
        if (now >= returnsAt) { status = "arrived"; progress = 1; }
        else { status = "sailing"; progress = Math.min(0.999, Math.max(0, (now - departedAt) / (returnsAt - departedAt))); }
    }

    return {
        level,
        maxLevel: MAX_LEVEL,
        tier: boatTier(level),
        boatArt: boatArt(level),
        oceanBg: OCEAN_BG,
        islandArt: ISLAND_ART,
        xp,
        xpInto: Math.max(0, xp - level0Xp),
        xpSpan: span,
        voyagesCompleted: row?.voyages_completed || 0,
        speed: { level: speedLevel, max: MAX_SPEED_LEVEL, cost: upgradeCost(speedLevel), maxed: speedLevel >= MAX_SPEED_LEVEL },
        luck: { level: luckLevel, max: MAX_LUCK_LEVEL, cost: upgradeCost(luckLevel), maxed: luckLevel >= MAX_LUCK_LEVEL },
        voyageMs: voyageDurationMs(speedLevel),
        status,
        progress,
        departedAt,
        returnsAt,
    };
}

async function readRow(buyerId) {
    return db.queryOne(`SELECT * FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
}

export async function getSailingState(buyerId) {
    const [row, goldRow] = await Promise.all([
        readRow(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    return { ...decorate(row), gold: goldRow?.gold || 0 };
}

export async function startVoyage(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "idle") return { ok: false, error: "already_sailing", ...(await getSailingState(buyerId)) };
    const ms = voyageDurationMs(state.speed.level);
    await db.query(
        `INSERT INTO mkt_sailing (buyer_id, departed_at, returns_at, updated_at)
         VALUES ($1, NOW(), NOW() + ($2 || ' milliseconds')::interval, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET departed_at = NOW(), returns_at = NOW() + ($2 || ' milliseconds')::interval, updated_at = NOW()`,
        [buyerId, String(ms)]
    ).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

export async function collectVoyage(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "arrived") return { ok: false, error: "not_ready", ...(await getSailingState(buyerId)) };
    const haul = rollHaul(state.luck.level, state.level);
    // Atomically claim the voyage (clear the timestamps) so a double-tap can't collect twice.
    const claimed = await db.queryOne(
        `UPDATE mkt_sailing
            SET departed_at = NULL, returns_at = NULL,
                boat_xp = boat_xp + $2, voyages_completed = voyages_completed + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND returns_at IS NOT NULL AND returns_at <= NOW()
          RETURNING boat_xp`,
        [buyerId, haul.xp]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "not_ready", ...(await getSailingState(buyerId)) };
    if (haul.gold > 0) await db.query(`UPDATE mkt_buyer SET gold = COALESCE(gold, 0) + $2 WHERE id = $1`, [buyerId, haul.gold]).catch(() => {});
    const before = boatLevel((row?.boat_xp || 0));
    const after = boatLevel(claimed.boat_xp);
    return { ok: true, haul, leveledTo: after > before ? after : null, ...(await getSailingState(buyerId)) };
}

async function buyUpgrade(buyerId, kind) {
    const col = kind === "speed" ? "speed_level" : "luck_level";
    const max = kind === "speed" ? MAX_SPEED_LEVEL : MAX_LUCK_LEVEL;
    const row = await readRow(buyerId);
    const cur = (kind === "speed" ? row?.speed_level : row?.luck_level) || 0;
    if (cur >= max) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = upgradeCost(cur);
    // Ensure the sailing row exists, then spend gold atomically (only if affordable) and bump the level.
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    await db.query(`UPDATE mkt_sailing SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, spent: cost, ...(await getSailingState(buyerId)) };
}

export const upgradeSpeed = (buyerId) => buyUpgrade(buyerId, "speed");
export const upgradeLuck = (buyerId) => buyUpgrade(buyerId, "luck");
