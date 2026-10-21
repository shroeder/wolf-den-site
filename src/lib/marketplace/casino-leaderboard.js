import "server-only";

import { db } from "@/lib/db";
import { nextRung } from "@/lib/marketplace/casino-milestones.js";

// ── THE BOARD ON THE WALL ────────────────────────────────────────────────────────────────────────────────
// Luke: "lets expose a leaderboard of lifetime winnings for the casino. Make it awesome and dopamine
// inducing."
//
// The dopamine is not the ranking. A list of names in order is a list of names in order, and for the
// twenty-fifth person on it the only information is that they are twenty-fifth. What makes a board worth
// walking over to is the three things underneath the order:
//
//   THE GAP. How far behind the person directly above you. That is the only number on the whole screen that
//   is actionable — it turns "I am 9th" into "I am 4,210 from 8th", and 4,210 is one good night.
//   THE STREAK. What each of them has won in the last seven days, so the board shows MOVEMENT and not just
//   accumulated history. A board where the same name has been top since August is a monument; one that shows
//   who is climbing is a race.
//   YOUR OWN ROW, ALWAYS. Pinned on, wherever you are, so there is no version of this screen that does not
//   have the viewer in it.
//
// ⚠️ IT READS THE SAME COLUMN THE LADDER DOES. casino_won, and nothing else — so the board and the Counter
// can never disagree about what somebody has won, which they would within a week if this re-derived it from
// the ledger with its own slightly different idea of which rows count.

const WINS = ["casino_slot_win", "slot5", "casino_bingo_win", "casino_blackjack_win", "casino_keno_win"];

// How many names the board shows. Ten is the number that fits on a phone without scrolling and is short
// enough that being ON it means something — a top fifty is a directory.
const TOP = 10;

/**
 * The board. `me` is pinned on whether or not they placed.
 *
 * ⚠️ THE OWNER IS ON IT. He is excluded from every report in casino-report.js because those measure the
 * FLOOR and he is the person testing it — but this is a scoreboard, he plays, and a leaderboard that quietly
 * omits one person is a leaderboard that is wrong. Different question, different answer.
 */
export async function leaderboard(buyerId) {
    const [rows, hot] = await Promise.all([
        db.query(
            // ⚠️ alias IS SELECTED BECAUSE display_name IS OFTEN NULL. Seven players on this board have a
            // perfectly good alias and no display name, so the scoreboard called them "Someone" -- in
            // public, next to their own winnings. alexromano3434 and WyldStallyn were sitting at 6th and
            // 7th as anonymous strangers.
            `SELECT id, display_name AS name, alias, avatar_sprite_url AS sprite, avatar_url AS fallback,
                    COALESCE(casino_won, 0)::bigint AS won
               FROM mkt_buyer WHERE COALESCE(casino_won, 0) > 0
              ORDER BY casino_won DESC`,
        ).catch(() => []),
        // The last seven days, from the casino's own ledger. A separate read rather than a column, because
        // "recently" is a question with a moving answer and a stored one would need a sweep to stay true.
        db.query(
            `SELECT buyer_id, SUM(GREATEST(delta, 0))::bigint AS n FROM mkt_casino_ledger
              WHERE delta > 0 AND reason = ANY($1) AND created_at > NOW() - INTERVAL '7 days'
              GROUP BY buyer_id`, [WINS],
        ).catch(() => []),
    ]);

    const recent = Object.fromEntries((hot || []).map((r) => [r.buyer_id, Number(r.n) || 0]));
    const ranked = (rows || []).map((r, i) => ({
        rank: i + 1,
        id: r.id,
        // display_name first, then alias -- the order used almost everywhere else in the codebase.
        // "Someone" now means a member who genuinely has neither, which is nobody on this board today.
        name: r.name || r.alias || "Someone",
        sprite: r.sprite || r.fallback || null,
        won: Number(r.won) || 0,
        week: recent[r.id] || 0,
        you: r.id === buyerId,
    }));

    const mine = ranked.find((r) => r.you) || null;
    const above = mine && mine.rank > 1 ? ranked[mine.rank - 2] : null;

    return {
        top: ranked.slice(0, TOP),
        // ⚠️ PINNED, AND ONLY WHEN THEY ARE NOT ALREADY UP THERE. Showing somebody twice is worse than not
        // showing them at all — it reads as a bug on the one row they are looking for.
        me: mine && mine.rank > TOP ? mine : null,
        rank: mine?.rank || null,
        of: ranked.length,
        won: mine?.won || 0,
        week: mine?.week || 0,
        // The whole point of the screen: one number, and it is small enough to believe.
        gap: above && mine ? above.won - mine.won : null,
        chasing: above?.name || null,
        // And what that climb is actually worth, so the board and the Counter are the same conversation.
        nextRung: mine ? nextRung(mine.won) : null,
        toRung: mine ? Math.max(0, (nextRung(mine.won) || 0) - mine.won) : null,
    };
}
