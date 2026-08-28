// ── WHICH OF THESE IS BETTER FOR ME? ─────────────────────────────────────────────────────────────────────────
// A pure scoring module for SORTING gear. It exists because the gear screen could not answer the one question
// a gear screen is for — Luke: "we also need to come up with a way to make it way easier to figure out what
// items I should equip. its hard looking in the backpack below."
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────────────────
// It is NOT a claim about true power. The only honest measure of that is a bout, and the Arena already runs
// one. Stats interact — armour is multiplied by Tenacity, damage by Might, crit power is worth nothing without
// crit chance — and a single number can never carry that. What this does is rank a bag so the best few
// candidates float to the top of a list instead of being hunted for, and show what changes if you swap. Say
// "worth a look", never "this is stronger".
//
// Pure data and arithmetic — no server-only imports — because the gear screen is a client component.

/** Per-point worth of each stat, on one arbitrary scale. A heuristic, and deliberately a coarse one. */
export const STAT_WEIGHT = {
    // The piece itself. Damage is what Might multiplies, so it is the biggest single number on a weapon;
    // speed runs 0.8-2.3 rather than in points, hence the large multiplier on a small range.
    base_damage: 2, speed: 40, armor: 1.5, block_chance: 1.5,
    // The four you build.
    might: 3, vitality: 1, ferocity: 1.5, tenacity: 1,
    // The crits. Chance is worth more than power because power does nothing on its own.
    crit_chance: 2, crit_power: 1,
    // The rare ones — scarce on gear, so a point of one is worth more than a point of a common stat.
    pierce: 2, lifesteal: 2, counter: 1.5, doublestrike: 3, stun: 1.5, haste: 1.5,
    // Fortune was 0.2 when it was raffle tickets and nothing else — and it was not even that, since the draw
    // only ever read the pet half of it. It is luck now: better drop rates in every feature plus a lifted
    // floor on damage rolls, which is worth having on a piece without ever being the reason to wear it.
    fortune: 1, extra_strike: 5,
};

/** Every stat a member can nominate as one they care about, in the order the chooser lists them. */
export const PRIORITY_STATS = [
    "might", "vitality", "armor", "tenacity", "ferocity", "crit_chance", "crit_power",
    "lifesteal", "pierce", "doublestrike", "counter", "stun", "haste", "block_chance", "fortune",
];

// What nominating a stat is worth. Not "only this stat counts" — a piece that is enormous everywhere else is
// still worth seeing — so a priority TRIPLES a stat rather than zeroing the others.
export const PRIORITY_MULT = 3;

/** Score one stat block. `priorities` is a Set (or array) of stat keys the member said they care about. */
export function scoreStats(stats = {}, priorities = null) {
    const want = priorities instanceof Set ? priorities : new Set(priorities || []);
    let total = 0;
    for (const [k, v] of Object.entries(stats || {})) {
        const n = Number(v) || 0;
        if (!n) continue;
        total += n * (STAT_WEIGHT[k] ?? 1) * (want.has(k) ? PRIORITY_MULT : 1);
    }
    return Math.round(total);
}

/**
 * What changes if you put `next` on in place of `now`. Returns one row per stat that MOVED, biggest first —
 * the answer to "is this an upgrade" is the list of differences, not a verdict.
 */
export function statDelta(now = {}, next = {}) {
    const keys = new Set([...Object.keys(now || {}), ...Object.keys(next || {})]);
    const rows = [];
    for (const k of keys) {
        const a = Number(now?.[k]) || 0;
        const b = Number(next?.[k]) || 0;
        if (a === b) continue;
        rows.push({ stat: k, from: a, to: b, diff: b - a });
    }
    // By how much the swap moves the SCORE of that line, so a +10 Armour outranks a +1 Fortune rather than
    // being sorted beside it by raw number.
    rows.sort((x, z) => Math.abs(z.diff * (STAT_WEIGHT[z.stat] ?? 1)) - Math.abs(x.diff * (STAT_WEIGHT[x.stat] ?? 1)));
    return rows;
}
