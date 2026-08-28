// ── FORTUNE: LUCK, EVERYWHERE ────────────────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the engine, the panels and the item cards all read the same numbers, so what
// Fortune promises on a card is what the roll actually does.
//
// ── WHAT IT USED TO BE, AND WHY THAT HAD TO GO ───────────────────────────────────────────────────────────────
// Fortune was boss-raffle tickets and nothing else, and it did not even do that. `boss.js` read the stat from
// ONE source — the pack's pet bonuses — so every point of Fortune on gear, on a set, on a forge enhancement,
// in a socket or off a compendium milestone entered no draw, appeared on no screen and changed no odds. David B,
// in the plaza: "how does the effect of fortune work on gear i have pendant with 31 fortune and i havent gotten
// any extra tickets". He had not. Measured against the live boss, the pack was holding 5,420 tickets' worth of
// gear Fortune that existed nowhere but the item cards, against 1,193 real damage tickets in the whole hat.
//
// Wiring the missing half in was the small fix and the wrong one: at the old rate it would have made the raffle
// a Fortune-gear draw four and a half times over, and it would have left the stat doing nothing at all for
// anyone who does not care about a weekly prize. So Fortune is now what its name says everywhere in the Den —
// luck — and the raffle went back to being decided by damage, which is the thing you actually turn up and do.
//
// ── ONE CURVE, TWO USES ──────────────────────────────────────────────────────────────────────────────────────
// `fortuneLuck` maps a raw Fortune total onto a 0..1 luck factor that SATURATES: it approaches FORTUNE_CEILING
// without ever reaching it, so there is no value of Fortune that guarantees anything and no cliff for a build
// to stand on. FORTUNE_HALF is the Fortune at which you hold half the ceiling.
//
// Real totals as of the rewire, which is what these constants are sized against: a member wearing nothing much
// carries 7 (the compendium's first milestones alone); an ordinary loadout is 25-50; the best-equipped members
// in the Den carry 103 (David B, almost all of it gear) and 122 (GrayKitsune, almost all of it pets). So the
// band that matters is roughly 10-125, and over that band luck runs 0.07 -> 0.34. A member who has actually
// built for it is a third luckier than one who has not, and nobody is ever twice as lucky as anybody.
export const FORTUNE_HALF = 60;
export const FORTUNE_CEILING = 0.5;

/** Raw Fortune (gear + sets + forge + gems + compendium + pets + badges) → a 0..FORTUNE_CEILING luck factor. */
export function fortuneLuck(fortune = 0) {
    const f = Math.max(0, Number(fortune) || 0);
    return FORTUNE_CEILING * (f / (f + FORTUNE_HALF));
}

// ── DROP RATES: THE CHANCE ITSELF GOES UP ────────────────────────────────────────────────────────────────────
// Multiplicative, not additive, and that is the whole reason it works on the rolls that matter. The rare things
// in this game are rare: a pet off a sea fight is 1.1%, a regalia piece off the forge is well under that. An
// additive +3% would be a rounding error there and would double the common finds it was never aimed at.
// Multiplying means Fortune is worth the same PROPORTION wherever it is applied — a third more pets, a third
// more relics, a third more recipes — so it can be wired into a rare roll and a routine one with the same line
// of code and no separate tuning for each.
//
// Capped at 1 because a chance is a chance. Passing p >= 1 back out unchanged is deliberate: a few callers
// multiply a certainty by a modifier and rely on it staying one.
export function luckyChance(p, fortune = 0) {
    const base = Number(p) || 0;
    if (base <= 0) return 0;
    return Math.min(1, base * (1 + fortuneLuck(fortune)));
}

// ── DAMAGE ROLLS: THE FLOOR COMES UP, THE CEILING DOES NOT ───────────────────────────────────────────────────
// Every blow in the Den lands somewhere in a band — 85%-115% in both the ring (arena-engine SWING_SPREAD) and
// on the boss (boss.js manualHit). Fortune pulls the BOTTOM of that band up toward the middle and leaves the
// top exactly where it is.
//
// That direction is the point, and it is not the same thing as a damage bonus:
//   · it can never make your best hit bigger, so no amount of Fortune inflates a ceiling somebody balanced
//   · it takes away the swing that whiffs, which is the half of variance a player actually feels
//   · at the top of the real Fortune band it is worth about +2.5% average damage — texture, not a stat check
//
// A luck stat that made damage variance WIDER would be the obvious reading of "luck" and it would be a worse
// stat: more variance is not better, it is just louder. Fewer bad rolls is what luck should buy.
export function luckyRoll(rng = Math.random, spread = 0, fortune = 0) {
    if (!(spread > 0)) return 1;
    const lo = 1 - spread * (1 - fortuneLuck(fortune));
    return lo + rng() * (1 + spread - lo);
}

// ── WHAT THE CARDS SAY ───────────────────────────────────────────────────────────────────────────────────────
// One string, read by the item card, the pet card, the farm recap and the stat glossary, because the last shape
// of this stat was described in nine places and was wrong in all of them for as long as it existed. A card that
// states a rule the code does not run is the defect this game keeps rediscovering; the only way that stops is
// for the card to have no copy of its own.
export const FORTUNE_DESC = "Luck. Better drop rates everywhere — chests, digs, delves, the mine, the water and the pet you have been hunting — and your damage rolls stop landing at the bottom of their range.";

/** The same thing, said short enough for a stat pill. */
export const FORTUNE_SHORT = "Better drop rates everywhere, and steadier damage rolls.";

/** "+18%" — what a given Fortune total is actually worth, for a card that wants to print the number. */
export const fortunePct = (fortune = 0) => `+${Math.round(fortuneLuck(fortune) * 100)}%`;
