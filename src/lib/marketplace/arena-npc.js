import { DEFAULT_ACCURACY } from "@/lib/marketplace/arena-classes.js";
import { swingFrom, healthFrom, critChanceFrom, critMultFrom } from "@/lib/marketplace/arena-kit.js";

// ── THE GAUNTLET: ENDLESS NPC CHALLENGERS ────────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the ladder screen and the engine read the same catalog.
//
// WHY THIS EXISTS. The arena only had other members in it, which produces two dead ends. If nobody is above
// you there is nothing to fight (the state Luke hit at #1: "Nobody above you within reach. You are at the top
// of the Den."), and if you would simply rather not fight a person today there is nothing else to do. A store
// ladder is also small — eighty-four people, most of them not playing on any given evening.
//
// So there is a second ladder made of opponents who are always there and never run out.
//
// ENDLESS BY CONSTRUCTION. Tiers are a FORMULA, not a list. Tier 40 exists, and so does tier 400. What is
// finite is the ART: a BAND covers a stretch of tiers and shares one sprite, and inside a band the numbers
// escalate. Ten sprites therefore cover an unbounded ladder — the alternative is commissioning a new sprite
// every time somebody reaches the end, which is not a ladder anyone can maintain.
//
// The last band repeats forever with the numbers still climbing, which is the honest way to say "there is
// always something harder": no fake ceiling, no "coming soon", just a wall that keeps getting taller.

export const BANDS = [
    { key: "straw", name: "Straw Dummy", from: 1, color: "#c39b6a", blurb: "It does not fight back very hard." },
    { key: "scrapper", name: "Pit Scrapper", from: 4, color: "#9fb3c8", blurb: "All elbows and confidence." },
    { key: "regular", name: "Den Regular", from: 9, color: "#7ed57e", blurb: "Knows what they're doing." },
    { key: "veteran", name: "Veteran", from: 16, color: "#6fd0ff", blurb: "Has done this a lot longer than you." },
    { key: "champion", name: "Champion", from: 25, color: "#ffd75e", blurb: "Wears the laurel for a reason." },
    { key: "warlord", name: "Warlord", from: 36, color: "#ff9f1c", blurb: "Fights like the cage is a favour to you." },
    { key: "titan", name: "Titan", from: 50, color: "#b98cff", blurb: "You are hitting geology." },
    { key: "colossus", name: "Colossus", from: 66, color: "#ff6f7d", blurb: "Something built to end fights." },
    { key: "nightmare", name: "Nightmare", from: 85, color: "#b061ff", blurb: "It should not be in here with you." },
    // No `from` ceiling. Everything from here up is Ascendant, numbered, forever.
    { key: "ascendant", name: "Ascendant", from: 110, color: "#fff0a8", blurb: "The wall that keeps getting taller." },
];

export const bandForTier = (tier) => {
    let band = BANDS[0];
    for (const b of BANDS) if (tier >= b.from) band = b;
    return band;
};

// ── HOW HARD IS TIER N ───────────────────────────────────────────────────────────────────────────────────────
// Roughly geometric, so early tiers come quickly and the curve keeps its teeth forever without any single step
// being a wall. Tuned so a mid-level member with decent gear sits somewhere around tier 12-20 — enough of a
// ladder below them to feel earned, and a very long way still above.
// GROWTH was 1.085, and simulated it is a CLIFF rather than a curve: 96.8% at tier 8, 58.1% at 11, 10.3% at
// 14, 1.0% at 17. A player stalls dead around tier twelve and no amount of play moves them, because gear
// grows far slower than 8.5% a tier. 4.5% keeps every tier meaningfully harder than the last while leaving
// the ladder climbable as you gear up — and it is still unbounded, so "super super hard" still arrives, just
// somewhere you can actually reach.
// These ARE the stat budget now, not an abstract "power": npcPower(t) is how many points of Might, Crit
// Chance, Crit Power and Ferocity a tier gets to spend, in the same units a member's gear is measured in
// (best-in-slot across nine slots totals 644). Set by scripts/check-arena.mjs against four real loadouts.
const BASE_POWER = 34;
const GROWTH = 1.07;

export function npcPower(tier) {
    return Math.round(BASE_POWER * Math.pow(GROWTH, Math.max(1, tier) - 1));
}

// The stat split mirrors what a member brings, so the same engine can fight either without special cases.
// ── A GAUNTLET FIGHTER IS A LOADOUT ──────────────────────────────────────────────────────────────────────────
// They used to carry bespoke `health`/`damage`/`armour` figures on a curve of their own, which meant the ring
// had two kinds of fighter in it and only one of them could be reasoned about from the stat screen. They carry
// THE SAME FOUR STATS A PLAYER'S GEAR CARRIES now — Might, Crit Chance, Crit Power, Ferocity — and the engine
// runs them through the identical ringStats() a member goes through. A Warlord is not a special case; it is a
// kit, and you can read it the way you read your own.
//
// ── AND THEY ARE NOT ALL THE SAME SHAPE ──────────────────────────────────────────────────────────────────────
// With the hidden mitigation roll gone, "harder" cannot mean "secretly luckier" any more, and it should not
// just mean "every number bigger" either — that is a wall you either out-gear or you do not, and no fight in
// the middle of it teaches you anything. So a tier spends its BUDGET differently depending on its archetype,
// and the archetypes cycle, so tier N and tier N+1 want different answers out of you:
//
//   BRUTE      pours it into Might. Races you. Kill it or be killed inside ten rounds.
//   WALL       pours it into Ferocity and sheer bulk. It takes a long time to put down.
//
// ── NO ARMOUR ON AN NPC ──────────────────────────────────────────────────────────────────────────────────────
// Archetypes used to carry a hidden damage-reduction percentage, and it was the single most confusing thing in
// a fight: your damage number said one thing, the bar moved by another, and nothing on screen accounted for
// the difference. Damage reduction is a CLASS idea now — something a member builds and can read off their own
// card — and an NPC's toughness is health, which is the one number a health bar already tells you the truth
// about. `tough` is the old armour expressed as the health multiplier that keeps each archetype exactly as
// hard to kill: a wall's 26% reduction is 1/(1-0.26) = 1.35x the health.
//   DUELIST    pours it into crit. Swingy — it can take a third of you in one beat or whiff for three.
//   BERSERKER  everything into offence, almost nothing into staying alive. A glass cannon: guard the opening
//              and it falls over, trade blindly and it wins.
//   BALANCED   no lever. Whoever built better wins, which is the honest baseline the others deviate from.
//
// The archetype is PRINTED ON THE CARD with its stats, because a shape you cannot see before you commit is
// just another hidden roll wearing a different hat.
export const ARCHETYPES = [
    // The spread between the highest and lowest FEROCITY weight is what decides how long a fight is, and the
    // first cut of these ran 0.08 to 0.62 — an eight-to-one health gap, so a Berserker died in two rounds and
    // a Wall took twenty. Compressed to 0.22-0.60. Each archetype still plainly IS itself; none of them is a
    // different game.
    { key: "balanced", name: "Balanced", tell: "No weakness and no lever. Out-build it.",
      w: { might: 0.28, crit_chance: 0.16, crit_power: 0.16, ferocity: 0.40 }, tough: 1.11, guard: 0.22 },
    { key: "brute", name: "Brute", tell: "Hits like a falling wall. End it early.",
      w: { might: 0.44, crit_chance: 0.08, crit_power: 0.12, ferocity: 0.36 }, tough: 1.11, guard: 0.16 },
    { key: "wall", name: "Wall", tell: "Soaks everything. Strip its guard or you are here all day.",
      w: { might: 0.20, crit_chance: 0.10, crit_power: 0.10, ferocity: 0.60 }, tough: 1.35, guard: 0.30 },
    { key: "duelist", name: "Duelist", tell: "Fishing for criticals. It only needs to land one.",
      w: { might: 0.22, crit_chance: 0.24, crit_power: 0.24, ferocity: 0.30 }, tough: 1.14, guard: 0.20 },
    { key: "berserker", name: "Berserker", tell: "All edge, no armour. Survive the opening and it folds.",
      w: { might: 0.40, crit_chance: 0.18, crit_power: 0.20, ferocity: 0.22 }, tough: 1.06, guard: 0.12 },
];
// The first three tiers are always Balanced. A Straw Dummy that rolled Brute is a tutorial that hits back
// harder than the thing after it, and the archetype cycle should not apply before you have met the baseline
// it deviates from.
export const archetypeForTier = (t) => {
    const n = Math.max(1, Math.round(t));
    return n <= 3 ? ARCHETYPES[0] : ARCHETYPES[n % ARCHETYPES.length];
};

// The budget a tier gets to spend across the four stats. Kept as npcPower so the existing tier curve, the
// matchmaker and every saved `npc_best` still mean what they meant.
export function npcFor(tier) {
    const t = Math.max(1, Math.round(tier));
    const band = bandForTier(t);
    const power = npcPower(t);
    const arch = archetypeForTier(t);
    const budget = power;
    // Within a band, later tiers are the "II / III / IV" of it — a Veteran IV is plainly a harder Veteran.
    const idx = t - band.from + 1;
    const numeral = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"][Math.min(9, idx - 1)] || ` ${idx}`;
    return {
        id: `npc:${t}`,
        npc: true,
        tier: t,
        band: band.key,
        name: `${band.name}${idx > 1 ? numeral : ""}`,
        blurb: band.blurb,
        color: band.color,
        sprite: `/images/arena/npc/${band.key}.webp`,
        archetype: arch.key,
        archetypeName: arch.name,
        tell: arch.tell,
        // ── THE STAT LINE ── the same four a player wears, so ringStats() needs no idea which it is holding.
        // ── VITALITY IS WHAT BUYS HEALTH NOW, AND NOTHING WAS BUYING IT ──────────────────────────────────
        // These weights spend the LARGEST share of the budget on `ferocity` (0.22 to 0.60) because that is
        // what health was made of when they were written — arena-kit still records the old formula, "health
        // = HEALTH_BASE + Ferocity x 2.5". The gear rework made VITALITY the health stat and ringStats reads
        // `vitality`; neither of the two places that build an NPC stat line ever started producing any.
        //
        // So every Gauntlet tier and every Road fighter in the game has been standing on the flat 200 base
        // with its whole health budget going nowhere: 212hp at rung 5 and 212hp at rung 45, while the same
        // budget pushed rung 45's damage to 1,324 and its crit multiplier to x62. Luke, the hour the Road
        // reopened: "the enemies at rung 30 are like super weak now, they went from 5k hp to 300 and die
        // including 1 shot."
        //
        // The ferocity weight IS the health weight — it was authored as one, and the archetype note above
        // depends on it ("an eight-to-one health gap, so a Berserker died in two rounds and a Wall took
        // twenty"). So it buys Vitality. `ferocity` stays for anything else that reads it.
        vitality: Math.round(budget * arch.w.ferocity),
        might: Math.round(budget * arch.w.might),
        crit_chance: Math.round(budget * arch.w.crit_chance),
        crit_power: Math.round(budget * arch.w.crit_power),
        ferocity: Math.round(budget * arch.w.ferocity),
        // Toughness rides on the health the budget already bought, so an archetype is exactly as hard to kill
        // as it was when the same figure was a hidden percentage — the difference is you can now see it.
        tough: arch.tough || 1,
        // ── HOW HARD THEY BRACE ──────────────────────────────────────────────────────────────────────────
        // Guard stopped being one flat share for every fighter, so an NPC that inherited the member default
        // would brace for 12% — a board-wide difficulty cut nobody asked for, landing right after the Road
        // was tuned. These are set per archetype instead, averaging what they used to get, which keeps the
        // curve where it was and makes the Wall's tell ("strip its guard") literally true.
        guard: arch.guard ?? 0.20,
        // NPCs have no damage reduction at all, and no tree, so they hit at the neutral base.
        dr: 0,
        accuracy: DEFAULT_ACCURACY,
        gearPower: power,
        // Element cycles so consecutive tiers are not all answerable with one affinity — the wheel stays a
        // reason to re-attune rather than something you solve once.
        element: ["fire", "water", "earth", "storm", "light", "shadow"][t % 6],
        speed: Math.round(10 + power * 0.09),
    };
}

/**
 * A stat line for an opponent that is NOT on the tier ladder — the long PvE road (arena-ladder.js).
 *
 * It spends a power budget through the same archetype weights npcFor uses, so a Wall on the road and a Wall in
 * the Gauntlet want the same answer out of you. Kept here rather than in arena-ladder.js so there is one place
 * that knows how a budget becomes four numbers.
 */
export function statsForPower(power, archKey, element = null, seed = 0) {
    const arch = ARCHETYPES.find((a) => a.key === archKey) || ARCHETYPES[0];
    const budget = Math.max(1, Math.round(power));
    return {
        // Vitality, for the same reason as npcFor above — this is the Road's builder, and it was missing it
        // too, which is why a rung had the same 212 health as the tutorial.
        vitality: Math.round(budget * arch.w.ferocity),
        might: Math.round(budget * arch.w.might),
        crit_chance: Math.round(budget * arch.w.crit_chance),
        crit_power: Math.round(budget * arch.w.crit_power),
        ferocity: Math.round(budget * arch.w.ferocity),
        tough: arch.tough || 1,
        guard: arch.guard ?? 0.20,
        dr: 0,
        accuracy: DEFAULT_ACCURACY,
        gearPower: budget,
        element: element || ["fire", "water", "earth", "storm", "light", "shadow"][seed % 6],
        speed: Math.round(10 + budget * 0.09),
    };
}

// ── WHAT AN NPC FIGHTS WITH ──────────────────────────────────────────────────────────────────────────────────
// Real named moves out of the same eleven kinds members use, not a bare swing. Two things matter here:
//
//   DETERMINISTIC BY TIER — a given tier always brings the same two moves, so losing to it teaches you
//   something and the rematch is a plan rather than another dice roll. This is the one advantage the Gauntlet
//   has over fighting a member, and throwing it away for variety would be a bad trade.
//
//   HARDER TIERS GET NASTIER KINDS — the early bands swing and bleed, the late ones drain and execute.
const NPC_KIT = [
    { kind: "strike", name: "Heavy Blow", sprite: "/images/arena/skill-firstHitMult.webp", power: 2.0, acc: -0.12, cd: 3 },
    { kind: "rend", name: "Ragged Cut", sprite: "/images/arena/skill-eruptChance.webp", power: 1.4, acc: -0.06, cd: 3 },
    { kind: "flurry", name: "Rain of Blows", sprite: "/images/arena/skill-onslaught.webp", power: 0.85, acc: -0.10, cd: 3, hits: 3 },
    { kind: "sunder", name: "Armour Break", sprite: "/images/arena/skill-giantSlayer.webp", power: 1.5, acc: -0.07, cd: 4 },
    { kind: "spell", name: "Elemental Lash", sprite: "/images/arena/skill-attuned.webp", power: 2.1, acc: -0.13, cd: 4 },
    { kind: "drain", name: "Life Tithe", sprite: "/images/arena/skill-bloodlust.webp", power: 1.8, acc: -0.10, cd: 3 },
    { kind: "execute", name: "Finisher", sprite: "/images/arena/skill-opportunist.webp", power: 2.3, acc: -0.15, cd: 4 },
];

// ── AND TEN THINGS NO MEMBER CAN LEARN ───────────────────────────────────────────────────────────────────────
// The kit above is drawn from the same eleven kinds the skill tree grants, which is why nothing on the road
// has ever surprised anybody: you know what Rend does because you can buy Rend. These are NPC-only, they are
// resolved in arena.js's defender branch, and no tree node grants any of them.
//
// Each one is a QUESTION rather than a bigger number, and each has an answer you can act on the beat you see
// the tell:
//
//   Shatterguard   eats your banked brace and throws it back    → don't sit on a shield against it
//   Dread Howl     your damage down 30% for three               → burst before it lands, or ride it out
//   Hobbling Chain your accuracy down 18 for three              → your big committed swings get worse; jab
//   Soulbrand      their next landed blow is a guaranteed crit  → brace THIS beat, not the next one
//   Bonefeast      heals them by a third of what they've LOST   → kill them from high, not from low
//   Second Wind    clears their burn and sunder, banks a shield → don't spend a rend right before it
//   Deathknell     a three-beat timer, then a 2.8x hit          → the clock is visible; be ready or be gone
//   Blood Frenzy   +45% their damage, HALF their guard          → the window: hit them while it's up
//   Willbreaker    everything you have cooling gains a turn     → holding a skill back has a cost now
//   Gravebind      your Guard banks half for two beats          → the anti-turtle, aimed straight at Wardens
//
// Deliberately NOT here: anything that skips your turn, anything undodgeable, anything that reads as the game
// taking the controls away. Losing to a move you could see and answer is a lesson; losing to one you couldn't
// is a bug report.
const NPC_ONLY = [
    { kind: "shatter", name: "Shatterguard", sprite: "/images/arena/skill-giantSlayer.webp", power: 1.2, acc: -0.20, cd: 4 },
    { kind: "howl", name: "Dread Howl", sprite: "/images/arena/skill-bloodlust.webp", power: 0.9, acc: -0.15, cd: 5 },
    { kind: "snare", name: "Hobbling Chain", sprite: "/images/arena/skill-onslaught.webp", power: 1.0, acc: -0.15, cd: 5 },
    { kind: "brand", name: "Soulbrand", sprite: "/images/arena/skill-firstHitCrit.webp", power: 0.8, acc: -0.18, cd: 5 },
    { kind: "feast", name: "Bonefeast", sprite: "/images/arena/skill-bloodlust.webp", power: 0, cd: 5 },
    { kind: "rally", name: "Second Wind", sprite: "/images/arena/skill-packTactics.webp", power: 0, cd: 6 },
    { kind: "doom", name: "Deathknell", sprite: "/images/arena/skill-overcharge.webp", power: 0, acc: -0.22, cd: 7 },
    { kind: "frenzy", name: "Blood Frenzy", sprite: "/images/arena/skill-vanguard.webp", power: 0, acc: -0.18, cd: 5 },
    { kind: "siphon", name: "Willbreaker", sprite: "/images/arena/skill-attuned.webp", power: 1.1, acc: -0.16, cd: 5 },
    { kind: "bind", name: "Gravebind", sprite: "/images/arena/skill-eruptChance.webp", power: 1.0, acc: -0.16, cd: 5 },
];

// Which NPC-only move an opponent brings, by archetype — the same rule as the normal kit, so the shape you can
// read on the card is still the shape that swings at you. Two each, picked off the rung so a given fighter
// always brings the same one and the rematch is a plan.
const ARCH_ONLY = {
    balanced: ["snare", "brand"],
    brute: ["shatter", "frenzy"],
    wall: ["rally", "feast"],
    duelist: ["siphon", "doom"],
    berserker: ["howl", "bind"],
};

/**
 * The NPC-only move for a fighter, or null if they are not hard enough to have earned one.
 *
 * `depth` is the gate and it is the whole difficulty dial for this feature: below it an opponent fights out of
 * the ordinary kit and the road stays a warm-up, above it every fighter brings one thing you cannot answer
 * with knowledge of your own tree.
 */
export function npcOnlyMove(tier, archKey, scale = 1) {
    const t = Math.max(1, Math.round(tier));
    if (t < NPC_ONLY_FROM) return null;
    const want = ARCH_ONLY[archKey] || ARCH_ONLY.balanced;
    // Which of the archetype's two, chosen off the tier so it is fixed per fighter rather than rolled.
    const pick = want[t % want.length];
    const move = NPC_ONLY.find((m) => m.kind === pick);
    if (!move) return null;
    return { ...move, power: Math.round((move.power || 0) * scale * 100) / 100 };
}

// From here on, every opponent carries one. Before it, none do — so the early road is still the place you
// learn the ordinary rules before it starts breaking them.
export const NPC_ONLY_FROM = 12;

/**
 * `archKey` overrides the archetype the moves are chosen for. The Long Road rotates its OWN archetypes
 * (arena-ladder.js) and prints the result on the card as a tell — without this the card promised a Wall and
 * the fighter swung a Berserker's kit, because the moves were being picked off archetypeForTier() instead.
 */
export function npcAbilities(tier, archKey = null) {
    const t = Math.max(1, Math.round(tier));
    const n = npcFor(t);
    // How deep into the kit this tier may reach. A Straw Dummy gets the first move; an Ascendant gets any.
    const depth = Math.min(NPC_KIT.length, 1 + Math.floor(t / 9));
    // THE MOVES MATCH THE BUILD. A wall that opened with Finisher was a mixed message; now the archetype you
    // can read on the card is the archetype that swings at you, so recognising one is worth something.
    const BY_ARCH = {
        balanced: ["strike", "spell"], brute: ["strike", "sunder"], wall: ["drain", "rend"],
        duelist: ["flurry", "spell"], berserker: ["flurry", "execute"],
    };
    const arch = archKey || archetypeForTier(t).key;
    const want = BY_ARCH[arch] || BY_ARCH.balanced;
    const allowed = NPC_KIT.slice(0, depth);
    const chosen = want.map((k) => allowed.find((x) => x.kind === k)).filter(Boolean);
    if (!chosen.length) chosen.push(NPC_KIT[0]);
    // Tier scales what the moves are worth, gently — the big lever is already their damage and health.
    const scale = 1 + Math.min(0.6, t * 0.006);
    // THE THIRD MOVE, and the one you cannot have. Appended rather than replacing, so a hard opponent still
    // fights out of its archetype and then does something you have no card for.
    const only = npcOnlyMove(t, arch, scale);
    if (only) chosen.push(only);
    return chosen.map((k, i) => ({
        id: `npc${t}:${k.kind}:${i}`,
        itemId: null,
        name: k.name,
        from: n.name,
        kind: k.kind,
        cooldown: k.cd,
        hits: k.hits || 1,
        // The accuracy each move costs to throw — read by resolveBeat as `ability.acc`. Without carrying it
        // here the penalties would sit in the catalog doing nothing, which is this codebase's favourite bug.
        acc: k.acc || 0,
        power: Math.round(k.power * scale * 100) / 100,
        element: n.element,
        rarity: "epic",
        rank: 2,
        defensive: false,
        blurb: k.name,
        sprite: k.sprite,
        effect: { head: `×${Math.round(k.power * scale * 100) / 100}`, sub: "damage", line: k.name, tags: [] },
    }));
}

/**
 * Which tiers a member may take on. You can always re-fight anything you have already beaten (so there is
 * never nothing to do), plus a REACH above your best — but the reach is generous rather than one-at-a-time,
 * because being told to grind tier 7 before you may look at tier 9 is the treadmill this is meant to replace.
 */
export const NPC_REACH = 5;

/**
 * The tier whose stat budget matches a given rating — i.e. where you ALREADY belong, before you have beaten
 * anything.
 *
 * THE REACH USED TO START AT ZERO. `npc_best` is 0 until you win a Gauntlet fight, so a member who arrived
 * fully geared could only ever be offered tiers 1-5 — every one of them a joke — and once the matchmaker
 * started RESERVING seats for the Gauntlet, that guaranteed a run of Straw Dummies to exactly the players
 * least interested in one. The ladder was gating on "what have you proven here" when it had a much better
 * answer available: what you are carrying.
 */
export function tierForRating(rating) {
    if (!(rating > 0)) return 1;
    // SEARCHED, NOT SOLVED WITH A MAGIC NUMBER. The first cut multiplied npcPower by a constant I guessed at
    // (4.2) and put a rating of 400 at tier 17 — wildly wrong, and wrong in the direction that would have
    // handed a beginner the Nightmare band. Rating is health x damage x crit and none of that
    // collapses to one coefficient, so this walks the ladder and takes the closest tier. It is thirty
    // comparisons of arithmetic, once per matchmake.
    let best = 1;
    let bestGap = Infinity;
    for (let t = 1; t <= 200; t += 1) {
        const n = npcFor(t);
        // Derived with the SHARED helpers, not a second copy of the formulas. A Gauntlet tier is a stat block
        // now — might / crit / ferocity, exactly like a member's gear — so its damage and health come from the
        // same three functions the fight uses. Restating them here is how the ladder and the engine end up
        // disagreeing about how strong tier 20 is.
        const damage = swingFrom(n.might);
        // An NPC has no armour, so its stat block's `ferocity` IS its toughness — same number, same rate
        // through healthFrom, so splitting Vitality out of gear left every Gauntlet tier exactly where it was.
        const hp = healthFrom(n.ferocity);
        const cc = critChanceFrom(n.crit_chance);
        const cm = critMultFrom(n.crit_power);
        const perSwing = damage * (1 + cc * (cm - 1));
        const r = Math.round((perSwing * hp) / 10);
        const gap = Math.abs(r - rating);
        if (gap < bestGap) { bestGap = gap; best = t; }
        if (r > rating * 1.5) break;   // past it — the curve only climbs
    }
    return best;
}
export function npcOffer(bestTier = 0, count = 6) {
    const top = Math.max(1, bestTier + NPC_REACH);
    const out = [];
    // Show the frontier first — the ones you have not beaten — then a couple you have, to warm up on.
    for (let t = top; t >= 1 && out.length < count; t -= 1) out.push(npcFor(t));
    return out;
}
