// ── WHAT YOUR GEAR LETS YOU DO IN THE RING ───────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the arena screen and the engine read the same kit, so what you are shown is
// exactly what you fight with.
//
// The arena used to be rock-paper-scissors against a printed probability, which is not a decision: you compute
// the best response and repeat. It is gone. A bout is now YOUR EXECUTION against THEIR LOADOUT — you time every
// swing and every block, and what you have to work with comes out of the gear you built.
//
// Nothing here is invented from nothing. The Den already has:
//   · six ELEMENTS on every item, with a paid Forge reforge and rare dual-affinity
//   · a hundred-odd SIGNATURE powers on marquee gear, written so "gear defines a playstyle"
//   · rarity tiers that already mean something everywhere else
// This maps those into moves. Every ability names the item it came from, because an ability you cannot trace
// to a piece of gear is magic, and you cannot build toward magic.

import { itemById } from "@/lib/marketplace/items.js";
import { ELEMENTS, itemElement } from "@/lib/marketplace/boss-weakness.js";

// The ladder lives in rarity.js — twelve copies of it stopped at eternal, and a missing rarity
// ranks below common in silence rather than throwing.
import { RARITY_RANK as RANK } from "@/lib/marketplace/rarity.js";
const rankOf = (id) => RANK[itemById(id)?.rarity] ?? 0;

// ── THE ELEMENT WHEEL ────────────────────────────────────────────────────────────────────────────────────────
// A build-level triangle, NOT the per-round guessing that just got deleted. You can see your opponent's
// affinity before you challenge and re-attune at the Forge to answer it — so it is a decision you make with
// your gold and your loadout, in advance, rather than a coin flip in the moment.
// Exported so the fight screen can SHOW the wheel. "Earth overcomes Light" is a conclusion; without the
// rule in front of you there is no way to know why, or to plan a re-attune around it.
export const BEATS = {
    fire: ["earth", "shadow"],
    water: ["fire", "earth"],
    earth: ["storm", "light"],
    storm: ["water", "shadow"],
    light: ["shadow", "fire"],
    shadow: ["water", "light"],
};
export const ELEMENT_EDGE = 0.25;   // damage swing when your affinity answers theirs

export function elementClash(mine, theirs) {
    if (!mine || !theirs || mine === theirs) return { mult: 1, note: null };
    // "Earth overcomes Light" never said whose Earth or whose Light. Possessives, always.
    if (BEATS[mine]?.includes(theirs)) return { mult: 1 + ELEMENT_EDGE, note: `Your ${ELEMENTS[mine]?.label} overcomes their ${ELEMENTS[theirs]?.label}` };
    if (BEATS[theirs]?.includes(mine)) return { mult: 1 - ELEMENT_EDGE, note: `Their ${ELEMENTS[theirs]?.label} smothers your ${ELEMENTS[mine]?.label}` };
    return { mult: 1, note: null };
}

// ── SIGNATURES → NAMED ABILITIES ─────────────────────────────────────────────────────────────────────────────
// The signature catalog is written for the BOSS (conditional multipliers on a once-a-day strike), so its shapes
// don't transfer literally. What transfers is the identity: the name, the item and the archetype. Each becomes
// an arena move of the matching character.
// ── ELEVEN KINDS, NOT THREE ──────────────────────────────────────────────────────────────────────────────────
// Nine of the nineteen archetypes below used to map onto "strike", and strike, spell and execute were the same
// code path with a different word on them: deal power × damage. So a four-piece kit read as
//
//     ×2.5 damage  ·  +6% on top
//     ×2.1 damage  ·  +6% on top
//     ×2   damage  ·  +6% on top
//
// — three cards that are the same skill with the numbers filed off, and no reason to pick one over another
// beyond the biggest multiplier. That is a one-trick pony with four coats of paint.
//
// The fix is NOT more damage tiers. Every kind below changes the SHAPE of a bout rather than its size:
// something that hits many times, something that keeps hurting after it lands, something that heals you,
// something that opens their guard for the next move, something you play on THEIR turn. Damage is deliberately
// held near parity across them so the choice is about what the fight needs, not which number is biggest.
//
//   strike   one committed blow
//   flurry   several small blows — more rolls of the dice, so more crits
//   spell    its own element, and it cuts guard
//   execute  ordinary, until they are hurt
//   rend     it keeps burning after it lands
//   drain    what it takes off them, it gives to you
//   sunder   opens their guard for everything that comes next
//   ward     soaks the next blow
//   surge    sharpens the next two
//   riposte  played on THEIR beat: their blow comes back at them
//   gamble   double, or nothing
const ARCHETYPE = {
    firstHitMult: { kind: "strike", cd: 3, power: 2.3, blurb: "A committed opener." },
    critMult: { kind: "strike", cd: 3, power: 2.4, blurb: "Finds the seam." },
    firstHitCrit: { kind: "strike", cd: 3, power: 2.4, blurb: "Opens on a crit." },
    xpOnHit: { kind: "strike", cd: 2, power: 1.8, blurb: "Studied, precise." },

    // "Erupts on contact" was a plain hit. It burns now, which is what erupting means.
    eruptChance: { kind: "rend", cd: 3, power: 1.5, blurb: "Erupts, and keeps burning." },

    // "Hits hardest while they're fresh", "your companion piles in", "more swings in you than there should
    // be" — three signatures that are obviously about VOLUME and were all modelled as one big hit.
    onslaught: { kind: "flurry", cd: 3, power: 0.95, hits: 3, blurb: "Hits hardest while they're fresh." },
    beastbond: { kind: "flurry", cd: 3, power: 0.85, hits: 3, blurb: "Your companion piles in." },
    extraStrikes: { kind: "flurry", cd: 4, power: 0.8, hits: 4, blurb: "More swings in you than there should be." },
    ticketOnCrit: { kind: "flurry", cd: 2, power: 0.7, hits: 3, blurb: "Lucky. Repeatedly." },

    // "Feeds on the fight" and "takes something with it" are both about TAKING, not about sharpening.
    bloodlust: { kind: "drain", cd: 3, power: 1.9, blurb: "Feeds on the fight." },
    goldOnHit: { kind: "drain", cd: 3, power: 1.7, blurb: "Takes something with it." },

    // "Made for bigger things than you" — a giant-slayer breaks the armour rather than out-hitting it.
    giantSlayer: { kind: "sunder", cd: 3, power: 2.05, blurb: "Made for bigger things than you." },

    opportunist: { kind: "execute", cd: 4, power: 2.4, blurb: "Hits far harder on a wounded foe." },
    attuned: { kind: "spell", cd: 4, power: 2.3, blurb: "Channels your affinity." },
    overcharge: { kind: "spell", cd: 6, power: 3.2, blurb: "Discharges everything at once." },
    vanguard: { kind: "surge", cd: 3, power: 1.0, blurb: "Sharpens your next two swings." },
    // NOTE: surge and the two defensive kinds deal no damage by design. That is fine in a mixed kit and
    // catastrophic in a pure one — see scripts/sim-arena.mjs, which measures both.
    packTactics: { kind: "ward", cd: 4, power: 1.0, blurb: "Braces you against the next blow." },

    // "A banner nobody wants to fight under" is a threat, not a shield — so it answers back.
    warbanner: { kind: "riposte", cd: 5, power: 1.0, blurb: "Nobody wants to fight under it." },

    highroller: { kind: "gamble", cd: 5, power: 3.0, blurb: "All of it, or none of it." },
};

// Rarity is the dial: the same signature on an eternal hits harder than on a legendary.
const TIER_SCALE = [1, 1, 1, 1, 1.12, 1.24, 1.36];

// The blurb on an ability is flavour — "A committed opener." That tells you the mood and nothing else, so
// there was no way to know whether a skill was worth its cooldown without using it and watching the log.
//
// This writes the mechanics out from the SAME constants the engine applies, so the description cannot drift
// away from the behaviour. Every number below is read off arena.js's resolution, including the trades: a
// spell really is multiplied by 0.88 in exchange for cutting guard, so that is what it says.
const SPELL_POWER_TAX = 0.88;   // arena.js: power *= 0.88 for the guard cut
const SPELL_PIERCE = 0.40;      // arena.js: guard *= 0.6
// WARD_SOAK was 0.18 and a ward is played on THEIR beat, so it costs you nothing — which measured at 83% win
// rate in a mixed kit, the strongest thing in the game by twenty-five points, for no decision at all. A free
// action has to be small or it dominates. 0.12 on a longer cooldown keeps "brace against the blow you can see
// coming" as the point of it without making the slot mandatory.
export const WARD_SOAK = 0.09;         // arena.js: shield += maxHp * 0.12
// SURGE was the opposite problem: 16%, the worst in the game. It cost a whole turn to gain 0.35 x 2 = 0.7 of
// a turn's damage back, so casting it was arithmetically worse than swinging. +50% on THREE swings is 1.5
// turns of damage for one turn spent, which is finally worth the tempo.
const SURGE_MULT = 0.5;         // arena.js: surge multiplier is 1.5
export const SURGE_SWINGS = 3;         // arena.js: b.surge = 3
const EXECUTE_MULT = 1.5;       // arena.js: power *= 1.5 under the threshold
const EXECUTE_UNDER = 0.35;     // arena.js: foeHp <= foeMaxHp * 0.35
// ── THE NEW KINDS' CONSTANTS ─────────────────────────────────────────────────────────────────────────────────
// Same contract as the block above: every number here is the one arena.js actually applies, so a card can
// never drift away from the behaviour it is describing.
export const REND_TURNS = 3;        // arena.js: bleed ticks this many of their beats
export const REND_PER_TURN = 0.045; // of their MAX health, per tick
// A BLEED CAP. Simulated at 3,000 bouts a cell, an uncapped stacking burn won 83.8% and ended fights in 5.7
// beats — every extra application added another full tick forever, so the correct play was "rend, rend, rend"
// and the bout was over before any other kind got to matter. Three stacks is still the strongest damage-over-
// time in the game; it is just no longer a runaway.
export const REND_MAX_STACKS = 3;
export const DRAIN_SHARE = 0.5;     // of damage dealt, returned to you as health
export const SUNDER_CUT = 0.4;      // of their guard, removed
export const SUNDER_TURNS = 3;
// Also free, also measured too strong at 56%. Trimmed and slowed for the same reason as the ward.
export const RIPOSTE_SHARE = 0.3;   // of their landed blow, sent back at them
// A SHIELD CEILING. Wards and ripostes are played on THEIR beat and do not cost you a swing, so a loadout of
// four defensive pieces got a fresh shield almost every enemy turn while still attacking every turn of its
// own — 86.5% in simulation, the strongest kit in the game by a distance, for the least thought. Soaking is
// capped as a fraction of your own health, so stacking wards has a ceiling and the fifth one is wasted.
export const SHIELD_CAP = 0.45;     // of your max health, total, at any moment

// ── THE FREE KINDS ── the defensive pair costs you no beat, on EITHER side of the exchange: the effect lands,
// the cooldown starts, and your turn is still yours to swing with.
//
// They were already free on their beat — Bulwark's own card reads "it does not cost you a swing" — while the
// on-your-turn path quietly took the whole turn to do the same thing, and Answer on your own turn matched no
// branch at all, so it set no riposte, dealt nothing and ended the turn regardless. This is the promise
// already printed on the card, kept in both places.
//
// SURGE IS DELIBERATELY NOT HERE, even though it also deals no damage. It is the one support kind whose price
// IS the turn: +50% across three swings on a three-turn cooldown is permanent uptime, so handing it out free
// is a flat +50% damage. Measured over 2,000 bouts a cell in scripts/sim-arena.mjs, making it free took the
// Gauntlet at tier 20 from 44% to 88%, and it was still 62% after cutting it to +10% on three swings. That is
// a re-tune of a tuned card, not a fix to a trap, so it stays a turn you spend. (It is separately the weakest
// kind in the game at 33.5% in a mixed kit — worth revisiting, on purpose, with the numbers in hand.)
export const FREE_KINDS = new Set(["ward", "riposte"]);
export const isFreeKind = (kind) => FREE_KINDS.has(kind);

const x = (n) => `\u00d7${(Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "")}`;

// A sentence per ability meant four cards of near-identical paragraph, and three of them opened with the same
// twenty words. Nobody reads that mid-fight. An ability is a HEADLINE and a couple of TAGS instead — the
// number you care about, big, and the exceptions as chips you can scan.
//
// `head`  the one figure that matters, or the whole effect when there is no damage
// `tags`  {t: text, k: kind} — kind drives the colour, so a downside can never look like an upside
// ── HOW A SKILL IS DESCRIBED ─────────────────────────────────────────────────────────────────────────────────
// One headline, one short sub, and AT MOST one tag. The previous version stacked up to three tags on a card
// roughly 150px wide, which on a phone wrapped "on your next 2 swings" onto four lines and pushed the gear it
// came from into an ellipsis. A skill you are choosing mid-fight has to be readable in about a second.
//
// `line` is the whole thing said as one sentence — used in the compact rail and the tooltip, where a headline
// and a sub would be two things to read instead of one.
function effectOf(kind, power, element, hits = 1) {
    const el = element ? ELEMENTS[element]?.label || element : null;
    switch (kind) {
        case "strike":
            return { head: x(power), sub: "damage", line: `${x(power)} damage, one blow`, tags: [] };
        case "flurry":
            return {
                head: `${hits}×`, sub: `${x(power)} hits`,
                line: `${hits} hits of ${x(power)} — every one can crit`,
                tags: [{ t: "More crit rolls", k: "good" }],
            };
        case "spell":
            return {
                head: x(power * SPELL_POWER_TAX), sub: "damage",
                line: `${x(power * SPELL_POWER_TAX)} ${el || "elemental"} damage, cuts ${Math.round(SPELL_PIERCE * 100)}% guard`,
                tags: [{ t: `Cuts ${Math.round(SPELL_PIERCE * 100)}% guard`, k: "good" }],
            };
        case "execute":
            return {
                head: x(power * EXECUTE_MULT), sub: `under ${Math.round(EXECUTE_UNDER * 100)}%`,
                line: `${x(power)} damage — ${x(power * EXECUTE_MULT)} if they are under ${Math.round(EXECUTE_UNDER * 100)}%`,
                tags: [{ t: `${x(power)} otherwise`, k: "bad" }],
            };
        case "rend":
            return {
                head: `${Math.round(REND_PER_TURN * 100)}%`, sub: `a turn, ${REND_TURNS} turns`,
                line: `Burns for ${REND_TURNS} more turns after it lands`,
                tags: [{ t: `Stacks ${REND_MAX_STACKS}\u00d7`, k: "good" }],
            };
        case "drain":
            return {
                head: x(power), sub: "damage",
                line: `${x(power)} damage, and you keep ${Math.round(DRAIN_SHARE * 100)}% of it`,
                tags: [{ t: `Heals ${Math.round(DRAIN_SHARE * 100)}% of it`, k: "good" }],
            };
        case "sunder":
            return {
                head: `−${Math.round(SUNDER_CUT * 100)}%`, sub: "their guard",
                line: `${x(power)} damage and strips ${Math.round(SUNDER_CUT * 100)}% of their guard for ${SUNDER_TURNS} turns`,
                tags: [{ t: `For ${SUNDER_TURNS} turns`, k: "good" }],
            };
        case "gamble":
            return {
                head: x(power * 2), sub: "or nothing",
                line: `${x(power * 2)} damage on a coin flip, nothing on the other side`,
                tags: [{ t: "Coin flip", k: "bad" }],
            };
        // Surge is the support kind you PAY for — see FREE_KINDS. Saying so is the whole point of the tag:
        // next to two skills that keep your turn, "no damage" did not tell you which of the three cost one.
        case "surge":
            return {
                head: `+${Math.round(SURGE_MULT * 100)}%`, sub: `next ${SURGE_SWINGS} swings`,
                line: `+${Math.round(SURGE_MULT * 100)}% on your next ${SURGE_SWINGS} swings`,
                tags: [{ t: "Spends your turn", k: "bad" }],
            };
        case "ward":
            return {
                head: `${Math.round(WARD_SOAK * 100)}%`, sub: "soaked",
                line: `Soaks ${Math.round(WARD_SOAK * 100)}% of your health from the next blow — and you still act`,
                tags: [{ t: "Keeps your turn", k: "good" }],
            };
        case "riposte":
            return {
                head: `${Math.round(RIPOSTE_SHARE * 100)}%`, sub: "sent back",
                line: `Their next blow returns ${Math.round(RIPOSTE_SHARE * 100)}% of itself to them — and you still act`,
                tags: [{ t: "Keeps your turn", k: "good" }],
            };
        default:
            return { head: x(power), sub: "damage", line: `${x(power)} damage`, tags: [] };
    }
}

/**
 * The kit a loadout fights with.
 *
 * @param equippedIds  array of equipped item ids
 * @param sigMap       { itemId: { label, ...flags } } from signatures.js — passed in so this module stays pure
 * @param elementOf    optional { itemId: element } override (the Forge's Attune), else derived from the item
 */
export function buildKit(equippedIds = [], sigMap = {}, elementOf = {}) {
    const ids = equippedIds.filter(Boolean);

    // ── AFFINITY ── the element you carry most of. Ties break toward the rarer piece, so your best item speaks.
    const tally = {};
    for (const id of ids) {
        const el = elementOf[id] || itemElement(id);
        if (!el) continue;
        tally[el] = (tally[el] || 0) + 1 + rankOf(id) * 0.1;
    }
    const element = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null;

    // ── ABILITIES ── one per signature piece you're wearing, best first, capped so the bar stays readable.
    const abilities = [];
    for (const id of ids) {
        const sig = sigMap[id];
        if (!sig) continue;
        const key = Object.keys(ARCHETYPE).find((k) => sig[k]);
        if (!key) continue;
        const a = ARCHETYPE[key];
        const item = itemById(id);
        const scale = TIER_SCALE[rankOf(id)] || 1;
        abilities.push({
            id: `${id}:${key}`,
            itemId: id,                      // the piece it came from, still named on every card
            // The MOVE's own icon, not the gear's. A ring and a cape tell you nothing about what the ability
            // does; nineteen archetype emblems do, and the element tint goes on top in CSS.
            sprite: `/images/arena/skill-${key}.webp`,
            name: sig.label || item?.name || "Signature",
            from: item?.name || id,          // ALWAYS shown — an ability must be traceable to a piece of gear
            kind: a.kind,
            cooldown: a.cd,
            hits: a.hits || 1,
            effect: effectOf(a.kind, Math.round(a.power * scale * 100) / 100, elementOf[id] || itemElement(id) || element, a.hits || 1),
            // Wards and ripostes are the defensive half — playable on THEIR beat instead of costing you a swing.
            defensive: a.kind === "ward" || a.kind === "riposte",
            // …and the support kinds cost you nothing on your OWN beat either: cast it, then still act.
            free: FREE_KINDS.has(a.kind),
            power: Math.round(a.power * scale * 100) / 100,
            blurb: a.blurb,
            element: elementOf[id] || itemElement(id) || element,
            rarity: item?.rarity || "rare",
            rank: rankOf(id),
        });
    }
    abilities.sort((a, b) => b.rank - a.rank || b.power - a.power);
    const kit = abilities.slice(0, 4);

    // Nobody fights empty-handed. A loadout with no signature gear still gets one honest move.
    if (!kit.length) {
        kit.push({
            id: "basic:focus", itemId: null, name: "Focused Blow", from: "your own hands", kind: "strike",
            sprite: "/images/arena/skill-firstHitMult.webp",
            cooldown: 0, power: 1.9, hits: 1, blurb: "No magic in it. Still hurts.", element, rarity: "common", rank: 0,
            effect: effectOf("strike", 1.9, element, 1), defensive: false,
        });
    }
    return { element, abilities: kit };
}

// ── THE TUNING ───────────────────────────────────────────────────────────────────────────────────────────────
// ── THE ARENA READS YOUR REAL STATS ──────────────────────────────────────────────────────────────────────────
// It used to invent two: VIGOUR and an arena MIGHT, both derived from `gearPower` — the raw sum of every stat
// on your kit, so a point of Fortune made you tougher exactly as much as a point of Might did. Then it hid the
// rest of the fight behind rolls: a +-18% wobble on every swing, and a defender "grade" that secretly rolled
// 12%, 32% or 55% damage reduction FRESH EVERY BLOW. Two players in identical gear could see 14 and 36 on the
// same swing at the same opponent and neither number was explainable from anything on screen.
//
// All of it is gone. The arena now reads the SAME stats the boss fight reads, and every number it produces is
// printed on one of the two cards:
//
//   damage      SWING_BASE x (1 + Might/100)            <- Might, the real stat, exactly as the boss uses it
//   crit        min(90%, 25% + Crit Chance/100)         <- the boss fight's own crit model, not a second one
//   crit damage x(2.5 + Crit Power/100)                 <- likewise
//   health      HEALTH_BASE + Ferocity x 2.5            <- Ferocity, the real stat
//   who opens   Ferocity                                <- likewise; you are quick AND you last
//   armour      a printed number on the card
//
// FEROCITY IS THE STAYING-POWER STAT. The first cut of this had health FLAT for everyone, on the grounds that
// the Den has no vitality stat and inventing one would repeat the health mistake. Simulated, that is a ladder
// that eats you: an opponent's damage climbs with their tier and your health never climbs at all, so the tier
// you can beat is decided by how fast you die rather than by anything you built. Ferocity already exists, is
// already on gear, and does nothing in here but decide who swings first — so it is what keeps you standing.
// Nothing is invented; a real stat is read for a second real job.
export const HEALTH_BASE = 200;
export const HEALTH_PER_FEROCITY = 2.5;
export const healthFrom = (ferocity = 0) => Math.round(HEALTH_BASE + (Number(ferocity) || 0) * HEALTH_PER_FEROCITY);

// One unarmoured swing at zero Might. Everything else is a multiplier on this, so there is exactly one number
// to turn if bouts run long or short. See scripts/check-arena.mjs, which simulates the whole grid.
export const SWING_BASE = 8;

// The boss fight's crit, verbatim (boss.js: 0.25 base, 2.5 multiplier). Two crit models for one player was a
// trap on its own — a Fortune kit critted constantly in here and never against the boss.
export const CRIT_BASE = 0.25;
export const CRIT_CAP = 0.9;
export const CRIT_MULT_BASE = 2.5;
export const critChanceFrom = (critStat = 0, bonus = 0) => Math.min(CRIT_CAP, CRIT_BASE + (Number(critStat) || 0) / 100 + bonus);
export const critMultFrom = (critPower = 0, bonus = 0) => CRIT_MULT_BASE + (Number(critPower) || 0) / 100 + bonus;

// ── THE PIT CLOSES ───────────────────────────────────────────────────────────────────────────────────────────
// A beat costs about 2.6 seconds of animation before anybody has decided anything, so a twenty-round bout is a
// minute and a half of watching — and the fights that ran longest were the least interesting ones, because a
// Wall you cannot dent is the same round twenty times. Length is not difficulty.
//
// So from round seven the sand runs out and EVERY blow lands harder, both ways, compounding each round. It is
// symmetric, it is announced on the HUD the round it starts, and it is not a timer that declares a winner:
// whoever was winning still wins, they just get there. A fight that would have run thirty rounds ends by
// fifteen, and one that was already short is untouched.
//
// A round cap with a points decision was the alternative, and it is worse: ship battles had one, and the thing
// it produced was "broke off and ran after 14 rounds" while both decks still had guns.
export const PIT_CLOSES_AT = 7;
export const PIT_STEP = 0.35;
export const pitFever = (beat = 1) => (beat < PIT_CLOSES_AT ? 1 : 1 + PIT_STEP * (beat - PIT_CLOSES_AT + 1));

/** Damage for one plain swing. No roll: the same kit against the same armour always reads the same number. */
export const swingFrom = (might = 0) => SWING_BASE * (1 + (Number(might) || 0) / 100);

// ── THE UNDERDOG CLAUSE ──────────────────────────────────────────────────────────────────────────────────────
// Without this a big enough gear gap is a WALL: simulated at the top of the ladder, a player did not win a
// single bout in 4,000, because health scales with gear about five times faster than might does. A first place
// nobody can take is not a ladder.
//
// The DEADBAND matters as much as the slope. Helping from the first point of difference wiped out moderate gear
// gaps entirely, which would have made gear pointless in exactly the matchups people actually pick.
export const UNDERDOG_MAX = 0.9;
export const UNDERDOG_DEADBAND = 0.35;
export function underdogEdge(myGearPower = 0, foeGearPower = 0) {
    const gap = (foeGearPower - myGearPower) / Math.max(40, myGearPower) - UNDERDOG_DEADBAND;
    if (gap <= 0) return 1;
    return 1 + Math.min(UNDERDOG_MAX, gap * 0.75);
}

// ── NO TIMING ────────────────────────────────────────────────────────────────────────────────────────────────
// The closing ring, its per-gear speed and the five timing GRADES all lived here. They are gone: a beat is
// decided by the command you choose and the gear behind it, so there is nothing left to grade. arena.js
// carries the two flat constants that replaced the grade multipliers, set to what an average hand was
// actually landing, which is why removing the ring moved no balance.

// ── COOLDOWNS, NOT FOCUS ─────────────────────────────────────────────────────────────────────────────────────
// Focus was a pool you filled by timing well and spent on skills. It made every skill interchangeable — a
// number you saved up — and a bad round of timing locked you out of your own gear entirely. Skills now go on
// cooldown for a few of your turns after use, so each one has its own rhythm and nothing can lock you out.
//
// The cooldowns ARE the old Focus costs, one for one, which keeps the rate of skill use about where the
// balance pass assumed: an ability with cooldown C is usable once every C+1 turns, so a four-piece kit at
// C=3 has something ready on 1 - (3/4)^4 = 68% of turns. The tuning assumed skills on ~70% of beats.
export const GUARD_COOL = 1;        // guarding also shaves a turn off everything cooling

// ── THE FIELD KIT ────────────────────────────────────────────────────────────────────────────────────────────
// Both fighters get the same small kit every bout. It is deliberately NOT the consumable economy: these cost
// nothing, they refresh each fight, and they vanish when it ends. That keeps the Items command from ever being
// an empty menu, and it avoids the trap where the correct play is burning a 6,500-gold potion on a ladder
// scrap. Using one spends your turn, which is the whole decision — drink, or swing.
export const BATTLE_ITEMS = [
    // 0.25 → 0.225, a ten percent trim. The blurb no longer says "a quarter" because it is no longer a quarter,
    // and a card that overstates what it does is worse than a weaker card. POULTICE_HEAL in arena-ai.js is the
    // foe's copy of this number and moves with it — the AI drinks the same poultice you do.
    { id: "poultice", name: "Field Poultice", count: 2, sprite: "/images/arena/item-poultice.webp",
        blurb: "Binds a wound. Restores a little under a quarter of your health.", kind: "heal", amount: 0.225 },
    { id: "draught", name: "Quickening Draught", count: 1, sprite: "/images/arena/item-draught.webp",
        blurb: "Every skill you own comes off cooldown at once.", kind: "refresh" },
];

// GUARD — no ring, no roll. You give up your swing and take a braced stance: it soaks a slice of the next blow
// outright and settles you enough to gain Focus. It is the honest answer to a bout going badly, and the reason
// the command menu is a decision rather than four ways to press attack.
//
// 0.30 was twice what it should be, and the reason was that the shield also PERSISTED. Thirty percent of your
// health that banks until something eats it means guarding twice puts most of a second health bar on the
// board, and against a foe that swings for a fraction of that the brace was never spent at all — it just
// accumulated to the cap. A brace is a stance you hold for one blow, not a wall you build.
//
// So the two changes go together: it is worth half as much, and it is gone once they have had their swing (see
// the expiry after each side's attack resolves in arena.js). Fifteen percent of your health against ONE blow
// is still the best answer to a big telegraphed hit, which is what the command is for.
export const GUARD_SOAK = 0.15;     // of your max health, absorbed from the next blow — and only the next one

// ── WHAT A MEMBER TURNS ASIDE ────────────────────────────────────────────────────────────────────────────────
// The counterpart to an NPC's `armour`, and the answer to "is armour just an NPC stat". It is — no gear rolls
// it and no tree node grants it, so a member's armour is always 0 — but a member is not going without: this
// flat 34% is what YOU turn aside from every blow, before Footwork adds up to another 10 on top. Most NPCs
// carry 6-26%, so a member's mitigation is usually the HIGHER of the two. It only ever looked one-sided
// because their number is printed on their card and yours was printed nowhere.
//
// Lives here rather than inside resolveBeat, where it was a local const, because it is a balance number with
// dependants — the fighter card now reads it, and scripts/sim-arena.mjs and scripts/check-arena.mjs each keep
// their own deliberate copy for a second opinion. Move this and move those.
export const BLOCK = 0.34;          // of every incoming blow, before Footwork
export const BLOCK_CAP = 0.70;      // the ceiling on block + Footwork together

// ── SPEED ────────────────────────────────────────────────────────────────────────────────────────────────────
// Who opens the bout was hard-coded to the challenger, which made Ferocity — a stat that until now only fed
// 24/7 passive boss damage — worth nothing in here. It decides initiative now: the faster fighter takes the
// first beat, and on a tie the challenger keeps it. Landing the opening blow in a ten-beat fight is a real
// edge, so there is finally a reason to build for it.
export const speedOf = (level = 1, ferocity = 0) => Math.round(10 + level * 0.3 + ferocity * 0.5);
