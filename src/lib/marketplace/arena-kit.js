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

// ── THE WHEEL IS GONE FROM THE RING ──────────────────────────────────────────────────────────────────────────
// Removed on request. It decided a quarter of a fight's damage before either fighter moved, off a matchup
// neither of them picked, and the only counter-play was a paid Forge re-attune between bouts — which is a
// shop trip, not a decision in the fight. A member losing 25% of every swing to a coin flip they were dealt
// at the door does not read as depth; it reads as the game having already chosen.
//
// ELEMENTS THEMSELVES STAY. Affinity still names your abilities, colours the particle effects and drives the
// boss fight's weakness system, which is a different feature and untouched. What is gone is the arena damage
// multiplier and nothing else.
//
// Kept as a neutral function rather than deleted so every call site keeps compiling and no caller has to know
// the mechanic went away. BEATS is still exported for the boss and for anything that wants to draw the wheel.
export function elementClash() {
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
// ── BLEED: THE OTHER DAMAGE-OVER-TIME, AND THE PHYSICAL ONE ──────────────────────────────────────────────────
// `rend` means to TEAR, and it set you on fire. An NPC skill called "Ragged Cut" — a knife wound — announced
// itself as burning, which is how "how am I burning?" became unanswerable from the log: the log was wrong.
// Fire comes from fire now; a cut bleeds.
//
// It is a SEPARATE track from the burn, not a re-skin, so a fighter can be burning and bleeding at once and
// the Reaver's nodes scale one while the Runecaller's scale the other.
//
// ⚠️ BLEED IGNORES SHIELDS ENTIRELY. It is the answer to a fighter who never lowers their guard: a brace
// banks a shield that eats SWINGS, and a wound does not care. This is the whole reason the Reaver owns it —
// see the tick in arena.js, which subtracts from health directly and never touches `shield`.
export const BLEED_PER_TURN = 0.035;   // of their MAX health, per stack, per turn
// ── LONGER THAN THE COOLDOWN, OR IT CANNOT BE BUILT ──────────────────────────────────────────────────────────
// Luke: "bleed and burn are super underpowered because they decay immediately, so you can't build it up or
// make any builds off of building it up."
//
// He is describing arithmetic rather than a feeling. Stacks arrive one cast at a time on a THREE-turn
// cooldown and used to last THREE turns — so the first stack expired on the exact beat the second landed and
// the total never moved off one. Every node in either tree that reads "another stack" was buying nothing.
//
// Five against a cooldown of three is the whole fix: two stacks overlap for two turns, three for one, and a
// build that commits to it is finally worth committing to. The per-turn ceilings below are untouched, so this
// cannot run away the way an uncapped burn once did — it just lets a fighter reach that ceiling by playing
// for it instead of never reaching it at all.
export const BLEED_TURNS = 5;
export const BLEED_MAX_STACKS = 3;
export const BLEED_TICK_CAP = 0.16;    // whatever the stacks, one turn of bleeding cannot exceed this
export const BLEED_TURNS_CAP = 8;

export const REND_TURNS = 5;        // arena.js: bleed ticks this many of their beats — see BLEED_TURNS
// ── THE BURN, REBUILT SO INVESTING IN IT MEANS SOMETHING ─────────────────────────────────────────────────────
// `rendTick` used to be ADDED to this: Runebrand read "+0.6% harder per rank", which sounds like nothing and
// very nearly was — four ranks moved a tick from 4.5% to 6.9% of their health. Luke: "should be like 30
// percent each rank." So the tree now MULTIPLIES the tick instead of nudging it, and the base drops to make
// room for that multiplier. Uninvested burns are gentler than they were; an invested one is more than twice
// what it ever was.
//
// ⚠️ ONE CAST IS ONE STACK. Stacks build a cast at a time on a 3-turn cooldown, against a burn that is
// expiring the whole while — so the number that matters is the SINGLE-STACK tick, not the three-stack one.
// This was tuned against three stacks first, which halved a single burn (45/turn -> 22/turn) while claiming
// to buff it. Luke, immediately: "does burning do anything, doesnt seem like it does any damage over time."
// He was right. The base is back where it was, so nothing regressed, and the multiplier is what the ranks buy:
//
//   1 stack, no points     4.5% of their max health a turn      (exactly what it always was)
//   1 stack, Runebrand x4  9.9%                                 (the rank is worth taking)
//   3 stacks, no points   13.5%
//   3 stacks, Runebrand x4 29.7%  -> held at the 20% cap below
export const REND_PER_TURN = 0.045;  // of their MAX health, per tick, PER STACK, before the tree multiplies it
// A CEILING ON WHAT ONE TURN OF BURNING CAN COST, whatever the stacks and whatever the investment. An
// uncapped stacking burn has already been shipped here once: it won 83.8% of 3,000 simulated bouts and ended
// them in 5.7 beats, because every application added another full tick forever. The cap is set just above
// what a fully-ranked Runebrand reaches on its own, so all four of its ranks are worth buying and it is
// Kindling's extra stacks that run into the ceiling rather than the node Luke asked to make matter.
export const REND_TICK_CAP = 0.20;
// And a ceiling on how LONG. Slow Burn buys turns rather than a second copy of "harder", which is what its
// name has always said; without a cap four ranks would take a burn to seven of their beats and the class
// would win by waiting.
export const REND_TURNS_CAP = 8;
// THE STACK CAP IS GONE (Luke, 2026-08-16: "is there a cap at 3 fire sticks? if so remove that"). Stacks build
// as long as you keep casting. The 83.8%-win runaway this cap was written for had NO per-turn ceiling either —
// REND_TICK_CAP above is what actually holds the line now, so extra stacks reach the ceiling faster instead of
// climbing without end. Kindling raises that ceiling; it used to raise this.
export const DRAIN_SHARE = 0.5;     // of damage dealt, returned to you as health
// ── RETALIATION ── what a counter-swing is worth, as a share of your normal damage.
//
// It was half, on the reasoning that a free blow off somebody else's turn must not out-earn attacking. That
// reasoning was never tested, because the counter did not reach the fighter's own lifesteal, could not crit,
// lit nothing and — for most of its life — was not visible at all, so nobody could have judged what it was
// worth. Luke, deciding it: "it should do damage as much as a typical attack."
//
// A FULL swing. What keeps it honest is the trigger, not a discount: it only fires when their blow LANDS, at
// 5% per rank to a ceiling of 20%, off nodes twelve points into one tree. Read on BOTH sides in arena.js.
export const COUNTER_POWER = 1;
// ── SHATTER DOES NOT CUT GUARD ANY MORE, IT TAKES IT AWAY ────────────────────────────────────────────────────
// The Runecaller had THREE skills that all cut guard — Channel, Shatter and Overcharge — which is one idea
// sold three times and, between them, more guard-cutting than the game wants. Luke: "too much guard cutting
// this skill needs to change to disables them from guarding for 3 turns." So Shatter is now the only
// guard-facing move the class has, and it is categorically different from a percentage: for three of their
// beats they cannot raise a guard at all.
export const GUARD_DISABLE_TURNS = 3;
// ── FREEZE ───────────────────────────────────────────────────────────────────────────────────────────────────
// An ice spell can lock the other fighter out of a beat. Deliberately UNCOMMON — Luke asked for "a rare
// chance" — because losing a turn is the most frustrating thing that can happen to you in a fight, and the
// difference between a thrill and a grievance is how often it happens to you rather than by you.
//
// TWO RULES KEEP IT FROM BREAKING A BOUT, and both matter:
//   1. A FROZEN TURN STILL BURNS A BEAT. Every stall guarantee in this file keys off `b.beat` — the pit
//      escalates from beat 10, the ring is called at 50. Freezing skips the ACTION, never the beat, so a
//      frozen fighter still walks toward the end of the bout instead of parking it.
//   2. NO RE-FREEZE WHILE FROZEN. Without it, two ice casts could chain into a lock the other player never
//      acts through, which is the shape of every deadlock this file has already been fixed for.
export const FREEZE_CHANCE = 0.18;
export const FREEZE_TURNS = 1;
// ── AND YOU CANNOT BE TAKEN OFF THE BOARD TWICE RUNNING ──────────────────────────────────────────────────────
// Luke: "combat has kind of devolved into who gets more extra turns and who can freeze the most, which makes
// all of their builds pretty much worthless."
//
// There were THREE independent ways to lose a beat and they were rolled separately, every beat, for the whole
// of a 25-round fight: a queued freeze, the stun stat on a landed blow, and a permanent per-turn chill
// roll that could reach 60%. Each one alone is a mechanic; three of them compounding is a lock, and against a
// lock nothing else on your character is doing anything — which is exactly the complaint.
//
// One roll now, and one beat of immunity after it lands. You can still be frozen, and it still costs you the
// turn it always did; what you cannot be is frozen on the turn after that. The counter-play is restored
// without deleting the mechanic: a control build still opens the window it was built to open, and the fighter
// on the receiving end still gets to play the game in between.
export const CONTROL_IMMUNE_TURNS = 1;
// The permanent per-beat chill roll. 0.6 was a coin flip on losing your turn, for ever, from one stat — the
// single largest source of "my build did nothing". It is a nudge now, and the immunity above bounds the worst
// case regardless.
// CHILL_CAP is gone. Chill is a magnitude now — the share of a bar's rate it takes — and arena-atb.js caps
// nothing but the stall floor. A second, tighter cap living here would have meant the same cold was worth
// four different amounts depending on which file you asked.
// Also free, also measured too strong at 56%. Trimmed and slowed for the same reason as the ward.
export const RIPOSTE_SHARE = 0.3;   // of their landed blow, sent back at them
// A SHIELD CEILING. Wards and ripostes are played on THEIR beat and do not cost you a swing, so a loadout of
// four defensive pieces got a fresh shield almost every enemy turn while still attacking every turn of its
// own — 86.5% in simulation, the strongest kit in the game by a distance, for the least thought. Soaking is
// capped as a fraction of your own health, so stacking wards has a ceiling and the fifth one is wasted.
export const SHIELD_CAP = 0.45;     // of your max health, total, at any moment
// ── AND A SHIELD IS A MOMENT, NOT A SECOND HEALTH BAR ────────────────────────────────────────────────────────
// A shield only ever went down by absorbing a blow. Nothing else touched it — so a Warden refilling on every
// one of its own swings sat permanently at the cap, which is 45% extra health that regenerates and never
// expires. Healing cannot do that at any investment: regen is a share of max health and STOPS at max health,
// while a shield stacks on top of it. Luke: "shielding, because it doesn't decay, is basically way better than
// healing will ever be."
//
// It sheds a quarter of itself at the start of every one of your beats. That does not make a ward weak — the
// blow you raised it for is usually the very next one — it makes it a thing you TIME. Bank one and sit on it
// for five rounds and there is nothing left; the fighter who refills it every swing settles at an equilibrium
// below the cap instead of living at it.
//
// This is also the biggest lever on how LONG a fight is, which is the root of everything else wrong in here:
// a 25-round bout is one where every per-round effect (freeze, chill, extra turns) beats every per-hit one.
export const SHIELD_DECAY = 0.25;   // of the shield you are holding, at the start of each of your beats

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
// Exported so the CLASS TREE can describe its actives with the same words the gear cards use. A tree node
// carries a short authored line ("You keep half of what it takes off them") which says the flavour and not the
// numbers — no damage, no share, nothing you could weigh a point against. Rather than write those numbers a
// second time into every node, the tree runs the ability through this.
// `opts` carries what a Runecaller spell DOES besides damage — {burns, freezes}. Two spells that read
// identically on the card and behave completely differently in the ring is the thing this whole pass is
// undoing, so the card has to know.
export function effectOf(kind, power, element, hits = 1, opts = {}) {
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
        case "spell": {
            // ── A SPELL SAYS WHETHER SPELL DAMAGE FEEDS IT ───────────────────────────────────────────
            // Luke: "no way to tell if something benefits from spell damage or not." Attunement only ever
            // multiplied `spell` kind, so it did nothing for Emberbrand or Shatter — and NOTHING anywhere
            // said so. Every spell card carries the tag now, and only spell cards can.
            const feeds = { t: "Spell damage applies", k: "good" };
            if (opts.burns) {
                return {
                    head: x(power * SPELL_POWER_TAX), sub: "damage",
                    line: `${x(power * SPELL_POWER_TAX)} ${el || "fire"} damage, and it sets them burning`,
                    tags: [feeds],
                };
            }
            if (opts.freezes) {
                return {
                    head: x(power * SPELL_POWER_TAX), sub: "damage",
                    line: `${x(power * SPELL_POWER_TAX)} ${el || "ice"} damage — ${Math.round(FREEZE_CHANCE * 100)}% to freeze them for a turn`,
                    tags: [{ t: `${Math.round(FREEZE_CHANCE * 100)}% freeze`, k: "good" }],
                };
            }
            return {
                head: x(power * SPELL_POWER_TAX), sub: "damage",
                line: `${x(power * SPELL_POWER_TAX)} ${el || "elemental"} damage, bypasses ${Math.round(SPELL_PIERCE * 100)}% of their guard`,
                tags: [feeds],
            };
        }
        case "disarm":
            return {
                head: `${GUARD_DISABLE_TURNS} turns`, sub: "no guard",
                line: `${x(power)} damage, and they cannot guard at all for ${GUARD_DISABLE_TURNS} turns`,
                tags: [{ t: "Guard disabled", k: "good" }],
            };
        case "execute":
            return {
                head: x(power * EXECUTE_MULT), sub: `under ${Math.round(EXECUTE_UNDER * 100)}%`,
                line: `${x(power)} damage — ${x(power * EXECUTE_MULT)} if they are under ${Math.round(EXECUTE_UNDER * 100)}%`,
                tags: [{ t: `${x(power)} otherwise`, k: "bad" }],
            };
        case "rend":
            return {
                // Quoted REND_PER_TURN — 4.5% of MAX HEALTH — which belongs to lightBurn, the burn the game
                // never ran and which has now been deleted. The live burn is a share of the BLOW that lit it,
                // one stack a proc, ticking at the start of their turn. See the note on stacking in
                // arena-engine.js.
                head: "20%", sub: "of the blow, a tick",
                line: "Burns for a share of the blow that lit it, at the start of each of their turns",
                tags: [{ t: "Stacks — extends it, keeps the fiercer tick", k: "good" }],
            };
        case "drain":
            return {
                head: x(power), sub: "damage",
                line: `${x(power)} damage, and you keep ${Math.round(DRAIN_SHARE * 100)}% of it`,
                tags: [{ t: `Heals ${Math.round(DRAIN_SHARE * 100)}% of it`, k: "good" }],
            };        case "gamble":
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
// HEALTH_BASE (200) lived here and is gone with the ceiling it sat under — see HEALTH_PER_VITALITY.
// ── HEALTH COMES OFF VITALITY NOW ────────────────────────────────────────────────────────────────────────────
// It used to come off Ferocity, which also bought accuracy, initiative and 24/7 boss damage — one stat doing
// four jobs, so every armour piece was the same decision and gear had no axis of its own. Vitality is health
// and nothing else, it sits only on armour, and no badge grants it.
//
// The RATE IS UNCHANGED (2.5 a point) and armour's vitality is seeded equal to its ferocity, so a set that
// gave N health yesterday gives exactly N today. This is a split, not a nerf.
// HEALTH_PER_VITALITY is retired — vitality is normalised against VITALITY_MAX now, not paid per point.
// ── AND SO IS HEALTH ─────────────────────────────────────────────────────────────────────────────────────────
// Same treatment, same reason: `HEALTH_BASE + vitality * 2.5` gave everybody 200 health for nothing, so the
// stat only ever decided the part above it. A fighter with 93 vitality had 432 — barely twice the free floor.
//
// HEALTH_MAX has to be read against DAMAGE_MAX, because the two of them together are the LENGTH OF A FIGHT.
// A swing takes HEALTH_MAX/DAMAGE_MAX of an equal opponent's bar, before crit and before damage reduction.
// At Luke's first pair (10000 damage / 5000 health) a maxed fighter removes twice a maxed opponent's entire
// health with one swing and every bout in the game is one beat long. The ratio in the live game today is
// about 11:1, so this holds that: 110000 to 10000. One number to turn if bouts run long or short.
// ── RATES, NOT CEILINGS ──────────────────────────────────────────────────────────────────────────────────────
// VITALITY_MAX and HEALTH_MAX were here, with MIGHT_MAX and DAMAGE_MAX below and ARMOUR_K further down. Every
// one of them was a PREDICTION about the top of the game, and Luke's objection is the right one: a predicted
// maximum constrains future design and growth. ARMOUR_K proved it — chosen when member armour ran 360-729,
// still 600 when members carried 1,100, and by then every top fighter sat on the flat of a curve calibrated
// for a game that no longer existed.
//
// A RATE cannot go stale that way. It says what ONE POINT is worth, so the day gear carries more, the numbers
// simply get bigger and every existing matchup is untouched. There is no ceiling to raise and nothing to
// re-tune when content grows.
//
// ── AND THE RATE IS NOT LINEAR ───────────────────────────────────────────────────────────────────────────────
// Luke: "but the rate can't be linear." Linear leaves the gap unbounded — measured across the 34 members who
// actually fight, Might runs 242 down to 2, so a linear rate makes the unequipped player do 1 damage against
// a median 100. STAT_EXPONENT gives diminishing returns with NO ceiling: growth is unbounded, but the tail is
// compressed. At 0.75 the same 121x spread becomes 36x, the unequipped player does 4 rather than 1, and the
// competitive band barely moves (top-to-median 1.7x -> 1.5x). A doubling of Might is still worth 1.68x damage,
// so building for it pays.
//
// ⚠️ THE SAME EXPONENT IS USED FOR HEALTH, DAMAGE AND ARMOUR, and that is the property worth protecting.
// health/damage cancels, so BOUT LENGTH IS SCALE-INVARIANT: two equally-geared fighters trade the same number
// of beats in commons as in primordials, forever. Give health and damage different exponents and bout length
// starts drifting the moment gear grows, which is the whole class of bug this replaces.
export const STAT_EXPONENT = 0.75;
const curve = (v) => Math.pow(Math.max(0, Number(v) || 0), STAT_EXPONENT);

// ── HEALTH PER POINT OF VITALITY ─────────────────────────────────────────────────────────────────────────────
// Sized so the top of the ladder lands at Luke's target of about 1,500 health. HEALTH_BASE is gone with the
// ceiling: it was a floor everybody got for free, and the old note complained about exactly that ("a fighter
// with 93 vitality had 432 — barely twice the free floor"). A body with no vitality at all is a body that
// dies, which is what an unequipped fighter should be.
export const HEALTH_PER_VITALITY = 35.7;
export const healthFrom = (vitality = 0) => Math.round(HEALTH_PER_VITALITY * curve(vitality));

// One unarmoured swing at zero Might. Everything else is a multiplier on this, so there is exactly one number
// to turn if bouts run long or short. See scripts/check-arena.mjs, which simulates the whole grid.
// 8 -> 11. This is the one knob for bout LENGTH, and both fighters read it, so raising it shortens the fight
// without moving who wins it: every round-count in the Road drops by about a quarter and the win/loss line
// stays exactly where it was. A ten-beat design target was running thirteen-to-nineteen against the Road's
// wall archetypes, which is where "these fights are too slow" comes from — the walls carry 0.60 ferocity and
// 26% armour, so they were absorbing two fights' worth of swings.
//
// Deliberately not a hero-only buff. Making one side hit harder makes the Road easier, which is a different
// change from making it shorter, and only one of those was asked for.
export const SWING_BASE = 11;

// The boss fight's crit, verbatim (boss.js: 0.25 base, 2.5 multiplier). Two crit models for one player was a
// trap on its own — a Fortune kit critted constantly in here and never against the boss.
// ── EVERYBODY WAS CAPPED ─────────────────────────────────────────────────────────────────────────────────────
// Base was 25% and the cap 65%, so gear only had FORTY points of room — and a top loadout carries 75. Ten of
// the Den's 66 geared members sat exactly on the ceiling, which means every point of crit they owned above the
// fortieth bought nothing, and the stat stopped being a decision for precisely the people most invested in it.
// Luke: "it's kind of pointless at this point if everyone has 65% capped... maybe we need to nerf real gear's
// crit chance. I know that would nerf everything across the board but I mean that's kind of the point."
//
// Two changes rather than one, because either alone leaves it broken:
//   BASE 25% -> 20%   there has to be somewhere to climb FROM.
//   GEAR /100 -> /200 the divisor is the real fix. Halving what a point is worth doubles the room without
//                     touching a single item, so no piece of gear has to be rebalanced by hand.
// At 75 crit stat — the best loadout in the Den — that is 20 + 37.5 = 57.5%, under the cap with headroom left.
// The median 16 goes from 41% to 28%. Nobody is pinned, and the spread is thirty points wide instead of four.
export const CRIT_BASE = 0.0;      // nobody crits for free any more
export const CRIT_PER_POINT = 1000;   // 1 point of gear crit_chance = 0.1%
// ── BOTH HALVES OF CRIT ARE CAPPED, AND THE SECOND ONE NEVER WAS ─────────────────────────────────────────────
// Chance was capped at 0.9 and power was capped at nothing at all, which is the combination that makes a fight
// stop being a fight: at 90% every swing is effectively a critical, so the multiplier is not a spike any more,
// it is just the damage number — and being uncapped it grew with gear forever.
//
// It showed up worst on the things built out of a power BUDGET rather than a gear list. A Road fighter or a
// plaza raider spends its budget through archetype weights, so a big budget poured 130-300 points into crit
// chance against a 90% ceiling (most of it burnt) and the same again into crit power against no ceiling at all
// (all of it live). That is why the Bandit Lieutenant was landing 4x hits: not because it was designed to, but
// because half its wasted stat had nowhere to go and the other half had no roof.
//
// 65% and 3x. A critical is a thing that HAPPENS to you again, rather than the baseline with an occasional
// miss, and the ceiling is now the same shape for both numbers.
//
// Applies to every arena-based fight, which is all of them: PvP, the Gauntlet, the Long Road and the plaza
// skirmishes all resolve through these two functions, for the member AND the opponent. The fighter cards read
// the same helpers, so what is printed before you commit is what the engine uses.
// CRIT_CAP is retired — kept as a named number only because the fighter cards used to print it.
export const CRIT_CAP = Infinity;
export const CRIT_MULT_BASE = 1.25;   // 1 point of gear crit_power = +1% (the /100 below)
// ── NO CEILING ON CRIT DAMAGE ────────────────────────────────────────────────────────────────────────────────
// The 3x cap is gone. It was doing the job a cap does badly: gear crit power ran into it and stopped mattering,
// and the Reaver — the class whose whole sentence is "hit hardest" — had no way to push past a number everyone
// else also reached. Crit CHANCE keeps its ceiling (CRIT_CAP) because a fighter who always crits has deleted
// the mechanic; crit DAMAGE is a different thing entirely, since it only pays on a roll you still have to win.
//
// What holds the line instead: the chance cap above, and the fact that crit damage is the one stat with no
// floor under it — a build that pours everything into a 2x-rarer bigger number is making a real trade.
// ── NO CEILING ON CRIT CHANCE EITHER ─────────────────────────────────────────────────────────────────────────
// CRIT_CAP was 0.65 and the owner was sitting at 0.6495 — every point of crit chance he rolled, forged or
// socketed from then on did exactly nothing, silently, on one of the main damage affixes in the game. That is
// most of the answer to "why doesn't a maxed build feel maxed".
//
// So the cap is gone and going past 100% is a real build. See critStacks in arena-engine.js: at 100% you crit
// every time, and every further 100% is another guaranteed multiple of your crit damage, with the remainder
// rolled. 150% crits every time and doubles the crit half the time; 250% always doubles it and trebles it half
// the time.
export const critChanceFrom = (critStat = 0, bonus = 0) => Math.max(0, CRIT_BASE + (Number(critStat) || 0) / CRIT_PER_POINT + bonus);
export const critMultFrom = (critPower = 0, bonus = 0) =>
    CRIT_MULT_BASE + (Number(critPower) || 0) / 100 + bonus;

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
// ── THE SAND RUNS OUT AGAIN, SLOWLY ──────────────────────────────────────────────────────────────────────────
// This mechanic has now been in the game twice and out of it once, and both moves were right.
//
// AT 35% A BEAT FROM ROUND SEVEN it ended long bouts by taking the fight off the player: by round ten the
// numbers were so far above what either card said that nothing you had built mattered, and it punished the
// Warden hardest — a class whose entire win condition is outlasting. So it was removed.
//
// What removing it exposed is that it had been holding a door shut. It was the only thing in the engine that
// guaranteed a bout ENDS: any two fighters who cannot finish each other were, without it, in a loop with no
// exit. Nine live bouts were sitting in exactly that loop the night this came back — one at 130 beats, one
// with the foe on 9 health — and members could not leave them, so it cost them the Arena and the raid too.
//
// So it returns at a SEVENTH of the old slope and three rounds later: nothing for the first ten beats, then
// 5% a beat. A normal bout finishes inside twenty and never sees more than +50%, which is pressure rather
// than a takeover; a bout that reaches thirty is at double, and one that somehow reaches the beat cap is at
// triple and is going to end regardless. The Warden still gets to outlast — it just cannot outlast forever.
export const PIT_CLOSES_AT = 10;
export const PIT_STEP = 0.05;
export const pitFever = (beat = 1) => (beat < PIT_CLOSES_AT ? 1 : 1 + PIT_STEP * (beat - PIT_CLOSES_AT + 1));

// ── BRACES ARE NOT RATIONED ──────────────────────────────────────────────────────────────────────────────────
// There was a BRACE_LIMIT of 6 here, per fighter per bout. Removed on Luke's call: running out of a defensive
// command mid-fight has no explanation inside the fiction, and a player who wants to guard should be able to.
// What stops the brace stall is the alternating rule (never twice running), which binds both sides and leaves
// your blow landing on every other beat — plus pitFever below, which compounds damage until somebody drops.

// ── WHAT A WIN IS WORTH, AND WHY IT STOPPED BEING LINEAR ─────────────────────────────────────────────────────
// A win paid `40 + theirPower * 0.9` gold and `18 + theirPower * 0.4` XP, and the shape was the whole problem.
// Linear and unbounded in the opponent's power rating makes the Arena a SPIRAL: gold buys gear, gear raises
// everybody's power rating, a higher rating pays more gold. It compounds with nothing pushing back.
//
// Measured before it was touched (three days, the whole Den):
//   · 680,745 gold out of 1,286,853 minted — the Arena alone was 53% of every coin made in the game
//   · median win 895, top win 3,501 — which at 200 coins to the dollar is $17.50 for one fight
//   · the heaviest player took 32 wins in a day: 34,809 gold, $174
//
// SQUARE ROOT, so a stronger opponent still pays more but the curve flattens instead of running away. The
// shape matters more than the coefficients: it cuts almost nothing off a beginner's first win and roughly
// seven-eighths off the top, which is exactly where the inflation was.
//
//   power    25:   63 →  55 gold      (a first win, essentially untouched)
//   power   774:  737 → 215 gold      (the fight that prompted this: $3.69 → $1.08)
//   power  3846: 3501 → 454 gold      ($17.50 → $2.27)
//
// Both numbers live here, together, because they are the same decision made twice — see the memory note on
// balance constants never being copied. If you retune one, look at the other.
//
// ── SECOND PASS, 3.5 HOURS LATER, MEASURED RATHER THAN ESTIMATED ─────────────────────────────────────────────
// The square root did what it was meant to: the top win fell 3,501 → 469 and the median 279 → 153. It was still
// too much, and the reason the first pass looked sufficient is that it was checked as a PER-WIN number. Checked
// as a share of the economy — which is the only number that matters — the Arena was still minting:
//
//   24.8% of every coin        (next-largest single source: 18.1%)
//   41.6% of ALL XP in the game (next-largest: 11.5%)
//
// XP was the real outlier and the first pass barely touched it, because 3·√p was cut proportionally less than
// the gold was. Nearly half of all progression in the Den came from one repeatable button.
//
// These coefficients were not guessed: 86 real post-fix bouts were replayed through candidate curves against
// the same window's non-Arena earnings (scripts, and the note below). Projected landing:
//
//   top win 172 gold / 56 XP  →  11.1% of gold, 17.1% of XP
//
// which puts the Arena among the game's activities rather than above them. It stays the best-paying single
// action in the Den; it stops being half the Den.
//
// ⚠️ THE PER-WIN NUMBER IS ONLY HALF THE FAUCET. Cutting it 7x moved gold-per-hour only ~24%, because VOLUME
// rose to meet it. The daily allowance is 10 (+5 from the Stamina track, so 15 absolute maximum) and members
// are taking THIRTY-TWO wins a day — because arena.js's fight gate reads `roadRung <= 0 && ...`, so the Long
// Road does not count against the allowance at all. Retuning these constants again without closing that will
// keep producing the same result.
export const ARENA_GOLD_BASE = 12;
export const ARENA_GOLD_PER_ROOT = 2.5;
export const ARENA_XP_BASE = 5;
export const ARENA_XP_PER_ROOT = 0.8;

// ── AND PVP DOES NOT USE THE CURVE AT ALL ────────────────────────────────────────────────────────────────────
// The curve above is fine for the Road and the Gauntlet, where the opponent's power is a designed number on a
// bounded ladder. It was never fine for a MEMBER, whose "power" is their arena rating — damage x health, a
// product, so it grows with the square of their gear. A square root of a square is linear: the harder the Den
// geared, the more a win paid, forever. That is 82% of every coin the Arena has ever minted (405 wins against
// members rated 15k+, 574,543 gold) and it survived both previous nerfs untouched.
//
// A PvP purse is a flat roll instead — no input from either fighter's gear, so the spiral has nowhere to grip.
// Rank still scales with difficulty through VP, which is the honest home for "who you beat" because VP cannot
// be spent on anything.
//
// The XP range is set at the same ratio to gold the curve used (~0.32), so the two stay in proportion and XP
// does not quietly become the thing that needs fixing next.
export const PVP_GOLD_MIN = 109;
export const PVP_GOLD_MAX = 300;
export const PVP_XP_MIN = 35;
export const PVP_XP_MAX = 95;
export const arenaWinGold = (power = 0) =>
    Math.round(ARENA_GOLD_BASE + ARENA_GOLD_PER_ROOT * Math.sqrt(Math.max(0, Number(power) || 0)));
export const arenaWinXp = (power = 0) =>
    Math.round(ARENA_XP_BASE + ARENA_XP_PER_ROOT * Math.sqrt(Math.max(0, Number(power) || 0)));

/** Damage for one plain swing. No roll: the same kit against the same armour always reads the same number. */
// ── DAMAGE IS A FRACTION OF A DECLARED CEILING ───────────────────────────────────────────────────────────────
// Was `SWING_BASE * (1 + might/100)`. That `SWING_BASE *` was a floor everybody got for free, and it is what
// made a fully forged build feel like an unforged one: at 5 might you did 11.6, at 500 you did 66 — a
// hundredfold difference in the stat bought 5.7x the damage, because most of everyone's damage was handed out
// before Might was consulted at all.
//
// Luke's shape instead: your damage is your share of the ceiling. No free baseline, so the stat is the whole
// of it, and a hundredfold difference in Might is a hundredfold difference in damage.
//
// MIGHT_MAX is a DECLARED number, not a measured one, and it cancels: both fighters are divided by it, and a
// bout is decided by the ratio between them. Raise it the day gear can carry more and nothing about any
// existing matchup changes — only the size of the numbers on the card.

// ── 10000 -> 3500: BOUTS WERE ONE AND A HALF SWINGS LONG ──────────────────────────────────────────────────────
// Measured on the live board, an equal fight was settled in 1.5 swings at the top (Eric 1.47, JT 1.51) and
// under 2.4 for almost everybody. Luke: "combat feels one shotty."
//
// The note under HEALTH_MAX had already named this exact failure — it calls 10000 damage against 5000 health
// "Luke's first pair" and says it makes "every bout in the game one beat long" — and then proposed fixing it
// from the HEALTH side (110000 to 10000). That was never applied, and turning it now would multiply every
// health number on every card by twenty-two. Turning the DAMAGE ceiling instead reaches the same ratio and
// leaves the numbers members already read alone.
//
// It cancels out of every matchup exactly the way MIGHT_MAX does — both fighters are divided by the same
// ceiling — so this lengthens fights without moving who beats whom.

// ── THE WEAPON CARRIES THE BASE ──────────────────────────────────────────────────────────────────────────────
// SWING_BASE was one global number for every fighter in the game. It is the WEAPON's now: `base_damage` on the
// main hand is what Might multiplies, so a tier-1 blade and a primordial one are different weapons before a
// single stat is read. DAMAGE_MAX is what a top-tier weapon carries, and it is the fallback for anything
// swinging bare-handed (every NPC, and a member with an empty main hand).
//
// ── DAMAGE PER POINT OF MIGHT ────────────────────────────────────────────────────────────────────────────────
// MIGHT_MAX and DAMAGE_MAX are gone — see the note on STAT_EXPONENT for why a predicted ceiling was the wrong
// shape. This is a rate on the same curve health uses.
//
// Sized against what Luke asked for: A CRIT ON A DECENT PLAYER TAKES A THIRD OF THEIR BAR. Measured on JT —
// 219 Might, 183 Vitality, crit x2.28 — that is a 1,775 health bar, an ordinary swing of 260, and a crit of
// 592, which is his third. The ordinary swing is deliberately NOT the third: a crit lands about one swing in
// eight, so sizing the crit is what makes the big moment big and leaves the rest of the fight room to happen.
// ⚠️ THIS IS THE RATE BEFORE THE WEAPON MULTIPLIES IT. swingFrom applies (weapon base / 100) on top, which
// is 0.32 for every weapon in the game and 0.16 bare-handed — so a rate derived from a FINISHED swing has to
// be divided by that, or the weapon gets counted twice. It was 4.556 for exactly one run of this file and
// JT's crit came out at 10.7% of his bar instead of a third.
export const DAMAGE_PER_MIGHT = 4.566;
export const mightMult = (might = 0) => DAMAGE_PER_MIGHT * curve(might);

// damage = base damage x the might calculation
// ── THE WEAPON IS A MULTIPLIER, ON THE SAME CURVE AS EVERYTHING ELSE ─────────────────────────────────────────
// This was `(base / WEAPON_BASE_DIVISOR) * mightMult(might)` — a linear term over an arbitrary 100. Two
// problems, both now gone:
//
//   the /100 meant nothing. It was a scale correction from when base_damage ran 10-100 and mightMult returned
//   up to 3,500, and once base went flat it was a constant 0.32 that had already been folded into
//   DAMAGE_PER_MIGHT. Two constants describing one thing, which is how that rate came to be wrong by 3.1x.
//
//   it was LINEAR, so twice the weapon was exactly twice the blow, while Might, Vitality and armour all
//   diminish. Weapons now run on STAT_EXPONENT like the rest: doubling the number on the blade is worth
//   2^0.75 = 1.68x, not 2x.
//
// Normalised against the typical weapon, so the multiplier reads as a comparison: 32 is 1.00x, the best in the
// catalogue is 1.19x, and an empty hand is 0.60x.
export const WEAPON_BASE_TYPICAL = 32;
export const WEAPON_BASE_REF = 16;      // an empty main hand — half a weapon before the curve
export const weaponMult = (baseDamage = WEAPON_BASE_REF) =>
    curve(Number(baseDamage) || WEAPON_BASE_REF) / curve(WEAPON_BASE_TYPICAL);
export const swingFrom = (might = 0, baseDamage = WEAPON_BASE_REF) => weaponMult(baseDamage) * mightMult(might);

// ── THE ACCURACY NOTE THAT USED TO BE HERE IS GONE ───────────────────────────────────────────────────────────
// It explained, with a worked table, how Ferocity bought accuracy: 20 fero for 77%, 207 for 93% at the cap,
// "a plain swing can always miss". Accuracy was deleted on 2026-08-27 — nothing in the ring has ever rolled to
// hit since — and the explanation outlived the mechanic by long enough to mislead a reader of this file.
//
// What Ferocity actually buys is the TEMPO of your bar — tempoOf in arena-atb.js, at ferocity / 100.

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

// ── NO TIMING. THIRD TIME. ───────────────────────────────────────────────────────────────────────────────────
// A closing ring, then a Focus pool, then a sweeping bar — three separate attempts to make combat a test of
// rhythm, and three removals. Luke on the last one, having played it: "just remove the timing mini game
// entirely i hate it during combat."
//
// The first two came out because they GATED things and this one deliberately did not: it multiplied, it never
// punished, and a missed window fought the fight a competent hand would have. That fixed the objection the
// first two earned and it did not fix the actual problem, which is simpler and was never about fairness — a
// fight is a place to spend a decision, and a rhythm test interrupts the decision to ask for a reflex. Every
// beat became a small chore between you and the thing you came to do.
//
// So a beat is the COMMAND and nothing else: what you throw, against what they are holding, with what is off
// cooldown. That is the whole game now, on both sides of the ring, and it is the one this codebase kept
// arriving back at.
//
// Anything reaching for STRIKE_MAX, BRACE_MAX, TIMING_BANDS, gradeTiming, houseHand or betterHand is reaching
// for something removed on 2026-08-21. Do not reintroduce it without a fourth reason that is different from
// the first three.

// ── COOLDOWNS, NOT FOCUS ─────────────────────────────────────────────────────────────────────────────────────
// Focus was a pool you filled by timing well and spent on skills. It made every skill interchangeable — a
// number you saved up — and a bad round of timing locked you out of your own gear entirely. Skills now go on
// cooldown for a few of your turns after use, so each one has its own rhythm and nothing can lock you out.
//
// The cooldowns ARE the old Focus costs, one for one, which keeps the rate of skill use about where the
// balance pass assumed: an ability with cooldown C is usable once every C+1 turns, so a four-piece kit at
// C=3 has something ready on 1 - (3/4)^4 = 68% of turns. The tuning assumed skills on ~70% of beats.
export const GUARD_COOL = 1;        // guarding also shaves a turn off everything cooling

// ── HOW LONG A RING CAN LAST ─────────────────────────────────────────────────────────────────────────────────
// The backstop, not the balance. Every bout the telemetry has ever recorded finishes well inside twenty beats;
// this is three times that, so it can only ever be reached by two fighters who cannot hurt each other. Lives
// here with the other balance numbers rather than as a literal in the engine, because the next person to tune
// bout length will look here and nowhere else.
// BOUT_BEAT_CAP lived here — a fifty-beat call, decided on remaining health. Removed with the brace budget:
// a fight is decided by the fight. pitFever is what guarantees one ends.


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
// 0.15 -> 0.21, and the reason is arithmetic rather than a change of mind. "Halve it" was the instruction and
// halving the NUMBER did not halve the VALUE: SWING_BASE went 8 -> 11 in the same pass, so a guard now absorbs
// 0.15*maxHp against blows 37.5% bigger. Measured against what it used to stop, that is 36% of its old value,
// not 50%. 0.21 is what actually lands on half in the new damage economy.
//
// This is what a Warden felt as being clapped: guard halved, guard stopped banking, and everything hitting
// them got a third harder — four defensive nerfs at once against a build whose entire win condition is
// outlasting. Attrition fights went from thirty rounds to five. The expiry stays (that was the point, and a
// brace should not be savings); only the compounding is undone.
// ── AND NOW IT IS BUILT, NOT ISSUED ──────────────────────────────────────────────────────────────────────────
// A flat 0.21 for everybody meant Guard was the one command in the deck that no build could improve and no
// class owned. The Warden — whose entire win condition is outlasting — braced for exactly as much as the
// Reaver who wanted the bout over in six rounds, so the tank's signature move was the tank's least
// distinctive one. Two inputs replace the constant, and both are already on your card:
//
//   CLASS BASE   the identity. A Warden's is double everyone else's, inherent, before a point is spent.
//   FORTUNE      the scaling. Each point adds 1% to the brace, doubling it at 100 — so the stat that until
//                now bought nothing in the ring is the defensive stat, and a Warden stacking Fortune is
//                making a real build decision rather than reading a fixed number off the rules.
//
// Fortune MULTIPLIES the class base rather than adding a flat share, which is the only shape that keeps the
// halves half: an additive term would have let a high-Fortune Reaver brace within 70% of a Warden and quietly
// undo the identity the class base was there to create. Tree ranks (Fortress) add flat, AFTER — a point
// spent is worth the same whatever your Fortune, which is what makes it a sane thing to spend a point on.
// ── WHAT THE ROAD KNOWS THAT YOU DO NOT ──────────────────────────────────────────────────────────────────────
// Ten moves no member can ever learn. The Gauntlet and the Long Road used to fight out of the SAME eleven
// kinds the skill tree grants, which made every opponent a mirror of a build you could already read: you knew
// what Rend did because you could buy Rend. Nothing on the road could ever surprise you, and "surprise" is the
// only thing a hundred hand-named fighters have to sell.
//
// Every one of these is telegraphed a beat ahead like any other move, and every one has an answer. That is the
// line they are written to: a move you cannot see coming is a dice roll, and a move with no counter is a wall.
// Read the tell, then decide whether to swing, brace or drink.
export const FRENZY_DMG = 1.45;     // Blood Frenzy — their damage up
export const FRENZY_DR = 0.5;       // and their guard down, which is the window
export const FRENZY_TURNS = 3;
// Luke: "Blood feast needs to heal you a lot more health." Off health they have LOST, so it is worth nothing
// at full and enormous at a sliver — the counter is still to kill them from high rather than grind.
export const FEAST_SHARE = 0.60;    // Bonefeast — of the health they have LOST, not of their maximum
export const SHATTER_SHARE = 0.6;   // Shatterguard — of the brace it eats, dealt as damage
export const SIPHON_TURNS = 1;      // Willbreaker — turns added to everything you have cooling

export const GUARD_FORTUNE_PER = 0.01;   // each point of Fortune, +1% of the base
export const GUARD_FORTUNE_CAP = 1.00;   // doubled at 100 Fortune, and no further

/** The share of your max health one Guard brackets. See the note above; `base` comes from classBase(). */
export const guardSoakFrom = (base = 0, fortune = 0, bonus = 0) =>
    Math.max(0, (Number(base) || 0)
        * (1 + Math.min(GUARD_FORTUNE_CAP, Math.max(0, Number(fortune) || 0) * GUARD_FORTUNE_PER))
        + (Number(bonus) || 0));

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
// What a successful block takes off the blow. The Warden's own is higher — see arena-classes.js.
// ── THE MOST OF A BLOW ARMOUR MAY EAT ────────────────────────────────────────────────────────────────────────
// Armour is flat subtraction, which reads well and is the stat everybody understands. Its failure mode is at
// the bottom: when armour approaches the raw blow every swing clamps to the 1-damage floor, the fight turns
// into an attrition race decided by regen, and the result stops being a probability — the same pairing wins
// every seed or loses every seed. On the Long Road that made the WALL archetype unwinnable while the rungs on
// either side of it were free, which is a ladder that gets easier as you climb.
//
// A ceiling on the SHARE fixes it without changing what armour is. At 0.75 the most armoured fighter in the
// game still takes four times as long to kill; nobody is ever immune.
// ── ARMOUR IS DIMINISHING RETURNS, NOT SUBTRACTION ───────────────────────────────────────────────────────────
// Luke: "I don't think armour should be capped. I think we should change it to be damage reduction — a lot of
// ARPGs have a diminishing-returns armour system, and they base it off what the max armour amount realistically
// ends up being."
//
// The cap existed because flat subtraction breaks down when armour approaches the blow: every swing clamps to
// the 1-damage floor, the fight becomes an attrition race, and the outcome goes binary. That is what made the
// Long Road's wall rungs unwinnable while the rungs either side were free. The cap patched the symptom.
//
// MEASURED, and this is why the change is not cosmetic: member armour runs 360 to 729 and member damage runs
// 171 to 491. Armour is LARGER THAN DAMAGE for every member in the game, so under subtraction essentially
// every blow was already pinned to the cap. The system was not "armour subtracts damage", it was "everybody
// takes 25%, always" — which is where the 30-to-60-beat bouts came from.
//
// A / (A + K) needs no ceiling because it cannot reach 100%, and it separates values the cap flattened: today
// 550 armour and 1800 armour are both exactly 75%.
//
// ── ARMOUR BUYS EFFECTIVE HEALTH ─────────────────────────────────────────────────────────────────────────────
// ARMOUR_K was here — the denominator of A/(A+K), and the clearest case of the stale-ceiling problem in the
// file: chosen when member armour ran 360-729, never moved, and by the time members carried 1,100 the whole
// top of the ladder sat on the flat of the curve where 987 armour and 1,222 played identically.
//
// Armour buys TOUGHNESS, a multiplier on your effective health, and the damage reduction is whatever falls
// out of it. Reduction approaches 100% and can never reach it BY CONSTRUCTION rather than by a cap somebody
// has to remember to enforce — which is how DR_CAP came to be declared in one file and applied in none.
//
// ── THE NUMBER SAYS WHAT IT MEANS ────────────────────────────────────────────────────────────────────────────
// This was `ARMOUR_TOUGHNESS = 0.002806`, toughness per unit of curved armour. Correct and unreadable: it is
// tiny only because the thing it multiplies is large (1,167 armour curves to 199), so the constant could not
// be sanity-checked against a real fighter without a calculator, which is the same defect as a weapon base
// that means nothing until it is divided by 100.
//
// Stated as the armour that DOUBLES you, it is one number anybody can check: at 2,530, toughness is 2 and a
// blow lands for half. Everything else is derived from it.
//
// ⚠️ IT IS THE ARMOUR, NOT THE CURVED ARMOUR. 0.002806 was 1/356, and 356 is what 2,530 becomes AFTER the
// exponent — so writing 356 here doubles a fighter at a seventh of the plate and took a full set from 36% to
// 71%. The constant and the value it is compared against have to be on the same side of curve().
export const ARMOUR_TO_DOUBLE = 2530;

/** Toughness: the multiple of your own health that this much armour is worth. 0 armour is 1 — no reduction. */
export const toughnessFrom = (armour = 0) => 1 + curve(armour) / curve(ARMOUR_TO_DOUBLE);

/** The share of a blow this much armour turns aside. `pierce` removes armour BEFORE the curve, so 50% pierce
 *  means half their plate is not there — the same meaning it had under subtraction. */
export const drFrom = (armour = 0, pierce = 0) => {
    const eff = Math.max(0, (Number(armour) || 0) * (1 - Math.min(1, Math.max(0, Number(pierce) || 0))));
    return 1 - 1 / toughnessFrom(eff);
};
export const BLOCK_REDUCTION = 0.35;
// What one raised guard is worth, as a share of your own maximum health, before Unbreakable enlarges it.
export const GUARD_BASE_SHARE = 0.10;
// ── THE EXTRA-TURN CONVERSION IS GONE, AND WITH IT THE SECOND ATTACK SPEED ───────────────────────────────────
// There were two attack speeds. `tempoOf` in arena-atb.js divides Ferocity by 100 and paces the bar somebody
// watches. `speedOf` here divided the SAME Ferocity by 500, and `extraTurnFrom` read the result off as a
// chance to take another turn on the spot -- the conversion written when the clock was removed, so that a
// 1.31 weapon became a 31% go-again.
//
// The timer put the clock back. Then the refund that replaced the go-again was itself removed -- Luke: "I
// actually dont like the 50 percent refund" -- and kitFor was changed to set `extra: 0` for every fighter
// rather than convert Ferocity twice and pay one stat two ways. That left this whole branch computing a
// number nobody read:
//
//   BARE_ATTACK_SPEED, FEROCITY_PER_SPEED, speedOf, EXTRA_TURN_MAX, extraTurnFrom   (this file)
//   FOE_EXTRA_FLOOR, foeExtra                                                       (arena-atb.js)
//   goesAgain, the `extra` field on a fighter, "extra" in COMBAT_FIELDS             (arena-engine.js)
//
// Verified before removing: `extraTurnFrom(`, `foeExtra(` and `goesAgain(` were called from nowhere, and the
// only writer of `extra` was the literal 0 in kitFor. Luke asked to see the attack speed logic, read this
// alongside the live path, and had to be told which half of it runs.
//
// STILL HERE, and deliberately: `wasExtra`/`isExtra` in arena-ring.js. Nothing sets it true any more, so the
// "goes again" narration never fires -- but narrate still threads it, and a skill that hands somebody a beat
// would want it back. It is a flag stuck false, not arithmetic nobody reads.
//
// The live path is one number: tempo. See BASE_FILL_MS and tempoOf in arena-atb.js.
