// ── WHAT A CHEST IS WORTH IN COIN, BY TIER ───────────────────────────────────────────────────────────────────
// One table, two readers, and it has to stay that way.
//
// The dig pays this (scaled by how much of the chest you exposed) when you run out of light before finishing,
// and sea encounters price their old shard-kind loot lines off it too. Those two live in modules that cannot
// both own it — sailing.js imports encounters.js, so encounters.js cannot import sailing.js back — and the
// first version of this change simply pasted the numbers into both. That is the copied-balance-constant bug:
// retune one and the other quietly runs a second, wrong game, with nothing failing to tell you.
//
// Scale: a ship battle pays roughly a dozen doubloons, so a wooden chest missed by a whisker is worth about
// one and a half fights, and a primordial one is worth thirty.
export const DIG_CONSOLATION = {
    wooden: 18, iron: 30, gold: 50, mythic: 80,
    ascendant: 120, eternal: 180, celestial: 260, primordial: 360,
};

/** Coin for a loot line that used to hand out `n` shards of a tier. A sixth of the chest's own worth each. */
export const shardCoin = (tier = "wooden", n = 1) =>
    Math.max(1, Math.round(((DIG_CONSOLATION[tier] || DIG_CONSOLATION.wooden) / 6) * (Number(n) || 1)));
