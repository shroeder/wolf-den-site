import "server-only";

import { db } from "@/lib/db.js";
import { ACTS, QUEST_BY_KEY, actForTown, actProgress } from "@/lib/marketplace/acts.js";
import { ACCEPTED, FAREWELL, HAIL, linesFor } from "@/lib/marketplace/act-dialogue.js";
import { giverFor } from "@/lib/marketplace/town-hunts.js";

// ── THE LADDER, SERVER SIDE ──────────────────────────────────────────────────────────────────────────────────
// Reading is three queries and no writes: what has been accepted, what has been claimed, and how many of the
// relevant events happened inside each accepted rung's window. Accepting is one insert. Claiming is one
// insert and one upsert.
//
// ⚠️ PROGRESS IS STILL COUNTED, NEVER STORED — 493's rule, and it still holds. The only thing that changed is
// the lower bound: a rung counts events after the moment it was ACCEPTED, rather than over all time. See
// migration 509 for why, but the short version is that a veteran used to walk up to "bring up fifteen ore"
// and find it already solved, which is not being asked for help.
//
// ── THE FOUR STATES A RUNG CAN BE IN ─────────────────────────────────────────────────────────────────────────
//   locked     an earlier rung is unclaimed. Visible, because the ladder is meant to be read ahead.
//   offered    open, not yet taken. This is the one the NPC is standing there wanting to talk about.
//   active     taken, not finished. Carries have/need, which is what the tracker draws.
//   ready      taken and finished. The NPC has something to say and a perk to hand over.
//   claimed    done.
// Exactly one rung is ever `offered` or `active` — that is what makes it a chain rather than a list.

/**
 * How many of each event happened for this member, per rung, since that rung was accepted.
 *
 * ⚠️ ONE QUERY FOR THE WHOLE LADDER, not one per rung. Five rungs would otherwise be five round trips on the
 * neon() HTTP driver, which is five TLS handshakes — the exact family-A cost CLAUDE.md opens with. The
 * windows differ per rung, so the filter is built as a set of (event, since) pairs and counted in one pass.
 */
async function countsSince(buyerId, pairs) {
    if (!buyerId || !pairs.length) return {};
    const events = [...new Set(pairs.map((p) => p.event))];
    const earliest = pairs.reduce((min, p) => (p.since < min ? p.since : min), pairs[0].since);
    const rows = await db.query(
        `SELECT event, created_at
           FROM mkt_activity_event
          WHERE buyer_id = $1 AND event = ANY($2) AND created_at >= $3`,
        [buyerId, events, earliest],
    ).catch(() => []);
    const out = {};
    for (const p of pairs) {
        out[p.key] = (rows || []).filter((r) => r.event === p.event && new Date(r.created_at) >= new Date(p.since)).length;
    }
    return out;
}

/**
 * The ladder for one town, ready to render, with the dialogue for whatever state it is in.
 *
 * Returns null when the town has no act — the honest answer rather than an empty board that looks broken.
 */
export async function actBoard(buyerId, townId) {
    const act = actForTown(townId);
    if (!act || !buyerId) return null;

    const [claimedRows, acceptRows] = await Promise.all([
        db.query(`SELECT quest_key FROM mkt_act_quest WHERE buyer_id = $1 AND act_n = $2`, [buyerId, act.n]).catch(() => []),
        db.query(`SELECT quest_key, accepted_at FROM mkt_act_accept WHERE buyer_id = $1 AND act_n = $2`, [buyerId, act.n]).catch(() => []),
    ]);
    const claimed = (claimedRows || []).map((r) => r.quest_key);
    const acceptedAt = Object.fromEntries((acceptRows || []).map((r) => [r.quest_key, r.accepted_at]));
    const { rungs, done, next } = actProgress(act, claimed);

    const windows = rungs
        .filter((r) => acceptedAt[r.key] && !r.claimed)
        .map((r) => ({ key: r.key, event: r.event, since: acceptedAt[r.key] }));
    const have = await countsSince(buyerId, windows);

    const shaped = rungs.map((r) => {
        const n = Math.min(Number(have[r.key] || 0), r.need);
        const accepted = Boolean(acceptedAt[r.key]);
        const state = r.claimed ? "claimed"
            : !r.open ? "locked"
                : !accepted ? "offered"
                    : n >= r.need ? "ready" : "active";
        return {
            key: r.key, title: r.title, desc: r.desc,
            need: r.need, have: n, state, perk: r.perk,
            // The dialogue the client needs for THIS state, and nothing else — the other beats are not the
            // player's business yet, and shipping all four would put the payoff line in the browser before
            // the work was done.
            say: sayFor(r.key, act.town, r.desc, state),
        };
    });

    // The one rung the NPC is actually about. Everything else on the ladder is read-ahead.
    const focus = shaped.find((r) => r.state === "ready")
        || shaped.find((r) => r.state === "active")
        || shaped.find((r) => r.state === "offered")
        || null;

    return {
        n: act.n,
        name: act.name,
        blurb: act.blurb,
        town: act.town,
        giver: giverFor(act.town),
        hail: done ? (FAREWELL[act.town] || "") : (HAIL[act.town] || ""),
        accepted: ACCEPTED[act.town] || "",
        done,
        nextKey: next?.key || null,
        focusKey: focus?.key || null,
        rungs: shaped,
    };
}

/** Only the beats that belong to the state the player is actually in. */
function sayFor(key, townId, desc, state) {
    const l = linesFor(key, townId, desc);
    if (state === "offered") return { problem: l.problem, ask: l.ask };
    if (state === "active") return { nudge: l.nudge, ask: l.ask };
    if (state === "ready") return { done: l.done, ask: l.ask };
    return null;
}

/**
 * Take a rung.
 *
 * ⚠️ RE-CHECKED HERE, like the claim below, because the sheet that drew the button is a client. Order and
 * double-accept are both decided from the database at the moment of the accept.
 */
export async function acceptActQuest(buyerId, questKey) {
    const q = QUEST_BY_KEY[questKey];
    if (!buyerId || !q) return { ok: false, error: "unknown_quest" };
    const act = ACTS.find((a) => a.n === q.act);

    const claimedRows = await db.query(
        `SELECT quest_key FROM mkt_act_quest WHERE buyer_id = $1 AND act_n = $2`, [buyerId, act.n],
    ).catch(() => []);
    const claimed = (claimedRows || []).map((r) => r.quest_key);
    if (claimed.includes(questKey)) return { ok: false, error: "already_claimed" };

    const { rungs } = actProgress(act, claimed);
    if (!rungs.find((r) => r.key === questKey)?.open) return { ok: false, error: "locked" };

    // ⚠️ DO NOTHING ON CONFLICT, never update. accepted_at is the lower bound of the progress window, so a
    // second accept that moved it would silently wipe whatever the player had already done toward the rung.
    await db.query(
        `INSERT INTO mkt_act_accept (buyer_id, quest_key, act_n) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [buyerId, questKey, act.n],
    ).catch(() => {});
    return { ok: true, accepted: questKey };
}

/**
 * Claim a finished rung.
 *
 * ⚠️ EVERY CHECK IS RE-RUN HERE, because the board that drew the button is a client and a client can ask for
 * anything. Order, acceptance, completion and double-claim are all decided from the database at the moment of
 * the claim — the reply the board rendered from is a suggestion, not an authority.
 */
export async function claimActQuest(buyerId, questKey) {
    const q = QUEST_BY_KEY[questKey];
    if (!buyerId || !q) return { ok: false, error: "unknown_quest" };
    const act = ACTS.find((a) => a.n === q.act);

    const [claimedRows, acceptRow] = await Promise.all([
        db.query(`SELECT quest_key FROM mkt_act_quest WHERE buyer_id = $1 AND act_n = $2`, [buyerId, act.n]).catch(() => []),
        db.queryOne(`SELECT accepted_at FROM mkt_act_accept WHERE buyer_id = $1 AND quest_key = $2`, [buyerId, questKey]).catch(() => null),
    ]);
    const claimed = (claimedRows || []).map((r) => r.quest_key);
    if (claimed.includes(questKey)) return { ok: false, error: "already_claimed" };

    const { rungs } = actProgress(act, claimed);
    const rung = rungs.find((r) => r.key === questKey);
    if (!rung?.open) return { ok: false, error: "locked" };
    // ⚠️ A RUNG THAT WAS NEVER TAKEN CANNOT BE TURNED IN. Without this the accept step is cosmetic: a client
    // could POST a claim for an untaken rung and be paid off its whole-history count, which is precisely the
    // accidental completion 509 exists to stop.
    if (!acceptRow?.accepted_at) return { ok: false, error: "not_accepted" };

    const have = await countsSince(buyerId, [{ key: questKey, event: q.event, since: acceptRow.accepted_at }]);
    if ((have[questKey] || 0) < q.need) return { ok: false, error: "not_done" };

    // ⚠️ THE INSERT IS THE LOCK. ON CONFLICT DO NOTHING + RETURNING means two taps in the same second produce
    // one row and one perk — the second one gets nothing back and stops here, rather than paying twice.
    const ins = await db.query(
        `INSERT INTO mkt_act_quest (buyer_id, quest_key, act_n) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING quest_key`,
        [buyerId, questKey, act.n],
    ).catch(() => []);
    if (!ins?.length) return { ok: false, error: "already_claimed" };

    if (q.perk?.slot && q.perk.pct) {
        await db.query(
            `INSERT INTO mkt_act_perk (buyer_id, slot, pct) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, slot) DO UPDATE SET pct = mkt_act_perk.pct + $3`,
            [buyerId, q.perk.slot, q.perk.pct],
        ).catch(() => {});
    }
    return { ok: true, perk: q.perk || null, title: q.title };
}

/** Every act perk this member holds, as { slot: pct }. One query; read by the tool channel. */
export async function actPerks(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(`SELECT slot, pct FROM mkt_act_perk WHERE buyer_id = $1`, [buyerId])
        .catch(() => []);
    return Object.fromEntries((rows || []).map((r) => [r.slot, Number(r.pct) || 0]));
}

/**
 * The one line the rest of the game needs: what is this member on, and how far in.
 *
 * ⚠️ FOR THE TRACKER, AND IT IS DELIBERATELY NOT getTownState's JOB. Luke wants quest awareness to be a
 * first-class thing rather than something you only learn by walking back to an NPC — so this is read by the
 * HUD, from any screen, which means it has to be cheap: two indexed reads and a count, no art, no roster, no
 * ladder. Returns null for the overwhelmingly common case of nothing in progress.
 */
export async function activeQuestFor(buyerId, townId) {
    const act = actForTown(townId);
    if (!act || !buyerId) return null;
    const row = await db.queryOne(
        `SELECT a.quest_key, a.accepted_at
           FROM mkt_act_accept a
      LEFT JOIN mkt_act_quest q ON q.buyer_id = a.buyer_id AND q.quest_key = a.quest_key
          WHERE a.buyer_id = $1 AND a.act_n = $2 AND q.quest_key IS NULL
       ORDER BY a.accepted_at DESC LIMIT 1`,
        [buyerId, act.n],
    ).catch(() => null);
    if (!row?.quest_key) return null;
    const q = QUEST_BY_KEY[row.quest_key];
    if (!q) return null;
    const have = await countsSince(buyerId, [{ key: row.quest_key, event: q.event, since: row.accepted_at }]);
    const n = Math.min(Number(have[row.quest_key] || 0), q.need);
    return {
        key: row.quest_key, title: q.title, desc: q.desc,
        have: n, need: q.need, ready: n >= q.need,
        giver: giverFor(act.town), town: act.town,
    };
}
