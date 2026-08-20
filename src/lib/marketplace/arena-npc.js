import { swingFrom, healthFrom, critChanceFrom, critMultFrom } from "@/lib/marketplace/arena-kit.js";
import { ITEMS, sumItemStats } from "@/lib/marketplace/items.js";
import { CLASSES, treeEffects, treeFor } from "@/lib/marketplace/arena-classes.js";

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
//
// ── `bal` — ONE STATED POWER, ONE DIFFICULTY ─────────────────────────────────────────────────────────────
// The weights below decide what an archetype IS. They do not decide what it is WORTH, and for a long time the
// two were confused: a budget spent on health is not worth a budget spent on damage, so the same number
// produced wildly different fights. Measured across all three classes at best-in-slot
// (scripts/sim-archetype-cal.mjs, binary-searching the even fight):
//
//     Brute even at 1,126     Berserker 1,247     Balanced 1,339     Duelist 1,393     Wall 1,572
//
// A Wall therefore needed FORTY PERCENT more budget than a Brute to be the same fight, and the Road hands
// neighbouring rungs near-identical budgets — so walking it lurched. Measured with a real loadout, rung 82
// (Duelist) came in at 74% and rung 83 (Wall) at 98%, one step apart.
//
// `bal` is the correction: the reciprocal of what that archetype's power turned out to be worth. It changes
// how much budget the archetype is HANDED, never how it spends it — so a Wall is still a Wall, it is just
// finally the same difficulty as the Brute next to it. Luke: "we don't want it to spike ever... difficulty is
// more about their skills and strategy vs sheer power level."
//
// Re-derive with sim-archetype-cal.mjs after touching any weight, `tough`, `guard`, or the engine.
//
// Solved against a REAL loadout (sim-archetype-cal.mjs "The Wolf Den"), because the first attempt fitted to
// synthetic best-in-slot fighters did not hold — walked by an actual reaver the Road still swung from 24% on
// one rung to 93% on the next.
//
// ⚠️ THE DIRECTION IS even/mean, NOT mean/even. `even` is the budget an archetype needs to be a fair fight, so
// one that needs MORE than the mean is arriving too WEAK at any shared rung power and must be handed more.
// Getting that backwards does not soften the error, it doubles it: it took the spread from 26 points to 92 and
// turned a Wall into a 98% walkover. Measure, apply, then measure AGAIN — correcting the budget moves the
// fight the next reading is taken from.
// Re-derived 2026-08-19 against the NEW builder. The previous numbers were measured when an NPC went through
// ringStats — an invisible 100-base weapon — and they went stale the moment an NPC became a made-up player
// wearing real gear. Nobody touched a weight; the correction was simply describing different maths, and the
// ladder started lurching again: rung 41 was a 14% fight for the field and rung 42 a 49% one.
// Re-derive with scripts/sim-archetype-cal.mjs after touching any weight, `tough`, or the engine.
const ARCH_BAL = { balanced: 1.02, brute: 0.67, wall: 1.37, duelist: 1.26, berserker: 0.75 };

export const ARCHETYPES = [
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
].map((a) => ({ ...a, bal: ARCH_BAL[a.key] || 1 }));
// The first three tiers are always Balanced. A Straw Dummy that rolled Brute is a tutorial that hits back
// harder than the thing after it, and the archetype cycle should not apply before you have met the baseline
// it deviates from.
export const archetypeForTier = (t) => {
    const n = Math.max(1, Math.round(t));
    return n <= 3 ? ARCHETYPES[0] : ARCHETYPES[n % ARCHETYPES.length];
};

// ── AN NPC IS A CHARACTER, NOT A STAT BLOCK ──────────────────────────────────────────────────────────────────
// Luke's brief, and it is the same rule the gear rework followed: whatever a member is made of, an opponent is
// made of the same things. A rung is therefore a whole CHARACTER —
//
//   a CLASS, with the passives that class actually has
//   POINTS SPENT in that class's tree, more of them the further up you are
//   GEAR at a rarity band, with real affixes rolled onto it
//   PROCS — crit, riposte, double strike, stun, haste — which are gear affixes, so they are RARE low down and
//           common high up, exactly as a member's wardrobe fills out
//   and an IDENTITY: the fight says what it is carrying before you commit to it
//
// The last one is not decoration. A bout resolves in seconds, so the only place a member can make a decision is
// BEFORE it — and a foe whose shape you cannot see is a coin toss wearing a portrait.

// Which class a rung fights as. Cycled rather than rolled so a rung is the same character every time, and
// offset from the archetype cycle (3 against 5) so the pairing does not repeat until rung fifteen.
const NPC_CLASSES = ["reaver", "warden", "runecaller"];
export const npcClassFor = (tier) => NPC_CLASSES[Math.max(1, Math.round(tier)) % NPC_CLASSES.length];

// How many tree points a rung has spent. A member has ten to twelve; a rung climbs past that because the
// ladder is endless and the tree is one of the few things about a character that can keep growing.
const NPC_POINTS_PER_TIER = 0.42;
export const npcPointsFor = (tier) => Math.max(0, Math.min(60, Math.round(Math.max(0, tier - 3) * NPC_POINTS_PER_TIER)));

// Spend them the way a member must: one at a time, respecting each node's rank cap and its gate. Deterministic
// per (tier, class), so the same rung is the same build every time you meet it.
function npcTree(classId, points, tier) {
    const tree = treeFor(classId);
    if (!tree.length || points <= 0) return {};
    const taken = {};
    const total = () => Object.values(taken).reduce((a, n) => a + n, 0);
    const order = [...tree].sort((a, b) => (a.tier - b.tier) || (a.id < b.id ? -1 : 1));
    let guard = 0;
    while (total() < points && guard < 500) {
        guard += 1;
        let placed = false;
        for (let i = 0; i < order.length; i += 1) {
            const n = order[(i + tier) % order.length];
            if (total() >= points) break;
            if ((taken[n.id] || 0) >= n.ranks) continue;
            if (total() < (n.needs || 0)) continue;
            taken[n.id] = (taken[n.id] || 0) + 1;
            placed = true;
        }
        if (!placed) break;
    }
    return taken;
}

// ── HOW MUCH OF THEIR GEAR IS ENCHANTED ──────────────────────────────────────────────────────────────────────
// Procs are gear affixes, so their density is a statement about how good the wardrobe is: nothing at the bottom
// of the ladder, because a Straw Dummy has not rolled a Riposte, and everything by the top. Ramped rather than
// stepped so no single rung is where the game suddenly starts critting you.
const PROC_FULL_TIER = 60;
const procDensity = (tier) => Math.max(0, Math.min(1, (Math.max(1, tier) - 4) / (PROC_FULL_TIER - 4)));

// What a fully-kitted rung carries, in gear points — the same units a member's affixes are counted in. A member
// with a good wardrobe runs 40-60 crit chance and single digits of the rare ones.
const PROC_CEILING = { crit_chance: 60, crit_power: 60, pierce: 14, lifesteal: 10, counter: 12, doublestrike: 12, stun: 10, haste: 10 };

// The archetype decides WHICH affixes it favours, so a Duelist really is the crit one and a Wall really does
// answer every blow — identity you can read off the card rather than a uniform sprinkle over everybody.
const PROC_LEAN = {
    balanced: {},
    brute: { crit_power: 1.4, pierce: 1.3, doublestrike: 1.2, stun: 1.2, crit_chance: 0.6, counter: 0.4, haste: 0.6, lifesteal: 0.5 },
    wall: { counter: 1.6, lifesteal: 1.4, stun: 1.1, crit_chance: 0.4, crit_power: 0.5, pierce: 0.5, doublestrike: 0.4, haste: 0.4 },
    duelist: { crit_chance: 1.8, crit_power: 1.6, pierce: 0.8, doublestrike: 1.1, haste: 0.8, counter: 0.6, stun: 0.5, lifesteal: 0.4 },
    berserker: { doublestrike: 1.6, haste: 1.5, crit_chance: 1.1, crit_power: 1.0, pierce: 1.0, stun: 0.7, counter: 0.3, lifesteal: 0.3 },
};

/** The affixes rolled onto a rung's gear. Deterministic, and thinner the lower down you are. */
function npcProcs(tier, archKey) {
    const d = procDensity(tier);
    if (d <= 0) return {};
    const lean = PROC_LEAN[archKey] || {};
    const out = {};
    for (const [k, ceil] of Object.entries(PROC_CEILING)) {
        const v = ceil * d * (lean[k] === undefined ? 1 : lean[k]);
        if (v >= 1) out[k] = Math.round(v);
    }
    return out;
}

// ── WHAT TO WARN THEM ABOUT ──────────────────────────────────────────────────────────────────────────────────
// Only the things that change how the fight GOES, in the member's own words, biggest first. A list of every
// stat would be a stat block again; this is the two or three facts you would want shouted across the sand
// before the bell.
const TELL_RULES = [
    { key: "lifesteal", from: (s, p) => (s.lifesteal || 0) * 0.0025 + (p.lifestealBonus || 0), text: "drinks what it lands" },
    { key: "counter", from: (s, p) => (s.counter || 0) * 0.0025 + (p.counterBonus || 0), text: "strikes back when you hit it" },
    { key: "doublestrike", from: (s, p) => (s.doublestrike || 0) * 0.005 + (p.doublestrikeBonus || 0), text: "swings twice" },
    { key: "stun", from: (s, p) => (s.stun || 0) * 0.005 + (p.stunBonus || 0), text: "stuns" },
    { key: "haste", from: (s, p) => (s.haste || 0) * 0.005 + (p.hasteBonus || 0), text: "hastes itself" },
    { key: "pierce", from: (s) => (s.pierce || 0) * 0.005, text: "goes through armour" },
    { key: "bleed", from: (s, p) => p.bleedChance || 0, text: "makes you bleed" },
    { key: "burn", from: (s, p) => p.burnChance || 0, text: "sets you alight" },
    { key: "ward", from: (s, p) => p.ward || 0, text: "fights behind a shield" },
    { key: "guard", from: (s, p) => p.guardChance || 0, text: "raises a guard" },
    { key: "thorns", from: (s, p) => (p.thorns || 0) + (p.iceThorns || 0), text: "returns damage" },
    { key: "freeze", from: (s, p) => p.freeze || 0, text: "freezes" },
];
export function npcTells(stats = {}, perks = {}) {
    const hits = TELL_RULES
        .map((r) => ({ key: r.key, text: r.text, v: r.from(stats, perks) || 0 }))
        .filter((r) => r.v >= 0.03)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3);
    const crit = (Number(stats.crit_chance) || 0) / 1000;
    if (crit >= 0.25 && hits.length < 3) hits.push({ key: "crit", text: "crits often", v: crit });
    return hits.map((h) => ({ key: h.key, text: h.text, pct: Math.round(Math.min(1, h.v) * 100) }));
}

/**
 * Everything a rung IS: class, tree, gear, affixes — and the plain-language tells that go on its card.
 * One place, so the fight, the card and any simulation are all looking at the same character.
 */
export function npcBuild(tier, seed = 0) {
    const t = Math.max(1, Math.round(tier));
    const arch = archetypeForTier(t);
    const classId = npcClassFor(t);
    const points = npcPointsFor(t);
    const taken = npcTree(classId, points, t);
    const stats = { ...npcStats(npcPower(t), arch.key, seed, t), ...npcProcs(t, arch.key) };
    const perks = treeEffects(classId, taken);
    const cls = CLASSES.find((c) => c.id === classId) || {};
    return {
        classId, className: cls.name || classId, points, taken, stats, perks,
        archetype: arch.key, archetypeName: arch.name, tell: arch.tell,
        tells: npcTells(stats, perks),
    };
}

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
        // ── DRESSED, NOT TABULATED ───────────────────────────────────────────────────────────────────────
        // Same builder the Road uses. A Gauntlet tier is a wardrobe now: a weapon with a base damage, six
        // pieces of armour, a shield with a block chance, and whatever affixes those items carry — scaled to
        // this tier's budget and biased by the archetype.
        ...npcStats(budget, arch.key, t, t),
        // Toughness is already folded into vitality by npcStats; kept on the line for the card only, and
        // nothing downstream may multiply by it a second time.
        tough: arch.tough || 1,
        // ── HOW HARD THEY BRACE ──────────────────────────────────────────────────────────────────────────
        // Guard stopped being one flat share for every fighter, so an NPC that inherited the member default
        // would brace for 12% — a board-wide difficulty cut nobody asked for, landing right after the Road
        // was tuned. These are set per archetype instead, averaging what they used to get, which keeps the
        // curve where it was and makes the Wall's tell ("strip its guard") literally true.
        guard: arch.guard ?? 0.20,
        // Damage reduction and accuracy are both retired — armour is the whole of mitigation and every swing
        // lands — so they are not emitted at all rather than emitted as zero and read by nothing.
        gearPower: power,
        // Element cycles so consecutive tiers are not all answerable with one affinity — the wheel stays a
        // reason to re-attune rather than something you solve once.
        element: ["fire", "water", "earth", "storm", "light", "shadow"][t % 6],
        // Speed comes off the weapon npcStats picked, in attacks per second, the same as a member's. It used
        // to be `10 + power * 0.09` — the OLD clock, on a scale where a member reads about 1.1, so a mid-tier
        // NPC arrived at 13 and swung a dozen times per member swing.
    };
}


// ── AN NPC IS A MADE-UP PLAYER ───────────────────────────────────────────────────────────────────────────────
// Luke's call, and it removes a whole class of bug rather than a single one: every fight in the game — the
// Gauntlet, the Road, a fishing encounter, a town raid — is a bout against a fighter built the way a member is
// built. Same stat vocabulary, same converter, same engine.
//
// WHAT IT REPLACES. NPCs carried might/crit/vitality and nothing else, and were converted by ringStats() while
// members went through fighterFrom(). The two had drifted: ringStats called swingFrom(might) with no weapon,
// so it fell back to WEAPON_BASE_REF (100) — an invisible weapon four times better than the best one anybody
// owns. On identical stat lines an NPC hit for 2000 and a member for 500. Nothing about that was visible from
// either side of the ring, and no amount of tuning the tier curve could have found it.
//
// HOW A BUDGET BECOMES A LOADOUT. Rather than invent a base_damage and an armour figure per tier — two more
// numbers on two more curves, drifting from the player field the moment either changes — the NPC is dressed
// out of the real catalogue. A tier picks a rarity band, one item per slot is chosen deterministically from
// it, and sumItemStats gives a stat block with a player's PROPORTIONS: a weapon's base damage, armour spread
// over six pieces, a shield's block chance, the affixes those items happen to carry. The block is then scaled
// to hit the tier's power budget exactly, so the curve stays smooth between rarity steps instead of stepping
// nine times and stopping.
//
// The archetype still decides SHAPE, applied as a bias on top: a Brute's loadout is the same loadout with its
// might multiplied up and its bulk down. What an archetype is has not changed; what it is made of has.
const NPC_RARITY_LADDER = ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial"];
// Tier 1 opens in common and the ladder tops out around the Gauntlet's Ascendant band. Beyond that the gear
// stops climbing and only the scale below does, which is the honest version of "it keeps getting taller".
const TIERS_PER_RARITY = 13;
const rarityForTier = (t) => NPC_RARITY_LADDER[Math.min(NPC_RARITY_LADDER.length - 1, Math.floor(Math.max(1, t) / TIERS_PER_RARITY))];

// Deterministic, so tier 40 is the same fighter every time the server starts and two members see one opponent.
const hash = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const NPC_SLOTS = ["main_hand", "off_hand", "helmet", "chest", "belt", "boots", "back", "amulet", "ring", "ring"];
let _bySlot = null;
function slotPool(slot, rarity) {
    if (!_bySlot) {
        _bySlot = {};
        for (const it of ITEMS) {
            if (!it.slot || !it.stats) continue;
            (_bySlot[it.slot] ||= []).push(it);
        }
    }
    const all = _bySlot[slot] || [];
    const hit = all.filter((i) => i.rarity === rarity);
    // Not every slot exists at every rarity — fall back to the whole slot rather than sending a fighter out
    // with an empty hand, which would cost them their entire weapon rather than a tier of it.
    return hit.length ? hit : all;
}

// How far through its rarity band a tier sits, 0..1. A band is TIERS_PER_RARITY wide.
const bandProgress = (tier) => (Math.max(1, tier) % TIERS_PER_RARITY) / TIERS_PER_RARITY;

/**
 * The wardrobe a tier fights in. Deterministic per (tier, seed), one item per slot.
 *
 * RANKED, NOT ROLLED. Picking uniformly at random inside the band made the ladder non-monotonic: tier 5 rolled
 * an 8-base weapon where tier 3 had a 10-base one, so the fifth rung hit softer than the third. That is fine
 * for a member — gear is luck — and unacceptable for a difficulty curve, where the whole promise is that the
 * next one is harder. Each slot's pool is sorted by the intrinsic that slot contributes and indexed by how far
 * through the band the tier sits, so a wardrobe climbs steadily and steps up at every band boundary. The seed
 * still chooses BETWEEN equals, so two fighters of the same tier need not be in identical kit.
 */
export function npcLoadout(tier, seed = 0) {
    const rarity = rarityForTier(tier);
    const p = bandProgress(tier);
    const ids = [];
    NPC_SLOTS.forEach((slot, i) => {
        const pool = slotPool(slot, rarity);
        if (!pool.length) return;
        const key = (it) => (Number(it.stats?.base_damage) || 0) + (Number(it.stats?.armor) || 0)
            + (Number(it.stats?.block_chance) || 0) * 100;
        const ranked = [...pool].sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1));
        const at = Math.min(ranked.length - 1, Math.floor(p * ranked.length));
        // Ties on the ranking key are broken by the seed, so identical-strength kit still varies.
        const same = ranked.filter((x) => key(x) === key(ranked[at]));
        ids.push(same[hash(`${tier}:${seed}:${slot}:${i}`) % same.length].id);
    });
    return ids;
}

/**
 * A full, gear-shaped stat line for an opponent: what a member would have if they were wearing this.
 * Everything the engine reads comes out of here in the same vocabulary a wardrobe uses.
 */
export function npcStats(power, archKey, seed = 0, tier = null) {
    const arch = ARCHETYPES.find((a) => a.key === archKey) || ARCHETYPES[0];
    // `bal` normalises what this archetype's power is WORTH (see ARCH_BAL) — how much budget it is HANDED,
    // never how it spends it.
    const budget = Math.max(1, Math.round(power * (arch.bal || 1)));
    const t = tier ?? tierForPower(power);

    // ── TWO HALVES, EXACTLY AS A MEMBER HAS ──────────────────────────────────────────────────────────────
    // A member's sheet is their WEAPON and their PLATE — which come from the tier of gear they have reached —
    // plus the points rolled on top of it, which are what they have earned. An NPC is built the same way.
    //
    //   the intrinsics come from a real wardrobe at this tier's rarity: a weapon's base damage and swing rate,
    //   armour spread over six pieces, a shield's block chance. Nothing here scales with the budget, because
    //   a clock is not a total and because damage is base x might, so scaling both makes it quadratic — which
    //   it briefly was, and a tier-90 fighter swung for 39,610.
    //
    //   the points are the budget, spent through the archetype weights. Unchanged from what was tuned, so a
    //   Wall is the Wall the calibration measured; it simply now carries the plate it always implied.
    const gear = sumItemStats(npcLoadout(t, seed));
    return {
        base_damage: Math.round(Number(gear.base_damage) || 0) || undefined,
        speed: Number(gear.speed) || undefined,
        armor: Math.round(Number(gear.armor) || 0),
        block_chance: Number(gear.block_chance) || 0,
        // Vitality is what buys health; the ferocity weight was authored as the health weight and the
        // archetype note still depends on it, so it is what vitality is spent on.
        vitality: Math.round(budget * arch.w.ferocity * (arch.tough || 1)),
        might: Math.round(budget * arch.w.might),
        crit_chance: Math.round(budget * arch.w.crit_chance),
        crit_power: Math.round(budget * arch.w.crit_power),
        ferocity: Math.round(budget * arch.w.ferocity),
        gearPower: budget,
    };
}

// The inverse of npcPower, so a Road rung quoted only as a power still knows which wardrobe to wear.
export function tierForPower(power) {
    const p = Math.max(1, Number(power) || 1);
    return Math.max(1, Math.round(Math.log(p / BASE_POWER) / Math.log(GROWTH)) + 1);
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
    // `bal` normalises what this archetype's power is WORTH (see the note on ARCH_BAL). Applied here, at the
    // Road's own builder, so a rung's stated power means one difficulty whichever shape it rotated onto.
    // The Gauntlet's npcFor above carries the same latent spread and is deliberately NOT touched: it was not
    // measured for this and re-tuning it unasked would move a balance nobody complained about.
    // ONE BUILDER FOR EVERY OPPONENT IN THE GAME. The Road used to spend a budget across four stats here while
    // the Gauntlet did the same thing thirty lines up and a fishing monster did it a third way — three copies
    // of "how a budget becomes a fighter", which is three chances to forget the stat that was added last week.
    // npcStats dresses them all out of the real catalogue instead.
    return {
        ...npcStats(power, archKey, seed),
        // `tough` and `guard` stay on the line for anything that reads them off the card. tough is already
        // folded into vitality by npcStats, so nothing may multiply by it a second time.
        tough: arch.tough || 1,
        guard: arch.guard ?? 0.20,
        element: element || ["fire", "water", "earth", "storm", "light", "shadow"][seed % 6],
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
