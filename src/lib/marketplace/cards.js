import "server-only";

import { db } from "@/lib/db";
import { buildMap, reachable, resolveUnknown } from "@/lib/marketplace/cards-map.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { ladderFoe, LADDER_SIZE } from "@/lib/marketplace/arena-ladder.js";
import {
    ALL_CARDS, BASIC_UNLOCKS, CARDS, FOE_SCRIPTS, PERKS, PERK_IDS, POOL, POTION_IDS, POTION_SLOTS,
    RUN_LENGTH, SHOP, STARTER_DECK, STARTER_PERK, buildParty, buildShop, encounterById, nextRand, pickEncounter, stopAt,
} from "@/lib/marketplace/cards-kit.js";

import { collectibleById } from "@/lib/marketplace/collectibles.js";

// ── THE CARD GAME'S DOOR, AND THE ONE THING THE SERVER DOES FOR IT ───────────────────────────────────────────
// The rules live in cards-kit.js and run in the browser (see the note at the top of that file: the fight pays
// nothing, so there is nothing here worth cheating for). This module is the other half — the gate, and the
// small pile of ART the fight needs, which is the only part that requires a database.
//
// THE GATE IS ONE FUNCTION AND EVERY PATH GOES THROUGH IT, the same contract mining shipped under. Today it is
// isOwner — the hardcoded single-account key for unreleased features, deliberately NOT hasOwnerStanding, which
// answers "does this person run the shop" and would let three people into a prototype. On launch day this
// becomes `Boolean(buyerId)` and that is the whole flip.
export const CARDS_UNLOCKED = (buyerId) => isOwner(buyerId);

// ── EVERY FACE IN THIS FIGHT IS ART WE ALREADY PAID FOR ──────────────────────────────────────────────────
// The cards are pets: 118 of them are drawn and sitting in mkt_pet_sprite. The foe is one of the hundred named
// fighters on the Long Road, who all have full-body combat sprites. The hero is the member's own avatar. The
// art bill for this feature is zero, which is the entire reason the cards are pets and the foes are foes.
//
// PICKED FROM THE SEED, not from Math.random, so a seed names the same fighter every time — otherwise "play
// seed 4471 and tell me what you think" means two different fights and the whole point of a seed is gone.
// `encounter` is an authored group from ENCOUNTERS — how many stand there, how much health each has, and
// which script it plays. It decides the SHAPE of the fight; the Road still supplies the faces.
export async function getCardFightFixture(buyerId, seed, encounter = null) {
    // The creatures and the health they rolled for THIS fight. buildParty owns both, because the encounter
    // only names which monsters turn up — see the note on FOES.
    const group = buildParty(encounter, seed);
    const count = group.length;
    // ── A PARTY, PICKED FROM THE SEED ────────────────────────────────────────────────────────────────
    // Three fighters off the Road rather than one, because "which of them do I hit" is the question a hand of
    // cards exists to answer and one enemy cannot ask it. Drawn from the same seed, so a seed still names the
    // same fight, and de-duplicated — meeting the same man three times reads as a bug rather than a party.
    let roll = seed >>> 0;
    const picked = [];
    for (let n = 0; n < 40 && picked.length < count; n += 1) {
        const [r, next] = nextRand(roll);
        roll = next;
        const rung = 1 + Math.floor(r * LADDER_SIZE);
        if (!picked.some((f) => f.rung === rung)) picked.push(ladderFoe(rung));
    }


        // ALL_CARDS, not CARDS: the reward screen shows cards from the whole pet pool, and a card whose portrait
    // was never fetched renders as an empty frame at the exact moment somebody is choosing between three.
    const petIds = [...new Set(Object.values(ALL_CARDS).map((c) => c.pet))];
    const [me, sprites] = await Promise.all([
        db.queryOne(
            `SELECT COALESCE(NULLIF(display_name, ''), alias) AS name, avatar_sprite_url, avatar_sprite_flip
               FROM mkt_buyer WHERE id = $1`,
            [buyerId]
        ).catch(() => null),
        db.query(`SELECT pet_id, url, flip FROM mkt_pet_sprite WHERE pet_id = ANY($1) AND url IS NOT NULL`, [petIds])
            .catch(() => []),
    ]);

    return {
        seed: seed >>> 0,
        hero: {
            name: me?.name || "You",
            art: me?.avatar_sprite_url || null,
            // The hero stands on the LEFT and must face right, into the fight. A sprite flagged flip is one the
            // facing sweep found drawn the wrong way round, so it is mirrored back.
            flip: me?.avatar_sprite_flip === true,
        },
        // ── AND THE FOE IS MIRRORED, ALWAYS ──────────────────────────────────────────────────────────────
        // Every fighter on the Road is drawn facing RIGHT, because the arena stands them on the left. This
        // screen stands them on the right, so every one of them needs turning around or the fight is two
        // people looking the same way.
        // ── THE GROUP DECIDES THE FIGHT, THE ROAD DECIDES THE FACES ──────────────────────────────────
        // Health and behaviour come from the encounter; the name, the sprite and the house come from one of
        // the hundred fighters on the Long Road, picked off the same seed. So "Maulers" is always two of the
        // same thing to play against and never the same two people twice, which is the cheapest possible
        // version of enemy variety — the art bill stays zero and the fights stop being interchangeable.
        encounter: encounter ? { id: encounter.id, name: encounter.name, pool: encounter.pool } : null,
        foes: picked.map((f, i) => ({
            name: f.name, art: f.sprite, artFallback: f.spriteFallback,
            color: f.color, houseName: f.houseName, rung: f.rung,
            // hpMax is NOT set here: openFight derives it from `hp` (`hpMax: f.hp || FOE_HP`), and a second
            // copy of the same fact is the thing that goes stale. The Leech's heal caps against it.
            hp: group[i].hp,
            // What KIND of thing this is, beside whose face it is wearing. The Road fighter supplies the
            // portrait and the name; the creature supplies the health, the moveset and — once the screen
            // shows it — the thing a player can actually learn.
            foe: group[i].foe,
            foeName: group[i].name,
            script: FOE_SCRIPTS[group[i].script] || null,
        })),
        // pet_id -> { url, flip, rarity }. A card face is a portrait rather than a combatant, so `flip` is
        // carried but the card does not act on it — a pet looking left on its own card is not wrong, it is a
        // photograph.
        //
        // RARITY COMES ALONG FOR FREE, and it is the whole reason the banner can be coloured. Spire's card
        // banners are grey / blue / gold for common / uncommon / rare, and every pet in the Den already
        // carries a rarity on its collectible — so a Legendary pet's card can look legendary without anybody
        // authoring a second table. Read here rather than in the browser so the client never has to pull the
        // 118-entry catalogue in to colour three cards.
        // AND ITS COLOUR, which paints the card's frame. Spire spends that channel on the CLASS — red
        // Ironclad, green Silent — and we have no classes, so it was briefly going to carry the card's TYPE
        // instead. Luke's call, looking at it: "I kinda like that it chose the colors of the pet to match."
        // He is right, and the reason is that the frame sits directly around the ART: an orange card around a
        // fox and a green one around a frog read as ONE object, where a red card around that same fox reads as
        // a fox in somebody else's frame. Type has the window's shape and the word on the tab, which is all
        // Spire gives it too.
        petArt: Object.fromEntries((sprites || []).map((r) => {
            const pet = collectibleById(r.pet_id);
            return [r.pet_id, {
                url: r.url, flip: r.flip === true,
                rarity: pet?.rarity || "common",
                color: pet?.color || "#9aa0a6",
            }];
        })),
    };
}

// ── THE RUN ──────────────────────────────────────────────────────────────────────────────────────────────
// Eight fights with the health and the deck carried between them, a card picked after every win, and a boss
// at the end. It still pays NOTHING and is still owner-gated — the engine stays in the browser for exactly as
// long as that is true (see the note at the top of cards-kit.js).
//
// The server owns the run because a phone that locks itself mid-fight should not lose it, not because the
// numbers are worth defending. One row, overwritten.

const newRun = (seed) => ({
    seed: seed >>> 0,
    stop: 1,
    // ── THE OVERWORLD ────────────────────────────────────────────────────────────────────────────────
    // Built once from the run's own seed and carried whole, because a map regenerated on each request is a
    // map that can change under somebody standing on it. `at` is the room being fought/visited right now and
    // null when the player is looking at the map; `trail` is every room already taken, which is the only way
    // the sheet can draw where you have been.
    map: buildMap(seed >>> 0),
    at: null,
    trail: [],
    hp: 70, hpMax: 70,
    embers: 0,             // the run's own money — see SKIP_EMBERS. Dies with the run; never touches gold.
    // ⚠️ YOU START HOLDING ONE. Theirs does — every character opens with a relic and the Ironclad's heals 6
    // after every win. See STARTER_PERK: it is what makes an act survivable without making a fight easy.
    perks: [STARTER_PERK],
    potions: [],           // up to POTION_SLOTS, drunk in a fight (POTIONS)
    shop: null,            // the merchant's shelf while you are stood in one; cleared on the way out
    removals: 0,           // cards paid to be rid of, for the escalating price — see removalCost
    // ⚠️ A TIMESTAMP, NOT A FLAG. This key used to be `started: true` further down the object, and adding a
    // clock under the same name left BOTH — the later one won, the top bar subtracted `true` from Date.now()
    // and the run showed as 29,806,893 hours old. One key, one meaning.
    startedAt: Date.now(),
    deck: [...STARTER_DECK],
    offers: null,          // the three on the table after a win, null the rest of the time
    done: null,            // null | "won" | "dead"
    started: true,
});

export async function loadRun(buyerId, { create = true } = {}) {
    const row = await db.queryOne(`SELECT state FROM mkt_cards_run WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (row?.state && !row.state.done) return row.state;
    if (row?.state?.done && !create) return row.state;
    if (!create) return null;
    // ⚠️ Math.random is fine HERE and nowhere inside the rules. The seed is the one thing a run is allowed to
    // pull out of the air; everything downstream of it is threaded (see nextRand), which is what lets a run be
    // replayed from its seed alone.
    const run = newRun(Math.floor(Math.random() * 900000) + 1000);
    await saveRun(buyerId, run);
    return run;
}

export async function saveRun(buyerId, run) {
    await db.query(
        `INSERT INTO mkt_cards_run (buyer_id, state, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET state = $2, updated_at = NOW()`,
        [buyerId, JSON.stringify(run)]
    ).catch(() => {});
}

/**
 * The three cards on offer after a win.
 *
 * ── WHAT YOU OWN IS WHAT YOU CAN BE OFFERED, WITH A FLOOR ────────────────────────────────────────────────
 * Every card in POOL is a pet, and a pet you do not own cannot appear. That is the point of the design and it
 * is also its one failure mode: a member with five pets would be offered the same card three times, so
 * BASIC_UNLOCKS is added to the eligible set for everybody. The worst collection in the Den still gets a real
 * choice; a full one gets a deep one, which is the reward for having collected.
 *
 * `tier` gates by how far in you are — the back half of the ladder is where the big cards live, so an early
 * stop cannot hand you Crush.
 */
/**
 * Which cards this member can be handed at all, at this depth.
 *
 * Pulled out of cardOffers because the SHOP asks the identical question and a second copy of "what may this
 * person be offered" is the rule going wrong in one place and not the other. Both callers differ only in how many
 * they draw and what they charge.
 */
export async function eligibleCards(buyerId, run) {
    const owned = await db
        .query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId])
        .catch(() => []);
    const have = new Set((owned || []).map((r) => r.ref));
    const maxTier = stopAt(run.at?.row ? run.at.row + 1 : run.stop, run.at?.kind).offer;
    return Object.values(POOL)
        .filter((c) => c.tier <= maxTier)
        .filter((c) => have.has(c.pet) || BASIC_UNLOCKS.includes(c.id));
}

/**
 * The portrait, colour and rarity for a named handful of cards.
 *
 * ── NARROW ON PURPOSE ────────────────────────────────────────────────────────────────────────────────────
 * getCardFightFixture already returns exactly this shape, and calling THAT to paint a shop shelf would drag
 * the member row, the whole party off the Long Road and every pet in ALL_CARDS along behind it — the same
 * "reached for the most convenient existing function" fault that had the nav running 78 round trips to read
 * two fields. One query, for the pets these cards actually name.
 *
 * The shape is deliberately identical to `fixture.petArt` because CardFace reads it: a card in the shop and
 * the same card in the hand must be handed the same object or they are two renderers wearing one name.
 */
export async function petArtFor(cardIds = []) {
    const petIds = [...new Set(cardIds.map((id) => ALL_CARDS[id]?.pet).filter(Boolean))];
    if (!petIds.length) return {};
    const sprites = await db
        .query(`SELECT pet_id, url, flip FROM mkt_pet_sprite WHERE pet_id = ANY($1) AND url IS NOT NULL`, [petIds])
        .catch(() => []);
    return Object.fromEntries((sprites || []).map((r) => {
        const pet = collectibleById(r.pet_id);
        return [r.pet_id, {
            url: r.url, flip: r.flip === true,
            rarity: pet?.rarity || "common",
            color: pet?.color || "#9aa0a6",
        }];
    }));
}

export async function cardOffers(buyerId, run) {
    const eligible = await eligibleCards(buyerId, run);

    // Threaded off the run's own seed and its stop, so the same run re-offers the same three cards if the
    // page is reloaded before a pick is made — reloading is not a reroll.
    let roll = (run.seed >>> 0) + run.stop * 7919;
    const pool = [...eligible];
    const out = [];
    while (out.length < 3 && pool.length) {
        const [r, next] = nextRand(roll);
        roll = next;
        out.push(pool.splice(Math.floor(r * pool.length), 1)[0].id);
    }
    return out;
}

/**
 * The fight standing in this room: how many, how big, and which of the Road's fighters they are.
 *
 * The ladder still supplies the CURVE — how hard a fight is this far up — but the map now supplies the
 * position, so `stop` is the row you are standing on rather than a step in a straight line.
 */
export async function runFixture(buyerId, run) {
    // The room being stood in decides the fight: its row sets the curve, its kind sets the shape. A run
    // with no room selected is not in a fight at all — the page shows the map instead.
    const room = run.at || { row: run.stop - 1, kind: "fight" };
    const stop = stopAt(room.row + 1, room.kind);
    // ── THE ROOM PICKS A GROUP, NOT A MULTIPLIER ─────────────────────────────────────────────────────
    // This used to take three fixed shapes and scale their health by the row, which made every fight on the
    // climb the same fight in a bigger coat. The band the row falls in now decides which POOL the party is
    // drawn from — easy, hard, deep, elite or boss — and the group itself carries the health and the script.
    // `run.recent` is the last two encounters, so the room you just cleared is not the room in front of you.
    const seed = (run.seed >>> 0) + (room.row * 31 + (room.lane || 0)) * 104729;
    // ⚠️ THE ROOM'S OWN ID WINS. `enter` picks the group and pushes it onto `run.recent`, so re-rolling here
    // would run the draw against a memory that now CONTAINS this encounter and hand back a different party
    // every time the page rendered. Stored once, read for ever after; the pick below is only for a room that
    // predates this (an in-flight run) or a fight with no room around it.
    const encounter = encounterById(room.enc) || pickEncounter(seed, room.row + 1, room.kind, run.recent || []);
    const fixture = await getCardFightFixture(buyerId, seed, encounter);
    return {
        ...fixture,
        stop: { ...stop, of: RUN_LENGTH, row: room.row, kind: room.kind },
        hero: { ...fixture.hero, hp: run.hp, hpMax: run.hpMax },
        deck: run.deck,
        perks: run.perks || [],
        potions: run.potions || [],
    };
}


// ── WHAT A ROOM HANDS OVER ───────────────────────────────────────────────────────────────────────────────
// Threaded off the run's seed and the room's position rather than Math.random, for the same reason every
// other roll in this game is: a room re-entered after a refresh must not pay twice or pay differently.
export function grantForRoom(run, row, lane, kind) {
    let roll = ((run.seed >>> 0) + row * 6151 + lane * 97) >>> 0;
    const next = () => { const [r, n] = nextRand(roll); roll = n; return r; };

    if (kind === "elite") {
        // Elites are where perks come from, which is what makes taking one worth the health it costs.
        const held = new Set(run.perks || []);
        const open = PERK_IDS.filter((id) => !held.has(id));
        if (open.length) return { perk: open[Math.floor(next() * open.length)] };
        return { embers: 60 };
    }
    if (kind === "treasure") {
        // A chest is embers and, half the time, a potion — a potion being the thing you can carry OUT of the
        // room, which is what a chest should feel like.
        const out = { embers: 40 };
        if (next() < 0.55 && (run.potions || []).length < POTION_SLOTS) {
            out.potion = POTION_IDS[Math.floor(next() * POTION_IDS.length)];
        }
        return out;
    }
    return {};
}


/**
 * What is on the merchant's shelf this visit.
 *
 * Drawn from the same eligible pool the reward screen uses, so the shop cannot sell somebody a card the game
 * would never have offered them. Priced and discounted in cards-kit; the only thing that needs the database
 * is which pets they own.
 */
export async function shopStock(buyerId, run, seed) {
    const eligible = await eligibleCards(buyerId, run);
    let roll = (seed >>> 0) + 104729;
    const pool = [...eligible];
    const cardIds = [];
    while (cardIds.length < SHOP.cards && pool.length) {
        const [r, next] = nextRand(roll);
        roll = next;
        cardIds.push(pool.splice(Math.floor(r * pool.length), 1)[0].id);
    }
    // Nothing already carried: a shop offering a perk you hold or a potion slot you cannot fill is a slot
    // that wastes the visit.
    const held = new Set(run.perks || []);
    return buildShop(seed, { cardIds, perkIds: PERK_IDS.filter((id) => !held.has(id)) });
}

/**
 * Take a perk into the run, health bump and all.
 *
 * ⚠️ THIS EXISTED TWICE THE MOMENT THE SHOP SOLD ONE. The elite payout in the run route already did the
 * three lines — push it, raise hpMax, raise hp by the same — and a second copy in the buy handler is the
 * Ember Heart quietly paying its +8 in one place and not the other. Mutates `run` because that is what every
 * handler in the route does with it.
 */
export function takePerk(run, perkId) {
    if (!perkId || (run.perks || []).includes(perkId)) return false;
    run.perks = [...(run.perks || []), perkId];
    const bump = PERKS[perkId]?.maxHp || 0;
    if (bump) { run.hpMax += bump; run.hp += bump; }
    return true;
}
