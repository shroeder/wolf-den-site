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

// Real base voyage = 4 hours. (Lower this one const for quick testing — e.g. 60*1000 for 1-min trips.)
export const BASE_VOYAGE_MS = 4 * 60 * 60 * 1000;
const SPEED_OFF_MS_PER_LEVEL = 2 * 60 * 1000; // Speed shaves a FLAT 2 minutes off each voyage, per level
const SPEED_MIN_PER_LEVEL = 2;                 // ^ shown on the card
const MIN_VOYAGE_MS = 30 * 60 * 1000;          // a voyage never dips below 30 minutes
// Four boat upgrade tracks — all travel/loot, NO dig count (that's a separate future system). Each maxes at 20
// → 80 upgrade levels → the boat changes FORM every 10 levels across BOAT_TIERS (8) distinct arts, and each
// form unlocks a permanent perk (see MILESTONES). Fortune lives in the legacy luck_level column; Luck (early-
// find) in find_level.
export const MAX_SPEED_LEVEL = 20;
export const MAX_FORTUNE_LEVEL = 20;
export const MAX_RARITY_LEVEL = 20;
export const MAX_LUCK_LEVEL = 20;
const LEVELS_PER_FORM = 10;
const BOAT_TIERS = 8;

// After the free once-a-day tailwind is spent, extra tailwinds can be bought with gold. Temporarily FREE while
// the feature is in testing — set back to 500 before release.
export const WIND_RECHARGE_COST = 0; // TODO(luke): bump to 500 after testing

// Dig board.
const DIG_COLS = 4;
const DIG_ROWS = 4;
const DIG_MAX_DEPTH = 3;      // layers of dirt over every tile — you chip straight down through them
const BASE_STAMINA = 12;      // digs per voyage (flat; extend mid-dig with "buy more digs")
const FRAGMENTS_BURIED = 3;   // base fragments scattered through the dirt; Fortune adds +1 buried per level
const MAX_BURIED = 12;        // cap on buried fragments (of a 16-tile board)
const RARITY_UPGRADE_PER_LEVEL = 0.045; // Rarity: chance/level that a forged chest is bumped up a tier
const LUCK_PER_SHALLOW = 7;   // Luck: every this many levels, fragments sit one dirt-layer shallower
const DIG_REFILL = 5;         // extra digs you can buy mid-excavation
const DIG_REFILL_COST = 0;    // gold per refill — FREE while testing; set to ~300 before release
const FORGE_TIER_ORDER = ["wooden", "iron", "gold"]; // ascending chest tiers, for Rarity's tier-bump

// The 8 boat FORMS. Reaching each level unlocks a new hull art (BOAT_ART[tier]) + a permanent perk applied by
// boatPerks(). Perks are cumulative and reuse the existing engine knobs so they're cheap + safe.
const MILESTONES = [
    { level: 10, tier: 2, name: "Sturdy Sloop", perk: "+1 fragment buried on every island", buried: 1 },
    { level: 20, tier: 3, name: "Swift Cutter", perk: "Voyages are 10% faster", voyage: 0.9 },
    { level: 30, tier: 4, name: "Trade Brig", perk: "+12% chance a forged chest is upgraded a tier", chest: 0.12 },
    { level: 40, tier: 5, name: "Trade-Wind Schooner", perk: "15% chance a tailwind isn't used up", windSave: 0.15 },
    { level: 50, tier: 6, name: "Gilded Galleon", perk: "Your first dig each trip always strikes a fragment", surface: true },
    { level: 60, tier: 7, name: "Storm Frigate", perk: "Voyages are another 10% faster", voyage: 0.9 },
    { level: 70, tier: 8, name: "Leviathan", perk: "+1 fragment buried + 12% chest-upgrade chance", buried: 1, chest: 0.12 },
    { level: 80, tier: 8, name: "Leviathan, Fully Rigged", perk: "Forge chests with 8 fragments instead of 10", forge: 8 },
];

const BOAT_ART = {
    1: "/images/sailing/boat-tier1-wood.png",
    2: "/images/sailing/boat-tier2-sloop.png",
    3: "/images/sailing/boat-tier3-cutter.png",
    4: "/images/sailing/boat-tier4-brig.png",
    5: "/images/sailing/boat-tier5-schooner.png",
    6: "/images/sailing/boat-tier6-galleon.png",
    7: "/images/sailing/boat-tier7-frigate.png",
    8: "/images/sailing/boat-tier8-leviathan.png",
};
export const OCEAN_BG = "/images/sailing/ocean-bg.png";
export const DIG_BG = "/images/sailing/dig-bg.png";
export const ISLAND_ART = "/images/sailing/island.png";

// --- pure curves ---------------------------------------------------------------------------------------
// A new boat form every LEVELS_PER_FORM levels, capped at BOAT_TIERS distinct arts (level 80 → tier 8).
export function boatTier(level) { return Math.min(BOAT_TIERS, Math.floor(Math.max(1, level) / LEVELS_PER_FORM) + 1); }
export function boatArt(level) {
    // Show the highest boat art at/below this tier (so un-minted higher tiers fall back to the last real one).
    for (let t = boatTier(level); t >= 1; t--) if (BOAT_ART[t]) return BOAT_ART[t];
    return BOAT_ART[1];
}
// Cumulative milestone perks unlocked at this boat level.
function boatPerks(level) {
    const p = { buried: 0, voyageMult: 1, chestBonus: 0, surface: false, forgeCost: FRAGMENTS_PER_CHEST, windSave: 0 };
    for (const m of MILESTONES) {
        if (level < m.level) break;
        if (m.buried) p.buried += m.buried;
        if (m.voyage) p.voyageMult *= m.voyage;
        if (m.chest) p.chestBonus += m.chest;
        if (m.surface) p.surface = true;
        if (m.forge) p.forgeCost = m.forge;
        if (m.windSave) p.windSave = Math.max(p.windSave, m.windSave);
    }
    return p;
}
// The 8 boat forms for the UI: each milestone with its unlock level, perk, and unlocked/current state.
function boatFormsView(level) {
    return MILESTONES.map((m) => ({
        level: m.level, tier: m.tier, name: m.name, perk: m.perk,
        art: BOAT_ART[m.tier] || BOAT_ART[1],
        unlocked: level >= m.level,
        current: level >= m.level && (m.level === 80 || level < m.level + LEVELS_PER_FORM), // the freshest unlocked form
    }));
}
function rawVoyageMs(speedLevel = 0) {
    return Math.max(MIN_VOYAGE_MS, BASE_VOYAGE_MS - Math.max(0, speedLevel) * SPEED_OFF_MS_PER_LEVEL);
}
// Voyage time including the boat's speed-perk milestones.
export function voyageDurationMs(speedLevel = 0, level = 1) {
    return Math.max(MIN_VOYAGE_MS, Math.round(rawVoyageMs(speedLevel) * boatPerks(level).voyageMult));
}
// Progressive cost — each level costs quadratically more than the last.
function upgradeCost(nextLevel) { return 100 * (nextLevel + 1) * (nextLevel + 1); }
// Dig count is NOT a boat lever — flat base budget, extended mid-dig with "buy more digs".
function digStamina() { return BASE_STAMINA; }
// Fortune (luck_level column) sends the boat to richer islands: +1 buried per level (+ milestone bonuses).
function fragmentsBuried(fortuneLevel = 0, level = 1) {
    return Math.min(MAX_BURIED, FRAGMENTS_BURIED + Math.max(0, fortuneLevel) + boatPerks(level).buried);
}
// The boat's level is EARNED BY UPGRADING, not by digging: one level per upgrade level bought across 4 tracks.
function boatLevelFromUpgrades(s = 0, f = 0, r = 0, l = 0) { return 1 + Math.max(0, s) + Math.max(0, f) + Math.max(0, r) + Math.max(0, l); }

// --- dig board -----------------------------------------------------------------------------------------
function randInt(n) { return Math.floor(Math.random() * n); }

// Luck (find_level): how shallow the shallowest a fragment can sit — higher Luck = struck sooner.
function fragMaxDepth(luckLevel = 0) { return Math.max(1, DIG_MAX_DEPTH - Math.floor(Math.max(0, luckLevel) / LUCK_PER_SHALLOW)); }

function newBoard(fortuneLevel, luckLevel, level) {
    // Every tile is a stack of 1–DIG_MAX_DEPTH dirt layers you chip through. Fragments are scattered under
    // random individual tiles — NO clusters, NO pointer, NO shimmer. Fortune enriches the island with more
    // buried fragments; Luck buries them shallower (struck sooner). Never learn a tile's secret until the bottom.
    const depth = Array.from({ length: DIG_ROWS }, () => Array.from({ length: DIG_COLS }, () => 1 + randInt(DIG_MAX_DEPTH)));
    const cells = [];
    for (let r = 0; r < DIG_ROWS; r++) for (let c = 0; c < DIG_COLS; c++) cells.push([r, c]);
    for (let i = cells.length - 1; i > 0; i--) { const j = randInt(i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const frag = cells.slice(0, fragmentsBuried(fortuneLevel, level));
    // Luck caps how deep a fragment tile can be; the "first strike guaranteed" perk forces one to the surface.
    const cap = fragMaxDepth(luckLevel);
    const perks = boatPerks(level);
    frag.forEach(([fr, fc], i) => { depth[fr][fc] = perks.surface && i === 0 ? 1 : (1 + randInt(cap)); });
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
    const rarityLevel = row?.rarity_level || 0;
    const luckLevel = row?.find_level || 0;    // "Luck" = early-find (find_level column)
    const level = boatLevelFromUpgrades(speedLevel, fortuneLevel, rarityLevel, luckLevel); // earned by upgrading, never digging

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

    const rarityPct = (lvl) => Math.min(90, Math.round((Math.max(0, lvl) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus) * 100));
    return {
        level, maxLevel: boatLevelFromUpgrades(MAX_SPEED_LEVEL, MAX_FORTUNE_LEVEL, MAX_RARITY_LEVEL, MAX_LUCK_LEVEL),
        tier: boatTier(level), boatTiers: BOAT_TIERS, boatArt: boatArt(level),
        forms: boatFormsView(level),
        oceanBg: OCEAN_BG, digBg: DIG_BG, islandArt: ISLAND_ART,
        voyagesCompleted: row?.voyages_completed || 0,
        fragments: row?.fragments || 0,
        fragmentsPerChest: boatPerks(level).forgeCost,
        chestReward: { tier: CHEST_FROM_FRAGMENTS, label: CHEST_TIERS[CHEST_FROM_FRAGMENTS]?.label || "Chest", emoji: CHEST_TIERS[CHEST_FROM_FRAGMENTS]?.emoji || "🎁" },
        digRefill: { amount: DIG_REFILL, cost: DIG_REFILL_COST },
        // The boat's FOUR travel/loot levers — all boat-exclusive. Each carries its per-level effect + current/next value.
        speed: {
            level: speedLevel, max: MAX_SPEED_LEVEL, cost: upgradeCost(speedLevel), maxed: speedLevel >= MAX_SPEED_LEVEL,
            minPerLevel: SPEED_MIN_PER_LEVEL, voyageNow: voyageDurationMs(speedLevel, level), voyageNext: voyageDurationMs(speedLevel + 1, level),
        },
        fortune: {
            level: fortuneLevel, max: MAX_FORTUNE_LEVEL, cost: upgradeCost(fortuneLevel), maxed: fortuneLevel >= MAX_FORTUNE_LEVEL,
            buriedNow: fragmentsBuried(fortuneLevel, level), buriedNext: fragmentsBuried(fortuneLevel + 1, level),
        },
        rarity: {
            level: rarityLevel, max: MAX_RARITY_LEVEL, cost: upgradeCost(rarityLevel), maxed: rarityLevel >= MAX_RARITY_LEVEL,
            pctNow: rarityPct(rarityLevel), pctNext: rarityPct(rarityLevel + 1),
        },
        luck: {
            level: luckLevel, max: MAX_LUCK_LEVEL, cost: upgradeCost(luckLevel), maxed: luckLevel >= MAX_LUCK_LEVEL,
            depthNow: fragMaxDepth(luckLevel), depthNext: fragMaxDepth(luckLevel + 1),
        },
        voyageMs: voyageDurationMs(speedLevel, level),
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
    const [row, goldRow, others] = await Promise.all([
        readRow(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        // Other members' boats to sail past in the background (by their form). Empty while owner-gated.
        db.query(
            `SELECT b.alias, s.speed_level, s.luck_level, s.rarity_level, s.find_level
               FROM mkt_sailing s JOIN mkt_buyer b ON b.id = s.buyer_id
              WHERE s.buyer_id <> $1 AND b.alias IS NOT NULL LIMIT 6`,
            [buyerId]
        ).catch(() => []),
    ]);
    const fleet = (others || []).map((o) => ({
        art: boatArt(boatLevelFromUpgrades(o.speed_level || 0, o.luck_level || 0, o.rarity_level || 0, o.find_level || 0)),
        name: o.alias,
    }));
    // Pad with a few generic hulls so the horizon is never empty (decorative until multiplayer sailing opens).
    for (const t of [2, 4, 6, 8, 1]) if (fleet.length < 6) fleet.push({ art: BOAT_ART[t] || BOAT_ART[1], name: null });
    return { ...decorate(row), gold: goldRow?.gold || 0, fleet };
}

export async function startVoyage(buyerId) {
    const state = decorate(await readRow(buyerId));
    if (state.status !== "idle") return { ok: false, error: "busy", ...(await getSailingState(buyerId)) };
    const ms = voyageDurationMs(state.speed.level, state.level);
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
    // Milestone perk (Trade-Wind Schooner): chance the tailwind ISN'T consumed — clear wind_day so it's free again.
    const save = boatPerks(decorate(await readRow(buyerId)).level).windSave;
    let windRefunded = false;
    if (save > 0 && Math.random() < save) {
        await db.query(`UPDATE mkt_sailing SET wind_day = NULL WHERE buyer_id = $1`, [buyerId]).catch(() => {});
        windRefunded = true;
    }
    return { ok: true, windRefunded, ...(await getSailingState(buyerId)) };
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

// Spend fragments to forge a loot chest. The cost is boatPerks().forgeCost (10, or 8 at the level-80 form).
// Rarity (+ chest milestone perks) gives a chance the forged chest is BUMPED up a tier (Iron → Gold). Atomic —
// the WHERE guards against forging with too few (or a double-tap racing the balance).
export async function forgeChest(buyerId) {
    const row = await readRow(buyerId);
    const level = decorate(row).level;
    const cost = boatPerks(level).forgeCost;
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const spent = await db.queryOne(
        `UPDATE mkt_sailing SET fragments = fragments - $2, updated_at = NOW() WHERE buyer_id = $1 AND fragments >= $2 RETURNING fragments`,
        [buyerId, cost]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "not_enough", ...(await getSailingState(buyerId)) };
    // Rarity roll: chance to bump the forged chest one tier up the FORGE_TIER_ORDER.
    const upgradeChance = Math.min(0.9, (row?.rarity_level || 0) * RARITY_UPGRADE_PER_LEVEL + boatPerks(level).chestBonus);
    let tierKey = CHEST_FROM_FRAGMENTS;
    if (Math.random() < upgradeChance) {
        const i = FORGE_TIER_ORDER.indexOf(tierKey);
        if (i >= 0 && i < FORGE_TIER_ORDER.length - 1) tierKey = FORGE_TIER_ORDER[i + 1];
    }
    await addChests(buyerId, { [tierKey]: 1 }).catch(() => {});
    const tier = CHEST_TIERS[tierKey];
    const upgraded = tierKey !== CHEST_FROM_FRAGMENTS;
    return { ok: true, forged: { tier: tierKey, label: tier?.label || "Chest", emoji: tier?.emoji || "🎁", upgraded }, ...(await getSailingState(buyerId)) };
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
    const board = newBoard(row?.luck_level || 0, row?.find_level || 0, state.level);
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
        // NOTE: digging does NOT level the boat — the boat only levels up from buying upgrades.
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

// The four boat upgrade tracks → their DB columns + level caps. Fortune lives in the legacy luck_level column;
// the "Luck" (early-find) lever lives in find_level.
const UPGRADE_COLS = { speed: "speed_level", fortune: "luck_level", rarity: "rarity_level", luck: "find_level" };
const UPGRADE_MAX = { speed: MAX_SPEED_LEVEL, fortune: MAX_FORTUNE_LEVEL, rarity: MAX_RARITY_LEVEL, luck: MAX_LUCK_LEVEL };

async function buyUpgrade(buyerId, kind) {
    const col = UPGRADE_COLS[kind];
    if (!col) return { ok: false, error: "bad_upgrade", ...(await getSailingState(buyerId)) };
    const row = await readRow(buyerId);
    const cur = row?.[col] || 0;
    if (cur >= UPGRADE_MAX[kind]) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = upgradeCost(cur);
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    await db.query(`UPDATE mkt_sailing SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, spent: cost, ...(await getSailingState(buyerId)) };
}
export const upgradeSpeed = (buyerId) => buyUpgrade(buyerId, "speed");
export const upgradeFortune = (buyerId) => buyUpgrade(buyerId, "fortune");
export const upgradeRarity = (buyerId) => buyUpgrade(buyerId, "rarity");
export const upgradeLuck = (buyerId) => buyUpgrade(buyerId, "luck"); // the "Luck" (early-find) lever
