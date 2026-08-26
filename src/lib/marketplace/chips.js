import "server-only";

import { db } from "@/lib/db";
import { STAT_TRACKS, STAT_STEP, UNLOCKS, statCost } from "@/lib/marketplace/casino-perks.js";

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

    // ── THE SHELF IS CHESTS. THAT IS THE WHOLE SHELF. ────────────────────────────────────────────────────
    // Luke: "remove all things you can buy except for chests." It used to also sell three decorations, two
    // gems, two bundles of forge parts and two consumable packs, and every one of those was a SECOND, worse
    // route to a thing another feature already hands out — a sapphire you can cut at the Jewelcutter, parts
    // the Forge pays you in, a lamp post the farm sells. A counter that sells nine kinds of thing is a
    // counter with no answer to "what are chips for".
    //
    // Chips are for chests. One ladder, five rungs, and the top two are the only route in the game to a
    // celestial or primordial piece. That is a currency a member can hold an opinion about.
    //
    // ── AND THREE TIMES WHAT THEY WERE ───────────────────────────────────────────────────────────────────
    // Luke: "triple the cost of all chests." Every price below is exactly 3x what it was, so the SHAPE of
    // the ladder is untouched — each rung is still about 2.5x the one under it — and only the distance to
    // the first rung has moved. A chip is minted at CHIP_RATE per gold STAKED rather than lost, so chips
    // pile up far faster than gold drains and the old anchor put a Mythic inside an evening. These are
    // meant to be the thing you save for, and the Primordial the thing you save for all year.
    //
    // Repeatable, deliberately: `once` is right for a decoration you either own or do not, and wrong for a
    // chest, which is the whole reason to come back.
    { id: "chest_mythic", kind: "chest", ref: "mythic", name: "Mythic Chest", price: 10500,
        blurb: "Legendaries are ordinary in here. Mythics are not." },
    { id: "chest_ascendant", kind: "chest", ref: "ascendant", name: "Ascendant Chest", price: 27000,
        blurb: "The first chest that can hand you an ascendant piece at all." },
    { id: "chest_eternal", kind: "chest", ref: "eternal", name: "Eternal Chest", price: 60000,
        blurb: "Nothing below it opens this often onto the eternal tier." },
    { id: "chest_celestial", kind: "chest", ref: "celestial", name: "Celestial Chest", price: 135000,
        blurb: "One of only two chests that can hold a celestial piece." },
    { id: "chest_primordial", kind: "chest", ref: "primordial", name: "Primordial Chest", price: 300000,
        blurb: "The rarest object on the floor. A one percent tail on the rarest tier in the game." },
];
// ── AND THE VENDOR BEHIND THE ROPE ─────────────────────────────────────────────────────
// Luke: "a VIP only vendor next to the bartender — he has a secret list of things that you can only get from
// him if you're in the VIP room, that you spend your chips to get, like maybe two or three unique pets."
//
// The SAME shelf machinery, with a flag. `vip: true` items are refused by buyWithChips unless the buyer has
// VIP standing at the moment of purchase, and they never appear on the Counter's list at all — a shelf that
// shows you three things you cannot buy is a shelf that exists to make you feel outside.
//
// These are the only `once` items left in the file, and correctly so: a pet is a thing you either own or do
// not, and the partial unique index in migration 398 enforces it server-side.
//
// PRICED AGAINST THE CHESTS, which is the only honest reference now that the Counter sells nothing else. A
// Mythic chest is 10,500; the cheapest pet here is worth about four of them and the dearest about fourteen.
// They pay nothing and do nothing — Luke, on wiring luck to them: "nevermind don't do the luck" — so what
// they cost is entirely a statement about what they ARE, which is the last thing left to buy.
// ── THE THREE UNIQUE PETS ───────────────────────────────────────────────────────
// Luke: "you can buy unique pets, and inspect them before you buy. 20,000 chips for each."
//
// These were 40k/90k/150k behind the VIP rope. Repriced flat and moved onto the Counter, because a flat price
// is what he asked for and because three pets at three prices implied a ladder between them that does not
// exist — they are the same rarity of thing, and which one you want is taste rather than tier.
//
// INSPECTABLE: `kind: "pet"` resolves through detailFor() below, which reads the pet's real card — its
// sprite, its rarity and what its passive actually does — so the inspect panel cannot drift from the pet.
export const VIP_STORE = [
    { id: "vip_ferret", kind: "pet", ref: "house_ferret", name: "The House Ferret", price: 20000, once: true, vip: true,
        blurb: "Knows which floorboard the chips roll under." },
    { id: "vip_lynx", kind: "pet", ref: "velvet_lynx", name: "Velvet Lynx", price: 20000, once: true, vip: true,
        blurb: "Has never once been asked to leave." },
    { id: "vip_crane", kind: "pet", ref: "midnight_crane", name: "Midnight Crane", price: 20000, once: true, vip: true,
        blurb: "Stands at the end of the bar and misses nothing." },
];

// ── THE PERMANENT SHELF ────────────────────────────────────────────────────────
// DERIVED from casino-perks.js rather than typed out again. Those definitions already carry the name, the
// blurb and the price; restating them here would be two lists to keep in step, and the one that drifts is
// always the one the player is looking at.
export const STAT_STORE = STAT_TRACKS.map((t) => ({
    id: `stat_${t.perk}`, kind: "stat", ref: t.perk, name: t.name, blurb: t.blurb, art: t.art,
    // Priced per member — see basePriceFor. The 0 is a placeholder the shelf never shows.
    price: 0, stat: t.stat, per: t.per,
}));

export const UNLOCK_STORE = UNLOCKS.map((u) => ({
    id: `unlock_${u.perk}`, kind: "unlock", ref: u.perk, name: u.name, blurb: u.blurb, art: u.art,
    price: u.price, once: true,
}));

// Both shelves are looked up through one function, because `chipItem` is what buyWithChips validates against
// and a second lookup table is how an item becomes purchasable from the wrong room.
export const chipItem = (id) => CHIP_STORE.find((i) => i.id === id)
    || VIP_STORE.find((i) => i.id === id)
    || STAT_STORE.find((i) => i.id === id)
    || UNLOCK_STORE.find((i) => i.id === id)
    || null;

// ── WHAT THE FLOOR'S OWN TROPHIES ARE WORTH AT THE COUNTER ────────────────────────────────
// Luke: "the pets and the badges that you get from the casino should give you casino benefits like discounts."
// (He also asked for a luck bonus and then withdrew it — "nevermind don't do the luck" — so there is none,
// and nothing in this file touches a payout table.)
//
// A DISCOUNT IS THE SAFE LEVER, and it is worth being precise about why, because the obvious alternative is
// not. Anything that raises what a machine RETURNS has to be re-priced against the ceiling every time a new
// perk is added, and check:casino exists because that is exactly how a floor turns into a money printer. A
// discount cannot do that: it moves what chips BUY, which is a number priced by hand in this file and nowhere
// else. The worst case is that chests get cheaper, which is a thing anybody can see and reverse in one line.
//
// SMALL, AND CAPPED HARD. Owning all five casino pets and all nine casino badges is a very long road and it
// comes to 15% off — about a rung and a half down the chest ladder. Big enough to be worth having, nowhere
// near big enough to be the reason to chase them.
export const DISCOUNT_PER_PET = 0.015;
export const DISCOUNT_PER_BADGE = 0.005;
export const DISCOUNT_MAX = 0.15;

/**
 * What this member pays, as a fraction off. Rounded DOWN to whole chips at the point of sale so a discount
 * can never produce a fractional price, and clamped so no future badge can push it past the cap by accident.
 */
export function counterDiscount({ pets = 0, badges = 0 } = {}) {
    const raw = (Number(pets) || 0) * DISCOUNT_PER_PET + (Number(badges) || 0) * DISCOUNT_PER_BADGE;
    return Math.max(0, Math.min(DISCOUNT_MAX, raw));
}

/** The price after the discount. One function, used by the shelf AND by the till — see the note in
 *  chip-store.js about what happens when a screen and a payment path each do their own arithmetic. */
export const pricedFor = (price, discount) => Math.max(1, Math.round(Number(price) * (1 - (discount || 0))));

// ── WHAT AN ITEM COSTS BEFORE THE DISCOUNT ───────────────────────────────────────────
// Most items are a number in the list above. A STAT TRACK is not: it is 250 for the first level and 250 more
// every time, for ever, so its price is a function of how many the member already has.
//
// This exists so the shelf and the till can ask the same question and get the same answer. The till does NOT
// take a price from the client — it recomputes from the member's own level at the moment of sale, so a stale
// screen quotes the old price and then gets charged the real one rather than the other way round.
export const basePriceFor = (item, perks = {}) => (
    item.kind === "stat" ? statCost(Number(perks[item.ref]) || 0) : Number(item.price) || 0
);

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
    // AWAITED, and still best-effort. Un-awaited it was a fire-and-forget write on Vercel, which tears the
    // sandbox down the moment the handler returns - the row lands only if the fetch happens to finish
    // first. The .catch keeps a ledger failure from breaking the move it is recording.
    await db.query(
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
        // ── A PERMANENT POINT OF A STAT ──────────────────────────────────────────────────
        // The numbers are read from STAT_TRACKS rather than typed here, so a retune moves the card with it.
        case "stat": {
            const t = STAT_TRACKS.find((x) => x.perk === item.ref);
            if (!t) return null;
            return {
                art: t.art || null,
                blurb: t.blurb,
                lines: [
                    { label: "Each purchase", value: `+${t.per} ${t.stat}` },
                    { label: "First point", value: `${STAT_STEP.toLocaleString()} chips` },
                    { label: "Every point after", value: `${STAT_STEP.toLocaleString()} more than the last` },
                ],
                foot: "Permanent, and it counts everywhere your gear does — the Arena, the Road, raids and ship battles. There is no ceiling.",
            };
        }
        // ── A DOOR ──────────────────────────────────────────────────────────────────
        // Deliberately vague about the CONTENTS. What is behind each of these is meant to be found rather
        // than read off a shelf, and a card listing "six species, eight recipes, a hundred rungs" would hand
        // over most of what was bought before the chips were spent.
        case "unlock": {
            const u = UNLOCKS.find((x) => x.perk === item.ref);
            if (!u) return null;
            return {
                art: u.art || null,
                blurb: u.blurb,
                lines: [{ label: "Bought", value: "Once, and it never expires" }],
                foot: "Nothing in the game hints at what is behind this until it is open.",
            };
        }
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
            const [{ CHEST_TIERS }, { getChestArt }, { RARITY_META, rarityRank }] = await Promise.all([
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
                // Best first, down the LADDER — not by percentage. Sorted by weight the list came out
                // Legendary, Epic, Mythic, Ascendant, which is the one order nobody reads a chest in: the
                // question a chest answers is how far up it reaches, so the top of the ladder goes first.
                lines: Object.entries(t.weights || {})
                    .sort((a, b) => rarityRank(b[0]) - rarityRank(a[0]))
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

// ── THE TROPHIES THIS MEMBER ACTUALLY HOLDS ───────────────────────────────────────────
// Counted from the two tables that already own the answer rather than from any tally of our own — a counter
// the store keeps for itself is a counter that can disagree with what somebody actually owns, and this one
// decides what they pay.
//
// Both queries are pinned to the CASINO's own ids: `casino_%` badges and the five `casinoExclusive` pets. A
// discount that quietly counted every badge in the game would grow every time anybody shipped one.
export async function casinoTrophies(buyerId) {
    if (!buyerId) return { pets: 0, badges: 0 };
    const { COLLECTIBLES } = await import("@/lib/marketplace/collectibles.js");
    const casinoPets = COLLECTIBLES.filter((c) => c.casinoExclusive).map((c) => c.id);
    const [pets, badges] = await Promise.all([
        db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_cosmetic_unlock
              WHERE buyer_id = $1 AND category = 'pet' AND ref = ANY($2)`,
            [buyerId, casinoPets],
        ).catch(() => null),
        db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_user_badge WHERE buyer_id = $1 AND badge_slug LIKE 'casino\\_%'`,
            [buyerId],
        ).catch(() => null),
    ]);
    return { pets: Number(pets?.n || 0), badges: Number(badges?.n || 0) };
}

/**
 * The shelf as this member sees it: once-only things they already own are marked rather than hidden, because
 * a shelf that quietly shrinks reads as things going missing.
 *
 * `vip` selects WHICH shelf. The Counter never lists the vendor's pets and the vendor never lists chests —
 * two rooms, two lists, one set of machinery. Showing the VIP items greyed out on the public Counter was the
 * obvious alternative and it is the wrong one: a shelf whose job is to show you three things you cannot buy
 * exists to make you feel outside.
 */
export async function chipShelf(buyerId, { vip = false, shelf = null } = {}) {
    // `shelf` names which counter is asking. `vip` is kept for the vendor behind the rope, which was the
    // first caller and is the one that must never show anything else.
    const list = shelf === "stat" ? STAT_STORE
        : shelf === "unlock" ? UNLOCK_STORE
            : vip ? VIP_STORE : CHIP_STORE;
    const { getCasinoPerks } = await import("@/lib/marketplace/casino-perks.js");
    const [balance, owned, trophies, perks] = await Promise.all([
        chipBalance(buyerId), ownedOnce(buyerId), casinoTrophies(buyerId), getCasinoPerks(buyerId),
    ]);
    const discount = counterDiscount(trophies);
    const details = await Promise.all(list.map((i) => detailFor(i).catch(() => null)));
    return {
        balance,
        // What the floor's own trophies are taking off, and what earned it — a discount nobody can see the
        // source of is a discount nobody believes they have, which is the same argument as the pet rail at
        // the top of the casino screen.
        discount,
        trophies,
        // The rate goes with the shelf so the screen can print the GOLD behind every price without keeping
        // its own copy of it. A second copy is a shelf that lies the day the rate moves — and it moved once
        // already, 0.08 to 0.25, which is exactly when a hardcoded copy would have started quoting prices
        // three times too low.
        rate: CHIP_RATE,
        // What the member already has, so the stat cards can show "level 7 -> 8" rather than a bare price and
        // the unlock cards can show themselves as bought.
        perks,
        items: list.map((i, n) => ({
            id: i.id, kind: i.kind, name: i.name, blurb: i.blurb,
            // A stat track's level, and what the next point is worth. Absent on everything else.
            level: i.kind === "stat" ? (Number(perks[i.ref]) || 0) : undefined,
            per: i.kind === "stat" ? i.per : undefined,
            stat: i.kind === "stat" ? i.stat : undefined,
            // `price` is what it COSTS THIS MEMBER, and `was` is the list price when the two differ. The till
            // recomputes the same number from the same function rather than trusting this one — see
            // buyWithChips. A screen and a payment path doing their own arithmetic is how somebody gets
            // charged a price they were never shown.
            price: pricedFor(basePriceFor(i, perks), discount),
            was: discount > 0 ? basePriceFor(i, perks) : null,
            once: Boolean(i.once),
            // An UNLOCK is owned when the perk row exists, not when a receipt does — the perk is the thing
            // that gates the feature, so it has to be the thing that says "you have this".
            owned: i.kind === "unlock" ? (Number(perks[i.ref]) || 0) > 0 : owned.has(i.id),
            afford: balance >= pricedFor(basePriceFor(i, perks), discount),
            ...(details[n] || {}),
            // The shelf's own blurb wins over the catalogue's — it is written for this counter.
            blurb: i.blurb,
            detail: details[n]?.blurb || null,
        })),
    };
}
