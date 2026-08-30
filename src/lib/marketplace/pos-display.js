import "server-only";

import { db } from "@/lib/db";
import { ITEMS, isOwnerOnlyItem } from "@/lib/marketplace/items.js";
import { previewPurchaseXp, SPEND_XP_PER_DOLLAR } from "@/lib/marketplace/xp.js";

// ── THE SCREEN FACING THE CUSTOMER AT THE TILL ───────────────────────────────────────────────────────────────
// Luke: "we have a pc screen at the point of sale facing the customer."
//
// That is the answer to "there is no hook early enough". 600 of 687 receipt QRs were never scanned by anybody
// — the code was on a piece of paper going into a pocket. A screen at eye level, being looked at during the
// one minute a customer has nothing else to do, is a different proposition entirely: the pitch lands BEFORE
// the sale finishes, and then the same screen shows the QR for the sale that just happened, so the receipt is
// out of the loop altogether.
//
// ── WHY THIS NEEDS A KEY ─────────────────────────────────────────────────────────────────────────────────────
// The display has to be handed a LIVE, UNREDEEMED claim token — that is the entire trick. A token is a bearer
// credential: whoever holds it can bank somebody else's points. So an open endpoint that returns "the newest
// claim" would be a public feed of other people's rewards, refreshing every few seconds.
//
// POS_DISPLAY_KEY is a shared secret set once on the machine that runs the screen (it lives in the URL the
// browser is parked on). No key, no claim — and with no key set at all the endpoint is closed rather than
// open, so a missing env var fails safe.
const KEY_ENV = "POS_DISPLAY_KEY";

/** Is this request allowed to see live claim tokens? Closed when no key is configured. */
export function posDisplayKeyOk(key) {
    const want = String(process.env[KEY_ENV] || "").trim();
    if (!want) return false;
    const got = String(key || "").trim();
    // Length-independent compare is overkill for a kiosk key on a LAN, but the cost is one line.
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
}

export const posDisplayConfigured = () => Boolean(String(process.env[KEY_ENV] || "").trim());

// How recently a sale must have happened for the screen to still be showing its QR. Long enough to cover
// bagging up and a card terminal, short enough that the NEXT customer in the queue is never looking at the
// last one's points — which would be both a privacy leak and a way to steal them.
export const CLAIM_WINDOW_SECONDS = 150;

/**
 * The sale that just happened, if there is one.
 *
 * Deliberately only ever ONE row, only ever the newest, and only ever inside the window — the screen has no
 * business holding a list of unredeemed claims. Returns null the rest of the time, which is the idle state.
 */
export async function latestCounterClaim() {
    const row = await db.queryOne(
        `SELECT token, amount_cents, created_at,
                EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_seconds
           FROM mkt_loyalty_claim
          WHERE redeemed_at IS NULL
            AND expires_at > NOW()
            AND created_at > NOW() - ($1 || ' seconds')::interval
          ORDER BY created_at DESC
          LIMIT 1`,
        [String(CLAIM_WINDOW_SECONDS)],
    ).catch(() => null);
    if (!row) return null;

    // firstEver: true — the screen is pitching at somebody who is not a member yet, so it quotes what a new
    // member would get. A member who is already signed in scans and gets their own (larger, multiplied)
    // number on the claim page itself. See previewPurchaseXp: this is always the floor.
    const xp = previewPurchaseXp({ amountCents: row.amount_cents, firstEver: true });
    return {
        token: row.token,
        amountCents: Number(row.amount_cents) || 0,
        ageSeconds: Number(row.age_seconds) || 0,
        secondsLeft: Math.max(0, CLAIM_WINDOW_SECONDS - (Number(row.age_seconds) || 0)),
        points: xp.total,
        lines: [
            { label: `$${((Number(row.amount_cents) || 0) / 100).toFixed(2)} spent`, points: xp.spend },
            ...(xp.flat ? [{ label: "Purchase bonus", points: xp.flat }] : []),
            ...(xp.first ? [{ label: "First visit bonus", points: xp.first }] : []),
        ],
    };
}

// What the idle screen says. Kept here rather than in the component because the RATE is a fact about the
// game — if SPEND_XP_PER_DOLLAR moves, the poster on the wall of the shop should move with it.
export const POS_PITCH = {
    rate: SPEND_XP_PER_DOLLAR,
    headline: "Every dollar you spend here is worth something",
    lines: [
        "Points level you up — gear, pets, chests, a whole game",
        "Free, and it takes about ten seconds to start",
    ],
};

// ── THE GEAR THAT PAYS REAL MONEY ────────────────────────────────────────────────────────────────────────────
// Luke: "the fact that there's gear that you can equip that gives you store credit."
//
// This is the strongest thing the screen can say and it is currently said nowhere: there is a crown in this
// game that is worth TWO HUNDRED DOLLARS of store credit. Read off ITEMS rather than typed out, so the board
// can never advertise a value the counter will not honour.
//
// ⚠️ IT SELLS WHAT IS AVAILABLE, NOT WHAT HAS BEEN GIVEN. The obvious pitch — "look what we have handed over"
// — is not available to us: exactly ONE charged reward has ever been redeemed, and $1.00 of store credit has
// ever been spent in the shop. Those numbers would argue against us. They are also the same disease as the
// unscanned QRs: the machinery exists and nobody knows. This board is the cure, so it quotes the catalogue.
export function chargedGearPitch() {
    return ITEMS
        .filter((i) => i.charged && i.chargeRewardLabel && !isOwnerOnlyItem(i))
        .map((i) => ({
            id: i.id,
            name: i.name,
            rarity: i.rarity,
            charges: Number(i.charges) || 1,
            reward: i.chargeRewardLabel,
            // The number is what sells it, so it is parsed out for the big type rather than left in prose.
            dollars: Number(String(i.chargeRewardLabel).match(/\$(\d+)/)?.[1]) || null,
        }))
        .sort((a, b) => (b.dollars || 0) * (b.charges || 1) - (a.dollars || 0) * (a.charges || 1));
}

// ── EVERYTHING THE GAME IS, AS PICTURES ──────────────────────────────────────────────────────────────────────
// Luke: "text isn't going to do it ... decorate the boundaries of the page with sprites of weapons and enemies
// and bosses and pets and boats and skill trees and the farm and decorations and seeds and casino slots ...
// we need to communicate everything it encompasses in a small screen space."
//
// So the collage is deliberately ONE OF EACH FEATURE rather than a random draw from the biggest table. A
// random pull from 471 items is a wall of swords, which says "this is a game about swords"; a pet, a boat, a
// foe, a gem, a dish, a decoration and a slot symbol side by side says "there is a lot here", which is the
// only thing this panel has to communicate before somebody looks away.
//
// Shared-cached at the ART ttl like every other sprite map — the screen redraws all day and these change only
// when somebody runs a generator.
const STATIC_PICKS = [
    "/images/sailing/boat-tier10-leviathan.png",
    "/images/gems/ruby_t5.png",
    "/images/casino/blackjack.webp",
    "/images/trophy/tool-forge.webp",
    "/images/elements/fire.png",
    "/images/spin/wheel-disc.png",
];

export async function posCollage() {
    const { shared, TTL } = await import("@/lib/marketplace/shared-cache.js");
    return shared("pos:collage", TTL.ART, async () => {
        const pick = (rows, n) => (rows || []).filter((r) => r?.url).slice(0, n).map((r) => r.url);
        const [pets, items, decos, dishes, town] = await Promise.all([
            db.query(`SELECT url FROM mkt_pet_sprite ORDER BY random() LIMIT 6`).catch(() => []),
            db.query(`SELECT url FROM mkt_item_sprite ORDER BY random() LIMIT 6`).catch(() => []),
            db.query(`SELECT url FROM mkt_deco_sprite ORDER BY random() LIMIT 4`).catch(() => []),
            db.query(`SELECT url FROM mkt_cooking_sprite ORDER BY random() LIMIT 3`).catch(() => []),
            db.query(`SELECT url FROM mkt_town_art WHERE art_key LIKE 'crop_%_ripe' ORDER BY random() LIMIT 3`).catch(() => []),
        ]);
        // Interleaved rather than grouped, so no two neighbours are the same KIND of thing — the point is
        // breadth, and six swords in a row reads as one feature however many pictures it is.
        const groups = [pick(pets, 6), pick(items, 6), pick(decos, 4), pick(dishes, 3), pick(town, 3), STATIC_PICKS];
        const out = [];
        for (let i = 0; i < 6; i += 1) for (const g of groups) if (g[i]) out.push(g[i]);
        return out;
    });
}

// ── WHAT WE HAVE ACTUALLY HANDED OVER ────────────────────────────────────────────────────────────────────────
// Luke: "we know what real world items we've given away from all the previous bosses ... you also know what
// we're about to give away because you can see the boss fight and what's stubbed to give away."
//
// He is right and my first pass looked in the wrong place — I checked the charged-gear claims (one redemption,
// ever) and concluded there was no story to tell. The story is on boss_event: five real products off the shelf
// in Montgomery, every one with a photo and a named winner. That is the most persuasive thing this screen can
// show, because it is not a promise.
//
// ⚠️ THE HOUSE IS FILTERED OUT. One of the five was won by the owner's own account, from before the raffle
// excluded staff (see isHouse — "a member watching a shop employee take the physical prize does not read as
// luck no matter how honest the draw was"). Showing it to customers would argue the opposite of the point.
export async function bossPrizes() {
    const { shared, TTL } = await import("@/lib/marketplace/shared-cache.js");
    return shared("pos:prizes", TTL.SLOW * 2, async () => {
        const { isHouse } = await import("@/lib/marketplace/owner.js");
        const rows = await db.query(
            `SELECT b.prize_name, b.prize_image_url, b.defeated_at, b.status, b.winner_buyer_id,
                    COALESCE(NULLIF(w.display_name,''), w.alias) AS winner
               FROM boss_event b
               LEFT JOIN mkt_buyer w ON w.id = b.winner_buyer_id
              WHERE b.prize_name IS NOT NULL
              ORDER BY b.started_at DESC
              LIMIT 12`,
        ).catch(() => []);

        const given = (rows || [])
            .filter((r) => r.winner_buyer_id && r.status !== "active" && !isHouse(r.winner_buyer_id))
            .map((r) => ({ name: r.prize_name, image: r.prize_image_url || null, winner: r.winner || "a member" }))
            .slice(0, 4);

        // The one currently stubbed to go out, if a boss is standing. Named separately because "you can still
        // win this" and "somebody already won this" are different sentences and the panel says both.
        const liveRow = (rows || []).find((r) => r.status === "active" && r.prize_name);
        return {
            given,
            upNext: liveRow ? { name: liveRow.prize_name, image: liveRow.prize_image_url || null } : null,
        };
    });
}
