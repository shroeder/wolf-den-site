import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { SEEDS } from "@/lib/marketplace/farm-crops.js";
import { FISH } from "@/lib/marketplace/fishing.js";

// ═══ THE KITCHEN ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Farming and fishing already pay you — that stays, it reads as selling the surplus and the economy is balanced
// on it. What's new is that you also KEEP the crop and the catch, and those are the ingredients here.
//
// A recipe is LEARNED, never listed. They turn up wherever anything else turns up: chests, digs, raids, the
// merchant, the odd harvest. A recipe has a TIER, and the tier picks which pool the dish is rolled from — so a
// recipe you already know is still worth cooking, because you don't know what you're getting.
//
// The upgrade tracks are the same shape as the boat and the rail: four of them, five levels each, priced on a
// square curve, each doing one legible thing.

export const COOK_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

export const MAX_TRACK = 5;
export const COOKS_PER_DAY = 5;

export const COOK_TRACKS = {
    heat:   { max: MAX_TRACK, per: 0.06, cap: 0.30, kind: "pct",   name: "Heat",      icon: "🔥", desc: "Chance the dish comes out one tier better than the recipe." },
    season: { max: MAX_TRACK, per: 0.08, cap: 0.40, kind: "pct",   name: "Seasoning", icon: "🧂", desc: "Chance of a second helping — the same dish, twice." },
    batch:  { max: MAX_TRACK, per: 1,    cap: 5,    kind: "count", name: "Big Pot",   icon: "🍲", desc: "Extra cooks each day." },
    larder: { max: MAX_TRACK, per: 0.07, cap: 0.35, kind: "pct",   name: "Larder",    icon: "🧺", desc: "Chance a cook doesn't use up its ingredients at all." },
};
export const TRACK_COL = { heat: "heat_level", season: "season_level", batch: "batch_level", larder: "larder_level" };
export const trackValue = (t, lvl) => Math.min(COOK_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * COOK_TRACKS[t].per);
export const trackCost = (lvl) => 400 * (Number(lvl) + 1) * (Number(lvl) + 1);

// ── DISH TIERS ───────────────────────────────────────────────────────────────────────────────────────────────
// Each tier is a POOL of existing consumables. Cooking rolls one at random. Reusing the consumable catalogue
// rather than inventing a parallel one means every dish already works everywhere — the stash, the use flow,
// the pet-feeding, the boss buffs — on day one.
export const TIERS = [
    { tier: 1, name: "Simple",    color: "#cfd8e3", pool: ["treat_bone", "farm_pet_whistle", "farm_kindness_token", "scroll_wisdom", "farm_growth_tonic"] },
    { tier: 2, name: "Hearty",    color: "#7ec8ff", pool: ["treat_snack", "pot_adrenaline", "stone_storm", "sail_tailwind_charm", "sail_prospectors_charm"] },
    { tier: 3, name: "Fine",      color: "#c9a2ff", pool: ["treat_toy", "pot_secondwind", "stone_ember", "farm_harvest_charm", "sail_raiding_horn", "spin_lucky_coin"] },
    { tier: 4, name: "Exquisite", color: "#ffd75e", pool: ["treat_feast", "pot_berserker", "scroll_ancient", "farm_fertilizer_crate", "sail_treasure_map", "spin_golden_ticket"] },
    { tier: 5, name: "Legendary", color: "#ff9ec4", pool: ["treat_golden", "treat_kibble", "pot_fury", "treat_ambrosia", "sail_kraken_bait", "farm_fertilizer_haul"] },
];
export const tierMeta = (t) => TIERS[Math.max(0, Math.min(TIERS.length - 1, (Number(t) || 1) - 1))];

// ── RECIPES ──────────────────────────────────────────────────────────────────────────────────────────────────
// `need` is { crop|fish ref → qty }. Kept deliberately readable: a recipe should look like food, not a formula.
const R = (id, name, emoji, tier, need, flavor) => ({ id, name, emoji, tier, need, flavor });
export const RECIPES = [
    // T1 — everyday stuff you can make from the common rows.
    R("r_porridge",   "Morning Porridge",   "🥣", 1, { wheat: 2 },                          "What the pack eats before a long day."),
    R("r_roast_roots","Roasted Roots",      "🥕", 1, { carrot: 2, potato: 1 },              "Sweet, charred at the edges."),
    R("r_mash",       "Buttered Mash",      "🥔", 1, { potato: 3 },                         "Comfort, in a bowl."),
    R("r_flatbread",  "Camp Flatbread",     "🫓", 1, { wheat: 3 },                          "Cooked on a stone by the fire."),
    // T2 — a rare crop, or the sea.
    R("r_fish_stew",  "Fisherman's Stew",   "🍲", 2, { fish_sardine: 2, potato: 1 },        "Everything that didn't sell, in one pot."),
    R("r_berry_tart", "Berry Tart",         "🥧", 2, { strawberry: 2, wheat: 2 },           "Worth burning your mouth for."),
    R("r_corn_chowder","Corn Chowder",      "🥘", 2, { corn: 2, potato: 2 },                "Thick enough to stand a spoon in."),
    R("r_grilled_perch","Grilled Perch",    "🐟", 2, { fish_perch: 2, wheat: 1 },           "Salt, fire, nothing else."),
    // T3 — proper cooking.
    R("r_harvest_pie","Harvest Pie",        "🥧", 3, { pumpkin: 2, wheat: 2, carrot: 1 },   "The whole field, baked."),
    R("r_crab_boil",  "Crab Boil",          "🦀", 3, { fish_crab: 3, corn: 1, potato: 1 },  "Eaten with your hands, at a long table."),
    R("r_grape_glaze","Glazed Roast",       "🍇", 3, { grape: 3, potato: 2 },               "Sticky, dark and slightly boozy."),
    R("r_squid_ink",  "Squid Ink Supper",   "🦑", 3, { fish_squid: 2, wheat: 2 },           "Black as a moonless tide."),
    // T4 — a feast dish. Needs something rare AND something from the water.
    R("r_lobster",    "Buttered Lobster",   "🦞", 4, { fish_lobster: 2, wheat: 2, grape: 1 }, "The reason people row out in bad weather."),
    R("r_gold_pie",   "Golden Apple Pie",   "🍎", 4, { goldenapple: 2, wheat: 3 },          "They say it's good for the heart."),
    R("r_surf_turf",  "Surf and Turf",      "🍖", 4, { fish_octopus: 1, pumpkin: 2, corn: 2 }, "Two whole days of work on one plate."),
    // T5 — the ones you save for.
    R("r_starfruit",  "Starfruit Ambrosia", "🌟", 5, { starfruit: 2, goldenapple: 1, grape: 2 }, "Sweet enough that pets forget themselves."),
    R("r_leviathan",  "Leviathan Roast",    "🐋", 5, { fish_manta: 1, starfruit: 1, pumpkin: 2 }, "It took four of you to carry it in."),
    R("r_stormpot",   "Storm Pot",          "⚡", 5, { fish_stormpike: 1, fish_swordfish: 1, corn: 3 }, "It crackles. Nobody is sure why."),
];
export const recipeById = (id) => RECIPES.find((r) => r.id === id) || null;

// Where a recipe can drop from. Weighted by tier so the good ones stay rare.
const DROP_WEIGHT = { 1: 40, 2: 28, 3: 18, 4: 10, 5: 4 };

/** Roll a recipe the member doesn't know yet. Returns the recipe, or null when they know them all. */
export function rollRecipe(known = []) {
    const have = new Set(known);
    const pool = RECIPES.filter((r) => !have.has(r.id));
    if (!pool.length) return null;
    const total = pool.reduce((s, r) => s + (DROP_WEIGHT[r.tier] || 1), 0);
    let n = Math.random() * total;
    for (const r of pool) { n -= DROP_WEIGHT[r.tier] || 1; if (n <= 0) return r; }
    return pool[pool.length - 1];
}

// ── INGREDIENTS ──────────────────────────────────────────────────────────────────────────────────────────────
const cropMeta = (ref) => SEEDS[ref] || null;
const fishMeta = (ref) => FISH.find((f) => f.id === ref) || null;
export function ingredientMeta(ref) {
    const c = cropMeta(ref);
    if (c) return { ref, kind: "crop", name: c.name, emoji: c.emoji, rarity: c.rarity };
    const f = fishMeta(ref);
    if (f) return { ref, kind: "fish", name: f.name, emoji: f.emoji, rarity: f.rarity };
    return { ref, kind: "crop", name: ref, emoji: "❔", rarity: "common" };
}

/** Add to the pantry. Called by the farm on harvest and by fishing on a landing. Best-effort, never throws. */
export async function addToPantry(buyerId, kind, ref, qty = 1) {
    if (!buyerId || !ref || qty <= 0) return;
    await db.query(
        `INSERT INTO mkt_pantry (buyer_id, kind, ref, qty) VALUES ($1, $2, $3, $4)
         ON CONFLICT (buyer_id, kind, ref) DO UPDATE SET qty = mkt_pantry.qty + EXCLUDED.qty`,
        [buyerId, kind, ref, Math.round(qty)]
    ).catch(() => {});
}

/** Teach a recipe. Returns the recipe when it was NEW to them, else null — so callers can announce it. */
export async function learnRecipe(buyerId, recipeId = null) {
    if (!buyerId) return null;
    const knownRows = await db.query(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const known = knownRows.map((r) => r.recipe_id);
    const rec = recipeId ? recipeById(recipeId) : rollRecipe(known);
    if (!rec || known.includes(rec.id)) return null;
    const ins = await db.queryOne(
        `INSERT INTO mkt_recipe_known (buyer_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING recipe_id`,
        [buyerId, rec.id]
    ).catch(() => null);
    if (!ins) return null;
    await trackActivity(buyerId, "recipe_learned", { recipe: rec.id, tier: rec.tier }).catch(() => {});
    await cookingBadges(buyerId).catch(() => {});
    return rec;
}

// Cooking badges are granted at the moment they're earned rather than through the auto-rule sweep, which is
// how fishing does it: the counters live on mkt_kitchen and mkt_recipe_known, not in getMemberMetrics, and
// duplicating them there just to drive a rule would be two sources of truth for the same number.
async function cookingBadges(buyerId) {
    const row = await db.queryOne(
        `SELECT (SELECT COALESCE(cooks_total,0) FROM mkt_kitchen WHERE buyer_id = $1)::int AS cooks,
                (SELECT COALESCE(best_dish_tier,0) FROM mkt_kitchen WHERE buyer_id = $1)::int AS best,
                (SELECT COUNT(*) FROM mkt_recipe_known WHERE buyer_id = $1)::int AS recipes,
                (SELECT COALESCE(SUM(qty),0) FROM mkt_pantry WHERE buyer_id = $1)::int AS stock`,
        [buyerId]
    ).catch(() => null);
    if (!row) return;
    const g = (slug) => grantEventBadge(buyerId, slug).catch(() => {});
    if (row.cooks >= 1) await g("cook_first");
    if (row.cooks >= 25) await g("cook_apprentice");
    if (row.cooks >= 100) await g("cook_chef");
    if (row.cooks >= 400) await g("cook_master");
    if (row.recipes >= 10) await g("cook_collector");
    if (row.recipes >= RECIPES.length) await g("cook_librarian");
    if (row.best >= 5) await g("cook_legendary");
    if (row.stock >= 100) await g("cook_forager");
}

const today = () => db.queryOne(`SELECT (NOW() AT TIME ZONE 'America/Chicago')::date::text AS d`).then((r) => r?.d);

async function kitchenRow(buyerId) {
    await db.query(`INSERT INTO mkt_kitchen (buyer_id) VALUES ($1) ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    return db.queryOne(
        `SELECT *, (cook_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS cooked_today FROM mkt_kitchen WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

/** Everything the Kitchen screen needs, in one call. */
export async function getKitchenState(buyerId) {
    if (!COOK_UNLOCKED(buyerId)) return { unlocked: false };
    const [row, pantryRows, knownRows, goldRow] = await Promise.all([
        kitchenRow(buyerId),
        db.query(`SELECT kind, ref, qty FROM mkt_pantry WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT recipe_id, times_cooked FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const have = new Map(pantryRows.map((r) => [r.ref, Number(r.qty)]));
    const cookedMap = new Map(knownRows.map((r) => [r.recipe_id, Number(r.times_cooked) || 0]));
    const usedToday = row?.cooked_today ? Number(row.cooks_today) || 0 : 0;
    const maxCooks = COOKS_PER_DAY + trackValue("batch", row?.batch_level);

    const recipes = RECIPES.map((r) => {
        const known = cookedMap.has(r.id);
        const need = Object.entries(r.need).map(([ref, qty]) => {
            const m = ingredientMeta(ref);
            const held = have.get(ref) || 0;
            return { ...m, qty, held, enough: held >= qty };
        });
        return {
            id: r.id, name: r.name, emoji: r.emoji, tier: r.tier, flavor: r.flavor,
            tierName: tierMeta(r.tier).name, tierColor: tierMeta(r.tier).color,
            known, timesCooked: cookedMap.get(r.id) || 0,
            need: known ? need : null,              // an unknown recipe shows as a locked silhouette
            canCook: known && need.every((n) => n.enough),
        };
    }).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

    return {
        unlocked: true,
        gold: Number(goldRow?.gold) || 0,
        level: Math.floor(Math.sqrt((Number(row?.cook_xp) || 0) / 40)) + 1,
        cookXp: Number(row?.cook_xp) || 0,
        cooksTotal: Number(row?.cooks_total) || 0,
        bestTier: Number(row?.best_dish_tier) || 0,
        cooks: { used: usedToday, max: maxCooks, left: Math.max(0, maxCooks - usedToday) },
        pantry: pantryRows
            .map((r) => ({ ...ingredientMeta(r.ref), qty: Number(r.qty) }))
            .sort((a, b) => a.kind.localeCompare(b.kind) || b.qty - a.qty),
        pantryTotal: pantryRows.reduce((s, r) => s + Number(r.qty), 0),
        recipes,
        known: knownRows.length,
        recipeTotal: RECIPES.length,
        tracks: Object.entries(COOK_TRACKS).map(([id, def]) => {
            const level = Number(row?.[TRACK_COL[id]]) || 0;
            return {
                id, name: def.name, icon: def.icon, desc: def.desc, kind: def.kind,
                level, max: def.max, maxed: level >= def.max, cost: trackCost(level),
                valueNow: trackValue(id, level), valueNext: trackValue(id, level + 1), cap: def.cap,
            };
        }),
        isOwner: isOwner(buyerId),
    };
}

/**
 * Cook a dish.
 *
 * Ingredients are taken with a CONDITIONAL update per line — `qty = qty - n WHERE qty >= n` — so a double-tap
 * can't cook twice off one set of ingredients. The daily counter is claimed the same way, before anything is
 * granted, for the same reason.
 */
export async function cookRecipe(buyerId, recipeId) {
    if (!COOK_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const rec = recipeById(recipeId);
    if (!rec) return { ok: false, error: "unknown_recipe" };

    const knownRow = await db.queryOne(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1 AND recipe_id = $2`, [buyerId, recipeId]).catch(() => null);
    if (!knownRow) return { ok: false, error: "not_learned" };

    const row = await kitchenRow(buyerId);
    const maxCooks = COOKS_PER_DAY + trackValue("batch", row?.batch_level);
    const day = await today();
    // Claim the day's slot atomically: reset the counter when the day rolls, otherwise increment under the cap.
    const claimed = await db.queryOne(
        `UPDATE mkt_kitchen
            SET cooks_today = CASE WHEN cook_day IS DISTINCT FROM $2::date THEN 1 ELSE cooks_today + 1 END,
                cook_day = $2::date, updated_at = NOW()
          WHERE buyer_id = $1
            AND (cook_day IS DISTINCT FROM $2::date OR cooks_today < $3)
          RETURNING cooks_today`,
        [buyerId, day, maxCooks]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "out_of_cooks" };

    // The Larder can spare the ingredients entirely — rolled once for the whole dish, not per line, so a cook
    // either costs you everything it should or nothing at all.
    const freeCook = Math.random() < trackValue("larder", row?.larder_level);
    if (!freeCook) {
        const taken = [];
        for (const [ref, qty] of Object.entries(rec.need)) {
            const meta = ingredientMeta(ref);
            const got = await db.queryOne(
                `UPDATE mkt_pantry SET qty = qty - $3 WHERE buyer_id = $1 AND ref = $2 AND qty >= $3 RETURNING qty`,
                [buyerId, ref, qty]
            ).catch(() => null);
            if (!got) {
                // Put back whatever we already took — a half-consumed cook is worse than a failed one.
                for (const t of taken) await addToPantry(buyerId, t.kind, t.ref, t.qty);
                await db.query(`UPDATE mkt_kitchen SET cooks_today = GREATEST(0, cooks_today - 1) WHERE buyer_id = $1`, [buyerId]).catch(() => {});
                return { ok: false, error: "missing_ingredients", missing: meta.name };
            }
            taken.push({ kind: meta.kind, ref, qty });
        }
    }

    // Heat can push the dish a tier above the recipe.
    const bumped = Math.random() < trackValue("heat", row?.heat_level);
    const tier = Math.min(TIERS.length, rec.tier + (bumped ? 1 : 0));
    const pool = tierMeta(tier).pool;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const portions = 1 + (Math.random() < trackValue("season", row?.season_level) ? 1 : 0);
    await grantConsumable(buyerId, pick, portions).catch(() => {});

    const xp = 8 * tier;
    await db.query(
        `UPDATE mkt_kitchen SET cook_xp = cook_xp + $2, cooks_total = cooks_total + 1,
                                best_dish_tier = GREATEST(best_dish_tier, $3), updated_at = NOW()
          WHERE buyer_id = $1`, [buyerId, xp, tier]).catch(() => {});
    await db.query(`UPDATE mkt_recipe_known SET times_cooked = times_cooked + 1 WHERE buyer_id = $1 AND recipe_id = $2`, [buyerId, recipeId]).catch(() => {});
    await awardXp(buyerId, "cooking", { points: xp, gold: 0, meta: { recipe: rec.id, tier } }).catch(() => {});
    await trackActivity(buyerId, "cooked", { recipe: rec.id, tier, dish: pick, portions, bumped, freeCook }).catch(() => {});
    await cookingBadges(buyerId).catch(() => {});

    const c = CONSUMABLES[pick] || {};
    return {
        ok: true,
        dish: { id: pick, name: c.name || pick, emoji: c.emoji || "🍽️", desc: c.desc || "", tier, tierName: tierMeta(tier).name, tierColor: tierMeta(tier).color },
        portions, bumped, freeCook, xp,
        ...(await getKitchenState(buyerId)),
    };
}

/** Buy a level on an upgrade track. Gold is taken conditionally, so it can never go negative. */
export async function upgradeKitchen(buyerId, track) {
    if (!COOK_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const def = COOK_TRACKS[track];
    if (!def) return { ok: false, error: "bad_track" };
    const row = await kitchenRow(buyerId);
    const col = TRACK_COL[track];
    const level = Number(row?.[col]) || 0;
    if (level >= def.max) return { ok: false, error: "maxed" };
    const cost = trackCost(level);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    await db.query(`UPDATE mkt_kitchen SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await trackActivity(buyerId, "kitchen_upgrade", { track, to: level + 1, cost }).catch(() => {});
    return { ok: true, track, level: level + 1, ...(await getKitchenState(buyerId)) };
}

// ── OWNER TEST TOOLS ─────────────────────────────────────────────────────────────────────────────────────────
// The feature can't be judged from an empty pantry with no recipes, and waiting real days for crops to grow to
// find that out is not a test. Owner-only, and gated on the same isOwner the whole feature is.
export async function devStock(buyerId, what = "all") {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    if (what === "recipes" || what === "all") {
        for (const r of RECIPES) {
            await db.query(`INSERT INTO mkt_recipe_known (buyer_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [buyerId, r.id]).catch(() => {});
        }
    }
    if (what === "ingredients" || what === "all") {
        // Enough of everything to cook every recipe several times over.
        for (const ref of Object.keys(SEEDS)) await addToPantry(buyerId, "crop", ref, 25);
        for (const f of FISH) await addToPantry(buyerId, "fish", f.id, 15);
    }
    return { ok: true, ...(await getKitchenState(buyerId)) };
}

/** Wipe the owner's kitchen back to nothing, so the empty state and the unlock flow can be checked too. */
export async function devReset(buyerId) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    await db.query(`DELETE FROM mkt_pantry WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await db.query(`DELETE FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await db.query(`DELETE FROM mkt_kitchen WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getKitchenState(buyerId)) };
}
