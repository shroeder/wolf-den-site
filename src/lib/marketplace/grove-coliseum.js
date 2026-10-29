import "server-only";

// ── THE COLISEUM ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "each map's Coliseum is effectively going to spawn every node's enemies in waves with a timer for you
// to defeat all of them before the timer runs out... it'll spawn like 1 wave of zone 1's enemies. Then once
// you kill all those, it'll spawn the second wave. That'll be zone 2. It'll go all the way up until you have
// to fight the boss and some rare spawns."
//
// ⚠️ NO SPECIAL RULES INSIDE. "It's the same as if you were killing them." Same loot rolls, same multi-kill,
// same everything — the Coliseum is a SHAPE, not a second ruleset. Everything here is about the run's frame:
// which bodies, in what order, against what clock, and what the performance is worth.
//
// ⚠️ AND ITS KILLS COUNT TOWARD THE ZONE GATE, IN FULL. Luke's call. A zone can only produce 40 bodies a
// minute and a run is twelve rosters plus a boss inside two, so this is deliberately the fast way through the
// kill requirement — the pressure valve for maps 5 to 7, which otherwise model at 29 to 80 minutes a node.
// If that ever needs walking back, it is a multiplier here and nowhere else.

import { db } from "@/lib/db";
import { GROVE_ZONES, GROVE_BOSSES, scaledFoe, scaledRare } from "@/lib/marketplace/grove-catalog.js";
import { bossHpAt, bossDmgAt } from "@/lib/marketplace/grove-maps.js";
import { GROVE_CHEST_ORDER } from "@/lib/marketplace/grove-forge.js";
import { COLISEUM_ZONE } from "@/lib/marketplace/grove-npcs.js";

/** How long a run gets. Luke said about two minutes; the clock is the whole tension so it is one number. */
export const RUN_MS = 120_000;

/**
 * The wave list for a map: zone 1's roster, then zone 2's, up to the boss.
 *
 * ⚠️ BODIES PER WAVE RISES, AND THAT IS THE DIFFICULTY. Everything scales by depth already through
 * scaledFoe, so a flat count would make the late waves identical to the early ones with bigger numbers. The
 * ramp is what makes the back half of the clock frightening.
 */
export function wavesFor(mapN) {
    const map = Number(mapN) || 1;
    const zones = GROVE_ZONES
        .filter((z) => (z.map || Math.ceil(z.n / 12)) === map)
        .sort((a, b) => a.n - b.n);

    return zones.map((z, i) => {
        const ids = (z.enemies || []).map((e) => (typeof e === "object" ? e.id : e));
        // ⚠️ SIZED SO A CLEAR BEATS THE FIELD, which is the entire point of letting these kills count.
        // At 3 + i*0.6 a full run was 71 bodies in two minutes — 36 a minute, BELOW the 40 a zone already
        // produces on its own. That would have made the Coliseum a slower way to do the thing it exists to
        // speed up, while costing a key. 6 + i puts a clear at ~138 bodies, about 69 a minute.
        const count = 6 + i;
        const last = i === zones.length - 1;
        return {
            wave: i + 1,
            zone: z.n,
            depth: z.n,
            foes: Array.from({ length: count }, (_, k) => ids[k % Math.max(1, ids.length)]).filter(Boolean),
            // The last wave is the map's boss, and a pair of rares stand with it — Luke: "up until you have
            // to fight the boss and some rare spawns."
            boss: last ? z.boss || null : null,
            rares: last ? 2 : 0,
        };
    });
}

/** A boss at a depth, through the boss curve rather than the wanderer one. */
function bossBodyAt(id, depth) {
    const base = GROVE_BOSSES[id];
    if (!base) return null;
    // ⚠️ bossDmgAt TAKES THE RUNG. It is (depth, k) with k=0 for the low blow and k=1 for the high one;
    // called with one argument it indexes BOSS_DMG_D1[undefined] and returns [null, null] — a boss that
    // cannot hurt anybody, which reads as a bug in combat rather than in this file.
    return {
        ...base,
        id,
        hp: Math.round(bossHpAt(depth) / 100) * 100,
        dmg: [Math.round(bossDmgAt(depth, 0)), Math.round(bossDmgAt(depth, 1))],
    };
}

/** Everything the scene needs to run one map's Coliseum, with every body already scaled to its depth. */
export function runPlan(mapN) {
    const map = Number(mapN) || 1;
    return {
        map,
        zone: COLISEUM_ZONE[map] ? (map - 1) * 12 + COLISEUM_ZONE[map] : null,
        runMs: RUN_MS,
        waves: wavesFor(map).map((w) => ({
            ...w,
            bodies: w.foes.map((id) => scaledFoe(id, w.depth)).filter(Boolean),
            // ⚠️ A BOSS IS NOT A SCALED FOE. scaledFoe reads GROVE_ENEMIES, which bosses are not in, so it
            // returned a body with hp undefined — a final wave that cannot be hurt or cannot be survived,
            // depending on which way the comparison fell. Bosses carry their own curve.
            bossBody: w.boss ? bossBodyAt(w.boss, w.depth) : null,
            rareBodies: Array.from({ length: w.rares }, () => scaledRare(w.depth)),
        })),
    };
}

// ── WHAT A RUN IS WORTH ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "depending on how you perform, a certain amount of chests will spawn... the rarity and the number of
// chests depends on your performance. I'll let you decide what's fair."
//
// Performance is HOW FAR you got, not how fast — reaching wave 9 of 12 with the clock against you is the same
// achievement whether it took ninety seconds or a hundred and twenty. Time only decides whether you cleared.
//
// ⚠️ A FAILED RUN STILL PAYS. Luke's call: the key is spent either way and you keep what you earned, so a
// near-miss is worth something and people keep trying the harder maps. A run that pays nothing below the
// clear is a run nobody attempts twice.
export function chestsFor({ map, wavesCleared, totalWaves, cleared }) {
    const frac = totalWaves > 0 ? wavesCleared / totalWaves : 0;
    // Deeper maps hand out better boxes for the same fraction — the bodies were harder for the same effort.
    // ⚠️ THE LADDER NEEDS HEADROOM OR LATE MAPS STOP REWARDING EFFORT. Dividing by 2 put map 7 at the top
    // tier before any performance was counted, so a quarter-clear and a full clear both paid heartwrought
    // and there was nothing to play for inside the map. Dividing by 3 leaves two rungs above every base.
    // ⚠️ FOUR TIERS IS NOT MUCH LADDER FOR SEVEN MAPS. Clamping base so that base+2 always fits meant maps
    // 4 through 7 shared a base and paid identically, which erases the reason to run a deeper Coliseum.
    // Letting the top map reach base 2 differentiates the maps and compresses only the last rung, where
    // there is simply no fifth chest to give.
    const base = Math.min(GROVE_CHEST_ORDER.length - 2, Math.floor((Number(map) - 1) / 3));

    const out = [];
    if (frac >= 0.25) out.push(GROVE_CHEST_ORDER[base]);
    if (frac >= 0.5) out.push(GROVE_CHEST_ORDER[base]);
    if (frac >= 0.75) out.push(GROVE_CHEST_ORDER[Math.min(GROVE_CHEST_ORDER.length - 1, base + 1)]);
    // Clearing the whole thing inside the clock is the only way to the top box on that map.
    if (cleared) out.push(GROVE_CHEST_ORDER[Math.min(GROVE_CHEST_ORDER.length - 1, base + 2)]);
    return out;
}

/**
 * Spend a key and start a run.
 *
 * ⚠️ THE KEY IS TAKEN AT THE START, CONDITIONALLY. Deducting on completion would let somebody close the tab
 * on a bad run and keep the key, which makes the clock advisory. The conditional update is the lock, the same
 * shape as the casino stake.
 */
export async function startRun(buyerId, mapN) {
    const row = await db.queryOne(
        `UPDATE mkt_grove_coliseum SET keys = keys - 1, runs = runs + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND map_n = $2 AND keys >= 1 RETURNING keys`,
        [buyerId, Number(mapN)],
    ).catch(() => null);
    if (!row) return { ok: false, error: "no_key" };
    return { ok: true, keys: Number(row.keys) || 0, plan: runPlan(mapN) };
}

/**
 * Settle a finished run: record how far they got and put the chests on the ground.
 *
 * The kills themselves are settled by the ordinary Grove path — same loot, same multi-kill, same zone
 * progress — so nothing about drops happens here. This is the frame only.
 */
export async function settleRun(buyerId, { map, wavesCleared, cleared }) {
    const m = Number(map) || 1;
    const total = wavesFor(m).length;
    const got = Math.max(0, Math.min(total, Number(wavesCleared) || 0));
    const won = Boolean(cleared) && got >= total;

    await db.query(
        `UPDATE mkt_grove_coliseum
            SET best_wave = GREATEST(best_wave, $3), clears = clears + $4, updated_at = NOW()
          WHERE buyer_id = $1 AND map_n = $2`,
        [buyerId, m, got, won ? 1 : 0],
    ).catch(() => {});

    const tiers = chestsFor({ map: m, wavesCleared: got, totalWaves: total, cleared: won });
    for (const tier of tiers) {
        await db.query(
            `INSERT INTO mkt_grove_coliseum_chest (buyer_id, map_n, tier) VALUES ($1,$2,$3)`,
            [buyerId, m, tier],
        ).catch(() => {});
    }
    return { ok: true, wavesCleared: got, totalWaves: total, cleared: won, chests: tiers };
}

/** Chests still sitting on the ground, waiting to be tapped. */
export async function pendingChests(buyerId) {
    const rows = await db.query(
        `SELECT id, map_n, tier FROM mkt_grove_coliseum_chest
          WHERE buyer_id = $1 AND opened_at IS NULL ORDER BY id`,
        [buyerId],
    ).catch(() => []);
    return (rows || []).map((r) => ({ id: Number(r.id), map: Number(r.map_n), tier: r.tier }));
}
