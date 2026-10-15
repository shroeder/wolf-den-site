import "server-only";

import { db } from "@/lib/db";

// ── WHAT A STRANGER SEES ────────────────────────────────────────────────────────────────────────────────────
// Luke: "when you are on the site and havent logged in. We need a way to show a pile of awesome sprites from
// the game all over and calls to action to sign up, and show off the previous giveaways and the next
// giveaway... I really need to convert visits to game sign ups."
//
// The giveaways are REAL and already in the database. Every weekly boss carries a prize_name and a winner, so
// "previous giveaways" is a query rather than a list somebody has to remember to update — and a wall of
// prizes that updates itself is the only kind that stays true. The alternative, an authored array in a file,
// is a marketing page that is accurate for one week.
//
// ⚠️ THIS IS THE ONE QUERY IN THE GROVE/BOSS AREA THAT FACES THE PUBLIC, SO IT SELECTS COLUMNS BY NAME.
// The admin prize-handouts list reads from the same join and deliberately carries email and phone, because
// whoever is on the counter has to be able to ring a winner who never came in. None of that may cross to a
// logged-out page. Listing the columns explicitly — rather than returning the row and trimming it in JS — is
// what makes a future column added to mkt_buyer unable to leak by default.

/** Winners of past boss raffles, newest first. Public-safe fields only. */
async function recentWinners(limit = 12) {
    const rows = await db.query(
        `SELECT be.name AS boss_name, be.prize_name, be.prize_image_url,
                be.winner_drawn_at, be.defeated_at,
                b.display_name, b.alias, b.avatar_sprite_url
           FROM boss_event be
           JOIN mkt_buyer b ON b.id = be.winner_buyer_id
          WHERE be.prize_name IS NOT NULL
            AND be.winner_buyer_id IS NOT NULL
          ORDER BY COALESCE(be.winner_drawn_at, be.defeated_at) DESC NULLS LAST
          LIMIT $1`,
        [limit],
    ).catch(() => []);

    return rows.map((r) => ({
        boss: r.boss_name || "The weekly boss",
        prize: r.prize_name,
        prizeImage: r.prize_image_url || null,
        // A first name or a handle is the most that belongs on a page anyone can load.
        winner: r.alias || r.display_name || "A member",
        avatar: r.avatar_sprite_url || null,
        wonAt: r.winner_drawn_at || r.defeated_at || null,
    }));
}

/** The prize currently on the table, if the live boss is carrying one. */
async function currentPrize() {
    const row = await db.queryOne(
        `SELECT name, prize_name, prize_image_url, started_at
           FROM boss_event
          WHERE status = 'live' AND defeated_at IS NULL
          ORDER BY started_at DESC LIMIT 1`,
    ).catch(() => null);
    if (!row?.prize_name) return null;
    return {
        boss: row.name || "This week's boss",
        prize: row.prize_name,
        prizeImage: row.prize_image_url || null,
        startedAt: row.started_at || null,
    };
}

/**
 * Numbers that prove the game is PLAYED rather than merely built.
 *
 * ⚠️ A ZERO IS WORSE THAN NOTHING HERE. A landing page that says "0 members" is an argument against signing
 * up, so each figure is returned as null when it cannot be read and the page omits the whole row rather than
 * printing a confident nought. Counts are cheap — three indexed aggregates — and the page revalidates on a
 * timer, so this does not run per visitor.
 */
async function proof() {
    const [members, bosses, prizes] = await Promise.all([
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer`).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM boss_event WHERE defeated_at IS NOT NULL`).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM boss_event WHERE prize_name IS NOT NULL AND winner_buyer_id IS NOT NULL`).catch(() => null),
    ]);
    const n = (r) => (Number(r?.n) > 0 ? Number(r.n) : null);
    return { members: n(members), bossesFelled: n(bosses), prizesGiven: n(prizes) };
}

export async function getGamePitch() {
    const [winners, prize, stats] = await Promise.all([
        recentWinners(),
        currentPrize(),
        proof(),
    ]);
    return { winners, prize, stats };
}
