import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { broadcastWebPush } from "@/lib/push/web-push.js";
import { broadcastBuyerPushAll } from "@/lib/push/send.js";
import { storeStatus } from "@/lib/marketplace/store-hours.js";
import { bumpTownQuest } from "@/lib/marketplace/town-quests.js";
import { getSetting } from "@/lib/settings.js";

// ── TOWN EVENTS ─────────────────────────────────────────────────────────────────────────────────────────────
// Admin-triggered communal encounters that spawn in the plaza (a bandit raid, etc.). Everyone in town attacks a
// shared HP pool; when it drops (or the timer runs out) rewards are paid to every fighter, scaled by how much
// damage they personally dealt (active participation = bigger share). Alerts the whole membership via push.

// hp = one WAVE's health; `enemies` roam the plaza and thin out as the wave's hp drops. When a wave is cleared
// before the minimum, reinforcements arrive (hp refills) — so the fight lasts long enough for people to show up.
export const TOWN_EVENT_TYPES = {
    bandit_raid: {
        name: "Bandit Raid", emoji: "🗡️", hp: 700, enemies: 8, rewardGold: 2500, durationMin: 14,
        pushTitle: "🗡️ Bandits are raiding the Wolf Den!", pushBody: "They're in the plaza — rush the Town and fight them off for gold!",
    },
    goblin_swarm: {
        name: "Goblin Swarm", emoji: "👺", hp: 600, enemies: 12, rewardGold: 1800, durationMin: 12,
        pushTitle: "👺 A goblin swarm hit the Town!", pushBody: "Pile into the plaza and drive them out — loot for everyone who fights!",
    },
    treasure_golem: {
        name: "Treasure Golem", emoji: "💎", hp: 1100, enemies: 3, rewardGold: 4000, durationMin: 12,
        pushTitle: "💎 A Treasure Golem lumbered into Town!", pushBody: "Crack it open together — it's stuffed with gold. First to the plaza wins big!",
    },
};

const HIT_THROTTLE_MS = 240;   // a strike takes a beat to recover (also anti-spam)
const FLAT_MIN_GOLD = 25;      // everyone who lands a hit gets at least this
// Damage per action. Timed-strike TIERS (miss the timing → weak; nail it → perfect crit) + the Power Slash
// ability. Server-authoritative + bounded, so the worst a cheating client can do is always claim "perfect".
const STRIKE_DMG = { weak: 5, normal: 11, good: 18, perfect: 30 };
const POWER_DMG = 48;
// An event runs at least this long (waves refill until then) so it's a real gathering, not an instant kill.
const MIN_ACTIVE_MS = 150000;        // ~2.5 min for a real (pushed) event
const MIN_ACTIVE_SILENT_MS = 45000;  // shorter for owner silent-tests so you're not stuck fighting for minutes

// Resolve any active event whose timer has elapsed (lazy — runs on reads). Idempotent.
async function resolveExpiredEvents() {
    const rows = await db.query(`SELECT id FROM mkt_town_event WHERE status = 'active' AND ends_at < NOW()`).catch(() => []);
    for (const r of rows) await resolveTownEvent(r.id, "expired").catch(() => {});
}

// When a wave is cleared (hp<=0): if the minimum active time has passed, the raid is WON (resolve + pay).
// Otherwise reinforcements arrive — refill the wave's hp + bump the wave counter. Returns {resolved, hp, wave}.
async function waveOrResolve(ev) {
    const startedMs = new Date(ev.started_at).getTime();
    const minMs = Number(ev.meta?.minMs) || MIN_ACTIVE_MS;
    if (Date.now() - startedMs >= minMs) {
        await resolveTownEvent(ev.id, "defeated").catch(() => {});
        return { resolved: true, hp: 0, wave: Number(ev.meta?.wave) || 1 };
    }
    const wave = (Number(ev.meta?.wave) || 1) + 1;
    const row = await db.queryOne(
        `UPDATE mkt_town_event SET hp = hp_max, meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{wave}', to_jsonb($2::int))
          WHERE id = $1 AND status = 'active' RETURNING hp`,
        [ev.id, wave]
    ).catch(() => null);
    return { resolved: false, hp: row?.hp ?? ev.hp_max, wave };
}

// The current active event (+ your damage + the top fighters), or null. Shape is town-state friendly.
export async function getActiveTownEvent(buyerId) {
    await resolveExpiredEvents();
    let ev = await db.queryOne(`SELECT * FROM mkt_town_event WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`).catch(() => null);
    if (!ev) return null;
    // A wave sitting at 0 (cleared, no one mid-fight) → resolve if past the minimum, else send in reinforcements.
    if (ev.hp <= 0) {
        const w = await waveOrResolve(ev);
        if (w.resolved) return null;
        ev = { ...ev, hp: w.hp, meta: { ...ev.meta, wave: w.wave } };
    }
    const type = TOWN_EVENT_TYPES[ev.kind] || {};
    const enemies = Number(ev.meta?.enemies) || 6;
    const [mine, top, count] = await Promise.all([
        buyerId ? db.queryOne(`SELECT damage, hits FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [ev.id, buyerId]).catch(() => null) : Promise.resolve(null),
        db.query(`SELECT h.buyer_id, h.damage, b.display_name, b.alias FROM mkt_town_event_hit h JOIN mkt_buyer b ON b.id = h.buyer_id WHERE h.event_id = $1 ORDER BY h.damage DESC LIMIT 5`, [ev.id]).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_town_event_hit WHERE event_id = $1`, [ev.id]).catch(() => ({ n: 0 })),
    ]);
    return {
        id: Number(ev.id), kind: ev.kind, name: ev.name, emoji: type.emoji || "⚔️",
        hp: ev.hp, hpMax: ev.hp_max, endsAt: ev.ends_at, startedAt: ev.started_at, rewardGold: ev.reward_gold,
        enemies, enemiesLeft: ev.hp <= 0 ? 0 : Math.max(1, Math.ceil((ev.hp / ev.hp_max) * enemies)),
        wave: Number(ev.meta?.wave) || 1, minMs: Number(ev.meta?.minMs) || MIN_ACTIVE_MS,
        myDamage: mine?.damage || 0, myHits: mine?.hits || 0,
        fighterCount: count?.n || 0,
        fighters: (top || []).map((t) => ({ name: t.display_name || (t.alias ? `@${t.alias}` : "Wolf"), damage: t.damage })),
    };
}

// Admin/owner: spawn an event (one active at a time). Alerts everyone via web + app push UNLESS `silent`
// (a quiet test spawn — no notifications go out, and the resolution push is suppressed too).
export async function spawnTownEvent(kind = "bandit_raid", { silent = false } = {}) {
    const type = TOWN_EVENT_TYPES[kind];
    if (!type) return { ok: false, error: "unknown_kind" };
    const existing = await db.queryOne(`SELECT id FROM mkt_town_event WHERE status = 'active' LIMIT 1`).catch(() => null);
    if (existing) return { ok: false, error: "already_active" };
    const row = await db.queryOne(
        `INSERT INTO mkt_town_event (kind, name, status, hp_max, hp, reward_gold, ends_at, meta)
         VALUES ($1, $2, 'active', $3, $3, $4, NOW() + ($5 || ' minutes')::interval, $6) RETURNING id`,
        [kind, type.name, type.hp, type.rewardGold, String(type.durationMin), JSON.stringify({ silent: Boolean(silent), enemies: type.enemies || 6, minMs: silent ? MIN_ACTIVE_SILENT_MS : MIN_ACTIVE_MS, wave: 1 })]
    ).catch(() => null);
    if (!row) return { ok: false, error: "spawn_failed" };
    if (!silent) {
        // Rally the whole pack — browser push + phone-app push, both deep-linking to the Town.
        broadcastWebPush({ title: type.pushTitle, body: type.pushBody, url: "/marketplace/town", tag: "town-event", data: { type: "town_event" } }).catch(() => {});
        broadcastBuyerPushAll({ title: type.pushTitle, body: type.pushBody, route: "town", data: { type: "town_event" } }).catch(() => {});
    }
    return { ok: true, id: Number(row.id), name: type.name, silent: Boolean(silent) };
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
    const dmg = move === "power" ? POWER_DMG : (STRIKE_DMG[move] ?? STRIKE_DMG.normal);
    const updated = await db.queryOne(`UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`, [eventId, dmg]).catch(() => null);
    await db.query(
        `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_hit_at) VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET damage = mkt_town_event_hit.damage + $3, hits = mkt_town_event_hit.hits + 1, last_hit_at = NOW()`,
        [eventId, buyerId, dmg]
    ).catch(() => {});
    bumpTownQuest(buyerId, "rally", 1).catch(() => {});
    let hp = updated?.hp ?? ev.hp;
    let defeated = false;
    let wave = Number(ev.meta?.wave) || 1;
    if (hp <= 0) {
        const w = await waveOrResolve(ev);
        defeated = w.resolved;
        hp = w.resolved ? 0 : w.hp;
        wave = w.wave;
    }
    return { ok: true, damage: dmg, hp, defeated, wave, crit: move === "perfect", clearedWave: (updated?.hp ?? 0) <= 0 && !defeated };
}

// Pay out an event once (atomic status flip guards against double-pay). Gold to every fighter, scaled by their
// damage share (+ a flat participation floor). On a timeout the pool is prorated to the damage dealt.
async function resolveTownEvent(eventId, outcome) {
    const ev = await db.queryOne(
        `UPDATE mkt_town_event SET status = $2, defeated_at = CASE WHEN $2 = 'defeated' THEN NOW() ELSE defeated_at END
          WHERE id = $1 AND status = 'active' RETURNING *`,
        [eventId, outcome === "defeated" ? "defeated" : "expired"]
    ).catch(() => null);
    if (!ev) return; // someone else already resolved it
    const hits = await db.query(`SELECT buyer_id, damage FROM mkt_town_event_hit WHERE event_id = $1 AND damage > 0`, [eventId]).catch(() => []);
    const totalDmg = hits.reduce((s, h) => s + h.damage, 0) || 1;
    const pool = outcome === "defeated" ? ev.reward_gold : Math.round(ev.reward_gold * Math.min(1, (ev.hp_max - ev.hp) / ev.hp_max));
    for (const h of hits) {
        const gold = FLAT_MIN_GOLD + Math.round(pool * (h.damage / totalDmg));
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [h.buyer_id, gold]).catch(() => null);
        await logCoin(h.buyer_id, gold, "town_event", { balanceAfter: paid?.gold, ref: String(eventId) }).catch(() => {});
        await db.query(`UPDATE mkt_town_event_hit SET rewarded = TRUE, reward_gold = $3 WHERE event_id = $1 AND buyer_id = $2`, [eventId, h.buyer_id, gold]).catch(() => {});
    }
    if (!ev.meta?.silent) {
        const msg = outcome === "defeated"
            ? `The ${ev.name} was driven off! Gold paid to all ${hits.length} who fought.`
            : `The ${ev.name} slipped away — but everyone who fought still earned a share.`;
        broadcastWebPush({ title: `✅ ${ev.name} over`, body: msg, url: "/marketplace/town", tag: "town-event", data: { type: "town_event_end" } }).catch(() => {});
    }
}
