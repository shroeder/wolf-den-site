import "server-only";

import { db } from "@/lib/db";
import { poolByKey, shelfPoolCards } from "@/lib/marketplace/pack-pools.js";

// ── THE PACK OPENERS GET A DIFFERENT EMAIL ───────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "There are certainly mystery pack pplz that we would want to try and have play the virtual
// rips." Then: "That might be its own template."
//
// He is right, and the pattern report is what shows it. 44 of the 74 lapsed members are sealed buyers, and the
// product email serves them badly by construction: "bought three Mystery Packs" supports "here is another
// booster pack" and nothing else, so the largest group was getting the blandest version of a feature built
// for specifics.
//
// They are not a weak signal once you ask what somebody buys a Mystery Pack FOR. They are not buying
// cardboard, they are buying the rip — and the shop already sells that online, from $5, and almost nobody
// knows. Measured 2026-11-13: **12 members have ever opened a pack**, across 217 opens and $2,720 of revenue,
// on a feature that has been open to everybody since 2026-10-27. That is not something another nav row fixes.
//
// ⚠️ THE HOOK IS THE POOL, NOT A PRODUCT, AND ITS NUMBER MUST BE TRUE — which is why it is read live rather
// than written into the template. The $15 Pokémon pool holds 1,071 cards and the best one in it right now is
// $287. That is a real card, really in there, and it is the same promise the physical shelf already makes.
//
// ⚠️ AND IT NEVER CLAIMS A TYPICAL OUTCOME. The median card in that pool is $7 against a $15 price, because
// the pools carry a target margin, as they must. Naming the chase is honest; implying people usually come out
// ahead would not be. A booster pack on the shelf is the identical bet and is sold the identical way.
// [[casino-dont-balance-to-a-number]]

/** How many of the pool's best cards are used as the headline, rotated across recipients. */
const CHASE_ROTATION = 8;

/** A member is worth sending to the rips if opening packs IS the thing they buy. */
export function isRipper(profile) {
    if (!profile) return false;
    const names = profile.allNames || [];
    if (!names.length) return false;
    const openers = names.filter((n) =>
        /\bmystery\b|\bbooster\b|\bpacks?\b|\bbundle\b|\belite\s?trainer\b|\betb\b|\btins?\b|\bblister\b/i.test(n)).length;
    // Two tests, and the second is the one doing the work: a THIRD of everything they buy, not just a lot in
    // absolute terms. Somebody with 70 purchases of which six are packs is not a pack person.
    return openers >= 3 && openers / names.length >= 0.33;
}

/**
 * The pool to pitch, and the best card actually sitting in it — or null if there is nothing honest to say.
 *
 * The tier follows what they spend per item: a $4-a-pack buyer is pitched the $5 pool, not the $15 one. The
 * goal is the lowest bar to a FIRST rip, not the biggest headline.
 */
export async function ripPitchFor(profile, rotation = 0) {
    const game = profile?.game === "magic" ? "mtg" : "pkmn";
    const typical = Number(profile?.typicalCents) || 0;
    const tier = typical >= 1200 ? 15 : typical >= 700 ? 10 : 5;
    const key = `${game}${tier}`;

    const pool = poolByKey(key);
    if (!pool) return null;

    const state = await db.queryOne(
        `SELECT pool, price_cents, units, open FROM mkt_pack_pool_state WHERE pool = $1`,
        [key]
    ).catch(() => null);
    // ⚠️ A SHUT POOL IS NOT A PITCH. Three of the nine pools are closed right now, and mailing somebody a
    // door that redirects is worse than mailing them nothing. [[feature-gates-come-in-pairs]]
    if (!state?.open || !(Number(state.units) > 0)) return null;

    const priceCents = Number(state.price_cents) || 0;
    if (!priceCents) return null;

    // ⚠️ READ THROUGH shelfPoolCards, WHICH IS THE OPENER'S OWN VIEW OF THE POOL. It already subtracts copies
    // sitting held in somebody's vault and excludes consigned stock, both of which a hand-rolled query here
    // would get wrong — and getting it wrong means putting a card in an email that cannot come out of the
    // pack. One source of truth for "what is really in there". [[reuse-the-rule-never-restate-it]]
    const cards = await shelfPoolCards(pool, { limit: 60 });
    const bandLo = Math.round(priceCents * (Number(pool.floorMult) || 0));
    const bandHi = pool.ceilMult ? Math.round(priceCents * Number(pool.ceilMult)) : Infinity;
    const eligible = cards.filter((c) =>
        !c.claimed && c.imageUrl && c.valueCents >= bandLo && c.valueCents <= bandHi);
    if (!eligible.length) return null;

    // ── ⚠️ ROTATED, BECAUSE A POOL IS SHARED AND A MAILBOX IS NOT ──────────────────────────────────────
    // Unlike a single card, the chase is true for everybody at once — so taking "the best one" gave 19 of
    // 23 recipients a subject line identical to the word. Each is individually honest and collectively
    // they are obviously a mail-merge, which is the impression this whole feature is spending effort to
    // avoid. Rotating through the top of the pool keeps every claim exactly as true and stops two friends
    // comparing notes finding the same sentence.
    const top = eligible.slice(0, CHASE_ROTATION);
    const chase = top[rotation % top.length];
    if (!chase) return null;

    return {
        key,
        brand: pool.brand,
        priceCents,
        units: Number(state.units),
        chase: { name: chase.name, imageUrl: chase.imageUrl, cents: chase.valueCents },
    };
}
