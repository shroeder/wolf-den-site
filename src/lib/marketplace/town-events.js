import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { broadcastWebPush } from "@/lib/push/web-push.js";
import { broadcastBuyerPushAll } from "@/lib/push/send.js";
import { storeStatus } from "@/lib/marketplace/store-hours.js";
import { bumpTownQuest } from "@/lib/marketplace/town-quests.js";
import { getSetting } from "@/lib/settings.js";
import { getEquippedStats, getEquippedIds } from "@/lib/marketplace/inventory.js";
import { getPetCombatBonus } from "@/lib/marketplace/pet-combat.js";
import { getEquippedUtilTotals } from "@/lib/marketplace/item-affix.js";
import { rollWeaponSkill } from "@/lib/marketplace/raid-skills.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { getTownBonuses } from "@/lib/marketplace/town-projects.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { checkTownRaidBadges } from "@/lib/marketplace/town-badges.js";
import { maybeGrantRaidPet } from "@/lib/marketplace/pet-drops.js";

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ── TOWN EVENTS ─────────────────────────────────────────────────────────────────────────────────────────────
// Admin-triggered communal encounters that spawn in the plaza (a bandit raid, etc.). Everyone in town attacks a
// shared HP pool; when it drops (or the timer runs out) rewards are paid to every fighter, scaled by how much
// damage they personally dealt (active participation = bigger share). Alerts the whole membership via push.

// hp = one WAVE's health; `enemies` roam the plaza and thin out as the wave's hp drops. When a wave is cleared
// before the minimum, reinforcements arrive (hp refills) — so the fight lasts long enough for people to show up.
// hp = one WAVE's health, split across `enemies` — tuned so each foe soaks a few hits (not a one-shot) for a
// real brawl. Rewards are CAPPED per fighter (see RAID_MAX_GOLD / RAID_PARTICIPATION_XP), so bigger pools just
// mean more fighters can share, never a jackpot for one person.
export const TOWN_EVENT_TYPES = {
    bandit_raid: {
        name: "Bandit Raid", emoji: "🗡️", hp: 2400, enemies: 6, rewardGold: 2500, durationMin: 14, duelPower: 16,
        pushTitle: "🗡️ Bandits are raiding the Wolf Den!", pushBody: "They're in the plaza — rush the Town and fight them off for gold!",
    },
    goblin_swarm: {
        name: "Goblin Swarm", emoji: "👺", hp: 2000, enemies: 8, rewardGold: 1800, durationMin: 12, duelPower: 13,
        pushTitle: "👺 A goblin swarm hit the Town!", pushBody: "Pile into the plaza and drive them out — loot for everyone who fights!",
    },
    // The golem is a BOSS RAID (not a skirmish): ONE huge shared boss everyone strikes together, its HP bar drains
    // for the whole pack, and killing it ENDS the raid. No per-hit rewards — only a rich completion reward.
    treasure_golem: {
        name: "Treasure Golem", emoji: "💎", boss: true, hp: 5200000, testHp: 30000, rewardGold: 4000, durationMin: 45,
        pushTitle: "💎 A Treasure Golem BOSS lumbered into Town!", pushBody: "It's MASSIVE — the whole pack has to rally and bring it down together. Rush the plaza!",
    },
};

const HIT_THROTTLE_MS = 1000;  // 1-second cooldown between taps
const FLAT_MIN_GOLD = 25;      // everyone who lands a hit gets at least this
const RAID_MAX_GOLD = 500;     // per-fighter gold CAP (a raid is a nice bonus, not a jackpot)
const RAID_PARTICIPATION_XP = 250; // XP each fighter earns when the raid resolves (the raid's main draw is XP now)
// ── DUELS (skirmish raids) ── clicking a foe starts a back-and-forth exchange. Win → a small reward + a low loot
// chance; your FIRST fight of a raid always drops a chest (thanks for coming down); a loss still pays a little.
const DUEL_THROTTLE_MS = 700;
const DUEL_WIN_XP = 18;         // tuned DOWN — per-enemy spoils were too rich
const DUEL_WIN_GOLD = 22;
const DUEL_LOSS_GOLD = 8;       // consolation so a loss is never nothing
const DUEL_LOOT_CHANCE = 0.03;  // chance a WIN also drops a low-tier chest — chests are meant to be RARE here
// ── BOSS RAID (the golem) ── everyone strikes a shared HP pool; killing it ends the raid. No per-hit rewards —
// only a fat COMPLETION reward to everyone who joined the fight (clearly better than a skirmish raid).
const BOSS_STRIKE_THROTTLE_MS = 1000;
const BOSS_COMPLETE_GOLD = 900;   // to every fighter on a kill
const BOSS_COMPLETE_XP = 800;
const BOSS_ESCAPE_MULT = 0.4;     // if the boss survives the timer, fighters get this fraction of the reward
// Per-tap damage from the player's real equipped stats (+ pet), with a crit roll and a chance at a weapon-skill
// proc. Server-authoritative so a cheating client can't inflate it. Returns { damage, crit, proc }.
async function computeRaidHit(buyerId) {
    const [stats, pet, ids, util] = await Promise.all([
        getEquippedStats(buyerId).catch(() => ({})),
        getPetCombatBonus(buyerId).catch(() => ({ stats: {} })),
        getEquippedIds(buyerId).catch(() => ({})),
        getEquippedUtilTotals(buyerId).catch(() => ({ raidDmg: 0 })),
    ]);
    const ps = pet?.stats || {};
    const might = (stats.might || 0) + (ps.might || 0);
    const ferocity = (stats.ferocity || 0) + (ps.ferocity || 0);
    // Base scales with your offense; even a bare hero deals a little. Small jitter so numbers feel alive.
    let dmg = 8 + might * 0.85 + ferocity * 0.5;
    dmg *= 0.9 + Math.random() * 0.2;
    // Crit
    const critChance = Math.min(0.75, (stats.crit_chance || 0) + (ps.crit_chance || 0));
    const crit = Math.random() < critChance;
    if (crit) dmg *= 1.5 + ((stats.crit_power || 0) + (ps.crit_power || 0)) / 100;
    // Weapon skill proc (big bonus + a snazzy callout)
    const proc = rollWeaponSkill(ids?.main_hand || null);
    if (proc) dmg *= proc.mult;
    // Raid Fury forge attunement — flat % boost to every raid strike.
    if (util.raidDmg > 0) dmg *= 1 + util.raidDmg / 100;
    return { damage: Math.max(1, Math.round(dmg)), crit, proc };
}
// An event runs at least this long (waves refill until then) so it's a real gathering, not an instant kill.
const MIN_ACTIVE_MS = 150000;        // ~2.5 min for a real (pushed) event
const MIN_ACTIVE_SILENT_MS = 45000;  // shorter for owner silent-tests so you're not stuck fighting for minutes

// Resolve any active event whose timer has elapsed (lazy — runs on reads). Idempotent.
async function resolveExpiredEvents() {
    const rows = await db.query(`SELECT id FROM mkt_town_event WHERE status = 'active' AND ends_at < NOW()`).catch(() => []);
    for (const r of rows) await resolveTownEvent(r.id, "expired").catch(() => {});
}

// A raid runs for its FULL duration — clearing a wave NEVER ends it; reinforcements always arrive (refill hp +
// bump the wave counter) until the timer (`ends_at`) expires. Returns { hp, wave }.
async function refillWave(ev) {
    const wave = (Number(ev.meta?.wave) || 1) + 1;
    const row = await db.queryOne(
        `UPDATE mkt_town_event SET hp = hp_max, meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{wave}', to_jsonb($2::int))
          WHERE id = $1 AND status = 'active' RETURNING hp`,
        [ev.id, wave]
    ).catch(() => null);
    return { hp: row?.hp ?? ev.hp_max, wave };
}

// The current active event (+ your damage + the top fighters), or null. Shape is town-state friendly.
export async function getActiveTownEvent(buyerId) {
    await resolveExpiredEvents();
    let ev = await db.queryOne(`SELECT * FROM mkt_town_event WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`).catch(() => null);
    if (!ev) return null;
    const isBoss = Boolean(ev.meta?.boss);
    if (ev.hp <= 0) {
        if (isBoss) { await resolveTownEvent(ev.id, "defeated").catch(() => {}); return null; } // boss down → raid over
        // Skirmish: a cleared wave refills; the raid runs until its timer, never ends on a clear.
        const w = await refillWave(ev);
        ev = { ...ev, hp: w.hp, meta: { ...ev.meta, wave: w.wave } };
    }
    const type = TOWN_EVENT_TYPES[ev.kind] || {};
    const enemies = Number(ev.meta?.enemies) || 6;
    const [mine, top, count] = await Promise.all([
        buyerId ? db.queryOne(`SELECT damage, hits FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [ev.id, buyerId]).catch(() => null) : Promise.resolve(null),
        db.query(`SELECT h.buyer_id, h.damage, b.display_name, b.alias FROM mkt_town_event_hit h JOIN mkt_buyer b ON b.id = h.buyer_id WHERE h.event_id = $1 ORDER BY h.damage DESC LIMIT 5`, [ev.id]).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_town_event_hit WHERE event_id = $1`, [ev.id]).catch(() => ({ n: 0 })),
    ]);
    // BOSS: the fighters ACTUALLY at the fight right now (struck in the last 90s) with their hero sprites — so the
    // battle shows who came and engaged, not random online members.
    let bossFighters = [];
    if (isBoss) {
        const fr = await db.query(
            `SELECT h.buyer_id, h.damage, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip
               FROM mkt_town_event_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
              WHERE h.event_id = $1 AND h.last_hit_at > NOW() - INTERVAL '90 seconds'
              ORDER BY h.damage DESC LIMIT 14`, [ev.id]
        ).catch(() => []);
        bossFighters = fr.map((r) => ({ id: r.buyer_id, name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"), sprite: r.avatar_sprite_url || null, flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false, damage: Number(r.damage) || 0 }));
    }
    return {
        id: Number(ev.id), kind: ev.kind, name: ev.name, emoji: type.emoji || "⚔️", boss: isBoss,
        hp: ev.hp, hpMax: ev.hp_max, endsAt: ev.ends_at, startedAt: ev.started_at, rewardGold: ev.reward_gold,
        enemies, enemiesLeft: ev.hp <= 0 ? 0 : Math.max(1, Math.ceil((ev.hp / ev.hp_max) * enemies)),
        hpPct: ev.hp_max ? Math.max(0, Math.round((ev.hp / ev.hp_max) * 100)) : 0,
        wave: Number(ev.meta?.wave) || 1, minMs: Number(ev.meta?.minMs) || MIN_ACTIVE_MS,
        myDamage: mine?.damage || 0, myHits: mine?.hits || 0,
        fighterCount: count?.n || 0,
        fighters: (top || []).map((t) => ({ name: t.display_name || (t.alias ? `@${t.alias}` : "Wolf"), damage: t.damage })),
        bossFighters,
    };
}

// Admin/owner: spawn an event (one active at a time). Alerts everyone via web + app push UNLESS `silent`
// (a quiet test spawn — no notifications go out, and the resolution push is suppressed too).
export async function spawnTownEvent(kind = "bandit_raid", { silent = false } = {}) {
    const type = TOWN_EVENT_TYPES[kind];
    if (!type) return { ok: false, error: "unknown_kind" };
    const existing = await db.queryOne(`SELECT id FROM mkt_town_event WHERE status = 'active' LIMIT 1`).catch(() => null);
    if (existing) return { ok: false, error: "already_active" };
    // Boss raids get a huge shared HP pool (a much smaller one for silent owner-tests so they're soloable).
    const spawnHp = type.boss ? (silent ? (type.testHp || type.hp) : type.hp) : type.hp;
    const row = await db.queryOne(
        `INSERT INTO mkt_town_event (kind, name, status, hp_max, hp, reward_gold, ends_at, meta)
         VALUES ($1, $2, 'active', $3, $3, $4, NOW() + ($5 || ' minutes')::interval, $6) RETURNING id`,
        [kind, type.name, spawnHp, type.rewardGold, String(type.durationMin), JSON.stringify({ silent: Boolean(silent), boss: Boolean(type.boss), enemies: type.enemies || 6, minMs: silent ? MIN_ACTIVE_SILENT_MS : MIN_ACTIVE_MS, wave: 1 })]
    ).catch(() => null);
    if (!row) return { ok: false, error: "spawn_failed" };
    if (!silent) {
        // Rally the whole pack — browser push + phone-app push, both deep-linking to the Town.
        broadcastWebPush({ title: type.pushTitle, body: type.pushBody, url: "/marketplace/town", tag: "town-event", data: { type: "town_event" } }).catch(() => {});
        broadcastBuyerPushAll({ title: type.pushTitle, body: type.pushBody, route: "town", data: { type: "town_event" } }).catch(() => {});
    }
    return { ok: true, id: Number(row.id), name: type.name, silent: Boolean(silent) };
}

// Owner/admin: force-end the active event (for testing) — closes it out so a new one can be spawned. No reward
// payout; the client's raid-conclusion recap still fires so the wrap-up flow can be tested too.
export async function endTownEvent() {
    const rows = await db.query(`UPDATE mkt_town_event SET status = 'expired', defeated_at = NOW() WHERE status = 'active' RETURNING id`).catch(() => []);
    return { ok: true, ended: rows.length };
}

// Whether the auto opening-events are live. Controlled by a DB setting (owner toggle in the Town Hall) rather
// than a Vercel env var — kept between us, flippable without touching the dashboard.
export async function townEventsLive() {
    return String((await getSetting("town_events_live", "")) || "").trim() === "1";
}

// Cron tick: right after the shop physically OPENS (Thu–Sun), auto-spawn a town event so members get pinged
// to come down while the Den is open — a foot-traffic driver. DORMANT until the owner flips town_events_live,
// because the Town is owner-gated during the build and we must not push the membership to a town they can't enter.
export async function runTownHoursTick() {
    if (!(await townEventsLive())) return { skipped: "not_live" };
    const status = storeStatus();
    if (!status.open || status.minutesSinceOpen > 20) return { skipped: "not_just_opened", open: status.open };
    const [active, recent] = await Promise.all([
        db.queryOne(`SELECT id FROM mkt_town_event WHERE status = 'active' LIMIT 1`).catch(() => null),
        db.queryOne(`SELECT id FROM mkt_town_event WHERE started_at > NOW() - INTERVAL '30 minutes' LIMIT 1`).catch(() => null),
    ]);
    if (active || recent) return { skipped: "event_recent" };
    const kinds = Object.keys(TOWN_EVENT_TYPES);
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const res = await spawnTownEvent(kind);
    return { spawned: res.ok ? kind : null, error: res.error || null };
}

// Per-15-min spawn chance by CENTRAL hour — concentrated in the evening (~5–8pm CT) when the most members are
// around, a light chance mid-day/evening, and nothing overnight. Tune freely.
function spawnChanceForHour(h) {
    if (h < 10) return 0;              // overnight / early morning — quiet
    if (h >= 17 && h <= 20) return 0.16; // 5–8pm CT peak
    if (h >= 12 && h <= 21) return 0.05; // afternoon / evening
    return 0.02;                        // late morning / late night
}

// Cron tick (every ~15 min): a WEIGHTED-RANDOM chance to spawn a random town event, biased toward the evening
// (Central). Gated behind town_events_live (the Town is owner-only during the build). At most one event at a
// time, and none within 3 hours of the last, so they stay special.
export async function maybeSpawnRandomEvent() {
    if (!(await townEventsLive())) return { skipped: "not_live" };
    const [active, recent] = await Promise.all([
        db.queryOne(`SELECT id FROM mkt_town_event WHERE status = 'active' LIMIT 1`).catch(() => null),
        db.queryOne(`SELECT id FROM mkt_town_event WHERE started_at > NOW() - INTERVAL '3 hours' LIMIT 1`).catch(() => null),
    ]);
    if (active || recent) return { skipped: "event_recent" };
    const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour: "2-digit", hour12: false })) % 24;
    const chance = spawnChanceForHour(h);
    if (!chance || Math.random() >= chance) return { skipped: "no_roll", hour: h, chance };
    const kinds = Object.keys(TOWN_EVENT_TYPES);
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const res = await spawnTownEvent(kind);
    return { spawned: res.ok ? kind : null, hour: h, chance, error: res.error || null };
}

// Land an attack on the raid. `move` is the timed-strike tier (weak/normal/good/perfect) or "power" (ability).
// Throttled per member; clearing a wave sends reinforcements — or wins the raid once the minimum time has passed.
export async function attackTownEvent(buyerId, eventId, move = "normal") {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const ev = await db.queryOne(`SELECT id, hp, hp_max, started_at, meta FROM mkt_town_event WHERE id = $1 AND status = 'active'`, [eventId]).catch(() => null);
    if (!ev) return { ok: false, error: "no_event" };
    const prior = await db.queryOne(`SELECT last_hit_at FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [eventId, buyerId]).catch(() => null);
    if (prior?.last_hit_at && Date.now() - new Date(prior.last_hit_at).getTime() < HIT_THROTTLE_MS) {
        return { ok: false, error: "too_fast", hp: ev.hp };
    }
    const hit = await computeRaidHit(buyerId);
    const dmg = hit.damage;
    const updated = await db.queryOne(`UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`, [eventId, dmg]).catch(() => null);
    const mine = await db.queryOne(
        `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_hit_at) VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET damage = mkt_town_event_hit.damage + $3, hits = mkt_town_event_hit.hits + 1, last_hit_at = NOW()
         RETURNING damage, hits`,
        [eventId, buyerId, dmg]
    ).catch(() => null);
    bumpTownQuest(buyerId, "rally", 1).catch(() => {});
    let hp = updated?.hp ?? ev.hp;
    const defeated = false; // raids run their full duration now — a cleared wave just refills
    let wave = Number(ev.meta?.wave) || 1;
    if (hp <= 0) {
        const w = await refillWave(ev);
        hp = w.hp;
        wave = w.wave;
    }
    const reward = null;
    return {
        ok: true, damage: dmg, crit: Boolean(hit.crit), proc: hit.proc || null,
        hp, defeated, wave, reward,
        myDamage: Number(mine?.damage || dmg), myHits: Number(mine?.hits || 1),
        clearedWave: (updated?.hp ?? 0) <= 0 && !defeated,
    };
}

// End a raid when its timer expires. Rewards are handed out PER DUEL as they're fought (see duelRaidEnemy), so
// this just closes the event out and rallies a "raid's over" note. Atomic status flip guards against double-close.
async function resolveTownEvent(eventId, outcome) {
    const ev = await db.queryOne(
        `UPDATE mkt_town_event SET status = $2, defeated_at = CASE WHEN $2 = 'defeated' THEN NOW() ELSE defeated_at END
          WHERE id = $1 AND status = 'active' RETURNING *`,
        [eventId, outcome === "defeated" ? "defeated" : "expired"]
    ).catch(() => null);
    if (!ev) return; // someone else already closed it
    const hits = await db.query(`SELECT buyer_id, damage FROM mkt_town_event_hit WHERE event_id = $1`, [eventId]).catch(() => []);
    const n = hits.length;
    // The single top damager (for the prestige "Top Dog" badge on a boss kill).
    const topId = hits.length ? hits.reduce((a, b) => (Number(b.damage) > Number(a.damage) ? b : a)).buyer_id : null;
    // BOSS RAID: a fat COMPLETION reward to everyone who joined (full on a kill; a fraction if it escaped the timer).
    if (ev.meta?.boss) {
        const killed = outcome === "defeated";
        const mult = killed ? 1 : BOSS_ESCAPE_MULT;
        const gold = Math.round(BOSS_COMPLETE_GOLD * mult);
        const xp = Math.round(BOSS_COMPLETE_XP * mult);
        for (const h of hits) {
            if (gold > 0) {
                const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [h.buyer_id, gold]).catch(() => null);
                await logCoin(h.buyer_id, gold, "boss_raid", { balanceAfter: paid?.gold, ref: String(eventId) }).catch(() => {});
            }
            if (xp > 0) await awardXp(h.buyer_id, "boss_raid", { points: xp, gold: 0, dedupeKey: `boss_raid:${eventId}:${h.buyer_id}` }).catch(() => {});
            // Completion chest — a Gold chest on a kill (a Wooden one if it escaped).
            await addChests(h.buyer_id, { [killed ? "gold" : "wooden"]: 1 }, { source: "boss_raid" }).catch(() => {});
            await db.query(`UPDATE mkt_town_event_hit SET rewarded = TRUE, reward_gold = $3 WHERE event_id = $1 AND buyer_id = $2`, [eventId, h.buyer_id, gold]).catch(() => {});
            // Hard raid/boss badges + the very-rare raid-exclusive pet drop (best odds on a kill).
            await checkTownRaidBadges(h.buyer_id, { topDamagerOnKill: killed && h.buyer_id === topId }).catch(() => {});
            await maybeGrantRaidPet(h.buyer_id, { boss: true, killed }).catch(() => {});
        }
        if (!ev.meta?.silent) {
            broadcastWebPush({ title: killed ? `🏆 ${ev.name} FELLED!` : `💨 ${ev.name} escaped`, body: killed ? `The pack brought it down — ${n} ${n === 1 ? "wolf" : "wolves"} share the spoils!` : "It slipped away, but everyone who fought earned a share.", url: "/marketplace/town", tag: "town-event", data: { type: "town_event_end" } }).catch(() => {});
        }
        return;
    }
    // Skirmish raid over: per-duel rewards were already paid, but tally hard badges + a slim raid-pet chance for
    // everyone who came down and fought.
    for (const h of hits) {
        await checkTownRaidBadges(h.buyer_id).catch(() => {});
        await maybeGrantRaidPet(h.buyer_id, { boss: false, killed: false }).catch(() => {});
    }
    if (!ev.meta?.silent) {
        broadcastWebPush({ title: `✅ ${ev.name} over`, body: `The raid's done — ${n} ${n === 1 ? "wolf" : "wolves"} joined the fight. Well fought!`, url: "/marketplace/town", tag: "town-event", data: { type: "town_event_end" } }).catch(() => {});
    }
}

// Strike the BOSS RAID (the golem): everyone hits ONE shared HP pool. No per-hit reward — killing it ends the raid
// and pays the completion reward (resolveTownEvent). Returns the boss's new HP + your running damage.
export async function bossRaidStrike(buyerId, eventId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const ev = await db.queryOne(`SELECT id, hp, hp_max, meta FROM mkt_town_event WHERE id = $1 AND status = 'active'`, [eventId]).catch(() => null);
    if (!ev || !ev.meta?.boss) return { ok: false, error: "no_boss" };
    const prior = await db.queryOne(`SELECT last_hit_at FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [eventId, buyerId]).catch(() => null);
    if (prior?.last_hit_at && Date.now() - new Date(prior.last_hit_at).getTime() < BOSS_STRIKE_THROTTLE_MS) return { ok: false, error: "too_fast", hp: ev.hp };
    const hit = await computeRaidHit(buyerId);
    const dmg = hit.damage;
    const updated = await db.queryOne(`UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`, [eventId, dmg]).catch(() => null);
    const mine = await db.queryOne(
        `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_hit_at) VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET damage = mkt_town_event_hit.damage + $3, hits = mkt_town_event_hit.hits + 1, last_hit_at = NOW()
         RETURNING damage, hits`,
        [eventId, buyerId, dmg]
    ).catch(() => null);
    bumpTownQuest(buyerId, "rally", 1).catch(() => {});
    const hp = updated?.hp ?? ev.hp;
    let killed = false;
    if (hp <= 0) { await resolveTownEvent(eventId, "defeated").catch(() => {}); killed = true; }
    return {
        ok: true, damage: dmg, crit: Boolean(hit.crit), proc: hit.proc || null,
        hp, hpMax: ev.hp_max, hpPct: ev.hp_max ? Math.max(0, Math.round((hp / ev.hp_max) * 100)) : 0,
        myDamage: Number(mine?.damage || dmg), killed,
        reward: killed ? { gold: BOSS_COMPLETE_GOLD, xp: BOSS_COMPLETE_XP, chest: "gold" } : null,
    };
}

// A back-and-forth exchange (like the ship battles): both open at 100 HP and trade blows scaled by their power,
// with crits + randomness so it's never a lock. Returns the full turn-by-turn script for the client to animate.
function simulateDuel({ myPower, foePower, myCrit = 0, myCritPow = 30 }) {
    let me = 100, foe = 100;
    const events = [];
    const swing = (power, crit, critPow) => {
        let dmg = (8 + randInt(0, 7)) * (1 + Math.max(0, power) * 0.012);
        const isCrit = Math.random() < Math.min(0.55, Math.max(0, crit) / 100);
        if (isCrit) dmg *= 1.5 + Math.max(0, critPow) / 100;
        return { dmg: Math.max(1, Math.round(dmg)), crit: isCrit };
    };
    for (let round = 0; round < 30 && me > 0 && foe > 0; round += 1) {
        const a = swing(myPower, myCrit, myCritPow);
        foe = Math.max(0, foe - a.dmg);
        events.push({ side: "me", dmg: a.dmg, crit: a.crit, me, foe });
        if (foe <= 0) break;
        const b = swing(foePower, 8, 30);
        me = Math.max(0, me - b.dmg);
        events.push({ side: "foe", dmg: b.dmg, crit: b.crit, me, foe });
    }
    return { win: foe <= 0 ? me > 0 : me >= foe, events, myHp: me, foeHp: foe };
}

// Fight ONE foe: a duel exchange. Win → small XP + coin + a low loot chance; a loss pays a little consolation.
// Your FIRST duel of a raid always drops a low-tier chest (thanks for coming down to play). Wins drain the wave
// (which just refills — the raid runs its full timer).
export async function duelRaidEnemy(buyerId, eventId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const ev = await db.queryOne(`SELECT id, hp, hp_max, meta, kind, name FROM mkt_town_event WHERE id = $1 AND status = 'active'`, [eventId]).catch(() => null);
    if (!ev) return { ok: false, error: "no_event" };
    const prior = await db.queryOne(`SELECT last_hit_at FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [eventId, buyerId]).catch(() => null);
    if (prior?.last_hit_at && Date.now() - new Date(prior.last_hit_at).getTime() < DUEL_THROTTLE_MS) return { ok: false, error: "too_fast" };
    const firstDuel = !prior;
    // Your combat power for the exchange (gear + pet offense + Raid Fury attunement).
    const [stats, pet, util] = await Promise.all([
        getEquippedStats(buyerId).catch(() => ({})),
        getPetCombatBonus(buyerId).catch(() => ({ stats: {} })),
        getEquippedUtilTotals(buyerId).catch(() => ({ raidDmg: 0 })),
    ]);
    const ps = pet?.stats || {};
    const might = (stats.might || 0) + (ps.might || 0);
    const ferocity = (stats.ferocity || 0) + (ps.ferocity || 0);
    const critC = Math.min(60, (stats.crit_chance || 0) + (ps.crit_chance || 0));
    const critP = (stats.crit_power || 0) + (ps.crit_power || 0) || 30;
    let myPower = 6 + might * 0.9 + ferocity * 0.6;
    myPower *= 1 + (util.raidDmg || 0) / 100;
    const type = TOWN_EVENT_TYPES[ev.kind] || {};
    const sim = simulateDuel({ myPower, foePower: type.duelPower || 16, myCrit: critC, myCritPow: critP });
    // Record participation (damage this exchange = foe HP removed; hits = duels won — powers the leaderboard).
    const dealt = Math.round(100 - sim.foeHp);
    const mine = await db.queryOne(
        `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_hit_at) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET damage = mkt_town_event_hit.damage + $3, hits = mkt_town_event_hit.hits + $4, last_hit_at = NOW()
         RETURNING damage, hits`,
        [eventId, buyerId, dealt, sim.win ? 1 : 0]
    ).catch(() => null);
    bumpTownQuest(buyerId, "rally", 1).catch(() => {});

    const loot = [];
    // (Chests are RARE from skirmish foes now — only the occasional lucky win-drop below, no guaranteed chest.)

    let xp = 0, coin = 0;
    let hp = ev.hp, wave = Number(ev.meta?.wave) || 1;
    if (sim.win) {
        xp = DUEL_WIN_XP + randInt(0, 20);
        coin = DUEL_WIN_GOLD + randInt(0, 30);
        // Low loot chance on a win.
        if (Math.random() < DUEL_LOOT_CHANCE) { await addChests(buyerId, { wooden: 1 }, { source: "town_raid_loot" }).catch(() => {}); loot.push({ tier: "wooden", label: "Wooden Chest", emoji: "🧰" }); }
        // Drain the wave; a cleared wave just refills (raid runs its full timer).
        const perEnemy = Math.max(1, Math.round((ev.hp_max || 600) / (type.enemies || 6)));
        const upd = await db.queryOne(`UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`, [eventId, perEnemy]).catch(() => null);
        hp = upd?.hp ?? ev.hp;
        if (hp <= 0) { const w = await refillWave(ev); hp = w.hp; wave = w.wave; }
    } else {
        coin = DUEL_LOSS_GOLD; // never nothing
    }
    if (coin > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, coin]).catch(() => null);
        await logCoin(buyerId, coin, "town_duel", { balanceAfter: paid?.gold, ref: String(eventId) }).catch(() => {});
    }
    if (xp > 0) await awardXp(buyerId, "town_duel", { points: xp, gold: 0 }).catch(() => {});

    return { ok: true, win: sim.win, events: sim.events, reward: { xp, coin, loot }, firstDuel, hp, wave, wins: Number(mine?.hits || 0), foeEmoji: type.emoji || "🗡️" };
}
