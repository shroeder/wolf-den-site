import "server-only";

import { db } from "@/lib/db";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { bars as liveBars, tempoOf } from "@/lib/marketplace/arena-atb.js";
import {
    buildKit, elementClash, healthFrom, swingFrom, critChanceFrom, critMultFrom, underdogEdge, pitFever,
    arenaWinGold, arenaWinXp, PVP_GOLD_MIN, PVP_GOLD_MAX, PVP_XP_MIN, PVP_XP_MAX,
    BLOCK_REDUCTION, GUARD_BASE_SHARE, guardSoakFrom,
    FRENZY_DMG, FRENZY_DR, FRENZY_TURNS, FEAST_SHARE, SHATTER_SHARE, SIPHON_TURNS,
    COUNTER_POWER, GUARD_DISABLE_TURNS, FREEZE_CHANCE, FREEZE_TURNS,
    BLEED_PER_TURN, BLEED_TURNS, BLEED_MAX_STACKS, BLEED_TICK_CAP, BLEED_TURNS_CAP,
    DRAIN_SHARE, REND_TURNS, REND_PER_TURN, REND_TICK_CAP, REND_TURNS_CAP,
    RIPOSTE_SHARE,
    SHIELD_CAP, WARD_SOAK, SURGE_SWINGS, FREE_KINDS,
} from "@/lib/marketplace/arena-kit.js";
import { npcAbilities, npcFor, npcOffer, tierForRating, NPC_REACH, statsForPower, npcClassFor} from "@/lib/marketplace/arena-npc.js";
// A rung's three skill paths are part of its BUILD, not a lookup by shape. See BUILDS in arena-npc-build.js.
import { buildForTier, buildForClass } from "@/lib/marketplace/arena-npc-build.js";
import {
    boutLaurels, defenceLaurels, DEFENCE_LAURELS_PER_DAY, featsFor, LOSS_EFFORT_CEIL, lossEffort,
    vpTransfer,
    lossLaurels, vpFor, vpPreview,
} from "@/lib/marketplace/arena-rewards.js";
import { CRATES, armouryEv, rollable, rowArt } from "@/lib/marketplace/armoury.js";
import { LADDER, LADDER_HOUSES, LADDER_SIZE, LADDER_MAX, ladderFoe, ladderReward, ladderRungOf, nextRung, ladderDr,
    // Aliased: this file already has a local ladderFor() for the PvP gauntlet, and the two are unrelated.
    ladderFor as roadFoes, ladderHousesFor as roadHouses, ladderSize } from "@/lib/marketplace/arena-ladder.js";
import { SEASON_PUBLIC, currentSeason, milestoneTrack, seasonEnds, trackSummary } from "@/lib/marketplace/arena-season.js";
import { getStones } from "@/lib/marketplace/pet-ascension.js";
import { STONES, STONE_PRICE_LAURELS } from "@/lib/marketplace/pet-stones.js";
import {
    arenaLevelFor, arenaXpFor, classBase, CLASSES, classById, DEFAULT_GUARD,
    FREE_REFUNDS_PER_DAY, RESPEC_CLASS, RESPEC_ONE, RESPEC_TREE,
    pointsSpent, treeAbilities, treeEffects, treeState, classPassives } from "@/lib/marketplace/arena-classes.js";
import { upgradeEffects, upgradeView } from "@/lib/marketplace/arena-upgrades.js";
import {
    npcSkills, npcClassForArchetype, resolveSkill, skillPointsFrom, skillPointsSpent, skillState, skillsForClass,
} from "@/lib/marketplace/arena-skills.js";
import { act, openRing, ringResult } from "@/lib/marketplace/arena-ring.js";
// The beat's arithmetic, in a file with no database in it, so the balance simulator can run the SAME code
// instead of a hand-copied likeness of it. See arena-engine.js.
import { arenaRating, fighterFields } from "@/lib/marketplace/arena-engine.js";
import { mint } from "@/lib/marketplace/gold-rate.js";
import { hasUnlock } from "@/lib/marketplace/casino-perks.js";

// ── THE ROAD: OPEN OR CLOSED ─────────────────────────────────────────────────────────────────────────────────
// One switch, read by the challenge path AND published in the arena state so the screen can say so rather
// than letting somebody tap a rung and get an error.
//
// Closed 2026-08-17 because the new gear stats made the ladder clearable overnight, and a rung once beaten
// cannot be un-beaten without taking progress off people. Reopened 2026-08-18 on a rebuilt curve.
//
// CLOSED AGAIN 2026-08-19, and this time progress WAS taken back — to rung 29, the top of the ramp. The curve
// was not the thing that was wrong. The measurement was.
//
// sim-road-progress.mjs and sim-road-me.mjs both define a member's wall as "the highest rung this fighter
// still takes AT LEAST HALF THE TIME". Every balance decision on the Road was made against that number. It is
// only the wall if losing costs something, and a rung costs nothing — startBout deliberately exempts the Road
// from the ten-a-day allowance (see the note there), so a rung you win one try in five is a rung you clear in
// five tries. The 50% threshold measured a wall the game does not have.
//
// What that produced, in one night: Nicholas walked from rung 24 to rung 56 on 33 wins and 32 losses — exactly
// one win per rung, with the losses stacking as he climbed (rung 50 on the fourth attempt, rung 56 on the
// sixth). His simulated wall was 43. Thirteen rungs of the Road were bought with retries rather than with
// power, and the further he went the more it was retries. The Road stopped being a readout of anybody's power
// somewhere around the fortieth rung, which is the one thing it exists to be.
//
// It stays shut until the curve is re-solved against the threshold members actually stop at, not the one the
// simulator assumed.
// OPEN AGAIN 2026-08-20. It shut because the ladder got EASIER as you climbed — the wall archetype was
// unwinnable while the rungs either side of it were free. Two causes, both fixed: armour could eat a whole
// blow (see ARMOUR_MAX_SHARE), which turned those fights into 1-damage attrition with a binary outcome; and
// ARCH_BAL was still calibrated against the old damage ceiling, so the wall was being handed 37% MORE budget
// than its neighbours on top of already being the archetype armour helps most.
//
// Measured across six real loadouts afterwards: below every member’s wall the ladder is strictly monotonic,
// and the walls now spread from rung 37 to rung 46 instead of everyone stopping at the same one.
// ── AND NOW IT IS THE SEASON'S SWITCH, NOT THE ROAD'S ────────────────────────────────────────────────────────
// Assigned rather than declared, because the Road is now half of a feature: the door (this) and the shelf of
// eight prizes the climb is FOR (four catalog files, all reading SEASON_HIDDEN). Two booleans would mean the
// first mistake anybody makes is flipping one — a Road open onto prizes nobody can see, or the whole Den
// browsing eight exclusives behind a door that is shut. See the note above SEASON_PUBLIC.
const ROAD_OPEN = SEASON_PUBLIC;
// ── SHUT TO THE DEN, OPEN TO THE OWNER ───────────────────────────────────────────────────────────────────────
// The Road was closed because the new gear stats made it clearable overnight, and a rung once beaten cannot be
// un-beaten without taking progress off people. That reasoning is about the ninety-odd members walking it, not
// about the one account that needs to walk it to find out whether the numbers are right yet — and with the
// door shut on everybody, the balance pass that closed it has nothing to measure.
//
// ONE RULE, read by the screen and by the refusal below, so they cannot disagree about whether the Road is
// walkable — the same reason `closed` is published off this flag rather than computed twice.
const roadOpenFor = (buyerId) => ROAD_OPEN || isOwner(buyerId);

// ── ONE SWITCH FOR ALL FIGHTING ──────────────────────────────────────────────────────────────────────────────
// Combat is being rebuilt (auto-attack, new damage and health maths, new crit), and none of it can be tested
// against live members while they are still fighting with it. This is the single place that stops that:
// flip it and nobody but the owner can start ANY fight anywhere.
//
// It covers all four doors into the ring, because a switch that only shuts three of them is not a switch:
//   · the Arena — a challenge, the Gauntlet, and the Long Road (which also has its own gate below)
//   · the plaza — town raid skirmishes
//   · the water — a hooked monster, which is refused AND stops spawning (see fishing.js, so a cast that would
//     have turned up a monster turns up a fish instead rather than dangling a fight nobody can take)
//
// The owner is exempt so the rebuild can be walked through end to end on the live site.
// OPEN AGAIN 2026-08-20 — the ring, the plaza and the water. The LONG ROAD stays shut on its own gate
// below: a rung must never be easier than the one under it, and at the new fight length that is not yet true
// at every rung. One door at a time.
export const COMBAT_OPEN = true;

// ── IS THE FIGHT PLAYED, OR WATCHED? ─────────────────────────────────────────────────────────────────────────
// The server can run a bout one beat at a time (see arena-ring.js) and the fight screen cannot yet drive it.
// Those two have to ship together or every fight in the game hangs on a beat nobody can take, so this is the
// switch that holds them apart until they are both ready.
//
// It is the same shape as COMBAT_OPEN above and for the same reason: one flag, checked in one place
// (buildBout), covering all four doors into the ring — a challenge, the Gauntlet, the Long Road, a plaza raid
// and a hooked monster. The owner is exempt so the whole thing can be walked end to end on the live site
// before anybody else sees it.
//
// OPEN 2026-08-21. Everything it was holding back is built and has been played on the live site: the timing
// game removed, turn order alternating, the states drawn on the fighters, the transcript narrated, the beat
// down from 4.4 seconds to about a fifth of one. Luke, on being told this was still owner-only: "can u
// ungate plz."
//
// Checked before flipping, because this is the whole Den rather than one account: sim:skills over the 8 real
// loadouts, 27 capstone branches, spread 44-65% and EVERY BOUT ENDED. Nothing sits more than 15 points off an
// even fight, which is this project's own tolerance. Bastion/Reprisal at 65% is the one to watch — a Warden
// shield build is the strongest thing in the game right now, and the audit of a live rung-31 bout says the
// same: a shield that refreshes faster than a comparable opponent can spend it.
//
// A bout opened BEFORE this flip has no ring and is not playable. It still works — `playable()` refuses it
// and the screen plays it back as the transcript it always was.
// `INTERACTIVE` / `interactiveFor` are gone with the auto-resolver they chose between — a flag pinned true is
// a gate to the next person who reads it. Every bout opens a ring.
// ── AND WHETHER THIS FIGHT GETS A TIMER BAR ──────────────────────────────────────────────────────────────────
// `atbFor` is gone with the classic ring. Every bout is a timer bout — see the note at the top of
// arena-atb.js about why the gate was deleted rather than pinned to true.
export const combatOpenFor = (buyerId) => COMBAT_OPEN || isOwner(buyerId);

// ── THE ARENA ────────────────────────────────────────────────────────────────────────────────────────────────
// PvP as a LADDER. The pack is sorted weakest to strongest and you start at the bottom; every win moves you up
// one rung. Your opponents are real members with their real level, real gear and real hero — but nobody has to
// be online, because you fight their LOADOUT, not their attention.
//
// THE GATE IS OFF (2026-08-10). `ARENA_UNLOCKED` is DELETED rather than flipped to true — a predicate that
// always answers yes is a gate you have to keep reading to be sure of, and the next person to see one assumes
// it still means something. The arena is a public feature; it is gated by having a hero, like everything else.

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
// Ten, not three. Three was set when the ladder was a bottom-up grind and every fight was progress; on a
// CHALLENGE ladder you are picking opponents who can actually beat you, so losing one shouldn't cost a third of
// your day.
export const FIGHTS_PER_DAY = 10;

// CHALLENGE_REACH is gone. It capped how far ABOVE you you could reach, which only made sense while winning
// swapped positions; it is also what produced the dead end at the top ("Nobody above you within reach"). You
// may challenge anyone now. The Gauntlet has its own reach — see NPC_REACH — because those tiers are a
// progression rather than a peer group.

// Same shape as a delve: what you bring is your level and what you are wearing. Reusing the curve deliberately
// — a member who knows roughly how tough they are underground should not have to learn a second scale here.
// Health comes off Ferocity — see healthFrom in arena-kit.js for why that stat and not a new one.
export const arenaHealth = (vitality = 0) => healthFrom(vitality);

/**
 * A fighter's ring card, straight off the four stats they carry. ONE function for BOTH kinds of fighter: a
 * Gauntlet opponent is a stat block in exactly the shape a member's gear produces, so nothing downstream has
 * to know whether it is holding a person or a Warlord.
 */
// THE RUNG LADDER IS GONE. There used to be a `position` column, seven named bands (Stray, Cub ... Alpha) cut
// at fractions of the roster, and a rank-up celebration on top. All of it was a PROXY for "how strong is this
// person", invented back when a fighter's strength was a derived number nobody could see. Every fighter now
// carries real, printed stats — a member's off their gear, a Gauntlet tier's off its archetype — so the proxy
// has nothing left to stand for: you read the card. What survives is VP, a lifetime score that is earned and
// never spent, and is never a position.


// ── HOW A BOUT WORKS ─────────────────────────────────────────────────────────────────────────────────────────
// Rock-paper-scissors is gone. It told you what the opponent would do, which made every round arithmetic, and
// no amount of shuffling the odds fixes a decision that has one correct answer.
//
// A bout is now YOUR EXECUTION against THEIR LOADOUT. Beats alternate: on yours a ring closes over them and you
// strike; on theirs a ring closes over you and you brace. You are always the one playing — which is the only
// honest way to run an asynchronous fight, because the other person is asleep and their gear is the opponent.
//
// Their gear sets how hard your rings are. Their affinity decides whether your element bites or slides off.
// Their signatures are the abilities coming back at you. A defender's skill IS their build.
//
// COOLDOWNS are the constraint. A skill fires, then sits out a few of your turns — so a kit is a rotation
// rather than a single best move you spam, and no run of bad timing can lock you out of your own gear.
// How often the defender's kit answers with an ability rather than a plain swing. 0.45 meant the opponent
// spent most of the fight doing the most boring thing available to them — their signature moves are the only
// thing that makes one loadout feel different from another, and you saw them less than half the time. At 0.75
// a kit reads as a kit, and the telegraph line ("Emberbrand — incoming") is the interesting half of defending.
const AI_ABILITY_CHANCE = 0.75;

// Defending felt like taking a second swing of your own: same ring, same tap, no idea what was coming. The
// cause was structural — the opponent's move was rolled at the moment the beat RESOLVED, so there was nothing
// to show you beforehand even in principle. It is now chosen the instant their turn begins, published to the
// client, and consumed when the blow lands. Same randomness, but you get to see it first.
// The absent defender's policy lives in arena-ai.js — PURE, so the dev lab can import the same code the
// server runs instead of keeping a second copy that drifts. It already had one: the lab's stub was still the
// old uniformly-random picker, so the lab would have shown last week's behaviour while claiming to show this
// week's, which is worse than having no lab.

// THE DEFENDER'S GRADE IS GONE. It used to roll, per blow, one of { atk 1.3 def 0.55 }, { 1.0, 0.32 } or
// { 0.6, 0.12 } — a hidden coin flip that was the single biggest term in the whole calculation, so the same
// kit against the same opponent read 14 on one swing and 36 on the next with nothing on screen to explain it.
// An opponent is harder now because their ARMOUR NUMBER IS BIGGER, and that number is printed on their card.

// ── THE LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
// Computed LIVE from everyone's power rather than frozen, so it re-sorts as the pack gears up. One query for
// the roster, one for everybody's equipped stats.
async function ladderFor(buyerId) {
    const [{ getEquippedStatsForMembers }, { getBadgePassivesForMembers }] = await Promise.all([
        import("@/lib/marketplace/inventory.js"),
        import("@/lib/marketplace/badges.js"),
    ]);
    const rows = await db.query(
        `SELECT id, alias, display_name, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip
           FROM mkt_buyer WHERE COALESCE(xp,0) > 0 AND id <> $1`, [buyerId]
    ).catch(() => []);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    // Badges in bulk alongside the gear — this list is the one you PICK an opponent from, so a power figure
    // that leaves out a third of what they hit with is the matchmaker aiming at the wrong number.
    // ── ONE QUERY FOR EVERYONE'S POWERS, BEFORE ANYTHING ASKS PER MEMBER ─────────────────────────────────
    // Measured: a single getArenaState asked "what is this member wearing" about SEVENTY DISTINCT buyers, one
    // query each, because the fan-out is over the leaderboard and a per-buyer memo cannot help a list. The
    // stats and badges beside it were already batched for exactly this reason; powers were not. See
    // primePowers — it fills the same memo `equippedPowers` reads, so nothing downstream changes shape.
    const { primePowers } = await import("@/lib/marketplace/ascension-powers.js");
    const [stats, badges] = await Promise.all([
        primePowers(ids).catch(() => {}),
        getEquippedStatsForMembers(ids).catch(() => new Map()),
        getBadgePassivesForMembers(ids).catch(() => new Map()),
    ]).then(([, a, b]) => [a, b]);
    return rows
        .map((r) => {
            const level = levelForXp(Number(r.xp) || 0).level;
            const g = stats.get(r.id) || {};
            const bs = badges.get(r.id) || {};
            const s = {
                ...g,
                might: (g.might || 0) + (bs.might || 0),
                crit_chance: (g.crit_chance || 0) + (bs.crit_chance || 0),
                crit_power: (g.crit_power || 0) + (bs.crit_power || 0),
            };
            const gearPower = Object.values(s).reduce((n, v) => n + (Number(v) || 0), 0);
            const ring = fighterFrom(s, {}, null);
            return {
                id: r.id,
                name: r.display_name || r.alias || "A member",
                sprite: r.avatar_sprite_url || null,
                flip: Boolean(r.avatar_sprite_flip),
                level, gearPower,
                ...ring,
                power: arenaRating(ring),
            };
        })
        .sort((a, b) => a.power - b.power);
}

/**
 * The FOUR things that pay for a swing, merged: gear (which already folds in the compendium), your PET and
 * your BADGES.
 *
 * kitFor used to merge only gear, and the boss has always merged all four (boss.js) — so the same loadout hit
 * for tens of thousands out there and eighteen in here, which read from outside as "what is wrong with the
 * arena's damage". Nothing was: two of the four were not being asked.
 *
 * It lives out here as a function, and not inline in kitFor, because the CARD is drawn by arenaPower and the
 * FIGHT by kitFor. Fixing only kitFor made your card say 18 while you swung for 25 — the exact failure the
 * comment under this one warns about, committed while fixing something else. One helper, both callers, no way
 * for the two to disagree again.
 *
 * Merged field-for-field rather than spread, so this and boss.js can be diffed by eye. A pet's FEROCITY feeds
 * Might, not health — a companion hits alongside you, it does not lend you its constitution — and Beastbond
 * multiplies the pet's share.
 */
// drFromTenacity lived here — it converted a wardrobe's Tenacity into damage reduction against the gap to
// DR_CAP. It was declared and never called once: damage reduction was deleted, so Tenacity's only remaining
// job is multiplying armour (see the armor line in kitFor). Removed rather than left looking like a rule.

// EXPORTED so a balance run can ask what a member's pets, badges and compendium are worth on their own —
// call it with an empty wardrobe and you get exactly the layer that is NOT gear. A sim built on gear alone
// measures a game nobody plays: badges by themselves out-weigh a full set, and leaving them out makes every
// fighter look damage-starved against their own armour.
export async function combatStats(buyerId, gearStats, ids) {
    const [petBonus, badgeStats, { beastbondMult }, casinoStats] = await Promise.all([
        import("@/lib/marketplace/pet-combat.js").then((m) => m.getPetCombatBonus(buyerId)).catch(() => ({ stats: {} })),
        import("@/lib/marketplace/badges.js").then((m) => m.getBadgePassives(buyerId)).catch(() => ({})),
        import("@/lib/marketplace/signatures.js"),
        // ── AND A FOURTH SOURCE: WHAT WAS BOUGHT WITH CHIPS ──────────────────────────────────────────
        // The four permanent stat tracks at the Counter (casino-perks.js). They join the loop below on the
        // same terms as gear, pets and badges, which is exactly what the note under it promises: a stat
        // added to the pool anywhere is carried by every source for free.
        //
        // Deliberately NOT multiplied by Beastbond — that is the pet signature and it multiplies the PET's
        // share only. A bought stat is your own.
        import("@/lib/marketplace/casino-perks.js").then((m) => m.casinoStatBonus(buyerId)).catch(() => ({})),
    ]);
    const bb = beastbondMult(ids);
    const ps = petBonus?.stats || {};
    const bs = badgeStats || {};
    const cs = casinoStats || {};
    // ── ONE STAT ADDS TO ITSELF ──────────────────────────────────────────────────────────────────────────
    // A pet is an extension of you, not a creature with its own sheet: whatever stat a pet's card names is the
    // stat of yours it raises. The same for a badge. This used to be hand-written line by line and every line
    // was a chance to get it wrong — pet ferocity was folded into MIGHT for years (a second helping of damage
    // from a stat that means attack speed everywhere else), and lifesteal, counter, stun, haste and
    // doublestrike simply had no pet or badge term at all, so a pet granting one granted nothing.
    //
    // Written as one loop instead. A stat added to the pool anywhere is carried by all three sources for free,
    // which is the whole class of bug this file keeps producing.
    //
    // `bb` is Beastbond, which multiplies the PET's share only.
    const out = { ...gearStats };
    const KEYS = new Set([
        ...Object.keys(gearStats || {}), ...Object.keys(ps), ...Object.keys(bs), ...Object.keys(cs),
    ]);
    for (const k of KEYS) {
        const gear = Number(gearStats?.[k]) || 0;
        const pet = (Number(ps[k]) || 0) * bb;
        const badge = Number(bs[k]) || 0;
        const bought = Number(cs[k]) || 0;
        const total = gear + pet + badge + bought;
        if (total) out[k] = total;
    }
    return out;
}

// The power figure the LADDER sorts on and the profile prints. Same source as the fight itself — a member
// shown as weaker than they fight is a matchmaker aiming at the wrong number.
export async function arenaPower(buyerId) {
    const [{ getEquippedStats }, { getEquippedIds }] = await Promise.all([
        import("@/lib/marketplace/inventory.js"),
        import("@/lib/marketplace/inventory.js"),
    ]);
    const [me, bySlot] = await Promise.all([
        // avatar_sprite_url is in here because the bout draws YOU as well as them, and without it the player's
        // own corner of the ring was an empty circle.
        db.queryOne(`SELECT COALESCE(xp,0) AS xp, avatar_sprite_url, display_name, alias FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        // getEquippedIds returns a {slot -> id} OBJECT; iterating it directly is a known landmine.
        getEquippedIds(buyerId).catch(() => ({})),
    ]);
    const level = levelForXp(Number(me?.xp) || 0).level;
    // The SAME four sources the fight is resolved from — see the note on that function. The card printed
    // gear-only while kitFor had already started counting pets and badges, so it read 18 damage over a
    // fighter swinging for 25, which is precisely the "shown as weaker than they fight" this comment warns of.
    const ids = Object.values(bySlot || {}).filter(Boolean);
    const stats = await combatStats(buyerId, await getEquippedStats(buyerId).catch(() => ({})), ids);
    const gearPower = Object.values(stats).reduce((n, v) => n + (Number(v) || 0), 0);
    return {
        level, gearPower, ...fighterFrom(stats, {}, null), power: arenaRating(fighterFrom(stats, {}, null)),
        sprite: me?.avatar_sprite_url || null,
        name: me?.display_name || me?.alias || "You",
    };
}

// Everything a loadout brings to the ring: stats, affinity, abilities, and how hard their ring is to face.
// EXPORTED so a balance script can ask "how far does THIS member get" without rebuilding a fighter. The four
// stat sources this merges (gear, tree, badges, pets) are the reason a hand-built one lies — see the note
// above, where two of the four were missing and the Arena looked like it had broken damage.
// `opts.skillTree` swaps in a different allocation WITHOUT writing one — for asking "how far would this person
// get with the tree finished" without touching their account or hand-rebuilding derived numbers somewhere else
// (which drops the upgrade perks that share the same bag, and quietly reports LOWER health than they have).
// `opts.equippedStats` does the same for the wardrobe, so "what is a fully forged set worth" can be answered
// by the engine instead of by arithmetic in a script.
// ── ONE FIGHTER, BUILT FROM NUMBERS ──────────────────────────────────────────────────────────────────────────
// Every field the engine reads, derived from three things and nothing else: the merged combat stats, the perk
// bag, and the class. It was written inline inside kitFor, which needs a member, a database and eight awaited
// imports to reach — so anything wanting to ask "what would THIS build do" (a balance sim, a what-if, a tuning
// pass) had to write the arithmetic out a second time, and a second copy of this is a second, quietly different
// game. Lifted out whole: kitFor spreads it, and scripts/sim-pvp.mjs calls it directly.
export function fighterFrom(stats = {}, perks = {}, classId = null) {
    const base = classBase(classId);
    return {
        // ── THE BAR REFUND IS GONE; ITS POINTS BUY TEMPO ─────────────────────────────────────────────────
        // Luke: "I actually dont like the 50 percent refund." It was a coin flip that half-emptied your bar,
        // and it was the second thing in this game promising "you act more often" — his own words are already
        // in arena-kit.js: "combat has kind of devolved into who gets more extra turns and who can freeze the
        // most, which makes all of their builds pretty much worthless." A refund IS an extra turn with a new
        // name, and it produced the exact confusion he hit in a real bout: a bar that was already full with
        // nothing on screen to say why.
        //
        // Tempo is the honest version and it already exists: the bar simply fills faster, every beat, no roll.
        //
        // ⚠️ FEROCITY IS NOT CONVERTED HERE. It used to feed BOTH the refund (per 500) and tempo (per 100),
        // and folding its refund share in as well would have paid one stat twice. Only the sources that had
        // NOWHERE ELSE to go are converted: Quickblade, Frenzy, and the doublestrike points.
        //
        // `extra: 0` used to sit here, the last writer of a go-again chance nothing rolled. It and the whole
        // second attack speed behind it are gone — see the tombstone in arena-kit.js.
        // ── AND THE RATE ITSELF ──────────────────────────────────────────────────────────────────────────
        // Weapon speed and Ferocity, as a rate. This has to be in bout_json before the ring is opened,
        // because a bout is stamped with its mode at the bell. See arena-atb.js.
        // ⚠️ NO FIGHTER HANDS IN A TEMPO ANY MORE. Every Road and Gauntlet foe used to, because an NPC's
        // Ferocity was a gear BUDGET that reached 30,408 by rung 120 against a member's 20-140 and this
        // function answered 305. Their Ferocity is what their wardrobe carries now, so there is one path.
        // ── AND IT IS TWO TERMS NOW, NOT THREE ───────────────────────────────────────────────────────────
        // The third was `doublestrike`, converted at 0.005 x (1 - BAR_REFUND) — a stat named
        // for a mechanic that no longer exists, taking a second route to the same tempo Ferocity already
        // buys. Its points are Ferocity now (see RETIRED_AFFIX in items.js and migration 415), so they arrive
        // through tempoOf with everything else and this formula is the two lines it should always have been.
        // The tree grants tempo DIRECTLY (tempoBonus) so a node's card can quote the number it pays —
        // check:tree compares the two and caught it when they drifted.
        tempo: tempoOf(Number(stats.speed) || undefined, Number(stats.ferocity) || 0)
            + (Number(perks.tempoBonus) || 0),
        // ── FOUR NUMBERS, ALL OFF REAL STATS, ALL PRINTABLE ──────────────────────────────────────────────
        // Nothing here is derived from `gearPower` (the raw sum of every stat, which made a point of Fortune
        // as good for you as a point of Might) and nothing here is rolled. The tree and the upgrade tracks
        // land in `perks` and are added on top, so the engine reads one set of numbers and does not care
        // which system paid for them.
        // VITALITY is the gear half; the tree's ferocity nodes still buy health so no node loses its effect.
        // base.health is gone from here: HEALTH_BASE is flat and identical for every class now, and it lives
        // inside healthFrom. A class's identity is its DR, guard and accuracy, not a hidden lump of hit points.
        // Vitality only. Ferocity is unhooked from health.
        health: Math.round((healthFrom(Number(stats.vitality) || 0) + Math.round(perks.health || 0)) * (1 + (perks.healthPct || 0))),
        // `base_damage` rides in on the equipped main hand (see items.js), so it arrives here summed with
        // everything else — and only one weapon can be worn, so the sum IS that weapon's base.
        // ── ARMOUR, SHARPENED BY TENACITY ────────────────────────────────────────────────────────────────
        // Flat armour off every worn piece, added up, then multiplied by tenacity: armor x (1 + tenacity/500).
        // Tenacity is not its own damage reduction any more — it is what makes the armour you are already
        // wearing worth more, so 500 tenacity doubles the plate rather than granting a separate percentage.
        armor: Math.round((Number(stats.armor) || 0) * (1 + (Number(stats.tenacity) || 0) / 500) * (1 + (perks.armorPct || 0))),
        // Raw points; the engine turns them into a share (PIERCE_PER_POINT).
        pierce: (Number(stats.pierce) || 0) + (perks.pierceStat || 0),
        // ITEM-EXCLUSIVE, on Luke's call: no pet term and no badge term, so a wardrobe is the only way to
        // get one. Raw points; the engine turns them into a chance (COUNTER_PER_POINT).
        counter: Number(stats.counter) || 0,
        // ── THE TREE'S SHARE OF THE FIGHT ────────────────────────────────────────────────────────────────
        // Gear pays in POINTS and the tree pays in SHARES, and the engine adds them. Keeping the two apart is
        // what lets a node say "+3% counter" and mean it, without anyone having to know that a gear point is
        // worth a quarter of one.
        bleedChance: Math.max(0, Math.min(1, perks.bleedChance || 0)),
        bleedDamage: perks.bleedDamage || 0,
        bleedLeech: perks.bleedLeech || 0,
        wildProc: perks.wildProc || 0,
        // The Warden's four. `guardSize` is the base share of your health a guard is worth, raised by
        // Unbreakable — so the node that makes shields BIGGER is separate from the one that makes them
        // more frequent, and a Warden can build either.
        guardChance: perks.guardChance || 0,
        guardSize: (perks.guardChance || 0) > 0 ? GUARD_BASE_SHARE * (1 + (perks.guardSize || 0)) : 0,
        regen: perks.regen || 0,
        thorns: perks.thorns || 0,
        grudge: perks.grudge || 0,
        // The Runecaller's. `ward` is a share of your own maximum health standing from the opening bell;
        // `chill` slows the other fighter's clock; `soulfire` is dealt again past armour AND shields.
        burnChance: Math.max(0, Math.min(1, perks.burnChance || 0)),
        burnDamage: perks.burnDamage || 0,
        burnLeech: perks.burnLeech || 0,
        freeze: perks.freeze || 0,
        chill: perks.chill || 0,
        iceThorns: perks.iceThorns || 0,
        ward: perks.ward || 0,
        wardRefill: perks.wardRefill || 0,
        surge: perks.surge || 0,
        soulfire: perks.soulfire || 0,
        cataclysm: perks.cataclysm || 0,
        counterBonus: perks.counterBonus || 0,
        stunBonus: perks.stunBonus || 0,
        hasteBonus: perks.hasteBonus || 0,
        // Shares, added by the engine AFTER the per-point conversion: the tree's own Bloodletting/Bloodwarden,
        // plus the class base and any perk that pays a flat percentage. Gear points are `lifesteal` above.
        lifestealBonus: (perks.lifestealBonus || 0) + (base.lifesteal || 0) + (perks.lifesteal || 0),
        // Raw points; the engine turns them into chances (STUN_PER_POINT / HASTE_PER_POINT).
        stun: Number(stats.stun) || 0,
        haste: Number(stats.haste) || 0,
        // A shield's block chance, as a share. Item-exclusive like counter.
        blockChance: (Number(stats.block_chance) || 0) + (perks.blockChance || 0),
        blockReduction: (base.blockReduction ?? BLOCK_REDUCTION) + (perks.blockReductionBonus || 0),
        // Raw points; LIFESTEAL_PER_POINT turns them into a share of what you inflict.
        lifesteal: (Number(stats.lifesteal) || 0) + (perks.lifestealStat || 0),
        damage: swingFrom((Number(stats.might) || 0) + (perks.might || 0), Number(stats.base_damage) || undefined),
        critChance: critChanceFrom((Number(stats.crit_chance) || 0) + (perks.critStat || 0), perks.crit || 0),
        critMult: critMultFrom((Number(stats.crit_power) || 0) + (perks.critPower || 0), perks.critMult || 0),
        // `armour` is gone as a member concept and gone from NPCs too — see arena-npc.js. One name for one
        // mechanic; see DAMAGE REDUCTION below.
        //
        // ── DAMAGE REDUCTION ─────────────────────────────────────────────────────────────────────────────
        // The share of every incoming blow that never lands. It was a flat 34% everybody shared plus a
        // Footwork bonus, under two different names depending on which side of the ring you stood — the
        // member's was called block and never printed, the NPC's was called armour and always was.
        //
        // It is a CLASS trait now: the class base is the identity (Warden 34, Runecaller 24, Reaver 16) and
        // Footwork adds on top from both the tree and the upgrade track, whose ranks carry over untouched.
        // ── TENACITY FILLS THE GAP TO THE CEILING, IT DOES NOT ADD FLAT ──────────────────────────────────
        // Flat DR is worth MORE to whoever already has the most, because it multiplies against what still
        // gets through: +14 points would have been 23% less damage taken for a Warden and 17% for a Reaver —
        // widening the exact matchup the telemetry says is 91/10. Scaling it by how much headroom you have
        // left inverts that: 12% for the Reaver, 8% for the Warden. Armour helps most those who have least,
        // and nobody sprints to the cap on gear alone.
        // DAMAGE REDUCTION IS DELETED. Armour is the whole of mitigation — a flat number off every blow —
        // and a percentage doing the same job alongside it was two systems for one idea. Emitted as 0 so
        // anything still reading it gets a harmless answer.
        dr: 0,
        // ── THE SECOND `lifesteal:` IS GONE ──────────────────────────────────────────────────────────────
        // It was assigned twice in this one object literal — once above as RAW POINTS, which is what the
        // engine's LIFESTEAL_PER_POINT expects, and again here as a SHARE. The later assignment wins in a
        // JavaScript object literal, so the share won, and then the engine multiplied that share by 0.0025 as
        // though it were points. A wardrobe carrying "+3 Lifedrink" — which the card prints as 0.75% — paid
        // 0.0075%. A hundredth of what it says, which is why the affix measured as doing literally nothing.
        //
        // This is the same bug, in the same file, in the same shape, that killed bleedChance and burnChance:
        // two assignments of one key, and the one you can see is not the one that runs. The class and tree
        // SHARES belong in `lifestealBonus`, which the engine adds after the per-point conversion, and they
        // are folded in there now. Points stay points, shares stay shares, and neither is written twice.
        // The inherent class bleed and burn used to be set HERE, later in the same object literal than the
        // tree's own — so the second assignment won and Rend and Kindle, the two nodes that ARE those
        // mechanics, were overwritten by a class implicit every single time. Now that the implicits are gone
        // that implicit was zero, so both nodes did precisely nothing. Deleted; the tree's values above stand.
        // Brutality: the class's own, plus the tree's. Reaver carries base damage the way the Warden carries
        // base Lifedrink — "hit hardest" was a tagline the numbers did not pay for.
        dmgPct: Math.max(0, (base.dmgPct || 0) + (perks.dmgPct || 0)),
        // No longer passed to the engine — see `extra` above, where these points now live. Kept OUT of the
        // kit entirely rather than sent and ignored, because a stat the engine reads and does nothing with is
        // how doublestrike ended up with no pet or badge term for months.
        // ── ACCURACY ─────────────────────────────────────────────────────────────────────────────────────
        // The chance a swing connects at all, before whatever penalty the skill itself carries. Class base,
        // nudged by Ferocity — the same stat that already buys health and speed, so a body built to keep
        // swinging is also a body that lands them — and raised by the tree.
        // ACCURACY IS DELETED. Every swing lands, so precision has nothing to buy.
        // ── ACCURACY IS GONE ─────────────────────────────────────────────────────────────────────────────
        // Luke: "accuracy doesnt exist in game anymore." Confirmed against the resolver: `acc` is read in
        // exactly two functions, throwBlows and counterBlow, and both are simulator-only with no caller in
        // the game. The ring never rolls to hit. It was still being computed here, sent to the client on both
        // fighters, and written into every bout's telemetry as "accuracy":100 — a number the game presented
        // as real and nothing behind it.
        // ── THE BRACE ────────────────────────────────────────────────────────────────────────────────────
        // Class base x Fortune, plus Fortress flat on top. Computed once here rather than at the moment the
        // command lands, so the number the button prints and the number the engine banks are the same one.
        // ── FORTUNE DOES NOT BUY A BIGGER BRACE ──────────────────────────────────────────────────────────
        // It used to swell what a brace banked, and Luke took that out: a defensive stat that a Warden could
        // stack off gear made the guard a gear check. The guard is the class's own number plus whatever the
        // tree adds, and it stays that way.
        //
        // What Fortune DOES do in the ring is one thing, and it is not this: it lifts the floor of the damage
        // roll (arena-engine swingRoll), so a lucky fighter throws fewer feeble swings and no bigger ones.
        // The stat is carried on the kit below because the engine reads it there.
        guard: guardSoakFrom(base.guard, 0, perks.guardSoak || 0),
        might: (Number(stats.might) || 0) + (perks.might || 0),   // the raw stat, for the card
        fortune: (Number(stats.fortune) || 0) + (perks.fortune || 0),
    };
}

export async function kitFor(buyerId, opts = {}) {
    const [{ getEquippedIds }, { sigsById }, { getElementOverrides }] = await Promise.all([
        import("@/lib/marketplace/inventory.js"),
        import("@/lib/marketplace/signatures.js"),
        import("@/lib/marketplace/item-element.js"),
    ]);
    const { getEquippedStats } = await import("@/lib/marketplace/inventory.js");
    // getEquippedIds returns a {slot -> id} OBJECT; iterating it directly is a known landmine here.
    const bySlot = await getEquippedIds(buyerId).catch(() => ({}));
    const ids = Object.values(bySlot || {}).filter(Boolean);
    const me = await db.queryOne(`SELECT COALESCE(xp,0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(Number(me?.xp) || 0).level;
    // ── THE ARENA READS THE GEAR YOU ACTUALLY BUILT ──────────────────────────────────────────────────────
    // This was `sumItemStats(ids)` — the CATALOG line for each equipped item and nothing else. So a Dragoncape
    // forged to +6 fought as an unforged one, a completed set bonus did nothing, and a Flawless Ruby set into
    // a piece changed no number in the ring at all. Every system a player invests in was invisible in the one
    // place they go to prove it.
    //
    // getEquippedStats is what the boss already fights you with: base + set bonuses + forge enhancement +
    // socketed jewels, merged. Both sides of a member bout run through this same function, so the matchup
    // stays honest; the Gauntlet's tiers are fixed power, which means investment now tells against them, which
    // is the entire point of investing.
    const gearStats = opts.equippedStats || await getEquippedStats(buyerId).catch(() => ({}));

    // See combatStats: gear alone is only half of what pays for a swing.
    const stats = await combatStats(buyerId, gearStats, ids);
    const gearPower = Object.values(stats || {}).reduce((n, v) => n + (Number(v) || 0), 0);
    const overrides = await getElementOverrides(buyerId, ids).catch(() => ({}));
    const flat = {};
    for (const [id, arr] of Object.entries(overrides || {})) flat[id] = Array.isArray(arr) ? arr[0] : arr;
    // buildKit is still what decides your AFFINITY — that is a Forge decision and stays one. Its abilities
    // are ignored: what you can DO in the ring is your class tree now, not a readout of your gear.
    const kit = buildKit(ids, sigsById(ids), flat);

    // ── THE TREE ─────────────────────────────────────────────────────────────────────────────────────────
    const prog = await db.queryOne(
        `SELECT arena_xp, arena_class, skill_tree, skills, upgrades FROM mkt_arena WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);
    // `opts.classId` lets a tool build this member's kit under another class's tree — used by
    // scripts/check-passives.mjs to prove all thirty-six nodes reach the character.
    const classId = opts.classId || prog?.arena_class || null;
    const taken = opts.skillTree || prog?.skill_tree || {};
    const perks = mergeAdd(treeEffects(classId, taken), upgradeEffects(prog?.upgrades || {}));
    // A member with no class yet still has to fight, so this falls back to the neutral defaults.
    const base = classBase(classId);
    let abilities = treeAbilities(classId, taken, kit.element);
    // Nobody fights empty-handed. Before a class is picked — or with every point refunded — you still get one
    // honest move, exactly as the gear path used to guarantee.
    if (!abilities.length) {
        abilities = [{
            id: "basic:focus", itemId: null, name: "Focused Blow", from: "your own hands", kind: "strike",
            sprite: "/images/arena/skill-firstHitMult.webp", cooldown: 0, power: 1.9, hits: 1,
            blurb: "No training in it. Still hurts.", element: kit.element, rarity: "common", rank: 0,
            defensive: false,
        }];
    }
    // Abilities carry their own archetype emblem (set in buildKit). The piece they came from is still named
    // on every card, and its art rides along separately for anywhere that wants to show the gear itself.
    const { itemSpriteMap } = await import("@/lib/marketplace/item-sprites.js");
    const art = await itemSpriteMap().catch(() => ({}));
    // ── GEAR LIFEDRINK, COMPUTED ONCE ────────────────────────────────────────────────────────────────────
    // PAID AT THE RATE THE CARD PRINTS. This was halved (/200) on the reasoning that the Warden carries 15%
    // inherently and a ring should be a slice of that — but the halving was never once tested, because the
    // number it produced was never read by anything. A piece that says "+2% Lifedrink" and pays 1% is the same
    // lie as one that pays nothing, only harder to catch. If 2% proves strong, halve it HERE and the card
    // should say so too.
    //
    // It lives here rather than inline because it has to reach BOTH the perk bag and the fighter's own
    // `lifesteal` field, and it only ever reached the first. Pierce and Counter are read off the perk bag
    // (`P.pierce`, `P.counter`), so folding them in there is enough — but lifesteal is read off
    // `b.me.lifesteal`, which is built below from the SKILL-TREE perks and the class base only. Nothing in
    // the engine has ever read `perks.lifesteal`, so every point of Lifedrink a wardrobe carried has been
    // inert since the affix shipped: rolled, priced as the rare one, printed on the card, and worth nothing.
    // The perk bag the fight is resolved from: the tree's own, plus what the wardrobe contributes to the
    // three affixes the engine reads off perks rather than off stats. Built here because BOTH the returned
    // kit and fighterFrom need it.
    const gearPerks = {
        ...perks,
        pierce: (perks.pierce || 0) + (Number(stats.pierce) || 0) / 100,
        // Riposte at full rate; the engine already caps it at 60%.
        lifesteal: (perks.lifesteal || 0) + (Number(stats.lifesteal) || 0) / 100,
        counter: (perks.counter || 0) + (Number(stats.counter) || 0) / 100,
    };
    // `abilities` — the ones actually in play. This looped over kit.abilities, the GEAR-derived list, which
    // stopped being what the fight uses when the tree took over: every ability in the bout went without its
    // art, and the loop dutifully decorated a list nobody read.
    for (const a of abilities) a.itemSprite = a.itemId ? art[a.itemId] || null : null;
    // ── WHAT THEY CAN PRESS ──────────────────────────────────────────────────────────────────────────────
    // Filtered against the class rather than trusted, because a class respec leaves a bag full of skills that
    // are no longer yours and the middle of a bout is the worst possible place to notice. Resolved here too:
    // the ring gets finished skills with every node already merged in, so nothing downstream has to know that
    // nodes exist.
    const mineIds = new Set(skillsForClass(classId || "").map((x) => x.id));
    const rawSkills = opts.skills || prog?.skills || {};
    const skills = {};
    const deck = [];
    for (const [id, nodes] of Object.entries(rawSkills)) {
        if (!mineIds.has(id) || !Array.isArray(nodes)) continue;
        skills[id] = nodes;
        const resolved = resolveSkill(id, skills);
        if (resolved) deck.push(resolved);
    }

    return {
        level, gearPower,
        classId, taken,
        // `skills` is the raw bag — what the panel renders and what the defence's AI picks out of.
        // `deck` is the same thing already resolved, which is what the fight screen draws.
        skills, deck,
        // ── GEAR JOINS THE PERK BAG ──────────────────────────────────────────────────────────────────────
        // The engine reads pierce off `P.pierce`, where P is this fighter's perks — a bag the skill tree used
        // to fill alone. Folding the wardrobe's contribution in HERE means it lands on both sides of the ring
        // for free, because an opponent's kit is built by this same function. Adding a second lookup in the
        // engine instead would have been two places to keep in step, and the second is always the one missed.
        perks: gearPerks,
        arenaLevel: arenaLevelFor(Number(prog?.arena_xp) || 0).level,
        // THE RAW TREE PERKS, not gearPerks. The flat fields below already fold the wardrobe in off `stats`
        // — gear pierce is stats.pierce and gear Lifedrink is stats.lifesteal — so handing in the merged bag
        // would count the wardrobe's contribution twice, once as a stat and again as a perk. gearPerks exists
        // for `perks` above, which is a different consumer.
        ...fighterFrom(stats, perks, classId),
        element: kit.element, abilities,
    };
}

// Two flat effect maps into one. Same stat from the tree and from an upgrade track adds rather than one
// silently winning, which is what a spread would have done.
function mergeAdd(a = {}, b = {}) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
    return out;
}

// ── THE RECOVERY PATH FOR A PRIZE THAT WAS EARNED AND NOT PAID ───────────────────────────────────────────────
// The eight are handed over on the winning bout, which is where they belong — reaching rung 100 and being
// given the dog in the same breath is the moment. This is for the case where that failed: the pets table down
// for a second, a decoration id that moved between deploys, a bout resolved by a path that predates seasons.
//
// It is not a second way to earn one. `settleRoadPrizes` pays only rungs that are IN this member's own beaten
// set, and every payment still goes through the same (buyer, season, rung) primary key — so the worst this
// can do when spammed is a refused INSERT.
//
// Deliberately a VERB rather than something the state read does on its way past. A read path that writes is a
// read path that bills a write on every render, and the track already draws an owed prize as claimable, so
// the member taps once and the repair happens where they can see it.
export async function claimRoadPrizes(buyerId) {
    if (!buyerId) return { ok: false, error: "unauthorized" };
    const row = await arenaRow(buyerId);
    const beaten = new Set((row?.ladder_beaten || []).map(Number));
    if (!beaten.size) return { ok: true, paid: [] };
    const { settleRoadPrizes } = await import("@/lib/marketplace/road-prizes.js");
    const paid = await settleRoadPrizes(buyerId, beaten).catch(() => []);
    return { ok: true, paid };
}

async function arenaRow(buyerId) {
    await db.query(`INSERT INTO mkt_arena (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    let row = await db.queryOne(
        `SELECT a.*, ${DAY}::text AS today, a.fights_day::text AS fights_day_text,
                a.free_respec_day::text AS free_respec_day_text, b.gold AS gold_now
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id WHERE a.buyer_id = $1`, [buyerId]).catch(() => null);
    return rollRoadSeason(row);
}

// ── A NEW SEASON CLEARS THE ROAD ─────────────────────────────────────────────────────────────────────────────
// Every path that touches the Road — the screen, the challenge refusal, the payout — reads its rungs off
// `ladder_beaten`, so a rollover applied in some of them and not others would let a member fight a rung the
// screen says is beaten. It happens HERE, in the one function all of them go through, and there is exactly
// one copy of the rule.
//
// LAZY, AND ONE ROW AT A TIME. The alternative is a migration that empties ninety members' sets in a single
// UPDATE, before the season is even open, with no transaction to take it back with (neon() is the HTTP driver).
// Rows roll over when their owner turns up, which also means a member who never comes back is left exactly as
// they were rather than silently reset in the dark.
//
// FREE WHEN THERE IS NOTHING TO DO, which matters because arenaNav calls this on every navigation in the game:
// `road_season` rides along on the `SELECT a.*` that was already happening, so the steady state is an integer
// comparison and no extra round trip. The two writes fire once per member per season.
//
// NOTHING IS LOST. `road_best_rung` only ever goes up, and mkt_arena_road_season keeps the per-season record —
// the reset takes the RUNGS back, which is the point of a season, not the fact that you walked them.
async function rollRoadSeason(row) {
    if (!row) return row;
    // ── THE RESET FOLLOWS THE DOOR ───────────────────────────────────────────────────────────────────────────
    // This hangs off arenaRow, which is the base read for the WHOLE arena — a challenge, the Gauntlet, a plaza
    // skirmish, the nav badge. So on the day seasons deployed it fired for every member who opened the arena
    // at all, and cleared the Road of twenty people who could not even SEE the season: `roadOpenFor` shuts the
    // door on walking a rung, and there was nothing at all standing in front of the reset. Eric D lost 100
    // rungs, JT 86, Kaishiern 72 — restored from the archive by migration 417, which is only possible because
    // every set turned out to be contiguous.
    //
    // A member's rungs are cleared when the new season is OPEN TO THEM, never merely because the code that
    // knows about seasons is deployed. Same rule the Road screen reads, so the two cannot disagree about
    // whether a member is in the season yet.
    if (!roadOpenFor(row.buyer_id)) return row;
    const season = currentSeason();
    if (Number(row.road_season) === season.n) return row;

    const beaten = (row.ladder_beaten || []).map(Number).filter(Boolean);
    const best = beaten.length ? Math.max(...beaten) : 0;
    // Season 0 with nothing in it is a member who has never touched the Road. Archiving a row of zeros for
    // every one of them is noise in a table that exists to be read.
    if (beaten.length) {
        await db.query(
            `INSERT INTO mkt_arena_road_season (buyer_id, season, best_rung, beaten)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (buyer_id, season) DO UPDATE
                SET best_rung = GREATEST(mkt_arena_road_season.best_rung, EXCLUDED.best_rung),
                    beaten = GREATEST(mkt_arena_road_season.beaten, EXCLUDED.beaten)`,
            [row.buyer_id, Number(row.road_season) || 0, best, beaten.length],
        ).catch((e) => console.error("arena.season.archive_failed", row.buyer_id, e?.message || e));
    }
    // Guarded on the stamp so two requests arriving together cannot both clear a set the other has refilled.
    await db.query(
        `UPDATE mkt_arena
            SET ladder_beaten = '{}'::int[], road_season = $2,
                road_best_rung = GREATEST(road_best_rung, $3)
          WHERE buyer_id = $1 AND road_season <> $2`,
        [row.buyer_id, season.n, best],
    ).catch((e) => console.error("arena.season.roll_failed", row.buyer_id, e?.message || e));

    // The row in hand is now stale in exactly three fields, and every caller below reads two of them.
    row.ladder_beaten = [];
    row.road_season = season.n;
    row.road_best_rung = Math.max(Number(row.road_best_rung) || 0, best);
    return row;
}

// ── WHAT THE NAV BAR NEEDS, AND NOTHING ELSE ─────────────────────────────────────────────────────────────────
// GameNav draws an Arena entry with a count on it, and to get those two values it used to call the whole of
// getArenaState — the board, every rival's kit, the standings, the powers of seventy members — on EVERY
// navigation anywhere in the game. That one read is 74 database round trips and a 215KB reply, and the nav
// throws all of it away except `unlocked` and `fightsLeft`.
//
// Both come off a single row. `fightsUsed` and `dailyFightsFor` are the same helpers getArenaState itself
// uses, so the number in the menu cannot drift from the number on the screen.
export async function arenaNav(buyerId) {
    if (!buyerId) return { unlocked: false, fightsLeft: 0 };
    const row = await arenaRow(buyerId);
    const daily = dailyFightsFor(row);
    return { unlocked: true, fightsLeft: Math.max(0, daily - fightsUsed(row)), fightsPerDay: daily };
}

// THE LEADERBOARD — everyone, ordered by Victory Points earned.
//
// This used to order by `position`, a rung you SWAPPED with whoever you beat. That is why the top of the
// ladder was a dead end (nobody above you to fight) and why you could not fight downward either — winning
// would have moved you DOWN to the loser's rung. Ordering by an accrued total removes both problems and the
// whole unique-index parking-space dance that swapping needed.
async function standings() {
    const rows = await db.query(
        `SELECT a.buyer_id, a.vp, a.wins, a.losses, a.best_streak, COALESCE(b.xp,0) AS xp,
                b.alias, b.display_name, b.avatar_sprite_url
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
          WHERE COALESCE(b.xp,0) > 0
          ORDER BY a.vp DESC, a.wins DESC, b.alias ASC`
    ).catch(() => []);
    if (!rows.length) return [];
    // ── THE BOARD IS A LADDER, NOT A STAT SHEET ──────────────────────────────────────────────────────────
    // This used to assemble every member's fighter — equipped stats in bulk, badge passives in bulk, and a
    // primePowers pass over everyone with XP — purely so the board could print a damage and health number
    // beside each name. That was three fan-out reads over ~90 members on a screen that is opened constantly,
    // and it was WRONG: pets were never batched, so the numbers it printed were 41-153% under what those
    // members actually fight with, unevenly enough to reorder them. ValkyrieSylve found it by losing fights
    // that looked even.
    //
    // Luke: "do you really need to show all of their stats while we rank the leaderboard? I would rather just
    // show it based on who has the most victory points... it helps simplify it from a code perspective and a
    // user perspective."
    //
    // So the board carries what it is actually FOR — who is above you and who is below — and nothing it
    // cannot state truthfully. Victory points are earned by winning, which already folds in gear, build and
    // play, and they self-correct: somebody ranked above their weight loses and slides back down. A gear
    // total cannot do that.
    //
    // The three bulk reads are gone with it.
    return rows.map((r) => ({
        id: r.buyer_id,
        vp: Number(r.vp) || 0,
        name: r.display_name || r.alias || "A member",
        sprite: r.avatar_sprite_url || null,
        level: levelForXp(Number(r.xp) || 0).level,
        wins: r.wins,
        losses: r.losses,
    }));
}
const fightsUsed = (row) => (row?.fights_day_text === row?.today ? Number(row?.fights_today) || 0 : 0);
// The allowance INCLUDING the Stamina track. Read by the screen and by the gate that refuses a fight — those
// were two different numbers, which is the only way a counter can say "1 left" over a button that says no.
const dailyFightsFor = (row) => FIGHTS_PER_DAY + Math.round(upgradeEffects(row?.upgrades || {}).fights || 0);
const saveBout = (buyerId, bout) =>
    db.query(`UPDATE mkt_arena SET bout_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, bout ? JSON.stringify(bout) : null]).catch(() => {});

// What a win at a given rung is worth. Climbing has to pay more than grinding the bottom, or the ladder is
// decoration on a farming loop.
// What the exchange panel needs, or null. Kept beside getArenaState rather than inside it so the extra query
// is genuinely skipped for the ~everyone who does not hold the power.
async function purserBits(buyerId) {
    if (!buyerId) return null;
    const { hasPower } = await import("@/lib/marketplace/ascension-powers.js");
    if (!(await hasPower(buyerId, "purser_s_exchange"))) return null;
    const { PURSER_RATE, PURSER_MAX } = await import("@/lib/marketplace/arena-progress.js");
    const sail = await db.queryOne(`SELECT COALESCE(doubloons,0) AS d FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    return { doubloons: Number(sail?.d) || 0, rate: PURSER_RATE, max: PURSER_MAX };
}

// ── WHY THIS TAKES PRE-COMPUTED PIECES ───────────────────────────────────────────────────────────────────────
// Almost every arena action ends with `return { ok: true, ...(await getArenaState(buyerId)) }`, which is the
// right shape — the caller gets the whole refreshed screen back. It also means an action that ALREADY built the
// board and the kit to do its work then builds both again to answer.
//
// startBout was the worst of them: standings() is three queries over every member with XP (90 of them, ~390ms
// measured against prod) and kitFor assembles a loadout from gear, sets, the compendium, forge levels, sockets,
// pets and badges. Both ran twice per press. That is where "I click Find a fight and it just times out" was
// coming from — not a hang, a request doing double the work it needed to on a cold function.
//
// `pre` lets a caller hand over what it has already computed. Deliberately not a cache: a TTL here would risk
// serving a stale kit to somebody who just changed gear and pressed Fight, which is a far worse bug than a slow
// button. Same request, same values, no staleness possible.
// ── AND NOT THE SAME PERSON TWICE ────────────────────────────────────────────────────────────────────────────
// After you fight someone, they are off your card until five more PvP bouts have gone by. Two members close in
// power used to lock onto each other and trade the same fight all evening, which is dull for them and starves
// everybody else of opponents.
//
// Counted over bouts YOU CHALLENGED, not ones you defended. Being attacked is not a choice, and blocking a
// rematch because somebody keeps picking you would punish the person who did nothing.
//
// The board carries 91 members, so removing a few can never leave you with nobody to fight.
//
// ── TWO NUMBERS, BECAUSE THERE ARE TWO SITUATIONS ────────────────────────────────────────────────────────────
// Luke: "instead of the last five fights that rule should be the last three fights. Five was only for the auto
// match, but when you're actually SELECTING a fight, three is probably more appropriate."
//
// He is drawing a real distinction. When the machine picks for you, a wide block is free — you never see what
// it skipped, and a rematch you did not ask for is the thing the rule exists to stop. When YOU are looking at
// a list and choosing, every blocked name is one fewer option on a board you can see, and the cost of the rule
// is visible in a way it never is for auto-match.
export const REMATCH_BLOCK = 5;
export const REMATCH_BLOCK_PICK = 3;
export async function recentPvpFoes(buyerId, limit = REMATCH_BLOCK) {
if (!buyerId) return new Set();
// npc_tier IS NULL is what a member-vs-member bout looks like; the NPC ladder writes a tier.
const rows = await db.query(
    `SELECT defender_id FROM mkt_arena_bout
      WHERE challenger_id = $1 AND npc_tier IS NULL AND defender_id IS NOT NULL
      ORDER BY created_at DESC LIMIT $2`,
    [buyerId, Math.max(1, limit)]
).catch(() => []);
return new Set((rows || []).map((r) => String(r.defender_id)));
}

// ── AND THE SAME NPC TWICE IS THE SAME COMPLAINT ─────────────────────────────────────────────────────────────
// The member side of matchmaking has had a rematch block since the day it was written; the Gauntlet side never
// got one, so the tier weighting — boost/(1+i) over the closest tiers — could and did hand out the same
// fighter back to back. Luke: "why did it match me with a warlord twice".
//
// Blocked by BAND, not by tier. A band covers a stretch of tiers and they share one sprite, one name and one
// numeral series, so Warlord IV followed by Warlord V is the same man in the player's eyes even though the
// numbers differ. Blocking exact tiers would have answered the code and not the complaint.
export async function recentNpcBands(buyerId, limit = REMATCH_BLOCK) {
    if (!buyerId) return new Set();
    const rows = await db.query(
        `SELECT npc_tier FROM mkt_arena_bout
          WHERE challenger_id = $1 AND npc_tier IS NOT NULL
          ORDER BY created_at DESC LIMIT $2`,
        [buyerId, Math.max(1, limit)]
    ).catch(() => []);
    const bands = new Set();
    for (const r of rows || []) {
        const n = npcFor(Number(r.npc_tier) || 0);
        if (n?.band) bands.add(n.band);
    }
    return bands;
}

export async function getArenaState(buyerId, pre = {}) {
    // ── WHAT EACH SEASON PRIZE ACTUALLY IS ───────────────────────────────────────────────────────────────
    // At the top of the function because the `ladder:` block that publishes it is a SYNCHRONOUS IIFE, and
    // this needs the four prize catalogues, which are dynamically imported to avoid an import cycle.
    // Published WITH the track rather than fetched when a tile is tapped: eight small objects off catalogues
    // already in memory, and a detail panel that has to ask the server is a panel that is empty for the first
    // second of every tap.
    const { seasonPrizeDetails } = await import("@/lib/marketplace/road-prizes.js");
    const prizeDetail = await seasonPrizeDetails(currentSeason()?.prizes || []).catch(() => ({}));
    const row = await arenaRow(buyerId);
    const [me, board, kit] = await Promise.all([
        pre.me ?? arenaPower(buyerId),
        pre.board ?? standings(),
        pre.kit ?? kitFor(buyerId),
    ]);
    // ── HOW FAR THIS MEMBER'S ROAD RUNS ────────────────────────────────────────────────
    // One primary-key read. Everything the ladder block below publishes — its size, its houses, its foes and
    // the next rung — is cut to this, so a member without The Long Road is not sent the back hundred at all.
    const roadLong = await hasUnlock(buyerId, "road_long").catch(() => false);
    const roadSize = ladderSize(roadLong);
    // ── THE SEASON, AND WHICH OF THE EIGHT ARE ALREADY YOURS ─────────────────────────────────────────
    // Read rather than inferred from `beaten`. Those two CAN disagree — a prize whose hand-over failed
    // leaves a rung beaten and unpaid — and the difference is exactly what the track has to draw, because
    // an owed prize is claimable and a claimed one is not. See road-prizes.js.
    const season = currentSeason();
    // Fetched together: one dynamic import, and the art read is shared across every viewer (see
    // seasonPrizeArt) so it costs one query per instance per five minutes rather than four per render.
    const [roadClaimed, roadArt] = await (async () => {
        const { roadPrizesClaimed, seasonPrizeArt } = await import("@/lib/marketplace/road-prizes.js");
        return Promise.all([roadPrizesClaimed(buyerId, season), seasonPrizeArt(season)]);
    })().catch(() => [new Set(), {}]);
    const used = fightsUsed(row);
    // The Stamina upgrade track buys extra challenges a day.
    const dailyFights = dailyFightsFor(row);
    const bout = staleBout(row?.bout_json) ? null : (row?.bout_json || null);
    // The pictures for the crate tables. Both are database-backed and this file is otherwise pure, so they are
    // read here and handed to rowArt rather than looked up inside it. Failures fall back to {} and the rows
    // draw their text exactly as they did before.
    const rowArtSources = await (async () => {
        const [chests, consumables, parts] = await Promise.all([
            import("@/lib/marketplace/chest-art.js").then((m) => m.getChestArt()).catch(() => ({})),
            db.query(`SELECT consumable_id, url FROM mkt_consumable_sprite`).then((rows) => Object.fromEntries(rows.map((r) => [r.consumable_id, r.url]))).catch(() => ({})),
            import("@/lib/marketplace/forge-parts.js").then((m) => Object.fromEntries((m.PART_TIERS || []).map((t) => [t.tier, t.sprite]))).catch(() => ({})),
        ]);
        return { chests, consumables, parts };
    })().catch(() => ({ chests: {}, consumables: {}, parts: {} }));

    // ── HEAL A STALE BOUT ON READ ────────────────────────────────────────────────────────────────────────
    // A bout freezes its abilities into bout_json at the start, so a fight already running when the kit
    // format changes keeps the OLD shape until it ends. Healing this only inside fightRound was not enough:
    // the fight SCREEN reads through here, so a player looking at their skills saw last week's format —
    // sentence effects and the gear's sprite instead of the move's — until they happened to take a beat.
    // `kit` is already loaded above, so this costs nothing.
    if (bout && !bout.over) {
        const isStale = (list) => (list || []).some((a) => !a.effect || typeof a.effect !== "object" || !a.sprite?.includes("/skill-"));
        let healed = false;
        if (kit?.abilities?.length && isStale(bout.me?.abilities)) {
            bout.me.abilities = (bout.me.abilities || []).map((a) => kit.abilities.find((f) => f.id === a.id) || a);
            healed = true;
        }
        // THEIR kit is a snapshot too, and it was never healed — which is why an incoming move still showed
        // the ring or cape it came from instead of the move's own emblem, and why the telegraph had nothing
        // to build a cast out of.
        if (bout.foe?.id && isStale(bout.foe?.abilities)) {
            const foeKit = await kitFor(bout.foe.id).catch(() => null);
            if (foeKit?.abilities?.length) {
                bout.foe.abilities = (bout.foe.abilities || []).map((a) => foeKit.abilities.find((f) => f.id === a.id) || a);
                if (bout.incoming?.isAbility) {
                    const live = foeKit.abilities.find((f) => f.name === bout.incoming.name);
                    if (live) bout.incoming = { ...bout.incoming, sprite: live.sprite, kind: live.kind, element: live.element };
                }
                healed = true;
            }
        }
        if (healed) await saveBout(buyerId, bout).catch(() => {});
    }

    // WHO YOU MAY CHALLENGE — EVERYONE. There is no reach window and no "must be above you" any more. The
    // old rule produced the dead end at the top of the ladder ("Nobody above you within reach. You are at the
    // top of the Den.") and it existed only because winning SWAPPED positions, which made fighting downward
    // self-harming. Points are accrued now, so a fight can never cost you rank and any opponent is fair game.
    const myPower = me.power;
    // NO `recentlyFought` FLAG HERE. I added one, then went looking for the row that would draw it: `.ar-target`
    // is CSS with no JSX left, and nothing renders this list any more — every fight goes through Find a fight.
    // A flag nobody draws is the Den's favourite bug, so the rule lives where the choice is actually made:
    // matchArenaOpponent skips them, and startBout refuses them.
    // ── AND IT DOES NOT OFFER WHAT IT WILL REFUSE ────────────────────────────────────────────────────
    // Luke: "if you fought them in the last five turns it baits you into clicking them and then it says you
    // can't fight them. Just hide them from the list — there's no point having them in the list."
    //
    // The comment that used to sit here argued the opposite: that a `recentlyFought` flag was a flag nobody
    // drew, so the rule should live only where the choice is MADE — matchArenaOpponent skips them and
    // startBout refuses them. That was right about the flag and wrong about the list. A name you can tap and
    // are then told off for tapping is worse than either drawing a flag or hiding the row, and hiding it is
    // the cheaper of those two.
    const blocked = await recentPvpFoes(buyerId, REMATCH_BLOCK_PICK).catch(() => new Set());
    // ── AND SAY THAT SOMETHING WAS HIDDEN ────────────────────────────────────────────────────────────
    // GrayKitsune: "Eric vanished out of the pick your match on arena screen for me lol." Hiding a name you
    // would only be refused for tapping is right, and it turned a bait into a disappearance — a member of a
    // small Den notices when a specific person is missing, and the only reason he got an answer is that Luke
    // happened to be in chat at the time. The board carries the count so the list can account for itself.
    const hiddenRecent = board.filter((o) => o.id !== buyerId && blocked.has(String(o.id))).length;
    const targets = board
        .filter((o) => o.id !== buyerId && !blocked.has(String(o.id)))
        .map((o) => ({ ...o, reward: {
            vp: vpPreview(myPower, o.power),
            // A member, so the PvP premium applies — the card must promise what finishBout will pay.
            laurels: boutLaurels({ won: true, myPower, theirPower: o.power, kind: "member" }),
            // What a defeat is worth at best and at worst, so "challenge upward" is a visible offer rather
            // than something a member only discovers by losing.
            lossLaurels: Math.round(lossLaurels({ myPower, theirPower: o.power, kind: "member" }) * LOSS_EFFORT_CEIL),
        } }))
        // Hardest first: the interesting fight should be the one you see, not the safest one.
        .sort((x, y) => y.power - x.power);

    // THE GAUNTLET — endless NPC challengers, so there is always something to fight even when the Den is
    // asleep and always something harder to aspire to.
    const npcBest = Number(row?.npc_best) || 0;
    // ── OFFERED FROM WHERE YOU ACTUALLY STAND ────────────────────────────────────────────────────────────
    // This used to offer from `npc_best` alone, which is 0 until you win a Gauntlet fight — so the strongest
    // member in the Den was shown tiers 1 to 5 and every one of them read EASIER. The matchmaker has never
    // agreed with that: it already reaches from `max(best, tierForRating(myPower)) + NPC_REACH` (see
    // matchArenaOpponent), and the server stopped enforcing a reach at all when points became accrued.
    //
    // So this is the offer catching up to the rule that was already being applied, not a new one. Same
    // expression, so the list you are shown and the pool you are matched from cannot drift apart.
    const gauntlet = npcOffer(Math.max(npcBest, tierForRating(myPower))).map((n) => {
        // ── RATED THE WAY A MEMBER IS RATED ──────────────────────────────────────────────────────────────
        // `npcFor` returns `gearPower` — a gear score in the HUNDREDS — and no rating at all. Members are
        // measured in `arenaRating` (damage x crit x health / 10), which runs in the TENS OF THOUSANDS. The
        // reward preview compared one against the other, so the ratio was ~0 for every tier, the clamp
        // pinned it at VP_FLOOR, and EVERY Gauntlet fight in the game paid the 0.3x floor: 28 laurels
        // whether you fought tier 5 or tier 45.
        //
        // Found by building the fight picker, which put members and tiers in one list for the first time —
        // six Warlord tiers all paying 28 next to members paying 71.
        //
        // Rated through fighterFrom + arenaRating: the same two functions the bout itself uses to build and
        // score that opponent, so the number on the card and the number in the fight cannot disagree.
        // Built once and read three ways: the rating that sorts it, and the damage/health the card prints.
        // `npcFor` returns a STAT LINE, not a fighter — the card was showing "0 dmg · 0 hp" for every tier
        // because it was reading fields that only exist after this conversion.
        const f = fighterFrom(n, {}, null);
        const power = arenaRating(f);
     return {
            ...n,
            power,
            damage: f.damage,
            health: f.health,
            beaten: n.tier <= npcBest,
            // `won: true` — this is a PREVIEW of what winning pays, and boutLaurels has no default for it:
            // without the flag it answers the loss question instead, and a Gauntlet loss pays nothing by
            // design, so the card promised zero.
            reward: { vp: vpPreview(myPower, power), laurels: boutLaurels({ won: true, myPower, theirPower: power }) },
        };
    });

    const myVp = Number(row?.vp) || 0;

    // ── PROGRESSION ── arena XP, the level it buys, the class, and the state of every node. treeState is the
    // SAME function the server validates a spend against, so the screen can never offer a node the server
    // would refuse.
    const lvl = arenaLevelFor(Number(row?.arena_xp) || 0);
    const classId = row?.arena_class || null;
    const taken = row?.skill_tree || {};
    const spentPts = pointsSpent(taken);
    const availPts = Math.max(0, lvl.level - spentPts);
    // The panel's purse, computed off the two bags rather than stored. `mySkills` is filtered against the
    // class first: a class respec leaves behind skills that are no longer yours, and a screen that renders
    // them is a screen offering to spend points on something the server will refuse.
    const mineIds = new Set(skillsForClass(classId || "").map((x) => x.id));
    const mySkills = {};
    for (const [id, nodes] of Object.entries(row?.skills || {})) {
        if (mineIds.has(id) && Array.isArray(nodes)) mySkills[id] = nodes;
    }
    const skillEarned = skillPointsFrom(spentPts);
    // Class-aware, or the panel prints a different number of spent points than the gate enforces.
    const skillSpent = skillPointsSpent(mySkills, row?.arena_class || null);
    const skillAvail = Math.max(0, skillEarned - skillSpent);

    const progress = {
        xp: lvl.xp, level: lvl.level, into: lvl.into, span: lvl.span,
        classId,
        cls: classById(classId),
        // Each class carries its inherent half, so the tree screen can say what you get for free.
        classes: CLASSES.map((c) => ({ ...c, passives: classPassives(c.id) })),
        points: { total: lvl.level, spent: spentPts, available: availPts },
        // A class is chosen the first time you have a point to spend.
        needsClass: !classId && lvl.level >= 1,
        tree: classId ? treeState(classId, taken, availPts) : [],
        // ── AND THE PANEL ────────────────────────────────────────────────────────────────────────────────
        // The same shape as `tree` above and for the same reason: the screen renders from a pure function the
        // server validates against, so it can never offer a rung the server would refuse.
        //
        // The purse is DERIVED, both halves, every read. Skill points are bought with tree points, so storing
        // a balance would mean a respec could leave a counter describing a tree that no longer exists — the
        // exact failure the tree's own `points` block avoids by computing spent from the bag.
        skills: classId ? skillState(classId, mySkills, skillAvail) : [],
        skillPoints: { total: skillEarned, spent: skillSpent, available: skillAvail },
        respec: {
            one: RESPEC_ONE(spentPts),
            tree: RESPEC_TREE(spentPts),
            klass: RESPEC_CLASS(spentPts),
            // Three point-refunds a day cost nothing. Compared as TEXT against the store-local day the same
            // query computed — building a JS Date from a Postgres DATE reads today as yesterday on a UTC box.
            free: Math.max(0, FREE_REFUNDS_PER_DAY
                - (row?.free_respec_day_text === row?.today ? (Number(row?.free_respecs) || 0) : 0)),
            freePerDay: FREE_REFUNDS_PER_DAY,
        },
    };
    return {
        unlocked: true,
        me: { ...me, name: "You", vp: myVp, power: myPower, element: kit.element, abilities: kit.abilities },
        size: board.length,
        // ── WHERE THAT VP ACTUALLY PUTS YOU ──────────────────────────────────────────────────────────────
        // VP is the only survivor of the rung ladder -- the `position` column, the seven bands and the
        // rank-up went with it -- so it now carries the whole idea of rank on its own. And the card printed
        // it as "rank · never spent", which says what VP CANNOT do and leaves out the one thing it can.
        // Luke: "why does it say rank never spent". Because it was written to contrast with the laurels
        // beside it, back when a position existed somewhere else on the screen to answer the other half.
        //
        // FREE. `board` is the full standings list this function already has in hand, ordered by VP -- the
        // same array `board.slice(0, 10)` below is cut from. No query, no round trip.
        //
        // Zero for anyone not on the board at all (standings() excludes members with no XP), which the
        // screen reads as "no standing yet" rather than printing "#0".
        standing: board.findIndex((o) => o.id === buyerId) + 1 || null,
        vp: myVp, laurels: Number(row?.laurels) || 0,
        fightsLeft: Math.max(0, dailyFights - used), fightsPerDay: dailyFights,
        // THE PURSER'S EXCHANGE. Null for everybody not wearing the piece, which is what the screen keys off —
        // the panel is not drawn at all rather than drawn disabled, because a shop you can never use is worse
        // than no shop. The doubloon purse is only read when the power is held; it lives in another table.
        purser: await purserBits(buyerId).catch(() => null),
        // The recipe shelf, priced in laurels. Same purchase the Quartermaster sells for doubloons — see
        // buyArmouryRecipe. Lazily imported for the usual reason: cooking.js reaches back into the game's
        // other modules and a static edge from here is the shape of cycle that has taken pages down before.
        // ── THE LONG ROAD ── the whole hundred, with what is already down. Pure arithmetic plus one array
        // off the row that was already loaded, so the screen costs nothing extra to render.
        ladder: (() => {
            const beaten = new Set((row?.ladder_beaten || []).map(Number));
            // The road is walked in order, and `next` is the only rung that can be fought. Published so the
            // screen can lock the rest off the SAME rule the server refuses them by — a screen that computed
            // its own idea of "next" would be a second copy of the rule, and the copies would drift.
            const next = nextRung(beaten, roadSize);
            // THIS SEASON'S furthest rung, not the lifetime best — `owed` means "reached and not yet paid",
            // and a veteran whose lifetime best is 99 would otherwise open a fresh season already owed three
            // prizes they have not walked to yet. The lifetime number is published separately, below.
            const seasonBest = beaten.size ? Math.max(...beaten) : 0;
            const track = milestoneTrack({ season, beaten: seasonBest, claimed: roadClaimed, reach: roadSize, art: roadArt });
            return {
                size: roadSize,
                beaten: beaten.size,
                next,
                // ── THE SEASON ───────────────────────────────────────────────────────────────────────
                // The eight prizes are the whole reason to climb now, so they are published with the
                // Road rather than fetched by a second call — a track the screen has to ask for
                // separately is a track that is missing for the first second of every visit, which is
                // the second somebody decides whether the Road is worth their evening.
                season: {
                    n: season.n, key: season.key, name: season.name, blurb: season.blurb,
                    tint: season.tint, from: season.from, ends: seasonEnds(season),
                    track: track.map((t) => ({ ...t, detail: prizeDetail[t.ref] || null })),
                    ...trackSummary(track),
                    // The furthest they have EVER stood, across every season. The reset takes the rungs;
                    // it does not take this, and saying so on the screen is what stops a cleared Road
                    // reading as lost progress.
                    bestEver: Number(row?.road_best_rung) || 0,
                },
                // Published off the SAME flag the challenge path refuses by, so the screen and the server can
                // never disagree about whether the Road is walkable.
                closed: !roadOpenFor(buyerId),
                closedNote: "The Road is closed while the gear rebalance lands. Your rungs are safe — nothing you have beaten is going anywhere.",
                // SLICED, not filtered. ladderFor/ladderHousesFor hand back only the road this member
                // owns, so the hundred rungs of The Long Road are not in the payload at all for
                // somebody who has not bought it — there is nothing to reveal in a dev console.
                houses: roadHouses(roadLong),
                foes: roadFoes(roadLong).map((f) => ({
                    rung: f.rung, id: f.id, name: f.name, house: f.house, champion: f.champion,
                    archetypeName: f.archetypeName, tell: f.tell, power: f.power, color: f.color,
                    sprite: f.sprite, spriteFallback: f.spriteFallback, reward: f.reward, beaten: beaten.has(f.rung),
                    locked: !beaten.has(f.rung) && f.rung !== next,
                })),
            };
        })(),
        recipeShop: await (async () => {
            const { RECIPE_PRICE_LAURELS, recipeProgress } = await import("@/lib/marketplace/cooking.js");
            const p = await recipeProgress(buyerId);
            // knowsAll is now about the SHOP's own shelf (tiers 1-2), not the whole book — the button must go
            // quiet when it has nothing left it is allowed to sell, not when you have finished Legendary.
            return { price: RECIPE_PRICE_LAURELS, knowsAll: p.shopKnown >= p.shopTotal, knowsBook: p.known >= p.total, ...p };
        })().catch(() => null),
        stats: {
            wins: Number(row?.wins) || 0, losses: Number(row?.losses) || 0,
            streak: Number(row?.streak) || 0, bestStreak: Number(row?.best_streak) || 0,
            bestVp: Number(row?.best_vp) || myVp,
            npcBest,
        },
        targets,
        // How many members the rematch rule is holding back right now, AND the rule's own number. The count
        // without the window is half a sentence, and the client cannot import it — arena.js is server-only,
        // and a second copy of a balance constant living in a component is how two games get played at once.
        hiddenRecent: { n: hiddenRecent, within: REMATCH_BLOCK_PICK },
        gauntlet,
        // The crates, with the table each one can actually roll FOR THIS MEMBER — a gated row is swapped for
        // its stand-in rather than dropped, so the odds on screen are the odds they will get.
        armoury: CRATES.map((c) => ({
            id: c.id, name: c.name, cost: c.cost, art: c.art, blurb: c.blurb,
            // Every possible outcome, best first. A crate that will not say what is in it is a slot machine,
            // and this game does not have those.
            // `art` rides along with each row. Resolved once, above, because chest and consumable pictures both
            // live in the database and this map runs three times over ~30 rows.
            table: rollable(c)
                .map((r) => ({ label: r.label, worth: r.worth, w: r.w, art: rowArt(r, rowArtSources) }))
                .sort((a, z) => z.worth - a.worth),
            ev: armouryEv(c),
        })),
        // ── THE ONE FIXED-PRICE THING IN A SHOP OF CRATES ── and deliberately so. The Armoury is random on
        // purpose: a price list is arithmetic you do once and repeat forever. A pet stone is the exception
        // because it is the floor under somebody else's bad luck, and a floor that is itself a gamble is not
        // a floor. It sits apart from the crates for exactly that reason.
        stoneShop: {
            price: STONE_PRICE_LAURELS,
            held: await getStones(buyerId).catch(() => ({ light: 0, dark: 0 })),
            stones: Object.values(STONES),
        },
        progress,
        upgrades: upgradeView(row?.upgrades || {}),
        gold: Number(row?.gold_now) || 0,
        // The top of the Den, always visible — a ladder you cannot see the top of is just a number.
        // No rung goes out with a member any more. What they bring is their CARD — the same two numbers you
        // read off a Gauntlet tier — plus the VP they have earned, which is a score and not a position.
        // ── FIVE NEIGHBOURS, NOT THE TOP TEN ─────────────────────────────────────────────────────────────
        // The top ten is a hall of fame; it is not a list of people you can fight. Luke: "I would rather just
        // show five people that are close to you in victory points — that way you're always fighting someone
        // around your level." Centred on you and clamped at both ends, so the newest member sees the five
        // above them and the leader sees the five below rather than a window half full of nothing.
        //
        // No damage or health on the row any more: the board has never been able to state them correctly
        // (pets were never batched) and a number that is wrong is worse than no number at the moment somebody
        // is deciding who to walk up to.
        board: (() => {
            const i = board.findIndex((o) => String(o.id) === String(buyerId));
            const from = i < 0 ? 0 : Math.max(0, Math.min(i - 2, board.length - 5));
            return board.slice(from, from + 5).map((o) => ({
                id: o.id, vp: o.vp, name: o.name, sprite: o.sprite, level: o.level,
                wins: o.wins, losses: o.losses, you: o.id === buyerId,
            }));
        })(),
        bout: bout ? publicBout(bout) : null,
        away: await awayReport(buyerId, row),
    };
}

// What a win is worth: reaching further up pays more, and taking a top spot pays most.
function winReward(myPos, theirPos) {
    const climb = Math.max(1, myPos - theirPos);
    const height = Math.max(1, 40 - theirPos);          // being near the top is worth more
    return { gold: 60 + climb * 18 + height * 4, xp: 25 + climb * 8 + height * 2 };
}

// ── NO PRIZE FOR STANDING STILL ──────────────────────────────────────────────────────────────────────────────
// There WAS a podium: first, second and third at the end of each day took a gold, an iron and a wooden chest,
// paid by a nightly cron. It is gone, and it should never come back in that shape.
//
// A guaranteed chest for a PLACEMENT pays you for a number rather than for anything you did that day. Whoever
// is top stays top by not playing — every fight they take is a chance to lose points they already hold, so the
// correct move for the leader is to stop. And below them the same three names collect the same three chests
// every night whether the day was a good one or a nothing, which is the opposite of what the ladder is meant
// to reward. Bouts pay. Feats pay. Standing does not.

// ── WHAT HAPPENED WHILE YOU WERE AWAY ────────────────────────────────────────────────────────────────────────
// The arena is asynchronous: you are challenged while you are asleep. Without this a member just finds their
// position changed and no explanation anywhere in the game.
//
// DEFENCES ONLY. It listed your own challenges too, so it popped up telling you about a fight you had just
// watched, won, and read a full recap of thirty seconds earlier. This screen is for what you DON'T already
// know: somebody came for your spot while you weren't looking.
async function awayReport(buyerId, row) {
    const since = row?.last_seen_at || null;
    // ── GROUPED BY WHO, NOT ONE ROW PER BOUT ─────────────────────────────────────────────────────────────
    // Eric fighting you three times printed three identical rows saying the same sentence. The interesting
    // fact is "Eric came at you three times and lost twice", which is one line.
    const rows = await db.query(
        `SELECT ab.challenger_id,
                SUM(CASE WHEN ab.challenger_won THEN 1 ELSE 0 END)::int AS lost,
                SUM(CASE WHEN ab.challenger_won THEN 0 ELSE 1 END)::int AS held,
                SUM(COALESCE(ab.defender_laurels, 0))::int AS laurels,
                COUNT(*)::int AS bouts,
                MAX(ab.created_at) AS last_at,
                bc.display_name AS c_name, bc.alias AS c_alias, bc.avatar_sprite_url AS c_sprite
           FROM mkt_arena_bout ab
           JOIN mkt_buyer bc ON bc.id = ab.challenger_id
          WHERE ab.defender_id = $1
            AND ($2::timestamptz IS NULL OR ab.created_at > $2)
          GROUP BY ab.challenger_id, bc.display_name, bc.alias, bc.avatar_sprite_url
          ORDER BY MAX(ab.created_at) DESC LIMIT 12`,
        [buyerId, since]
    ).catch(() => []);
    if (!rows.length) return null;
    return rows.map((r) => ({
        them: { name: r.c_name || r.c_alias, sprite: r.c_sprite },
        bouts: r.bouts,
        held: r.held,          // times your loadout turned them away
        lost: r.lost,          // times they beat it
        laurels: r.laurels,    // what defending earned you, already paid
    }));
}

/** Mark the away report read, so it is shown once and not on every visit. */
export async function seenArena(buyerId) {
    await db.query(`UPDATE mkt_arena SET last_seen_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getArenaState(buyerId)) };
}

// ── A BOUT FROM THE OLD RULES ────────────────────────────────────────────────────────────────────────────────
// A bout freezes both fighters into bout_json when it opens. One saved before the ring stopped inventing
// vigour and started reading real stats has `might` and no `damage` — and every multiplication in resolveBeat
// would come out NaN, which is a health bar that never moves and a fight that can never end. There is no
// honest way to convert it (the old numbers were derived from a stat sum that no longer means anything), so
// it is retired rather than migrated: the challenge is not spent, and a new fight is one tap away.
// ── A BOUT NOBODY CAN PLAY IS NOT A BOUT ─────────────────────────────────────────────────────────────────
// "Stale" means: this is not over, and it can never be finished from inside the game. Both halves matter,
// because a bout that is neither over NOR playable is the worst state in the Arena — the screen loads it as a
// live fight, every tap is refused, and all three start paths below refuse to open a new fight while it sits
// there. The member is bricked. The only way out is Forfeit, which costs them a loss for a bug.
//
// It used to test only the first clause, and that clause dates from an era before the ring: fighters with no
// `damage` stat. So a bout saved AFTER that era but BEFORE the ring shipped passed the staleness test — it
// has damage stats — and then failed `playable()`, which wants a ring. Nothing retired it and nothing could
// play it. Found in prod: one member sitting on a beat-4 bout from the tap-timing era, `over: false`, keys
// `clash` / `incoming` / `opener` and no `ring`, still blocking every fight they tried to start.
//
// `!b.ring` is therefore the same kind of statement as the two beside it, not a new rule: playable() is the
// authority on what can take a beat, and anything it turns away that is not finished is by definition stale.
// GrayKitsune: "I'm stuck in a freeze loop where I end up staying unable to do anything."
export const staleBout = (b) => Boolean(b) && !b.over && (b.me?.damage == null || b.foe?.damage == null || !b.ring);

// The client never sees the opponent's next pick — only what has already happened.
function publicBout(b) {
    return {
        foe: b.foe, beat: b.beat, turn: b.turn, hp: b.hp, foeHp: b.foeHp, maxHp: b.maxHp, foeMaxHp: b.foeMaxHp,
        cd: b.cd || {}, clash: b.clash, fever: pitFever(b.beat || 1),
        me: b.me, underdog: b.underdog || 1,
        // ── WHAT THE SCREEN HAS TO ASK FOR ───────────────────────────────────────────────────────────────
        // `awaiting` is the whole state machine as far as the client is concerned: "act" wants a command,
        // null means the fight is over and it is playing a transcript back. It used to have a second value —
        // "brace" — and that went with the timing game, see the tombstone in arena-kit.js. A bout with no ring
        // has no `awaiting` and reads as null, which is exactly right —
        // that is a finished fight from before this shipped.
        awaiting: b.ring?.awaiting || null,
        // ── AND WHICH FIGHT THIS IS ──────────────────────────────────────────────────────────────────────
        // The screen has to know before it reads a single log line, because the two modes draw a different
        // ring. Absent on every bout opened before the timer existed, which reads as classic — see the note
        // in openBoutRing for why the mode is stamped once rather than re-asked.
        // Every bout is a timer bout. The field stays on the wire because bouts saved before the classic
        // ring was removed still carry `mode`, and the fight screen keys its whole layout off it — an old
        // bout resuming with no mode would render as a fight with no bars.
        mode: "atb",
        // Both bars as they stand RIGHT NOW, so the screen has somewhere to start before the first event.
        // Every log line carries its own copy for the moment it happened; this is the one for "now".
        bars: b.ring?.atb ? liveBars(b.ring.atb, b.ring.now || 0) : null,
        // The deck, so the buttons exist. Only YOUR side: `b.foe.skills` stays server-side with their
        // cooldowns, because what the other fighter is holding is not the player's information.
        deck: (b.me?.deck || []).map((k) => ({
            id: k.id, name: k.name, sprite: k.sprite, blurb: k.blurb,
            power: k.power, hits: k.hits, cooldown: k.cooldown, free: Boolean(k.free),
        })),
        // THEIR WARD, ON THEIR BAR. `shield` was published and `foeShield` was not, so the blue slab that sits
        // on your health bar when you brace had no counterpart when THEY braced — the enemy guarded, the next
        // swing did far less than the numbers said it should, and nothing on screen accounted for it.
        // FighterBar has taken a `shield` prop all along; the foe's copy was simply never given one.
        //
        // Only this one. The other seven foe-side fields the engine keeps (foeBleed, foeSunder, foeRiposte,
        // foeSurge, foeCd, foeItems, foeStood) stay server-side: two of them are the opponent's options, which
        // this function withholds on purpose, and the rest have nothing on screen that would read them —
        // publishing a field nothing renders is how the last five bugs in this file started.
        foeShield: b.foeShield || 0,
        // ── WHAT IS LEFT OF YOUR BRACE BUDGET ────────────────────────────────────────────────────────────
        // Published because the button reads it. A limit the player cannot see is a button that stops
        // working for no stated reason, which is how a rule becomes a bug report. `braceReady` is the
        // alternating half of the same rule, resolved here so the screen never has to know the arithmetic.
        // Braces are no longer rationed, so there is no remaining count to publish. Kept as a field the
        // screen can still read (it renders a pip off it) with null meaning "unlimited" — see ArenaClient.
        braces: null,
        braceReady: !((b.braceBeat || 0) > 0 && (b.braceBeat || 0) >= (b.beat || 0) - 1),
        // WHICH ROOM THIS FIGHT IS IN. Withheld until now, so the screen could not tell a plaza raider from a
        // ladder rung and offered "Back to the ladder" to somebody who had walked in from the town — which is
        // where they were then stranded. The rider itself stays server-side; only the fact of it is published.
        town: Boolean(b.town),
        // AND WHICH ROOM A HOOKED MONSTER IS IN. Same reason, one floor down: the ring draws a colosseum
        // behind whoever is fighting, so a Kraken you had just pulled over the rail was answered on hot sand
        // under bunting. The rider (which monster, what tier) stays server-side — the screen only needs to
        // know that this fight is happening on the deck.
        fishing: Boolean(b.fishing),
        // The new lingering states. Without these the burn ticking their bar and the stripped guard would be
        // things the server knew about and the player could only infer from the log.
        // ── STUN AND HASTE, ON BOTH BODIES ───────────────────────────────────────────────────────────────
        // Published for each fighter separately because the screen draws them on the fighter they belong to:
        // a swirl over the one who cannot act, a green glow on the one who is about to act twice as often.
        // `hasted` is now "a haste just procced and they are owed a turn", not "they are swinging at double
        // rate for the next five" -- the glow marks the same moment either way.
        stunned: (b.stunned || 0) > 0, hasted: (b.bonusTurns || 0) > 0,
        foeStunned: (b.foeStunned || 0) > 0, foeHasted: (b.foeBonusTurns || 0) > 0,
        bleed: b.bleed || null, sunder: b.sunder || 0, riposte: b.riposte || 0,
        // ── AND THE ONES ON YOU ──────────────────────────────────────────────────────────────────────
        // These were deliberately held back as "the opponent's business". They are not: a burn eating your
        // health every turn that the screen never mentions is indistinguishable from the numbers being
        // wrong, which is the oldest bug in this file. You could not see you were on fire.
        foeBleed: b.foeBleed || null, foeSunder: b.foeSunder || 0,
        // ── WHAT OF THEIRS IS COOLING ────────────────────────────────────────────────────────────────
        // Your own rail counts down in turns; theirs was three icons that never changed, so there was no
        // way to know whether the move you were dreading could even be thrown this beat. Published as
        // TURNS REMAINING rather than the raw beat it comes back on, because the beat number is an
        // internal clock and nobody should have to subtract to read a fight.
        foeCd: Object.fromEntries(
            Object.entries(b.foeCd || {})
                .map(([id, until]) => [id, Math.max(0, Number(until) - (b.beat || 0))])
                .filter(([, turns]) => turns > 0)
        ),
        // The NPC-only states. Published because the fight screen draws a chip for each — an effect the
        // player is under and cannot see is indistinguishable from the numbers being wrong.
        branded: Boolean(b.branded), doom: b.doom || 0, doomReady: Boolean(b.doomReady),
        foeFrenzy: b.foeFrenzy || 0,
        incoming: b.incoming || null,
        // `tell` was published here and read on the ladder row, but nothing has ever assigned it — a leftover
        // of the rock-paper-scissors build, where the opponent's next stance was printed for you to counter.
        log: b.log || [], over: Boolean(b.over), won: Boolean(b.won),
        recap: b.recap || null,
        reward: b.reward || null,
    };
}

// ── FINDING A FIGHT ──────────────────────────────────────────────────────────────────────────────────────────
// One button, the way the sea does it. The list was two stacked lists of eighty rows asking you to compare
// strangers before you had fought once — and the comparison is not a decision anybody has the information to
// make, because a name and a health number do not tell you whether you can take them.
//
// "Someone your own size" is a POWER ratio, aimed a shade in your favour: this is a fight against the Den, not
// a ladder rung you have to earn. Members and Gauntlet tiers go in the same hat; a real member is weighted up,
// because beating a person is a better story than beating a dummy — but only when one of them is your size.
const TARGET_RATIO = 0.95;   // their power against yours: a shade in your favour
// ── HOW FAR FROM EVEN IS STILL A FIGHT ───────────────────────────────────────────────────────────────────────
// Named once and applied to BOTH pools, because it used to be applied to only one — see matchArenaOpponent.
// 0.5 either side of TARGET_RATIO puts an opponent between roughly half and one and a half times your power.
const FAIR_GAP = 0.5;
const SHORTLIST = 7;         // how many of the closest go in the hat
const MEMBER_WEIGHT = 1.6;   // a person beats a dummy, when there is one your size
// How many places up or down the ladder still counts as your neighbourhood. Five either side is the same
// window the board now draws, so the people you can SEE are the people you can be matched with.
const MEMBER_SPAN = 5;

// ── BOTH KINDS, ALWAYS ───────────────────────────────────────────────────────────────────────────────────────
// This used to rank members and Gauntlet tiers in one pile by closeness and take the seven nearest, which made
// the Gauntlet a GAP-FILLER: with ten members near your power you would never see an NPC again, and at the top
// of the pack you would see nothing else. Measured, it went from 100% NPC to 0% across a handful of members.
//
// That is wrong in both directions. The Gauntlet is where the ARCHETYPES live — a Wall that wants its guard
// stripped, a Berserker that folds if you survive its opening — and those are the fights that teach you how
// the systems work. A member's loadout cannot teach you that; it is whatever they happened to build.
//
// So the shortlist RESERVES seats. At least two go to Gauntlet tiers and at least two to people, whenever each
// exists, and the rest is filled by closeness as before. The Gauntlet stays woven through the whole ladder
// instead of appearing only when the Den is asleep — and somebody at the very top still meets people.
const RESERVE_NPC = 2;
const RESERVE_MEMBER = 2;
// ── AND THE SPLIT IS A NUMBER, NOT AN OUTCOME ────────────────────────────────────────────────────────────────
// Reserving seats and weighting by rank got the Gauntlet to "somewhere between 29% and 60%, depending on how
// crowded your rating is" — which is better than 0-100%, and still not a thing anybody chose. Luke wants 45%,
// so 45% is written down and the weights are normalised to hit it.
//
// The alternative is tuning MEMBER_WEIGHT and the reserve counts until the measured number lands near the
// target, which is how you end up with three constants nobody can explain and a split that drifts the next
// time the roster changes shape. This holds at any roster size by construction.
// 0.45 was too much: three Gauntlet fights in a row is a run nobody wants, and at 45% that happens roughly
// once every eleven matches. At 30% it is once every thirty-seven, which reads as variety rather than a rut.
// 0.3 -> 0.5. The mechanism is sound this time — measured against Luke's own card, 11 of 44 reachable tiers
// clear the fairness gate and the closest sits 4% off his rating — so "I still never see npc fights" was three
// in ten reading as never across a handful of taps. A coin flip is what he is actually asking for.
// ── AND THEN: THE ARENA IS FOR PEOPLE ────────────────────────────────────────────────────────────────────────
// 0.5 -> 0. Luke: "when fighting in the arena id prefer only pvp not npcs we can leave npcs for the road."
// The Gauntlet share was built to stop designed fighters vanishing from the hat; the Road is where they live
// now, a hundred rungs of them with names and sprites, so the Arena does not need to carry them too.
//
// This is a PREFERENCE, not a removal, and the three fallbacks below still stand: a member with nobody their
// own size on the board — the bottom of the ladder, or the top — still gets handed a designed fighter rather
// than a tapped button that finds nothing. Luke asked for exactly that case: "in the case of Kent, it should
// offer up a fake NPC."
const GAUNTLET_SHARE = 0;

function matchArenaOpponent(buyerId, myPower, board, bestTier, blocked = new Set(), blockedBands = new Set()) {
    const dist = (p) => Math.abs(p / Math.max(1, myPower) - TARGET_RATIO);
    // ── PEOPLE ARE MATCHED BY THE LADDER, TIERS BY POWER ─────────────────────────────────────────────────
    // The Gauntlet still uses power because a tier's power is known exactly and costs nothing to read. MEMBERS
    // no longer carry one — see standings — so they are matched by how far apart you sit on the ladder, which
    // is what the board is ordered by and what Luke asked for: "just show five people that are close to you in
    // victory points, that way you're always fighting someone around your level."
    //
    // Distance is in PLACES, scaled so FAIR_GAP means the same thing to both pools: MEMBER_SPAN places away
    // is exactly as unfair as being FAIR_GAP off someone's power.
    const myIdx = board.findIndex((o) => String(o.id) === String(buyerId));
    const rankDist = (i) => (myIdx < 0 ? 0 : Math.abs(i - myIdx) / MEMBER_SPAN * FAIR_GAP);
    const members = [];
    const npcs = [];
    for (let i = 0; i < board.length; i += 1) {
        const o = board[i];
        if (String(o.id) === String(buyerId)) continue;
        // Silently skipped here, unlike the board — matchmaking picks FOR you, so there is nothing to explain.
        if (blocked.has(String(o.id))) continue;
        members.push({ kind: "member", id: o.id, boost: MEMBER_WEIGHT, d: rankDist(i) });
    }
    // ── THE BLOCK IS A PREFERENCE, NOT A WALL ────────────────────────────────────────────────────────────
    // "Do not rematch" must never become "there is nobody to fight". On a quiet board — or one where you
    // have already fought everyone present — the five-bout rule would empty the list entirely.
    if (!members.length && blocked.size) {
        for (let i = 0; i < board.length; i += 1) {
            const o = board[i];
            if (String(o.id) === String(buyerId)) continue;
            members.push({ kind: "member", id: o.id, boost: MEMBER_WEIGHT, d: rankDist(i) });
        }
    }
    // Only tiers you are allowed to fight — the same reach the explicit path enforces, so matchmaking can
    // never hand you a tier a crafted POST would have been refused.
    //
    // The floor is WHERE YOUR GEAR PUTS YOU, not what you have beaten here. Starting from `npc_best` alone
    // meant a fully geared newcomer could be offered nothing but tiers 1-5, and reserving Gauntlet seats then
    // handed them a run of Straw Dummies — the exact complaint.
    const maxTier = Math.max(1, Math.max(Number(bestTier) || 0, tierForRating(myPower)) + NPC_REACH);
    for (let t = 1; t <= maxTier; t += 1) {
        const n = npcFor(t);
        if (!n) break;
        // ── THE CONVERTER, AND THIS ONE LINE IS WHY THE GAUNTLET NEVER APPEARED ─────────────────────────
        // npcFor() returns a tier's RAW stat line — might, crit_chance, crit_power, ferocity — and
        // arenaRating() reads the RING stats: damage, critChance, critMult, health. Handed the raw object it
        // found none of them, took every default, and returned 0. For every tier. So every tier's distance
        // was a flat 0.95, nothing ever cleared the 0.5 fairness gate, `fairNpcs` was always empty, and the
        // Gauntlet has never once been offered by matchmaking since this function was written. Every other
        // arenaRating() call in this file wraps its argument in the converter; only this one did not.
        npcs.push({ kind: "npc", tier: t, boost: 1, d: dist(arenaRating(fighterFrom(n, {}, null))) });
    }
    if (!members.length && !npcs.length) return null;
    members.sort((a, z) => a.d - z.d);
    npcs.sort((a, z) => a.d - z.d);

    // ── THE KIND IS DECIDED FIRST, AND THEN WHO ──────────────────────────────────────────────────────────
    // This used to seat both kinds in one shortlist, weight every candidate by its distance, and then scale
    // the blocks so the Gauntlet came out at GAUNTLET_SHARE. It reads well and it has one failure mode that
    // is invisible from the code: the share is EMERGENT. It only holds while a tier survives the shortlist,
    // and on a board with ninety members every one of the five unreserved seats goes to somebody closer than
    // any tier — so the Gauntlet's share depended on a `fairNpcs` filter that quietly returns nothing the
    // moment your power sits between rungs. Luke, who has fought a lot of these: "never getting random npcs
    // when you select fight, its always players".
    //
    // So the coin is flipped BEFORE the shortlist. GAUNTLET_SHARE of the time you fight the Gauntlet, and
    // then the question is only WHICH tier — which is what the distance weighting was always good at. A
    // guaranteed share cannot drift to zero, and it cannot drift to one either: if a kind has nobody in it,
    // the other kind takes the roll, and that is the only case where the split moves.
    const pickWithin = (pool, reserve) => {
        // An empty pool used to fall out of here as `undefined` — `weighted.find(...) || weighted[0]` is
        // undefined twice over — and undefined reads as "no opponent", which is how a tapped Fight button
        // spent a round trip and came back with nothing.
        if (!pool.length) return null;
        const seats = pool.slice(0, Math.max(1, reserve));
        const weighted = seats.map((c, i) => ({ ...c, w: c.boost / (1 + i) }));
        let roll = Math.random() * weighted.reduce((sum, c) => sum + c.w, 0);
        return weighted.find((c) => (roll -= c.w) <= 0) || weighted[0];
    };
    // A tier more than half a power-step away is not a fight, it is a formality — that is what put Straw
    // Dummies in front of a geared player. If nothing is close enough the Gauntlet stands down for this roll
    // rather than being forced in, and the members take it.
    const fairNpcs = npcs.filter((n) => n.d <= FAIR_GAP);
    // ── AND SO DO PEOPLE ─────────────────────────────────────────────────────────────────────────────────
    // The Gauntlet has always been filtered for fairness here; MEMBERS never were. `pickWithin(members, …)`
    // takes the nearest few by distance, which sounds equivalent and is not: nearest is relative, and on a
    // board of twenty the nearest person to the newest member is still the strongest player in the Den.
    //
    // Sunflower Jinxx: "the match me with someone random button says it's supposed to be an even fight but
    // keeps putting me against Luke and Eric who are 400 and 800hp higher than me." GrayKitsune: "I don't
    // understand why the game thinks I am 'even' with Eric and JT." They are both right, and it is this one
    // missing filter — the button was promising something the matcher never checked.
    //
    // The Gauntlet is the fallback, which is the entire reason it exists: when nobody your size is online,
    // you fight a tier your size rather than the nearest person who will flatten you.
    const fairMembers = members.filter((m) => m.d <= FAIR_GAP);
    // A band fought in the last few bouts stands aside — the same preference-not-a-wall the member block is,
    // so a Den where only one band is ever fair still gets a fight rather than nothing.
    const freshNpcs = blockedBands.size ? fairNpcs.filter((n) => !blockedBands.has(npcFor(n.tier)?.band)) : fairNpcs;
    const npcPool = freshNpcs.length ? freshNpcs : fairNpcs;
    // ── SOMEBODY HAS TO TAKE THE ROLL ────────────────────────────────────────────────────────────────────
    // The two lines below each assume the OTHER pool has somebody in it. Both can be empty at once: no tier
    // lands within half a power-step (so the Gauntlet "stands down"), and the member list is empty or has
    // been emptied — by the rematch block, or simply by being the only one on the board. That returned
    // undefined and the Fight button came back with no match after a round trip.
    // Luke: "often times I hit the fight button and it makes a server request but then doesn't find a match".
    // Standing down is a preference, not a rule: if nobody else can take it, the nearest tier fights anyway.
    // Nobody fair anywhere: the nearest tier if there is one, otherwise the nearest person. Standing down
    // is still a preference and not a rule — a fight you can lose beats no fight at all.
    if (!npcPool.length && !fairMembers.length) {
        if (npcs.length) return pickWithin(npcs, RESERVE_NPC + 1);
        return members.length ? pickWithin(members, SHORTLIST) : null;
    }
    if (!npcPool.length) return pickWithin(fairMembers, SHORTLIST);
    if (!fairMembers.length) return pickWithin(npcPool, RESERVE_NPC + 1);
    // `SHORTLIST - RESERVE_NPC` reserved seats for the Gauntlet in the member draw. With the share at zero
    // there is nothing to reserve them for, and holding two back would narrow the pool of PEOPLE for no
    // reason — which is the same mistake, one level down, that the reserve was invented to fix.
    if (GAUNTLET_SHARE > 0 && Math.random() < GAUNTLET_SHARE) return pickWithin(npcPool, RESERVE_NPC + 1);
    return pickWithin(fairMembers, GAUNTLET_SHARE > 0 ? SHORTLIST - RESERVE_NPC : SHORTLIST);
}

/**
 * Build a fresh bout object.
 *
 * EXTRACTED so a town raider and an arena challenger are the same fight. It was written inline in startBout,
 * which meant a second entry point could only be a second copy — and two copies of a combat state is how the
 * boss fight and the arena ended up disagreeing about what Might does. `extra` is spread last so a caller can
 * hang a rider on it (the raid does: see startTownBout) without this needing to know what a raid is.
 */
// ── THE TOWN'S EDGE ──────────────────────────────────────────────────────────────────────────────────────────
// A raider hits for twice what the same hero hits for in the Arena, and ONLY in the plaza.
//
// A town raid is not a duel you opted into with a build you tuned — it is the whole Den swinging at a shared
// wave on a clock, in whatever gear they happened to be wearing when the horn went. Tuned against arena
// numbers it stopped being a fight anybody could lose and became one nobody could win: the wave outlived the
// event, the plaza sat stuck behind a foe with no answer, and the raid's own clock — the thing that makes it
// an event rather than a grind — turned into the reason it failed.
//
// This is deliberately a flat number and not a curve. A curve here would be a difficulty system nobody asked
// for, and the honest problem is that the baseline was set in the wrong room.
const TOWN_EDGE = 2;

// A member id, as opposed to `ladder:12` or `town:<enemy>`. Used where a value is about to meet a uuid column.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildBout(me, foe, foeKit, { npcTier = 0, size = 0, myPower = 0, myDamageMult = 1, extra = {} } = {}) {
    const theirPower = npcTier > 0 ? foe.gearPower : (foe.power || foeKit.gearPower || 0);
    const bout = {
        myPower, theirPower, npcTier, size,
        // Built from the current kit. See the one-time refresh in resolveBeat, which this switches off for
        // every bout made from here on.
        kitv: 1,
        foe: {
            id: foe.id, name: foe.name, sprite: foe.sprite, level: foe.level || null,
            npc: Boolean(npcTier), tier: npcTier || null,
            // ── WHO THEY ARE, NOT JUST WHAT THEY HIT FOR ─────────────────────────────────────────────────
            // This object is an ALLOWLIST, and it is rebuilt from the resolved foe rather than spread from
            // it — so anything not named here is dropped the moment the bout is written to bout_json, and
            // every later read (the fight screen, finishBout) sees only what survived.
            //
            // The Long Road lost `ladder`, `rung` and `reward` exactly that way. finishBout gates the whole
            // payout on `b.foe.ladder`, which was undefined for every rung ever fought — so a hundred named
            // opponents each beatable once were beatable infinitely many times for nothing: no laurels, no
            // chest, no rung marked down, the road stuck at 0/100 for everybody. The rung is ALSO carried as
            // a top-level rider below (the town raid's pattern) because that is what the payout reads; these
            // are what the screen reads, so the fighter you walk up to keeps their house and their face.
            ladder: Boolean(foe.ladder), rung: foe.rung || null, champion: Boolean(foe.champion),
            house: foe.house || null, houseName: foe.houseName || null,
            blurb: foe.blurb || null, color: foe.color || null,
            archetypeName: foe.archetypeName || null, spriteFallback: foe.spriteFallback || null,
            // ── EVERYTHING THE RING RESOLVES A SWING FROM ────────────────────────────────────────────────
            // Spread, not retyped. This was twenty hand-written fields and sideOf reads thirty-five, so the
            // other fifteen — armour, thorns, block, guard, regen, ward, surge, freeze, chill, soulfire and
            // the rest — were computed for this fighter and then dropped on the way into bout_json. See
            // COMBAT_FIELDS in arena-engine.js for what that cost and why the list lives there now.
            ...fighterFields(foeKit),
            // Their build, so the defence fights it. Withheld from publicBout below — what they are holding
            // is their business, the same way their cooldowns were.
            skills: foeKit.skills || {},
            element: foeKit.element, abilities: foeKit.abilities, might: foeKit.might, gearPower: foeKit.gearPower,
            // WHICH DISCIPLINE THEY FIGHT AS. The bout knew everyone's class and published nobody's, so the
            // card could tell you their element and their crit but not whether you were swinging at a Warden.
            // Named here or the allowlist above drops it, which is how The Long Road lost its rung.
            classId: foeKit.classId || null,
            // The four numbers the fight is made of, carried onto the bout so the card and the engine cannot
            // disagree — the card reads the same fields resolveBeat multiplies.
            health: foeKit.health, damage: foeKit.damage,
            critChance: foeKit.critChance, critMult: foeKit.critMult,
            // ── AND `dr` IS CARRIED AS ZERO, NOT AS DEFAULT_DR ───────────────────────────────────────
            // Damage reduction was deleted — armour is the whole of mitigation — and the engine reads no `dr`
            // at all. This defaulted to 0.20 anyway, so every NPC's card advertised "20% reduction" for a
            // mechanic the bout never applied. A card that states a rule the fight does not run is the exact
            // defect the ring has been dug out of twice; the field stays (the bout shape is asserted by
            // check:bout) and it stays honest.
            dr: foeKit.dr ?? 0,
            lifesteal: foeKit.lifesteal || 0,
            bleedChance: foeKit.bleedChance || 0, burnChance: foeKit.burnChance || 0, dmgPct: foeKit.dmgPct || 0,
            // Their brace, resolved from THEIR class and Fortune. Named here or it is dropped by the
            // allowlist and their Guard silently falls back to a stranger's numbers.
            guard: foeKit.guard ?? DEFAULT_GUARD,
            // ── AND THEIR TREE ────────────────────────────────────────────────────────────────────────────
            // kitFor() has always built these for whoever it is asked about, and four of them (critPower,
            // critMult, armour, and the stat nodes) were folded into the numbers above. The other fifteen —
            // thorns, block, lastStand, regen, pierce, openMult, lowHpDmg, spellPower, elementEdge and the
            // rest — were computed for the defender and then dropped on the floor, because only `me` carried
            // `perks` onto the bout. So a member who spent twelve points on Iron Thorns returned nothing
            // while defending, and the build they chose was invisible in half the fights it appeared in.
            perks: foeKit.perks || {},
        },
        // gearPower is load-bearing and was MISSING: the Giant-Killer feat tests
        // foe.gearPower >= me.gearPower * 1.25, so with me.gearPower undefined the comparison was
        // "anything >= 0" and it fired on EVERY win — including beating a Straw Dummy.
        // `perks` RIDES ALONG NOW, and that is the whole fix for a shield build that did nothing. The tree's
        // stat nodes were merged into health/might/speed/fortune at kit time and then thrown away, so the
        // fifteen that are not one of those four — thorns, regen, block, guardSoak, riposteShare, lastStand,
        // shieldCap, wardSoak, critMult, openMult, lowHpDmg, pierce, spellPower, elementEdge, rendTick — were
        // read by nothing at all. Iron Thorns returned nothing. Fortress soaked nothing. Overkill did nothing.
        // `damage` is scaled HERE rather than multiplied into the swing at resolve time, so the number on the
        // fighter card is the number you actually hit for. A hidden multiplier in the raw product is the exact
        // shape of the "why do I do so little damage" complaint further down this file — the fix for that was
        // to stop hiding terms, and a town buff nobody can see would be a new one.
        me: { ...fighterFields(me),
            // ── WHAT THEY CAN PRESS, FROZEN AT THE BELL ──────────────────────────────────────────────────
            // The bag and the resolved deck both ride on the bout rather than being looked up per beat. That
            // is what stops a member unlocking a capstone mid-fight and swinging with it, and it is what
            // actBout re-resolves against — never the skill id in the request body.
            skills: me.skills || {}, deck: me.deck || [],
            element: me.element, abilities: me.abilities, might: me.might,
            health: me.health, damage: me.damage * myDamageMult,
            critChance: me.critChance, critMult: me.critMult,
            dr: me.dr ?? 0,
            lifesteal: me.lifesteal || 0,
            bleedChance: me.bleedChance || 0, burnChance: me.burnChance || 0, dmgPct: me.dmgPct || 0,
            guard: me.guard ?? DEFAULT_GUARD,
            gearPower: me.gearPower, level: me.level, perks: me.perks || {},
            classId: me.classId || null },
        // ── THE EDGE BELONGS TO WHOEVER IS OUTGEARED, NOT TO WHOEVER PRESSED CHALLENGE ───────────────────
        // This only ever multiplied the CHALLENGER's damage. The same two loadouts therefore fought two
        // different fights depending on who happened to open: challenge someone far above you and you came in
        // with up to +90% damage, and that identical mismatch defending paid them nothing. It is the exact
        // "we debuff them because they're on defence" asymmetry — a catch-up rule only one side of the ring
        // could ever collect. Both sides are measured now, and only the side actually behind on gear collects.
        underdog: underdogEdge(me.gearPower, foeKit.gearPower),
        foeUnderdog: underdogEdge(foeKit.gearPower, me.gearPower),
        hp: me.health, maxHp: me.health,
        foeHp: foeKit.health, foeMaxHp: foeKit.health,
        cd: {},                                  // abilityId -> turns before it can be used again
        // The defender's satchel. Seeded here so a bout saved before items existed still gets them on its
        // next beat (the picker falls back to a fresh set if this is missing) rather than fighting empty.
        // SPEED takes the first beat. A tie keeps it with the challenger, so bringing the fight still counts
        // for something. Opening a ten-beat exchange is a real edge, which is what makes Ferocity worth wearing.
        // A coin flip at the bell — openRing asks it, and this is only the pre-ring default for a bout that
        // never opens one. Speed used to decide it; there is no speed.
        turn: "you",
        beat: 1, log: [], over: false, won: false,
        shield: 0, surge: 0,                     // ward soaks the next blow; surge sharpens your next swing
        bleed: null, sunder: 0, riposte: 0,      // rend burns, sunder strips guard, riposte answers back
        // ── AND THE SAME SIX ON THEIR SIDE OF THE RING ────────────────────────────────────────────────────
        // Every one of these was a thing only an attacker could own. A defender could swing, brace, drain or
        // reach for an item, and that was the entire game they were allowed to play — so a rend in their kit
        // landed as a plain hit, a sunder did nothing, a surge did nothing, a ward did nothing, and a riposte
        // did nothing. Five of the tree's nodes (rendTick, rendStacks, burnOnCrit, riposteShare, cdCut) were
        // therefore unreachable while defending no matter how many points their owner had spent on them.
        foeShield: 0, foeSurge: 0,
        foeBleed: null, foeSunder: 0, foeRiposte: 0,
    };
    Object.assign(bout, extra);
    // ── PLAYED, OR RESOLVED WHERE IT STANDS ──────────────────────────────────────────────────────────────
    // Interactive: a ring is opened and the bout stops on the first thing the member has to answer. Passive:
    // the whole fight runs here in one pass and what the client receives is a finished transcript to play
    // back. Both go through the same three functions in arena-engine, so the two cannot disagree about what
    // a swing is — that is the whole reason the ring was built on top of the auto-resolver rather than beside
    // it.
    // ── AND IT IS ALWAYS THE RING ────────────────────────────────────────────────────────────────────────
    // Luke: "when do we use autoBout? Ideally, we don't use that at all."
    //
    // In production it was already never — `interactiveFor` was `INTERACTIVE || isOwner(buyerId)` with
    // INTERACTIVE pinned true, and all three buildBout callers passed it, so `resolveAuto` had been dead code
    // wearing a live-looking branch. Both are gone: a second resolver that nothing calls is worse than no
    // second resolver, because every balance script in the repo was still measuring through it and reporting
    // numbers about a game nobody plays. See autoRing in arena-ring.js for the headless driver those use now.
    openBoutRing(bout);
    return bout;
}

// ── OPENING A FIGHT SOMEBODY IS GOING TO PLAY ────────────────────────────────────────────────────────────────
// The ring is the live fighter state — both sides' hp, shields, wounds, burns, the clock, the cooldowns — and
// it rides INSIDE bout_json rather than in a column of its own, so every path that already loads, saves,
// clears or expires a bout carries it without needing to know it exists.
//
// The foe's skills come along so the defence fights its own build, and its NAME comes with them so the
// transcript can say who did what. Nobody is on the other end of a defence, so without the skills it would
// throw nothing but plain attacks for the length of the bout — which is exactly what Luke hit on a Road rung,
// and see npcSkills for the half of it that was NPCs having no deck at all.
function openBoutRing(b) {
    b.ring = openRing(b.me, b.foe, { foeSkills: b.foe?.skills || {}, foeName: b.foe?.name || null });
    // ── THE MODE IS STAMPED ON THE BOUT, ONCE, HERE ──────────────────────────────────────────────────────
    // On the bout rather than only inside the ring, because the client reads `publicBout` and has to know
    // which screen to draw before it looks at a single log line. A bout that predates the timer simply has
    // no `mode` key and every path treats it as classic — which is what makes this safe to deploy while
    // fights are in flight.
    b.mode = "atb";
    syncRing(b);
    return b;
}

// Mirror the ring onto the fields the rest of the game already reads. finishBout, the telemetry, the payouts,
// publicBout and the fight screen were all written against `hp` / `foeHp` / `log` / `over` / `won`, and none of
// them should have to learn that a ring exists — so the ring stays the source of truth and this copies out of
// it after every beat.
function syncRing(b) {
    const r = ringResult(b.ring);
    b.log = r.log;
    b.beat = r.beat;
    b.hp = r.hp;
    b.foeHp = r.foeHp;
    b.maxHp = r.maxHp;
    b.foeMaxHp = r.foeMaxHp;
    // The blue slab on both bars. publicBout has published `shield` and `foeShield` all along and this is
    // what was never filling them in — see ringResult.
    b.shield = r.shield;
    b.foeShield = r.foeShield;
    b.over = r.over;
    b.won = r.won;
    b.unresolved = r.unresolved;
    b.duration = r.time;
    // What the screen has to ask for next, and what is off cooldown when it does.
    b.awaiting = b.ring.awaiting;
    b.turn = b.ring.turn;
    b.cd = b.ring.cd;
    return b;
}


/**
 * FIGHT A TOWN RAIDER ON THE ARENA ENGINE.
 *
 * Tapping a goblin used to open a timing bar: one swing, graded on how close to the centre you tapped, and
 * your class and your skills had nothing to do with it. It opens a real bout now — your kit, your tree, their
 * archetype — on exactly the machinery the Arena uses, because a second combat engine is how two systems end
 * up disagreeing about what Might does.
 *
 * WHAT IS DIFFERENT FROM AN ARENA CHALLENGE, and all of it deliberate:
 *   · it does NOT spend one of your daily arena bouts — a raid is the town's clock, not the Arena's
 *   · it pays no VP and no laurels; the spoils are the raid's own (see duelRaidEnemy)
 *   · the foe is claimed on the shared roster FIRST, so two members cannot fight the same goblin
 *
 * The bout carries a `town` rider, which is the only thing telling finishBout to pay it as a raid.
 */
export async function startTownBout(buyerId, eventId, enemyId) {
    if (!combatOpenFor(buyerId)) return { ok: false, error: "combat_closed" };
    const row = await arenaRow(buyerId);
    if (row?.bout_json && !row.bout_json.over && !staleBout(row.bout_json)) {
        return { ok: false, error: "bout_in_progress" };
    }
    const { engageEnemy, enemyProfile } = await import("@/lib/marketplace/town-swarm.js");
    // The faction decides the archetype (see FACTION_SHAPE), so the event's kind has to come along or every
    // raid fights as the default and the three new ones are three new portraits on one fight.
    const ev = await db.queryOne(`SELECT kind FROM mkt_town_event WHERE id = $1 AND status = 'active'`, [eventId]).catch(() => null);
    if (!ev) return { ok: false, error: "no_event" };
    // CLAIMED BEFORE ANYTHING IS BUILT. The roster is shared and the claim is the thing that stops two people
    // opening a bout against the same goblin; losing that race has to cost nothing.
    const claim = await engageEnemy(buyerId, enemyId).catch(() => null);
    if (!claim?.ok) return { ok: false, error: claim?.error || "taken", who: claim?.who || null };

    // ⚠️ EVERYTHING BELOW USES claim.enemyId, NOT THE ONE THAT WAS TAPPED. engageEnemy now hands over a free
    // foe when the tapped one is already claimed, so those two are not always the same id — and building the
    // bout from the tapped id would have claimed one bandit and fought a different one, with the kill landing
    // on neither. The claim is the source of truth for which foe this is.
    const foeId = Number(claim.enemyId) || Number(enemyId) || 0;
    const me = await kitFor(buyerId);
    const prof = enemyProfile(claim.kind, ev.kind);
    const st = statsForPower(prof.power, prof.archetype, prof.element, foeId);
    const art = prof.artKey
        ? await db.queryOne(`SELECT url FROM mkt_town_art WHERE art_key = $1`, [prof.artKey]).catch(() => null)
        : null;
    const foe = {
        id: `town:${foeId}`, name: prof.name, sprite: art?.url || null, npc: true, town: true,
        blurb: prof.blurb, color: prof.tint, archetype: prof.archetype, archetypeName: prof.archetypeName,
        tell: prof.tell, level: null,
    };
    const foeKit = { ...foe, ...st, ...fighterFrom(st, {}, null), abilities: npcAbilities(prof.kitTier),
        skills: npcSkills(prof.kitTier, prof.archetype, npcClassFor(prof.kitTier), buildForTier(prof.kitTier)?.branches) };
    const b = buildBout(me, foe, foeKit, {
        myPower: arenaRating(me),
        myDamageMult: TOWN_EDGE,
        // `townEdge` is stamped alongside the rider so a bout can say whether it has already been scaled —
        // see the repair in resolveBeat, which is what rescues the fights that were open when this shipped.
        extra: { town: { eventId: Number(eventId), enemyId: foeId }, townEdge: TOWN_EDGE },
    });
    await saveBout(buyerId, b);
    // ── THE WHOLE STATE, NOT JUST THE BOUT ───────────────────────────────────────────────────────────────
    // The fight renderer draws YOUR fighter from `me` — the sprite, the element, the name — and `settle` on a
    // bout that has only just started returns { ok, unlocked, partial, bout } with no `me` in it at all. So
    // the fighter in your own corner came up as an empty circle with no name over it.
    //
    // This return was already written, directly below a `return settle(...)` that was never removed, so it
    // has never once run. Unreachable code that looks like the fix is worse than no fix: it reads as solved.
    // `redirected` rides out so the plaza can say the tapped foe was taken and this is a different one —
    // otherwise a member on a busy wave silently finds themselves fighting a bandit they did not pick.
    return { ok: true, redirected: Boolean(claim.redirected), enemyId: foeId, ...(await getArenaState(buyerId)) };
}

/**
 * A THING YOU PULLED OUT OF THE WATER, on your deck, fighting.
 *
 * Modelled on startTownBout directly above and for the same reason: the fight renderer needs the WHOLE arena
 * state, not just the bout, because it draws your own fighter from `me`. A response carrying only the bout
 * could not mount, which is the bug that used to bounce the plaza to /marketplace/arena.
 *
 * The monster is built through statsForPower + npcAbilities like every other NPC in the game, so a Kraken on
 * the deck and a Wall on the Road want the same answer out of you. Nothing here is a fishing-specific combat
 * rule — Luke asked for the existing system, and a second one would be a second thing to balance.
 *
 * No TOWN_EDGE. That multiplier exists because a plaza raid is a shared wave everybody is chipping at; a
 * hooked monster is yours alone and is sized by its own power budget.
 */
export async function startFishingBout(buyerId, monsterId) {
    if (!combatOpenFor(buyerId)) return { ok: false, error: "combat_closed" };
    const row = await arenaRow(buyerId);
    if (row?.bout_json && !row.bout_json.over && !staleBout(row.bout_json)) {
        return { ok: false, error: "bout_in_progress" };
    }
    const { fishMonsterById } = await import("@/lib/marketplace/fishing.js");
    const m = fishMonsterById(monsterId);
    if (!m) return { ok: false, error: "no_monster" };

    const me = await kitFor(buyerId);
    const st = statsForPower(m.power, m.archetype, m.element, m.tier);
    const foe = {
        id: `fish:${m.id}`, name: m.name, sprite: m.art, npc: true, fishing: true,
        blurb: m.blurb, color: null, archetype: m.archetype, level: null,
    };
    const foeKit = { ...foe, ...st, ...fighterFrom(st, {}, null), abilities: npcAbilities(Math.max(1, m.tier * 3)),
        skills: npcSkills(Math.max(1, m.tier * 3), m.archetype, npcClassFor(Math.max(1, m.tier * 3)), buildForTier(Math.max(1, m.tier * 3))?.branches) };
    const b = buildBout(me, foe, foeKit, {
        myPower: arenaRating(me),
        extra: { fishing: { monster: m.id, tier: m.tier } },
    });
    await saveBout(buyerId, b);
    // The whole state, for the reason this function's own comment gives above and startTownBout's does too:
    // without `me` the renderer has no sprite and no name for the player, and draws the ar-noface fallback —
    // a grey disc on the deck where you are supposed to be. Luke: "cant see myself in ship encounter."
    return { ok: true, ...(await getArenaState(buyerId)) };
}

export async function startBout(buyerId, targetId = null) {
    if (!combatOpenFor(buyerId)) return { ok: false, error: "combat_closed" };
    const row = await arenaRow(buyerId);
    if (row?.bout_json && !row.bout_json.over && !staleBout(row.bout_json)) {
        return { ok: false, error: "bout_in_progress", ...(await getArenaState(buyerId)) };
    }
    // STAMINA was bought and then ignored HERE: getArenaState added the track to the allowance it displays,
    // and this gate compared against the bare constant — so the counter said you had another challenge and
    // the server refused it. One expression, in both places.
    // ── THE ROAD IS NOT THE ARENA'S ALLOWANCE ────────────────────────────────────────────────────────────
    // A rung is a hundred fixed fights, each payable ONCE — it has its own hard ceiling built in, and it is
    // the single-player track people walk through in the evening. Charging it against the same ten-a-day
    // allowance the ladder uses meant an hour of Road spent the whole arena, and then the Fight button on
    // the Road card simply stopped working with nothing on screen to say why.
    //
    // Read off the RAW target rather than the resolved one, because the resolve is below and matchmaking
    // ("auto") can only ever return a member or a Gauntlet tier — never a rung.
    const roadRung = ladderRungOf(targetId);
    if (roadRung <= 0 && fightsUsed(row) >= dailyFightsFor(row)) {
        return { ok: false, error: "no_fights", ...(await getArenaState(buyerId)) };
    }

    // In parallel: they share no inputs, and serialising them added a whole round trip to the press that was
    // timing out. ~390ms and ~a loadout assembly, previously one after the other for no reason.
    // TWO BLOCK WIDTHS, and which one applies depends on who did the choosing. `blockedFoes` is the wide one
    // and belongs to auto-match, where you never see what was skipped. `pickBlocked` is the narrow one and
    // belongs to a name you tapped off a list — see the note on REMATCH_BLOCK_PICK.
    const [board, me, blockedFoes, pickBlocked, blockedBands] = await Promise.all([
        standings(), kitFor(buyerId),
        recentPvpFoes(buyerId).catch(() => new Set()),
        recentPvpFoes(buyerId, REMATCH_BLOCK_PICK).catch(() => new Set()),
        recentNpcBands(buyerId).catch(() => new Set()),
    ]);
    const myPower = arenaRating(me);

    // ── WHO ARE WE FIGHTING ──────────────────────────────────────────────────────────────────────────────
    // A member, or a tier out of the Gauntlet. Both resolve to the same shape so the engine below needs no
    // idea which it is. There is no reach check any more: points are accrued, not swapped, so no opponent is
    // off limits and the target list is a convenience rather than the only thing holding the rules up.
    // No target (or an explicit "auto") means: find me one.
    let target = targetId;
    if (!target || target === "auto") {
        const m = matchArenaOpponent(buyerId, myPower, board, Number(row?.npc_best) || 0, blockedFoes, blockedBands);
        if (!m) return { ok: false, error: "no_target", ...(await getArenaState(buyerId, { board, kit: me })) };
        target = m.kind === "npc" ? `npc:${m.tier}` : m.id;
    }
    const npcTier = typeof target === "string" && target.startsWith("npc:") ? Number(target.slice(4)) : 0;
    // ── THE LONG ROAD ────────────────────────────────────────────────────────────────────────────────────
    // A rung resolves to exactly the same shape as a Gauntlet tier or a member, so everything below this
    // point — the kit, the clash, the engine, the recap — needs no idea which it is holding. What is
    // different is only that a rung can be fought ONCE, which is checked here and recorded on the win.
    const rung = ladderRungOf(target);
    let foe = null;
    let foeKit = null;
    if (rung > 0) {
        // ── THE ROAD IS CLOSED WHILE THE GEAR REBALANCE LANDS ────────────────────────────────────────────
        // Vitality, Tenacity, Precision and Pierce all shipped inside a day, and they are a straight buff to
        // every geared fighter — people started clearing rungs they could not touch last week. Rungs are
        // PERMANENT (ladder_beaten is a set you never fall out of), so a ladder cleared during a half-finished
        // balance pass cannot be un-cleared without taking progress off people, which is the one thing we do
        // not do. Closing the door is reversible; letting the Road be finished is not.
        //
        // Refused on the SERVER, not hidden on the screen — the target is a string in a POST body.
        // FLIP THIS BACK when the stat work settles and the telemetry has a clean read.
        if (!roadOpenFor(buyerId)) {
            return { ok: false, error: "road_closed", ...(await getArenaState(buyerId, { board, kit: me })) };
        }
        if (rung < 1 || rung > LADDER_MAX) return { ok: false, error: "bad_target", ...(await getArenaState(buyerId, { board, kit: me })) };
        const beaten = new Set(row?.ladder_beaten || []);
        if (beaten.has(rung)) return { ok: false, error: "already_beaten", ...(await getArenaState(buyerId, { board, kit: me })) };
        // ── IN ORDER, AND ENFORCED HERE ──────────────────────────────────────────────────────────────────
        // Refused on the SERVER, not merely greyed out on the screen: the target is a string in a POST body,
        // and `ladder:100` is as easy to send as `ladder:3`. The screen locks the same rungs (see the
        // `locked` flag in getArenaState) off this identical rule, so the two cannot drift.
        // THE SIZE IS PART OF THE RULE. Somebody who has beaten all hundred and does not hold The Long Road
        // gets nextRung() === 0 here, so no rung matches and rung 101 is not merely hidden, it is unfightable.
        const canLong = await hasUnlock(buyerId, "road_long").catch(() => false);
        if (rung !== nextRung(beaten, ladderSize(canLong))) {
            return { ok: false, error: "locked", ...(await getArenaState(buyerId, { board, kit: me })) };
        }
        const f = ladderFoe(rung);
        foe = f;
        const st = statsForPower(f.power, f.archetype, null, rung);
        // A Road fighter turns aside a share of every blow, rising with the house — see ladderDr. Set BEFORE
        // the converter, which is what reads the stat line onto the card and into the engine.
        st.dr = ladderDr(rung);
        // A CHAMPION'S EDGE IS ITS KIT, NOT ITS STATS. The +35% power multiplier is gone (see ladderFoe) —
        // what makes the tenth fight of a house the tenth fight is that it brings deeper moves than the nine
        // before it. npcAbilities gets nastier with tier, so a champion is read a tier band up.
        const kitTier = Math.max(1, Math.round(rung * 0.9) + (f.champion ? 8 : 0));
        // ── AND THE DECK, WHICH THIS BRANCH DID NOT GET ──────────────────────────────────────────────────
        // npcSkills went into the town bout, the fishing bout and the Gauntlet tier, and MISSED the Road —
        // which is the one Luke was playing when he reported a foe that "doesn't go water splash or icicle
        // blast or something". Traced against rung 31: every beat of the fight was "Snare-Setter Wyn
        // strikes", never a named move, because `skills` was never on the kit and `abilities` is a list the
        // ring does not read. Read at the RUNG, so the depth of the deck climbs the Road with everything
        // else; a champion is read a band up, same as its abilities are.
        // ── AND THE DECK BELONGS TO THE FIGHTER WEARING IT ───────────────────────────────────────────────
        // This passed npcClassFor(kitTier) — the class off a hash of the TIER — while f.archetype had already
        // decided the stats, the wardrobe and the loadout. Two different functions choosing what one fighter
        // is, and measured across the Road they DISAGREED ON ELEVEN OF THIRTEEN RUNGS: rung 75 and 80 were
        // "berserkers" holding Bastion, Retribution and Rally, so they spent every beat raising a guard and
        // had no way to win at all; rung 50 was a "brute" holding the player's own runecaller deck, which is
        // a mirror match rather than a puzzle; rung 100 was a brute with a warden deck.
        //
        // arena-skills.js already documents this exact bug being found and fixed — "no member can be two
        // classes, and the tree a fighter bought is the one its skills come from", Luke: "they must comply
        // with the players same constraints." That fix landed in npcClassForArchetype and the ROAD never
        // received it, because this line kept asking the tier instead. One map, one class, as intended.
        // The class comes from the ARCHETYPE — the thing that already decided this fighter's stats, wardrobe
        // and name — and the build is then drawn from inside that class, so the branches belong to the deck.
        // Passing the archetype's class with buildForTier's branches is what emptied most decks when I first
        // tried this: the two were describing different fighters, so npcSkills had nothing legal to hand back.
        const foeClass = npcClassForArchetype(f.archetype);
        const foeBuild = buildForClass(kitTier, foeClass);
        foeKit = { ...f, ...st, ...fighterFrom(st, {}, null), abilities: npcAbilities(kitTier, f.archetype),
            skills: npcSkills(kitTier, f.archetype, foeClass, foeBuild?.branches) };
    } else if (npcTier > 0) {
        // Beyond your best + reach is refused HERE, not just hidden in the UI, or a crafted POST could farm
        // tier 900 for points on day one.
        const bestTier = Number(row?.npc_best) || 0;
        if (!Number.isFinite(npcTier) || npcTier < 1 || npcTier > bestTier + NPC_REACH) {
            return { ok: false, error: "bad_target", ...(await getArenaState(buyerId, { board, kit: me })) };
        }
        const n = npcFor(npcTier);
        foe = n;
        // An NPC's kit is drawn from the same archetype catalog members use, so it fights with real named
        // moves rather than a bare swing — scaled by tier, and seeded off the tier so a given tier always
        // brings the same two moves and can be planned against.
        // `skills` is what the RING reads; `abilities` is the old gear-signature list it does not. Without the
        // first of these an NPC throws a bare swing every beat of every fight — see npcSkills.
        foeKit = { ...n, ...fighterFrom(n, {}, null), abilities: npcAbilities(npcTier),
            skills: npcSkills(rung > 0 ? rung : npcTier, n.archetype, npcClassFor(rung > 0 ? rung : npcTier), buildForTier(rung > 0 ? rung : npcTier)?.branches) };
    } else {
        foe = board.find((o) => o.id === target);
        if (!foe) return { ok: false, error: "bad_target", ...(await getArenaState(buyerId, { board, kit: me })) };
        // The board draws these as unavailable; this is what makes them unavailable. A crafted POST is the
        // only way to reach this line, and it gets the same answer the screen gave.
        if (pickBlocked.has(String(foe.id))) {
            return { ok: false, error: "recently_fought", ...(await getArenaState(buyerId, { board, kit: me })) };
        }
        foeKit = await kitFor(foe.id);
    }

    // ── THE ROAD'S RIDER ─────────────────────────────────────────────────────────────────────────────────
    // The rung travels as a top-level rider on the bout, the same way a town raid carries `town` — and for the
    // same reason: it is what the PAYOUT reads, and a rider is not subject to the foe object's allowlist, so
    // it cannot be dropped by someone adding a field to a fighter later. Only the rung number rides; what it
    // is worth is recomputed from the current table at payout, so a bout left open across a rebalance pays
    // today's prize rather than a number frozen into a JSON blob days ago.
    const bout = buildBout(me, foe, foeKit, {
        npcTier, size: board.length, myPower,
        extra: rung > 0 ? { ladder: { rung } } : {},
    });
    // The counter moves for an arena fight and stands still for a rung — the other half of the rule above.
    // Both columns are left completely alone on a Road bout: bumping `fights_day` while holding the count
    // would silently reset somebody's allowance the first time they walked the Road on a new day.
    await db.query(
        `UPDATE mkt_arena SET bout_json = $2::jsonb,
            fights_day = CASE WHEN $3 THEN fights_day ELSE ${DAY} END,
            fights_today = CASE WHEN $3 THEN fights_today
                                WHEN fights_day = ${DAY} THEN fights_today + 1 ELSE 1 END,
            updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(bout), rung > 0]
    ).catch(() => {});
    await trackActivity(buyerId, "arena_start", { target: foe.id, npcTier: npcTier || null, theirPower: bout.theirPower }).catch(() => {});
    // A passive bout is already decided and pays out here. An interactive one has barely begun — it pays when
    // the ring says it is over, on whichever beat that turns out to be. See settle().
    return settle(buyerId, bout);
}

/** One exchange. Your stance against theirs, resolved on the server so the pick can't be read or replayed. */
/**
 * ONE BEAT. The client reports how far off the line it landed (`off`, a fraction of the ring's duration) and,
 * on your own beat, which ability you spent Focus on.
 *
 * The damage is computed HERE from your real stats — the client only ever reports its timing. It could lie
 * about that, and the ceiling on lying is one perfect swing per beat, which is what a good player gets anyway.
 */
// ── ONE BEAT, IN THE ORDER IT HAPPENED ───────────────────────────────────────────────────────────────────────
// A beat was published as a BAG of fields — damage, blocked, thorned, riposted, stolen, countered, healed — and
// the screen had to guess a running order out of it, which it did with a table of hardcoded delays: ward at
// 40ms, block at 120, thorns at 200, drink at 240, riposte at 280. Ten things inside half a second, all mounted
// at once, while the fighters animated exactly once for the whole exchange. Luke: "everything post attack
// happens all at once."
//
// The engine already knows the order — it resolved them in it. This stops throwing that away. Each event is
// { kind, side, n }, where SIDE is the fighter it lands on, and the client plays them one at a time.
//
// A blow with no riders is a single event, so a plain exchange is exactly as quick as it was.
function beatEvents(parts) {
    const out = [];
    for (const e of parts) {
        if (!e) continue;
        if (Array.isArray(e.each) && e.each.length > 1) {
            // A flurry is genuinely several blows, and one accumulated number is what made Rampage look like
            // a big swing with a different sprite.
            for (const n of e.each) out.push(n > 0 ? { kind: e.crit ? "crit" : "hit", side: e.side, n } : { kind: "miss", side: e.side });
            continue;
        }
        if (e.n == null || e.n === 0) continue;
        out.push(e.crit ? { kind: e.kind, side: e.side, n: e.n, crit: true } : { kind: e.kind, side: e.side, n: e.n });
    }
    return out;
}

/**
 * ONE COMMAND. The arena is turn-based, so a beat starts with a decision and only then asks for timing.
 *
 *   attack  — a plain swing. Free, and the ring decides how well it lands.
 *   skill   — a gear ability. Costs Focus, which only good timing earns.
 *   guard   — no ring at all. You give up the swing to brace and settle.
 *   item    — no ring. Spend the turn on the field kit instead.
 *   block   — their beat: the ring closes over you and your timing is the defence.
 *
 * Damage is computed HERE from real stats — the client only ever reports its timing. It could lie about that,
 * and the ceiling on lying is one perfect swing per beat, which is what a good player gets anyway.
 */
// ── fightRound IS GONE ───────────────────────────────────────────────────────────────────────────────────────
// A thousand lines of turn-taking: the command deck, the telegraph, the brace, the items, the abilities and
// the AI that chose between them. Combat is passive now — a bout is resolved the moment it is built (see
// resolveAuto) and the client plays back the log. There is no round to take, so there is no function to take
// one, and every mechanic that only existed to be chosen went with it.

export const boutRungOf = (b) => Number(b?.ladder?.rung) || (b?.foe?.ladder ? Number(b?.foe?.rung) || 0 : 0);
export const boutKindOf = (b) =>
    (b?.town ? "town" : boutRungOf(b) ? "ladder" : Number(b?.npcTier) ? "gauntlet" : "member");

function boutTelemetry(b, won) {
    const log = Array.isArray(b?.log) ? b.log : [];
    const sum = (rows, f) => rows.reduce((n, l) => n + (Number(f(l)) || 0), 0);
    // ── AND THE COMMENT THAT USED TO BE HERE DESCRIBED FIELDS THAT DID NOT EXIST ─────────────────────────
    // It said the two sides use different field names -- `turned`/`theirSoak` on your lines, `blocked`/`soaked`
    // on theirs -- and warned that guessing wrong "would have quietly recorded zeroes". It WAS the guess.
    // resolveSwing has only ever pushed `blocked`, and none of `theirSoak`, `soaked`, `thorned`, `riposted`,
    // `takenBack` or `theirThorns` is written anywhere in the codebase. So turnedAside, shielded and back were
    // hard zero on both sides of every telemetry row ever stored -- including the rows scripts/arena-report.mjs
    // is read from when the combat maths is tuned.
    //
    // There is one set of names, the engine writes them, and both sides read the same ones. Mitigation is
    // recorded on the ATTACKER's line, so a side's `turned`/`soaked` is what its OPPONENT's guard stopped --
    // which is exactly what turnedAside has always claimed to mean. Thorns and counters are their own log
    // lines rather than a field, so `back` counts those.
    const shape = (rows, dmg, stopped, shielded, back) => {
        const hits = rows.filter((l) => (l.damage || 0) > 0);
        return {
            dealt: dmg,
            swings: hits.length,
            perSwing: hits.length ? Math.round(dmg / hits.length) : 0,
            crits: rows.filter((l) => l.crit).length,
            turnedAside: stopped,     // stopped by the DEFENDER's guard/armour/block before anything landed
            shieldEaten: shielded,    // absorbed by the defender's banked shield after that
            healed: sum(rows, (l) => l.healed),
            returned: back,           // thorns + riposte coming back off this swing
            guards: rows.filter((l) => l.grade === "guard").length,
            wards: rows.filter((l) => l.grade === "ward").length,
            items: rows.filter((l) => l.grade === "item").length,
            // Counted off `ability`, not off grade "skill". The DEFENDER's log rows are always written with
            // grade "hit" whatever they threw, so a grade test reported 0 abilities for every opponent in
            // every bout — which made a Reaver spamming Rampage look like someone taking plain swings, and
            // sent the first diagnosis off this data looking for a multiplier that was just an ability.
            abilities: rows.filter((l) => l.ability).length,
            // Total blows, so a multi-hit action cannot hide inside a single log line.
            blows: rows.reduce((n, l) => n + (Number(l.hits) || (l.damage > 0 ? 1 : 0)), 0),
            // Blows that missed. Only ever recorded for the member before, because only the member could
            // miss — so the one number that would have shown accuracy was doing nothing on defence was the
            // number the defender never produced.
            missed: rows.reduce((n, l) => n + (Number(l.missed) || 0), 0),
        };
    };
    // ── WHOSE LINE IS THIS ───────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THIS FILTERED ON `who === "you"` AND THE RING HAS NEVER WRITTEN THAT. It writes "me" and "foe"; only
    // one line in this file ("call") ever says "you". So myRows was ALWAYS EMPTY and theirRows caught every
    // line on both sides — every bout resolved by the ring stored `dealt` as zeros and `taken` as the sum of
    // BOTH fighters.
    //
    // Caught by looking up a real bout: a win where the telemetry said 0 dealt and 3460 taken, with hpLeft at
    // full and the foe on zero — you cannot kill somebody dealing nothing. Confirmed against a bout whose real
    // figures were on the defeat card: dealt 1,985 and taken 4,365, stored as taken = 6350, which is exactly
    // their sum.
    //
    // It matters more than one screen: scripts/arena-report.mjs reads this, and that report is what the tuning
    // is supposed to be measured against.
    //
    // Keyed on THEM, not on you. "foe" is the only value with one meaning — the player's side is "me" from the
    // ring and "you" from the call line, and a future third spelling of the player would silently empty this
    // again the same way.
    const isTheirs = (l) => l.who === "foe" || l.who === "them";
    const myRows = log.filter((l) => !isTheirs(l));
    const theirRows = log.filter(isTheirs);
    const stat = (f) => (f ? {
        damage: Math.round(f.damage || 0),
        health: Math.round(f.health || 0),
        critChance: Math.round((f.critChance || 0) * 100),
        critMult: Number((f.critMult || 0).toFixed(2)),
        // One name for mitigation now, on both sides — see the DAMAGE REDUCTION note in kitFor.
        dr: Math.round((f.dr || 0) * 100),
        gearPower: Math.round(f.gearPower || 0),
        element: f.element || null,
    } : null);
    const rounds = b?.beat || log.length || 0;
    const answers = (rows) => rows.filter((l) => l.thorns || l.counter);
    const mine = shape(myRows, sum(myRows, (l) => l.damage), sum(myRows, (l) => l.turned),
        sum(myRows, (l) => l.soaked), sum(answers(myRows), (l) => l.dmg || l.damage));
    const theirs = shape(theirRows, sum(theirRows, (l) => l.damage), sum(theirRows, (l) => l.turned),
        sum(theirRows, (l) => l.soaked), sum(answers(theirRows), (l) => l.dmg || l.damage));
    return {
        v: 1,
        won: Boolean(won),
        rounds,
        // WHICH ROOM. A five-round loss to a member and a five-round loss to a rung are different problems.
        kind: boutKindOf(b),
        rung: boutRungOf(b) || null,
        npcTier: b?.npcTier || null,
        me: stat(b?.me),
        foe: stat(b?.foe),
        // The two multipliers that decide a matchup before anybody swings.
        clash: b?.clash?.mult ?? null,
        clashNote: b?.clash?.note || null,
        underdog: b?.underdog ?? null,
        dealt: mine,
        taken: theirs,
        // The two numbers a balance question almost always reduces to.
        perRoundDealt: rounds ? Math.round(mine.dealt / rounds) : 0,
        perRoundTaken: rounds ? Math.round(theirs.dealt / rounds) : 0,
        hpLeft: Math.max(0, Math.round(b?.hp || 0)),
        foeHpLeft: Math.max(0, Math.round(b?.foeHp || 0)),
    };
}

// ── FIRST UP THE ROAD ────────────────────────────────────────────────────────────────────────────────────────
// The Road is a hundred rungs and the whole Den is stacked on the low twenties, so every rung above that is
// unbroken ground. Being the first person ever to take one should be a thing the Den finds out about — that is
// the entire reward for pushing into a stretch nobody has cleared, and until now it happened in silence.
//
// FIRST IS MEASURED OFF ladder_beaten, which is the only honest source: the winner's rung was appended moments
// ago inside the same guarded UPDATE, so exactly one row holding it means nobody had it before. That also makes
// the claim unrepeatable — the second person to reach it finds two rows and says nothing.
//
// Global chat rather than a push. There are a hundred rungs, and a notification per rung would be the same
// mistake the game already made by ringing the owner's phone for every raid.
//
// POSTED BY THE ARBITER, not by the member. The first cut posted as the winner, which put their own avatar and
// bubble around a third-person sentence about themselves — it read as a boast they had typed. If a human did
// not write it, a human's name does not go on it. See system-chat.js.
async function announceRoadFirst(buyerId, rung, foeName) {
    const held = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_arena WHERE $1::int = ANY(ladder_beaten)`, [rung]
    ).catch(() => null);
    if ((Number(held?.n) || 0) !== 1) return null;   // somebody stood here before
    const me = await db.queryOne(
        `SELECT COALESCE(NULLIF(display_name,''), alias) AS name FROM mkt_buyer WHERE id = $1`, [buyerId]
    ).catch(() => null);
    if (!me?.name) return null;
    const house = LADDER_HOUSES.find((h) => rung >= h.from && rung <= h.to) || null;
    const opensHouse = Boolean(house && rung === house.from);
    // Opening a HOUSE is the bigger moment of the two, so it gets the bigger line — otherwise rung 31 and rung
    // 37 read identically and arriving somewhere new is worth no more than walking another step.
    const body = opensHouse
        ? `${me.name} is the first in the Den to break into ${house.name} — rung ${rung} of the Long Road, and ${foeName || "its keeper"} is down. ${house.blurb}`
        : `${me.name} is the first in the Den to take rung ${rung} of the Long Road${foeName ? `, past ${foeName}` : ""}. Nobody has stood further.`;
    const { postSystemChat } = await import("@/lib/marketplace/system-chat.js");
    // "milestone" — an automated post. Members who mute these keep the Arbiter's written posts.
    await postSystemChat(body, "milestone").catch(() => {});
    // ── A PUSH, BUT ONLY WHEN A HOUSE OPENS ──────────────────────────────────────────────────────────────
    // A hundred rungs means a hundred notifications if every first is pushed, which is the mistake this game
    // already made once by ringing the owner's phone for every raid. A HOUSE opening is one of ten events in
    // the ladder's whole life — rare enough that it is genuinely news, and it is the moment that says a
    // stretch nobody had touched is now open.
    if (opensHouse) {
        const { broadcastToEveryone } = await import("@/lib/push/broadcast.js");
        await broadcastToEveryone({
            kind: "announce",
            title: `${house.name} has been broken open`,
            body: `${me.name} is the first in the Den past rung ${rung} of the Long Road. ${house.blurb}`,
            url: "/marketplace/arena", tag: "road-first", data: { type: "road_first", rung },
        }).catch(() => {});
    }
    return { rung, house: house?.name || null, opensHouse };
}

async function finishBout(buyerId, row, b, won) {
    b.over = true; b.won = won;

    // ── A RAID BOUT IS PAID BY THE RAID ──────────────────────────────────────────────────────────────────
    // Everything below this point is the Arena's economy — VP, laurels, the ladder, the streak, the feats —
    // and none of it belongs to a goblin in the plaza. A town fight hands its result to duelRaidEnemy, which
    // has always owned the spoils, the shared roster, the wave, the chieftain and the raid-won celebration,
    // and returns here with nothing else touched. Recorded on the bout first so a reload cannot re-pay it.
    // ── AND A THING OFF THE LINE IS PAID BY FISHING ──────────────────────────────────────────────────────
    // Exactly the arrangement the raid has below: the Arena ran the fight, the feature that started it owns
    // the spoils, and the Arena's own economy is left alone. Recorded on the bout first so a reload cannot
    // re-pay it — the same guard, for the same reason.
    if (b.fishing && !b.fishingPaid) {
        b.fishingPaid = true;
        await saveBout(buyerId, b).catch(() => {});
        const { payFishingMonster } = await import("@/lib/marketplace/fishing.js");
        const reward = await payFishingMonster(buyerId, b.fishing.monster, won).catch(() => null);
        b.recap = {
            won, foe: b.foe, fishing: true,
            haul: reward,
            rounds: b.beat || (b.log || []).length,
        };
        // The SAME return shape the raid branch below uses — the whole arena state, not the bout. finishBout's
        // caller hands this straight to the fight renderer, which draws your own fighter off `me`; returning
        // the bare bout would have mounted a fight screen with nobody in it.
        await db.query(`UPDATE mkt_arena SET bout_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, JSON.stringify(b)]).catch(() => {});
        return { ok: true, ...(await getArenaState(buyerId)) };
    }

    if (b.town && !b.townPaid) {
        b.townPaid = true;
        await saveBout(buyerId, b).catch(() => {});
        const { duelRaidEnemy } = await import("@/lib/marketplace/town-events.js");
        const res = await duelRaidEnemy(buyerId, b.town.eventId, b.town.enemyId, null, {
            decided: { win: won, foeHpPct: b.foeMaxHp ? Math.round((b.foeHp / b.foeMaxHp) * 100) : 100 },
        }).catch(() => null);
        b.recap = {
            won, foe: b.foe, town: true,
            // `loot` reads off res.reward, which is where duelRaidEnemy puts it — `res.loot` does not exist and
            // this asked for it, so the recap has been carrying an undefined the screen could never show.
            // `capped` and the grade come along too: "the spoils are done" is the difference between a raid
            // that paid nothing because you were unlucky and one that paid nothing because you are capped, and
            // a player who cannot tell those apart reports the second as a bug. It was reported as one.
            raid: res && res.ok ? {
                reward: res.reward || null, loot: res.reward?.loot || [],
                cleared: res.cleared || null, wave: res.wave ?? null,
                capped: Boolean(res.capped), gradeLabel: res.gradeLabel || null,
                // ── THE COUNT THE PLAZA IS WAITING FOR ───────────────────────────────────────────────
                // duelRaidEnemy has always returned `wins` — this member's running total of foes felled
                // in this raid, straight off mkt_town_event_hit — and it stopped here, because the recap
                // was written when the town still counted its own kills client-side. It does not any
                // more: the tap that used to resolve a kill now opens a bout, so the plaza's counter was
                // never incremented again and every raid ended on "0 foes bested" no matter what you did.
                // Eric felled about twenty and was told zero.
                wins: Number.isFinite(Number(res.wins)) ? Number(res.wins) : null,
            } : null,
            rounds: b.beat || (b.log || []).length,
        };
        await db.query(`UPDATE mkt_arena SET bout_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, JSON.stringify(b)]).catch(() => {});
        return { ok: true, ...(await getArenaState(buyerId)) };
    }


    // ── WHAT THE BOUT PAID ───────────────────────────────────────────────────────────────────────────────
    // No position swap. Standing is an accrued TOTAL now, so winning adds and losing subtracts nothing —
    // which is the whole reason you may challenge anyone, above you, below you, or out of the Gauntlet.
    //
    // The swap this replaces was the most fragile code in the feature: `position` carries a unique index, so
    // it had to park the challenger on the NEGATIVE of their own rung mid-flight to avoid violating it, and
    // the first cut of that wrapped both writes in .catch(() => {}) and failed in total silence — you won,
    // the recap said 12 → 11, and the ladder never moved. Ordering by an integer needs none of it.
    const myPower = b.myPower || 1;
    const theirPower = b.theirPower || 1;
    const baseVp = vpFor({ won, myPower, theirPower });
    // WHICH KIND OF FIGHT THIS WAS. A road rung is unlimited, a Gauntlet tier costs one of the daily ten, and
    // a member costs one of the ten AND needs somebody else to be there — so they cannot all pay the same.
    // boutKindOf is the existing classifier the telemetry and the bout row already use; a second one here
    // would be a second answer to the same question, and they would disagree the first time either moved.
    const kind = boutKindOf(b);
    const axp = arenaXpFor({ won, myPower, theirPower, kind, rung: boutRungOf(b) });
    // ── AND A DEFEAT IN A MEMBER FIGHT PAYS FOR HOW IT WENT ──────────────────────────────────────────────
    // `kind` is threaded in for both halves now. It buys two things laurels never had: the PvP premium a
    // member bout has always been worth (XP has paid it for months), and a losing payout scaled by the share
    // of their health you actually took off. See the long note in arena-rewards.js for why paying a loss is
    // safe HERE and would not be on the Road — twelve fights a day is the ration that stops it being a farm.
    const baseLaurels = won
        ? boutLaurels({ won, myPower, theirPower, kind })
        : Math.round(lossLaurels({ myPower, theirPower, kind }) * lossEffort(b));
    const { feats, laurels: featLaurels, vp: featVp } = featsFor(b);
    // ── VICTORY POINTS COME OUT OF THE OTHER FIGHTER ─────────────────────────────────────────────────────
    // Luke: "you can only get them from opponents who have them." So a Gauntlet tier and a Road rung move
    // nothing at all — they have no points to lose, and minting points for beating a dummy is what made the
    // board a record of attendance. Between two members it is Elo, and it is zero-sum: whatever is added here
    // is taken from them below, capped at what they actually hold so nobody is driven below zero.
    //
    // Feats still pay on top of a win. They are a flourish rather than a rating, and taking a feat bonus off
    // the loser would mean a member losing points because somebody else fought well.
    // ⚠️ THE RUNG IS READ OFF THE BOUT HERE, NOT BORROWED FROM BELOW. `roadRung` is declared forty lines
    // further down with `const`, so referencing it from here is a temporal dead zone ReferenceError — which
    // threw on EVERY settle and left members stuck mid-fight on an internal server error. ValkyrieSylve: "it
    // wont let me land the final blow... I am trapped." Same shape as the isMemberFoe slip in the first draft
    // of this block, and the reason both happened is reaching forward in a 200-line function.
    const rungOfBout = Number(b.ladder?.rung) || (b.foe?.ladder ? Number(b.foe.rung) || 0 : 0);
    const isMemberBout = Number(b.npcTier) === 0 && !rungOfBout
        && boutKindOf(b) === "member" && UUID_RE.test(String(b.foe?.id || ""));
    const theirVp = isMemberBout
        ? Number((await db.queryOne(`SELECT vp FROM mkt_arena WHERE buyer_id = $1`, [b.foe.id]).catch(() => null))?.vp) || 0
        : 0;
    const myVp = Number(row?.vp) || 0;
    const stake = isMemberBout ? vpTransfer({ myVp, theirVp, won }) : 0;
    // Never take more than the loser has. That keeps it exactly zero-sum and keeps the floor at zero.
    const moved = isMemberBout ? Math.min(stake, won ? theirVp : myVp) : 0;
    // Feats pay their VP bonus only in a MEMBER bout. Luke: "we shouldn't award victory points for pve."
    // Leaving them on a Gauntlet or Road win would have kept a small mint open on the exact axis this
    // change closed — you could still farm rating off things that have none to give.
    const vp = isMemberBout ? ((won ? moved : -moved) + (won ? featVp : 0)) : 0;
    // RENOWN. The track says "every bout pays more laurels" and nothing read it — fifteen levels of a gold
    // sink that changed no number anywhere. Applied to the feats as well as the base, because a feat is a
    // bout's payout too and splitting them would be a rule nobody could guess from the card.
    const renown = 1 + (Number(upgradeEffects(row?.upgrades || {}).laurels) || 0);
    const laurels = Math.round((baseLaurels + featLaurels) * renown);

    // Gold and XP still pay on a win — this sits on top rather than replacing them.
    //
    // ── PVP PAYS A FLAT RANDOM PURSE, NOT A SLICE OF THE OTHER PLAYER ────────────────────────────────────
    // Paying off the opponent's rating is what actually broke the economy, and neither the square root nor the
    // coefficient cut reached it. Rating is damage x health — a PRODUCT — so it grows with the SQUARE of gear,
    // and taking a square root of a square just hands the growth straight back. Beating the best-geared member
    // in the Den paid 3,114 gold a fight, and the same fight after both cuts still paid over a thousand.
    //
    // Measured across every arena win before this: fights against members rated 15k+ were 405 wins and 574,543
    // gold — 82% of everything the Arena ever minted. The Long Road, which was the prime suspect, was 213 wins
    // and 27,825 gold, about 4%, and its rungs cannot even be refought.
    //
    // The tell was one member's day: six wins, six identical payouts of 3,114, the same opponent each time. The
    // ladder was not paying for a good fight, it was paying for the existence of somebody well geared and then
    // paying again every time you beat them.
    //
    // So a PvP purse is FLAT and rolled, with no input from either fighter's gear. Rank still comes from VP,
    // which does scale with how much harder they were — that is the right place for "who you beat" to matter,
    // because VP cannot be spent. The Road and the Gauntlet keep the curve: both are bounded (a rung pays once,
    // a tier is capped by the daily allowance) and neither compounds with gear.
    // Which rung this was, if it was one. Read off the RIDER first — `b.foe` is an allowlist that has dropped
    // `ladder` before now, and that is how every rung ever beaten once paid nothing at all.
    const roadRung = Number(b.ladder?.rung) || (b.foe?.ladder ? Number(b.foe.rung) || 0 : 0);
    const isPvp = Number(b.npcTier) === 0 && !roadRung;
    let reward = null;
    if (won) {
        // ── THE ROAD IS OUT OF THE MINT ──────────────────────────────────────────────────────────────────
        // Luke: "the road will no longer reward each rungs completion with so many laurels and gold."
        //
        // Zero, not reduced. A rung can be beaten exactly once, so Road gold was never a wage — but it was
        // still 27,825 coins of mint that had to be accounted for in a ledger where every other line can be
        // repeated, and it made the Road something to be balanced against farming rather than something to be
        // balanced against itself. The season's eight prizes are the payout now, and they are worth exactly
        // what the climb is hard, which is a thing no amount of gold could be tuned to.
        //
        // XP is deliberately untouched. Member XP is not currency (it buys levels, and a level is a gate
        // rather than a purchase) and class XP is the progression the Road exists to drive.
        const gold = roadRung ? 0 : mint(isPvp ? PVP_GOLD_MIN + Math.floor(Math.random() * (PVP_GOLD_MAX - PVP_GOLD_MIN + 1)) : arenaWinGold(theirPower), "arena_win");
        const xp = isPvp ? PVP_XP_MIN + Math.floor(Math.random() * (PVP_XP_MAX - PVP_XP_MIN + 1)) : arenaWinXp(theirPower);
        reward = { gold, xp, vp, laurels, feats, arenaXp: axp };
        // Guarded, so a Road win does not write a zero to the balance and a zero to the coin ledger. A ledger
        // full of no-op lines is a ledger nobody can read a mint rate off — see the coin telemetry.
        if (gold > 0) {
            const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
            await logCoin(buyerId, gold, "arena_win", { balanceAfter: g?.gold, meta: { foe: b.foe.id, vp } }).catch(() => {});
        }
        // gold: 0 is load-bearing — awardXp pays gold 1:1 with points otherwise, and the line above IS the gold.
        await awardXp(buyerId, "arena_win", { points: xp, gold: 0 }).catch(() => {});
    } else {
        reward = { gold: 0, xp: 0, vp: 0, laurels, feats: [], arenaXp: axp };
    }
    b.reward = reward;

    const vpBefore = Number(row?.vp) || 0;
    const vpAfter = vpBefore + vp;
    const streakNow = won ? (Number(row?.streak) || 0) + 1 : 0;

    // A Gauntlet win moves the high-water mark, which is what unlocks the next tiers.
    const npcTier = Number(b.npcTier) || 0;
    const npcBest = won && npcTier > 0 ? Math.max(Number(row?.npc_best) || 0, npcTier) : (Number(row?.npc_best) || 0);

    await db.query(
        `UPDATE mkt_arena SET bout_json = $2::jsonb,
            wins = wins + $3, losses = losses + $4,
            vp = GREATEST(0, vp + $5), best_vp = GREATEST(best_vp, vp + $5),
            laurels = laurels + $6, laurels_earned = laurels_earned + $6,
            npc_best = GREATEST(npc_best, $7),
            arena_xp = arena_xp + $8,
            streak = CASE WHEN $3 = 1 THEN streak + 1 ELSE 0 END,
            best_streak = GREATEST(best_streak, CASE WHEN $3 = 1 THEN streak + 1 ELSE 0 END),
            updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(b), won ? 1 : 0, won ? 0 : 1, vp, laurels, npcBest, axp]
    ).catch((e) => {
        // Never silent. This write losing is how a won fight comes back as an unfinished one.
        console.error("arena.finish.persist_failed", buyerId, e?.message || e);
    });

    // Your VP after the fight, read BACK rather than assumed — the recap is the only thing telling somebody
    // what changed, so it has to report what actually happened. The two counting sub-selects that went with
    // it worked out your RUNG, which no longer exists.
    // ── THE LONG ROAD ── a rung goes down ONCE, and the prize is paid the same time it is recorded. The
    // array write is guarded by the ANY() check rather than read-then-write: two taps that both resolve a
    // winning bout must not pay twice.
    //
    // READ OFF THE RIDER, not off the foe. `b.foe.ladder` was the only gate here and the foe object is an
    // allowlist that never carried it (buildBout), so this branch has never once run: every rung ever beaten
    // paid nothing and stayed standing. The rider is the primary source now; `b.foe` is the fallback so a
    // bout already open when this deploys still pays out instead of being the last fight to lose its prize.
    let ladderPrize = null;
    // Set when this win was a WORLD first — nobody in the Den had ever taken this rung. The recap reads it.
    let roadFirst = null;
    const wonRung = roadRung;
    if (won && wonRung > 0) {
        const marked = await db.queryOne(
            `UPDATE mkt_arena
                SET ladder_beaten = array_append(ladder_beaten, $2::int)
              WHERE buyer_id = $1 AND NOT ($2::int = ANY(ladder_beaten))
              RETURNING $2::int AS rung`,
            [buyerId, wonRung]
        ).catch(() => null);
        if (marked) {
            // Recomputed from the rung rather than read off the bout: `reward` is another field the allowlist
            // drops, so `b.foe.reward` was `{}` — meaning even if the gate above had passed, the prize was an
            // empty object and the payout would have been zero laurels and no chest.
            const season = currentSeason();
            const prize = ladderReward(wonRung, season);
            if (prize.laurels > 0) {
                await db.query(`UPDATE mkt_arena SET laurels = laurels + $2, laurels_earned = laurels_earned + $2 WHERE buyer_id = $1`,
                    [buyerId, prize.laurels]).catch(() => {});
            }
            // ── AND THE HIGH-WATER MARK, WHICH THE SEASON RESET MUST NEVER TAKE BACK ─────────────────────
            // Written on the win rather than worked out at rollover time, so it is right even for a member
            // who never opens the Road again — the archive reads it, the trophy room reads it, and neither
            // has to reconstruct a set that has since been cleared.
            await db.query(`UPDATE mkt_arena SET road_best_rung = GREATEST(road_best_rung, $2) WHERE buyer_id = $1`,
                [buyerId, wonRung]).catch(() => {});
            // ── ONE OF THE EIGHT ────────────────────────────────────────────────────────────────────────
            // Claimed and handed over inside grantRoadPrize, which is the only place either happens. It
            // returns null when there is no prize on this rung OR when this member already has it, so the
            // recap only ever announces something that actually moved.
            if (prize.prize) {
                const { grantRoadPrize } = await import("@/lib/marketplace/road-prizes.js");
                const paid = await grantRoadPrize(buyerId, wonRung, season).catch(() => null);
                if (paid) prize.paid = paid;
            }
            await trackActivity(buyerId, "arena_ladder", { rung: wonRung, foe: b.foe.name }).catch(() => {});
            ladderPrize = prize;
            roadFirst = await announceRoadFirst(buyerId, wonRung, b.foe?.name).catch(() => null);
        }
    }

    const after = await db.queryOne(`SELECT vp FROM mkt_arena WHERE buyer_id = $1`, [buyerId]).catch(() => null);

    b.recap = {
        won, foe: b.foe, reward, feats,
        vpGain: vp, vpFrom: vpBefore, vpTo: Number(after?.vp) ?? vpAfter,
        npcTier: npcTier || null,
        ladder: wonRung ? { rung: wonRung, prize: ladderPrize } : null,
        // THE PERSON WHO DID IT GETS TOLD. The first cut announced a world-first to global chat and to nobody
        // else — so the one member who had actually earned it saw the same nothing everyone standing outside
        // the plaza saw. Luke, having taken rung 22: "where's the big announcement?" It was in chat. He was
        // in the Arena.
        roadFirst,
        npcUnlocked: won && npcTier > 0 && npcTier > (Number(row?.npc_best) || 0),
        streak: streakNow, bestStreak: Math.max(Number(row?.best_streak) || 0, streakNow),
        rounds: b.beat || (b.log || []).length,
    };

    // Recorded from BOTH sides. A defender was asleep; this is the only way they ever find out. An NPC has no

    // ── THE DEFENDER'S CUT ───────────────────────────────────────────────────────────────────────────────
    // Paid HERE, at the moment the bout resolves, rather than when the away report is read. Paying on read
    // would mean the report has to know what it has already paid for, and the first bug in that design is
    // somebody refreshing the page.
    //
    // Conditional inside the UPDATE and capped in the same statement — neon() has no transactions, so two
    // challengers finishing at once must not both see room under the cap and both take it.
    // ── THE OTHER HALF OF THE TRANSFER ───────────────────────────────────────────────────────────────────
    // Points moved off this member have to land on the other one, or the board inflates and the rating means
    // nothing. Applied whichever way the bout went — Luke: "when I'm not online and people are fighting me, if
    // I beat nine out of ten of them I would expect to have grown my victory points. And if I lost nine out of
    // ten, I would expect to have less."
    //
    // best_vp is left alone on the way down, so the highest a member has ever stood is never taken back.
    if (isMemberBout && moved > 0 && b.foe?.id) {
        await db.query(
            `UPDATE mkt_arena
                SET vp = GREATEST(0, vp + $2), best_vp = GREATEST(best_vp, vp + $2), updated_at = NOW()
              WHERE buyer_id = $1`,
            [b.foe.id, won ? -moved : moved],
        ).catch((e) => console.error("arena.vp.transfer_failed", b.foe.id, e?.message || e));
    }

    let defencePaid = 0;
    if (npcTier === 0 && !won && b.foe?.id) {
        const cut = defenceLaurels({ myPower: theirPower, theirPower: myPower });
        const paid = await db.queryOne(
            `UPDATE mkt_arena
                SET laurels = laurels + LEAST($2::int, GREATEST(0, $3::int - CASE WHEN defence_day = ${DAY} THEN defence_laurels_today ELSE 0 END)),
                    defence_laurels_today = LEAST($3::int, CASE WHEN defence_day = ${DAY} THEN defence_laurels_today ELSE 0 END + $2::int),
                    defence_day = ${DAY}
              WHERE buyer_id = $1
              RETURNING defence_laurels_today`,
            [b.foe.id, cut, DEFENCE_LAURELS_PER_DAY]
        ).catch(() => null);
        if (paid) defencePaid = cut;
    }

    // buyer row, so defender_id is null for a Gauntlet bout and the tier is recorded instead.
    // ── THE ONE ROW THAT SAYS THIS FIGHT HAPPENED ────────────────────────────────────────────────────────
    // `defender_id` is uuid REFERENCES mkt_buyer(id). This used to pass `b.foe.id` for anything that was not a
    // Gauntlet tier — but a Long Road foe's id is `ladder:12` and a town skirmish foe's is `town:<enemy>`.
    // Postgres raised 22P02 on the cast, and the `.catch(() => {})` below threw the whole row away. No row, no
    // error, no sign: every Road rung and every plaza skirmish ever fought went unrecorded, which is why the
    // balance pass that closed the Road had nothing to measure.
    //
    // So the id is only passed when the foe IS a member, and the shape is TESTED rather than assumed — it was
    // an assumption that lost the data the first time.
    const boutKind = boutKindOf(b);
    const isMemberFoe = boutKind === "member" && UUID_RE.test(String(b.foe?.id || ""));
    await db.query(
        `INSERT INTO mkt_arena_bout (challenger_id, defender_id, npc_tier, challenger_won, rounds, vp, laurels, feats, defender_laurels, telemetry, kind, rung)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12)`,
        [buyerId, isMemberFoe ? b.foe.id : null, npcTier || null, won, (b.log || []).length, vp, laurels,
            JSON.stringify(feats.map((f) => f.id)), defencePaid, JSON.stringify(boutTelemetry(b, won)),
            boutKind, boutRungOf(b) || null]
        // NOT swallowed. A telemetry write that fails silently is worse than no telemetry, because the empty
        // table reads as "this never happens" instead of "this is broken".
    ).catch((e) => console.error("arena.bout.telemetry_failed", buyerId, boutKind, e?.message || e));

    await trackActivity(buyerId, won ? "arena_win" : "arena_loss",
        { foe: b.foe.id, vp, laurels, npcTier: npcTier || null, feats: feats.map((f) => f.id) }).catch(() => {});

    // getArenaState RE-READS the bout out of the database, so if that write above lost for any reason it would
    // hand back the un-finished bout and quietly erase a fight the player had already won — a modal flashing
    // up and then a screen with no way off it. The bout we just resolved is the truth; say so explicitly.
    const state = await getArenaState(buyerId);
    return { ok: true, finished: { won, reward, feats }, ...state, bout: publicBout(b) };
}

/** Clear a finished bout so the arena screen comes back. */
/**
 * ── THE DOOR ─────────────────────────────────────────────────────────────────────────────────────────────────
 * Walk out of a fight that is still running, and take the loss for it.
 *
 * There was no way out. `dismiss` clears a bout, but the button that calls it only renders once the bout is
 * OVER — so a fight that would not end was a fight you could not leave, and because one open bout blocks the
 * next one, it took the whole Arena and the plaza raid with it. Members sat in the same bout for a day:
 * "I can't even help with the raid because of being stuck in that above mentioned battle", "it won't let me
 * leave the fight/surrender."
 *
 * Two rules now guarantee an end: the alternating brace rule and the pit. The six-a-bout brace budget and the
 * fifty-beat call were both removed on Luke's call, which makes THIS the only guaranteed way out of a fight
 * that will not finish — so it matters more than it did, not less.
 *
 * IT IS A LOSS, resolved through the same finishBout every other ending uses. Not a free exit: bailing out of
 * a bad matchup at no cost is a re-roll, and a re-roll makes the Road a slot machine. A raid foe goes back on
 * the shared roster the same way it does when you are killed, because duelRaidEnemy is what books that and it
 * is booked from finishBout.
 */
// ── PAY IT, OR PUT IT DOWN AND WAIT ──────────────────────────────────────────────────────────────────────────
// Every door into the ring ends here. A passive bout arrives already decided and is paid immediately, which is
// exactly what the three start paths used to do inline. An interactive one arrives with a member owing it a
// tap, so it is saved and the state handed back for them to answer.
//
// One function rather than the same `if` written three times, because the three doors have already diverged
// once — the Road stopped bumping the daily counter and the town grew an edge multiplier — and the payout is
// the half that must never diverge.
// ── A BEAT COSTS ONE WRITE, NOT THE WHOLE SCREEN ─────────────────────────────────────────────────────────────
// Luke: "it isn't the speed of animations, it feels like it's waiting for an api call." It was. MEASURED: a
// single tap of Attack took 4.4 SECONDS and ran 123 database queries.
//
// This line did it — `getArenaState` after every beat. That function builds the entire Arena screen: the
// challenge board, and for EVERY opponent on it their equipment, badges, enhancements and sockets; the
// ladder; the purser; the armoury. Neon's HTTP driver makes every one of those a separate round trip at
// ~35ms, so a tap paid for a full screen rebuild before it was allowed to animate.
//
// A BEAT CHANGES THE BOUT AND NOTHING ELSE. Your gear cannot change mid-fight, the board cannot reorder
// under you, and the Road is not walking anywhere. So a beat returns the bout, and the client merges it
// into the state it already has rather than replacing it — see `partial` in ArenaClient.
//
// The last beat is different and still pays full price: finishBout has to settle rewards, the ladder, the
// streak and the standings, and the screen behind the recap has genuinely changed.
async function settle(buyerId, b, row = null) {
    if (!b.over) {
        await saveBout(buyerId, b);
        return { ok: true, unlocked: true, partial: true, bout: publicBout(b) };
    }
    return finishBout(buyerId, row || await arenaRow(buyerId), b, b.won);
}

// A bout that has a ring is one somebody is playing. Anything older — a transcript from before this shipped,
// or a bout built while the flag was off — has no ring and cannot take a beat; it is already finished and the
// screen is only playing it back.
export const playable = (b) => Boolean(b && !b.over && b.ring);

/**
 * YOUR BEAT. The only thing a member is ever asked for — see the timing tombstone in arena-kit.js.
 *
 * `skillId` names a skill off the member's own deck. Re-resolved from the SAVED bout rather than from the
 * request: the deck was written into bout_json when the fight opened, so a member cannot buy a capstone
 * mid-bout and swing with it, and cannot name a skill they have never owned.
 */
export async function actBout(buyerId, { skillId = null } = {}) {
    const row = await arenaRow(buyerId);
    const b = row?.bout_json;
    if (!playable(b)) return { ok: false, error: "no_bout", ...(await getArenaState(buyerId)) };
    // ── A REFUSAL MID-FIGHT IS ALSO JUST THE BOUT ────────────────────────────────────────────────────────
    // These three can only happen while a bout is running, and none of them changes anything behind it —
    // so they take the same light path a beat does. Rebuilding the whole Arena to say "that skill is still
    // cooling" cost 4.2 seconds and 120 queries, same as a beat did.
    if (b.ring.awaiting !== "act") return { ok: false, error: "not_your_beat", partial: true, bout: publicBout(b) };

    let skill = null;
    if (skillId) {
        // From the bout's own frozen bag, and only if it is actually off cooldown. Both checks are the same
        // shape as the tree's: the screen decides what to offer, the server decides what is legal.
        skill = resolveSkill(String(skillId), b.me?.skills || {});
        if (!skill) return { ok: false, error: "no_skill", partial: true, bout: publicBout(b) };
        if ((b.ring.cd?.[skill.id] || 0) > 0) return { ok: false, error: "cooling", partial: true, bout: publicBout(b) };
    }

    act(b.ring, { skill });
    syncRing(b);
    return settle(buyerId, b, row);
}

export async function forfeitBout(buyerId) {
    const row = await arenaRow(buyerId);
    const b = row?.bout_json;
    if (!b || b.over) return { ok: false, error: "no_bout", ...(await getArenaState(buyerId)) };
    b.forfeit = true;
    b.log = b.log || [];
    b.log.push({ beat: b.beat, who: "you", grade: "call", damage: 0,
        text: `You step out of the ring. ${b.foe?.name || "Your opponent"} is left standing.` });
    return finishBout(buyerId, row, b, false);
}

export async function clearBout(buyerId) {
    await saveBout(buyerId, null);
    return { ok: true, ...(await getArenaState(buyerId)) };
}
