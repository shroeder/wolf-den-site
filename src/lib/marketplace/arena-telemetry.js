import { db } from "@/lib/db";

// ── READING THE FIGHTS ───────────────────────────────────────────────────────────────────────────────────────
// The query side of the `telemetry` column written by boutTelemetry() in arena.js. Everything here answers a
// balance question with a number instead of an anecdote, which is the whole reason the column exists: the last
// three balance decisions were made off a screenshot and a hand-built model, and one of them was wrong in a
// way the data would have shown immediately.
//
// All read-only, all admin-gated, none of it on a hot path.

/** Recent bouts, newest first, with both fighters named. `kind` filters to member / ladder / gauntlet / town. */
export async function recentBouts({ limit = 40, kind = null, buyerId = null } = {}) {
    const rows = await db.query(
        `SELECT ab.id, ab.created_at, ab.rounds, ab.challenger_won, ab.npc_tier, ab.vp, ab.laurels, ab.telemetry,
                COALESCE(c.display_name, c.alias) AS challenger,
                COALESCE(d.display_name, d.alias) AS defender
           FROM mkt_arena_bout ab
           JOIN mkt_buyer c ON c.id = ab.challenger_id
           LEFT JOIN mkt_buyer d ON d.id = ab.defender_id
          WHERE ab.telemetry IS NOT NULL
            AND ($1::text IS NULL OR ab.telemetry->>'kind' = $1)
            AND ($2::uuid IS NULL OR ab.challenger_id = $2)
          ORDER BY ab.created_at DESC
          LIMIT $3`,
        [kind, buyerId, Math.min(200, Math.max(1, limit))]
    ).catch(() => []);
    return rows.map((r) => ({
        id: Number(r.id), at: r.created_at, rounds: Number(r.rounds) || 0,
        won: Boolean(r.challenger_won), npcTier: r.npc_tier,
        vp: Number(r.vp) || 0, laurels: Number(r.laurels) || 0,
        challenger: r.challenger, defender: r.defender || null,
        t: r.telemetry || null,
    }));
}

/**
 * The health check: is a room a fight, a walkover or a wall?
 *
 * Grouped by `kind` so the Road, the Gauntlet, the plaza and member duels are never averaged together — they
 * are four different balance problems and one number across all of them says nothing about any of them.
 */
export async function boutHealth({ hours = 48 } = {}) {
    const rows = await db.query(
        `SELECT telemetry->>'kind' AS kind,
                COUNT(*)::int AS bouts,
                COUNT(*) FILTER (WHERE challenger_won)::int AS wins,
                ROUND(AVG(rounds)::numeric, 1) AS avg_rounds,
                ROUND(AVG((telemetry->>'perRoundDealt')::numeric), 0) AS dealt_per_round,
                ROUND(AVG((telemetry->>'perRoundTaken')::numeric), 0) AS taken_per_round,
                -- The share of a swing the defender stops. The single most useful number in here: it is what
                -- moved when guard was halved, and what nobody could see when it did.
                ROUND(AVG(NULLIF((telemetry->'dealt'->>'turnedAside')::numeric, 0)
                        / NULLIF((telemetry->'dealt'->>'dealt')::numeric
                               + (telemetry->'dealt'->>'turnedAside')::numeric, 0)) * 100, 1) AS pct_turned_aside
           FROM mkt_arena_bout
          WHERE telemetry IS NOT NULL AND created_at > NOW() - ($1 || ' hours')::interval
          GROUP BY 1 ORDER BY 2 DESC`,
        [String(hours)]
    ).catch(() => []);
    return rows.map((r) => ({
        kind: r.kind || "unknown",
        bouts: Number(r.bouts) || 0,
        wins: Number(r.wins) || 0,
        winPct: Number(r.bouts) ? Math.round((Number(r.wins) / Number(r.bouts)) * 100) : 0,
        avgRounds: Number(r.avg_rounds) || 0,
        dealtPerRound: Number(r.dealt_per_round) || 0,
        takenPerRound: Number(r.taken_per_round) || 0,
        pctTurnedAside: Number(r.pct_turned_aside) || 0,
    }));
}

/**
 * Per-rung difficulty for the Road — where the wall actually is, measured rather than modelled.
 *
 * A rung that everybody loses is the end of the ladder whether or not it was meant to be, and a rung nobody
 * has reached reports nothing, which is itself the answer.
 */
export async function ladderHealth({ days = 14 } = {}) {
    const rows = await db.query(
        `SELECT (telemetry->>'rung')::int AS rung,
                COUNT(*)::int AS attempts,
                COUNT(*) FILTER (WHERE challenger_won)::int AS wins,
                ROUND(AVG(rounds)::numeric, 1) AS avg_rounds
           FROM mkt_arena_bout
          WHERE telemetry->>'kind' = 'ladder' AND telemetry->>'rung' IS NOT NULL
            AND created_at > NOW() - ($1 || ' days')::interval
          GROUP BY 1 ORDER BY 1`,
        [String(days)]
    ).catch(() => []);
    return rows.map((r) => ({
        rung: Number(r.rung), attempts: Number(r.attempts) || 0, wins: Number(r.wins) || 0,
        winPct: Number(r.attempts) ? Math.round((Number(r.wins) / Number(r.attempts)) * 100) : 0,
        avgRounds: Number(r.avg_rounds) || 0,
    }));
}

/**
 * Class matchup table for member duels — the question "is a Warden food for a Reaver" with an answer.
 *
 * This is the one that would have caught today: a defensive class losing to a burst class in five rounds is
 * one anecdote, and forty of them is a balance bug.
 */
export async function classMatchups({ days = 14 } = {}) {
    const rows = await db.query(
        `SELECT ca.arena_class AS challenger_class, da.arena_class AS defender_class,
                COUNT(*)::int AS bouts,
                COUNT(*) FILTER (WHERE ab.challenger_won)::int AS challenger_wins,
                ROUND(AVG(ab.rounds)::numeric, 1) AS avg_rounds
           FROM mkt_arena_bout ab
           JOIN mkt_arena ca ON ca.buyer_id = ab.challenger_id
           JOIN mkt_arena da ON da.buyer_id = ab.defender_id
          WHERE ab.defender_id IS NOT NULL AND ab.npc_tier IS NULL
            AND ca.arena_class IS NOT NULL AND da.arena_class IS NOT NULL
            AND ab.created_at > NOW() - ($1 || ' days')::interval
          GROUP BY 1, 2 ORDER BY 3 DESC`,
        [String(days)]
    ).catch(() => []);
    return rows.map((r) => ({
        challenger: r.challenger_class, defender: r.defender_class,
        bouts: Number(r.bouts) || 0, challengerWins: Number(r.challenger_wins) || 0,
        winPct: Number(r.bouts) ? Math.round((Number(r.challenger_wins) / Number(r.bouts)) * 100) : 0,
        avgRounds: Number(r.avg_rounds) || 0,
    }));
}
