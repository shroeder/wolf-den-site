// ── THE BRIG ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "maybe you can capture captains. and interrogate them like a mini game, and you can get them to
// confess after you get a few of them and depending on the star rating of the captain helps determine the
// quality of the island you sail to."
//
// Sinking a ship ended a fight and paid a purse. Taking her CAPTAIN starts something: he goes in a berth, he
// knows where something is, and he will not say. The loop is
//
//     beat an NPC ship  ->  her captain is on your deck  ->  interrogate him  ->  he says where it is
//
// ⚠️ HE IS NOT COLLECTED, AND HE USED TO BE. Luke: "I dont think we need to collect enemy captains. We just
// use them as a way to get the location of treasure. Its transient, a stepping stone, not collected."
//
// So the berths are gone, and with them everything a collection needs: buying him off his own deck, four
// cells to keep him in, a ransom to send him home, a release to let him go, and three confessions saved up
// to make one chart. He arrives free, you interrogate him on the spot, and he leaves either way — with a
// chart if he broke and with nothing if he did not. One man, one interrogation, one answer.
//
// PURE ON PURPOSE, like ship-battle.js and gun-ports.js next door: no database, no imports with side effects.
// The interrogation is a rules puzzle and a rules puzzle you cannot run in a test is a rules puzzle nobody can
// balance. Every function here takes state and returns state; captains-store.js is the half that persists it.
//
// ⚠️ OWNER-GATED. See `CAPTAINS_PUBLIC` at the bottom and the note beside it.

import { FLEET, MAX_FLEET_RANK } from "@/lib/marketplace/fleet.js";

// ── HER CAPTAIN, OR HER HOLD ─────────────────────────────────────────────────────────────────────────────────
// Taking him has to COST something or it is not a choice, it is a button you press after every win. He costs
// the purse: the doubloons you just took out of her are what it takes to feed, guard and berth a man who does
// not want to be there.
//
// ⚠️ THE WIN IS PAID IN FULL, ALWAYS, AND THE OFFER SITS ON TOP OF IT. The first shape of this held the whole
// reward back until the player chose "sink her" or "board her" — which would have been a battle that ends
// owing you money, in a feature whose one existing state column has already stranded people. So the battle
// pays exactly what it pays today and never waits for anybody, an OFFER row is written beside it, and taking
// him is a separate, later, entirely optional purchase that can fail without costing anyone a reward.
//
// It is priced at what he would pay to be let go — see ransomFor. So the arithmetic in front of the player is
// clean: keeping him costs precisely what releasing him would return, and every doubloon of that is bet on
// getting a confession out of him instead.
// ⚠️ THERE IS NO WINDOW AND NO WAY TO LOSE HIM. He used to stand on the deck for thirty minutes and then go
// over the side, and OFFER_MINUTES is gone with that. Luke: "There's no risk to be on two because you can only
// ever be on one. It's blocking ... You can't move on from sailing until you interrogate them." A timer on a
// blocking step is a trap rather than tension — the only thing it can do is punish somebody for closing a tab.

// ⚠️ HE COSTS NOTHING. Taking him used to cost exactly what releasing him would have paid, which was the
// right shape for a thing you KEEP — a berth is a decision and a decision needs a price. He is a step on the
// way to the treasure now, so charging for the step is charging twice for the same island.

// ── HOW MUCH A CAPTAIN IS WORTH ──────────────────────────────────────────────────────────────────────────────
// Stars come off the rung he was commanding, in five bands of eight. They are the only number the player sees
// and they drive all three things that matter: how hard he is to break, what his confession is worth, and what
// he will pay to be let go.
export const MAX_STARS = 5;
export const starsForRank = (rank) => Math.max(1, Math.min(MAX_STARS, Math.ceil(Math.max(1, Number(rank) || 1) / 8)));

/** The four berths. Scarcity is the whole reason a capture is a decision rather than a habit. */
// ONE AT A TIME. Not a capacity — a queue of one, because the interrogation is the moment after the battle
// and there is no version of this where two of them are standing on your deck at once.
export const BRIG_BERTHS = 1;

// ── WHAT HE IS ───────────────────────────────────────────────────────────────────────────────────────────────
// Rolled at capture, not authored per ship — a captain you have taken before must not be a captain you already
// know the answer to. What IS authored is the tell (below), which is how you read him without a table.
export const DISPOSITIONS = {
    proud: {
        id: "proud", name: "Proud",
        broke: "He tells you where it is the way a man corrects a subordinate. He wanted you to know he knew.",
    },
    frightened: {
        id: "frightened", name: "Frightened",
        broke: "It comes out in a rush, most of it twice, and he keeps asking whether that is enough.",
    },
    greedy: {
        id: "greedy", name: "Greedy",
        broke: "He names his price, you agree, and he talks. He seems pleased with the deal.",
    },
    loyal: {
        id: "loyal", name: "Loyal",
        broke: "He says it flatly, to the floor, and asks that it be written down that he was made to.",
    },
};
export const DISPOSITION_IDS = Object.keys(DISPOSITIONS);

// ── WHAT YOU CAN DO TO HIM ───────────────────────────────────────────────────────────────────────────────────
export const TACTICS = {
    bluff: {
        id: "bluff", name: "Bluff", icon: "GiCardRandom",
        blurb: "Tell him you already have it, and that his own crew is the reason.",
    },
    offer: {
        id: "offer", name: "Offer", icon: "GiTwoCoins",
        blurb: "Name a number. Everything after that is haggling.",
    },
    confront: {
        id: "confront", name: "Confront", icon: "GiPrisoner",
        // ⚠️ IT USED TO NEED A SECOND PRISONER, and it was the reason the brig had four berths. With no
        // collection there is never a second prisoner, so the one tactic that reaches a LOYAL man would have
        // been unplayable forever — the puzzle would have lost a column and one disposition would have become
        // a dead end. It is his own CREW now, which you have by definition: you just took their ship.
        blurb: "Walk one of his own crew past the door and let him hear what they have already said.",
    },
    wait: {
        id: "wait", name: "Wait", icon: "GiSandsOfTime",
        blurb: "Say nothing. Leave him with the dark and his own arithmetic.",
    },
};
export const TACTIC_IDS = Object.keys(TACTICS);

// ── THE TABLE ────────────────────────────────────────────────────────────────────────────────────────────────
// crack = he gives ground. harden = he gets a grip and it costs you double. read = nothing moves, but you
// learn something, which on the first move is worth more than a crack.
//
// ⚠️ EXACTLY TWO CRACKS EACH, AND THAT IS NOT DECORATION — IT IS THE FIX FOR A BROKEN FIRST DRAFT.
// The first table gave frightened three cracking tactics, proud two, and greedy and loyal one apiece. Solved
// exhaustively (scripts/brig-solve.mjs) that came out as: frightened breakable at five stars in six cheap
// moves, and greedy and loyal at four and five stars IMPOSSIBLE — no line exists, with a full brig, ever. A
// disposition is ROLLED, so that hands the outcome to the dice rather than to the player: draw the wrong man
// off a rung you fought forty battles to reach and he simply cannot be broken by anybody.
//
// Two cracks, one read, one harden for everybody. Difficulty then comes from STARS, which is the number the
// player earned, and never from which of four hidden words he happened to draw.
//
// The signatures stay distinct, which is what keeps it a puzzle: a Bluff separates greedy (read) and loyal
// (harden) from the other two in one move, and an Offer then splits proud (harden) from frightened (crack).
//
// ⚠️ AND CONFRONT IS A CRACK FOR EXACTLY TWO OF THEM, NEVER AS THEIR ONLY ONE. Proud also breaks to a Bluff
// and loyal also breaks to a Wait, so a captain alone in the brig is never unbreakable — he is just slow,
// because his one available crack has to be padded with a read and that doubles the nerve per point of will.
// Which is precisely the shape Luke asked for: "you can get them to confess after you get a few of them."
const TABLE = {
    proud:      { bluff: "crack",  offer: "harden", confront: "crack",  wait: "read" },
    frightened: { bluff: "crack",  offer: "crack",  confront: "harden", wait: "read" },
    greedy:     { bluff: "read",   offer: "crack",  confront: "harden", wait: "crack" },
    loyal:      { bluff: "harden", offer: "read",   confront: "crack",  wait: "crack" },
};

export const outcomeOf = (disposition, tactic) => TABLE[disposition]?.[tactic] || "read";

/** What a tactic becomes when it is played twice running. See the note in interrogate. */
const DULLED = { crack: "read", read: "harden", harden: "harden" };

// What he does when you try it. Written per pair because "he hardens" twice in a row with the same sentence is
// how a puzzle stops being a person.
const SAID = {
    proud: {
        bluff: "“My crew.” He laughs once. “You have the wrong end of it, and I will not have you repeating it.” And he corrects you.",
        offer: "He looks at the coin, then at you, and does not speak again for a while.",
        confront: "He will not be spoken over by that man. He talks across him, and says more than he meant to.",
        wait: "He waits better than you do. When you come back he is composed and you are not.",
    },
    frightened: {
        bluff: "“They told you? They told you?” He is already filling in what he thinks you know.",
        offer: "He takes it before you have finished saying it.",
        confront: "Another man in the room and he shuts like a door. Whatever was coming is not coming now.",
        wait: "You leave him alone with it. He is no worse when you come back, and no better — he has spent the whole time rehearsing.",
    },
    greedy: {
        bluff: "He hears you out with some interest. “And?” Nothing given — but he is still in the conversation.",
        offer: "“That,” he says, “is a number.” And then he is talking.",
        confront: "He looks the other man over like stock, works out what he is worth, and decides he can wait longer than that.",
        wait: "Left alone, he starts doing sums. A man who thinks in money cannot sit still while it is not being made, and by morning he wants to talk terms.",
    },
    loyal: {
        bluff: "“No they did not.” Flat, certain, and now he knows you are guessing.",
        offer: "You have told him exactly what you think he is. He lets that sit there, and gives you nothing to go with it.",
        confront: "It is one of his own saying it. That is the only voice that could have.",
        wait: "He does not mind the dark — but he minds that nobody has come for him. Left long enough, that is the thing that says it out loud.",
    },
};
export const saidFor = (disposition, tactic) => SAID[disposition]?.[tactic] || "Nothing.";

/** Said when you run the same play at him twice. He has heard it, and now he knows you have only the one. */
const REPEATED = "He has heard this one. He waits for you to finish it before he says nothing.";

// ── THE TELL ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS IS WHAT KEEPS THE PUZZLE ALIVE ONCE THE TABLE IS LEARNT. A four-by-four grid is solved once and then
// it is arithmetic; what should separate players after that is whether they can READ the man in front of them.
// So every captain arrives with one line about how he came aboard, drawn from his own disposition, and a
// player who is paying attention opens with the right tactic instead of spending two moves finding it.
//
// It is a tell and not a label: each one is true of its disposition and none of them names it. Higher stars
// draw from the SLANTED set, which is true of two dispositions at once — a five-star captain should be able
// to be misread, or his stars are just a bigger number.
const TELLS = {
    proud: [
        "He came aboard under his own power and corrected the man holding his arm.",
        "He gave his rank before his name, and gave neither twice.",
        "He asked which ship had taken him, and looked disappointed by the answer.",
    ],
    frightened: [
        "He has not stopped watching the door since he came through it.",
        "He agreed to everything on the way down, including things nobody had asked.",
        "He keeps starting sentences and putting them down again.",
    ],
    greedy: [
        "He was found in his own hold and not on his own deck.",
        "He asked, before anything else, what the arrangement was.",
        "His coat is better than his ship was.",
    ],
    loyal: [
        "He would not come down until his people were off first.",
        "He has said one thing since he came aboard, and it was somebody else's name.",
        "He is not frightened and he is not angry. He is simply not going to.",
    ],
};
// Read two ways, on purpose. Only a four- or five-star captain draws from here.
const SLANTED = {
    proud: ["He is very calm for a man in a cell.", "He has not asked for anything."],
    loyal: ["He is very calm for a man in a cell.", "He has not asked for anything."],
    frightened: ["He talks more than he should, and none of it is the thing.", "He has been counting the hours out loud."],
    greedy: ["He talks more than he should, and none of it is the thing.", "He has been counting the hours out loud."],
};

export function tellFor(disposition, stars, roll = 0) {
    const slant = stars >= 4;
    const pool = (slant ? SLANTED[disposition] : TELLS[disposition]) || TELLS.proud;
    return pool[Math.abs(Math.floor(roll)) % pool.length];
}

// ── WHAT IT COSTS TO ASK ─────────────────────────────────────────────────────────────────────────────────────
// He has a WILL, which is how many times he has to give ground before he is done. You have NERVE, which is how
// many moves you get. Every attempt costs one; a move that hardens him costs two, because a wrong guess should
// be worse than a wasted one — otherwise the correct play is to try all four and read the results.
export const willFor = (stars) => 1 + Math.max(1, Math.min(MAX_STARS, stars));
export const NERVE = 8;
export const NERVE_COST = { crack: 1, read: 1, harden: 2 };

/** A fresh captive, ready to be written down. `disposition` and `tell` are rolled by the caller (seeded). */
export function newCaptive({ rank, art, name, stars, disposition, tell }) {
    return {
        v: 1, rank, art, name, stars,
        disposition,                 // ⚠️ HIDDEN. Never send this to the client until he is broken.
        tell,
        will: willFor(stars),
        nerve: NERVE,
        tried: [],                   // [{ tactic, outcome }] — the interrogation so far, which IS the puzzle's board
        status: "held",              // held | broken | spent   (spent = out of nerve, ransom or release only)
    };
}

/**
 * One move on one captive. Returns { captive, outcome, said, broke, spent, error }.
 *
 * `othersHeld` is how many OTHER captains are in the brig, which is the only thing Confront needs.
 */
export function interrogate(captive, tactic, othersHeld = 0) {
    if (!captive || captive.status !== "held") return { captive, error: "not_held" };
    if (!TACTICS[tactic]) return { captive, error: "no_tactic" };
    if (TACTICS[tactic].needsOther && othersHeld < 1) return { captive, error: "needs_other" };
    if (captive.nerve <= 0) return { captive, error: "spent" };

    // -- HE HAS HEARD THAT ONE ------------------------------------------------------------------------
    // ⚠️ WITHOUT THIS THE WHOLE PUZZLE IS "FIND THE CRACK, THEN PRESS IT SIX TIMES". Solved on paper before
    // a line of UI was written: optimal play against every disposition was one probe and then the same
    // button until he broke, with nerve to spare at five stars. A four-by-four table is only a puzzle if
    // you have to use more than one column of it.
    //
    // So a tactic repeated back-to-back lands worse than it did: a crack becomes a read, a read becomes a
    // harden. You alternate, which means a captain is broken by knowing TWO ways into him rather than one —
    // and since Confront is one of those ways for half the dispositions, it is also what makes a populated
    // brig worth more than a single prisoner.
    const last = (captive.tried || [])[(captive.tried || []).length - 1];
    const repeat = last?.tactic === tactic;
    const raw = outcomeOf(captive.disposition, tactic);
    const outcome = repeat ? DULLED[raw] : raw;
    const next = { ...captive, tried: [...(captive.tried || []), { tactic, outcome }] };
    next.nerve = Math.max(0, next.nerve - (NERVE_COST[outcome] || 1));
    if (outcome === "crack") next.will = Math.max(0, next.will - 1);

    const broke = next.will <= 0;
    // ⚠️ BREAKING WINS EVEN ON THE LAST BREATH. The crack is applied before nerve is checked, so a move that
    // costs your last nerve AND takes his last will is a win, not a draw. Checked in that order deliberately:
    // the other way round, the best interrogation in the game ends as a ransom.
    if (broke) next.status = "broken";
    else if (next.nerve <= 0) next.status = "spent";

    return {
        captive: next,
        outcome,
        said: repeat ? REPEATED : saidFor(captive.disposition, tactic),
        broke,
        spent: !broke && next.status === "spent",
    };
}

// ── WHAT HE PAYS TO GO HOME ──────────────────────────────────────────────────────────────────────────────────
// Luke's call: a captain you cannot break buys his own freedom. So a bad capture is never a berth you are
// simply stuck with — it is a worse outcome than a confession, which is the point, and not a dead loss.
export const ransomFor = (stars) => 40 * Math.max(1, Math.min(MAX_STARS, stars)) ** 2;

// ── THE CONFESSION, AND THE CHART ────────────────────────────────────────────────────────────────────────────
// A broken captain gives up one confession. Three of them make a chart, and the chart's GRADE is the stars of
// the three men who gave it up — three to fifteen. That is Luke's "depending on the star rating of the captain
// helps determine the quality of the island".
// ⚠️ ONE MAN, ONE CHART. It was three confessions saved up, graded three-to-fifteen on the stars of the three
// men who gave them — which is a collection mechanic wearing a treasure map. A captain is the step and the
// chart is the answer, so breaking him hands one over on the spot and its grade is HIS stars. That is still
// Luke's "depending on the star rating of the captain helps determine the quality of the island", said in one
// step instead of three.
export const CHART_PIECES = 1;
export const chartGrade = (stars) => Math.max(1, Math.min(MAX_STARS, Number(Array.isArray(stars) ? stars[0] : stars) || 1));

// Four bands rather than five numbers: a grade is a thing the player should be able to feel, and "a Sounding"
// versus "a Reckoning" is legible where 4-of-5 is not.
export const CHART_BANDS = [
    { id: "sounding", name: "A Sounding", min: 1, blurb: "A small man agreeing about a small place." },
    { id: "bearing", name: "A Bearing", min: 2, blurb: "Enough to steer by, if the sea is kind." },
    { id: "reckoning", name: "A Reckoning", min: 4, blurb: "A man who commanded something, naming the water he lost it in." },
    { id: "certainty", name: "A Certainty", min: 5, blurb: "Nobody left alive disputes where this is." },
];
export const chartBand = (grade) => [...CHART_BANDS].reverse().find((b) => grade >= b.min) || CHART_BANDS[0];

/** The captain's own name, off the ship he was commanding. Authored beside the fleet so the two never drift. */
export function captainFor(rank) {
    const ship = FLEET.find((s) => s.rank === rank) || FLEET[0];
    return { rank, art: ship.art, ship: ship.name, name: CAPTAIN_NAMES[rank] || "Her Captain", stars: starsForRank(rank) };
}

// ── WHO THEY ARE ─────────────────────────────────────────────────────────────────────────────────────────────
// One per rung. Several are already named by their own ship — Vane commands the Sovereign and the Reprisal,
// Salt Meg has a Revenge — and where the ship names nobody, the captain is authored to sound like the thing he
// commands rather than like a fantasy name generator.
export const CAPTAIN_NAMES = {
    1: "Peg Ellory", 2: "Tom Wetpowder", 3: "Sil Crane", 4: "Mother Nettle", 5: "Salt Meg",
    6: "Hollis Tide", 7: "Bitter Aldwyn", 8: "The Widow Wage", 9: "Reef Kallow", 10: "The Tithesman",
    11: "Dowry Kell", 12: "Pale Anselm", 13: "Gunner Roe", 14: "Arrear Bligh", 15: "Admiral Vane",
    16: "Cutter Thorne", 17: "The Assizeman", 18: "Hammerfall Ord", 19: "Assurance Vell", 20: "Commodore Ash",
    21: "Blockade Harrow", 22: "Sixty-Four Voss", 23: "Verdict Iremonger", 24: "Gallowglass Rue", 25: "Admiral Vane",
    26: "The Salt Choir", 27: "Marigold Ames", 28: "Barnacle Court", 29: "The Lamprey", 30: "The Tide Marshal",
    31: "Gravemouth Sull", 32: "The Nine Widows", 33: "Pressgang Odom", 34: "Undertow Vane", 35: "Mother Fathom",
    36: "The Long Reckoning", 37: "Cartographer Regret", 38: "The Unbroken Line", 39: "Hull Seventeen", 40: "The Last Harbour",
};

// ⚠️ OWNER-GATED WHILE IT IS BUILT, AND IT COMES IN A PAIR ────────────────────────────────────────────────────
// Luke: "it would need to be owner gated." Two doors, not one, and both of them are here so neither can be
// forgotten: the BRIG has to be invisible, and the capture OFFER at the end of a battle has to not appear —
// see [[feature-gates-come-in-pairs]]. A member who cannot open the brig but is offered "her hold, or her
// captain" has been handed a choice that throws away their doubloons for nothing.
//
// ⚠️ AND IT GOES ON THE MASTER LIST. When this launches, flip this one constant and delete the entry from
// [[sailing-test-overrides]]. Nothing else in this feature reads a flag.
export const CAPTAINS_PUBLIC = false;
export const captainsOpenTo = (isOwner) => CAPTAINS_PUBLIC || Boolean(isOwner);

export { MAX_FLEET_RANK };
