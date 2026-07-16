import "server-only";

import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getDefaultSpriteUrl } from "@/lib/marketplace/avatar-sprite.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { awardXp } from "@/lib/marketplace/xp.js";

// The shared, persistent monthly boss. HP lives in the DB and is shared across everyone.
export const DAILY_ATTACKS = 1; // one manual swing per member per day (staff bypass for testing)

function isStaff(badgeSlugs) {
    return (badgeSlugs || []).some((s) => ["owner", "site_admin", "staff"].includes(s));
}

// The current LIVE boss (admin-released). No auto-spawn — bosses are manually created + released and
// expire at ends_at. Returns null between bosses.
export async function getActiveBoss() {
    const boss = await db
        .queryOne(`SELECT * FROM boss_event WHERE status = 'live' AND (ends_at IS NULL OR ends_at > NOW()) AND defeated_at IS NULL ORDER BY started_at DESC LIMIT 1`)
        .catch(() => null);
    return boss;
}

async function attacksUsedToday(buyerId) {
    const row = await db
        .queryOne(
            `SELECT COUNT(*)::int AS n FROM boss_hit
              WHERE buyer_id = $1 AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date`,
            [buyerId]
        )
        .catch(() => null);
    return row?.n || 0;
}

// Full state for the boss screen: boss HP, top contributors (with avatars), and the viewer's own stats.
export async function getBossState(buyerId = null) {
    const boss = await getActiveBoss();
    if (!boss) return { boss: null };

    const [contributors, defaultSprite] = await Promise.all([
        db
            .query(
                `SELECT b.id, b.alias, b.display_name, b.avatar_url, b.avatar_config, b.avatar_cosmetics, b.avatar_sprite_url,
                        SUM(h.damage)::int AS dmg, COUNT(*)::int AS hits
                   FROM boss_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
                  WHERE h.boss_id = $1
                  GROUP BY b.id ORDER BY dmg DESC LIMIT 20`,
                [boss.id]
            )
            .catch(() => []),
        getDefaultSpriteUrl().catch(() => null),
    ]);

    // The whole pack for the battle scene — every registered member fights, attackers ranked first.
    const members = await db
        .query(
            `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, COALESCE(SUM(h.damage), 0)::int AS dmg
               FROM mkt_buyer b
               LEFT JOIN boss_hit h ON h.buyer_id = b.id AND h.boss_id = $1
              WHERE b.alias IS NOT NULL
              GROUP BY b.id
              ORDER BY dmg DESC, b.xp DESC NULLS LAST
              LIMIT 14`,
            [boss.id]
        )
        .catch(() => []);
    const fighters = members
        .map((m) => ({ id: m.id, name: m.display_name || m.alias || "Member", spriteUrl: m.avatar_sprite_url || defaultSprite || null, you: buyerId && m.id === buyerId }))
        .filter((m) => m.spriteUrl);

    const divisor = Math.max(1, boss.ticket_divisor || 100);
    const roster = contributors.map((c) => ({
        id: c.id,
        name: c.display_name || c.alias || "Member",
        avatarUrl: avatarImageUrl(c.avatar_config, c.avatar_cosmetics) || c.avatar_url || DEFAULT_AVATAR_URL,
        // Full-body sprite for the side-scroller: their own if generated, else the shared default.
        spriteUrl: c.avatar_sprite_url || defaultSprite || null,
        dmg: c.dmg,
        hits: c.hits,
        tickets: Math.floor(c.dmg / divisor),
        you: buyerId && c.id === buyerId,
    }));

    let you = null;
    if (buyerId) {
        const staffRow = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []);
        const staff = isStaff(staffRow.map((r) => r.badge_slug));
        const used = await attacksUsedToday(buyerId);
        const mine = roster.find((r) => r.you);
        you = { attacksLeft: staff ? 99 : Math.max(0, DAILY_ATTACKS - used), dmg: mine?.dmg || 0, staff };
    }

    return {
        boss: {
            id: boss.id,
            name: boss.name,
            tier: boss.tier,
            hp: boss.hp,
            maxHp: boss.max_hp,
            imageUrl: boss.image_url || null,
            backgroundUrl: boss.background_url || null,
            rewards: boss.rewards_text || null,
            ticketDivisor: divisor,
            endsAt: boss.ends_at || null,
            defeated: Boolean(boss.defeated_at),
        },
        roster,
        fighters,
        defaultSpriteUrl: defaultSprite || null,
        you,
    };
}

// Land one hit on the boss. Enforces the daily limit (staff bypass), applies shared damage, awards XP,
// records the contribution, and auto-marks defeat. Returns the result + refreshed numbers.
export async function attackBoss(buyerId) {
    if (!buyerId) return { error: "unauthorized" };
    const boss = await getActiveBoss();
    if (!boss || boss.hp <= 0 || boss.defeated_at) return { error: "defeated" };

    const staffRow = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const staff = isStaff(staffRow.map((r) => r.badge_slug));
    const used = await attacksUsedToday(buyerId);
    if (!staff && used >= DAILY_ATTACKS) return { error: "no_attacks_left", attacksLeft: 0 };

    const crit = Math.random() < 0.15;
    const base = 60 + Math.floor(Math.random() * 90);
    const damage = crit ? base * 2 : base;

    // Atomic shared-HP decrement — the row guards on not-yet-defeated so concurrent killers don't overshoot.
    const row = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp, max_hp`, [boss.id, damage]);
    if (!row) return { error: "defeated" };

    const hit = await db.queryOne(`INSERT INTO boss_hit (boss_id, buyer_id, damage) VALUES ($1, $2, $3) RETURNING id`, [boss.id, buyerId, damage]);
    await awardXp(buyerId, "boss_attack", { dedupeKey: `boss_attack:${hit?.id || `${boss.id}:${Date.now()}`}` }).catch(() => {});

    let defeated = false;
    if (row.hp <= 0) {
        await db.query(`UPDATE boss_event SET defeated_at = NOW(), defeated_by = $2, status = 'ended' WHERE id = $1 AND defeated_at IS NULL`, [boss.id, buyerId]).catch(() => {});
        defeated = true;
    }
    await syncEarnedBadges(buyerId).catch(() => {});

    const attacksLeft = staff ? 99 : Math.max(0, DAILY_ATTACKS - (used + 1));
    return { ok: true, damage, crit, hp: row.hp, maxHp: row.max_hp, defeated, attacksLeft, name: boss.name };
}
