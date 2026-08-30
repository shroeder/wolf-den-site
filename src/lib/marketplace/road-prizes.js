import "server-only";

import { db } from "@/lib/db";
import { currentSeason, prizeAt, seasonByNumber } from "@/lib/marketplace/arena-season.js";

// ── HANDING OVER THE EIGHT ───────────────────────────────────────────────────────────────────────────────────
// A season prize is four different objects living in four different tables — a decoration, a recipe page, a
// piece of gear and a pet — and the ONE thing they have in common is that each may be given exactly once.
//
// So the claim and the hand-over are separate steps, in that order, and this file is the only place either
// happens. `mkt_arena_road_prize` is the claim: a primary key on (buyer, season, rung) and an ON CONFLICT DO
// NOTHING, so of two callers racing the same winning bout exactly one gets a row back and the other gets null.
// That is the whole concurrency story, and it has to be — neon() is the HTTP driver and has no transactions,
// so "check then write" would be two round trips with a gap in the middle wide enough to pay a pet twice.
//
// ── AND THE CLAIM IS RELEASED IF THE HAND-OVER FAILS ─────────────────────────────────────────────────────────
// The dangerous half of claim-first is the opposite failure: the row lands, the grant throws, and the ledger
// now says somebody was paid a pet they do not own. Nothing would ever notice — the track would draw it as
// claimed and the pets page would not have it.
//
// So a failed hand-over deletes its own claim. The prize goes back to being owed, the track draws it as owed,
// and `claimRoadPrize` below will try again. Better to risk granting twice (which the primary key still
// refuses) than to record a payment that did not happen.

/** Every rung this member has already been paid for, this season. */
export async function roadPrizesClaimed(buyerId, season = currentSeason()) {
    if (!buyerId) return new Set();
    const rows = await db.query(
        `SELECT rung FROM mkt_arena_road_prize WHERE buyer_id = $1 AND season = $2`,
        [buyerId, season.n],
    ).catch(() => []);
    return new Set((rows || []).map((r) => Number(r.rung)));
}

// The four hand-overs. Each is the SAME function the rest of the game uses to give one of these away — a
// second path that inserted the rows itself would be a second copy of rules that already exist (a decoration
// grant tracks activity, a recipe grant fires the cooking badges, an item grant bumps the equipment cache).
async function handOver(buyerId, prize) {
    switch (prize.kind) {
        case "decoration": {
            const { grantDecoration } = await import("@/lib/marketplace/farm-decorations.js");
            return grantDecoration(buyerId, prize.ref, 1, "road_season");
        }
        case "recipe": {
            const { learnRecipe } = await import("@/lib/marketplace/cooking.js");
            return learnRecipe(buyerId, prize.ref, undefined, "road_season");
        }
        case "gear": {
            const { grantItem } = await import("@/lib/marketplace/inventory.js");
            return grantItem(buyerId, prize.ref, "road_season");
        }
        case "pet": {
            const { grantPet } = await import("@/lib/marketplace/pet-drops.js");
            const { collectibleById } = await import("@/lib/marketplace/collectibles.js");
            const pet = collectibleById(prize.ref);
            if (!pet) throw new Error(`no such pet: ${prize.ref}`);
            return grantPet(buyerId, pet, "road_season", { rung: prize.rung });
        }
        default:
            throw new Error(`unknown prize kind: ${prize.kind}`);
    }
}

/**
 * Pay the prize sitting on a rung, if there is one and it has not been paid.
 *
 * Returns the prize when it was actually handed over, null when there was nothing to pay or it was already
 * paid — so a caller can announce it without having to ask twice whether it happened.
 */
export async function grantRoadPrize(buyerId, rung, season = currentSeason()) {
    const prize = prizeAt(rung, season);
    if (!buyerId || !prize) return null;

    const claim = await db.queryOne(
        `INSERT INTO mkt_arena_road_prize (buyer_id, season, rung, kind, ref)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (buyer_id, season, rung) DO NOTHING
         RETURNING rung`,
        [buyerId, season.n, prize.rung, prize.kind, prize.ref],
    ).catch(() => null);
    if (!claim) return null;   // somebody else got there, or it was already paid

    try {
        await handOver(buyerId, prize);
    } catch (e) {
        // See the note at the top: a claim without a hand-over is worse than no claim.
        console.error("road.prize.grant_failed", buyerId, season.n, prize.rung, e?.message || e);
        await db.query(
            `DELETE FROM mkt_arena_road_prize WHERE buyer_id = $1 AND season = $2 AND rung = $3`,
            [buyerId, season.n, prize.rung],
        ).catch(() => {});
        return null;
    }
    return { ...prize, season: season.n };
}

/**
 * The recovery path: pay anything this member has climbed past but never received.
 *
 * Exists because the grant above can fail for reasons that have nothing to do with the member — the pets table
 * being down for a second, a decoration id that moved between deploys. Without this, a prize lost that way is
 * lost for the rest of the season, on the one rung somebody worked hardest for.
 *
 * Safe to call as often as you like: every prize goes through the same claim, so a prize already paid costs one
 * refused INSERT and nothing else.
 */
export async function settleRoadPrizes(buyerId, beaten, seasonN = null) {
    const season = (seasonN != null && seasonByNumber(seasonN)) || currentSeason();
    const done = beaten instanceof Set ? beaten : new Set((beaten || []).map(Number));
    const paid = [];
    for (const prize of season.prizes || []) {
        if (!done.has(prize.rung)) continue;
        const got = await grantRoadPrize(buyerId, prize.rung, season);
        if (got) paid.push(got);
    }
    return paid;
}

// ── WHAT THE EIGHT ACTUALLY LOOK LIKE ────────────────────────────────────────────────────────────────────────
// The track drew a glyph per KIND — a paw for both pets, a sword for both gear pieces — which is a legend, not
// a preview. The whole reason to put all eight on the screen from rung 1 is so somebody can see the moth at
// rung 200 on the day they beat rung 3, and a generic paw print does not do that.
//
// The art lives in four different tables because each kind is drawn by its own pipeline (mkt_deco_sprite,
// mkt_item_sprite, mkt_cooking_sprite, mkt_pet_sprite). Four reads for eight pictures — on a screen every
// member opens, that is exactly the kind of convenience call CLAUDE.md warns about.
//
// So it is SHARED and cached at the ART ttl, which is what every other sprite map in the game uses: these
// change only when somebody runs `npm run gen:season-art`, and the whole point of the shared cache is that
// sixty people opening the Road do one read between them rather than sixty. The key carries the season number,
// so authoring a new season does not serve the old season's pictures for five minutes.
export async function seasonPrizeArt(season = currentSeason()) {
    const { shared, TTL } = await import("@/lib/marketplace/shared-cache.js");
    return shared(`road:prize-art:${season.n}`, TTL.ART, async () => {
        const by = (kind) => (season.prizes || []).filter((p) => p.kind === kind).map((p) => p.ref);
        const [deco, gear, dish, pet] = await Promise.all([
            by("decoration").length
                ? db.query(`SELECT deco_id AS ref, url FROM mkt_deco_sprite WHERE deco_id = ANY($1)`, [by("decoration")]).catch(() => []) : [],
            by("gear").length
                ? db.query(`SELECT item_id AS ref, url FROM mkt_item_sprite WHERE item_id = ANY($1)`, [by("gear")]).catch(() => []) : [],
            by("recipe").length
                ? db.query(`SELECT ref, url FROM mkt_cooking_sprite WHERE ref = ANY($1)`, [by("recipe")]).catch(() => []) : [],
            by("pet").length
                ? db.query(`SELECT pet_id AS ref, url FROM mkt_pet_sprite WHERE pet_id = ANY($1)`, [by("pet")]).catch(() => []) : [],
        ]);
        const out = {};
        for (const row of [...deco, ...gear, ...dish, ...pet]) if (row?.url) out[row.ref] = row.url;
        return out;
    });
}
