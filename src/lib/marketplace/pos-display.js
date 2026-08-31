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
/** The charged items with their real sprites, so the panel can SHOW the crown rather than name it. */
export async function chargedGearArt() {
    const { shared, TTL } = await import("@/lib/marketplace/shared-cache.js");
    const ids = chargedGearPitch().map((g) => g.id);
    if (!ids.length) return {};
    return shared("pos:gear-art", TTL.ART, async () => {
        const rows = await db.query(`SELECT item_id, url FROM mkt_item_sprite WHERE item_id = ANY($1)`, [ids]).catch(() => []);
        return Object.fromEntries((rows || []).filter((r) => r.url).map((r) => [r.item_id, r.url]));
    });
}

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
// Luke: "over complicating it with the art rotating. I want groomed sprites. The sprites that I want are only
// the most badass."
//
// So this is a HAND-PICKED list, not a draw. The rotating version pulled at random from 471 items and 118
// pets, which meant the screen was as likely to show a garden snail and a bowl of porridge as a kraken — and
// a shop window does not gamble on what it puts in the window. Every id below was chosen off a contact sheet
// of the whole top-rarity catalogue.
//
// ⚠️ ADDING ONE MEANS LOOKING AT IT. The point of the list is that somebody's eye has been over every entry.
// `npm run check:season`-style gates cannot tell you a sprite is ugly.
const GROOMED = [
    // The monsters — the strongest art in the game and the reason this panel works at all.
    "pet:kraken", "pet:elder_dragon", "pet:sea_wyrm", "pet:deep_golem", "pet:midnight_crane", "pet:gate_moth",
    // The best gear in the game: blackened metal shot with molten orange.
    "item:primordial_primordial_blade", "item:primordial_primordial_bulwark", "item:primordial_elder_scale",
    "item:primordial_elder_waistguard", "item:eternal_timeless_cloak", "item:ascendant_uplifted_coronet",
];
// A ghost ship, a raid boat and the wheel — the three features the gear and the monsters do not cover.
const GROOMED_STATIC = [
    "/images/sailing/boat-tier10-leviathan.png",
    "/images/gems/ruby_t5.png",
    "/images/spin/wheel-disc.png",
    "/images/trophy/tool-forge.webp",
];

export async function posCollage() {
    const { shared, TTL } = await import("@/lib/marketplace/shared-cache.js");
    return shared("pos:collage:groomed", TTL.ART, async () => {
        const petIds = GROOMED.filter((g) => g.startsWith("pet:")).map((g) => g.slice(4));
        const itemIds = GROOMED.filter((g) => g.startsWith("item:")).map((g) => g.slice(5));
        const [pets, items] = await Promise.all([
            db.query(`SELECT pet_id AS id, url FROM mkt_pet_sprite WHERE pet_id = ANY($1)`, [petIds]).catch(() => []),
            db.query(`SELECT item_id AS id, url FROM mkt_item_sprite WHERE item_id = ANY($1)`, [itemIds]).catch(() => []),
        ]);
        const by = Object.fromEntries([...(pets || []), ...(items || [])].filter((r) => r.url).map((r) => [r.id, r.url]));
        // Kept in GROOMED's order, so the composition is the same every time somebody looks at it. A shop
        // window that rearranges itself is a shop window nobody learns to read.
        const out = GROOMED.map((g) => by[g.split(":")[1]]).filter(Boolean);
        return [...out, ...GROOMED_STATIC];
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
            `SELECT b.prize_name, b.prize_image_url, b.defeated_at, b.status, b.winner_buyer_id, b.name, b.image_url,
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
        // ⚠️ THE STATUS IS "live", NOT "active". This read `=== "active"`, which matches nothing in the
        // table — the only two values boss_event ever holds are `live` and `ended` — so the "up for grabs
        // right now" line could never appear, however many bosses were standing.
        const liveRow = (rows || []).find((r) => r.status === "live");
        return {
            given,
            upNext: liveRow?.prize_name ? { name: liveRow.prize_name, image: liveRow.prize_image_url || null } : null,
            boss: liveRow ? { name: liveRow.name, image: liveRow.image_url || null } : null,
        };
    });
}

// ── WHAT IS ON THE SHELF TO BE WON ───────────────────────────────────────────────────────────────────────────
// Luke: "just show a picture of a Prismatic Evolution's booster bundle."
//
// Read from the SQUARE catalogue rather than hard-coded, so the picture on the screen is the product the shop
// actually stocks — and it goes quiet on its own if the item is ever delisted, rather than advertising a box
// nobody can win.
export async function shelfPrize() {
    const { shared, TTL } = await import("@/lib/marketplace/shared-cache.js");
    return shared("pos:shelf-prize", TTL.ART, async () => {
        const row = await db.queryOne(
            `SELECT name, image_url FROM inventory_feed
              WHERE name ILIKE '%prismatic evolutions%bundle%' AND image_url IS NOT NULL LIMIT 1`,
        ).catch(() => null);
        return row ? { name: row.name, image: row.image_url } : null;
    });
}
