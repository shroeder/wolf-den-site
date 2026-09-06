// ── THE ROOMS THAT ARE NOT FIGHTS ────────────────────────────────────────────────────────────────────────
// A fifth of their map is a question mark, and the reason that works — the reason it is the room a player
// most wants to walk into — is that behind most of them is an EVENT: a short piece of writing and two or
// three choices, most of which pay. Ours resolved a question mark into a chest, a fire, a shop or a fight,
// which meant the mark was decoration: the map already had all four of those rooms with honest labels on
// them.
//
// It is not only atmosphere. A simulator over four hundred full runs put the hole in numbers: with the
// monsters set to theirs exactly, elites were ending a third of the runs that met one and bosses four
// fifths, because a hero arrived at the wall with no reserve. Their events ARE that reserve — the healing,
// the odd trinket, the max health, the money — and they are where a run gets the thing that makes it
// different from the last one. This is the missing half of the act.
//
// PURE, like the rules and the map: an event is data plus a seed. The server owns what a choice DOES (it
// needs the perk table and the deck), the screen owns how it reads, and this file owns what exists.
import {
    PERKS, PERK_IDS, POTIONS, POTION_IDS, beltSize, canUpgrade, cardById, nextRand, upgradedId,
} from "@/lib/marketplace/cards-kit.js";

// ── WHAT A CHOICE CAN DO ─────────────────────────────────────────────────────────────────────────────────
// The vocabulary is deliberately small and every word of it is one of theirs:
//   hp / hpPct   heal or hurt, flat or as a share of the bar (their events use both)
//   maxHp        the bar itself — the strongest thing an act-one event can hand over
//   embers       money
//   potion       a bottle, rolled from the same list a chest rolls from
//   perk         a trinket, rolled from the ones you are not already carrying
//   maybePerk    a trinket at odds — the escalating rooms, where the third reach is nearly certain
//   card         a card INTO the deck, named. This is how a curse arrives.
//   upgrade      n cards sharpened, taken at random from what can still take it
//   remove       the screen asks which card, and it leaves the deck for good
//   fight        the room becomes that fight, and pays for it
//   wake         the odds this choice ends in the fight the room has been threatening
// A choice may carry several at once, which is what makes the good ones a trade rather than a gift.

export const EVENTS = [
    // ── THE BIG FISH ─────────────────────────────────────────────────────────────────────────────────────
    // Theirs: a banana that heals, a donut that raises the bar, and a box that pays a relic and a curse. The
    // shape is three gifts of ascending greed, and it is the first event most people ever meet.
    {
        id: "tidepool", act: 1, name: "The Tide Pool", icon: "fish",
        say: "Something has been living in this water a long time. It has eaten everything else that tried.",
        choices: [
            { label: "Eat your fill", detail: "Heal a quarter of your health.", effect: { hpPct: 0.25 } },
            { label: "Swallow the pearl", detail: "+7 max health.", effect: { maxHp: 7 } },
            { label: "Take the shell it guards", detail: "A trinket, and a Wound in your deck.", effect: { perk: 1, card: "wound" } },
        ],
    },

    // ── THE CLERIC ───────────────────────────────────────────────────────────────────────────────────────
    // Heal, or purify, or leave — and both cost money, which is what makes the merchant two rooms later a
    // different decision. Ours is the woman who sets the bones of everything that comes back up the road.
    {
        id: "bonesetter", act: 0, name: "The Bonesetter", icon: "splint",
        say: "She has a needle, a jar of something grey, and no opinion about how you got like this.",
        choices: [
            { label: "Be patched up", detail: "Pay 45 embers. Heal a third.", cost: 45, effect: { hpPct: 0.34 } },
            { label: "Have a card cut out", detail: "Pay 75 embers. Burn a card.", cost: 75, effect: { remove: 1 } },
            { label: "Say you are fine", detail: "Walk on.", effect: {} },
        ],
    },

    // ── DEAD ADVENTURER ──────────────────────────────────────────────────────────────────────────────────
    // Their best-shaped event: search a body, and every search is worth more than the last and likelier to
    // wake the thing that killed him. Ours escalates the same way and the last one always wakes it.
    {
        id: "fallen", act: 1, name: "The Fallen Runner", icon: "corpse",
        say: "He got further than most. Whatever stopped him is still close enough to smell.",
        choices: [
            { label: "Search his pack", detail: "60 embers. Something is listening.", effect: { embers: 60, wake: 0.25 } },
            { label: "Search his belt", detail: "A potion. Something is closer.", effect: { potion: 1, wake: 0.55 } },
            { label: "Take his charm", detail: "A trinket. It has found you.", effect: { perk: 1, wake: 1 } },
            { label: "Leave him be", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE GILDED IDOL ──────────────────────────────────────────────────────────────────────────────────
    // Take the shiny thing and the floor gives way. The trade every player makes once and remembers.
    {
        id: "gildedegg", act: 0, name: "The Gilded Egg", icon: "egg",
        say: "It is far too heavy to be an egg, and it is sitting on a plate that is very slightly raised.",
        choices: [
            { label: "Take it", detail: "A trinket and 120 embers. Something gives way under you.", effect: { perk: 1, embers: 120, hpPct: -0.16 } },
            { label: "Leave it where it sits", detail: "Walk on.", effect: {} },
        ],
    },

    // ── WORLD OF GOO ─────────────────────────────────────────────────────────────────────────────────────
    // Money for health, flat and honest. The one event whose whole job is to be a price.
    {
        id: "mire", act: 0, name: "The Mire", icon: "goo",
        say: "There are coins in it. There are also several things that used to be reaching for the coins.",
        choices: [
            { label: "Reach in", detail: "Lose 11 health. Take 95 embers.", effect: { hp: -11, embers: 95 } },
            { label: "Keep your arm", detail: "Walk on.", effect: {} },
        ],
    },

    // ── SHINING LIGHT ────────────────────────────────────────────────────────────────────────────────────
    // Two cards sharpened for a fifth of the bar: the event that turns a bad run into a good deck, and the
    // reason a player took a fire as a smith three rooms back.
    {
        id: "coalpit", act: 0, name: "The Coal Pit", icon: "anvil",
        say: "The heat comes up through the floor. Hold something in it long enough and it comes out better.",
        choices: [
            { label: "Hold two cards in it", detail: "Sharpen 2 cards. Lose a fifth of your health.", effect: { upgrade: 2, hpPct: -0.2 } },
            { label: "Step around it", detail: "Walk on.", effect: {} },
        ],
    },

    // ── BONFIRE SPIRITS ──────────────────────────────────────────────────────────────────────────────────
    // A card for a trinket. Removal is the strongest purchase in their game, and this is the free one.
    {
        id: "offering", act: 0, name: "The Offering", icon: "flame",
        say: "The fire has been kept up by people who wanted something. It is still hungry.",
        choices: [
            { label: "Feed it a card", detail: "Burn a card. Take a trinket.", effect: { remove: 1, perk: 1 } },
            { label: "Warm your hands and go", detail: "Heal 12.", effect: { hp: 12 } },
        ],
    },

    // ── THE SERPENT ──────────────────────────────────────────────────────────────────────────────────────
    // A large amount of money for a card you did not want: the purest curse-for-gold in their game.
    {
        id: "serpent", act: 0, name: "The Long Serpent", icon: "snake",
        say: "It speaks well, for something with no lips. It is offering you a gift, it says, and it is not lying.",
        choices: [
            { label: "Take the purse", detail: "180 embers, and a Wound in your deck.", effect: { embers: 180, card: "wound" } },
            { label: "Refuse politely", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE MUSHROOM RING ────────────────────────────────────────────────────────────────────────────────
    // Fight them for a trinket, or eat one and take the curse. A real fight behind one door is what stops a
    // question mark from being a free room.
    {
        id: "ringcaps", act: 1, name: "The Mushroom Ring", icon: "mushroom",
        say: "They are arranged in a circle, and they are all facing you, which mushrooms should not be able to do.",
        choices: [
            { label: "Stamp them out", detail: "A fight. A trinket if you win.", effect: { fight: "two_fungi", perk: 1 } },
            { label: "Eat one", detail: "Heal a quarter. Something disagrees with you.", effect: { hpPct: 0.25, card: "slimed" } },
        ],
    },

    // ── THE UPGRADE SHRINE ───────────────────────────────────────────────────────────────────────────────
    // Theirs, straight: one card, free, no cost and no catch. Not every room should be a trade.
    {
        id: "shrine", act: 0, name: "The Whetstone Shrine", icon: "shrine",
        say: "A flat stone, worn into a curve by everything that has ever been drawn across it.",
        choices: [
            { label: "Sharpen a card", detail: "Upgrade one card.", effect: { upgrade: 1 } },
            { label: "Leave the shrine alone", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE SCRAP OOZE ───────────────────────────────────────────────────────────────────────────────────
    // Reach into the thing, hurting yourself, until it pays. Theirs gets likelier every time you try, which
    // is the whole hook: the third reach is the one you make against your own judgement.
    {
        id: "ooze", act: 0, name: "The Scrap Ooze", icon: "ooze",
        say: "There is metal in it. Some of the metal is moving on its own.",
        choices: [
            { label: "Reach in", detail: "Lose 4 health. It might hold a trinket.", effect: { hp: -4, maybePerk: 0.3 } },
            { label: "Reach in again", detail: "Lose 4 health. Likelier now.", effect: { hp: -4, maybePerk: 0.55 } },
            { label: "Once more", detail: "Lose 4 health. It is nearly certain.", effect: { hp: -4, maybePerk: 0.85 } },
            { label: "Wipe your hand and go", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE LIVING WALL ──────────────────────────────────────────────────────────────────────────────────
    // Sharpen, burn, or add. Three ways to change a deck in one room, which is the room a player with a bad
    // opening hand has been waiting for.
    {
        id: "oldwall", act: 0, name: "The Old Wall", icon: "wall",
        say: "There are names cut into it, layers deep. Some of them are still being cut.",
        choices: [
            { label: "Cut a name deeper", detail: "Upgrade a card.", effect: { upgrade: 1 } },
            { label: "Scratch one out", detail: "Burn a card.", effect: { remove: 1 } },
            { label: "Add your own", detail: "+9 max health.", effect: { maxHp: 9 } },
        ],
    },

    // ── THE DROWNED SHRINE ── act two ────────────────────────────────────────────────────────────────────
    {
        id: "drowned_shrine", act: 2, name: "The Drowned Shrine", icon: "shrine",
        say: "It has been underwater a long time and it is still lit, which is the part worth worrying about.",
        choices: [
            { label: "Give it your blood", detail: "Lose a fifth of your health. Take a trinket.", effect: { hpPct: -0.2, perk: 1 } },
            { label: "Give it a card", detail: "Burn a card. Heal a third.", effect: { remove: 1, hpPct: 0.34 } },
            { label: "Give it nothing", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE WATCHER ── act three ─────────────────────────────────────────────────────────────────────────
    {
        id: "spire_watcher", act: 3, name: "The Watcher", icon: "eye",
        say: "It has been counting the things that come up the stair. It knows exactly how far you have got.",
        choices: [
            { label: "Let it look at you", detail: "Sharpen 2 cards. Lose a fifth of your health.", effect: { upgrade: 2, hpPct: -0.2 } },
            { label: "Bargain", detail: "220 embers, and a Wound in your deck.", effect: { embers: 220, card: "wound" } },
            { label: "Climb past", detail: "Walk on.", effect: {} },
        ],
    },
];

export const eventById = (id) => EVENTS.find((e) => e.id === id) || null;

/**
 * Which event is behind this question mark.
 *
 * Seeded off the run and the room like every other roll here, so a reload stands you in the same room.
 * `seen` is the run's own memory: an act that shows you The Mire twice has told you it is a list rather than
 * a place, and theirs never does.
 */
export function pickEvent(seed, act = 1, seen = []) {
    const a = Math.max(1, Math.floor(Number(act) || 1));
    const all = EVENTS.filter((e) => !e.act || e.act === a);
    const fresh = all.filter((e) => !seen.includes(e.id));
    const list = fresh.length ? fresh : all;
    const [r] = nextRand(seed >>> 0);
    return list[Math.floor(r * list.length)] || list[0];
}


/**
 * ── WHAT A CHOICE IN A QUESTION-MARK ROOM ACTUALLY DOES ──────────────────────────────────────────────────
 * The event table is pure data and lives in cards-events.js; this is the half that needs the perk catalogue,
 * the potion list and the deck, so it lives here with the rest of the server's rules.
 *
 * TWO PASSES, because two of their effects ask you something. Burning a card and sharpening ONE card both
 * need to know which — so the first call stamps `pending` on the room and returns, the screen shows the deck,
 * and the second call arrives carrying the card. Everything else resolves in one pass. Sharpening TWO is
 * random rather than chosen, which is theirs exactly: Shining Light takes what it takes.
 *
 * Returns a list of plain sentences describing what happened, which is what the screen prints. The room says
 * what it did — a room that pays silently is the chest bug all over again.
 */
export function applyEventChoice(run, ev, index, card = null) {
    const choice = ev?.choices?.[index];
    if (!choice) return { error: "no_such_choice" };
    const eff = choice.effect || {};
    const said = [];

    if (choice.cost && (run.embers || 0) < choice.cost) return { error: "too_poor" };

    // ── THE TWO THAT ASK ─────────────────────────────────────────────────────────────────────────────
    const needs = eff.remove ? "remove" : eff.upgrade === 1 ? "upgrade" : null;
    if (needs && !card) {
        run.at = { ...run.at, pending: { choice: index, need: needs } };
        return { pending: needs };
    }
    if (needs && card) {
        const at = (run.deck || []).indexOf(card);
        if (at < 0) return { error: "no_such_card" };
        if (needs === "remove") {
            if ((run.deck || []).length <= 4) return { error: "deck_too_small" };
            run.deck = run.deck.filter((_, i) => i !== at);
            said.push(`${cardById(card)?.name || "The card"} is gone for good.`);
        } else {
            if (!canUpgrade(card)) return { error: "cannot_upgrade" };
            run.deck = run.deck.map((id, i) => (i === at ? upgradedId(id) : id));
            said.push(`${cardById(card)?.name || "The card"} comes out sharper.`);
        }
    }

    if (choice.cost) { run.embers = (run.embers || 0) - choice.cost; said.push(`${choice.cost} embers.`); }

    // Everything from here is rolled off the run and the room, like every other grant in this file.
    let roll = ((run.seed >>> 0) + (run.at?.row || 0) * 3187 + index * 613) >>> 0;
    const next = () => { const [r, n] = nextRand(roll); roll = n; return r; };

    if (eff.maxHp) {
        run.hpMax += eff.maxHp; run.hp += eff.maxHp;
        said.push(`+${eff.maxHp} max health.`);
    }
    if (eff.hpPct || eff.hp) {
        const by = (eff.hp || 0) + Math.round((eff.hpPct || 0) * run.hpMax);
        const before = run.hp;
        run.hp = Math.max(1, Math.min(run.hpMax, run.hp + by));
        const moved = run.hp - before;
        if (moved > 0) said.push(`Healed ${moved}.`);
        if (moved < 0) said.push(`Lost ${-moved} health.`);
    }
    if (eff.embers) { run.embers = (run.embers || 0) + eff.embers; said.push(`+${eff.embers} embers.`); }
    if (eff.potion) {
        if ((run.potions || []).length < beltSize(run.perks)) {
            const got = POTION_IDS[Math.floor(next() * POTION_IDS.length)];
            run.potions = [...(run.potions || []), got];
            said.push(`A bottle: ${POTIONS[got]?.name || got}.`);
        } else said.push("A bottle, and nowhere on the belt to put it.");
    }
    // A trinket, certain or at odds. Both walk the same path so an ooze that pays and an egg that pays read
    // the same on the way out.
    const wantsPerk = eff.perk || (eff.maybePerk && next() < eff.maybePerk);
    if (wantsPerk) {
        const held = new Set(run.perks || []);
        const open = PERK_IDS.filter((id) => !held.has(id));
        if (open.length) {
            const got = open[Math.floor(next() * open.length)];
            // The perk catalogue's own bookkeeping, inline: a trinket that raises the bar heals you for it.
            run.perks = [...(run.perks || []), got];
            if (PERKS[got]?.maxHp) { run.hpMax += PERKS[got].maxHp; run.hp += PERKS[got].maxHp; }
            if (PERKS[got]?.embers) run.embers = (run.embers || 0) + PERKS[got].embers;
            said.push(`${PERKS[got]?.name || "A trinket"}.`);
        } else { run.embers = (run.embers || 0) + 60; said.push("Nothing you do not already carry. 60 embers instead."); }
    } else if (eff.maybePerk) said.push("Nothing but scrap.");

    if (eff.upgrade > 1) {
        // Random, theirs: it takes what it takes.
        const open = (run.deck || []).map((id, i) => ({ id, i })).filter((c) => canUpgrade(c.id));
        const took = [];
        for (let n = 0; n < eff.upgrade && open.length; n += 1) {
            const at = Math.floor(next() * open.length);
            const [c] = open.splice(at, 1);
            run.deck = run.deck.map((id, i) => (i === c.i ? upgradedId(id) : id));
            took.push(cardById(c.id)?.name || c.id);
        }
        said.push(took.length ? `${took.join(" and ")} came out sharper.` : "Nothing here can take an edge.");
    }
    if (eff.card) {
        run.deck = [...(run.deck || []), eff.card];
        said.push(`${cardById(eff.card)?.name || "Something"} is in your deck now.`);
    }

    // ── AND THE ROOMS THAT TURN INTO A FIGHT ─────────────────────────────────────────────────────────
    // Either the choice IS a fight (the mushrooms) or it woke the thing the room was threatening (the
    // runner). Both hand the room over to the fight screen by rewriting what kind of room this is, which is
    // the one thing the page routes on — and the trinket the choice promised is paid on the way in, because
    // an event fight is not an elite and has no reward screen of its own.
    const woke = eff.wake && next() < eff.wake;
    const encId = eff.fight || (woke ? "jaw" : null);
    if (encId) {
        run.at = { ...run.at, kind: "fight", enc: encId, pending: null, fromEvent: ev.id };
        said.push(woke ? "Something comes up the passage behind you." : "They come apart when you step on them, and then they come at you.");
        return { said, fight: true };
    }

    run.at = { ...run.at, pending: null, said, spent: true };
    return { said };
}
