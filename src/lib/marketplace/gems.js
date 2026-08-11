// ── GEMS, SOCKETS AND THE JEWELCUTTER ────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the Jewelcutter screen and the engine read the same catalog, so what a gem
// promises on the bench is exactly what it pays in a fight.
//
// WHY GEMS AND NOT MORE GEAR. The Den already has gear you find, gear you forge and gear you buy; what it has
// never had is a reason to keep a piece you already like. A socket is that reason — the item stops being a
// number you replace and becomes a thing you invest in. And because the gem is separate from the item, a lucky
// drop is useful the moment it lands rather than only if it happens to beat what you are wearing.
//
// FIVE KINDS, one per combat stat, so choosing a gem is choosing what kind of fighter this piece makes you.
// FIVE TIERS, because a gem should be a thing you upgrade toward rather than a coin flip you either won or did
// not. And a SIXTH kind that is not on the list: see WOLF'S EYE below.

// The five, each married to one stat from STAT_META. Colours are the gem's own, and they are what the socket
// glows once something is in it.
export const GEM_KINDS = [
    { id: "ruby", name: "Ruby", stat: "might", color: "#ff5a6a", blurb: "Blood-red, and it hits like it." },
    { id: "sapphire", name: "Sapphire", stat: "ferocity", color: "#4aa3ff", blurb: "Cold fire. It never stops working." },
    { id: "emerald", name: "Emerald", stat: "fortune", color: "#4fd18b", blurb: "Luck, cut into facets." },
    { id: "topaz", name: "Topaz", stat: "crit_chance", color: "#ffc042", blurb: "Finds the gap in the armour." },
    { id: "amethyst", name: "Amethyst", stat: "crit_power", color: "#b98cff", blurb: "Makes the good ones hurt." },
];

// ── THE SIXTH ────────────────────────────────────────────────────────────────────────────────────────────────
// Not in GEM_KINDS on purpose: it is not one of the five and it is not meant to be shopped for. The Wolf's Eye
// pays a LITTLE of everything, which no single-stat gem can do at any tier, and it only ever comes out of the
// deep dark of the mine. Nothing in the game advertises it — the first anyone hears of it should be the moment
// one lands in their bag.
export const WOLF_EYE = { id: "wolfeye", name: "Wolf's Eye", stat: "all", color: "#e8dcc6", blurb: "It is looking back." };

// Chipped is a common drop; Flawless is a run of luck you tell people about. The curve is deliberately steep
// at the top so the last tier stays worth chasing after the first four have stopped being exciting.
export const GEM_TIERS = [
    { tier: 1, name: "Chipped", value: 2, all: 1, sort: 1 },
    { tier: 2, name: "Flawed", value: 4, all: 1, sort: 2 },
    { tier: 3, name: "Polished", value: 7, all: 2, sort: 3 },
    { tier: 4, name: "Brilliant", value: 11, all: 3, sort: 4 },
    { tier: 5, name: "Flawless", value: 16, all: 4, sort: 5 },
];

export const gemId = (kind, tier) => `${kind}_t${tier}`;
export const tierByN = (n) => GEM_TIERS.find((t) => t.tier === Number(n)) || null;
export const kindById = (id) => (id === WOLF_EYE.id ? WOLF_EYE : GEM_KINDS.find((k) => k.id === id) || null);

/** Every gem that exists: five kinds x five tiers, plus the Wolf's Eye at each tier. */
export const GEMS = [...GEM_KINDS, WOLF_EYE].flatMap((k) =>
    GEM_TIERS.map((t) => ({
        id: gemId(k.id, t.tier),
        kind: k.id,
        tier: t.tier,
        name: `${t.name} ${k.name}`,
        color: k.color,
        blurb: k.blurb,
        secret: k.id === WOLF_EYE.id,
        // What it actually pays, in the same vocabulary the rest of the game's stats use.
        art: `/images/gems/${gemId(k.id, t.tier)}.png`,
        stats: k.stat === "all"
            ? Object.fromEntries(GEM_KINDS.map((x) => [x.stat, t.all]))
            : { [k.stat]: t.value },
    })));

/** Where a gem's painted sprite lives. Thirty of them — the CUT carries the tier, the colour carries the kind,
 *  so a glance tells you both without reading a word. See scripts/gen-gem-sprites.mjs. */
export const gemArt = (id) => `/images/gems/${id}.png`;

const BY_ID = new Map(GEMS.map((g) => [g.id, g]));
export const gemById = (id) => BY_ID.get(String(id || "")) || null;

/**
 * Merge a set of socketed gem ids into one stat total, the way sumItemStats does for gear.
 *
 * `powers` is the wearer's ascension power set, because two of them change what a set gem is worth and this is
 * the only place that answer is computed:
 *   THE JEWELLER'S EYE  every gem counts as one tier higher (a Polished pays like a Brilliant)
 *   THE DEEP FACET      a gem also gives its stat to the piece beside it, so each one counts twice
 * Both are conditional on the gear being worn — they change what your gems are WORTH, and write nothing back
 * onto the gem or the socket.
 */
export function sumGemStats(gemIds = [], powers = null) {
    const upTier = powers?.has?.("jeweller_s_eye");
    const doubled = powers?.has?.("deep_facet");
    const total = {};
    for (const id of gemIds) {
        let g = gemById(id);
        if (!g) continue;
        if (upTier) g = gemById(gemId(g.kind, Math.min(GEM_TIERS.length, g.tier + 1))) || g;
        for (const [k, v] of Object.entries(g.stats)) total[k] = (total[k] || 0) + v * (doubled ? 2 : 1);
    }
    return total;
}

// ── THE BENCH ────────────────────────────────────────────────────────────────────────────────────────────────
// Cutting a socket is meant to be a real decision about a piece you intend to keep, so it is priced like one
// and it scales with the item's rarity: putting a socket in a mythic is a commitment, putting one in a common
// is a cheap experiment that teaches you what sockets do.
export const SOCKET_COST = {
    common: 1500, rare: 3000, epic: 6000, legendary: 12000, mythic: 20000, ascendant: 30000, eternal: 40000,
};
export const socketCost = (rarity) => SOCKET_COST[rarity] || SOCKET_COST.common;

// Three of a kind make one of the tier above. Three rather than two because two is an upgrade path so cheap
// that the lower tiers stop being drops and start being currency.
export const FUSE_COUNT = 3;
// The Steady Bench drops it to two. The fuse CANNOT FAIL — it is a deterministic spend-three-get-one — so the
// power as first written ("a failed fuse returns all three gems") was aimed at an outcome that does not exist.
// What it can honestly do is make the ladder cheaper.
export const fuseCountFor = (powers) => (powers?.has?.("steady_bench") ? 2 : FUSE_COUNT);

// ── AND THE LADDER STOPS AT POLISHED ─────────────────────────────────────────────────────────────────────────
// Fusing tops out at tier 3. Anything above it has to come out of the rock.
//
// Without this ceiling the top of the game is arithmetic: nine Polished make a Flawless, Polished are on sale
// in the Armoury for laurels, so the best jewel in the game costs about ten thousand laurels and a spreadsheet
// — no depth, no risk, no luck. A Brilliant should be a good year and a Flawless should be a thing the Den
// hears about, and neither is possible if they can be assembled.
//
// Chipped through Polished still fuse, which is what keeps the shallow mine's chips worth picking up.
export const FUSE_MAX_TIER = 3;

// ONE socket per piece for now. Written as a number rather than a boolean because the bench is the only thing
// that would have to change to allow two, and every read below already counts rather than tests.
export const MAX_SOCKETS = 1;

// Pulling a gem back out breaks it. That is the point of the choice — otherwise a socket is a slot you shuffle
// per opponent and the decision costs nothing. Stated everywhere the button appears.
export const UNSOCKET_DESTROYS = true;
