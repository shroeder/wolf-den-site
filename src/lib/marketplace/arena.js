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

// Flip BOTH of these together when the arena opens. The podium hands out real chests on a nightly cron, and
// every member already holds a seeded position — so while the feature is owner-gated it would be paying people
// for a ladder they cannot open and never entered.
export const ARENA_PUBLIC = false;

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
// Ten, not three. Three was set when the ladder was a bottom-up grind and every fight was progress; on a
// CHALLENGE ladder you are picking opponents who can actually beat you, so losing one shouldn't cost a third of
// your day.
export const FIGHTS_PER_DAY = 10;

// How far above you you're allowed to reach. Wide enough that there is always somebody worth fighting, narrow
// enough that the top of the Den can't be taken from the bottom in an afternoon.
export const CHALLENGE_REACH = 8;

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
    let row = await db.queryOne(`SELECT *, ${DAY}::text AS today, fights_day::text AS fights_day_text FROM mkt_arena WHERE buyer_id = $1`, [buyerId]).catch(() => null);
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
        row = await db.queryOne(`SELECT *, ${DAY}::text AS today, fights_day::text AS fights_day_text FROM mkt_arena WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    }
    return row;
}

// Everybody who holds a position, in order, with the profile bits the board needs.
async function standings() {
    const rows = await db.query(
        `SELECT a.buyer_id, a.position, a.wins, a.losses, a.best_streak, COALESCE(b.xp,0) AS xp,
                b.alias, b.display_name, b.avatar_sprite_url
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
          WHERE a.position IS NOT NULL ORDER BY a.position ASC`
    ).catch(() => []);
    if (!rows.length) return [];
    const { getEquippedStatsForMembers } = await import("@/lib/marketplace/inventory.js");
    const stats = await getEquippedStatsForMembers(rows.map((r) => r.buyer_id)).catch(() => new Map());
    return rows.map((r) => {
        const level = levelForXp(Number(r.xp) || 0).level;
        const gearPower = Object.values(stats.get(r.buyer_id) || {}).reduce((n, v) => n + (Number(v) || 0), 0);
        return {
            id: r.buyer_id, position: r.position,
            name: r.display_name || r.alias || "A member",
            sprite: r.avatar_sprite_url || null,
            level, wins: r.wins, losses: r.losses,
            vigour: arenaVigour(level, gearPower), might: arenaMight(level, gearPower),
            tell: tendency(r.buyer_id).tell,
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
    const [me, board] = await Promise.all([arenaPower(buyerId), standings()]);
    const used = fightsUsed(row);
    const pos = Number(row?.position) || board.length;
    const bout = row?.bout_json || null;

    // WHO YOU MAY CHALLENGE. Everyone above you, within reach — so every fight on offer is one you could
    // plausibly lose, which is the only kind worth spending an attempt on.
    const targets = board
        .filter((o) => o.id !== buyerId && o.position < pos && o.position >= pos - CHALLENGE_REACH)
        .sort((x, y) => y.position - x.position)
        .map((o) => ({ ...o, reward: winReward(pos, o.position) }));

    return {
        unlocked: true,
        me: { ...me, name: "You", position: pos },
        position: pos, size: board.length,
        rank: rankFor(Math.max(0, board.length - pos), board.length),
        fightsLeft: Math.max(0, FIGHTS_PER_DAY - used), fightsPerDay: FIGHTS_PER_DAY,
        stats: {
            wins: Number(row?.wins) || 0, losses: Number(row?.losses) || 0,
            streak: Number(row?.streak) || 0, bestStreak: Number(row?.best_streak) || 0,
            best: Number(row?.best_position) || pos,
        },
        targets,
        // The top of the Den, always visible — a ladder you cannot see the top of is just a number.
        board: board.slice(0, 10).map((o) => ({ position: o.position, name: o.name, sprite: o.sprite, level: o.level, you: o.id === buyerId })),
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
        foe: b.foe, round: b.round, hp: b.hp, foeHp: b.foeHp, maxHp: b.maxHp, foeMaxHp: b.foeMaxHp,
        log: b.log || [], over: Boolean(b.over), won: Boolean(b.won), tell: b.tell, rankUp: b.rankUp || null,
        recap: b.recap || null,
        reward: b.reward || null,
    };
}

export async function startBout(buyerId, targetId = null) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await arenaRow(buyerId);
    if (row?.bout_json && !row.bout_json.over) return { ok: false, error: "bout_in_progress", ...(await getArenaState(buyerId)) };
    if (fightsUsed(row) >= FIGHTS_PER_DAY) return { ok: false, error: "no_fights", ...(await getArenaState(buyerId)) };

    const [me, board] = await Promise.all([arenaPower(buyerId), standings()]);
    const pos = Number(row?.position) || board.length;
    // The target must be ABOVE you and within reach — checked here and not just hidden in the UI, because the
    // list is the only thing stopping somebody POSTing their way to first place.
    const foe = board.find((o) => o.id === targetId && o.position < pos && o.position >= pos - CHALLENGE_REACH);
    if (!foe) return { ok: false, error: "bad_target", ...(await getArenaState(buyerId)) };

    const t = tendency(foe.id);
    const bout = {
        myPos: pos, foePos: foe.position, size: board.length,
        foe: { id: foe.id, name: foe.name, sprite: foe.sprite, level: foe.level, might: foe.might },
        tell: t.tell, w: t.w,
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
    await trackActivity(buyerId, "arena_start", { pos, target: foe.id }).catch(() => {});
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
    const myPos = b.myPos, foePos = b.foePos;
    let reward = null;

    // ── TAKING THE SPOT ──────────────────────────────────────────────────────────────────────────────────
    // Beat somebody above you and you SWAP positions with them. That is the whole point of a challenge
    // ladder: standing is something you take off a specific person, not a counter that only goes up.
    let swapped = false;
    if (won) {
        const r = winReward(myPos, foePos);
        reward = { gold: r.gold, xp: r.xp };
        // ── THE SWAP, VIA A PARKING SPACE ────────────────────────────────────────────────────────────────
        // position carries a UNIQUE INDEX, so moving the loser onto your place while you are still standing on
        // it violates it immediately — Postgres checks a unique index per row, not at end of statement, and a
        // plain unique INDEX cannot be deferred. The first cut did exactly that and wrapped both writes in
        // `.catch(() => {})`, so NEITHER landed and it failed in total silence: you won, the recap said 12 → 11,
        // and the ladder never moved.
        //
        // So the challenger parks on the negative of their own position first. Negative-of-position is unique
        // per rung, so two swaps resolving at once cannot collide in the parking space either.
        const parked = await db.queryOne(`UPDATE mkt_arena SET position = $2 WHERE buyer_id = $1 AND position = $3 RETURNING buyer_id`, [buyerId, -myPos, myPos]).catch(() => null);
        if (parked) {
            const moved = await db.queryOne(`UPDATE mkt_arena SET position = $2 WHERE buyer_id = $1 AND position = $3 RETURNING buyer_id`, [b.foe.id, myPos, foePos]).catch(() => null);
            if (moved) {
                const took = await db.queryOne(
                    `UPDATE mkt_arena SET position = $2, best_position = LEAST(COALESCE(best_position, $2), $2)
                      WHERE buyer_id = $1 AND position = $3 RETURNING position`, [buyerId, foePos, -myPos]
                ).catch(() => null);
                swapped = Boolean(took);
            }
            // Whatever happened, never leave anybody parked on a negative rung.
            if (!swapped) await db.query(`UPDATE mkt_arena SET position = $2 WHERE buyer_id = $1 AND position = $3`, [buyerId, myPos, -myPos]).catch(() => {});
        }
        const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, r.gold]).catch(() => null);
        await logCoin(buyerId, r.gold, "arena_win", { balanceAfter: g?.gold, meta: { from: myPos, to: foePos, foe: b.foe.id } }).catch(() => {});
        // gold: 0 is load-bearing — awardXp pays gold 1:1 with points otherwise, and the purse above IS the gold.
        await awardXp(buyerId, "arena_win", { points: r.xp, gold: 0 }).catch(() => {});
    }
    b.reward = reward;

    const size = b.size || 0;
    const posFrom = myPos;
    // Read the position BACK rather than assuming the swap worked. The recap is the only thing telling somebody
    // what changed; it has to report what actually happened, not what was intended.
    const after = await db.queryOne(`SELECT position FROM mkt_arena WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    const posTo = Number(after?.position) || (won && swapped ? foePos : myPos);
    // Rank bands read off how many of the pack you are ABOVE, so position 1 of 84 is Alpha.
    const wasRank = rankFor(Math.max(0, size - posFrom), size);
    const nowRank = rankFor(Math.max(0, size - posTo), size);
    b.rankUp = won && nowRank.key !== wasRank.key ? { from: wasRank.name, to: nowRank.name, icon: nowRank.icon, color: nowRank.color } : null;
    const streakNow = won ? (Number(row?.streak) || 0) + 1 : 0;
    b.recap = {
        won, foe: b.foe, reward,
        posFrom, posTo, size,
        rank: { name: nowRank.name, icon: nowRank.icon, color: nowRank.color, into: nowRank.into, span: nowRank.span, next: nowRank.next?.name || null },
        rankUp: b.rankUp,
        streak: streakNow, bestStreak: Math.max(Number(row?.best_streak) || 0, streakNow),
        rounds: (b.log || []).length,
    };

    await db.query(
        `UPDATE mkt_arena SET bout_json = $2::jsonb,
            wins = wins + $3, losses = losses + $4,
            streak = CASE WHEN $3 = 1 THEN streak + 1 ELSE 0 END,
            best_streak = GREATEST(best_streak, CASE WHEN $3 = 1 THEN streak + 1 ELSE 0 END),
            updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(b), won ? 1 : 0, won ? 0 : 1]
    ).catch(() => {});

    // Recorded from BOTH sides. The defender was asleep; this is the only way they ever find out.
    await db.query(
        `INSERT INTO mkt_arena_bout (challenger_id, defender_id, challenger_won, challenger_pos, defender_pos, rounds)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [buyerId, b.foe.id, won, posTo, won && swapped ? myPos : foePos, (b.log || []).length]
    ).catch(() => {});

    await trackActivity(buyerId, won ? "arena_win" : "arena_loss", { from: posFrom, to: posTo, foe: b.foe.id }).catch(() => {});
    return { ok: true, finished: { won, reward, rankUp: b.rankUp }, ...(await getArenaState(buyerId)) };
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
    const top = await db.query(
        `SELECT a.buyer_id, a.position FROM mkt_arena a
          WHERE a.position IS NOT NULL AND a.position <= 3
            AND (a.prize_day IS DISTINCT FROM ${DAY}) ORDER BY a.position ASC`
    ).catch(() => []);
    const paid = [];
    for (const r of top) {
        const spec = PODIUM.find((x) => x.place === r.position);
        if (!spec) continue;
        // Claim the day FIRST and only pay if the claim took, so a second run finds nothing to do.
        const claimed = await db.queryOne(
            `UPDATE mkt_arena SET prize_day = ${DAY} WHERE buyer_id = $1 AND (prize_day IS DISTINCT FROM ${DAY}) RETURNING buyer_id`,
            [r.buyer_id]
        ).catch(() => null);
        if (!claimed) continue;
        await addChests(r.buyer_id, { [spec.chest]: 1 }, { source: "arena_podium" }).catch(() => {});
        await trackActivity(r.buyer_id, "arena_podium", { place: r.position, chest: spec.chest }).catch(() => {});
        paid.push({ buyerId: r.buyer_id, place: r.position, chest: spec.chest });
    }
    return { ok: true, day: day.d, paid };
}

/** Clear a finished bout so the ladder comes back. */
export async function clearBout(buyerId) {
    if (!ARENA_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    await saveBout(buyerId, null);
    return { ok: true, ...(await getArenaState(buyerId)) };
}
