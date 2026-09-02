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

export const STARTER_DECK = [
    "bite", "bite", "bite", "bite", "bite",
    "hop", "hop", "hop",
    "purr",
    "pounce",
];

// ── AND THE PARTY DOES NOT SWING IN UNISON ───────────────────────────────────────────────────────────────
// Three copies of one script is one enemy standing in three places. These two sit either side of the default:
// a jackal that hits small and often and never guards, and a bruiser that spends a turn winding up and then
// takes a quarter of you off. Which one you kill first is the question three enemies are FOR.
export const FOE_SCRIPTS = {
    jackal: [
        { key: "nip", label: "Nip", damage: 6 },
        { key: "snap", label: "Snap", damage: 8 },
        { key: "worry", label: "Worry", damage: 5 },
    ],
    bruiser: [
        { key: "brace", label: "Brace", block: 9 },
        { key: "swing", label: "Swing", damage: 13 },
        { key: "crush", label: "Crush", damage: 18 },
    ],
};

export const cardById = (id) => CARDS[id] || null;

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
/**
 * A fight from a seed, against a PARTY.
 *
 * It held exactly one foe until now, which was fine for proving a fight and wrong for proving a game: three
 * enemies is where a hand stops being "spend everything on the only thing there is" and starts being a
 * question about where the damage should go. Every rule below reads `foes` — an attack carries the index of
 * what it hit, every living foe acts on its own turn, and the fight is won when the last one is down.
 */
export function startFight({ seed = 1, hero = {}, foe = null, foes = null } = {}) {
    const deck = STARTER_DECK.map((id, i) => ({ uid: `c${i}`, id }));
    const [draw, rng] = shuffle(deck, seed >>> 0);
    // One foe or many: a single `foe` is still accepted so nothing that only wants a duel has to build an array.
    const party = (Array.isArray(foes) && foes.length ? foes : [foe || {}]).slice(0, 5);
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
        foes: party.map((f, i) => ({
            id: `f${i}`,
            name: f.name || "Something", art: f.art || null, artFallback: f.artFallback || null,
            color: f.color || "#ff8f6a", houseName: f.houseName || null,
            hp: f.hp || FOE_HP, hpMax: f.hp || FOE_HP,
            script: Array.isArray(f.script) && f.script.length ? f.script : FOE_SCRIPT,
            // ALL START AT THE TOP OF THEIR OWN SCRIPT. Starting each one a beat further in was meant to
            // stop a party swinging in unison, and instead opened every fight with three enemies on their
            // heaviest beat at once: 35 damage on turn one against 70 health, measured. What makes three
            // enemies feel like three is that they run DIFFERENT scripts, not that they run the same one out
            // of phase — a jackal that nips, a bruiser that spends a turn bracing, and one that builds to a
            // heave. Turn one is 17 now, and the heavy beats arrive apart because the scripts differ in
            // length and in shape.
            block: 0, strength: 0, vulnerable: 0, weak: 0, beat: 0,
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
    const script = foe?.script?.length ? foe.script : FOE_SCRIPT;
    return script[(foe?.beat || 0) % script.length];
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

    if (card.damage) {
        const dealt = attackDamage(card.damage, hero, foes[ti]);
        hitFoe(ti, (f) => land(f, dealt));
        events.push({ type: "damage", on: foes[ti].id, amount: dealt });
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
        hitFoe(ti, (f) => ({ ...f, vulnerable: (f.vulnerable || 0) + card.vulnerable }));
        events.push({ type: "debuff", on: foes[ti].id, key: "Vulnerable", amount: card.vulnerable });
    }

    const next = {
        ...state,
        hero, foes,
        energy: state.energy - card.cost,
        hand: state.hand.filter((c) => c.uid !== uid),
        discard: [...state.discard, entry],
        // The fight is over when the LAST one is down, not the first.
        over: foes.every((f) => f.hp <= 0) ? "win" : state.over,
    };
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
export function endTurn(state) {
    if (!state || state.over) return { state, events: [] };
    const events = [];
    let hero = tick(state.hero);

    // Every foe still standing takes its turn, left to right, and the block each gains is its own. A corpse
    // does not swing and does not advance its script — which matters, because killing the one winding up for
    // the big hit is exactly the decision three enemies exist to offer.
    const foes = state.foes.map((foe, i) => {
        if (foe.hp <= 0) return foe;
        let f = { ...foe, block: 0 };
        const intent = foeIntent(state, i);
        if (intent.block) {
            f = { ...f, block: f.block + intent.block };
            events.push({ type: "block", on: f.id, amount: intent.block });
        }
        if (intent.damage) {
            const dealt = attackDamage(intent.damage, f, hero);
            hero = land(hero, dealt);
            events.push({ type: "damage", on: "hero", amount: dealt });
        }
        return tick({ ...f, beat: (f.beat || 0) + 1 });
    });

    const spent = {
        ...state,
        hero, foes,
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
