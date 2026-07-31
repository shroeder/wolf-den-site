import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { STOCKADE_PENALTY, stockadeMultiplier } from "@/lib/marketplace/stockade-penalty.js";

export { STOCKADE_PENALTY, stockadeMultiplier };

// ── THE STOCKADE ─────────────────────────────────────────────────────────────────────────────────────────────
//
// A public fixture in the town plaza holding whoever was last caught cheating. Anyone walking past can shame
// them or throw rotten fruit a few times a day. The occupant wears the Mark of Shame — a locked primary badge
// and a real passive debuff — until an admin releases them.
//
// The rate limits are the design. Three of each per person per day means the plaza has something to do every
// day without turning into a hundred taps in one sitting, and it caps how much XP the pack can farm off one
// person's mistake.

export const SHAME_PER_DAY = 3;
export const FRUIT_PER_DAY = 3;
export const SHAME_XP = 15;
export const FRUIT_XP = 25;
export const FRUIT_COIN = 10;
export const MARK_BADGE = "mark_of_shame";

/** The store-local day, so "3 a day" rolls over at the same boundary as everything else in the game. */
const today = () => db.queryOne(`SELECT (NOW() AT TIME ZONE 'America/Chicago')::date::text AS d`).then((r) => r?.d);

/** Who is currently in the stockade (null if it's empty). Cheap enough to call on every town poll. */
export async function getOccupant() {
    return db
        .queryOne(
            `SELECT s.buyer_id, s.reason, s.placed_at, s.shame_count, s.fruit_count,
                    b.alias, b.display_name, b.avatar_sprite_url, b.avatar_sprite_flip
               FROM mkt_stockade s
               JOIN mkt_buyer b ON b.id = s.buyer_id
              WHERE s.released_at IS NULL
              LIMIT 1`
        )
        .catch(() => null);
}

/** Full state for the town UI: who's in, and how many swings the viewer has left today. */
export async function getStockadeState(viewerId) {
    const occupant = await getOccupant();
    if (!occupant) return { occupant: null };
    const day = await today();
    const rows = viewerId
        ? await db
              .query(
                  `SELECT kind, count FROM mkt_stockade_action
                    WHERE buyer_id = $1 AND target_id = $2 AND day = $3::date`,
                  [viewerId, occupant.buyer_id, day]
              )
              .catch(() => [])
        : [];
    const used = Object.fromEntries(rows.map((r) => [r.kind, Number(r.count) || 0]));
    return {
        occupant: {
            alias: occupant.alias,
            name: occupant.display_name || occupant.alias,
            spriteUrl: occupant.avatar_sprite_url || null,
            spriteFlip: occupant.avatar_sprite_flip === true,
            reason: occupant.reason,
            placedAt: occupant.placed_at,
            shameCount: Number(occupant.shame_count) || 0,
            fruitCount: Number(occupant.fruit_count) || 0,
        },
        // The occupant doesn't get to pelt themselves for XP.
        isOccupant: Boolean(viewerId) && viewerId === occupant.buyer_id,
        shame: { used: used.shame || 0, max: SHAME_PER_DAY, xp: SHAME_XP },
        fruit: { used: used.fruit || 0, max: FRUIT_PER_DAY, xp: FRUIT_XP, coin: FRUIT_COIN },
    };
}

/**
 * Shame the occupant, or throw fruit at them. `kind` is "shame" | "fruit".
 *
 * The daily cap is enforced by the INSERT itself, not by a read-then-write: the whole point of this button is
 * that people mash it, and a COUNT-then-insert lets a burst of taps all read "2 used" before any of them
 * commits. The conditional upsert can only ever take the count to its cap.
 */
export async function actOnOccupant(viewerId, kind) {
    if (!viewerId) return { ok: false, error: "unauthorized" };
    if (kind !== "shame" && kind !== "fruit") return { ok: false, error: "bad_kind" };

    const occupant = await getOccupant();
    if (!occupant) return { ok: false, error: "empty" };
    if (occupant.buyer_id === viewerId) return { ok: false, error: "thats_you" };

    const day = await today();
    const cap = kind === "shame" ? SHAME_PER_DAY : FRUIT_PER_DAY;
    const claimed = await db
        .queryOne(
            `INSERT INTO mkt_stockade_action (buyer_id, target_id, day, kind, count)
             VALUES ($1, $2, $3::date, $4, 1)
             ON CONFLICT (buyer_id, target_id, day, kind)
             DO UPDATE SET count = mkt_stockade_action.count + 1
                     WHERE mkt_stockade_action.count < $5
             RETURNING count`,
            [viewerId, occupant.buyer_id, day, kind, cap]
        )
        .catch(() => null);
    if (!claimed) return { ok: false, error: "out_of_turns" };

    const col = kind === "shame" ? "shame_count" : "fruit_count";
    await db.query(`UPDATE mkt_stockade SET ${col} = ${col} + 1 WHERE buyer_id = $1 AND released_at IS NULL`, [occupant.buyer_id]).catch(() => {});

    const xp = kind === "shame" ? SHAME_XP : FRUIT_XP;
    const gold = kind === "fruit" ? FRUIT_COIN : 0;
    // No dedupeKey — the cap above already bounds this, and a dedupe key would silently swallow taps 2 and 3.
    await awardXp(viewerId, kind === "shame" ? "stockade_shame" : "stockade_fruit", {
        points: xp,
        gold,
        meta: { target: occupant.alias || occupant.buyer_id },
    }).catch(() => {});
    await trackActivity(viewerId, "stockade_act", { kind, target: occupant.alias }).catch(() => {});

    return { ok: true, kind, xp, gold, left: Math.max(0, cap - Number(claimed.count)) };
}

/** Put someone in. Sets the locked badge and grants the Mark so it shows on their card immediately. */
export async function placeInStockade(buyerId, { reason, byId = null } = {}) {
    if (!buyerId) return { ok: false, error: "no_target" };
    await db.query(`UPDATE mkt_stockade SET released_at = NOW() WHERE released_at IS NULL AND buyer_id <> $1`, [buyerId]).catch(() => {});
    await db
        .query(
            `INSERT INTO mkt_stockade (buyer_id, reason, placed_by)
             VALUES ($1, COALESCE($2, 'Exploited a bug for personal gain'), $3)
             ON CONFLICT (buyer_id) DO UPDATE
                SET released_at = NULL, reason = EXCLUDED.reason, placed_at = NOW(), placed_by = EXCLUDED.placed_by`,
            [buyerId, reason || null, byId]
        )
        .catch(() => {});
    await db.query(
        `INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'system')
         ON CONFLICT DO NOTHING`, [buyerId, MARK_BADGE]).catch(() => {});
    // The Mark goes to the FRONT of their showcase so it's the one on their card, and `locked_badge` is what
    // setShowcaseBadges checks to stop them dropping it again.
    await db.query(
        `UPDATE mkt_buyer
            SET locked_badge = $2,
                showcase_badge_slugs = ARRAY[$2]::text[] || COALESCE(array_remove(showcase_badge_slugs, $2), '{}')
          WHERE id = $1`,
        [buyerId, MARK_BADGE]
    ).catch(() => {});
    return { ok: true };
}

/** Let them out: clears the lock, the badge and the debuff. The row stays as a record of what happened. */
export async function releaseFromStockade(buyerId) {
    if (!buyerId) return { ok: false, error: "no_target" };
    await db.query(`UPDATE mkt_stockade SET released_at = NOW() WHERE buyer_id = $1 AND released_at IS NULL`, [buyerId]).catch(() => {});
    await db.query(`DELETE FROM mkt_user_badge WHERE buyer_id = $1 AND badge_slug = $2`, [buyerId, MARK_BADGE]).catch(() => {});
    await db.query(
        `UPDATE mkt_buyer
            SET locked_badge = NULL,
                showcase_badge_slugs = NULLIF(array_remove(showcase_badge_slugs, $2), '{}')
          WHERE id = $1`,
        [buyerId, MARK_BADGE]
    ).catch(() => {});
    return { ok: true };
}
