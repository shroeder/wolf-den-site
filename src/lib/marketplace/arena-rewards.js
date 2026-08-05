// ── WHAT THE ARENA PAYS ──────────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the fight screen, the ladder and the engine read the same catalog, so what you
// are promised is exactly what you are paid.
//
// TWO NUMBERS, ON PURPOSE.
//
//   VICTORY POINTS are RANK. Won by beating people, scaled by how hard they were, never spent and never taken
//   away. That is what makes it safe to fight anyone: there is no rung to fall off, so challenging up is a
//   free roll and challenging down is still worth something.
//
//   LAURELS are MONEY. Paid on every bout, win or lose, and spent in the Armoury.
//
// They are kept separate because collapsing them punishes you for shopping: if rank and currency were one
// number, buying a chest would cost you your place on the leaderboard.
//
// LAURELS ARE ALSO A CLOSED CURRENCY — earned only in the arena, spent only in the Armoury. That is what makes
// it safe to pay out on a loss. Paying gold would pump the Den's general economy, and this ladder is symmetric
// enough that a refund loop mints money out of nothing.

export const VP = { name: "Victory Point", plural: "Victory Points", short: "VP", color: "#ffd75e" };
export const LAUREL = { name: "Laurel", plural: "Laurels", color: "#c8b06a" };

// ── VICTORY POINTS ───────────────────────────────────────────────────────────────────────────────────────────
// Difficulty is the ONLY input, deliberately. Not your rank, not theirs, not how far you "reached" — just how
// much tougher than you the thing you beat actually was. That is the number a player can feel, and it means
// the leaderboard rewards picking hard fights rather than picking convenient ones.
export const VP_FLOOR = 0.3;    // beating something far weaker still pays, just not much
export const VP_CEIL = 2.5;     // and there is a ceiling, so a suicidal mismatch is not a strategy

export function vpFor({ won, myPower = 1, theirPower = 1 }) {
    if (!won) return 0;                       // points come from WINNING. Losing costs nothing, but pays none.
    const ratio = Math.max(VP_FLOOR, Math.min(VP_CEIL, (Number(theirPower) || 1) / Math.max(1, Number(myPower) || 1)));
    return Math.round(20 + 60 * ratio);
}

/** What you'd get for beating them — shown on the challenge list BEFORE you commit. */
export const vpPreview = (myPower, theirPower) => vpFor({ won: true, myPower, theirPower });

// ── LAURELS ──────────────────────────────────────────────────────────────────────────────────────────────────
// Every bout pays. A loss used to pay literally nothing, which made farming the weakest reachable opponent the
// correct play — a treadmill wearing a ladder's clothes. A defeat is a fraction of a win against the same
// opponent, so throwing yourself at something far too big is a consolation, never a strategy.
export const LOSS_SHARE = 0.3;
export function boutLaurels({ won, myPower = 1, theirPower = 1 }) {
    const ratio = Math.max(VP_FLOOR, Math.min(VP_CEIL, (Number(theirPower) || 1) / Math.max(1, Number(myPower) || 1)));
    const win = Math.round(18 + 34 * ratio);
    return won ? win : Math.max(4, Math.round(win * LOSS_SHARE));
}

// ── FEATS ────────────────────────────────────────────────────────────────────────────────────────────────────
// Performance, named. A two-beat demolition and a fifteen-beat scrape paid exactly the same before this, which
// is the same as saying the arena did not care how you fought.
//
// Every one is read off the bout log — things that actually happened, not a score. They are NAMED because a
// named thing is a thing you tell somebody about: "I won that on a Comeback" is a story, "+40" is not.
export const FEATS = [
    {
        id: "flawless", name: "Flawless", laurels: 55, vp: 10, color: "#fff0a8",
        blurb: "Won without dropping below nine tenths of your vigour.",
        test: (b) => b.won && b.hp / Math.max(1, b.maxHp) >= 0.9,
    },
    {
        id: "untouched", name: "Untouched", laurels: 80, vp: 20, color: "#8bf0b4",
        blurb: "Won without a single blow landing on you.",
        test: (b) => b.won && !(b.log || []).some((l) => l.who === "them" && l.damage > 0),
    },
    {
        id: "comeback", name: "Comeback", laurels: 70, vp: 15, color: "#ff9f1c",
        blurb: "Won from under a fifth of your vigour.",
        test: (b) => b.won && (b.lowHp ?? b.hp) / Math.max(1, b.maxHp) <= 0.2,
    },
    {
        id: "giantkiller", name: "Giant-Killer", laurels: 65, vp: 15, color: "#b061ff",
        blurb: "Beat a loadout a quarter stronger than yours.",
        test: (b) => b.won && (b.foe?.gearPower || 0) >= (b.me?.gearPower || 0) * 1.25,
    },
    {
        id: "clinical", name: "Clinical", laurels: 45, vp: 8, color: "#6fd0ff",
        blurb: "Won inside six rounds.",
        test: (b) => b.won && (b.beat || 99) <= 6,
    },
    {
        id: "bulwark", name: "Bulwark", laurels: 40, vp: 8, color: "#6fd0ff",
        blurb: "Turned aside half your own vigour over the bout.",
        test: (b) => {
            const stopped = (b.log || []).reduce((n, l) => n + (l.blocked || 0) + (l.soaked || 0), 0);
            return b.won && stopped >= Math.max(1, b.maxHp) * 0.5;
        },
    },
    {
        id: "upstream", name: "Against the Current", laurels: 50, vp: 10, color: "#4aa3ff",
        blurb: "Won with your affinity smothered by theirs.",
        test: (b) => b.won && (b.clash?.mult || 1) < 1,
    },
    {
        id: "devastating", name: "Devastating", laurels: 35, vp: 5, color: "#ffd75e",
        blurb: "Landed three or more critical hits.",
        test: (b) => (b.log || []).filter((l) => l.who === "you" && l.crit).length >= 3,
    },
    {
        id: "burned", name: "Slow Burn", laurels: 35, vp: 5, color: "#ff6b3c",
        blurb: "A burn you left behind finished more than a fifth of them.",
        test: (b) => {
            const burn = (b.log || []).filter((l) => l.grade === "burn").reduce((n, l) => n + (l.damage || 0), 0);
            return burn >= Math.max(1, b.foeMaxHp) * 0.2;
        },
    },
];

/** Every feat this bout earned, with the totals. Order is the catalog's, so a recap reads consistently. */
export function featsFor(bout) {
    const won = [];
    for (const f of FEATS) {
        let ok = false;
        // A broken test must never cost somebody their whole payout.
        try { ok = Boolean(f.test(bout)); } catch { ok = false; }
        if (ok) won.push({ id: f.id, name: f.name, laurels: f.laurels, vp: f.vp, color: f.color, blurb: f.blurb });
    }
    return {
        feats: won,
        laurels: won.reduce((n, f) => n + f.laurels, 0),
        vp: won.reduce((n, f) => n + f.vp, 0),
    };
}

// ── THE ARMOURY ──────────────────────────────────────────────────────────────────────────────────────────────
// The only sink for laurels, so this is where the currency gets its value. Deliberately a mix: things that
// make you stronger OUTSIDE the arena (chests, forge parts) so laurels matter to someone who mostly cares
// about the boss or the Forge, and things that change how you play the ladder, which nothing else sells.
export const ARMOURY = [
    { id: "chest_wooden", kind: "chest", chest: "wooden", cost: 130, name: "Wooden Chest", blurb: "Standard-issue loot." },
    { id: "chest_iron", kind: "chest", chest: "iron", cost: 340, name: "Iron Chest", blurb: "A real shot at something epic." },
    { id: "chest_gold", kind: "chest", chest: "gold", cost: 900, name: "Gold Chest", blurb: "Legendaries live in here." },
    { id: "chest_mythic", kind: "chest", chest: "mythic", cost: 2400, name: "Mythic Chest", blurb: "The best chest the ladder will sell you." },
    { id: "parts_t3", kind: "parts", tier: 3, count: 3, cost: 280, name: "Tempered Steel ×3", blurb: "Forge stock, straight from the sand." },
    { id: "parts_t4", kind: "parts", tier: 4, count: 2, cost: 560, name: "Mythril Dust ×2", blurb: "The tier the Forge bottlenecks on." },
    { id: "parts_t5", kind: "parts", tier: 5, count: 1, cost: 980, name: "Emberheart Shard", blurb: "One shard. You know what it is for." },
    {
        id: "secondwind", kind: "fights", count: 2, cost: 420, name: "Second Wind",
        blurb: "Two more challenges today.", note: "Today only — it does not bank.",
    },
];

export const armouryItem = (id) => ARMOURY.find((x) => x.id === id) || null;
