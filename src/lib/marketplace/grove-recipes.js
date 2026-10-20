import { foodRecipesForMap, toolRecipesForMap, mapIsBuilt } from "@/lib/marketplace/grove-maps.js";

// ── THE GROVE'S RECIPES — THE NEW CRAFTING SYSTEM ────────────────────────────────────────────────────────────
// Luke: "It would be a new system accessible in its own area with upgrades badges and its own set
// (nonwearable). You could craft a variety of things."
//
// ⚠️ PURE. The workbench screen reads this and so does the server. No db, no server-only.
//
// ── DISCOVERY, NOT POSSESSION ────────────────────────────────────────────────────────────────────────────────
// Luke: "You only see recipes once youve found the items that require it ... If you get the first item and
// discard it or bank it, then find the second part. The recipe unlocks, so its just based on discovery."
//
// So a recipe is unlocked by the set of parts a player has EVER SEEN, not by what is in the bag right now.
// That is the whole reason the server has to keep a seen-parts set per player rather than deriving unlocks
// from inventory — a 16-slot backpack means things get discarded constantly, and a recipe that vanished when
// you dropped a root would be unreadable as a rule.
//
// ── WHAT THE TOOLS ARE ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "id like to add additional gear slots for a fishing rod, pickaxe, shovel, smiths hammer, hoe ... Maybe
// a sextant for sailing etc." One new slot per system where a tool applies. ⚠️ A new gear slot needs its own
// slot id AND its own art — worn-sets-need-distinct-slots is the scar where two sets quietly shared one.

// ── TOOLS ARE A LADDER ACROSS THE MAPS, NOT SIX ITEMS ────────────────────────────────────────────────────────
// Luke: "My idea was for you to craft different tiers of these utility items as you progress through maps and
// get parts and recipes."
//
// ⚠️ THE FIRST CUT OF THIS WAS WRONG AND IS WORTH SAYING SO. It made ONE Rootwood Rod, one Antler Pick, and
// so on — six terminal items, craft each once and the whole tool idea is finished inside map one, with
// nineteen maps left and nothing to make. A tool is a RUNG, not a trophy: each map yields the next tier of
// every tool, out of that map's own parts.
//
// So what is stored per player is a TIER NUMBER per slot (mkt_grove_tool), and what a map contributes is a
// recipe that raises it. The bonus is read from the tier, so adding map two means adding recipes and nothing
// else — no new columns, no migration, no second place that has to agree about what a pickaxe is worth.
export const TOOL_SLOTS = [
    { slot: "rod", name: "Fishing Rod", system: "fishing", bonus: "treasure chance" },
    { slot: "pick", name: "Pickaxe", system: "mining", bonus: "ore yield" },
    { slot: "shovel", name: "Shovel", system: "digging", bonus: "dig depth" },
    { slot: "hammer", name: "Smith's Hammer", system: "forge", bonus: "salvage returned" },
    { slot: "hoe", name: "Hoe", system: "farm", bonus: "harvest yield" },
    { slot: "sextant", name: "Sextant", system: "sailing", bonus: "sea fortune" },
    // ── THE SIX THE GROVE NEVER LEARNED TO FEED ─────────────────────────────────────────────────────────
    // Luke: "the easy gaps we should fix, which include feeding all systems." Six systems had no tool and
    // therefore no reason to care the Grove existed: the kitchen, the menagerie, the dungeons, the
    // jeweller, the arena and the weekly boss.
    //
    // ⚠️ EVERY ONE OF THESE PAYS ON THE REWARD SIDE, NEVER ON COMBAT POWER. That is not timidity, it is the
    // one rule that keeps twelve ladders from becoming a second stat system: §11 of the design doc still
    // has "stat ceilings" open, and a tool that adds damage would have to be priced against a ceiling
    // nobody has set. A tool that adds YIELD is priced against its own system and nothing else.
    { slot: "knife", name: "Cook's Knife", system: "cooking", bonus: "recipe luck" },
    { slot: "collar", name: "Pet Collar", system: "pets", bonus: "pet XP share" },
    { slot: "lantern", name: "Delver's Lantern", system: "delves", bonus: "parts recovered" },
    { slot: "loupe", name: "Jeweller's Loupe", system: "jeweller", bonus: "gem find" },
    { slot: "banner", name: "War Banner", system: "arena", bonus: "laurels won" },
    { slot: "horn", name: "Hunting Horn", system: "boss", bonus: "strike reward" },
];

// ── TWELVE TOOLS, TWELVE MAPS, TWELVE RUNGS ──────────────────────────────────────────────────────────────────
// Luke: "extend them to their highest tiers, which I would say would be represented by a tier per map. And we
// have 12 maps?" Twelve is right, and it is not an opinion — the difficulty curve is already anchored to it
// (grove-catalog.js prices depth 133 as map 12 zone 1, x32 power over 132 zones). The design doc still says
// "maps 2-20" in one line; that line is stale and this constant is the truth.
//
// A tool's tier IS the map that taught it. Map one grants tier I of all twelve tools, map two grants tier II
// out of map two's parts, and so on to XII. Nothing here needs to change when a map lands: add twelve recipes
// carrying `tier: n` and the ladder grows.
export const TOOL_TIER_CAP = 12;

export const toolSlot = (slot) => TOOL_SLOTS.find((t) => t.slot === slot) || null;

// ── WHAT A TIER IS WORTH ─────────────────────────────────────────────────────────────────────────────────────
// A flat percentage per tier, to its own system. Deliberately modest: six tools across twenty maps is a lot of
// surface area to inflate the whole game through, and every one of these lands on a system that already has
// its own upgrade ladder. A tier-1 tool should be a nice thing to have, not a reason to re-run the Grove.
//
// ⚠️ READ FROM THE TIER, NEVER STORED. A stored bonus is a number that has to be migrated the day the curve
// changes, and the curve will change.
export const TOOL_PCT_PER_TIER = 3;
export const toolBonusPct = (tier) => Math.max(0, Number(tier) || 0) * TOOL_PCT_PER_TIER;

// Roman numerals. The expansions are numbered this way, and so are tool tiers — Luke: "Tiers would be
// represented with Roman numerals." Twelve of them, because that is the whole map count; a tier past the end
// of this list would render as "undefined" on the one screen that exists to show progress.
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** A tool tier as the player reads it. Tier 0 is "not made yet" and has no numeral. */
export const toolNumeral = (tier) => ROMAN[Math.max(0, Math.floor(Number(tier) || 0)) - 1] || "";

const R = (id, name, kind, parts, o = {}) => ({ id, name, kind, parts, ...o });

// ── THE RECIPES ──────────────────────────────────────────────────────────────────────────────────────────────
// `parts` is { partId: count }. `kind` is what crafting it produces, which decides which system grants it.
//
// ⚠️ EVERY PART IN grove-catalog.js APPEARS IN AT LEAST ONE OF THESE. check-grove.mjs fails if one is
// orphaned — Luke: "Each part you can get from an enemy has uses in at least one recipe." A part that drops
// and does nothing is litter in a sixteen-slot bag.
//
// Power and cost climb with the depth the parts come from, so a recipe reads as belonging to where you found
// it: "Recipes should reflect their parts. And their utility and power should reflect the map and difficulty."
export const GROVE_RECIPES = [
    // ── TOOLS — TIER 1 OF SIX LADDERS. Map two raises each of these to tier 2 from ITS parts. ────────
    // `tier` is what the craft sets the slot to, and it only ever goes up — crafting a tier you already
    // have or have passed is refused rather than being a wasted pile of parts.
    //
    // The parts are drawn from the DEPTH the tool's power implies, not from the system it serves: the
    // sextant is the deep one because the sea is the late game, the rod is the shallow one because fishing
    // is where people start. "their utility and power should reflect the map and difficulty."
    R("rod_t1", "Rootwood Rod", "tool", { gnawed_root: 8, damp_moss: 4, grub_fat: 3 },
        { slot: "rod", tier: 1, blurb: "Springy, light, and it was never meant to be a fishing rod." }),
    R("pick_t1", "Antler Pick", "tool", { split_antler: 6, bristle_hide: 4, thorn_barb: 5 },
        { slot: "pick", tier: 1, blurb: "The crack in the antler is what gives it bite." }),
    R("hoe_t1", "Thornfield Hoe", "tool", { thorn_barb: 8, gourd_rind: 5, bristle_hide: 3 },
        { slot: "hoe", tier: 1, blurb: "Turns soil and anything growing in it." }),
    R("shovel_t1", "Barrow Spade", "tool", { barrow_tooth: 5, bound_straw: 6, split_antler: 3 },
        { slot: "shovel", tier: 1, blurb: "Made from what was already down there." }),
    R("hammer_t1", "Knotwood Hammer", "tool", { rotwood_knot: 6, ash_ember: 4, goblin_rivet: 6 },
        { slot: "hammer", tier: 1, blurb: "The knot outlasted the tree. It will outlast the anvil." }),
    R("sextant_t1", "Mothlight Sextant", "tool", { mothlight_dust: 6, warren_silk: 5, crystal_shard: 1 },
        { slot: "sextant", tier: 1, blurb: "Reads a sky it has never been under." }),

    // ── FOOD — the belt. Luke: "equip food or potions that auto heal you if you get below 60 percent hp" ─
    // ⚠️ THESE MAKE A STACK, NOT ONE. A recipe that produced a single poultice would be a trip to the
    // workbench every two minutes, which is not a system, it is an errand. `makes` is how many a craft
    // yields; the heal fraction lives on the food in grove-catalog.js.
    R("food_poultice", "Moss Poultice", "food", { damp_moss: 4, grub_fat: 3 },
        { makes: 5, blurb: "Chewed moss and grub fat, packed into a leaf." }),
    R("food_flask", "Gourd Flask", "food", { gourd_rind: 4, bound_straw: 4, grub_fat: 2 },
        { makes: 5, blurb: "A dried gourd of something cloudy." }),
    R("food_tonic", "Mothlight Tonic", "food", { mothlight_dust: 4, warren_silk: 3 },
        { makes: 4, blurb: "Faintly luminous, and it works fast." }),
    R("food_draught", "Heartwood Draught", "food", { elder_heartwood: 3, ash_ember: 4 },
        { makes: 3, blurb: "There is not much of it in the world." }),

    // ── BACKPACK — unique, one-time, Roman-numbered, each its own recipe ─────────────────────────────
    R("pack_i", "Backpack I", "pack", { damp_moss: 6, gnawed_root: 6 }, { adds: 4, numeral: "I" }),
    R("pack_ii", "Backpack II", "pack", { bristle_hide: 8, thorn_barb: 8 }, { adds: 4, numeral: "II" }),
    R("pack_iii", "Backpack III", "pack", { gourd_rind: 10, bound_straw: 10 }, { adds: 4, numeral: "III" }),
    R("pack_iv", "Backpack IV", "pack", { warren_silk: 10, barrow_tooth: 10 }, { adds: 4, numeral: "IV" }),
    R("pack_v", "Backpack V", "pack", { mothlight_dust: 12, ash_ember: 12 }, { adds: 4, numeral: "V" }),

    // ── BANK — the same shape, bigger numbers, up to the 64 ceiling ──────────────────────────────────
    R("bank_i", "Vault I", "bank", { grub_fat: 10, damp_moss: 10 }, { adds: 8, numeral: "I" }),
    R("bank_ii", "Vault II", "bank", { split_antler: 12, bristle_hide: 12 }, { adds: 8, numeral: "II" }),
    R("bank_iii", "Vault III", "bank", { bound_straw: 14, gourd_rind: 14 }, { adds: 8, numeral: "III" }),
    R("bank_iv", "Vault IV", "bank", { barrow_tooth: 16, warren_silk: 16 }, { adds: 8, numeral: "IV" }),
    R("bank_v", "Vault V", "bank", { goblin_rivet: 18, rotwood_knot: 18 }, { adds: 8, numeral: "V" }),
    R("bank_vi", "Vault VI", "bank", { elder_heartwood: 14, crystal_shard: 3 }, { adds: 8, numeral: "VI" }),

    // ── THE FARM ────────────────────────────────────────────────────────────────────────────────────
    // "Could maybe make some craftable decorations for the farm" and "Maybe you could build up to 2
    // additional plots." ⚠️ TWO PLOTS, EVER. Plots are the farm's core economy and these are deliberately
    // the most expensive things on the list — a third would want a conversation, not a recipe.
    R("deco_grove_stump", "Carved Stump", "deco", { gnawed_root: 12, rotwood_knot: 4 },
        { blurb: "Somebody sat on this long enough to carve it." }),
    R("deco_grove_lantern", "Mothlight Lantern", "deco", { mothlight_dust: 8, grub_fat: 10 },
        { blurb: "The dust keeps glowing. Nobody is sure for how long." }),
    R("deco_grove_cairn", "Barrow Cairn", "deco", { barrow_tooth: 12, elder_heartwood: 3 },
        { blurb: "Stacked the old way, facing the old direction." }),
    R("plot_i", "Cleared Ground I", "plot", { elder_heartwood: 10, goblin_rivet: 20, crystal_shard: 2 },
        { adds: 1, numeral: "I", blurb: "Enough forest pushed back for one more row." }),
    R("plot_ii", "Cleared Ground II", "plot", { elder_heartwood: 20, crystal_shard: 6, ash_ember: 20 },
        { adds: 1, numeral: "II", blurb: "The last ground the Grove will give up." }),

    // ── TIER I OF THE SIX NEW LADDERS ───────────────────────────────────────────────────────────────
    // Same rule as the first six: the parts come from the DEPTH the tool's power implies, not from the
    // system it serves. The knife is shallow because the kitchen is an early room; the loupe wants a
    // crystal shard because gems are the deep end of the game.
    R("knife_t1", "Flintbone Knife", "tool", { split_antler: 6, thorn_barb: 5, damp_moss: 4 },
        { slot: "knife", tier: 1, blurb: "Bone, knapped flint, and a handle wrapped in something." }),
    R("collar_t1", "Braided Collar", "tool", { warren_silk: 6, bristle_hide: 5, grub_fat: 4 },
        { slot: "collar", tier: 1, blurb: "Spun in the dark, and whatever wears it walks closer to you." }),
    R("lantern_t1", "Hollow Lantern", "tool", { mothlight_dust: 5, gourd_rind: 5, bound_straw: 4 },
        { slot: "lantern", tier: 1, blurb: "A dried gourd with a handful of glow in it. It finds the floor." }),
    R("loupe_t1", "Crystal Loupe", "tool", { crystal_shard: 1, mothlight_dust: 4, split_antler: 4 },
        { slot: "loupe", tier: 1, blurb: "A shard ground flat enough to see through, which took a while." }),
    R("banner_t1", "Bramble Standard", "tool", { thorn_barb: 6, bound_straw: 6, bristle_hide: 4 },
        { slot: "banner", tier: 1, blurb: "Carried into the ring. It makes the laurels heavier." }),
    R("horn_t1", "Barrow Horn", "tool", { barrow_tooth: 6, rotwood_knot: 5, ash_ember: 4 },
        { slot: "horn", tier: 1, blurb: "Sounded before the strike. Something always answers." }),
];

// ── TIERS II TO XII, ONE MAP AT A TIME ───────────────────────────────────────────────────────────────────────
// Generated from grove-maps.js rather than typed. The design is in TOOL_ROLES (a pickaxe is an edge, a haft
// and a hide); each map supplies its own material for each role, and the recipe is that sentence in that
// map's vocabulary. 132 recipes, one rule.
//
// ⚠️ THEY ARE REAL RECIPES AND THEY ARE UNREACHABLE, WHICH IS THE POINT. The materials for map seven exist as
// a design; the zones that drop them do not. mapIsBuilt() is the line, and everything player-facing filters
// on it — see the note on MAPS_BUILT. The alternative, leaving the ladder undeclared until its map lands,
// means the shape of the thing is invisible until it is too late to change cheaply.
// Every generated map presses its four unused drops into food — see foodRecipesForMap. Registered as the
// same `kind: "food"` map one uses, so the belt, the bench and the gate all treat them identically.
for (let n = 2; n <= TOOL_TIER_CAP; n += 1) {
    for (const f of foodRecipesForMap(n)) {
        GROVE_RECIPES.push(R(f.id, f.name, "food", f.parts, {
            makes: f.makes, map: n, blurb: f.blurb,
        }));
    }
}

for (let n = 2; n <= TOOL_TIER_CAP; n += 1) {
    for (const r of toolRecipesForMap(n)) {
        const base = TOOL_SLOTS.find((t) => t.slot === r.slot);
        GROVE_RECIPES.push(R(`${r.slot}_t${n}`, `${r.short} ${base?.name || r.slot}`, "tool", r.parts, {
            slot: r.slot, tier: n, map: n, mapName: r.mapName,
            blurb: `${base?.name || "A tool"}, remade out of what ${r.mapName.replace(/^The /, "the ")} is made of.`,
        }));
    }
}

/** Every tool recipe for one slot, lowest tier first — the ladder as it currently exists. */
export const toolLadder = (slot) => GROVE_RECIPES
    .filter((r) => r.kind === "tool" && r.slot === slot)
    .sort((a, b) => (a.tier || 0) - (b.tier || 0));

/** The map a recipe belongs to. Map one's hand-authored recipes have no `map` field; they are map one. */
export const recipeMap = (r) => Number(r?.map) || 1;

export const recipeById = (id) => GROVE_RECIPES.find((r) => r.id === id) || null;

/**
 * Which recipes a player has discovered, from the parts they have EVER SEEN.
 *
 * ⚠️ TAKES A SEEN-SET, NOT AN INVENTORY. See the note at the top: discarding or banking a part must not
 * re-lock the recipe it unlocked. This is the one rule most likely to get "simplified" into reading the bag.
 */
/**
 * ⚠️ RETIRED AS A GATE, 2026-10-18, AND KEPT ONLY AS A QUESTION THE BENCH ASKS.
 *
 * This used to decide which recipes a player was allowed to SEE. Luke: "I think we should see all recipes
 * instead of the silly find all to unlock." Lived with, the rule hid the thing a crafting screen is for —
 * a new player met an empty bench and no reason to pick up a root, and could not see the shape of the map
 * until they had nearly finished it. The header above describes why it was built; this describes why it
 * stopped being load-bearing.
 *
 * It still answers "have I met everything this needs", which is worth showing on a row. It no longer
 * answers "may I look at this".
 */
export function discoveredRecipes(seenPartIds) {
    const seen = seenPartIds instanceof Set ? seenPartIds : new Set(seenPartIds || []);
    return GROVE_RECIPES.filter((r) => Object.keys(r.parts).every((p) => seen.has(p)));
}

// ── ⚠️ ONE PLACE DECIDES WHETHER A RECIPE IS READY ──────────────────────────────────────────────────────────
// This logic lived inside GroveBench's useMemo, which was fine while the workbench was the only thing that
// wanted it. It is not any more: the zone dock has to carry a count of what you could make right now, and a
// second implementation of "ready" is a second answer to the one question this system exists to answer.
//
// So it moves here, pure and shared, and the bench calls it like everyone else. See
// [[reuse-the-rule-never-restate-it]].
//
// ── ⚠️ AND IT ONLY EVER RETURNS RECIPES YOU CAN REACH ───────────────────────────────────────────────────────
// 208 recipes are defined; 80 of them need parts from maps 8-12, which are not built. Counting those in
// told a player they had unlocked a small fraction of crafting when, in the forest they can actually walk,
// they had unlocked rather a lot of it -- and no amount of play would ever have moved the number. A wall of
// permanently impossible rows is not content; it is discouragement with a count on it.
//
// Filtered HERE rather than in the workbench, so the chip counts, the dock badge and the unlock moment all
// agree about what exists. When map 8 ships, MAPS_BUILT moves and these appear on their own.
export const reachableRecipes = () => GROVE_RECIPES.filter((r) => mapIsBuilt(recipeMap(r)));

// `st` is the groveState payload: { pack, seen, tools, packsBuilt, banksBuilt, plotsBuilt }.
export function recipeRows(st = {}) {
    const pack = st.pack || {};
    const seen = st.seen instanceof Set ? st.seen : new Set(st.seen || []);
    return reachableRecipes().map((r) => {
        const built = (st.packsBuilt || []).includes(r.id)
            || (st.banksBuilt || []).includes(r.id)
            || (st.plotsBuilt || []).includes(r.id)
            || (r.kind === "tool" && Number(st.tools?.[r.slot] || 0) >= Number(r.tier));
        const costs = Object.entries(r.parts).map(([part, n]) => {
            const have = Number(pack[part] || 0);
            return { part, need: n, have, short: Math.max(0, n - have) };
        });
        const missing = costs.reduce((a, c) => a + c.short, 0);
        const haveParts = costs.filter((c) => c.short === 0).length;
        // Every recipe is readable now, so a row has to say whether you have even MET its parts —
        // that is what the discovery rule used to communicate by hiding the row entirely.
        const unmet = costs.filter((c) => !seen.has(c.part)).length;
        return { r, built, costs, missing, haveParts, unmet, ready: missing === 0 && !built };
    });
}

/** How many recipes could be made RIGHT NOW. What the zone dock's badge counts. */
export const readyCount = (st) => recipeRows(st).filter((x) => x.ready).length;

/**
 * Did this part just put a recipe within reach that was not before?
 *
 * ⚠️ IT COMPARES TWO BAGS RATHER THAN ASKING "is it ready now". A player who already had four roots and
 * picks up a fifth has not unlocked anything, and firing the moment every time a ready recipe's part lands
 * would announce the same Rootwood Rod on fifty consecutive kills. The moment is the TRANSITION.
 *
 * Returns the recipes that crossed from not-ready to ready, newest-cheapest first.
 */
export function newlyReady(before, after) {
    const was = new Set(recipeRows(before).filter((x) => x.ready).map((x) => x.r.id));
    return recipeRows(after).filter((x) => x.ready && !was.has(x.r.id)).map((x) => x.r);
}

/** Can it be made right now — what is in the bag, as opposed to what has been discovered. */
export function canCraft(recipe, haveCounts) {
    if (!recipe) return false;
    return Object.entries(recipe.parts).every(([p, n]) => (Number(haveCounts?.[p]) || 0) >= n);
}

// ── THE STONE TABLET ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "There will be a stone tablet in town you can interact with to see all the parts youve unlocked and
// hoe many you havent. And you get passive bonuses based on the amount youve collected. Using breakpoint that
// make sense."
//
// Breakpoints are on DISTINCT parts discovered, not on quantity hoarded — the tablet is a record of how much
// of the Grove you have seen, and hoarding one part should not read as exploration.
export const TABLET_BREAKS = [
    { at: 4, stat: "might", value: 2, label: "A start" },
    { at: 8, stat: "vitality", value: 4, label: "Familiar ground" },
    { at: 12, stat: "rarity_find", value: 3, kind: "pct", label: "Well travelled" },
    { at: 16, stat: "ferocity", value: 5, label: "Deep in" },
];

/** ⚠️ FAILS UPWARD, like every other ladder in this game. */
export function tabletBonuses(distinctSeen) {
    const n = Number(distinctSeen) || 0;
    return TABLET_BREAKS.filter((b) => n >= b.at);
}
