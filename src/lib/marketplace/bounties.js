import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { grantBountyRewards } from "@/lib/marketplace/bounty-rewards.js";
import { BOUNTY_TYPES, BOUNTY_TYPE_BY_ID as TYPE_BY_ID, MIN_BOUNTY, MAX_BOUNTY, BOUNTY_DAYS } from "@/lib/marketplace/bounty-types.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// The Bounty Board. Members post a bounty (a request for real-world help) and reserve their OWN gold on it;
// the gold is escrowed out of their balance until the bounty resolves. Others "take it on"; the creator
// then marks who actually helped and the reward is paid (split, for group bounties). Cancel or expiry
// (14 days) refunds the creator. Honor system — fulfillment happens in the real world.

export { BOUNTY_TYPES, MIN_BOUNTY, MAX_BOUNTY, BOUNTY_DAYS };
const MAX_IMAGES = 6;

const nameOf = (r) => r.display_name || r.alias || (r.email ? String(r.email).split("@")[0] : "Member");

// Even split of `total` gold across `n` winners, distributing any remainder to the first winners so the
// payouts sum EXACTLY to total (no gold created or lost).
function splitReward(total, n) {
    if (n <= 0) return [];
    const base = Math.floor(total / n);
    const rem = total - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

// Best-effort: flip any open, past-due bounties to expired and refund their creators. Guarded flip means a
// concurrent caller can't double-refund. Cheap enough to run whenever the board is read.
export async function expireBounties() {
    const due = await db.query(`SELECT id FROM mkt_bounty WHERE status = 'open' AND expires_at < NOW() LIMIT 200`).catch(() => []);
    for (const r of due) {
        const flipped = await db
            .queryOne(`UPDATE mkt_bounty SET status = 'expired', resolved_at = NOW() WHERE id = $1 AND status = 'open' RETURNING creator_id, reward_gold`, [r.id])
            .catch(() => null);
        if (flipped) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [flipped.creator_id, flipped.reward_gold]).catch(() => {});
    }
}

// Create a bounty, reserving `rewardGold` out of the creator's balance (atomic guarded deduct). On any
// failure after the deduct, the gold is refunded so it can't be lost.
export async function createBounty({ creatorId, type, title, description = null, images = [], rewardGold, mode = "single" }) {
    if (!creatorId) return { ok: false, error: "not_signed_in" };
    if (!TYPE_BY_ID[type]) return { ok: false, error: "bad_type" };
    const cleanTitle = String(title || "").trim().slice(0, 120);
    if (!cleanTitle) return { ok: false, error: "title_required" };
    const cleanDesc = description ? String(description).trim().slice(0, 2000) : null;
    const imgs = Array.isArray(images) ? images.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, MAX_IMAGES) : [];
    const amount = Math.floor(Number(rewardGold) || 0);
    if (!(amount >= MIN_BOUNTY && amount <= MAX_BOUNTY)) return { ok: false, error: "bad_amount" };
    const bountyMode = mode === "group" ? "group" : "single";

    // Reserve the gold first (atomic — null means they can't afford it).
    const deducted = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [creatorId, amount]).catch(() => null);
    if (!deducted) return { ok: false, error: "not_enough_gold" };

    let row;
    try {
        row = await db.queryOne(
            `INSERT INTO mkt_bounty (creator_id, type, title, description, images, reward_gold, mode, expires_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW() + ($8 || ' days')::interval)
             RETURNING id`,
            [creatorId, type, cleanTitle, cleanDesc, JSON.stringify(imgs), amount, bountyMode, String(BOUNTY_DAYS)]
        );
    } catch (e) {
        // Insert failed — give the reserved gold back so nothing is lost.
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [creatorId, amount]).catch(() => {});
        return { ok: false, error: "create_failed" };
    }

    await awardXp(creatorId, "bounty_post", { dedupeKey: `bounty_post:${row.id}` }).catch(() => {});
    await bumpQuestProgress(creatorId, "bounty_post", 1).catch(() => {});
    await syncEarnedBadges(creatorId).catch(() => {});
    await trackActivity(creatorId, "bounty_post", { bountyId: row.id, type, amount });
    return { ok: true, id: row.id };
}

// "Take on" a bounty. Solo bounties allow only one taker; group bounties allow many. Creator can't claim.
export async function claimBounty(bountyId, buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const b = await db.queryOne(`SELECT id, creator_id, mode, status, expires_at FROM mkt_bounty WHERE id = $1`, [bountyId]).catch(() => null);
    if (!b) return { ok: false, error: "not_found" };
    if (b.status !== "open") return { ok: false, error: "not_open" };
    if (b.creator_id === buyerId) return { ok: false, error: "own_bounty" };
    if (new Date(b.expires_at) < new Date()) return { ok: false, error: "expired" };

    if (b.mode === "single") {
        const existing = await db.queryOne(`SELECT buyer_id FROM mkt_bounty_claim WHERE bounty_id = $1 LIMIT 1`, [bountyId]).catch(() => null);
        if (existing && existing.buyer_id !== buyerId) return { ok: false, error: "already_taken" };
    }
    await db.query(`INSERT INTO mkt_bounty_claim (bounty_id, buyer_id) VALUES ($1, $2) ON CONFLICT (bounty_id, buyer_id) DO NOTHING`, [bountyId, buyerId]).catch(() => {});
    await bumpQuestProgress(buyerId, "bounty_claim", 1).catch(() => {});
    await trackActivity(buyerId, "bounty_claim", { bountyId });
    return { ok: true };
}

// Back out of a bounty you took on (only while it's still open).
export async function unclaimBounty(bountyId, buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const b = await db.queryOne(`SELECT status FROM mkt_bounty WHERE id = $1`, [bountyId]).catch(() => null);
    if (!b) return { ok: false, error: "not_found" };
    if (b.status !== "open") return { ok: false, error: "not_open" };
    await db.query(`DELETE FROM mkt_bounty_claim WHERE bounty_id = $1 AND buyer_id = $2`, [bountyId, buyerId]).catch(() => {});
    return { ok: true };
}

// Creator marks the bounty complete and picks who actually helped. Reward splits evenly among the winners.
// Guarded status flip guarantees the payout happens at most once.
export async function completeBounty(bountyId, creatorId, winnerIds = []) {
    if (!creatorId) return { ok: false, error: "not_signed_in" };
    const b = await db.queryOne(`SELECT id, creator_id, mode, status, reward_gold FROM mkt_bounty WHERE id = $1`, [bountyId]).catch(() => null);
    if (!b) return { ok: false, error: "not_found" };
    if (b.creator_id !== creatorId) return { ok: false, error: "not_owner" };
    if (b.status !== "open") return { ok: false, error: "not_open" };

    const claims = await db.query(`SELECT buyer_id FROM mkt_bounty_claim WHERE bounty_id = $1`, [bountyId]).catch(() => []);
    const claimants = new Set(claims.map((c) => c.buyer_id));
    if (!claimants.size) return { ok: false, error: "no_claimants" };

    // Resolve winners: solo = the single taker; group = the creator-selected subset of takers.
    let winners;
    if (b.mode === "single") {
        winners = [claims[0].buyer_id];
    } else {
        winners = (Array.isArray(winnerIds) ? winnerIds : []).filter((id) => claimants.has(id));
        if (!winners.length) return { ok: false, error: "no_winners" };
    }

    // Flip to completed FIRST (guarded) so a double-submit can't pay twice.
    const flipped = await db
        .queryOne(`UPDATE mkt_bounty SET status = 'completed', resolved_at = NOW() WHERE id = $1 AND status = 'open' RETURNING reward_gold`, [bountyId])
        .catch(() => null);
    if (!flipped) return { ok: false, error: "not_open" };

    const shares = splitReward(flipped.reward_gold, winners.length);
    for (let i = 0; i < winners.length; i++) {
        const wid = winners[i];
        const share = shares[i];
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [wid, share]).catch(() => {});
        await db.query(`UPDATE mkt_bounty_claim SET is_winner = TRUE, payout = $3 WHERE bounty_id = $1 AND buyer_id = $2`, [bountyId, wid, share]).catch(() => {});
        await awardXp(wid, "bounty_win", { dedupeKey: `bounty_win:${bountyId}:${wid}` }).catch(() => {});
        await syncEarnedBadges(wid).catch(() => {});
        await grantBountyRewards(wid).catch(() => {});
        await trackActivity(wid, "bounty_win", { bountyId, share });
    }
    await awardXp(creatorId, "bounty_complete", { dedupeKey: `bounty_complete:${bountyId}` }).catch(() => {});
    await bumpQuestProgress(creatorId, "bounty_complete", 1).catch(() => {});
    await trackActivity(creatorId, "bounty_complete", { bountyId, winners: winners.length });
    return { ok: true, winners: winners.length };
}

// Creator takes the bounty down before it's fulfilled → reserved gold is refunded.
export async function cancelBounty(bountyId, creatorId) {
    if (!creatorId) return { ok: false, error: "not_signed_in" };
    const flipped = await db
        .queryOne(`UPDATE mkt_bounty SET status = 'cancelled', resolved_at = NOW() WHERE id = $1 AND creator_id = $2 AND status = 'open' RETURNING reward_gold`, [bountyId, creatorId])
        .catch(() => null);
    if (!flipped) return { ok: false, error: "not_cancellable" };
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [creatorId, flipped.reward_gold]).catch(() => {});
    await trackActivity(creatorId, "bounty_cancel", { bountyId, refund: flipped.reward_gold });
    return { ok: true };
}

// Shape a raw bounty row for the UI, tagging the type metadata + expiry.
function shapeBounty(r, viewerId) {
    const type = TYPE_BY_ID[r.type] || TYPE_BY_ID.other;
    let images = r.images;
    if (typeof images === "string") { try { images = JSON.parse(images); } catch { images = []; } }
    return {
        id: r.id,
        type: r.type,
        typeLabel: type.label,
        typeIcon: type.icon,
        title: r.title,
        description: r.description || null,
        images: Array.isArray(images) ? images : [],
        reward: r.reward_gold,
        mode: r.mode,
        status: r.status,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
        creator: { id: r.creator_id, name: nameOf(r), alias: r.alias || null },
        isCreator: viewerId ? r.creator_id === viewerId : false,
        claimCount: Number(r.claim_count) || 0,
        viewerClaimed: r.viewer_claimed === true,
    };
}

// The board — open bounties (default), or filtered by type / a member's own. Lazily expires stale ones.
export async function listBounties({ status = "open", type = null, mine = false, buyerId = null, limit = 60 } = {}) {
    await expireBounties().catch(() => {});
    const conds = [];
    const params = [];
    if (status && status !== "all") { params.push(status); conds.push(`b.status = $${params.length}`); }
    if (type) { params.push(type); conds.push(`b.type = $${params.length}`); }
    if (mine && buyerId) { params.push(buyerId); conds.push(`b.creator_id = $${params.length}`); }
    const viewerParam = buyerId ? (params.push(buyerId), params.length) : null;
    params.push(Math.min(120, Math.max(1, Number(limit) || 60)));
    const rows = await db
        .query(
            `SELECT b.*, c.display_name, c.alias, c.email,
                    (SELECT COUNT(*) FROM mkt_bounty_claim k WHERE k.bounty_id = b.id)::int AS claim_count
                    ${viewerParam ? `, EXISTS(SELECT 1 FROM mkt_bounty_claim k2 WHERE k2.bounty_id = b.id AND k2.buyer_id = $${viewerParam}) AS viewer_claimed` : ""}
               FROM mkt_bounty b JOIN mkt_buyer c ON c.id = b.creator_id
              ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
              ORDER BY b.created_at DESC
              LIMIT $${params.length}`,
            params
        )
        .catch(() => []);
    return rows.map((r) => shapeBounty(r, buyerId));
}

// Full detail for one bounty, including the members who've taken it on.
export async function getBountyDetail(bountyId, viewerId = null) {
    await expireBounties().catch(() => {});
    const r = await db
        .queryOne(
            `SELECT b.*, c.display_name, c.alias, c.email,
                    (SELECT COUNT(*) FROM mkt_bounty_claim k WHERE k.bounty_id = b.id)::int AS claim_count
                    ${viewerId ? ", EXISTS(SELECT 1 FROM mkt_bounty_claim k2 WHERE k2.bounty_id = b.id AND k2.buyer_id = $2) AS viewer_claimed" : ""}
               FROM mkt_bounty b JOIN mkt_buyer c ON c.id = b.creator_id
              WHERE b.id = $1`,
            viewerId ? [bountyId, viewerId] : [bountyId]
        )
        .catch(() => null);
    if (!r) return null;
    const detail = shapeBounty(r, viewerId);
    const claims = await db
        .query(
            `SELECT k.buyer_id, k.claimed_at, k.is_winner, k.payout, m.display_name, m.alias, m.email, m.avatar_sprite_url
               FROM mkt_bounty_claim k JOIN mkt_buyer m ON m.id = k.buyer_id
              WHERE k.bounty_id = $1 ORDER BY k.claimed_at ASC`,
            [bountyId]
        )
        .catch(() => []);
    detail.participants = claims.map((c) => ({
        id: c.buyer_id,
        name: nameOf(c),
        alias: c.alias || null,
        spriteUrl: c.avatar_sprite_url || null,
        claimedAt: c.claimed_at ? new Date(c.claimed_at).toISOString() : null,
        isWinner: c.is_winner === true,
        payout: c.payout || 0,
    }));
    return detail;
}
