import "server-only";

import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { awardXp } from "@/lib/marketplace/xp.js";

// The shared, persistent monthly boss. HP lives in the DB and is shared across everyone.
export const DAILY_ATTACKS = 3; // swings per member per day (staff bypass for testing)
const BOSS_NAMES = ["Ancient Wyrm", "Elder Wyrm", "Voidmaw", "Dread Wyrm", "Fenrir's Bane", "The Devourer"];

function isStaff(badgeSlugs) {
    return (badgeSlugs || []).some((s) => ["owner", "site_admin", "staff"].includes(s));
}

// The active boss (auto-spawns the next, tougher one once the previous is defeated).
export async function getActiveBoss() {
    let boss = await db.queryOne(`SELECT * FROM boss_event WHERE defeated_at IS NULL ORDER BY started_at DESC LIMIT 1`).catch(() => null);
    if (!boss) {
        const last = await db.queryOne(`SELECT max_hp, tier FROM boss_event ORDER BY started_at DESC LIMIT 1`).catch(() => null);
        const tier = (last?.tier || 0) + 1;
        const hp = last ? Math.round(last.max_hp * 1.4) : 10000;
        const name = BOSS_NAMES[Math.min(tier - 1, BOSS_NAMES.length - 1)];
        boss = await db.queryOne(
            `INSERT INTO boss_event (name, icon, tier, max_hp, hp) VALUES ($1, 'dragon', $2, $3, $3) RETURNING *`,
            [name, tier, hp]
        );
    }
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

    const contributors = await db
        .query(
            `SELECT b.id, b.alias, b.display_name, b.avatar_url, b.avatar_config, b.avatar_cosmetics,
                    SUM(h.damage)::int AS dmg, COUNT(*)::int AS hits
               FROM boss_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
              WHERE h.boss_id = $1
              GROUP BY b.id ORDER BY dmg DESC LIMIT 20`,
            [boss.id]
        )
        .catch(() => []);

    const roster = contributors.map((c) => ({
        id: c.id,
        name: c.display_name || c.alias || "Member",
        avatarUrl: avatarImageUrl(c.avatar_config, c.avatar_cosmetics) || c.avatar_url || null,
        dmg: c.dmg,
        hits: c.hits,
        tickets: Math.max(1, Math.round(c.dmg / 40)),
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
        boss: { id: boss.id, name: boss.name, tier: boss.tier, hp: boss.hp, maxHp: boss.max_hp, defeated: Boolean(boss.defeated_at) },
        roster,
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
        await db.query(`UPDATE boss_event SET defeated_at = NOW(), defeated_by = $2 WHERE id = $1 AND defeated_at IS NULL`, [boss.id, buyerId]).catch(() => {});
        defeated = true;
    }
    await syncEarnedBadges(buyerId).catch(() => {});

    const attacksLeft = staff ? 99 : Math.max(0, DAILY_ATTACKS - (used + 1));
    return { ok: true, damage, crit, hp: row.hp, maxHp: row.max_hp, defeated, attacksLeft, name: boss.name };
}
