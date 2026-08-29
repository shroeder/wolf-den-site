// ── THE FOUR THINGS A MEMBER HAS THAT A RUNG DID NOT ─────────────────────────────────────────────────────────
// A member's combat stats come from FOUR sources — combatStats merges gear, pets, badges and what was bought
// at the casino Counter, all on the same terms. A rung had gear and nothing else, so the ladder was calibrated
// against a fiction in which the player is only their wardrobe. Measured across the eight most active members:
// badges alone run 8% to 35% of what their gear carries, and pets another 12% to 34% on top.
//
// It also never rerolled. There WAS a reroll model — it concentrated a set into two to five big lines, "an
// unplayed set has eight small affixes, a worked one has three big ones" — and it went out with the invented
// proc budget it was tangled in. So a rung wore whatever its items happened to ship with, which is the one
// thing no member above the early rungs does.
//
// Luke: "you need to look at each rung and come up with a creative effective build, using class symmetry with
// item rerolls to create unique and challenging builds. casino is a lever to use in terms of stats. and pets
// and badges as well. the goal is to make it harder and harder from 1 to rung 200."
//
// ── EVERY NUMBER IN HERE IS A REAL ONE ───────────────────────────────────────────────────────────────────────
// Nothing is invented. The reroll obeys the crafting rule that value MOVES rather than appears; the badges are
// real slugs summed out of BADGE_BONUSES; the pet is a real collectible run through combinePetBonuses, the
// same pure function a member's companion goes through; the casino track is level x per, exactly as
// casinoStatBonus computes it. What is authored here is the BUILD — which stats a shape rerolls toward, which
// companion it keeps, how deep it has gone at the Counter — which is the part that was meant to be designed.
// The PURE homes of both tables. badges.js and casino-perks.js are `server-only`, and reaching the data
// through them pulls db.js into a client bundle — a 165-error build, since arena-npc.js is client-reachable.
import { BADGE_BONUSES } from "@/lib/marketplace/badge-bonus-meta.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { combinePetBonuses } from "@/lib/marketplace/pet-perks.js";
import { STAT_TRACKS } from "@/lib/marketplace/casino-perk-tracks.js";
import { isIntrinsicStat } from "@/lib/marketplace/items.js";

// ── WHAT EACH BUILD IS TRYING TO BE ──────────────────────────────────────────────────────────────────────────
// Fifteen shapes — three classes against five archetypes — each with its own answer to "what would this
// fighter reroll toward, and what would it keep beside it". The class is what it can DO (its tree and its
// deck); the archetype is how it wants to do it. Pairing them is where the character comes from: a Reaver
// Wall is a bleeding fortress and a Reaver Berserker is a glass cannon, off the same nine nodes.
//
// `wants` is the reroll priority, heaviest first, and it is also what the casino spend follows — a fighter
// buys more of what it already leans on, the way a member does.
//
// ⚠️ EVERY LINE HERE IS A REAL STAT KEY. A typo silently rerolls value into a stat nothing reads, which is
// the failure the whole npc rework exists to end, so check:npc-legal asserts each one against STAT_META.
// ── A LIBRARY OF BUILDS, NOT A GRID OF PREFERENCES ───────────────────────────────────────────────────────────
// This was keyed `class:archetype` — three by five — so it could only ever hold fifteen plans, and it held
// fifteen flat stat preferences at that. Luke: "there should be a lot more than that because a build can have
// certain passive selection strategies, and it can also have different skill branches. But you can also couple
// those with specific reroll techniques to create extremely unique builds... players are gonna be able to
// detect those fifteen different patterns very quickly."
//
// A build is FOUR choices now, and the point is where they compound:
//
//   tree      which passives it buys FIRST, so its points land on the thing it is about
//   branches  which skill paths it walks — ONE FROM EACH of the class's three skills, because a skill may
//             only ever be taken down one path (the rule members play by, enforced by takeSkillNode)
//   wants     what it rerolls its gear toward, aimed at the INTERACTION rather than at a big number
//   pet       a companion paying into the same loop
//
// Luke's own worked example is rv_exsang below: pair chance-to-haste with lifedrink on a Reaver that bleeds and
// heals off the bleed. The haste buys more swings, every swing refreshes the wound, Exsanguinate turns the
// wound into health and the lifedrink turns the blow into health as well. No single stat on that list is
// remarkable and the loop is nasty.
//
// ⚠️ EVERY ID IN HERE IS REAL — node ids from treeFor(class), branch ids from that class's own skills, `wants`
// keys from STAT_META, the pet from COLLECTIBLES. check:npc-legal asserts all four, because every one of them
// fails SILENTLY when wrong: an unknown pet falls through to a fallback, an unknown node is never bought, an
// unknown branch yields nothing.
//
// ⚠️ AND ONE BRANCH PER SKILL, WHICH IS THE TRAP THAT ACTUALLY BIT. The first library had most builds naming
// two paths of the SAME skill — rv_exsang took hemorrhage AND sanguine, both of them Rupture. A skill may only
// be walked down one path, so the second silently overwrote the first and the deck came out a third the size:
// rung 100 was spending ZERO of its twelve skill points. Nothing threw. check:npc-legal counts skills per build
// now, so it cannot happen again.
const BUILDS = {
    // ── REAVER — bleed, tempo, crit, and drinking it back ────────────────────────────────────────────────
    rv_exsang: { cls: "reaver", shape: "berserker", pet: "dragon_whelp",
        tree: ["rv_rend", "rv_deep", "rv_letting", "rv_exsang", "rv_scent"],
        branches: ["sanguine", "frenzy", "laststand"], wants: { haste: 4, lifesteal: 3, might: 2 },
        idea: "It bleeds you, drinks the bleed, and hastes itself into doing it again." },
    rv_scent: { cls: "reaver", shape: "berserker", pet: "elder_dragon",
        tree: ["rv_quick", "rv_frenzy", "rv_scent", "rv_rend"],
        branches: ["hemorrhage", "frenzy", "predator"], wants: { ferocity: 4, haste: 3, might: 2 },
        idea: "Two bars to your one, and it never stops to think." },
    rv_guillotine: { cls: "reaver", shape: "duelist", pet: "chameleon",
        tree: ["rv_edge", "rv_savage", "rv_deep"],
        branches: ["butcher", "weight", "guillotine"], wants: { crit_chance: 4, crit_power: 3, pierce: 2 },
        idea: "Fishing for the one blow that ends you, and ignoring your plate to land it." },
    rv_harvest: { cls: "reaver", shape: "brute", pet: "gorilla",
        tree: ["rv_edge", "rv_savage", "rv_harvest"],
        branches: ["hemorrhage", "storm", "predator"], wants: { might: 4, crit_chance: 3, haste: 2 },
        idea: "Extra blows out of nowhere, each rolling its own critical." },
    rv_riposte: { cls: "reaver", shape: "wall", pet: "lion_cub",
        tree: ["rv_rend", "rv_letting", "rv_riposte", "rv_deep"],
        branches: ["sanguine", "weight", "laststand"], wants: { counter: 4, lifesteal: 3, vitality: 2 },
        idea: "Hitting it is the mistake. It answers, and the answer opens a wound that feeds it." },
    rv_concuss: { cls: "reaver", shape: "brute", pet: "griffin",
        tree: ["rv_edge", "rv_savage", "rv_concuss"],
        branches: ["butcher", "weight", "guillotine"], wants: { stun: 4, might: 3, crit_power: 2 },
        idea: "Every heavy blow is a chance you lose the next one." },
    rv_laststand: { cls: "reaver", shape: "wall", pet: "bear_cub",
        tree: ["rv_rend", "rv_letting", "rv_exsang"],
        branches: ["sanguine", "frenzy", "laststand"], wants: { vitality: 4, lifesteal: 3, might: 2 },
        idea: "It gets stronger the worse the fight is going for it. Do not let it get low." },
    rv_butcher: { cls: "reaver", shape: "duelist", pet: "baby_rex",
        tree: ["rv_edge", "rv_deep", "rv_savage"],
        branches: ["butcher", "storm", "guillotine"], wants: { pierce: 4, crit_power: 3, might: 2 },
        idea: "Straight through the plate, twice, and the cut keeps cutting." },
    rv_balanced: { cls: "reaver", shape: "balanced", pet: "tiger_cub",
        tree: ["rv_rend", "rv_edge", "rv_quick", "rv_savage"],
        branches: ["hemorrhage", "storm", "guillotine"], wants: { might: 3, crit_chance: 3, vitality: 2 },
        idea: "No weakness and no lever. Out-build it." },

    // ── WARDEN — the guard, the grudge, and making your own swing the problem ────────────────────────────
    wd_thorns: { cls: "warden", shape: "wall", pet: "gorilla",
        tree: ["wd_bulwark", "wd_deflect", "wd_thorns", "wd_ironhide"],
        branches: ["reprisal", "ledger", "standard"], wants: { counter: 4, vitality: 3, tenacity: 2 },
        idea: "The guard is not the win condition. What comes back off it is." },
    wd_ledger: { cls: "warden", shape: "brute", pet: "griffin",
        tree: ["wd_const", "wd_ironhide", "wd_grudge"],
        branches: ["fortress", "ledger", "medic"], wants: { vitality: 4, might: 3, tenacity: 2 },
        idea: "It banks everything you do to it and spends the lot on one swing." },
    wd_bloodprice: { cls: "warden", shape: "berserker", pet: "lion_cub",
        tree: ["wd_const", "wd_blood", "wd_grudge"],
        branches: ["fortress", "bloodprice", "medic"], wants: { lifesteal: 4, might: 3, vitality: 2 },
        idea: "It pays its own health for the blow and takes back more than it spent." },
    wd_unbreak: { cls: "warden", shape: "wall", pet: "bear_cub",
        tree: ["wd_bulwark", "wd_bastion", "wd_unbreak", "wd_const"],
        branches: ["fortress", "ledger", "standard"], wants: { vitality: 4, tenacity: 4 },
        idea: "A guard the size of a health bar, raised most beats. Strip it or wait it out." },
    wd_concuss: { cls: "warden", shape: "duelist", pet: "eagle",
        tree: ["wd_bulwark", "wd_retrib", "wd_concuss"],
        branches: ["reprisal", "punish", "warcry"], wants: { stun: 4, counter: 3, vitality: 2 },
        idea: "It wants you to swing. You lose the turn and it keeps its own." },
    wd_medic: { cls: "warden", shape: "wall", pet: "wolf_pup",
        tree: ["wd_const", "wd_mend", "wd_ironhide"],
        branches: ["fortress", "bloodprice", "medic"], wants: { vitality: 4, tenacity: 3, lifesteal: 2 },
        idea: "It out-heals you. Bring more than you think you need." },
    wd_reprisal: { cls: "warden", shape: "balanced", pet: "tiger_cub",
        tree: ["wd_bulwark", "wd_deflect", "wd_retrib", "wd_thorns"],
        branches: ["reprisal", "ledger", "standard"], wants: { counter: 3, tenacity: 3, vitality: 3 },
        idea: "Patient. Every exchange is slightly in its favour and it never needs to hurry." },
    wd_resolve: { cls: "warden", shape: "berserker", pet: "hydra",
        tree: ["wd_const", "wd_bastion", "wd_blood"],
        branches: ["resolve", "punish", "warcry"], wants: { ferocity: 4, vitality: 3, haste: 2 },
        idea: "Nothing holds it — not ice, not a stun — and it comes round faster than a Warden should." },

    // ── RUNECALLER — burn, ice, the ward, and the fifth swing ────────────────────────────────────────────
    rc_frostbite: { cls: "runecaller", shape: "wall", pet: "elder_dragon",
        tree: ["rc_frost", "rc_chill", "rc_ward"],
        branches: ["lance", "winter", "cataclysm"], wants: { ferocity: 4, vitality: 3, might: 2 },
        idea: "It takes your beats away and its own bar keeps filling. End it before it is your turn again." },
    rc_pyre: { cls: "runecaller", shape: "brute", pet: "griffin",
        tree: ["rc_kindle", "rc_ember", "rc_might"],
        branches: ["pyre", "shatter", "cataclysm"], wants: { might: 4, ferocity: 2, crit_power: 2 },
        idea: "It sets you alight and then hits the burning thing harder." },
    rc_emberdrink: { cls: "runecaller", shape: "berserker", pet: "dragon_whelp",
        tree: ["rc_kindle", "rc_immolate", "rc_ember"],
        branches: ["emberdrink", "rimeguard", "reclaim"], wants: { lifesteal: 4, might: 3, ferocity: 2 },
        idea: "The fire on you is what heals it. Putting it out is your problem." },
    rc_rimeguard: { cls: "runecaller", shape: "wall", pet: "turtle",
        tree: ["rc_rime", "rc_ward", "rc_reservoir"],
        branches: ["emberdrink", "rimeguard", "reclaim"], wants: { counter: 4, vitality: 3, tenacity: 2 },
        idea: "A wall of ice that bites the hand — it answers every blow, not only the blocked ones." },
    rc_surge: { cls: "runecaller", shape: "balanced", pet: "hydra",
        tree: ["rc_overflow", "rc_might", "rc_ward"],
        branches: ["lance", "shatter", "wellspring"], wants: { might: 4, ferocity: 3, crit_chance: 2 },
        idea: "Every fifth swing is enormous, counted and not rolled. You can see it coming." },
    rc_soulfire: { cls: "runecaller", shape: "duelist", pet: "baby_rex",
        tree: ["rc_kindle", "rc_soulfire", "rc_might"],
        branches: ["lance", "shatter", "cataclysm"], wants: { crit_chance: 4, crit_power: 3, might: 2 },
        idea: "Part of every blow is magic that your armour and your ward both ignore." },
    rc_ward: { cls: "runecaller", shape: "wall", pet: "gorilla",
        tree: ["rc_ward", "rc_reservoir", "rc_rime"],
        branches: ["pyre", "rimeguard", "wellspring"], wants: { vitality: 4, tenacity: 3, ferocity: 2 },
        idea: "It fights behind a shield that refills. You are on a clock and it is not." },
    rc_shatter: { cls: "runecaller", shape: "brute", pet: "croc",
        tree: ["rc_frost", "rc_might", "rc_soulfire"],
        branches: ["lance", "shatter", "cataclysm"], wants: { pierce: 4, might: 3, ferocity: 2 },
        idea: "The ice finds the seams. Half your plate is not there." },
    rc_cataclysm: { cls: "runecaller", shape: "berserker", pet: "runebound_drake",
        tree: ["rc_kindle", "rc_frost", "rc_cata"],
        branches: ["pyre", "winter", "cataclysm"], wants: { might: 3, ferocity: 3, crit_chance: 2 },
        idea: "Burning and frozen at once off one cast, and the cast comes round often." },
    rc_chill: { cls: "runecaller", shape: "duelist", pet: "chameleon",
        tree: ["rc_chill", "rc_frost", "rc_overflow"],
        branches: ["emberdrink", "winter", "wellspring"], wants: { ferocity: 4, crit_chance: 3, haste: 2 },
        idea: "Your bar runs slow and its does not. Every exchange it is further ahead." },
    rc_balanced: { cls: "runecaller", shape: "balanced", pet: "eagle",
        tree: ["rc_kindle", "rc_frost", "rc_ward", "rc_might"],
        branches: ["lance", "winter", "cataclysm"], wants: { might: 3, ferocity: 3, vitality: 2 },
        idea: "Fire, ice and a shield. It always has something ready." },
};

export const BUILD_IDS = Object.keys(BUILDS);
const hashBuild = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ── WHICH BUILD A RUNG IS ────────────────────────────────────────────────────────────────────────────────────
// Drawn from the rung's own hash, so there is no order to learn and two rungs a hundred apart are no more alike
// than two next to each other. Deterministic, so a rung is the same opponent every time you meet it and can be
// planned against.
export const buildForTier = (tier) => BUILDS[BUILD_IDS[hashBuild(`build:${Math.max(1, Math.round(tier))}`) % BUILD_IDS.length]];
// Exported for check:npc-legal, which asserts every id in every build against the table it points into —
// STAT_META for `wants`, treeFor for `tree`, the class's own skills for `branches`, COLLECTIBLES for the
// pet. All four fail silently when wrong, so none of them would ever surface on their own.
export const BUILDS_BY_ID = BUILDS;
export const BUILDS_FOR_CHECK = BUILDS;

const FALLBACK = BUILDS.rv_balanced;
// Kept for callers that still ask by class and shape — it answers with the first build matching both,
// which is only a fallback: buildForTier is what a rung actually is.
export const buildFor = (classId, archetype) =>
    BUILD_IDS.map((k) => BUILDS[k]).find((b) => b.cls === classId && b.shape === archetype) || FALLBACK;

// ── THE REROLL ───────────────────────────────────────────────────────────────────────────────────────────────
// Nobody rerolls a common. A rung low down wears what it found; a rung near the top has been to the bench over
// and over, taking the lines it did not want and moving their whole value onto the ones it did.
//
// VALUE IS CONSERVED, which is the crafting rule and not a convenience: a reroll MOVES a value, it does not
// create one (see crafting.js, where the whole value transfers). So the total is set by how good the gear is,
// and rerolling only decides how few lines it is sitting on. An earlier version of this capped each line
// instead, which pinned every rung from 15 upward to the same numbers.
//
// INTRINSICS ARE NOT TOUCHED. A weapon's base damage, a plate's armour, a shield's block and a weapon's speed
// belong to the piece rather than to a line on it — isIntrinsicStat is the same guard the Forge uses.
// ── EVERY RAMP IN THIS FILE IS SIZED SO THE LADDER FILLS ALL 200 RUNGS ───────────────────────────────────────
// First pass ran them all to full by about rung 90 and the result was a cliff, not a climb: the reference
// member sat at 96% on rung 40 and 0.8% on rung 60, so the top 140 rungs were indistinguishable — every one
// of them simply impossible. "Harder and harder from 1 to rung 200" means the curve has to still be moving
// at 200, which means nothing here may finish early.
const REROLL_FULL_TIER = 200;
export const rerollFrac = (tier) => Math.max(0, Math.min(0.85, (Math.max(1, tier) - 8) / (REROLL_FULL_TIER - 8)));

export function npcReroll(gear = {}, wants = {}, frac = 0) {
    if (!(frac > 0)) return { ...gear };
    const out = { ...gear };
    const keep = Object.keys(wants);
    const totalW = Object.values(wants).reduce((a, n) => a + n, 0) || 1;
    let moved = 0;
    for (const [k, v] of Object.entries(gear)) {
        const n = Number(v) || 0;
        if (!n || isIntrinsicStat(k) || keep.includes(k)) continue;
        const take = n * frac;
        out[k] = n - take;
        moved += take;
    }
    for (const [k, w] of Object.entries(wants)) out[k] = (Number(out[k]) || 0) + moved * (w / totalW);
    // Rounded once, at the end, so the conservation above is not eaten by rounding on every line.
    for (const k of Object.keys(out)) if (typeof out[k] === "number" && !isIntrinsicStat(k)) out[k] = Math.round(out[k]);
    return out;
}

// ── THE COUNTER ──────────────────────────────────────────────────────────────────────────────────────────────
// The four permanent stat tracks bought with chips. Deliberately the lever that carries the TOP of the ladder:
// it is the only one of the four with no ceiling — 500 chips for the first point and +500 every time, "linear
// growth against a linear benefit, which is what makes it safe to leave uncapped" — so it is the one thing a
// rung past the gear plateau can still be buying. Gear stops when the catalogue does; this does not.
//
// A rung spends the way a member does: on what its build already leans on. `wants` is the same weighting the
// reroll follows, so a Wall's chips go into Vitality and a Brute's into Might.
const CASINO_FROM_TIER = 45;
const CASINO_PER_TIER = 0.62;
export const casinoPointsFor = (tier) =>
    Math.max(0, Math.round((Math.max(0, tier - CASINO_FROM_TIER)) * CASINO_PER_TIER));

export function npcCasino(tier, wants = {}, override = null) {
    const points = override == null ? casinoPointsFor(tier) : Math.max(0, Math.round(override));
    if (points <= 0) return {};
    // Only the four stats the Counter actually sells, weighted by what this build wants; anything the build
    // wants that is not on a track (crit, pierce, haste) simply cannot be bought, which is true of a member too.
    const sellable = STAT_TRACKS.map((t) => t.stat);
    const w = Object.fromEntries(sellable.map((s) => [s, Number(wants[s]) || 0]));
    let total = Object.values(w).reduce((a, n) => a + n, 0);
    // A build that wants nothing purchasable still spends — evenly, the way somebody with chips and no plan does.
    if (total <= 0) { for (const s of sellable) w[s] = 1; total = sellable.length; }
    const out = {};
    for (const s of sellable) {
        const per = STAT_TRACKS.find((t) => t.stat === s)?.per || 1;
        const lv = Math.round(points * (w[s] / total));
        if (lv > 0) out[s] = lv * per;
    }
    return out;
}

// ── WHAT A RUNG IS SUPPOSED TO BE WORTH ──────────────────────────────────────────────────────────────────────
// Every rung is now its own fighter drawn from its own hash — no cycle to learn, no shape held for a stretch.
// That is what was asked for and it has a cost that has to be paid somewhere: when a rung's shape is a coin
// toss, so is its difficulty, and a ladder whose steps vary at random is not a ladder. Measured with the
// shapes merely rotating on a 5-cycle, a member's win rate swung with WHICH shape they met rather than with
// how high they were, and 33 rungs came out easier than the one below.
//
// So the tier states what a rung is worth and the build decides how it is spent. That is the opposite way
// round from the stat budget this whole rework deleted: nothing is handed a number here. The target is met by
// buying MORE OF A REAL THING — chips at the Counter — which is the one lever with no ceiling (500 for the
// first point and +500 every time, "linear growth against a linear benefit, which is what makes it safe to
// leave uncapped"). A rung that drew a weak shape has simply spent longer at the Counter, which is a sentence
// about a character rather than a fudge factor.
//
// ANCHORED ON MEASUREMENT, NOT TASTE. 653 is the combat total of the strongest member alive today — Eric D,
// summed the way combatStats sums it. The curve puts him at rung 55 and reaches 2.5x him at 200, so the back
// half of the ladder is where members are going rather than where they already are.
// ── AND IT IS ANCHORED AT BOTH ENDS, BECAUSE ONE ANCHOR CANNOT DO IT ─────────────────────────────────────────
// This was geometric off a single point at rung 55. Raising that point to make the top of the ladder bite
// lifted the BOTTOM by the same proportion, and Nynebreaker — a real member with a thin wardrobe — could no
// longer beat rung ONE. A ladder whose first step is unwinnable is not a difficulty curve, it is a wall.
//
// A power law in the rung fixes both ends at once: gentle where beginners are, steep through the middle, and
// still climbing at 200 without running away.
//
//   rung   1  ->  120   a first fight anybody wins
//   rung  55  -> 1198   where the strongest kit in the Den should stop winning outright — Luke: "The target I
//                       would like to have everyone at is about fifty five"
//   rung 200  -> ~2500  about twice rung 55, so the back half is somewhere to grow into
//
// ⚠️ 1198 IS MEASURED, NOT CHOSEN. It is what rung 115 actually carried when the strongest kit was walling
// there. The anchor is the WALL — a rung the best real build stops beating — not a stat total in the abstract,
// which is the mistake the first version made twice.
export const TARGET_AT_RUNG_1 = 120;
export const TARGET_AT_RUNG_55 = 1198;
const TARGET_EXPONENT = Math.log(TARGET_AT_RUNG_55 / TARGET_AT_RUNG_1) / Math.log(55);
export function targetTotal(tier) {
    const t = Math.max(1, Math.min(200, Math.round(tier)));
    return TARGET_AT_RUNG_1 * Math.pow(t, TARGET_EXPONENT);
}

// The stats the target is measured over: the six a fighter is built out of. Procs and fortune are deliberately
// outside it — they are character, and pricing them here would make a Riposte build quietly weaker.
const TARGET_KEYS = ["might", "vitality", "ferocity", "tenacity", "crit_chance", "crit_power"];
export const totalOf = (stats = {}) => TARGET_KEYS.reduce((a, k) => a + (Number(stats[k]) || 0), 0);

/**
 * The chips this rung has to have spent for its build to be worth what its height says.
 *
 * Never negative: a rung that is already over its target keeps what its gear gave it rather than having
 * anything taken away. Over-target rungs are the reason the ladder still has texture — some fighters are
 * simply better than their rung, the way some members are.
 */
export function casinoTrim(tier, have, wants) {
    const gap = targetTotal(tier) - have;
    if (!(gap > 0)) return {};
    return npcCasino(tier, wants, Math.round(gap));
}

// ── THE BADGE WALL ───────────────────────────────────────────────────────────────────────────────────────────
// Real slugs out of BADGE_BONUSES, summed exactly as sumBadgeDomain sums a member's — the combat domain only,
// no Long Service Record doubling, because that is an ascension power a rung has not bought.
//
// Taken heaviest-first, so a rung's wall reads as the record of somebody who has been here a long time rather
// than a random handful. How many it holds ramps: nothing before rung 10, the whole wall by the top.
const COMBAT_BADGES = Object.entries(BADGE_BONUSES)
    .map(([slug, d]) => ({ slug, d: d.combat }))
    .filter((x) => x.d && Object.keys(x.d).length)
    .sort((a, b) => Object.values(b.d).reduce((s, v) => s + v, 0) - Object.values(a.d).reduce((s, v) => s + v, 0));

const BADGES_FROM_TIER = 14;
const BADGES_PER_TIER = 0.42;
export const badgeCountFor = (tier) =>
    Math.max(0, Math.min(COMBAT_BADGES.length, Math.round((Math.max(0, tier - BADGES_FROM_TIER)) * BADGES_PER_TIER)));

export function npcBadges(tier) {
    const n = badgeCountFor(tier);
    if (n <= 0) return {};
    const out = {};
    for (const { d } of COMBAT_BADGES.slice(0, n)) for (const [k, v] of Object.entries(d)) out[k] = (out[k] || 0) + v;
    return out;
}

// ── THE COMPANION ────────────────────────────────────────────────────────────────────────────────────────────
// One real collectible, equipped, plus the ones a fighter this far along would have collected on the way — run
// through combinePetBonuses, which is the pure core a member's own pet goes through. No enshrinements and no
// ascension powers: those are a member's long game and a rung has not played it.
//
// The equipped one is chosen by the build (see BUILDS) and falls back to the first collectible that exists, so
// a renamed pet degrades to a weaker rung rather than throwing.
//
// ⚠️ THE IDS ARE REAL AND WERE CHECKED — check:npc-legal asserts every one against COLLECTIBLES. An early
// pass invented six (dire_wolf, fire_drake, stone_golem...) which all fell silently through to the fallback
// and gave every build the same companion; a later one used only three real ones across the whole ladder.
// One per build now, chosen for the stat that build leans on. There is NO vitality pet in the game, so the
// Walls keep a might or ferocity companion rather than a thematic one that pays nothing.
const PETS_FROM_TIER = 8;
const PETS_PER_TIER = 0.32;
export const petLevelFor = (tier) => Math.max(1, Math.min(6, 1 + Math.floor(Math.max(0, tier - PETS_FROM_TIER) / 34)));
export const petsOwnedFor = (tier) =>
    Math.max(0, Math.min(COLLECTIBLES.length, Math.round(Math.max(0, tier - PETS_FROM_TIER) * PETS_PER_TIER)));

export function npcPet(tier, build) {
    const owned = COLLECTIBLES.slice(0, petsOwnedFor(tier));
    if (!owned.length) return {};
    const equipped = COLLECTIBLES.find((c) => c.id === build?.pet) || owned[0];
    const lv = petLevelFor(tier);
    const levels = Object.fromEntries(owned.map((c) => [c.id, lv]));
    const bonus = combinePetBonuses(owned, equipped, levels, [], null, null);
    return bonus?.stats || {};
}

/**
 * Everything a rung carries that is not its gear, merged the way combatStats merges a member's.
 *
 * ONE LOOP OVER THE UNION OF KEYS, which is the shape combatStats settled on after "lifesteal, counter, stun,
 * haste and doublestrike simply had no pet or badge term at all, so a pet granting one granted nothing". A
 * stat added to the pool anywhere is carried by every source for free.
 */
export function npcExtras(tier, classId, archetype, gearStats = null) {
    // The rung's own build. classId/archetype are still taken so a caller with only those can ask, but a rung
    // IS a build now rather than a point in a class-by-shape grid.
    const build = buildForTier(tier) || buildFor(classId, archetype);
    const pet = npcPet(tier, build);
    const badges = npcBadges(tier);
    // The Counter is spent twice over: what a fighter this far along would have bought anyway, and then
    // whatever more it takes to make this particular build worth its rung. See casinoTrim.
    const base = npcCasino(tier, build.wants);
    const have = totalOf(gearStats) + totalOf(pet) + totalOf(badges) + totalOf(base);
    const trim = gearStats ? casinoTrim(tier, have, build.wants) : {};
    const out = {};
    const keys = new Set([...Object.keys(pet), ...Object.keys(badges), ...Object.keys(base), ...Object.keys(trim)]);
    for (const k of keys) {
        const v = (Number(pet[k]) || 0) + (Number(badges[k]) || 0) + (Number(base[k]) || 0) + (Number(trim[k]) || 0);
        if (v) out[k] = v;
    }
    return { stats: out, pet: build.pet, petLevel: petLevelFor(tier), petsOwned: petsOwnedFor(tier),
        badges: badgeCountFor(tier), casino: casinoPointsFor(tier) + Math.round(totalOf(trim)),
        target: Math.round(targetTotal(tier)), idea: build.idea, wants: build.wants };
}
