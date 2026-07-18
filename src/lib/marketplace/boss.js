import "server-only";

import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getDefaultSpriteUrl } from "@/lib/marketplace/avatar-sprite.js";
import { getPetSpriteMap } from "@/lib/marketplace/pet-sprite.js";
import { getEquippedStats, getEquippedStatsForMembers, getEquippedIds, grantRandomDrop } from "@/lib/marketplace/inventory.js";
import { activeDamageMult, getActiveBuff } from "@/lib/marketplace/boss-buff.js";
import { signatureStrikeBonus, signatureForcesCrit, signatureHit } from "@/lib/marketplace/signatures.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { broadcastBossDefeated } from "@/lib/marketplace/boss-broadcast.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";

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

// Expected damage a single member deals PER DAY at a given level: guaranteed passive auto-attacks 24/7
// plus one daily manual strike (average roll × the 25%/×2.5 crit expectation = ×1.375).
function memberDailyDamage(level) {
    const autoDaily = autoPerHour(level) * 24;
    const manualExpected = (120 + level * 15) * 1.375;
    return autoDaily + manualExpected;
}

// Size a boss so the CURRENT pack takes ~targetDays to bring it down, from their level-scaled damage.
// Assumes everyone lands their daily strike (upper bound), so real fights tend to run a touch longer.
// Used at create time so HP scales with member count + levels instead of a fixed guess. { hp, members }.
export async function projectBossHp({ targetDays = 7 } = {}) {
    const members = await db.query(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []);
    const daily = members.reduce((sum, m) => sum + memberDailyDamage(lvl(m.xp)), 0);
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
    ]);
    // Pet battle sprites (shared per pet) so each member's active pet can fight beside them.
    const petSprites = await getPetSpriteMap().catch(() => ({}));

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

    // Whole-pack fighters for the scene — every registered member, attackers ranked first.
    const members = await db
        .query(
            `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.featured_collectible, COALESCE(SUM(h.damage), 0)::int AS dmg
               FROM mkt_buyer b
               LEFT JOIN boss_hit h ON h.buyer_id = b.id AND h.boss_id = $1
              WHERE b.alias IS NOT NULL
              GROUP BY b.id ORDER BY dmg DESC, b.xp DESC NULLS LAST LIMIT 14`,
            [boss.id]
        )
        .catch(() => []);
    const fighters = members
        .map((m) => ({
            id: m.id,
            name: m.display_name || m.alias || "Member",
            spriteUrl: m.avatar_sprite_url || defaultSprite || null,
            petSpriteUrl: (m.featured_collectible && petSprites[m.featured_collectible]) || null,
            you: buyerId && m.id === buyerId,
        }))
        .filter((m) => m.spriteUrl);

    const roster = contributors.map((c) => ({
        id: c.id,
        name: c.display_name || c.alias || "Member",
        alias: c.alias || null,
        level: lvl(c.xp),
        avatarUrl: avatarImageUrl(c.avatar_config, c.avatar_cosmetics) || c.avatar_url || DEFAULT_AVATAR_URL,
        spriteUrl: c.avatar_sprite_url || defaultSprite || null,
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
        const myStats = await getEquippedStats(buyerId).catch(() => ({}));
        const dailyCap = DAILY_ATTACKS + (myStats.extra_strike || 0);
        const mine = roster.find((r) => r.you);
        const dmg = mine?.dmg || 0;
        you = { attacksLeft: Math.max(0, dailyCap - used), dmg, tickets: Math.floor(dmg / divisor) };
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
            ticketDivisor: divisor,
            endsAt: boss.ends_at || null,
            defeated: Boolean(boss.defeated_at),
            buff: buff ? { label: buff.label, emoji: buff.emoji, damageMult: buff.damageMult, expiresAt: buff.expiresAt } : null,
            winner,
        },
        roster,
        fighters,
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
    // Only the caller that flips defeated_at (wins the race) runs the finalize — draw + rewards + notify.
    const won = await db
        .queryOne(`UPDATE boss_event SET defeated_at = NOW(), defeated_by = $2, status = 'ended' WHERE id = $1 AND defeated_at IS NULL RETURNING id`, [bossId, defeatedBy])
        .catch(() => null);
    if (won) await finalizeBossKill(bossId).catch(() => {});
    return true;
}

// Ticket-weighted raffle draw + rewards + the big "boss slain" announcement. Runs exactly once per boss.
async function finalizeBossKill(bossId) {
    const boss = await db.queryOne(`SELECT * FROM boss_event WHERE id = $1`, [bossId]).catch(() => null);
    if (!boss) return;
    const divisor = Math.max(1, boss.ticket_divisor || 100);

    const parts = await db
        .query(`SELECT buyer_id, SUM(damage)::int AS dmg FROM boss_hit WHERE boss_id = $1 GROUP BY buyer_id HAVING SUM(damage) > 0`, [bossId])
        .catch(() => []);
    const pool = parts.map((p) => ({ id: p.buyer_id, dmg: p.dmg, tickets: Math.floor(p.dmg / divisor) }));

    // Weight by tickets; fall back to raw damage if nobody cleared a full ticket.
    let winner = null;
    if (pool.length) {
        const key = pool.some((p) => p.tickets > 0) ? "tickets" : "dmg";
        const total = pool.reduce((s, p) => s + p[key], 0);
        if (total > 0) {
            let roll = Math.random() * total;
            for (const p of pool) { roll -= p[key]; if (roll <= 0) { winner = p; break; } }
            if (!winner) winner = pool[pool.length - 1];
        }
    }
    if (winner) {
        await db.query(`UPDATE boss_event SET winner_buyer_id = $2, winner_tickets = $3, winner_drawn_at = NOW() WHERE id = $1`, [bossId, winner.id, winner.tickets]).catch(() => {});
    }

    // XP: everyone who fought earns participation; the winner gets a bonus (deduped per boss).
    for (const p of pool) await awardXp(p.id, "boss_participated", { dedupeKey: `boss_participated:${bossId}:${p.id}` }).catch(() => {});
    if (winner) await awardXp(winner.id, "boss_won", { dedupeKey: `boss_won:${bossId}` }).catch(() => {});
    // Milestone badges (raid veteran/warlord/legend; champion for the winner).
    for (const p of pool) await syncEarnedBadges(p.id).catch(() => {});

    // LOOT: the winner is guaranteed a gear drop; other fighters get a chance. New gear lands in their bag.
    if (winner) await grantRandomDrop(winner.id).catch(() => {});
    for (const p of pool) {
        if (winner && p.id === winner.id) continue;
        if (Math.random() < 0.35) await grantRandomDrop(p.id).catch(() => {});
    }

    let winnerInfo = null;
    if (winner) {
        const w = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [winner.id]).catch(() => null);
        winnerInfo = { buyerId: winner.id, label: w?.display_name || w?.alias || "A member" };
    }
    await broadcastBossDefeated(boss, winnerInfo).catch(() => {});
}

// The big daily MANUAL ability. Level-scaled, splashy (returns crit + an ability name for the animation).
export async function attackBoss(buyerId) {
    if (!buyerId) return { error: "unauthorized" };
    const boss = await getActiveBoss();
    if (!boss || boss.hp <= 0 || boss.defeated_at) return { error: "defeated" };

    const [stats, equippedIds] = await Promise.all([
        getEquippedStats(buyerId).catch(() => ({})),
        getEquippedIds(buyerId).catch(() => ({})),
    ]);
    // gear can grant extra daily strikes (extra_strike stat + signature items like Belt of Giants)
    const dailyCap = DAILY_ATTACKS + (stats.extra_strike || 0) + signatureStrikeBonus(equippedIds);
    const used = await manualAttacksToday(buyerId);
    if (used >= dailyCap) return { error: "no_attacks_left", attacksLeft: 0 };

    const me = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const swing = manualHit(lvl(me?.xp), stats, { forceCrit: signatureForcesCrit(equippedIds, used) });
    const buffMult = await activeDamageMult().catch(() => 1);
    const sig = signatureHit(equippedIds, { hitIndex: used, crit: swing.crit });
    const damage = Math.round(swing.damage * buffMult * sig.mult);
    const crit = swing.crit;
    const ability = pickAbility(crit);

    const row = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp, max_hp`, [boss.id, damage]);
    if (!row) return { error: "defeated" };

    const hit = await db.queryOne(`INSERT INTO boss_hit (boss_id, buyer_id, damage, kind) VALUES ($1, $2, $3, 'manual') RETURNING id`, [boss.id, buyerId, damage]);
    await awardXp(buyerId, "boss_attack", { dedupeKey: `boss_attack:${hit?.id || `${boss.id}:${Date.now()}`}` }).catch(() => {});

    const defeated = await markDefeatIfDead(boss.id, row.hp, buyerId);
    await syncEarnedBadges(buyerId).catch(() => {});

    // Report the EFFECTIVE hp (stored minus pending passive drain) so the client's bar stays consistent
    // with the polled state instead of snapping back up after a manual strike.
    const { effectiveHp, autoDps } = defeated
        ? { effectiveHp: 0, autoDps: 0 }
        : await autoAccrual({ id: boss.id, hp: row.hp, started_at: boss.started_at });
    return { ok: true, damage, crit, ability, proc: sig.proc, hp: effectiveHp, autoDps, maxHp: row.max_hp, defeated, attacksLeft: Math.max(0, dailyCap - (used + 1)), name: boss.name };
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

    const defeated = await markDefeatIfDead(boss.id, hpRow.hp);
    return { applied: total, fighters: rows.length, hp: hpRow.hp, defeated };
}
