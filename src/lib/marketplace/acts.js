// ── THE ACT BOARDS — THE RAMP THAT REPLACES THE GUIDE ────────────────────────────────────────────────────────
// Luke: "in each town, there'd be a building you can click to basically see what your quests are for that act.
// So let's start calling them acts. Act 1, 2, all the way up to 7. And you have these quests, and they guide
// you through the systems to help you kind of achieve competency in them."
//
// And on their shape: "The quests aren't repeatable either... let's just have them be in order. So once you do
// one, you unlock the next one. And they'll reward you with relevant passive buffs to each system that they're
// all about."
//
// ⚠️ THIS IS NOT THE BADGE SYSTEM AND MUST NOT BECOME IT. Badges are 298 hidden achievements that reward you
// for having done something; they are engagement and they stay exactly as they are. An act ladder is POSTED,
// ORDERED and TEACHING — you read it before you act, and it is about the systems the act just unlocked.
//
// ⚠️ AND IT IS NOT THE DAILY QUESTS EITHER. quests.js and town-quests.js are both daily, rotating and
// repeatable. These are one-time and permanent; built on either of those the ramp would reset every morning,
// which is the opposite of a ramp.
//
// ── HOW PROGRESS IS MEASURED, AND WHY NOTHING NEEDED INSTRUMENTING ───────────────────────────────────────────
// Every rung counts rows in `mkt_activity_event`, which the game has been writing for months: mine_trip,
// ore_smelted, craft_enhance, craft_salvage, plant_seed, harvest_crop, cooked, fish_caught, sail_wave,
// delve_clear, arena_win, boss_attack, equip, pet_farm. So a quest is a COUNT OF A THING THE PLAYER ALREADY
// DID, and adding one touches no call site anywhere in the game. A counter bumped from twenty places is twenty
// places that can drift; a query over an event log cannot.
//
// ── AND THE REWARD FEEDS A CHANNEL THAT ALREADY EXISTS ───────────────────────────────────────────────────────
// ⚠️ `groveToolPct(buyerId, slot)` is already read by arena, boss, cooking, crafting, delves, delve-floors,
// mining, farm, fishing and sailing — a per-player, per-system percentage with a dozen live read points. Act
// perks are summed into THAT, so every one of those systems picks them up with no new wiring and the game does
// not grow a fifth stat source. The repo's own scar: combat already reads four, and a fifth that some callers
// forget is how a bonus silently applies in half the game.

/** slot → the system it quietly makes better. Mirrors grove-maps' TOOL_ROLES; named here for readability. */
export const PERK_SYSTEM = {
    rod: "fishing", pick: "mining", shovel: "digging", hammer: "the forge", hoe: "the farm",
    sextant: "sailing", knife: "the kitchen", collar: "your pets", lantern: "delves",
    loupe: "gems", banner: "the arena", horn: "the boss",
};

/**
 * Seven acts, each a short ordered ladder about the systems that act unlocks.
 *
 * ⚠️ THE LAST RUNG OF AN ACT IS THE COMPETENT MOVE, not the biggest number. Luke wants beginner →
 * knowledgeable → competent, so each ladder ends on the thing a player who has understood the system would do
 * without being told — salvage what you will not wear, cook for the pet rather than for yourself, take the
 * fight you can now win.
 *
 * `event` + `need` are counted straight out of mkt_activity_event. `perk` is slot + percentage points.
 */
export const ACTS = [
    {
        n: 1, town: "rootwood", name: "Act I — The Rootwood",
        blurb: "A hero, a companion, and the trees.",
        quests: [
            { key: "a1_kill", title: "Walk into the Grove", desc: "Kill twenty wanderers.", event: "swarm_kill", need: 20, perk: { slot: "collar", pct: 2 } },
            { key: "a1_equip", title: "Wear what drops", desc: "Equip a piece of gear.", event: "equip", need: 1, perk: { slot: "collar", pct: 2 } },
            { key: "a1_pet", title: "Keep company", desc: "Pet a companion five times.", event: "pet_farm", need: 5, perk: { slot: "collar", pct: 3 } },
            { key: "a1_chest", title: "Open what you earn", desc: "Open three chests.", event: "open_chest", need: 3, perk: { slot: "collar", pct: 3 } },
        ],
    },
    {
        n: 2, town: "deepdelve", name: "Act II — The Undercave",
        blurb: "Everything here is raw until you work it.",
        quests: [
            { key: "a2_trip", title: "Go down", desc: "Send a mining trip.", event: "mine_trip", need: 1, perk: { slot: "pick", pct: 2 } },
            { key: "a2_ore", title: "Come back heavier", desc: "Bring up fifteen ore.", event: "ore_mined", need: 15, perk: { slot: "pick", pct: 3 } },
            { key: "a2_smelt", title: "Make it useful", desc: "Smelt five bars.", event: "ore_smelted", need: 5, perk: { slot: "hammer", pct: 2 } },
            { key: "a2_enhance", title: "Put it into something", desc: "Enhance a piece of gear three times.", event: "craft_enhance", need: 3, perk: { slot: "hammer", pct: 3 } },
            { key: "a2_salvage", title: "Let the rest go", desc: "Salvage five pieces you will not wear.", event: "craft_salvage", need: 5, perk: { slot: "hammer", pct: 3 } },
        ],
    },
    {
        n: 3, town: "fenhollow", name: "Act III — The Sunken Fen",
        blurb: "Grow it, cook it, feed it to something.",
        quests: [
            { key: "a3_plant", title: "Put something in the ground", desc: "Plant six seeds.", event: "plant_seed", need: 6, perk: { slot: "hoe", pct: 2 } },
            { key: "a3_harvest", title: "Come back for it", desc: "Harvest six crops.", event: "harvest_crop", need: 6, perk: { slot: "hoe", pct: 3 } },
            { key: "a3_cook", title: "Turn it into a meal", desc: "Cook three dishes.", event: "cooked", need: 3, perk: { slot: "knife", pct: 3 } },
            { key: "a3_feed", title: "Feed somebody else", desc: "Pet ten companions on other farms.", event: "pet_other", need: 10, perk: { slot: "knife", pct: 3 } },
        ],
    },
    {
        n: 4, town: "saltwrack", name: "Act IV — The Saltwrack Coast",
        blurb: "The long game: send it out, come back later.",
        quests: [
            { key: "a4_sail", title: "Put to sea", desc: "Ride out ten waves.", event: "sail_wave", need: 10, perk: { slot: "sextant", pct: 2 } },
            { key: "a4_fish", title: "Work the water", desc: "Land eight fish.", event: "fish_caught", need: 8, perk: { slot: "rod", pct: 3 } },
            { key: "a4_dig", title: "Bring something up", desc: "Dig up what the voyage found.", event: "open_chest", need: 8, perk: { slot: "shovel", pct: 3 } },
            { key: "a4_cast", title: "Keep a line in", desc: "Land twenty-five fish.", event: "fish_caught", need: 25, perk: { slot: "rod", pct: 4 } },
        ],
    },
    {
        n: 5, town: "drownedquay", name: "Act V — The Drowned Ruins",
        blurb: "Things down here can beat you. That is the point.",
        quests: [
            { key: "a5_delve", title: "Go in", desc: "Start three delves.", event: "delve_start", need: 3, perk: { slot: "lantern", pct: 2 } },
            { key: "a5_clear", title: "Come back out", desc: "Clear three delves.", event: "delve_clear", need: 3, perk: { slot: "lantern", pct: 3 } },
            { key: "a5_socket", title: "Cut something into your gear", desc: "Use five consumables in a run.", event: "use_consumable", need: 5, perk: { slot: "loupe", pct: 3 } },
            { key: "a5_deep", title: "Go deeper than is comfortable", desc: "Clear ten delves.", event: "delve_clear", need: 10, perk: { slot: "loupe", pct: 4 } },
        ],
    },
    {
        n: 6, town: "gilded", name: "Act VI — The Gilded Waste",
        blurb: "Other people's money, and the odds.",
        quests: [
            { key: "a6_spin", title: "Take the free one", desc: "Spin the daily wheel three times.", event: "daily_spin", need: 3, perk: { slot: "shovel", pct: 3 } },
            { key: "a6_floor", title: "Walk the floor", desc: "Play twenty rounds in the casino.", event: "casino_play", need: 20, perk: { slot: "shovel", pct: 3 } },
            { key: "a6_deco", title: "Settle in", desc: "Arrange five decorations.", event: "arrange_deco", need: 5, perk: { slot: "hoe", pct: 4 } },
            { key: "a6_stock", title: "Have a say", desc: "Take part in the stockade.", event: "stockade_act", need: 1, perk: { slot: "collar", pct: 4 } },
        ],
    },
    {
        n: 7, town: "ashfall", name: "Act VII — The Ashen Reach",
        blurb: "Now the Den finds out what you built.",
        quests: [
            { key: "a7_arena", title: "Step into the ring", desc: "Start five arena fights.", event: "arena_start", need: 5, perk: { slot: "banner", pct: 3 } },
            { key: "a7_win", title: "Win one", desc: "Win three arena fights.", event: "arena_win", need: 3, perk: { slot: "banner", pct: 4 } },
            { key: "a7_boss", title: "Hit the thing everyone is hitting", desc: "Land twenty-five blows on the weekly boss.", event: "boss_attack", need: 25, perk: { slot: "horn", pct: 4 } },
            { key: "a7_rank", title: "Stand in the ladder", desc: "Win ten arena fights.", event: "arena_win", need: 10, perk: { slot: "horn", pct: 5 } },
        ],
    },
];

/** Every quest, flat, keyed — so a progress row or a perk grant can resolve one without walking the acts. */
export const QUEST_BY_KEY = Object.fromEntries(
    ACTS.flatMap((a) => a.quests.map((q, i) => [q.key, { ...q, act: a.n, town: a.town, idx: i }])),
);

/** The act whose town this is. */
export const actForTown = (townId) => ACTS.find((a) => a.town === townId) || null;

/**
 * Which rung of an act is OPEN, given what has been claimed.
 *
 * ⚠️ ONE AT A TIME, AND THE ORDER IS THE TEACHING. Luke: "once you do one, you unlock the next one." Showing
 * the whole ladder as available would let a player skip to the last rung, which is the one that only makes
 * sense after the first four — the ladder IS the explanation, so the order is load-bearing rather than tidy.
 * Later rungs stay VISIBLE (that is the point of a posted board) but locked.
 */
export function actProgress(act, claimedKeys) {
    const claimed = new Set(claimedKeys || []);
    const rungs = act.quests.map((q, i) => ({
        ...q,
        idx: i,
        claimed: claimed.has(q.key),
        // Open when every rung before it is claimed. The first rung of an act is open the moment the act is.
        open: act.quests.slice(0, i).every((p) => claimed.has(p.key)),
    }));
    return { rungs, done: rungs.every((r) => r.claimed), next: rungs.find((r) => r.open && !r.claimed) || null };
}
