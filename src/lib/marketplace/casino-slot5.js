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
        // ── JUICY, NOT RUSTIC ────────────────────────────────────────────────────────────────────────
        // Luke: "they need to be sexy and really dopamine-inducing icons in the tiles — think about the
        // star fruit and all those cool things."
        //
        // The first pass drew an honest farm: a flour sack, an ear of corn, a jar of preserves. Correct
        // theme, wrong appetite. A slot machine wants CANDY — the fruit machines everybody already finds
        // irresistible — and burlap is the least appetising surface there is. The tones below are the fruit,
        // so the tile a symbol sits on is the colour of the thing on it.
        bone: { rank: 1, role: "low", tone: "#b8e832", name: "Star Fruit" },
        doubloon: { rank: 2, role: "low", tone: "#ff8a2b", name: "Orange" },
        laurel: { rank: 3, role: "mid", tone: "#e8355e", name: "Strawberry" },
        chest: { rank: 4, role: "bonus", tone: "#9b3ae8", name: "Grapes" },
        // THE HARVEST MOON is the one thing on this reel that glows from inside, because three of it on a
        // line is the whole reason the cabinet exists. It was a "Storm Bottle" in cold blue — a fishing
        // object on a farm, in the one colour nothing else here uses, which is a symbol nobody could learn.
        moon: { rank: 5, role: "scatter", tone: "#ffb43a", name: "Harvest Moon" },
        // The only COOL thing on a reel of hot fruit, which is exactly what makes it pop out of a line.
        wolf: { rank: 6, role: "wild", tone: "#5ac8f0", name: "The Wheat Wolf" },
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
        // Not an animal any more — the wild on this cabinet is the WORD, in prismatic metal. The wild is
        // the only symbol whose job is not to be itself: everything else is a thing you are collecting and
        // this one is a RULE, so drawing it as one more creature filed it with the things it substitutes
        // for. On a board that is a fifth wild, that read as a board of chameleons.
        wolf: { rank: 6, role: "wild", tone: "#b45aff", name: "Wild" },
        // ── THE TWO GIANTS ───────────────────────────────────────────────────────────────────────
        // Luke, on the reference: "it has a Lil' Red and a Big Bad Wolf, and they're not repeating tiles,
        // they're actually one big one, and they only show up in the big reels. Those are the best paying
        // ones — the goal is to get them to line up, because that's how you get the massive payout, when
        // you get four or five of the big ones stacked next to each other."
        //
        // So: two characters, drawn ONCE at the height of the block they fill rather than tiled, on the
        // colossal set only, above everything else on the ladder. A pair rather than one, because the
        // reference's pull is the girl and the wolf — two things you are hunting at once, and a board with
        // one of each on it is a board where either could be the one that lines up.
        keeper: { rank: 7, role: "giant", tone: "#ffd08a", name: "The Keeper" },
        dire: { rank: 8, role: "giant", tone: "#ff5a7a", name: "The Dire Wolf" },
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
    // ── EVERY SYMBOL PAYS AT THREE ───────────────────────────────────────────────────────────────────
    // Luke, on The Vault: "again, not a payline for both blues and the orange?" — three times in a row, on
    // three different boards. He was right every time and it was not the evaluator: the two LOW symbols had
    // no three-of-a-kind pay at all, and Sapphire had no four either. Sapphire is the commonest thing on the
    // reel, so the board was permanently full of three-in-a-row that paid nothing, on the twenty lines the
    // machine advertises. Nothing tells you that. It reads as broken, and "it reads as broken" is worse than
    // any RTP number.
    //
    // The same hole was in The Hunt (Bone) and The Deep (Herring and Mackerel) — and those three cabinets
    // are exactly the three with the enormous top prizes. That is the trade that had been made without
    // anyone deciding it: everything at the bottom of the ladder removed to pay for the top of it.
    //
    // Filled in at The Menagerie's ratios, which were the one complete ladder on the floor, and paid for out
    // of the SAME cabinet's five-of-a-kind rather than by lifting the floor. That is not levelling a cabinet
    // down to a target — it is moving money from rare-and-enormous to common-and-small on one machine, which
    // is the actual fix for "nothing ever pays".
        wolf: { 3: 14.7, 4: 132, 5: 1610 },
        chest: { 3: 5.03, 4: 43.9, 5: 396 },
        laurel: { 3: 1.83, 4: 13.2, 5: 110 },
        doubloon: { 3: 0.92, 4: 5.03, 5: 36.6 },
        bone: { 3: 0.48, 4: 1.83, 5: 14.7 },
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
    // ── THE MOON MOVED TO REELS ONE, TWO AND THREE ───────────────────────────────────────────────────
    // Because the bonus is a LINE now (see lineTrigger below) and it sat on reels 1, 3 and 5, which makes
    // three of it in a row not rare but impossible. Left to right across the first three is also what makes
    // it watchable: two moons up and reel three still turning is the best second this cabinet has.
    strips: [
        { bone: 26, doubloon: 22, laurel: 18, chest: 8, moon: 11, wolf: 0 },
        { bone: 24, doubloon: 21, laurel: 17, chest: 8, moon: 10, wolf: 7 },
        { bone: 24, doubloon: 20, laurel: 16, chest: 8, moon: 10, wolf: 8 },
        { bone: 24, doubloon: 21, laurel: 17, chest: 8, moon: 0, wolf: 7 },
        { bone: 26, doubloon: 22, laurel: 18, chest: 8, moon: 0, wolf: 0 },
    ],
    // -- AND THE PAYTABLE CARRIES THE CABINET NOW ------------------------------------------------
    // Taking the cascade out cost sixty points of return: it went from 100.80 per cent to 39.80,
    // because a chain re-paid the same landing two or three times a spin and this paytable had been
    // written knowing that. A machine that pays ONCE per spin needs bigger line pays for exactly the
    // same money, so these are the old numbers x2.60 -- swept over 150,000 spins rather than guessed.
    // Base game 40 per cent of the return, the built round 60, which is what a Pharaoh's-Fortune bonus
    // is supposed to be: the base game keeps you in the chair and the bonus is the payday.
    pays: {
        wolf: { 3: 5.41, 4: 33.28, 5: 281.84 },
        chest: { 3: 2.83, 4: 15.21, 5: 102.18 },
        laurel: { 3: 1.4, 4: 7.05, 5: 40.04 },
        doubloon: { 3: 0.62, 4: 3.33, 5: 16.61 },
        bone: { 3: 0.42, 4: 1.77, 5: 8.09 },
    },
    scatterPays: { 3: 0.83, 4: 3.33, 5: 16.61 },
    // ── AND IT DOES NOT CASCADE ──────────────────────────────────────────────────────────────────────
    // It used to: every win threshed away, what was above falling into the hole, the multiplier climbing
    // with each break, and eight breaks opening the round. That is The Vault's mechanic and The Vault is
    // where it belongs — with the Win It Again meter above it, which is what a cascading cabinet is FOR.
    // Two cascading machines on a five-machine floor is two machines that play the same, and this one is
    // supposed to be the plain one: reels land, lines pay, three moons on a payline open the bonus, and
    // everything interesting happens on the Threshing Floor rather than in the base game.
    // ── ITS FREE ROUND IS FOURTEEN CASCADES ──────────────────────────────────────────────────────────
    // This was `growing` — the multiplier climbing 1x to 14x across the round — from before the cabinet
    // tumbled. Now that the free round cascades too, that ladder rides on TOP of the chain's own 1-to-20,
    // and the two compound to x280: the machine returned 707% and the free round was worth more than the
    // rest of the game put together.
    //
    // The chain IS the multiplier here. The round just doubles it, every spin, and the depth does the rest.
    // ── YOU BUILD THE ROUND ON THE THRESHING FLOOR ───────────────────────────────────────────────────
    // Luke, with Pharaoh's Fortune in hand: "if you get three on a payline you trigger the bonus... before
    // you start the free spins there's this beautiful section where you pick all these tiles, and the tiles
    // can either be plus one spin or plus one multiplier... and once you finally get the begin free spins it
    // starts the free spins with the amount that you got and the multiplier that you got."
    //
    // NINE AND ONE TO START, so a begin tile on the first tap is still a real round rather than a shrug.
    // The pool above it does the rest: about five more spins and one more multiplier on an average walk.
    // Three moons on a payline, left to right from reel one — see lineTrigger in evaluate().
    lineTrigger: true,
    free: { kind: "built", spins: 9, label: "Turn the sheaves, then the round begins" },
    second: { kind: "build", label: "The Threshing Floor" },
    pick: { spins: 26, mult: 6, begin: 4 },
    // THE WAGON IS GONE. It was this cabinet's hold-and-spin and it was a good one, but the machine Luke is
    // pointing at has ONE bonus and this is it — a cabinet with a pick AND a hold has two second features and
    // no identity. Its numbers are in the history if it is ever wanted back.
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
    // ── EVERY SYMBOL PAYS AT THREE ───────────────────────────────────────────────────────────────────
    // Luke, on The Vault: "again, not a payline for both blues and the orange?" — three times in a row, on
    // three different boards. He was right every time and it was not the evaluator: the two LOW symbols had
    // no three-of-a-kind pay at all, and Sapphire had no four either. Sapphire is the commonest thing on the
    // reel, so the board was permanently full of three-in-a-row that paid nothing, on the twenty lines the
    // machine advertises. Nothing tells you that. It reads as broken, and "it reads as broken" is worse than
    // any RTP number.
    //
    // The same hole was in The Hunt (Bone) and The Deep (Herring and Mackerel) — and those three cabinets
    // are exactly the three with the enormous top prizes. That is the trade that had been made without
    // anyone deciding it: everything at the bottom of the ladder removed to pay for the top of it.
    //
    // Filled in at The Menagerie's ratios, which were the one complete ladder on the floor, and paid for out
    // of the SAME cabinet's five-of-a-kind rather than by lifting the floor. That is not levelling a cabinet
    // down to a target — it is moving money from rare-and-enormous to common-and-small on one machine, which
    // is the actual fix for "nothing ever pays".
    //
    // The Deep took 99.17% to 118.33% on the fill alone — a low symbol's three-of-a-kind is the most common
    // event on a reel, so it costs far more than its size suggests. Swept: the new bottom rungs are small
    // (Herring 0.14, Mackerel 0.26) and the top four/five came down about 8% to pay for them.
        wolf: { 3: 20.9, 4: 146, 5: 1638 },
        chest: { 3: 6.19, 4: 43.7, 5: 375 },
        laurel: { 3: 2.09, 4: 12.6, 5: 107 },
        doubloon: { 3: 0.26, 4: 4.75, 5: 37.1 },
        bone: { 3: 0.14, 4: 1.2, 5: 10.4 },
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
    // ── IT IS A COLOSSAL-REELS CABINET NOW ───────────────────────────────────────────────────────────
    // Two sets spun at once: this ordinary 5x3 and a 5x12 beside it. The scatter already lived only on
    // reels one, three and five, which is exactly where Luke's reference puts it — "the bonus icon shows up
    // on reels 1, 3 and 5 in both screens" — so the strips did not have to move for that.
    //
    // The WILD did have to. It was on reels two and four only, which is the right shape for a machine whose
    // wild is a rare substitution and the wrong one for a machine whose wild arrives in blocks and is meant
    // to fill a column: a column that can never be all wild can never transfer, and the transfer is the
    // whole cabinet. It is on every reel now, in a smaller amount, and it STACKS (see `stacks`).
    strips: [
        { bone: 21, doubloon: 19, laurel: 17, chest: 10, moon: 6, wolf: 4 },
        { bone: 20, doubloon: 18, laurel: 16, chest: 10, moon: 0, wolf: 6 },
        { bone: 20, doubloon: 17, laurel: 15, chest: 10, moon: 5, wolf: 7 },
        { bone: 20, doubloon: 18, laurel: 16, chest: 10, moon: 0, wolf: 6 },
        { bone: 21, doubloon: 19, laurel: 17, chest: 10, moon: 5, wolf: 4 },
    ],
    // A drawn wild is extended into a run rather than sitting alone, which is what "wilds come in big
    // blocks" means and the only way a three-row column is ever entirely wild.
    stacks: { wolf: [2, 3] },
    colossal: {
        label: "The Colossal Reels",
        // The tall set is the same symbols at slightly leaner odds — it is twelve rows and eighty lines, so
        // it does not need the main set's density to be busy.
        // ── AND THE MOON IS ALMOST GONE FROM THE TALL SET ────────────────────────────────────────────
        // Thirty-six scatter-eligible cells over here against nine on the main board, so the density that
        // makes three moons a hunt on a 5x3 makes them nearly certain on a 5x12: at the main set's weight
        // the bonus fired on one spin in TWO. A quarter of a point puts the door back at one spin in 36.
        strips: [
            { bone: 22, doubloon: 19, laurel: 16, chest: 8, moon: 0.25, wolf: 3, keeper: 0.34, dire: 0.34 },
            { bone: 21, doubloon: 18, laurel: 15, chest: 8, moon: 0, wolf: 5, keeper: 0.34, dire: 0.34 },
            { bone: 21, doubloon: 17, laurel: 14, chest: 8, moon: 0.25, wolf: 6, keeper: 0.34, dire: 0.34 },
            { bone: 21, doubloon: 18, laurel: 15, chest: 8, moon: 0, wolf: 5, keeper: 0.34, dire: 0.34 },
            { bone: 22, doubloon: 19, laurel: 16, chest: 8, moon: 0.25, wolf: 3, keeper: 0.34, dire: 0.34 },
        ],
        // Blocks, and bigger ones than the small set gets — twelve rows can carry them. The two giants take
        // a third to a half of the column each, which is what makes "four or five of them lined up" a thing
        // that can actually happen and what makes it worth watching the tall reels come to rest.
        stacks: { wolf: [3, 6], chest: [2, 3], keeper: [4, 6], dire: [4, 6] },
        // Drawn as ONE image over the rows they occupy rather than tiled — see `giants` in the client. The
        // engine still stores them as a run of ordinary cells, because the maths must not care how tall a
        // picture is: a line through row 7 hits The Dire Wolf whether he is drawn once or six times.
        giants: ["keeper", "dire"],
        // ── AND THE LAST COLOSSAL REEL CHANGES IN THE BONUS ──────────────────────────────────────────
        // "The final column is actually different during the bonus — it's got normal pay symbols, but then
        // it has stacking multipliers." 25x is deliberately once in a long while; the small ones are what
        // you actually live on. The mini and the major that also sit here on the reference are not built:
        // Luke, explicitly, "for now we won't do the mini or the major."
        multStrip: { bone: 20, doubloon: 16, laurel: 12, chest: 7, m2: 14, m3: 9, m5: 5, m10: 2, m25: 1 },
        multStacks: { m2: [2, 4], m3: [2, 3], m5: [2, 3], m10: [1, 2], m25: [1, 1] },
    },
    // ── A HUNDRED LINES, PAID AT A HUNDREDTH ─────────────────────────────────────────────────────────
    // Every number here is the old table x0.11. That is not the cabinet being nerfed: it now resolves 100
    // lines across two grids instead of 20 across one, and the 5x12 set alone lands eight winning lines on
    // an average press. A per-line pay written for a 5x3 board pays five times over on this one.
    pays: {
        // The two giants sit above the wild, which is the right order for this cabinet: the wild is how you
        // COMPLETE a line of them, so it must be worth less than the thing it is completing.
        dire: { 3: 1.71, 4: 10.26, 5: 91.69 },
        keeper: { 3: 1.48, 4: 8.55, 5: 74.59 },
        wolf: { 3: 0.9, 4: 5.12, 5: 43.93 },
        chest: { 3: 0.43, 4: 2.23, 5: 14.62 },
        laurel: { 3: 0.22, 4: 1.03, 5: 5.82 },
        doubloon: { 3: 0.11, 4: 0.51, 5: 2.48 },
        bone: { 3: 0.07, 4: 0.28, 5: 1.16 },
    },
    scatterPays: { 3: 0.1, 4: 0.49, 5: 2.52 },
    // ── HOW MANY SCATTERS BOUGHT HOW MANY SPINS ──────────────────────────────────────────────────────
    // "If you trigger the bonus you get a certain amount of free spins depending on how many scatters you
    // get." Three is the door; every one after that is worth a lot more than the last, which is what makes
    // a fourth moon on a board that already has three the best second on the machine.
    free: { kind: "colossal", spins: 8, label: "The Colossal Reels",
        bySctr: { 3: 8, 4: 15, 5: 25, 6: 40 } },
    // THE STAMPEDE IS GONE. It was this cabinet's hold-and-spin and a good one, but the machine Luke is
    // pointing at has ONE bonus and this is it — a cabinet with a colossal free round AND a hold has two
    // second features and no identity. Same call as The Harvest's Wagon; its numbers are in the history.
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
    // ── A CASCADING PAYTABLE, NOT THE OLD ONE ────────────────────────────────────────────────────────
    // Scaled to 0.630 of what it was, and this is NOT a nerf to hold a number — it is a different machine.
    // The old table was built for a cabinet that resolved a spin in ONE step and whose whole identity was a
    // long wait for a 1,918x wolf. This one tumbles, so a single press can pay four times over, and then the
    // meter pays those wins back AGAIN. Left alone the Vault returned 155.89% against a floor at 100 — not
    // rich, just strictly the best cabinet to sit at, which is the one thing the spread rule exists to stop.
    //
    // The features were NOT touched to get there, on purpose (see the long note at the top of
    // check-slot5.mjs). The meter still holds five spins and still fires on three tumbles, the way Luke
    // specced it; the gem ladder is untouched. What moved is the base, which is the part that was written
    // for a machine that no longer exists.
    // ── EVERY SYMBOL PAYS AT THREE, AND THIS IS WHAT IT COST ─────────────────────────────────────
    // Luke, after seeing the dashes in the paytable: "yeah that's a problem, there should always be pay
    // tables for anything listed if it's 3 or more." Agreed, and it is the better rule — I had argued the
    // other way and was wrong. A symbol printed on the reel that cannot pay on the line the machine is
    // drawing for you is a promise the cabinet does not keep, and no footnote fixes that.
    //
    // It is expensive HERE specifically, because this is the machine that tumbles. Filling Sapphire and
    // Topaz in took the cabinet from 95% to 395% — not because the new rungs are big, but because a pay
    // on the commonest symbol makes almost every spin start a chain, and a chain hands every OTHER pay
    // another go at the board. Removing any one of the three additions roughly halved the result; a
    // three-pay of 0.03 still returned 365%.
    //
    // So the money comes back out of the top of the ladder and out of the multiplier climb, and the
    // machine's character moves with it: The Vault used to be rare enormous chains, and is now constant
    // small ones with the Gem Vault and the Win It Again row on top. Three in four spins pay something.
    // That is what a tumbling cabinet actually is, and it is the honest shape for one.
    //
    // Swept, not guessed: ladder [1,2,3,4,6,8,12] with the table at x0.195.
    //
    // AND THE METER IS THE OTHER HALF OF THE BILL. Win It Again pays back the sum of your last five wins
    // when a spin breaks three times, and three breaks used to be uncommon — with every symbol paying at
    // three it happens on roughly one spin in four, which took the meter from a flourish to a THIRD of the
    // machine's whole return. It scales with the paytable, so the same x0.195 pays for it; but a "boom boom
    // boom" that fires every fourth spin is a celebration that has stopped being one, and `winAgain.need`
    // is the dial for that if Luke wants it rarer than he first specced.
    cascadeMult: [1, 2, 3, 4, 6, 8, 12],
    pays: {
        wolf: { 3: 2.35, 4: 17.92, 5: 235.29 },
        chest: { 3: 0.68, 4: 5.18, 5: 51.81 },
        laurel: { 3: 0.24, 4: 1.52, 5: 12.25 },
        doubloon: { 3: 0.11, 4: 0.51, 5: 3.7 },
        bone: { 3: 0.07, 4: 0.27, 5: 1.07 },
    },
    scatterPays: { 3: 0.5, 4: 2.6, 5: 17.3 },
    // ── IT TUMBLES, IT REMEMBERS, AND ITS SCATTER OPENS A COLLECTION ─────────────────────────────────
    // Luke, with a reference machine in hand: "I wanted the Vault slot machine laid out like this — where
    // it cascades, and then you can win it again. So every time you win an amount, that goes up top. And
    // then if you get three cascades in a row it does this animation where it goes boom boom boom and it
    // highlights each of the things across the top from left to right and does a win-it-again sound
    // effect, and you win all the amount in the top right."
    //
    // THE LOCKS ARE GONE, on his call. They were the best pick on the floor and this is a better cabinet:
    // the Locks were one screen you visited, and these two features run THROUGH the base game. The meter
    // is filling on every spin whether you are looking at it or not, which is the thing the reference does
    // that nothing here did — it makes an ordinary spin matter to a later one.
    cascade: { label: "The Vault Falls" },
    // Three breaks in one spin pays out everything the meter has been holding. `need` is the number of
    // CASCADES, not of wins; `slots` is how many spins the meter remembers. Both live here rather than in
    // the engine so the cabinet owns its own feature, the way every other one does.
    winAgain: { slots: 5, need: 3, label: "WIN IT AGAIN" },
    second: { kind: "gems", label: "The Gem Vault" },
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
// ── A COLUMN, WITH THINGS THAT STACK ─────────────────────────────────────────────────────────────────────────
// "Wilds come in big blocks." A column drawn symbol-by-symbol out of a weighted bag gives you a wild here and a
// wild there and never a block, so a drawn wild is EXTENDED into a run — which is what makes a full column, and
// a full column is what transfers. Same machinery for the multipliers, which stack for the same reason.
function stackedColumn(bag, rows, rng, stacks = {}, whole = []) {
    const col = [];
    let guard = 0;
    while (col.length < rows) {
        const sym = pick(bag, rng);
        const run = stacks[sym];
        const n = run ? run[0] + Math.floor(rng() * (run[1] - run[0] + 1)) : 1;
        // ── A GIANT IS NEVER CUT OFF BY THE BOTTOM OF THE REEL ────────────────────────────────────────
        // The two giants are drawn as ONE picture over the rows they occupy, so a run that ran out of reel
        // came out as a standing figure cropped into a single cell — a crowned head in a letterbox, which
        // reads as a rendering fault rather than as a symbol. Anything in `whole` is re-drawn rather than
        // truncated: it lands at full height or it does not land. The guard is because a bag that is nearly
        // all giants could otherwise spin here forever.
        if (whole.includes(sym) && col.length + n > rows && guard < 24) { guard += 1; continue; }
        for (let i = 0; i < n && col.length < rows; i += 1) col.push(sym);
    }
    return col;
}

export function spinGrid(m, rng = Math.random) {
    // `stacks` makes a drawn symbol come out as a RUN rather than alone — the difference between a wild here
    // and there and a wild BLOCK, and on a colossal cabinet the only way a three-row column is ever entirely
    // wild. Cabinets without it are drawn cell by cell exactly as before.
    if (m.stacks) return m.strips.map((bag) => stackedColumn(bag, ROWS, rng, m.stacks));
    return m.strips.map((bag) => Array.from({ length: ROWS }, () => pick(bag, rng)));
}

// ── WHAT A GRID PAID ─────────────────────────────────────────────────────────────────────────────────────────
// Left to right from reel one, which is the rule every real machine uses and the reason a win always starts at
// the left edge: it halves the number of winning combinations, which is what makes the top prizes affordable.
//
// `mult` is the feature multiplier — 1 in the base game, more inside free spins. It multiplies LINE and
// SCATTER wins, and deliberately not the pick bonus, which brings its own numbers.
// `lines`/`rows` so the same evaluator can read the COLOSSAL set, which is twelve rows tall on its own
// hundred-line table; `noScatter` because a colossal cabinet spins two grids and the scatter must be counted
// across the pair and paid once, rather than paid twice by two independent calls.
export function evaluate(m, grid, { lineBet = 1, mult = 1, lines = LINES, rows = ROWS, noScatter = false } = {}) {
    const wins = [];
    let total = 0;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
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
        for (let reel = 0; reel < n; reel += 1) cells.push(reel * rows + line[reel]);
        wins.push({ kind: "line", line: i, symbol: lead, count: n, amount, cells });
    }

    // Scatters pay from anywhere, on the total bet.
    const scatters = grid.flat().filter((s) => s === m.scatter).length;
    const sPay = noScatter ? 0 : m.scatterPays[scatters];
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
    // ── THREE ON A LINE, NOT THREE ANYWHERE ──────────────────────────────────────────────────────────────
    // Luke, describing Pharaoh's Fortune: "if you get three on a payline you trigger the bonus."
    //
    // A scatter is found; a LINE is watched. Three moons anywhere is a fact you are told after the reels
    // stop, and three moons marching left to right across reels one, two and three is something you can see
    // coming with a reel still spinning — which is the entire drama of a slot machine and the reason the
    // reels stop in order at all.
    //
    // It only works if the symbol is ON those reels. The Harvest's moon used to sit on reels 1, 3 and 5,
    // which makes three-in-a-row not rare but IMPOSSIBLE — the strips had to move with the rule.
    let lineTrig = 0;
    if (m.lineTrigger) {
        for (const line of LINES) {
            let n = 0;
            while (n < REELS && grid[n][line[n]] === m.scatter) n += 1;
            if (n > lineTrig) lineTrig = n;
        }
    }
    return {
        wins,
        total,
        scatters,
        bonuses,
        lineTrig,
        freeSpins: m.lineTrigger ? lineTrig >= 3 : scatters >= 3,
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
// ── THE PICK BEFORE THE ROUND ────────────────────────────────────────────────────────────────────────────────
// Luke, with Pharaoh's Fortune in hand: "before you start the free spins there's this beautiful section where
// you have to pick all these tiles, and the tiles can either be plus one spin or plus one multiplier. There's
// a total of six multiplier tiles hidden and a total of 26 free spin tiles hidden, and then there's a begin
// free spins — I think four of those tiles — and once you get the begin free spins it starts the free spins
// with the amount that you got and the multiplier that you got."
//
// THERE IS NO BAD TILE, and that is the whole mechanic. Every tile is a gift — another spin, another
// multiplier — and the one that ends it does not take anything away, it starts the thing you were building.
// The tension is entirely "how much more dare I stack", and the answer is never a punishment. That is the
// opposite of a pick where one tile ends the round and takes the board with it: same interaction, same number
// of taps, completely different feeling, and only one of them is replayed.
//
// THE POOL IS THE BALANCE. 36 tiles, 4 of which end it, so the expected walk is (36-4)/(4+1) = 6.4 tiles —
// about five spins and one multiplier on top of the base. Landing a begin on the first tap still hands over a
// real round, which is why there is a base at all.
const PICK_POOL = { spins: 26, mult: 6, begin: 4 };

export function pickTiles(m) {
    const p = m?.pick || PICK_POOL;
    return [
        ...Array.from({ length: p.spins }, () => ({ kind: "spins", value: 1 })),
        ...Array.from({ length: p.mult }, () => ({ kind: "mult", value: 1 })),
        ...Array.from({ length: p.begin }, () => ({ kind: "launch" })),
    ];
}

export function runBuild(m, { rng = Math.random, baseSpins = 5, baseMult = 1 } = {}) {
    const board = pickTiles(m);
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
    // `board` goes back whole as well as the prefix that was walked: the screen turns the rest of the tiles
    // over at the end so you can see what was still out there, the same as the Gem Vault.
    return { picked, board, spins, mult, tiles: board.length };
}

// ── THE VAULT'S GEM PICK ─────────────────────────────────────────────────────────────────────────────────────
// Luke, describing the machine he wants the Vault to be: "there's a bonus game where there's these three spy
// glasses — if you get three scattered you initiate the bonus where you pick a bunch of different gems and
// then it reveals what's behind them, and it shows you on the bottom the different prizes associated with the
// gems... and then when you finally get the slots all filled that gives you that prize."
//
// So it is a COLLECTION, not a ladder you climb. Four gems, four prizes, and every pick is a stone going into
// one of four sets. The first set to fill pays and the bonus ends — which means every tile you turn is good
// for somebody and the tension is which of the four is going to get there.
//
// WHY THE RARE ONE NEEDS MORE OF ITSELF, not just fewer on the board: if the diamond were simply scarce you
// would know inside two picks that it was gone. Needing SIX of them keeps it alive and losable deep into the
// board, which is the whole drama — you can be one diamond short when the ambers fill and it is over.
//
// The server lays out the whole board and the ORDER it will come out in; the screen maps the tile a finger
// landed on to the next thing in that order. Same honesty as the Warren: pretending the chosen tile decides
// the outcome would be a lie, and pretending it does not matter which one you touched would look broken.
// `pay` is a multiple of the TOTAL BET, and `need` is how many of that stone fill its set.
// NOTHING NEW WAS DRAWN. The Jeweller already has six stones at five cuts each (public/images/gems), so the
// four sets are four of those — and the CUT climbs with the set, so the stone you are chasing is visibly the
// better rock as well as the bigger number. The reference machine's top prize is a diamond and we do not have
// one; a tier-five ruby is the same idea in this game's own palette.
export const GEM_SETS = [
    { key: "topaz", name: "Topaz", need: 4, pay: 8, art: "/images/gems/topaz_t2.png", color: "#ffc74d" },
    { key: "sapphire", name: "Sapphire", need: 4, pay: 18, art: "/images/gems/sapphire_t3.png", color: "#5aa9ff" },
    { key: "emerald", name: "Emerald", need: 5, pay: 45, art: "/images/gems/emerald_t4.png", color: "#4bd88a" },
    { key: "ruby", name: "Ruby", need: 5, pay: 200, art: "/images/gems/ruby_t5.png", color: "#ff5470" },
];
// TWENTY-FOUR TILES, four across and six down, and the composition is the whole balance of the bonus — the
// prizes do not have odds of their own, they fall out of which set gets there first.
//
// Tuned by simulation, not by feel. The first pass gave amber 79% and the two good stones LITERALLY ZERO:
// amber needed three and had seven on the board, so it was always home before anything else had started.
// Sapphire and emerald carrying the same need as the set below them is what keeps all four in the race —
// the difference between them is how many are down there, not how many you must find.
//
//   topaz 53.8%   sapphire 33.3%   emerald 10.0%   ruby 2.9%
const GEM_BAG = { topaz: 7, sapphire: 6, emerald: 6, ruby: 5 };

export function runGems(m, { lineBet = 1, rng = Math.random } = {}) {
    const bag = [];
    for (const [key, n] of Object.entries(GEM_BAG)) for (let i = 0; i < n; i += 1) bag.push(key);
    for (let i = bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const need = Object.fromEntries(GEM_SETS.map((g) => [g.key, g.need]));
    const have = Object.fromEntries(GEM_SETS.map((g) => [g.key, 0]));
    const order = [];
    let won = null;
    for (const key of bag) {
        order.push(key);
        have[key] += 1;
        if (have[key] >= need[key]) { won = key; break; }
    }
    // ── THE BOARD ALWAYS PAYS ────────────────────────────────────────────────────────────────────────────
    // A bag that runs out with nothing filled would be a bonus you can lose, which this is not — three
    // scatters is the rarest thing on the cabinet and it must never resolve to a shrug. The composition
    // makes it unreachable in practice; this is the guard that means I do not have to prove that by hand.
    if (!won) won = GEM_SETS[0].key;
    const set = GEM_SETS.find((g) => g.key === won) || GEM_SETS[0];
    const total = set.pay * lineBet * LINES.length;
    // `tiles` is the whole board, not the number of stones that were drawn. The screen builds its covers from
    // this: sizing the board off `order` gave a seven-tile board on a run that filled a set in seven picks,
    // which reads as "the bonus is nearly over before it starts" and hides the whole shape of the thing.
    // `board` is the WHOLE bag in its shuffled order, `order` only the prefix that was actually drawn. The
    // screen needs both: the prefix to play, and the rest to turn over at the end — Luke: "whenever you
    // reveal and get the prize, we also want to show for a little while everything else that you didn't pick,
    // so that you know what you missed." Which is the best part of a pick bonus and the part that makes you
    // want another one: seeing the ruby that was one cover away.
    return { order, board: bag, have, won, total, tiles: bag.length, sets: GEM_SETS.map((g) => ({ ...g })) };
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
        // Per cabinet, falling back to the house ladder. The Vault needs its own now that every symbol
        // pays at three: chains got both longer and far more common, and a 20x top rung on top of that is
        // what took the machine to 395%. Gentler climb, bigger paytable — same money, better shape.
        const ladder = m.cascadeMult || CASCADE_MULT;
        const mult = ladder[Math.min(n, ladder.length - 1)] * round;
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
// Three colossal geodes, and you crack exactly ONE — then you are put back on the Deep Warren's wall to look
// for another Elder. Luke chose that shape over the Hoard being a room you work through, and it is the better
// one: it makes the last room a loop rather than a corridor, and every trip back is a fresh chance at either
// another geode or the Mother.
//
// Which is why the Deep Warren seeds TWO Elders against its one Mother. At one apiece a return trip would be
// a coin flip and the loop would almost never run; at two the odds of getting back are 2/3, so a run that
// reaches the bottom usually takes a couple of geodes and can, rarely, take five.
// Four, since the Deep Warren's wall stopped resetting between geodes (see runWarren). With a board that
// persists, the number of trips to the Hoard is decided ONCE — by how many Elders sit above the Mother in
// the shuffle — rather than by an independent coin flip per visit, and the expected count is elders/2. Four
// keeps that at two while putting enough of them in the wall that "a few Elders in the eggs" is true of the
// thing rather than only of the odds.
const DEEP_ELDERS = 4;
const HOARD_VALUE = 560;

export function runWarren(m, { lineBet = 1, rng = Math.random } = {}) {
    // ── FIFTEEN, NOT NINE ────────────────────────────────────────────────────────────────────────────────
    // A wall of eggs rather than a tic-tac-toe board, which is what the machine Luke is pointing at actually
    // looks like — and it is not only cosmetic. Thirteen critter eggs against an Elder and a Mother means the
    // expected number opened per room is 4.3 rather than 2.3, so a room is a visit rather than two taps.
    const NESTS = 15;
    const LAST = WARREN_STAGES.length - 1;
    // A hard stop on the loop. The Deep Warren can in principle hand back Elder after Elder, and a round that
    // cannot end is a request that never returns — the same rule every other loop in this file follows.
    const MAX_VISITS = 24;

    const stages = [];
    let total = 0;
    let stage = 0;
    let ended = false;
    let geodes = 0;

    // ── THE WALL REMEMBERS ───────────────────────────────────────────────────────────────────────────────
    // Luke: "when you return from the hoard the eggs you opened should still be open."
    //
    // Every visit used to build a brand-new fifteen and shuffle it, so cracking a geode and coming back put
    // you in front of a full wall again — which quietly says the room resets, and a room that resets is not
    // a room, it is a slot machine inside a slot machine. Now the board and the cursor live OUTSIDE the loop
    // and are rebuilt only when the stage actually changes. Come back from the Hoard and the eggs you tore
    // open are still torn open, the crowd you let out is still on the floor, and there are fewer places left
    // for the Mother to not be.
    //
    // That is a real change to the odds and it is the point of it: the wall empties, so every return is a
    // little more dangerous than the last, and the fifth room stops being an unbounded loop.
    let board = null;
    let cursor = 0;
    let boardStage = -1;

    while (!ended && stages.length < MAX_VISITS) {
        const cfg = WARREN_STAGES[stage];
        if (stage !== boardStage) {
            // ── AND THE DEEP WARREN HOLDS SEVERAL ELDERS ─────────────────────────────────────────────
            // Luke: "keep in mind we should have a few elders in the eggs, that way you can get to the
            // hoard a few times." Everywhere above it, one Elder against one Mother is the coin flip that
            // keeps the ladder honest; down here the whole shape of the room is how many Elders are still
            // hiding in what is left of the wall.
            const elders = stage === LAST ? DEEP_ELDERS : 1;
            board = [
                ...Array.from({ length: NESTS - elders - 1 }, () => ({ kind: "pups" })),
                ...Array.from({ length: elders }, () => ({ kind: "elder" })),
                { kind: "mother" },
            ];
            for (let i = board.length - 1; i > 0; i -= 1) {
                const j = Math.floor(rng() * (i + 1));
                [board[i], board[j]] = [board[j], board[i]];
            }
            cursor = 0;
            boardStage = stage;
        }

        // A pup nest's value, rolled the same way whether you opened it or only get to see it afterwards.
        const rollPups = () => {
            const [lo, hi] = cfg.pups;
            const n = lo + Math.floor(rng() * (hi - lo + 1));
            return Array.from({ length: n }, () => cfg.value * (0.7 + rng() * 0.9));
        };

        const opened = [];
        while (cursor < board.length) {
            const nest = board[cursor];
            cursor += 1;
            if (nest.kind === "pups") {
                const pups = rollPups();
                total += pups.reduce((a, v) => a + v, 0) * lineBet;
                opened.push({ kind: "pups", pups });
                continue;
            }
            opened.push({ kind: nest.kind });
            break;   // the Elder takes you on, the Mother sends you home. Either way this visit is done.
        }

        const last = opened[opened.length - 1];
        const visit = { stage, key: cfg.key, name: cfg.name, opened };

        // ── WHAT YOU LEFT BEHIND ─────────────────────────────────────────────────────────────────────
        // Luke: "when you lose by picking the other thing it should show what the value of the non-picked
        // eggs were — where other bears and wolves were."
        //
        // A round that ends by turning over the wrong thing and then just stops is the one moment the
        // machine owes you an answer. Every unopened nest, rolled and sent — the Elder you were one egg
        // away from especially. It is added to nothing: this is what the wall HELD, not what you won.
        if (last?.kind === "mother") {
            visit.rest = board.slice(cursor).map((n) => (
                n.kind === "pups" ? { kind: "pups", pups: rollPups() } : { kind: n.kind }
            ));
        }

        // AN ELDER IN THE LAST ROOM IS A GEODE. One crack, its own value, and then straight back onto the
        // same wall — the visit carries the geode rather than there being a separate room in the data,
        // because from the round's point of view it IS part of this visit.
        if (last.kind === "elder" && stage === LAST) {
            const value = HOARD_VALUE * (0.55 + rng() * 1.1);
            total += value * lineBet;
            geodes += 1;
            visit.geode = value;
        }

        stages.push(visit);
        if (last.kind === "mother") { ended = true; break; }
        if (stage < LAST) stage += 1;
    }

    // How deep it got, counted in ROOMS rather than visits — six trips through the Deep Warren is still the
    // Deep Warren, and the depth pips would otherwise run off the end of the bar.
    const reached = Math.min(WARREN_STAGES.length, (stages[stages.length - 1]?.stage ?? 0) + 1);
    return { total, stages, geodes, reached, full: geodes > 0 };
}

// ══ COLOSSAL REELS ═══════════════════════════════════════════════════════════════════════════════════════════
// Luke, with a Lil' Red cabinet on screen: "let's have the Menagerie do this. There's a regular reel on the left
// and a huge reel on the right, and wilds come in big blocks. One of the cool features is if you get a stacking
// wild in a column on the small screen it transfers over to the big screen. And there's a bonus you get by
// getting three scatters between both screens — you get free spins depending on how many scatters. The bonus
// icon shows up on reels 1, 3 and 5 in both screens. And the cool thing about the bonus is when you get even
// ONE wild in a column on the small screen it grows to fit the whole screen on the big one. Also the final
// column is different during the bonus — normal pay symbols, but stacking multipliers, 2x 3x 5x 10x 25x."
//
// TWO REEL SETS, ONE SPIN. The main set is the ordinary 5x3 this file has always dealt in; the colossal set is
// 5x12 beside it. They are spun independently off their own strips, they pay on their own line sets, and the
// only thing that crosses between them is the WILD TRANSFER — which is the whole idea, because it is the one
// mechanic that makes you watch the small screen when the big one has all the money on it.
//
// A HUNDRED LINES, and they are not authored by hand. The main set keeps the house's twenty patterns. The
// colossal set is twelve rows, which is four bands of three — so the same twenty patterns are translated down
// into each band, giving eighty. Twenty plus eighty is the hundred the reference cabinet prints on its glass,
// and every one of them is a shape somebody already looked at rather than eighty new ones nobody has.
export const COLOSSAL_ROWS = 12;
export const COLOSSAL_LINES = [0, 3, 6, 9].flatMap((off) => LINES.map((l) => l.map((r) => r + off)));
// The stake is split across every line the cabinet plays, and this one plays a hundred — twenty on the main
// set and eighty on the tall one. Splitting it twenty ways, the way every other cabinet does, was paying a
// hundred lines out of a twenty-line stake and returned 31,000%.
export const COLOSSAL_TOTAL_LINES = LINES.length + COLOSSAL_LINES.length;

// ── THE MULTIPLIER REEL ──────────────────────────────────────────────────────────────────────────────────────
// Only during free spins, only the last colossal reel. Stacked like everything else on this machine, and
// deliberately weighted so the small ones are ordinary and 25x is a story. The mini and the major jackpots the
// reference also puts here are NOT built — Luke: "for now we won't do the mini or the major."
const MULTS = { m2: 2, m3: 3, m5: 5, m10: 10, m25: 25 };
export const isMult = (s) => Object.prototype.hasOwnProperty.call(MULTS, s);
export const multValue = (s) => MULTS[s] || 0;


/** The tall set. `free` swaps reel five for the multiplier reel. */
function spinColossal(m, rng, free = false) {
    const giants = m.colossal.giants || [];
    return m.colossal.strips.map((bag, reel) => {
        const isLast = reel === REELS - 1;
        const useBag = free && isLast ? m.colossal.multStrip : bag;
        const stacks = free && isLast ? m.colossal.multStacks : m.colossal.stacks;
        const col = stackedColumn(useBag, COLOSSAL_ROWS, rng, stacks, giants);
        // ── A GIANT IS THE WHOLE REEL ────────────────────────────────────────────────────────────────
        // Luke: "the sprite in the big reels needs to be the whole reel — even if it cuts the sprite off,
        // it needs to be the whole reel." Which is what the reference does: Lil' Red is not a block inside
        // a column, she IS the column, twelve rows of it, one drawing.
        //
        // So a column that drew a giant anywhere becomes entirely that giant. It is a far bigger deal than
        // it sounds — a full reel of a top payer hits every one of the eighty lines that passes through it,
        // which is all of them — so the density had to come down by an order of magnitude to pay for it.
        // That is the right trade anyway: a colossal symbol should be a thing that happens to you, not
        // wallpaper.
        const g = col.find((x) => giants.includes(x));
        return g ? Array.from({ length: COLOSSAL_ROWS }, () => g) : col;
    });
}

// ── THE TRANSFER ─────────────────────────────────────────────────────────────────────────────────────────────
// The one thing that crosses between the two sets, and the reason to look at the small one. In the base game a
// main column has to be FULLY wild to send; in free spins a single wild anywhere in the column does it, which
// is what turns the bonus from "the same game with more spins" into a different game.
function transferWilds(m, main, col, free) {
    const sent = [];
    for (let reel = 0; reel < REELS; reel += 1) {
        const n = main[reel].filter((s) => s === m.wild).length;
        const send = free ? n >= 1 : n >= main[reel].length;
        if (!send) continue;
        sent.push(reel);
        for (let row = 0; row < COLOSSAL_ROWS; row += 1) col[reel][row] = m.wild;
    }
    return sent;
}

/**
 * One press of a colossal cabinet: both sets, the transfer between them, and what the pair paid.
 * The scatter is counted across BOTH sets and paid once, which is Luke's "three scatters between both screens".
 */
export function runColossal(m, { lineBet = 1, rng = Math.random, free = false, mult = 1 } = {}) {
    const main = spinGrid(m, rng);
    const col = spinColossal(m, rng, free);
    const sent = transferWilds(m, main, col, free);

    // ── THE MULTIPLIER REEL, READ ────────────────────────────────────────────────────────────────────────
    // The BIGGEST multiplier showing on the last colossal reel multiplies what the tall set paid.
    //
    // I tried summing them first, which is the obvious reading of "stacking multipliers" and is wrong by a
    // mile: the reel is twelve rows deep, so a sum averaged x20 and the cabinet returned 31,000%. A stack
    // still matters under "biggest" — it is what puts a 25x on the screen at all, and it is what makes the
    // reel worth watching as it comes to rest — but twelve cells cannot each multiply your money.
    let reelMult = 0;
    if (free) for (const s of col[REELS - 1]) reelMult = Math.max(reelMult, multValue(s));
    const applied = Math.max(1, reelMult);

    // Paid separately so the screen can light each set on its own, and so the scatter cannot be paid twice.
    const mainWins = evaluate(m, main, { lineBet, mult, lines: LINES, rows: ROWS, noScatter: true });
    const colWins = evaluate(m, col, { lineBet, mult: mult * applied, lines: COLOSSAL_LINES, rows: COLOSSAL_ROWS, noScatter: true });

    // THE SCATTER PAYS ONCE, ON THE PAIR. It only lives on reels one, three and five of either set — see the
    // strips — so "three between both screens" is a real hunt across two boards rather than three on one.
    const scatters = [...main.flat(), ...col.flat()].filter((s) => s === m.scatter).length;
    const sPay = m.scatterPays[Math.min(scatters, 5)];
    const scatterWin = sPay ? sPay * lineBet * COLOSSAL_TOTAL_LINES * mult : 0;

    // ── WHERE THE BIG PICTURES GO ────────────────────────────────────────────────────────────────────────
    // Runs of a giant symbol, derived from the finished column rather than tracked while it is built — two
    // stacks of The Dire Wolf that land touching SHOULD read as one taller wolf, and deriving it is the only
    // version that gets that right. The maths never sees this; it is purely how the column is drawn.
    const giants = [];
    if (m.colossal.giants?.length) {
        for (let reel = 0; reel < REELS; reel += 1) {
            let row = 0;
            while (row < COLOSSAL_ROWS) {
                const sym = col[reel][row];
                if (!m.colossal.giants.includes(sym)) { row += 1; continue; }
                let len = 1;
                while (row + len < COLOSSAL_ROWS && col[reel][row + len] === sym) len += 1;
                giants.push({ reel, row, len, sym });
                row += len;
            }
        }
    }

    return {
        main, col, sent, giants, reelMult: free ? reelMult : 0, applied: free ? applied : 1,
        mainWins: mainWins.wins, colWins: colWins.wins, scatters,
        total: mainWins.total + colWins.total + scatterWin,
        mainTotal: mainWins.total, colTotal: colWins.total, scatterWin,
    };
}

// ── ONE PRESS OF A COLOSSAL CABINET ──────────────────────────────────────────────────────────────────────────
// The base spin, and then the free round it may have bought. Kept beside runColossal rather than inside
// playSpin because the two machines share almost nothing: this one has no chain, no hold, no pick, and its
// bonus is counted off a pair of grids.
export function playColossal(m, { bet = 100, rng = Math.random, lineBet = 1 } = {}) {
    const first = runColossal(m, { lineBet, rng, free: false });
    let total = first.total;
    let free = null;

    // ── HOW MANY SCATTERS BOUGHT HOW MANY SPINS ──────────────────────────────────────────────────────
    // Three across the pair opens it; a fourth is worth nearly twice as much again. Clamped to the table's
    // top entry so six moons on a very good board cannot ask for a key that does not exist.
    if (first.scatters >= 3) {
        const table = m.free.bySctr || {};
        const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
        const key = keys.filter((k) => k <= first.scatters).pop() ?? keys[0];
        const count = table[key] || m.free.spins;
        const spins = [];
        let ftotal = 0;
        for (let i = 0; i < count; i += 1) {
            // EVERY BONUS SPIN IS A FULL COLOSSAL SPIN, with the two things that change in the bonus: one
            // wild in a main column sends the whole colossal column, and the last colossal reel is the
            // multiplier reel. Both live in runColossal behind its `free` flag.
            const sp = runColossal(m, { lineBet, rng, free: true });
            ftotal += sp.total;
            spins.push(sp);
        }
        total += ftotal;
        free = { kind: "colossal", label: m.free.label, spins, total: ftotal, base: count,
            scatters: first.scatters, mult: 1 };
    }

    return { grid: first.main, colossal: first, base: { wins: first.mainWins, total: first.mainTotal },
        chain: null, free, locked: null, hold: null, built: null, warren: null, gems: null,
        winAgain: null, meter: [], total, bet };
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
// `meter` is the Win It Again row as it stood BEFORE this spin, in multiples of the bet. It is a parameter
// rather than something the caller settles afterwards for one reason: check-slot5.mjs has to be able to see
// what the feature actually pays. The first cut settled it in spinSlot5, and the gate — which simulates
// through playSpin — reported the Vault putting 0.00% of its money in features while quietly under-counting
// its whole return. A gate that cannot see a feature is a gate that lies about the machine.
export function playSpin(m, { bet = 100, rng = Math.random, offerId = "mid", meter = [] } = {}) {
    // ── A COLOSSAL CABINET IS A DIFFERENT PRESS ──────────────────────────────────────────────────────
    // Two reel sets, a hundred lines between them, a wild that crosses from the small one to the big one and
    // a free round whose length is bought by the number of scatters. None of the machinery below it applies:
    // it does not cascade, it has no hold and no pick, and its scatter is counted across a pair of grids. So
    // it gets its own path rather than five more branches threaded through this one.
    if (m.colossal) return playColossal(m, { bet, rng, lineBet: bet / COLOSSAL_TOTAL_LINES });

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
    let free = null; let locked = null; let hold = null; let built = null; let warren = null; let gems = null;

    // ── EARNED BY WATCHING ───────────────────────────────────────────────────────────────────────────
    // Enough consecutive breaks opens the free round whether or not a scatter ever landed. It is the only
    // way into a bonus on this floor that has nothing to do with what the reels stopped on.
    const byCascade = Boolean(chain && m.cascade && chain.cascades >= m.cascade.trigger);

    // ── THE VAULT'S SCATTER OPENS A COLLECTION, NOT A ROUND ──────────────────────────────────────────
    // Three moons on this cabinet are the gem pick — see runGems. It is checked before the free-round
    // branch rather than inside it because this machine HAS no free round: the scatter is its whole bonus,
    // which is what the reference does and what makes the meter the thing you play for in between.
    if (first.freeSpins && m.second?.kind === "gems") {
        gems = runGems(m, { lineBet, rng });
        total += gems.total;
    } else if (first.freeSpins || byCascade) {
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
    // ── THE METER FILLS, AND THREE TUMBLES EMPTY IT ──────────────────────────────────────────────────
    // This spin's own win goes on FIRST and then the whole row is paid, which is what the reference does and
    // what the screenshot shows — 50 + 75 + 200 = 325, the last of those being the spin that triggered it.
    // Paying the row but leaving out the spin that opened it would be the machine keeping the best one.
    // ── THE ROW SHIFTS RIGHT ─────────────────────────────────────────────────────────────────────────
    // Luke: "it's supposed to move all the numbers to the right after each manual spin, meaning all cascades
    // all add up into one win amount."
    //
    // Both halves matter and I had one of them backwards. ONE ENTRY PER MANUAL SPIN was already right —
    // `total` here is everything the press paid, the whole tumble chain summed, not a slot per cascade. The
    // ORDER was wrong: I appended, so the newest sat at the far right and the row aged leftward. It enters at
    // slot 1 and pushes the rest along, the way the reference labels it (RECENT WIN 2, 3, 4, 5 — counting
    // AWAY from the newest), and the oldest falls off the end.
    let nextMeter = m.winAgain ? meter.slice(0, m.winAgain.slots) : [];
    let winAgain = null;
    if (m.winAgain) {
        // ── EVERY MANUAL SPIN ADVANCES THE ROW, INCLUDING A LOSING ONE ───────────────────────────────
        // Luke: "if you don't win anything on a spin it adds a blank to the top area, that way it can push
        // everything off... it's all working except for ignoring when you don't win."
        //
        // I had it only pushing on a win, which quietly made the meter a bank you could never lose from —
        // sit there long enough and your five best spins stay in the row for ever. The blank is the whole
        // tension: a dead spin ages your good ones one place closer to falling off the end, so the question
        // is not "will it fire" but "will it fire before I lose the 20,000 in slot 4".
        //
        // AND THE BONUS IS NOT PART OF THE ENTRY. `total` at this point already includes the gem collection,
        // and the row is drawn the instant the response lands — BEFORE the player has touched a single cover.
        // Luke: "when I got the gem bonus it already won in the top left as a win-it-again before I even
        // played the pick'em game — we definitely don't want to show people that, because then they'll
        // understand that it's rigged." He is exactly right, and it is the worst kind of leak: the screen
        // telling you the outcome of a game it is about to pretend to ask you to play. The row records the
        // REELS — what the spin visibly paid — and the bonus pays itself on its own screen.
        const reelWin = total - (gems?.total || 0);
        nextMeter = [Math.max(0, reelWin) / bet, ...nextMeter].slice(0, m.winAgain.slots);
        if (chain && chain.cascades >= m.winAgain.need) {
            const paid = nextMeter.reduce((a, n) => a + n, 0);
            total += paid * bet;
            winAgain = { paid, cascades: chain.cascades, need: m.winAgain.need,
                slots: m.winAgain.slots, label: m.winAgain.label, row: nextMeter };
            nextMeter = [];
        }
    }
    return { grid, base, chain, free, locked, hold, built, warren, gems, winAgain, meter: nextMeter, total, bet };
}
