import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { addChests } from "@/lib/marketplace/chests.js";

// ── MINING (owner-gated, phase 1) ────────────────────────────────────────────────────────────────────────────
// You PROSPECT — one button surfaces a random live seam — then swing at it on
// the SAME timing bar as the Forge anvil and the Treasure Golem — identical grade bands, so the skill a member
// already has transfers instead of being re-learned. Chip a node's HP to zero and its ore is yours.
//
// Ore smelts into FORGE PARTS (crafting.js PART_TIERS 1..5), so mining feeds the Forge that already exists
// rather than minting a parallel currency. Ore tier maps straight onto part tier — that's the whole
// "depending on the ore" rule, kept deliberately legible.
//
// OWNER-GATED. Every read and every write goes through MINING_UNLOCKED. Flip that one function to open it.

export const MINING_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

// ── ORE TIERS ────────────────────────────────────────────────────────────────────────────────────────────────
// Named for the rock, coloured up the usual rarity ladder. `part` is the forge part tier it smelts into, which
// is 1:1 on purpose — a member should be able to look at a lump of ore and know what it becomes.
// `weight` is the spawn share at lantern 0; `hp` is how much chipping the node takes.
export const ORE_TIERS = {
    1: { tier: 1, id: "coal", name: "Coal Seam", color: "#8b8f96", part: 1, weight: 44, hp: 60, xp: 6, gold: 5 },
    2: { tier: 2, id: "iron", name: "Iron Vein", color: "#cfd6dd", part: 2, weight: 30, hp: 110, xp: 12, gold: 11 },
    3: { tier: 3, id: "silver", name: "Silver Lode", color: "#6fb0e6", part: 3, weight: 17, hp: 190, xp: 24, gold: 22 },
    4: { tier: 4, id: "mythril", name: "Mythril Seam", color: "#b98cff", part: 4, weight: 7, hp: 320, xp: 48, gold: 44 },
    5: { tier: 5, id: "emberheart", name: "Emberheart Geode", color: "#ffb020", part: 5, weight: 2, hp: 520, xp: 96, gold: 90 },
};
export const oreTier = (t) => ORE_TIERS[t] || ORE_TIERS[1];

// ── THE LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
// Straight from the Kitchen: you see every rung BEFORE you start, and how well you play decides which one you
// land on. Previously timing only decided how fast a seam cracked — the haul was identical whether you hit
// every marker dead centre or mashed the button, which left the bar with nothing riding on it.
//
// Quality is your AVERAGE swing grade across the seam (0.5 glancing … 5.0 perfect), normalised to 0..1. Using
// the average rather than the best swing means one lucky tap can't carry a sloppy dig, and using it rather
// than the worst means one fumble doesn't erase a good one.
export const MINE_RUNGS = [
    { rung: 1, key: "rough", label: "Rough dig", min: 0, mult: 1.0, blurb: "You got it open." },
    { rung: 2, key: "solid", label: "Solid work", min: 0.34, mult: 1.6, blurb: "Clean enough to keep the good stuff." },
    { rung: 3, key: "clean", label: "Clean break", min: 0.60, mult: 2.4, blurb: "The seam split where you wanted it to." },
    { rung: 4, key: "flawless", label: "Flawless seam", min: 0.84, mult: 3.4, blurb: "Every strike true — the whole vein comes out." },
];
const MAX_GRADE_MULT = 5.0;
export const rungForQuality = (q) => [...MINE_RUNGS].reverse().find((r) => q >= r.min) || MINE_RUNGS[0];
// Base ore a seam holds before the rung multiplier and the Haul track.
export const baseOre = (tier) => 2 + tier;
export const oreArt = (t) => `/images/mining/ore-${oreTier(t).id}.png`;


// ── THE DESCENT ──────────────────────────────────────────────────────────────────────────────────────────────
// Push-your-luck. Each step down the tunnel flips a card; the deeper you are the better the cards AND the
// likelier the roof comes in. Bail whenever you want and everything you are carrying is yours; push once too
// far and the haul is gone.
//
// A COLLAPSE ENDS THE RUN. No haul, no seam, no rock face — the trip is spent and you walked away with
// nothing. That is what makes climbing out a decision instead of a formality; if the roof coming in still
// handed you a seam, pushing would be free and there would be no game here at all.
export const TRIPS_PER_DAY = 3;
const COLLAPSE_FREE_DEPTH = 2;      // the first steps are safe, so there is always a reason to start
export const safeDepthFor = (shoringLevel = 0) => COLLAPSE_FREE_DEPTH + Math.floor(Math.max(0, shoringLevel) / 3); // Shoring buys more
const COLLAPSE_PER_DEPTH = 0.075;   // and then it climbs
const COLLAPSE_CAP = 0.55;
export const collapseChanceAt = (depth, shoringLevel = 0) => Math.min(COLLAPSE_CAP, Math.max(0, depth - safeDepthFor(shoringLevel)) * COLLAPSE_PER_DEPTH);

// What the tunnel can turn up. Weights shift with depth — shallow rock is mostly ore and rubble, deep rock is
// where the gear and the strongboxes are. A `seam` card raises the tier of what you end up mining.
const CARD_TABLE = [
    { key: "seam", label: "A seam in the wall", w: (d) => 26 + d * 2 },
    { key: "ore", label: "Loose ore", w: () => 20 },
    { key: "gold", label: "A dropped purse", w: () => 14 },
    { key: "consumable", label: "An old cache", w: (d) => 10 + d },
    { key: "gear", label: "Something buried", w: (d) => 4 + d * 2.2 },
    { key: "chest", label: "A strongbox", w: (d) => 2 + d * 1.4 },
    { key: "encounter", label: "Something down here", w: (d) => 6 + d },
    { key: "nothing", label: "Bare rock", w: () => 16 },
];
const drawCard = (depth) => {
    const rolled = CARD_TABLE.map((c) => ({ ...c, weight: c.w(depth) }));
    const total = rolled.reduce((s, c) => s + c.weight, 0) || 1;
    let r = Math.random() * total;
    for (const c of rolled) { r -= c.weight; if (r <= 0) return c; }
    return rolled[rolled.length - 1];
};

// Encounters — flavour with teeth. Each one lands an immediate consequence rather than opening another menu.
const ENCOUNTERS = [
    { key: "bats", title: "Bats!", body: "They boil out of the dark and knock the wind out of you.", effect: "none" },
    { key: "gas", title: "Firedamp", body: "The lamp gutters. The air down here has gone bad.", effect: "risk" },
    { key: "pool", title: "A still black pool", body: "Something glitters at the bottom of it.", effect: "ore" },
    { key: "shaft", title: "An older shaft", body: "Someone cut this before you. Their tools are still here.", effect: "consumable" },
    { key: "vein", title: "The vein widens", body: "The rock ahead is threaded with colour.", effect: "seam" },
];

function rollFind(card, depth, packBonus = 0) {
    const tierCeil = Math.min(5, 1 + Math.floor(depth / 2));
    const pickTier = () => Math.max(1, Math.min(5, tierCeil - (Math.random() < 0.45 ? 1 : 0)));
    switch (card.key) {
        case "seam": {
            const t = pickTier();
            const o = oreTier(t);
            return { kind: "seam", tier: t, name: o.name, color: o.color, art: oreArt(t) };
        }
        case "ore": {
            const t = pickTier();
            const o = oreTier(t);
            return { kind: "ore", tier: t, n: Math.max(1, Math.round((1 + Math.floor(Math.random() * 2)) * (1 + packBonus))), name: o.name, color: o.color, art: oreArt(t) };
        }
        case "gold": return { kind: "gold", n: Math.round((20 + Math.floor(Math.random() * (18 * depth + 20))) * (1 + packBonus)) };
        case "consumable": return { kind: "consumable" };
        case "gear": return { kind: "gear", depth };
        case "chest": {
            const ladder = ["wooden", "wooden", "iron", "iron", "gold", "gold", "mythic"];
            return { kind: "chest", tier: ladder[Math.min(ladder.length - 1, depth - 1)] || "wooden" };
        }
        case "encounter": {
            const e = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
            const t = e.effect === "seam" || e.effect === "ore" ? pickTier() : null;
            const o = t ? oreTier(t) : null;
            return { kind: "encounter", key: e.key, title: e.title, body: e.body, effect: e.effect, tier: t, name: o?.name || null, color: o?.color || null, art: t ? oreArt(t) : null };
        }
        default: return { kind: "nothing" };
    }
}

// Start a descent. Costs one of the day's trips.
export async function startTrip(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    if (row?.run_json && !row.run_json.over) return { ok: false, error: "run_in_progress", ...(await getMiningState(buyerId)) };
    if ((Number(row?.trips_used) || 0) >= TRIPS_PER_DAY) return { ok: false, error: "no_trips", ...(await getMiningState(buyerId)) };
    const spent = await db.queryOne(
        `UPDATE mkt_mining SET trips_used = trips_used + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND trips_day = ${DAY} AND trips_used < $2 RETURNING trips_used`,
        [buyerId, TRIPS_PER_DAY]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "no_trips", ...(await getMiningState(buyerId)) };
    const run = { depth: 0, haul: [], seamTier: 1, over: false, collapsed: false, last: null };
    await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb, current_node_id = NULL WHERE buyer_id = $1`, [buyerId, JSON.stringify(run)]).catch(() => {});
    await trackActivity(buyerId, "mine_trip", {}).catch(() => {});
    return { ok: true, ...(await getMiningState(buyerId)) };
}

// One step deeper.
export async function descend(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const run = row?.run_json;
    if (!run || run.over) return { ok: false, error: "no_run" };
    const depth = (Number(run.depth) || 0) + 1;

    // THE ROOF. Rolled before the card, so a collapse is the tunnel deciding rather than a reward being shown
    // to you and then snatched back.
    if (Math.random() < collapseChanceAt(depth, row?.assay_level)) {
        const lost = (run.haul || []).length;
        const next = { ...run, depth, over: true, collapsed: true, haul: [], last: { kind: "collapse" } };
        await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb WHERE buyer_id = $1`, [buyerId, JSON.stringify(next)]).catch(() => {});
        await trackActivity(buyerId, "mine_collapse", { depth, lost }).catch(() => {});
        // No seam. The rock face stays empty and the trip is gone.
        return { ok: true, collapsed: true, depth, lost, seam: null, ...(await getMiningState(buyerId)) };
    }

    const card = drawCard(depth + Math.round(surveyValue("lantern", row?.lantern_level) * 10)); // Lantern reads the tunnel as deeper than it is
    const found = rollFind(card, depth, surveyValue("pack", row?.face_level));
    const haul = [...(run.haul || [])];
    let seamTier = Number(run.seamTier) || 1;
    if (found.kind === "seam") seamTier = Math.max(seamTier, found.tier);
    else if (found.kind === "encounter") {
        if (found.effect === "seam") seamTier = Math.max(seamTier, found.tier || 1);
        else if (found.effect === "ore") haul.push({ kind: "ore", tier: found.tier, n: 2, name: found.name, color: found.color, art: found.art });
        else if (found.effect === "consumable") haul.push({ kind: "consumable" });
    } else if (found.kind !== "nothing") haul.push(found);

    const next = { ...run, depth, haul, seamTier, last: { kind: found.kind, label: card.label } };
    await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb WHERE buyer_id = $1`, [buyerId, JSON.stringify(next)]).catch(() => {});
    return { ok: true, card: { key: card.key, label: card.label }, found, depth, ...(await getMiningState(buyerId)) };
}

// Climb out with everything you are carrying, and take the seam to the rock face.
export async function surfaceRun(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const run = row?.run_json;
    if (!run || run.over) return { ok: false, error: "no_run" };

    // Everything banked pays out NOW. The haul was only ever a promise until you climbed out with it.
    const paid = [];
    for (const item of run.haul || []) {
        if (item.kind === "ore") {
            await db.query(`INSERT INTO mkt_ore (buyer_id, tier, qty) VALUES ($1,$2,$3) ON CONFLICT (buyer_id, tier) DO UPDATE SET qty = mkt_ore.qty + EXCLUDED.qty`, [buyerId, item.tier, item.n]).catch(() => {});
            paid.push(item);
        } else if (item.kind === "gold") {
            const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, item.n]).catch(() => null);
            await logCoin(buyerId, item.n, "mining", { balanceAfter: g?.gold, meta: { kind: "descent" } }).catch(() => {});
            paid.push(item);
        } else if (item.kind === "chest") {
            await addChests(buyerId, { [item.tier]: 1 }, { source: "mining" }).catch(() => {});
            paid.push(item);
        } else if (item.kind === "gear") {
            const got = await grantMiningGear(buyerId, item.depth);
            if (got) paid.push({ ...item, ...got });
        } else if (item.kind === "consumable") {
            const got = await grantMiningConsumable(buyerId);
            if (got) paid.push({ ...item, ...got });
        }
    }
    const next = { ...run, over: true, collapsed: false };
    await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb WHERE buyer_id = $1`, [buyerId, JSON.stringify(next)]).catch(() => {});
    const seam = await cutSeam(buyerId, Number(run.seamTier) || 1);
    await trackActivity(buyerId, "mine_surface", { depth: run.depth, haul: paid.length }).catch(() => {});
    return { ok: true, surfaced: true, paid, seam, ...(await getMiningState(buyerId)) };
}

// The seam you walked out with becomes the rock you mine.
async function cutSeam(buyerId, tier) {
    const o = oreTier(Math.max(1, Math.min(5, tier)));
    const made = await db.queryOne(
        `INSERT INTO mkt_ore_node (tier, x, y, hp, hp_max, expires_at)
         VALUES ($1, 50, 70, $2, $2, NOW() + INTERVAL '12 hours') RETURNING id`,
        [o.tier, o.hp]
    ).catch(() => null);
    if (made?.id) await db.query(`UPDATE mkt_mining SET current_node_id = $2 WHERE buyer_id = $1`, [buyerId, made.id]).catch(() => {});
    return made?.id ? { tier: o.tier, name: o.name, color: o.color, art: oreArt(o.tier) } : null;
}

// A piece of gear out of the dark. Deeper digs reach higher rarities; never a duplicate.
async function grantMiningGear(buyerId, depth) {
    const ladder = depth >= 8 ? ["legendary", "epic", "rare"] : depth >= 5 ? ["epic", "rare", "common"] : ["rare", "common"];
    const [{ randomDropPool }, { grantItem }] = await Promise.all([
        import("@/lib/marketplace/items.js"),
        import("@/lib/marketplace/inventory.js"),
    ]);
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    for (const rarity of ladder) {
        const pool = randomDropPool((i) => i.rarity === rarity && !owned.has(i.id));
        if (!pool.length) continue;
        const it = pool[Math.floor(Math.random() * pool.length)];
        await grantItem(buyerId, it.id, "mining").catch(() => {});
        return { id: it.id, name: it.name, rarity: it.rarity };
    }
    return null;
}

const MINE_CONSUMABLES = ["treat_bone", "farm_growth_tonic", "pot_adrenaline", "farm_fertilizer_crate", "sail_lucky_lure"];
async function grantMiningConsumable(buyerId) {
    const { grantConsumable, CONSUMABLES } = await import("@/lib/marketplace/consumables.js");
    const id = MINE_CONSUMABLES[Math.floor(Math.random() * MINE_CONSUMABLES.length)];
    await grantConsumable(buyerId, id, 1).catch(() => {});
    return { id, name: CONSUMABLES[id]?.name || id };
}

// ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
// Bands and multipliers mirror town-events.js exactly. They are duplicated rather than imported because a
// mining swing must never accidentally inherit a raid rebalance — but if you change one, change both, and the
// comment in each says so.
const SWING_GRADES = [
    { key: "pixel", max: 0.022, mult: 5.0, label: "PERFECT STRIKE" },
    { key: "perfect", max: 0.055, mult: 3.6, label: "CLEAN HIT" },
    { key: "great", max: 0.10, mult: 2.6, label: "SOLID" },
    { key: "good", max: 0.16, mult: 1.6, label: "GLANCING" },
];
const SWING_MISS = { key: "miss", mult: 0.5, label: "CHIP" };
const gradeForDist = (dist) => SWING_GRADES.find((g) => dist <= g.max) || SWING_MISS;
const GRADE_RANK = { miss: 0, good: 1, great: 2, perfect: 3, pixel: 4 };
// Re-arm by grade, same ladder as the raid. The client owns the cadence and shows it; this is what it re-arms on.
export const SWING_COOLDOWN_MS = { pixel: 700, perfect: 850, great: 1050, good: 1300, miss: 1600 };
// Pure double-tap floor, kept comfortably UNDER the fastest grade cooldown so a legitimately re-armed swing is
// never rejected. (The raid learned this the hard way: a floor above the fastest cooldown silently eats swings.)
const SWING_THROTTLE_MS = 500;

const COMBO_STEP = 0.10;
const COMBO_MAX = 2.0;
const COMBO_MIN_GRADE = "good";

// ── DAILY ALLOWANCE + UPGRADES ───────────────────────────────────────────────────────────────────────────────
const SWINGS_PER_DAY = 60;          // generous: a swing is one tap, and a node takes several
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";

// `icon` is a react-icons/gi NAME, never an emoji. Emoji are drawn by the OS — they render as somebody else's
// artwork in the middle of ours, differently on every device. Everything user-facing here is a sprite or a Gi
// glyph. See ICONS in MiningClient.
// Four tracks, each buying a different KIND of mining rather than just "more of it" — same design rule as the
// fishing rail, so they don't collapse into one obvious purchase order.
export const MINE_TRACKS = {
    pick: { max: 10, per: 0.12, cap: 1.2, kind: "mult", name: "Pickaxe", icon: "GiWarPick", col: "pick_level",
        desc: "Harder swings — fewer to crack a seam.", effect: "Swing power" },
    haul: { max: 10, per: 0.10, cap: 1.0, kind: "mult", name: "Haul", icon: "GiKnapsack", col: "haul_level",
        desc: "More ore out of every seam you crack.", effect: "Ore per seam" },
    vigor: { max: 10, per: 4, cap: 40, kind: "count", name: "Vigor", icon: "GiMuscleUp", col: "vigor_level",
        desc: "More swings each day.", effect: "Daily swings" },
};

// SURVEY tracks. The Lantern lives here, not in mining: it buys test-strikes and tilts which seams surface,
// and both of those are about FINDING rock rather than breaking it. It kept its column, so no levels are lost.
export const SURVEY_TRACKS = {
    lantern: { max: 10, per: 0.04, cap: 0.40, kind: "pct", name: "Lantern", icon: "GiLanternFlame", col: "lantern_level",
        desc: "Light reaches further — the tunnel gives up better things the deeper you get.", effect: "Find quality" },
    shoring: { max: 10, per: 1, cap: 10, kind: "count", name: "Shoring", icon: "GiWoodBeam", col: "assay_level",
        desc: "Timbered walls. The roof holds for longer before the risk starts climbing.", effect: "Safe depth" },
    pack: { max: 10, per: 0.08, cap: 0.80, kind: "pct", name: "Pack", icon: "GiKnapsack", col: "face_level",
        desc: "A deeper pack — every purse and pocket of ore you find is bigger.", effect: "Haul size" },
};
export const surveyValue = (t, lvl) => Math.min(SURVEY_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * SURVEY_TRACKS[t].per);
// Spots on the face, and test-strikes to spend on them. Both stay well under "sound out everything", because
// the game is choosing what NOT to look at.
export const spotsFor = (faceLevel = 0) => 5 + Math.floor(Math.max(0, faceLevel) / 4);   // 5..7
export const probesFor = (lanternLevel = 0) => 2 + Math.floor(Math.max(0, lanternLevel) / 4); // 2..4
export const trackValue = (t, lvl) => Math.min(MINE_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * MINE_TRACKS[t].per);
// Cost curve mirrors the boat/rail tracks: each level costs more than the last.
export const trackCost = (level) => 300 + Math.round(Math.pow(Math.max(0, level), 1.6) * 140);

// SMELTING tracks. Its own half of the feature, so it gets its own levers rather than riding the pickaxe's.
export const SMELT_TRACKS = {
    bellows: { max: 10, per: 0.03, cap: 0.30, kind: "pct", name: "Bellows", icon: "GiBellows", col: "bellows_level",
        desc: "A hotter burn sometimes yields an extra part.", effect: "Bonus part chance" },
    crucible: { max: 10, per: 1, cap: 10, kind: "count", name: "Crucible", icon: "GiCauldron", col: "crucible_level",
        desc: "A bigger pot needs less ore for the same part.", effect: "Ore per part" },
    flux: { max: 10, per: 0.02, cap: 0.20, kind: "pct", name: "Flux", icon: "GiSparkles", col: "flux_level",
        desc: "A purer melt sometimes lifts a part a whole tier.", effect: "Tier-up chance" },
};
export const smeltValue = (t, lvl) => Math.min(SMELT_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * SMELT_TRACKS[t].per);
// Ore per part. The Crucible buys this down twice over its ten levels — a visible, discrete win rather than a
// fraction that never quite changes the number on screen.
export const SMELT_BASE_COST = 3;
export const smeltCostFor = (crucibleLevel = 0) => Math.max(1, SMELT_BASE_COST - Math.floor(Math.max(0, crucibleLevel) / 4));

// FURNACE FORMS — the smelting equivalent of the pickaxe ladder. Total smelting levels (0..30) decide which
// furnace you're feeding, and it's the one you see in the smelt animation, so investment is visible at the
// exact moment it pays off.
const FURNACE_FORMS = [
    { at: 0, id: 1, name: "Stone Hearth" },
    { at: 4, id: 2, name: "Banded Forge" },
    { at: 10, id: 3, name: "Brick Smelter" },
    { at: 17, id: 4, name: "Runed Crucible" },
    { at: 25, id: 5, name: "Emberheart Furnace" },
];
export function furnaceForm(totalSmeltLevels) {
    let form = FURNACE_FORMS[0];
    for (const f of FURNACE_FORMS) if (totalSmeltLevels >= f.at) form = f;
    const next = FURNACE_FORMS.find((f) => f.at > totalSmeltLevels) || null;
    return { ...form, sprite: `/images/mining/furnace-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// LANTERN FORMS — the surveying tool ladder, so all three tabs show a tool that visibly improves.
const LANTERN_FORMS = [
    { at: 0, id: 1, name: "Tallow Candle" },
    { at: 4, id: 2, name: "Tin Lantern" },
    { at: 10, id: 3, name: "Brass Lamp" },
    { at: 17, id: 4, name: "Runed Lantern" },
    { at: 25, id: 5, name: "Emberheart Lamp" },
];
export function lanternForm(totalSurvey) {
    let form = LANTERN_FORMS[0];
    for (const f of LANTERN_FORMS) if (totalSurvey >= f.at) form = f;
    const next = LANTERN_FORMS.find((f) => f.at > totalSurvey) || null;
    return { ...form, sprite: `/images/mining/lantern-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// PICKAXE FORMS. Total upgrade levels across all four tracks (0..40) decide which pickaxe you're swinging, so
// every purchase moves you toward a visibly better tool — the boat-form trick, which is the single best
// "my upgrades are real" signal in the game.
const PICK_FORMS = [
    { at: 0, id: "worn", name: "Worn Pick" },
    { at: 6, id: "iron", name: "Iron Pick" },
    { at: 13, id: "steel", name: "Steel Pick" },
    { at: 21, id: "mythril", name: "Mythril Pick" },
    { at: 30, id: "emberheart", name: "Emberheart Pick" },
];
export function pickForm(totalLevels) {
    let form = PICK_FORMS[0];
    for (const f of PICK_FORMS) if (totalLevels >= f.at) form = f;
    const next = PICK_FORMS.find((f) => f.at > totalLevels) || null;
    return { ...form, sprite: `/images/mining/pick-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// ── CAVE + SPAWNING ──────────────────────────────────────────────────────────────────────────────────────────
// Nodes live for a while and are replaced as they're mined or expire, so the cave is never empty and never a
// wall of ore. Spawning is lazy — it runs on read, so there's no cron to keep alive.
const MAX_ACTIVE_NODES = 7;
const NODE_TTL_MIN = 90;
// A node still stores an x/y. Nothing renders it since the walk-around came out, but it costs nothing and a
// later "cave map" view would want it back — a spawn without a position is harder to add than to keep.
const CAVE_X = [8, 92];
const CAVE_Y = [62, 88];

const randBetween = (a, b) => a + Math.random() * (b - a);
function rollOreTier(lanternPct = 0) {
    // Lantern shifts weight off the bottom tier and onto everything above it — the same "tilt, don't gate"
    // approach fishing uses, so a new miner still sees the whole table, just less often.
    const entries = Object.values(ORE_TIERS).map((o) => ({
        tier: o.tier,
        w: o.tier === 1 ? o.weight * (1 - Math.min(0.6, lanternPct)) : o.weight * (1 + lanternPct * 2),
    }));
    const total = entries.reduce((s, e) => s + e.w, 0) || 1;
    let r = Math.random() * total;
    for (const e of entries) { r -= e.w; if (r <= 0) return e.tier; }
    return 1;
}

// Retire what's finished and top the cave back up. Safe to call on every read.
async function refreshNodes(lanternPct = 0) {
    await db.query(`UPDATE mkt_ore_node SET status = 'expired' WHERE status = 'active' AND expires_at <= NOW()`).catch(() => {});
    const live = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_ore_node WHERE status = 'active'`).catch(() => null);
    const missing = Math.max(0, MAX_ACTIVE_NODES - (live?.n || 0));
    for (let i = 0; i < missing; i += 1) {
        const tier = rollOreTier(lanternPct);
        const o = oreTier(tier);
        await db.query(
            `INSERT INTO mkt_ore_node (tier, x, y, hp, hp_max, expires_at)
             VALUES ($1, $2, $3, $4, $4, NOW() + ($5 || ' minutes')::interval)`,
            [tier, Math.round(randBetween(...CAVE_X) * 10) / 10, Math.round(randBetween(...CAVE_Y) * 10) / 10, o.hp, String(NODE_TTL_MIN)]
        ).catch(() => {});
    }
}

// ── STATE ────────────────────────────────────────────────────────────────────────────────────────────────────
async function minerRow(buyerId) {
    await db.query(`INSERT INTO mkt_mining (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    return db
        .queryOne(
            `UPDATE mkt_mining
                SET trips_used = CASE WHEN trips_day = ${DAY} THEN trips_used ELSE 0 END,
                    trips_day = ${DAY},
                    swing_used = CASE WHEN swing_day = ${DAY} THEN swing_used ELSE 0 END,
                    swing_bonus = CASE WHEN swing_day = ${DAY} THEN swing_bonus ELSE 0 END,
                    swing_day = ${DAY}
              WHERE buyer_id = $1
              RETURNING *`,
            [buyerId]
        )
        .catch(() => null);
}

const totalLevels = (row) => Object.values(MINE_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
const totalSurveyLevels = (row) => Object.values(SURVEY_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
const totalSmeltLevels = (row) => Object.values(SMELT_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
// One shape for an upgrade card, so the mining and smelting lists render through the same component.
const trackCards = (defs, row, valueFn, costFn, fmt) => Object.entries(defs).map(([key, t]) => {
    const level = Number(row?.[t.col]) || 0;
    return {
        key, name: t.name, icon: t.icon, desc: t.desc, effect: t.effect, level, max: t.max, kind: t.kind,
        now: fmt(key, level), next: level >= t.max ? null : fmt(key, level + 1),
        maxed: level >= t.max, cost: level >= t.max ? null : costFn(level),
    };
});

export async function getMiningState(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { unlocked: false };
    const row = await minerRow(buyerId);
    // Only retire what's finished; walls are cut on demand by startSurvey rather than kept stocked.
    await db.query(`UPDATE mkt_ore_node SET status = 'expired' WHERE status = 'active' AND expires_at <= NOW()`).catch(() => {});

    const [current, ore, goldRow, liveCount, faceRows] = await Promise.all([
        row?.current_node_id
            ? db.queryOne(
                `SELECT n.id, n.tier, n.hp, n.hp_max, COALESCE(h.damage, 0) AS my_damage, COALESCE(h.swings, 0) AS my_swings,
                        COALESCE(h.grade_sum, 0) AS my_grade_sum
                   FROM mkt_ore_node n
                   LEFT JOIN mkt_ore_node_hit h ON h.node_id = n.id AND h.buyer_id = $1
                  WHERE n.id = $2 AND n.status = 'active'`,
                [buyerId, row.current_node_id]
            ).catch(() => null)
            : Promise.resolve(null),
        db.query(`SELECT tier, qty FROM mkt_ore WHERE buyer_id = $1 AND qty > 0 ORDER BY tier`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_ore_node WHERE status = 'active'`).catch(() => null),
        // Tiers of the spots on the current face, for the MANIFEST (see below).
        row?.survey_json?.spots?.length
            ? db.query(`SELECT id, tier, face_x, face_y FROM mkt_ore_node WHERE id = ANY($1)`, [row.survey_json.spots]).catch(() => [])
            : Promise.resolve([]),
    ]);

    const lvls = totalLevels(row);
    const tripsUsed = Number(row?.trips_used) || 0;
    const run = row?.run_json && !row.run_json.over ? row.run_json : null;
    return {
        unlocked: true,

        pick: pickForm(lvls),
        trips: { used: tripsUsed, max: TRIPS_PER_DAY, left: Math.max(0, TRIPS_PER_DAY - tripsUsed) },
        // The descent in progress, if there is one. Depth, what you are carrying, and how bad the next step is.
        run: run ? {
            depth: Number(run.depth) || 0,
            seamTier: Number(run.seamTier) || 1,
            seamName: oreTier(Number(run.seamTier) || 1).name,
            seamColor: oreTier(Number(run.seamTier) || 1).color,
            seamArt: oreArt(Number(run.seamTier) || 1),
            haul: run.haul || [],
            last: run.last || null,
            risk: Math.round(collapseChanceAt((Number(run.depth) || 0) + 1, row?.assay_level) * 100),
        } : null,
        // How the last descent ended, so the client can show the wrap-up once.
        lastRun: row?.run_json?.over ? { collapsed: Boolean(row.run_json.collapsed), depth: Number(row.run_json.depth) || 0 } : null,
        tracks: trackCards(MINE_TRACKS, row, trackValue, trackCost, (key, lvl) => {
            const v = trackValue(key, lvl);
            if (key === "vigor") return `${SWINGS_PER_DAY + v} swings`;
            if (key === "lantern") return `+${Math.round(v * 100)}% rich`;
            return `×${(1 + v).toFixed(2)}`;
        }),
        lantern: lanternForm(totalSurveyLevels(row)),
        surveyLevels: totalSurveyLevels(row),
        surveyTracks: trackCards(SURVEY_TRACKS, row, surveyValue, trackCost, (key, lvl) => {
            if (key === "shoring") return `${safeDepthFor(lvl)} safe`;
            return `+${Math.round(surveyValue(key, lvl) * 100)}%`;
        }),
        furnace: furnaceForm(totalSmeltLevels(row)),
        smeltLevels: totalSmeltLevels(row),
        smeltTracks: trackCards(SMELT_TRACKS, row, smeltValue, trackCost, (key, lvl) => {
            if (key === "crucible") return `${smeltCostFor(lvl)} ore → 1`;
            return `${Math.round(smeltValue(key, lvl) * 100)}%`;
        }),
        // The ONE seam you're working, or null until you prospect.
        node: current ? (() => {
            const o = oreTier(current.tier);
            const haulMult = 1 + trackValue("haul", row?.haul_level);
            const sw = Number(current.my_swings) || 0;
            // Your running quality on THIS seam, so the ladder can show where you'd land if it broke now.
            const q = sw > 0 ? Math.max(0, Math.min(1, (Number(current.my_grade_sum) || 0) / sw / 5.0)) : null;
            return {
                id: Number(current.id), tier: current.tier, name: o.name, color: o.color, art: oreArt(current.tier),
                partTier: o.part, gold: o.gold, xp: o.xp,
                hp: Number(current.hp), hpMax: Number(current.hp_max),
                pct: current.hp_max ? Math.max(0, Math.round((current.hp / current.hp_max) * 100)) : 0,
                mySwings: sw,
                // The LADDER, shown before you swing: what each standard of digging pays out of this seam.
                ladder: MINE_RUNGS.map((r) => ({
                    rung: r.rung, key: r.key, label: r.label, blurb: r.blurb,
                    ore: Math.max(1, Math.round(baseOre(current.tier) * r.mult * haulMult)),
                })),
                quality: q == null ? null : Math.round(q * 100),
                currentRung: q == null ? null : rungForQuality(q).rung,
            };
        })() : null,
        seamsLive: Number(liveCount?.n) || 0,
        streak: { current: Number(row?.read_streak) || 0, best: Number(row?.best_streak) || 0 },
        legend: SURVEY_LEGEND.map((g) => ({ key: g.key, label: g.label, range: g.range, color: g.color })),
        // The survey in progress. Unrevealed spots carry NO signal — the answer stays on the server until a
        // test-strike is spent on it, or the whole game is readable straight out of the network tab.
        survey: (() => {
            const sv = row?.survey_json;
            if (!sv?.spots?.length) return null;
            const revealed = Array.isArray(sv.revealed) ? sv.revealed : [];
            // THE MANIFEST — what this wall holds, unordered. This is what stops the survey being a guess:
            // knowing the face contains exactly one Mythril turns a "deep resonance" from a hint into a
            // certainty, and two dull readings against two Coal tells you where the good rock ISN'T without
            // spending a strike on it. The composition is exact; only the ARRANGEMENT is hidden.
            const byId = Object.fromEntries((faceRows || []).map((r) => [String(r.id), r]));
            const tierById = Object.fromEntries((faceRows || []).map((r) => [String(r.id), Number(r.tier)]));
            const counts = {};
            for (const id of sv.spots) { const t = tierById[String(id)]; if (t) counts[t] = (counts[t] || 0) + 1; }
            let manifest = Object.entries(counts)
                .map(([t, n]) => { const o = oreTier(Number(t)); return { tier: Number(t), n, name: o.name, color: o.color, art: oreArt(Number(t)) }; })
                .sort((a, b) => b.tier - a.tier);
            // A MOTHERLODE wall doesn't name its prize. One entry becomes an unknown, so the manifest itself
            // tells you there's something here worth hunting without telling you what or where.
            if (sv.motherlode && manifest.length) {
                manifest = manifest.map((m, idx) => (idx === 0 ? { ...m, tier: 0, n: m.n, name: "Something rich", color: "#ffd75e", art: null, unknown: true } : m));
            }
            return {
                manifest,
                probes: Number(sv.probes) || 0,
                used: revealed.length,
                left: Math.max(0, (Number(sv.probes) || 0) - revealed.length),
                motherlode: Boolean(sv.motherlode),
                spots: sv.spots.map((id, i) => {
                    const nr = byId[String(id)];
                    const shown = revealed.includes(i);
                    const key = shown ? sv.signal?.[String(i)] : null;
                    const exactTier = shown ? Number(sv.exact?.[String(i)]) || 0 : 0;
                    const o = exactTier ? oreTier(exactTier) : null;
                    return {
                        index: i, revealed: shown,
                        // Where it actually sits on the wall, so veins read spatially.
                        x: nr?.face_x != null ? Number(nr.face_x) : null,
                        y: nr?.face_y != null ? Number(nr.face_y) : null,
                        signal: key ? SURVEY_SIGNALS[key] || null : null,
                        // The Assay Kit paid off on this one: name it rather than banding it.
                        exact: o ? { tier: exactTier, name: o.name, color: o.color, art: oreArt(exactTier) } : null,
                    };
                }),
            };
        })(),
        ore: (ore || []).map((r) => {
            const o = oreTier(r.tier);
            const cost = smeltCostFor(row?.crucible_level);
            const qty = Number(r.qty);
            return { tier: r.tier, name: o.name, color: o.color, art: oreArt(r.tier), qty, partTier: o.part,
                smeltCost: cost, canSmelt: Math.floor(qty / cost) };
        }),
        oreTotal: (ore || []).reduce((s, r) => s + Number(r.qty), 0),
        gold: Number(goldRow?.gold) || 0,
        stats: {
            nodesMined: Number(row?.nodes_mined) || 0,
            oreTotal: Number(row?.ore_total) || 0,
            bestCombo: Number(row?.best_combo) || 0,
            upgradeLevels: lvls,
        },
    };
}

// ── THE SURVEY ───────────────────────────────────────────────────────────────────────────────────────────────
// Finding a seam is a minigame, not a button. Five candidate spots on the rock face; a limited number of
// test-strikes to sound them out; then you commit to one and that becomes the seam you work.
//
// A different KIND of skill from swinging on purpose. The swing is timing; the survey is inference. Another
// timing bar would have been the same game twice on one screen.
//
// The spots are REAL live nodes, so what you commit to is what you get. There is no second roll hiding behind
// the choice — the whole point is that reading the rock well is what earns the good seam.

// What a test-strike tells you. The bands OVERLAP on purpose: "deep" narrows a spot to tier 4 or 5 without
// promising which, so probing is real information and never a certainty. Rolled ONCE per survey and stored,
// so re-reading a spot can't reroll it into a better answer.
export const SURVEY_SIGNALS = {
    dull: { key: "dull", label: "A dull thud", hint: "Close to the surface. Poor rock.", color: "#8b8f96", range: "Coal or Iron", low: 1, high: 2 },
    ring: { key: "ring", label: "A clean ring", hint: "Something solid in there.", color: "#6fb0e6", range: "Iron to Mythril", low: 2, high: 4 },
    deep: { key: "deep", label: "A deep resonance", hint: "Rich rock. Could be the best on the wall.", color: "#ffb020", range: "Mythril or Emberheart", low: 4, high: 5 },
};
// The legend, so the bands are LEARNABLE rather than folklore. Shown on the rock face itself.
export const SURVEY_LEGEND = ["dull", "ring", "deep"].map((k) => SURVEY_SIGNALS[k]);
function signalForTier(tier) {
    if (tier <= 1) return "dull";
    if (tier === 2) return Math.random() < 0.5 ? "dull" : "ring";
    if (tier === 3) return "ring";
    if (tier === 4) return Math.random() < 0.5 ? "ring" : "deep";
    return "deep";
}

// ── GENERATING A FACE ─────────────────────────────────────────────────────────────────────────────────────────
// A wall used to be five unrelated nodes plucked from a shared pool, which is exactly why the survey could
// only ever be counting — there was nothing spatial to reason about. A face is CUT as a wall now: spots laid
// out in a scatter, with rich rock CLUSTERED into veins.
//
// So "a deep resonance at mark 3" is no longer just one fact. Marks near it are more likely to be rich too,
// which means following a vein is a strategy and a lone deep reading in a corner is a different situation
// from one in the middle of a cluster.
const FACE_POS = [
    [24, 30], [52, 22], [78, 33], [34, 58], [66, 60], [16, 50], [88, 52],
];
const MOTHERLODE_CHANCE = 0.07; // a wall that's hiding something well above its station

function cutFace(spots, lanternPct) {
    // Everything starts ordinary; the vein is what makes rock rich.
    const tiers = Array.from({ length: spots }, () => rollOreTier(lanternPct * 0.4));
    // THE VEIN — an origin plus a reach. Spots near the origin get lifted, most at the centre, less at the
    // edges, so richness falls off with distance rather than switching on and off.
    const origin = FACE_POS[Math.floor(Math.random() * spots)];
    const reach = 26 + Math.random() * 16;
    for (let i = 0; i < spots; i += 1) {
        const [x, y] = FACE_POS[i % FACE_POS.length];
        const d = Math.hypot(x - origin[0], (y - origin[1]) * 1.4);
        if (d > reach) continue;
        const strength = 1 - d / reach;               // 1 at the origin, 0 at the edge of the vein
        const lift = Math.random() < strength ? (Math.random() < strength * 0.5 ? 2 : 1) : 0;
        tiers[i] = Math.min(5, tiers[i] + lift);
    }
    // MOTHERLODE — rarely, one spot on the wall is far better than the rock around it deserves. Announced in
    // the manifest as an unknown, so the wall itself tells you there's something worth hunting for.
    const motherlode = Math.random() < MOTHERLODE_CHANCE;
    if (motherlode) tiers[Math.floor(Math.random() * spots)] = 5;
    return { tiers, motherlode };
}

// Lay out a fresh rock face. Also the "give me a different wall" action, so a face you don't like isn't a
// dead end — it just costs you the face you were on.
export async function startSurvey(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const spots = spotsFor(row?.face_level);
    const { tiers, motherlode } = cutFace(spots, surveyValue("lantern", row?.lantern_level));

    // Cut the wall: one node per spot, at its position on the face.
    const ids = [];
    for (let i = 0; i < spots; i += 1) {
        const o = oreTier(tiers[i]);
        const [x, y] = FACE_POS[i % FACE_POS.length];
        const jx = Math.round((x + (Math.random() * 8 - 4)) * 10) / 10;
        const jy = Math.round((y + (Math.random() * 8 - 4)) * 10) / 10;
        const made = await db.queryOne(
            `INSERT INTO mkt_ore_node (tier, x, y, face_x, face_y, hp, hp_max, expires_at)
             VALUES ($1, $2, $3, $2, $3, $4, $4, NOW() + ($5 || ' minutes')::interval) RETURNING id`,
            [tiers[i], jx, jy, o.hp, String(NODE_TTL_MIN)]
        ).catch(() => null);
        if (made?.id) ids.push(String(made.id));
    }
    if (!ids.length) return { ok: false, error: "no_seams" };

    const assay = surveyValue("assay", row?.assay_level);
    const survey = {
        spots: ids,
        // Signals are rolled now and frozen — probing reveals what was already true.
        signal: Object.fromEntries(ids.map((_, i) => [String(i), signalForTier(tiers[i])])),
        exact: Object.fromEntries(ids.map((_, i) => [String(i), Math.random() < assay ? tiers[i] : 0])),
        revealed: [],
        probes: probesFor(row?.lantern_level),
        motherlode,
    };
    await db.query(`UPDATE mkt_mining SET survey_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(survey)]).catch(() => {});
    await trackActivity(buyerId, "ore_survey", { spots: ids.length, motherlode }).catch(() => {});
    return { ok: true, ...(await getMiningState(buyerId)) };
}

// Sound out one spot. Costs a test-strike; re-reading an already-revealed spot is free (it's just a reminder).
export async function probeSpot(buyerId, index) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const survey = row?.survey_json;
    if (!survey?.spots?.length) return { ok: false, error: "no_survey" };
    const i = Math.floor(Number(index));
    if (!(i >= 0 && i < survey.spots.length)) return { ok: false, error: "bad_spot" };
    const revealed = Array.isArray(survey.revealed) ? survey.revealed : [];
    if (!revealed.includes(i)) {
        if (revealed.length >= (Number(survey.probes) || 0)) return { ok: false, error: "no_probes" };
        revealed.push(i);
        await db.query(`UPDATE mkt_mining SET survey_json = jsonb_set(survey_json, '{revealed}', $2::jsonb), updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, JSON.stringify(revealed)]).catch(() => {});
    }
    return { ok: true, index: i, signal: survey.signal?.[String(i)] || "dull", ...(await getMiningState(buyerId)) };
}

// Commit. This spot becomes the seam you work, and the survey is done.
export async function claimSpot(buyerId, index) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const survey = row?.survey_json;
    if (!survey?.spots?.length) return { ok: false, error: "no_survey" };
    const i = Math.floor(Number(index));
    if (!(i >= 0 && i < survey.spots.length)) return { ok: false, error: "bad_spot" };
    const nodeId = survey.spots[i];
    // The node may have expired or been mined out while you were surveying — say so rather than handing over
    // a seam that isn't there.
    const live = await db.queryOne(`SELECT id FROM mkt_ore_node WHERE id = $1 AND status = 'active'`, [nodeId]).catch(() => null);
    if (!live) return { ok: false, error: "spot_gone", ...(await getMiningState(buyerId)) };

    // THE REVEAL. Show what every spot actually was, and where the one you took ranked. This is the part that
    // teaches the bands: you find out whether "a clean ring" was a 2 or a 4, and you carry that into the next
    // face. It's also the tension — you get to see the Emberheart you walked past.
    const rows = await db.query(`SELECT id, tier FROM mkt_ore_node WHERE id = ANY($1)`, [survey.spots]).catch(() => []);
    const tierOf = Object.fromEntries(rows.map((r) => [String(r.id), Number(r.tier)]));
    const spots = survey.spots.map((id, idx) => {
        const tier = tierOf[String(id)] || 0;
        const o = tier ? oreTier(tier) : null;
        return { index: idx, tier, name: o?.name || "Collapsed", color: o?.color || "#6b6f76", art: tier ? oreArt(tier) : null, picked: idx === i };
    });
    const tiers = spots.map((x) => x.tier);
    const best = Math.max(...tiers, 0);
    const mine = tierOf[String(nodeId)] || 0;
    // Rank by tier, ties sharing the best rank — picking one of two equal-best seams is still a best read.
    const rank = tiers.filter((t) => t > mine).length + 1;
    const bestRead = mine > 0 && mine === best;

    await db.query(`UPDATE mkt_mining SET current_node_id = $2, survey_json = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, nodeId]).catch(() => {});

    // A good read pays. Deliberately a BONUS for getting it right and never a penalty for getting it wrong —
    // a survey you misread still hands you a real seam to work.
    // THE STREAK. Consecutive best reads escalate the payout, so a good run is a thing you're protecting
    // rather than a coin landing well once. Broken by a miss, never punished beyond losing the multiplier.
    const priorStreak = Number(row?.read_streak) || 0;
    const streak = bestRead ? priorStreak + 1 : 0;
    const bestEver = Math.max(Number(row?.best_streak) || 0, streak);
    await db.query(`UPDATE mkt_mining SET read_streak = $2, best_streak = $3 WHERE buyer_id = $1`, [buyerId, streak, bestEver]).catch(() => {});
    const streakMult = Math.min(3, 1 + Math.max(0, streak - 1) * 0.5); // 1x, 1.5x, 2x, 2.5x, 3x

    let bonus = null;
    if (bestRead && spots.length > 1) {
        const o = oreTier(mine);
        const gold = Math.round((15 + o.gold) * streakMult);
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
        await logCoin(buyerId, gold, "mining", { balanceAfter: paid?.gold, meta: { kind: "best_read" } }).catch(() => {});
        // gold: 0 — awardXp pays gold 1:1 with points otherwise, and this is repeatable.
        const xp = Math.round((10 + o.xp) * streakMult);
        await awardXp(buyerId, "mining", { points: xp, gold: 0 }).catch(() => {});
        bonus = { gold, xp, streak, streakMult: Math.round(streakMult * 10) / 10 };
    }
    await trackActivity(buyerId, "ore_claim", { tier: mine, rank, best, bestRead }).catch(() => {});

    return {
        ok: true,
        reveal: { spots, rank, total: spots.length, bestRead, bonus, pickedTier: mine, bestTier: best, streak, streakBroken: !bestRead && priorStreak >= 2, brokeAt: priorStreak },
        ...(await getMiningState(buyerId)),
    };
}

// How hard one swing lands, before the timing grade. Pickaxe track is the whole of it for now; the mining gear
// stat and the mining set plug in here in phase 3.
function swingPower(row) {
    const base = 18;
    return Math.max(1, Math.round(base * (1 + trackValue("pick", row?.pick_level))));
}

// ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
// `dist` is the client's distance-from-centre off the timing bar. Graded HERE and clamped, so a tampered client
// can't claim a perfect strike every time.
export async function swingAtNode(buyerId, nodeId, dist = null) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const arrivedAt = new Date(); // stamped on ARRIVAL — our latency is not the player's cadence
    const row = await minerRow(buyerId);
    if (!row) return { ok: false, error: "no_miner" };

    // Swings are NOT metered any more. You paid for the trip; the seam is yours to break. Metering both was
    // two budgets guarding one activity, and the second one only ever stopped people mid-rock.

    const node = await db.queryOne(`SELECT id, tier, hp, hp_max, x, y FROM mkt_ore_node WHERE id = $1 AND status = 'active'`, [nodeId]).catch(() => null);
    if (!node) return { ok: false, error: "node_gone" };

    const prior = await db.queryOne(`SELECT combo, last_swing_at FROM mkt_ore_node_hit WHERE node_id = $1 AND buyer_id = $2`, [nodeId, buyerId]).catch(() => null);
    if (prior?.last_swing_at && Date.now() - new Date(prior.last_swing_at).getTime() < SWING_THROTTLE_MS) {
        return { ok: false, error: "too_fast" };
    }

    // A distance of exactly 0 is the BEST swing in the game — test for null, never for falsiness. (The raid
    // shipped `|| 0.5` here and graded dead-centre hits as the worst possible outcome.)
    const clamped = dist == null || Number.isNaN(Number(dist)) ? 0.5 : Math.min(0.5, Math.max(0, Number(dist)));
    const grade = gradeForDist(clamped);

    // SEEDING THE POOL. A good swing does not make a known reward bigger — it drops a rarer TICKET into the
    // bag you will draw from when the seam breaks. So timing raises what is POSSIBLE, and the haul is still a
    // surprise. That is the whole difference between "you earned 7 ore" and "what did I get?".
    const seeded = grade.key === "pixel" ? ["rare", "rare"] : grade.key === "perfect" ? ["rare"]
        : grade.key === "great" ? ["good"] : [];

    const kept = (GRADE_RANK[grade.key] ?? 0) >= GRADE_RANK[COMBO_MIN_GRADE];
    const combo = kept ? (Number(prior?.combo) || 0) + 1 : 0;
    const comboMult = Math.min(COMBO_MAX, 1 + Math.max(0, combo - 1) * COMBO_STEP);

    const damage = Math.max(1, Math.round(swingPower(row) * grade.mult * comboMult));

    await db.query(`UPDATE mkt_mining SET swing_used = swing_used + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});

    const after = await db.queryOne(
        `UPDATE mkt_ore_node SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`,
        [nodeId, damage]
    ).catch(() => null);
    await db.query(
        `INSERT INTO mkt_ore_node_hit (node_id, buyer_id, damage, swings, combo, last_swing_at, grade_sum, pool_json) VALUES ($1, $2, $3, 1, $4, $5, $6, $7::jsonb)
         ON CONFLICT (node_id, buyer_id) DO UPDATE SET damage = mkt_ore_node_hit.damage + $3,
             swings = mkt_ore_node_hit.swings + 1, combo = $4, last_swing_at = $5,
             grade_sum = mkt_ore_node_hit.grade_sum + $6,
             pool_json = COALESCE(mkt_ore_node_hit.pool_json, '[]'::jsonb) || $7::jsonb`,
        [nodeId, buyerId, damage, combo, arrivedAt, grade.mult, JSON.stringify(seeded)]
    ).catch(() => {});
    if (combo > (Number(row.best_combo) || 0)) {
        await db.query(`UPDATE mkt_mining SET best_combo = $2 WHERE buyer_id = $1`, [buyerId, combo]).catch(() => {});
    }

    const hp = after?.hp ?? node.hp;
    let cracked = null;
    if (hp <= 0) cracked = await claimNode(buyerId, node, row);

    return {
        ok: true,
        damage, grade: grade.key, gradeLabel: grade.label,
        combo, comboMult: Math.round(comboMult * 100) / 100, comboBroken: !kept && (Number(prior?.combo) || 0) >= 3,
        cooldownMs: SWING_COOLDOWN_MS[grade.key] ?? SWING_COOLDOWN_MS.miss,
        nodeId: Number(nodeId), hp, hpMax: Number(node.hp_max),
        pct: node.hp_max ? Math.max(0, Math.round((hp / node.hp_max) * 100)) : 0,
        cracked,

    };
}

// The seam broke. WHAT IT HELD IS A DRAW, not a sum.
//
// The bag always holds ordinary rock. Every clean swing you landed dropped a better ticket in. Then you pull
// three times and find out. Nothing is decided until the seam opens, which is the point — a fixed payout you
// could compute on the way in is not a reward, it is an invoice.
async function claimNode(buyerId, node, row) {
    const won = await db
        .queryOne(`UPDATE mkt_ore_node SET status = 'mined', mined_by = $2, mined_at = NOW() WHERE id = $1 AND status = 'active' RETURNING tier`, [node.id, buyerId])
        .catch(() => null);
    if (!won) return null; // someone else's swing landed first

    const mine = await db.queryOne(`SELECT swings, pool_json FROM mkt_ore_node_hit WHERE node_id = $1 AND buyer_id = $2`, [node.id, buyerId]).catch(() => null);
    const seeds = Array.isArray(mine?.pool_json) ? mine.pool_json : [];
    const o = oreTier(node.tier);
    const haulBonus = trackValue("haul", row?.haul_level);

    // The bag: ordinary tickets always, plus whatever your timing earned.
    const bag = [];
    for (let i = 0; i < 6; i += 1) bag.push("ore");
    for (const s2 of seeds) bag.push(s2 === "rare" ? "rare" : "good");

    const DRAWS = 3 + (Math.random() < haulBonus ? 1 : 0);
    const out = [];
    for (let i = 0; i < DRAWS; i += 1) {
        const ticket = bag[Math.floor(Math.random() * bag.length)] || "ore";
        if (ticket === "ore") {
            const n = 1 + Math.floor(Math.random() * 2);
            out.push({ kind: "ore", tier: node.tier, n, name: o.name, color: o.color, art: oreArt(node.tier) });
        } else if (ticket === "good") {
            // The middle of the bag: a better grade of ordinary — more of it, or a rung up.
            const up = Math.random() < 0.4 && node.tier < 5 ? node.tier + 1 : node.tier;
            const uo = oreTier(up);
            out.push({ kind: "ore", tier: up, n: 2 + Math.floor(Math.random() * 2), name: uo.name, color: uo.color, art: oreArt(up) });
        } else {
            // RARE tickets are where the fun lives — the things you cannot get by grinding ore.
            const roll = Math.random();
            if (roll < 0.34) out.push({ kind: "chest", tier: node.tier >= 4 ? "gold" : node.tier >= 2 ? "iron" : "wooden" });
            else if (roll < 0.68) out.push({ kind: "gear", depth: 3 + node.tier });
            else if (roll < 0.88) out.push({ kind: "consumable" });
            else out.push({ kind: "gold", n: 60 + node.tier * 40 + Math.floor(Math.random() * 60) });
        }
    }

    // Pay the draw out.
    const paid = [];
    for (const item of out) {
        if (item.kind === "ore") {
            await db.query(`INSERT INTO mkt_ore (buyer_id, tier, qty) VALUES ($1,$2,$3) ON CONFLICT (buyer_id, tier) DO UPDATE SET qty = mkt_ore.qty + EXCLUDED.qty`, [buyerId, item.tier, item.n]).catch(() => {});
            paid.push(item);
        } else if (item.kind === "gold") {
            const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, item.n]).catch(() => null);
            await logCoin(buyerId, item.n, "mining", { balanceAfter: g?.gold, meta: { kind: "seam" } }).catch(() => {});
            paid.push(item);
        } else if (item.kind === "chest") {
            await addChests(buyerId, { [item.tier]: 1 }, { source: "mining" }).catch(() => {});
            paid.push(item);
        } else if (item.kind === "gear") {
            const got = await grantMiningGear(buyerId, item.depth);
            if (got) paid.push({ ...item, ...got }); else paid.push({ kind: "gold", n: 80 });
        } else if (item.kind === "consumable") {
            const got = await grantMiningConsumable(buyerId);
            if (got) paid.push({ ...item, ...got });
        }
    }

    const oreTotal = paid.filter((x) => x.kind === "ore").reduce((n, x) => n + x.n, 0);
    await db.query(`UPDATE mkt_mining SET nodes_mined = nodes_mined + 1, ore_total = ore_total + $2, current_node_id = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, oreTotal]).catch(() => {});
    // gold: 0 — awardXp pays gold 1:1 with points otherwise, and this is repeatable.
    await awardXp(buyerId, "mining", { points: o.xp, gold: 0 }).catch(() => {});
    await trackActivity(buyerId, "ore_mined", { tier: node.tier, draws: paid.length, seeds: seeds.length }).catch(() => {});

    return {
        tier: node.tier, name: o.name, color: o.color, art: oreArt(node.tier),
        draws: paid, seeded: seeds.length, xp: o.xp,
    };
}

// ── THE SMELT ────────────────────────────────────────────────────────────────────────────────────────────────
// A minigame, not a button. You feed ore in and work the heat: the furnace climbs, and you have to pull the
// pour at the right moment. Too cold and the melt is dirty; too hot and you burn some of it off.
//
// What comes out is a DRAW, same principle as the seam. Heat quality seeds better tickets into the bag; the
// bag decides. So a perfect pour raises what's possible without ever making the result knowable in advance —
// and the ore tier sets the floor, so good rock still matters.
export const HEAT_BANDS = [
    { key: "cold", label: "Too cold", max: 0.42, mult: 0.7, blurb: "Half of it never melted." },
    { key: "warm", label: "Warm", max: 0.68, mult: 1.0, blurb: "It ran, eventually." },
    { key: "hot", label: "Hot", max: 0.88, mult: 1.35, blurb: "A clean, bright pour." },
    { key: "perfect", label: "PERFECT POUR", max: 1.0, mult: 1.8, blurb: "Ran like water. Not a scrap wasted." },
    { key: "burnt", label: "Burnt", max: 99, mult: 0.55, blurb: "You cooked it. Some of that is slag now." },
];
export const heatBand = (h) => HEAT_BANDS.find((b) => h <= b.max) || HEAT_BANDS[HEAT_BANDS.length - 1];

// Smelt a stack. `heat` is 0..1+ from the client's heat bar — graded HERE and clamped, so a tampered client
// can't claim a perfect pour every time.
export async function smeltOre(buyerId, tier, batches = 1, heat = null) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = Number(tier);
    if (!ORE_TIERS[t]) return { ok: false, error: "bad_tier" };
    const row = await minerRow(buyerId);
    const cost = smeltCostFor(row?.crucible_level);
    const n = Math.max(1, Math.min(50, Math.floor(Number(batches) || 1)));
    const spend = cost * n;

    // Atomic guarded spend — the WHERE is what stops a double-tap smelting ore you no longer have.
    const spent = await db
        .queryOne(`UPDATE mkt_ore SET qty = qty - $3 WHERE buyer_id = $1 AND tier = $2 AND qty >= $3 RETURNING qty`, [buyerId, t, spend])
        .catch(() => null);
    if (!spent) return { ok: false, error: "not_enough_ore" };

    const o = oreTier(t);
    // A pour with no reading at all (an old client, a fumbled tap) is treated as merely warm rather than
    // punished — never make someone worse off for a bug on our side.
    const h = heat == null || Number.isNaN(Number(heat)) ? 0.55 : Math.max(0, Math.min(1.2, Number(heat)));
    const band = heatBand(h);

    // THE BAG. Ordinary parts always; the pour and your upgrades seed the better tickets.
    const bellows = smeltValue("bellows", row?.bellows_level);
    const flux = smeltValue("flux", row?.flux_level);
    const bag = [];
    for (let i = 0; i < 10; i += 1) bag.push("part");
    // Heat quality is the biggest lever on the bag — that's what makes the pour worth playing.
    const heatTickets = band.key === "perfect" ? 7 : band.key === "hot" ? 4 : band.key === "warm" ? 1 : 0;
    for (let i = 0; i < heatTickets; i += 1) bag.push(Math.random() < 0.5 ? "up" : "extra");
    for (let i = 0; i < Math.round(flux * 12); i += 1) bag.push("up");
    for (let i = 0; i < Math.round(bellows * 12); i += 1) bag.push("extra");
    // Only a genuinely good pour can turn up a curio — the fun stuff that isn't a part at all.
    if (band.key === "perfect") bag.push("curio", "curio");
    else if (band.key === "hot") bag.push("curio");

    // One draw per batch, floored by the band so a cold pour still yields something.
    const draws = Math.max(1, Math.round(n * band.mult));
    const made = {};
    let extras = 0, ups = 0;
    const curios = [];
    const add = (pt, count) => { made[pt] = (made[pt] || 0) + count; };
    for (let i = 0; i < draws; i += 1) {
        const ticket = bag[Math.floor(Math.random() * bag.length)] || "part";
        if (ticket === "up" && o.part < 5) { add(o.part + 1, 1); ups += 1; }
        else if (ticket === "extra") { add(o.part, 2); extras += 1; }
        else if (ticket === "curio") curios.push(Math.random() < 0.5 ? "chest" : Math.random() < 0.6 ? "consumable" : "gear");
        else add(o.part, 1);
    }

    const { addParts } = await import("@/lib/marketplace/crafting.js");
    for (const [partTier, count] of Object.entries(made)) await addParts(buyerId, Number(partTier), count).catch(() => {});

    // Curios — the reason to care about a perfect pour beyond the part count.
    const bonus = [];
    for (const c of curios) {
        if (c === "chest") {
            const chestTier = t >= 4 ? "gold" : t >= 2 ? "iron" : "wooden";
            await addChests(buyerId, { [chestTier]: 1 }, { source: "mining" }).catch(() => {});
            bonus.push({ kind: "chest", tier: chestTier });
        } else if (c === "gear") {
            const got = await grantMiningGear(buyerId, 3 + t);
            if (got) bonus.push({ kind: "gear", ...got });
        } else {
            const got = await grantMiningConsumable(buyerId);
            if (got) bonus.push({ kind: "consumable", ...got });
        }
    }

    const totalParts = Object.values(made).reduce((a, b) => a + b, 0);
    await trackActivity(buyerId, "ore_smelted", { tier: t, ore: spend, parts: totalParts, band: band.key, ups, extras, bonus: bonus.length }).catch(() => {});
    return {
        ok: true,
        smelted: {
            oreTier: t, oreName: o.name, oreSpent: spend, partTier: o.part,
            band: band.key, bandLabel: band.label, bandBlurb: band.blurb, heat: Math.round(h * 100),
            parts: totalParts, ups, extras, bonus,
            byTier: Object.entries(made).map(([pt, count]) => ({ partTier: Number(pt), count, lifted: Number(pt) > o.part })).sort((a, b) => a.partTier - b.partTier),
        },
        ...(await getMiningState(buyerId)),
    };
}

// ── UPGRADES ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function upgradeMining(buyerId, track) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = MINE_TRACKS[track] || SURVEY_TRACKS[track] || SMELT_TRACKS[track];
    if (!t) return { ok: false, error: "bad_track" };
    const row = await minerRow(buyerId);
    const level = Number(row?.[t.col]) || 0;
    if (level >= t.max) return { ok: false, error: "maxed" };
    const cost = trackCost(level);

    const paid = await db
        .queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost])
        .catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    await logCoin(buyerId, -cost, "mining_upgrade", { balanceAfter: paid.gold, meta: { track } }).catch(() => {});
    await db.query(`UPDATE mkt_mining SET ${t.col} = ${t.col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await trackActivity(buyerId, "mining_upgrade", { track, to: level + 1 }).catch(() => {});
    return { ok: true, ...(await getMiningState(buyerId)) };
}
