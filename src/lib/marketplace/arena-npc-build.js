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
const BUILDS = {
    "reaver:brute": { wants: { might: 4, crit_power: 2, lifesteal: 1 }, pet: "griffin",
        idea: "Everything on the swing. It does not expect to be hit twice." },
    "reaver:berserker": { wants: { might: 3, crit_chance: 3, haste: 2 }, pet: "elder_dragon",
        idea: "Crit-fishing at speed. Survive the opening and it folds." },
    "reaver:duelist": { wants: { crit_chance: 4, crit_power: 3, pierce: 2 }, pet: "chameleon",
        idea: "One blow, placed. It only needs the one." },
    "reaver:wall": { wants: { vitality: 3, might: 2, lifesteal: 2 }, pet: "griffin",
        idea: "A bleeding fortress — it out-lasts you and drinks what it lands." },
    "reaver:balanced": { wants: { might: 3, vitality: 2, crit_chance: 2 }, pet: "griffin",
        idea: "No weakness and no lever. Out-build it." },

    "warden:wall": { wants: { vitality: 4, tenacity: 3, counter: 2 }, pet: "griffin",
        idea: "Strip its guard or you are here all day." },
    "warden:brute": { wants: { might: 3, vitality: 3, tenacity: 1 }, pet: "griffin",
        idea: "A wall that swings back. It does not need to be fast." },
    "warden:balanced": { wants: { vitality: 3, might: 2, tenacity: 2 }, pet: "griffin",
        idea: "Patient. Every exchange is slightly in its favour." },
    "warden:duelist": { wants: { crit_chance: 3, vitality: 2, counter: 2 }, pet: "chameleon",
        idea: "It wants you to hit it. That is the plan." },
    "warden:berserker": { wants: { might: 3, vitality: 2, haste: 2 }, pet: "elder_dragon",
        idea: "Armour thrown away for pace. Punish the gap." },

    "runecaller:balanced": { wants: { might: 3, ferocity: 3, vitality: 2 }, pet: "elder_dragon",
        idea: "Comes round often and always has something ready." },
    "runecaller:duelist": { wants: { crit_chance: 4, crit_power: 2, ferocity: 2 }, pet: "elder_dragon",
        idea: "Fishing for the big one, and the bar keeps handing it chances." },
    "runecaller:wall": { wants: { vitality: 3, ferocity: 2, tenacity: 2 }, pet: "griffin",
        idea: "The ice is armour. It has all the time it needs." },
    "runecaller:brute": { wants: { might: 4, ferocity: 2, pierce: 1 }, pet: "elder_dragon",
        idea: "One enormous cast, and the bar to get there twice." },
    "runecaller:berserker": { wants: { ferocity: 4, might: 2, haste: 2 }, pet: "elder_dragon",
        idea: "It acts first, then again, and you are still reading the log." },
};
// Exported for check:npc-legal, which asserts every `wants` key against STAT_META — see the warning above.
// A typo there moves real affix value onto a key nothing reads, silently and for ever.
export const BUILDS_FOR_CHECK = BUILDS;
const FALLBACK = BUILDS["reaver:balanced"];
export const buildFor = (classId, archetype) => BUILDS[`${classId}:${archetype}`] || FALLBACK;

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
export const MEMBER_CEILING_TODAY = 653;
export const NPC_TARGET_AT_55 = 1.0;
export const NPC_TARGET_AT_200 = 2.5;
export function targetTotal(tier) {
    const t = Math.max(1, Math.min(200, Math.round(tier)));
    // Geometric between the two anchors, extended below 55 on the same curve, so every rung's step is the same
    // PROPORTION harder than the last rather than the same size — which is what "harder and harder" means once
    // the numbers are large.
    const k = Math.pow(NPC_TARGET_AT_200 / NPC_TARGET_AT_55, 1 / (200 - 55));
    return MEMBER_CEILING_TODAY * NPC_TARGET_AT_55 * Math.pow(k, t - 55);
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
// ⚠️ THE IDS ARE REAL AND WERE CHECKED. My first pass invented six — dire_wolf, fire_drake, stone_golem and
// the rest — all of which would have fallen through to the fallback and quietly given fifteen builds the same
// companion. The four that survive are picked by what they actually grant: griffin is the best `might` pet,
// elder_dragon the best `ferocity`, chameleon the best `crit_chance`. There is NO vitality pet in the game,
// which is why the Walls keep a might companion rather than a thematic one that pays nothing.
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
    const build = buildFor(classId, archetype);
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
