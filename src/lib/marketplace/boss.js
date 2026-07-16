import "server-only";

import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getDefaultSpriteUrl } from "@/lib/marketplace/avatar-sprite.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";

// The shared, persistent weekly boss. HP lives in the DB and is shared across everyone.
// Combat: ONE big manual "ability" swing per member per day (level-scaled, splashy) + passive AUTO-attacks
// where every member's avatar chips away 24/7 (a background tick applies it and records it over time).
export const DAILY_ATTACKS = 1;

const lvl = (xp) => levelForXp(xp || 0).level;

// Damage formulas (both scale with level).
function manualHit(level) {
    const base = 120 + level * 15;
    const roll = Math.round(base * (0.85 + Math.random() * 0.3));
    const crit = Math.random() < 0.25;
    return { damage: crit ? Math.round(roll * 2.5) : roll, crit };
}
const autoPerHour = (level) => 8 + level * 2;

// Flavor names for the manual ability so the hit feels like a move, not a click.
const ABILITIES = ["Fang Strike", "Howling Slash", "Pack Fury", "Savage Bite", "Rending Claw", "Alpha Smash", "Moonlit Cleave", "Feral Rush"];
const CRIT_ABILITIES = ["APEX PREDATOR", "BLOODMOON CRIT", "PACK LEADER'S WRATH", "DEVASTATION"];
const pickAbility = (crit) => (crit ? CRIT_ABILITIES : ABILITIES)[Math.floor(Math.random() * (crit ? CRIT_ABILITIES : ABILITIES).length)];

// The current LIVE boss (admin-released). No auto-spawn — bosses are manually created + released and
// expire at ends_at. Returns null between bosses.
export async function getActiveBoss() {
    return db
        .queryOne(`SELECT * FROM boss_event WHERE status = 'live' AND (ends_at IS NULL OR ends_at > NOW()) AND defeated_at IS NULL ORDER BY started_at DESC LIMIT 1`)
        .catch(() => null);
}

// Manual swings used today (auto ticks don't count against the daily limit).
async function manualAttacksToday(buyerId) {
    const row = await db
        .queryOne(
            `SELECT COUNT(*)::int AS n FROM boss_hit
              WHERE buyer_id = $1 AND kind = 'manual'
                AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date`,
            [buyerId]
        )
        .catch(() => null);
    return row?.n || 0;
}

// Full state for the boss screen: boss HP, contributors (with sprites + tickets), the pack of fighters,
// the viewer's own stats (damage + tickets + swings left), and a damage-over-time series for the chart.
export async function getBossState(buyerId = null) {
    const boss = await getActiveBoss();
    if (!boss) return { boss: null };

    const divisor = Math.max(1, boss.ticket_divisor || 100);

    const [contributors, defaultSprite, series] = await Promise.all([
        db
            .query(
                `SELECT b.id, b.alias, b.display_name, b.avatar_url, b.avatar_config, b.avatar_cosmetics, b.avatar_sprite_url, b.xp,
                        SUM(h.damage)::int AS dmg,
                        COUNT(*) FILTER (WHERE h.kind = 'manual')::int AS hits
                   FROM boss_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
                  WHERE h.boss_id = $1
                  GROUP BY b.id ORDER BY dmg DESC LIMIT 20`,
                [boss.id]
            )
            .catch(() => []),
        getDefaultSpriteUrl().catch(() => null),
        db
            .query(
                `SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'America/Chicago'), 'MM/DD HH24:00') AS t, SUM(damage)::int AS dmg
                   FROM boss_hit WHERE boss_id = $1 AND created_at > NOW() - INTERVAL '48 hours'
                  GROUP BY date_trunc('hour', created_at AT TIME ZONE 'America/Chicago') ORDER BY 1`,
                [boss.id]
            )
            .catch(() => []),
    ]);

    // Whole-pack fighters for the scene — every registered member, attackers ranked first.
    const members = await db
        .query(
            `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, COALESCE(SUM(h.damage), 0)::int AS dmg
               FROM mkt_buyer b
               LEFT JOIN boss_hit h ON h.buyer_id = b.id AND h.boss_id = $1
              WHERE b.alias IS NOT NULL
              GROUP BY b.id ORDER BY dmg DESC, b.xp DESC NULLS LAST LIMIT 14`,
            [boss.id]
        )
        .catch(() => []);
    const fighters = members
        .map((m) => ({ id: m.id, name: m.display_name || m.alias || "Member", spriteUrl: m.avatar_sprite_url || defaultSprite || null, you: buyerId && m.id === buyerId }))
        .filter((m) => m.spriteUrl);

    const roster = contributors.map((c) => ({
        id: c.id,
        name: c.display_name || c.alias || "Member",
        level: lvl(c.xp),
        avatarUrl: avatarImageUrl(c.avatar_config, c.avatar_cosmetics) || c.avatar_url || DEFAULT_AVATAR_URL,
        spriteUrl: c.avatar_sprite_url || defaultSprite || null,
        dmg: c.dmg,
        hits: c.hits,
        tickets: Math.floor(c.dmg / divisor),
        you: buyerId && c.id === buyerId,
    }));

    let you = null;
    if (buyerId) {
        const used = await manualAttacksToday(buyerId);
        const mine = roster.find((r) => r.you);
        const dmg = mine?.dmg || 0;
        you = { attacksLeft: Math.max(0, DAILY_ATTACKS - used), dmg, tickets: Math.floor(dmg / divisor) };
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
            prize: boss.prize_name ? { name: boss.prize_name, imageUrl: boss.prize_image_url || null } : null,
            ticketDivisor: divisor,
            endsAt: boss.ends_at || null,
            defeated: Boolean(boss.defeated_at),
        },
        roster,
        fighters,
        series,
        defaultSpriteUrl: defaultSprite || null,
        you,
    };
}

// The viewer's current-boss tickets/damage for other surfaces (e.g. the profile). Null if no active boss.
export async function getMyBossSummary(buyerId) {
    if (!buyerId) return null;
    const boss = await getActiveBoss();
    if (!boss) return null;
    const divisor = Math.max(1, boss.ticket_divisor || 100);
    const row = await db.queryOne(`SELECT COALESCE(SUM(damage), 0)::int AS dmg FROM boss_hit WHERE boss_id = $1 AND buyer_id = $2`, [boss.id, buyerId]).catch(() => null);
    const dmg = row?.dmg || 0;
    return { bossName: boss.name, dmg, tickets: Math.floor(dmg / divisor), divisor };
}

async function markDefeatIfDead(bossId, hp, defeatedBy = null) {
    if (hp > 0) return false;
    await db.query(`UPDATE boss_event SET defeated_at = NOW(), defeated_by = $2, status = 'ended' WHERE id = $1 AND defeated_at IS NULL`, [bossId, defeatedBy]).catch(() => {});
    return true;
}

// The big daily MANUAL ability. Level-scaled, splashy (returns crit + an ability name for the animation).
export async function attackBoss(buyerId) {
    if (!buyerId) return { error: "unauthorized" };
    const boss = await getActiveBoss();
    if (!boss || boss.hp <= 0 || boss.defeated_at) return { error: "defeated" };

    const used = await manualAttacksToday(buyerId);
    if (used >= DAILY_ATTACKS) return { error: "no_attacks_left", attacksLeft: 0 };

    const me = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const { damage, crit } = manualHit(lvl(me?.xp));
    const ability = pickAbility(crit);

    const row = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp, max_hp`, [boss.id, damage]);
    if (!row) return { error: "defeated" };

    const hit = await db.queryOne(`INSERT INTO boss_hit (boss_id, buyer_id, damage, kind) VALUES ($1, $2, $3, 'manual') RETURNING id`, [boss.id, buyerId, damage]);
    await awardXp(buyerId, "boss_attack", { dedupeKey: `boss_attack:${hit?.id || `${boss.id}:${Date.now()}`}` }).catch(() => {});

    const defeated = await markDefeatIfDead(boss.id, row.hp, buyerId);
    await syncEarnedBadges(buyerId).catch(() => {});

    return { ok: true, damage, crit, ability, hp: row.hp, maxHp: row.max_hp, defeated, attacksLeft: Math.max(0, DAILY_ATTACKS - (used + 1)), name: boss.name };
}

// Passive AUTO-attacks: every registered member's avatar chips away. Run by a background cron; applies the
// pack's combined hourly damage, records a per-member 'auto' hit (so tickets + the DPS chart reflect it),
// and marks defeat if the pack finishes it off. No XP for auto (manual is the engagement driver).
export async function runBossAutoTick() {
    const boss = await getActiveBoss();
    if (!boss) return { skipped: "no_active_boss" };

    const members = await db.query(`SELECT id, xp FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []);
    const rows = members.map((m) => ({ id: m.id, damage: autoPerHour(lvl(m.xp)) })).filter((r) => r.damage > 0);
    if (!rows.length) return { applied: 0, fighters: 0 };

    const total = rows.reduce((s, r) => s + r.damage, 0);
    const hpRow = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp`, [boss.id, total]);
    if (!hpRow) return { skipped: "already_defeated" };

    // One batched insert attributing the tick's damage to each member.
    const params = [boss.id];
    const values = rows.map((r) => {
        params.push(r.id, r.damage);
        return `($1, $${params.length - 1}, $${params.length}, 'auto')`;
    });
    await db.query(`INSERT INTO boss_hit (boss_id, buyer_id, damage, kind) VALUES ${values.join(", ")}`, params).catch(() => {});

    const defeated = await markDefeatIfDead(boss.id, hpRow.hp);
    return { applied: total, fighters: rows.length, hp: hpRow.hp, defeated };
}
