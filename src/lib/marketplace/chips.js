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

    // ── THE TOP SHELF ────────────────────────────────────────────────────────────────────────────────
    // Luke: "the shop should have way better stuff — mythic chests 3500 chips." And, asking after it: the
    // ladder does not stop at Mythic. It runs Mythic -> Ascendant -> Eternal -> Celestial -> Primordial,
    // and the last two are the ONLY route in the game to a celestial or primordial piece — 55 items that
    // nothing else can drop. So the counter now reaches all the way to the top of the ladder.
    //
    // PRICED OFF THE ONE HE SET. 3,500 for a Mythic is the anchor and each rung is roughly 2.5x the one
    // below it, which is steeper than the odds improve — deliberately. A chip is minted at CHIP_RATE per
    // gold STAKED, not lost, so at the machines' RTP chips accumulate far faster than gold drains; a shelf
    // priced off the odds alone would put a Primordial inside a fortnight. These are meant to be the things
    // you save for, and the Primordial is meant to be the thing you save for all year.
    //
    // Repeatable, deliberately: `once` is right for a decoration you either own or do not, and wrong for a
    // chest, which is the whole reason to come back.
    { id: "chest_mythic", kind: "chest", ref: "mythic", name: "Mythic Chest", price: 3500,
        blurb: "Legendaries are ordinary in here. Mythics are not." },
    { id: "chest_ascendant", kind: "chest", ref: "ascendant", name: "Ascendant Chest", price: 9000,
        blurb: "The first chest that can hand you an ascendant piece at all." },
    { id: "chest_eternal", kind: "chest", ref: "eternal", name: "Eternal Chest", price: 20000,
        blurb: "Nothing below it opens this often onto the eternal tier." },
    { id: "chest_celestial", kind: "chest", ref: "celestial", name: "Celestial Chest", price: 45000,
        blurb: "One of only two chests that can hold a celestial piece." },
    { id: "chest_primordial", kind: "chest", ref: "primordial", name: "Primordial Chest", price: 100000,
        blurb: "The rarest object on the floor. A one percent tail on the rarest tier in the game." },

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

// ── WHAT YOU ARE ACTUALLY BUYING ─────────────────────────────────────────────────────────────────────────────
// Luke: "everything you are purchasing in the casino shop has a sprite for it, and we should be able to
// inspect what we are buying to see what it does."
//
// Both halves were true and neither was on the screen. Every one of these things is drawn — gems carry an art
// path and their exact stats, forge parts carry a sprite and a name, consumables carry a sprite and a sentence
// describing their effect, decorations carry a generated sprite and a farm buff — and the shelf was showing a
// name, a blurb I wrote, and a price. Somebody spending four thousand chips on a Sapphire could not see the
// sapphire or find out that it gives +9 Fortune.
//
// So the catalogue is resolved against the same sources the owning features read, and every line of detail is
// GENERATED from the real numbers rather than typed here. A hand-written "+7 might" is a line that goes stale
// the first time somebody retunes a gem, and it goes stale silently.
async function detailFor(item) {
    switch (item.kind) {
        case "gems": {
            const { GEMS } = await import("@/lib/marketplace/gems.js");
            const g = GEMS.find((x) => x.id === item.ref);
            if (!g) return null;
            return {
                art: g.art,
                blurb: g.blurb,
                lines: Object.entries(g.stats || {}).map(([k, v]) => ({ label: statLabel(k), value: `+${v}` })),
                foot: "Socket it into a piece of gear at the Jewelcutter.",
            };
        }
        case "parts": {
            const { PART_TIERS } = await import("@/lib/marketplace/crafting.js");
            const [tier, count] = item.ref;
            const t = PART_TIERS.find((x) => x.tier === tier);
            return {
                art: t?.sprite || null,
                blurb: `${count} x ${t?.name || `tier ${tier}`}.`,
                lines: [{ label: "Tier", value: String(tier) }, { label: "Count", value: String(count) }],
                foot: "Spent at the Forge to combine and enhance gear.",
            };
        }
        case "consumables": {
            const { CONSUMABLES } = await import("@/lib/marketplace/consumables.js");
            const arts = await db.query(
                `SELECT consumable_id AS k, url FROM mkt_consumable_sprite WHERE consumable_id = ANY($1)`,
                [item.ref]).catch(() => []);
            const byId = new Map(arts.map((r) => [r.k, r.url]));
            return {
                art: byId.get(item.ref[0]) || null,
                blurb: `${item.ref.length} items.`,
                // ONE LINE PER THING IN THE PACK, each with what it actually does — a pack sold as "a tonic
                // and a scroll" is a pack nobody can price.
                lines: item.ref.map((id) => ({
                    label: CONSUMABLES[id]?.name || id,
                    value: CONSUMABLES[id]?.desc || "",
                    art: byId.get(id) || null,
                })),
                foot: null,
            };
        }
        // A chest sells on its ODDS, so print them. The weights map is literal percentages that sum to 100
        // — the note on CHEST_TIERS is emphatic about it — so the table can be read straight onto the card
        // with no arithmetic, and it cannot drift from what the chest actually rolls.
        case "chest": {
            const [{ CHEST_TIERS }, { getChestArt }, { RARITY_META }] = await Promise.all([
                import("@/lib/marketplace/chests.js"),
                import("@/lib/marketplace/chest-art.js"),
                import("@/lib/marketplace/rarity.js"),
            ]);
            const t = CHEST_TIERS[item.ref];
            if (!t) return null;
            const art = await getChestArt().catch(() => ({}));
            return {
                art: art?.[item.ref] || null,
                tone: t.color,
                lines: Object.entries(t.weights || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([r, pct]) => ({
                        label: RARITY_META?.[r]?.label || r,
                        value: `${pct}%`,
                        tone: RARITY_META?.[r]?.color || null,
                    })),
                foot: "Opens at the Chests screen, same as any other.",
            };
        }
        case "decoration": {
            const { DECORATIONS, DECO_STATS } = await import("@/lib/marketplace/decorations.js");
            const d = DECORATIONS.find((x) => x.id === item.ref);
            const art = await db.queryOne(`SELECT url FROM mkt_deco_sprite WHERE deco_id = $1`, [item.ref]).catch(() => null);
            const buff = d?.buff ? Object.entries(d.buff)[0] : null;
            return {
                art: art?.url || null,
                blurb: d?.rarity ? `${d.rarity[0].toUpperCase()}${d.rarity.slice(1)} decoration.` : null,
                lines: buff
                    ? [{ label: DECO_STATS[buff[0]]?.label || buff[0], value: `+${buff[1]}${DECO_STATS[buff[0]]?.suffix || ""}` }]
                    : [{ label: "Effect", value: "Looks good. Nothing more." }],
                foot: "Place it anywhere on your farm.",
            };
        }
        default: return null;
    }
}

// Turned into words rather than raw keys — `might` on a card is a variable name that escaped.
const STAT_WORDS = {
    might: "Might", fortune: "Fortune", vigor: "Vigor", vigour: "Vigour", guile: "Guile",
    crit: "Crit chance", critPower: "Crit power", armour: "Armour", armor: "Armour", health: "Health",
};
const statLabel = (k) => STAT_WORDS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/**
 * The shelf as this member sees it: once-only things they already own are marked rather than hidden, because
 * a shelf that quietly shrinks reads as things going missing.
 */
export async function chipShelf(buyerId) {
    const [balance, owned] = await Promise.all([chipBalance(buyerId), ownedOnce(buyerId)]);
    const details = await Promise.all(CHIP_STORE.map((i) => detailFor(i).catch(() => null)));
    return {
        balance,
        // The rate goes with the shelf so the screen can print the GOLD behind every price without keeping
        // its own copy of it. A second copy is a shelf that lies the day the rate moves — and it moved once
        // already, 0.08 to 0.25, which is exactly when a hardcoded copy would have started quoting prices
        // three times too low.
        rate: CHIP_RATE,
        items: CHIP_STORE.map((i, n) => ({
            id: i.id, kind: i.kind, name: i.name, blurb: i.blurb, price: i.price,
            once: Boolean(i.once), owned: owned.has(i.id), afford: balance >= i.price,
            ...(details[n] || {}),
            // The shelf's own blurb wins over the catalogue's — it is written for this counter.
            blurb: i.blurb,
            detail: details[n]?.blurb || null,
        })),
    };
}
