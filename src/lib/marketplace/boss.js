import "server-only";

import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getDefaultSpriteUrl } from "@/lib/marketplace/avatar-sprite.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { weaknessInfo, elementMult, pickWeakness } from "@/lib/marketplace/boss-weakness.js";
import { setCapstoneStrikeBonus, setCombatMult } from "@/lib/marketplace/sets.js";
import { getEquippedStats, getEquippedStatsForMembers, getEquippedIds, grantItem } from "@/lib/marketplace/inventory.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { itemById } from "@/lib/marketplace/items.js";
import { recordGift } from "@/lib/marketplace/gifts.js";
import { activeDamageMult, getActiveBuff } from "@/lib/marketplace/boss-buff.js";
import { memberDamageMult, memberBonusStrikes, activeBoosts } from "@/lib/marketplace/consumables.js";
import { signatureStrikeBonus, signatureForcesCrit, signatureHit, signatureOnHit, beastbondMult, warbannerBonusForItem } from "@/lib/marketplace/signatures.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges, grantRandomDropBadge, getBadgePassives } from "@/lib/marketplace/badges.js";
import { broadcastBossDefeated, broadcastBoss } from "@/lib/marketplace/boss-broadcast.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { maybeGrantBossPet } from "@/lib/marketplace/pet-drops.js";
import { getPetCombatBonus, getPackPetBonuses, manualStatMultiplier, procMultiplier } from "@/lib/marketplace/pet-combat.js";

// The shared, persistent weekly boss. HP lives in the DB and is shared across everyone.
// Combat: ONE big manual "ability" swing per member per day (level-scaled, splashy) + passive AUTO-attacks
// where every member's avatar chips away 24/7 (a background tick applies it and records it over time).
export const DAILY_ATTACKS = 1;

const lvl = (xp) => levelForXp(xp || 0).level;

// Damage formulas (both scale with level). Equipped-gear stats buff the manual strike: might (+% damage),
// crit_chance (+% to crit, base 25%), crit_power (+% crit multiplier, base ×2.5).
function manualHit(level, stats = {}, { forceCrit = false } = {}) {
    const base = (120 + level * 15) * (1 + (stats.might || 0) / 100);
    const roll = Math.round(base * (0.85 + Math.random() * 0.3));
    const critProb = Math.min(0.9, 0.25 + (stats.crit_chance || 0) / 100);
    const critMult = 2.5 + (stats.crit_power || 0) / 100;
    const crit = forceCrit || Math.random() < critProb;
    return { damage: crit ? Math.round(roll * critMult) : roll, crit };
}
// Passive per-member hourly auto-damage. Sized so the whole pack's combined drain is fast enough that the
// live HP counter visibly ticks down second-by-second (the auto-sizer scales boss HP to match, so the
// fight still lasts the target days — the numbers are just bigger and the counter feels alive).
const autoPerHour = (level, stats = {}) => Math.round((250 + level * 50) * (1 + (stats.ferocity || 0) / 100));

// Expected damage a single member deals PER DAY: passive auto-attacks 24/7 (gear Ferocity boosts these)
// plus one daily manual strike (average roll × the 25%/×2.5 crit expectation = ×1.375). manualMult inflates
// the MANUAL portion by the member's gear + pet power so boss HP is sized off the pack's FULL power.
function memberDailyDamage(level, manualMult = 1, gearStats = {}) {
    const autoDaily = autoPerHour(level, gearStats) * 24;
    const manualExpected = (120 + level * 15) * 1.375 * manualMult;
    return autoDaily + manualExpected;
}

// Size a boss so the CURRENT pack takes ~targetDays to bring it down, from their level + GEAR + PET power.
// Assumes everyone lands their daily strike (upper bound), so real fights tend to run a touch longer.
// Used at create time so HP scales with the pack's real strength instead of a fixed guess. { hp, members }.
export async function projectBossHp({ targetDays = 7 } = {}) {
    const members = await db.query(`SELECT id, COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []);
    const [gearStats, petBonuses] = await Promise.all([
        getEquippedStatsForMembers(members.map((m) => m.id)).catch(() => new Map()),
        getPackPetBonuses().catch(() => new Map()),
    ]);
    const daily = members.reduce((sum, m) => {
        const g = gearStats.get(m.id) || {};
        const pb = petBonuses.get(m.id) || { stats: {}, proc: {} };
        const ps = pb.stats || {};
        // Combine gear + pet stats for the manual strike (pet Ferocity folds into Might, as in attackBoss).
        const combined = {
            might: (g.might || 0) + (ps.might || 0) + (ps.ferocity || 0),
            crit_chance: (g.crit_chance || 0) + (ps.crit_chance || 0),
            crit_power: (g.crit_power || 0) + (ps.crit_power || 0),
            extra_strike: (g.extra_strike || 0) + (ps.extra_strike || 0),
        };
        const manualMult = manualStatMultiplier(combined) * procMultiplier(pb.proc, 1 + combined.extra_strike);
        return sum + memberDailyDamage(lvl(m.xp), manualMult, g);
    }, 0);
    // Round to a clean-ish number and floor it so a tiny/empty pack still faces a real boss.
    const raw = Math.max(8000, Math.round(daily * Math.max(1, targetDays)));
    const hp = Math.round(raw / 500) * 500;
    return { hp, members: members.length, targetDays };
}

// Passive auto-damage accrues CONTINUOUSLY so the HP bar is never frozen between settle-ticks.
// pending = the pack's auto-DPS × seconds since the last settle (capped). The displayed/effective HP
// subtracts it; the background cron later materializes the same amount into stored hp + per-member 'auto'
// boss_hit rows (tickets). Both use the same anchor (last auto hit), so nothing jumps at the boundary.
const AUTO_SETTLE_CAP_SECONDS = 3 * 3600; // guard against a long cron outage settling a huge lump at once

async function autoAccrual(boss) {
    const [members, anchor] = await Promise.all([
        db.query(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []),
        db
            .queryOne(
                `SELECT EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(created_at), $2)))::float AS secs
                   FROM boss_hit WHERE boss_id = $1 AND kind = 'auto'`,
                [boss.id, boss.started_at]
            )
            .catch(() => null),
    ]);
    const autoDps = members.reduce((s, m) => s + autoPerHour(lvl(m.xp)), 0) / 3600; // damage per second
    const secs = Math.min(AUTO_SETTLE_CAP_SECONDS, Math.max(0, anchor?.secs || 0));
    const pending = Math.min(boss.hp, Math.round(autoDps * secs));
    return { autoDps, secs, pending, effectiveHp: Math.max(0, boss.hp - pending) };
}

// Flavor names for the manual ability so the hit feels like a move, not a click.
const ABILITIES = ["Fang Strike", "Howling Slash", "Pack Fury", "Savage Bite", "Rending Claw", "Alpha Smash", "Moonlit Cleave", "Feral Rush"];
const CRIT_ABILITIES = ["APEX PREDATOR", "BLOODMOON CRIT", "PACK LEADER'S WRATH", "DEVASTATION"];
const pickAbility = (crit) => (crit ? CRIT_ABILITIES : ABILITIES)[Math.floor(Math.random() * (crit ? CRIT_ABILITIES : ABILITIES).length)];

// The current LIVE boss (admin-released). No auto-spawn, and it does NOT expire on a timer — it stays live
// until the pack kills it (HP hits 0). ends_at is informational only. Returns null between bosses.
export async function getActiveBoss() {
    return db
        .queryOne(`SELECT * FROM boss_event WHERE status = 'live' AND defeated_at IS NULL ORDER BY started_at DESC LIMIT 1`)
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

// Distinct members who've landed a MANUAL hit on this boss today (store-local day) — drives the first_blood pet perk.
async function hittersToday(bossId) {
    const row = await db
        .queryOne(
            `SELECT COUNT(DISTINCT buyer_id)::int AS n FROM boss_hit
              WHERE boss_id = $1 AND kind = 'manual'
                AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date`,
            [bossId]
        )
        .catch(() => null);
    return row?.n || 0;
}

// Consecutive days (ending today or yesterday) this member landed a manual boss hit — powers Bloodlust gear.
async function attackStreakDays(buyerId) {
    const rows = await db
        .query(
            `SELECT DISTINCT (created_at AT TIME ZONE 'America/Chicago')::date AS d
               FROM boss_hit WHERE buyer_id = $1 AND kind = 'manual'
               ORDER BY d DESC LIMIT 90`,
            [buyerId]
        )
        .catch(() => []);
    if (!rows.length) return 0;
    const today = new Date(new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" }));
    const days = rows.map((r) => new Date(r.d).toISOString().slice(0, 10));
    let streak = 0;
    const cursor = new Date(today);
    // Allow the chain to start today OR yesterday (so a not-yet-attacked-today streak still counts).
    const has = (dt) => days.includes(dt.toISOString().slice(0, 10));
    if (!has(cursor)) cursor.setDate(cursor.getDate() - 1);
    while (has(cursor)) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    return streak;
}

// Global WARBANNER aura: sum the warbanner bonus of every currently-equipped banner across the whole pack
// (multiple bearers stack), capped so it's a rally, not a runaway. Returns a damage multiplier ≥ 1.
async function packWarbannerAura() {
    const rows = await db.query(`SELECT item_id, COUNT(*)::int AS n FROM mkt_user_equipment GROUP BY item_id`).catch(() => []);
    let aura = 0;
    for (const r of rows) aura += warbannerBonusForItem(r.item_id) * (Number(r.n) || 0);
    return 1 + Math.min(0.2, aura); // hard cap +20%
}

// Full state for the boss screen: boss HP, contributors (with sprites + tickets), the pack of fighters,
// the viewer's own stats (damage + tickets + swings left). Roster carries mini avatar + top badge so the
// UI can show who's who at a glance.
export async function getBossState(buyerId = null) {
    let boss = await getActiveBoss();
    if (!boss) {
        // No live boss — show the aftermath of the most recent kill for a week (winner + prize + stats).
        boss = await db
            .queryOne(`SELECT * FROM boss_event WHERE status = 'ended' AND defeated_at IS NOT NULL AND defeated_at > NOW() - INTERVAL '7 days' ORDER BY defeated_at DESC LIMIT 1`)
            .catch(() => null);
        if (!boss) return { boss: null };
    }

    const divisor = Math.max(1, boss.ticket_divisor || 100);

    const [contributors, defaultSprite] = await Promise.all([
        db
            .query(
                `SELECT b.id, b.alias, b.display_name, b.avatar_url, b.avatar_config, b.avatar_cosmetics, b.avatar_sprite_url, b.avatar_sprite_flip, b.xp,
                        SUM(h.damage)::int AS dmg,
                        COUNT(*) FILTER (WHERE h.kind = 'manual')::int AS hits
                   FROM boss_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
                  WHERE h.boss_id = $1
                  GROUP BY b.id ORDER BY dmg DESC`,
                [boss.id]
            )
            .catch(() => []),
        getDefaultSpriteUrl().catch(() => null),
    ]);
    // Pet battle sprites (shared per pet) so each member's active pet can fight beside them.
    // Base (Lv1) art + evolved (Lv2–5) art; each fighter shows the sprite for THEIR pet's level.
    const [petSprites, petSpriteLevels] = await Promise.all([
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
    ]);

    // Each contributor's most prestigious badge (lowest sort_order), in one query — so the roster cards
    // can show a badge next to the mini avatar to tell everyone apart.
    const contribIds = contributors.map((c) => c.id);
    let badgeByBuyer = new Map();
    if (contribIds.length) {
        const brows = await db
            .query(
                `SELECT DISTINCT ON (ub.buyer_id) ub.buyer_id, b.icon, b.label
                   FROM mkt_user_badge ub JOIN mkt_badge b ON b.slug = ub.badge_slug
                  WHERE ub.buyer_id = ANY($1)
                  ORDER BY ub.buyer_id, b.sort_order ASC, b.label ASC`,
                [contribIds]
            )
            .catch(() => []);
        badgeByBuyer = new Map(brows.map((r) => [r.buyer_id, { icon: r.icon || "🏅", label: r.label }]));
    }

    // Whole-pack fighters for the scene — EVERY registered member, attackers ranked first. Intentionally
    // uncapped: the whole pack shows up on the stage (the scene crowd-packs them). Payload scales with the
    // member count, which is fine for a store-sized roster.
    const members = await db
        .query(
            `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.featured_collectible,
                    (SELECT xp FROM mkt_pet_level pl WHERE pl.buyer_id = b.id::text AND pl.pet_id = b.featured_collectible) AS featured_pet_xp,
                    COALESCE(SUM(h.damage), 0)::int AS dmg
               FROM mkt_buyer b
               LEFT JOIN boss_hit h ON h.buyer_id = b.id AND h.boss_id = $1
              WHERE b.alias IS NOT NULL
              GROUP BY b.id ORDER BY dmg DESC, b.xp DESC NULLS LAST`,
            [boss.id]
        )
        .catch(() => []);
    const fighters = members
        .map((m) => {
            // Show the equipped pet at THIS member's level for that pet (highest evolved sprite ≤ level).
            const petArt = m.featured_collectible
                ? pickPetSpriteForLevel(petSprites[m.featured_collectible], petSpriteLevels[m.featured_collectible], petLevelForXp(m.featured_pet_xp || 0))
                : null;
            return {
                id: m.id,
                name: m.display_name || m.alias || "Member",
                spriteUrl: m.avatar_sprite_url || defaultSprite || null,
                // Only mirror the member's OWN sprite (the shared default sprite already faces right).
                spriteFlip: m.avatar_sprite_url ? m.avatar_sprite_flip === true : false,
                petSpriteUrl: petArt?.url || null,
                petSpriteFlip: petArt?.flip || false,
                you: buyerId && m.id === buyerId,
            };
        })
        .filter((m) => m.spriteUrl);

    const roster = contributors.map((c) => ({
        id: c.id,
        name: c.display_name || c.alias || "Member",
        alias: c.alias || null,
        level: lvl(c.xp),
        avatarUrl: avatarImageUrl(c.avatar_config, c.avatar_cosmetics) || c.avatar_url || DEFAULT_AVATAR_URL,
        spriteUrl: c.avatar_sprite_url || defaultSprite || null,
        spriteFlip: c.avatar_sprite_url ? c.avatar_sprite_flip === true : false,
        badge: badgeByBuyer.get(c.id) || null,
        dmg: c.dmg,
        hits: c.hits,
        tickets: Math.floor(c.dmg / divisor),
        you: buyerId && c.id === buyerId,
    }));

    // Raffle winner (shown on the defeated screen).
    let winner = null;
    if (boss.winner_buyer_id) {
        const w = await db.queryOne(`SELECT display_name, alias, avatar_url, avatar_config, avatar_cosmetics, avatar_sprite_url FROM mkt_buyer WHERE id = $1`, [boss.winner_buyer_id]).catch(() => null);
        if (w) {
            winner = {
                name: w.display_name || w.alias || "Member",
                avatarUrl: avatarImageUrl(w.avatar_config, w.avatar_cosmetics) || w.avatar_url || DEFAULT_AVATAR_URL,
                spriteUrl: w.avatar_sprite_url || defaultSprite || null,
                tickets: boss.winner_tickets || 0,
                you: Boolean(buyerId && buyerId === boss.winner_buyer_id),
            };
        }
    }

    let you = null;
    if (buyerId) {
        const used = await manualAttacksToday(buyerId);
        const [myStats, myIds, bonusStrikes, boosts] = await Promise.all([
            getEquippedStats(buyerId).catch(() => ({})),
            getEquippedIds(buyerId).catch(() => ({})),
            memberBonusStrikes(buyerId).catch(() => 0),
            activeBoosts(buyerId).catch(() => []),
        ]);
        const dailyCap = DAILY_ATTACKS + (myStats.extra_strike || 0) + signatureStrikeBonus(myIds) + bonusStrikes;
        const mine = roster.find((r) => r.you);
        const dmg = mine?.dmg || 0;
        const goldRow = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        // How much of this week's element the viewer is packing (drives the "your N 🔥 pieces: +X%" tip).
        const em = elementMult(myIds, boss.weakness);
        you = { attacksLeft: Math.max(0, dailyCap - used), dmg, tickets: Math.floor(dmg / divisor), gold: goldRow?.gold || 0, boosts, element: { matches: em.matches, bonusPct: em.bonusPct } };
    }

    // Continuously-accruing passive damage so the bar is always creeping, not frozen between hourly ticks.
    const accrual = boss.defeated_at ? { autoDps: 0, effectiveHp: boss.hp } : await autoAccrual(boss);

    // Active admin buff (e.g. "Double Damage" for 2 hours) — shown as a banner over the fight.
    const buff = boss.defeated_at ? null : await getActiveBuff().catch(() => null);

    return {
        boss: {
            id: boss.id,
            name: boss.name,
            tier: boss.tier,
            hp: accrual.effectiveHp,
            autoDps: accrual.autoDps,
            maxHp: boss.max_hp,
            imageUrl: boss.image_url || null,
            backgroundUrl: boss.background_url || null,
            rewards: boss.rewards_text || null,
            prize: boss.prize_name ? { name: boss.prize_name, imageUrl: boss.prize_image_url || null } : null,
            chaseItem: (boss.chase_item_id && itemById(boss.chase_item_id)) ? { id: boss.chase_item_id, name: itemById(boss.chase_item_id).name, rarity: itemById(boss.chase_item_id).rarity, icon: itemById(boss.chase_item_id).icon } : null,
            ticketDivisor: divisor,
            endsAt: boss.ends_at || null,
            defeated: Boolean(boss.defeated_at),
            buff: buff ? { label: buff.label, emoji: buff.emoji, damageMult: buff.damageMult, expiresAt: buff.expiresAt } : null,
            weakness: weaknessInfo(boss.weakness),
            winner,
        },
        roster,
        fighters,
        defaultSpriteUrl: defaultSprite || null,
        you,
    };
}

// Final recap for a specific (usually ended) boss — powers the "see final stats" page linked from the
// defeat notifications, since the live boss page has already ROTATED to the next boss by then.
export async function getBossRecap(bossId, buyerId = null) {
    const boss = await db.queryOne(`SELECT * FROM boss_event WHERE id = $1`, [bossId]).catch(() => null);
    if (!boss) return null;
    const divisor = Math.max(1, boss.ticket_divisor || 100);
    const rows = await db
        .query(
            `SELECT b.id, b.display_name, b.alias, b.avatar_url, b.avatar_config, b.avatar_cosmetics, b.xp,
                    SUM(h.damage)::int AS dmg, COUNT(*) FILTER (WHERE h.kind = 'manual')::int AS hits
               FROM boss_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
              WHERE h.boss_id = $1 GROUP BY b.id HAVING SUM(h.damage) > 0 ORDER BY dmg DESC`,
            [bossId]
        )
        .catch(() => []);
    const totalDamage = rows.reduce((s, r) => s + (r.dmg || 0), 0);
    const leaderboard = rows.slice(0, 15).map((r, i) => ({
        rank: i + 1,
        name: r.display_name || r.alias || "Member",
        alias: r.alias || null,
        avatarUrl: avatarImageUrl(r.avatar_config, r.avatar_cosmetics) || r.avatar_url || DEFAULT_AVATAR_URL,
        level: lvl(r.xp),
        dmg: r.dmg,
        tickets: Math.floor(r.dmg / divisor),
        you: Boolean(buyerId && r.id === buyerId),
    }));
    let winner = null;
    if (boss.winner_buyer_id) {
        const w = await db.queryOne(`SELECT display_name, alias, avatar_url, avatar_config, avatar_cosmetics FROM mkt_buyer WHERE id = $1`, [boss.winner_buyer_id]).catch(() => null);
        if (w) winner = { name: w.display_name || w.alias || "Member", avatarUrl: avatarImageUrl(w.avatar_config, w.avatar_cosmetics) || w.avatar_url || DEFAULT_AVATAR_URL, tickets: boss.winner_tickets || 0, you: Boolean(buyerId && buyerId === boss.winner_buyer_id) };
    }
    let mine = null;
    if (buyerId) {
        const idx = rows.findIndex((r) => r.id === buyerId);
        if (idx >= 0) { const r = rows[idx]; mine = { rank: idx + 1, dmg: r.dmg, tickets: Math.floor(r.dmg / divisor), hits: r.hits }; }
    }
    return {
        boss: { id: boss.id, name: boss.name, imageUrl: boss.image_url || null, maxHp: boss.max_hp, defeatedAt: boss.defeated_at, weakness: weaknessInfo(boss.weakness), prize: boss.prize_name ? { name: boss.prize_name, imageUrl: boss.prize_image_url || null } : null },
        totalDamage,
        fighters: rows.length,
        leaderboard,
        winner,
        mine,
    };
}

// Per-member boss-defeat celebration: the most recent defeated boss this member FOUGHT but hasn't celebrated
// yet (so everyone who participated sees the celebration once, not just the finisher). Mirrors the level-up
// pattern — a light payload for the overlay + a `boss_celebrated_id` marker cleared on ack.
export async function getPendingBossCelebration(buyerId) {
    if (!buyerId) return { pending: false };
    const row = await db
        .queryOne(
            `SELECT be.id, be.name, be.winner_buyer_id, be.winner_tickets, be.prize_name, be.ticket_divisor
               FROM boss_event be
               JOIN mkt_buyer mb ON mb.id = $1
              WHERE be.defeated_at IS NOT NULL AND be.defeated_at > NOW() - interval '3 days'
                AND (mb.boss_celebrated_id IS DISTINCT FROM be.id)
                AND EXISTS (SELECT 1 FROM boss_hit h WHERE h.boss_id = be.id AND h.buyer_id = $1)
              ORDER BY be.defeated_at DESC LIMIT 1`,
            [buyerId]
        )
        .catch(() => null);
    if (!row) return { pending: false };
    const divisor = Math.max(1, row.ticket_divisor || 100);
    const [mineRow, heroesRows, winnerRow] = await Promise.all([
        db.queryOne(`SELECT COALESCE(SUM(damage), 0)::int AS dmg FROM boss_hit WHERE boss_id = $1 AND buyer_id = $2`, [row.id, buyerId]).catch(() => null),
        db.query(
            `SELECT b.avatar_sprite_url, b.avatar_sprite_flip FROM boss_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
              WHERE h.boss_id = $1 AND b.avatar_sprite_url IS NOT NULL GROUP BY b.id ORDER BY SUM(h.damage) DESC LIMIT 8`,
            [row.id]
        ).catch(() => []),
        row.winner_buyer_id ? db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [row.winner_buyer_id]).catch(() => null) : null,
    ]);
    const dmg = mineRow?.dmg || 0;
    const aheadRow = await db.queryOne(`SELECT COUNT(*)::int AS n FROM (SELECT buyer_id FROM boss_hit WHERE boss_id = $1 GROUP BY buyer_id HAVING SUM(damage) > $2) x`, [row.id, dmg]).catch(() => null);
    return {
        pending: true,
        boss: { id: row.id, name: row.name },
        winner: row.winner_buyer_id ? { name: winnerRow?.display_name || winnerRow?.alias || "A member", you: row.winner_buyer_id === buyerId, tickets: row.winner_tickets || 0, prize: row.prize_name || null } : null,
        mine: { dmg, tickets: Math.floor(dmg / divisor), rank: (aheadRow?.n || 0) + 1 },
        heroes: heroesRows.map((h) => ({ url: h.avatar_sprite_url, flip: h.avatar_sprite_flip === true })),
        recapUrl: `/marketplace/boss/recap/${row.id}`,
    };
}
export async function ackBossCelebration(buyerId, bossId) {
    if (!buyerId || !bossId) return;
    await db.query(`UPDATE mkt_buyer SET boss_celebrated_id = $2 WHERE id = $1`, [buyerId, bossId]).catch(() => {});
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
    // Only the caller that flips defeated_at (wins the race) runs the finalize — draw + rewards + notify.
    const won = await db
        .queryOne(`UPDATE boss_event SET defeated_at = NOW(), defeated_by = $2, status = 'ended' WHERE id = $1 AND defeated_at IS NULL RETURNING id`, [bossId, defeatedBy])
        .catch(() => null);
    if (won) await finalizeBossKill(bossId).catch(() => {});
    return true;
}

// Weighted random pick from a pool. weightFn returns each entry's weight; returns null if all weights ≤ 0.
function weightedDraw(pool, weightFn) {
    const weights = pool.map(weightFn);
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r < 0) return pool[i];
    }
    return pool[pool.length - 1];
}

// Rewards + the big "boss slain" announcement. Runs exactly once per boss. Three separate axes:
//   • REAL-WORLD PRIZE  → a ticket-weighted LOTTERY across everyone who fought (tickets = damage/divisor).
//   • IN-GAME CHASE GEAR → the #1 damage dealer (skill reward).
//   • LOOT CHESTS       → EVERYONE rolls a chance; more contribution = higher chance + a slightly better tier.
async function finalizeBossKill(bossId) {
    const boss = await db.queryOne(`SELECT * FROM boss_event WHERE id = $1`, [bossId]).catch(() => null);
    if (!boss) return;
    const divisor = Math.max(1, boss.ticket_divisor || 100);

    const parts = await db
        .query(`SELECT buyer_id, SUM(damage)::int AS dmg FROM boss_hit WHERE boss_id = $1 GROUP BY buyer_id HAVING SUM(damage) > 0`, [bossId])
        .catch(() => []);
    const pool = parts.map((p) => ({ id: p.buyer_id, dmg: p.dmg, tickets: Math.floor(p.dmg / divisor) }));
    const ranked = pool.slice().sort((a, b) => b.dmg - a.dmg);
    const top1 = ranked[0] || null;
    const topDmg = top1?.dmg || 1;

    // REAL-WORLD PRIZE — ticket-weighted lottery (fallback to damage-weighted if nobody cleared a ticket).
    // Only drawn when there's an actual prize to hand out. This person becomes the claim/announcement winner.
    let raffleWinner = null;
    if (pool.length && boss.prize_name) {
        const totalTickets = pool.reduce((s, p) => s + p.tickets, 0);
        raffleWinner = weightedDraw(pool, totalTickets > 0 ? (p) => p.tickets : (p) => p.dmg);
        if (raffleWinner) {
            await db.query(`UPDATE boss_event SET winner_buyer_id = $2, winner_tickets = $3, winner_drawn_at = NOW() WHERE id = $1`, [bossId, raffleWinner.id, raffleWinner.tickets]).catch(() => {});
        }
    }

    // XP: everyone who fought earns participation; the damage champion gets a bonus (deduped per boss).
    for (const p of pool) await awardXp(p.id, "boss_participated", { dedupeKey: `boss_participated:${bossId}:${p.id}` }).catch(() => {});
    // Slaying the boss earns every participant a spin-wheel token.
    for (const p of pool) await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + 1 WHERE id = $1`, [p.id]).catch(() => {});
    if (top1) await awardXp(top1.id, "boss_won", { dedupeKey: `boss_won:${bossId}` }).catch(() => {});
    // The damage champion has a strong chance at a rare boss-only pet companion.
    if (top1) await maybeGrantBossPet(top1.id).catch(() => {});
    for (const p of pool) await syncEarnedBadges(p.id).catch(() => {});

    // IN-GAME CHASE GEAR + a drop-only badge → the #1 damage dealer (their skill reward).
    let chaseItem = null;
    if (top1 && boss.chase_item_id) {
        chaseItem = itemById(boss.chase_item_id);
        if (chaseItem) await grantItem(top1.id, chaseItem.id, "boss_reward").catch(() => {});
    }
    const top1Badge = top1 ? await grantRandomDropBadge(top1.id).catch(() => null) : null;

    // LOOT CHESTS — everyone who fought rolls a chance. Contribution (damage vs. the top dealer) drives the
    // odds (min 20% → guaranteed for #1) and gives a slight thumb on the scale toward a better tier.
    const chestByBuyer = new Map();
    for (const p of pool) {
        const ratio = Math.max(0, Math.min(1, p.dmg / topDmg));
        if (Math.random() >= 0.2 + ratio * 0.8) continue; // didn't roll a chest this time
        const q = Math.random() * 0.75 + ratio * 0.25;
        const tier = q >= 0.93 ? "mythic" : q >= 0.75 ? "gold" : q >= 0.45 ? "iron" : "wooden";
        chestByBuyer.set(p.id, tier);
        await addChests(p.id, { [tier]: 1 }).catch(() => {});
    }

    // ELITE CHEST — the #1 damage dealer gets a tiny shot at the rarest loot in the game (Ascendant/Eternal
    // gear: top-end stats + a real-world reward). Deliberately harsh: ~8% Ascendant, ~2% Eternal.
    let eliteChest = null;
    if (top1) {
        const r = Math.random();
        if (r < 0.005) eliteChest = "primordial";      // ~0.5% — the rarest chest in the game
        else if (r < 0.02) eliteChest = "eternal";     // ~1.5%
        else if (r < 0.05) eliteChest = "celestial";   // ~3%
        else if (r < 0.12) eliteChest = "ascendant";   // ~7%
        if (eliteChest) await addChests(top1.id, { [eliteChest]: 1 }).catch(() => {});
    }

    // Pack-wide celebration pop-up — personalized to what each member actually won.
    for (const p of pool) {
        const isTop = top1 && p.id === top1.id;
        const isRaffle = raffleWinner && p.id === raffleWinner.id;
        const chestTier = chestByBuyer.get(p.id) || null;
        const bits = [];
        if (isTop) bits.push(chaseItem ? `🥇 You dealt the most damage and won ${chaseItem.name}!` : `🥇 You dealt the most damage!`);
        if (isTop && eliteChest) bits.push({ ascendant: "🌟 An ASCENDANT chest dropped — incredibly rare!", eternal: "👑 An ETERNAL chest dropped!", celestial: "🌌 A CELESTIAL chest dropped — almost unheard of!", primordial: "☀️ A PRIMORDIAL chest dropped — the rarest thing in the Den!" }[eliteChest]);
        if (isRaffle && boss.prize_name) bits.push(`🎟️ You won the raffle — come claim ${boss.prize_name} in-store!`);
        if (chestTier) { const c = CHEST_TIERS[chestTier]; bits.push(`${c.emoji} ${c.label} landed in your stash — open it!`); }
        if (isTop && top1Badge) bits.push(`You earned the ${top1Badge.icon || "🏅"} ${top1Badge.label} badge.`);
        if (!bits.length) bits.push(`The whole pack took down ${boss.name}! See the final stats →`);
        const title = isRaffle && boss.prize_name ? "🎟️ You won the raffle!" : isTop ? "🥇 You topped the boss!" : chestTier ? "🎁 Boss loot!" : "☠️ Boss slain!";
        const icon = isRaffle && boss.prize_name ? "🎟️" : isTop ? "🥇" : chestTier ? "🎁" : "🏆";
        await recordGift(p.id, { kind: "boss", title, body: bits.join(" "), icon, url: `/marketplace/boss/recap/${bossId}` }).catch(() => {});
    }

    // Headline the announcement with the prize (raffle) winner if there was one, else the damage champion.
    const hero = raffleWinner || top1;
    let winnerInfo = null;
    if (hero) {
        const w = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [hero.id]).catch(() => null);
        winnerInfo = { buyerId: hero.id, label: w?.display_name || w?.alias || "A member" };
    }
    await broadcastBossDefeated(boss, winnerInfo).catch(() => {});
    // Keep the fight going: immediately bring the next boss live so the game is never stuck on a 0-HP corpse.
    await activateNextBoss(boss).catch(() => {});
}

// Cool procedural names for auto-generated bosses (when no admin-authored draft is waiting).
const PROC_BOSS_NAMES = [
    "Grumvok the Ravenous", "Aztheku, Void-Maw", "Skornfang the Unbound", "Verathis, Ashen Wyrm",
    "Molgrath the Devourer", "Nyxaal, Shadow-Tyrant", "Kaelvorn the Cinderborn", "Threxil, Bone Sovereign",
    " Vok Ruaghul the Endless", "Sythmara, Storm-Render", "Gholzuk the Ironjaw", "Emberoth, the Waking Ruin",
];

// Auto-rotate the weekly boss after a kill so play never stalls. Prefer a prepared DRAFT (admin-authored,
// with art + prize); if none is waiting, generate a procedural boss (HP scaled off the last one + a random
// element) and bring it live. Art/prize can be filled in later — the boss is fully playable without them.
async function activateNextBoss(prevBoss) {
    const live = await db.queryOne(`SELECT id FROM boss_event WHERE status = 'live' AND defeated_at IS NULL LIMIT 1`).catch(() => null);
    if (live) return; // something is already live — nothing to do
    let next = await db.queryOne(`SELECT id FROM boss_event WHERE status = 'draft' ORDER BY started_at ASC LIMIT 1`).catch(() => null);
    if (!next) {
        const prevHp = prevBoss?.max_hp || (await projectBossHp({}).then((r) => r.hp).catch(() => 500000));
        const hp = Math.max(100000, Math.round((prevHp * 1.12) / 1000) * 1000); // ~12% tougher each cycle
        const name = PROC_BOSS_NAMES[Math.floor(Math.random() * PROC_BOSS_NAMES.length)].trim();
        const div = Math.max(100, Math.round(hp / 7000));
        next = await db
            .queryOne(
                `INSERT INTO boss_event (name, icon, tier, max_hp, hp, status, description, ticket_divisor, weakness)
                 VALUES ($1, 'dragon', 1, $2, $2, 'draft', $3, $4, $5) RETURNING id`,
                [name, hp, "A new terror rises to challenge the pack.", div, pickWeakness()]
            )
            .catch(() => null);
    }
    if (!next) return;
    await db.query(`UPDATE boss_event SET status = 'ended' WHERE status = 'live' AND id <> $1`, [next.id]).catch(() => {});
    const boss = await db
        .queryOne(`UPDATE boss_event SET status = 'live', started_at = NOW(), ends_at = NOW() + interval '7 days', defeated_at = NULL WHERE id = $1 RETURNING *`, [next.id])
        .catch(() => null);
    if (boss) await broadcastBoss(boss).catch(() => {});
}

// The big daily MANUAL ability. Level-scaled, splashy (returns crit + an ability name for the animation).
export async function attackBoss(buyerId) {
    if (!buyerId) return { error: "unauthorized" };
    const boss = await getActiveBoss();
    if (!boss || boss.hp <= 0 || boss.defeated_at) return { error: "defeated" };

    const [gearStats, equippedIds, petBonus, badgeStats] = await Promise.all([
        getEquippedStats(buyerId).catch(() => ({})),
        getEquippedIds(buyerId).catch(() => ({})),
        getPetCombatBonus(buyerId).catch(() => ({ stats: {}, proc: {} })),
        getBadgePassives(buyerId).catch(() => ({})),
    ]);
    // Merge pet bonuses into the strike stats. Pet Ferocity adds to strike power (Might) rather than 24/7
    // auto-damage, so a companion's power is felt on your daily hit. A Beastbond signature amplifies the
    // pet's contribution to the strike. Earned BADGES add flat Might/Crit passives on top.
    const bb = beastbondMult(equippedIds);
    const ps = petBonus?.stats || {};
    const stats = {
        ...gearStats,
        might: (gearStats.might || 0) + ((ps.might || 0) + (ps.ferocity || 0)) * bb + (badgeStats.might || 0),
        crit_chance: (gearStats.crit_chance || 0) + (ps.crit_chance || 0) * bb + (badgeStats.crit_chance || 0),
        crit_power: (gearStats.crit_power || 0) + (ps.crit_power || 0) * bb + (badgeStats.crit_power || 0),
        extra_strike: (gearStats.extra_strike || 0) + (ps.extra_strike || 0),
    };
    // Extra daily strikes come from gear + pets (extra_strike) AND signatures AND used consumables (potions).
    const dailyCap = DAILY_ATTACKS + (stats.extra_strike || 0) + signatureStrikeBonus(equippedIds) + setCapstoneStrikeBonus(equippedIds) + (await memberBonusStrikes(buyerId).catch(() => 0));
    const used = await manualAttacksToday(buyerId);
    if (used >= dailyCap) return { error: "no_attacks_left", attacksLeft: 0 };

    const me = await db.queryOne(`SELECT xp, featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const swing = manualHit(lvl(me?.xp), stats, { forceCrit: signatureForcesCrit(equippedIds, used) });
    // Context the conditional/streak/social signatures need + the global admin buff, damage potions, and the
    // server-wide Warbanner aura.
    const [streakDays, todayHitters, warAura] = await Promise.all([
        attackStreakDays(buyerId).catch(() => 0),
        hittersToday(boss.id).catch(() => 1),
        packWarbannerAura().catch(() => 1),
    ]);
    const buffMult = (await activeDamageMult().catch(() => 1)) * (await memberDamageMult(buyerId).catch(() => 1)) * warAura;
    const divisor = boss.ticket_divisor || 100;
    const sig = signatureHit(equippedIds, {
        hitIndex: used, crit: swing.crit,
        bossHpFrac: boss.max_hp ? boss.hp / boss.max_hp : 1, bossMaxHp: boss.max_hp || 0,
        streakDays, hittersToday: todayHitters,
    });
    // Non-damage signature rewards: Scholar XP, Prospector gold, Lucky-Strike bonus tickets (as bonus damage).
    const onHit = signatureOnHit(equippedIds, { crit: swing.crit, divisor });
    // Equipped-pet procs — the "cool mechanics": first-hit burst, erupt, chain (strike twice), execute
    // (big damage on a low-HP boss), and first-blood (bonus for hitting early).
    const pp = petBonus?.proc || {};
    let petMult = 1;
    let petProc = null;
    if (used === 0 && pp.firstHitMult) { petMult *= pp.firstHitMult; petProc = "first_hit"; }
    if (pp.eruptChance && Math.random() < pp.eruptChance) { petMult *= pp.eruptMult || 1; petProc = petProc || "erupt"; }
    if (pp.chainChance && Math.random() < pp.chainChance) { petMult *= 2; petProc = petProc || "chain"; }
    if (pp.executePct && boss.max_hp && boss.hp <= boss.max_hp * 0.3) { petMult *= 1 + pp.executePct; petProc = petProc || "execute"; }
    if (pp.firstBloodPct && (await hittersToday(boss.id)) < 3) { petMult *= 1 + pp.firstBloodPct; petProc = petProc || "first_blood"; }
    // This week's boss is weak to an ELEMENT — equipped gear whose affinity matches deals bonus damage.
    const elem = elementMult(equippedIds, boss.weakness);
    const wMult = elem.mult;
    // Set capstones (full set).
    const setHit = setCombatMult(equippedIds, {
        crit: swing.crit, hitIndex: used, bossHpFrac: boss.max_hp ? boss.hp / boss.max_hp : 1,
        bossMaxHp: boss.max_hp || 0, hittersToday: todayHitters, bossWeakness: boss.weakness,
    });
    const damage = Math.round(swing.damage * buffMult * sig.mult * petMult * wMult * setHit.mult) + (onHit.bonusDamage || 0);
    const crit = swing.crit;
    const ability = pickAbility(crit);

    const row = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp, max_hp`, [boss.id, damage]);
    if (!row) return { error: "defeated" };

    const hit = await db.queryOne(`INSERT INTO boss_hit (boss_id, buyer_id, damage, kind) VALUES ($1, $2, $3, 'manual') RETURNING id`, [boss.id, buyerId, damage]);
    await awardXp(buyerId, "boss_attack", { dedupeKey: `boss_attack:${hit?.id || `${boss.id}:${Date.now()}`}` }).catch(() => {});
    // Signature rewards: Scholar XP + Prospector gold on this hit.
    if (onHit.xp > 0) await awardXp(buyerId, "signature_bonus", { points: onHit.xp, dedupeKey: `sigxp:${hit?.id}` }).catch(() => {});
    if (onHit.gold > 0) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, onHit.gold]).catch(() => {});

    const defeated = await markDefeatIfDead(boss.id, row.hp, buyerId);
    await syncEarnedBadges(buyerId).catch(() => {});

    // Report the EFFECTIVE hp (stored minus pending passive drain) so the client's bar stays consistent
    // with the polled state instead of snapping back up after a manual strike.
    const { effectiveHp, autoDps } = defeated
        ? { effectiveHp: 0, autoDps: 0 }
        : await autoAccrual({ id: boss.id, hp: row.hp, started_at: boss.started_at });
    const elemProc = elem.matches > 0 ? `${weaknessInfo(boss.weakness)?.emoji || "✨"} ${weaknessInfo(boss.weakness)?.label || ""} weakness +${elem.bonusPct}%` : null;
    return { ok: true, damage, crit, ability, proc: sig.proc || setHit.proc || petProc || elemProc, hp: effectiveHp, autoDps, maxHp: row.max_hp, defeated, attacksLeft: Math.max(0, dailyCap - (used + 1)), name: boss.name };
}

// Passive AUTO-attacks: every registered member's avatar chips away. Run by a background cron; applies the
// pack's combined hourly damage, records a per-member 'auto' hit (so tickets + the DPS chart reflect it),
// and marks defeat if the pack finishes it off. No XP for auto (manual is the engagement driver).
export async function runBossAutoTick() {
    const boss = await getActiveBoss();
    if (!boss) return { skipped: "no_active_boss" };

    // Settle however much time has passed since the last auto tick (prorated), so this is safe to run at
    // any cadence — a 10-min cron applies 1/6 of an hour, matching the continuous display accrual.
    const anchor = await db
        .queryOne(
            `SELECT EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(created_at), $2)))::float AS secs
               FROM boss_hit WHERE boss_id = $1 AND kind = 'auto'`,
            [boss.id, boss.started_at]
        )
        .catch(() => null);
    const hours = Math.min(AUTO_SETTLE_CAP_SECONDS, Math.max(0, anchor?.secs || 0)) / 3600;
    if (hours <= 0) return { applied: 0, fighters: 0 };

    const members = await db.query(`SELECT id, xp FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []);
    // Equipped Ferocity boosts each member's passive auto-damage.
    const statsByMember = await getEquippedStatsForMembers(members.map((m) => m.id)).catch(() => new Map());
    const buffMult = await activeDamageMult().catch(() => 1);
    const rows = members
        .map((m) => ({ id: m.id, damage: Math.round(autoPerHour(lvl(m.xp), statsByMember.get(m.id) || {}) * hours * buffMult) }))
        .filter((r) => r.damage > 0);
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

    // Passive auto-damage also counts toward the daily "deal damage to the boss" quest, so it's reachable
    // (a single manual hit alone never gets there).
    await Promise.allSettled(rows.map((r) => bumpQuestProgress(r.id, "boss_damage", r.damage)));

    const defeated = await markDefeatIfDead(boss.id, hpRow.hp);
    return { applied: total, fighters: rows.length, hp: hpRow.hp, defeated };
}
