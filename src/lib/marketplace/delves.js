import "server-only";

import { db } from "@/lib/db";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import {
    DELVE_FLOORS, DELVE_TRACKS, DUNGEONS, KIND, MIN_FIGHTS,
    dungeonById, eventsFor, potionCount, potionHealFrac, wardCut,
} from "@/lib/marketplace/delve-catalog.js";
import { advanceFloor, finishDelveRun, offerChoice } from "@/lib/marketplace/delve-floors.js";

// ── DUNGEON DELVES ───────────────────────────────────────────────────────────────────────────────────────────
// Ten floors, one encounter each, a boss at the bottom. You bring HP and potions; you leave with whatever you
// banked, alive or not. Four dungeons gated on level, each runnable once a day.
//
// OWNER-GATED while it's built out. Every read and write goes through DELVES_UNLOCKED — one switch to open it,
// exactly as the mine did.
export const DELVES_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function delveRow(buyerId) {
    await db.query(`INSERT INTO mkt_delve (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    return db.queryOne(`SELECT *, ${DAY}::text AS today FROM mkt_delve WHERE buyer_id = $1`, [buyerId]).catch(() => null);
}

// ── DEALING THE FLOORS ───────────────────────────────────────────────────────────────────────────────────────
// The whole run is dealt UP FRONT, then walked. Dealing as you go would make the "at least five fights"
// guarantee impossible to honour without rerolling a floor you had already been shown — which is the one thing
// that would make the dungeon feel rigged rather than dangerous.
//
// Floors 1..9 are drawn weighted from the dungeon's own pool; floor 10 is always the boss. If the draw came up
// short on fights, the shortfall is filled by CONVERTING the least interesting floors (rest and quiet stretches
// first, then traps) rather than appending fights at the end — so the guarantee never shows up as five brawls
// in a row at the bottom.
function dealFloors(dungeon) {
    const pool = eventsFor(dungeon.id);
    const total = pool.reduce((n, e) => n + e.weight, 0);
    const draw = () => {
        let r = Math.random() * total;
        for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
        return pool[pool.length - 1];
    };

    const floors = [];
    for (let i = 0; i < DELVE_FLOORS - 1; i += 1) {
        // No two identical events back to back — the deck is big enough that a repeat reads as a bug.
        let e = draw();
        for (let guard = 0; guard < 6 && floors.length && e.id === floors[floors.length - 1].event.id; guard += 1) e = draw();
        floors.push({ n: i + 1, event: e, done: false });
    }

    const isFight = (f) => f.event.kind === KIND.fight || f.event.kind === KIND.mimic;
    const fights = pool.filter((e) => e.kind === KIND.fight);
    // The boss counts toward MIN_FIGHTS, so floors 1..9 only need MIN_FIGHTS - 1 between them.
    let need = (MIN_FIGHTS - 1) - floors.filter(isFight).length;
    if (need > 0) {
        // Preference ORDER, then everything else. Converting only the four "least interesting" kinds looked
        // tidy and silently broke the guarantee on ~2.7% of runs (measured over 8,000 deals): a hand full of
        // chests, merchants and shrines simply had nothing in the preferred list left to convert. The last
        // pass is unconditional, so the promise cannot fail — it just prefers to eat a quiet floor first.
        const order = [KIND.rest, KIND.puzzle, KIND.trap, KIND.cache, KIND.well, KIND.shrine, KIND.merchant, KIND.chest];
        const passes = [...order.map((k) => (f) => f.event.kind === k), (f) => !isFight(f)];
        for (const match of passes) {
            for (const f of floors) {
                if (need <= 0) break;
                if (!match(f)) continue;
                f.event = pick(fights);
                need -= 1;
            }
            if (need <= 0) break;
        }
    }

    // Dedupe AFTER the swap: the fight conversion above can put two identical fights side by side, and the
    // original draw-time guard ran before it ever happened.
    for (let i = 1; i < floors.length; i += 1) {
        if (floors[i].event.id !== floors[i - 1].event.id) continue;
        const alt = (isFight(floors[i]) ? fights : pool).filter((e) => e.id !== floors[i].event.id);
        if (alt.length) floors[i].event = pick(alt);
    }

    floors.push({ n: DELVE_FLOORS, event: { id: "boss", kind: KIND.boss, title: dungeon.boss.name, text: dungeon.boss.blurb }, done: false });
    return floors;
}

/** A foe for a fight floor, scaled by the event's own multipliers. */
function makeFoe(dungeon, event) {
    const base = pick(dungeon.foes);
    const hp = Math.round(dungeon.hp * 0.42 * (event.hpMult || 1));
    return {
        id: base.id, name: event.kind === KIND.mimic ? "Mimic" : base.name,
        sprite: event.kind === KIND.mimic ? "/images/delves/foe-mimic.png" : base.sprite,
        hp, maxHp: hp,
        dmg: [Math.round(dungeon.dmg[0] * (event.dmgMult || 1)), Math.round(dungeon.dmg[1] * (event.dmgMult || 1))],
    };
}

// ── STATE ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function getDelveState(buyerId) {
    if (!DELVES_UNLOCKED(buyerId)) return { unlocked: false };
    const [row, me] = await Promise.all([
        delveRow(buyerId),
        db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const level = levelForXp(Number(me?.xp) || 0).level;
    const runs = row?.runs_json || {};
    const today = row?.today;

    const dungeons = DUNGEONS.map((d) => ({
        id: d.id, name: d.name, blurb: d.blurb, tint: d.tint, bg: d.bg, minLevel: d.minLevel,
        floors: DELVE_FLOORS,
        boss: { name: d.boss.name, sprite: d.boss.sprite },
        unlocked: level >= d.minLevel,
        runToday: runs[d.id] === today,
    }));

    return {
        unlocked: true,
        level,
        gold: Number(me?.gold) || 0,
        dungeons,
        run: row?.run_json ? publicRun(row.run_json) : null,
        potions: { count: potionCount(row?.satchel_level), healPct: Math.round(potionHealFrac(row?.flask_level) * 100) },
        tracks: Object.entries(DELVE_TRACKS).map(([key, t]) => {
            const lv = Number(row?.[t.col]) || 0;
            return {
                key, name: t.name, desc: t.desc, icon: t.icon, level: lv, max: t.max,
                now: t.fmt(lv), next: lv >= t.max ? null : t.fmt(lv + 1),
                maxed: lv >= t.max, cost: lv >= t.max ? null : t.cost(lv),
            };
        }),
        stats: {
            started: Number(row?.runs_started) || 0,
            cleared: Number(row?.runs_cleared) || 0,
            died: Number(row?.runs_died) || 0,
            floors: Number(row?.floors_cleared) || 0,
            bosses: Number(row?.bosses_felled) || 0,
            deepest: Number(row?.deepest_floor) || 0,
        },
    };
}

// What the client is allowed to see of a run: never the undealt floors ahead, or the dungeon stops being a
// dungeon. Only the current floor's encounter, and the log of what already happened.
function publicRun(run) {
    const d = dungeonById(run.dungeonId);
    const cur = run.floors[run.floor - 1] || null;
    return {
        dungeonId: run.dungeonId,
        dungeonName: d?.name || run.dungeonId,
        tint: d?.tint, bg: d?.bg,
        floor: run.floor, floors: DELVE_FLOORS,
        hp: run.hp, maxHp: run.maxHp,
        potions: run.potions, potionHeal: run.potionHeal,
        over: Boolean(run.over), died: Boolean(run.died), cleared: Boolean(run.cleared),
        banked: run.banked,
        foe: run.foe || null,
        // The floor you are standing on, resolved or not.
        current: cur ? { n: cur.n, kind: cur.event.kind, title: cur.event.title, text: cur.event.text, done: Boolean(cur.done), outcome: cur.outcome || null } : null,
        log: run.log || [],
        awaiting: run.awaiting || null,   // a choice the floor is waiting on
        potionsUsed: run.potionsUsed || 0,
        lowestHpFrac: run.lowestHpFrac ?? 1,
    };
}

// ── START ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function startDelve(buyerId, dungeonId) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const d = dungeonById(dungeonId);
    if (!d) return { ok: false, error: "bad_dungeon" };
    const row = await delveRow(buyerId);
    if (row?.run_json && !row.run_json.over) return { ok: false, error: "run_in_progress", ...(await getDelveState(buyerId)) };

    const me = await db.queryOne(`SELECT COALESCE(xp,0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(Number(me?.xp) || 0).level;
    if (level < d.minLevel) return { ok: false, error: "level_locked", ...(await getDelveState(buyerId)) };

    const runs = row?.runs_json || {};
    if (runs[d.id] === row?.today) return { ok: false, error: "already_today", ...(await getDelveState(buyerId)) };

    const maxHp = d.hp;
    const run = {
        dungeonId: d.id,
        floor: 1,
        hp: maxHp, maxHp,
        potions: potionCount(row?.satchel_level),
        potionHeal: potionHealFrac(row?.flask_level),
        ward: wardCut(row?.ward_level),
        floors: dealFloors(d),
        banked: { gold: 0, xp: 0, chests: [] },
        log: [],
        potionsUsed: 0,
        lowestHpFrac: 1,
        over: false, died: false, cleared: false,
    };
    // The day is claimed at the DOOR, not on completion — otherwise dying and restarting is free.
    const nextRuns = { ...runs, [d.id]: row?.today };
    await db.query(
        `UPDATE mkt_delve SET run_json = $2::jsonb, runs_json = $3::jsonb, runs_started = runs_started + 1, updated_at = NOW() WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(run), JSON.stringify(nextRuns)]
    ).catch(() => {});
    await trackActivity(buyerId, "delve_start", { dungeon: d.id }).catch(() => {});
    return { ok: true, ...(await getDelveState(buyerId)) };
}

const saveRun = (buyerId, run) =>
    db.query(`UPDATE mkt_delve SET run_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(run)]).catch(() => {});

const hurt = (run, raw) => {
    const dmg = Math.max(1, Math.round(raw * (1 - (run.ward || 0))));
    run.hp = Math.max(0, run.hp - dmg);
    run.lowestHpFrac = Math.min(run.lowestHpFrac ?? 1, run.hp / run.maxHp);
    return dmg;
};
const bank = (run, { gold = 0, xp = 0, chest = null } = {}) => {
    run.banked.gold += gold;
    run.banked.xp += xp;
    if (chest) run.banked.chests.push(chest);
};

// ── RESOLVING A FLOOR ────────────────────────────────────────────────────────────────────────────────────────
// One entry point for "I acted on the floor I'm standing on". Fights are a single exchange per tap so a foe
// takes a few taps to drop and every tap can hurt — a fight resolved in one click would make HP decoration.
export async function delveAct(buyerId, action, choice = null) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await delveRow(buyerId);
    const run = row?.run_json;
    if (!run || run.over) return { ok: false, error: "no_run", ...(await getDelveState(buyerId)) };
    const d = dungeonById(run.dungeonId);
    if (!d) return { ok: false, error: "bad_dungeon" };
    const floor = run.floors[run.floor - 1];
    if (!floor) return { ok: false, error: "no_floor", ...(await getDelveState(buyerId)) };

    // ── POTION — always available, on any floor, mid-fight or not. That's the whole promise of "use them
    // whenever you want", so it deliberately does NOT cost you the floor or give the foe a free swing.
    if (action === "potion") {
        if (run.potions <= 0) return { ok: false, error: "no_potions", ...(await getDelveState(buyerId)) };
        if (run.hp >= run.maxHp) return { ok: false, error: "already_full", ...(await getDelveState(buyerId)) };
        const healed = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * run.potionHeal));
        run.hp += healed;
        run.potions -= 1;
        run.potionsUsed = (run.potionsUsed || 0) + 1;
        run.log.push({ floor: run.floor, kind: "potion", text: `Drank a potion — recovered ${healed} health.` });
        await saveRun(buyerId, run);
        return { ok: true, healed, ...(await getDelveState(buyerId)) };
    }

    if (action === "flee") return finishRun(buyerId, run, { fled: true });

    // ── STRIKE — one exchange in an active fight ──
    if (action === "strike") {
        if (!run.foe) return { ok: false, error: "no_fight", ...(await getDelveState(buyerId)) };
        const you = randInt(Math.round(run.maxHp * 0.14), Math.round(run.maxHp * 0.24));
        run.foe.hp = Math.max(0, run.foe.hp - you);
        const lines = [`You hit ${run.foe.name} for ${you}.`];
        if (run.foe.hp <= 0) {
            const ev = floor.event;
            const gold = Math.round(randInt(d.goldPer[0], d.goldPer[1]) * (ev.lootMult || 1));
            const xp = Math.round(randInt(d.xpPer[0], d.xpPer[1]) * (ev.lootMult || 1));
            bank(run, { gold, xp });
            lines.push(`${run.foe.name} falls. +${gold} gold, +${xp} XP.`);
            run.foe = null;
            run.log.push({ floor: run.floor, kind: "fight", text: lines.join(" ") });
            return advance(buyerId, run, { outcome: { gold, xp } });
        }
        // It swings back.
        const took = hurt(run, randInt(run.foe.dmg[0], run.foe.dmg[1]));
        lines.push(`It hits back for ${took}.`);
        run.log.push({ floor: run.floor, kind: "fight", text: lines.join(" ") });
        if (run.hp <= 0) return finishRun(buyerId, run, { died: true });
        await saveRun(buyerId, run);
        return { ok: true, ...(await getDelveState(buyerId)) };
    }

    // ── ENTER — resolve the floor you just walked onto ──
    if (action !== "enter" && action !== "choose") return { ok: false, error: "bad_action" };
    if (floor.done && !run.foe) return { ok: false, error: "already_done", ...(await getDelveState(buyerId)) };

    const ev = floor.event;
    switch (ev.kind) {
        case KIND.fight:
        case KIND.mimic:
        case KIND.boss: {
            if (!run.foe) {
                run.foe = ev.kind === KIND.boss
                    ? { id: d.boss.id, name: d.boss.name, sprite: d.boss.sprite, hp: d.boss.hp, maxHp: d.boss.hp, dmg: d.boss.dmg, boss: true }
                    : makeFoe(d, ev);
                floor.done = true;
                run.log.push({ floor: run.floor, kind: "meet", text: ev.kind === KIND.mimic ? "The chest opens itself. It has teeth." : `${run.foe.name} blocks the way.` });
                // A mimic gets the jump on you — that's the cost of it having looked like treasure.
                if (ev.kind === KIND.mimic) {
                    const took = hurt(run, randInt(run.foe.dmg[0], run.foe.dmg[1]));
                    run.log.push({ floor: run.floor, kind: "fight", text: `It catches you off guard for ${took}.` });
                    if (run.hp <= 0) return finishRun(buyerId, run, { died: true });
                }
            }
            await saveRun(buyerId, run);
            return { ok: true, ...(await getDelveState(buyerId)) };
        }
        case KIND.chest: {
            const gold = Math.round(randInt(d.goldPer[0], d.goldPer[1]) * 1.4 * (ev.lootMult || 1));
            const xp = Math.round(randInt(d.xpPer[0], d.xpPer[1]) * (ev.lootMult || 1));
            // A chest sometimes holds a real chest — the tiers a dungeon pays scale with its gate.
            const tier = ev.lootMult >= 1.5 ? (d.minLevel >= 30 ? "gold" : "iron") : (d.minLevel >= 30 ? "iron" : "wooden");
            const gotChest = Math.random() < 0.35;
            bank(run, { gold, xp, chest: gotChest ? tier : null });
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "chest", text: `+${gold} gold, +${xp} XP${gotChest ? `, and a ${tier} chest` : ""}.` });
            return advance(buyerId, run, { outcome: { gold, xp, chest: gotChest ? tier : null } });
        }
        case KIND.cache: {
            const gold = Math.round(randInt(d.goldPer[0], d.goldPer[1]) * 1.2 * (ev.lootMult || 1));
            bank(run, { gold });
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "cache", text: `Pocketed ${gold} gold.` });
            return advance(buyerId, run, { outcome: { gold } });
        }
        case KIND.rest: {
            const healed = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * 0.18));
            run.hp += healed;
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "rest", text: healed ? `You catch your breath — recovered ${healed} health.` : "You catch your breath. Nothing to mend." });
            return advance(buyerId, run, { outcome: { healed } });
        }
        case KIND.trap: {
            const took = hurt(run, randInt(Math.round(d.dmg[0] * 0.8), Math.round(d.dmg[1] * 1.1)));
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "trap", text: `It catches you for ${took}.` });
            if (run.hp <= 0) return finishRun(buyerId, run, { died: true });
            return advance(buyerId, run, { outcome: { damage: took } });
        }
        case KIND.merchant:
        case KIND.well:
        case KIND.shrine:
        case KIND.puzzle:
            return offerChoice(ctxFor(buyerId), run, d, floor, action, choice);
        default: {
            floor.done = true;
            return advance(buyerId, run, {});
        }
    }
}

// ── THE BRIDGE ───────────────────────────────────────────────────────────────────────────────────────────────
// delve-floors.js owns choices, advancing and the payout; this file owns the run. Rather than have the two
// import each other (a cycle), the run-side helpers are handed over explicitly as a small context object.
function ctxFor(buyerId) {
    const ctx = {
        buyerId, saveRun, hurt, bank,
        state: getDelveState,
        advance: (bid, run, opts) => advanceFloor(ctx, run, opts),
        finishRun: (bid, run, opts) => finishDelveRun(ctx, run, opts),
    };
    return ctx;
}
const advance = (buyerId, run, opts) => advanceFloor(ctxFor(buyerId), run, opts);
const finishRun = (buyerId, run, opts) => finishDelveRun(ctxFor(buyerId), run, opts);

// ── UPGRADES ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function upgradeDelve(buyerId, trackKey) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = DELVE_TRACKS[trackKey];
    if (!t) return { ok: false, error: "bad_track" };
    const row = await delveRow(buyerId);
    const lv = Number(row?.[t.col]) || 0;
    if (lv >= t.max) return { ok: false, error: "maxed", ...(await getDelveState(buyerId)) };
    const cost = t.cost(lv);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getDelveState(buyerId)) };
    await logCoin(buyerId, -cost, "delve_upgrade", { balanceAfter: paid.gold, meta: { track: trackKey } }).catch(() => {});
    // Guarded on the CURRENT level too, so a double-tap cannot buy the same level twice.
    await db.query(`UPDATE mkt_delve SET ${t.col} = ${t.col} + 1, updated_at = NOW() WHERE buyer_id = $1 AND ${t.col} = $2`, [buyerId, lv]).catch(() => {});
    await trackActivity(buyerId, "delve_upgrade", { track: trackKey, level: lv + 1, cost }).catch(() => {});
    return { ok: true, ...(await getDelveState(buyerId)) };
}

/** Close the finished-run card so the dungeon list comes back. */
export async function clearDelveRun(buyerId) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    await db.query(`UPDATE mkt_delve SET run_json = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getDelveState(buyerId)) };
}
