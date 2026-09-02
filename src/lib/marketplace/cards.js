import "server-only";

import { db } from "@/lib/db";
import { isOwner } from "@/lib/marketplace/owner.js";
import { ladderFoe, LADDER_SIZE } from "@/lib/marketplace/arena-ladder.js";
import { CARDS, FOE_SCRIPTS, nextRand } from "@/lib/marketplace/cards-kit.js";
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

    const petIds = [...new Set(Object.values(CARDS).map((c) => c.pet))];
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
