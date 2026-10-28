import "server-only";

import { db } from "@/lib/db.js";
import { ACTS, QUEST_BY_KEY, actForTown, actProgress } from "@/lib/marketplace/acts.js";

// ── THE BOARD, SERVER SIDE ───────────────────────────────────────────────────────────────────────────────────
// Reading a board is two queries and no writes: what has been claimed, and how many of each event the member
// has. Claiming is one insert, one upsert and one ledger line.
//
// ⚠️ PROGRESS IS COUNTED, NEVER STORED. Every rung is "how many `mine_trip` rows does this member have", so a
// quest can be added, re-worded or re-tuned by editing acts.js alone — no migration, no backfill, and no
// counter anywhere in the game to keep in step. It also means a rung cannot be out of sync with reality: the
// event log IS reality.

/** Counts for exactly the events an act needs — not the whole log. */
async function countsFor(buyerId, events) {
    if (!buyerId || !events.length) return {};
    const rows = await db.query(
        `SELECT event, COUNT(*)::int AS n
           FROM mkt_activity_event
          WHERE buyer_id = $1 AND event = ANY($2)
          GROUP BY event`,
        [buyerId, events],
    ).catch(() => []);
    return Object.fromEntries((rows || []).map((r) => [r.event, Number(r.n) || 0]));
}

/**
 * The board for one town, ready to render.
 *
 * Returns null when the town has no act — which is every town while the acts are still being written, and is
 * the honest answer rather than an empty board that looks broken.
 */
export async function actBoard(buyerId, townId) {
    const act = actForTown(townId);
    if (!act || !buyerId) return null;

    const [claimedRows, counts] = await Promise.all([
        db.query(`SELECT quest_key FROM mkt_act_quest WHERE buyer_id = $1 AND act_n = $2`, [buyerId, act.n])
            .catch(() => []),
        countsFor(buyerId, [...new Set(act.quests.map((q) => q.event))]),
    ]);
    const claimed = (claimedRows || []).map((r) => r.quest_key);
    const { rungs, done, next } = actProgress(act, claimed);

    return {
        n: act.n,
        name: act.name,
        blurb: act.blurb,
        done,
        nextKey: next?.key || null,
        rungs: rungs.map((r) => {
            const have = Number(counts[r.event] || 0);
            return {
                key: r.key, title: r.title, desc: r.desc,
                need: r.need, have: Math.min(have, r.need),
                open: r.open, claimed: r.claimed,
                // Claimable is the only state the button cares about: open, finished, and not yet taken.
                claimable: r.open && !r.claimed && have >= r.need,
                perk: r.perk,
            };
        }),
    };
}

/**
 * Claim a finished rung.
 *
 * ⚠️ EVERY CHECK IS RE-RUN HERE, because the board that drew the button is a client and a client can ask for
 * anything. Order, completion and double-claim are all decided from the database at the moment of the claim —
 * the reply the board rendered from is a suggestion, not an authority.
 */
export async function claimActQuest(buyerId, questKey) {
    const q = QUEST_BY_KEY[questKey];
    if (!buyerId || !q) return { ok: false, error: "unknown_quest" };
    const act = ACTS.find((a) => a.n === q.act);

    const claimedRows = await db.query(
        `SELECT quest_key FROM mkt_act_quest WHERE buyer_id = $1 AND act_n = $2`, [buyerId, act.n],
    ).catch(() => []);
    const claimed = (claimedRows || []).map((r) => r.quest_key);
    if (claimed.includes(questKey)) return { ok: false, error: "already_claimed" };

    const { rungs } = actProgress(act, claimed);
    const rung = rungs.find((r) => r.key === questKey);
    if (!rung?.open) return { ok: false, error: "locked" };

    const counts = await countsFor(buyerId, [q.event]);
    if ((counts[q.event] || 0) < q.need) return { ok: false, error: "not_done" };

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
    return { ok: true, perk: q.perk || null };
}

/** Every act perk this member holds, as { slot: pct }. One query; read by the tool channel. */
export async function actPerks(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(`SELECT slot, pct FROM mkt_act_perk WHERE buyer_id = $1`, [buyerId])
        .catch(() => []);
    return Object.fromEntries((rows || []).map((r) => [r.slot, Number(r.pct) || 0]));
}
