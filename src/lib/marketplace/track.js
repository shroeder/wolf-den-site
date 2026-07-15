import "server-only";

import { db } from "@/lib/db";
import { getMemberMetrics, listBadges, progressForRule } from "@/lib/marketplace/badges.js";
import { BORDERS } from "@/lib/marketplace/borders.js";
import { LEVEL_PERKS, RANKS, rankForLevel } from "@/lib/marketplace/ranks.js";

// Cumulative XP required to REACH a level (mirrors levelForXp's curve: 50*(L-1)*L).
function xpToReachLevel(level) {
    const L = Math.max(1, Math.floor(Number(level) || 1));
    return 50 * (L - 1) * L;
}

// Human progress label per rule, e.g. "$320 / $500" or "7 / 10 events".
function progressLabel(rule, current, target) {
    switch (rule) {
        case "spend": return `$${current.toLocaleString()} / $${target.toLocaleString()}`;
        case "events": return `${current} / ${target} check-ins`;
        case "active_days": return `${current} / ${target} active days`;
        case "tenure_days": return `${current} / ${target} days as a member`;
        case "wishlist": return `${current} / ${target} cards`;
        case "friends": return `${current} / ${target} friends`;
        case "leaderboard_top": return current >= 1 ? "Reached #1" : "Climb to #1";
        case "all_milestones": return current >= 1 ? "All complete" : "Complete every way to earn";
        default: return `${current} / ${target}`;
    }
}

// The full rewards track for a member: a level SPINE (ranks + level badges + future perks at each
// notable level) plus an ACHIEVEMENTS list (every non-level unlockable badge with live progress).
// Everything reflects the real badge catalog + the member's real metrics.
export async function getRewardsTrack(buyerId) {
    const [metrics, allBadges, heldRows] = await Promise.all([
        getMemberMetrics(buyerId),
        listBadges(),
        db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    const held = new Set(heldRows.map((r) => r.badge_slug));
    const level = metrics.level;

    const autoBadges = allBadges.filter((b) => b.autoRule);
    const levelBadges = autoBadges.filter((b) => b.autoRule === "level");
    const achievementBadges = autoBadges.filter((b) => b.autoRule !== "level");

    // ---- Level spine ----
    // Role borders are badge-gated, not level-gated — they don't belong on the level spine.
    const unlockableBorders = BORDERS.filter((b) => b.id !== "none" && !b.requiresBadges);
    const notableLevels = Array.from(
        new Set([
            ...RANKS.map((r) => r.level),
            ...levelBadges.map((b) => b.autoThreshold),
            ...unlockableBorders.map((b) => b.level),
            ...LEVEL_PERKS.map((p) => p.level),
        ])
    ).sort((a, b) => a - b);

    let nextAssigned = false;
    const spine = notableLevels.map((L) => {
        const reached = level >= L;
        const isNext = !reached && !nextAssigned;
        if (isNext) nextAssigned = true;
        const rank = RANKS.find((r) => r.level === L) || null;
        return {
            level: L,
            reached,
            isNext,
            xpToGo: reached ? 0 : Math.max(0, xpToReachLevel(L) - (metrics.xp || 0)),
            rank: rank ? { title: rank.title, emoji: rank.emoji } : null,
            badges: levelBadges
                .filter((b) => b.autoThreshold === L)
                .map((b) => ({ slug: b.slug, label: b.label, icon: b.icon, color: b.color, description: b.description, held: held.has(b.slug) })),
            perks: [
                ...unlockableBorders.filter((b) => b.level === L).map((b) => ({ icon: b.icon, label: `${b.label} border`, soon: false })),
                ...LEVEL_PERKS.filter((p) => p.level === L).map((p) => ({ icon: p.icon, label: p.label, soon: p.soon })),
            ],
        };
    });

    // ---- Achievements (non-level) ----
    const achievements = achievementBadges
        .map((b) => {
            const { current, target } = progressForRule(b.autoRule, b.autoThreshold, metrics);
            const done = held.has(b.slug) || current >= target;
            const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : (done ? 100 : 0);
            return {
                slug: b.slug,
                label: b.label,
                icon: b.icon,
                color: b.color,
                description: b.description,
                done,
                pct,
                progress: progressLabel(b.autoRule, current, target),
                sortOrder: b.sortOrder,
            };
        })
        .sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);

    const totalUnlockable = autoBadges.length;
    const unlockedUnlockable = autoBadges.filter((b) => held.has(b.slug)).length;

    return {
        level,
        levelObj: metrics.levelObj,
        rank: rankForLevel(level),
        spine,
        achievements,
        unlockedUnlockable,
        totalUnlockable,
    };
}
