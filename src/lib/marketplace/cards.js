import "server-only";

export { grantForRoom, takePerk } from "@/lib/marketplace/cards-kit.js";
import { db } from "@/lib/db";
import { buildFinalMap, buildMap, reachable, resolveUnknown } from "@/lib/marketplace/cards-map.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { ladderFoe, LADDER_SIZE } from "@/lib/marketplace/arena-ladder.js";
import {
    ACTS, ALL_CARDS, BASIC_UNLOCKS, BOSS_PERKS, BOSS_PERK_IDS, CARDS, FOE_SCRIPTS, PERKS, PERK_IDS, POOL,
    HERO_HP, POTIONS, POTION_IDS, RUN_LENGTH, SHOP, STARTER_DECK, STARTER_PERK, UNLOCKS, buildParty,
    ASC_MAX, FINAL_ACT, ascMaxHp, ascPotionScale, ascRule, ascStartEmbers, beltSize, buildShop, canUpgrade,
    cardById, drawOffer, encounterById, levelSharpens,
    levelWeight, nextRand, perkSum, pickEncounter, runScore, stopAt, unlockedCards,
    upgradedId,
} from "@/lib/marketplace/cards-kit.js";

import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";

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
export async function getCardFightFixture(buyerId, seed, encounter = null, { asc = 0, kind = "fight" } = {}) {
    // The creatures and the health they rolled for THIS fight. buildParty owns both, because the encounter
    // only names which monsters turn up — see the note on FOES.
    const group = buildParty(encounter, seed, { asc, kind });
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
    // ⚠️ THE FIGHT ASKS THE SAME QUESTION THE SHOP DOES, so it asks it in the same place. This used to read
    // mkt_pet_sprite here and petArtFor read it there, and the day the cards started showing a pet at the
    // level you have it at, one of the two would have kept drawing level-1 portraits — the hand and the
    // shelf disagreeing about the same animal. One resolver, two callers (petArtMap).
    const [me, petArt] = await Promise.all([
        db.queryOne(
            `SELECT COALESCE(NULLIF(display_name, ''), alias) AS name, avatar_sprite_url, avatar_sprite_flip
               FROM mkt_buyer WHERE id = $1`,
            [buyerId]
        ).catch(() => null),
        petArtMap(buyerId, petIds),
    ]);

    return {
        seed: seed >>> 0,
        // The rung the room is being met on, carried to the screen so the fight it builds is the fight the
        // server priced — see startFight's `asc`/`kind`.
        asc, kind,
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
            // How much it curls for when first hit — a Louse's whole identity, and the one creature field
            // that has to survive the trip from the rules to the fight (see `land` in cards-kit).
            curl: group[i].curl || 0,
            pulse: group[i].pulse || 0,
            invincible: group[i].invincible || 0,
            plate: group[i].plate || 0,
            thorns: group[i].thorns || 0,
            onDeath: group[i].onDeath || null,
            split: group[i].split || null,
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
        petArt,
    };
}

// ── THE RUN ──────────────────────────────────────────────────────────────────────────────────────────────
// Eight fights with the health and the deck carried between them, a card picked after every win, and a boss
// at the end. It still pays NOTHING and is still owner-gated — the engine stays in the browser for exactly as
// long as that is true (see the note at the top of cards-kit.js).
//
// The server owns the run because a phone that locks itself mid-fight should not lose it, not because the
// numbers are worth defending. One row, overwritten.

const newRun = (seed, asc = 0) => ({
    seed: seed >>> 0,
    stop: 1,
    // ── THE OVERWORLD ────────────────────────────────────────────────────────────────────────────────
    // Built once from the run's own seed and carried whole, because a map regenerated on each request is a
    // map that can change under somebody standing on it. `at` is the room being fought/visited right now and
    // null when the player is looking at the map; `trail` is every room already taken, which is the only way
    // the sheet can draw where you have been.
    map: buildMap(seed >>> 0, { asc }),
    // WHICH ACT THIS IS. A run that has never seen a boss is act 1 and says nothing about acts anywhere;
    // beating one moves this and rebuilds the sheet (nextAct).
    act: 1,
    bossOffers: null,   // the three boss trinkets on the table, between the boss dying and the next act
    at: null,
    trail: [],
    // ⚠️ NOT A NUMBER TYPED HERE. This was `hp: 70, hpMax: 70` — a second copy of the hero's health living
    // one file away from HERO_HP — so the day the bar changed, the rules said 80 and every run actually dealt
    // still opened on 70. A copied constant runs a second, wrong game: the simulator measured one hero and
    // the browser handed out another.
    // ── AND THE RUNG IT WAS DEALT ON ─────────────────────────────────────────────────────────────────
    // Stored on the run, because every rule the ladder applies is read off it for the rest of the climb and
    // a rung the run does not carry is a rung that stops applying the moment anything reloads.
    asc,
    // Rung six starts you already hurt. Theirs does the same and it is nastier than it sounds: the whole
    // act is played on a bar you never had all of.
    // ⚠️ AND RUNG EIGHTEEN TAKES THE TOP OFF THE BAR ITSELF, which is a different rule from rung six: six
    // starts you at 90% of a full bar and a fire can still fill it, eighteen means the bar was never that
    // big. Read through ascMaxHp so the two compose rather than one quietly overwriting the other.
    hp: ascRule(asc, 6) ? Math.round(ascMaxHp(HERO_HP, asc) * 0.9) : ascMaxHp(HERO_HP, asc),
    hpMax: ascMaxHp(HERO_HP, asc),
    // ── AND A PURSE TO START WITH ────────────────────────────────────────────────────────────────────
    // ⚠️ THEIRS HANDS YOU 99 GOLD BEFORE THE FIRST ROOM and ours handed you nothing, which quietly killed
    // every early room that asks for money: photographed on a real run, the Bonesetter offered a heal for 45
    // and a card burned for 75 and BOTH were greyed out, so a written room with three choices in it was a
    // room with one. Their whole opening — a shop on floor 4 you can actually buy from, a Cleric you can pay
    // — depends on the purse existing. Priced at the same 60% our shelf is priced at against theirs.
    embers: ascStartEmbers(60, asc),   // the run's money — see SKIP_EMBERS. Dies with the run; never gold.
    // ⚠️ YOU START HOLDING ONE. Theirs does — every character opens with a relic and the Ironclad's heals 6
    // after every win. See STARTER_PERK: it is what makes an act survivable without making a fight easy.
    perks: [STARTER_PERK],
    potions: [],           // up to POTION_SLOTS, drunk in a fight (POTIONS)
    shop: null,            // the merchant's shelf while you are stood in one; cleared on the way out
    removals: 0,           // cards paid to be rid of, for the escalating price — see removalCost
    // ── THE THREE KEYS ── each one a room walked out of empty-handed. See KEYS; all three open the fourth
    // act when the third boss falls, and none of them does anything else at all.
    keys: {},
    // ⚠️ A TIMESTAMP, NOT A FLAG. This key used to be `started: true` further down the object, and adding a
    // clock under the same name left BOTH — the later one won, the top bar subtracted `true` from Date.now()
    // and the run showed as 29,806,893 hours old. One key, one meaning.
    startedAt: Date.now(),
    // Rung eight puts a Wound in the deck before the first room — their Ascender's Bane, and the reason a
    // ten-card deck is a thing you feel.
    // Rung eight shuffles a Wound in — a card you drew instead of a Bite, gone when the fight ends. Rung
    // twelve is the harder version and the first thing in this game to spend a CURSE: it is written into the
    // deck, it is there for the whole climb, and the merchant is the only way out of it.
    deck: [
        ...STARTER_DECK,
        ...(ascRule(asc, 8) ? ["wound"] : []),
        ...(ascRule(asc, 12) ? ["injury"] : []),
    ],
    offers: null,          // the three on the table after a win, null the rest of the time
    done: null,            // null | "won" | "dead"
    started: true,
});

export async function loadRun(buyerId, { create = true } = {}) {
    const row = await db.queryOne(`SELECT state FROM mkt_cards_run WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    // A STORED RUN COMES BACK WHATEVER STATE IT IS IN. A finished one is not rubbish to be swept up — it is
    // the ending, and the screen that shows it has to be able to load twice. See startRun.
    if (row?.state) return row.state;
    if (!create) return null;
    return startRun(buyerId);
}

/**
 * Deal a new run, on purpose.
 *
 * ⚠️ STARTING A RUN USED TO BE A SIDE EFFECT OF LOADING ONE — loadRun with `create` quietly threw away a
 * finished run and dealt a fresh one, which meant every reader of a run was also a writer. Beating the last
 * boss of the third act and then letting ANYTHING re-render replaced the ending with a new act-one map: the
 * payoff for forty-five rooms was a screen you could lose by pressing F5. Beginning again is a thing the
 * player does — the table's seat, or New run on the result screen — and it says so here.
 */
export async function startRun(buyerId, asc = 0) {
    const run = newRun(Math.floor(Math.random() * 900000) + 1000, Math.max(0, Math.min(ASC_MAX, Number(asc) || 0)));
    await saveRun(buyerId, run);
    // A RUN STARTED IS A RUN COUNTED. It is the one counter nothing else can infer: a member who opens the
    // game, walks two rooms and dies has played, and the ladder in UNLOCKS should be able to say so.
    await bumpCardProgress(buyerId, "runs");
    return run;
}

/**
 * ── WRITING THE RUN DOWN ─────────────────────────────────────────────────────────────────────────────────
 * One row per ENDED run — see migration 433. Written once, when it ends, and never touched again: the live
 * run is rewritten on every tap and is no place to keep a record.
 *
 * ⚠️ ONCE, AND NOT TWICE. A run can reach its ending by more than one path — the last boss falling, the hero
 * dying, the player giving up — and two of those can be posted again by a client that reloads. `recorded` is
 * stamped on the run itself, so the second attempt is a no-op rather than a second row in the history.
 */
export async function recordRun(buyerId, run, outcome) {
    if (!run || run.recorded) return run;
    const ended = { ...run, done: outcome };
    await db.query(
        `INSERT INTO mkt_cards_result
             (buyer_id, outcome, act, stop, score, hp, hp_max, deck_size, seed, deck, perks, asc_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)`,
        [
            buyerId, outcome,
            Math.max(1, Math.min(ACTS, Number(run.act) || 1)),
            Math.max(0, Number(run.stop) || 0),
            runScore(ended),
            Math.max(0, Number(run.hp) || 0), Math.max(1, Number(run.hpMax) || 1),
            (run.deck || []).length, Number(run.seed) || 0,
            JSON.stringify(run.deck || []), JSON.stringify(run.perks || []),
            Math.max(0, Math.min(ASC_MAX, Number(run.asc) || 0)),
        ]
    ).catch(() => {});
    run.recorded = true;
    return run;
}

/**
 * The last few runs and the best one, for the table.
 *
 * ⚠️ ONE ROUND TRIP, NOT TWO. "my recent runs" and "my best run" are one question asked two ways and this
 * screen is opened constantly — see the note in CLAUDE.md on why a second convenient query is how this repo
 * has billed a fortune before. The best row is picked out of the same result set the list came from when it
 * is in there, and only a member with more than `many` runs pays for the second look.
 */
export async function runHistory(buyerId, many = 5) {
    const rows = await db.query(
        `SELECT outcome, act, stop, score, hp, hp_max, deck_size, asc_level, ended_at
           FROM mkt_cards_result WHERE buyer_id = $1 ORDER BY ended_at DESC LIMIT $2`,
        [buyerId, many]
    ).catch(() => []);
    const recent = rows || [];
    const best = await db.queryOne(
        `SELECT outcome, act, stop, score, asc_level FROM mkt_cards_result
          WHERE buyer_id = $1 ORDER BY score DESC LIMIT 1`,
        [buyerId]
    ).catch(() => null);
    // ── HOW HIGH THE LADDER IS OPEN ──────────────────────────────────────────────────────────────────
    // The next rung opens by WINNING on the one below it, which is theirs exactly — you cannot skip up by
    // dying repeatedly at the top. A member who has never won stands on rung zero with one above them.
    const climbed = await db.queryOne(
        `SELECT MAX(asc_level)::int AS top FROM mkt_cards_result WHERE buyer_id = $1 AND outcome = 'won'`,
        [buyerId]
    ).catch(() => null);
    const won = Math.max(-1, Number(climbed?.top ?? -1));
    return { recent, best, runs: recent.length, open: Math.max(0, Math.min(ASC_MAX, won + 1)) };
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
/**
 * Which pets this member owns, as a Set of pet ids.
 *
 * Pulled out of eligibleCards because the COLLECTION screen asks the identical question — "whose cards can
 * this person be handed" — and a second copy of that query is the door and the display disagreeing about what
 * you own the day the rule changes.
 */
export async function ownedPetIds(buyerId) {
    const owned = await db
        .query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId])
        .catch(() => []);
    return new Set((owned || []).map((r) => r.ref));
}

/**
 * The lifetime counters this member has earned, as a plain object with every field present.
 *
 * ⚠️ ZEROES, NOT NULL. Everything downstream compares numbers (meetsNeed), and a missing row is a member who
 * has not played rather than an error — so the absent case is the same shape as the present one and nothing
 * has to guard for it.
 */
const NO_PROGRESS = { rooms: 0, fights: 0, elites: 0, bosses: 0, smiths: 0, burns: 0, buys: 0, best_stop: 0, runs: 0 };
export async function cardProgress(buyerId) {
    const row = await db.queryOne(
        `SELECT rooms, fights, elites, bosses, smiths, burns, buys, best_stop, runs
           FROM mkt_cards_progress WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
    return { ...NO_PROGRESS, ...(row || {}) };
}

/**
 * Count something the player just did, and remember the deepest they have been.
 *
 * ONE STATEMENT, and it is an upsert: the row may not exist, two taps can land together, and neither case is
 * worth a read first. `best_stop` is a GREATEST rather than a set, because walking into stop 3 after a run
 * that reached 14 must not undo the fourteen.
 *
 * ⚠️ FIELD NAMES ARE NOT USER INPUT — they are chosen from this whitelist. Interpolating a column name into
 * SQL is how a counter becomes an injection, and the parameterised driver cannot help with an identifier.
 */
const COUNTERS = new Set(["rooms", "fights", "elites", "bosses", "smiths", "burns", "buys", "runs"]);
export async function bumpCardProgress(buyerId, field, { bestStop = 0 } = {}) {
    if (!COUNTERS.has(field)) return;
    await db.query(
        `INSERT INTO mkt_cards_progress (buyer_id, ${field}, best_stop, updated_at)
         VALUES ($1, 1, $2, NOW())
         ON CONFLICT (buyer_id) DO UPDATE
            SET ${field} = mkt_cards_progress.${field} + 1,
                best_stop = GREATEST(mkt_cards_progress.best_stop, EXCLUDED.best_stop),
                updated_at = NOW()`,
        [buyerId, Math.max(0, Math.floor(Number(bestStop) || 0))]
    ).catch(() => {});
}

/**
 * ── WHAT YOU OWN, AND HOW FAR YOU HAVE TAKEN IT ──────────────────────────────────────────────────────────
 * Luke: "have you decided how we should incorporate pet upgrade levels impact on the cards?" — and the answer
 * this returns the data for is: a level changes how a card ARRIVES, never what it does. See cardOffers.
 *
 * ⚠️ ONE QUERY, NOT THREE. Ownership, experience and the enshrinement stone in a single round trip, because
 * this runs on every won fight and the shop shelf — and reaching for the convenient existing function three
 * times is exactly the pattern that has billed a fortune here before (see the CLAUDE.md note on Active CPU).
 * It replaces ownedPetIds on this path rather than joining it, so the count is unchanged.
 *
 * ⚠️ ::text ON BOTH SIDES OF EVERY JOIN. mkt_pet_level.buyer_id is UUID and mkt_pet_enshrined.buyer_id is
 * TEXT; joining them raw is "operator does not exist: uuid = text", which db.query swallows into an empty
 * array — and an empty array here is not an error anybody sees, it is every pet quietly reading as level 1.
 * That exact trap already cost this feature its whole level-art feature once.
 */
export async function ownedPetLevels(buyerId) {
    const rows = await db.query(
        `SELECT u.ref AS pet_id, COALESCE(l.xp, 0) AS xp, e.stone
           FROM mkt_cosmetic_unlock u
           LEFT JOIN mkt_pet_level l
                  ON l.buyer_id::text = u.buyer_id::text AND l.pet_id = u.ref
           LEFT JOIN mkt_pet_enshrined e
                  ON e.buyer_id::text = u.buyer_id::text AND e.pet_id = u.ref
          WHERE u.buyer_id = $1 AND u.category = 'pet'`,
        [buyerId]
    ).catch(() => []);
    const out = new Map();
    for (const r of rows || []) {
        const rarity = collectibleById(r.pet_id)?.rarity || "common";
        out.set(r.pet_id, {
            level: petLevelForXp(r.xp, rarity),
            enshrined: Boolean(r.stone),
        });
    }
    return out;
}

export async function eligibleCards(buyerId, run) {
    const [levels, progress] = await Promise.all([ownedPetLevels(buyerId), cardProgress(buyerId)]);
    const have = new Set(levels.keys());
    const earned = unlockedCards(progress);
    const maxTier = stopAt(run.at?.row ? run.at.row + 1 : run.stop, run.at?.kind, run.act || 1).offer;
    // A CARD YOU EARNED BY PLAYING IGNORES THE PET GATE. That is the entire point of it — see the note above
    // UNLOCKS — but it still obeys DEPTH, because tier is about what a fight at this stop should be handing
    // you and has nothing to do with how you came by the card.
    const cards = [...Object.values(POOL), ...Object.values(UNLOCKS)]
        .filter((c) => c.tier <= maxTier)
        .filter((c) => earned.has(c.id) || have.has(c.pet) || BASIC_UNLOCKS.includes(c.id));
    // The levels ride back with the cards because the reward screen needs both and the query has already
    // been paid for — see cardOffers.
    return { cards, levels };
}

// ── THE CARD IS YOUR PET, AT THE LEVEL YOU HAVE IT AT ────────────────────────────────────────────────────
// Luke: "design the way cards reflect their pets level."
//
// The cards were always the pets — that is why this feature's art bill is zero — but every card drew the pet's
// LEVEL 1 portrait, the same picture for a bear somebody has fed for six weeks and a bear they were handed
// yesterday. The game already draws each pet five more times as it levels (mkt_pet_sprite_level, and the
// enshrined forms at six), and the farm, the arena and the level-up screen all show them. The deck did not.
//
// So a card carries its pet's level: THE ART IS THE ART YOU EARNED, picked by the same rule every other render
// site uses (pickPetSpriteForLevel — the highest sprite at or below your level, the stone's form if it is
// enshrined), and the face wears a small numeral so the change is legible rather than mysterious.
//
// ⚠️ IT CHANGES NOTHING THE RULES CAN SEE. Deliberately: `damage`, `block` and `cost` come out of cards-kit
// and a level-5 bear hits for exactly what a level-1 bear hits for. A run whose numbers depend on how long you
// have owned a pet is a run nobody can balance and a fight nobody can hand somebody else — and the whole
// argument for the deck being your collection dies the moment the collection is also the power curve. What
// levelling buys you here is the picture, which is what it buys you everywhere else in the Den.
//
// ⚠️ TWO QUERIES, NOT FIVE. The sprites (base + every evolved rung) come back in one UNION, and the member's
// levels come back with their stones joined on, so this costs one extra round trip against what it replaced
// no matter how many cards are on the screen — see the round-trip note in CLAUDE.md.
async function petArtMap(buyerId, petIds) {
    if (!petIds.length) return {};
    const [sprites, mine] = await Promise.all([
        db.query(
            `SELECT pet_id, 1 AS level, NULL::text AS variant, url, flip
               FROM mkt_pet_sprite WHERE pet_id = ANY($1) AND url IS NOT NULL
              UNION ALL
             SELECT pet_id, level, variant, url, flip
               FROM mkt_pet_sprite_level WHERE pet_id = ANY($1) AND url IS NOT NULL`,
            [petIds]
        ).catch(() => []),
        buyerId
            ? db.query(
                // ⚠️ ::text ON BOTH SIDES OF THE JOIN. mkt_pet_level.buyer_id is UUID and
                // mkt_pet_enshrined.buyer_id is TEXT, so joining them raw is "operator does not exist: uuid =
                // text" — which db.query swallows into an empty array, and an empty array here is not an
                // error anybody sees: every card simply goes back to its level-1 portrait. The whole feature
                // fails silently and correctly-looking. (The same trap the marketplace's buyer_id columns
                // have sprung before; the parameter comparisons are fine, it is column-to-column that breaks.)
                `SELECT l.pet_id, l.xp, e.stone
                   FROM mkt_pet_level l
                   LEFT JOIN mkt_pet_enshrined e
                          ON e.buyer_id::text = l.buyer_id::text AND e.pet_id = l.pet_id
                  WHERE l.buyer_id = $1 AND l.pet_id = ANY($2)`,
                [buyerId, petIds]
            ).catch(() => [])
            : [],
    ]);

    const base = {};
    const levels = {};
    for (const r of sprites || []) {
        if (Number(r.level) === 1) { base[r.pet_id] = { url: r.url, flip: r.flip === true }; continue; }
        // The same keying getPetSpriteLevelData uses: a rung is its number, and level six is "6:light" /
        // "6:dark" because which stone was spent is written on the animal for the rest of its life.
        const key = r.variant ? `${r.level}:${r.variant}` : String(r.level);
        (levels[r.pet_id] ||= {})[key] = { url: r.url, flip: r.flip === true };
    }
    const owned = new Map((mine || []).map((r) => [r.pet_id, r]));

    const out = {};
    for (const petId of petIds) {
        const pet = collectibleById(petId);
        const row = owned.get(petId);
        const level = row ? petLevelForXp(row.xp, pet?.rarity) : 1;
        const art = pickPetSpriteForLevel(base[petId], levels[petId], level, row?.stone || null);
        if (!art?.url) continue;
        out[petId] = {
            url: art.url, flip: art.flip === true,
            rarity: pet?.rarity || "common",
            color: pet?.color || "#9aa0a6",
            // What the FACE shows. `level` is the rung the picture is drawn at; `stone` is the enshrined form,
            // which is a sixth level with a name rather than a number. The NAME travels too, because the card
            // knows its pet by id ("Your bear_01 is level 3" is not a sentence to read out to anybody).
            level, stone: row?.stone || null, name: pet?.name || petId,
        };
    }
    return out;
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
export async function petArtFor(buyerId, cardIds = []) {
    // cardById, not ALL_CARDS: an upgraded copy travels as "bite+" and a raw table lookup misses it,
    // which would draw the card with an empty window at the exact moment somebody is choosing it.
    const petIds = [...new Set(cardIds.map((id) => cardById(id)?.pet).filter(Boolean))];
    return petArtMap(buyerId, petIds);
}

export async function cardOffers(buyerId, run) {
    const { cards: eligible, levels } = await eligibleCards(buyerId, run);

    // Threaded off the run's own seed and its stop, so the same run re-offers the same three cards if the
    // page is reloaded before a pick is made — reloading is not a reroll.
    let roll = (run.seed >>> 0) + run.stop * 7919;
    const pool = [...eligible];
    const out = [];
    // ── HOW MANY ARE ON THE TABLE ────────────────────────────────────────────────────────────────────
    // Three, and a Question Card makes it four — theirs, and it is one of the strongest commons in their
    // game precisely because a reward screen is the only place a deck is chosen. Read through perkSum so a
    // second trinket of the same shape needs no code.
    const many = 3 + perkSum(run.perks, "offerPlus");
    // Weighted by tier rather than drawn flat — see tierOdds. The room's own `offer` is the ceiling.
    const maxTier = stopAt(run.at?.row ? run.at.row + 1 : run.stop, run.at?.kind, run.act || 1).offer;
    // ── AND A PET YOU HAVE LEVELLED TURNS UP MORE ────────────────────────────────────────────────────
    // The first of the two things a level buys. A card whose pet is level five is two and a half times as
    // likely to be the one dealt as a level-one; an enshrined one, three. Nothing about the card changes —
    // see the note on levelWeight for why that is the whole design and not a compromise.
    const weigh = (c) => {
        const at = levels.get(c.pet);
        return at ? levelWeight(at.level, at.enshrined) : 1;
    };
    while (out.length < many && pool.length) {
        const [card, next] = drawOffer(pool, maxTier, roll, weigh);
        roll = next;
        if (!card) break;
        pool.splice(pool.indexOf(card), 1);
        out.push(card.id);
    }
    // ── AND WHETHER THEY ARRIVE SHARPENED ────────────────────────────────────────────────────────────
    // Two ways a card can land already upgraded, and they are the same mechanic wearing two hats.
    //
    // A Molten Egg upgrades every ATTACK it is offered — not the skills, not the powers, which is what keeps
    // it from being simply "all your rewards are better" and makes it a relic that shapes what you take.
    //
    // A LEVEL FIVE PET ALWAYS DOES, and a level four half the time — the second thing a level buys. An
    // upgraded card is a quantity the balance already accounts for (it is what a campfire hands out), which
    // is precisely why this is the safe way to let a collection matter: it moves a card up a rung everyone
    // can already reach rather than inventing a number nobody can price.
    const egg = perkSum(run.perks, "eggUpgrades");
    return out.map((id) => {
        const card = cardById(id);
        if (!card || !canUpgrade(id)) return id;
        const at = levels.get(card.pet);
        const [r, next] = nextRand(roll);
        roll = next;
        const sharp = (at && levelSharpens(at.level, at.enshrined, r)) || (egg && card.kind === "attack");
        return sharp ? upgradedId(id) : id;
    });
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
    const stop = stopAt(room.row + 1, room.kind, run.act || 1);
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
    const encounter = encounterById(room.enc) || pickEncounter(seed, room.row + 1, room.kind, run.recent || [], run.act || 1);
    const fixture = await getCardFightFixture(buyerId, seed, encounter, {
        asc: run.asc || 0, kind: room.kind || "fight",
    });
    return {
        ...fixture,
        stop: { ...stop, of: RUN_LENGTH, row: room.row, kind: room.kind },
        // WHICH ROOM THE FIGHT IS IN. The act decides the backdrop as well as the bestiary — see
        // gen-card-scenes.mjs — and the screen has no other way to know which act it is drawing.
        act: run.act || 1,
        hero: { ...fixture.hero, hp: run.hp, hpMax: run.hpMax },
        deck: run.deck,
        perks: run.perks || [],
        potions: run.potions || [],
    };
}


// grantForRoom lives in cards-kit now — see the note over it there. It is re-exported from this module
// because a dozen callers import it from here and the move is not their business.


/**
 * ── A WON FIGHT SOMETIMES HANDS YOU A BOTTLE ─────────────────────────────────────────────────────────────
 * Theirs drops a potion off roughly two combats in five, and it is not a garnish: three slots of them is a
 * second resource bar, and it is the one that carries a player through the room they should not have
 * survived. Ours came only out of chests — about one a run — which a simulator over four hundred runs put a
 * number on: elites ended 52% of the runs that met one and bosses ended 89%, because a hero arrived at the
 * wall with nothing in reserve. The monsters were already theirs, exactly; the reserve was the missing half.
 *
 * SELF-CORRECTING, THEIRS EXACTLY: 40% to start, ten points kinder after every combat that pays nothing and
 * ten points meaner after every one that pays, so a run cannot go dry for long and cannot flood. The luck
 * rides on the run rather than on the seed, because it is a memory of what you have been given, not a
 * property of the room.
 *
 * Seeded off the room like every other grant, so a re-posted win pays the same bottle rather than a new one.
 */
export const POTION_DROP_BASE = 40;

export function potionDrop(run, row, lane) {
    let roll = ((run.seed >>> 0) + row * 7717 + lane * 131) >>> 0;
    const next = () => { const [r, n] = nextRand(roll); roll = n; return r; };
    // A trinket can tilt the whole self-correcting ladder — their White Beast Statue, at the gentler end.
    // Rung fifteen thins the shelf. It scales the LUCK rather than gating the roll, so the self-correcting
    // ladder below still works — a dry spell still climbs back, it just climbs from lower down.
    const luck = ((Number.isFinite(run.potionLuck) ? run.potionLuck : POTION_DROP_BASE)
        + perkSum(run.perks, "potionLuck")) * ascPotionScale(run.asc || 0);
    if (next() * 100 >= luck) {
        run.potionLuck = Math.min(100, luck + 10);
        return null;
    }
    run.potionLuck = Math.max(0, luck - 10);
    return POTION_IDS[Math.floor(next() * POTION_IDS.length)];
}


/**
 * What is on the merchant's shelf this visit.
 *
 * Drawn from the same eligible pool the reward screen uses, so the shop cannot sell somebody a card the game
 * would never have offered them. Priced and discounted in cards-kit; the only thing that needs the database
 * is which pets they own.
 */
export async function shopStock(buyerId, run, seed) {
    const { cards: eligible, levels } = await eligibleCards(buyerId, run);
    let roll = (seed >>> 0) + 104729;
    const pool = [...eligible];
    const cardIds = [];
    // The shelf reads a level the same way the reward screen does — see levelWeight. A member who has
    // levelled a Bear should meet the Bear, wherever cards are handed out.
    const weigh = (c) => { const at = levels.get(c.pet); return at ? levelWeight(at.level, at.enshrined) : 1; };
    while (cardIds.length < SHOP.cards && pool.length) {
        const [card, next] = drawOffer(pool, 3, roll, weigh);
        roll = next;
        if (!card) break;
        pool.splice(pool.indexOf(card), 1);
        cardIds.push(card.id);
    }
    // Nothing already carried: a shop offering a perk you hold or a potion slot you cannot fill is a slot
    // that wastes the visit.
    const held = new Set(run.perks || []);
    return buildShop(seed, { cardIds, perkIds: PERK_IDS.filter((id) => !held.has(id)), asc: run.asc || 0 });
}

/**
 * Take a perk into the run, health bump and all.
 *
 * ⚠️ THIS EXISTED TWICE THE MOMENT THE SHOP SOLD ONE. The elite payout in the run route already did the
 * three lines — push it, raise hpMax, raise hp by the same — and a second copy in the buy handler is the
 * Ember Heart quietly paying its +8 in one place and not the other. Mutates `run` because that is what every
 * handler in the route does with it.
 */
/**
 * Put a trinket on the strip and pay whatever it costs on the way in.
 *
 * ⚠️ TWO CATALOGUES, ONE FUNCTION. The ordinary trinkets come out of PERKS and the boss ones out of
 * BOSS_PERKS, and every reader of a run — the engine's perkSum, the map's strip, the carrying panel — looks
 * a perk up by id without caring which list it came from. A second "take a boss perk" path is how the +20
 * max health from The Old Wolf gets paid twice, or not at all.
 *
 * A BOSS TRINKET CAN COST YOU SOMETHING, which is what makes it a decision rather than a prize: `maxHpDown`
 * is the Coffee Dripper trade — the energy is worth more than the health, but only if you can survive it.
 * `embers` pays out once, here, because a trinket that quietly changes your purse is a trinket nobody sees.
 */
// takePerk lives in cards-kit now — see the note over it there, and the re-export at the top.

/**
 * The three boss trinkets on the table, and the act that follows them.
 *
 * Threaded off the run's own seed and its act, so reloading the choice screen re-offers the same three — the
 * same rule the card rewards and the merchant's shelf already follow. One you already carry cannot be offered
 * again; with five in the catalogue and one taken per boss, act three still has a real choice.
 */
export function bossOffers(run) {
    const held = new Set(run.perks || []);
    const pool = BOSS_PERK_IDS.filter((id) => !held.has(id));
    let roll = (run.seed >>> 0) + (run.act || 1) * 9176;
    const out = [];
    while (out.length < 3 && pool.length) {
        const [r, next] = nextRand(roll);
        roll = next;
        out.push(pool.splice(Math.floor(r * pool.length), 1)[0]);
    }
    return out;
}

/**
 * Walk out of one act and into the next: a new sheet, the same deck, the health you finished on.
 *
 * ⚠️ A NEW MAP MEANS A NEW SEED FOR THE MAP AND NOT FOR THE RUN. The run's seed is what makes a run
 * reproducible; the act is mixed into buildMap instead, so act two of run 4471 is always the same act two.
 * `stop` keeps counting from where it was — the ladder reads it for the curve inside an act — and the trail
 * has to be emptied or the new sheet opens with the last act's path drawn across it.
 */
export function nextAct(run) {
    run.act = (run.act || 1) + 1;
    // ⚠️ THE LAST ACT IS A CORRIDOR, NOT A SHEET — see buildFinalMap for why it is not simply a shorter
    // roll of the same generator. Nothing else about walking an act changes, because the node shape does not.
    run.map = run.act >= FINAL_ACT
        ? buildFinalMap()
        : buildMap(((run.seed >>> 0) + run.act * 7717) >>> 0, { asc: run.asc || 0 });
    run.trail = [];
    run.at = null;
    run.stop = 1;
    run.offers = null;
    run.bossOffers = null;
    run.fight = null;
    run.shop = null;
    return run;
}
