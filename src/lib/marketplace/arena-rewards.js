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
//   LAURELS are MONEY. Won by winning, and spent in the Armoury.
//
// They are kept separate because collapsing them punishes you for shopping: if rank and currency were one
// number, buying a chest would cost you your place on the leaderboard.
//
// LAURELS ARE ALSO A CLOSED CURRENCY — earned only in the arena, spent only in the Armoury. Paying gold would
// pump the Den's general economy, and this ladder is symmetric enough that a refund loop mints money out of
// nothing.
//
// ── NOTHING IS PAID FOR LOSING ───────────────────────────────────────────────────────────────────────────────
// A loss used to pay 30% of a win in laurels and 35% in arena XP. The reasoning was that a defeat against
// something far bigger should be a consolation rather than a wasted evening — and the effect was the opposite
// of the intent. It made losing a viable income, so a member walled at a rung they could not beat kept feeding
// themselves to it. Sunflower Jinxx, stopped at rung 21 and describing exactly that: "I'm just taking loss
// after loss to try and get laurels for recipes." The game was paying her to keep doing the thing that was
// making her want to stop playing.
//
// A loss now costs nothing and pays nothing. VP already carries the "challenge upward" incentive this was
// reaching for — it pays only on a win and scales with how much harder the opponent was, so picking a hard
// fight is still worth more than farming a soft one, and it is worth more only when you actually win it.
//
// The DEFENCE payout below is untouched: that is a defender WINNING while absent, not anybody losing.

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

// ── VICTORY POINTS ARE A RATING NOW, AND THEY COME OUT OF SOMEBODY ───────────────────────────────────────────
// Luke: "you can only get them from opponents who have them. And if you lose, you lose some of your victory
// points, and they get those... if you're fighting someone who is above you in victory points you should be
// taking some of theirs, and you should earn more than if you were to fight someone who's lower. It's
// basically matchmaking ranking. So it's MMR."
//
// vpFor above only ever ADDED, so the board ranked how much somebody had played rather than how well. That is
// why SoullessShiitake sat fourth on points and tenth on power, and it is why the five-neighbour board I built
// on top of it could not correct itself — an over-ranked member simply stopped climbing while others passed
// them, which takes weeks.
//
// This is Elo, with the two knobs sized for the range the Den actually occupies (about 6,000 to 24,000):
//
//   VP_SCALE  the gap at which the higher-rated fighter is expected to win about ten times out of eleven
//   VP_K      the most a single bout can move, split between the two of them by how surprising it was
//
// Even match: 150 each way. Beating somebody 3,000 above you: 273. Beating somebody 3,000 below: 27. So
// punching up is worth ten times punching down, and losing to someone far below you costs the same ten times.
//
// IT IS A PUNISHMENT AND THAT IS DELIBERATE, in one place only. Luke: "this is one of the only areas where we
// have player risk player, so it has unique rules... the truth is they don't do anything, so there's nothing
// to really get mad about. Losing victory points brings you down to a point where you can fight people that
// are easier." Nothing else in the Den takes anything back.
export const VP_SCALE = 3000;
export const VP_K = 300;

/** What a bout moves between two members. Always a positive number — the caller decides the signs. */
export function vpTransfer({ myVp = 0, theirVp = 0, won = false }) {
    const expected = 1 / (1 + Math.pow(10, ((Number(theirVp) || 0) - (Number(myVp) || 0)) / VP_SCALE));
    // The winner takes K x (1 - their expected share). A shock is worth more to both of them.
    const move = won ? VP_K * (1 - expected) : VP_K * expected;
    return Math.max(1, Math.round(move));
}

/**
 * BOTH SIDES OF THE BET, shown on the challenge list BEFORE you commit.
 *
 * Luke: "I would expect to see just the vp I would earn or lose if I choose to fight them."
 *
 * CAPPED THE SAME WAY THE SETTLE CAPS IT. finishBout moves `Math.min(stake, won ? theirVp : myVp)` — you
 * cannot take more than they have and you cannot lose more than you own — so a preview that quoted the raw
 * transfer would promise a number the payout does not honour. That is a bug this game has shipped seven times
 * in other places; it does not need an eighth.
 */
export const vpStakePreview = (myVp, theirVp) => Math.min(
    vpTransfer({ myVp, theirVp, won: true }), Math.max(0, Number(theirVp) || 0),
);
export const vpLossPreview = (myVp, theirVp) => Math.min(
    vpTransfer({ myVp, theirVp, won: false }), Math.max(0, Number(myVp) || 0),
);

/** What you'd get for beating them — shown on the challenge list BEFORE you commit. */
export const vpPreview = (myPower, theirPower) => vpFor({ won: true, myPower, theirPower });

// ── LAURELS ──────────────────────────────────────────────────────────────────────────────────────────────────
// Winning pays. Losing does not — see the note above.
// ── WHAT TURNING SOMEBODY AWAY IS WORTH ──────────────────────────────────────────────────────────────────────
// A defender did not choose the fight, was not present for it, and spent nothing — so this is deliberately a
// fraction of what the challenger risked, not a mirror of it. It is a dividend on a good build, not a wage.
//
// Capped per DAY, because the alternative rewards being popular rather than being good: without a ceiling the
// optimal play is to make yourself the most attractive target on the board and then stop opening the app.
export const DEFENCE_SHARE = 0.4;          // of what the challenger would have earned for winning
export const DEFENCE_LAURELS_PER_DAY = 120;

export function defenceLaurels({ myPower = 1, theirPower = 1 }) {
    // Their power over yours: turning away somebody BIGGER than you is worth more, exactly as beating them is.
    return Math.max(4, Math.round(boutLaurels({ won: true, myPower, theirPower }) * DEFENCE_SHARE));
}

// ── A MEMBER FIGHT IS WORTH MORE THAN A DUMMY ────────────────────────────────────────────────────────────────
// Arena XP has paid a PvP premium since the scarcity pass — a member bout needs another person to exist, and
// it spends one of the twelve you get in a day, while a Gauntlet tier is always standing there. Laurels never
// learned that, so the two currencies disagreed about what a fight was worth.
//
// Same shape as XP_MULT_BY_KIND in arena-classes.js, deliberately smaller: XP pays 3x for PvP because levels
// are slow, and laurels are money that buys crates. 1.6x is a real reason to challenge a person without making
// the Gauntlet pointless for somebody with nobody online.
export const PVP_LAUREL_MULT = 1.6;
export const LAUREL_MULT_BY_KIND = { member: PVP_LAUREL_MULT, gauntlet: 1, ladder: 1, town: 1 };

export function boutLaurels({ won, myPower = 1, theirPower = 1, kind = "gauntlet" }) {
    const ratio = Math.max(VP_FLOOR, Math.min(VP_CEIL, (Number(theirPower) || 1) / Math.max(1, Number(myPower) || 1)));
    const mult = LAUREL_MULT_BY_KIND[kind] === undefined ? 1 : LAUREL_MULT_BY_KIND[kind];
    const win = Math.round((18 + 34 * ratio) * mult);
    return won ? win : lossLaurels({ myPower, theirPower, kind });
}

// ── AND LOSING A PERSON'S FIGHT PAYS FOR HOW YOU FOUGHT ──────────────────────────────────────────────────────
// Luke: "when you lose a pvp fight you should still be awarded laurels for how you fought."
//
// The note at the top of this file says nothing is paid for losing, and gives the reason: Sunflower Jinxx,
// walled at rung 21, "just taking loss after loss to try and get laurels for recipes." That reason was real
// and it still is — but it was about THE ROAD, where attempts are unlimited. On the Road a paid loss is an
// income, because you can throw yourself at rung 21 a hundred times in an evening.
//
// A member fight is not that. It costs one of the twelve you get in a day, and it needs somebody else to
// exist. Twelve is the ration, so paying for a loss there cannot become a farm — it can only stop a bad
// evening being a wasted one. This is exactly the split arena XP already makes (LOSS_PAYS in
// arena-classes.js covers member and gauntlet, never ladder), and the two systems agreeing is the point.
//
// ONLY MEMBER FIGHTS. Not the Gauntlet, even though XP pays there: a Gauntlet tier is always standing and a
// member with twelve fights and no opponents online could otherwise spend all twelve losing on purpose to a
// tier far above them, which is the farm again wearing a different hat.
export const LOSS_LAUREL_SHARE = 0.3;
const LOSS_PAYS_LAURELS = new Set(["member"]);

/**
 * What a defeat was worth, before performance is counted.
 *
 * Scaled by the same difficulty ratio a win uses, so losing narrowly to somebody far above you pays more than
 * losing to somebody your own size — which is the "challenge upward" incentive the VP note describes, applied
 * to the half of it that does not currently exist.
 */
export function lossLaurels({ myPower = 1, theirPower = 1, kind = "gauntlet" }) {
    if (!LOSS_PAYS_LAURELS.has(kind)) return 0;
    const ratio = Math.max(VP_FLOOR, Math.min(VP_CEIL, (Number(theirPower) || 1) / Math.max(1, Number(myPower) || 1)));
    return Math.round((18 + 34 * ratio) * PVP_LAUREL_MULT * LOSS_LAUREL_SHARE);
}

/**
 * HOW YOU FOUGHT, as a multiplier on that.
 *
 * The share of their health you took off, which is the one measure of a defeat that cannot be farmed: you
 * cannot lose "well" by giving up, and taking a member to their last few points is genuinely harder than
 * being flattened. A wipeout pays the floor; a fight they nearly lost pays close to double.
 *
 * Deliberately NOT beats survived. Surviving is something a tank build does by existing, and it would have
 * paid a Warden for standing still — the same shape of mistake as paying for attempts.
 */
export const LOSS_EFFORT_FLOOR = 0.5;
export const LOSS_EFFORT_CEIL = 2;

export function lossEffort(b = {}) {
    const max = Math.max(1, Number(b.foeMaxHp) || 0);
    const took = Math.max(0, max - Math.max(0, Number(b.foeHp) || 0));
    const share = Math.min(1, took / max);
    return LOSS_EFFORT_FLOOR + (LOSS_EFFORT_CEIL - LOSS_EFFORT_FLOOR) * share;
}

// ── FEATS ────────────────────────────────────────────────────────────────────────────────────────────────────
// Performance, named. A two-beat demolition and a fifteen-beat scrape paid exactly the same before this, which
// is the same as saying the arena did not care how you fought.
//
// Every one is read off the bout log — things that actually happened, not a score. They are NAMED because a
// named thing is a thing you tell somebody about: "I won that on a Comeback" is a story, "+40" is not.
// ── THE LOWEST YOUR HEALTH EVER GOT ──────────────────────────────────────────────────────────────────────────
// Luke, on a card that said "Damage taken 792" three lines under an UNTOUCHED laurel: "untouched is incorrect
// i took a bunch of hits."
//
// Two of the three health feats were reading `b.hp`, which is where your health ENDED. "Won without dropping
// below nine tenths" and "won from under a fifth" are both statements about the WORST moment of the fight, and
// a Runecaller with lifedrink and regen ends a bout well above the pit it climbed out of. `b.lowHp` was
// already written into the Comeback test as the right idea — and nothing anywhere has ever set it, so that
// test has been reading the final number too since the day it was written.
//
// Derived from the log instead of stamped by the engine, because every line already carries `meHp` — the
// screen rebuilt both health bars off those stamps months ago — so this works on transcripts written before
// anybody thought to record a low-water mark, and there is no new field for a future change to forget.
const lowestHp = (b) => {
    const stamps = (b?.log || []).map((l) => Number(l?.meHp)).filter((n) => Number.isFinite(n));
    const final = Number.isFinite(Number(b?.hp)) ? Number(b.hp) : Infinity;
    return stamps.length ? Math.min(final, ...stamps) : (Number.isFinite(final) ? final : 0);
};

export const FEATS = [
    {
        id: "flawless", name: "Flawless", laurels: 55, vp: 10, color: "#fff0a8",
        blurb: "Won without dropping below nine tenths of your health.",
        test: (b) => b.won && lowestHp(b) / Math.max(1, b.maxHp) >= 0.9,
    },
    {
        id: "untouched", name: "Untouched", laurels: 80, vp: 20, color: "#8bf0b4",
        blurb: "Won without a single blow landing on you.",
        // ⚠️ THIS FIRED ON EVERY SINGLE WIN. It looked for `who === "them"`, and the SERVER's log says "me"
        // and "foe" — "you"/"them" is the CLIENT's translation in ArenaClient's logAll. So the `.some()` never
        // matched a line in its life, `!false` is true, and every victory came with +80 laurels and +20 VP.
        // The same one-word confusion cost the health bars their arithmetic once already; the note is still in
        // ArenaClient where it happened.
        //
        // Not repaired by correcting the string, either. A test that walks the log looking for one shape of
        // line breaks again the moment a line changes shape — a thorn, a burn tick and the pit all take health
        // off you and none of them is a "blow" by that reading. Untouched means you never lost a point of
        // health, which is exactly what the "Damage taken" line on the same card is showing.
        test: (b) => b.won && lowestHp(b) >= Math.max(1, b.maxHp),
    },
    {
        id: "comeback", name: "Comeback", laurels: 70, vp: 15, color: "#ff9f1c",
        blurb: "Won from under a fifth of your health.",
        test: (b) => b.won && lowestHp(b) / Math.max(1, b.maxHp) <= 0.2,
    },
    {
        id: "giantkiller", name: "Giant-Killer", laurels: 65, vp: 15, color: "#b061ff",
        blurb: "Beat a loadout a quarter stronger than yours.",
        // Belt and braces after this fired on a Straw Dummy: require a real number on BOTH sides, so a
        // missing field can never read as "infinitely stronger than you" again.
        test: (b) => {
            const mine = Number(b.me?.gearPower) || 0;
            const theirs = Number(b.foe?.gearPower) || 0;
            return b.won && mine > 0 && theirs >= mine * 1.25;
        },
    },
    {
        id: "clinical", name: "Clinical", laurels: 45, vp: 8, color: "#6fd0ff",
        blurb: "Won inside six rounds.",
        test: (b) => b.won && (b.beat || 99) <= 6,
    },
    {
        id: "bulwark", name: "Bulwark", laurels: 40, vp: 8, color: "#6fd0ff",
        blurb: "Turned aside half your own health over the bout.",
        // UNEARNABLE UNTIL NOW. `blocked` is a count of blows -- a long bout has maybe twenty -- and
        // this compared it against half a health bar, which is hundreds. `soaked` was written by nothing.
        // The engine records both as DAMAGE now, and mitigation lands on the attacker's line, so what
        // your own guard stopped is the sum over THEIR swings.
        test: (b) => {
            const theirs = (b.log || []).filter((l) => l.who === "foe" || l.who === "them");
            const stopped = theirs.reduce((n, l) => n + (l.turned || 0) + (l.soaked || 0), 0);
            return b.won && stopped >= Math.max(1, b.maxHp) * 0.5;
        },
    },
    {
        // Was "won with your affinity smothered by theirs" — unearnable the moment the element clash was
        // removed, and an achievement nobody can get is worse than one that does not exist. Same id, so it
        // stays on the record of everyone who earned it; the condition is now the other kind of uphill fight.
        id: "upstream", name: "Against the Current", laurels: 50, vp: 10, color: "#4aa3ff",
        blurb: "Won from under a third of your health.",
        test: (b) => b.won && (b.maxHp || 0) > 0 && (b.hp || 0) <= (b.maxHp || 0) / 3,
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

// The Armoury moved to armoury.js and became three rolled crates rather than eleven fixed prices — a price
// list is arithmetic you do once and then repeat forever. Nothing here any more; the tables, the odds and the
// balance gate all live together in that file.
