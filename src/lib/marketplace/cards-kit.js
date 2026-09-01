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
export const CARDS = {
    bite: {
        id: "bite", pet: "wolf_pup", name: "Bite", cost: 1, kind: "attack", target: "foe",
        damage: 6, text: "Deal 6 damage.", upgrade: { damage: 9 },
    },
    hop: {
        id: "hop", pet: "frog", name: "Hop", cost: 1, kind: "skill", target: "self",
        block: 5, text: "Gain 5 block.", upgrade: { block: 8 },
    },
    pounce: {
        id: "pounce", pet: "fox_kit", name: "Pounce", cost: 2, kind: "attack", target: "foe",
        damage: 8, vulnerable: 2, text: "Deal 8 damage. Apply 2 Vulnerable.", upgrade: { damage: 10, vulnerable: 3 },
    },
};

export const STARTER_DECK = [
    "bite", "bite", "bite", "bite", "bite",
    "hop", "hop", "hop", "hop",
    "pounce",
];

export const cardById = (id) => CARDS[id] || null;

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
export const FOE_SCRIPT = [
    { key: "lunge", label: "Lunge", damage: 11 },
    { key: "guard", label: "Guarded Swing", damage: 7, block: 6 },
    { key: "heave", label: "Heave", damage: 16 },
];

// ── THE MATH, IN SPIRE'S ORDER ───────────────────────────────────────────────────────────────────────────
// Strength is added to the printed number FIRST, then Weak takes a quarter off the attacker, then Vulnerable
// adds half again to what the target takes, flooring at each step. The order is not decoration: 6 damage with
// Weak and Vulnerable is floor(floor(6 x 0.75) x 1.5) = 6, and doing it the other way round gives 7.
export function attackDamage(base, attacker = {}, defender = {}) {
    const withStrength = Math.max(0, (Number(base) || 0) + (Number(attacker.strength) || 0));
    const weakened = (attacker.weak || 0) > 0 ? Math.floor(withStrength * 0.75) : withStrength;
    return (defender.vulnerable || 0) > 0 ? Math.floor(weakened * 1.5) : weakened;
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

/** Your turn opens: block gone, energy back, five cards. */
function beginTurn(state) {
    const opened = {
        ...state,
        turn: state.turn + 1,
        energy: state.energyMax,
        hero: { ...state.hero, block: 0 },
    };
    return drawCards(opened, DRAW_PER_TURN);
}

// ── THE FIGHT ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A fight from a seed. `hero` and `foe` carry only presentation — name and art — because the engine does not
 * care who anybody is. That is what lets the page hand it a random fighter off the Long Road without this file
 * importing the Road.
 */
export function startFight({ seed = 1, hero = {}, foe = {} } = {}) {
    const deck = STARTER_DECK.map((id, i) => ({ uid: `c${i}`, id }));
    const [draw, rng] = shuffle(deck, seed >>> 0);
    const state = {
        seed: seed >>> 0,
        rng,
        turn: 0,
        energy: 0,
        energyMax: ENERGY_PER_TURN,
        hero: {
            name: hero.name || "You", art: hero.art || null, flip: Boolean(hero.flip),
            hp: HERO_HP, hpMax: HERO_HP, block: 0, strength: 0, vulnerable: 0, weak: 0,
        },
        foe: {
            name: foe.name || "Something", art: foe.art || null, artFallback: foe.artFallback || null,
            color: foe.color || "#ff8f6a", houseName: foe.houseName || null,
            hp: foe.hp || FOE_HP, hpMax: foe.hp || FOE_HP,
            script: Array.isArray(foe.script) && foe.script.length ? foe.script : FOE_SCRIPT,
            block: 0, strength: 0, vulnerable: 0, weak: 0, beat: 0,
        },
        hand: [], draw, discard: [],
        over: null,
    };
    return beginTurn(state);
}

/** What the foe will do when you end your turn — the whole reason the fight is a puzzle. */
export const foeIntent = (state) => {
    const script = state?.foe?.script?.length ? state.foe.script : FOE_SCRIPT;
    return script[(state?.foe?.beat || 0) % script.length];
};

/** What that intent will actually land for, after Strength, Weak and your Vulnerable. Shown, never hidden. */
export const intentDamage = (state) => {
    const intent = foeIntent(state);
    return intent?.damage ? attackDamage(intent.damage, state.foe, state.hero) : 0;
};

export const canPlay = (state, uid) => {
    if (!state || state.over) return false;
    const card = cardById(state.hand.find((c) => c.uid === uid)?.id);
    return Boolean(card) && card.cost <= state.energy;
};

/**
 * Play one card out of the hand. Returns { state, events } — events exist so the screen can throw a number off
 * whoever was hit without re-deriving what happened by diffing two states.
 */
export function playCard(state, uid) {
    if (!canPlay(state, uid)) return { state, events: [] };
    const entry = state.hand.find((c) => c.uid === uid);
    const card = cardById(entry.id);
    const events = [];
    let hero = state.hero;
    let foe = state.foe;

    if (card.damage) {
        const dealt = attackDamage(card.damage, hero, foe);
        foe = land(foe, dealt);
        events.push({ type: "damage", on: "foe", amount: dealt });
    }
    if (card.block) {
        hero = { ...hero, block: (hero.block || 0) + card.block };
        events.push({ type: "block", on: "hero", amount: card.block });
    }
    if (card.vulnerable) {
        foe = { ...foe, vulnerable: (foe.vulnerable || 0) + card.vulnerable };
        events.push({ type: "debuff", on: "foe", key: "Vulnerable", amount: card.vulnerable });
    }

    const next = {
        ...state,
        hero, foe,
        energy: state.energy - card.cost,
        hand: state.hand.filter((c) => c.uid !== uid),
        discard: [...state.discard, entry],
        over: foe.hp <= 0 ? "win" : state.over,
    };
    if (next.over === "win") events.push({ type: "over", result: "win" });
    return { state: next, events };
}

/**
 * End your turn: your debuffs tick, the foe clears its block, does the thing it told you it would do, and then
 * a fresh turn opens. A foe's block is gained on ITS turn and stands through yours, which is what makes the
 * guarded swing worth reading rather than just worth surviving.
 */
export function endTurn(state) {
    if (!state || state.over) return { state, events: [] };
    const events = [];
    let hero = tick(state.hero);
    let foe = { ...state.foe, block: 0 };
    const intent = foeIntent(state);

    if (intent.block) {
        foe = { ...foe, block: foe.block + intent.block };
        events.push({ type: "block", on: "foe", amount: intent.block });
    }
    if (intent.damage) {
        const dealt = attackDamage(intent.damage, foe, hero);
        hero = land(hero, dealt);
        events.push({ type: "damage", on: "hero", amount: dealt });
    }

    foe = tick({ ...foe, beat: (foe.beat || 0) + 1 });

    const spent = {
        ...state,
        hero, foe,
        discard: [...state.discard, ...state.hand],
        hand: [],
        over: hero.hp <= 0 ? "lose" : state.over,
    };
    if (spent.over === "lose") {
        events.push({ type: "over", result: "lose" });
        return { state: spent, events };
    }
    return { state: beginTurn(spent), events };
}
