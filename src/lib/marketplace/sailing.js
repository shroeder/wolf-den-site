import "server-only";

import { db } from "@/lib/db";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";

// Fragments you dig up on the island fuse into a loot chest.
const FRAGMENTS_PER_CHEST = 10;
const CHEST_FROM_FRAGMENTS = "iron";

// SAILING — dispatch your boat on a ONE-WAY voyage to a mysterious island; when it lands you play an
// excavation dig minigame (ESO-style: a grid of dirt, a limited stamina budget, an Augur "hot/cold" locator)
// trying to unearth a treasure-chest FRAGMENT before you run out. Win or fail, you return to port and can set
// sail again. Speed shortens the voyage; Luck adds dig stamina. Owner-gated while in development.

// PROTOTYPE: a short voyage so the whole loop is testable in seconds. Bump toward hours before any real release.
export const BASE_VOYAGE_MS = 20 * 1000;
const SPEED_STEP = 0.90;
const MIN_VOYAGE_MS = 5 * 1000;
const MAX_LEVEL = 50;
export const MAX_SPEED_LEVEL = 12;
export const MAX_LUCK_LEVEL = 12;

// After the free once-a-day tailwind is spent, extra tailwinds can be bought with gold. Temporarily FREE while
// the feature is in testing — set back to 500 before release.
export const WIND_RECHARGE_COST = 0; // TODO(luke): bump to 500 after testing

// Dig board.
const DIG_COLS = 4;
const DIG_ROWS = 4;
const DIG_MAX_DEPTH = 3;      // layers of dirt over every tile — you chip straight down through them
const BASE_STAMINA = 12;      // digs per voyage (flat; extend mid-dig with "buy more digs")
const FRAGMENTS_BURIED = 3;   // base fragments scattered through the dirt; Fortune adds +1 buried per level
const MAX_BURIED = 8;         // cap on buried fragments (half a 4×4 board)
const SPEED_PCT_PER_LEVEL = 10; // Speed shaves this % off each voyage per level (SPEED_STEP = 0.90)
const DIG_REFILL = 5;         // extra digs you can buy mid-excavation
const DIG_REFILL_COST = 0;    // gold per refill — FREE while testing; set to ~300 before release

const BOAT_ART = { 1: "/images/sailing/boat-tier1-wood.png" };
export const OCEAN_BG = "/images/sailing/ocean-bg.png";
export const DIG_BG = "/images/sailing/dig-bg.png";
export const ISLAND_ART = "/images/sailing/island.png";

// --- pure curves ---------------------------------------------------------------------------------------
export function boatLevel(xp) { return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1); }
export function boatXpForLevel(level) { return Math.max(0, (level - 1) * (level - 1) * 50); }
export function boatTier(level) { return Math.floor((Math.max(1, level) - 1) / 10) + 1; }
export function boatArt(level) {
    const tier = boatTier(level);
    return BOAT_ART[tier] || BOAT_ART[Math.max(...Object.keys(BOAT_ART).map(Number))];
}
export function voyageDurationMs(speedLevel = 0) {
    return Math.max(MIN_VOYAGE_MS, Math.round(BASE_VOYAGE_MS * Math.pow(SPEED_STEP, Math.max(0, speedLevel))));
}
function upgradeCost(nextLevel) { return 400 * (nextLevel + 1) * (nextLevel + 1); }
// Dig count no longer scales with an upgrade — it's a flat budget you extend mid-dig with "buy more digs".
function digStamina() { return BASE_STAMINA; }
// Fortune (stored in the luck_level column) sends the boat to richer islands: +1 buried fragment per level.
function fragmentsBuried(fortuneLevel = 0) { return Math.min(MAX_BURIED, FRAGMENTS_BURIED + Math.max(0, fortuneLevel)); }
// The boat's level is EARNED BY UPGRADING, not by digging: one level per Speed/Fortune level bought.
function boatLevelFromUpgrades(speedLevel = 0, fortuneLevel = 0) { return 1 + Math.max(0, speedLevel) + Math.max(0, fortuneLevel); }

// --- dig board -----------------------------------------------------------------------------------------
function randInt(n) { return Math.floor(Math.random() * n); }

function newBoard(fortuneLevel) {
    // Every tile is a stack of 1–DIG_MAX_DEPTH dirt layers you chip through. Fragments are scattered under
    // random individual tiles — NO clusters, NO pointer, NO shimmer. Fortune enriches the island with more
    // buried fragments to find. You never learn a tile's secret until you break it to the bottom.
    const depth = Array.from({ length: DIG_ROWS }, () => Array.from({ length: DIG_COLS }, () => 1 + randInt(DIG_MAX_DEPTH)));
    const cells = [];
    for (let r = 0; r < DIG_ROWS; r++) for (let c = 0; c < DIG_COLS; c++) cells.push([r, c]);
    for (let i = cells.length - 1; i > 0; i--) { const j = randInt(i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const frag = cells.slice(0, fragmentsBuried(fortuneLevel)); // the tiles that hide a fragment at the bottom
    const dug = Array.from({ length: DIG_ROWS }, () => Array.from({ length: DIG_COLS }, () => false));
    const stamina = digStamina();
    return { cols: DIG_COLS, rows: DIG_ROWS, depth, maxDepth: DIG_MAX_DEPTH, frag, dug, stamina, maxStamina: stamina, status: "active" };
}

// Server-authoritative dig — chips one layer of rock off a tile. Returns the mutated board.
function applyDig(board, r, c) {
    if (board.status !== "active" || board.stamina <= 0) return board;
    if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return board;
    if (board.depth[r][c] <= 0) return board; // already chipped to the bottom — never wastes a dig
    board.stamina -= 1;
    board.dug[r][c] = true;
    board.depth[r][c] -= 1;
    // A fragment is unearthed the moment its tile breaks through to the bottom. Dig until you've found them all
    // or your pick runs out; any fragment found means you keep them (see digAt).
    const found = board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0).length;
    if (found >= board.frag.length) board.status = "won"; // every buried fragment unearthed
    else if (board.stamina <= 0) board.status = found >= 1 ? "won" : "lost";
    return board;
}

// The client-safe view of a board. Reveals each tile's remaining rock depth (so the layers can be drawn) and
// nothing about where the fragments are — a tile only flags `found` once it's been chipped to the bottom AND it
// hid a fragment. No pointer, no shimmer: the board never tells you where to dig next.
function boardView(board) {
    const maxDepth = board.maxDepth || DIG_MAX_DEPTH;
    const fragSet = new Set(board.frag.map(([r, c]) => `${r},${c}`));
    const tiles = [];
    for (let r = 0; r < board.rows; r++) {
        const row = [];
        for (let c = 0; c < board.cols; c++) {
            row.push({
                depth: board.depth[r][c],   // rock layers still on top (drives the stacked-slab drawing)
                maxDepth,
                dug: board.dug[r][c],
                found: fragSet.has(`${r},${c}`) && board.depth[r][c] === 0, // fragment unearthed at the bottom
            });
        }
        tiles.push(row);
    }
    const found = board.frag.filter(([r, c]) => board.depth[r][c] === 0).length;
    return { cols: board.cols, rows: board.rows, maxDepth, stamina: board.stamina, maxStamina: board.maxStamina, status: board.status, tiles, buried: board.frag.length, found };
}

// --- state ---------------------------------------------------------------------------------------------
function decorate(row) {
    const speedLevel = row?.speed_level || 0;
    const fortuneLevel = row?.luck_level || 0; // Fortune is stored in the legacy luck_level column
    const level = boatLevelFromUpgrades(speedLevel, fortuneLevel); // earned by upgrading, never by digging

    const departedAt = row?.departed_at ? new Date(row.departed_at).getTime() : null;
    const arrivesAt = row?.returns_at ? new Date(row.returns_at).getTime() : null; // returns_at = island arrival
    const dig = row?.dig_state || null;
    const now = Date.now();

    let status = "idle";
    if (dig && dig.status === "active") status = "digging";
    else if (departedAt && arrivesAt) status = now >= arrivesAt ? "arrived" : "sailing";

    let progress = 0;
    if (status === "sailing") progress = Math.min(0.999, Math.max(0, (now - departedAt) / (arrivesAt - departedAt)));
    else if (status === "arrived" || status === "digging") progress = 1;

    return {
        level, maxLevel: boatLevelFromUpgrades(MAX_SPEED_LEVEL, MAX_LUCK_LEVEL), tier: boatTier(level), boatArt: boatArt(level),
        oceanBg: OCEAN_BG, digBg: DIG_BG, islandArt: ISLAND_ART,
        voyagesCompleted: row?.voyages_completed || 0,
        fragments: row?.fragments || 0,
        fragmentsPerChest: FRAGMENTS_PER_CHEST,
        chestReward: { tier: CHEST_FROM_FRAGMENTS, label: CHEST_TIERS[CHEST_FROM_FRAGMENTS]?.label || "Chest", emoji: CHEST_TIERS[CHEST_FROM_FRAGMENTS]?.emoji || "🎁" },
        digRefill: { amount: DIG_REFILL, cost: DIG_REFILL_COST },
        // The boat's two upgrades — both boat-exclusive. Each carries its per-level effect + current/next value.
        speed: {
            level: speedLevel, max: MAX_SPEED_LEVEL, cost: upgradeCost(speedLevel), maxed: speedLevel >= MAX_SPEED_LEVEL,
            pctPerLevel: SPEED_PCT_PER_LEVEL, voyageNow: voyageDurationMs(speedLevel), voyageNext: voyageDurationMs(speedLevel + 1),
        },
        fortune: {
            level: fortuneLevel, max: MAX_LUCK_LEVEL, cost: upgradeCost(fortuneLevel), maxed: fortuneLevel >= MAX_LUCK_LEVEL,
            buriedNow: fragmentsBuried(fortuneLevel), buriedNext: fragmentsBuried(fortuneLevel + 1),
        },
        voyageMs: voyageDurationMs(speedLevel),
        status, progress, departedAt, arrivesAt,
        // Once-a-day "favorable winds" boost (shaves an hour off the trip) — only offered mid-voyage.
        windAvailable: status === "sailing" && !row?.wind_used_today,
        // After the free one is spent, extra tailwinds can be bought for this much gold (0 while testing).
        windRecharge: { cost: WIND_RECHARGE_COST },
        dig: status === "digging" ? boardView(dig) : null,
    };
}

async function readRow(buyerId) {
    // Compute "did they already use today's favorable-winds boost" in SQL (store-local day) to sidestep the
    // JS-Date-from-a-DATE-column timezone trap.
    return db.queryOne(
        `SELECT *, (wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS wind_used_today
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

export async function getSailingState(buyerId) {
    const [row, goldRow] = await Promise.all([
        readRow(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    return { ...decorate(row), gold: goldRow?.gold || 0 };
}

export async function startVoyage(buyerId) {
    const state = decorate(await readRow(buyerId));
    if (state.status !== "idle") return { ok: false, error: "busy", ...(await getSailingState(buyerId)) };
    const ms = voyageDurationMs(state.speed.level);
    await db.query(
        `INSERT INTO mkt_sailing (buyer_id, departed_at, returns_at, dig_state, updated_at)
         VALUES ($1, NOW(), NOW() + ($2 || ' milliseconds')::interval, NULL, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET departed_at = NOW(), returns_at = NOW() + ($2 || ' milliseconds')::interval, dig_state = NULL, updated_at = NOW()`,
        [buyerId, String(ms)]
    ).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// Once-a-day favorable winds: shave an hour off the remaining voyage (clamped so it can only reach "arrived",
// never overshoot). Atomic — the WHERE enforces once-per-store-day and that a voyage is actually in progress.
export async function favorableWind(buyerId) {
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = GREATEST(NOW(), returns_at - interval '1 hour'),
                wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date, updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL
            AND returns_at IS NOT NULL AND returns_at > NOW()
            AND wind_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date
          RETURNING returns_at`,
        [buyerId]
    ).catch(() => null);
    if (!updated) return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// Paid re-use of the tailwind once the free daily one is spent: charge gold, then shave another hour off the
// remaining voyage. Free while WIND_RECHARGE_COST is 0 (testing). Only valid mid-voyage.
export async function rechargeWind(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "sailing") return { ok: false, error: "not_sailing", ...(await getSailingState(buyerId)) };
    if (WIND_RECHARGE_COST > 0 && (state.gold || 0) < WIND_RECHARGE_COST) {
        return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    }
    // Apply the hour first (also validates a voyage is actually in progress) so we never charge with no effect.
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = GREATEST(NOW(), returns_at - interval '1 hour'), updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at IS NOT NULL AND returns_at > NOW()
          RETURNING returns_at`,
        [buyerId]
    ).catch(() => null);
    if (!updated) return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    if (WIND_RECHARGE_COST > 0) {
        await db.query(`UPDATE mkt_buyer SET gold = GREATEST(0, gold - $2) WHERE id = $1`, [buyerId, WIND_RECHARGE_COST]).catch(() => {});
    }
    return { ok: true, spent: WIND_RECHARGE_COST, ...(await getSailingState(buyerId)) };
}

// Grant treasure-chest fragment(s) to a member (used by the Cheer first-of-day item proc). Upserts the sailing
// row first, since a member may never have sailed.
export async function grantFragment(buyerId, n = 1) {
    if (!buyerId || n <= 0) return;
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    await db.query(`UPDATE mkt_sailing SET fragments = fragments + $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, n]).catch(() => {});
}

// Spend FRAGMENTS_PER_CHEST fragments to forge a loot chest. Atomic — the WHERE guards against forging with
// too few (or a double-tap racing the balance).
export async function forgeChest(buyerId) {
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const spent = await db.queryOne(
        `UPDATE mkt_sailing SET fragments = fragments - $2, updated_at = NOW() WHERE buyer_id = $1 AND fragments >= $2 RETURNING fragments`,
        [buyerId, FRAGMENTS_PER_CHEST]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "not_enough", ...(await getSailingState(buyerId)) };
    await addChests(buyerId, { [CHEST_FROM_FRAGMENTS]: 1 }).catch(() => {});
    const tier = CHEST_TIERS[CHEST_FROM_FRAGMENTS];
    return { ok: true, forged: { tier: CHEST_FROM_FRAGMENTS, label: tier?.label || "Chest", emoji: tier?.emoji || "🎁" }, ...(await getSailingState(buyerId)) };
}

// Buy DIG_REFILL more digs for the active excavation with gold. Atomic gold spend; only valid mid-dig.
export async function buyDigs(buyerId) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    if (DIG_REFILL_COST > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, DIG_REFILL_COST]).catch(() => null);
        if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    }
    board.stamina += DIG_REFILL;
    board.maxStamina += DIG_REFILL;
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, spent: DIG_REFILL_COST, ...(await getSailingState(buyerId)) };
}

export async function beginDig(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "arrived") return { ok: false, error: "not_arrived", ...(await getSailingState(buyerId)) };
    const board = newBoard(row?.luck_level || 0);
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

export async function digAt(buyerId, r, c) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    applyDig(board, Number(r), Number(c));

    if (board.status === "won" || board.status === "lost") {
        // One fragment per tile you unearthed — find one, find all three, or come up empty. Then clear the
        // voyage + board so the boat is back at port.
        const earned = board.frag.filter(([fr, fc]) => board.depth[fr][fc] === 0).length;
        const won = earned > 0;
        // NOTE: digging does NOT grant boat XP — the boat only levels up from buying Speed/Fortune upgrades.
        await db.query(
            `UPDATE mkt_sailing
                SET dig_state = NULL, departed_at = NULL, returns_at = NULL,
                    fragments = fragments + $2, voyages_completed = voyages_completed + 1, updated_at = NOW()
              WHERE buyer_id = $1`,
            [buyerId, earned]
        ).catch(() => {});
        const state = await getSailingState(buyerId);
        return { ok: true, result: { won, earned, buried: board.frag.length, fragments: state.fragments }, ...state };
    }

    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

async function buyUpgrade(buyerId, kind) {
    const col = kind === "speed" ? "speed_level" : "luck_level";
    const max = kind === "speed" ? MAX_SPEED_LEVEL : MAX_LUCK_LEVEL;
    const row = await readRow(buyerId);
    const cur = (kind === "speed" ? row?.speed_level : row?.luck_level) || 0;
    if (cur >= max) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = upgradeCost(cur);
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    await db.query(`UPDATE mkt_sailing SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, spent: cost, ...(await getSailingState(buyerId)) };
}
export const upgradeSpeed = (buyerId) => buyUpgrade(buyerId, "speed");
export const upgradeLuck = (buyerId) => buyUpgrade(buyerId, "luck");
