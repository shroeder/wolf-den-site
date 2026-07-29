import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { awardXp } from "@/lib/marketplace/xp.js";

// ── TOWN DEVELOPMENT ────────────────────────────────────────────────────────────────────────────────────────
// A shared, community-funded upgrade catalog. Everyone pools gold into PROJECTS; each level costs more, grants a
// perk the WHOLE town shares, and (eventually) changes the scene. Fully data-driven — add projects/levels here
// forever. Categories: building (re-skins a plaza building) · service (upgrades an NPC/tool) · civic (scene depth
// + town-wide %s) · unlock (makes a whole new building appear, which then gets its own projects).
//
// A project def: { id, category, name, emoji, desc, maxLevel, baseCost, costMult, perk(level)->partialBonuses,
//                  requires?: {otherId: minLevel}, building?: id }.
// cost to go level -> level+1 is round(baseCost * costMult^level).

export const TOWN_PROJECTS = [
    {
        id: "prosperity", category: "civic", name: "Town Prosperity", emoji: "🏛️", maxLevel: 20,
        desc: "The town's beating heart. Every level lifts XP & gold earned by EVERY member.",
        baseCost: 1500, costMult: 1.7,
        perk: (lvl) => ({ xpPct: lvl * 2, goldPct: lvl * 2 }),
    },
    {
        id: "tavern", category: "building", name: "The Tavern", emoji: "🍺", maxLevel: 6,
        desc: "A rowdier tavern — every level pours +5% more gold from Wolf's Gambit dice wins.",
        baseCost: 1200, costMult: 1.85,
        perk: (lvl) => ({ diceGoldPct: lvl * 5 }),
    },
    {
        id: "market", category: "service", name: "Trading Post", emoji: "🧳", maxLevel: 6,
        desc: "The Traveling Merchant stocks rarer chests and cuts you better prices.",
        baseCost: 2000, costMult: 1.95,
        perk: (lvl) => ({ merchantTier: lvl }),
    },
    {
        id: "garrison", category: "service", name: "The Garrison", emoji: "⚔️", maxLevel: 8,
        desc: "Train the town's defenders — every level pays out +10% more gold from every plaza raid.",
        baseCost: 3000, costMult: 2.0,
        perk: (lvl) => ({ raidGoldPct: lvl * 10 }),
    },
    {
        id: "greenhouse", category: "civic", name: "The Greenhouse", emoji: "🌿", maxLevel: 8,
        desc: "A shared town greenhouse — every level speeds crop growth AND fattens the harvest on EVERY member's farm.",
        baseCost: 2200, costMult: 1.9,
        perk: (lvl) => ({ farmGrowPct: lvl * 3, farmYieldPct: lvl * 2 }),
    },
    {
        id: "well", category: "civic", name: "The Wishing Well", emoji: "🪙", maxLevel: 10,
        desc: "Raise a wishing well in the square. Every member can toss a coin ONCE a day for a blessing of gold — and it grows richer each level.",
        baseCost: 1800, costMult: 1.8,
        perk: (lvl) => ({ wellGold: 100 + lvl * 70, wellXp: lvl * 6 }),
    },
];
const PROJECT_BY_ID = Object.fromEntries(TOWN_PROJECTS.map((p) => [p.id, p]));

export function projectCost(def, level) {
    if (level >= def.maxLevel) return null; // maxed
    return Math.round(def.baseCost * Math.pow(def.costMult, level));
}

// Raw global levels: { projectId: {level, gold_in} }.
async function projectLevels() {
    const rows = await db.query(`SELECT project_id, level, gold_in FROM mkt_town_project`).catch(() => []);
    const by = {};
    for (const r of rows) by[r.project_id] = { level: Number(r.level) || 0, goldIn: Number(r.gold_in) || 0 };
    return by;
}

function requiresMet(def, levels) {
    if (!def.requires) return true;
    return Object.entries(def.requires).every(([id, min]) => (levels[id]?.level || 0) >= min);
}

// Aggregate every project's current perk into one town-bonuses object the whole game reads. Cached (town levels
// change rarely) so it's cheap to call from hot paths like awardXp.
let _bonusCache = { at: 0, val: null };
export function invalidateTownBonuses() { _bonusCache = { at: 0, val: null }; }
export async function getTownBonuses(nowMs = 0) {
    if (_bonusCache.val && nowMs && nowMs - _bonusCache.at < 30000) return _bonusCache.val;
    const levels = await projectLevels();
    const agg = { xpPct: 0, goldPct: 0, merchantTier: 0, diceGoldPct: 0, raidGoldPct: 0, farmGrowPct: 0, farmYieldPct: 0, wellGold: 0, wellXp: 0 };
    for (const def of TOWN_PROJECTS) {
        const lvl = levels[def.id]?.level || 0;
        if (lvl <= 0) continue;
        const p = def.perk(lvl) || {};
        if (p.xpPct) agg.xpPct += p.xpPct;
        if (p.goldPct) agg.goldPct += p.goldPct;
        if (p.merchantTier) agg.merchantTier = Math.max(agg.merchantTier, p.merchantTier);
        if (p.diceGoldPct) agg.diceGoldPct = Math.max(agg.diceGoldPct, p.diceGoldPct);
        if (p.raidGoldPct) agg.raidGoldPct = Math.max(agg.raidGoldPct, p.raidGoldPct);
        if (p.farmGrowPct) agg.farmGrowPct += p.farmGrowPct;
        if (p.farmYieldPct) agg.farmYieldPct += p.farmYieldPct;
        if (p.wellGold) agg.wellGold = Math.max(agg.wellGold, p.wellGold);
        if (p.wellXp) agg.wellXp = Math.max(agg.wellXp, p.wellXp);
    }
    _bonusCache = { at: nowMs || 1, val: agg };
    return agg;
}

// A short human summary of what a project level grants (for the UI).
function perkLabel(def, level) {
    if (level <= 0) return null;
    const p = def.perk(level) || {};
    const bits = [];
    if (p.xpPct) bits.push(`+${p.xpPct}% XP`);
    if (p.goldPct) bits.push(`+${p.goldPct}% gold`);
    if (p.merchantTier) bits.push(`Merchant tier ${p.merchantTier}`);
    if (p.diceGoldPct) bits.push(`+${p.diceGoldPct}% dice winnings`);
    if (p.raidGoldPct) bits.push(`+${p.raidGoldPct}% raid gold`);
    if (p.farmGrowPct) bits.push(`+${p.farmGrowPct}% crop growth`);
    if (p.farmYieldPct) bits.push(`+${p.farmYieldPct}% harvest`);
    if (p.wellGold) bits.push(`Daily wish: ${p.wellGold}g${p.wellXp ? ` +${p.wellXp} XP` : ""}`);
    return bits.join(" · ") || null;
}

// The full catalog with live progress, for the Town Development panel. Hides projects whose prereqs aren't met.
export async function getTownProjects() {
    const levels = await projectLevels();
    return TOWN_PROJECTS.filter((def) => requiresMet(def, levels)).map((def) => {
        const level = levels[def.id]?.level || 0;
        const goldIn = levels[def.id]?.goldIn || 0;
        const cost = projectCost(def, level);
        return {
            id: def.id, category: def.category, name: def.name, emoji: def.emoji, desc: def.desc,
            level, maxLevel: def.maxLevel, maxed: level >= def.maxLevel,
            goldIn, cost, progressPct: cost ? Math.min(100, Math.round((goldIn / cost) * 100)) : 100,
            perkNow: perkLabel(def, level), perkNext: level < def.maxLevel ? perkLabel(def, level + 1) : null,
        };
    });
}

// Contribute gold to a project (guarded spend). Banks it; levels up (possibly several times) once the cost is
// met. Returns the project's new level + your remaining gold. NOT the whole town — the SHARED town.
export async function contributeToProject(buyerId, projectId, amount) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const def = PROJECT_BY_ID[projectId];
    if (!def) return { ok: false, error: "unknown_project" };
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: "bad_amount" };
    const levels = await projectLevels();
    if (!requiresMet(def, levels)) return { ok: false, error: "locked" };
    if ((levels[def.id]?.level || 0) >= def.maxLevel) return { ok: false, error: "maxed" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, amt]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -amt, "town_project", { balanceAfter: paid.gold, meta: { project: projectId } }).catch(() => {});
    await db.query(`INSERT INTO mkt_town_project_gift (project_id, buyer_id, amount) VALUES ($1, $2, $3)`, [projectId, buyerId, amt]).catch(() => {});

    // Bank the gold, then level up as many times as it now affords (atomic-ish read/modify/write on one row).
    let row = await db.queryOne(
        `INSERT INTO mkt_town_project (project_id, level, gold_in, updated_at) VALUES ($1, 0, $2, NOW())
         ON CONFLICT (project_id) DO UPDATE SET gold_in = mkt_town_project.gold_in + $2, updated_at = NOW()
         RETURNING level, gold_in`,
        [projectId, amt]
    ).catch(() => null);
    let level = Number(row?.level) || 0;
    let goldIn = Number(row?.gold_in) || 0;
    let leveledTo = null;
    while (level < def.maxLevel) {
        const cost = projectCost(def, level);
        if (goldIn < cost) break;
        level += 1; goldIn -= cost; leveledTo = level;
    }
    if (leveledTo != null) {
        await db.query(`UPDATE mkt_town_project SET level = $2, gold_in = $3 WHERE project_id = $1`, [projectId, level, goldIn]).catch(() => {});
        invalidateTownBonuses();
    }
    return { ok: true, gold: Number(paid.gold), project: projectId, level, goldIn, leveledTo };
}

// Has this member already tossed their coin in the Wishing Well today? (day boundary = America/Chicago, matching
// every other daily gate). One `wishing_well` coin event per local day.
export async function wellClaimedToday(buyerId) {
    if (!buyerId) return true;
    const row = await db.queryOne(
        `SELECT 1 FROM mkt_coin_event
          WHERE buyer_id = $1 AND reason = 'wishing_well'
            AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
          LIMIT 1`,
        [buyerId]
    ).catch(() => null);
    return Boolean(row);
}

// Claim the daily Wishing Well blessing — gold (+ a little XP) scaled by how far the town has funded the well.
// Once per day per member. Pure upside; the well must be built (funded ≥ Lv 1) first.
export async function claimWishingWell(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const bonuses = await getTownBonuses(Date.now());
    const gold = Math.max(0, Number(bonuses.wellGold) || 0);
    if (gold <= 0) return { ok: false, error: "not_built" };
    if (await wellClaimedToday(buyerId)) return { ok: false, error: "already_claimed" };
    const xp = Math.max(0, Number(bonuses.wellXp) || 0);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "wishing_well", { balanceAfter: paid?.gold }).catch(() => {});
    if (xp > 0) await awardXp(buyerId, "wishing_well", { points: xp, gold: 0 }).catch(() => {});
    return { ok: true, gold, xp, goldAfter: paid?.gold ?? null };
}
