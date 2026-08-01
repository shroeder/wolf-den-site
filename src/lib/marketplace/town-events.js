import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { broadcastWebPush } from "@/lib/push/web-push.js";
import { broadcastBuyerPushAll } from "@/lib/push/send.js";
import { storeStatus } from "@/lib/marketplace/store-hours.js";
import { CHIEFTAIN_WAVE, engageEnemy, liveFighterCount, spawnWave, strikeEnemy, swarmState } from "@/lib/marketplace/town-swarm.js";
import { bumpTownQuest } from "@/lib/marketplace/town-quests.js";
import { getSetting } from "@/lib/settings.js";
import { getEquippedStats, getEquippedIds, grantSalvageFodder } from "@/lib/marketplace/inventory.js";
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
    // Two damage sources, both requiring you to be IN THE SQUARE (see accrueSquarePassive + bossRaidStrike):
    //   · passive DPS — just being present chips away, so nobody has to grind taps
    //   · timing strikes — a Forge-style sweeping bar; better timing, bigger hit
    // HP is tuned so 5-10 people bring it down in roughly 5-10 minutes. See RAID_TUNING below for the maths;
    // change HP and the tuning note together or the fight silently drifts out of that window again.
    treasure_golem: {
        name: "Treasure Golem", emoji: "💎", boss: true, siege: true, hp: 260000, testHp: 26000, rewardGold: 4000, durationMin: 20,
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
// Measured from a real raid before this change: 108 duels paid one member 3,951 gold and ~3,240 XP, because the
// per-duel drip was UNCAPPED and cleared waves refilled forever. The stated intent was "a nice bonus, not a
// jackpot" (RAID_MAX_GOLD 500) — but that cap only ever guarded the completion payout, so the drip sailed past it
// by ~8x. Two changes: smaller per-kill spoils, and a real per-raid ceiling enforced below.
// Raised after the drip was cut too far. Killing a foe paid 7 gold and 6 XP with a 6% chest chance — so a
// whole raid's worth of duels felt like nothing happened, and the loot roll effectively never fired: 6% on a
// win means most people cleared several waves and saw not one chest. Roughly doubled, with the chest chance
// tripled so a raid reliably produces a couple.
//
// The per-raid CEILINGS below are what actually guard the economy (DUEL_GOLD_BUDGET / DUEL_XP_BUDGET), so
// raising the per-kill rate makes a raid feel generous without raising what one person can extract from it.
const DUEL_WIN_XP = 14;
const DUEL_WIN_GOLD = 16;
const DUEL_LOSS_GOLD = 5;       // consolation so a loss is never nothing
const DUEL_LOOT_CHANCE = 0.18;  // chance a WIN also drops a low-tier chest
// ── SALVAGE FODDER ── goblins and bandits are the Den's scrap heap. The Forge consumes gear to make parts, but
// every other gear source is slow or one-per-lifetime, so smiths run dry of things to melt. A won duel now has a
// real chance to drop a junk COMMON/RARE piece straight into your bags — worth almost nothing equipped, which is
// exactly the point: it's fuel. Renewable because salvaging destroys the item, making it droppable again.
const DUEL_FODDER_CHANCE = 0.14;    // a won duel drops junk gear this often
const DUEL_FODDER_ELITE_BONUS = 0.16; // + this much when the foe was an elite/chieftain (tougher foe, better scrap)
// The ceiling that actually binds: total duel spoils ONE fighter can take from ONE raid. Past this, foes still
// die and still count for damage, badges and quests — there's just no more loot to farm out of a treadmill.
const DUEL_GOLD_BUDGET = 600;
// Was 700/day. Duels were the single biggest XP source in the game (567 of them in a week) and they're
// grindable on one screen, so the daily ceiling comes down rather than the per-duel payout — a member who
// duels a lot still gets the fun, just not the levels.
const DUEL_XP_BUDGET = 450;
// ── BOSS RAID (the golem) ── everyone strikes a shared HP pool; killing it ends the raid. No per-hit rewards —
// only a fat COMPLETION reward to everyone who joined the fight (clearly better than a skirmish raid).
const BOSS_STRIKE_THROTTLE_MS = 2600; // one timing swing per ~2.6s — the bar needs time to sweep

// ── COMBO CHAINS + STRIKE PROCS ──────────────────────────────────────────────────────────────────────────────
// The timing bar is one axis: how close to centre. That's fine, but it means every swing is an island — the
// tenth good hit feels exactly like the first. Two layers on top, both riding execution you're already doing:
//
//   COMBO   consecutive GOOD-or-better swings stack a multiplier. Break the chain and it resets to 1.
//           Nothing is lost when it breaks — you just stop earning the bonus — which keeps the
//           no-punishment rule while giving a run of clean hits a shape.
//   PROCS   a clean swing can randomly fire something loud. Better grade AND longer combo = better odds,
//           so procs are a payoff for execution rather than a slot machine bolted on the side.
//
// Combo state lives on the hit row (`combo`), not in memory, so it survives a refresh and can't be faked by
// a client that just stops sending misses.
const COMBO_STEP = 0.12;          // +12% damage per link
const COMBO_MAX = 2.2;            // hard ceiling on the multiplier
const COMBO_MIN_GRADE = "good";   // this grade or better keeps the chain alive
// Procs, rarest first — the first one that hits wins. `base` is the chance at combo 1 on a PERFECT swing;
// a longer chain scales it up, a merely-good swing scales it down.
const STRIKE_PROCS = [
    { key: "shatter", base: 0.010, mult: 4.0, label: "💥 SHATTERED THE PLATING!", tell: "Its armour cracks wide open." },
    { key: "quake", base: 0.022, mult: 2.6, label: "🌋 GROUND QUAKE!", tell: "The whole plaza shakes." },
    { key: "sunder", base: 0.045, mult: 1.9, label: "⚡ SUNDERING BLOW!", tell: "You find the seam." },
    { key: "rally", base: 0.070, mult: 1.45, label: "🐺 THE PACK RALLIES!", tell: "The wolves howl with you." },
];
const GRADE_RANK = { miss: 0, good: 1, great: 2, perfect: 3, pixel: 4 };
// A perfect swing on a long chain is where the good stuff lives.
function rollStrikeProc(gradeKey, combo) {
    const rank = GRADE_RANK[gradeKey] ?? 0;
    if (rank < 2) return null;                       // great or better only
    const gradeScale = rank >= 4 ? 1.8 : rank >= 3 ? 1.25 : 0.6;
    const comboScale = 1 + Math.min(9, Math.max(0, combo - 1)) * 0.22;
    for (const p of STRIKE_PROCS) {
        if (Math.random() < p.base * gradeScale * comboScale) return p;
    }
    return null;
}

// ── RAID_TUNING ──────────────────────────────────────────────────────────────────────────────────────────────
// Target: 5-10 people kill the golem in 5-10 minutes, EITHER by playing the timing game or by passive DPS
// alone. Measured base hit power is ~153 per swing (from the first real golem kill: 5 fighters, 250k, 13.9 min).
//
//   Passive only — nobody touching the minigame, HP 260k, rate 0.6:
//      5 present → 260k / (5 x 153 x 0.6)  = ~9.4 min
//     10 present → 260k / (10 x 153 x 0.6) = ~4.7 min
//   Everyone timing well on top (avg "great" x2.6, one swing per 2.6s ⇒ +153/sec each):
//      5 present → ~4.0 min      10 present → ~2.0 min
//
// So presence alone lands in the asked-for window, and skill is the accelerator rather than the requirement.
// Duration is 20 min, so a thin turnout can still fail. Retune HP, the rate and this note TOGETHER — the
// numbers above are the only record of why these values are what they are.
const PASSIVE_RATE_PER_SEC = 0.6;    // multiplier on the member's own hit power, per second in the square
const PASSIVE_MAX_CATCHUP_S = 30;    // never credit more than this from one poll gap (tab left open, etc.)
// Timing grades, mirroring the Forge's bands so the feel is familiar. Server-authoritative: the client sends
// its distance-from-centre, we grade it here and clamp, so a tampered client can't claim PERFECT every time.
const STRIKE_GRADES = [
    { key: "pixel", max: 0.022, mult: 5.0, label: "PIXEL PERFECT" },
    { key: "perfect", max: 0.055, mult: 3.6, label: "PERFECT" },
    { key: "great", max: 0.10, mult: 2.6, label: "GREAT" },
    { key: "good", max: 0.16, mult: 1.6, label: "GOOD" },
];
const STRIKE_MISS = { key: "miss", mult: 0.5, label: "GLANCING" };
const gradeForDist = (dist) => STRIKE_GRADES.find((g) => dist <= g.max) || STRIKE_MISS;
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
    // A plaza-fighter companion boosts TOWN raids only — deliberately not the weekly boss, so a rally pet is a
    // real choice rather than a strictly-better damage pet. getPetCombatBonus is already loaded above.
    dmg *= 1 + Math.min(0.5, (pet?.system?.town_rally || 0) / 100);
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
    const isSiege = Boolean(ev.meta?.siege);
    // PRESENCE = DAMAGE. This runs on the member's own town poll, which is exactly the proof that they're stood
    // in the square, so passive DPS accrues here rather than on a cron. It can finish the boss off, in which
    // case the raid is over and there's nothing left to report.
    if (buyerId && isSiege) {
        const passive = await accrueSquarePassive(buyerId, { id: ev.id, siege: true }).catch(() => null);
        if (passive) {
            if (passive.hp <= 0) return null;
            ev = { ...ev, hp: passive.hp };
        }
    }
    // THE SHARED SWARM. Skirmishes now use a server-side roster so every client draws the same foes in the same
    // places and can see who is locked onto each one. Wave 1 is spawned lazily on first read, so an event created
    // before this existed still gets a roster.
    let swarm = null;
    if (!isBoss) {
        swarm = await swarmState(ev.id, buyerId, ev.kind).catch(() => null);
        if (!swarm || swarm.remaining === 0) {
            const fighters = await liveFighterCount(ev.id).catch(() => 1);
            const nextWave = swarm?.wave ? Math.min(CHIEFTAIN_WAVE, swarm.wave + 1) : 1;
            await spawnWave(ev.id, nextWave, fighters).catch(() => {});
            swarm = await swarmState(ev.id, buyerId, ev.kind).catch(() => null);
        }
    }
    const enemies = Number(ev.meta?.enemies) || 6;
    const [mine, top, count] = await Promise.all([
        buyerId ? db.queryOne(`SELECT damage, hits, passive_damage FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [ev.id, buyerId]).catch(() => null) : Promise.resolve(null),
        db.query(`SELECT h.buyer_id, h.damage, b.display_name, b.alias FROM mkt_town_event_hit h JOIN mkt_buyer b ON b.id = h.buyer_id WHERE h.event_id = $1 ORDER BY h.damage DESC LIMIT 5`, [ev.id]).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_town_event_hit WHERE event_id = $1`, [ev.id]).catch(() => ({ n: 0 })),
    ]);
    // Who is ACTUALLY swinging right now (struck in the last 90s). Needed for EVERY raid, not just the boss:
    // the plaza uses it to show a skirmish fighter as "fighting" rather than defaulting them to "around town",
    // which made people standing shoulder to shoulder in the same fight look like they weren't there.
    const fr = await db.query(
        `SELECT h.buyer_id, h.damage, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip
           FROM mkt_town_event_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
          WHERE h.event_id = $1 AND h.last_hit_at > NOW() - INTERVAL '90 seconds'
          ORDER BY h.damage DESC LIMIT 14`, [ev.id]
    ).catch(() => []);
    const activeFighters = fr.map((r) => ({ id: r.buyer_id, name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"), sprite: r.avatar_sprite_url || null, flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false, damage: Number(r.damage) || 0 }));
    const bossFighters = isBoss ? activeFighters : [];
    return {
        id: Number(ev.id), kind: ev.kind, name: ev.name, emoji: type.emoji || "⚔️", boss: isBoss, siege: isSiege,
        hp: ev.hp, hpMax: ev.hp_max, endsAt: ev.ends_at, startedAt: ev.started_at, rewardGold: ev.reward_gold,
        enemies, enemiesLeft: ev.hp <= 0 ? 0 : Math.max(1, Math.ceil((ev.hp / ev.hp_max) * enemies)),
        hpPct: ev.hp_max ? Math.max(0, Math.round((ev.hp / ev.hp_max) * 100)) : 0,
        wave: Number(ev.meta?.wave) || 1, minMs: Number(ev.meta?.minMs) || MIN_ACTIVE_MS,
        myDamage: mine?.damage || 0, myHits: mine?.hits || 0, myPassive: mine?.passive_damage || 0,
        fighterCount: count?.n || 0,
        fighters: (top || []).map((t) => ({ name: t.display_name || (t.alias ? `@${t.alias}` : "Wolf"), damage: t.damage })),
        bossFighters,
        // Everyone swinging right now, boss or skirmish — the plaza reads this to label them as fighting.
        activeFighterIds: activeFighters.map((f) => String(f.id)),
        swarm, // shared foe roster (skirmishes only): positions, per-foe HP, and who's locked onto each
        totalWaves: swarm?.totalWaves ?? null,
    };
}

// ── END-OF-RAID RECAP ────────────────────────────────────────────────────────────────────────────────────────
// The itemised wrap-up for the most recently finished raid: who fought, what each of them dealt, and exactly
// what YOU walked away with. Previously the recap was assembled client-side from strike responses and skipped
// entirely on a boss kill, so anyone who didn't land the final blow saw nothing at all — no damage, no rewards.
export async function lastRaidRecap(buyerId) {
    if (!buyerId) return null;
    const ev = await db.queryOne(
        `SELECT id, kind, name, status, hp_max, defeated_at, meta
           FROM mkt_town_event
          WHERE status <> 'active' AND defeated_at > NOW() - INTERVAL '10 minutes'
            AND COALESCE(meta->>'silent','false') <> 'true'
          ORDER BY defeated_at DESC LIMIT 1`
    ).catch(() => null);
    if (!ev) return null;

    // Only show it to people who actually took part — otherwise a passer-by gets a recap for a fight they
    // never joined.
    const mine = await db.queryOne(
        `SELECT damage, hits, passive_damage, reward_gold, reward_xp, reward_chest, rewarded
           FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`,
        [ev.id, buyerId]
    ).catch(() => null);
    if (!mine) return null;

    // WAIT FOR THE PAYOUT before showing anyone anything. resolveTownEvent flips the event to `defeated`
    // FIRST and only then walks the fighters granting gold, XP, chests, badges and pet rolls — dozens of
    // awaits. This recap becomes visible the instant that status flips, so a poll landing mid-payout returned
    // a recap with reward_gold = 0, and the client caches the first recap it sees for an event forever. Result:
    // a felled Treasure Golem showed a full damage board and "No payout on this one" — permanently — to people
    // who had in fact each been paid 900 gold, 800 XP and a gold chest.
    //
    // Returning null here just means the client asks again a second later, by which point it's settled.
    if (!mine.rewarded) return null;

    const board = await db.query(
        `SELECT h.buyer_id, h.damage, h.hits, h.passive_damage,
                COALESCE(NULLIF(b.display_name,''), b.alias, 'Wolf') AS name,
                b.avatar_sprite_url, b.avatar_sprite_flip
           FROM mkt_town_event_hit h LEFT JOIN mkt_buyer b ON b.id = h.buyer_id
          WHERE h.event_id = $1 ORDER BY h.damage DESC LIMIT 12`,
        [ev.id]
    ).catch(() => []);

    const total = board.reduce((s, r) => s + (Number(r.damage) || 0), 0);
    const myRank = board.findIndex((r) => String(r.buyer_id) === String(buyerId)) + 1;
    const type = TOWN_EVENT_TYPES[ev.kind] || {};

    return {
        eventId: Number(ev.id),
        name: ev.name,
        emoji: type.emoji || "⚔️",
        killed: ev.status === "defeated",
        fighters: board.length,
        totalDamage: total,
        me: {
            damage: Number(mine.damage) || 0,
            hits: Number(mine.hits) || 0,
            passive: Number(mine.passive_damage) || 0,
            rank: myRank || null,
            share: total ? Math.round(((Number(mine.damage) || 0) / total) * 100) : 0,
            gold: Number(mine.reward_gold) || 0,
            xp: Number(mine.reward_xp) || 0,
            chest: mine.reward_chest || null,
            rewarded: Boolean(mine.rewarded),
        },
        board: board.map((r, i) => ({
            rank: i + 1,
            name: r.name,
            damage: Number(r.damage) || 0,
            hits: Number(r.hits) || 0,
            passive: Number(r.passive_damage) || 0,
            sprite: r.avatar_sprite_url || null,
            flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
            isYou: String(r.buyer_id) === String(buyerId),
        })),
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
        // `siege` must be stamped here — siegeTick reads it off meta to decide whether an event accrues passive
        // damage, so a missing flag would silently mean no siege ever ticks.
        [kind, type.name, spawnHp, type.rewardGold, String(type.durationMin), JSON.stringify({ silent: Boolean(silent), boss: Boolean(type.boss), siege: Boolean(type.siege), enemies: type.enemies || 6, minMs: silent ? MIN_ACTIVE_SILENT_MS : MIN_ACTIVE_MS, wave: 1 })]
    ).catch(() => null);
    if (!row) return { ok: false, error: "spawn_failed" };
    // Rally the whole pack — browser push + phone-app push, both deep-linking to the Town. These MUST be
    // awaited: on Vercel the handler's response freezes the instance, so a fire-and-forget push is killed
    // mid-flight and nobody ever hears about the raid. The send counts ride back out so the cron response
    // (and the owner's spawn button) actually shows whether anyone was reached.
    let push = null;
    if (!silent) {
        const [web, app] = await Promise.all([
            broadcastWebPush({ kind: "raid", title: type.pushTitle, body: type.pushBody, url: "/marketplace/town", tag: "town-event", data: { type: "town_event" } }).catch((e) => ({ error: String(e?.message || e) })),
            broadcastBuyerPushAll({ title: type.pushTitle, body: type.pushBody, route: "town", data: { type: "town_event" } }).catch((e) => ({ error: String(e?.message || e) })),
        ]);
        push = { web, app };
        // Stamp the reach onto the event so the admin Raids screen can show whether anyone was actually told,
        // instead of leaving it to be inferred from turnout.
        await db.query(`UPDATE mkt_town_event SET meta = meta || $2::jsonb WHERE id = $1`,
            [row.id, JSON.stringify({ pushWeb: Number(web?.sent) || 0, pushApp: Number(app?.sent) || 0 })]).catch(() => {});
    }
    return { ok: true, id: Number(row.id), name: type.name, silent: Boolean(silent), push };
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
    return { spawned: res.ok ? kind : null, push: res.push || null, error: res.error || null };
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
    return { spawned: res.ok ? kind : null, hour: h, chance, push: res.push || null, error: res.error || null };
}

// Land an attack on the raid. `move` is the timed-strike tier (weak/normal/good/perfect) or "power" (ability).
// Throttled per member; clearing a wave sends reinforcements — or wins the raid once the minimum time has passed.
export async function attackTownEvent(buyerId, eventId, move = "normal") {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // This runs on EVERY strike — with a 2.6s cooldown and a full raid that's hundreds a minute — and it used
    // to make five round-trips in a row. The first three are independent: the event row, this member's hit row,
    // and the damage calculation (computeRaidHit is read-only, so computing it before the throttle check is
    // free — a throttled strike just discards a number it would have waited for anyway).
    const [ev, prior, hit] = await Promise.all([
        db.queryOne(`SELECT id, hp, hp_max, started_at, meta FROM mkt_town_event WHERE id = $1 AND status = 'active'`, [eventId]).catch(() => null),
        db.queryOne(`SELECT last_hit_at, combo FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [eventId, buyerId]).catch(() => null),
        computeRaidHit(buyerId),
    ]);
    if (!ev) return { ok: false, error: "no_event" };
    if (prior?.last_hit_at && Date.now() - new Date(prior.last_hit_at).getTime() < HIT_THROTTLE_MS) {
        return { ok: false, error: "too_fast", hp: ev.hp };
    }
    const dmg = hit.damage;
    // Both writes need dmg but not each other — different tables, no ordering between them.
    const [updated, mine] = await Promise.all([
        db.queryOne(`UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`, [eventId, dmg]).catch(() => null),
        db.queryOne(
            `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_hit_at) VALUES ($1, $2, $3, 1, NOW())
             ON CONFLICT (event_id, buyer_id) DO UPDATE SET damage = mkt_town_event_hit.damage + $3, hits = mkt_town_event_hit.hits + 1, last_hit_at = NOW()
             RETURNING damage, hits`,
            [eventId, buyerId, dmg]
        ).catch(() => null),
    ]);
    bumpTownQuest(buyerId, "rally", 1).catch(() => {});
    // Plaza skirmishes turn up recipes looted off the swarm.
    try {
        const { tryRecipeDrop } = await import("@/lib/marketplace/cooking.js");
        await tryRecipeDrop(buyerId, "town_raid");
    } catch { /* a recipe is a bonus; never let it fail the action */ }
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
            // Record WHAT they got, not just the gold — the end-of-raid recap itemises this, and without the xp
            // and chest stored there's nothing to show anyone who didn't land the killing blow.
            await db.query(
                `UPDATE mkt_town_event_hit SET rewarded = TRUE, reward_gold = $3, reward_xp = $4, reward_chest = $5
                  WHERE event_id = $1 AND buyer_id = $2`,
                [eventId, h.buyer_id, gold, xp, killed ? "gold" : "wooden"]
            ).catch(() => {});
            // Hard raid/boss badges + the very-rare raid-exclusive pet drop (best odds on a kill).
            await checkTownRaidBadges(h.buyer_id, { topDamagerOnKill: killed && h.buyer_id === topId }).catch(() => {});
            await maybeGrantRaidPet(h.buyer_id, { boss: true, killed }).catch(() => {});
        }
        if (!ev.meta?.silent) {
            // Awaited — see spawnTownEvent: an un-awaited push dies with the serverless instance.
            await broadcastWebPush({ kind: "raid", title: killed ? `🏆 ${ev.name} FELLED!` : `💨 ${ev.name} escaped`, body: killed ? `The pack brought it down — ${n} ${n === 1 ? "wolf" : "wolves"} share the spoils!` : "It slipped away, but everyone who fought earned a share.", url: "/marketplace/town", tag: "town-event", data: { type: "town_event_end" } }).catch(() => {});
        }
        return;
    }
    // Skirmish raid over. Per-duel spoils were already paid as they fought; the COMPLETION bonus now scales with
    // how far the pack actually pushed, so clearing waves is worth something and a raid that stalled in wave 1
    // doesn't pay like a Chieftain kill. Waves cleared is the honest measure of the fight.
    const clearedWaves = await db.queryOne(
        `SELECT COALESCE(MAX(wave), 0)::int AS w FROM mkt_town_enemy
          WHERE event_id = $1 AND died_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM mkt_town_enemy o WHERE o.event_id = $1 AND o.wave = mkt_town_enemy.wave AND o.died_at IS NULL)`,
        [eventId]
    ).catch(() => null);
    const waves = Number(clearedWaves?.w || 0);
    const chieftainDown = waves >= CHIEFTAIN_WAVE;
    // 0 waves → participation only; each wave adds a slice; the Chieftain pays the full purse.
    const progress = chieftainDown ? 1 : Math.min(1, waves / CHIEFTAIN_WAVE);
    const compGold = Math.round(RAID_MAX_GOLD * progress);
    const compXp = Math.round(RAID_PARTICIPATION_XP * (0.35 + 0.65 * progress)); // showing up is always worth XP

    for (const h of hits) {
        if (compGold > 0) {
            const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [h.buyer_id, compGold]).catch(() => null);
            await logCoin(h.buyer_id, compGold, "raid_complete", { balanceAfter: paid?.gold, ref: String(eventId), meta: { waves, chieftainDown } }).catch(() => {});
        }
        if (compXp > 0) await awardXp(h.buyer_id, "raid_complete", { points: compXp, gold: 0, dedupeKey: `raid_complete:${eventId}:${h.buyer_id}` }).catch(() => {});
        await db.query(
            `UPDATE mkt_town_event_hit SET rewarded = TRUE, reward_gold = COALESCE(reward_gold,0) + $3, reward_xp = COALESCE(reward_xp,0) + $4
              WHERE event_id = $1 AND buyer_id = $2`,
            [eventId, h.buyer_id, compGold, compXp]
        ).catch(() => {});
        await checkTownRaidBadges(h.buyer_id).catch(() => {});
        // A Chieftain kill is the real achievement, so it carries the better pet odds.
        await maybeGrantRaidPet(h.buyer_id, { boss: chieftainDown, killed: chieftainDown }).catch(() => {});
    }
    if (!ev.meta?.silent) {
        // Awaited — see spawnTownEvent: an un-awaited push dies with the serverless instance.
        const body = chieftainDown
            ? `The Chieftain is down! ${n} ${n === 1 ? "wolf" : "wolves"} share the full purse.`
            : `Pushed to wave ${waves} of ${CHIEFTAIN_WAVE} — ${n} ${n === 1 ? "wolf" : "wolves"} share the spoils.`;
        await broadcastWebPush({ kind: "raid", title: chieftainDown ? `🏆 ${ev.name} broken!` : `✅ ${ev.name} over`, body, url: "/marketplace/town", tag: "town-event", data: { type: "town_event_end" } }).catch(() => {});
    }
}

// ── PASSIVE DPS FOR BEING IN THE SQUARE ──────────────────────────────────────────────────────────────────────
// Standing in the plaza during a boss raid chips away on its own, so nobody has to grind taps to take part.
// Driven by the member's own town poll rather than a cron: the poll IS the proof they're present, and a 15-min
// cron is far too coarse for a fight meant to last 5-10 minutes.
//
// Rate scales off their real hit power, so gear and pets matter here exactly as they do when swinging.
export async function accrueSquarePassive(buyerId, event) {
    if (!buyerId || !event?.id || !event?.siege) return null;
    // First poll of this raid just starts their clock — otherwise they'd be credited for time before arriving.
    const row = await db.queryOne(
        `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_passive_at) VALUES ($1, $2, 0, 0, NOW())
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET last_passive_at = COALESCE(mkt_town_event_hit.last_passive_at, NOW())
         RETURNING EXTRACT(EPOCH FROM (NOW() - last_passive_at))::float AS secs`,
        [Number(event.id), buyerId]
    ).catch(() => null);
    const secs = Math.min(PASSIVE_MAX_CATCHUP_S, Math.max(0, Number(row?.secs) || 0));
    if (secs < 1) return null;

    const hit = await computeRaidHit(buyerId).catch(() => null);
    const dmg = Math.max(1, Math.round((hit?.damage || 1) * PASSIVE_RATE_PER_SEC * secs));

    const updated = await db.queryOne(
        `UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp, hp_max`,
        [Number(event.id), dmg]
    ).catch(() => null);
    if (!updated) return null;

    await db.query(
        `UPDATE mkt_town_event_hit
            SET damage = damage + $3, passive_damage = passive_damage + $3, last_passive_at = NOW()
          WHERE event_id = $1 AND buyer_id = $2`,
        [Number(event.id), buyerId, dmg]
    ).catch(() => {});

    const hp = Number(updated.hp);
    if (hp <= 0) await resolveTownEvent(Number(event.id), "defeated").catch(() => {});
    return { passive: dmg, hp, hpMax: Number(updated.hp_max) };
}

// Strike the BOSS RAID (the golem): everyone hits ONE shared HP pool. No per-hit reward — killing it ends the raid
// and pays the completion reward (resolveTownEvent). Returns the boss's new HP + your running damage.
export async function bossRaidStrike(buyerId, eventId, dist = null) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const ev = await db.queryOne(`SELECT id, hp, hp_max, meta FROM mkt_town_event WHERE id = $1 AND status = 'active'`, [eventId]).catch(() => null);
    if (!ev || !ev.meta?.boss) return { ok: false, error: "no_boss" };
    const prior = await db.queryOne(`SELECT last_hit_at, combo FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [eventId, buyerId]).catch(() => null);
    if (prior?.last_hit_at && Date.now() - new Date(prior.last_hit_at).getTime() < BOSS_STRIKE_THROTTLE_MS) return { ok: false, error: "too_fast", hp: ev.hp };
    const hit = await computeRaidHit(buyerId);
    // Grade the swing HERE from the raw distance-from-centre the client reports. Grading server-side (and
    // clamping the distance) means a tampered client can't simply claim PIXEL PERFECT on every swing.
    const grade = gradeForDist(Math.min(0.5, Math.max(0, Number(dist))) || 0.5);

    // COMBO. A good-or-better swing extends the chain; anything worse resets it to 1. Read from the row so it
    // survives a refresh and a client can't hold a chain open by simply never reporting its misses.
    const kept = (GRADE_RANK[grade.key] ?? 0) >= GRADE_RANK[COMBO_MIN_GRADE];
    const priorCombo = Math.max(0, Number(prior?.combo) || 0);
    const combo = kept ? priorCombo + 1 : 0;
    const comboMult = Math.min(COMBO_MAX, 1 + Math.max(0, combo - 1) * COMBO_STEP);

    // PROC. Rolled off the grade AND the chain, so it's a reward for a run of clean hits rather than a lottery.
    const proc = kept ? rollStrikeProc(grade.key, combo) : null;

    const dmg = Math.max(1, Math.round(hit.damage * grade.mult * comboMult * (proc?.mult || 1)));
    const updated = await db.queryOne(`UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`, [eventId, dmg]).catch(() => null);
    const mine = await db.queryOne(
        `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, combo, last_hit_at) VALUES ($1, $2, $3, 1, $4, NOW())
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET damage = mkt_town_event_hit.damage + $3, hits = mkt_town_event_hit.hits + 1, combo = $4, last_hit_at = NOW()
         RETURNING damage, hits`,
        [eventId, buyerId, dmg, combo]
    ).catch(() => null);
    bumpTownQuest(buyerId, "rally", 1).catch(() => {});
    const hp = updated?.hp ?? ev.hp;
    let killed = false;
    if (hp <= 0) { await resolveTownEvent(eventId, "defeated").catch(() => {}); killed = true; }
    return {
        ok: true, damage: dmg, crit: Boolean(hit.crit), proc: hit.proc || null,
        grade: grade.key, gradeLabel: grade.label, mult: grade.mult,
        combo, comboMult: Math.round(comboMult * 100) / 100, comboBroken: !kept && priorCombo >= 3,
        strikeProc: proc ? { key: proc.key, label: proc.label, tell: proc.tell, mult: proc.mult } : null,
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
// enemyId targets a specific foe on the shared roster; the duel claims it, then drops it on a win.
export async function duelRaidEnemy(buyerId, eventId, enemyId = null, dist = null) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // started_at is needed by the XP budget below — XP events carry no raid ref, so "this raid" means "since it
    // started". Without it the window falls back to an hour and bleeds a previous raid's XP into this one's cap.
    const ev = await db.queryOne(`SELECT id, hp, hp_max, meta, kind, name, started_at FROM mkt_town_event WHERE id = $1 AND status = 'active'`, [eventId]).catch(() => null);
    if (!ev) return { ok: false, error: "no_event" };
    const prior = await db.queryOne(`SELECT last_hit_at, combo FROM mkt_town_event_hit WHERE event_id = $1 AND buyer_id = $2`, [eventId, buyerId]).catch(() => null);
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
    // TIMING. Graded server-side from the reported distance-from-centre and clamped, so a tampered client can't
    // claim PIXEL PERFECT every swing. A clean strike roughly doubles your power for the exchange; a glancing one
    // halves it — which is what makes the fight skill rather than a stat roll.
    const grade = dist == null ? { key: null, label: null, mult: 1 } : gradeForDist(Math.min(0.5, Math.max(0, Number(dist))));
    const timingMult = dist == null ? 1 : 0.5 + (grade.mult / STRIKE_GRADES[0].mult) * 1.5; // glancing 0.65x → pixel 2.0x
    myPower *= timingMult;
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
    let cleared = null; // "wave" | "chieftain" | "raid_won" — drives the client's celebration
    if (sim.win) {
        xp = DUEL_WIN_XP + randInt(0, 10);
        coin = DUEL_WIN_GOLD + randInt(0, 14);
        // Low loot chance on a win.
        if (Math.random() < DUEL_LOOT_CHANCE) { await addChests(buyerId, { wooden: 1 }, { source: "town_raid_loot" }).catch(() => {}); loot.push({ kind: "chest", tier: "wooden", label: "Wooden Chest", emoji: "🧰" }); }
        // Kill the REAL foe on the shared roster (claim → strike), so the whole plaza sees the same board change.
        let foeKind = null;
        if (enemyId) {
            const claim = await engageEnemy(buyerId, enemyId).catch(() => null);
            if (claim?.ok) {
                foeKind = claim.kind || null;
                const st = await strikeEnemy(buyerId, enemyId, claim.hpMax).catch(() => null); // a won duel drops it
                if (st?.ok && st.waveCleared) {
                    // Wave down. Next wave, or the chieftain, or — after the chieftain — the raid is WON.
                    if (st.wave >= CHIEFTAIN_WAVE) {
                        await resolveTownEvent(eventId, "defeated").catch(() => {});
                        cleared = "raid_won";
                    } else {
                        const fighters = await liveFighterCount(eventId).catch(() => 1);
                        await spawnWave(eventId, st.wave + 1, fighters).catch(() => {});
                        cleared = st.wave + 1 >= CHIEFTAIN_WAVE ? "chieftain" : "wave";
                        wave = st.wave + 1;
                    }
                }
            }
        }
        // SCRAP. A tougher foe was carrying better junk, so elites and the chieftain drop more often. This is
        // outside the gold/XP ceiling on purpose: the cap exists to stop gold farming, and fodder is the one
        // reward a smith is SUPPOSED to grind for. It self-limits anyway — you can only be dropped gear you
        // don't already own, so the supply is exactly "however much you've melted down".
        const elite = foeKind === "elite" || foeKind === "chieftain";
        if (Math.random() < DUEL_FODDER_CHANCE + (elite ? DUEL_FODDER_ELITE_BONUS : 0)) {
            const junk = await grantSalvageFodder(buyerId, { source: "raid_drop" }).catch(() => null);
            if (junk) loot.push({ kind: "gear", itemId: junk.id, label: junk.name, rarity: junk.rarity, emoji: junk.rarity === "rare" ? "⚙️" : "🔩" });
        }
        // Keep the legacy shared HP bar in step so the raid HUD still reads sensibly.
        const perEnemy = Math.max(1, Math.round((ev.hp_max || 600) / (type.enemies || 6)));
        const upd = await db.queryOne(`UPDATE mkt_town_event SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`, [eventId, perEnemy]).catch(() => null);
        hp = Math.max(0, upd?.hp ?? ev.hp);
    } else {
        coin = DUEL_LOSS_GOLD; // never nothing
    }

    // ── THE PER-RAID CEILING ─────────────────────────────────────────────────────────────────────────────────
    // Clamp to what's left of this fighter's budget for THIS raid, counted from what the ledger says they've
    // already taken. Foes still die, damage still counts, badges and quests still progress — the farm is what
    // stops. Reading the ledger means the cap survives a refresh, a second device, and a server restart.
    const spent = await db.queryOne(
        `SELECT COALESCE(SUM(delta), 0)::int AS gold FROM mkt_coin_event
          WHERE buyer_id = $1 AND reason = 'town_duel' AND ref = $2 AND delta > 0`,
        [buyerId, String(eventId)]
    ).catch(() => null);
    const goldLeft = Math.max(0, DUEL_GOLD_BUDGET - Number(spent?.gold || 0));
    const xpSpent = await db.queryOne(
        `SELECT COALESCE(SUM(points), 0)::int AS xp FROM mkt_xp_event
          WHERE buyer_id = $1 AND action = 'town_duel' AND created_at > $2`,
        [buyerId, ev.started_at || new Date(Date.now() - 3600000)]
    ).catch(() => null);
    const xpLeft = Math.max(0, DUEL_XP_BUDGET - Number(xpSpent?.xp || 0));
    const cappedGold = coin > 0 && goldLeft <= 0;
    const cappedXp = xp > 0 && xpLeft <= 0;
    coin = Math.min(coin, goldLeft);
    xp = Math.min(xp, xpLeft);

    if (coin > 0) {
        const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, coin]).catch(() => null);
        await logCoin(buyerId, coin, "town_duel", { balanceAfter: paid?.gold, ref: String(eventId) }).catch(() => {});
    }
    if (xp > 0) await awardXp(buyerId, "town_duel", { points: xp, gold: 0 }).catch(() => {});

    return {
        ok: true, win: sim.win, events: sim.events, reward: { xp, coin, loot }, firstDuel, hp, wave,
        wins: Number(mine?.hits || 0), foeEmoji: type.emoji || "🗡️", cleared,
        grade: grade.key, gradeLabel: grade.label,
        // Tell the client the spoils are done, so it can say so instead of silently paying zero.
        capped: cappedGold || cappedXp,
    };
}
