// ── THE WOLF DEN CARD GAME — THE RULES, AND NOTHING ELSE ─────────────────────────────────────────────────────
// A deckbuilding fight in the shape Slay the Spire proved: three energy a turn, draw five, block that
// evaporates when your turn comes round again, and an enemy that TELLS YOU what it is about to do before you
// commit. That last part is the whole game. A fight where the enemy's next move is hidden is a slot machine
// with extra steps; a fight where you can see the sixteen coming is a decision about whether you can afford to
// swing this turn.
//
// PURE, like arena-engine, blackjack-kit and slot-bonus, and for the same three reasons. It takes a state and
// returns a new one, it owns no clock, and it never rolls a number it was not handed a seed for — so a seed
// plus a list of taps IS the fight, and two people on two devices can play the identical one and disagree
// about the same turn. That is how this gets designed: not by describing a fight, by replaying it.
//
// PROTOTYPE, OWNER-GATED, PAYS NOTHING. The engine runs in the browser today because nothing it does is worth
// cheating for — no gold, no XP, no item, no row. The day a run pays a single coin it moves behind an API
// route UNCHANGED, which is the entire reason it is written this way and knows nothing about React.
//
// A CARD IS A VERB. Every card is one of our pets doing one thing, and then it is in the discard. Pets do not
// sit on a board and trade blows — that is a different and much larger game, and it is not this one.

// ── THE DIALS ────────────────────────────────────────────────────────────────────────────────────────────
// Straight off Spire, deliberately. These numbers have had a decade of play behind them and we have had none,
// so the slice copies them exactly and earns the right to disagree later.
export const HERO_HP = 70;
export const ENERGY_PER_TURN = 3;
export const DRAW_PER_TURN = 5;
// A hand this size cannot be drawn past. Anything over the cap is discarded as it is drawn rather than held,
// which will matter the moment a card draws cards.
export const HAND_MAX = 10;
// 60, not the 45 this started at — see the note above FOE_SCRIPT. At 45 the foe died on turn three and the
// third beat of its script never happened, which is a fight that never asks you the question it was built to
// ask.
export const FOE_HP = 60;
// Under this many pixels of travel, a pointer press is a TAP and not a drag — the same slop the farm's
// decoration dragging settled on, and for the same reason: a thumb never presses perfectly still.
export const DRAG_SLOP = 7;

// ── THE RANDOMNESS, HANDED IN ────────────────────────────────────────────────────────────────────────────
// mulberry32, carried as an INTEGER on the state rather than as a closure, because a closure cannot be put in
// React state, serialised into a URL, or replayed. Every draw threads the state through and hands the next one
// back; nothing here ever calls Math.random.
export function nextRand(rngState) {
    let a = (rngState + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** Fisher-Yates, threaded. Returns [shuffled, nextRngState]. */
export function shuffle(list, rngState) {
    const out = [...list];
    let s = rngState;
    for (let i = out.length - 1; i > 0; i -= 1) {
        const [r, ns] = nextRand(s);
        s = ns;
        const j = Math.floor(r * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return [out, s];
}

// ── THE CARDS ────────────────────────────────────────────────────────────────────────────────────────────
// Three cards, ten copies, and that is the whole starting deck — the same shape as a Spire starter: a cheap
// attack, a cheap defend, and one card with an idea in it. `pet` is a real id out of COLLECTIBLES, so the face
// of the card is the sprite that pet already has and the art bill for this feature is zero.
//
// PET LEVEL GOES HERE LATER. Spire upgrades cards (Strike -> Strike+); a levelled pet is exactly that, so
// every card carries an `upgrade` block that nothing reads yet. It is the hole, dug now, so the day pet levels
// arrive they are a lookup rather than a rewrite of every card.
// ── THE NUMBER ON THE CARD IS THE NUMBER THAT HAPPENS ────────────────────────────────────────────────────
// Every card's text is a TEMPLATE over its own fields — "Deal {damage} damage." rather than "Deal 6 damage."
// Two reasons, and the second one is the bug.
//
// THE FEATURE: Spire recomputes the printed damage against whoever you are pointing at, so a Strike reading
// "Deal 6 damage" reads "Deal 9 damage" while it hovers a Vulnerable enemy. It is a preview of the BLOW, not
// of the aftermath — they never show you the target's resulting HP — and it is the thing that makes Vulnerable
// legible instead of arithmetic you are expected to do in your head. We already computed it correctly in
// attackDamage and then printed a hardcoded sentence next to it.
//
// THE BUG: the sentence and the number were two independent sources of truth. `upgrade: { damage: 9 }` exists
// on bite today and would have upgraded the card to nine damage while the card went on saying six, forever,
// silently. A template cannot drift from the field it interpolates.
export const CARDS = {
    bite: {
        id: "bite", pet: "wolf_pup", name: "Bite", cost: 1, kind: "attack", target: "foe",
        damage: 6, text: "Deal {damage} damage.", upgrade: { damage: 9 },
    },
    hop: {
        id: "hop", pet: "frog", name: "Hop", cost: 1, kind: "skill", target: "self",
        // "Block", capitalised, because that is the KEYWORD — the card face lights the vocabulary this file
        // owns, and a lowercase "block" is just a word that silently fails to match and never lights.
        block: 5, text: "Gain {block} Block.", upgrade: { block: 8 },
    },
    pounce: {
        id: "pounce", pet: "fox_kit", name: "Pounce", cost: 2, kind: "attack", target: "foe",
        damage: 8, vulnerable: 2, text: "Deal {damage} damage. Apply {vulnerable} Vulnerable.",
        upgrade: { damage: 10, vulnerable: 3 },
    },
    // ── THE CARD THAT POINTS AT YOU ──────────────────────────────────────────────────────────────────────
    // Everything above either hits a foe or quietly helps you; nothing yet TARGETS you, and targeting is the
    // whole interaction this slice exists to prove. A heal is the clearest case of it — the only card so far
    // where dragging onto the wrong body is a real mistake rather than a no-op — so it is here to make the
    // self-target path exist before there are twenty cards that need it.
    //
    // Deliberately weak per energy: five back where a Bite deals six. Healing that competes with attacking on
    // rate turns every fight into a stalemate, and Spire keeps it off the card pool almost entirely for that
    // reason. It is here to be a decision on the turn you are about to be hit for sixteen.
    purr: {
        id: "purr", pet: "kitten", name: "Purr", cost: 1, kind: "skill", target: "self",
        heal: 5, text: "Heal {heal}.", upgrade: { heal: 8 },
    },
};

// ── THE POOL YOUR COLLECTION UNLOCKS ─────────────────────────────────────────────────────────────────────
// Luke's call: "pets you own unlock cards." The four above are the starter deck and belong to everybody; every
// card below is a PET, and it can only be offered to somebody who actually owns that pet. That is the whole
// reason the cards were pets in the first place — 118 of them are already drawn and already collected, and
// this turns the collection into a card pool instead of a wall of portraits.
//
// ⚠️ A THIN COLLECTION MUST STILL PLAY. A brand-new member owns four or five pets, so an offer drawn purely
// from what you own would hand them the same card three times. BASIC_UNLOCKS below is the floor: those are
// offered to anyone, owned or not, so the worst pool in the game is still a real pool. See cardOffers().
//
// `tier` is what a stop is allowed to offer, not a power level for its own sake: early stops offer 1, the
// back half opens 2, and 3 only appears after the elite. `pet` must be a real id in collectibles.js.
export const POOL = {
    // ── TIER 1 ── the shape of the deck, not the ceiling of it.
    swipe: { id: "swipe", pet: "bear_cub", name: "Swipe", cost: 1, kind: "attack", target: "foe", tier: 1,
        damage: 9, text: "Deal {damage} damage." },
    quill: { id: "quill", pet: "hedgehog", name: "Quills", cost: 1, kind: "skill", target: "self", tier: 1,
        block: 5, strength: 1, text: "Gain {block} Block and 1 Strength." },
    peck: { id: "peck", pet: "raven", name: "Peck", cost: 0, kind: "attack", target: "foe", tier: 1,
        damage: 3, text: "Deal {damage} damage." },
    scuttle: { id: "scuttle", pet: "crab", name: "Scuttle", cost: 1, kind: "skill", target: "self", tier: 1,
        block: 8, text: "Gain {block} Block." },
    swarm: { id: "swarm", pet: "honeybee", name: "Swarm", cost: 1, kind: "attack", target: "foe", tier: 1,
        damage: 3, hits: 3, text: "Deal {damage} damage three times." },
    hoot: { id: "hoot", pet: "owl", name: "Hoot", cost: 1, kind: "skill", target: "self", tier: 1,
        draw: 2, text: "Draw 2 cards." },
    sting: { id: "sting", pet: "scorpion", name: "Sting", cost: 1, kind: "attack", target: "foe", tier: 1,
        damage: 5, weak: 1, text: "Deal {damage} damage. Apply {weak} Weak." },
    shell: { id: "shell", pet: "turtle", name: "Shell Up", cost: 2, kind: "skill", target: "self", tier: 1,
        block: 14, text: "Gain {block} Block." },

    // ── TIER 2 ── the cards a deck is actually built around.
    stampede: { id: "stampede", pet: "kangaroo", name: "Stampede", cost: 2, kind: "attack", target: "foe", tier: 2,
        damage: 7, all: true, text: "Deal {damage} damage to ALL enemies." },
    screech: { id: "screech", pet: "bat", name: "Screech", cost: 1, kind: "skill", target: "foe", tier: 2,
        weak: 2, all: true, text: "Apply {weak} Weak to ALL enemies." },
    coils: { id: "coils", pet: "serpent", name: "Coils", cost: 1, kind: "attack", target: "foe", tier: 2,
        damage: 6, vulnerable: 2, text: "Deal {damage} damage. Apply {vulnerable} Vulnerable." },
    rally: { id: "rally", pet: "wolf_pup", name: "Rally", cost: 1, kind: "power", target: "self", tier: 2,
        strength: 2, text: "Gain {strength} Strength." },
    tide: { id: "tide", pet: "dolphin", name: "Tide", cost: 0, kind: "skill", target: "self", tier: 2,
        block: 4, draw: 1, text: "Gain {block} Block. Draw 1 card." },
    gorge: { id: "gorge", pet: "gorilla", name: "Gorge", cost: 2, kind: "attack", target: "foe", tier: 2,
        damage: 18, text: "Deal {damage} damage." },
    fetch: { id: "fetch", pet: "raccoon", name: "Fetch", cost: 0, kind: "skill", target: "self", tier: 2,
        energy: 1, draw: 1, text: "Gain 1 energy. Draw 1 card." },
    mend: { id: "mend", pet: "panda", name: "Mend", cost: 1, kind: "skill", target: "self", tier: 2,
        heal: 8, block: 4, text: "Heal {heal}. Gain {block} Block." },

    // ── TIER 3 ── only after the elite, and they should feel like it.
    maul: { id: "maul", pet: "lion_cub", name: "Maul", cost: 2, kind: "attack", target: "foe", tier: 3,
        damage: 8, hits: 3, text: "Deal {damage} damage three times." },
    firebreath: { id: "firebreath", pet: "dragon_whelp", name: "Firebreath", cost: 2, kind: "attack", target: "foe", tier: 3,
        damage: 11, all: true, vulnerable: 1, text: "Deal {damage} damage to ALL enemies. Apply {vulnerable} Vulnerable." },
    inkcloud: { id: "inkcloud", pet: "squid", name: "Ink Cloud", cost: 1, kind: "skill", target: "self", tier: 3,
        block: 10, draw: 2, text: "Gain {block} Block. Draw 2 cards." },
    crush: { id: "crush", pet: "kraken", name: "Crush", cost: 3, kind: "attack", target: "foe", tier: 3,
        damage: 32, text: "Deal {damage} damage." },
    ascend: { id: "ascend", pet: "griffin", name: "Ascend", cost: 1, kind: "power", target: "self", tier: 3,
        strength: 3, text: "Gain {strength} Strength." },
    phoenixfire: { id: "phoenixfire", pet: "radiant_phoenix", name: "Phoenix Fire", cost: 2, kind: "skill", target: "self", tier: 3,
        heal: 14, strength: 2, text: "Heal {heal}. Gain {strength} Strength." },
};

// The floor. Offered to everybody regardless of what they own, so a member with five pets still gets a real
// choice of three every time — see the note above POOL.
export const BASIC_UNLOCKS = ["swipe", "scuttle", "peck", "hoot", "coils", "rally"];

/** Every card the game knows about: the starter four plus the whole pet pool. */
export const ALL_CARDS = { ...CARDS, ...POOL };

// ── HOW HARD A ROOM IS ───────────────────────────────────────────────────────────────────────────────────
// This was an eight-entry ladder, one row per stop, back when a run was a straight line. The map is fifteen
// rows and the route through it is the player's, so difficulty is a CURVE over the row you are standing on
// rather than a table of hand-written stops — a table would have to be rewritten every time the map changed
// shape, and would say nothing about a room the route skipped.
//
// The kind does the rest: an elite is fewer bodies carrying far more, a boss is one thing carrying a lot.
// ── EMBERS ───────────────────────────────────────────────────────────────────────────────────────────────
// The run's own money, and deliberately NOT gold. The Den already mints gold, doubloons, chips and laurels,
// and a fifth thing that looked like any of them would have members believing a card game paid them real
// currency. Embers exist only inside a run and die with it.
//
// Earned by REFUSING a card — Luke's call — which makes the skip a real fork: a leaner deck AND the means to
// fix it later, against a card you wanted. Flat per skip, because pricing each card would put arithmetic in
// front of a decision that should be about the deck.
export const SKIP_EMBERS = 25;

// ── PERKS ────────────────────────────────────────────────────────────────────────────────────────────────
// Spire's relics: things you keep for the whole run that quietly change every fight after them, shown in a
// row under the top bar. Luke: "we would need to introduce perks as well and show them there."
//
// EVERY ONE OF THESE DOES SOMETHING, and that is the rule to hold. A perk row that is decoration is worse
// than no perk row — it is the merchant node all over again, a promise the game cannot keep. So the list is
// short and each entry maps onto something startFight already understands: your health, your opening block,
// your Strength, or the size of your first hand.
export const PERKS = {
    ember_heart: { id: "ember_heart", name: "Ember Heart", icon: "heart", maxHp: 8,
        text: "+8 max health, and healed for it now." },
    whetstone: { id: "whetstone", name: "Whetstone", icon: "sword", strength: 1,
        text: "Start every fight with 1 Strength." },
    tin_shield: { id: "tin_shield", name: "Tin Shield", icon: "shield", block: 6,
        text: "Start every fight with 6 Block." },
    lucky_paw: { id: "lucky_paw", name: "Lucky Paw", icon: "paw", draw: 1,
        text: "Draw one extra card on your first turn." },
    old_lantern: { id: "old_lantern", name: "Old Lantern", icon: "lantern", energy: 1,
        text: "One extra energy on your first turn." },
    iron_ration: { id: "iron_ration", name: "Iron Ration", icon: "ration", healAfter: 5,
        text: "Heal 5 after every fight you win." },
};
export const PERK_IDS = Object.keys(PERKS);

// ── POTIONS ──────────────────────────────────────────────────────────────────────────────────────────────
// Three slots, carried between fights, drunk on the turn you need them. Theirs sit in the top bar beside the
// health, which is where Luke wants ours, and the reason they belong up there rather than in the hand is that
// a potion is not a card — it costs no energy and it is not shuffled.
export const POTION_SLOTS = 3;
export const POTIONS = {
    swift: { id: "swift", name: "Swift Draught", icon: "draw", draw: 2, text: "Draw 2 cards." },
    blood: { id: "blood", name: "Blood Tonic", icon: "heal", heal: 12, text: "Heal 12." },
    bark: { id: "bark", name: "Barkskin", icon: "shield", block: 12, text: "Gain 12 Block." },
    fury: { id: "fury", name: "Bottled Fury", icon: "sword", strength: 2, text: "Gain 2 Strength." },
    spark: { id: "spark", name: "Spark", icon: "energy", energy: 2, text: "Gain 2 energy." },
};
export const POTION_IDS = Object.keys(POTIONS);

export const RUN_LENGTH = 15;

// ── THE MERCHANT ─────────────────────────────────────────────────────────────────────────────────────────
// The one node that was a promise the game could not keep: you walked onto it and it handed you straight back
// to the map. Embers have been paid out since the run system shipped — 25 for taking no card, 40 from a chest,
// 60 from an elite with no perk left — and there has never been anywhere to spend one, which quietly made
// "take nothing" a choice between a real card and a number that did nothing.
//
// Theirs sells seven cards, three potions and three relics, and the rightmost relic is shop-exclusive. Ours is
// smaller because the run is one act rather than three and the ember income is a fraction of their gold, but
// the shape is the same: a few cards, a couple of potions, one thing you cannot get anywhere else, one item
// discounted, and — the part that actually matters — A CARD REMOVAL.
//
// ⚠️ REMOVAL IS THE WHOLE REASON A SHOP EXISTS. Every other reward in this game makes the deck BIGGER, and a
// deck that only grows draws its good cards less often the longer a run goes. Spire prices that at 75 gold
// rising 25 a time, once per shop, and it is the single most bought thing in the game. Without it a shop is a
// vending machine; with it, it is the only place the deck can get better instead of longer.
export const SHOP = {
    cards: 3,
    potions: 2,
    perks: 1,
    // Priced against what a run actually earns rather than against their gold: a full run sees roughly
    // 100-200 embers, so one card is most of a chest and the perk is a run's worth of skipped rewards.
    price: {
        card: [[38, 50], [60, 76], [92, 115]],   // by the card's own tier
        potion: [28, 36],
        perk: [85, 108],
    },
    // "Can only be used once per Shop. Its price starts at 75 Gold and increases by 25 each time it is bought
    // at a shop." Same rule, ember-sized: the escalation is what stops a rich run deleting its whole deck.
    removeBase: 55,
    removeStep: 25,
    // Theirs discounts one card by half. One slot, so the shop has a thing worth looking at rather than a
    // uniform price list.
    saleOff: 0.4,
};

/** What removing a card costs on this visit — see SHOP.removeBase. */
export const removalCost = (removals = 0) => SHOP.removeBase + SHOP.removeStep * Math.max(0, removals);

const priceIn = ([lo, hi], r) => lo + Math.floor(r * (hi - lo + 1));

/**
 * The stock on the shelf for this visit.
 *
 * Rolled from the room's seed and STORED on the run, so a reload is not a reroll — the same rule the reward
 * offers already follow. `cardIds` is handed in because deciding which cards a member is even eligible for
 * needs the database, and this file has never touched it.
 */
export function buildShop(seed, { cardIds = [], potionIds = POTION_IDS, perkIds = PERK_IDS } = {}) {
    let roll = seed >>> 0;
    const next = () => { const [r, n] = nextRand(roll); roll = n; return r; };
    const stock = [];

    for (const id of cardIds.slice(0, SHOP.cards)) {
        const tier = Math.max(1, Math.min(3, POOL[id]?.tier || ALL_CARDS[id]?.tier || 1));
        stock.push({ kind: "card", ref: id, price: priceIn(SHOP.price.card[tier - 1], next()) });
    }
    const pots = [...potionIds];
    for (let i = 0; i < SHOP.potions && pots.length; i += 1) {
        const id = pots.splice(Math.floor(next() * pots.length), 1)[0];
        stock.push({ kind: "potion", ref: id, price: priceIn(SHOP.price.potion, next()) });
    }
    // The perk slot is theirs-shop-exclusive in spirit: an elite is the only other source, and an elite costs
    // health you may not have. Paying for one is the alternative to bleeding for one.
    const pk = [...perkIds];
    for (let i = 0; i < SHOP.perks && pk.length; i += 1) {
        const id = pk.splice(Math.floor(next() * pk.length), 1)[0];
        stock.push({ kind: "perk", ref: id, price: priceIn(SHOP.price.perk, next()) });
    }

    // One thing on the shelf is cheap. Chosen last so every price above is rolled before anything is marked.
    if (stock.length) {
        const at = Math.floor(next() * stock.length);
        stock[at] = { ...stock[at], sale: true, price: Math.max(1, Math.round(stock[at].price * (1 - SHOP.saleOff))) };
    }
    return stock.map((s, i) => ({ ...s, slot: i }));
}
              // map rows; the boss stands above them

export function roomFight(row, kind = "fight") {
    const t = Math.max(0, Math.min(1, (row - 1) / (RUN_LENGTH - 1)));   // 0 at the bottom, 1 at the top
    if (kind === "boss") return { foes: 1, hp: 3.2 + t, offer: 3 };
    if (kind === "elite") return { foes: 2, hp: 1.35 + t * 0.6, offer: t > 0.55 ? 3 : 2 };
    return {
        foes: row < 3 ? 2 : 3,
        hp: 0.7 + t * 0.75,
        offer: t < 0.3 ? 1 : t < 0.7 ? 2 : 3,
    };
}

// Kept as the shape the fixture builder already reads, so a room and a row arrive the same way a stop did.
export const stopAt = (n, kind = "fight") => ({ n, kind, ...roomFight(n, kind) });

export const STARTER_DECK = [
    "bite", "bite", "bite", "bite", "bite",
    "hop", "hop", "hop",
    "purr",
    "pounce",
];

// ── A MOVESET, NOT A LOOP ────────────────────────────────────────────────────────────────────────────────
// These were arrays cycled on `beat % length`, which means an enemy is solved the first time you meet it: see
// a Warden once and you know its next four beats for ever, in every fight, for the rest of the run.
//
// That is not how the reference does it, and the difference is the whole reason its enemies stay interesting.
// A Jaw Worm ALWAYS opens Chomp, and after that it is 59% Bellow / 41% Thrash — readable, never memorised. A
// Louse is 75% Bite / 25% its special and "cannot use the same move three times in a row". So: a fixed
// opener, weighted transitions off the last move, and a cap on repeats.
//
// ⚠️ THE NEXT MOVE IS CHOSEN WHEN THE PREVIOUS ONE RESOLVES, not when the turn comes around, because the
// intent has to be on screen for the whole of YOUR turn. That is the contract the pill depends on: what it
// shows is what will happen, decided already. `foe.next` holds it and `foe.recent` remembers what has just
// been thrown so `limit` can be enforced.
//
// `after` is keyed by the move just played; weights are relative and need not sum to anything. `limit` is the
// most times a move may appear CONSECUTIVELY.
export const FOE_SCRIPTS = {
    // ── THE SHALLOWS ─────────────────────────────────────────────────────────────────────────────────
    cur: {
        open: "snarl",
        moves: { snarl: { key: "snarl", label: "Snarl", damage: 4 }, bite: { key: "bite", label: "Bite", damage: 7 } },
        after: { snarl: [["bite", 70], ["snarl", 30]], bite: [["snarl", 55], ["bite", 45]] },
        limit: { bite: 2, snarl: 2 },
    },
    jackal: {
        open: "nip",
        moves: {
            nip: { key: "nip", label: "Nip", damage: 6 },
            snap: { key: "snap", label: "Snap", damage: 8 },
            worry: { key: "worry", label: "Worry", damage: 5 },
        },
        after: { nip: [["snap", 55], ["worry", 45]], snap: [["worry", 50], ["nip", 50]], worry: [["nip", 45], ["snap", 55]] },
        limit: { snap: 2 },
    },
    bruiser: {
        // Always braces first, so the shape of the fight is legible from turn one: it is winding up.
        open: "brace",
        moves: {
            brace: { key: "brace", label: "Brace", block: 9 },
            swing: { key: "swing", label: "Swing", damage: 13 },
            crush: { key: "crush", label: "Crush", damage: 18 },
        },
        after: { brace: [["swing", 60], ["crush", 40]], swing: [["crush", 45], ["brace", 55]], crush: [["brace", 70], ["swing", 30]] },
        limit: { crush: 1, swing: 2 },
    },

    // ── THE MIDDLE ───────────────────────────────────────────────────────────────────────────────────
    // A WALL, and the reason a deck needs one big card: it guards more than a hand of small blows can remove
    // in a turn, so you have to hold a real hit for the beat after the wall.
    warden: {
        open: "wall",
        moves: {
            wall: { key: "wall", label: "Wall", block: 14 },
            jab: { key: "jab", label: "Jab", damage: 6 },
            hew: { key: "hew", label: "Hew", damage: 11 },
        },
        after: { wall: [["jab", 55], ["hew", 45]], jab: [["wall", 65], ["hew", 35]], hew: [["wall", 70], ["jab", 30]] },
        limit: { wall: 2 },
    },
    // It barely hits you. It makes everything ELSE on the board hit harder, which is what turns "kill the
    // small one first" from an obvious move into a real decision.
    hexer: {
        open: "hex",
        moves: {
            hex: { key: "hex", label: "Hex", weak: 2 },
            curse: { key: "curse", label: "Curse", vulnerable: 2 },
            lash: { key: "lash", label: "Lash", damage: 7 },
        },
        after: { hex: [["curse", 45], ["lash", 55]], curse: [["lash", 60], ["hex", 40]], lash: [["hex", 45], ["curse", 45], ["lash", 10]] },
        limit: { hex: 1, curse: 1, lash: 2 },
    },
    // One move and no wind-up. Nothing to play around, only a race — which is a different kind of pressure
    // from anything else on this list, and the reason a room of them is not just a room of small enemies.
    swarm: {
        open: "sting",
        moves: { sting: { key: "sting", label: "Sting", damage: 5 } },
        after: { sting: [["sting", 100]] },
    },
    // A CLOCK. It roars, and every swing after that is worth more. Leave it alive while you clear the others
    // and the fight you were winning turns over. It cannot roar twice running, so the ramp is paid for.
    ramper: {
        open: "roar",
        moves: {
            roar: { key: "roar", label: "Roar", strength: 3 },
            swing: { key: "swing", label: "Swing", damage: 8 },
            rend: { key: "rend", label: "Rend", damage: 12 },
        },
        after: { roar: [["swing", 60], ["rend", 40]], swing: [["rend", 40], ["roar", 35], ["swing", 25]], rend: [["roar", 50], ["swing", 50]] },
        limit: { roar: 1, swing: 2 },
    },

    // ── THE DEEP ─────────────────────────────────────────────────────────────────────────────────────
    mauler: {
        open: "maul",
        moves: {
            maul: { key: "maul", label: "Maul", damage: 16 },
            heave: { key: "heave", label: "Heave", damage: 24 },
            snort: { key: "snort", label: "Snort", block: 10 },
        },
        after: { maul: [["maul", 40], ["heave", 45], ["snort", 15]], heave: [["snort", 40], ["maul", 60]], snort: [["heave", 55], ["maul", 45]] },
        limit: { maul: 2, heave: 1 },
    },
    // It heals back what you take off it, so a deck that deals damage in dribbles never finishes it. That is
    // the whole question it asks: did you build for a burst.
    leech: {
        open: "drain",
        moves: {
            drain: { key: "drain", label: "Drain", damage: 9, heal: 8 },
            gorge: { key: "gorge", label: "Gorge", damage: 14 },
            writhe: { key: "writhe", label: "Writhe", block: 8, heal: 5 },
        },
        after: { drain: [["drain", 35], ["gorge", 40], ["writhe", 25]], gorge: [["drain", 65], ["writhe", 35]], writhe: [["drain", 55], ["gorge", 45]] },
        limit: { drain: 2, gorge: 1 },
    },

    // ── ELITES ───────────────────────────────────────────────────────────────────────────────────────
    // Ramps AND guards, so it gets harder to kill at the same rate it gets harder to survive.
    champion: {
        open: "bellow",
        moves: {
            bellow: { key: "bellow", label: "Bellow", strength: 4 },
            guard: { key: "guard", label: "Guard", block: 16 },
            cleave: { key: "cleave", label: "Cleave", damage: 15 },
        },
        after: { bellow: [["cleave", 65], ["guard", 35]], guard: [["cleave", 75], ["bellow", 25]], cleave: [["cleave", 35], ["guard", 35], ["bellow", 30]] },
        limit: { bellow: 1, cleave: 2 },
    },
    // The whole fight is BEHEAD, and you can see it coming a turn ahead. Block it or be halved. It cannot
    // follow itself, so surviving one buys you a breath rather than another one immediately.
    headsman: {
        open: "sharpen",
        moves: {
            sharpen: { key: "sharpen", label: "Sharpen", strength: 2, block: 8 },
            hew: { key: "hew", label: "Hew", damage: 12 },
            behead: { key: "behead", label: "BEHEAD", damage: 30 },
        },
        after: { sharpen: [["hew", 55], ["behead", 45]], hew: [["behead", 60], ["sharpen", 40]], behead: [["sharpen", 65], ["hew", 35]] },
        limit: { behead: 1, hew: 2 },
    },

    // ── THE BOSS ─────────────────────────────────────────────────────────────────────────────────────
    // Five moves and every one is a different problem: it musters, it weakens you, it hits, it makes you
    // fragile, and then it swings the biggest number in the game into the hole it just opened. RUIN can only
    // follow DREAD, so the worst thing it does is always announced by the thing before it.
    warlord: {
        open: "muster",
        moves: {
            muster: { key: "muster", label: "Muster", strength: 3, block: 12 },
            sweep: { key: "sweep", label: "Sweep", damage: 14, weak: 1 },
            hew: { key: "hew", label: "Hew", damage: 20 },
            dread: { key: "dread", label: "Dread", vulnerable: 2 },
            ruin: { key: "ruin", label: "RUIN", damage: 28 },
        },
        after: {
            muster: [["sweep", 50], ["hew", 50]],
            sweep: [["hew", 45], ["dread", 40], ["muster", 15]],
            hew: [["dread", 45], ["muster", 30], ["sweep", 25]],
            dread: [["ruin", 100]],
            ruin: [["muster", 55], ["sweep", 45]],
        },
        limit: { hew: 2, sweep: 2 },
    },
};

/** The plain default, for a foe handed no script of its own. */
export const FOE_SCRIPT = FOE_SCRIPTS.jackal;

/**
 * What this creature will throw NEXT, decided the moment the last one resolved.
 *
 * `recent` is the run of moves already played, newest first, so `limit` can refuse a move that has appeared
 * too many times consecutively. If every option is refused the cap is ignored rather than returning nothing —
 * a creature with one move (the Swarm) would otherwise have nothing legal to do.
 */
export function pickNextMove(script, played, recent, rngSeed) {
    if (!script?.moves) return { key: null, rng: rngSeed };
    const keys = Object.keys(script.moves);
    const table = (script.after && script.after[played]) || keys.map((k) => [k, 1]);
    const runOf = (key) => {
        let n = 0;
        for (const k of recent) { if (k === key) n += 1; else break; }
        return n;
    };
    let opts = table.filter(([k]) => script.moves[k] && runOf(k) < (script.limit?.[k] ?? Infinity));
    if (!opts.length) opts = table.filter(([k]) => script.moves[k]);
    if (!opts.length) return { key: script.open || keys[0], rng: rngSeed };
    const total = opts.reduce((n, [, w]) => n + (w || 1), 0);
    const [r, rng] = nextRand(rngSeed >>> 0);
    let roll = r * total;
    for (const [k, w] of opts) { roll -= (w || 1); if (roll <= 0) return { key: k, rng }; }
    return { key: opts[opts.length - 1][0], rng };
}

// ── AN ENEMY IS A CREATURE, NOT A SLOT IN A ROOM ─────────────────────────────────────────────────────────
// The first cut of this authored HEALTH ON THE ENCOUNTER — a warden was 44 in one group and 88 in another,
// which meant "warden" was not an enemy at all, only a moveset wearing whatever body the room handed it.
// Luke: "I feel like they hand set each enemy." He is right, and the reference is unambiguous about it: a Jaw
// Worm is 40-44 in Act 1 AND in Act 3, and a Louse is 10-15 whether it stands alone, in a pair or in a three.
// The monster owns its health and its moveset; the ENCOUNTER only says which monsters turn up and how many.
//
// That matters for more than tidiness. A player can only learn "a Warden guards for 14 and has about seventy
// health" if a Warden is always that. Health that moves with the room makes every fight a fresh measurement,
// which is the opposite of the readability the whole telegraphed-intent design is buying.
//
// HP IS A RANGE, ROLLED PER FIGHT, for the same reason theirs is: an exact integer invites arithmetic, a range
// invites judgement. Rolled off the room's seed, so a refresh finds the same creature.
export const FOES = {
    // ── THE SMALL ONES — the easy pool's whole cast.
    cur:      { id: "cur",      name: "Cur",       hp: [28, 34],   script: "cur" },
    jackal:   { id: "jackal",   name: "Jackal",    hp: [40, 46],   script: "jackal" },
    swarmlet: { id: "swarmlet", name: "Biter",     hp: [24, 30],   script: "swarm" },

    // ── THE MIDDLE — what the hard pool is built from.
    bruiser:  { id: "bruiser",  name: "Bruiser",   hp: [56, 64],   script: "bruiser" },
    hexer:    { id: "hexer",    name: "Hexer",     hp: [42, 50],   script: "hexer" },
    warden:   { id: "warden",   name: "Warden",    hp: [58, 66],   script: "warden" },
    ramper:   { id: "ramper",   name: "Ravener",   hp: [54, 62],   script: "ramper" },

    // ── THE DEEP — bigger creatures, not bigger versions of the same ones.
    mauler:   { id: "mauler",   name: "Mauler",    hp: [84, 94],   script: "mauler" },
    leech:    { id: "leech",    name: "Bloodleech", hp: [76, 86],  script: "leech" },

    // ── ELITE-ONLY. Theirs are dedicated monsters — a Gremlin Nob is never a normal room — so an elite here
    // is never two ordinary enemies standing closer together either.
    champion: { id: "champion", name: "Champion",  hp: [124, 138], script: "champion" },
    headsman: { id: "headsman", name: "Headsman",  hp: [158, 176], script: "headsman" },
    sentinel: { id: "sentinel", name: "Sentinel",  hp: [88, 100],  script: "warden" },
    gorger:   { id: "gorger",   name: "Gorger",    hp: [88, 100],  script: "leech" },

    // ── THE BOSS.
    warlord:  { id: "warlord",  name: "Warlord",   hp: [185, 205], script: "warlord" },
};

/** A creature's health for this fight — its own range, rolled off the room's seed. */
export function foeHp(foeId, seed) {
    const def = FOES[foeId];
    if (!def) return 40;
    const [lo, hi] = def.hp;
    const [r] = nextRand(seed >>> 0);
    return lo + Math.floor(r * (hi - lo + 1));
}

// ── WHAT STANDS IN A ROOM ────────────────────────────────────────────────────────────────────────────────
// Spire does not make an enemy bigger as you climb — it stops sending that enemy and starts sending a
// different one. Each act carries its own list, the first two or three fights come from an EASY pool and the
// rest from a HARD one, every entry has a weight, and the same encounter cannot return within two fights.
// This is that, over one act of fifteen rows: three bands, authored groups, weights, anti-repeat.
//
// An encounter names CREATURES. It carries no numbers of its own, which is the whole correction above.
export const ENCOUNTERS = [
    // ── EASY (rows 1-3) — small things, and nothing that can end a run before it starts.
    { id: "curs", name: "Stray Curs", pool: "easy", weight: 4, foes: ["cur", "cur"] },
    { id: "jackals", name: "Jackal Pair", pool: "easy", weight: 4, foes: ["jackal", "jackal"] },
    { id: "lone_bruiser", name: "A Lone Bruiser", pool: "easy", weight: 3, foes: ["bruiser"] },
    { id: "cur_bruiser", name: "Cur and Bruiser", pool: "easy", weight: 3, foes: ["cur", "bruiser"] },
    // The debuffs turn up early and cheaply, so the first time Weak matters is not also the first time it
    // costs somebody the run.
    { id: "apprentice", name: "Hexer's Apprentice", pool: "easy", weight: 2, foes: ["hexer", "cur"] },

    // ── HARD (rows 4-9) — three fighters, and the first rooms that ask a question.
    { id: "pack", name: "The Pack", pool: "hard", weight: 4, foes: ["jackal", "jackal", "jackal"] },
    { id: "shieldwall", name: "Shield Wall", pool: "hard", weight: 3, foes: ["warden", "bruiser"] },
    { id: "coven", name: "The Coven", pool: "hard", weight: 2, foes: ["hexer", "hexer", "cur"] },
    { id: "swarm", name: "Biting Swarm", pool: "hard", weight: 3, foes: ["swarmlet", "swarmlet", "swarmlet", "swarmlet"] },
    { id: "warband", name: "Warband", pool: "hard", weight: 4, foes: ["bruiser", "jackal", "ramper"] },
    { id: "rising", name: "The Rising", pool: "hard", weight: 3, foes: ["ramper", "warden"] },

    // ── DEEP (rows 10-15) — bigger creatures, where the big cards have to have arrived.
    { id: "maulers", name: "Maulers", pool: "deep", weight: 4, foes: ["mauler", "mauler"] },
    { id: "bloodletters", name: "Bloodletters", pool: "deep", weight: 3, foes: ["leech", "leech", "hexer"] },
    { id: "the_wall", name: "The Wall", pool: "deep", weight: 3, foes: ["warden", "warden", "mauler"] },
    { id: "hunting_party", name: "Hunting Party", pool: "deep", weight: 4, foes: ["jackal", "jackal", "mauler"] },
    { id: "ascendant", name: "The Ascendant", pool: "deep", weight: 3, foes: ["ramper", "hexer", "warden"] },

    // ── ELITES — the spike you choose to walk into, and the only place a perk comes from. Built from
    //    creatures that appear NOWHERE else, so meeting one is an event rather than a bigger version of Tuesday.
    { id: "the_champion", name: "The Champion", pool: "elite", weight: 3, foes: ["champion", "bruiser"] },
    { id: "the_headsman", name: "The Headsman", pool: "elite", weight: 3, foes: ["headsman"] },
    { id: "twin_sentinels", name: "Twin Sentinels", pool: "elite", weight: 2, foes: ["sentinel", "sentinel"] },
    { id: "bloodgorged", name: "The Bloodgorged", pool: "elite", weight: 2, foes: ["gorger", "gorger"] },

    // ── THE BOSS — one of three, so a run does not end the same way twice.
    { id: "warlord", name: "The Warlord", pool: "boss", weight: 1, foes: ["warlord"] },
    { id: "sundered", name: "The Sundered Pair", pool: "boss", weight: 1, foes: ["champion", "champion"] },
    { id: "hollow_king", name: "The Hollow King", pool: "boss", weight: 1, foes: ["warlord", "hexer"] },
];

/**
 * The creatures standing in this room, with the health each rolled for this fight.
 *
 * Each gets its own slice of the seed, so two Curs in one room are not obliged to be identical twins — which
 * is the small thing that stops a pair reading as one enemy drawn twice.
 */
export function buildParty(encounter, seed) {
    const ids = encounter?.foes?.length ? encounter.foes : ["jackal", "bruiser", "warden"];
    return ids.map((foeId, i) => {
        const def = FOES[foeId] || FOES.jackal;
        return { foe: def.id, name: def.name, script: def.script, hp: foeHp(def.id, (seed >>> 0) + i * 2654435761) };
    });
}

export const encounterById = (id) => ENCOUNTERS.find((e) => e.id === id) || null;

/** Which list a room draws from. `n` is the 1-based row, matching stopAt. */
export function poolFor(n, kind = "fight") {
    if (kind === "boss") return "boss";
    if (kind === "elite") return "elite";
    if (n <= 3) return "easy";
    return n <= 9 ? "hard" : "deep";
}

/**
 * The party standing in this room.
 *
 * Threaded off the run's seed and the room's position like every other roll in this game, so a room re-entered
 * after a refresh is the same fight. `recent` is the last two encounter ids — the reference's own anti-repeat
 * window. Without it a weighted draw hands you The Pack three rooms running and the map stops feeling
 * authored; with it, the thing you just beat is not the thing in the next doorway.
 *
 * A pool with nothing left after the exclusion falls back to the whole pool rather than returning nothing,
 * because a short list plus a two-deep memory can otherwise dead-end a run.
 */
export function pickEncounter(seed, n, kind = "fight", recent = []) {
    const pool = poolFor(n, kind);
    const all = ENCOUNTERS.filter((e) => e.pool === pool);
    const fresh = all.filter((e) => !recent.includes(e.id));
    const list = fresh.length ? fresh : all;
    const total = list.reduce((sum, e) => sum + (e.weight || 1), 0);
    const [r] = nextRand(seed >>> 0);
    let roll = r * total;
    for (const e of list) {
        roll -= e.weight || 1;
        if (roll <= 0) return e;
    }
    return list[list.length - 1];
}


// Reads the starter four AND the pet pool. Declared before POOL exists, so it dereferences ALL_CARDS at CALL
// time rather than closing over a map that is still empty at module-evaluation order.
/** What the carried perks add up to for one field. */
export const perkSum = (perks, field) => (perks || [])
    .reduce((n, id) => n + (Number(PERKS[id]?.[field]) || 0), 0);

export const cardById = (id) => ALL_CARDS[id] || null;

// ── THE WORDS THAT MEAN SOMETHING ────────────────────────────────────────────────────────────────────────
// Spire colours its keywords inside the card text — "Gain 5 Block", "Apply 2 Vulnerable" — and that colouring
// is how a hand gets read at speed: you are not reading sentences, you are spotting the two words that decide
// the turn. Kept here rather than in the card component because the rules own the vocabulary; a screen that
// invented its own list would drift the moment a card added a keyword.
export const KEYWORDS = ["Block", "Vulnerable", "Weak", "Strength"];

// ── WHAT EACH KIND OF CARD IS CALLED ─────────────────────────────────────────────────────────────────────
// The card face used to name the type with `kind === "attack" ? "Attack" : "Skill"`, which is a ternary that
// quietly calls a Power a Skill the day one exists. The rules own the vocabulary — the same argument KEYWORDS
// makes one block up — so the screen asks rather than guesses.
//
// COLOUR IS NOT IN HERE, and that was a decision rather than an omission. Spire paints a card in its CLASS's
// colour and carries the type in the window's shape plus this word; we have no classes, so the colour was
// briefly going to say the type instead — red attack, blue skill. Luke, looking at it: "I kinda like that it
// chose the colors of the pet to match." The frame sits directly around the ART, so an orange card around a
// fox reads as one object and a red card around that same fox reads as a fox in somebody else's frame. The
// pet keeps the colour; the type keeps the shape and the word, which is all Spire gives it either.
export const TYPE_LOOK = {
    attack: { label: "Attack" },
    skill: { label: "Skill" },
    power: { label: "Power" },
};
export const typeLook = (kind) => TYPE_LOOK[kind] || TYPE_LOOK.skill;

// ── WHAT THE THING ACROSS THE SAND IS DOING ──────────────────────────────────────────────────────────────
// Three beats on a loop, and you are always shown the NEXT one. Deliberately not random: a fixed cycle is
// readable, and a first foe whose job is to teach "block on the big one" has to be learnable inside a single
// fight. The heave is the lesson — sixteen through no block is a quarter of you.
// The script belongs to the FOE, not to this module — it is handed in at startFight and carried on the state,
// so a second foe is a second script rather than a branch in here. This one is only the default.
//
// THESE NUMBERS WERE FOUND BY PLAYING, NOT BY PICKING. Two bots — one that swings every turn, one that reads
// the intent and covers the big swing — over forty seeds each, at four scripts and three foe healths. The
// first draft put this foe at 45 HP and the fight ended on turn three, before the heave ever landed: the
// intent above its head had no consequence and the two bots scored identically.
//
// AND HITTING HARDER MADE IT WORSE, which is the part worth writing down. At 14/9/26 the reader finished TEN
// HP behind the swinger and died in half the seeds, because five block against a twenty-six point swing barely
// dents it while costing a turn of damage — and a longer fight is another swing taken. Partial block is a
// trap. Block only pays when a hand can substantially COVER the thing being blocked, which is why Spire's
// Defend is 5 against an eleven-point Jaw Worm attack and not against a thirty.
//
// So the script stays where it started and the foe's health went up instead: the heave now lands on turn 3,
// three Hops very nearly cover it, and reading is worth about four HP over a fight.
// ── THE MATH, IN SPIRE'S ORDER ───────────────────────────────────────────────────────────────────────────
// Strength is added to the printed number FIRST, then Weak takes a quarter off the attacker, then Vulnerable
// adds half again to what the target takes, flooring at each step. The order is not decoration: 6 damage with
// Weak and Vulnerable is floor(floor(6 x 0.75) x 1.5) = 6, and doing it the other way round gives 7.
export function attackDamage(base, attacker = {}, defender = {}) {
    const withStrength = Math.max(0, (Number(base) || 0) + (Number(attacker.strength) || 0));
    const weakened = (attacker.weak || 0) > 0 ? Math.floor(withStrength * 0.75) : withStrength;
    return (defender.vulnerable || 0) > 0 ? Math.floor(weakened * 1.5) : weakened;
}

/**
 * What this card would actually do, right now, to this defender — the values behind the text.
 *
 * `defender` is optional and its absence is meaningful rather than an error: with no target chosen there is
 * no Vulnerable to apply, so the card shows base plus your own Strength and Weak. That is exactly Spire's
 * resting state, and the reason theirs behaves that way is that one enemy can be Vulnerable while the one
 * beside it is not — the number genuinely cannot be resolved until you have picked somebody.
 *
 * Block and heal take no defender at all: they are properties of the player, which is why Spire can show a
 * modified Block permanently in hand and cannot do the same for damage. When Dexterity and Frail arrive they
 * belong HERE, in this function, and nothing that renders a card will need to know they exist.
 */
export function resolveCard(card, attacker = {}, defender = null) {
    if (!card) return {};
    const out = {};
    if (card.damage) out.damage = attackDamage(card.damage, attacker, defender || {});
    if (card.block) out.block = card.block;
    if (card.heal) out.heal = card.heal;
    if (card.vulnerable) out.vulnerable = card.vulnerable;
    if (card.weak) out.weak = card.weak;
    return out;
}

/**
 * How a blow of this size would divide against this unit: what its armour eats, and what is left to reach
 * the health bar. Exported because the PREVIEW needs the same split the resolution uses — a preview computed
 * a second way is a preview that will eventually disagree with the hit it is previewing, and the player will
 * believe the preview.
 */
export function splitDamage(unit, amount) {
    const absorbed = Math.min(unit?.block || 0, Math.max(0, amount));
    return { absorbed, toHp: Math.max(0, amount - absorbed) };
}

/** Block eats damage first, and only what is left reaches HP. */
function land(unit, amount) {
    const absorbed = Math.min(unit.block || 0, amount);
    return { ...unit, block: (unit.block || 0) - absorbed, hp: Math.max(0, unit.hp - (amount - absorbed)) };
}

// Debuffs tick down at the end of the turn of whoever is CARRYING them, so two Vulnerable applied on your turn
// is two enemy turns of taking half again — not one.
const tick = (unit) => ({
    ...unit,
    vulnerable: Math.max(0, (unit.vulnerable || 0) - 1),
    weak: Math.max(0, (unit.weak || 0) - 1),
});

// ── DRAWING ──────────────────────────────────────────────────────────────────────────────────────────────
// When the draw pile runs dry mid-draw the discard is shuffled back in and drawing continues, which is why
// this is a loop and not a slice. A card drawn into a full hand goes straight to the discard.
function drawCards(state, n) {
    let { draw, discard, hand, rng } = state;
    for (let i = 0; i < n; i += 1) {
        if (!draw.length) {
            if (!discard.length) break;
            [draw, rng] = shuffle(discard, rng);
            discard = [];
        }
        const card = draw[0];
        draw = draw.slice(1);
        if (hand.length >= HAND_MAX) discard = [...discard, card];
        else hand = [...hand, card];
    }
    return { ...state, draw, discard, hand, rng };
}

/**
 * Your turn opens: block gone, energy back, five cards.
 *
 * ── AND THE FIRST TURN IS DIFFERENT, IF YOU CARRY THE PERKS FOR IT ───────────────────────────────────────
 * Lucky Paw and Old Lantern pay on the OPENING turn only, which is the shape of half of Spire's relics: they
 * buy you a better first hand rather than a permanently bigger one, so they change how a fight starts without
 * changing what it costs to keep playing. `perks` rides on the state because the engine takes no arguments it
 * was not handed at startFight.
 */
function beginTurn(state) {
    const first = state.turn === 0;
    const opened = {
        ...state,
        turn: state.turn + 1,
        energy: state.energyMax + (first ? perkSum(state.perks, "energy") : 0),
        hero: { ...state.hero, block: first ? state.hero.block : 0 },
    };
    return drawCards(opened, DRAW_PER_TURN + (first ? perkSum(state.perks, "draw") : 0));
}

// ── THE FIGHT ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A fight from a seed. `hero` and `foe` carry only presentation — name and art — because the engine does not
 * care who anybody is. That is what lets the page hand it a random fighter off the Long Road without this file
 * importing the Road.
 */
/**
 * A fight from a seed, against a PARTY.
 *
 * It held exactly one foe until now, which was fine for proving a fight and wrong for proving a game: three
 * enemies is where a hand stops being "spend everything on the only thing there is" and starts being a
 * question about where the damage should go. Every rule below reads `foes` — an attack carries the index of
 * what it hit, every living foe acts on its own turn, and the fight is won when the last one is down.
 */
export function startFight({ seed = 1, hero = {}, foe = null, foes = null, deck: deckIds = null, perks = [] } = {}) {
    // A RUN BRINGS ITS OWN DECK AND ITS OWN HEALTH. Without one this is still the standalone fight it always
    // was — the starter ten at full health — which is what keeps ?seed=N working as a thing you can hand
    // somebody. With one, the cards you have picked and the health you walked out of the last fight on are
    // the fight, and that carry is the entire reason a run is more than eight separate fights.
    const deck = (Array.isArray(deckIds) && deckIds.length ? deckIds : STARTER_DECK).map((id, i) => ({ uid: `c${i}`, id }));
    const [draw, rng] = shuffle(deck, seed >>> 0);
    // One foe or many: a single `foe` is still accepted so nothing that only wants a duel has to build an array.
    const party = (Array.isArray(foes) && foes.length ? foes : [foe || {}]).slice(0, 5);
    const state = {
        seed: seed >>> 0,
        perks: [...(perks || [])],
        rng,
        turn: 0,
        energy: 0,
        energyMax: ENERGY_PER_TURN,
        hero: {
            name: hero.name || "You", art: hero.art || null, flip: Boolean(hero.flip),
            hp: Math.max(1, Math.min(hero.hpMax || HERO_HP, hero.hp || HERO_HP)),
            hpMax: hero.hpMax || HERO_HP,
            // ── PERKS LAND HERE, ONCE ────────────────────────────────────────────────────────────────
            // A perk that changes how a fight OPENS belongs in the opening state rather than in a branch
            // somewhere in the turn loop — the engine stays a function of its state, and a new perk of this
            // shape is a line in PERKS rather than a line in here.
            block: perkSum(perks, "block"),
            strength: perkSum(perks, "strength"),
            vulnerable: 0, weak: 0,
        },
        foes: party.map((f, i) => ({
            id: `f${i}`,
            name: f.name || "Something", art: f.art || null, artFallback: f.artFallback || null,
            // WHAT it is, beside WHO it is. `name` is the Long Road fighter whose portrait this is; `foeName`
            // is the creature — Warden, Mauler, Headsman — and that is the half a player can actually learn.
            // Carried through the engine because the screen has no other way to reach it.
            foe: f.foe || null, foeName: f.foeName || null,
            color: f.color || "#ff8f6a", houseName: f.houseName || null,
            hp: f.hp || FOE_HP, hpMax: f.hp || FOE_HP,
            script: f.script?.moves ? f.script : FOE_SCRIPT,
            // ALL START AT THE TOP OF THEIR OWN SCRIPT. Starting each one a beat further in was meant to
            // stop a party swinging in unison, and instead opened every fight with three enemies on their
            // heaviest beat at once: 35 damage on turn one against 70 health, measured. What makes three
            // enemies feel like three is that they run DIFFERENT scripts, not that they run the same one out
            // of phase — a jackal that nips, a bruiser that spends a turn bracing, and one that builds to a
            // heave. Turn one is 17 now, and the heavy beats arrive apart because the scripts differ in
            // length and in shape.
            block: 0, strength: 0, vulnerable: 0, weak: 0, beat: 0,
            // ── WHAT IT WILL DO, DECIDED BEFORE YOUR TURN STARTS ─────────────────────────────────
            // Every creature opens on a fixed move, the way a Jaw Worm always opens Chomp: an opening beat
            // that could be anything is a turn you cannot plan, and the whole design rests on planning.
            // `recent` is the run of moves just thrown, newest first, which is what `limit` reads.
            next: (f.script?.moves ? f.script : FOE_SCRIPT).open,
            recent: [],
        })),
        hand: [], draw, discard: [],
        over: null,
    };
    return beginTurn(state);
}

export const livingFoes = (state) => (state?.foes || []).filter((f) => f.hp > 0);

/** What this foe will do when you end your turn — the whole reason the fight is a puzzle. */
export const foeIntent = (state, i = 0) => {
    const foe = state?.foes?.[i];
    const script = foe?.script?.moves ? foe.script : FOE_SCRIPT;
    // Whatever was chosen when its last move resolved. Falls back to the opener for a foe that has not moved
    // yet, and to the first move at all for a script whose `open` names something that is not there.
    return script.moves[foe?.next] || script.moves[script.open] || Object.values(script.moves)[0];
};

/** What that intent will actually land for, after Strength, Weak and your Vulnerable. Shown, never hidden. */
export const intentDamage = (state, i = 0) => {
    const intent = foeIntent(state, i);
    return intent?.damage ? attackDamage(intent.damage, state.foes[i], state.hero) : 0;
};

/**
 * The whole party's next swing, added up. With one enemy this is the number over its head; with three it is
 * the only figure that answers the question a turn actually asks — can I afford to take this?
 */
export const incomingTotal = (state) => (state?.foes || [])
    .reduce((n, f, i) => (f.hp > 0 ? n + intentDamage(state, i) : n), 0);

export const canPlay = (state, uid) => {
    if (!state || state.over) return false;
    const card = cardById(state.hand.find((c) => c.uid === uid)?.id);
    return Boolean(card) && card.cost <= state.energy;
};

/**
 * Play one card out of the hand. Returns { state, events } — events exist so the screen can throw a number off
 * whoever was hit without re-deriving what happened by diffing two states.
 */
export function playCard(state, uid, targetIndex = 0) {
    if (!canPlay(state, uid)) return { state, events: [] };
    const entry = state.hand.find((c) => c.uid === uid);
    const card = cardById(entry.id);
    const events = [];
    let hero = state.hero;
    let foes = state.foes;

    // A card that needs a target and was given a dead one (or none) finds the first thing still standing,
    // rather than being swallowed. The screen should never send this, but a rule that can be called wrongly
    // should fail into something sane instead of eating a card and its energy.
    let ti = Number.isInteger(targetIndex) ? targetIndex : 0;
    if (card.target === "foe" && !(foes[ti]?.hp > 0)) ti = foes.findIndex((f) => f.hp > 0);
    if (card.target === "foe" && ti < 0) return { state, events: [] };

    const hitFoe = (i, fn) => { foes = foes.map((f, n) => (n === i ? fn(f) : f)); };

    // ── DAMAGE, AND THE THREE WAYS A CARD CAN SHAPE IT ───────────────────────────────────────────────
    // `hits` swings the same number more than once, `all` swings at everybody. Both are resolved as REPEATED
    // SINGLE HITS rather than one big number, because that is what makes them different from a card with a
    // bigger figure on it: each swing is rolled against that foe's own Block and its own Vulnerable, so three
    // hits of 4 chew through 6 Block where one hit of 12 does not, and a party of three is what `all` is for.
    if (card.damage) {
        const targets = card.all ? foes.map((f, i) => i).filter((i) => foes[i].hp > 0) : [ti];
        for (let swing = 0; swing < (card.hits || 1); swing += 1) {
            for (const i of targets) {
                if (!(foes[i].hp > 0)) continue;
                const dealt = attackDamage(card.damage, hero, foes[i]);
                hitFoe(i, (f) => land(f, dealt));
                events.push({ type: "damage", on: foes[i].id, amount: dealt });
            }
        }
    }
    if (card.block) {
        hero = { ...hero, block: (hero.block || 0) + card.block };
        events.push({ type: "block", on: "hero", amount: card.block });
    }
    // HEALING, which is the other half of what a target means: a card can point at YOU. Capped at your own
    // maximum — a heal is not a way to grow.
    if (card.heal) {
        const before = hero.hp;
        hero = { ...hero, hp: Math.min(hero.hpMax, hero.hp + card.heal) };
        events.push({ type: "heal", on: "hero", amount: hero.hp - before });
    }
    if (card.vulnerable) {
        const targets = card.all ? foes.map((f, i) => i).filter((i) => foes[i].hp > 0) : [ti];
        for (const i of targets) {
            hitFoe(i, (f) => ({ ...f, vulnerable: (f.vulnerable || 0) + card.vulnerable }));
            events.push({ type: "debuff", on: foes[i].id, key: "Vulnerable", amount: card.vulnerable });
        }
    }
    // ── WEAK ── the defensive half of the pair, and it was already half here: attackDamage has always taken a
    // quarter off a Weak attacker and resolveCard has always reported it, but nothing could APPLY it. A card
    // that makes the big swing smaller is the only answer to an intent you cannot block through, so the run
    // needs it the moment enemies start hitting for sixteen.
    if (card.weak) {
        const targets = card.all ? foes.map((f, i) => i).filter((i) => foes[i].hp > 0) : [ti];
        for (const i of targets) {
            hitFoe(i, (f) => ({ ...f, weak: (f.weak || 0) + card.weak }));
            events.push({ type: "debuff", on: foes[i].id, key: "Weak", amount: card.weak });
        }
    }
    // Strength is permanent for the fight and adds to EVERY attack after it, which is what makes a card that
    // does nothing on the turn you play it worth a slot.
    if (card.strength) {
        hero = { ...hero, strength: (hero.strength || 0) + card.strength };
        events.push({ type: "buff", on: "hero", key: "Strength", amount: card.strength });
    }

    let next = {
        ...state,
        hero, foes,
        // `energy` on a card is energy GAINED, so a 1-cost card that gives 2 back is a net +1 and the reason
        // a deck can do more than three things a turn.
        energy: state.energy - card.cost + (card.energy || 0),
        hand: state.hand.filter((c) => c.uid !== uid),
        discard: [...state.discard, entry],
        // The fight is over when the LAST one is down, not the first.
        over: foes.every((f) => f.hp <= 0) ? "win" : state.over,
    };
    // Drawn AFTER the card has left the hand and reached the discard, so a card that draws cannot draw itself
    // back, and so a draw that exhausts the pile reshuffles a discard this card is already part of.
    if (card.draw) next = drawCards(next, card.draw);
    if (next.over === "win") events.push({ type: "over", result: "win" });
    return { state: next, events };
}

/**
 * Give up. Ends the fight as a loss, which is the honest reading: the foe is still standing.
 *
 * In the rules rather than done by poking the state from the screen, for the same reason everything else is —
 * the day a forfeit costs something (a trip, a rung, the run), it will cost it here, once, rather than in
 * whichever screen happened to offer the button.
 */
export const forfeit = (state) => (state?.over ? state : { ...state, over: "lose", gaveUp: true });

/**
 * End your turn: your debuffs tick, the foe clears its block, does the thing it told you it would do, and then
 * a fresh turn opens. A foe's block is gained on ITS turn and stands through yours, which is what makes the
 * guarded swing worth reading rather than just worth surviving.
 */
/**
 * ── THE ENEMY TURN, ONE ENEMY AT A TIME ──────────────────────────────────────────────────────────────────
 * This used to be a single function that resolved the whole party and handed back one state and one pile of
 * events. The arithmetic was right and the SCREEN was wrong: filmed, all three foes lunged together and the
 * entire turn then landed in one frame — the hero dropped 70 to 53 while a 6 and an 11 appeared over him
 * simultaneously and a shield popped on a third foe. You could not tell who hit you for what.
 *
 * Spire resolves them in slot order with a real gap between, each with its own animation and its own number,
 * and the reason is legibility: a turn where you took seventeen has to read as "six, then eleven".
 *
 * So the turn is now three exported steps and the client drives the clock. endTurn is KEPT and is composed
 * from exactly those steps rather than reimplementing them — one set of rules, two ways to run it, and no
 * possibility of the stepped version and the atomic version disagreeing (cards-sim.mjs still calls endTurn).
 */

/** Your debuffs tick, and the party is on notice. Nothing swings yet. */
export function startFoeTurn(state) {
    if (!state || state.over) return { state, events: [] };
    return { state: { ...state, hero: tick(state.hero) }, events: [] };
}

/**
 * ONE foe acts. Returns `acted: false` for a corpse — a dead enemy neither swings nor advances its script,
 * which is what makes killing the one winding up for the big hit a real decision — so the caller can skip
 * straight past it without spending a beat of screen time on nothing.
 *
 * Reads the intent from `state`, whose other foes have not moved, so a party resolving one at a time
 * telegraphs exactly what it telegraphed before the first one went.
 */
export function foeAct(state, i) {
    const foe = state?.foes?.[i];
    if (!state || state.over || !foe || foe.hp <= 0) return { state, events: [], acted: false };

    const events = [];
    let hero = state.hero;
    let f = { ...foe, block: 0 };
    const intent = foeIntent(state, i);
    // ── A FOE'S TURN IS MORE THAN A NUMBER AND A SHIELD ──────────────────────────────────────────────
    // This read `damage` and `block` and nothing else, while the engine underneath it had carried Strength,
    // Weak and Vulnerable on BOTH sides since the first card was written — attackDamage reads
    // attacker.strength, attacker.weak and defender.vulnerable without caring who is who. So every enemy in
    // the game could only hit you or guard, and the fights felt the same however many fighters were on the
    // board, because they were the same.
    //
    // ORDER IS THE RULE: it buffs itself, then swings with the buff, then leaves what it did to you behind.
    // A "roar and swing" beat therefore lands harder on the turn it roars, which is what makes a ramping
    // enemy a clock rather than a slow start.
    if (intent.strength) {
        f = { ...f, strength: (f.strength || 0) + intent.strength };
        events.push({ type: "buff", on: f.id, amount: intent.strength });
    }
    if (intent.heal) {
        const to = Math.min(f.hpMax || f.hp, (f.hp || 0) + intent.heal);
        events.push({ type: "heal", on: f.id, amount: to - (f.hp || 0) });
        f = { ...f, hp: to };
    }
    if (intent.block) {
        f = { ...f, block: f.block + intent.block };
        events.push({ type: "block", on: f.id, amount: intent.block });
    }
    if (intent.damage) {
        const dealt = attackDamage(intent.damage, f, hero);
        hero = land(hero, dealt);
        events.push({ type: "damage", on: "hero", amount: dealt });
    }
    // Applied AFTER the blow, so the Vulnerable a beat inflicts does not also multiply that same beat — the
    // card side already works this way and a foe that broke the rule would be reading its own buff twice.
    if (intent.weak) {
        hero = { ...hero, weak: (hero.weak || 0) + intent.weak };
        events.push({ type: "debuff", on: "hero", amount: intent.weak, stat: "weak" });
    }
    if (intent.vulnerable) {
        hero = { ...hero, vulnerable: (hero.vulnerable || 0) + intent.vulnerable };
        events.push({ type: "debuff", on: "hero", amount: intent.vulnerable, stat: "vulnerable" });
    }
    // ── AND IT DECIDES ITS NEXT MOVE NOW, NOT WHEN ITS TURN COMES ROUND ─────────────────────────────
    // The pill has to show the truth for the whole of your turn, so the choice happens the moment this one
    // resolves. Threaded off the fight's own rng rather than Math.random, so a seed still replays a fight
    // beat for beat — the one property that makes "play seed 4471 and tell me what you think" mean anything.
    const script = f.script?.moves ? f.script : FOE_SCRIPT;
    const played = f.next;
    const recent = [played, ...(f.recent || [])].slice(0, 4);
    const { key, rng } = pickNextMove(script, played, recent, state.rng);
    const foes = state.foes.map((other, n) => (
        n === i ? tick({ ...f, beat: (f.beat || 0) + 1, next: key || script.open, recent }) : other
    ));
    return {
        state: { ...state, hero, foes, rng, over: hero.hp <= 0 ? "lose" : state.over },
        events,
        acted: true,
        // What it DID, so the screen can lunge for a blow and merely raise a shield for a guard rather than
        // playing an attack animation on an enemy that never attacked. The old code lunged all three.
        // The screen lunges on "attack" and braces on anything else, so a buff or a debuff reads as a brace
        // rather than a swing that never came. Attack still wins the tie: a beat that hits AND curses you is
        // a blow first.
        kind: intent.damage ? "attack" : (intent.block || intent.strength || intent.heal) ? "guard"
            : (intent.weak || intent.vulnerable) ? "curse" : "idle",
    };
}

/** The party is done: your hand goes to the discard and the next turn opens. */
export function finishFoeTurn(state) {
    if (!state) return { state, events: [] };
    const spent = { ...state, discard: [...state.discard, ...state.hand], hand: [] };
    if (spent.over === "lose") return { state: spent, events: [{ type: "over", result: "lose" }] };
    return { state: beginTurn(spent), events: [] };
}

/**
 * The whole enemy turn at once — the same three steps, run without a clock. For anything that is not a
 * screen: the sim, a test, a future replay.
 *
 * A HERO WHO HAS DIED STOPS THE TURN. The previous version let every remaining foe swing at a corpse (land()
 * floors HP at zero, so the outcome was the same) and pushed damage events for blows nobody could take. Now
 * both paths stop, and they stop identically because there is only one implementation of stopping.
 */
export function endTurn(state) {
    if (!state || state.over) return { state, events: [] };
    let cur = startFoeTurn(state).state;
    const events = [];
    for (let i = 0; i < cur.foes.length; i += 1) {
        const step = foeAct(cur, i);
        cur = step.state;
        events.push(...step.events);
        if (cur.over) break;
    }
    const done = finishFoeTurn(cur);
    return { state: done.state, events: [...events, ...done.events] };
}
