// ── THE ARMOURY ──────────────────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the shelf and the roll read the same tables, so what a crate promises is what
// it can actually contain.
//
// IT USED TO BE A PRICE LIST: eleven rows, each a known thing for a known number, which makes spending laurels
// an arithmetic exercise you do once and then repeat forever. You worked out that the gold chest was the best
// value, and from then on the Armoury was one button you pressed whenever you could afford it.
//
// Three CRATES now, and what comes out is rolled. The decision is which crate, not which item — and that is a
// real decision, because the crates are not the same table at different prices: the cheap one is mostly small
// certain things, the expensive one has a long tail with the best rolls in the game on the end of it.
//
// ── HOW THESE ARE BALANCED ───────────────────────────────────────────────────────────────────────────────────
// Every entry is priced against what the OLD fixed shelf charged for the same thing, so the numbers are not
// invented: a wooden chest was 130 laurels, iron 340, gold 900, mythic 2,400; parts t3x3 280, t4x2 560, t5 980;
// a tier-1 jewel 240, tier-2 520, tier-3 1,150; Tome of Wisdom 260, Ancient Codex 900, Enchantment Scroll
// 1,100. `worth` below is that laurel value, and it is what makes the expected value computable rather than
// vibed — see armouryEv(), which the test at the bottom of this comment block keeps honest:
//
//   Footlocker  250 laurels -> EV ~288  (1.15x)
//   Strongbox   750 laurels -> EV ~862  (1.15x)
//   War Chest 2,000 laurels -> EV ~2,304 (1.15x)
//
// ⚠️ PRICES WERE RAISED ON 2026-08-11 (Luke: 1.2k / 5k / 12k) AND THE TABLES HAVE NOT MOVED YET, so those
// three lines describe the OLD prices and the invariants below are currently BROKEN:
//
//   Footlocker  1,200 -> EV ~289   (0.24x)   worst row 130   (0.11x)
//   Strongbox   5,000 -> EV ~890   (0.18x)   worst row 420   (0.08x)
//   War Chest  12,000 -> EV ~2,369 (0.20x)   worst row 1,100 (0.09x)
//
// Scaling the CONTENTS to restore 1.15x means roughly five times the payout per crate — five Mythic Chests
// out of a War Chest — which is a far bigger change to the wider economy than a price edit, so it is a
// decision rather than arithmetic and it is Luke's to make. Until it is made, these are a bad buy and the
// rule below is not true.
//
// A 15% premium over the old fixed prices is deliberate: you are giving up the ability to choose, and a
// gamble that pays exactly its price is strictly worse than the shop it replaced. It stays a sink either way —
// the alternative to spending is holding laurels, which do nothing.
//
// No crate can roll NOTHING, and no crate can roll something worth less than half its price. A random reward
// that can waste your money teaches people not to press the button.

const G = (n) => ({ kind: "gold", n, worth: Math.round(n / 3), label: `${n.toLocaleString()} gold` });
const CHEST = (tier, worth, label) => ({ kind: "chest", tier, worth, label });
const PARTS = (tier, n, worth, label) => ({ kind: "parts", tier, n, worth, label });
// Crates used to roll CHEST FRAGMENTS. Fragments are gone — you dig a chest up whole now — so these rows
// pay DOUBLOONS. Deliberately not laurels: the crate is bought WITH laurels, and a prize that hands back
// the currency you paid is a wash dressed up as a reward.
const DUB = (n, worth, label) => ({ kind: "doubloons", n, worth, label });
const CONS = (id, worth, label) => ({ kind: "consumable", consumable: id, n: 1, worth, label });
// Gem rows used to carry a STAND-IN for members who could not reach the Jewelcutter while it was gated —
// filtering them out instead would have handed those members a different table at the same price, and because
// the gem rows sit below their crate's average, removing them silently made the crate BETTER. The bench opened
// on 2026-08-10 and everybody can roll a jewel, so the stand-ins and the whole `jewels` parameter are gone.
const GEM = (tier, worth, label) => ({ kind: "gem", gemTier: tier, worth, label });
const FIGHTS = (n, worth, label) => ({ kind: "fights", n, worth, label });

export const CRATES = [
    {
        id: "crate_1",
        name: "Footlocker",
        cost: 1200,
        art: "/images/arena/armoury/crate_1.png",
        blurb: "Somebody's kit, broken open. Small things mostly — but nothing in here is a wasted press.",
        table: [
            { w: 24, ...G(900) },
            { w: 16, ...CHEST("iron", 340, "Iron Chest") },
            { w: 14, ...PARTS(2, 6, 240, "Iron Filings ×6") },
            { w: 12, ...DUB(30, 250, "30 Doubloons") },
            { w: 10, ...CONS("scroll_wisdom", 260, "Tome of Wisdom") },
            { w: 9, ...PARTS(3, 3, 280, "Tempered Steel ×3") },
            { w: 7, ...CHEST("wooden", 130, "Wooden Chest") },
            { w: 5, ...GEM(1, 240, "A Chipped Jewel") },
            { w: 2, ...CHEST("gold", 900, "Gold Chest") },
            { w: 1, ...CONS("scroll_ancient", 900, "Ancient Codex") },
        ],
    },
    {
        id: "crate_2",
        name: "Strongbox",
        cost: 5000,
        art: "/images/arena/armoury/crate_2.png",
        blurb: "Iron-bound and heavy. The middle of everything the ladder pays, with a real edge on top.",
        table: [
            { w: 20, ...G(3000) },
            { w: 16, ...CHEST("gold", 900, "Gold Chest") },
            { w: 14, ...PARTS(4, 3, 840, "Mythril Dust ×3") },
            { w: 12, ...DUB(95, 760, "95 Doubloons") },
            { w: 10, ...CONS("scroll_ancient", 900, "Ancient Codex") },
            { w: 9, ...GEM(2, 520, "A Flawed Jewel") },
            { w: 7, ...CONS("forge_enchant_scroll", 1100, "Enchantment Scroll") },
            { w: 6, ...PARTS(5, 1, 980, "Emberheart Shard") },
            { w: 4, ...FIGHTS(2, 420, "Second Wind — two more challenges today") },
            { w: 2, ...CHEST("mythic", 2400, "Mythic Chest") },
        ],
    },
    {
        id: "crate_3",
        name: "War Chest",
        cost: 12000,
        art: "/images/arena/armoury/crate_3.png",
        blurb: "The best the ladder will hand over. Nothing in here is small, and one thing in here is a story.",
        table: [
            { w: 22, ...CHEST("mythic", 2400, "Mythic Chest") },
            { w: 17, ...G(9000) },
            { w: 14, ...PARTS(5, 3, 2940, "Emberheart Shard ×3") },
            { w: 12, ...GEM(3, 1150, "A Polished Jewel") },
            { w: 11, ...DUB(300, 2460, "300 Doubloons") },
            { w: 9, ...CONS("forge_enchant_scroll", 1100, "Enchantment Scroll") },
            { w: 8, ...CHEST("gold", 1800, "Gold Chest ×2"), n: 2 },
            { w: 5, ...PARTS(5, 5, 4900, "Emberheart Shard ×5") },
            { w: 2, ...GEM(3, 1150, "A Polished Jewel") },
        ],
    },
];

export const crateById = (id) => CRATES.find((c) => c.id === String(id || "")) || null;

/**
 * Expected laurel value of a crate, for the member the roll is FOR.
 *
 */
/**
 * The picture for a row of a crate table.
 *
 * Every one of these rewards already has art somewhere in the game — the chest tiers, the forge part tiers,
 * the sailing fragments, the jewels, the consumables. The shelf was drawing none of it: nine lines of text and
 * a percentage each, on the screen that asks you to weigh twelve thousand laurels.
 *
 * `chests` and `consumables` are passed in because both live in the database (mkt_town_art / a settings blob
 * and mkt_consumable_sprite) and this file is pure. Anything without a picture falls back to null and the row
 * draws its glyph, which is what it did before.
 */
export function rowArt(row, { chests = {}, consumables = {}, parts = {} } = {}) {
    if (!row) return null;
    if (row.kind === "chest") { const v = chests[row.tier]; return (typeof v === "string" ? v : v?.url) || null; }
    if (row.kind === "consumable") return consumables[row.consumable] || null;
    if (row.kind === "parts") return parts[row.partTier] || null;
    if (row.kind === "doubloons") return "/images/sailing/doubloon.png";
    if (row.kind === "gem") return `/images/gems/ruby_t${row.gemTier}.png`;
    if (row.kind === "gold") return "/images/ui/coin.png";
    return null;
}

export function armouryEv(crate) {
    const rows = rollable(crate);
    const total = rows.reduce((n, r) => n + r.w, 0);
    return Math.round(rows.reduce((n, r) => n + r.w * r.worth, 0) / (total || 1));
}

/** The rows a crate can roll. Every member sees the same table — there is nothing left to gate. */
export function rollable(crate) {
    return crate?.table || [];
}

/** Draw one, weighted. */
export function rollCrate(crate, { random = Math.random } = {}) {
    const rows = rollable(crate);
    const total = rows.reduce((n, r) => n + r.w, 0);
    let roll = random() * total;
    return rows.find((r) => (roll -= r.w) <= 0) || rows[rows.length - 1];
}
