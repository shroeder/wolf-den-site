import "server-only";

import { db } from "@/lib/db";
import { buildMap, reachable, resolveUnknown } from "@/lib/marketplace/cards-map.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { ladderFoe, LADDER_SIZE } from "@/lib/marketplace/arena-ladder.js";
import {
    ALL_CARDS, BASIC_UNLOCKS, CARDS, FOE_SCRIPTS, POOL, RUN_LENGTH, STARTER_DECK, nextRand, stopAt,
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
export async function getCardFightFixture(buyerId, seed, count = 3) {
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
    // The one in the middle is the big one, so a party reads as having a shape rather than a row of equals.
    const SHAPES = [
        { script: "jackal", hp: 34 },
        { script: "bruiser", hp: 68 },
        { script: null, hp: 48 },
    ];

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
        foes: picked.map((f, i) => ({
            name: f.name, art: f.sprite, artFallback: f.spriteFallback,
            color: f.color, houseName: f.houseName, rung: f.rung,
            hp: SHAPES[i % SHAPES.length].hp,
            script: FOE_SCRIPTS[SHAPES[i % SHAPES.length].script] || null,
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
export async function cardOffers(buyerId, run) {
    const owned = await db
        .query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId])
        .catch(() => []);
    const have = new Set((owned || []).map((r) => r.ref));
    const maxTier = stopAt(run.at?.row ? run.at.row + 1 : run.stop, run.at?.kind).offer;
    const eligible = Object.values(POOL)
        .filter((c) => c.tier <= maxTier)
        .filter((c) => have.has(c.pet) || BASIC_UNLOCKS.includes(c.id));

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
    const fixture = await getCardFightFixture(buyerId, (run.seed >>> 0) + (room.row * 31 + room.lane) * 104729, stop.foes);
    return {
        ...fixture,
        stop: { ...stop, of: RUN_LENGTH, row: room.row, kind: room.kind },
        // The ladder scales what each fighter carries rather than authoring eight sets of enemies: the same
        // hundred fighters off the Road, standing in a harder line the further in you are.
        foes: fixture.foes.map((f) => ({ ...f, hp: Math.max(12, Math.round(f.hp * stop.hp)) })),
        hero: { ...fixture.hero, hp: run.hp, hpMax: run.hpMax },
        deck: run.deck,
    };
}
