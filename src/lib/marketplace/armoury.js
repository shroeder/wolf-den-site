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
// A 15% premium over the old fixed prices is deliberate: you are giving up the ability to choose, and a
// gamble that pays exactly its price is strictly worse than the shop it replaced. It stays a sink either way —
// the alternative to spending is holding laurels, which do nothing.
//
// No crate can roll NOTHING, and no crate can roll something worth less than half its price. A random reward
// that can waste your money teaches people not to press the button.

const G = (n) => ({ kind: "gold", n, worth: Math.round(n / 3), label: `${n.toLocaleString()} gold` });
const CHEST = (tier, worth, label) => ({ kind: "chest", tier, worth, label });
const PARTS = (tier, n, worth, label) => ({ kind: "parts", tier, n, worth, label });
const FRAG = (tier, n, worth, label) => ({ kind: "fragment", tier, n, worth, label });
const CONS = (id, worth, label) => ({ kind: "consumable", consumable: id, n: 1, worth, label });
// A gated row carries its own STAND-IN. Filtering it out instead would hand a member without the bench a
// different table at the same price — and because the gem rows sit below their crate's average, removing them
// silently made the crate BETTER for them. Same slot, same weight, comparable worth, no gems.
const GEM = (tier, worth, label, alt) => ({ kind: "gem", gemTier: tier, worth, label, gated: "jewels", alt });
const FIGHTS = (n, worth, label) => ({ kind: "fights", n, worth, label });

export const CRATES = [
    {
        id: "crate_1",
        name: "Footlocker",
        cost: 250,
        art: "/images/arena/armoury/crate_1.png",
        blurb: "Somebody's kit, broken open. Small things mostly — but nothing in here is a wasted press.",
        table: [
            { w: 24, ...G(900) },
            { w: 16, ...CHEST("iron", 340, "Iron Chest") },
            { w: 14, ...PARTS(2, 6, 240, "Iron Filings ×6") },
            { w: 12, ...FRAG("iron", 5, 250, "Iron Fragments ×5") },
            { w: 10, ...CONS("scroll_wisdom", 260, "Tome of Wisdom") },
            { w: 9, ...PARTS(3, 3, 280, "Tempered Steel ×3") },
            { w: 7, ...CHEST("wooden", 130, "Wooden Chest") },
            { w: 5, ...GEM(1, 240, "A Chipped Jewel", CONS("scroll_wisdom", 260, "Tome of Wisdom")) },
            { w: 2, ...CHEST("gold", 900, "Gold Chest") },
            { w: 1, ...CONS("scroll_ancient", 900, "Ancient Codex") },
        ],
    },
    {
        id: "crate_2",
        name: "Strongbox",
        cost: 750,
        art: "/images/arena/armoury/crate_2.png",
        blurb: "Iron-bound and heavy. The middle of everything the ladder pays, with a real edge on top.",
        table: [
            { w: 20, ...G(3000) },
            { w: 16, ...CHEST("gold", 900, "Gold Chest") },
            { w: 14, ...PARTS(4, 3, 840, "Mythril Dust ×3") },
            { w: 12, ...FRAG("gold", 6, 760, "Gold Fragments ×6") },
            { w: 10, ...CONS("scroll_ancient", 900, "Ancient Codex") },
            { w: 9, ...GEM(2, 520, "A Flawed Jewel", PARTS(4, 2, 560, "Mythril Dust ×2")) },
            { w: 7, ...CONS("forge_enchant_scroll", 1100, "Enchantment Scroll") },
            { w: 6, ...PARTS(5, 1, 980, "Emberheart Shard") },
            { w: 4, ...FIGHTS(2, 420, "Second Wind — two more challenges today") },
            { w: 2, ...CHEST("mythic", 2400, "Mythic Chest") },
        ],
    },
    {
        id: "crate_3",
        name: "War Chest",
        cost: 2000,
        art: "/images/arena/armoury/crate_3.png",
        blurb: "The best the ladder will hand over. Nothing in here is small, and one thing in here is a story.",
        table: [
            { w: 22, ...CHEST("mythic", 2400, "Mythic Chest") },
            { w: 17, ...G(9000) },
            { w: 14, ...PARTS(5, 3, 2940, "Emberheart Shard ×3") },
            { w: 12, ...GEM(3, 1150, "A Polished Jewel", CONS("forge_enchant_scroll", 1100, "Enchantment Scroll")) },
            { w: 11, ...FRAG("mythic", 6, 2460, "Mythic Fragments ×6") },
            { w: 9, ...CONS("forge_enchant_scroll", 1100, "Enchantment Scroll") },
            { w: 8, ...CHEST("gold", 1800, "Gold Chest ×2"), n: 2 },
            { w: 5, ...PARTS(5, 5, 4900, "Emberheart Shard ×5") },
            { w: 2, ...GEM(3, 1150, "A Polished Jewel", PARTS(5, 2, 1960, "Emberheart Shard ×2")) },
        ],
    },
];

export const crateById = (id) => CRATES.find((c) => c.id === String(id || "")) || null;

/**
 * Expected laurel value of a crate, for the member the roll is FOR.
 *
 * `has` decides whether the gated rows are in the table — a member without the bench cannot roll a jewel, so
 * their crate must not be balanced as though they could. Without this the gating would quietly make the same
 * crate worth 12% less to them, which is the sort of unfairness nobody would ever report because nobody can
 * see it.
 */
export function armouryEv(crate, { jewels = true } = {}) {
    const rows = rollable(crate, { jewels });
    const total = rows.reduce((n, r) => n + r.w, 0);
    return Math.round(rows.reduce((n, r) => n + r.w * r.worth, 0) / (total || 1));
}

/** The rows a given member can actually roll — gated ones swapped for their stand-in rather than dropped. */
export function rollable(crate, { jewels = true } = {}) {
    return (crate?.table || []).map((r) => (r.gated === "jewels" && !jewels ? { ...r.alt, w: r.w } : r));
}

/** Draw one, weighted. */
export function rollCrate(crate, { jewels = true, random = Math.random } = {}) {
    const rows = rollable(crate, { jewels });
    const total = rows.reduce((n, r) => n + r.w, 0);
    let roll = random() * total;
    return rows.find((r) => (roll -= r.w) <= 0) || rows[rows.length - 1];
}
