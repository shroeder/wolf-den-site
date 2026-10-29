import "server-only";

// ── WHAT A MEMBER HAS DONE ABOUT THE PEOPLE STANDING IN THE GROVE ────────────────────────────────────────────
// The content is grove-npcs.js. This is progress, claiming, and the Coliseum's keys — the half that cannot be
// regenerated and therefore the half that has to be careful.
//
// ⚠️ A STEP IS ONLY EVER THE ONE IN FRONT OF YOU. A chain is strictly sequential: step 3 does not accumulate
// while you are on step 1, because the ask of step 3 is written assuming you did steps 1 and 2 first. Ticking
// every step at once would let somebody finish a five-link chain with one well-aimed afternoon, which is the
// opposite of "you have to come back to them".

import { db } from "@/lib/db";
import { GROVE_NPCS, COLISEUM_NPCS, COLISEUM_ZONE, questsFor, npcsOnMap } from "@/lib/marketplace/grove-npcs.js";

/** The shop's own day, for the Coliseum daily. See the note in migration 500 about why this is a date. */
export const centralDay = (d = new Date()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Every row this member has for a map, keyed by step. */
async function rowsFor(buyerId, mapN = null) {
    const rows = await db.query(
        `SELECT step_id, npc_id, map_n, progress, claimed_at FROM mkt_grove_quest
          WHERE buyer_id = $1 AND ($2::int IS NULL OR map_n = $2)`,
        [buyerId, mapN],
    ).catch(() => []);
    return Object.fromEntries((rows || []).map((r) => [r.step_id, r]));
}

/**
 * The step a member is currently on for one NPC, plus what they have done toward it.
 *
 * Returns null once the chain is finished — which is what makes the NPC fall back to idle dialogue rather
 * than offering a step that does not exist.
 */
export function activeStep(chain, rows) {
    for (const step of chain) {
        const row = rows[step.id];
        if (!row || !row.claimed_at) {
            return { step, progress: Number(row?.progress) || 0, started: Boolean(row) };
        }
    }
    return null;
}

/** Everything the tracker needs: who, where, what, how far, what it pays. */
export async function questBoard(buyerId) {
    const rows = await rowsFor(buyerId);
    const out = [];
    for (let map = 1; map <= 7; map += 1) {
        for (const npc of npcsOnMap(map)) {
            const cur = activeStep(npc.chain, rows);
            const done = npc.chain.filter((s) => rows[s.id]?.claimed_at).length;
            out.push({
                npc: npc.id,
                name: npc.name,
                role: npc.role,
                map,
                zone: npc.zone,
                steps: npc.chain.length,
                done,
                // `null` here means finished, and the screen says so rather than hiding the row — a chain you
                // completed is a thing you want to see you completed.
                active: cur
                    ? {
                        id: cur.step.id, title: cur.step.title, kind: cur.step.kind,
                        need: cur.step.need, progress: Math.min(cur.progress, cur.step.need),
                        ready: cur.progress >= cur.step.need,
                        foe: cur.step.foe || null, part: cur.step.part || null,
                        zone: cur.step.zone || null, wave: cur.step.wave || null,
                        reward: cur.step.reward,
                    }
                    : null,
            });
        }
    }
    return out;
}

/**
 * Tick progress for whatever just happened.
 *
 * `events` is what the settle already knows: { slain: {foeId: n}, parts: {partId: n}, zone: n, cleared: bool,
 * wave: n }. One pass over the member's ACTIVE steps only — see the note at the top of this file.
 *
 * ⚠️ IT NEVER TICKS A CLAIMED STEP, and it never ticks past `need`. Both sound obvious and both are the
 * difference between a quest that completes and a counter that keeps climbing into a reward somebody can
 * claim twice.
 */
export async function bumpQuests(buyerId, events = {}) {
    if (!buyerId) return [];
    const rows = await rowsFor(buyerId);
    const touched = [];

    for (let map = 1; map <= 7; map += 1) {
        for (const npc of npcsOnMap(map)) {
            const cur = activeStep(npc.chain, rows);
            if (!cur) continue;
            const s = cur.step;
            let add = 0;

            if (s.kind === "cull" && s.foe) add = Number(events.slain?.[s.foe]) || 0;
            if (s.kind === "hunt" && s.foe) add = Number(events.slain?.[s.foe]) || 0;
            if (s.kind === "harvest" && s.part) add = Number(events.parts?.[s.part]) || 0;
            if (s.kind === "forge" && s.part) add = Number(events.forged?.[s.part]) || 0;
            if (s.kind === "delve" && s.zone) add = Number(events.zone) >= s.zone ? s.need : 0;
            if (s.kind === "survive" && s.zone) add = (events.cleared && Number(events.zone) === s.zone) ? 1 : 0;
            if (s.kind === "ticket" && s.wave) add = Number(events.wave) >= s.wave ? s.need : 0;
            if (add <= 0) continue;

            const next = Math.min(s.need, (cur.progress || 0) + add);
            if (next === cur.progress) continue;
            await db.query(
                `INSERT INTO mkt_grove_quest (buyer_id, step_id, npc_id, map_n, progress)
                 VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (buyer_id, step_id) DO UPDATE
                   SET progress = LEAST($5, GREATEST(mkt_grove_quest.progress, $5)), updated_at = NOW()
                 WHERE mkt_grove_quest.claimed_at IS NULL`,
                [buyerId, s.id, npc.id, map, next],
            ).catch(() => {});
            touched.push({ step: s.id, progress: next, need: s.need, done: next >= s.need, title: s.title });
        }
    }
    return touched;
}

/**
 * Hand in a finished step.
 *
 * ⚠️ THE SERVER RE-READS THE REQUIREMENT. The claim names a step; everything about whether it is finished and
 * what it pays comes from the catalogue, never from the request. Trusting a posted reward is how a quest
 * board becomes a gold faucet with a text box on it.
 */
export async function claimStep(buyerId, stepId) {
    if (!buyerId || !stepId) return { ok: false, error: "bad_request" };
    const npcId = String(stepId).split("_")[0];
    const npc = GROVE_NPCS.find((n) => n.id === npcId);
    if (!npc) return { ok: false, error: "unknown_step" };

    const chain = questsFor(npcId);
    const step = chain.find((s) => s.id === stepId);
    if (!step) return { ok: false, error: "unknown_step" };

    const rows = await rowsFor(buyerId, npc.map);
    const cur = activeStep(chain, rows);
    if (!cur || cur.step.id !== stepId) return { ok: false, error: "not_current" };
    if (cur.progress < step.need) return { ok: false, error: "not_finished" };

    // ⚠️ THE CLAIM STAMP IS THE LOCK. Conditional on claimed_at still being null, so two taps a few
    // milliseconds apart cannot both pay — the same guard the casino's stake uses, for the same reason.
    const won = await db.queryOne(
        `UPDATE mkt_grove_quest SET claimed_at = NOW(), updated_at = NOW()
          WHERE buyer_id = $1 AND step_id = $2 AND claimed_at IS NULL RETURNING step_id`,
        [buyerId, stepId],
    ).catch(() => null);
    if (!won) return { ok: false, error: "already_claimed" };

    return { ok: true, step: { id: step.id, title: step.title }, reward: step.reward, npc: npc.name };
}

// ── THE COLISEUM ─────────────────────────────────────────────────────────────────────────────────────────────

/** Keys, the daily, and how far this member has got on one map. */
export async function coliseumState(buyerId, mapN) {
    const row = await db.queryOne(
        `SELECT keys, daily_on, best_wave, runs, clears FROM mkt_grove_coliseum WHERE buyer_id = $1 AND map_n = $2`,
        [buyerId, mapN],
    ).catch(() => null);
    const marshal = COLISEUM_NPCS.find((n) => n.map === Number(mapN)) || null;
    return {
        map: Number(mapN),
        zone: COLISEUM_ZONE[Number(mapN)] ? (Number(mapN) - 1) * 12 + COLISEUM_ZONE[Number(mapN)] : null,
        marshal: marshal ? { id: marshal.id, name: marshal.name, line: marshal.line } : null,
        keys: Number(row?.keys) || 0,
        bestWave: Number(row?.best_wave) || 0,
        runs: Number(row?.runs) || 0,
        clears: Number(row?.clears) || 0,
        dailyReady: (row?.daily_on || null) !== centralDay(),
    };
}

/** Take the day's free key. Idempotent by the shop's own date, not by a timestamp. */
export async function claimDailyKey(buyerId, mapN) {
    const today = centralDay();
    const row = await db.queryOne(
        `INSERT INTO mkt_grove_coliseum (buyer_id, map_n, keys, daily_on)
         VALUES ($1,$2,1,$3)
         ON CONFLICT (buyer_id, map_n) DO UPDATE
           SET keys = mkt_grove_coliseum.keys + 1, daily_on = $3, updated_at = NOW()
         WHERE mkt_grove_coliseum.daily_on IS DISTINCT FROM $3
         RETURNING keys`,
        [buyerId, mapN, today],
    ).catch(() => null);
    if (!row) return { ok: false, error: "already_today" };
    return { ok: true, keys: Number(row.keys) || 0 };
}
