import "server-only";

import { db } from "@/lib/db";
import { BACKGROUNDS } from "@/lib/marketplace/backgrounds.js";
import { getMemberMetrics, listBadges, progressForRule } from "@/lib/marketplace/badges.js";
import { BORDERS } from "@/lib/marketplace/borders.js";
import { FRAMES } from "@/lib/marketplace/frames.js";
import { AVATAR_COSMETICS } from "@/lib/marketplace/avatar-cosmetics.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { DECORATIONS } from "@/lib/marketplace/decorations.js";
import { LEVEL_PERKS, RANKS, rankForLevel } from "@/lib/marketplace/ranks.js";
import { xpForLevel } from "@/lib/marketplace/xp-curve.js";

// Cumulative XP required to REACH a level. Straight off the shared curve table — this used to re-type the
// closed form `50*(L-1)*L`, which stopped being the curve the moment it steepened above level 20.
const xpToReachLevel = (level) => xpForLevel(level);

// Human progress label per rule, e.g. "$320 / $500" or "7 / 10 events".
function progressLabel(rule, current, target) {
    switch (rule) {
        case "spend": return `$${current.toLocaleString()} / $${target.toLocaleString()}`;
        case "events": return `${current} / ${target} check-ins`;
        case "active_days": return `${current} / ${target} active days`;
        case "tenure_days": return `${current} / ${target} days as a member`;
        case "wishlist": return `${current} / ${target} cards`;
        case "friends": return `${current} / ${target} friends`;
        case "messages": return `${current} / ${target} messages sent`;
        case "badge_count": return `${current} / ${target} badges earned`;
        case "leaderboard_top": return current >= 1 ? "Reached #1" : "Climb to #1";
        case "all_milestones": return current >= 1 ? "All complete" : "Complete every way to earn";
        case "onboarding_complete": return current >= 1 ? "All onboarding done" : "Finish every onboarding step";
        case "trade_count": return `${current} / ${target} trades`;
        case "cards_traded": return `${current} / ${target} cards traded`;
        case "trade_value": return `$${current.toLocaleString()} / $${target.toLocaleString()} traded`;
        case "top_card": return `best card $${current.toLocaleString()} / $${target.toLocaleString()}`;
        case "donation_count": return `${current} / ${target} donations`;
        case "donation_value": return `$${current.toLocaleString()} / $${target.toLocaleString()} donated`;
        case "boss_hits": return `${current} / ${target} boss hits`;
        case "boss_damage": return `${current.toLocaleString()} / ${target.toLocaleString()} boss dmg`;
        case "elite_items": return `${current} / ${target} elite item${target === 1 ? "" : "s"}`;
        case "eternal_items": return `${current} / ${target} Eternal relic${target === 1 ? "" : "s"}`;
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
    const unlockableBorders = BORDERS.filter((b) => b.id !== "none" && !b.requiresBadges && !b.achievement);
    const unlockableBackgrounds = BACKGROUNDS.filter((b) => b.id !== "none" && !b.achievement);
    const unlockableFrames = FRAMES.filter((f) => f.id !== "none" && !f.requiresBadges);
    const unlockableCosmetics = AVATAR_COSMETICS.filter((c) => !c.requiresBadges);
    // Only LEVEL-gated pets belong on the level spine. Shop/chest/boss/achievement/elite pets have no `level`,
    // so including them all seeded the notableLevels set with `undefined` — which sorts to the very end and
    // produced a phantom "Level (blank)" node after 100 that dumped EVERY non-level pet into one confusing pile.
    const unlockableCollectibles = COLLECTIBLES.filter((c) => c.source === "level" && typeof c.level === "number");
    // ── AND THE DECORATIONS, WHICH THIS TRACK HAS BEEN PROMISING SILENTLY ────────────────────────────────
    // Fifteen carry source:"level". They were never listed here and never granted anywhere, so the farm's
    // decoration panel described them as level unlocks while the level track said nothing about them and
    // handed over nothing. GrayKitsune found the gap from the other end: "There are some that mention
    // unlocking under rewards, but none are listed on level up rewards."
    const unlockableDecorations = DECORATIONS.filter((d) => d.source === "level" && typeof d.level === "number");
    // A bonus Gold Chest lands every 10th level (see chests.js syncLevelChests) — surface it on the track.
    const CHEST_MILESTONE_LEVELS = Array.from({ length: 15 }, (_, i) => (i + 1) * 10); // 10, 20, … 150
    const notableLevels = Array.from(
        new Set([
            ...RANKS.map((r) => r.level),
            ...levelBadges.map((b) => b.autoThreshold),
            ...unlockableBorders.map((b) => b.level),
            ...unlockableBackgrounds.map((b) => b.level),
            ...unlockableFrames.map((f) => f.level),
            ...unlockableCosmetics.map((c) => c.level),
            ...unlockableCollectibles.map((c) => c.level),
            ...unlockableDecorations.map((d) => d.level),
            ...LEVEL_PERKS.map((p) => p.level),
            ...CHEST_MILESTONE_LEVELS,
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
                ...unlockableBackgrounds.filter((b) => b.level === L).map((b) => ({ icon: b.icon, label: `${b.label} background`, soon: false })),
                ...unlockableFrames.filter((f) => f.level === L).map((f) => ({ icon: f.icon, label: `${f.label} frame`, soon: false })),
                ...unlockableCosmetics.filter((c) => c.level === L).map((c) => ({ icon: c.icon, label: `${c.label} (avatar)`, soon: false })),
                ...unlockableCollectibles.filter((c) => c.level === L).map((c) => ({ icon: "🎁", label: `${c.name} (collectible)`, soon: false })),
                ...unlockableDecorations.filter((d) => d.level === L).map((d) => ({ icon: d.emoji || "🪴", label: `${d.name} (farm decoration)`, soon: false })),
                ...LEVEL_PERKS.filter((p) => p.level === L).map((p) => ({ icon: p.icon, label: p.label, soon: p.soon })),
                ...(L % 10 === 0 ? [{ icon: "💰", label: "Gold Chest", soon: false }] : []),
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
