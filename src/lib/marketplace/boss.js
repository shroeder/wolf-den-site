import "server-only";

import { db } from "@/lib/db";
import { avatarImageUrl, sanitizeCosmetics } from "@/lib/marketplace/avatar-cosmetics.js";
import { pickShowcaseBadges } from "@/lib/marketplace/badge-display.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getDefaultSpriteUrl } from "@/lib/marketplace/avatar-sprite.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { petLevelForXp, addEquippedPetXp } from "@/lib/marketplace/pet-level.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { weaknessInfo, elementMult, pickWeakness } from "@/lib/marketplace/boss-weakness.js";
import { getElementOverrides, getElementOverridesForMembers } from "@/lib/marketplace/item-element.js";
import { TICKETS_PER_FORTUNE_PER_DAY } from "@/lib/marketplace/pet-perks.js";
import { dropSeedFrom } from "@/lib/marketplace/farm-crops.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { setCapstoneStrikeBonus, setCombatMult } from "@/lib/marketplace/sets.js";
import { getEquippedStats, getEquippedStatsForMembers, getEquippedIdsForMembers, getEquippedIds, grantItem } from "@/lib/marketplace/inventory.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { itemById, ITEMS } from "@/lib/marketplace/items.js";
import { recordGift } from "@/lib/marketplace/gifts.js";
import { activeDamageMult, getActiveBuff } from "@/lib/marketplace/boss-buff.js";
import { memberDamageMult, memberBonusStrikes, activeBoosts } from "@/lib/marketplace/consumables.js";
import { signatureStrikeBonus, signatureForcesCrit, signatureHit, signatureOnHit, beastbondMult, warbannerBonusForItem, rollCheerProcs } from "@/lib/marketplace/signatures.js";
import { grantFragment } from "@/lib/marketplace/sailing.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges, getBadgePassives } from "@/lib/marketplace/badges.js";
import { grantBossTrophy } from "@/lib/marketplace/boss-trophy.js";
import { broadcastBossDefeated, broadcastBoss } from "@/lib/marketplace/boss-broadcast.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { maybeGrantBossPet } from "@/lib/marketplace/pet-drops.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { getPetCombatBonus, getPackPetBonuses, manualStatMultiplier, procMultiplier } from "@/lib/marketplace/pet-combat.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { stockadeMultiplier } from "@/lib/marketplace/stockade-penalty.js";

// The shared, persistent weekly boss. HP lives in the DB and is shared across everyone.
// Combat: ONE big manual "ability" swing per member per day (level-scaled, splashy) + passive AUTO-attacks
// where every member's avatar chips away 24/7 (a background tick applies it and records it over time).
export const DAILY_ATTACKS = 1;

// Fortune → boss-raffle tickets. Instead of a flat one-time bonus, each point of fortune banks
// TICKETS_PER_FORTUNE_PER_DAY (from pet-perks.js) lottery tickets PER DAY the boss is alive — so holding
// fortune gear/pets across the week compounds into a real edge. `fortuneTickets(fortune, boss)` is the single
// source used by both the display and the draw.
const MAX_FORTUNE_DAYS = 8; // don't let an unusually long-lived boss balloon the accrual
function bossDaysActive(boss) {
    if (!boss?.started_at) return 1;
    const ms = Date.now() - new Date(boss.started_at).getTime();
    return Math.min(MAX_FORTUNE_DAYS, Math.max(1, Math.ceil(ms / 86400000)));
}
export function fortuneTickets(fortune, boss) {
    return Math.round((Number(fortune) || 0) * TICKETS_PER_FORTUNE_PER_DAY * bossDaysActive(boss));
}

// Single source of truth for a member's daily manual-strike cap: base + gear/pet extra_strike + signature +
// set capstone + consumable strike-boosts. BOTH the enforcer (attackBoss) and the status display compute the
// cap through here so the shown "attacks left" can never drift from what's actually allowed (they used to
// diverge — the display omitted the capstone + pet bonuses, showing 0 left when a swing was still available).
function dailyStrikeCap({ extraStrike = 0, equippedIds = {}, bonusStrikes = 0 }) {
    return DAILY_ATTACKS + (extraStrike || 0) + signatureStrikeBonus(equippedIds) + setCapstoneStrikeBonus(equippedIds) + (bonusStrikes || 0);
}

// The equipped pet's "extra strike" perk is a CHANCE (scales 20%→100% with pet level). Resolve it to 0/1 for
// TODAY with a DETERMINISTIC per-day roll (same buyer + same Chicago date → same result), so the shown "attacks
// left" and the enforcer always agree, and it can't be re-rolled by refreshing. Lv5 (100%) → always +1.
function petExtraStrikeToday(buyerId, chance = 0) {
    if (!buyerId || !chance) return 0;
    if (chance >= 1) return 1;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    let h = 2166136261;
    const s = `${buyerId}:${day}:petstrike`;
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) / 4294967295) < chance ? 1 : 0;
}

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
// How long a boss fight should last, end to end. Bumped 7 → 10 after Skarnyx died in 3.8 days: fights were
// coming down too fast because HP was scaled off a theoretical model (or a flat +12%/cycle) that lags the
// pack's real, ever-growing DPS. New bosses now size off the PREVIOUS boss's OBSERVED kill pace (see
// sizeNextBossHp), which self-corrects toward this target regardless of how strong the pack has become.
const BOSS_TARGET_DAYS = 10;
// A little headroom so the next boss isn't undersized by the pack leveling/growing between fights.
const BOSS_PACK_GROWTH = 1.1;
// How many "typical members" the single strongest account is allowed to count as when projecting pack power.
// High enough that a genuinely well-geared veteran still counts for more than average, low enough that one
// runaway account can't size the boss on its own.
const OUTLIER_CAP = 8;

// Passive per-member hourly auto-damage. Now uses the FULL offensive kit (like the manual strike): Might +
// Ferocity both add power, and crit gives an expected-value uplift — so ALL combat gear matters for the ~90%
// of a fight that's passive, not just Ferocity. Boss HP is sized off this SAME formula (projectBossHp), so as
// the pack gears up the next boss auto-scales to hold the target kill pace.
function autoPerHour(level, stats = {}) {
    const base = 250 + level * 50;
    const power = 1 + ((stats.might || 0) + (stats.ferocity || 0)) / 100;
    const critProb = Math.min(0.6, 0.03 + (stats.crit_chance || 0) / 100); // passives crit occasionally
    const critEV = 1 + critProb * ((2.5 + (stats.crit_power || 0) / 100) - 1);
    return Math.round(base * power * critEV);
}

// The offensive kit that drives passive auto-damage: a member's gear stats + their equipped pet's stats.
function autoStats(gear = {}, petStats = {}) {
    return {
        might: (gear.might || 0) + (petStats.might || 0),
        ferocity: (gear.ferocity || 0) + (petStats.ferocity || 0),
        crit_chance: (gear.crit_chance || 0) + (petStats.crit_chance || 0),
        crit_power: (gear.crit_power || 0) + (petStats.crit_power || 0),
    };
}

// Expected damage a single member deals PER DAY: passive auto-attacks 24/7 (all gear stats boost these now)
// plus one daily manual strike (average roll × the 25%/×2.5 crit expectation = ×1.375). manualMult inflates
// the MANUAL portion by the member's gear + pet power so boss HP is sized off the pack's FULL power.
function memberDailyDamage(level, manualMult = 1, gearStats = {}) {
    const autoDaily = autoPerHour(level, gearStats) * 24;
    const manualExpected = (120 + level * 15) * 1.375 * manualMult;
    return autoDaily + manualExpected;
}

// A member's passive auto-damage per HOUR from gear + equipped pet (no boss-specific element bonus) — for
// showing their DPS on the boss screen and when inspecting them. ×24 = damage/day.
export async function memberAutoPerHour(buyerId) {
    if (!buyerId) return 0;
    const [row, gear, pet] = await Promise.all([
        db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getEquippedStats(buyerId).catch(() => ({})),
        getPetCombatBonus(buyerId).catch(() => ({ stats: {} })),
    ]);
    return Math.round(autoPerHour(lvl(row?.xp || 0), autoStats(gear, pet?.stats || {})));
}

// The pack's OBSERVED real damage/day from the most recent boss — this includes EVERYTHING the theoretical
// projection misses (cheers, damage potions, Happy Hour, timed buffs, manual procs). Null if no measurable fight.
async function observedDailyDamage() {
    const o = await db
        .queryOne(
            `SELECT EXTRACT(EPOCH FROM (COALESCE(defeated_at, NOW()) - started_at)) / 86400.0 AS days,
                    (SELECT COALESCE(SUM(damage), 0) FROM boss_hit WHERE boss_id = be.id) AS dmg
               FROM boss_event be
              WHERE started_at IS NOT NULL
              ORDER BY started_at DESC LIMIT 1`,
        )
        .catch(() => null);
    const days = Number(o?.days) || 0;
    const dmg = Number(o?.dmg) || 0;
    return days >= 0.5 && dmg > 0 ? dmg / days : null;
}

// Size a boss so the CURRENT pack takes ~targetDays to bring it down. Sizes off the pack's OBSERVED real damage
// pace (what they actually did to the last boss, buffs and all) when available, with the theoretical gear+pet
// projection as a floor. Returns the numbers so the admin screen can show the math.
export async function projectBossHp({ targetDays = BOSS_TARGET_DAYS } = {}) {
    const members = await db.query(`SELECT id, COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []);
    const [gearStats, petBonuses] = await Promise.all([
        getEquippedStatsForMembers(members.map((m) => m.id)).catch(() => new Map()),
        getPackPetBonuses().catch(() => new Map()),
    ]);
    const perMember = members.map((m) => {
        const g = gearStats.get(m.id) || {};
        const pb = petBonuses.get(m.id) || { stats: {}, proc: {} };
        const ps = pb.stats || {};
        // Combine gear + pet stats for the manual strike (pet Ferocity folds into Might, as in attackBoss).
        const combined = {
            might: (g.might || 0) + (ps.might || 0) + (ps.ferocity || 0),
            crit_chance: (g.crit_chance || 0) + (ps.crit_chance || 0),
            crit_power: (g.crit_power || 0) + (ps.crit_power || 0),
            extra_strike: (g.extra_strike || 0) + (ps.extra_strike || 0) + (pb.proc?.extraStrikeChance || 0), // chance folds in as expected value for the projection
        };
        const manualMult = manualStatMultiplier(combined) * procMultiplier(pb.proc, 1 + combined.extra_strike);
        return memberDailyDamage(lvl(m.xp), manualMult, autoStats(g, ps));
    });
    // One account must never define the pack's power. This summed every member flat, so a single member at
    // level 437 wearing ten enhanced legendaries sized a boss at 73,155,000 against a pack that really does
    // ~1,900,000 a day — a 38-day fight inside a 10-day window, i.e. unkillable. That member got there through
    // a gold exploit, but an admin grant or a whale would do the same thing honestly.
    //
    // Cap each member's contribution at a multiple of the MEDIAN. The median is what a typical member brings and
    // no single account can move it, so a genuinely geared pack still scales the boss up while one outlier can
    // only ever count as OUTLIER_CAP members' worth.
    const sorted = perMember.slice().sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const ceiling = median > 0 ? median * OUTLIER_CAP : Infinity;
    const daily = perMember.reduce((sum, d) => sum + Math.min(d, ceiling), 0);
    // Size off the LARGER of observed real damage (buffs & all, +10% growth headroom) and the theoretical
    // projection — so a buffed-up pack can't one-shot the boss, but a first-ever boss still gets a real size.
    const observed = await observedDailyDamage();
    const perDay = Math.max(daily, (observed || 0) * BOSS_PACK_GROWTH);
    const raw = Math.max(8000, Math.round(perDay * Math.max(1, targetDays)));
    const hp = Math.round(raw / 500) * 500;
    return {
        hp, members: members.length, targetDays,
        packDaily: Math.round(daily), observedDaily: observed ? Math.round(observed) : null, perDay: Math.round(perDay),
        basis: observed && observed * BOSS_PACK_GROWTH > daily ? "observed" : "projected",
    };
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

// Daily nudge: web-push the recently-active members who still have their free manual strike waiting on the
// live boss. Opt-in only (they have a browser subscription), skips dormant accounts, and is naturally
// idempotent per store-local day (the swing counter is what we check). Called once a day by the cron job.
export async function runDailyStrikeNudge() {
    const boss = await getActiveBoss();
    if (!boss) return { attempted: 0, reason: "no_live_boss" };
    const rows = await db
        .query(
            `SELECT DISTINCT w.buyer_id
               FROM mkt_web_push w
               JOIN mkt_buyer b ON b.id = w.buyer_id
              WHERE b.last_seen_at > NOW() - INTERVAL '14 days'
                AND NOT EXISTS (
                    SELECT 1 FROM mkt_boss_swing s
                     WHERE s.buyer_id = w.buyer_id AND s.boss_id = $1
                       AND s.day = (NOW() AT TIME ZONE 'America/Chicago')::date
                )`,
            [boss.id]
        )
        .catch(() => []);
    for (const r of rows) {
        await sendWebPush(r.buyer_id, {
            kind: "boss",
            title: "⚔️ Your daily strike is ready",
            body: `${boss.name} is still standing — land your free hit for XP & raffle tickets.`,
            url: "/marketplace/boss",
            tag: "daily-strike",
        }).catch(() => {});
    }
    return { attempted: rows.length, boss: boss.name };
}

// Manual swings used today AGAINST THE CURRENT BOSS (auto ticks don't count against the daily limit).
// Scoped to bossId so a freshly-spawned boss grants a fresh daily attack even if the pack already killed one
// earlier the same day — players asked to be able to swing again when a new boss appears.
async function manualAttacksToday(buyerId, bossId) {
    // Read the authoritative swing counter (mkt_boss_swing) — the same row the atomic reservation increments,
    // so "attacks used" here always matches what enforcement will allow (no drift between the displayed
    // attacks-left and what the cap actually permits).
    const row = await db
        .queryOne(
            `SELECT n FROM mkt_boss_swing
              WHERE buyer_id = $1 AND boss_id = $2 AND day = (NOW() AT TIME ZONE 'America/Chicago')::date`,
            [buyerId, bossId]
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
                        b.equipped_border, b.equipped_frame, b.equipped_background,
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
    const [petSprites, petSpriteLevels, packPetBonuses] = await Promise.all([
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
        getPackPetBonuses().catch(() => new Map()), // whole-pack fortune, so every roster card's ticket TOTAL is the same for all viewers
    ]);

    // Each contributor's most prestigious badge (lowest sort_order), in one query — so the roster cards
    // can show a badge next to the mini avatar to tell everyone apart.
    const contribIds = contributors.map((c) => c.id);
    let badgeByBuyer = new Map();
    if (contribIds.length) {
        const brows = await db
            .query(
                `SELECT DISTINCT ON (ub.buyer_id) ub.buyer_id, b.slug, b.icon, b.label
                   FROM mkt_user_badge ub JOIN mkt_badge b ON b.slug = ub.badge_slug
                  WHERE ub.buyer_id = ANY($1)
                  ORDER BY ub.buyer_id, b.sort_order ASC, b.label ASC`,
                [contribIds]
            )
            .catch(() => []);
        badgeByBuyer = new Map(brows.map((r) => [r.buyer_id, { slug: r.slug, icon: r.icon || "🏅", label: r.label }]));
    }

    // Whole-pack fighters for the scene — EVERY registered member, attackers ranked first. Intentionally
    // uncapped: the whole pack shows up on the stage (the scene crowd-packs them). Payload scales with the
    // member count, which is fine for a store-sized roster.
    const members = await db
        .query(
            `SELECT b.id, b.display_name, b.alias, b.avatar_url, b.avatar_config, b.avatar_sprite_url, b.avatar_sprite_flip, b.featured_collectible,
                    COALESCE(b.xp, 0) AS xp, b.equipped_border, b.equipped_frame, b.equipped_background, b.avatar_cosmetics, b.showcase_badge_slugs, b.locked_badge,
                    (SELECT xp FROM mkt_pet_level pl WHERE pl.buyer_id = b.id::text AND pl.pet_id = b.featured_collectible) AS featured_pet_xp,
                    COALESCE(SUM(h.damage), 0)::int AS dmg
               FROM mkt_buyer b
               LEFT JOIN boss_hit h ON h.buyer_id = b.id AND h.boss_id = $1
              WHERE b.alias IS NOT NULL
              GROUP BY b.id ORDER BY dmg DESC, b.xp DESC NULLS LAST`,
            [boss.id]
        )
        .catch(() => []);
    // Every fighter's full badge set in one query, so each hero card can show their showcased badges +
    // the "folder tab" featured badge exactly as it renders on their profile.
    const fighterBadges = new Map();
    const memberIds = members.map((m) => m.id);
    if (memberIds.length) {
        const allBadges = await db
            .query(
                `SELECT ub.buyer_id, b.slug, b.label, b.description, b.icon, b.color
                   FROM mkt_user_badge ub JOIN mkt_badge b ON b.slug = ub.badge_slug
                  WHERE ub.buyer_id = ANY($1)
                  ORDER BY b.sort_order ASC, b.label ASC`,
                [memberIds]
            )
            .catch(() => []);
        for (const r of allBadges) {
            if (!fighterBadges.has(r.buyer_id)) fighterBadges.set(r.buyer_id, []);
            fighterBadges.get(r.buyer_id).push({ slug: r.slug, label: r.label, description: r.description, icon: r.icon, color: r.color });
        }
    }
    // The top-3 damage dealers (with any damage) get a rank badge on their card as they enter.
    const fighterDmgRank = new Map(members.filter((m) => (m.dmg || 0) > 0).slice(0, 3).map((m, i) => [m.id, i + 1]));
    const fighters = members
        .map((m) => {
            // Show the equipped pet at THIS member's level for that pet (highest evolved sprite ≤ level).
            const petLvl = m.featured_collectible ? petLevelForXp(m.featured_pet_xp || 0, collectibleById(m.featured_collectible)?.rarity) : null;
            const petArt = m.featured_collectible
                ? pickPetSpriteForLevel(petSprites[m.featured_collectible], petSpriteLevels[m.featured_collectible], petLvl || 1)
                : null;
            const cos = sanitizeCosmetics(m.avatar_cosmetics);
            const badges = fighterBadges.get(m.id) || [];
            const displayBadges = pickShowcaseBadges(badges, m.showcase_badge_slugs || null, m.locked_badge || null);
            return {
                id: m.id,
                name: m.display_name || m.alias || "Member",
                displayLabel: m.display_name || m.alias || "Member",
                alias: m.alias || null,
                level: lvl(m.xp), // hero-card info shown on stage
                petLevel: petLvl,
                dmgRank: fighterDmgRank.get(m.id) || null, // 1/2/3 for the top damage dealers, else null
                border: m.equipped_border && m.equipped_border !== "none" ? m.equipped_border : null,
                aura: cos && typeof cos === "object" && cos.aura && cos.aura !== "none" ? cos.aura : null,
                // Full hero-card cosmetics — mirrors the member's configured card (avatar+border+cosmetics,
                // frame, featured badge/tab, showcased badges, featured pet).
                avatarUrl: avatarImageUrl(m.avatar_config, m.avatar_cosmetics) || m.avatar_url || DEFAULT_AVATAR_URL,
                avatarCosmetics: cos,
                frame: m.equipped_frame || "none",
                background: m.equipped_background && m.equipped_background !== "none" ? m.equipped_background : null,
                featuredBadge: displayBadges[0] || null,
                displayBadges,
                featuredCollectibleId: m.featured_collectible || null,
                spriteUrl: m.avatar_sprite_url || defaultSprite || null,
                // Only mirror the member's OWN sprite (the shared default sprite already faces right).
                spriteFlip: m.avatar_sprite_url ? m.avatar_sprite_flip === true : false,
                petSpriteUrl: petArt?.url || null,
                petSpriteFlip: petArt?.flip || false,
                you: buyerId && m.id === buyerId,
            };
        })
        .filter((m) => m.spriteUrl);

    const rosterDmgRank = new Map(contributors.filter((c) => (c.dmg || 0) > 0).slice(0, 3).map((c, i) => [c.id, i + 1]));
    const roster = contributors.map((c) => {
        const rcos = sanitizeCosmetics(c.avatar_cosmetics);
        // Tickets = damage-earned + this member's fortune bonus (computed from the SHARED pack-fortune, so the
        // total is identical on everyone's screen AND matches the actual raffle draw). fortuneTickets is broken
        // out so the UI can show "+N from fortune".
        const dmgTickets = Math.floor(c.dmg / divisor);
        const fortTickets = fortuneTickets(packPetBonuses.get(c.id)?.stats?.fortune || 0, boss);
        return {
            id: c.id,
            dmgRank: rosterDmgRank.get(c.id) || null,
            name: c.display_name || c.alias || "Member",
            alias: c.alias || null,
            level: lvl(c.xp),
            avatarUrl: avatarImageUrl(c.avatar_config, c.avatar_cosmetics) || c.avatar_url || DEFAULT_AVATAR_URL,
            spriteUrl: c.avatar_sprite_url || defaultSprite || null,
            spriteFlip: c.avatar_sprite_url ? c.avatar_sprite_flip === true : false,
            badge: badgeByBuyer.get(c.id) || null,
            // Cosmetic dressing so the mini "Active heroes" cards carry each member's look too.
            border: c.equipped_border && c.equipped_border !== "none" ? c.equipped_border : null,
            frame: c.equipped_frame || "none",
            background: c.equipped_background && c.equipped_background !== "none" ? c.equipped_background : null,
            avatarCosmetics: rcos,
            aura: rcos && typeof rcos === "object" && rcos.aura && rcos.aura !== "none" ? rcos.aura : null,
            dmg: c.dmg,
            hits: c.hits,
            dmgTickets,
            fortuneTickets: fortTickets,
            tickets: dmgTickets + fortTickets,
            you: buyerId && c.id === buyerId,
        };
    });

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
        const used = await manualAttacksToday(buyerId, boss.id);
        const [myStats, myIds, bonusStrikes, boosts, myPet] = await Promise.all([
            getEquippedStats(buyerId).catch(() => ({})),
            getEquippedIds(buyerId).catch(() => ({})),
            memberBonusStrikes(buyerId).catch(() => 0),
            activeBoosts(buyerId).catch(() => []),
            getPetCombatBonus(buyerId).catch(() => ({ stats: {} })),
        ]);
        const dailyCap = dailyStrikeCap({ extraStrike: (myStats.extra_strike || 0) + (myPet?.stats?.extra_strike || 0) + petExtraStrikeToday(buyerId, myPet?.proc?.extraStrikeChance || 0), equippedIds: myIds, bonusStrikes });
        const mine = roster.find((r) => r.you);
        const dmg = mine?.dmg || 0;
        const goldRow = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold, COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        // How much of this week's element the viewer is packing (drives the "your N 🔥 pieces: +X%" tip).
        const myElemOver = await getElementOverrides(buyerId).catch(() => ({}));
        const em = elementMult(myIds, boss.weakness, myElemOver);
        // The viewer's real passive auto-damage/hour (gear + pet + element) — so gear changes visibly move it.
        const myLevel = mine?.level || lvl(goldRow?.xp || 0);
        const myAutoPerHour = Math.round(autoPerHour(myLevel, autoStats(myStats, myPet?.stats || {})) * em.mult);
        const cheerStatus = await getCheerStatus(buyerId).catch(() => ({ left: 0, perDay: CHEERS_PER_DAY }));
        // Your headline ticket count MIRRORS your roster card exactly (damage-tickets + fortune bonus), so the
        // number you see for yourself is the same number everyone else sees for you — no more mismatches.
        const myDmgTickets = mine?.dmgTickets ?? Math.floor(dmg / divisor);
        const myFortuneTickets = mine?.fortuneTickets ?? fortuneTickets(myPet?.stats?.fortune || 0, boss);
        you = { attacksLeft: Math.max(0, dailyCap - used), dmg, tickets: myDmgTickets + myFortuneTickets, dmgTickets: myDmgTickets, fortuneTickets: myFortuneTickets, gold: goldRow?.gold || 0, boosts, element: { matches: em.matches, bonusPct: em.bonusPct }, autoPerHour: myAutoPerHour, cheersLeft: cheerStatus.left, cheersPerDay: cheerStatus.perDay };
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
            // In-game reward items — 0+ drop to weighted-random fighters on the kill (top dealers slightly favored).
            rewardItems: (Array.isArray(boss.reward_item_ids) && boss.reward_item_ids.length ? boss.reward_item_ids : (boss.chase_item_id ? [boss.chase_item_id] : []))
                .map((id) => itemById(id)).filter(Boolean).map((it) => ({ id: it.id, name: it.name, rarity: it.rarity, icon: it.icon })),
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
    // MVP = the top damage dealer, with their battle SPRITE, for the "final blow" cinematic.
    let mvp = null;
    if (rows.length) {
        const top = rows[0];
        const s = await db.queryOne(`SELECT avatar_sprite_url, avatar_sprite_flip FROM mkt_buyer WHERE id = $1`, [top.id]).catch(() => null);
        mvp = {
            name: top.display_name || top.alias || "Member",
            dmg: top.dmg,
            level: lvl(top.xp),
            spriteUrl: s?.avatar_sprite_url || null,
            spriteFlip: s?.avatar_sprite_url ? s?.avatar_sprite_flip === true : false,
            avatarUrl: avatarImageUrl(top.avatar_config, top.avatar_cosmetics) || top.avatar_url || DEFAULT_AVATAR_URL,
            you: Boolean(buyerId && top.id === buyerId),
        };
    }
    return {
        boss: { id: boss.id, name: boss.name, imageUrl: boss.image_url || null, maxHp: boss.max_hp, defeatedAt: boss.defeated_at, weakness: weaknessInfo(boss.weakness), prize: boss.prize_name ? { name: boss.prize_name, imageUrl: boss.prize_image_url || null } : null },
        totalDamage,
        fighters: rows.length,
        leaderboard,
        winner,
        mine,
        mvp,
    };
}

// Per-member boss-defeat celebration: the most recent defeated boss this member FOUGHT but hasn't celebrated
// yet (so everyone who participated sees the celebration once, not just the finisher). Mirrors the level-up
// pattern — a light payload for the overlay + a `boss_celebrated_id` marker cleared on ack.
export async function getPendingBossCelebration(buyerId) {
    if (!buyerId) return { pending: false };
    const row = await db
        .queryOne(
            // Pick the LATEST defeat they fought in FIRST, then check whether it's been acknowledged.
            //
            // Filtering out the acked boss BEFORE the ORDER BY made the recap unclosable whenever two bosses
            // died inside the 3-day window: boss_celebrated_id holds one id, so acking Molgrath left Grumvok
            // pending, acking Grumvok left Molgrath pending, and it ping-ponged forever. Only the most recent
            // defeat can be pending now, so acknowledging it actually ends it.
            `SELECT be.id, be.name, be.winner_buyer_id, be.winner_tickets, be.prize_name, be.ticket_divisor
               FROM (
                    SELECT e.* FROM boss_event e
                     WHERE e.defeated_at IS NOT NULL AND e.defeated_at > NOW() - interval '3 days'
                       AND EXISTS (SELECT 1 FROM boss_hit h WHERE h.boss_id = e.id AND h.buyer_id = $1)
                     ORDER BY e.defeated_at DESC LIMIT 1
               ) be
               JOIN mkt_buyer mb ON mb.id = $1
              WHERE mb.boss_celebrated_id IS DISTINCT FROM be.id`,
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
    const [row, myPet] = await Promise.all([
        db.queryOne(`SELECT COALESCE(SUM(damage), 0)::int AS dmg FROM boss_hit WHERE boss_id = $1 AND buyer_id = $2`, [boss.id, buyerId]).catch(() => null),
        getPetCombatBonus(buyerId).catch(() => ({ stats: {} })),
    ]);
    const dmg = row?.dmg || 0;
    // Include fortune raffle tickets so this matches the boss screen's headline count (both feed the same raffle).
    const tickets = Math.floor(dmg / divisor) + fortuneTickets(myPet?.stats?.fortune || 0, boss);
    return { bossName: boss.name, dmg, tickets, divisor };
}

// Just the number of manual strikes a member still has today (for the nav badge). 0 if no active boss.
export async function getBossStrikesLeft(buyerId) {
    if (!buyerId) return 0;
    const boss = await getActiveBoss();
    if (!boss || boss.defeated_at) return 0;
    const used = await manualAttacksToday(buyerId, boss.id).catch(() => 0);
    const [myStats, myIds, bonusStrikes, myPet] = await Promise.all([
        getEquippedStats(buyerId).catch(() => ({})),
        getEquippedIds(buyerId).catch(() => ({})),
        memberBonusStrikes(buyerId).catch(() => 0),
        getPetCombatBonus(buyerId).catch(() => ({ stats: {} })),
    ]);
    const dailyCap = dailyStrikeCap({
        extraStrike: (myStats.extra_strike || 0) + (myPet?.stats?.extra_strike || 0) + petExtraStrikeToday(buyerId, myPet?.proc?.extraStrikeChance || 0),
        equippedIds: myIds,
        bonusStrikes,
    });
    return Math.max(0, dailyCap - used);
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
    // Fortune (raffle luck) from pets/gear adds bonus lottery tickets on top of the damage-earned ones, so
    // it genuinely improves prize odds (the effect the stat always advertised but never actually did).
    const petBonuses = await getPackPetBonuses().catch(() => new Map());
    const pool = parts.map((p) => ({
        id: p.buyer_id,
        dmg: p.dmg,
        tickets: Math.floor(p.dmg / divisor) + fortuneTickets(petBonuses.get(p.buyer_id)?.stats?.fortune || 0, boss),
    }));
    const ranked = pool.slice().sort((a, b) => b.dmg - a.dmg);
    const top1 = ranked[0] || null;
    const topDmg = top1?.dmg || 1;

    // REAL-WORLD PRIZE — ticket-weighted lottery (fallback to damage-weighted if nobody cleared a ticket).
    // Only drawn when there's an actual prize to hand out. This person becomes the claim/announcement winner.
    let raffleWinner = null;
    // The Wolf Den (owner) is EXCLUDED from winning the real-world prize — they still earn in-game rewards below,
    // just never the physical raffle. Filter only the raffle pool, not the reward/chest pool.
    // Fortune tickets are advertised on the pets screen as "Free weekly-boss raffle entries each day — real odds
    // to win". FREE is the whole promise: you hold fortune pets, you get entries. But `pool` comes from boss_hit
    // with HAVING SUM(damage) > 0, so a member who never swung was not in it at all and their free tickets
    // entered no draw. The stat paid out only for people who were already fighting — exactly the people who had
    // damage tickets anyway.
    //
    // The raffle pool alone is widened. `pool` still means "everyone who fought" and keeps driving participation
    // XP, spin tokens, badges, seeds and reward items — none of which are free, and none of which should go to
    // someone who never turned up.
    const rafflePool = pool.filter((p) => !isOwner(p.id));
    const inRaffle = new Set(rafflePool.map((p) => p.id));
    for (const [buyerId, bonus] of petBonuses) {
        if (inRaffle.has(buyerId) || isOwner(buyerId)) continue;
        const tickets = fortuneTickets(bonus?.stats?.fortune || 0, boss);
        if (tickets > 0) rafflePool.push({ id: buyerId, dmg: 0, tickets });
    }
    if (rafflePool.length && boss.prize_name) {
        const totalTickets = rafflePool.reduce((s, p) => s + p.tickets, 0);
        raffleWinner = weightedDraw(rafflePool, totalTickets > 0 ? (p) => p.tickets : (p) => p.dmg);
        if (raffleWinner) {
            await db.query(`UPDATE boss_event SET winner_buyer_id = $2, winner_tickets = $3, winner_drawn_at = NOW() WHERE id = $1`, [bossId, raffleWinner.id, raffleWinner.tickets]).catch(() => {});
        }
    }

    // XP: everyone who fought earns participation; the damage champion gets a bonus (deduped per boss).
    for (const p of pool) await awardXp(p.id, "boss_participated", { dedupeKey: `boss_participated:${bossId}:${p.id}` }).catch(() => {});
    // Slaying the boss earns every participant a spin-wheel token.
    for (const p of pool) await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + 1 WHERE id = $1`, [p.id]).catch(() => {});
    if (top1) await awardXp(top1.id, "boss_won", { dedupeKey: `boss_won:${bossId}` }).catch(() => {});
    // Boss-only pet companions are now SPREAD across the top 3 dealers, each at a much smaller chance
    // (was ~60% and guaranteed to #1) — so the reward isn't all on one person and legendaries stay rare.
    const top3 = ranked.slice(0, 3);
    const petWinners = new Set();
    for (const p of top3) {
        const drop = await maybeGrantBossPet(p.id, { chance: 0.12 }).catch(() => null);
        if (drop) petWinners.add(p.id);
    }
    for (const p of pool) await syncEarnedBadges(p.id).catch(() => {});
    for (const p of pool) await dropSeedFrom(p.id, "boss_kill").catch(() => {}); // slaying the boss showers seeds

    // IN-GAME REWARD ITEMS — the admin hand-picks 0+ items; each drops to a WEIGHTED-RANDOM participant.
    // The top 3 dealers get a modest edge (weights 3/2/2 vs 1 for everyone else), but it's far from a
    // guarantee — anyone who fought can win. Distinct winners while there are enough people.
    const rewardItemIds = Array.isArray(boss.reward_item_ids) && boss.reward_item_ids.length
        ? boss.reward_item_ids
        : (boss.chase_item_id ? [boss.chase_item_id] : []);
    const rankBoost = new Map(ranked.slice(0, 3).map((p, i) => [p.id, [3, 2, 2][i]]));
    const itemWinners = new Map(); // buyerId -> [itemName]
    let drawPool = pool.slice();
    for (const itemId of rewardItemIds) {
        const item = itemById(itemId);
        if (!item) continue;
        const candidates = drawPool.length ? drawPool : pool; // reuse everyone if there are more items than people
        const winner = weightedDraw(candidates, (p) => rankBoost.get(p.id) || 1);
        if (!winner) continue;
        await grantItem(winner.id, item.id, "boss_reward").catch(() => {});
        if (!itemWinners.has(winner.id)) itemWinners.set(winner.id, []);
        itemWinners.get(winner.id).push(item.name);
        if (drawPool.length) drawPool = drawPool.filter((p) => p.id !== winner.id);
    }
    // No badge here any more. Badges are earned by their own rule, granted for the event that matches them,
    // or given by an admin — never rolled. The #1 dealer gets a TROPHY instead: a stone statue of the exact
    // boss they topped, granted as a farm decoration, which is a record of THAT kill rather than a token.
    const top1Badge = null;
    const trophy = top1
        ? await grantBossTrophy({
            bossId, bossName: boss.name, imageUrl: boss.image_url || null,
            winnerId: top1.id, damage: top1.dmg,
        }).catch(() => null)
        : null;

    // LOOT CHESTS — a CONSOLATION for the rest of the pack. Anyone who already won something (the raffle
    // prize, a boss pet, or a reward item) is EXCLUDED, and tiers are capped at Iron so a chest never
    // out-rewards the prizes.
    const rewardWinners = new Set([raffleWinner?.id, ...petWinners, ...itemWinners.keys()].filter(Boolean));
    const chestByBuyer = new Map();
    for (const p of pool) {
        if (rewardWinners.has(p.id)) continue; // already got a good reward — no bonus chest
        const ratio = Math.max(0, Math.min(1, p.dmg / topDmg));
        if (Math.random() >= 0.2 + ratio * 0.8) continue; // didn't roll a chest this time
        const tier = Math.random() < 0.4 + ratio * 0.3 ? "iron" : "wooden"; // capped at Iron
        chestByBuyer.set(p.id, tier);
        await addChests(p.id, { [tier]: 1 }, { source: "boss_kill", meta: { boss: boss.name } }).catch(() => {});
    }

    // Pack-wide celebration pop-up — personalized to what each member actually won.
    for (const p of pool) {
        const isTop = top1 && p.id === top1.id;
        const isRaffle = raffleWinner && p.id === raffleWinner.id;
        const chestTier = chestByBuyer.get(p.id) || null;
        const wonItems = itemWinners.get(p.id) || [];
        const bits = [];
        if (wonItems.length) bits.push(`🎁 A boss reward dropped to you — ${wonItems.join(" & ")}! Equip it from your gear.`);
        if (isTop) bits.push(`🥇 You dealt the most damage!`);
        if (isRaffle && boss.prize_name) bits.push(`🎟️ You won the raffle — come claim ${boss.prize_name} in-store!`);
        if (chestTier) { const c = CHEST_TIERS[chestTier]; bits.push(`${c.emoji} ${c.label} landed in your stash — open it!`); }
        if (isTop && top1Badge) bits.push(`You earned the ${top1Badge.icon || "🏅"} ${top1Badge.label} badge.`);
        if (!bits.length) bits.push(`The whole pack took down ${boss.name}! See the final stats →`);
        const title = isRaffle && boss.prize_name ? "🎟️ You won the raffle!" : wonItems.length ? "🎁 Boss reward!" : isTop ? "🥇 You topped the boss!" : chestTier ? "🎁 Boss loot!" : "☠️ Boss slain!";
        const icon = isRaffle && boss.prize_name ? "🎟️" : wonItems.length ? "🎁" : isTop ? "🥇" : chestTier ? "🎁" : "🏆";
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
// Each name carries the CREATURE it actually is. Auto-spawned bosses used to be stored with one shared filler
// line — "A new terror rises to challenge the pack" — which is also what got handed to the art model, so every
// procedural boss was drawn from a name and nothing else. That's how the storm boss came back as a purple mass
// with no face: the model had no anatomy to draw, so it drew weather. A concrete body, head and silhouette per
// name costs nothing and is the difference between a creature and a smudge.
const PROC_BOSSES = [
    { name: "Grumvok the Ravenous", desc: "a hulking four-armed ogre-brute with tusked jaws, a distended gut and small furious eyes sunk under a heavy stone brow" },
    { name: "Aztheku, Void-Maw", desc: "a floating eldritch horror whose body is a ring of dark tentacles around one enormous fanged maw, with several glowing eyes clustered above the mouth" },
    { name: "Skornfang the Unbound", desc: "a lean snarling wolf-demon straining against snapped iron chains, long fangs bared, bright burning eyes and a shredded mane" },
    { name: "Verathis, Ashen Wyrm", desc: "a long serpentine dragon-wyrm of cracked grey ash and cooling embers, narrow horned skull, slitted molten eyes and tattered wings" },
    { name: "Molgrath the Devourer", desc: "an immense bloated toad-beast with a cavernous fanged mouth, warty armored hide and heavy-lidded yellow eyes" },
    { name: "Nyxaal, Shadow-Tyrant", desc: "a tall armored tyrant wreathed in living shadow, horned helm framing a gaunt pale face with two piercing violet eyes" },
    { name: "Kaelvorn the Cinderborn", desc: "a broad molten-rock golem veined with fire, a craggy horned head and two blazing orange eyes set deep in the stone" },
    { name: "Threxil, Bone Sovereign", desc: "a towering crowned skeletal sovereign in tattered royal robes, bare fanged skull with cold blue soul-flames burning in both eye sockets" },
    { name: "Vok Ruaghul the Endless", desc: "a many-headed hydra-serpent of coiling green scale, each long neck ending in a horned head with bright reptilian eyes" },
    { name: "Sythmara, Storm-Render", desc: "a sleek winged storm-drake of deep violet scale crackling with blue lightning, a sharp horned draconic head with two fierce glowing white eyes and bared fangs" },
    { name: "Gholzuk the Ironjaw", desc: "a squat armored beast plated in riveted iron, an oversized steel-fanged lower jaw and two narrow red eyes behind a battered faceplate" },
    { name: "Emberoth, the Waking Ruin", desc: "a colossal moss-covered stone titan rousing from ruin, cracked temple-carved body glowing with inner embers and two hollow burning eyes" },
];

// Auto-rotate the weekly boss after a kill so play never stalls. Prefer a prepared DRAFT (admin-authored,
// with art + prize); if none is waiting, generate a procedural boss (HP scaled off the last one + a random
// element) and bring it live. Art/prize can be filled in later — the boss is fully playable without them.
// Size the NEXT boss so it lasts ~BOSS_TARGET_DAYS. Primary signal is the PREVIOUS boss's OBSERVED kill
// pace (total damage ÷ days it stayed alive) — the only measure that reflects the pack's true, current DPS.
// Falls back to the theoretical projection (fresh install / no prior fight), and never lets the next boss
// come out weaker than the last one. Returns a rounded HP.
// Auto-pick N reward items for a procedurally-generated boss, capped so it never drops too-rare gear.
const REWARD_RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
// A boss is a ten-day fight for the whole pack. Its drops had only a CAP, no floor, so the roll could hand out
// three commons — a week and a half of everyone's effort paying out in grey. There is now a floor as well:
// rare (blue) at minimum, epic at most. `floorRarity` is a parameter rather than a constant so raising the bar
// later is a one-word change, and it degrades safely — if a floor ever leaves the pool empty it widens rather
// than returning nothing.
function pickRewardItems(n = 3, capRarity = "epic", floorRarity = "rare") {
    const cap = REWARD_RARITY_RANK[capRarity] ?? 2;
    let floor = REWARD_RARITY_RANK[floorRarity] ?? 1;
    // Real stat gear only, within the band, and never the charged real-world-perk items (source 'admin').
    const inBand = (f) => ITEMS.filter((i) => {
        const r = REWARD_RARITY_RANK[i.rarity] ?? 9;
        return i.stats && i.source !== "admin" && r <= cap && r >= f;
    });
    let pool = inBand(floor);
    // Widen downward only if the band can't fill the slots — better a mixed set than a short one.
    while (pool.length < n && floor > 0) { floor -= 1; pool = inBand(floor); }
    const out = [];
    const bag = pool.slice();
    while (out.length < n && bag.length) out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0].id);
    return out;
}

async function sizeNextBossHp(prevBoss) {
    let observedDaily = null;
    if (prevBoss?.id) {
        const o = await db
            .queryOne(
                `SELECT EXTRACT(EPOCH FROM (COALESCE(defeated_at, NOW()) - started_at))/86400.0 AS days,
                        (SELECT COALESCE(SUM(damage),0) FROM boss_hit WHERE boss_id = $1) AS dmg
                   FROM boss_event WHERE id = $1`,
                [prevBoss.id]
            )
            .catch(() => null);
        const days = Number(o?.days) || 0;
        const dmg = Number(o?.dmg) || 0;
        if (days >= 0.5 && dmg > 0) observedDaily = dmg / days; // need a meaningful window
    }
    // Size off the LARGER of the previous boss's observed kill pace and the current pack's projected power, so a
    // pack that has geared up (or a stat/formula change like the passive-damage buff) can't leave the next boss
    // undersized and dying in a few days.
    const projected = await projectBossHp({}).then((r) => r.hp).catch(() => 0);
    let hp = observedDaily ? observedDaily * BOSS_TARGET_DAYS * BOSS_PACK_GROWTH : projected;
    if (projected) hp = Math.max(hp, projected);
    if (!hp) hp = prevBoss?.max_hp || 500000;
    hp = Math.max(hp, (prevBoss?.max_hp || 0) * 1.05); // a new boss is never weaker than the last
    // ...and never wildly stronger, either. That floor is a RATCHET: whatever number comes out here becomes the
    // permanent minimum for every boss after it. A single bad projection therefore poisons the curve forever,
    // which is exactly what happened when one exploited account sized a boss at 3.5x the pack's real pace.
    // Bounding a single step to 2x means a bad reading costs one boss cycle instead of every future one.
    if (prevBoss?.max_hp) hp = Math.min(hp, Number(prevBoss.max_hp) * 2);
    return Math.max(100000, Math.round(hp / 1000) * 1000);
}


// Roll the next boss as a DRAFT. Split out of activateNextBoss so it can also be called EARLY — see
// prepareNextBoss below — rather than only at the moment the old one dies.
async function createDraftBoss(prevBoss) {
    const hp = await sizeNextBossHp(prevBoss); // scaled off the last boss's real kill pace → ~10-day fight
    const pick = PROC_BOSSES[Math.floor(Math.random() * PROC_BOSSES.length)];
    const name = pick.name.trim();
    const div = Math.max(100, Math.round(hp / 7000));
    const rewardIds = pickRewardItems(3, "epic"); // 3 gear drops, capped at epic (never legendary+)
    return db
        .queryOne(
            `INSERT INTO boss_event (name, icon, tier, max_hp, hp, status, description, ticket_divisor, weakness, reward_item_ids, chase_item_id)
             VALUES ($1, 'dragon', 1, $2, $2, 'draft', $3, $4, $5, $6::jsonb, $7) RETURNING id`,
            [name, hp, pick.desc, div, pickWeakness(), JSON.stringify(rewardIds), rewardIds[0] || null]
        )
        .catch(() => null);
}

// How low the live boss has to get before we start drawing its successor.
const PREPARE_NEXT_AT_PCT = 0.05;

/**
 * When the live boss is nearly dead, make sure its successor already EXISTS and already has art.
 *
 * Without this, a boss dies, the next one is rolled procedurally in the same tick and goes live immediately
 * with no portrait and no background — then waits up to an hour for the art cron. Members meet the new boss as
 * a blank. Drawing it while the current fight is still finishing means the successor arrives fully illustrated.
 *
 * Idempotent by design: the cron calls this hourly, and once a draft exists with both pieces of art every
 * subsequent call is a couple of cheap reads. Two images at the low tier is about $0.03, once per ~10-day boss.
 */
export async function prepareNextBoss() {
    const live = await db
        .queryOne(`SELECT id, name, hp, max_hp FROM boss_event WHERE status = 'live' AND defeated_at IS NULL LIMIT 1`)
        .catch(() => null);
    if (!live) return { skipped: "no_live_boss" };
    const pct = Number(live.max_hp) > 0 ? Number(live.hp) / Number(live.max_hp) : 1;
    if (pct > PREPARE_NEXT_AT_PCT) return { skipped: "boss_still_healthy", pct: Math.round(pct * 1000) / 10 };

    let next = await db
        .queryOne(`SELECT id, name, image_url, background_url FROM boss_event WHERE status = 'draft' ORDER BY started_at ASC LIMIT 1`)
        .catch(() => null);
    if (!next) {
        const created = await createDraftBoss(live);
        if (!created) return { error: "could_not_draft" };
        next = await db.queryOne(`SELECT id, name, image_url, background_url FROM boss_event WHERE id = $1`, [created.id]).catch(() => null);
    }
    if (!next) return { error: "could_not_draft" };
    if (next.image_url && next.background_url) return { ready: next.name, skipped: "already_drawn" };

    const { ensureBossArt } = await import("@/lib/marketplace/boss-admin.js");
    const did = await ensureBossArt(next.id);
    return { preparing: next.name, livePct: Math.round(pct * 1000) / 10, ...did };
}

async function activateNextBoss(prevBoss) {
    const live = await db.queryOne(`SELECT id FROM boss_event WHERE status = 'live' AND defeated_at IS NULL LIMIT 1`).catch(() => null);
    if (live) return; // something is already live — nothing to do
    let next = await db.queryOne(`SELECT id FROM boss_event WHERE status = 'draft' ORDER BY started_at ASC LIMIT 1`).catch(() => null);
    if (!next) next = await createDraftBoss(prevBoss);
    if (!next) return;
    await db.query(`UPDATE boss_event SET status = 'ended' WHERE status = 'live' AND id <> $1`, [next.id]).catch(() => {});
    const boss = await db
        .queryOne(`UPDATE boss_event SET status = 'live', started_at = NOW(), ends_at = NOW() + interval '10 days', defeated_at = NULL WHERE id = $1 RETURNING *`, [next.id])
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
        extra_strike: (gearStats.extra_strike || 0) + (ps.extra_strike || 0) + petExtraStrikeToday(buyerId, petBonus?.proc?.extraStrikeChance || 0),
    };
    // Extra daily strikes come from gear + pets (extra_strike) AND signatures AND used consumables (potions).
    const dailyCap = dailyStrikeCap({ extraStrike: stats.extra_strike, equippedIds, bonusStrikes: await memberBonusStrikes(buyerId).catch(() => 0) });
    const used = await manualAttacksToday(buyerId, boss.id);
    if (used >= dailyCap) return { error: "no_attacks_left", attacksLeft: 0 };

    const me = await db.queryOne(`SELECT xp, featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const swing = manualHit(lvl(me?.xp), stats, { forceCrit: signatureForcesCrit(equippedIds, used) });
    // Context the conditional/streak/social signatures need + the global admin buff, damage potions, and the
    // server-wide Warbanner aura.
    const [streakDays, todayHitters, warAura, cheerStat] = await Promise.all([
        attackStreakDays(buyerId).catch(() => 0),
        hittersToday(boss.id).catch(() => 1),
        packWarbannerAura().catch(() => 1),
        getCheerStatus(buyerId).catch(() => ({ used: 0 })),
    ]);
    const buffMult = (await activeDamageMult().catch(() => 1)) * (await memberDamageMult(buyerId).catch(() => 1)) * warAura;
    const divisor = boss.ticket_divisor || 100;
    // This week's boss is weak to an ELEMENT — matching gear deals bonus damage; the Attuned signature amplifies it.
    const elemOver = await getElementOverrides(buyerId).catch(() => ({}));
    const elem = elementMult(equippedIds, boss.weakness, elemOver);
    const sig = signatureHit(equippedIds, {
        hitIndex: used, crit: swing.crit,
        bossHpFrac: boss.max_hp ? boss.hp / boss.max_hp : 1, bossMaxHp: boss.max_hp || 0,
        streakDays, hittersToday: todayHitters,
        cheersToday: cheerStat?.used || 0, // CHEER-fueled overcharge: each cheer charges your strikes
        elementMatches: elem.matches, //     Attuned: +extra when you match the boss's weak element
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
    if (pp.onslaughtPct && boss.max_hp && boss.hp >= boss.max_hp * 0.75) { petMult *= 1 + pp.onslaughtPct; petProc = petProc || "onslaught"; }
    if (pp.firstBloodPct && (await hittersToday(boss.id)) < 3) { petMult *= 1 + pp.firstBloodPct; petProc = petProc || "first_blood"; }
    const wMult = elem.mult; // element-match damage (elem computed above, before the signature roll)
    // Set capstones (full set).
    const setHit = setCombatMult(equippedIds, {
        crit: swing.crit, hitIndex: used, bossHpFrac: boss.max_hp ? boss.hp / boss.max_hp : 1,
        bossMaxHp: boss.max_hp || 0, hittersToday: todayHitters, bossWeakness: boss.weakness,
    });
    // THE STOCKADE's Mark of Shame: -10% boss damage while serving. Applied to the whole swing including the
    // flat on-hit bonus, so no single source of damage escapes it.
    const shameMult = await stockadeMultiplier(buyerId).catch(() => 1);
    const damage = Math.round((swing.damage * buffMult * sig.mult * petMult * wMult * setHit.mult + (onHit.bonusDamage || 0)) * shameMult);
    const crit = swing.crit;
    const ability = pickAbility(crit);

    // RESERVE the swing slot ATOMICALLY — truly race-safe. A single conditional UPDATE on the per-(buyer,
    // boss, day) counter: the row lock serializes concurrent writers, so a scripted simultaneous burst blocks
    // and re-checks n < cap against the COMMITTED value. Unlike the old count-then-insert (which could let two
    // requests both read count < cap before either committed), the cap can never be exceeded. The earlier
    // used>=cap check is just a fast pre-reject; THIS is the real enforcement.
    const slot = await db.queryOne(
        `INSERT INTO mkt_boss_swing (buyer_id, boss_id, day, n)
         VALUES ($1, $2, (NOW() AT TIME ZONE 'America/Chicago')::date, 1)
         ON CONFLICT (buyer_id, boss_id, day)
         DO UPDATE SET n = mkt_boss_swing.n + 1 WHERE mkt_boss_swing.n < $3
         RETURNING n`,
        [buyerId, boss.id, dailyCap]
    );
    if (!slot) return { error: "no_attacks_left", attacksLeft: 0 };
    // Slot reserved — now deal the damage.
    const row = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp, max_hp`, [boss.id, damage]);
    if (!row) {
        // Boss already dead — release the reserved slot so the swing isn't wasted.
        await db.query(`UPDATE mkt_boss_swing SET n = GREATEST(0, n - 1) WHERE buyer_id = $1 AND boss_id = $2 AND day = (NOW() AT TIME ZONE 'America/Chicago')::date`, [buyerId, boss.id]).catch(() => {});
        return { error: "defeated" };
    }
    // Log the manual hit for the damage ledger (feeds top-damage, hitters-today, and dmg-rank medals).
    const hit = await db.queryOne(
        `INSERT INTO boss_hit (boss_id, buyer_id, damage, kind) VALUES ($1, $2, $3, 'manual') RETURNING id`,
        [boss.id, buyerId, damage]
    );
    // Every swing earns XP — the old "first 3 swings/day only" cap was removed so extra strikes (earned via
    // gear/pets/potions) are actually rewarded, not just damage + tickets. The dedupeKey is per-swing (keyed to
    // the atomic swing number / hit id) so a retried or double-fired request can't double-award for one swing;
    // total swings/day is still bounded by dailyStrikeCap, so this rewards extra-strike investment, not spam.
    await awardXp(buyerId, "boss_attack", { dedupeKey: `boss_attack:${hit?.id || `${boss.id}:${slot.n}`}` }).catch(() => {});
    // Signature rewards: Scholar XP + Prospector gold on this hit.
    if (onHit.xp > 0) await awardXp(buyerId, "signature_bonus", { points: onHit.xp, dedupeKey: `sigxp:${hit?.id}` }).catch(() => {});
    if (onHit.gold > 0) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, onHit.gold]).catch(() => {});
    if (onHit.gold > 0) await logCoin(buyerId, onHit.gold, "boss_reward", { meta: { boss: boss.name } }).catch(() => {});

    const defeated = await markDefeatIfDead(boss.id, row.hp, buyerId);
    await syncEarnedBadges(buyerId).catch(() => {});
    await dropSeedFrom(buyerId, "boss_strike").catch(() => {}); // a chance to find a farming seed

    // Report the EFFECTIVE hp (stored minus pending passive drain) so the client's bar stays consistent
    // with the polled state instead of snapping back up after a manual strike.
    const { effectiveHp, autoDps } = defeated
        ? { effectiveHp: 0, autoDps: 0 }
        : await autoAccrual({ id: boss.id, hp: row.hp, started_at: boss.started_at });
    const elemProc = elem.matches > 0 ? `${weaknessInfo(boss.weakness)?.emoji || "✨"} ${weaknessInfo(boss.weakness)?.label || ""} weakness +${elem.bonusPct}%` : null;
    await trackActivity(buyerId, "boss_attack", { damage, crit, boss: boss.name, defeated }).catch(() => {});
    // The felling blow, not every strike. The boss is the main route to Exquisite and Legendary recipes, and
    // gating it on the kill is what keeps those tiers weekly rather than farmable.
    if (defeated) {
        try {
            const { tryRecipeDrop } = await import("@/lib/marketplace/cooking.js");
            await tryRecipeDrop(buyerId, "boss_kill");
        } catch { /* a recipe is a bonus; never let it fail the kill */ }
    }
    return { ok: true, damage, crit, ability, proc: sig.proc || setHit.proc || petProc || elemProc, hp: effectiveHp, autoDps, maxHp: row.max_hp, defeated, attacksLeft: Math.max(0, dailyCap - (used + 1)), name: boss.name };
}

// ===== CHEER — hype up the hero currently on stage during a boss fight =====
// You get CHEERS_PER_DAY cheers a day. A cheer deals a little bonus damage credited to the CHEERED hero (so it
// helps the raid and their tickets), and earns YOU a bit of XP + coin. Equipped gear can roll bonus procs
// (extra gold/XP, pet XP, a first-of-day self-strike, and — rarest — a treasure-chest fragment). Tiered badges
// track cheers given AND received.
export const CHEERS_PER_DAY = 3;
const CHEER_XP = 10;
const CHEER_GOLD = 10;
const CHEER_DMG_MIN = 45;
const CHEER_DMG_MAX = 85;
const CHEER_DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date"; // store-local day, same as the swing counter

export async function getCheerStatus(buyerId) {
    if (!buyerId) return { perDay: CHEERS_PER_DAY, used: 0, left: 0 };
    const row = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_cheer WHERE giver_id = $1 AND day = ${CHEER_DAY}`, [buyerId]).catch(() => null);
    const used = row?.n || 0;
    return { perDay: CHEERS_PER_DAY, used, left: Math.max(0, CHEERS_PER_DAY - used) };
}

export async function cheer(buyerId, targetId) {
    if (!buyerId) return { error: "unauthorized" };
    if (!targetId || targetId === buyerId) return { error: "bad_target" };
    const boss = await getActiveBoss();
    if (!boss || boss.hp <= 0 || boss.defeated_at) return { error: "no_boss" };
    // The cheered hero must be a real registered member.
    const target = await db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE id = $1 AND alias IS NOT NULL`, [targetId]).catch(() => null);
    if (!target) return { error: "bad_target" };

    // First cheer of the day? (gates the once-a-day item procs) — read before the insert.
    const before = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_cheer WHERE giver_id = $1 AND day = ${CHEER_DAY}`, [buyerId]).catch(() => null);
    const firstOfDay = (before?.n || 0) === 0;

    const dmg = CHEER_DMG_MIN + Math.floor(Math.random() * (CHEER_DMG_MAX - CHEER_DMG_MIN + 1));
    // Atomic daily-cap insert — the ledger row only lands if today's count is still under the cap, so rapid
    // taps can't slip past it. No row back = you're out of cheers.
    const inserted = await db.queryOne(
        `INSERT INTO mkt_cheer (giver_id, receiver_id, boss_id, day, damage)
         SELECT $1, $2, $3, ${CHEER_DAY}, $4
          WHERE (SELECT COUNT(*) FROM mkt_cheer WHERE giver_id = $1 AND day = ${CHEER_DAY}) < $5
         RETURNING id`,
        [buyerId, targetId, boss.id, dmg, CHEERS_PER_DAY]
    ).catch(() => null);
    if (!inserted) return { error: "no_cheers_left", ...(await getCheerStatus(buyerId)) };

    // Cheer procs off the cheerer's equipped gear.
    const equipped = await getEquippedIds(buyerId).catch(() => ({}));
    const procs = rollCheerProcs(equipped, { firstOfDay });

    // Base reward: +10 XP / +10 coin (plus any item bonus). awardXp also trickles the equipped pet its share.
    const xpGain = CHEER_XP + (procs.xp || 0);
    const goldGain = CHEER_GOLD + (procs.gold || 0);
    await awardXp(buyerId, "cheer", { points: xpGain, gold: goldGain }).catch(() => {});
    await trackActivity(buyerId, "cheer", { xp: xpGain, gold: goldGain, toId: targetId, toName: target.display_name || target.alias, damage: dmg }).catch(() => {});
    if (procs.petXp > 0) await addEquippedPetXp(buyerId, procs.petXp).catch(() => {});
    if (procs.fragment) await grantFragment(buyerId, 1).catch(() => {});

    // The cheered hero surges — bonus damage credited to THEM (kind='cheer' keeps it out of manual swing counts).
    let hp = boss.hp, maxHp = boss.max_hp;
    const row1 = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp, max_hp`, [boss.id, dmg]);
    if (row1) {
        hp = row1.hp; maxHp = row1.max_hp;
        await db.query(`INSERT INTO boss_hit (boss_id, buyer_id, damage, kind) VALUES ($1, $2, $3, 'cheer')`, [boss.id, targetId, dmg]).catch(() => {});
    }
    // First-cheer-of-day item proc: YOU also strike the boss.
    if (procs.selfDamage > 0 && row1) {
        const row2 = await db.queryOne(`UPDATE boss_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND defeated_at IS NULL RETURNING hp, max_hp`, [boss.id, procs.selfDamage]);
        if (row2) {
            hp = row2.hp; maxHp = row2.max_hp;
            await db.query(`INSERT INTO boss_hit (boss_id, buyer_id, damage, kind) VALUES ($1, $2, $3, 'cheer')`, [boss.id, buyerId, procs.selfDamage]).catch(() => {});
        }
    }

    // Lifetime counters + badge sync for both sides.
    await db.query(`UPDATE mkt_buyer SET cheers_given = cheers_given + 1 WHERE id = $1`, [buyerId]).catch(() => {});
    await db.query(`UPDATE mkt_buyer SET cheers_received = cheers_received + 1 WHERE id = $1`, [targetId]).catch(() => {});
    const [newBadges] = await Promise.all([
        syncEarnedBadges(buyerId).catch(() => []),
        syncEarnedBadges(targetId).catch(() => []),
    ]);

    const defeated = await markDefeatIfDead(boss.id, hp, buyerId);
    const { effectiveHp, autoDps } = defeated
        ? { effectiveHp: 0, autoDps: 0 }
        : await autoAccrual({ id: boss.id, hp, started_at: boss.started_at });
    const status = await getCheerStatus(buyerId);
    return {
        ok: true,
        targetName: target.display_name || target.alias || "your teammate",
        damage: dmg + (procs.selfDamage || 0),
        cheerDamage: dmg,
        selfDamage: procs.selfDamage || 0,
        xp: xpGain, gold: goldGain, petXp: procs.petXp || 0, fragment: procs.fragment || false,
        hp: effectiveHp, autoDps, maxHp, defeated,
        left: status.left, perDay: status.perDay,
        name: boss.name,
        newBadges: (newBadges || []).map((b) => ({ slug: b.slug, label: b.label, icon: b.icon })),
    };
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
    // Gear + equipped-pet stats both boost each member's passive auto-damage.
    const [statsByMember, idsByMember, petByMember, elemOverByMember] = await Promise.all([
        getEquippedStatsForMembers(members.map((m) => m.id)).catch(() => new Map()),
        getEquippedIdsForMembers(members.map((m) => m.id)).catch(() => new Map()),
        getPackPetBonuses().catch(() => new Map()),
        getElementOverridesForMembers(members.map((m) => m.id)).catch(() => new Map()),
    ]);
    const buffMult = await activeDamageMult().catch(() => 1);
    const rows = members
        .map((m) => {
            // Elemental affinity now boosts PASSIVE auto-damage too (not just manual): matching-element gear
            // deals bonus damage vs a boss weak to that element (respecting Forge reforges).
            const elem = elementMult(idsByMember.get(m.id) || [], boss.weakness, elemOverByMember.get(m.id)).mult;
            const stats = autoStats(statsByMember.get(m.id) || {}, petByMember.get(m.id)?.stats || {});
            return { id: m.id, damage: Math.round(autoPerHour(lvl(m.xp), stats) * hours * buffMult * elem) };
        })
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
