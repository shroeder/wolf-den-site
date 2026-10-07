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

/** The tool slots this map's crafting introduces. Each is a NEW equipment slot, one per system. */
export const TOOL_SLOTS = [
    { slot: "rod", name: "Fishing Rod", system: "fishing" },
    { slot: "pick", name: "Pickaxe", system: "mining" },
    { slot: "shovel", name: "Shovel", system: "digging" },
    { slot: "hammer", name: "Smith's Hammer", system: "forge" },
    { slot: "hoe", name: "Hoe", system: "farm" },
    { slot: "sextant", name: "Sextant", system: "sailing" },
];

// Roman numerals, because the expansions are numbered that way and there are never going to be many.
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

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
    // ── TOOLS — the six new slots, each from the parts of the system it serves where that reads ─────
    R("rod_grove", "Rootwood Rod", "tool", { gnawed_root: 8, damp_moss: 4, grub_fat: 3 },
        { slot: "rod", blurb: "Springy, light, and it was never meant to be a fishing rod." }),
    R("pick_grove", "Antler Pick", "tool", { split_antler: 6, bristle_hide: 4, thorn_barb: 5 },
        { slot: "pick", blurb: "The crack in the antler is what gives it bite." }),
    R("shovel_grove", "Barrow Spade", "tool", { barrow_tooth: 5, bound_straw: 6, split_antler: 3 },
        { slot: "shovel", blurb: "Made from what was already down there." }),
    R("hammer_grove", "Knotwood Hammer", "tool", { rotwood_knot: 6, ash_ember: 4, goblin_rivet: 6 },
        { slot: "hammer", blurb: "The knot outlasted the tree. It will outlast the anvil." }),
    R("hoe_grove", "Thornfield Hoe", "tool", { thorn_barb: 8, gourd_rind: 5, bristle_hide: 3 },
        { slot: "hoe", blurb: "Turns soil and anything growing in it." }),
    R("sextant_grove", "Mothlight Sextant", "tool", { mothlight_dust: 6, warren_silk: 5, crystal_shard: 1 },
        { slot: "sextant", blurb: "Reads a sky it has never been under." }),

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
    R("deco_stump", "Carved Stump", "deco", { gnawed_root: 12, rotwood_knot: 4 },
        { blurb: "Somebody sat on this long enough to carve it." }),
    R("deco_lantern", "Mothlight Lantern", "deco", { mothlight_dust: 8, grub_fat: 10 },
        { blurb: "The dust keeps glowing. Nobody is sure for how long." }),
    R("deco_cairn", "Barrow Cairn", "deco", { barrow_tooth: 12, elder_heartwood: 3 },
        { blurb: "Stacked the old way, facing the old direction." }),
    R("plot_i", "Cleared Ground I", "plot", { elder_heartwood: 10, goblin_rivet: 20, crystal_shard: 2 },
        { adds: 1, numeral: "I", blurb: "Enough forest pushed back for one more row." }),
    R("plot_ii", "Cleared Ground II", "plot", { elder_heartwood: 20, crystal_shard: 6, ash_ember: 20 },
        { adds: 1, numeral: "II", blurb: "The last ground the Grove will give up." }),
];

export const recipeById = (id) => GROVE_RECIPES.find((r) => r.id === id) || null;

/**
 * Which recipes a player has discovered, from the parts they have EVER SEEN.
 *
 * ⚠️ TAKES A SEEN-SET, NOT AN INVENTORY. See the note at the top: discarding or banking a part must not
 * re-lock the recipe it unlocked. This is the one rule most likely to get "simplified" into reading the bag.
 */
export function discoveredRecipes(seenPartIds) {
    const seen = seenPartIds instanceof Set ? seenPartIds : new Set(seenPartIds || []);
    return GROVE_RECIPES.filter((r) => Object.keys(r.parts).every((p) => seen.has(p)));
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
