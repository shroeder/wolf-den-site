// ── WHAT IS BETWEEN YOU AND THE ISLAND ───────────────────────────────────────────────────────────────────────
// Luke: "...and have unique fights on the way."
//
// Two fights inside the thirty-second run in, and neither of them is off the ordinary encounter table. Reef
// crabs and gull raiders are what you meet on a Tuesday; a charted island is a place somebody was made to
// name, and the things in that water are named too.
//
//   the first mark  — an ESCORT, one of three that haunt this biome. Shared by the five islands in it.
//   the second mark — the island's own WARDEN, sitting in its anchorage. One per island, twenty-five in all.
//
// ⚠️ ENCOUNTER-SHAPED ON PURPOSE. Every object this file produces has the exact field set ENCOUNTERS uses, so
// it drops straight into foeProfile() and openEncounterBattle() with nothing new in the combat engine. The
// whole of "unique fights" is new CONTENT, not a new fight — a second combat system would be a second thing to
// balance, and [[arena-combat-rework-parked]] is the standing reminder of what that costs.
//
// ⚠️ AND THE STATS ARE GENERATED, NOT AUTHORED. What is written below is who a thing IS — its name, what it
// looks like, how it fights in one word. The numbers come out of statsFor() off the island's tier. Adding a
// `hits: 40` to a row here changes nothing, exactly as it changes nothing in items.js; if a warden needs to be
// harder, the lever is its build or its island's rung. See [[item-stats-are-generated-not-authored]].
//
// PURE. No database, no server imports.

import { ISLANDS, islandById } from "@/lib/marketplace/islands.js";
import { hash } from "@/lib/marketplace/world-hash.js";
import { ENC_LOOT } from "@/lib/marketplace/encounters.js";

const L = ENC_LOOT;

// ── THE LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
// Five tiers over twenty-five rungs, in bands of five — the same shelves the chart grades sit on, so a
// five-star captain's island is guarded by tier-five things and the two systems never need to be reconciled.
export const tierForRung = (rung) => Math.max(1, Math.min(5, Math.ceil((Number(rung) || 1) / 5)));

// Calibrated against ENCOUNTERS so an island warden and a sea encounter of the same tier are the same fight.
// ⚠️ SEVEN GUNS IS THE CEILING. A player's broadside caps at seven (gunsFor: 2 + the Cannons track's five), and
// a foe beyond that is a wall nobody can ever out-equip — which is a locked door with loot behind it, not
// difficulty. The encounter table learned this the hard way; see the note on The Dread Corsair.
const TIER_BASE = {
    1: { guns: 2, hits: 6,  accuracy: 0.50, rake: 0.05 },
    2: { guns: 3, hits: 11, accuracy: 0.56, rake: 0.08 },
    3: { guns: 5, hits: 18, accuracy: 0.63, rake: 0.12 },
    4: { guns: 6, hits: 27, accuracy: 0.68, rake: 0.16 },
    5: { guns: 7, hits: 38, accuracy: 0.73, rake: 0.21 },
};

// How a thing fights, in one word. The same tier three ways, so five tiers do not mean five fights.
//   nimble — more barrels, less timber, and it hits often for little
//   even   — the table as written
//   heavy  — fewer, slower, and every one of them lands like a dropped anvil
const BUILDS = {
    nimble: { guns: +1, hits: -0.25, accuracy: +0.03, rake: -0.03, ammo: "grape" },
    even:   { guns: 0,  hits: 0,     accuracy: 0,     rake: 0,     ammo: "round" },
    heavy:  { guns: -1, hits: +0.35, accuracy: -0.04, rake: +0.05, ammo: "explosive" },
};

/** The numbers, off the tier and the build. The ONLY place a warden's stats are decided. */
export function statsFor(tier, build = "even") {
    const b = TIER_BASE[Math.max(1, Math.min(5, Number(tier) || 1))] || TIER_BASE[1];
    const m = BUILDS[build] || BUILDS.even;
    return {
        guns: Math.max(1, Math.min(7, b.guns + m.guns)),
        hits: Math.max(4, Math.round(b.hits * (1 + m.hits))),
        accuracy: Math.round((b.accuracy + m.accuracy) * 100) / 100,
        rake: Math.round((b.rake + m.rake) * 1000) / 1000,
        ammo: m.ammo,
    };
}

/** What it drops. Off the tier, so a biome escort met at rung 3 and at rung 23 pay very differently. */
export function lootFor(tier, { anchorage = false } = {}) {
    const t = Math.max(1, Math.min(5, Number(tier) || 1));
    const coin = Math.round((10 + t * 12) * (anchorage ? 1.6 : 1));
    const out = [L.doubloons(coin)];
    // The anchorage warden is the harder of the two and pays the chest; the escort pays parts. Two fights on
    // one run that both hand over a chest would double every charted island's chest rate by itself.
    if (anchorage) out.push(L.chest(t >= 5 ? "mythic" : t >= 4 ? "gold" : t >= 2 ? "iron" : "wooden"));
    else out.push(L.parts(Math.max(1, Math.min(5, t)), t >= 4 ? 2 : 1));
    return out;
}

// ── THE ESCORTS ──────────────────────────────────────────────────────────────────────────────────────────────
// Three per biome, fifteen in all, shared by the five islands of their water. They scale to whatever island
// they are met off, so the same sprite is a nuisance in the Shallows at rung 2 and a serious problem at 5.
export const ESCORTS = {
    coral: [
        { id: "esc_reefmother", kind: "monster", name: "The Reefmother", cls: "Coral bloom", limb: "swarm", build: "nimble",
            blurb: "The reef came away from the bottom and it is keeping pace with you." },
        { id: "esc_wreckers", kind: "ship", name: "The Wreckers", cls: "Shallow-draft lugger", build: "even",
            blurb: "They light the wrong headland on purpose and wait for the sound." },
        { id: "esc_shoalhound", kind: "monster", name: "Shoal Hounds", cls: "Shoal hound", limb: "jaws", build: "nimble",
            blurb: "Six of them in water you can see the bottom of, and you still cannot count them." },
    ],
    ash: [
        { id: "esc_pumice", kind: "monster", name: "The Pumice Raft", cls: "Drifting mass", limb: "swarm", build: "heavy",
            blurb: "An acre of floating stone, and something underneath it is steering." },
        { id: "esc_slagmen", kind: "ship", name: "The Slagmen", cls: "Scavenger barge", build: "heavy",
            blurb: "They work the cinders for iron. Your hull is iron." },
        { id: "esc_emberdrake", kind: "monster", name: "An Ember Drake", cls: "Ash drake", limb: "jaws", build: "even",
            blurb: "It nests in the warm rock and it resents the wind you brought." },
    ],
    drowned: [
        { id: "esc_steeplewatch", kind: "ship", name: "The Steeple Watch", cls: "Drowned cutter", build: "even",
            blurb: "Still patrolling a harbour that has been underwater for a generation." },
        { id: "esc_bellringers", kind: "monster", name: "The Bellringers", cls: "Drowned choir", limb: "swarm", build: "nimble",
            blurb: "They come up at the turn of the tide and they are not finished singing." },
        { id: "esc_assizehulk", kind: "ship", name: "The Assize Hulk", cls: "Prison hulk", build: "heavy",
            blurb: "It was moored here to hold men. The mooring went. It did not." },
    ],
    frost: [
        { id: "esc_growler", kind: "monster", name: "A Growler", cls: "Ice mass", limb: "jaws", build: "heavy",
            blurb: "Nine tenths of it is under you and all nine tenths are moving." },
        { id: "esc_icewhalers", kind: "ship", name: "The Ice Whalers", cls: "Reinforced whaler", build: "even",
            blurb: "A bad season. They have stopped being particular about what they take." },
        { id: "esc_whitegulls", kind: "monster", name: "The White Gulls", cls: "Winter flock", limb: "swarm", build: "nimble",
            blurb: "The ones that stayed through the dark. They have gone a long way past hungry." },
    ],
    green: [
        { id: "esc_stranglers", kind: "monster", name: "The Stranglers", cls: "Drifting fig", limb: "swarm", build: "heavy",
            blurb: "It has already taken hold of the bowsprit and it grows faster than that should allow." },
        { id: "esc_feverboats", kind: "ship", name: "The Fever Boats", cls: "Quarantined sloop", build: "nimble",
            blurb: "Flying the yellow flag, and coming straight for you anyway." },
        { id: "esc_rotkings", kind: "monster", name: "The Rot Kings", cls: "Mangrove thing", limb: "kraken", build: "even",
            blurb: "Roots, mud and a great deal of patience, arriving all at once." },
    ],
};

// ── THE ANCHORAGE WARDENS ────────────────────────────────────────────────────────────────────────────────────
// One per island, in rung order. This is the thing that lives HERE — the last thing between you and the beach,
// and the sprite that makes a landfall recognisable before the backdrop has finished loading.
export const WARDENS = {
    tallow_key:        { kind: "ship",    name: "The Tallow Barge",    cls: "Rendering hulk",     build: "even",   blurb: "They boiled things here. The smell is how you find the island." },
    hundred_shallows:  { kind: "monster", name: "The Ninety-Ninth",    cls: "Sand thing",  limb: "swarm",  build: "nimble", blurb: "One of the hundred islands is not an island." },
    pilots_mistake:    { kind: "ship",    name: "The Fourth Ship",     cls: "Wrecked brig",       build: "heavy",  blurb: "Three of them came off the reef. This one has been waiting for company." },
    sugarbone:         { kind: "monster", name: "The White Below",     cls: "Bone drift",  limb: "jaws",   build: "even",   blurb: "None of it is sand and all of it is moving toward you." },
    lending_reef:      { kind: "monster", name: "The Lender",          cls: "Reef leviathan", limb: "kraken", build: "heavy", blurb: "It would like something back. It is not specific about what." },

    cinderfall:        { kind: "ship",    name: "The Ash Tender",      cls: "Cinder scow",        build: "even",   blurb: "Blackened to the waterline and still making way." },
    smoking_sister:    { kind: "monster", name: "The Other Sister",    cls: "Cooled thing", limb: "jaws",  build: "heavy",  blurb: "The one that stopped smoking. It has been cold a long time." },
    blacksand_bar:     { kind: "monster", name: "The Bar Itself",      cls: "Living grit", limb: "swarm",  build: "nimble", blurb: "A mile of beach that stood up." },
    ember_hold:        { kind: "ship",    name: "The Holdkeeper",      cls: "Fortified barque",   build: "heavy",  blurb: "Somebody built here on purpose. Somebody is still keeping it." },
    furnace_door:      { kind: "monster", name: "What Breathes",       cls: "Furnace thing", limb: "jaws", build: "even",   blurb: "The cleft breathes out on a steady count and this is the count." },

    low_harbour:       { kind: "ship",    name: "The Harbourmaster",   cls: "Drowned pilot boat", build: "even",   blurb: "He still comes out to meet every ship. He always has." },
    sunken_assize:     { kind: "ship",    name: "The Court Barge",     cls: "Assize barge",       build: "heavy",  blurb: "Court was in session and it has not been adjourned." },
    bellmouth:         { kind: "monster", name: "The Ringer",          cls: "Bell thing",  limb: "kraken", build: "even",   blurb: "Somebody is ringing it. You would rather they were not." },
    drowned_corwick:   { kind: "ship",    name: "The Corwick Packet",  cls: "Mail packet",        build: "nimble", blurb: "Eleven hundred letters, still undelivered, still running the route." },
    quiet_street:      { kind: "monster", name: "The Quiet Neighbour", cls: "Street thing", limb: "swarm", build: "heavy",  blurb: "Doors, windows, a cobbled run of it, and one of the houses is watching." },

    gullwinter:        { kind: "monster", name: "The One That Stayed", cls: "Winter gull", limb: "jaws",   build: "nimble", blurb: "The birds all left. It is no longer a bird." },
    blue_mouth:        { kind: "monster", name: "The Deep Blue",       cls: "Ice mass",    limb: "kraken", build: "heavy",  blurb: "The blue goes down further than the light does, and it came up." },
    rime_shoal:        { kind: "ship",    name: "The Season's Shape",  cls: "Ice-locked hulk",    build: "even",   blurb: "Frozen into a shoal that is a different shape every year." },
    long_cold:         { kind: "ship",    name: "The Eight Months",    cls: "Survey brig",        build: "heavy",  blurb: "Chartered to map the other four. It came back with something else." },
    widows_ice:        { kind: "monster", name: "The Waiting",         cls: "Ice thing",   limb: "swarm",  build: "even",   blurb: "Named by the ones who waited. This is what they were waiting for." },

    greenrot:          { kind: "monster", name: "The Leaf Mould",      cls: "Rot mass",    limb: "swarm",  build: "heavy",  blurb: "Everything left here is still here, and it has agreed on something." },
    overgrown_charter: { kind: "ship",    name: "The Surveyor",        cls: "Charter cutter",     build: "nimble", blurb: "It laid out the streets. It is still laying out the streets." },
    mothers_thicket:   { kind: "monster", name: "Mother",              cls: "The thicket", limb: "kraken", build: "heavy",  blurb: "The thicket is one plant and you have its attention." },
    fever_coast:       { kind: "ship",    name: "The Four Who Drank",  cls: "Fever sloop",        build: "even",   blurb: "They agreed not to. Four of them did, and here they are." },
    last_green_thing:  { kind: "monster", name: "The Last Green Thing",cls: "The island",  limb: "kraken", build: "heavy",  blurb: "Past it there is open water to the edge of every chart we have." },
};

/** Warden sprites live beside the islands, not in /sailing/enc — they belong to the island, not to the sea. */
export const wardenArt = (id) => `/images/islands/warden/${id}.png`;

/** Turn an authored row into an ENCOUNTERS-shaped foe at a given tier. The one place the two shapes meet. */
function foeRow(id, row, tier, { anchorage = false } = {}) {
    return {
        id, kind: row.kind, tier,
        name: row.name, cls: row.cls, blurb: row.blurb,
        ...(row.kind === "monster" ? { limb: row.limb || "default" } : {}),
        ...statsFor(tier, row.build),
        loot: lootFor(tier, { anchorage }),
        // Both halves of the run draw from /images/islands/warden/, so one generator covers all forty.
        art: wardenArt(id),
        anchorage,
    };
}

/** The island's own warden, at its island's tier. */
export function wardenFor(islandId) {
    const isle = islandById(islandId);
    if (!isle) return null;
    const row = WARDENS[isle.id];
    if (!row) return null;
    return foeRow(`wd_${isle.id}`, row, tierForRung(isle.rung), { anchorage: true });
}

/** The escort met on the way in — one of the biome's three, picked by the chart's own seed. */
export function escortFor(islandId, seed) {
    const isle = islandById(islandId);
    if (!isle) return null;
    const pool = ESCORTS[isle.biome] || ESCORTS.coral;
    const row = pool[Math.floor(hash(Math.floor(Number(seed) || 0) ^ 0x4e5c, 0) * pool.length) % pool.length];
    return foeRow(row.id, row, tierForRung(isle.rung), { anchorage: false });
}

// ── WHERE THEY ARE WAITING ───────────────────────────────────────────────────────────────────────────────────
// A fraction of the thirty-second run in. One mark, placed late enough that the run does not open with a
// fight and early enough that it is not still going on when the island fills the screen.
//
// ⚠️ IT USED TO BE TWO, AND THE SECOND ONE WAS THE WARDEN. The warden is now met ASHORE, on the island it is
// named for — see OPENS_FIGHT in island-world.js and takeNode in expedition.js. Half this roster is written
// as a land thing ("The Bar Itself — a mile of beach that stood up", "Mother — the thicket is one plant and
// you have its attention", "The Quiet Neighbour — street thing"), and all of them were being fought from a
// boat at the mouth of the anchorage while a `warden` NODE sat on the island itself with art, a name and a
// blurb and no fight wired to it. Luke's call, and it resolves both halves at once: the island gains the
// only combat it has, and the creature is finally where its own description says it is.
//
// What is LOST is the composition note that put it here — you could see the island while you fought it. The
// escort keeps the run from being empty, and the warden now has the island behind it instead.
export const RUN_MARKS = [0.45];

/** The fight met on the way in. The warden is ashore now and is not one of these. */
export const runFoes = (islandId, seed) => [escortFor(islandId, seed)].filter(Boolean);

/** Every foe in the archipelago — forty rows — for the art generator and the sim. */
export function allFoes() {
    const out = [];
    for (const [biome, pool] of Object.entries(ESCORTS)) {
        for (const row of pool) out.push({ ...row, biome, escort: true, art: wardenArt(row.id) });
    }
    for (const isle of ISLANDS) {
        const row = WARDENS[isle.id];
        if (row) out.push({ ...row, id: `wd_${isle.id}`, biome: isle.biome, island: isle.id, rung: isle.rung, art: wardenArt(`wd_${isle.id}`) });
    }
    return out;
}
