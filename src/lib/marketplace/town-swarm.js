import "server-only";

import { db } from "@/lib/db";

// ── THE SHARED SWARM ─────────────────────────────────────────────────────────────────────────────────────────
// A skirmish raid is now a real, finite, SHARED roster of foes: 5 waves, then a chieftain, then it's over.
//
// Why it's built this way — the three complaints it answers:
//   · "I'm fighting my own goblins"  → foes are rows with server-assigned positions, so every client draws the
//     SAME goblins in the same spots, and an engagement claim makes "I'm on that one" visible to everyone.
//   · "it got tedious"               → waves are finite and end in a chieftain. No infinite refill, so there's a
//     goal, an ending, and a reason to push rather than a treadmill to grind.
//   · "too rewarding"               → a bounded number of foes bounds the payout structurally, instead of relying
//     on a cap to fight an endless drip.
//
// Locks are held until the foe DIES (no idle timeout, by design). The one exception is a fighter who actually
// LEAVES: a wave must be cleared to advance, so a stranded claim would make the raid unwinnable. releaseAbandoned
// is that valve and nothing else.

export const WAVES = 5;                 // then the chieftain
export const CHIEFTAIN_WAVE = WAVES + 1;
const BASE_FOES = 4;                    // wave 1 with a lone fighter
const FOES_PER_FIGHTER = 2;             // each extra body on the field adds this many
const MAX_FOES_PER_WAVE = 14;           // keep the plaza readable
const ABANDON_AFTER_S = 45;             // no heartbeat for this long = they've left, free their claim

// Foe archetypes. They differ in what they demand of your gear and timing, so a wave has texture without
// needing more taps: a shieldbearer punishes sloppy timing, an archer dies fast but bites back.
// `tint`, `scale` and `badge` are purely for the client: an archetype that fights differently has to LOOK
// different or the variety is invisible and every foe reads as the same goblin. `hint` is the one-line
// "what this one does to you", shown when you engage it.
const KINDS = {
    scrapper: {
        hp: 26, weight: 60, label: "Goblin Scrapper", emoji: "👺", timingMult: 1.0, bite: 1.0,
        tint: null, scale: 1, badge: null, hint: "A plain brawler — nothing fancy.",
    },
    archer: {
        hp: 18, weight: 22, label: "Goblin Archer", emoji: "🏹", timingMult: 1.0, bite: 1.6,
        tint: "#7ad07a", scale: 0.88, badge: "🏹", hint: "Squishy, but it bites back hard — end it fast.",
    },
    shieldbearer: {
        hp: 44, weight: 15, label: "Shield-bearer", emoji: "🛡️", timingMult: 0.6, bite: 0.8,
        tint: "#54a0e0", scale: 1.14, badge: "🛡️", hint: "Armoured — sloppy timing barely dents it.",
    },
    elite: {
        hp: 70, weight: 3, label: "Goblin Warchanter", emoji: "✨", timingMult: 0.8, bite: 1.4, elite: true,
        tint: "#b98cff", scale: 1.22, badge: "✨", hint: "A Warchanter — rare, tough, and worth real loot.",
    },
    chieftain: {
        hp: 260, weight: 0, label: "Goblin Chieftain", emoji: "💀", timingMult: 0.7, bite: 2.0, chieftain: true,
        tint: "#e05b6a", scale: 1.55, badge: "💀", hint: "The Chieftain. Drop it and the raid is won.",
    },
};
// ── WHO YOU'RE ACTUALLY FIGHTING ─────────────────────────────────────────────────────────────────────────────
// KINDS above is the MECHANICS — hp, timing difficulty, how hard it bites back. That's shared, because a
// shield-bearer should play the same whoever's holding the shield.
//
// The IDENTITY is per faction, and it wasn't: every archetype was hardcoded "Goblin Scrapper", "Goblin Archer",
// "Goblin Chieftain" — so a BANDIT RAID spawned a plaza full of goblins. Two different events, one roster.
const FACTIONS = {
    goblin_swarm: {
        art: "goblin",
        names: {
            scrapper: { label: "Goblin Scrapper", emoji: "👺", hint: "A plain brawler — nothing fancy." },
            archer: { label: "Goblin Archer", emoji: "🏹", hint: "Squishy, but it bites back hard — end it fast." },
            shieldbearer: { label: "Goblin Shield-bearer", emoji: "🛡️", hint: "Armoured — sloppy timing barely dents it." },
            elite: { label: "Goblin Warchanter", emoji: "✨", hint: "A Warchanter — rare, tough, and worth real loot." },
            chieftain: { label: "Goblin Chieftain", emoji: "💀", hint: "The Chieftain. Drop it and the raid is won." },
        },
    },
    bandit_raid: {
        art: "bandit",
        names: {
            scrapper: { label: "Bandit Cutpurse", emoji: "🗡️", hint: "A common thug — nothing fancy." },
            archer: { label: "Bandit Crossbowman", emoji: "🏹", hint: "Squishy, but it bites back hard — end it fast." },
            shieldbearer: { label: "Bandit Bruiser", emoji: "🛡️", hint: "Armoured — sloppy timing barely dents it." },
            elite: { label: "Bandit Lieutenant", emoji: "✨", hint: "A Lieutenant — rare, tough, and worth real loot." },
            chieftain: { label: "Bandit King", emoji: "💀", hint: "The Bandit King. Drop him and the raid is won." },
        },
    },
};
export const factionOf = (eventKind) => FACTIONS[eventKind] || FACTIONS.goblin_swarm;

/**
 * Mechanics for an archetype, dressed in a faction's identity. `eventKind` is the TOWN EVENT kind
 * (bandit_raid / goblin_swarm) — omit it and you get the goblin naming, which is what every caller used to
 * get whether or not there was a goblin in sight.
 */
export const enemyKind = (k, eventKind = null) => {
    const base = KINDS[k] || KINDS.scrapper;
    const named = factionOf(eventKind).names[k in KINDS ? k : "scrapper"];
    return named ? { ...base, ...named, art: factionOf(eventKind).art } : base;
};

const rand = (a, b) => a + Math.random() * (b - a);
function pickKind(wave) {
    // Later waves get meaner: elites and shieldbearers become likelier as the raid escalates.
    const pool = [];
    for (const [key, def] of Object.entries(KINDS)) {
        if (def.chieftain) continue;
        let w = def.weight;
        if (def.elite) w += wave * 2;              // elites creep in
        if (key === "shieldbearer") w += wave;     // so do the tanky ones
        if (key === "scrapper") w = Math.max(10, w - wave * 6); // fewer plain ones late on
        for (let i = 0; i < w; i += 1) pool.push(key);
    }
    return pool[Math.floor(Math.random() * pool.length)] || "scrapper";
}

// How many foes a wave should hold, given how many people are actually swinging.
export function waveSize(wave, fighters) {
    const n = BASE_FOES + Math.max(0, fighters - 1) * FOES_PER_FIGHTER + Math.floor(wave * 0.8);
    return Math.min(MAX_FOES_PER_WAVE, Math.max(3, n));
}

// Spawn one wave. Idempotent via the (event_id, wave, slot) unique index, so a double tap or a racing cron can't
// double-populate a wave.
export async function spawnWave(eventId, wave, fighters = 1) {
    if (wave === CHIEFTAIN_WAVE) {
        const d = KINDS.chieftain;
        await db.query(
            `INSERT INTO mkt_town_enemy (event_id, wave, slot, kind, hp, hp_max, x, y, flip)
             VALUES ($1, $2, 0, 'chieftain', $3, $3, 50, 74, FALSE) ON CONFLICT DO NOTHING`,
            [eventId, wave, d.hp]
        ).catch(() => {});
        return { wave, spawned: 1, chieftain: true };
    }
    const n = waveSize(wave, fighters);
    const rows = [];
    for (let slot = 0; slot < n; slot += 1) {
        const kind = pickKind(wave);
        const def = enemyKind(kind);
        const hp = Math.round(def.hp * (1 + (wave - 1) * 0.12)); // a little tougher each wave
        // Spread them across the plaza deterministically-ish, jittered so a wave never looks like a grid.
        const x = Math.round((8 + (84 * (slot + 0.5)) / n + rand(-3, 3)) * 10) / 10;
        const y = Math.round(rand(70, 82) * 10) / 10;
        rows.push({ slot, kind, hp, x, y, flip: Math.random() < 0.5 });
    }
    for (const r of rows) {
        await db.query(
            `INSERT INTO mkt_town_enemy (event_id, wave, slot, kind, hp, hp_max, x, y, flip)
             VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
            [eventId, wave, r.slot, r.kind, r.hp, r.x, r.y, r.flip]
        ).catch(() => {});
    }
    return { wave, spawned: rows.length, chieftain: false };
}

// Free claims held by anyone who has actually left the fight. NOT an idle timeout — a lock is held until the foe
// dies while you're present. This exists purely so a closed tab can't strand a foe and make a wave unclearable.
export async function releaseAbandoned(eventId) {
    const r = await db.query(
        `UPDATE mkt_town_enemy e
            SET engaged_by = NULL, engaged_at = NULL
          WHERE e.event_id = $1 AND e.died_at IS NULL AND e.engaged_by IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM mkt_town_presence p
                 WHERE p.buyer_id = e.engaged_by
                   AND p.town_seen_at > NOW() - INTERVAL '${ABANDON_AFTER_S} seconds'
            )
          RETURNING id`,
        [eventId]
    ).catch(() => []);
    return r.length;
}

// The shared board: every foe still standing, plus who's locked onto each one.
export async function swarmState(eventId, viewerId = null, eventKind = null) {
    await releaseAbandoned(eventId);
    const rows = await db.query(
        `SELECT e.id, e.wave, e.slot, e.kind, e.hp, e.hp_max, e.x, e.y, e.flip, e.engaged_by,
                COALESCE(NULLIF(b.display_name,''), b.alias) AS engaged_name,
                b.avatar_sprite_url AS engaged_sprite
           FROM mkt_town_enemy e LEFT JOIN mkt_buyer b ON b.id = e.engaged_by
          WHERE e.event_id = $1 AND e.died_at IS NULL
          ORDER BY e.wave ASC, e.slot ASC`,
        [eventId]
    ).catch(() => []);
    const wave = rows.length ? Math.min(...rows.map((r) => Number(r.wave))) : null;
    const alive = rows.filter((r) => Number(r.wave) === wave);
    return {
        wave,
        totalWaves: WAVES,
        chieftainWave: CHIEFTAIN_WAVE,
        isChieftainWave: wave === CHIEFTAIN_WAVE,
        remaining: alive.length,
        enemies: alive.map((r) => {
            const def = enemyKind(r.kind, eventKind);
            const mine = viewerId && String(r.engaged_by || "") === String(viewerId);
            return {
                id: Number(r.id), kind: r.kind, label: def.label, emoji: def.emoji, art: def.art || null,
                tint: def.tint || null, scale: def.scale ?? 1, badge: def.badge || null, hint: def.hint || null,
                hp: Number(r.hp), hpMax: Number(r.hp_max), hpPct: Math.max(0, Math.round((r.hp / r.hp_max) * 100)),
                x: Number(r.x), y: Number(r.y), flip: r.flip === true,
                elite: Boolean(def.elite), chieftain: Boolean(def.chieftain),
                engagedBy: r.engaged_by ? String(r.engaged_by) : null,
                engagedName: r.engaged_by ? (r.engaged_name || "A wolf") : null,
                engagedSprite: r.engaged_sprite || null,
                mine: Boolean(mine),
                // Free to take, or already yours. Drives whether the client offers it at all.
                takeable: !r.engaged_by || Boolean(mine),
            };
        }),
    };
}

// Claim a foe. Atomic: the guarded WHERE means two people tapping the same goblin at once can't both win it.
export async function engageEnemy(buyerId, enemyId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const got = await db.queryOne(
        `UPDATE mkt_town_enemy SET engaged_by = $2, engaged_at = NOW()
          WHERE id = $1 AND died_at IS NULL AND (engaged_by IS NULL OR engaged_by = $2)
          RETURNING id, event_id, kind, hp, hp_max`,
        [Number(enemyId), buyerId]
    ).catch(() => null);
    if (!got) {
        // Either it died or somebody else already has it — say which, so the UI can be honest.
        const cur = await db.queryOne(
            `SELECT died_at IS NOT NULL AS dead, COALESCE(NULLIF(b.display_name,''), b.alias) AS who
               FROM mkt_town_enemy e LEFT JOIN mkt_buyer b ON b.id = e.engaged_by WHERE e.id = $1`,
            [Number(enemyId)]
        ).catch(() => null);
        return { ok: false, error: cur?.dead ? "already_dead" : "taken", who: cur?.who || null };
    }
    return { ok: true, enemyId: Number(got.id), kind: got.kind, hp: Number(got.hp), hpMax: Number(got.hp_max) };
}

// Damage the foe you hold. Returns whether it died, and whether that cleared the wave.
export async function strikeEnemy(buyerId, enemyId, damage) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const dmg = Math.max(1, Math.round(Number(damage) || 1));
    // Only the holder can hit it — enforced in the WHERE so it can't be raced or spoofed.
    const hit = await db.queryOne(
        `UPDATE mkt_town_enemy SET hp = GREATEST(0, hp - $3)
          WHERE id = $1 AND died_at IS NULL AND engaged_by = $2
          RETURNING id, event_id, wave, kind, hp, hp_max`,
        [Number(enemyId), buyerId, dmg]
    ).catch(() => null);
    if (!hit) return { ok: false, error: "not_yours" };

    const killed = Number(hit.hp) <= 0;
    if (killed) {
        await db.query(`UPDATE mkt_town_enemy SET died_at = NOW(), killed_by = $2 WHERE id = $1 AND died_at IS NULL`, [hit.id, buyerId]).catch(() => {});
    }
    const left = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_town_enemy WHERE event_id = $1 AND wave = $2 AND died_at IS NULL`,
        [hit.event_id, hit.wave]
    ).catch(() => null);
    return {
        ok: true, damage: dmg, killed,
        enemyId: Number(hit.id), kind: hit.kind, hp: Number(hit.hp), hpMax: Number(hit.hp_max),
        waveRemaining: Number(left?.n ?? 0),
        waveCleared: killed && Number(left?.n ?? 0) === 0,
        wave: Number(hit.wave),
    };
}

// How many distinct people have swung at this raid recently — sizes the next wave to the crowd present.
export async function liveFighterCount(eventId) {
    const r = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_town_event_hit
          WHERE event_id = $1 AND last_hit_at > NOW() - INTERVAL '3 minutes'`,
        [eventId]
    ).catch(() => null);
    return Math.max(1, Number(r?.n || 1));
}
