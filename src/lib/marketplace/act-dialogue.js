// ── WHAT THE SEVEN OF THEM ACTUALLY SAY ──────────────────────────────────────────────────────────────────────
// Luke: "I was hoping for like dialogue where they tell you about the problem they're having and then the
// solution, and then you get the quest... We're trying to make this immersive, right? The Grove isn't just a
// feature. It's a full-on game."
//
// The act ladders were already the right SHAPE — ordered, one-time, one rung open at a time, paying passive
// perks rather than gold. What they had no version of was the part that makes a quest a quest: somebody with
// a problem, asking. A board cannot have a problem. So every rung gets four beats:
//
//   problem   why they are asking. Said before you take it, in their own register.
//   ask       the actual job, in one line. This is the sentence the player has to remember.
//   nudge     what they say if you come back without it. One line, never a scold.
//   done      the payoff. Beat one is "you did it"; beat two is what it MEANT — which is where the
//             teaching lives, because a lesson lands after the work and never before it.
//
// ⚠️ THE SEVEN NAMES AND VOICES ARE NOT MINE TO INVENT. town-hunts.js already named them — The Ranger, The
// Mine Captain, The Bog-Reader, The Harbourmaster, The Ruin-Diver, The Caravan-Master, The Ash-Warden — and
// its own note explains why they are ROLES and not personal names: the art for each was drawn from that
// description, so the role is a caption for a picture that exists. It also already gave each of them one
// greeting line in a distinct register, because the Quartermaster's "do the town a service, wolf" had been
// appearing under all seven names and made seven characters sound like one person in different coats.
//
// These are written to continue those seven registers, not to start new ones:
//
//   The Ranger          warm, plain, short sentences. Teaching somebody who arrived this morning.
//   The Mine Captain    blunt, industrial, counts things. Does not waste a word and does not flatter.
//   The Bog-Reader      oblique. Treats the water as a person with opinions. Half-omens.
//   The Harbourmaster   brisk and administrative. Tides, berths, the book. Faintly tired of captains.
//   The Ruin-Diver      quiet and careful. Talks about the dead in the plural and the danger in the singular.
//   The Caravan-Master  mercantile. Everything is a transaction, a price, or odds.
//   The Ash-Warden      clipped. Duty, the wall, your share of it.
//
// ⚠️ AND THE LAST BEAT OF THE LAST RUNG OF AN ACT CARRIES THE ACT. acts.js says the last rung is "the
// competent move" — so its `done` is the only place allowed to say out loud what the act was teaching.

/** Said when you walk up and they have the next rung waiting, before the problem. One per town. */
export const HAIL = {
    rootwood: "You're still standing. Good — I've got something.",
    deepdelve: "You. Yes, you. Come here a minute.",
    fenhollow: "The water said somebody was coming. It was right, for once.",
    saltwrack: "You'll do. Got a minute? You've got a minute.",
    drownedquay: "Careful where you put your feet. Right — listen.",
    gilded: "Ah. A face I can do business with.",
    ashfall: "Warden. Report in a moment — first, this.",
};

/** Said when the ladder is finished and there is nothing left to give. */
export const FAREWELL = {
    rootwood: "Nothing left from me. The trees go on a long way — go and see how far.",
    deepdelve: "That's my list done. Shaft's yours whenever you want it.",
    fenhollow: "The water's got nothing more to say about you. That's the best it ever says about anyone.",
    saltwrack: "Book's clear. Berth's yours whenever the tide suits.",
    drownedquay: "Nothing more from me. You know the way down better than I do now.",
    gilded: "Our business is concluded, and profitably. Mine, anyway.",
    ashfall: "The Reach is done. Stand easy — the wall still needs holding tomorrow.",
};

/** Said the moment a rung is accepted, under the QUEST RECEIVED plate. One per town, their own send-off. */
export const ACCEPTED = {
    rootwood: "Off you go. I'll be here.",
    deepdelve: "Right. Don't come back empty.",
    fenhollow: "Go on, then. The fen's watching either way.",
    saltwrack: "Marked in the book. Mind the tide.",
    drownedquay: "Go carefully. Come back up.",
    gilded: "Pleasure doing business. Terms as agreed.",
    ashfall: "Dismissed. Make it count.",
};

// ── THE TWENTY-NINE RUNGS ────────────────────────────────────────────────────────────────────────────────────
export const LINES = {
    // ── ACT I · THE RANGER ───────────────────────────────────────────────────────────────────────────────
    a1_kill: {
        problem: [
            "You came up the trail, so you've already met them. Wanderers.",
            "They don't go around you. They come at you. And I can't keep the path open on my own any more.",
        ],
        ask: "Go into the trees and put down twenty of them. Don't be clever about it — just go.",
        nudge: "Still twigs breaking out there. Keep at it.",
        done: [
            "Twenty. That's the quietest the path has been in a month.",
            "You'll have picked things up off them. We'll come to that.",
        ],
    },
    a1_equip: {
        problem: [
            "You're still wearing what you walked in with.",
            "That's how people leave here on a board, and I've carried enough boards.",
        ],
        ask: "Open your pack and put something on. Anything is better than nothing.",
        nudge: "It does you no good in the bag.",
        done: [
            "There. Now you look like somebody who intends to come back.",
            "Gear isn't a trophy. It's a decision you make before the fight, not during it.",
        ],
    },
    a1_pet: {
        problem: [
            "Something's been following you since the treeline. No — don't reach for the blade.",
            "It's yours, if you want it. They choose you. Never the other way round.",
        ],
        ask: "Spend some real time with it. Five goes. It'll know the difference.",
        nudge: "It's still waiting on you, you know.",
        done: [
            "See that? It's stopped watching the trees and started watching you.",
            "Out here that's worth more than another sword.",
        ],
    },
    a1_chest: {
        problem: [
            "You've chests piling up and you've not opened one.",
            "I've seen folk die rich and useless. Don't be the next.",
        ],
        ask: "Open three of them. Today. Sealed, they're no good to anybody.",
        nudge: "They won't open themselves.",
        done: [
            "Good. And that's the whole loop, start to finish — walk out, come back heavier, use what you brought.",
            "That's the Grove. Everything after this is the same thing with bigger trees.",
        ],
    },

    // ── ACT II · THE MINE CAPTAIN ────────────────────────────────────────────────────────────────────────
    a2_trip: {
        problem: [
            "Half my crew won't go past the second gallery. Says the props are singing.",
            "Props don't sing. Props creak, and then they drop.",
        ],
        ask: "Take a trip down. One. I want it from somebody who isn't frightened.",
        nudge: "Shaft's still there. So's the ladder.",
        done: [
            "Back in one piece. More than the last three managed.",
            "Now you've been down it, you'll stop thinking of it as a hole.",
        ],
    },
    a2_ore: {
        problem: ["A trip's a trip. A trip that comes up empty is a walk."],
        ask: "Fifteen ore on the cart. I don't care which seam it came out of.",
        nudge: "Cart's still light.",
        done: [
            "Fifteen. Weigh it yourself if you like — I don't argue with the scale.",
            "Rock stays rock until somebody bothers to carry it.",
        ],
    },
    a2_smelt: {
        problem: ["You're hauling stone about like it's treasure. It isn't. It's stone."],
        ask: "Fire the furnace and pour five bars. Then you'll have something.",
        nudge: "Furnace is cold.",
        done: [
            "Five bars. First thing you've made that anybody else would want.",
            "Ore is what the mountain gave you. A bar is what you did about it.",
        ],
    },
    a2_enhance: {
        problem: ["Bars stacked in a vault are a slow way of owning nothing."],
        ask: "Take them to the anvil and put them into something you actually wear. Three times.",
        nudge: "Anvil's not busy. You are.",
        done: [
            "Better. Heavier where it ought to be.",
            "That's the difference between a smith and a man holding a hammer — a smith decides what gets the metal.",
        ],
    },
    a2_salvage: {
        problem: [
            "Your pack's full of gear you'll never put on.",
            "Every one of those is a decision you've been putting off.",
        ],
        ask: "Break five of them down. You'll want the parts more than the clutter.",
        nudge: "Still carrying the lot, I see.",
        done: [
            "That's the trade entire, that is. Dig it up, melt it down, put it into the one piece that matters, let the rest go.",
            "You can come down my shaft any day of the week.",
        ],
    },

    // ── ACT III · THE BOG-READER ─────────────────────────────────────────────────────────────────────────
    a3_plant: {
        problem: [
            "The water's gone quiet over your plot. That isn't peace.",
            "That's nothing growing. And quiet ground forgets what it's for.",
        ],
        ask: "Six seeds in the dirt. The fen will decide what it does with them.",
        nudge: "Ground's still bare. It has noticed.",
        done: [
            "There. Listen — it's started talking again.",
            "A thing in the soil is a promise. The fen keeps promises, in its own time.",
        ],
    },
    a3_harvest: {
        problem: ["You put them in and walked off. Everything out here takes that personally."],
        ask: "Go back for them. Six, out of the ground and in your hands.",
        nudge: "They're ready. You're not there.",
        done: [
            "Six. Heavy ones, too.",
            "Planting is hope. Harvest is the part where you turn up.",
        ],
    },
    a3_cook: {
        problem: ["Raw is just ingredients. I've watched people starve carrying a sack of turnips."],
        ask: "Light a fire. Three dishes, properly made.",
        nudge: "Pot's cold.",
        done: [
            "Smells right. That's how you know.",
            "Anybody can grow. Cooking is the first time you've asked what it was FOR.",
        ],
    },
    a3_feed: {
        problem: [
            "You cook for yourself and you eat alone. The fen notices that as well.",
            "There are beasts on other plots out there that haven't been looked at in a week.",
        ],
        ask: "Go to ten of them. Other people's. Lay a hand on them.",
        nudge: "Still some way short of generous.",
        done: [
            "That's the part nobody teaches.",
            "The water's louder round your plot now. Things grow where people stop walking past.",
        ],
    },

    // ── ACT IV · THE HARBOURMASTER ───────────────────────────────────────────────────────────────────────
    a4_sail: {
        problem: ["You've stood on my quay a week looking at the horizon. That isn't sailing, that's weather."],
        ask: "Take a hull out and ride ten waves. I'll mark you in the book.",
        nudge: "Berth's still full. Yours.",
        done: [
            "Ten. Logged.",
            "The sea doesn't care how you feel about it. Some people find that restful.",
        ],
    },
    a4_fish: {
        problem: ["Crossing water isn't using it. Half my captains would starve on a full ocean."],
        ask: "Eight fish on the deck. Then you've used it.",
        nudge: "Nets are dry.",
        done: [
            "Eight. Decent ones.",
            "A boat that only carries you is a cart that gets wet.",
        ],
    },
    a4_dig: {
        problem: ["Voyages come back with marks on the chart and nobody ever walks out to them."],
        ask: "Whatever the voyage turned up — go and open it. Eight.",
        nudge: "Marks on the chart. Nothing dug.",
        done: [
            "That's the back half of the trade. Sailing finds it; digging collects it.",
            "Most captains only ever do the front half, then wonder why they're poor.",
        ],
    },
    a4_cast: {
        problem: ["You fish when you remember to. The ones who live by it fish when they don't feel like it."],
        ask: "Twenty-five. Not in one go — just keep a line in the water.",
        nudge: "Line's out of the water again.",
        done: [
            "Twenty-five. You've stopped waiting for the sea to be interesting.",
            "That's the whole profession, that is. Turning up on the dull days.",
        ],
    },

    // ── ACT V · THE RUIN-DIVER ───────────────────────────────────────────────────────────────────────────
    a5_delve: {
        problem: [
            "People talk about down there like it's a story. It isn't.",
            "It's a building that filled up with water, with everyone still in it.",
        ],
        ask: "Go in three times. You don't have to finish — I want you to know the doorway.",
        nudge: "Doorway's where you left it.",
        done: [
            "Three. And you came back up each time, which is the only number I keep.",
            "It's a place now. That's a different thing from a rumour.",
        ],
    },
    a5_clear: {
        problem: ["Going in is easy. Anyone can fall down a stairwell."],
        ask: "Finish three. All the way to the bottom, and back.",
        nudge: "Half a dive doesn't count. Not to me, and not to it.",
        done: [
            "Three cleared. You've seen the shape of it now.",
            "They repeat down there. Once you know the shape you stop being surprised — and surprise is the thing that kills.",
        ],
    },
    a5_socket: {
        problem: [
            "You go down carrying everything and using nothing.",
            "I've brought bodies up with full packs. Every time.",
        ],
        ask: "Next run, actually spend something. Five of them.",
        nudge: "Pack's still full.",
        done: [
            "Good. A potion you died holding is a potion you wasted.",
            "Down here, carrying it is not the same as having it.",
        ],
    },
    a5_deep: {
        problem: ["Three was learning. Ten is where it stops being new and starts being work."],
        ask: "Ten cleared. Then I'll call you a diver.",
        nudge: "Still counting.",
        done: [
            "Ten. All right.",
            "You go down on purpose now. Most never get past going down because somebody told them to.",
        ],
    },

    // ── ACT VI · THE CARAVAN-MASTER ──────────────────────────────────────────────────────────────────────
    a6_spin: {
        problem: [
            "There's a wheel at the end of this road that costs nothing to turn, and you walk straight past it.",
            "Free is a price. It's the best one there is.",
        ],
        ask: "Three spins. It's a gift, and refusing a gift is its own sort of arrogance.",
        nudge: "Wheel's still there. Still free.",
        done: [
            "Three. Cost you nothing, exactly as advertised.",
            "Take the free thing. Always take the free thing.",
        ],
    },
    a6_floor: {
        problem: [
            "Now the part that isn't free. The floor.",
            "I won't tell you it's a good idea. I'll tell you it has rules, and the rules are knowable.",
        ],
        ask: "Twenty rounds. Watch what comes up more often than it should, and what comes up less.",
        nudge: "Twenty rounds. You've not finished looking.",
        done: [
            "Twenty — and you can still pay for your room, which puts you ahead of most.",
            "The house has an edge. Knowing its size is the whole difference between a player and a mark.",
        ],
    },
    a6_deco: {
        problem: [
            "You've money now, and nowhere that looks like yours.",
            "Gold in a vault is a number. I've never once seen a number cheer anybody up.",
        ],
        ask: "Spend some of it on nothing useful. Five pieces, arranged however you like.",
        nudge: "Place is still bare.",
        done: [
            "Better. It's yours now, which it wasn't last week.",
            "That's what the money is FOR. The rest of it is just carrying it about.",
        ],
    },
    a6_stock: {
        problem: ["Last thing. There's a vote going on back in the first town, and you've never once cast one."],
        ask: "Go and have your say. However you like — just have it.",
        nudge: "Vote's still open.",
        done: [
            "Noted. You're not a customer any more, you're a resident.",
            "Only took you six towns.",
        ],
    },

    // ── ACT VII · THE ASH-WARDEN ─────────────────────────────────────────────────────────────────────────
    a7_arena: {
        problem: [
            "Everything you've fought until now was simply in your way.",
            "None of it wanted to beat YOU. That stops here.",
        ],
        ask: "Five bouts. I don't care how they end.",
        nudge: "Five. You've not stood in it enough times yet.",
        done: [
            "Five. Now you know what it is to be looked at.",
            "Different from the forest, isn't it.",
        ],
    },
    a7_win: {
        problem: ["Standing in the ring is attendance. I don't keep a register."],
        ask: "Win three.",
        nudge: "Still short.",
        done: [
            "Three, and earned — I watched two of them.",
            "Everything you did in the other six towns arrives here. The gear, the bars, the food, the lantern. All of it was for this.",
        ],
    },
    a7_boss: {
        problem: [
            "There's a thing that comes at the wall that nobody kills alone.",
            "Every week it comes. Every week the whole Den hits it, and every week the wall holds.",
        ],
        ask: "Twenty-five blows. Your share of it.",
        nudge: "It's still standing, and you're still counting.",
        done: [
            "Twenty-five. You'll not see your name on it — that's rather the point of a wall.",
            "Held things are held by the people who turn up.",
        ],
    },
    a7_rank: {
        problem: [
            "Last one. There's a ladder, with names on it.",
            "Most of them have been up there a long while and have got comfortable.",
        ],
        ask: "Ten wins. Then the ladder has to make room.",
        nudge: "The ladder isn't going to move on its own.",
        done: [
            "Ten. That's the Reach done, and the seven towns with it.",
            "You came up the trail at the waystation with nothing on and no idea which end of a pick to hold. Go and look at the ladder now.",
        ],
    },
};

/** The four beats for a rung, or a usable default if one is ever added to acts.js without dialogue. */
export function linesFor(questKey, townId, fallbackDesc = "") {
    const l = LINES[questKey];
    if (l) return l;
    // ⚠️ A RUNG WITH NO DIALOGUE STILL HAS TO BE PLAYABLE. It reads flat rather than broken, and the ask is
    // the quest's own description — which is always written, because acts.js cannot define a rung without it.
    return {
        problem: [HAIL[townId] || "There's something that wants doing."],
        ask: fallbackDesc || "See it done.",
        nudge: "Not yet.",
        done: ["That's it done.", "Good."],
    };
}
