import "server-only";

import { db } from "@/lib/db";
import { isOwner } from "@/lib/marketplace/owner.js";
import { ladderFoe, LADDER_SIZE } from "@/lib/marketplace/arena-ladder.js";
import { CARDS, nextRand } from "@/lib/marketplace/cards-kit.js";

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
export async function getCardFightFixture(buyerId, seed) {
    const [rand] = nextRand(seed >>> 0);
    const foe = ladderFoe(1 + Math.floor(rand * LADDER_SIZE));

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
        foe: {
            name: foe.name, art: foe.sprite, artFallback: foe.spriteFallback,
            color: foe.color, houseName: foe.houseName, rung: foe.rung,
        },
        // pet_id -> { url, flip }. A card face is a portrait rather than a combatant, so `flip` is carried but
        // the card does not act on it — a pet looking left on its own card is not wrong, it is a photograph.
        petArt: Object.fromEntries((sprites || []).map((r) => [r.pet_id, { url: r.url, flip: r.flip === true }])),
    };
}
