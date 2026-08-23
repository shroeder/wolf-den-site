// ── FIVE REELS, THREE ROWS, TWENTY LINES ─────────────────────────────────────────────────────────────────────
// The machines this replaces were three reels with one payline, and they were boring for a reason that took a
// measurement to see. Of every win a member saw on The Deep, 93.3% was EXACTLY 2x. On The Harvest 77%, The
// Menagerie 74%, The Hunt 63%. The top prize was one pull in 3,254 at best and one in 91,125 at worst — a
// number nobody will ever see. Luke: "I shouldnt get double my money for a jackpot. you have engineered the
// most boring slots ever." He was right, and the cause was structural rather than a bad paytable.
//
// On THREE reels, the only combinations frequent enough to pay often are the common symbols. Ban wins that pay
// back less than the stake — which was the correct call, "its lame to get .2 to 1.2" — and every affordable
// win collapses onto the 2x rung, because that is the only rung left. The rule was right. Three reels was the
// wrong machine to apply it to.
//
// FIVE REELS AND TWENTY LINES IS THE FIX, and it is why every real cabinet on a real floor is shaped this way.
// Betting twenty lines, a 2x win on ONE line is a tenth of what you staked. You get a hit — a line drawn
// across the screen, a sound, a number climbing — several times a minute, and nobody has to pretend you
// profited. Small wins become honest instead of insulting, so they are allowed to exist again, and the hit
// rate goes back up to where a machine feels alive.
//
// ── AND WHAT A WIN IS MADE OF ────────────────────────────────────────────────────────────────────────────────
// The other half of what real machines do: THE MONEY LIVES IN THE FEATURES. On a modern cabinet 30-50% of the
// whole return sits inside the free-spins round, which is why triggering one feels enormous — because it
// genuinely is where the money is. Ours put everything in the base game, so there was never anything to chase.
// Here the base game pays about half, and the rest is in the Hunt Moon free spins and the Chest pick.
//
// ── WHY THERE IS NO RTP CEILING IN THIS FILE ─────────────────────────────────────────────────────────────────
// Because there is no gold coming back. You stake GOLD and the machine pays CHIPS, so every gold piece staked
// is destroyed and the casino is a pure sink; a chip is a ticket, not money. That makes "returns 88%"
// meaningless here, and it frees the paytable completely — a 4,000x line hit prints no gold whatsoever.
//
// What replaces the ceiling is stricter, not looser: every machine returns exactly 1.00x in CHIPS on average
// (see check:slot5), so no cabinet is ever the smart pick and the only thing separating them is volatility.
// The whole economy is then two numbers that live somewhere else — chips minted per gold staked, and what the
// chip store charges — instead of five paytables each fighting a ceiling.

// ── COLOUR IS THE PAYTABLE ───────────────────────────────────────────────────────────────────────────────────
// Luke, looking at the finished screen: "the sprites seem monotone, and nondescript. for example, i think one
// of these is a wild, but because its all monotone, its really hard to tell. the same is true for icons that
// pay more, and ones that trigger the bonus."
//
// He found the bug in the art brief. Every symbol on a cabinet was drawn to one shared MOOD line — The Hunt's
// was "warm polished BRASS and deep gold" — so all six came back the same colour. That line existed to make a
// reel read as a SET, which it did, at the cost of the only job colour has on a slot machine: telling you what
// you are looking at before you have read anything. Six gold objects on a black field is a machine you have to
// study. A set can be held together by drawing style and framing instead, and those cost nothing.
//
// So colour is assigned by ROLE and by RANK, in one place, and both halves of the game read it: the art
// generator builds its prompts from `look`, and the screen tints each cell from `tone`. One map, so a symbol
// cannot be violet in the picture and gold in the glow.
//
// The ladder runs COOL AND PLAIN at the bottom to WARM AND RICH at the top, which is the order a person reads
// without being taught it — and the two symbols that are not part of the ladder at all sit outside it on
// purpose. The scatter is the only cold bright thing on the reel and the wild is the only violet one; neither
// can be mistaken for a paying symbol, which is exactly what they are not.
// PER CABINET, because the ladder has to work against THAT machine's frame and THAT machine's neighbours.
// Five cabinets sharing one palette is the monotone problem again at floor level rather than reel level: you
// would not be able to tell which machine a screenshot came from. Each keeps the same GRAMMAR — cool and
// plain at the bottom, warm and rich at the top, the scatter the only cold bright thing, the wild the only
// one of its colour — and changes the hues.
// ── CHOSEN, NOT DRAWN ────────────────────────────────────────────────────────────────────────────────────────
// Luke, stopping a run that was about to generate twenty-four more images: "I thought we were reusing sprites
// from different themes." He was right, and it would have been a waste of money as well as of art — the Den
// already owns 113 pets, 137 dishes, 469 items, 34 fish and 30 cut gems, all drawn to the same house style.
//
// So the ladder is a SELECTION problem rather than a generation one. What went wrong on The Hunt's first pass
// was never that the sprites were reused; it was that the six reused sprites were all brown. Pick for colour
// and the same pool that produced a monotone reel produces a readable one.
//
// Each cabinet keeps its theme and gains a spread. `name` matters as much as `tone`: the symbol IDS are shared
// across all five machines, so without it a paytable calls a jam roll "Wolf" and a starfish "Star".
const LOOK = {
    // ── THE HUNT ── the one cabinet with purpose-drawn symbols, because it was rebuilt before this was.
    slot: {
        bone: { rank: 1, role: "low", tone: "#8fa3b8", name: "Bone" },
        doubloon: { rank: 2, role: "low", tone: "#d99a3c", name: "Doubloon" },
        laurel: { rank: 3, role: "mid", tone: "#4fc98a", name: "Laurel" },
        chest: { rank: 4, role: "bonus", tone: "#ff8c2b", name: "Chest" },
        moon: { rank: 5, role: "scatter", tone: "#7ad4ff", name: "Moon" },
        wolf: { rank: 6, role: "wild", tone: "#b47cff", name: "Wolf" },
    },
    // ── THE HARVEST ── the larder, not the kitchen. Six shapes and six hues, because the cooked dishes it
    // used to run are all served in the same brown bowl and a ladder of names is not a ladder of colours.
    // Every tone here is measured off the sprite it sits under, so the glow a symbol throws is its own.
    slot2: {
        bone: { rank: 1, role: "low", tone: "#e8dcc0", name: "Flour" },
        doubloon: { rank: 2, role: "low", tone: "#e8b93a", name: "Corn" },
        laurel: { rank: 3, role: "mid", tone: "#c8477e", name: "Jam" },
        chest: { rank: 4, role: "bonus", tone: "#ff9c2b", name: "The Cauldron" },
        moon: { rank: 5, role: "scatter", tone: "#3fc8e8", name: "Storm Bottle" },
        wolf: { rank: 6, role: "wild", tone: "#9b5ac8", name: "The Press" },
    },
    // ── THE DEEP ── cold water, so the rule inverts: everything is cold and the two features are the only
    // warm things down there. A starfish is also the one silhouette on the floor nothing can be confused with.
    slot3: {
        bone: { rank: 1, role: "low", tone: "#8fa8bd", name: "Herring" },
        doubloon: { rank: 2, role: "low", tone: "#4fa8a0", name: "Mackerel" },
        laurel: { rank: 3, role: "mid", tone: "#45d8e8", name: "Tidewyrm" },
        chest: { rank: 4, role: "bonus", tone: "#e34b3a", name: "Crab" },
        star: { rank: 5, role: "scatter", tone: "#ffcc44", name: "Starfish" },
        wolf: { rank: 6, role: "wild", tone: "#8b5aa8", name: "Kraken" },
    },
    // ── THE MENAGERIE ── the member's own menagerie, picked by matching each pet's catalogue colour to the
    // rung. The Chameleon fell out of that as the wild, which is the joke writing itself: an animal that
    // turns into whatever is next to it.
    slot4: {
        bone: { rank: 1, role: "low", tone: "#9aa7b5", name: "Wolf Pup" },
        doubloon: { rank: 2, role: "low", tone: "#e8a33d", name: "Copper Kettle" },
        laurel: { rank: 3, role: "mid", tone: "#37f5c0", name: "Golem Heart" },
        chest: { rank: 4, role: "bonus", tone: "#ffd75e", name: "Radiant Phoenix" },
        moon: { rank: 5, role: "scatter", tone: "#8fd3ff", name: "Spirit Fox" },
        wolf: { rank: 6, role: "wild", tone: "#b45aff", name: "Chameleon" },
    },
    // ── THE VAULT ── cut gems, which are a colour ladder somebody already built: five stones in five hues,
    // and the Wolf's Eye — the secret sixth — as the scatter.
    slot5: {
        bone: { rank: 1, role: "low", tone: "#4a7fb5", name: "Sapphire" },
        doubloon: { rank: 2, role: "low", tone: "#e0b03a", name: "Topaz" },
        laurel: { rank: 3, role: "mid", tone: "#3fc98a", name: "Emerald" },
        chest: { rank: 4, role: "bonus", tone: "#e8434f", name: "Ruby" },
        moon: { rank: 5, role: "scatter", tone: "#e8dcc6", name: "Wolf's Eye" },
        wolf: { rank: 6, role: "wild", tone: "#a855f7", name: "Amethyst" },
    },
};

// The Hunt's ladder is the default for anything that asks without naming a cabinet.
export const SYMBOL_LOOK = LOOK.slot;
export const lookFor = (machineId, sym) => (LOOK[machineId] || LOOK.slot)[sym] || LOOK.slot[sym] || null;
export const MACHINE_LOOKS = LOOK;

export const symbolTone = (id, machineId = "slot") => lookFor(machineId, id)?.tone || "#cbd3dc";
// What this cabinet calls it. The symbol IDS are shared across all five machines and the ART is not, so
// without this a paytable calls a jam roll "Wolf" and a cut amethyst "Wolf" as well.
export const symbolName = (id, machineId = "slot") => lookFor(machineId, id)?.name || id;
export const symbolRole = (id, machineId = "slot") => lookFor(machineId, id)?.role || "low";

// ── THE TWENTY LINES ─────────────────────────────────────────────────────────────────────────────────────────
// Row index per reel, 0 top, 1 middle, 2 bottom. The order matters: the first three are the straight lines
// everybody reads first, then the V and the caret, then the shapes. A player never counts these — they see a
// line light up and believe it — but they must be DISTINCT, or two "different" lines award the same win twice
// and the machine quietly pays double.
export const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
    [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
    [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
    [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [0, 2, 0, 2, 0],
];

export const ROWS = 3;
export const REELS = 5;

// ── THE CABINETS ─────────────────────────────────────────────────────────────────────────────────────────────
// `strips` is one weighted symbol bag PER REEL, which is the single most important difference from the old
// machines and the reason a five-reel game can be tuned at all. A wild that appears on every reel makes five
// wilds catastrophically likely; confine it to reels 2-4 and the top line becomes reachable-but-rare without
// touching a single payout number. Every real machine is tuned this way.
//
// `pays` is per LINE bet, in chips, keyed by how many matched from the left. A line bet is the total bet
// divided by 20, so a 400x line hit is 20x what you actually staked — the report in check:slot5 prints both,
// because those two numbers feel completely different and only one of them is what a player experiences.
const HUNT = {
    id: "slot",
    label: "The Hunt",
    blurb: "Twenty lines through the trees. The moon opens the hunt.",
    wild: "wolf",          // substitutes for everything except the scatter
    scatter: "moon",       // pays from anywhere, and three of them open the free spins
    bonus: "chest",        // three or more, anywhere, opens the pick
    // Reel 1 has no wild, which is what stops the machine paying five-of-a-kind too often, and reel 5 has
    // fewer scatters, which is what makes the third moon land late and slow — the anticipation is built into
    // the strip rather than faked by the animation.
    // THE MOON ONLY RISES ON ONE, THREE AND FIVE. Free spins used to open every 22 spins, which is not a
    // feature, it is the base game wearing a hat — a real round comes once every hundred-odd spins and that
    // rarity is exactly what makes it worth wanting. Confining the scatter to the odd reels is how every
    // cabinet on a real floor does it, and it costs nothing: you still SEE moons constantly, on the reels
    // that matter, so the near-miss is as loud as ever while the trigger itself gets properly rare.
    strips: [
        { bone: 30, doubloon: 22, laurel: 16, chest: 6, moon: 5, wolf: 0 },
        { bone: 28, doubloon: 21, laurel: 15, chest: 6, moon: 0, wolf: 5 },
        { bone: 28, doubloon: 20, laurel: 14, chest: 6, moon: 4, wolf: 6 },
        { bone: 28, doubloon: 21, laurel: 15, chest: 6, moon: 0, wolf: 5 },
        { bone: 30, doubloon: 23, laurel: 16, chest: 6, moon: 4, wolf: 0 },
    ],
    // BONE DOES NOT PAY AT THREE, and that single omission is what makes the machine tunable. With only
    // four paying symbols across five reels, three-of-a-kind on twenty lines is close to a certainty — the
    // first cut of this table paid on 78% of spins and returned five times what it should. Real cabinets
    // solve it with nine or ten symbols; with four, the commonest one has to be a symbol you are pleased to
    // see FOUR of and indifferent to three of, which is exactly the job blanks do on a physical reel strip.
    pays: {
        wolf: { 3: 14.7, 4: 132, 5: 1830 },
        chest: { 3: 5.03, 4: 43.9, 5: 439 },
        laurel: { 3: 1.83, 4: 13.2, 5: 110 },
        doubloon: { 3: 0.92, 4: 5.03, 5: 36.6 },
        bone: { 4: 1.83, 5: 14.7 },
    },
    // Scatters pay a multiple of the TOTAL bet, not the line bet, because they do not sit on a line. This is
    // the one payout a player can always find without understanding paylines.
    scatterPays: { 3: 1.1, 4: 5.03, 5: 33 },
    // Its free round is the only one on the floor you CHOOSE the shape of — see FREE_SPIN_OFFERS.
    free: { kind: "deals", spins: 10, label: "Ten spins, four times" },
    // ── DOWN THROUGH THE WARREN ──────────────────────────────────────────────────────────────────────
    // Five rooms, each deeper and richer than the last, and a sixth past the end of them that most people
    // will never see. See runWarren. The locking-wilds round lives on The Deep now, so the two cabinets
    // are no longer one bonus in two skins.
    second: { kind: "warren", label: "The Warren" },
};

// ── AND THE OTHER FOUR ───────────────────────────────────────────────────────────────────────────────────────
// The floor was one rebuilt cabinet and four three-reel machines with one payline between them, which is the
// arrangement that produced "you have engineered the most boring slots ever" in the first place. Worse, of the
// five only two had even TWO features of their own, and the ones they had were shared: The Menagerie's nudge
// was The Hunt's nudge, The Vault's pack was The Hunt's pack, and the Pot was on all five, so it separated
// nothing.
//
// WHAT MAKES A CABINET ITS OWN CABINET is not a paint job and it is not a different jackpot number. It is
// VOLATILITY — how often it pays against how much it pays when it does — and the SHAPE of its features. So
// each of these is tuned to a different place on that curve, and each carries a free-spin variant and a second
// feature that no other machine on the floor has in the same pair:
//
//   The Hunt        middling         three deals to choose from        the petting pen
//   The Harvest     gentle           the multiplier grows every spin   hold and spin — the wagon
//   The Deep        savage           expanding wilds                   a pick — the trawl
//   The Menagerie   busy             scatters retrigger for more       hold and spin — the stampede
//   The Vault       brutal           a multiplier ladder x2 to x10     a pick — the locks
//
// The two hold-and-spins differ in what locks and what it pays; the two picks differ in what ends them. Every
// one of them is checked by check:slot5, which enforces the only rule that matters: every machine returns
// 1.00x in chips, so none of them is the smart pick and volatility is genuinely all that separates them.

const HARVEST = {
    id: "slot2",
    label: "The Harvest",
    blurb: "The kindest reels on the floor. The wagon fills slowly and empties all at once.",
    wild: "wolf",
    scatter: "moon",
    // GENTLE. The widest spread of low symbols and the shortest ceiling — this is the cabinet somebody plays
    // for an hour without ever feeling mugged, and it is the only one whose wild appears on four reels.
    strips: [
        { bone: 26, doubloon: 22, laurel: 18, chest: 8, moon: 6, wolf: 0 },
        { bone: 24, doubloon: 21, laurel: 17, chest: 8, moon: 0, wolf: 7 },
        { bone: 24, doubloon: 20, laurel: 16, chest: 8, moon: 5, wolf: 8 },
        { bone: 24, doubloon: 21, laurel: 17, chest: 8, moon: 0, wolf: 7 },
        { bone: 26, doubloon: 22, laurel: 18, chest: 8, moon: 5, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 1.54, 4: 9.45, 5: 80.3 },
        chest: { 3: 0.81, 4: 4.33, 5: 29.1 },
        laurel: { 3: 0.4, 4: 2.01, 5: 11.4 },
        doubloon: { 3: 0.18, 4: 0.95, 5: 4.73 },
        bone: { 3: 0.12, 4: 0.5, 5: 2.3 },
    },
    scatterPays: { 3: 0.24, 4: 0.95, 5: 4.73 },
    // ── THE CASCADE MACHINE ──────────────────────────────────────────────────────────────────────────
    // Every win is threshed away and what is above falls into the hole, so a win MAKES the next win
    // possible and the multiplier climbs with each break. Five breaks in one spin opens the free round —
    // a bonus earned by watching rather than by landing three of anything.
    // EIGHT BREAKS. Measured over 200,000 spins: the mean chain is 1.56 and eight-plus happens once in 132,
    // which is real bonus-round rarity — and unlike a scatter you can WATCH it approaching. Five would have
    // been one spin in seventeen, which is not a bonus, it is the base game with a fanfare.
    cascade: { trigger: 8, label: "The Threshing" },
    // ── ITS FREE ROUND IS FOURTEEN CASCADES ──────────────────────────────────────────────────────────
    // This was `growing` — the multiplier climbing 1x to 14x across the round — from before the cabinet
    // tumbled. Now that the free round cascades too, that ladder rides on TOP of the chain's own 1-to-20,
    // and the two compound to x280: the machine returned 707% and the free round was worth more than the
    // rest of the game put together.
    //
    // The chain IS the multiplier here. The round just doubles it, every spin, and the depth does the rest.
    free: { kind: "fixed", spins: 14, mult: 2, label: "Fourteen spins, every one of them tumbling, at double" },
    second: { kind: "hold", trigger: "doubloon", need: 9, spins: 3, label: "The Wagon",
        values: [0.31, 0.31, 0.31, 0.5, 0.5, 0.81, 1.23, 2.47], full: 32.4 },
};

const DEEP = {
    id: "slot3",
    label: "The Deep",
    blurb: "Little comes up. What does is enormous.",
    wild: "wolf",
    scatter: "star",
    // SAVAGE. Almost no cheap wins — bone does not pay at all, doubloon needs four — and the top of the table
    // is the largest number on the floor. This is the cabinet that goes quiet for twenty spins.
    strips: [
        { bone: 34, doubloon: 24, laurel: 14, chest: 6, star: 7, wolf: 0 },
        { bone: 32, doubloon: 23, laurel: 13, chest: 6, star: 0, wolf: 5 },
        { bone: 32, doubloon: 22, laurel: 12, chest: 6, star: 6, wolf: 6 },
        { bone: 32, doubloon: 23, laurel: 13, chest: 6, star: 0, wolf: 5 },
        { bone: 34, doubloon: 24, laurel: 14, chest: 6, star: 6, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 20.9, 4: 159, 5: 2114 },
        chest: { 3: 6.19, 4: 47.5, 5: 475 },
        laurel: { 3: 2.09, 4: 13.7, 5: 116 },
        doubloon: { 4: 4.75, 5: 37.1 },
        bone: { 5: 10.4 },
    },
    scatterPays: { 3: 1.04, 4: 4.75, 5: 31.3 },
    free: { kind: "expanding", spins: 14, label: "Fourteen spins, and every wild takes its whole reel" },
    // Same shape as The Hunt's, and it plays completely differently: down here the wild is the rarest
    // symbol on the floor and the pays above it are the steepest, so a board that fills up is worth
    // several times what the same board is worth up top.
    second: { kind: "sticky", spins: 10, label: "Ten hauls, and every kraken stays in the net" },
};

const MENAGERIE = {
    id: "slot4",
    label: "The Menagerie",
    blurb: "Something is always moving. Three moons and it starts again.",
    wild: "wolf",
    scatter: "moon",
    // BUSY. The highest hit rate on the floor and the flattest table — small things happen constantly, which
    // is the whole character, and its free round can restart itself forever.
    strips: [
        { bone: 22, doubloon: 20, laurel: 18, chest: 10, moon: 6, wolf: 0 },
        { bone: 21, doubloon: 19, laurel: 17, chest: 10, moon: 0, wolf: 8 },
        { bone: 21, doubloon: 18, laurel: 16, chest: 10, moon: 5, wolf: 9 },
        { bone: 21, doubloon: 19, laurel: 17, chest: 10, moon: 0, wolf: 8 },
        { bone: 22, doubloon: 20, laurel: 18, chest: 10, moon: 5, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 10.5, 4: 60, 5: 514 },
        chest: { 3: 5, 4: 26, 5: 171 },
        laurel: { 3: 2.6, 4: 12, 5: 68 },
        doubloon: { 3: 1.3, 4: 6, 5: 29 },
        bone: { 3: 0.9, 4: 3.4, 5: 13.5 },
    },
    scatterPays: { 3: 1.3, 4: 6, 5: 31 },
    free: { kind: "retrigger", spins: 14, label: "Fourteen spins, and three more moons buys fourteen more" },
    second: { kind: "hold", trigger: "chest", need: 6, spins: 3, label: "The Stampede",
        values: [1.7, 1.7, 2.6, 2.6, 3.4, 5, 8.5, 15.5], full: 223 },
};

const VAULT = {
    id: "slot5",
    label: "The Vault",
    blurb: "It rarely opens. When it does, it opens all the way.",
    wild: "wolf",
    scatter: "moon",
    // BRUTAL. The rarest wild on the floor and the fewest paying combinations, against the highest ladder in
    // the free round. Everything about this cabinet is a long wait for one number.
    strips: [
        { bone: 36, doubloon: 24, laurel: 12, chest: 5, moon: 6, wolf: 0 },
        { bone: 34, doubloon: 23, laurel: 12, chest: 5, moon: 0, wolf: 4 },
        { bone: 34, doubloon: 22, laurel: 11, chest: 5, moon: 5, wolf: 5 },
        { bone: 34, doubloon: 23, laurel: 12, chest: 5, moon: 0, wolf: 4 },
        { bone: 36, doubloon: 24, laurel: 12, chest: 5, moon: 5, wolf: 0 },
    ],
    pays: {
        wolf: { 3: 19.2, 4: 146, 5: 1918 },
        chest: { 3: 5.5, 4: 42.2, 5: 422 },
        laurel: { 3: 1.92, 4: 12.4, 5: 99.9 },
        doubloon: { 4: 4.12, 5: 30.2 },
        bone: { 5: 8.71 },
    },
    scatterPays: { 3: 0.79, 4: 4.12, 5: 27.5 },
    // ── YOU BUILD YOUR OWN ROUND ─────────────────────────────────────────────────────────────────────
    // Every lock you turn adds spins or multiplier. One of them opens the door and the round begins with
    // whatever you managed to stack. Nothing on the board is a loss.
    // EIGHT BEFORE YOU TOUCH A LOCK, so the round is worth something even if the first tile is the door —
    // the mechanic only works if there is no bad outcome, and opening on the first pick must still be a
    // real free round rather than a shrug.
    free: { kind: "built", spins: 8, label: "Turn the locks, then the door opens" },
    second: { kind: "build", label: "The Locks" },
};

export const SLOTS5 = { slot: HUNT, slot2: HARVEST, slot3: DEEP, slot4: MENAGERIE, slot5: VAULT };
export const slot5 = (id) => SLOTS5[id] || SLOTS5.slot;

// ── SPINNING ─────────────────────────────────────────────────────────────────────────────────────────────────
const pick = (bag, rng) => {
    const keys = Object.keys(bag).filter((k) => bag[k] > 0);
    const total = keys.reduce((a, k) => a + bag[k], 0);
    let r = rng() * total;
    for (const k of keys) { r -= bag[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
};

/** A grid: five reels of three symbols, top to bottom. */
export function spinGrid(m, rng = Math.random) {
    return m.strips.map((bag) => Array.from({ length: ROWS }, () => pick(bag, rng)));
}

// ── WHAT A GRID PAID ─────────────────────────────────────────────────────────────────────────────────────────
// Left to right from reel one, which is the rule every real machine uses and the reason a win always starts at
// the left edge: it halves the number of winning combinations, which is what makes the top prizes affordable.
//
// `mult` is the feature multiplier — 1 in the base game, more inside free spins. It multiplies LINE and
// SCATTER wins, and deliberately not the pick bonus, which brings its own numbers.
export function evaluate(m, grid, { lineBet = 1, mult = 1 } = {}) {
    const wins = [];
    let total = 0;

    for (let i = 0; i < LINES.length; i += 1) {
        const line = LINES[i];
        const seq = line.map((row, reel) => grid[reel][row]);
        // The symbol the run is made of is the first non-wild — a line that opens with wilds pays as whatever
        // it turns into. A line of nothing but wilds pays as wilds, which is the top award on the machine.
        const lead = seq.find((s) => s !== m.wild && s !== m.scatter) || m.wild;
        if (lead === m.scatter) continue;
        let n = 0;
        while (n < seq.length && (seq[n] === lead || seq[n] === m.wild)) n += 1;
        const pay = m.pays[lead]?.[n];
        if (!pay) continue;
        const amount = pay * lineBet * mult;
        total += amount;
        // WHICH CELLS. A cascade cannot break the winning symbols without knowing which ones they are, and
        // the line-drawing overlay wants the same list. Cheap to carry, impossible to reconstruct later.
        const cells = [];
        for (let reel = 0; reel < n; reel += 1) cells.push(reel * ROWS + line[reel]);
        wins.push({ kind: "line", line: i, symbol: lead, count: n, amount, cells });
    }

    // Scatters pay from anywhere, on the total bet.
    const scatters = grid.flat().filter((s) => s === m.scatter).length;
    const sPay = m.scatterPays[scatters];
    if (sPay) {
        const amount = sPay * lineBet * LINES.length * mult;
        total += amount;
        wins.push({ kind: "scatter", symbol: m.scatter, count: scatters, amount });
    }

    // WHAT OPENS THIS CABINET'S SECOND FEATURE. A pick counts its bonus symbol; a hold-and-spin counts its
    // coin. Read off the machine rather than hard-coded, or four of the five cabinets quietly trigger on The
    // Hunt's chest — which is not even on two of their reels.
    const secondSym = m.second?.kind === "hold" ? m.second.trigger : (m.bonus || "chest");
    const need = m.second?.kind === "hold" ? (m.second.need || 6) : 5;
    const bonuses = grid.flat().filter((x) => x === secondSym).length;
    return {
        wins,
        total,
        scatters,
        bonuses,
        freeSpins: scatters >= 3,
        // FIVE chests, not four. At four the pick opened every fifteenth spin and carried 38% of the whole
        // machine — a bonus round you cannot go two minutes without seeing is a chore with a board on it.
        pick: bonuses >= need,
    };
}

// ── THE FEATURES ─────────────────────────────────────────────────────────────────────────────────────────────
// AGENCY THAT IS NOT A LIE. Three ways to take the free spins, tuned so no option is the correct one — the
// expected return of all three is within a couple of percent, and which is best genuinely depends on nothing.
// This is what real cabinets do and it is not a trick: the choice changes the SHAPE of the outcome, which is
// the part anybody actually cares about. Take the twenty at 1x and you will probably win something; take the
// eight at 5x and you will probably win nothing, or you will remember it for a month.
export const FREE_SPIN_OFFERS = [
    { id: "many", label: "Twenty spins", sub: "everything pays double", spins: 20, mult: 2, sticky: false },
    { id: "mid", label: "Ten spins", sub: "everything pays four times", spins: 10, mult: 4, sticky: false },
    // Seven, not eight. Sticky wilds are worth about 2.5x a plain spin because the grid fills up as the round
    // runs down — measured, not guessed — so the count has to come down to keep the three offers level.
    { id: "few", label: "Seven spins", sub: "wilds stay where they land, everything doubled", spins: 7, mult: 2, sticky: true },
];

/**
 * Run a free-spins round. Sticky wilds are the reason the third offer is worth taking: a wolf that lands on
 * reel 3 stays there for the rest of the round, so the last spins of a short round are played on a grid that
 * has been filling up with wilds — the round gets better as it runs out, which is the opposite of how a
 * losing streak feels and is exactly why players chase it.
 */
/**
 * Run a free-spins round.
 *
 * FIVE SHAPES, ONE LOOP. Every cabinet's round is the same ten-line function with a different modifier, which
 * is the only way five of them stay in step: a second copy of this drifts, and the one that drifts is the one
 * nobody is looking at. What differs per machine is `kind`:
 *
 *   deals      the member picked the count and multiplier up front (The Hunt only — see FREE_SPIN_OFFERS)
 *   growing    the multiplier starts at 1 and gains 1 every spin, so the last spin is worth ten of the first
 *   expanding  any wild that lands fills its whole reel, which is how a savage machine pays anything at all
 *   retrigger  three more scatters inside the round buys the round again, and it can happen repeatedly
 *   ladder     a fixed climb, x2 x2 x3 x3 x5 x5 x7 x7 x10 x10 — known in advance and still worth watching
 *
 * STICKY WILDS are a rider rather than a kind, because The Hunt's third deal uses them and nothing else does.
 */
const LADDER = [2, 2, 3, 3, 5, 5, 7, 7, 10, 10];

export function runFreeSpins(m, offer, { lineBet = 1, rng = Math.random } = {}) {
    const stuck = [];   // [reel, row] positions holding a wild for the rest of the round
    let total = 0;
    const spins = [];
    let left = offer.spins;
    let i = 0;
    let added = 0;      // spins bought by retriggering
    // ── A HARD STOP, AND A WATCHABLE ONE ─────────────────────────────────────────────────────────────────
    // Two jobs. The first is that retriggering can in principle buy spins forever and a round that never
    // ends is a request that never returns — the same class of bug as a fight that cannot finish.
    //
    // The second only appeared once retriggering was universal: a Harvest round that fired three times ran
    // to FIFTY-SIX spins, and at roughly two seconds a tumbling spin that is over two minutes of watching.
    // Luke asked to see free spins play out rather than be speedrun, and this is the far side of that —
    // long enough that the Skip button stops being an escape hatch and becomes the only sane choice.
    //
    // Forty is about ninety seconds at the free clock, which is a long bonus rather than a chore.
    const CEILING = 40;

    // ── EVERY ROUND RETRIGGERS, ON THE CONDITION THAT OPENED IT ──────────────────────────────────────────
    // Luke: "any free spins bonus should be retriggerable by getting the same condition during the free spin."
    //
    // This used to be one cabinet's gimmick — The Menagerie's whole identity was "and three more moons buys
    // fourteen more", as if extending a round were an exotic feature rather than the thing every real machine
    // does. It is the single best moment a free round has: you are already inside the thing you waited
    // ninety-three spins for, you have stopped hoping for anything, and then it gets LONGER.
    //
    // The condition is the cabinet's own, not a new one, because that is what makes it legible — whatever put
    // you in here does it again. Three scatters everywhere; on a cascading machine, a deep enough chain too,
    // since that is the other door in.
    //
    // The award is the CABINET's round length rather than the offer's, which matters on The Vault: a round
    // the member built to twenty spins should not hand back another twenty for one scatter landing. It hands
    // back the eight the machine is worth.
    // Capped by the round you are actually IN, so a short offer cannot be extended by more than its own
    // length. Without the cap The Hunt's seven-spin sticky deal collected the cabinet's full ten every
    // retrigger — it went from being level with the other two offers to being worth 26% more than them,
    // which turns a choice into a right answer.
    const RETRIGGER = Math.min(m.free?.spins || offer.spins || 5, offer.spins || 5);

    while (i < left && i < CEILING) {
        const grid = spinGrid(m, rng);
        for (const [reel, row] of stuck) grid[reel][row] = m.wild;

        // EXPANDING: a wild takes its whole reel. Applied before scoring, so it pays as five wilds would.
        if (offer.kind === "expanding") {
            for (let reel = 0; reel < REELS; reel += 1) {
                if (grid[reel].includes(m.wild)) grid[reel] = Array.from({ length: ROWS }, () => m.wild);
            }
        }

        const mult = offer.kind === "fixed" ? (offer.mult || 1)
            : offer.kind === "growing" ? (i + 1)
            : offer.kind === "ladder" ? (LADDER[i % LADDER.length])
            : (offer.mult || 1);

        // ── A CASCADING MACHINE CASCADES IN ITS OWN FREE ROUND ───────────────────────────────────────────
        // It did not. The Harvest's bonus ran flat single-evaluation spins — so the one cabinet on the floor
        // whose whole identity is the tumble switched the tumble OFF for the round you play it to reach.
        // The round multiplier rides on top of the chain's own ladder, which is what makes a free cascade
        // worth waiting for rather than just a cascade you did not pay for.
        const chain = m.cascade ? runCascade(m, grid, { lineBet, rng, mult }) : null;
        const r = chain
            ? { ...evaluate(m, chain.steps[0].grid, { lineBet, mult }), total: chain.total }
            : evaluate(m, grid, { lineBet, mult });

        // RETRIGGER — the same condition that opened the round, whatever this cabinet's is.
        const deep = Boolean(chain && m.cascade && chain.cascades >= m.cascade.trigger);
        const again = (r.scatters >= 3 || deep) && left + RETRIGGER <= CEILING;
        if (again) { left += RETRIGGER; added += RETRIGGER; }

        // ── AND THE ONES THAT JUST LOCKED ────────────────────────────────────────────────────────────────
        // Two lists per spin, because the screen has to tell three states apart: a cell that was ALREADY
        // held (drawn locked from the moment the reels start), one that locks on THIS spin (drawn landing,
        // then clamping shut, which is the moment worth watching), and an ordinary symbol. Without the
        // distinction a sticky round animates as a grid that quietly has more wolves in it each time, and
        // the whole mechanic goes by unremarked — the same failure as the retrigger changing a counter in
        // silence.
        const heldBefore = stuck.map(([reel, row]) => reel * ROWS + row);
        const justHeld = [];
        if (offer.sticky) {
            for (let reel = 0; reel < REELS; reel += 1) {
                for (let row = 0; row < ROWS; row += 1) {
                    if (grid[reel][row] === m.wild && !stuck.some((p) => p[0] === reel && p[1] === row)) {
                        stuck.push([reel, row]);
                        justHeld.push(reel * ROWS + row);
                    }
                }
            }
        }
        total += r.total;
        // `retrigger` carries what this spin bought and HOW, so the screen can shout the right thing: a
        // chain that ran away with itself and a third scatter landing are not the same moment.
        spins.push({ grid, ...r, mult, chain, held: heldBefore, justHeld,
            retrigger: again ? { spins: RETRIGGER, by: deep ? "chain" : "scatter" } : null });
        i += 1;
    }
    return { total, spins, stuck, added, base: offer.spins };
}

// ── BUILDING YOUR OWN FREE ROUND ─────────────────────────────────────────────────────────────────────────────
// Luke: "you reveal tiles that give you extra spins and extra multiplier going into a free spins, and then if
// you pick the wrong one, it begins the free spin bonus."
//
// The best mechanic on the floor, and it is worth saying why because the reason is not obvious: THERE IS NO
// BAD OUTCOME. Every tile is a gift — more spins, a bigger multiplier — and the "wrong" one does not take
// anything away, it starts the thing you were building towards. The tension is entirely "how much more dare I
// stack before it goes", and the answer is never a punishment.
//
// That is the opposite of the pick it replaces, where one tile ended the round and took the board with it.
// Same interaction, same number of taps, completely different feeling: one is nerve under threat, the other
// is greed with no downside, and the second is the one people replay.
export const VAULT_TILES = [
    { kind: "spins", value: 2 }, { kind: "spins", value: 2 }, { kind: "spins", value: 3 },
    { kind: "spins", value: 3 }, { kind: "spins", value: 5 },
    { kind: "mult", value: 1 }, { kind: "mult", value: 1 }, { kind: "mult", value: 2 },
    { kind: "mult", value: 3 },
    { kind: "launch" },
];

export function runBuild(m, { rng = Math.random, baseSpins = 5, baseMult = 1 } = {}) {
    const board = VAULT_TILES.map((t) => ({ ...t }));
    for (let i = board.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [board[i], board[j]] = [board[j], board[i]];
    }
    let spins = baseSpins;
    let mult = baseMult;
    const picked = [];
    for (const tile of board) {
        picked.push(tile);
        if (tile.kind === "launch") break;
        if (tile.kind === "spins") spins += tile.value;
        else mult += tile.value;
    }
    return { picked, spins, mult };
}

// ── CASCADES ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we should have one that cascades... the winning paylines get fractured, and then they break, and then
// the new symbols fall down, and then there can be increased multipliers based on how many times that happens
// sequentially without having to spin, and also initiate a bonus game based on that."
//
// This is the single biggest thing missing from the floor, and it is missing for a structural reason: every
// other machine here resolves a spin in ONE step. A cascade is a spin that keeps going — you press the button
// once and the machine argues with itself for eight seconds — and that is exactly why it feels advanced. The
// player is not doing anything. They are watching something unfold that they started.
//
// THREE THINGS COMPOUND, which is what makes it more than an animation:
//   1. every win breaks, and what is above falls into the hole, so a win MAKES the next win possible
//   2. the multiplier climbs with each consecutive break and resets only when the tumbling stops
//   3. enough breaks in a single spin opens the free round — a bonus you earned by watching rather than by
//      landing three of something
//
// The whole chain is resolved here and sent as a list of steps. The screen animates the steps; it decides
// nothing, the same as everywhere else.
const CASCADE_MULT = [1, 2, 3, 5, 8, 12, 20];

export function runCascade(m, grid, { lineBet = 1, rng = Math.random, mult: round = 1 } = {}) {
    const steps = [];
    let total = 0;
    let n = 0;
    let working = grid.map((col) => col.slice());

    // A hard ceiling. A cascade can in principle refill into another win forever, and a spin that never
    // resolves is a request that never returns.
    while (n < 20) {
        // The chain's own ladder, times whatever the round is running at. In the base game `round` is 1 and
        // this is just the ladder; inside a free round the two stack, which is the entire reason a free
        // cascade is worth waiting for rather than being a cascade you happened not to pay for.
        const mult = CASCADE_MULT[Math.min(n, CASCADE_MULT.length - 1)] * round;
        const r = evaluate(m, working, { lineBet, mult });
        const lineWins = r.wins.filter((w) => w.kind === "line");
        // The scatter pays once, on the first pass only — otherwise a tumbling machine pays its scatter
        // five times for one grid.
        const paid = n === 0 ? r.total : lineWins.reduce((a, w) => a + w.amount, 0);
        total += paid;

        // Every cell that took part in a win. A Set because two lines crossing share cells, and breaking
        // one twice would leave a hole the fall cannot fill.
        const broken = new Set();
        for (const w of lineWins) for (const c of w.cells) broken.add(c);

        steps.push({
            grid: working.map((col) => col.slice()),
            wins: lineWins,
            scatterWin: n === 0 ? (r.wins.find((w) => w.kind === "scatter") || null) : null,
            broken: [...broken],
            mult,
            paid,
            cascade: n,
        });

        if (!broken.size) break;

        // ── AND THEY FALL ────────────────────────────────────────────────────────────────────────────
        // Per column: keep what survived in order, then push new symbols on TOP. Drawn from that reel's own
        // strip, because a refill from a generic pool would put wilds on reels that cannot hold them — the
        // exact bug the idle reels already had once.
        working = working.map((col, reel) => {
            const kept = col.filter((_, row) => !broken.has(reel * ROWS + row));
            const need = ROWS - kept.length;
            const fresh = Array.from({ length: need }, () => pick(m.strips[reel], rng));
            return [...fresh, ...kept];
        });
        n += 1;
    }

    return { total, steps, cascades: n, mult: CASCADE_MULT[Math.min(n, CASCADE_MULT.length - 1)] * round };
}

// ── THE WARREN ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke described this one exactly: "you pick an egg and it kind of bounces and then something pops out, most
// of the time it's these little ducks and they jump out one by one and they keep adding up the score over and
// over again till they're done jumping out... eventually you either pick the bear which ends the bonus or you
// get [the hero] and it's this huge event and then it goes to the next screen that's a new background, the
// eggs look better and you just keep going, and every stage you get deeper the reward is higher and more
// ducks jump out... and at the fifth stage it takes you to a completely new screen with these giant domes."
//
// WHY THIS IS NOT THE PICK HE THREW OUT, even though you are still tapping things. The pick was tap-a-tile-
// read-a-number: one tap, one flat value, no state. Three things make this different, and all three are the
// reason it is worth building:
//
//   1. A TAP OPENS A SEQUENCE, NOT A NUMBER. Critters come out one at a time and the total climbs with each
//      one. You do not know how many are coming, so every burrow is its own small build.
//   2. THE ROUND HAS A LADDER. Five stages, each a different place with better art and bigger animals, and
//      the deeper you are the more comes out of every burrow. The bonus you are in gets structurally better.
//   3. THE END IS A REAL PLACE. Past the fifth stage is The Hoard, which most people will never see —
//      1 round in 32 — and which is worth telling somebody about.
//
// The maths, all of it decided here and only revealed by the taps:
//   nine burrows per stage — seven hold critters, one holds the Elder (deeper), one holds the Warren Mother
//   (over). So advancing is a coin flip, roughly two or three burrows open per stage, and the fifth stage is
//   one round in sixteen.
// Each rung is worth roughly 1.8x the one above it, so the ladder is felt rather than announced: a critter
// out of an Ember burrow is visibly a bigger number than one out of the Hollow, before you have counted
// anything. Measured shape at these values — median 8x the bet, mean 32x, one round in a hundred over 400x,
// and the ceiling near 750x, which the old pick could not approach because a board you can clear has a hard
// top. Half of all rounds still end in the first room; the difference is that they no longer pay nothing.
const WARREN_STAGES = [
    { key: "hollow", name: "The Hollow", pups: [1, 3], value: 8 },
    { key: "sunken", name: "The Sunken Run", pups: [2, 4], value: 15 },
    { key: "ember", name: "The Ember Seam", pups: [2, 5], value: 27 },
    { key: "astral", name: "The Star Warren", pups: [3, 6], value: 48 },
    { key: "kinghoard", name: "The Deep Warren", pups: [4, 8], value: 84 },
];
// ── THE ROOM PAST THE LAST ROOM ──────────────────────────────────────────────────────────────────────────────
// Three colossal geodes, one crack at a time, and it keeps going until the Mother is behind one. Written as a
// RUNNING CHANCE rather than a shuffled board of six, because the screen shows three and then three MORE — a
// fixed board would either run out of objects or lie about how many are left.
const HOARD_END = 0.28;
const HOARD_VALUE = 560;

export function runWarren(m, { lineBet = 1, rng = Math.random } = {}) {
    // ── FIFTEEN, NOT NINE ────────────────────────────────────────────────────────────────────────────────
    // A wall of eggs rather than a tic-tac-toe board, which is what the machine Luke is pointing at actually
    // looks like — and it is not only cosmetic. With thirteen critter eggs against one Elder and one Mother
    // the expected number of eggs opened per room goes from 2.3 to 4.3, so a room is a visit rather than two
    // taps. Advancing is still a coin flip, so the ladder keeps its shape: the fifth room is one round in
    // sixteen and the Hoard one in thirty-two.
    const NESTS = 15;
    const stages = [];
    let total = 0;
    let stage = 0;
    let ended = false;

    while (stage < WARREN_STAGES.length && !ended) {
        const cfg = WARREN_STAGES[stage];
        // Seven critter burrows, one Elder, one Mother — shuffled, then opened in order. Decided before the
        // first tap, exactly like every other board on this floor: the taps reveal, they do not decide.
        const board = [
            ...Array.from({ length: NESTS - 2 }, () => ({ kind: "pups" })),
            { kind: "elder" }, { kind: "mother" },
        ];
        for (let i = board.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [board[i], board[j]] = [board[j], board[i]];
        }

        const opened = [];
        for (const nest of board) {
            if (nest.kind === "pups") {
                // How many come out, and what each is worth. The count is the drama; the value is the money.
                const [lo, hi] = cfg.pups;
                const n = lo + Math.floor(rng() * (hi - lo + 1));
                const pups = Array.from({ length: n }, () => cfg.value * (0.7 + rng() * 0.9));
                total += pups.reduce((a, v) => a + v, 0) * lineBet;
                opened.push({ kind: "pups", pups });
                continue;
            }
            opened.push({ kind: nest.kind });
            break;   // the Elder takes you down, the Mother sends you home. Either way this stage is done.
        }

        const last = opened[opened.length - 1];
        stages.push({ stage, key: cfg.key, name: cfg.name, board: board.length, opened });
        if (last.kind === "mother") { ended = true; break; }
        stage += 1;
    }

    // ── THE HOARD ────────────────────────────────────────────────────────────────────────────────────────
    // Only if the Elder was found on all five stages. A different room, a different mechanic, and the reason
    // anybody tells anybody else about this machine.
    let hoard = null;
    if (!ended && stage >= WARREN_STAGES.length) {
        const opened = [];
        // Capped at a dozen for the reason every loop in this file is capped: a round that cannot end is a
        // request that never returns. At a 28% end chance, twelve is far past anything that will happen.
        for (let i = 0; i < 12; i += 1) {
            if (rng() < HOARD_END) { opened.push({ kind: "mother" }); break; }
            const value = HOARD_VALUE * (0.55 + rng() * 1.1);
            total += value * lineBet;
            opened.push({ kind: "mound", value });
        }
        hoard = { opened };
    }

    return { total, stages, hoard, reached: stages.length, full: Boolean(hoard) };
}

// ── HOLD AND SPIN ────────────────────────────────────────────────────────────────────────────────────────────
// The other kind of bonus round, and the reason The Harvest and The Menagerie do not simply have The Hunt's.
// Six or more coins land, every coin LOCKS in place, and you get three respins — every new coin resets the
// count back to three. The tension is the opposite of a pick: a pick is "how long can I keep going", this is
// "please, one more", and it ends by running out of luck rather than by turning over the wrong thing.
//
// Each locked coin carries its own value, so a full board is a real number rather than a fixed prize.
export function runHold(m, cfg, { lineBet = 1, rng = Math.random } = {}) {
    const CELLS = REELS * ROWS;
    // PER CABINET. The Wagon and the Stampede pay differently, and — just as importantly — every payout
    // a machine has must live ON the machine, or a per-cabinet rescale silently misses the ones it does not.
    const VALUES = cfg.values || [2, 2, 2, 3, 3, 5, 8, 15];
    const held = new Array(CELLS).fill(0);      // 0 = empty, else the coin's value
    const steps = [];
    // The coins that triggered it are already on the board.
    let seeded = 0;
    while (seeded < cfg.need) {
        const at = Math.floor(rng() * CELLS);
        if (!held[at]) { held[at] = VALUES[Math.floor(rng() * VALUES.length)]; seeded += 1; }
    }
    steps.push({ held: held.slice(), got: seeded, left: cfg.spins });

    let left = cfg.spins;
    // The chance a given empty cell catches a coin. Tuned so a board very rarely fills and usually stops
    // three or four coins in — check:slot5 measures what this is actually worth.
    const CATCH = 0.055;
    while (left > 0 && held.some((v) => !v)) {
        let got = 0;
        for (let c = 0; c < CELLS; c += 1) {
            if (!held[c] && rng() < CATCH) { held[c] = VALUES[Math.floor(rng() * VALUES.length)]; got += 1; }
        }
        left = got > 0 ? cfg.spins : left - 1;
        steps.push({ held: held.slice(), got, left });
    }
    const filled = held.filter(Boolean).length;
    // A FULL BOARD IS THE THING PEOPLE TELL EACH OTHER ABOUT. It is rare enough to be worth a real number.
    const bonus = filled === CELLS ? (cfg.full || 200) : 0;
    const total = (held.reduce((a, v) => a + v, 0) + bonus) * lineBet;
    return { total, steps, filled, full: filled === CELLS };
}

// ── THE PICK IS GONE ────────────────────────────────────────────────────────────────────────────────────────
// The Petting Pen and The Trawl were the same bonus in two skins: twelve cards, one of them ends it, tap
// until it does. Luke: "I really just don't enjoy it when you select things and get a flat reward with slot
// machine bonuses. I really like layered depth. And I don't like the simple cause and effect of click this
// thing on screen, see a number."
//
// He is right and the numbers agreed: it ended on your SECOND tap 15% of the time, a quarter of rounds paid
// under 3x, and the ceiling was 58x — which you reached one round in twelve, because a board you can clear
// has no top end. Worse, nothing about it compounded. You collected 10, then 10, then 24. It was addition
// with a fanfare on it.
//
// What replaced it is below: ten free spins where every wild LOCKS. See STICKY.

// ── ONE WHOLE PLAY, START TO FINISH ──────────────────────────────────────────────────────────────────────────
// Everything a single press of the button can turn into, resolved in one place so the simulator and the live
// machine cannot disagree about what a spin is worth. `offerId` is the member's choice when the free spins
// trigger; the simulator passes a fixed one, the real machine passes what they tapped.
export function playSpin(m, { bet = 100, rng = Math.random, offerId = "mid" } = {}) {
    const lineBet = bet / LINES.length;
    const grid = spinGrid(m, rng);

    // The landing, always — a cascading machine still has a first grid, and the scatter and bonus counts
    // come off it before anything has broken.
    const first = evaluate(m, grid, { lineBet });

    // ── A CASCADING MACHINE RESOLVES ITSELF ──────────────────────────────────────────────────────────
    // The base "spin" becomes a CHAIN rather than a grid: press once and the machine argues with itself for
    // several seconds. Everything downstream reads the chain's first step as the landing and its running
    // total as what the spin paid. See runCascade.
    const chain = m.cascade ? runCascade(m, grid, { lineBet, rng }) : null;
    const base = chain
        ? { ...first, wins: chain.steps[0].wins, total: chain.total }
        : first;

    let total = base.total;
    let free = null; let locked = null; let hold = null; let built = null; let warren = null;

    // ── EARNED BY WATCHING ───────────────────────────────────────────────────────────────────────────
    // Enough consecutive breaks opens the free round whether or not a scatter ever landed. It is the only
    // way into a bonus on this floor that has nothing to do with what the reels stopped on.
    const byCascade = Boolean(chain && m.cascade && chain.cascades >= m.cascade.trigger);

    if (first.freeSpins || byCascade) {
        let offer;
        if (m.free?.kind === "built") {
            // THE VAULT BUILDS ITS OWN. The picking happens first and decides the round that follows.
            built = runBuild(m, { rng, baseSpins: m.free.spins, baseMult: 1 });
            offer = { id: "built", kind: "fixed", label: m.free.label, spins: built.spins, mult: built.mult, sticky: false };
        } else if (m.free?.kind === "deals") {
            offer = FREE_SPIN_OFFERS.find((o) => o.id === offerId) || FREE_SPIN_OFFERS[1];
        } else {
            // `mult` off the cabinet rather than hardcoded to 1: a round can now carry a flat multiplier of
            // its own (The Harvest doubles every tumbling spin), and a hardcoded 1 silently discarded it.
            offer = { id: m.free.kind, kind: m.free.kind, label: m.free.label, spins: m.free.spins,
                mult: m.free.mult || 1, sticky: false };
        }
        free = runFreeSpins(m, offer, { lineBet, rng });
        free.kind = offer.kind || "deals";
        free.label = offer.label;
        free.mult = offer.mult || 1;
        free.byCascade = byCascade && !first.freeSpins;
        total += free.total;
    }
    if (first.pick && m.second?.kind !== "build") {
        if (m.second?.kind === "hold") {
            hold = runHold(m, m.second, { lineBet, rng });
            total += hold.total;
        } else if (m.second?.kind === "warren") {
            warren = runWarren(m, { lineBet, rng });
            total += warren.total;
        } else if (m.second?.kind === "sticky") {
            // ── STICKY ───────────────────────────────────────────────────────────────────────────────
            // Ten free spins in which every wild that lands STAYS THERE for the rest of the round. It is
            // the same runFreeSpins the scatter round uses — `sticky` was already a flag on it — so this
            // round retriggers like any other, and the spins a retrigger buys are played on the board the
            // first ten filled up.
            //
            // That last part is the whole point, and it is the thing a pick could never do: three separate
            // systems compounding into one another. Spins accumulate wilds, wilds make lines more likely,
            // more lines mean more scatters seen, and a retrigger hands the accumulated board another ten.
            // Nothing here is "tap a thing, read a number".
            locked = runFreeSpins(m, {
                id: "sticky", kind: "sticky", spins: m.second.spins || 10,
                mult: m.second.mult || 1, sticky: true, label: m.second.label,
            }, { lineBet, rng });
            locked.kind = "sticky";
            locked.label = m.second.label;
            locked.mult = m.second.mult || 1;
            total += locked.total;
        }
    }
    return { grid, base, chain, free, locked, hold, built, warren, total, bet };
}
