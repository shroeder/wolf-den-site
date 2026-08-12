import "server-only";

import { db } from "@/lib/db";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { rollWindfall } from "@/lib/marketplace/windfall.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import {
    buildKit, elementClash, healthFrom, swingFrom, critChanceFrom, critMultFrom, underdogEdge, pitFever,
    BATTLE_ITEMS, GUARD_SOAK, GUARD_COOL, speedOf,
    DRAIN_SHARE, REND_TURNS, REND_PER_TURN, REND_MAX_STACKS, SUNDER_CUT, SUNDER_TURNS, RIPOSTE_SHARE,
    SHIELD_CAP, WARD_SOAK, SURGE_SWINGS, FREE_KINDS,
} from "@/lib/marketplace/arena-kit.js";
import { pickIncoming, itemsFor, POULTICE_HEAL } from "@/lib/marketplace/arena-ai.js";
import { npcAbilities, npcFor, npcOffer, tierForRating, NPC_REACH, statsForPower } from "@/lib/marketplace/arena-npc.js";
import { boutLaurels, defenceLaurels, DEFENCE_LAURELS_PER_DAY, featsFor, vpFor, vpPreview } from "@/lib/marketplace/arena-rewards.js";
import { CRATES, armouryEv, rollable, rowArt } from "@/lib/marketplace/armoury.js";
import { LADDER, LADDER_HOUSES, LADDER_SIZE, ladderFoe, ladderReward, ladderRungOf, nextRung } from "@/lib/marketplace/arena-ladder.js";
import { getStones } from "@/lib/marketplace/pet-ascension.js";
import { STONES, STONE_PRICE_LAURELS } from "@/lib/marketplace/pet-stones.js";
import {
    arenaLevelFor, arenaXpFor, CLASSES, classById, FREE_REFUNDS_PER_DAY, RESPEC_CLASS, RESPEC_ONE, RESPEC_TREE,
    pointsSpent, treeAbilities, treeEffects, treeState,
} from "@/lib/marketplace/arena-classes.js";
import { upgradeEffects, upgradeView } from "@/lib/marketplace/arena-upgrades.js";

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
export const arenaHealth = (ferocity = 0) => healthFrom(ferocity);

/**
 * A fighter's ring card, straight off the four stats they carry. ONE function for BOTH kinds of fighter: a
 * Gauntlet opponent is a stat block in exactly the shape a member's gear produces, so nothing downstream has
 * to know whether it is holding a person or a Warlord.
 */
export function ringStats(stats = {}) {
    return {
        health: healthFrom(Number(stats.ferocity) || 0),
        damage: swingFrom(Number(stats.might) || 0),
        critChance: critChanceFrom(Number(stats.crit_chance) || 0),
        critMult: critMultFrom(Number(stats.crit_power) || 0),
        // A member carries no armour — theirs is the guard they choose to play. An absent fighter carries a
        // stated one instead, which is what they have in place of a decision.
        armour: Math.min(0.6, Number(stats.armour) || 0),
        might: Number(stats.might) || 0,
    };
}

// A kit's RATING, used for matchmaking and for the ladder. Damage a round times how many rounds you last, which
// is the only honest one-number summary of a fight — and it is computable by the player from the two cards.
export function arenaRating({ damage = 0, critChance = 0, critMult = 2.5, armour = 0, health = 200 }) {
    const perSwing = damage * (1 + critChance * (critMult - 1));
    return Math.round(perSwing * (health / Math.max(0.1, 1 - armour)) / 10);
}

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
    const { getEquippedStatsForMembers } = await import("@/lib/marketplace/inventory.js");
    const rows = await db.query(
        `SELECT id, alias, display_name, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip
           FROM mkt_buyer WHERE COALESCE(xp,0) > 0 AND id <> $1`, [buyerId]
    ).catch(() => []);
    if (!rows.length) return [];
    const stats = await getEquippedStatsForMembers(rows.map((r) => r.id)).catch(() => new Map());
    return rows
        .map((r) => {
            const level = levelForXp(Number(r.xp) || 0).level;
            const s = stats.get(r.id) || {};
            const gearPower = Object.values(s).reduce((n, v) => n + (Number(v) || 0), 0);
            return {
                id: r.id,
                name: r.display_name || r.alias || "A member",
                sprite: r.avatar_sprite_url || null,
                flip: Boolean(r.avatar_sprite_flip),
                level, gearPower,
                ...ringStats(s),
                power: arenaRating(ringStats(s)),
            };
        })
        .sort((a, b) => a.power - b.power);
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
    const stats = await getEquippedStats(buyerId).catch(() => ({}));
    const gearPower = Object.values(stats).reduce((n, v) => n + (Number(v) || 0), 0);
    return {
        level, gearPower, ...ringStats(stats), power: arenaRating(ringStats(stats)),
        sprite: me?.avatar_sprite_url || null,
        name: me?.display_name || me?.alias || "You",
    };
}

// Everything a loadout brings to the ring: stats, affinity, abilities, and how hard their ring is to face.
async function kitFor(buyerId) {
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
    const stats = await getEquippedStats(buyerId).catch(() => ({}));
    const gearPower = Object.values(stats || {}).reduce((n, v) => n + (Number(v) || 0), 0);
    const overrides = await getElementOverrides(buyerId, ids).catch(() => ({}));
    const flat = {};
    for (const [id, arr] of Object.entries(overrides || {})) flat[id] = Array.isArray(arr) ? arr[0] : arr;
    // buildKit is still what decides your AFFINITY — that is a Forge decision and stays one. Its abilities
    // are ignored: what you can DO in the ring is your class tree now, not a readout of your gear.
    const kit = buildKit(ids, sigsById(ids), flat);

    // ── THE TREE ─────────────────────────────────────────────────────────────────────────────────────────
    const prog = await db.queryOne(
        `SELECT arena_xp, arena_class, skill_tree, upgrades FROM mkt_arena WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);
    const classId = prog?.arena_class || null;
    const taken = prog?.skill_tree || {};
    const perks = mergeAdd(treeEffects(classId, taken), upgradeEffects(prog?.upgrades || {}));
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
    // `abilities` — the ones actually in play. This looped over kit.abilities, the GEAR-derived list, which
    // stopped being what the fight uses when the tree took over: every ability in the bout went without its
    // art, and the loop dutifully decorated a list nobody read.
    for (const a of abilities) a.itemSprite = a.itemId ? art[a.itemId] || null : null;
    return {
        level, gearPower,
        classId, taken, perks,
        arenaLevel: arenaLevelFor(Number(prog?.arena_xp) || 0).level,
        speed: speedOf(level, Number(stats.ferocity) || 0) + (perks.speed || 0),
        // ── FOUR NUMBERS, ALL OFF REAL STATS, ALL PRINTABLE ──────────────────────────────────────────────
        // Nothing here is derived from `gearPower` (the raw sum of every stat, which made a point of Fortune
        // as good for you as a point of Might) and nothing here is rolled. The tree and the upgrade tracks
        // land in `perks` and are added on top, so the engine reads one set of numbers and does not care
        // which system paid for them.
        health: healthFrom((Number(stats.ferocity) || 0) + (perks.ferocity || 0)) + Math.round(perks.health || 0),
        damage: swingFrom((Number(stats.might) || 0) + (perks.might || 0)),
        critChance: critChanceFrom((Number(stats.crit_chance) || 0) + (perks.critStat || 0), perks.crit || 0),
        critMult: critMultFrom((Number(stats.crit_power) || 0) + (perks.critPower || 0), perks.critMult || 0),
        // Your armour is what you CHOOSE, not what you accumulated: a guard you play, not a stat you carry.
        // The Den has no defence stat, so inventing one here would be the same mistake as health was.
        armour: Math.min(0.6, perks.armour || 0),
        might: (Number(stats.might) || 0) + (perks.might || 0),   // the raw stat, for the card
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

async function arenaRow(buyerId) {
    await db.query(`INSERT INTO mkt_arena (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    let row = await db.queryOne(
        `SELECT a.*, ${DAY}::text AS today, a.fights_day::text AS fights_day_text,
                a.free_respec_day::text AS free_respec_day_text, b.gold AS gold_now
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id WHERE a.buyer_id = $1`, [buyerId]).catch(() => null);
    return row;
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
    const { getEquippedStatsForMembers } = await import("@/lib/marketplace/inventory.js");
    const stats = await getEquippedStatsForMembers(rows.map((r) => r.buyer_id)).catch(() => new Map());
    return rows.map((r, i) => {
        const level = levelForXp(Number(r.xp) || 0).level;
        const gearPower = Object.values(stats.get(r.buyer_id) || {}).reduce((n, v) => n + (Number(v) || 0), 0);
        return {
            id: r.buyer_id,
            vp: Number(r.vp) || 0,
            name: r.display_name || r.alias || "A member",
            sprite: r.avatar_sprite_url || null,
            level, gearPower, wins: r.wins, losses: r.losses,
            ...ringStats(stats.get(r.buyer_id) || {}),
            power: arenaRating(ringStats(stats.get(r.buyer_id) || {})),
        };
    });
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

export async function getArenaState(buyerId) {
    const row = await arenaRow(buyerId);
    const [me, board, kit] = await Promise.all([arenaPower(buyerId), standings(), kitFor(buyerId)]);
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
    const targets = board
        .filter((o) => o.id !== buyerId)
        .map((o) => ({ ...o, reward: { vp: vpPreview(myPower, o.power), laurels: boutLaurels({ won: true, myPower, theirPower: o.power }) } }))
        // Hardest first: the interesting fight should be the one you see, not the safest one.
        .sort((x, y) => y.power - x.power);

    // THE GAUNTLET — endless NPC challengers, so there is always something to fight even when the Den is
    // asleep and always something harder to aspire to.
    const npcBest = Number(row?.npc_best) || 0;
    const gauntlet = npcOffer(npcBest).map((n) => ({
        ...n,
        beaten: n.tier <= npcBest,
        reward: { vp: vpPreview(myPower, n.gearPower), laurels: boutLaurels({ won: true, myPower, theirPower: n.gearPower }) },
    }));

    const myVp = Number(row?.vp) || 0;

    // ── PROGRESSION ── arena XP, the level it buys, the class, and the state of every node. treeState is the
    // SAME function the server validates a spend against, so the screen can never offer a node the server
    // would refuse.
    const lvl = arenaLevelFor(Number(row?.arena_xp) || 0);
    const classId = row?.arena_class || null;
    const taken = row?.skill_tree || {};
    const spentPts = pointsSpent(taken);
    const availPts = Math.max(0, lvl.level - spentPts);
    const progress = {
        xp: lvl.xp, level: lvl.level, into: lvl.into, span: lvl.span,
        classId,
        cls: classById(classId),
        classes: CLASSES,
        points: { total: lvl.level, spent: spentPts, available: availPts },
        // A class is chosen the first time you have a point to spend.
        needsClass: !classId && lvl.level >= 1,
        tree: classId ? treeState(classId, taken, availPts) : [],
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
            const next = nextRung(beaten);
            return {
                size: LADDER_SIZE,
                beaten: beaten.size,
                next,
                houses: LADDER_HOUSES,
                foes: LADDER.map((f) => ({
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
            return { price: RECIPE_PRICE_LAURELS, knowsAll: p.known >= p.total, ...p };
        })().catch(() => null),
        stats: {
            wins: Number(row?.wins) || 0, losses: Number(row?.losses) || 0,
            streak: Number(row?.streak) || 0, bestStreak: Number(row?.best_streak) || 0,
            bestVp: Number(row?.best_vp) || myVp,
            npcBest,
        },
        targets,
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
        board: board.slice(0, 10).map((o) => ({
            id: o.id, vp: o.vp, name: o.name, sprite: o.sprite, level: o.level,
            damage: o.damage, health: o.health, you: o.id === buyerId,
        })),
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
const staleBout = (b) => Boolean(b) && !b.over && (b.me?.damage == null || b.foe?.damage == null);

// The client never sees the opponent's next pick — only what has already happened.
function publicBout(b) {
    return {
        foe: b.foe, beat: b.beat, turn: b.turn, hp: b.hp, foeHp: b.foeHp, maxHp: b.maxHp, foeMaxHp: b.foeMaxHp,
        cd: b.cd || {}, clash: b.clash, opener: b.opener || "you", fever: pitFever(b.beat || 1),
        me: b.me, shield: b.shield, surge: b.surge, underdog: b.underdog || 1, items: b.items || {},
        // WHICH ROOM THIS FIGHT IS IN. Withheld until now, so the screen could not tell a plaza raider from a
        // ladder rung and offered "Back to the ladder" to somebody who had walked in from the town — which is
        // where they were then stranded. The rider itself stays server-side; only the fact of it is published.
        town: Boolean(b.town),
        // The new lingering states. Without these the burn ticking their bar and the stripped guard would be
        // things the server knew about and the player could only infer from the log.
        bleed: b.bleed || null, sunder: b.sunder || 0, riposte: b.riposte || 0,
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
const SHORTLIST = 7;         // how many of the closest go in the hat
const MEMBER_WEIGHT = 1.6;   // a person beats a dummy, when there is one your size

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
const GAUNTLET_SHARE = 0.3;

function matchArenaOpponent(buyerId, myPower, board, bestTier) {
    const dist = (p) => Math.abs(p / Math.max(1, myPower) - TARGET_RATIO);
    const members = [];
    const npcs = [];
    for (const o of board) {
        if (String(o.id) === String(buyerId)) continue;
        members.push({ kind: "member", id: o.id, boost: MEMBER_WEIGHT, d: dist(o.power || 0) });
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
        // ── ringStats(), AND THIS ONE LINE IS WHY THE GAUNTLET NEVER APPEARED ────────────────────────────
        // npcFor() returns a tier's RAW stat line — might, crit_chance, crit_power, ferocity — and
        // arenaRating() reads the RING stats: damage, critChance, critMult, health. Handed the raw object it
        // found none of them, took every default, and returned 0. For every tier. So every tier's distance
        // was a flat 0.95, nothing ever cleared the 0.5 fairness gate, `fairNpcs` was always empty, and the
        // Gauntlet has never once been offered by matchmaking since this function was written. Every other
        // arenaRating() call in this file wraps its argument in ringStats(); only this one did not.
        npcs.push({ kind: "npc", tier: t, boost: 1, d: dist(arenaRating(ringStats(n))) });
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
        const seats = pool.slice(0, Math.max(1, reserve));
        const weighted = seats.map((c, i) => ({ ...c, w: c.boost / (1 + i) }));
        let roll = Math.random() * weighted.reduce((sum, c) => sum + c.w, 0);
        return weighted.find((c) => (roll -= c.w) <= 0) || weighted[0];
    };
    // A tier more than half a power-step away is not a fight, it is a formality — that is what put Straw
    // Dummies in front of a geared player. If nothing is close enough the Gauntlet stands down for this roll
    // rather than being forced in, and the members take it.
    const fairNpcs = npcs.filter((n) => n.d <= 0.5);
    const npcPool = fairNpcs.length ? fairNpcs : [];
    if (!npcPool.length) return pickWithin(members, SHORTLIST);
    if (!members.length) return pickWithin(npcPool, RESERVE_NPC + 1);
    return Math.random() < GAUNTLET_SHARE
        ? pickWithin(npcPool, RESERVE_NPC + 1)
        : pickWithin(members, SHORTLIST - RESERVE_NPC);
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

function buildBout(me, foe, foeKit, { npcTier = 0, size = 0, myPower = 0, myDamageMult = 1, extra = {} } = {}) {
    const clash = elementClash(me.element, foeKit.element);
    const theirPower = npcTier > 0 ? foe.gearPower : (foe.power || foeKit.gearPower || 0);
    const bout = {
        myPower, theirPower, npcTier, size,
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
            element: foeKit.element, abilities: foeKit.abilities, might: foeKit.might, gearPower: foeKit.gearPower,
            speed: foeKit.speed,
            // The four numbers the fight is made of, carried onto the bout so the card and the engine cannot
            // disagree — the card reads the same fields resolveBeat multiplies.
            health: foeKit.health, damage: foeKit.damage,
            critChance: foeKit.critChance, critMult: foeKit.critMult, armour: foeKit.armour || 0,
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
        me: { element: me.element, abilities: me.abilities, might: me.might, speed: me.speed,
            health: me.health, damage: me.damage * myDamageMult,
            critChance: me.critChance, critMult: me.critMult, armour: me.armour || 0,
            gearPower: me.gearPower, level: me.level, perks: me.perks || {} },
        clash,                                   // your affinity against theirs, decided before a blow lands
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
        foeItems: itemsFor(foeKit),
        items: Object.fromEntries(BATTLE_ITEMS.map((i) => [i.id, i.count])),
        // SPEED takes the first beat. A tie keeps it with the challenger, so bringing the fight still counts
        // for something. Opening a ten-beat exchange is a real edge, which is what makes Ferocity worth wearing.
        turn: me.speed >= foeKit.speed ? "you" : "them",
        opener: me.speed >= foeKit.speed ? "you" : "them",
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
    return bout;
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

    const me = await kitFor(buyerId);
    const prof = enemyProfile(claim.kind, ev.kind);
    const st = statsForPower(prof.power, prof.archetype, prof.element, Number(enemyId) || 0);
    const art = prof.artKey
        ? await db.queryOne(`SELECT url FROM mkt_town_art WHERE art_key = $1`, [prof.artKey]).catch(() => null)
        : null;
    const foe = {
        id: `town:${enemyId}`, name: prof.name, sprite: art?.url || null, npc: true, town: true,
        blurb: prof.blurb, color: prof.tint, archetype: prof.archetype, archetypeName: prof.archetypeName,
        tell: prof.tell, level: null,
    };
    const foeKit = { ...foe, ...st, ...ringStats(st), abilities: npcAbilities(prof.kitTier) };
    const b = buildBout(me, foe, foeKit, {
        myPower: arenaRating(me),
        myDamageMult: TOWN_EDGE,
        // `townEdge` is stamped alongside the rider so a bout can say whether it has already been scaled —
        // see the repair in resolveBeat, which is what rescues the fights that were open when this shipped.
        extra: { town: { eventId: Number(eventId), enemyId: Number(enemyId) }, townEdge: TOWN_EDGE },
    });
    await saveBout(buyerId, b);
    return { ok: true, bout: publicBout(b) };
}

export async function startBout(buyerId, targetId = null) {
    const row = await arenaRow(buyerId);
    if (row?.bout_json && !row.bout_json.over && !staleBout(row.bout_json)) {
        return { ok: false, error: "bout_in_progress", ...(await getArenaState(buyerId)) };
    }
    // STAMINA was bought and then ignored HERE: getArenaState added the track to the allowance it displays,
    // and this gate compared against the bare constant — so the counter said you had another challenge and
    // the server refused it. One expression, in both places.
    if (fightsUsed(row) >= dailyFightsFor(row)) return { ok: false, error: "no_fights", ...(await getArenaState(buyerId)) };

    const board = await standings();
    const me = await kitFor(buyerId);
    const myPower = arenaRating(me);

    // ── WHO ARE WE FIGHTING ──────────────────────────────────────────────────────────────────────────────
    // A member, or a tier out of the Gauntlet. Both resolve to the same shape so the engine below needs no
    // idea which it is. There is no reach check any more: points are accrued, not swapped, so no opponent is
    // off limits and the target list is a convenience rather than the only thing holding the rules up.
    // No target (or an explicit "auto") means: find me one.
    let target = targetId;
    if (!target || target === "auto") {
        const m = matchArenaOpponent(buyerId, myPower, board, Number(row?.npc_best) || 0);
        if (!m) return { ok: false, error: "no_target", ...(await getArenaState(buyerId)) };
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
        if (rung < 1 || rung > LADDER_SIZE) return { ok: false, error: "bad_target", ...(await getArenaState(buyerId)) };
        const beaten = new Set(row?.ladder_beaten || []);
        if (beaten.has(rung)) return { ok: false, error: "already_beaten", ...(await getArenaState(buyerId)) };
        // ── IN ORDER, AND ENFORCED HERE ──────────────────────────────────────────────────────────────────
        // Refused on the SERVER, not merely greyed out on the screen: the target is a string in a POST body,
        // and `ladder:100` is as easy to send as `ladder:3`. The screen locks the same rungs (see the
        // `locked` flag in getArenaState) off this identical rule, so the two cannot drift.
        if (rung !== nextRung(beaten)) {
            return { ok: false, error: "locked", ...(await getArenaState(buyerId)) };
        }
        const f = ladderFoe(rung);
        foe = f;
        const st = statsForPower(f.power, f.archetype, null, rung);
        foeKit = { ...f, ...st, ...ringStats(st), abilities: npcAbilities(Math.max(1, Math.round(rung * 0.9))) };
    } else if (npcTier > 0) {
        // Beyond your best + reach is refused HERE, not just hidden in the UI, or a crafted POST could farm
        // tier 900 for points on day one.
        const bestTier = Number(row?.npc_best) || 0;
        if (!Number.isFinite(npcTier) || npcTier < 1 || npcTier > bestTier + NPC_REACH) {
            return { ok: false, error: "bad_target", ...(await getArenaState(buyerId)) };
        }
        const n = npcFor(npcTier);
        foe = n;
        // An NPC's kit is drawn from the same archetype catalog members use, so it fights with real named
        // moves rather than a bare swing — scaled by tier, and seeded off the tier so a given tier always
        // brings the same two moves and can be planned against.
        foeKit = { ...n, ...ringStats(n), abilities: npcAbilities(npcTier) };
    } else {
        foe = board.find((o) => o.id === target);
        if (!foe) return { ok: false, error: "bad_target", ...(await getArenaState(buyerId)) };
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
    // A FOE WHO WINS INITIATIVE MUST STILL TELEGRAPH. `incoming` was only ever filled in at the end of a
    // resolved beat, so when their speed took the first one there was nothing to publish — the warning card
    // fell back to "a heavy swing" for a move that might have been a mythic spell, and the whole read-it-first
    // contract was broken on the one beat you had no information at all.
    if (bout.turn === "them") bout.incoming = pickIncoming(bout);
    await db.query(
        `UPDATE mkt_arena SET bout_json = $2::jsonb, fights_day = ${DAY},
            fights_today = CASE WHEN fights_day = ${DAY} THEN fights_today + 1 ELSE 1 END, updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(bout)]
    ).catch(() => {});
    await trackActivity(buyerId, "arena_start", { target: foe.id, npcTier: npcTier || null, theirPower: bout.theirPower }).catch(() => {});
    return { ok: true, ...(await getArenaState(buyerId)) };
}

/** One exchange. Your stance against theirs, resolved on the server so the pick can't be read or replayed. */
/**
 * ONE BEAT. The client reports how far off the line it landed (`off`, a fraction of the ring's duration) and,
 * on your own beat, which ability you spent Focus on.
 *
 * The damage is computed HERE from your real stats — the client only ever reports its timing. It could lie
 * about that, and the ceiling on lying is one perfect swing per beat, which is what a good player gets anyway.
 */
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
export async function fightRound(buyerId, opts = {}) {
    const row = await arenaRow(buyerId);
    const b = row?.bout_json;
    if (staleBout(b)) {
        await db.query(`UPDATE mkt_arena SET bout_json = NULL WHERE buyer_id = $1`, [buyerId]).catch(() => {});
        return { ok: false, error: "no_bout", ...(await getArenaState(buyerId)) };
    }
    if (!b || b.over) return { ok: false, error: "no_bout", ...(await getArenaState(buyerId)) };

    // Abilities are frozen into the bout at the start. A fight already in progress when the kit format
    // changes would otherwise render a half-empty card for the rest of the bout, so re-derive the live kit
    // onto the running bout before anything reads it.
    if ((b.me?.abilities || []).some((a) => !a.effect || typeof a.effect !== "object")) {
        const fresh = await kitFor(buyerId).catch(() => null);
        if (fresh?.abilities?.length) {
            b.me.abilities = b.me.abilities.map((a) => fresh.abilities.find((f) => f.id === a.id) || a);
        }
    }

    // Same reasoning, for the town's edge. A raid bout is frozen at the moment it opens, so every fight that
    // was already underway when TOWN_EDGE shipped carries the old unscaled damage — and those are precisely
    // the fights that were stuck against a wave nobody could kill. Scale them in place instead of making
    // people forfeit and re-engage, which on a shared roster means losing the claim to somebody else.
    // The stamp is what makes this idempotent: it runs once per bout, and a bout built after the deploy
    // arrives already stamped, so it is skipped.
    if (b.town && !b.townEdge && b.me?.damage != null) {
        b.me.damage *= TOWN_EDGE;
        b.townEdge = TOWN_EDGE;
    }

    const mine = b.turn === "you";
    const command = String(opts.command || (mine ? "attack" : "block"));
    // ── NO TIMING ────────────────────────────────────────────────────────────────────────────────────
    // The closing ring is gone. A beat is decided by the COMMAND you pick and the gear behind it, not by
    // whether your thumb landed inside a 90ms window — which is a different game than the one the loadout,
    // the elements and the cooldowns were built for.
    //
    // The grade multipliers it used to produce are replaced by flat constants tuned to what an average hand
    // was actually getting, so nothing about the balance moves: attacks land at what a "great" tap paid, and
    // a plain block turns aside what an average block did. Guard, wards and the field kit are the defensive
    // levers now, and they are choices rather than reflexes.
    // Was 1.15, chosen to average out the +-18% swing wobble that has been removed. A plain attack is now
    // plainly your damage number; only an ABILITY moves it, which is the only multiplier you actually choose.
    const ATTACK = 1;
    const BLOCK = 0.34;    // was BLOCK, which averaged ~0.34

    // ── CRITS ────────────────────────────────────────────────────────────────────────────────────────────
    // Removing the timing ring took the last source of variance a player could feel. Every blow became the
    // same blow, and — because the whole visual reward layer was keyed to the timing grades "flawless" and
    // "perfect" — the screen flash, the oversized damage number and the bigger particle burst all became
    // unreachable code. There was juice built for a moment that could no longer happen.
    //
    // A crit restores that moment without restoring the reflex test: it is a roll, it is announced, and it is
    // worth enough to change how a bout is going. FORTUNE is what moves it — a stat that already means "luck"
    // everywhere else in the Den — so the dial is on the gear rather than on the thumb.
    // BOTH SIDES CRIT. Giving them only to the attacker would have been a straight, unsimulated buff to
    // whoever brings the fight — and this is a ladder where every member is on both sides of it, so a rule
    // that only applies when you are the challenger is not a rule, it is a bias. The defender's chance comes
    // off their own gear's Fortune exactly as yours does.
    // CRIT IS THE ONLY ROLL LEFT, and it is not a hidden one: the chance is printed on your card, the
    // multiplier beside it, and the word CRITICAL is shouted when it lands. It is the boss fight's model
    // verbatim (25% + Crit Chance, x2.5 + Crit Power) rather than a second, private one built on Fortune —
    // a kit that crits against the boss now crits in here, which is the whole point of reading real stats.
    // The sand runs out from round seven — see pitFever. Both sides, same number, announced on the HUD.
    const fever = pitFever(b.beat || 1);
    const P = b.me?.perks || {};
    const critChance = b.me?.critChance ?? 0.25;
    const myCritMult = b.me?.critMult ?? 2.5;
    // ── THE DEFENDER'S TREE, READ THE WAY YOURS IS ───────────────────────────────────────────────────────
    // Every passive a fully-invested tree can produce now lands when its owner is the one being attacked,
    // except five — and those five are not oversights, they are perks whose MECHANIC the defending side never
    // performs:
    //
    //   riposteShare  the AI never sets a riposte; it braces or it swings
    //   rendTick / rendStacks / burnOnCrit   all leave a burn behind, which only an attacker applies
    //   cdCut         shortens cooldowns, and the incoming move is chosen fresh each beat rather than cooled
    //
    // Wiring any of those means giving the defending AI a new behaviour, not reading a number, so they stay
    // out until it has one. Everything else — block, thorns, regen, lastStand, guardSoak, wardSoak,
    // shieldCap, pierce, openMult, lowHpDmg, spellPower, elementEdge — is live.
    //
    // THEIRS, read exactly the way P is read for you. A defender is a real build now, not four numbers.
    const FP = b.foe?.perks || {};
    const foeCritChance = b.foe?.critChance ?? 0.25;
    const foeCritMult = b.foe?.critMult ?? 2.5;
    if (!b.items) b.items = Object.fromEntries(BATTLE_ITEMS.map((i) => [i.id, i.count]));
    if (!b.cd) b.cd = {};
    const coolFor = (ability) => Math.max(ability.cooldown ? 1 : 0, (ability.cooldown || 0) - Math.floor((P.cdCut || 0) / 3));
    const cool = (n) => { for (const k of Object.keys(b.cd)) b.cd[k] = Math.max(0, (b.cd[k] || 0) - n); };

    // ── DEFENSIVE SKILL ── played during their wind-up, and it does NOT consume the beat: you still block.
    // Wards were only usable on your own turn, which meant spending a swing to brace for a blow you could see
    // coming — the one moment the ability is actually for was the one moment you couldn't use it.
    if (!mine && command === "defend") {
        const ward = (b.me.abilities || []).find((x2) => x2.id === opts.abilityId && x2.defensive);
        if (!ward) return { ok: false, error: "no_ability", ...(await getArenaState(buyerId)) };
        if ((b.cd[ward.id] || 0) > 0) return { ok: false, error: "cooling", ...(await getArenaState(buyerId)) };
        // Quickening applies here too. This set the raw cooldown while the offensive path used coolFor(), so
        // three ranks of a node that says "shaves a turn off your cooldowns" shaved nothing off the two
        // abilities a defensive build actually leans on.
        b.cd[ward.id] = coolFor(ward);
        // A RIPOSTE is the other defensive answer: it does not soak anything, it sends their blow back. That
        // makes the defensive slot a real choice — eat less, or make them pay for swinging.
        // One defensive play at a time — a second ward while one is already up is wasted, which is what
        // stops four defensive pieces from being a shield every single enemy beat.
        if (ward.kind === "riposte") {
            b.riposte = RIPOSTE_SHARE;
            b.log.push({ beat: b.beat, who: "you", grade: "ward", damage: 0,
                text: `${ward.name} — set to answer.`, ability: ward.name, kind: "riposte" });
            await saveBout(buyerId, b);
            return { ok: true, ...(await getArenaState(buyerId)) };
        }
        // Deep Guard makes a ward soak more; Unyielding raises the ceiling it can stack to.
        const soak = Math.min(Math.round(b.maxHp * (WARD_SOAK + (P.wardSoak || 0))),
            Math.max(0, Math.round(b.maxHp * (SHIELD_CAP + (P.shieldCap || 0))) - b.shield));
        b.shield += soak;
        b.log.push({ beat: b.beat, who: "you", grade: "ward", damage: 0, soaked: soak,
            text: `${ward.name} — braced for ${soak}.`, ability: ward.name, kind: "ward" });
        await saveBout(buyerId, b);
        return { ok: true, ...(await getArenaState(buyerId)) };
    }

    if (mine && (command === "guard" || command === "item")) {
        // ── NO RING ── these spend the turn outright, which is exactly what makes the menu a decision.
        if (command === "guard") {
            // Fortress soaks more on a plain guard, which is the command a shield build spends turns on.
            const soak = Math.min(Math.round(b.maxHp * (GUARD_SOAK + (P.guardSoak || 0))),
                Math.max(0, Math.round(b.maxHp * (SHIELD_CAP + (P.shieldCap || 0))) - b.shield));
            b.shield += soak;
            cool(GUARD_COOL);
            b.log.push({ beat: b.beat, who: "you", grade: "guard", damage: 0, soaked: soak,
                text: `You set your guard — bracing ${soak}, and everything cools a turn faster.` });
        } else {
            const it = BATTLE_ITEMS.find((x) => x.id === opts.itemId);
            if (!it || (b.items[it.id] || 0) <= 0) return { ok: false, error: "no_item", ...(await getArenaState(buyerId)) };
            b.items[it.id] -= 1;
            let text;
            let healed = 0;
            if (it.kind === "heal") {
                healed = Math.min(b.maxHp - b.hp, Math.round(b.maxHp * it.amount));
                b.hp += healed;
                text = healed > 0 ? `${it.name} — ${healed} health back.` : `${it.name} — already whole.`;
            } else {
                b.cd = {};
                text = `${it.name} — every skill is ready.`;
            }
            b.log.push({ beat: b.beat, who: "you", grade: "item", damage: 0, healed, text, item: it.id });
        }
        b.turn = "them";
    } else if (mine) {
        // ── YOUR SWING ── the ring closed over them.
        const ability = command === "skill" && opts.abilityId
            ? (b.me.abilities || []).find((x) => x.id === opts.abilityId)
            : null;
        if (command === "skill" && !ability) return { ok: false, error: "no_ability", ...(await getArenaState(buyerId)) };
        if (ability && (b.cd[ability.id] || 0) > 0) return { ok: false, error: "cooling", ...(await getArenaState(buyerId)) };

        // ── FREE SKILLS ── a ward or a riposte does not spend your beat. Brace, then still swing.
        //
        // Both were a trap on your own turn. Bulwark's card literally reads "it does not cost you a swing", and
        // it did: the on-their-beat path above is free, while tapping the same skill from the skill menu spent
        // the entire turn to brace for a blow. Answer was worse — played on your own beat it matched none of
        // the branches below, so it set no riposte, dealt no damage, and ended your turn anyway.
        //
        // What bounds this is the COOLDOWN, not the beat: 4 and 5 turns, ticking only when a real round passes,
        // and a tree offers one of each. Measured over 2,000 bouts a cell against a player who already braced
        // on every telegraph, the Gauntlet moved 43.6% → 45.0% at tier 20 and every kind stayed inside noise —
        // this hands out no power, it stops charging a turn for something already priced as free.
        //
        // SURGE IS NOT IN HERE. See FREE_KINDS in arena-kit.js: its price genuinely is the turn.
        if (ability && FREE_KINDS.has(ability.kind)) {
            // QUICKENING: "every third rank shaves a turn off one cooldown". Three ranks, one turn, read by
            // nothing — the whole node was a sprite. A cooldown never drops below one turn: an ability you
            // can play every beat is not an ability, it is the attack button.
            b.cd[ability.id] = coolFor(ability);
            if (ability.kind === "riposte") {
                b.riposte = RIPOSTE_SHARE;
                b.log.push({ beat: b.beat, who: "you", grade: "ward", damage: 0, free: true,
                    text: `${ability.name} — set to answer. Your beat is still yours.`, ability: ability.name, kind: "riposte" });
            } else {
                const soak = Math.min(Math.round(b.maxHp * WARD_SOAK), Math.max(0, Math.round(b.maxHp * SHIELD_CAP) - b.shield));
                b.shield += soak;
                b.log.push({ beat: b.beat, who: "you", grade: "ward", damage: 0, soaked: soak, free: true,
                    text: `${ability.name} — braced for ${soak}. Your beat is still yours.`, ability: ability.name, kind: "ward" });
            }
            await saveBout(buyerId, b);
            return { ok: true, ...(await getArenaState(buyerId)) };
        }

        let power = 1;
        let note = "";
        let hits = 1;              // flurry lands more than once
        let drain = 0;             // share of damage returned to you as health
        let rend = false;          // leaves a burn behind
        let sunder = false;        // strips their guard for a few turns
        let justSurged = false;    // cast THIS turn, so it must not be spent on the cast itself
        // ── WHAT MAKES ONE SKILL DIFFERENT FROM ANOTHER ──────────────────────────────────────────────────
        // Using a skill has always mattered enormously — 4,000 bouts a cell says a good hand goes from 15% to
        // 95% against +30% gear with them, and bouts run 8.8 beats instead of 15. But STRIKE and SPELL were
        // the same code path with a different word on them, and ability.element was never read at all: the
        // elemental clash is fixed at the start of the bout off your overall affinity, so a fire spell and a
        // shadow spell did exactly the same thing. Six kinds, and only four of them did anything.
        //
        // They now pull in different directions, without adding raw power:
        //   strike — timing counts for more. Your hands decide it.
        //   spell  — answers on its OWN element and cuts guard. Your build decides it.
        let gradeAtk = ATTACK;
        // Sunder Guard (a tree passive) cuts what their guard is worth on every swing, not just on a sunder.
        let pierce = Math.max(0.2, 1 - (P.pierce || 0));
        let clashMult = b.clash?.mult || 1;
        // Wheelwise: your element bites a little harder and slides off a little less.
        if (P.elementEdge) clashMult = clashMult >= 1 ? clashMult * (1 + P.elementEdge) : clashMult + (1 - clashMult) * P.elementEdge;
        // First Blood, and Bloodlust: the opening beat, and fighting hurt.
        const openMult = b.beat <= 1 ? 1 + (P.openMult || 0) : 1;
        const lowHpMult = b.hp <= b.maxHp / 3 ? 1 + (P.lowHpDmg || 0) : 1;
        if (ability) {
            b.cd[ability.id] = coolFor(ability);   // Quickening — see the free-action branch above
            power = ability.power;
            note = ` · ${ability.name}`;
            // ward and riposte never reach here — they resolve above as free actions and keep your beat.
            // SURGE USED TO EAT ONE OF ITS OWN CHARGES. It set b.surge = 3 and then fell through to the
            // spender twenty lines below, which multiplied a ZERO-power cast by 1.5 and decremented to 2. You
            // paid a whole turn for three sharpened swings and got two, with the first 1.5x spent on a hit
            // that dealt nothing. `justSurged` holds the spender off for exactly the turn you cast it.
            if (ability.kind === "surge") { b.surge = SURGE_SWINGS; power = 0; justSurged = true; note += " — sharpened"; }
            if (ability.kind === "execute" && b.foeHp <= b.foeMaxHp * 0.35) { power *= 1.5; note += " — EXECUTE"; }
            if (ability.kind === "gamble") { power = Math.random() < 0.5 ? power * 2 : 0; note += power ? " — it pays" : " — nothing"; }
            if (ability.kind === "strike") {
                // Amplifies the timing band around 1.0 — a flawless strike hits far harder than a sloppy one,
                // more so than any other kind. High variance, paid for with execution rather than power.
                gradeAtk = 1.45;
            }
            if (ability.kind === "spell") {
                // Its own affinity against theirs, not the bout-wide one — so what you attuned this specific
                // piece to at the Forge is a real decision. And magic cuts guard, paid for in raw power.
                const c = elementClash(ability.element, b.foe.element);
                clashMult = c.mult * (P.elementEdge ? (c.mult >= 1 ? 1 + P.elementEdge : 1) : 1);
                pierce = Math.max(0.2, 0.6 - (P.pierce || 0));
                power *= 0.88 * (1 + (P.spellPower || 0));
                if (c.note) note += ` — ${c.note}`;
            }
            // ── THE FIVE THAT CHANGE THE SHAPE OF A BOUT ─────────────────────────────────────────────────
            // Nine archetypes used to collapse into "one big hit", which is why a four-piece kit read as the
            // same card four times. These do different things instead of bigger numbers.
            if (ability.kind === "flurry") {
                // Several small blows. Each rolls its own crit, so this is the kit's variance play — worth
                // more the more Fortune you are carrying, and better than one big hit into a low guard.
                hits = Math.max(1, ability.hits || 3);
            }
            if (ability.kind === "drain") drain = DRAIN_SHARE;
            if (ability.kind === "rend") rend = true;
            if (ability.kind === "sunder") sunder = true;
        }
        // Timing, then the ability, then your affinity against theirs. Surge spends itself on the next swings.
        const surge = (b.surge > 0 && !justSurged) ? 1.5 : 1;
        if (b.surge > 0 && !justSurged) b.surge -= 1;
        // Their gear defends them too. Without this the attacker always lands full and the better loadout
        // means nothing — 100% win rates at every level of play, in 4,000 simulated bouts a cell.
        // Their guard, minus whatever a Sunder has already stripped off it.
        const sundered = (b.sunder || 0) > 0 ? 1 - SUNDER_CUT : 1;
        // Their armour: the number on their card, minus whatever a Sunder has stripped and whatever your
        // Pierce cuts through. No roll — the same swing into the same armour is the same number every time.
        //
        // A BRACE NO LONGER ADDS TO IT. It used to add a flat 40% on top, which was the defender's ONLY
        // reward for guarding; now that a guard banks a real shield exactly as yours does (see their turn),
        // keeping the reduction as well would have made the same command strictly better in their hands than
        // in yours. Their shield eats the blow further down, which is where yours eats one too.
        // Their Footwork rides with their armour: the same node that lets YOU turn a blow aside lets them.
        const guard = Math.max(0, Math.min(0.85,
            ((Number(b.foe.armour) || 0) + (FP.block || 0)) * pierce * sundered));
        // A ward or a surge deals no damage, so it cannot crit — a "Critical" over a move that did nothing
        // would be the loudest possible way to say nothing happened.
        // EVERY blow of a flurry rolls separately, which is the whole point of it.
        let dmg = 0;
        let crit = false;
        // WHAT THEIR GUARD ATE. The number was computed and thrown away, and that asymmetry is the whole of
        // "why do I do so little damage": when THEY swing you are told "you turn aside 21, 17 lands", and when
        // YOU swing you are told "14" with no account of where the rest went. Their guard is the single
        // biggest term in the swing — it rolls 12%, 32% or 55% fresh every blow — so a member watching their
        // own damage jump between 14 and 35 with the same gear against the same opponent has no way to learn
        // that it is one hidden roll, and concludes their gear does nothing.
        let turned = 0;
        for (let i = 0; i < hits && power > 0; i += 1) {
            const c = Math.random() < critChance;
            if (c) crit = true;
            const raw = b.me.damage * gradeAtk * power * surge * clashMult * (b.underdog || 1)
                * openMult * lowHpMult * fever * (c ? myCritMult : 1);
            turned += Math.round(raw * guard);
            dmg += Math.max(1, Math.round(raw - raw * guard));
        }
        // Their banked shield eats first, exactly as yours does on the way in — so the points they spent on
        // it are the reason your blow did less, and the recap can say so.
        let theirSoak = 0;
        if ((b.foeShield || 0) > 0 && dmg > 0) {
            theirSoak = Math.min(b.foeShield, dmg);
            b.foeShield -= theirSoak;
            dmg -= theirSoak;
        }
        // ── THEIR LAST STAND ── the mirror of yours: once a bout, the blow that would end them leaves them
        // on 1. Checked BEFORE the subtraction, or there is nothing left to save.
        let theyStood = false;
        if (dmg >= b.foeHp && (FP.lastStand || 0) > 0 && !b.foeStood) {
            dmg = Math.max(0, b.foeHp - 1); b.foeStood = true; theyStood = true;
        }
        b.foeHp = Math.max(0, b.foeHp - dmg);
        // ── THEIR IRON THORNS ── off your WHOLE swing, the same way yours works, so a defender who built for
        // it punishes a big hit hardest. It can finish you: a shield build defending is supposed to be able
        // to win a fight it never swings in.
        let theirThorns = 0;
        if ((FP.thorns || 0) > 0 && dmg > 0) {
            theirThorns = Math.max(1, Math.round((dmg / Math.max(0.15, 1 - guard)) * FP.thorns));
            b.hp = Math.max(0, b.hp - theirThorns);
        }
        // ── THEIR RIPOSTE ── set on a beat they spent standing ready, spent on the first blow that lands.
        // The mirror of yours: off what actually got through their guard, and reading their Vengeance node.
        let theirRiposte = 0;
        if ((b.foeRiposte || 0) > 0 && dmg > 0) {
            theirRiposte = Math.max(1, Math.round(dmg * (b.foeRiposte + (FP.riposteShare || 0))));
            b.hp = Math.max(0, b.hp - theirRiposte);
            b.foeRiposte = 0;
        }

        // What the move leaves behind.
        let healed = 0;
        if (drain > 0 && dmg > 0) {
            healed = Math.min(b.maxHp - b.hp, Math.round(dmg * drain));
            b.hp += healed;
        }
        // CONFLAGRATION. One rank, tier 3, twelve points deep: "your criticals leave a burn behind" — and
        // nothing read it, so the deepest node in the Runecaller tree was a sprite and a sentence. A crit now
        // applies the same burn a rend would, which is exactly what the card says and nothing more.
        if (crit && (P.burnOnCrit || 0) > 0 && dmg > 0) rend = true;
        if (rend && dmg > 0) {
            // Stacks with itself rather than refreshing, so leaning on a burn kit is a real plan — but only
            // up to REND_MAX_STACKS. Uncapped it won 83.8% of simulated bouts in under six beats.
            // Slow Burn: each rank makes the burn tick for more of their health.
            const per = Math.max(1, Math.round(b.foeMaxHp * (REND_PER_TURN + (P.rendTick || 0))));
            // KINDLING: "+1 burn stack per rank" was read by nothing, so two ranks of a tier-1 node did
            // nothing at all. It raises the CEILING — the cap is what the node is worth, since a burn kit
            // reaches the old cap of its own accord and then stops.
            const cap = REND_MAX_STACKS + Math.round(P.rendStacks || 0);
            const stacks = Math.min(cap, (b.bleed?.stacks || 0) + 1);
            b.bleed = { turns: REND_TURNS, stacks, dmg: per * stacks };
        }
        if (sunder) b.sunder = SUNDER_TURNS;

        const extra = [
            healed > 0 ? `+${healed} back` : null,
            turned > 0 ? `${turned} turned aside` : null,
            rend && dmg > 0 ? `burning ${b.bleed.dmg}/turn` : null,
            sunder ? `guard stripped` : null,
            hits > 1 ? `${hits} hits` : null,
        ].filter(Boolean).join(", ");
        // `theirThorns` and `theyStood` ride along so the ring can SHOW them. A defender's thorns taking a
        // bite out of you with no number and no line is precisely the invisible-effect bug this file keeps
        // being fixed for — and it is worse coming from the other side, because you cannot see their tree.
        b.log.push({ beat: b.beat, who: "you", grade: ability ? "skill" : "hit", damage: dmg, crit,
            hits, healed, turned, kind: ability?.kind || "hit", theirThorns, theyStood, theirSoak,
            text: `${dmg > 0
                ? `${crit ? "CRITICAL — " : ""}${ability ? ability.name : "You strike"} — ${dmg}${extra ? ` (${extra})` : ""}.`
                : `${ability ? ability.name : "You strike"}${note.replace(` · ${ability?.name}`, "")}.`}`
                + `${theirSoak ? ` Their guard bank eats ${theirSoak}.` : ""}`
                + `${theyStood ? ` ${b.foe.name} WILL NOT FALL.` : ""}`
                + `${theirThorns ? ` Their thorns bite for ${theirThorns}.` : ""}`
                + `${theirRiposte ? ` ${b.foe.name} answers for ${theirRiposte}.` : ""}`,
            takenBack: theirRiposte,
            ability: ability?.name || null });

        // ── THEIR BURN ── ticks at the end of YOUR beat, the same place yours ticks at the end of theirs.
        if (b.foeBleed?.turns > 0) {
            const tick = Math.min(b.hp, b.foeBleed.dmg);
            b.hp = Math.max(0, b.hp - tick);
            b.foeBleed.turns -= 1;
            if (tick > 0) {
                b.log.push({ beat: b.beat, who: "them", grade: "burn", damage: tick, kind: "rend",
                    text: `You are still burning — another ${tick}.`, ability: null });
            }
            if (b.foeBleed.turns <= 0) b.foeBleed = null;
        }
        if (b.foeSunder > 0) b.foeSunder -= 1;
        b.turn = "them";
    } else {
        // ── A BRACED DEFENDER DOES NOT SWING ── it covers up, and your next blow lands on a raised guard.
        // Handled at the top of their turn so it falls through to the SAME tail every other outcome uses
        // (hand the turn back, tick cooldowns, check whether anybody has fallen). An early return here skipped
        // all three, which is the sort of thing that only shows up as a bout that will not end.
        // ── AN ITEM THEY REACHED FOR ── the same two the player carries, in the same counts. Resolved here
        // rather than in the picker, because the picker is pure and spending a charge is state.
        if (b.incoming?.kind === "item") {
            if (!b.foeItems) b.foeItems = itemsFor(b.foe);
            const it = b.incoming.item;
            if ((b.foeItems[it] || 0) > 0) {
                b.foeItems[it] -= 1;
                if (it === "poultice") {
                    const back = Math.min(b.foeMaxHp - b.foeHp, Math.round(b.foeMaxHp * POULTICE_HEAL));
                    b.foeHp += back;
                    b.log.push({ beat: b.beat, who: "them", grade: "item", damage: 0, healed: back,
                        text: `${b.foe.name} binds a wound — ${back} back.`, ability: "Field Poultice" });
                } else {
                    b.foeCd = {};
                    b.log.push({ beat: b.beat, who: "them", grade: "item", damage: 0,
                        text: `${b.foe.name} drains a draught — everything they have is ready again.`, ability: "Quickening Draught" });
                }
            }
        } else if (b.incoming?.brace) {
            // ── A GUARD IS A GUARD, WHOEVER RAISES IT ───────────────────────────────────────
            // Your Guard banks a shield worth 30% of your health, capped by your own Unyielding. Theirs banked
            // NOTHING unless they had bought Warden nodes — it was a flat 40% off one blow and nothing else.
            // So the identical command was two different commands depending on which side of the ring you
            // happened to be standing on, and that is the plainest form of the debuff-on-defence problem: a
            // member's shield build could not raise the shield they built.
            //
            // It is the same move now, off the same constants, with the same per-node bonuses and the same
            // cap. The flat 40% is gone with it — keeping BOTH would have made defending strictly better than
            // attacking, which is the same failure pointed the other way.
            const cap = Math.round(b.foeMaxHp * (SHIELD_CAP + (FP.shieldCap || 0)));
            const foeSoak = Math.min(Math.round(b.foeMaxHp * (GUARD_SOAK + (FP.guardSoak || 0))),
                Math.max(0, cap - (b.foeShield || 0)));
            b.foeShield = (b.foeShield || 0) + foeSoak;
            b.log.push({ beat: b.beat, who: "them", grade: "ward", damage: 0, free: false, soaked: foeSoak,
                text: `${b.foe.name} raises a guard — ${foeSoak} banked against what comes next.`,
                ability: "Guard" });
        } else {
        // ── THEIR SWING ── the ring closed over you, and you were bracing.
        // Whatever was telegraphed is what lands. Rolling again here would make the warning a lie.
        const incoming = b.incoming || pickIncoming(b);
        // ── A FREE STANCE COSTS THEM NOTHING EITHER ────────────────────────────────────────────
        // FREE_KINDS is your rule: a ward or a riposte does not spend your beat — you set it, and you still
        // swing. The defender was never given it, so the picker's own ward branch fell through and resolved
        // as a plain punch. A Warden's signature move, downgraded to a punch, every time its owner was away.
        if (incoming.free) {
            if (incoming.free === "riposte") {
                b.foeRiposte = RIPOSTE_SHARE;
                b.log.push({ beat: b.beat, who: "them", grade: "ward", damage: 0, free: true,
                    text: `${b.foe.name} sets to answer — their beat is still theirs.`,
                    ability: incoming.freeName || "Riposte" });
            } else {
                const wcap = Math.round(b.foeMaxHp * (SHIELD_CAP + (FP.shieldCap || 0)));
                const wsoak = Math.min(Math.round(b.foeMaxHp * (WARD_SOAK + (FP.wardSoak || 0))),
                    Math.max(0, wcap - (b.foeShield || 0)));
                b.foeShield = (b.foeShield || 0) + wsoak;
                b.log.push({ beat: b.beat, who: "them", grade: "ward", damage: 0, free: true, soaked: wsoak,
                    text: `${b.foe.name} throws up a ward — ${wsoak} banked. Their beat is still theirs.`,
                    ability: incoming.freeName || "Ward" });
            }
        }
        const theirAbility = incoming.isAbility ? incoming : null;
        let power = incoming.power || 1;
        let foeHits = 1;
        let foeDrain = incoming.heal || 0;
        let rendNow = false;
        let sunderNow = false;
        let foeJustSurged = false;
        // How much of YOUR block their swing cuts through. Their Pierce, and a spell cuts guard on its own.
        let foePierce = Math.max(0.25, 1 - (FP.pierce || 0));
        // Their element against yours is the mirror of yours against theirs — including their Wheelwise, which
        // sharpens their advantage and softens their disadvantage exactly as yours does.
        let back = 1 / (b.clash?.mult || 1);
        if (FP.elementEdge) back = back >= 1 ? back * (1 + FP.elementEdge) : back + (1 - back) * FP.elementEdge;
        // ── THE SAME NINE KINDS, DOING THE SAME NINE THINGS ──────────────────────────────────
        // Read off the same list your own swing is read off. Every one of these used to collapse into a bare
        // `power` multiplier, so their surge, their sunder, their rend, their gamble and their flurry were all
        // literally the same move with a different name printed over it. The kit a member assembled was
        // therefore visible only when they happened to be the one holding the controls.
        if (theirAbility) {
            const k = theirAbility.kind;
            if (k === "surge") { b.foeSurge = SURGE_SWINGS; power = 0; foeJustSurged = true; }
            if (k === "execute" && b.hp <= b.maxHp * 0.35) power *= 1.5;
            if (k === "gamble") power = Math.random() < 0.5 ? power * 2 : 0;
            if (k === "spell") {
                power *= 0.88 * (1 + (FP.spellPower || 0));
                foePierce = Math.max(0.2, 0.6 - (FP.pierce || 0));
                // ── A SPELL BRINGS ITS OWN ELEMENT, ON THEIR SIDE TOO ────────────────────────────────────
                // Yours reads the affinity of the SPECIFIC piece you attuned at the Forge rather than the
                // bout-wide clash; theirs was still using the bout-wide number, so the one decision the Forge
                // asks you to make about a weapon was worth nothing on the half of your fights you defend.
                const c = elementClash(theirAbility.element, b.me.element);
                back = c.mult * (FP.elementEdge ? (c.mult >= 1 ? 1 + FP.elementEdge : 1) : 1);
            }
            // ── AND THE STRIKE AMPLIFIER ── a strike is the high-variance kind: yours swings at 1.45 where
            // everything else swings at 1. Theirs swung at 1, so a strike kit was a strictly worse kit to be
            // caught defending with. Same number, same kind, both sides.
            if (k === "strike") power *= 1.45;
            if (k === "flurry") foeHits = Math.max(1, theirAbility.hits || 3);
            if (k === "drain") { foeDrain = DRAIN_SHARE; power = 1; }
            if (k === "rend") rendNow = true;
            if (k === "sunder") sunderNow = true;
        }
        // Their surge spends itself on the swings AFTER the one that set it, exactly as yours does.
        const foeSurgeMult = (b.foeSurge > 0 && !foeJustSurged) ? 1.5 : 1;
        if (b.foeSurge > 0 && !foeJustSurged) b.foeSurge -= 1;
        // Their First Blood, their Bloodlust — read off their tree exactly as yours are read off yours.
        const foeOpen = b.beat <= 1 ? 1 + (FP.openMult || 0) : 1;
        const foeLow = b.foeHp <= b.foeMaxHp / 3 ? 1 + (FP.lowHpDmg || 0) : 1;
        // Your stance is a BLOCK, cut by their Pierce and by whatever a Sunder of theirs has already stripped
        // off it — the mirror of what your own Sunder does to their armour.
        const mySundered = (b.foeSunder || 0) > 0 ? 1 - SUNDER_CUT : 1;
        const myBlock = Math.min(0.7, BLOCK + (P.block || 0)) * foePierce * mySundered;
        // EVERY blow of a flurry rolls its own crit, on their side of the ring too.
        let raw = 0;
        let blocked = 0;
        let through = 0;
        let foeCrit = false;
        for (let i = 0; i < foeHits && power > 0; i += 1) {
            const c = Math.random() < foeCritChance;
            if (c) foeCrit = true;
            const one = Math.max(1, Math.round(b.foe.damage * power * back * fever * foeOpen * foeLow
                * (b.foeUnderdog || 1) * foeSurgeMult * (c ? foeCritMult : 1)));
            const off = Math.round(one * myBlock);
            raw += one;
            blocked += off;
            through += Math.max(0, one - off);
        }
        let soaked = 0;
        if (b.shield > 0) { soaked = Math.min(b.shield, through); b.shield -= soaked; through -= soaked; }
        // ── IRON THORNS ── a share of the blow comes back off THE WHOLE SWING, not off what got past you.
        // Off `through` it would have punished the shield build for being good at its one job: the better you
        // blocked, the less you returned. This is the answer to "I am a shield class and I do no damage" —
        // your damage is THEIR swing, and the harder they hit the more of it comes back.
        let thorned = 0;
        if ((P.thorns || 0) > 0 && raw > 0) {
            thorned = Math.max(1, Math.round(raw * P.thorns));
            b.foeHp = Math.max(0, b.foeHp - thorned);
        }
        // ── LAST STAND ── once a bout, the blow that would end you leaves you on 1 instead.
        let stood = false;
        if (through >= b.hp && (P.lastStand || 0) > 0 && !b.stood) { through = Math.max(0, b.hp - 1); b.stood = true; stood = true; }
        b.hp = Math.max(0, b.hp - through);
        // ── WHAT THEIR MOVE LEAVES BEHIND ── their drain feeding them, their burn on you, their sunder on
        // your block. All three were computed on their card and then dropped: `heal` in particular was set by
        // the picker on every drain and read by nothing at all, so a life-steal kit healed for zero on defence.
        let foeHealed = 0;
        if (foeDrain > 0 && through > 0) {
            foeHealed = Math.min(b.foeMaxHp - b.foeHp, Math.round(through * foeDrain));
            b.foeHp += foeHealed;
        }
        if (foeCrit && (FP.burnOnCrit || 0) > 0 && through > 0) rendNow = true;
        if (rendNow && through > 0) {
            const per = Math.max(1, Math.round(b.maxHp * (REND_PER_TURN + (FP.rendTick || 0))));
            const cap = REND_MAX_STACKS + Math.round(FP.rendStacks || 0);
            const stacks = Math.min(cap, (b.foeBleed?.stacks || 0) + 1);
            b.foeBleed = { turns: REND_TURNS, stacks, dmg: per * stacks };
        }
        if (sunderNow) b.foeSunder = SUNDER_TURNS;
        // `blocked` and `soaked` ride along so the field can SHOW them. They were only ever in the sentence,
        // which meant the entire payoff of guarding and warding was a line of grey text under the buttons.
        // ── RIPOSTE ── their blow comes back at them. Resolved off what actually LANDED, so bracing first and
        // then answering is a genuine two-move plan rather than a flat damage bonus.
        let sent = 0;
        if (b.riposte > 0 && through > 0) {
            sent = Math.max(1, Math.round(through * (b.riposte + (P.riposteShare || 0))));
            b.foeHp = Math.max(0, b.foeHp - sent);
            b.riposte = 0;
        }
        b.log.push({ beat: b.beat, who: "them", grade: "hit", damage: through, blocked, soaked, crit: foeCrit,
            healed: foeHealed, hits: foeHits,
            // SENT SEPARATELY. These were added together into one `riposted` field that no component ever
            // read — so a shield build's entire damage output came off the enemy's health bar with no number,
            // no pop and no colour, mentioned only inside a sentence at the end of THEIR log line. It works,
            // and it has always looked exactly like it does not, which is the same thing to a player.
            riposted: sent, thorned,
            text: `${foeCrit ? "CRITICAL — " : ""}${theirAbility
                ? `${b.foe.name} casts ${theirAbility.name} — you turn aside ${blocked}, ${through} lands.`
                : `${b.foe.name} swings — you turn aside ${blocked}, ${through} lands.`}${foeHealed ? ` They take ${foeHealed} back.` : ""}${rendNow && through > 0 ? ` You are burning for ${b.foeBleed.dmg}/turn.` : ""}${sunderNow ? " Your guard is stripped." : ""}${sent ? ` ${sent} comes straight back.` : ""}${thorned ? ` Your thorns bite for ${thorned}.` : ""}${stood ? " YOU WILL NOT FALL." : ""}`,
            ability: theirAbility?.name || null });

        // ── THE BURN ── a rend keeps working after the beat that applied it. It ticks HERE, at the end of
        // their turn, so it reads as "time passing hurts them" rather than as extra damage on your own swing.
        if (b.bleed?.turns > 0) {
            const tick = Math.min(b.foeHp, b.bleed.dmg);
            b.foeHp = Math.max(0, b.foeHp - tick);
            b.bleed.turns -= 1;
            if (tick > 0) {
                b.log.push({ beat: b.beat, who: "you", grade: "burn", damage: tick, kind: "rend",
                    text: `The burn takes another ${tick}.`, ability: null });
            }
            if (b.bleed.turns <= 0) b.bleed = null;
        }
        if (b.sunder > 0) b.sunder -= 1;

        // ── SECOND WIND ── a trickle back at the top of each of your rounds. Small on purpose: it is what
        // makes a long defensive bout survivable, not a way to out-heal a swing.
        if ((P.regen || 0) > 0 && b.hp > 0 && b.hp < b.maxHp) {
            const back = Math.max(1, Math.round(b.maxHp * P.regen));
            b.hp = Math.min(b.maxHp, b.hp + back);
        }
        // And theirs, on the same beat and by the same rule.
        if ((FP.regen || 0) > 0 && b.foeHp > 0 && b.foeHp < b.foeMaxHp) {
            const back = Math.max(1, Math.round(b.foeMaxHp * FP.regen));
            b.foeHp = Math.min(b.foeMaxHp, b.foeHp + back);
        }
        }
        b.turn = "you";
        b.incoming = null;
        b.beat += 1;
        cool(1);            // a round of yours has gone by, so everything cooling ticks down
    }

    // Whoever just acted, if it is now their turn we owe the player a warning.
    if (b.turn === "them" && !b.incoming) b.incoming = pickIncoming(b);

    if (b.foeHp <= 0 || b.hp <= 0) return finishBout(buyerId, row, b, b.foeHp <= 0 && b.hp > 0);
    await saveBout(buyerId, b);
    return { ok: true, ...(await getArenaState(buyerId)) };
}

async function finishBout(buyerId, row, b, won) {
    b.over = true; b.won = won;

    // ── A RAID BOUT IS PAID BY THE RAID ──────────────────────────────────────────────────────────────────
    // Everything below this point is the Arena's economy — VP, laurels, the ladder, the streak, the feats —
    // and none of it belongs to a goblin in the plaza. A town fight hands its result to duelRaidEnemy, which
    // has always owned the spoils, the shared roster, the wave, the chieftain and the raid-won celebration,
    // and returns here with nothing else touched. Recorded on the bout first so a reload cannot re-pay it.
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
    const axp = arenaXpFor({ won, myPower, theirPower });
    const baseLaurels = boutLaurels({ won, myPower, theirPower });
    const { feats, laurels: featLaurels, vp: featVp } = featsFor(b);
    const vp = baseVp + (won ? featVp : 0);
    // RENOWN. The track says "every bout pays more laurels" and nothing read it — fifteen levels of a gold
    // sink that changed no number anywhere. Applied to the feats as well as the base, because a feat is a
    // bout's payout too and splitting them would be a rule nobody could guess from the card.
    const renown = 1 + (Number(upgradeEffects(row?.upgrades || {}).laurels) || 0);
    const laurels = Math.round((baseLaurels + featLaurels) * renown);

    // Gold and XP still pay on a win, unchanged — this sits on top rather than replacing them.
    let reward = null;
    if (won) {
        const gold = Math.round(40 + theirPower * 0.9);
        const xp = Math.round(18 + theirPower * 0.4);
        reward = { gold, xp, vp, laurels, feats, arenaXp: axp };
        const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
        await logCoin(buyerId, gold, "arena_win", { balanceAfter: g?.gold, meta: { foe: b.foe.id, vp } }).catch(() => {});
        await rollWindfall(buyerId, "arena_win").catch(() => {});
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
            vp = vp + $5, best_vp = GREATEST(best_vp, vp + $5),
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
    const wonRung = Number(b.ladder?.rung) || (b.foe?.ladder ? Number(b.foe.rung) || 0 : 0);
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
            const prize = ladderReward(wonRung);
            if (prize.laurels > 0) {
                await db.query(`UPDATE mkt_arena SET laurels = laurels + $2, laurels_earned = laurels_earned + $2 WHERE buyer_id = $1`,
                    [buyerId, prize.laurels]).catch(() => {});
            }
            if (prize.chest) {
                const { addChests } = await import("@/lib/marketplace/chests.js");
                await addChests(buyerId, { [prize.chest]: 1 }, { source: "arena_ladder", meta: { rung: wonRung } }).catch(() => {});
            }
            await trackActivity(buyerId, "arena_ladder", { rung: wonRung, foe: b.foe.name }).catch(() => {});
            ladderPrize = prize;
        }
    }

    const after = await db.queryOne(`SELECT vp FROM mkt_arena WHERE buyer_id = $1`, [buyerId]).catch(() => null);

    b.recap = {
        won, foe: b.foe, reward, feats,
        vpGain: vp, vpFrom: vpBefore, vpTo: Number(after?.vp) ?? vpAfter,
        npcTier: npcTier || null,
        ladder: wonRung ? { rung: wonRung, prize: ladderPrize } : null,
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
    await db.query(
        `INSERT INTO mkt_arena_bout (challenger_id, defender_id, npc_tier, challenger_won, rounds, vp, laurels, feats, defender_laurels)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [buyerId, npcTier > 0 ? null : b.foe.id, npcTier || null, won, (b.log || []).length, vp, laurels,
            JSON.stringify(feats.map((f) => f.id)), defencePaid]
    ).catch(() => {});

    await trackActivity(buyerId, won ? "arena_win" : "arena_loss",
        { foe: b.foe.id, vp, laurels, npcTier: npcTier || null, feats: feats.map((f) => f.id) }).catch(() => {});

    // getArenaState RE-READS the bout out of the database, so if that write above lost for any reason it would
    // hand back the un-finished bout and quietly erase a fight the player had already won — a modal flashing
    // up and then a screen with no way off it. The bout we just resolved is the truth; say so explicitly.
    const state = await getArenaState(buyerId);
    return { ok: true, finished: { won, reward, feats }, ...state, bout: publicBout(b) };
}

/** Clear a finished bout so the arena screen comes back. */
export async function clearBout(buyerId) {
    await saveBout(buyerId, null);
    return { ok: true, ...(await getArenaState(buyerId)) };
}
