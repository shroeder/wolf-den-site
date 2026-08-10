import "server-only";

import { db } from "@/lib/db";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import {
    buildKit, elementClash, SWING, PUNCH, underdogEdge, BATTLE_ITEMS, GUARD_SOAK, GUARD_COOL, speedOf,
    DRAIN_SHARE, REND_TURNS, REND_PER_TURN, REND_MAX_STACKS, SUNDER_CUT, SUNDER_TURNS, RIPOSTE_SHARE,
    SHIELD_CAP, WARD_SOAK, SURGE_SWINGS, FREE_KINDS,
} from "@/lib/marketplace/arena-kit.js";
import { npcAbilities, npcFor, npcOffer, NPC_REACH } from "@/lib/marketplace/arena-npc.js";
import { ARMOURY, boutLaurels, featsFor, vpFor, vpPreview } from "@/lib/marketplace/arena-rewards.js";
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
// OWNER-GATED while it's built out. Every read and write goes through ARENA_UNLOCKED — one switch to open it,
// exactly as the mine and the dungeons did.
export const ARENA_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

// Flip BOTH of these together when the arena opens. The podium hands out real chests on a nightly cron, and
// every member already holds a seeded position — so while the feature is owner-gated it would be paying people
// for a ladder they cannot open and never entered.
export const ARENA_PUBLIC = false;

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
export const arenaVigour = (level = 1, gearPower = 0) => Math.round(60 + level * 2.2 + gearPower * 0.55);
export const arenaMight = (level = 1, gearPower = 0) => Math.round(9 + level * 0.45 + gearPower * 0.11);
const powerOf = (level, gearPower) => arenaVigour(level, gearPower) + arenaMight(level, gearPower) * 4;

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// ── RANKS ────────────────────────────────────────────────────────────────────────────────────────────────────
// A rung number is a fact; a RANK is something you tell people. "I'm 34 of 83" says nothing at a glance, and
// climbing from 33 to 34 feels like nothing at all — so the ladder is cut into seven named bands, and crossing
// one is an event the game stops to celebrate.
//
// The thresholds are FRACTIONS of the ladder, not fixed rungs. The pack grows every week; a rank that means
// "top fifth of the Den" keeps meaning that, where "rung 60" would quietly get easier every time somebody joins.
export const RANKS = [
    { key: "stray", name: "Stray", at: 0.00, color: "#9aa0a6" },
    { key: "cub", name: "Cub", at: 0.12, color: "#7ed57e" },
    { key: "runner", name: "Runner", at: 0.28, color: "#6fd0ff" },
    { key: "hunter", name: "Hunter", at: 0.45, color: "#b98cff" },
    { key: "fang", name: "Fang", at: 0.62, color: "#ff9f1c" },
    { key: "warleader", name: "Warleader", at: 0.80, color: "#ff6f7d" },
    { key: "alpha", name: "Alpha", at: 0.95, color: "#ffd75e" },
];
export function rankFor(rung, size) {
    const frac = size > 0 ? rung / size : 0;
    let i = 0;
    for (let k = 0; k < RANKS.length; k += 1) if (frac >= RANKS[k].at) i = k;
    const next = RANKS[i + 1] || null;
    const floor = Math.ceil(RANKS[i].at * size);
    const ceil = next ? Math.ceil(next.at * size) : size;
    return {
        ...RANKS[i], index: i,
        icon: `/images/arena/rank-${RANKS[i].key}.webp`,
        next: next ? { ...next, icon: `/images/arena/rank-${next.key}.webp`, atRung: ceil } : null,
        // How far through this band you are, so the badge can carry a bar rather than just a word.
        into: Math.max(0, rung - floor), span: Math.max(1, ceil - floor),
        // Standing, stated the way a person would say it.
        beat: rung, of: size,
    };
}

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
function pickIncoming(b) {
    const ability = (b.foe.abilities || []).length && Math.random() < AI_ABILITY_CHANCE
        ? b.foe.abilities[Math.floor(Math.random() * b.foe.abilities.length)]
        : null;
    return {
        name: ability?.name || "a heavy swing",
        kind: ability?.kind || "swing",
        element: ability?.element || b.foe.element || null,
        sprite: ability?.sprite || null,
        power: ability && ["strike", "spell", "execute"].includes(ability.kind) ? ability.power : 1,
        isAbility: Boolean(ability),
    };
}

// A defender is not present, so their timing is their GEAR: better loadouts brace and land more reliably. It
// is deliberately capped below a good human — being outplayed by an absent opponent would feel like a cheat.
const foeGrade = (gearPower) => {
    const t = Math.max(0, Math.min(1, gearPower / 320));
    const r = Math.random();
    if (r < 0.15 + t * 0.35) return { atk: 1.3, def: 0.55 };
    if (r < 0.55 + t * 0.3) return { atk: 1.0, def: 0.32 };
    return { atk: 0.6, def: 0.12 };
};

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
                vigour: arenaVigour(level, gearPower),
                might: arenaMight(level, gearPower),
                power: powerOf(level, gearPower),
            };
        })
        .sort((a, b) => a.power - b.power);
}

export async function arenaPower(buyerId) {
    const [{ sumItemStats }, { getEquippedIds }] = await Promise.all([
        import("@/lib/marketplace/items.js"),
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
    const stats = sumItemStats(Object.values(bySlot || {}));
    const gearPower = Object.values(stats).reduce((n, v) => n + (Number(v) || 0), 0);
    return {
        level, gearPower, vigour: arenaVigour(level, gearPower), might: arenaMight(level, gearPower),
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
    const { sumItemStats } = await import("@/lib/marketplace/items.js");
    // getEquippedIds returns a {slot -> id} OBJECT; iterating it directly is a known landmine here.
    const bySlot = await getEquippedIds(buyerId).catch(() => ({}));
    const ids = Object.values(bySlot || {}).filter(Boolean);
    const me = await db.queryOne(`SELECT COALESCE(xp,0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(Number(me?.xp) || 0).level;
    const gearPower = Object.values(sumItemStats(ids) || {}).reduce((n, v) => n + (Number(v) || 0), 0);
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
    for (const a of kit.abilities) a.itemSprite = a.itemId ? art[a.itemId] || null : null;
    const stats = sumItemStats(ids) || {};
    return {
        level, gearPower,
        classId, taken, perks,
        arenaLevel: arenaLevelFor(Number(prog?.arena_xp) || 0).level,
        speed: speedOf(level, Number(stats.ferocity) || 0) + (perks.speed || 0),
        // Fortune already means "luck" everywhere else in the Den; in here it is what moves your crit chance,
        // so the dial sits on the gear you built rather than on anything you do in the moment.
        fortune: (Number(stats.fortune) || 0) + (perks.fortune || 0),
        // The tree and the upgrade tracks both land here, so the engine reads one set of numbers and does not
        // care which system paid for them.
        vigour: arenaVigour(level, gearPower) + Math.round(perks.vigour || 0),
        might: arenaMight(level, gearPower) + (perks.might || 0),
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
    // ── SEEDING ──────────────────────────────────────────────────────────────────────────────────────────
    // You join the ladder WHERE YOUR POWER PUTS YOU, not at the bottom. Entering at the bottom is what made
    // the first three fights of a geared member a waste of a day: eighty opponents who cannot beat them,
    // three at a time. Everybody at or below the slot shuffles down one to make room.
    if (row && row.position == null) {
        const me = await arenaPower(buyerId);
        const ladder = await ladderFor(buyerId);
        const stronger = ladder.filter((o) => o.power > me.vigour + me.might * 4).length;
        const slot = stronger + 1;
        await db.query(`UPDATE mkt_arena SET position = position + 1 WHERE position >= $1`, [slot]).catch(() => {});
        await db.query(`UPDATE mkt_arena SET position = $2, best_position = $2 WHERE buyer_id = $1`, [buyerId, slot]).catch(() => {});
        row = await db.queryOne(
            `SELECT a.*, ${DAY}::text AS today, a.fights_day::text AS fights_day_text,
                a.free_respec_day::text AS free_respec_day_text, b.gold AS gold_now
               FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id WHERE a.buyer_id = $1`, [buyerId]).catch(() => null);
    }
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
        `SELECT a.buyer_id, a.vp, a.position, a.wins, a.losses, a.best_streak, COALESCE(b.xp,0) AS xp,
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
            rank: i + 1,                       // derived from the ordering, not stored
            vp: Number(r.vp) || 0,
            name: r.display_name || r.alias || "A member",
            sprite: r.avatar_sprite_url || null,
            level, gearPower, wins: r.wins, losses: r.losses,
            power: powerOf(level, gearPower),
            vigour: arenaVigour(level, gearPower), might: arenaMight(level, gearPower),
        };
    });
}
const fightsUsed = (row) => (row?.fights_day_text === row?.today ? Number(row?.fights_today) || 0 : 0);
const saveBout = (buyerId, bout) =>
    db.query(`UPDATE mkt_arena SET bout_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, bout ? JSON.stringify(bout) : null]).catch(() => {});

// What a win at a given rung is worth. Climbing has to pay more than grinding the bottom, or the ladder is
// decoration on a farming loop.
export async function getArenaState(buyerId) {
    if (!ARENA_UNLOCKED(buyerId)) return { unlocked: false };
    const row = await arenaRow(buyerId);
    const [me, board, kit] = await Promise.all([arenaPower(buyerId), standings(), kitFor(buyerId)]);
    const used = fightsUsed(row);
    // The Stamina upgrade track buys extra challenges a day.
    const dailyFights = FIGHTS_PER_DAY + Math.round(upgradeEffects(row?.upgrades || {}).fights || 0);
    const pos = Number(row?.position) || board.length;
    const bout = row?.bout_json || null;

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
    const myPower = powerOf(me.level, me.gearPower);
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

    const myRank = (board.findIndex((o) => o.id === buyerId) + 1) || board.length;
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
        me: { ...me, name: "You", rank: myRank, vp: myVp, power: myPower, element: kit.element, abilities: kit.abilities },
        rank: myRank, size: board.length,
        vp: myVp, laurels: Number(row?.laurels) || 0,
        band: rankFor(Math.max(0, board.length - myRank), board.length),
        fightsLeft: Math.max(0, dailyFights - used), fightsPerDay: dailyFights,
        stats: {
            wins: Number(row?.wins) || 0, losses: Number(row?.losses) || 0,
            streak: Number(row?.streak) || 0, bestStreak: Number(row?.best_streak) || 0,
            bestVp: Number(row?.best_vp) || myVp,
            npcBest,
        },
        targets,
        gauntlet,
        armoury: ARMOURY,
        progress,
        upgrades: upgradeView(row?.upgrades || {}),
        gold: Number(row?.gold_now) || 0,
        // The top of the Den, always visible — a ladder you cannot see the top of is just a number.
        board: board.slice(0, 10).map((o) => ({ rank: o.rank, vp: o.vp, name: o.name, sprite: o.sprite, level: o.level, you: o.id === buyerId })),
        podium: PODIUM,
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

// The three chests handed out at the end of each day.
export const PODIUM = [
    { place: 1, chest: "gold" },
    { place: 2, chest: "iron" },
    { place: 3, chest: "wooden" },
];

// ── WHAT HAPPENED WHILE YOU WERE AWAY ────────────────────────────────────────────────────────────────────────
// The arena is asynchronous: you are challenged while you are asleep. Without this a member just finds their
// position changed and no explanation anywhere in the game.
//
// DEFENCES ONLY. It listed your own challenges too, so it popped up telling you about a fight you had just
// watched, won, and read a full recap of thirty seconds earlier. This screen is for what you DON'T already
// know: somebody came for your spot while you weren't looking.
async function awayReport(buyerId, row) {
    const since = row?.last_seen_at || null;
    const rows = await db.query(
        `SELECT ab.challenger_id, ab.defender_id, ab.challenger_won, ab.challenger_pos, ab.defender_pos, ab.rounds, ab.created_at,
                bc.display_name AS c_name, bc.alias AS c_alias, bc.avatar_sprite_url AS c_sprite,
                bd.display_name AS d_name, bd.alias AS d_alias, bd.avatar_sprite_url AS d_sprite
           FROM mkt_arena_bout ab
           JOIN mkt_buyer bc ON bc.id = ab.challenger_id
           JOIN mkt_buyer bd ON bd.id = ab.defender_id
          WHERE ab.defender_id = $1
            AND ($2::timestamptz IS NULL OR ab.created_at > $2)
          ORDER BY ab.created_at DESC LIMIT 12`,
        [buyerId, since]
    ).catch(() => []);
    if (!rows.length) return null;
    return rows.map((r) => ({
        defending: true,
        them: { name: r.c_name || r.c_alias, sprite: r.c_sprite },
        won: !r.challenger_won,          // you held the spot if the challenger lost
        myPos: r.defender_pos,
        rounds: r.rounds,
    }));
}

/** Mark the away report read, so it is shown once and not on every visit. */
export async function seenArena(buyerId) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    await db.query(`UPDATE mkt_arena SET last_seen_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getArenaState(buyerId)) };
}

// The client never sees the opponent's next pick — only what has already happened.
function publicBout(b) {
    return {
        foe: b.foe, beat: b.beat, turn: b.turn, hp: b.hp, foeHp: b.foeHp, maxHp: b.maxHp, foeMaxHp: b.foeMaxHp,
        cd: b.cd || {}, clash: b.clash, opener: b.opener || "you",
        me: b.me, shield: b.shield, surge: b.surge, underdog: b.underdog || 1, items: b.items || {},
        // The new lingering states. Without these the burn ticking their bar and the stripped guard would be
        // things the server knew about and the player could only infer from the log.
        bleed: b.bleed || null, sunder: b.sunder || 0, riposte: b.riposte || 0,
        incoming: b.incoming || null,
        // `tell` was published here and read on the ladder row, but nothing has ever assigned it — a leftover
        // of the rock-paper-scissors build, where the opponent's next stance was printed for you to counter.
        log: b.log || [], over: Boolean(b.over), won: Boolean(b.won), rankUp: b.rankUp || null,
        recap: b.recap || null,
        reward: b.reward || null,
    };
}

// ── FINDING A FIGHT ──────────────────────────────────────────────────────────────────────────────────────────
// One button, the way the sea does it. The list was two stacked lists of eighty rows asking you to compare
// strangers before you had fought once — and the comparison is not a decision anybody has the information to
// make, because a name and a vigour number do not tell you whether you can take them.
//
// "Someone your own size" is a POWER ratio, aimed a shade in your favour: this is a fight against the Den, not
// a ladder rung you have to earn. Members and Gauntlet tiers go in the same hat; a real member is weighted up,
// because beating a person is a better story than beating a dummy — but only when one of them is your size.
const TARGET_RATIO = 0.95;   // their power against yours: a shade in your favour
const SHORTLIST = 7;         // how many of the closest go in the hat
const MEMBER_WEIGHT = 1.6;   // a person beats a dummy, when there is one your size

function matchArenaOpponent(buyerId, myPower, board, bestTier) {
    const dist = (p) => Math.abs(p / Math.max(1, myPower) - TARGET_RATIO);
    const all = [];
    for (const o of board) {
        if (String(o.id) === String(buyerId)) continue;
        all.push({ kind: "member", id: o.id, boost: MEMBER_WEIGHT, d: dist(o.power || 0) });
    }
    // Only tiers you are allowed to fight — the same reach the explicit path enforces, so matchmaking can
    // never hand you a tier a crafted POST would have been refused.
    const maxTier = Math.max(1, (Number(bestTier) || 0) + NPC_REACH);
    for (let t = 1; t <= maxTier; t += 1) {
        const n = npcFor(t);
        if (!n) break;
        all.push({ kind: "npc", tier: t, boost: 1, d: dist((n.vigour || 0) + (n.might || 0) * 4) });
    }
    if (!all.length) return null;
    all.sort((a, z) => a.d - z.d);
    const shortlist = all.slice(0, SHORTLIST).map((c, i) => ({ ...c, w: c.boost / (1 + i) }));
    let roll = Math.random() * shortlist.reduce((sum, c) => sum + c.w, 0);
    return shortlist.find((c) => (roll -= c.w) <= 0) || shortlist[0];
}

export async function startBout(buyerId, targetId = null) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await arenaRow(buyerId);
    if (row?.bout_json && !row.bout_json.over) return { ok: false, error: "bout_in_progress", ...(await getArenaState(buyerId)) };
    if (fightsUsed(row) >= FIGHTS_PER_DAY) return { ok: false, error: "no_fights", ...(await getArenaState(buyerId)) };

    const board = await standings();
    const me = await kitFor(buyerId);
    const myPower = powerOf(me.level, me.gearPower);

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
    let foe = null;
    let foeKit = null;
    if (npcTier > 0) {
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
        foeKit = { ...n, abilities: npcAbilities(npcTier), vigour: n.vigour };
    } else {
        foe = board.find((o) => o.id === target);
        if (!foe) return { ok: false, error: "bad_target", ...(await getArenaState(buyerId)) };
        foeKit = await kitFor(foe.id);
    }

    const clash = elementClash(me.element, foeKit.element);
    const theirPower = npcTier > 0 ? foe.gearPower : foe.power;
    const bout = {
        myPower, theirPower, npcTier, size: board.length,
        foe: {
            id: foe.id, name: foe.name, sprite: foe.sprite, level: foe.level || null,
            npc: Boolean(npcTier), tier: npcTier || null,
            element: foeKit.element, abilities: foeKit.abilities, might: foeKit.might, gearPower: foeKit.gearPower,
            speed: foeKit.speed, fortune: foeKit.fortune,
        },
        // gearPower is load-bearing and was MISSING: the Giant-Killer feat tests
        // foe.gearPower >= me.gearPower * 1.25, so with me.gearPower undefined the comparison was
        // "anything >= 0" and it fired on EVERY win — including beating a Straw Dummy.
        // `perks` RIDES ALONG NOW, and that is the whole fix for a shield build that did nothing. The tree's
        // stat nodes were merged into vigour/might/speed/fortune at kit time and then thrown away, so the
        // fifteen that are not one of those four — thorns, regen, block, guardSoak, riposteShare, lastStand,
        // shieldCap, wardSoak, critMult, openMult, lowHpDmg, pierce, spellPower, elementEdge, rendTick — were
        // read by nothing at all. Iron Thorns returned nothing. Fortress soaked nothing. Overkill did nothing.
        me: { element: me.element, abilities: me.abilities, might: me.might, speed: me.speed,
            fortune: me.fortune, gearPower: me.gearPower, level: me.level, perks: me.perks || {} },
        clash,                                   // your affinity against theirs, decided before a blow lands
        underdog: underdogEdge(me.gearPower, foeKit.gearPower),   // 1 unless they badly outgear you
        hp: me.vigour, maxHp: me.vigour,
        foeHp: foeKit.vigour, foeMaxHp: foeKit.vigour,
        cd: {},                                  // abilityId -> turns before it can be used again
        items: Object.fromEntries(BATTLE_ITEMS.map((i) => [i.id, i.count])),
        // SPEED takes the first beat. A tie keeps it with the challenger, so bringing the fight still counts
        // for something. Opening a ten-beat exchange is a real edge, which is what makes Ferocity worth wearing.
        turn: me.speed >= foeKit.speed ? "you" : "them",
        opener: me.speed >= foeKit.speed ? "you" : "them",
        beat: 1, log: [], over: false, won: false,
        shield: 0, surge: 0,                     // ward soaks the next blow; surge sharpens your next swing
        bleed: null, sunder: 0, riposte: 0,      // rend burns, sunder strips guard, riposte answers back
    };
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
    await trackActivity(buyerId, "arena_start", { target: foe.id, npcTier: npcTier || null, theirPower }).catch(() => {});
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
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await arenaRow(buyerId);
    const b = row?.bout_json;
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
    const ATTACK = 1.15;   // was ATTACK, which averaged ~1.15 across a real spread of taps
    const BLOCK = 0.34;    // was BLOCK, which averaged ~0.34
    const hit = (m) => randInt(Math.round(m * 0.85), Math.round(m * 1.18));

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
    const CRIT_BASE = 0.12;
    const CRIT_PER_FORTUNE = 0.0035;
    const CRIT_CAP = 0.38;
    const CRIT_MULT = 1.8;
    // Everything the skill tree bought you that is not already baked into a stat. `|| {}` because a bout that
    // was already open when this shipped has no perks on it.
    const P = b.me?.perks || {};
    const critFor = (fortune) => Math.min(CRIT_CAP, CRIT_BASE + (Number(fortune) || 0) * CRIT_PER_FORTUNE);
    const critChance = Math.min(CRIT_CAP + (P.crit || 0), critFor(b.me?.fortune) + (P.crit || 0));
    const myCritMult = CRIT_MULT + (P.critMult || 0);
    const foeCritChance = critFor(b.foe?.fortune);
    if (!b.items) b.items = Object.fromEntries(BATTLE_ITEMS.map((i) => [i.id, i.count]));
    if (!b.cd) b.cd = {};
    const cool = (n) => { for (const k of Object.keys(b.cd)) b.cd[k] = Math.max(0, (b.cd[k] || 0) - n); };

    // ── DEFENSIVE SKILL ── played during their wind-up, and it does NOT consume the beat: you still block.
    // Wards were only usable on your own turn, which meant spending a swing to brace for a blow you could see
    // coming — the one moment the ability is actually for was the one moment you couldn't use it.
    if (!mine && command === "defend") {
        const ward = (b.me.abilities || []).find((x2) => x2.id === opts.abilityId && x2.defensive);
        if (!ward) return { ok: false, error: "no_ability", ...(await getArenaState(buyerId)) };
        if ((b.cd[ward.id] || 0) > 0) return { ok: false, error: "cooling", ...(await getArenaState(buyerId)) };
        b.cd[ward.id] = ward.cooldown || 0;
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
                text = healed > 0 ? `${it.name} — ${healed} vigour back.` : `${it.name} — already whole.`;
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
            b.cd[ability.id] = ability.cooldown || 0;
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
        let drain = 0;             // share of damage returned to you as vigour
        let rend = false;          // leaves a burn behind
        let sunder = false;        // strips their guard for a few turns
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
            b.cd[ability.id] = ability.cooldown || 0;
            power = ability.power;
            note = ` · ${ability.name}`;
            // ward and riposte never reach here — they resolve above as free actions and keep your beat.
            if (ability.kind === "surge") { b.surge = SURGE_SWINGS; power = 0; note += " — sharpened"; }
            if (ability.kind === "execute" && b.foeHp <= b.foeMaxHp * 0.35) { power *= 1.5; note += " — EXECUTE"; }
            if (ability.kind === "gamble") { power = Math.random() < 0.5 ? power * 2 : 0; note += power ? " — it pays" : " — nothing"; }
            if (ability.kind === "strike") {
                // Amplifies the timing band around 1.0 — a flawless strike hits far harder than a sloppy one,
                // more so than any other kind. High variance, paid for with execution rather than power.
                gradeAtk = 1 + (ATTACK - 1) * 1.45;
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
        const surge = b.surge > 0 ? 1.5 : 1;
        if (b.surge > 0) b.surge -= 1;
        // Their gear defends them too. Without this the attacker always lands full and the better loadout
        // means nothing — 100% win rates at every level of play, in 4,000 simulated bouts a cell.
        // Their guard, minus whatever a Sunder has already stripped off it.
        const sundered = (b.sunder || 0) > 0 ? 1 - SUNDER_CUT : 1;
        const guard = foeGrade(b.foe.gearPower || 0).def * pierce * sundered;
        // A ward or a surge deals no damage, so it cannot crit — a "Critical" over a move that did nothing
        // would be the loudest possible way to say nothing happened.
        // EVERY blow of a flurry rolls separately, which is the whole point of it.
        let dmg = 0;
        let crit = false;
        for (let i = 0; i < hits && power > 0; i += 1) {
            const c = Math.random() < critChance;
            if (c) crit = true;
            const raw = hit(b.me.might * SWING) * gradeAtk * power * surge * clashMult * (b.underdog || 1)
                * openMult * lowHpMult * (c ? myCritMult : 1);
            dmg += Math.max(1, Math.round(raw - raw * guard));
        }
        b.foeHp = Math.max(0, b.foeHp - dmg);

        // What the move leaves behind.
        let healed = 0;
        if (drain > 0 && dmg > 0) {
            healed = Math.min(b.maxHp - b.hp, Math.round(dmg * drain));
            b.hp += healed;
        }
        if (rend && dmg > 0) {
            // Stacks with itself rather than refreshing, so leaning on a burn kit is a real plan — but only
            // up to REND_MAX_STACKS. Uncapped it won 83.8% of simulated bouts in under six beats.
            // Slow Burn: each rank makes the burn tick for more of their vigour.
            const per = Math.max(1, Math.round(b.foeMaxHp * (REND_PER_TURN + (P.rendTick || 0))));
            const stacks = Math.min(REND_MAX_STACKS, (b.bleed?.stacks || 0) + 1);
            b.bleed = { turns: REND_TURNS, stacks, dmg: per * stacks };
        }
        if (sunder) b.sunder = SUNDER_TURNS;

        const extra = [
            healed > 0 ? `+${healed} back` : null,
            rend && dmg > 0 ? `burning ${b.bleed.dmg}/turn` : null,
            sunder ? `guard stripped` : null,
            hits > 1 ? `${hits} hits` : null,
        ].filter(Boolean).join(", ");
        b.log.push({ beat: b.beat, who: "you", grade: ability ? "skill" : "hit", damage: dmg, crit,
            hits, healed, kind: ability?.kind || "hit",
            text: dmg > 0
                ? `${crit ? "CRITICAL — " : ""}${ability ? ability.name : "You strike"} — ${dmg}${extra ? ` (${extra})` : ""}.`
                : `${ability ? ability.name : "You strike"}${note.replace(` · ${ability?.name}`, "")}.`,
            ability: ability?.name || null });
        b.turn = "them";
    } else {
        // ── THEIR SWING ── the ring closed over you, and you were bracing.
        const fg = foeGrade(b.foe.gearPower || 0);
        // Whatever was telegraphed is what lands. Rolling again here would make the warning a lie.
        const incoming = b.incoming || pickIncoming(b);
        const theirAbility = incoming.isAbility ? incoming : null;
        const power = incoming.power || 1;
        // Their element against yours is the mirror of yours against theirs.
        const back = 1 / (b.clash?.mult || 1);
        const foeCrit = Math.random() < foeCritChance;
        const raw = Math.max(1, Math.round(hit(b.foe.might * SWING * PUNCH) * fg.atk * power * back * (foeCrit ? CRIT_MULT : 1)));
        // Your stance is a BLOCK: BLOCK is how much of it you turned aside. A guard soaks what's left.
        // Footwork adds to it — a Warden who bought five ranks turns aside 44% rather than 34%.
        const blocked = Math.round(raw * Math.min(0.7, BLOCK + (P.block || 0)));
        let through = Math.max(0, raw - blocked);
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
            riposted: sent + thorned,
            text: `${foeCrit ? "CRITICAL — " : ""}${theirAbility
                ? `${b.foe.name} casts ${theirAbility.name} — you turn aside ${blocked}, ${through} lands.`
                : `${b.foe.name} swings — you turn aside ${blocked}, ${through} lands.`}${sent ? ` ${sent} comes straight back.` : ""}${thorned ? ` Your thorns bite for ${thorned}.` : ""}${stood ? " YOU WILL NOT FALL." : ""}`,
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
    const laurels = baseLaurels + featLaurels;

    // Gold and XP still pay on a win, unchanged — this sits on top rather than replacing them.
    let reward = null;
    if (won) {
        const gold = Math.round(40 + theirPower * 0.9);
        const xp = Math.round(18 + theirPower * 0.4);
        reward = { gold, xp, vp, laurels, feats, arenaXp: axp };
        const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
        await logCoin(buyerId, gold, "arena_win", { balanceAfter: g?.gold, meta: { foe: b.foe.id, vp } }).catch(() => {});
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

    // Where that leaves you on the board. Read BACK rather than assumed — the recap is the only thing telling
    // somebody what changed, so it has to report what actually happened.
    const after = await db.queryOne(
        `SELECT (SELECT COUNT(*) + 1 FROM mkt_arena x JOIN mkt_buyer xb ON xb.id = x.buyer_id
                  WHERE COALESCE(xb.xp,0) > 0 AND x.vp > a.vp) AS rank,
                (SELECT COUNT(*) FROM mkt_arena y JOIN mkt_buyer yb ON yb.id = y.buyer_id WHERE COALESCE(yb.xp,0) > 0) AS size,
                a.vp
           FROM mkt_arena a WHERE a.buyer_id = $1`, [buyerId]
    ).catch(() => null);
    const size = Number(after?.size) || b.size || 0;
    const rankTo = Number(after?.rank) || 0;

    b.recap = {
        won, foe: b.foe, reward, feats,
        vpGain: vp, vpFrom: vpBefore, vpTo: Number(after?.vp) ?? vpAfter,
        rankTo, size,
        npcTier: npcTier || null,
        npcUnlocked: won && npcTier > 0 && npcTier > (Number(row?.npc_best) || 0),
        streak: streakNow, bestStreak: Math.max(Number(row?.best_streak) || 0, streakNow),
        rounds: b.beat || (b.log || []).length,
    };
    b.rankUp = null;

    // Recorded from BOTH sides. A defender was asleep; this is the only way they ever find out. An NPC has no
    // buyer row, so defender_id is null for a Gauntlet bout and the tier is recorded instead.
    await db.query(
        `INSERT INTO mkt_arena_bout (challenger_id, defender_id, npc_tier, challenger_won, rounds, vp, laurels, feats)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [buyerId, npcTier > 0 ? null : b.foe.id, npcTier || null, won, (b.log || []).length, vp, laurels,
            JSON.stringify(feats.map((f) => f.id))]
    ).catch(() => {});

    await trackActivity(buyerId, won ? "arena_win" : "arena_loss",
        { foe: b.foe.id, vp, laurels, npcTier: npcTier || null, feats: feats.map((f) => f.id) }).catch(() => {});

    // getArenaState RE-READS the bout out of the database, so if that write above lost for any reason it would
    // hand back the un-finished bout and quietly erase a fight the player had already won — a modal flashing
    // up and then a screen with no way off it. The bout we just resolved is the truth; say so explicitly.
    const state = await getArenaState(buyerId);
    return { ok: true, finished: { won, reward, feats }, ...state, bout: publicBout(b) };
}

// ── SEEDING THE LADDER ───────────────────────────────────────────────────────────────────────────────────────
// Rebuild every position from power, using the SAME calculation the game fights with. This exists because the
// first seed was done by a throwaway script that re-implemented gearPower from the items catalog and quietly
// left out forge enhancements — 198 stat points across 19 members, which put 10 of 84 people in the wrong
// order. Anything that needs to know how strong somebody is has to ask the same function the arena asks.
//
// Run it at launch, and any time the ladder needs flattening back to merit.
export async function seedArenaLadder() {
    const { getEquippedStatsForMembers } = await import("@/lib/marketplace/inventory.js");
    const members = await db.query(`SELECT id, alias, COALESCE(xp,0) AS xp FROM mkt_buyer WHERE COALESCE(xp,0) > 0`).catch(() => []);
    if (!members.length) return { ok: false, error: "no_members" };
    const stats = await getEquippedStatsForMembers(members.map((m) => m.id)).catch(() => new Map());
    const ranked = members
        .map((m) => {
            const level = levelForXp(Number(m.xp) || 0).level;
            const gearPower = Object.values(stats.get(m.id) || {}).reduce((n, v) => n + (Number(v) || 0), 0);
            return { id: m.id, alias: m.alias, power: powerOf(level, gearPower) };
        })
        .sort((a, b) => b.power - a.power || String(a.alias).localeCompare(String(b.alias)));

    // Park everyone negative first: position carries a unique index, so reassigning in place collides mid-flight.
    await db.query(`UPDATE mkt_arena SET position = -position WHERE position > 0`).catch(() => {});
    for (let i = 0; i < ranked.length; i += 1) {
        await db.query(
            `INSERT INTO mkt_arena (buyer_id, position, best_position) VALUES ($1, $2, $2)
             ON CONFLICT (buyer_id) DO UPDATE SET position = $2, best_position = $2`,
            [ranked[i].id, i + 1]
        ).catch(() => {});
    }
    await db.query(`UPDATE mkt_arena SET position = NULL WHERE position < 0`).catch(() => {});
    return { ok: true, seeded: ranked.length, top: ranked.slice(0, 5).map((r) => r.alias) };
}

// ── THE PODIUM ───────────────────────────────────────────────────────────────────────────────────────────────
// First, second and third at the end of the day take a gold, iron and wooden chest. Idempotent per day via
// prize_day, so running the cron twice cannot pay twice.
export async function payArenaPodium() {
    // NOT WHILE THE ARENA IS OWNER-GATED. Every member was seeded a position so the ladder exists on day one,
    // but they cannot open the feature — paying the top three a chest tonight would hand out real rewards for
    // something nobody can play, to people who never entered. The gate is the same one the rest of the arena
    // reads, so opening the arena opens the podium with it and this needs no second switch.
    if (!ARENA_PUBLIC) return { ok: true, skipped: "arena_not_public", paid: [] };
    const day = await db.queryOne(`SELECT ${DAY}::text AS d`).catch(() => null);
    if (!day?.d) return { ok: false, error: "no_day" };
    // BY VICTORY POINTS, not by `position`. That column stopped being authoritative when the ladder moved to
    // an accrued total, so this would have quietly kept paying the top three of a frozen, retired ordering —
    // a nightly cron handing out real chests to the wrong people, silently, forever.
    const top = await db.query(
        `SELECT a.buyer_id, ROW_NUMBER() OVER (ORDER BY a.vp DESC, a.wins DESC) AS place
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
          WHERE COALESCE(b.xp,0) > 0 AND a.vp > 0
            AND (a.prize_day IS DISTINCT FROM ${DAY})
          ORDER BY a.vp DESC, a.wins DESC LIMIT 3`
    ).catch(() => []);
    const paid = [];
    for (const r of top) {
        const spec = PODIUM.find((x) => x.place === Number(r.place));
        if (!spec) continue;
        // Claim the day FIRST and only pay if the claim took, so a second run finds nothing to do.
        const claimed = await db.queryOne(
            `UPDATE mkt_arena SET prize_day = ${DAY} WHERE buyer_id = $1 AND (prize_day IS DISTINCT FROM ${DAY}) RETURNING buyer_id`,
            [r.buyer_id]
        ).catch(() => null);
        if (!claimed) continue;
        await addChests(r.buyer_id, { [spec.chest]: 1 }, { source: "arena_podium" }).catch(() => {});
        await trackActivity(r.buyer_id, "arena_podium", { place: Number(r.place), chest: spec.chest }).catch(() => {});
        paid.push({ buyerId: r.buyer_id, place: Number(r.place), chest: spec.chest });
    }
    return { ok: true, day: day.d, paid };
}

/** Clear a finished bout so the ladder comes back. */
export async function clearBout(buyerId) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    await saveBout(buyerId, null);
    return { ok: true, ...(await getArenaState(buyerId)) };
}
