import "server-only";

import { db } from "@/lib/db";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── THE ARENA ────────────────────────────────────────────────────────────────────────────────────────────────
// PvP as a LADDER. The pack is sorted weakest to strongest and you start at the bottom; every win moves you up
// one rung. Your opponents are real members with their real level, real gear and real hero — but nobody has to
// be online, because you fight their LOADOUT, not their attention.
//
// OWNER-GATED while it's built out. Every read and write goes through ARENA_UNLOCKED — one switch to open it,
// exactly as the mine and the dungeons did.
export const ARENA_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
export const FIGHTS_PER_DAY = 3;

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

// ── STANCES ──────────────────────────────────────────────────────────────────────────────────────────────────
// Rock-paper-scissors with teeth, and the reason this is a game rather than a stat comparison. A pure
// power-versus-power bout would mean the ladder is just a list of people you cannot beat yet; reading your
// opponent lets a weaker fighter take a rung off someone above them, which is the whole appeal of a ladder.
//
//   STRIKE beats FEINT   — they commit to nothing, you land clean
//   GUARD  beats STRIKE  — you eat none of it and counter
//   FEINT  beats GUARD   — they brace against a blow that never comes
//   a mirror trades      — both graze
export const STANCES = ["strike", "guard", "feint"];
const BEATS = { strike: "feint", guard: "strike", feint: "guard" };
export const STANCE_META = {
    strike: { label: "Strike", desc: "Full damage — unless they're guarding." },
    guard: { label: "Guard", desc: "Nothing lands, and you counter. Beaten by a feint." },
    feint: { label: "Feint", desc: "Punishes a guard. Nothing against a strike." },
};

// ── HOW AN OPPONENT FIGHTS ───────────────────────────────────────────────────────────────────────────────────
// A fixed STYLE per member, derived from a hash of their id, so a rival always fights the same way and learning
// your neighbours is a real edge.
//
// The first cut read the style off their might-to-vigour ratio, which was measured and thrown away: both stats
// scale almost proportionally off level and gear, so the ratio only moves from 1.50 at level 1 to 1.93 at level
// 55. Every member in the Den landed in the same bucket. The tell would have printed the same sentence for all
// 84 of them and the answer would always have been "strike" — a mechanic that looks like a read and is really a
// button. Simulated over 3,000 bouts per cell, styles that actually differ are worth 27 points of win rate to a
// player who reads them, and strike-spam into a patient fighter wins 18%.
const STYLES = {
    aggressive: { w: { strike: 0.55, guard: 0.18, feint: 0.27 }, tell: "Comes forward. Most of what they throw is a strike." },
    patient: { w: { strike: 0.20, guard: 0.53, feint: 0.27 }, tell: "Waits behind a guard and makes you come to them." },
    tricky: { w: { strike: 0.26, guard: 0.22, feint: 0.52 }, tell: "Deals in feints. Committing early gets punished." },
};
const STYLE_KEYS = Object.keys(STYLES);
// FNV-1a — the same stable hash the town quests rotate on.
function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const tendency = (id) => STYLES[STYLE_KEYS[hashStr(String(id)) % STYLE_KEYS.length]];

// How hard a guard punishes a strike thrown into it. This is THE tuning dial: at 0.55 the downside of striking
// was so much smaller than its upside that spamming strike beat playing well (90% vs 81%), which would have
// made the whole stance system decorative. At 0.9 reading is worth 27 points over spamming.
const COUNTER = 0.9;

function pickStance(w) {
    let r = Math.random();
    for (const s of STANCES) { r -= w[s]; if (r <= 0) return s; }
    return "feint";
}

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

async function arenaRow(buyerId) {
    await db.query(`INSERT INTO mkt_arena (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    return db.queryOne(`SELECT *, ${DAY}::text AS today, fights_day::text AS fights_day_text FROM mkt_arena WHERE buyer_id = $1`, [buyerId]).catch(() => null);
}
const fightsUsed = (row) => (row?.fights_day_text === row?.today ? Number(row?.fights_today) || 0 : 0);
const saveBout = (buyerId, bout) =>
    db.query(`UPDATE mkt_arena SET bout_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, bout ? JSON.stringify(bout) : null]).catch(() => {});

// What a win at a given rung is worth. Climbing has to pay more than grinding the bottom, or the ladder is
// decoration on a farming loop.
const winGold = (rung) => 60 + rung * 14;
const winXp = (rung) => 25 + rung * 7;
const chestAt = (rung) => ((rung + 1) % 5 === 0 ? (rung >= 14 ? "gold" : "iron") : null);

export async function getArenaState(buyerId) {
    if (!ARENA_UNLOCKED(buyerId)) return { unlocked: false };
    const row = await arenaRow(buyerId);
    const [me, ladder] = await Promise.all([arenaPower(buyerId), ladderFor(buyerId)]);
    const used = fightsUsed(row);
    const rung = Math.min(Number(row?.rung) || 0, Math.max(0, ladder.length));
    const next = ladder[rung] || null;
    // The bout is returned EVEN WHEN IT IS OVER. Dropping it the instant somebody fell meant the client
    // snapped back to the ladder mid-swing: the killing blow, the result card and the rank-up were all
    // unreachable code. It is cleared by the Back-to-the-ladder tap (clearBout), which is what that verb is
    // for. startBout still refuses to deal a new one while an UNFINISHED bout is on the row.
    const bout = row?.bout_json || null;

    return {
        unlocked: true,
        me: { ...me, name: "You" },
        rung, ladderSize: ladder.length,
        rank: rankFor(rung, ladder.length),
        cleared: rung >= ladder.length && ladder.length > 0,
        fightsLeft: Math.max(0, FIGHTS_PER_DAY - used),
        stats: {
            wins: Number(row?.wins) || 0, losses: Number(row?.losses) || 0,
            streak: Number(row?.streak) || 0, bestStreak: Number(row?.best_streak) || 0,
            bestRung: Number(row?.best_rung) || 0,
        },
        // The rung you're on, plus a peek at who is above — the ladder is more motivating when you can see it.
        next: next ? { ...next, tell: tendency(next.id).tell, reward: { gold: winGold(rung), xp: winXp(rung), chest: chestAt(rung) } } : null,
        upcoming: ladder.slice(rung, rung + 6).map((o, i) => ({
            name: o.name, sprite: o.sprite, level: o.level, power: o.power, rung: rung + i,
        })),
        beaten: ladder.slice(Math.max(0, rung - 3), rung).map((o) => ({ name: o.name, sprite: o.sprite, level: o.level })),
        bout: bout ? publicBout(bout) : null,
    };
}

// The client never sees the opponent's next pick — only what has already happened.
function publicBout(b) {
    return {
        foe: b.foe, round: b.round, hp: b.hp, foeHp: b.foeHp, maxHp: b.maxHp, foeMaxHp: b.foeMaxHp,
        log: b.log || [], over: Boolean(b.over), won: Boolean(b.won), tell: b.tell, rankUp: b.rankUp || null,
        recap: b.recap || null,
        reward: b.reward || null,
    };
}

export async function startBout(buyerId) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await arenaRow(buyerId);
    if (row?.bout_json && !row.bout_json.over) return { ok: false, error: "bout_in_progress", ...(await getArenaState(buyerId)) };
    if (fightsUsed(row) >= FIGHTS_PER_DAY) return { ok: false, error: "no_fights", ...(await getArenaState(buyerId)) };

    const [me, ladder] = await Promise.all([arenaPower(buyerId), ladderFor(buyerId)]);
    const rung = Math.min(Number(row?.rung) || 0, Math.max(0, ladder.length));
    const foe = ladder[rung];
    if (!foe) return { ok: false, error: "ladder_cleared", ...(await getArenaState(buyerId)) };

    const bout = {
        rung, ladderSize: ladder.length,
        foe: { id: foe.id, name: foe.name, sprite: foe.sprite, flip: foe.flip, level: foe.level, might: foe.might },
        tell: tendency(foe.id).tell,
        w: tendency(foe.id).w,
        might: me.might, foeMight: foe.might,
        hp: me.vigour, maxHp: me.vigour,
        foeHp: foe.vigour, foeMaxHp: foe.vigour,
        round: 1, log: [], over: false, won: false,
    };
    // The day is claimed at the DOOR, not on victory — otherwise a loss costs nothing and you re-roll forever.
    await db.query(
        `UPDATE mkt_arena SET bout_json = $2::jsonb, fights_day = ${DAY},
            fights_today = CASE WHEN fights_day = ${DAY} THEN fights_today + 1 ELSE 1 END, updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(bout)]
    ).catch(() => {});
    await trackActivity(buyerId, "arena_start", { rung, foe: foe.id }).catch(() => {});
    return { ok: true, ...(await getArenaState(buyerId)) };
}

/** One exchange. Your stance against theirs, resolved on the server so the pick can't be read or replayed. */
export async function fightRound(buyerId, stance) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    if (!STANCES.includes(stance)) return { ok: false, error: "bad_stance" };
    const row = await arenaRow(buyerId);
    const b = row?.bout_json;
    if (!b || b.over) return { ok: false, error: "no_bout", ...(await getArenaState(buyerId)) };

    const theirs = pickStance(b.w);
    const hit = (m) => randInt(Math.round(m * 0.78), Math.round(m * 1.28));
    let line;
    if (stance === theirs) {
        const a = Math.round(hit(b.might) * 0.3), d = Math.round(hit(b.foeMight) * 0.3);
        b.foeHp -= a; b.hp -= d;
        line = `Both ${STANCE_META[stance].label.toLowerCase()} — you trade. -${d} you, -${a} them.`;
    } else if (BEATS[stance] === theirs) {
        if (stance === "guard") {
            const c = Math.round(hit(b.might) * COUNTER);
            b.foeHp -= c;
            line = `They struck into your guard. Nothing lands, and you counter for ${c}.`;
        } else {
            const a = hit(b.might);
            b.foeHp -= a;
            line = `Your ${STANCE_META[stance].label.toLowerCase()} beats their ${theirs} — ${a}.`;
        }
    } else {
        if (theirs === "guard") {
            const c = Math.round(hit(b.foeMight) * COUNTER);
            b.hp -= c;
            line = `You struck into their guard. They counter for ${c}.`;
        } else {
            const d = hit(b.foeMight);
            b.hp -= d;
            line = `Their ${theirs} beats your ${STANCE_META[stance].label.toLowerCase()} — ${d}.`;
        }
    }
    b.hp = Math.max(0, b.hp); b.foeHp = Math.max(0, b.foeHp);
    b.log.push({ round: b.round, you: stance, them: theirs, text: line });
    b.round += 1;

    if (b.foeHp <= 0 || b.hp <= 0) return finishBout(buyerId, row, b, b.foeHp <= 0 && b.hp > 0);
    await saveBout(buyerId, b);
    return { ok: true, ...(await getArenaState(buyerId)) };
}

async function finishBout(buyerId, row, b, won) {
    b.over = true; b.won = won;
    let reward = null;
    if (won) {
        const gold = winGold(b.rung), xp = winXp(b.rung), chest = chestAt(b.rung);
        const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
        await logCoin(buyerId, gold, "arena_win", { balanceAfter: g?.gold, meta: { rung: b.rung, foe: b.foe.id } }).catch(() => {});
        // gold: 0 is load-bearing — awardXp pays gold 1:1 with points otherwise, and the purse above IS the gold.
        await awardXp(buyerId, "arena_win", { points: xp, gold: 0 }).catch(() => {});
        if (chest) await addChests(buyerId, { [chest]: 1 }, { source: "arena" }).catch(() => {});
        reward = { gold, xp, chest };
    }
    b.reward = reward;
    // ── THE RECAP ────────────────────────────────────────────────────────────────────────────────────────
    // Everything that changed, worked out HERE where the before and the after are both known for certain.
    // Without it the result card said "you beat Miles, +74 gold" and nothing else — your rung moved, your rank
    // bar moved, your streak moved, and the next opponent got harder, so winning read like sliding backwards.
    const size = b.ladderSize || 0;
    const rungFrom = b.rung;
    const rungTo = b.rung + (won ? 1 : 0);
    const wasRank = rankFor(rungFrom, size);
    const nowRank = rankFor(rungTo, size);
    b.rankUp = won && nowRank.key !== wasRank.key ? { from: wasRank.name, to: nowRank.name, icon: nowRank.icon, color: nowRank.color } : null;
    const streakNow = won ? (Number(row?.streak) || 0) + 1 : 0;
    b.recap = {
        won, foe: b.foe, reward,
        rungFrom, rungTo, ladderSize: size,
        rank: { name: nowRank.name, icon: nowRank.icon, color: nowRank.color, into: nowRank.into, span: nowRank.span, next: nowRank.next?.name || null },
        rankUp: b.rankUp,
        streak: streakNow, bestStreak: Math.max(Number(row?.best_streak) || 0, streakNow),
        rounds: (b.log || []).length,
        // What is waiting on the new rung, so "what changed" includes what comes next.
        remaining: Math.max(0, size - rungTo),
    };
    // A loss costs the attempt and the streak, and nothing else. It never sends you back down a rung — the
    // ladder is something you climb, not something that can push you off.
    await db.query(
        `UPDATE mkt_arena SET bout_json = $2::jsonb,
            rung = rung + $3, best_rung = GREATEST(best_rung, rung + $3),
            wins = wins + $3, losses = losses + $4,
            streak = CASE WHEN $3 = 1 THEN streak + 1 ELSE 0 END,
            best_streak = GREATEST(best_streak, CASE WHEN $3 = 1 THEN streak + 1 ELSE 0 END),
            updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(b), won ? 1 : 0, won ? 0 : 1]
    ).catch(() => {});
    await trackActivity(buyerId, won ? "arena_win" : "arena_loss", { rung: b.rung, foe: b.foe.id }).catch(() => {});
    return { ok: true, finished: { won, rung: b.rung, foe: b.foe, reward, rankUp: b.rankUp }, ...(await getArenaState(buyerId)) };
}

/** Clear a finished bout so the ladder comes back. */
export async function clearBout(buyerId) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    await saveBout(buyerId, null);
    return { ok: true, ...(await getArenaState(buyerId)) };
}

/** The standings board — who has climbed highest. */
export async function arenaBoard(limit = 10) {
    const rows = await db.query(
        `SELECT a.best_rung, a.best_streak, a.wins, b.display_name, b.alias, b.avatar_sprite_url
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
          WHERE a.best_rung > 0 ORDER BY a.best_rung DESC, a.best_streak DESC LIMIT $1`, [limit]
    ).catch(() => []);
    return rows.map((r, i) => ({
        place: i + 1, name: r.display_name || r.alias || "A member",
        sprite: r.avatar_sprite_url || null, rung: r.best_rung, streak: r.best_streak, wins: r.wins,
    }));
}
