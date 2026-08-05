// ── WHAT THE ARENA PAYS ──────────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the fight screen, the ladder and the engine all read the same catalog, so what
// you are promised is exactly what you are paid.
//
// WHAT WAS WRONG WITH PAYING GOLD AND XP FOR A WIN
//
// Three structural problems, none of them about the size of the numbers:
//
//   1. A LOSS PAID NOTHING. Ten challenges a day, and a defeat returned literally zero — so the correct play
//      was always to farm the weakest opponent inside your reach. A challenge ladder whose optimal strategy is
//      "pick the person you cannot lose to" is a treadmill wearing a ladder's clothes.
//   2. NOBODY HAD A REASON TO DEFEND. Holding a rung overnight paid a chest to exactly three members out of
//      eighty-four. The other eighty-one had no stake in the spot they were standing on.
//   3. THE LEADER COULD ONLY EVER LOSE. First place has nothing above it to take, so the best player in the Den
//      had no reason to open the app. The toll was built to fix this and was cut, correctly, because a price
//      you set with no risk of your own is a toll booth rather than a wager.
//
// So the arena pays in three ways now: for turning up (every bout, win or lose), for playing WELL (named feats
// off what actually happened in the ring), and for HOLDING GROUND (an accruing stake that a challenger can take
// off you). Gold and XP still pay out on a win — this sits on top rather than replacing them.

// ── LAURELS ──────────────────────────────────────────────────────────────────────────────────────────────────
// A closed currency: earned only in the arena, spent only in the arena. That is deliberate and it is the whole
// reason this is not just "more gold". Gold is the Den's general economy, and paying a ladder in gold pumps it
// — and the ladder is SYMMETRIC, so a win swaps two people who can then swap back forever. Anything above a 1x
// refund in that loop mints money out of nothing. Laurels cannot leak: the only sink is the Armoury below, and
// its prices are set here.
export const LAUREL = { name: "Laurel", plural: "Laurels", icon: "GiLaurelCrown", color: "#c8b06a" };

/**
 * What a bout pays before feats.
 *
 * A win scales with how far you REACHED — beating somebody one rung up is worth less than taking a spot six
 * rungs up, and taking a spot near the top is worth most of all.
 *
 * A loss pays too, and it scales with reach as well: a defeat against somebody far above you is the most
 * useful thing you can do with a challenge short of winning it. It is deliberately a FRACTION of a win at the
 * same reach, so throwing yourself at the top of the ladder for laurels is always worse than winning fights
 * you can win — a consolation, never a strategy.
 */
export const LOSS_SHARE = 0.3;
export function boutLaurels({ won, myPos, theirPos, size = 84 }) {
    const climb = Math.max(1, Number(myPos) - Number(theirPos));
    // Being near the top is worth more, as a fraction of the ladder rather than a fixed rung, so this keeps
    // meaning the same thing as the pack grows.
    const height = Math.max(0, 1 - (Number(theirPos) - 1) / Math.max(1, size - 1));
    const win = Math.round(22 + climb * 7 + height * 46);
    return won ? win : Math.max(4, Math.round(win * LOSS_SHARE));
}

// ── FEATS ────────────────────────────────────────────────────────────────────────────────────────────────────
// Performance, named. A two-beat demolition and a fifteen-beat scrape both paid exactly the same before this,
// which is the same as saying the arena did not care how you fought.
//
// Every one of these is read off the bout log — things that actually happened, not a score. They are named
// because a named thing is a thing you tell somebody about: "I won that on a Comeback" is a story, "+40" is not.
export const FEATS = [
    {
        id: "flawless", name: "Flawless", laurels: 55, color: "#fff0a8",
        blurb: "Won without dropping below nine tenths of your vigour.",
        test: (b) => b.won && b.hp / Math.max(1, b.maxHp) >= 0.9,
    },
    {
        id: "untouched", name: "Untouched", laurels: 80, color: "#8bf0b4",
        blurb: "Won without a single blow landing on you.",
        test: (b) => b.won && !(b.log || []).some((l) => l.who === "them" && l.damage > 0),
    },
    {
        id: "comeback", name: "Comeback", laurels: 70, color: "#ff9f1c",
        blurb: "Won from under a fifth of your vigour.",
        test: (b) => b.won && (b.lowHp ?? b.hp) / Math.max(1, b.maxHp) <= 0.2,
    },
    {
        id: "giantkiller", name: "Giant-Killer", laurels: 65, color: "#b061ff",
        blurb: "Beat a loadout a quarter stronger than yours.",
        test: (b) => b.won && (b.foe?.gearPower || 0) >= (b.me?.gearPower || 0) * 1.25,
    },
    {
        id: "clinical", name: "Clinical", laurels: 45, color: "#6fd0ff",
        blurb: "Won inside six rounds.",
        test: (b) => b.won && (b.beat || 99) <= 6,
    },
    {
        id: "executioner", name: "Executioner", laurels: 40, color: "#ff6f7d",
        blurb: "Finished them with a killing blow that was built for it.",
        test: (b) => {
            const last = (b.log || []).filter((l) => l.who === "you" && l.damage > 0).pop();
            if (!b.won || !last?.ability) return false;
            return (b.me?.abilities || []).some((a) => a.name === last.ability && a.kind === "execute");
        },
    },
    {
        id: "bulwark", name: "Bulwark", laurels: 40, color: "#6fd0ff",
        blurb: "Turned aside half your own vigour over the bout.",
        test: (b) => {
            const stopped = (b.log || []).reduce((n, l) => n + (l.blocked || 0) + (l.soaked || 0), 0);
            return b.won && stopped >= Math.max(1, b.maxHp) * 0.5;
        },
    },
    {
        id: "upstream", name: "Against the Current", laurels: 50, color: "#4aa3ff",
        blurb: "Won with your affinity smothered by theirs.",
        test: (b) => b.won && (b.clash?.mult || 1) < 1,
    },
    {
        id: "critical", name: "Devastating", laurels: 35, color: "#ffd75e",
        blurb: "Landed three or more critical hits.",
        test: (b) => (b.log || []).filter((l) => l.who === "you" && l.crit).length >= 3,
    },
];

/** Every feat this bout earned, with the total. Order is the catalog's, so a recap reads consistently. */
export function featsFor(bout) {
    const won = [];
    for (const f of FEATS) {
        let ok = false;
        // A broken test must never cost somebody their whole payout.
        try { ok = Boolean(f.test(bout)); } catch { ok = false; }
        if (ok) won.push({ id: f.id, name: f.name, laurels: f.laurels, color: f.color, blurb: f.blurb });
    }
    return { feats: won, laurels: won.reduce((n, f) => n + f.laurels, 0) };
}

// ── THE STANDING ─────────────────────────────────────────────────────────────────────────────────────────────
// Holding a rung earns laurels by the hour, and the higher you stand the faster it runs. It CAPS, so this is
// not idle income — it is a reason to come back and collect. And it is AT RISK: beat somebody and you take a
// share of whatever they have not banked yet.
//
// This is what the toll was reaching for and missed. The toll let a defender name a price while risking
// nothing, so the maximum price strictly dominated and the top of the ladder could freeze everyone out. Here
// the defender's exposure is the entire point: first place accrues the most and therefore has the most to lose,
// which is the first reason the best player in the Den has ever had to open the app.
//
// It also fixes target selection. Every challenge used to be "who is the weakest person above me"; now a member
// who has been sitting on a fat unclaimed stake is worth reaching for, and that is VISIBLE on the ladder. The
// most interesting fight and the safest fight stop being the same fight.
export const STANDING_CAP_HOURS = 12;      // stop accruing after this, so you have to turn up
export const SEIZE_SHARE = 0.4;            // of the loser's unbanked stake, taken by the winner
export const STANDING_MIN = 4;             // per hour at the bottom of the ladder
export const STANDING_MAX = 26;            // per hour at the very top

/** Laurels per hour for a rung. Position 1 is the top. */
export function standingRate(position, size) {
    const pos = Math.max(1, Number(position) || 1);
    const n = Math.max(2, Number(size) || 2);
    const height = 1 - (pos - 1) / (n - 1);          // 1 at the top, 0 at the bottom
    return Math.round(STANDING_MIN + (STANDING_MAX - STANDING_MIN) * height);
}

/** What has accrued since `since`, capped. Pure so the screen can count it up live. */
export function standingPending({ since, position, size, now = Date.now() }) {
    if (!since) return 0;
    const ms = Math.max(0, now - new Date(since).getTime());
    const hours = Math.min(STANDING_CAP_HOURS, ms / 3600000);
    return Math.floor(hours * standingRate(position, size));
}

/** True once the stake has stopped growing — the nudge to come and bank it. */
export function standingFull({ since, now = Date.now() }) {
    if (!since) return false;
    return (now - new Date(since).getTime()) >= STANDING_CAP_HOURS * 3600000;
}

// ── THE ARMOURY ──────────────────────────────────────────────────────────────────────────────────────────────
// The only sink for laurels, so this is where the currency gets its value. Deliberately a mix:
//
//   · things that make you STRONGER outside the arena (chests, forge parts) so laurels matter to a player who
//     mostly cares about the boss or the Forge;
//   · things that change how you play the LADDER (a writ, a scouting report, another challenge) which is where
//     the interesting decisions are and which nothing else in the Den sells.
//
// No cosmetic-only tier yet: the Den's auras are unlocked by level, and quietly opening a second unlock path
// would need the cosmetics system to grow a concept it does not currently have.
export const ARMOURY = [
    {
        id: "chest_wooden", kind: "chest", chest: "wooden", cost: 130,
        name: "Wooden Chest", blurb: "Standard-issue loot. Everything has to start somewhere.",
    },
    {
        id: "chest_iron", kind: "chest", chest: "iron", cost: 340,
        name: "Iron Chest", blurb: "A real shot at something epic.",
    },
    {
        id: "chest_gold", kind: "chest", chest: "gold", cost: 900,
        name: "Gold Chest", blurb: "Legendaries live in here.",
    },
    {
        id: "chest_mythic", kind: "chest", chest: "mythic", cost: 2400,
        name: "Mythic Chest", blurb: "The best chest the ladder will sell you.",
    },
    {
        id: "parts_t3", kind: "parts", tier: 3, count: 3, cost: 280,
        name: "Tempered Steel ×3", blurb: "Forge stock, straight from the sand.",
    },
    {
        id: "parts_t4", kind: "parts", tier: 4, count: 2, cost: 560,
        name: "Mythril Dust ×2", blurb: "The tier the Forge actually bottlenecks on.",
    },
    {
        id: "parts_t5", kind: "parts", tier: 5, count: 1, cost: 980,
        name: "Emberheart Shard", blurb: "One shard. You know what it is for.",
    },
    {
        id: "writ", kind: "writ", count: 1, cost: 750,
        name: "Writ of Challenge", blurb: "Challenge ANYONE on the ladder, however far above you they stand.",
        note: "Ignores the eight-rung reach.",
    },
    {
        id: "scout", kind: "scout", count: 3, cost: 200,
        name: "Scouting Reports ×3", blurb: "Read an opponent's full kit and affinity before you commit.",
        note: "Spent from the challenge list.",
    },
    {
        id: "secondwind", kind: "fights", count: 2, cost: 420,
        name: "Second Wind", blurb: "Two more challenges today.",
        note: "Today only — it does not bank.",
    },
];

export const armouryItem = (id) => ARMOURY.find((x) => x.id === id) || null;
