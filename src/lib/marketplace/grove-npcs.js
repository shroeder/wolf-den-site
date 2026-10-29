// ── THE PEOPLE STANDING IN THE GROVE, AND WHAT THEY WANT ─────────────────────────────────────────────────────
// Luke: "for every map, I want NPCs spread out between the zones in the map... 3 NPCs per map... they're going
// to have quest chains, so you have to come back to them... they should be relevant to the map that you're in.
// And only the map that you're in."
//
// Three quest-givers per map plus one Coliseum marshal, across seven built maps: 28 people.
//
// ⚠️ UNPREDICTABLE TO THE PLAYER, FIXED IN THE DATA. Luke asked for placement that cannot be pattern-matched
// from one map to the next, and the tempting reading is "roll it at runtime". That would move an NPC while
// somebody was walking back to them mid-chain — a quest-giver who is not where the tracker says is not a
// surprise, it is a bug report. So the zones are AUTHORED, once, chosen to have no readable rhythm: no index
// sits in the same slot on consecutive maps, the gaps between them vary, and no map keeps all three in one
// half. A player arriving on map 4 genuinely cannot guess from maps 1-3 where to look.
//
// ⚠️ AND A QUEST ONLY EVER NAMES ITS OWN MAP. Every target below is resolved from that map's own creatures,
// bosses and parts — see questsFor(). A chain that referenced map 5 from map 3 would be unfinishable until
// you had already passed the thing it was gating.

import { GROVE_ZONES, GROVE_ENEMIES, GROVE_PARTS } from "@/lib/marketplace/grove-catalog.js";
import { GROVE_MAPS } from "@/lib/marketplace/grove-maps.js";

/** Zones each map's three quest-givers stand in. See the note above on why this is authored. */
export const NPC_ZONES = {
    1: [2, 5, 9],
    2: [1, 6, 11],
    3: [3, 4, 10],
    4: [2, 8, 12],
    5: [4, 7, 9],
    6: [1, 5, 10],
    7: [3, 6, 11],
};

/** The zone on each map that holds the Coliseum. Deliberately never a zone a quest-giver already occupies. */
export const COLISEUM_ZONE = { 1: 7, 2: 9, 3: 8, 4: 5, 5: 11, 6: 7, 7: 9 };

// ── WHO THEY ARE ─────────────────────────────────────────────────────────────────────────────────────────────
// Three to a map, in the order they appear in NPC_ZONES. The `role` is what they are doing there, which is
// what makes a fetch quest read as a person asking rather than a task appearing.
export const GROVE_NPCS = [
    // 1 — The Grove. Nothing here has noticed you yet.
    { id: "alder", map: 1, name: "Warden Alder", role: "Keeper of the treeline",
      line: "You're the first thing to come through here on purpose in a while." },
    { id: "pell", map: 1, name: "Mossgatherer Pell", role: "Collects what grows on the dead",
      line: "Careful where you tread. Half of what's underfoot is still deciding." },
    { id: "snare", map: 1, name: "The Snarefitter", role: "Sets traps she never checks",
      line: "I set forty lines out there. I'd like to know what's been walking into them." },

    // 2 — The Undercave. Under the roots, where the light is something that grows.
    { id: "mub", map: 2, name: "Lampwright Mub", role: "Farms the glow",
      line: "Down here light is a crop. Mine's been failing and I'd like to know what's eating it." },
    { id: "cart", map: 2, name: "The Blind Cartographer", role: "Maps by sound",
      line: "I don't need to see it. I need you to go there and make noise." },
    { id: "odd", map: 2, name: "Spelunker Odd", role: "Goes further than is sensible",
      line: "Everything worth having is one chamber past where people stop." },

    // 3 — The Sunken Fen. Wet to the knee and quiet.
    { id: "sil", map: 3, name: "Reedcutter Sil", role: "Harvests the blades",
      line: "The reeds cut back now. That's new, and I don't like new." },
    { id: "priest", map: 3, name: "The Bog-Priest", role: "Tends something under the water",
      line: "It's not drowning if it meant to go under. Remember that." },
    { id: "nim", map: 3, name: "Stiltwalker Nim", role: "Never touches the ground",
      line: "I've walked this marsh for eleven years and I've not had wet feet once." },

    // 4 — The Saltwrack Coast. Everything the sea did not want, in a line.
    { id: "coble", map: 4, name: "Wrackpicker Coble", role: "Works the tideline",
      line: "Tide brings it, I sort it. Lately it's bringing things that sort themselves." },
    { id: "keeper", map: 4, name: "The Line-Keeper", role: "Decides where the coast ends",
      line: "There's a line. Things on the far side of it are not my problem yet." },
    { id: "oss", map: 4, name: "Netmender Oss", role: "Mends what comes back torn",
      line: "Nets come home with holes the shape of nothing I can name." },

    // 5 — The Drowned Ruins. Somebody built this. The water took it anyway.
    { id: "mason", map: 5, name: "The Last Mason", role: "Still repairing it",
      line: "Somebody has to hold it up. It may as well be the one who remembers how." },
    { id: "quell", map: 5, name: "Diver Quell", role: "Goes down and comes back less",
      line: "Everything valuable is at the bottom. So is everything that wants you there." },
    { id: "vane", map: 5, name: "Archivist Vane", role: "Reads what the water left",
      line: "The writing survived. The people did not. I'd like to know why that order." },

    // 6 — The Gilded Waste. Gold-coloured sand, and nothing in it is gold.
    { id: "dune", map: 6, name: "Assayer Dune", role: "Tells fools from fortunes",
      line: "Everyone brings me gold. Nobody brings me gold." },
    { id: "gilt", map: 6, name: "The Gilt-Hunter", role: "Still convinced",
      line: "Dune's wrong. It's out here. I just haven't dug the right hole." },
    { id: "kel", map: 6, name: "Sandwright Kel", role: "Builds things the wind unbuilds",
      line: "I've raised this marker nine times. Something keeps taking it down." },

    // 7 — The Ashen Reach. It burned a long time ago and the ground has not finished.
    { id: "rook", map: 7, name: "Cinderwarden Rook", role: "Keeps the fire where it is",
      line: "It's not out. It's waiting, and it's patient, and so am I." },
    { id: "counter", map: 7, name: "The Ash-Counter", role: "Measures how far it spread",
      line: "I count what burned. The number is going up again." },
    { id: "sol", map: 7, name: "Emberwright Sol", role: "Works metal in live coals",
      line: "Everything here is ruined except what the heat made better. Bring me the second kind." },
];

/** The marshal outside each Coliseum. One per map, and the only source of a daily key. */
export const COLISEUM_NPCS = [
    { id: "thorn", map: 1, name: "Ringmaster Thorn", line: "Twelve rooms of it, all at once, on the clock. Interested?" },
    { id: "caller", map: 2, name: "The Pit-Caller", line: "Shout down the hole. Whatever answers, you fight." },
    { id: "dredge", map: 3, name: "Marshal Dredge", line: "We drained a pit for this. Don't waste it." },
    { id: "brin", map: 4, name: "Tidecaller Brin", line: "Tide's out for two minutes. That's your two minutes." },
    { id: "herald", map: 5, name: "The Drowned Herald", line: "They still fill the stands. You just can't see them." },
    { id: "vex", map: 6, name: "Goldmaster Vex", line: "The purse is real, which makes this the only honest thing out here." },
    { id: "kade", map: 7, name: "Ashmarshal Kade", line: "The sand's warm. It's always warm. Go on." },
];

// ── WHAT A STEP CAN ASK FOR ──────────────────────────────────────────────────────────────────────────────────
// Luke: "You should be creative with the quest. They should be fun and interesting, hopefully, not just all
// redundant." So a chain is built from DIFFERENT kinds rather than one kind with different nouns. Each kind
// resolves its target from the NPC's own map at build time.
export const QUEST_KINDS = {
    cull:    { label: "Cull",    verb: "Defeat" },      // n of one named creature
    hunt:    { label: "Hunt",    verb: "Find" },        // the map's rare spawn, n times
    harvest: { label: "Harvest", verb: "Gather" },      // n of one of this map's parts
    forge:   { label: "Forge",   verb: "Craft" },       // build something at the bench
    delve:   { label: "Delve",   verb: "Reach" },       // reach zone n of this map
    survive: { label: "Survive", verb: "Clear" },       // clear a zone without leaving
    ticket:  { label: "Arena",   verb: "Reach wave" },  // get to wave n of this map's Coliseum
};

/** Every zone belonging to a map, in order. */
export function zonesOfMap(map) {
    return GROVE_ZONES.filter((z) => (z.map || Math.ceil(z.n / 12)) === Number(map)).sort((a, b) => a.n - b.n);
}

/** That map's own creatures, bosses and parts — the only things its quests may name. */
export function mapTargets(map) {
    const zones = zonesOfMap(map);
    const foes = [...new Set(zones.flatMap((z) => (z.enemies || []).map((e) => (typeof e === "object" ? e.id : e))))];
    const bosses = [...new Set(zones.map((z) => z.boss).filter(Boolean))];
    // ⚠️ GROVE_PARTS, NOT MAP_PARTS. MAP_PARTS is built only from the GENERATED maps, so map one — the
    // hand-authored original, and the one every account meets first — resolved to zero parts and every
    // harvest step on it would have had nothing to ask for. GROVE_PARTS is the merged catalogue and carries
    // all 148 including map one's 16.
    const parts = Object.entries(GROVE_PARTS).filter(([, p]) => Number(p.map) === Number(map)).map(([id]) => id);
    return { zones, foes, bosses, parts };
}

export const npcName = (id) =>
    GROVE_NPCS.find((n) => n.id === id)?.name || COLISEUM_NPCS.find((n) => n.id === id)?.name || "Someone";

export const mapName = (map) => GROVE_MAPS.find((m) => m.n === Number(map))?.name || `Map ${map}`;

export const foeName = (id) => GROVE_ENEMIES[id]?.name || String(id || "").replace(/_/g, " ");

export const partName = (id) => GROVE_PARTS[id]?.name || String(id || "").replace(/_/g, " ");

// ── THE CHAINS ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "anywhere from 2 to 5 chains... I don't want it to be the same for every NPC."
//
// So the SHAPE is authored per person — how many steps, and which kinds, in which order — while the TARGETS
// are resolved from that NPC's own map. That keeps twenty-one chains genuinely different to play without
// twenty-one hand-written copies of the same arithmetic drifting apart.
//
// ⚠️ THE LAST STEP OF A CHAIN IS ALWAYS THE BIG ONE. A chain that pays its best reward in the middle gives
// people a reason to stop halfway, which is the opposite of what a chain is for.
//
// `n` is a MULTIPLIER on the step's natural size, not a raw count — the counts themselves scale with map
// depth in stepSize(), because forty kills is a lot on map one and nothing on map seven.
const CHAINS = {
    // map 1 — gentle, and it teaches the verbs one at a time
    alder:   [["cull", 1, "Thin the Treeline"], ["harvest", 1, "What Grows on the Dead"], ["delve", 1, "Walk It Yourself"]],
    pell:    [["harvest", 1, "A Basket's Worth"], ["cull", 1, "The Ones That Bite Back"]],
    snare:   [["cull", 1, "Check My Lines"], ["hunt", 1, "Something Bigger"], ["forge", 1, "Make Me a Better Snare"], ["survive", 1, "Sit the Night Out"]],

    // map 2 — the dark one. more fetching, because looking is the theme
    mub:     [["harvest", 1, "The Glow Is Failing"], ["cull", 1, "Whatever's Eating It"], ["forge", 1, "A Lamp That Holds"]],
    cart:    [["delve", 1, "Make Noise at the Fourth"], ["cull", 1, "Count Them for Me"], ["delve", 2, "And the Ninth"], ["ticket", 1, "The Loud Room"]],
    odd:     [["delve", 2, "One Chamber Further"], ["hunt", 1, "The Thing I Saw"]],

    // map 3 — the fen. slow, patient asks
    sil:     [["harvest", 1, "Blades for Cutting"], ["cull", 1, "The Reeds Cut Back"], ["forge", 1, "A Handle That Holds"], ["survive", 1, "Stand in the Wet"]],
    priest:  [["cull", 1, "It Meant to Go Under"], ["hunt", 1, "What Answers"], ["ticket", 1, "A Congregation"]],
    nim:     [["delve", 1, "Dry Feet"], ["harvest", 1, "From Up Here"]],

    // map 4 — the coast. sorting, mending, the tideline
    coble:   [["harvest", 1, "Sort the Tideline"], ["cull", 1, "The Ones That Sort Themselves"], ["harvest", 2, "A Second Tide"], ["forge", 1, "Something Watertight"], ["hunt", 1, "What the Sea Kept"]],
    keeper:  [["delve", 2, "Walk to the Line"], ["cull", 1, "Hold It"]],
    oss:     [["harvest", 1, "Cord for Mending"], ["forge", 1, "A Net That Holds"], ["survive", 1, "Haul It In"]],

    // map 5 — the ruins. architecture, reading, diving
    mason:   [["harvest", 1, "Stone That Still Rings"], ["forge", 1, "Set a Keystone"], ["cull", 1, "Clear the Scaffold"], ["ticket", 1, "Prove It Holds"]],
    quell:   [["delve", 2, "Down and Back"], ["hunt", 1, "What's at the Bottom"], ["harvest", 2, "Go Again"]],
    vane:    [["harvest", 1, "The Writing Survived"], ["cull", 1, "Why That Order"], ["delve", 2, "The Eleventh Room"], ["forge", 1, "Copy It Properly"], ["survive", 1, "Read It Through"]],

    // map 6 — the waste. assaying, digging, losing
    dune:    [["harvest", 1, "Bring Me Gold"], ["harvest", 2, "Bring Me Actual Gold"], ["forge", 1, "Assay It"]],
    gilt:    [["delve", 1, "The Right Hole"], ["delve", 2, "The Next Right Hole"], ["hunt", 1, "I Told You"]],
    kel:     [["cull", 1, "Something Keeps Taking It"], ["forge", 1, "Raise It a Tenth Time"], ["survive", 1, "Watch It Stand"], ["ticket", 1, "Build It in the Ring"]],

    // map 7 — the reach. heat, counting, metal
    rook:    [["cull", 1, "Keep It Where It Is"], ["delve", 2, "The Far Edge"], ["survive", 1, "It's Patient. Be Patient."], ["hunt", 1, "What's Feeding It"], ["ticket", 1, "The Hot Gate"]],
    counter: [["harvest", 1, "Count What Burned"], ["cull", 1, "The Number Is Going Up"], ["harvest", 2, "Count It Again"]],
    sol:     [["harvest", 1, "The Second Kind"], ["forge", 1, "Work It Hot"], ["hunt", 1, "A Better Coal"], ["forge", 2, "Now Make Something"]],
};

/**
 * How big an ask of this kind should be, at this map, at this point in a chain.
 *
 * ⚠️ IT SCALES WITH THE MAP, not with the step number alone. Forty kills is an afternoon on map one and four
 * minutes on map seven, so a flat count would make late chains trivial and early ones a wall.
 */
function stepSize(kind, map, mult) {
    const m = Math.max(1, Number(map) || 1);
    const k = Math.max(1, Number(mult) || 1);
    switch (kind) {
        case "cull":    return Math.round(12 * Math.pow(1.45, m - 1) * k);
        case "harvest": return Math.round(4 * Math.pow(1.3, m - 1) * k);
        case "hunt":    return Math.max(1, Math.round(1 * k));
        case "forge":   return 1;
        case "delve":   return Math.min(12, 3 + k * 3);
        case "survive": return 1;
        case "ticket":  return Math.min(12, 3 + m);
        default:        return 1;
    }
}

/**
 * What a step pays.
 *
 * ⚠️ THE LAST STEP CARRIES THE CHAIN. Middle steps pay parts, gold and XP; the final step adds the chest,
 * which is what somebody tells a friend about. Chest tier climbs with the map, through GROVE_CHEST_ORDER.
 *
 * ⚠️ AND NOTHING HERE WRITES INTO A DROP TABLE. Rewards are granted through the ordinary award paths; a quest
 * that reached into a loot row would decay that row for every other thing reading it.
 */
function stepReward(kind, map, idx, last) {
    const m = Math.max(1, Number(map) || 1);
    const scale = Math.pow(1.6, m - 1);
    const gold = Math.round((40 + idx * 25) * scale);
    const xp = Math.round((30 + idx * 20) * scale);
    const chestByMap = ["mossbound", "mossbound", "barrowed", "barrowed", "warrenspun", "warrenspun", "heartwrought"];
    return {
        gold,
        xp,
        parts: kind === "forge" ? 0 : Math.max(1, Math.round(2 * Math.pow(1.2, m - 1))),
        chest: last ? chestByMap[Math.min(chestByMap.length - 1, m - 1)] : null,
    };
}

/** Deterministic pick so a chain names the same creature every time it is read. */
const pick = (list, seed) => (list.length ? list[Math.abs(seed) % list.length] : null);

/** The full, resolved chain for one NPC: every step with its real target, size and reward. */
export function questsFor(npcId) {
    const npc = GROVE_NPCS.find((n) => n.id === npcId);
    if (!npc) return [];
    const shape = CHAINS[npcId] || [];
    const t = mapTargets(npc.map);
    const zoneBase = (npc.map - 1) * 12;

    return shape.map(([kind, mult, title], i) => {
        const seed = npcId.charCodeAt(0) * 31 + i * 7 + npc.map;
        const n = stepSize(kind, npc.map, mult);
        const step = {
            id: `${npcId}_${i + 1}`,
            npc: npcId, map: npc.map, idx: i, title, kind, need: n,
            reward: stepReward(kind, npc.map, i, i === shape.length - 1),
        };
        if (kind === "cull") step.foe = pick(t.foes, seed);
        if (kind === "hunt") step.foe = pick(t.bosses, seed);
        if (kind === "harvest" || kind === "forge") step.part = pick(t.parts, seed);
        if (kind === "delve") step.zone = zoneBase + Math.min(12, n);
        if (kind === "survive") step.zone = zoneBase + Math.min(12, 4 + i * 2);
        if (kind === "ticket") step.wave = n;
        return step;
    });
}

/** Every NPC on a map, with the zone they stand in and their resolved chain. */
export function npcsOnMap(map) {
    const zones = NPC_ZONES[Number(map)] || [];
    return GROVE_NPCS.filter((n) => n.map === Number(map)).map((n, i) => ({
        ...n, zone: (Number(map) - 1) * 12 + zones[i], chain: questsFor(n.id),
    }));
}
