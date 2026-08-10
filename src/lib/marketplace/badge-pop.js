import "server-only";

import { db } from "@/lib/db";
import { BADGE_BONUSES, BADGE_REWARD } from "@/lib/marketplace/badges.js";

// ── THE BADGE YOU JUST EARNED ────────────────────────────────────────────────────────────────────────────────
//
// 139 badges, each with its own painted die-cut sprite, its own XP and gold, and its own permanent bonus in
// whichever system it belongs to — and none of that was ever announced. Almost every badge is earned while
// doing something else (killing a boss, landing a harvest, closing a trade), so the moment one lands is
// precisely the moment nobody is looking at the badge screen. You found out later, by counting.
//
// Same contract as the launch announcement: ONE at a time, oldest unseen first, marked seen only when it is
// dismissed. A member who earns three in one boss fight gets three little moments rather than a pile.

/** The oldest badge this member has earned and never been shown, if any. */
export async function pendingBadge(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `SELECT b.slug, b.label, b.description, b.icon, b.color, sp.url AS sprite_url,
                ub.awarded_at
           FROM mkt_user_badge ub
           JOIN mkt_badge b ON b.slug = ub.badge_slug
           LEFT JOIN mkt_badge_sprite sp ON sp.slug = b.slug
          WHERE ub.buyer_id = $1 AND ub.seen_at IS NULL
          ORDER BY ub.awarded_at ASC
          LIMIT 1`,
        [buyerId]
    ).catch(() => null);
    if (!row) return null;
    return {
        slug: row.slug,
        label: row.label,
        // What it was FOR. The description is the condition ("Win 10 raids"), which is the sentence that makes
        // a badge feel earned rather than dispensed.
        why: row.description || null,
        icon: row.icon || null,
        color: row.color || null,
        art: row.sprite_url || null,
        xp: BADGE_REWARD.xp,
        gold: BADGE_REWARD.gold,
        // Its permanent bonus, in the words of the system it feeds. A badge is not a sticker — every one of
        // them is a live number somewhere — and the card is the only place that is ever said out loud.
        bonus: bonusLines(row.slug),
    };
}

/** Dismissing is idempotent: a double tap, or the card closed on two devices, must not error or re-fire. */
export async function markBadgeSeen(buyerId, slug) {
    if (!buyerId || !slug) return { ok: false };
    await db.query(
        `UPDATE mkt_user_badge SET seen_at = NOW()
          WHERE buyer_id = $1 AND badge_slug = $2 AND seen_at IS NULL`,
        [buyerId, String(slug).slice(0, 120)]
    ).catch(() => {});
    return { ok: true };
}

// ── THE BONUS, IN ENGLISH ────────────────────────────────────────────────────────────────────────────────────
// The stat keys are the engine's vocabulary, not a player's. Everything here reads like the sentence somebody
// would say about it; anything unmapped falls back to the key with its underscores knocked out rather than
// being dropped, so a new stat shows up looking plain instead of not showing up at all.
const WORDS = {
    might: "Might", crit_chance: "Crit chance", crit_power: "Crit power",
    broadside: "Broadside", ironclad: "Ironclad", plunder: "Plunder", bounty: "Bounty",
    dredge: "Dredge", trove: "Trove", tailwind: "Tailwind",
    growSpeed: "Grow speed", seedLuck: "Seed luck", harvestLuck: "Harvest luck",
    petXp: "Pet XP", fertPower: "Fertiliser", goldHarvest: "Harvest gold",
    efficient: "Efficiency", keen_eye: "Keen eye", masters_touch: "Master's touch", steady_hand: "Steady hand",
    nerve: "Nerve", lodesense: "Lodesense", hew: "Hew", prospect: "Prospect", bellows: "Bellows", crucible: "Crucible",
};
const DOMAIN = { combat: "In a fight", sea: "At sea", farm: "On the farm", forge: "At the forge", depth: "In the Depths" };

function bonusLines(slug) {
    const b = BADGE_BONUSES[slug];
    if (!b) return [];
    const out = [];
    for (const [dom, stats] of Object.entries(b)) {
        const parts = Object.entries(stats || {})
            .map(([k, v]) => `+${v} ${WORDS[k] || k.replace(/_/g, " ")}`);
        if (parts.length) out.push({ where: DOMAIN[dom] || dom, what: parts.join(" · ") });
    }
    return out;
}
