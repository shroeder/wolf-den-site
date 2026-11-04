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
import { GROVE_NPCS, COLISEUM_NPCS, COLISEUM_ZONE, questsFor, npcsOnMap, mapTargets, foeName, partName, mapName, zoneByN, whereFor } from "@/lib/marketplace/grove-npcs.js";
import { fill } from "@/lib/marketplace/grove-quest-text.js";
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

// ⚠️ sayFor() STOOD HERE and resolved the four beats a step's state called for — the greeting, the
// problem, the nudge and the payoff. Removed with the dialogue: there is nothing to say any more, only
// something to show.

// ⚠️ A DELVE STORES ITS DESTINATION IN `need`, NOT IN `zone`. questsFor sets zone = base + need for a
// delve, so both work there — but survive and ticket steps only have one of the two, and a helper that
// guesses is how the wrong room gets named. One place decides it.
function zoneNameFor(step) {
    const n = step?.zone || (step?.kind === "delve" ? step?.need : null);
    return n ? (zoneByN(n)?.name || null) : null;
}

// ⚠️ A TITLE IS A TEMPLATE AND THERE ARE THREE WAYS OUT OF THIS FILE. Luke: "I see make noise in brackets
// zone name bracket." questBoard filled its copy and the in-play toast and the hand-in result did not.
// One function now, used by all three; a raw `step.title` must not appear in a return anywhere.
//
// It is also the ONLY authored string left in a quest. Everything else a screen shows — the ask, the
// progress, where to go — is built from the step's own fields.
function titleOf(step) {
    return fill(step.title, step, {
        foe: foeName(step.foe), part: partName(step.part), zone: zoneNameFor(step),
    });
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
                // ⚠️ CARRIED THROUGH, NOT INFERRED. grove.js uses this to keep the marshal out of
                // npcHere so the scene does not paint him twice; a board row that dropped the flag
                // would put a second figure outside the Coliseum and nothing would error.
                coliseum: Boolean(npc.coliseum),
                zone: npc.zone,
                zoneName: zoneByN(npc.zone)?.name || null,
                steps: npc.chain.length,
                done,
                // Which link of the chain is in hand, so the log can say "step 2 of 5" rather than
                // leaving the player to subtract.
                step: done + 1,
                // ⚠️ NO greet, sendoff OR say. A card that is a display has nothing to narrate; what
                // it shows is the step, and what the step is comes from the fields below.
                active: cur
                    ? {
                        id: cur.step.id,
                        // ⚠️ THE TITLE GOES THROUGH fill() TOO. It is the one line of a step that was
                        // never templated, which is exactly why the ordinal in it could rot while the ask
                        // beside it stayed right. Anything a title says about a number now comes from the
                        // same place the ask does.
                        title: titleOf(cur.step),
                        kind: cur.step.kind,
                        need: cur.step.need, progress: Math.min(cur.progress, cur.step.need),
                        // ⚠️ WHETHER `need` IS A QUANTITY AT ALL. For a cull it is "twelve Mothlight" and
                        // a bar is the right picture. For a delve it is the ZONE INDEX -- so the card drew
                        // "0/6" directly under "go to the 6th chamber": the same number twice, and neither
                        // of them a thing you can collect. Progress on these is binary, so the screens show
                        // the destination instead of a fraction.
                        counts: !["delve", "survive", "ticket"].includes(cur.step.kind),
                        zoneName: zoneNameFor(cur.step),
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
            // ── ⚠️ THIS UPDATE THREW ON EVERY CALL IT HAS EVER MADE ────────────────────────────
            // Luke: "The question pop up says 6 of 6 complete, the npc says 0 of 6." The NPC was right.
            // cart_1 was progress 0 in the database while the toast announced 6 of 6.
            //
            // The statement referenced $1, $2 and $5 and was handed FIVE parameters, so npc.id and map
            // arrived as $3 and $4 with nothing to infer a type from. Postgres answers "could not
            // determine data type of parameter $3" and refuses the whole statement -- and the .catch()
            // on the end threw that away. NO QUEST PROGRESS HAS EVER BEEN WRITTEN. Every bar in the
            // feature has been sitting at zero since the day it was built.
            //
            // ⚠️ AND THE TOAST REPORTED THE INTENDED NUMBER, WHICH IS WHY IT LOOKED FINE. touched was
            // pushed unconditionally, so the screen announced what the code MEANT to store. Two paths for
            // one number always drift; this one drifted on the very first call.
            // See [[atomic-split-into-steps-drops-lines]].
            //
            // So: only the parameters the statement actually uses, and the row it wrote is the row the
            // screen is told about. RETURNING is the proof -- no row back, no toast.
            const wrote = await db.queryOne(
                `UPDATE mkt_grove_quest
                    SET progress = LEAST($3, GREATEST(progress, $3)), updated_at = NOW()
                  WHERE buyer_id = $1 AND step_id = $2 AND claimed_at IS NULL
                  RETURNING progress`,
                [buyerId, s.id, next],
            ).catch(() => null);
            if (!wrote) continue;
            const stored = Number(wrote.progress);
            touched.push({ step: s.id, progress: stored, need: s.need, done: stored >= s.need, title: titleOf(s) });
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

    // ⚠️ THE CLAIM BANKED A CHEST HERE for the last step of a chain. Chests are removed; the step
    // pays gold, xp, parts and the Coliseum token.

    // ── THE PARTS ───────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THROUGH storeParts, NOT A RAW INSERT. That function owns the bag cap and the overflow report;
    // writing straight into mkt_grove_item here would hand parts to a player whose pack is full and then
    // tell them nothing, which is the single most confusing thing this feature can do.
    //
    // ⚠️ DYNAMIC IMPORT because grove.js imports THIS file — a static import back is a cycle. Same shape
    // chests.js and arena-progress.js already use for addParts.
    // ── ⚠️ A HAUL, ROLLED FROM THIS MAP'S OWN TABLES ──────────────────────────────────────────────
    // Luke: "Quests can give gold and exp but they should offer random loot as well... depending on the
    // zone."
    //
    // It paid ONE part, chosen deterministically, in a fixed amount -- so every hand-in on a map gave the
    // same thing and a chain's fifth step felt like its first. Now it rolls two or three DIFFERENT parts
    // out of mapTargets(map).parts, which is the pool that map's own creatures drop, in amounts that climb
    // with depth. Same tables the zone already uses, so this adds no content and cannot name a part that
    // does not exist there.
    //
    // ⚠️ STILL NOT THE PART THEY JUST ASKED FOR. Being handed more of the thing you were sent to collect
    // is a refund, not a reward -- the rule the old single-part pick already had, kept.
    //
    // ⚠️ AND IT IS SEEDED ON THE STEP, NOT ON THE CLOCK. A claim that rerolled per attempt would let a
    // failed write be retried for better loot. Same step, same haul, every time.
    const rollFor = (seedStr) => {
        let h = 2166136261;
        for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    };

    let partsPaid = null;
    const pool = (mapTargets(npc.map).parts || []).filter((x) => x !== step.part);
    if (paid.parts > 0 && pool.length) {
        const rnd = rollFor(`${buyerId}|${stepId}`);
        const kinds = Math.min(pool.length, 2 + (rnd() < 0.45 ? 1 : 0));
        const picked = [];
        const left = [...pool];
        for (let i = 0; i < kinds && left.length; i += 1) {
            picked.push(left.splice(Math.floor(rnd() * left.length), 1)[0]);
        }
    // ⚠️ THE MIX IS WHAT VARIES, NOT THE TOTAL. The first cut made the budget `parts x kinds`, so a
        // step that rolled three kinds paid three times one that rolled two -- a 3x swing in part income
        // decided by a coin flip, which is an economy change wearing a variety costume. The haul is a
        // FIXED multiple of the authored figure and the roll only decides how it is split.
        //
        // ⚠️ 2x IS A DELIBERATE BUMP AND IT IS THE ONLY ONE HERE. Luke asked for quests to pay loot, and
        // one part per hand-in was thin enough that nobody noticed it arriving. Stated here so the next
        // person tuning part income can find the number instead of inferring it.
        // See [[economy-nerf-measure-daily-total]].
        const budget = Math.max(picked.length, Number(paid.parts) * 2);
        const give = {};
        let spent = 0;
        for (let i = 0; i < picked.length; i += 1) {
            const share = i === picked.length - 1
                ? budget - spent
                : Math.max(1, Math.round((budget / picked.length) * (0.6 + rnd() * 0.8)));
            const n = Math.max(1, Math.min(share, budget - spent - (picked.length - 1 - i)));
            give[picked[i]] = n;
            spent += n;
        }
        const { storeParts } = await import("@/lib/marketplace/grove.js");
        const r = await storeParts(buyerId, give).catch(() => null);
        if (r) {
            partsPaid = {
                parts: give,
                // The first row keeps the old shape, so a screen that only knew how to show one still does.
                part: picked[0], n: give[picked[0]],
                overflow: r.overflow || {},
            };
        }
    }

    // ── ⚠️ A CHEST, FROM THE GAME'S OWN EIGHT-TIER LADDER ─────────────────────────────────────────
    // Luke: "I dont want grove chests. I want the grove quests to rewards typical loot chest, you know
    // iron wooden etc."
    //
    // So this is addChests and mkt_chest -- the wheel's chests, the boss's chests, the mine's -- NOT the
    // four Grove tiers that were removed this afternoon. Nothing new to open, nothing new to draw: a
    // quest now pays the chest every other part of the game already pays.
    //
    // ⚠️ DEPTH PICKS THE TIER, AND IT STOPS AT MYTHIC. Everything above it -- ascendant, eternal,
    // celestial, primordial -- is elite-sourced and is how real-money gear enters the game; a repeatable
    // route to one through questing would be a hole in that. Map 7 paying mythic is already the best
    // chest in the game that is not elite.
    //
    // ⚠️ AND THIS IS A BOUNDED GRANT, NOT A FAUCET. A step can be claimed once, ever, and there are 71
    // in the whole game. Whatever the rate, the lifetime supply per account is fixed -- which is why a
    // coin-flip here is safe where the same odds on a kill loop would not be. See [[chest-rolls-are-a-chain]]
    // for why the TIER matters more than the rate: the roll inside a chest is first-match-wins, so handing
    // out a higher tier steals from every tier beneath it.
    const CHEST_BY_MAP = ["wooden", "wooden", "iron", "iron", "gold", "gold", "mythic"];
    const UP = { wooden: "iron", iron: "gold", gold: "mythic", mythic: "mythic" };
    let chest = null;
    {
        const base = CHEST_BY_MAP[Math.min(CHEST_BY_MAP.length - 1, Math.max(0, npc.map - 1))];
        const lastOfChain = chain.length > 0 && chain[chain.length - 1].id === step.id;
        // The last step of a chain is the beat that already pays the Coliseum token, so it gets the
        // better chest rather than a second kind of reward nobody was expecting.
        const rnd = rollFor(`${buyerId}|${stepId}|chest`);
        if (lastOfChain) chest = UP[base] || base;
        else if (rnd() < 0.5) chest = base;
        if (chest) {
            const { addChests } = await import("@/lib/marketplace/chests.js");
            const ok = await addChests(buyerId, { [chest]: 1 }, {
                source: "grove_quest", meta: { stepId, npc: npcId, map: npc.map },
            }).then(() => true).catch(() => false);
            // ⚠️ ONLY REPORT WHAT WAS GRANTED. The quest toast spent the whole life of this feature
            // announcing a number the database had refused; not again.
            if (!ok) chest = null;
        }
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
        step: { id: step.id, title: titleOf(step) },
        reward: step.reward,
        partsPaid,
        chest,
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
