import "server-only";

import { db } from "@/lib/db";
import { POSES, POSE_BY_ID, DEFAULT_POSE, isFreePose } from "@/lib/marketplace/poses.js";
import { spendCredit } from "@/lib/marketplace/store-credit.js";

// ── WHAT YOU OWN, WHAT YOU WEAR, AND WHAT IT COSTS ──────────────────────────────────────────────────────────
// Luke: "Poses would be manageable from the equipment screen and equipable."
//
// ⚠️ THE TWO HALVES ARE OWNED DIFFERENTLY ON PURPOSE, AND IT IS NOT AN INCONSISTENCY.
//
//   An UNLOCK pose is owned when the condition is MET. Nothing is stored and there is no claim step: the
//   count in mkt_activity_event is the fact, so the pose appears the moment you have done the thing. The
//   act board's own note is the argument — "a quest cannot be out of sync with reality: the event log IS
//   reality" — and a claim button here would only add a way to have earned something and not have it.
//
//   A SHOP pose is owned when there is a row, because a purchase is an event in the world and money is
//   involved. It goes in mkt_cosmetic_unlock under category 'pose', beside the pets, rather than in a new
//   table that would be a second set of rules about what "owned" means.
//
// ⚠️ EQUIPPING REDRAWS THE HERO, WHICH IS WHY THIS IS NOT LIKE A BORDER. equipped_pose feeds
// spriteIdentity, so changing it makes the sprite stale and the existing cron redraws it once. Nothing here
// draws anything — a pose screen that generated art on tap would bill on every indecisive click.

/** One query for every event any unlock pose counts — not the whole log. */
async function countsFor(buyerId) {
    const events = [...new Set(POSES.map((p) => p.event).filter(Boolean))];
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

async function boughtSet(buyerId) {
    const rows = await db.query(
        `SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pose'`, [buyerId],
    ).catch(() => []);
    return new Set((rows || []).map((r) => r.ref));
}

/**
 * The whole shelf, ready to render: every pose, whether it is owned, worn, and what stands between.
 *
 * ⚠️ PROGRESS IS REPORTED ON LOCKED ONES, NOT JUST "LOCKED". "Win 25 arena bouts" with 18 under it is a
 * thing to go and do; the same row without the number is a wall. Capped at the requirement so a member
 * who has done 400 does not read "400/25".
 */
export async function poseShelf(buyerId) {
    const [row, counts, bought] = await Promise.all([
        db.queryOne(`SELECT equipped_pose, store_credit_cents FROM mkt_buyer WHERE id = $1`, [buyerId])
            .catch(() => null),
        countsFor(buyerId),
        boughtSet(buyerId),
    ]);
    // ⚠️ NULL IS THE STARTER POSE, NOT A MISSING VALUE. Every member predates this column; see migration 504.
    const worn = row?.equipped_pose || DEFAULT_POSE;
    // ⚠️ READ OFF THE ROW WE ALREADY HAVE. getStoreCredit selects the same column from the same row;
    // calling it here would be a second HTTPS round trip for a number already in hand, which is the
    // family-A waste CLAUDE.md opens with — reaching for the convenient existing function instead of
    // the narrow one. Three queries for this screen, not four.
    const balanceCents = Number(row?.store_credit_cents) || 0;

    const poses = POSES.map((p) => {
        const have = p.event ? Math.min(Number(counts[p.event] || 0), p.need) : 0;
        const owned = isFreePose(p.id)
            || (p.source === "shop" ? bought.has(p.id) : Boolean(p.event) && have >= p.need);
        return {
            id: p.id, name: p.name, source: p.source,
            owned, worn: p.id === worn,
            how: p.how || null,
            cents: p.source === "shop" ? p.cents : null,
            // Only meaningful on a locked unlock pose; null everywhere else keeps the shape honest.
            have: !owned && p.event ? have : null,
            need: !owned && p.event ? p.need : null,
            affordable: p.source === "shop" && !owned ? balanceCents >= p.cents : null,
        };
    });
    return { poses, worn, balanceCents };
}

/** Is this pose this member's to wear? The one answer both equip and the shelf use. */
async function ownsPose(buyerId, id) {
    const p = POSE_BY_ID[id];
    if (!p) return false;
    if (isFreePose(id)) return true;
    if (p.source === "shop") return (await boughtSet(buyerId)).has(id);
    if (!p.event) return false;
    const counts = await countsFor(buyerId);
    return Number(counts[p.event] || 0) >= p.need;
}

/**
 * Wear a pose.
 *
 * ⚠️ OWNERSHIP IS CHECKED ON THE SERVER, NOT TRUSTED FROM THE SCREEN. The shelf already hides what you do
 * not own, which is a nicety; this is the rule. A POST naming a $8 pose must fail for somebody who has not
 * bought it, or the price is advisory.
 */
export async function equipPose(buyerId, id) {
    if (!buyerId || !POSE_BY_ID[id]) return { ok: false, error: "unknown_pose" };
    if (!(await ownsPose(buyerId, id))) return { ok: false, error: "not_owned" };
    await db.query(`UPDATE mkt_buyer SET equipped_pose = $2 WHERE id = $1`, [buyerId, id]);
    return { ok: true, worn: id };
}

/**
 * Buy a pose with store credit, and wear it.
 *
 * ⚠️ THE INSERT IS THE LOCK, AND IT HAPPENS BEFORE THE CHARGE. Two taps in the same second would otherwise
 * both see "not owned", both charge, and hand over one pose for two payments. ON CONFLICT DO NOTHING with
 * RETURNING means the second insert returns nothing and stops there, unpaid. The same shape claimHunt uses,
 * for the same reason.
 *
 * ⚠️ AND THE ROW IS REMOVED IF THE CHARGE FAILS. Inserting first is what makes the lock work; leaving the
 * row behind after a declined payment would hand out a paid cosmetic for free.
 */
export async function buyPose(buyerId, id) {
    const p = POSE_BY_ID[id];
    if (!buyerId || !p) return { ok: false, error: "unknown_pose" };
    if (p.source !== "shop") return { ok: false, error: "not_for_sale" };

    const claimed = await db.queryOne(
        `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pose', $2)
         ON CONFLICT DO NOTHING RETURNING ref`,
        [buyerId, id],
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "already_owned" };

    const spent = await spendCredit(buyerId, p.cents, "pose_buy", null, { pose: id }).catch(() => null);
    if (!spent || spent.ok === false) {
        await db.query(
            `DELETE FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pose' AND ref = $2`,
            [buyerId, id],
        ).catch(() => {});
        return { ok: false, error: spent?.error || "not_enough_credit" };
    }

    await db.query(`UPDATE mkt_buyer SET equipped_pose = $2 WHERE id = $1`, [buyerId, id]);
    return { ok: true, worn: id, spentCents: p.cents };
}
