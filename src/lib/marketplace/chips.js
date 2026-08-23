import "server-only";

import { db } from "@/lib/db";

// ── CHIPS ────────────────────────────────────────────────────────────────────────────────────────────────────
// The casino's own currency. You stake GOLD at a machine and the machine pays CHIPS; chips buy things at the
// counter on the floor and are good for nothing else. See migrations/398-casino-chips.sql for why this exists
// at all — the short version is that paying gold forced every paytable to fight an RTP ceiling, and the
// machines were unplayable as a result.
//
// THE ONE RATE. A chip is minted at CHIP_RATE per gold staked, and the machines return 1.00x of that on
// average (check:slot5 enforces it), so a member who stakes 10,000 gold walks away with about 10,000 *
// CHIP_RATE chips however the spins fell. Everything about what a chip is WORTH is then decided by the prices
// below and nowhere else. Change this number and you have repriced the entire casino, which is the point:
// there is exactly one lever.
// 0.25 rather than 0.08, and the reason is RESOLUTION rather than generosity. At 0.08 a whole 1x win on a
// 100-gold spin was 8 chips, so the entire machine was quantised in eighths — and the smallest paying line on
// The Hunt, three doubloons, came to 0.4 chips and rounded to NOTHING. Caught by playing it on the live site:
// "3 doubloon — 0 chips". A machine that draws a winning line across the screen and pays zero for it is
// broken, whatever the maths says. Tripling the rate triples the store prices with it, so nothing about what
// a chip BUYS has changed — only how finely a win can be expressed.
export const CHIP_RATE = 0.25;

// What a bet of `gold` mints. The machines' payouts are multiples of the bet and know nothing about chips;
// the conversion happens once, here.
//
// AND ANYTHING THAT PAID AT ALL PAYS AT LEAST ONE CHIP. Rounding is not allowed to turn a win into a loss:
// the line lit, the screen said it paid, and a zero underneath that is the machine contradicting itself.
export const chipsFor = (gold, multiple) => {
    const raw = gold * multiple * CHIP_RATE;
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw));
};

// ── THE COUNTER ──────────────────────────────────────────────────────────────────────────────────────────────
// Priced against the rate above, and REPRICED WITH IT: when the rate went 0.08 -> 0.25 every price here was
// multiplied by the same 3.125, so the gold behind each item did not move. check:chips prints that gold, which
// is the only number these prices can honestly be judged by — a chip on its own means nothing.
//
// THE PRICES ARE THE ECONOMY. There is no gold in this list on purpose: chips converting back to gold would
// re-create the loop the whole design exists to break, and it is the one thing that can turn a generous
// paytable into an actual money printer. Nothing here may be sellable for more gold than it cost to win.
//
// `once` items are bought a single time ever and the partial unique index in the migration enforces it
// server-side; the shelf only hides them.
export const CHIP_STORE = [
    // ── EVERY REF ON THIS SHELF IS A REAL CATALOG ID ─────────────────────────────────────────────────────
    // The first cut of this list invented all of them — `casino_neon`, `lucky_cat`, `tonic` — and every one
    // would have taken the chips, written an unlock row and delivered nothing, because no catalog has an
    // entry by those names and nothing renders a ref it does not know. check:chips now resolves every id
    // against the real catalogs and fails the build, which is the only reason this class of bug ever gets
    // caught before a member pays for a decoration that does not exist.

    // ── COSMETIC ── the safe shelf. Nothing here touches combat or the gold economy, so it can be generous.
    { id: "deco_lamp", kind: "decoration", ref: "deco_lamp_post", name: "Lamp Post", price: 500, once: true,
        blurb: "The light outside a room where it is always evening." },
    { id: "deco_lights", kind: "decoration", ref: "deco_lantern_string", name: "String Lights", price: 690, once: true,
        blurb: "Strung over the tables. Never switched off." },
    { id: "deco_idol", kind: "decoration", ref: "deco_golden_idol", name: "Golden Idol", price: 2800, once: true,
        blurb: "It has watched a great many people lose." },

    // ── POWER ── the expensive shelf, and the reason the rate above matters. These are real, so they are
    // priced like it: a fourth-water gem is several evenings of play, not an afternoon.
    { id: "gem_ruby3", kind: "gems", ref: "ruby_t3", name: "Ruby, Third Water", price: 1600,
        blurb: "Cut, sized and ready for a socket." },
    { id: "gem_any4", kind: "gems", ref: "sapphire_t4", name: "Sapphire, Fourth Water", price: 4400,
        blurb: "The good stuff. The counter does not haggle." },
    { id: "parts_t3", kind: "parts", ref: [3, 40], name: "A Handful of Parts", price: 470,
        blurb: "Forty third-tier forge parts." },
    { id: "parts_t4", kind: "parts", ref: [4, 25], name: "A Case of Parts", price: 1310,
        blurb: "Twenty-five fourth-tier forge parts." },

    // ── CONSUMABLES ── small, repeatable, and the thing most likely to be bought on the way out.
    { id: "pack_house", kind: "consumables", ref: ["pot_adrenaline", "elixir_renewal", "sail_lucky_lure"],
        name: "The House Pack", price: 750,
        blurb: "A draught, an elixir and a lure. Compliments of the floor." },
    { id: "pack_forge", kind: "consumables", ref: ["forge_power_scroll", "forge_enchant_scroll"],
        name: "The Smith's Envelope", price: 1190,
        blurb: "Two scrolls the forge will be glad to see." },
];
export const chipItem = (id) => CHIP_STORE.find((i) => i.id === id) || null;

// ── THE LEDGER ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Move chips and record why, in that order. Returns the new balance, or null if the member could not afford a
 * spend — the caller must treat null as "nothing happened" rather than retrying.
 *
 * SPENDING IS GUARDED IN THE UPDATE ITSELF (`chips >= $2`), not read-then-write. Two taps on Buy arriving
 * together would both pass a read-first check and both succeed; the same mistake in the slot bet path is
 * commented at length in casino.js, and it is the one race in this file that costs real money.
 */
export async function moveChips(buyerId, delta, reason, { ref = null, meta = null } = {}) {
    if (!buyerId || !delta || !reason) return null;
    const n = Math.round(delta);
    const row = n < 0
        ? await db.queryOne(
            `UPDATE mkt_buyer SET chips = chips + $2 WHERE id = $1 AND chips >= $3 RETURNING chips`,
            [buyerId, n, Math.abs(n)])
        : await db.queryOne(`UPDATE mkt_buyer SET chips = chips + $2 WHERE id = $1 RETURNING chips`, [buyerId, n]);
    if (!row) return null;
    // Best-effort: a ledger write must never break the thing it is recording.
    db.query(
        `INSERT INTO mkt_chip_event (buyer_id, delta, balance_after, reason, ref, meta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [buyerId, n, Number(row.chips), reason, ref, meta ? JSON.stringify(meta) : null]
    ).catch(() => {});
    return Number(row.chips);
}

export async function chipBalance(buyerId) {
    const row = await db.queryOne(`SELECT COALESCE(chips, 0)::bigint AS chips FROM mkt_buyer WHERE id = $1`, [buyerId]);
    return Number(row?.chips || 0);
}

/** What this member has already bought that can only be bought once. */
export async function ownedOnce(buyerId) {
    const rows = await db.query(
        `SELECT item_id FROM mkt_chip_purchase WHERE buyer_id = $1 AND once`, [buyerId]).catch(() => []);
    return new Set(rows.map((r) => r.item_id));
}

/**
 * The shelf as this member sees it: once-only things they already own are marked rather than hidden, because
 * a shelf that quietly shrinks reads as things going missing.
 */
export async function chipShelf(buyerId) {
    const [balance, owned] = await Promise.all([chipBalance(buyerId), ownedOnce(buyerId)]);
    return {
        balance,
        items: CHIP_STORE.map((i) => ({
            id: i.id, kind: i.kind, name: i.name, blurb: i.blurb, price: i.price,
            once: Boolean(i.once), owned: owned.has(i.id), afford: balance >= i.price,
        })),
    };
}
