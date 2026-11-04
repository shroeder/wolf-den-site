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
import { GROVE_NPCS, COLISEUM_NPCS, COLISEUM_ZONE, questsFor, npcsOnMap, foeName, partName, mapName, zoneByN, whereFor } from "@/lib/marketplace/grove-npcs.js";
import { GREET, SENDOFF, SPENT, fill, stepLines } from "@/lib/marketplace/grove-npc-dialogue.js";
import { awardXp } from "@/lib/marketplace/xp.js";

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

/**
 * The beats this step's state calls for, with the real creature and part names put in.
 *
 * ⚠️ ONLY THE BEATS FOR THE STATE. Sending all four would put the payoff line in the browser before the
 * work was done, which is a spoiler sitting in devtools.
 */
function sayFor(cur, npc) {
    const l = stepLines(cur.step.id, npc.id, npc.line);
    const names = { foe: foeName(cur.step.foe), part: partName(cur.step.part) };
    const f = (x) => fill(x, cur.step, names);
    if (!cur.started) return { problem: (l.problem || []).map(f), ask: f(l.ask) };
    if (cur.progress >= cur.step.need) return { done: (l.done || []).map(f), ask: f(l.ask) };
    return { nudge: f(l.nudge), ask: f(l.ask) };
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
                // ⚠️ THE REGION'S NAME, NOT ITS NUMBER. The log groups by region and "Map 3" is not a
                // place anybody has been to — the zone strip, the atlas and the giver all say Bogwater.
                mapName: mapName(map),
                zone: npc.zone,
                zoneName: zoneByN(npc.zone)?.name || null,
                steps: npc.chain.length,
                done,
                // Which link of the chain is in hand, so the log can say "step 2 of 5" rather than
                // leaving the player to subtract.
                step: done + 1,
                // `null` here means finished, and the screen says so rather than hiding the row — a chain you
                // completed is a thing you want to see you completed.
                // What they actually say, for the state this step is in. ⚠️ FILLED HERE, where the
                // resolved step is in hand — the client has the step id and nothing to turn
                // "{n} {foe}" into "37 Urchin Roller" with, and shipping raw placeholders to a
                // browser is how a player ends up reading the template.
                greet: cur ? (GREET[npc.id] || npc.line) : (SPENT[npc.id] || npc.line),
                sendoff: SENDOFF[npc.id] || "",
                active: cur
                    ? {
                        id: cur.step.id,
                        // ⚠️ THE TITLE GOES THROUGH fill() TOO. It is the one line of a step that was
                        // never templated, which is exactly why the ordinal in it could rot while the ask
                        // beside it stayed right. Anything a title says about a number now comes from the
                        // same place the ask does.
                        title: fill(cur.step.title, cur.step, {
                            foe: foeName(cur.step.foe), part: partName(cur.step.part),
                        }),
                        kind: cur.step.kind,
                        need: cur.step.need, progress: Math.min(cur.progress, cur.step.need),
                        ready: cur.progress >= cur.step.need,
                        // `started` is the acceptance — see acceptStep. Untaken means the giver is
                        // offering it, which is a different conversation from nudging you about it.
                        started: cur.started,
                        foe: cur.step.foe || null, part: cur.step.part || null,
                        // ⚠️ THE NAME, NOT THE ID. The tracker rendered `a.foe.replace(/_/g," ")`, so a
                        // row for voidmoth read "Voidmoth" while the creature is called Mothlight and the
                        // giver standing in the zone says Mothlight. One monster, two names, in two
                        // panels a tap apart. Resolved here because this is where the catalogue already
                        // is — the client would otherwise have to import it to spell a noun.
                        foeLabel: cur.step.foe ? foeName(cur.step.foe) : null,
                        partLabel: cur.step.part ? partName(cur.step.part) : null,
                        zone: cur.step.zone || null, wave: cur.step.wave || null,
                        // ⚠️ WHERE TO GO, RESOLVED SERVER-SIDE. Only delve and survive steps name a zone;
                        // a cull step names a creature and the player was left to remember which of twelve
                        // rooms has them in it. This is the map's own zone list searched for the target.
                        where: whereFor(cur.step, map),
                        reward: cur.step.reward,
                        say: sayFor(cur, npc),
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

            // ⚠️ A STEP NOBODY TOOK DOES NOT TICK. This used to INSERT the row itself, which meant a
            // chain advanced on its own: you could walk up to Warden Alder having already finished the
            // thing he was about to ask for, and his "I can't get to it" line would arrive over a
            // completed bar. The row IS the acceptance now — see acceptStep — so this only ever
            // UPDATES, and a step you have not been asked for counts nothing.
            if (!cur.started) continue;
            const next = Math.min(s.need, (cur.progress || 0) + add);
            if (next === cur.progress) continue;
            await db.query(
                `UPDATE mkt_grove_quest
                    SET progress = LEAST($5, GREATEST(progress, $5)), updated_at = NOW()
                  WHERE buyer_id = $1 AND step_id = $2 AND claimed_at IS NULL`,
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
/**
 * Take the step a giver is offering.
 *
 * ⚠️ NO MIGRATION FOR THIS, AND THAT IS THE POINT. mkt_grove_quest already had `started_at` and
 * activeStep already reported `started: Boolean(row)` — the row's EXISTENCE was always the record of
 * having begun, it was simply being created as a side effect of killing the right thing rather than by
 * anybody agreeing to anything. Creating it here, and nowhere else, turns the same row into an
 * acceptance without a second table to keep in step.
 *
 * ⚠️ RE-CHECKED FROM THE DATABASE, because the sheet that drew the button is a client. Only the chain's
 * current step may be taken, so a client cannot skip to the last one and have it tick.
 */
export async function acceptStep(buyerId, stepId) {
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
    if (cur.started) return { ok: true, already: true };

    // ⚠️ DO NOTHING ON CONFLICT. The row carries started_at, which is the moment the ask was made; a
    // second accept that moved it would be rewriting when the player was asked.
    await db.query(
        `INSERT INTO mkt_grove_quest (buyer_id, step_id, npc_id, map_n, progress)
         VALUES ($1,$2,$3,$4,0) ON CONFLICT (buyer_id, step_id) DO NOTHING`,
        [buyerId, stepId, npcId, npc.map],
    ).catch(() => {});
    return { ok: true, accepted: stepId };
}

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

    // ── ⚠️ AND NOW ACTUALLY PAY IT ──────────────────────────────────────────────────────────────────
    // Until today this function stamped claimed_at, returned `reward`, and that was the end of it. Nothing
    // anywhere consumed the object: no gold, no xp, no chest. Twenty-one chains, seventy-two steps, and
    // every single hand-in paid NOTHING while the UI said "paid." It was found while wiring the Coliseum
    // token onto the last step — the token would have been a fourth field nobody read.
    //
    // ⚠️ gold IS PASSED EXPLICITLY. awardXp pays gold 1:1 with points unless told otherwise, so taking the
    // default here would have paid the xp figure as gold on top of the gold figure.
    // See [[awardxp-gold-tracks-xp-landmine]].
    const paid = step.reward || {};
    if (paid.xp > 0 || paid.gold > 0) {
        await awardXp(buyerId, "grove_quest", {
            points: Math.max(1, Number(paid.xp) || 1),
            gold: Math.max(0, Number(paid.gold) || 0),
            // The claim stamp above is the lock, but a dedupe key costs nothing and makes a retry safe.
            dedupeKey: `grove_quest_${stepId}`,
            meta: { stepId, npc: npcId, map: npc.map },
        }).catch(() => {});
    }

    // ⚠️ THE GROVE'S OWN CHEST TABLE, NEVER addChests. mkt_chest rolls a CHAIN across eight tiers and the
    // first match wins, so a Grove tier dropped in there silently steals from every tier beneath it. Same
    // reason the boss grant keeps out of it. See [[chest-rolls-are-a-chain]].
    if (paid.chest) {
        await db.query(
            `INSERT INTO mkt_grove_chest (buyer_id, tier, qty) VALUES ($1, $2, 1)
             ON CONFLICT (buyer_id, tier) DO UPDATE
                SET qty = mkt_grove_chest.qty + 1, updated_at = NOW()`,
            [buyerId, paid.chest],
        ).catch(() => {});
    }

    // ── THE PARTS ───────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THROUGH storeParts, NOT A RAW INSERT. That function owns the bag cap and the overflow report;
    // writing straight into mkt_grove_item here would hand parts to a player whose pack is full and then
    // tell them nothing, which is the single most confusing thing this feature can do.
    //
    // ⚠️ DYNAMIC IMPORT because grove.js imports THIS file — a static import back is a cycle. Same shape
    // chests.js and arena-progress.js already use for addParts.
    let partsPaid = null;
    if (paid.parts > 0 && paid.partId) {
        const { storeParts } = await import("@/lib/marketplace/grove.js");
        const r = await storeParts(buyerId, { [paid.partId]: Number(paid.parts) }).catch(() => null);
        if (r) partsPaid = { part: paid.partId, n: Number(paid.parts), overflow: r.overflow || {} };
    }

    // The Coliseum token. Clamped at the cap rather than refused, so finishing a chain while full still
    // completes the chain — you simply do not get a fourth token you could not have held anyway.
    let token = 0;
    if (paid.token > 0) {
        const r = await db.queryOne(
            `INSERT INTO mkt_grove_coliseum (buyer_id, map_n, keys) VALUES ($1, $2, 1)
             ON CONFLICT (buyer_id, map_n) DO UPDATE
                SET keys = LEAST($3, mkt_grove_coliseum.keys + 1), updated_at = NOW()
             RETURNING keys`,
            [buyerId, npc.map, COLISEUM_KEY_CAP],
        ).catch(() => null);
        if (r) token = 1;
    }

    return {
        ok: true,
        step: { id: step.id, title: step.title },
        reward: step.reward,
        partsPaid,
        token,
        npc: npc.name,
    };
}

// ── ⚠️ HOW MANY TOKENS A PLAYER MAY HOLD ───────────────────────────────────────────────────────────────────
// Luke's call, asked directly: 3 per map. Enough that missing a day is not punishing and a good session can
// be spent in one sitting; not enough to bank a fortnight and marathon the chest ladder in an afternoon.
//
// ⚠️ ENFORCED AT EVERY FAUCET, NOT ON THE WAY OUT. Both sources — the daily and a finished chain — clamp
// against it, because a cap checked only when spending is not a cap, it is a display.
export const COLISEUM_KEY_CAP = 3;

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
           SET keys = LEAST($4, mkt_grove_coliseum.keys + 1), daily_on = $3, updated_at = NOW()
         WHERE mkt_grove_coliseum.daily_on IS DISTINCT FROM $3
         RETURNING keys`,
        [buyerId, mapN, today, COLISEUM_KEY_CAP],
    ).catch(() => null);
    if (!row) return { ok: false, error: "already_today" };
    return { ok: true, keys: Number(row.keys) || 0 };
}
