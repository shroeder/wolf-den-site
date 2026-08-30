import "server-only";

import { db } from "@/lib/db";
import { ARCHETYPES, npcPower } from "@/lib/marketplace/arena-npc.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

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
// ── ENOUGH FOES TO GO ROUND ──────────────────────────────────────────────────────────────────────────────────
// Luke: "everyone's kind of fighting over enemies right now." The ceiling was the cause, not the per-fighter
// rate: at 2 a head the wave hit the old cap of 14 with SIX people on the field, so the seventh through
// twelfth fighters added nothing at all and the whole plaza queued for the same bodies.
//
//   6 fighters   14 foes -> 20        8 fighters   14 -> 24        12 fighters   14 -> 24
//
// The cap still exists because the plaza has to stay readable — it just now sits above the crowd that actually
// turns up rather than below it.
const BASE_FOES = 5;                    // wave 1 with a lone fighter
const FOES_PER_FIGHTER = 3;             // each extra body on the field adds this many
const MAX_FOES_PER_WAVE = 24;           // keep the plaza readable — but not below a real turnout
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
    frost_pack: {
        art: "frost",
        names: {
            scrapper: { label: "Frost Whelp", emoji: "🐺", hint: "Quick and thin. It dies fast and so might you." },
            archer: { label: "Ice-Spitter", emoji: "❄️", hint: "Hits from range and does not stand still." },
            shieldbearer: { label: "Rimehide", emoji: "🧊", hint: "The only thing here wearing armour." },
            elite: { label: "Pack Alpha", emoji: "🌨️", hint: "It leads them, and it is faster than all of them." },
            chieftain: { label: "The Winter Wolf", emoji: "💠", hint: "Put it down and the pack breaks." },
        },
    },
    drowned_crew: {
        art: "drowned",
        names: {
            scrapper: { label: "Drowned Deckhand", emoji: "🌊", hint: "Slow, waterlogged, and it does not stop." },
            archer: { label: "Harpooner", emoji: "🔱", hint: "Reaches further than it looks like it should." },
            shieldbearer: { label: "Barnacled Hull", emoji: "🐚", hint: "Nothing you swing gets through this." },
            elite: { label: "The Bosun", emoji: "⚓", hint: "It still thinks it is running a deck." },
            chieftain: { label: "Captain Grine", emoji: "☠️", hint: "Whatever went down with the ship came back up." },
        },
    },
    hollow_court: {
        art: "hollow",
        names: {
            scrapper: { label: "Candle-Bearer", emoji: "🕯️", hint: "A servant of the court. Barely there." },
            archer: { label: "The Whisperer", emoji: "🌫️", hint: "It casts from the back and it does not miss much." },
            shieldbearer: { label: "The Sealed Knight", emoji: "⚔️", hint: "Empty armour, and it holds the line." },
            elite: { label: "Court Magister", emoji: "🔮", hint: "Real spells, and it knows your element." },
            chieftain: { label: "The Hollow Regent", emoji: "👑", hint: "It has been holding court a very long time." },
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

// ── A RAIDER AS AN ARENA OPPONENT ────────────────────────────────────────────────────────────────────────────
// A town foe is fought on the arena engine now — your class, your skills, their archetype — so it needs the
// same shape any other opponent has. The MECHANICS above (hp, bite, timing) described a tap-to-hit duel and do
// not translate directly, so each kind is mapped to an arena archetype that fights the way it looks:
//
//   scrapper      BRUTE      races you. Nothing clever, and it does not need to be.
//   archer        DUELIST    swingy and sharp. Squishy, but a crit takes a third of you.
//   shieldbearer  WALL       nothing lands for much. Bring a sunder or bring patience.
//   elite         BERSERKER  a Warchanter hits far harder than it can survive.
//   chieftain     BALANCED   no weakness and no lever. The raid's boss is meant to take a real kit.
//
// `power` is a budget, not a stat line — statsForPower spends it through the archetype's weights, exactly as a
// Gauntlet tier or a Long Road rung does.
//
// ── AND IT IS A GAUNTLET TIER, NOT A NUMBER SOMEBODY PICKED ──────────────────────────────────────────────────
// These were "scaled off the kind's old HP": the 18/26/44/70/260 hit points a foe carried back when a raid was
// a tap-to-damage duel, multiplied by about ten. That is a UNIT ERROR, not a difficulty setting — a gear power
// budget is measured in the units a member's gear is measured in, where best-in-slot across all nine slots
// totals 644. So a "plain brawler, nothing fancy" was built as a tier-34 Warlord and the Lieutenant as a
// tier-47 Titan, in a Den whose best Gauntlet record is tier 27 and belongs to one person.
//
// On 2026-08-13 that raid one-shot the plaza — the Lieutenant's best move landed 286 on members with 250
// health, and at speed 78 it swung first every time, so people died without taking a turn. JT: "It keeps 1
// shotting me from the jump." Eric D: "First hit hits me for 1000." Rumorleigh: "he'd kill me the first blow."
//
// Stated as TIERS now, resolved through the same npcPower curve the ladder uses, because "the Lieutenant is
// tier 20" is a claim you can check against where members actually are and "760" is not. scripts/check-raid-foes.mjs
// simulates every one of these against four real loadouts and FAILS if any of them can take more than a third
// of a starting member's health in one blow. Change a tier here, run that.
// ── MEASURED AGAINST REAL MEMBERS, NOT PICKED ────────────────────────────────────────────────────────────────
// Luke: "town raids need to be a bit easier."
//
// Swept the roster against three real kits. A geared member beat every foe 100% of the time, so nothing here
// was hard for them — but Nynebreaker, whose wardrobe is thin, went 100% on the scrapper and the archer and
// then ZERO on the shield-bearer, the elite AND the chieftain. Three fifths of the raid was not a fight she
// could take part in, which is the opposite of what a shared raid is for.
//
// The outcomes are binary at that end of the ladder — she wins every bout or none — so easing it means
// crossing her threshold rather than shaving a percentage. Swept: wall flips between 7 and 8, berserker
// between 11 and 14, balanced between 7 and 10.
//
// So the roster is set so a thin wardrobe can clear everything EXCEPT the boss, which is what the chieftain's
// own note already said it was for. A geared member is unaffected — they were at 100% before and after.
const RAID_TIER = {
    scrapper: 5,        // a mook. Everyone beats it; it should cost a few rounds, not a loadout.
    archer: 6,          // squishier, bites harder — the duelist weights do that, not a bigger budget
    shieldbearer: 7,    // the tanky one. Its bulk comes from the wall's ferocity weight and 1.35 tough
    elite: 11,          // a real threat to a new member and a speed bump to a geared one
    chieftain: 20,      // the raid's boss: the one foe a starting member should not expect to solo
};
const ARENA_SHAPE = {
    scrapper: { archetype: "brute", power: npcPower(RAID_TIER.scrapper), kitTier: 4 },
    archer: { archetype: "duelist", power: npcPower(RAID_TIER.archer), kitTier: 5 },
    shieldbearer: { archetype: "wall", power: npcPower(RAID_TIER.shieldbearer), kitTier: 6 },
    elite: { archetype: "berserker", power: npcPower(RAID_TIER.elite), kitTier: 9 },
    chieftain: { archetype: "balanced", power: npcPower(RAID_TIER.chieftain), kitTier: 14 },
};

// ── AND A FACTION HAS A SHAPE ────────────────────────────────────────────────────────────────────────────────
// Without this every raid is the same fight with different portraits, which is what bandits and goblins have
// always been. A faction re-points its roster at a different archetype, so the kit that walked through the
// goblins is the wrong kit against the Court — and the raid announcement can honestly tell you what to bring.
//
// Only the ROLE moves; the power budget still comes off the kind, so a shield-bearer is the tanky one whoever
// is wearing it. Anything not listed keeps the default shape.
const FACTION_SHAPE = {
    // Fast and fragile, and there are ten of them. Duelists all the way up.
    frost_pack: { scrapper: "duelist", archer: "duelist", shieldbearer: "brute", elite: "berserker", chieftain: "berserker" },
    // Heavy, slow, and nothing you swing lands for much.
    drowned_crew: { scrapper: "wall", archer: "brute", shieldbearer: "wall", elite: "wall", chieftain: "wall" },
    // Bodies are ordinary; what hurts is what they cast.
    hollow_court: { scrapper: "balanced", archer: "duelist", shieldbearer: "wall", elite: "balanced", chieftain: "balanced" },
};

/** Everything the arena needs to fight one of these, resolved from the kind and the faction it belongs to. */
export function enemyProfile(kind, eventKind = null) {
    const k = kind in ARENA_SHAPE ? kind : "scrapper";
    const def = enemyKind(k, eventKind);
    const shape = { ...ARENA_SHAPE[k], archetype: FACTION_SHAPE[eventKind]?.[k] || ARENA_SHAPE[k].archetype };
    const arch = ARCHETYPES.find((a) => a.key === shape.archetype) || ARCHETYPES[0];
    return {
        archetypeName: arch.name,
        tell: arch.tell,
        name: def.label,
        blurb: def.hint,
        // The KEY, not a path. Foe art lives in mkt_town_art (foe_<faction>_<kind>), the same table the plaza
        // buildings use — there are no files on disk for these, and inventing a path was how this would have
        // shipped a fight with no portrait on it.
        artKey: def.art ? `foe_${def.art}_${k}` : null,
        tint: def.tint || "#c9a24a",
        element: ["fire", "earth", "storm", "shadow", "water"][Object.keys(ARENA_SHAPE).indexOf(k) % 5],
        ...shape,
    };
}

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
        // ── AND IT IS SIZED FOR THE ROOM ─────────────────────────────────────────────────────────────────
        // A flat 260 HP was a fight for one person, which is what it used to be. Now that everyone hits it at
        // once (see SHARED_KINDS) a raid with eight fighters would delete it in a beat, so it grows with
        // turnout — enough that it is still the wall the raid ends on rather than a formality.
        const hp = Math.round(d.hp * (1 + 0.7 * Math.max(0, Math.min(12, fighters) - 1)));
        await db.query(
            `INSERT INTO mkt_town_enemy (event_id, wave, slot, kind, hp, hp_max, x, y, flip)
             VALUES ($1, $2, 0, 'chieftain', $3, $3, 50, 74, FALSE) ON CONFLICT DO NOTHING`,
            [eventId, wave, hp]
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
    let alive = rows.filter((r) => Number(r.wave) === wave);

    // ── THE TAIL OF A WAVE STRANDS EVERYBODY BUT THE LAST FIGHTERS ───────────────────────────────────────
    // A foe is claimed EXCLUSIVELY while somebody fights it, and a raid foe is a full arena bout now — rounds,
    // not a tap. So the end of every wave looks the same: two foes left, both claimed, and everyone else
    // standing in the plaza with nothing to hit until the wave clears. Luke, mid-raid: "stuck no enemies to
    // fight", on a wave 5 with ten minutes left on the clock and both remaining bandits taken.
    //
    // The wave only advances on a FULL clear, so the fix is not to advance it sooner — that would cheat the
    // people still fighting out of their kill — it is to send reinforcements to the people who have nothing.
    // Fires only when there is genuinely NOTHING free, so a raid with spare foes behaves exactly as before.
    //
    // SAFE ON A READ PATH, which this is — every viewer polls it every couple of seconds:
    //   · slots are derived from the current maximum, so two concurrent polls compute the SAME slot numbers
    //     and the (event_id, wave, slot) unique index turns the loser into a no-op
    //   · MAX_FOES_PER_WAVE caps the wave however many times this fires
    //   · the chieftain is exempt — that wave is one boss on purpose
    // ⚠️ THE TRIGGER IS "FEWER FREE THAN FIGHTERS", NOT "NONE FREE". Waiting for zero meant the last person to
    // tap always got turned away first and reinforcements only arrived after somebody had already been told
    // no. One free bandit and four idle members is the same problem as none.
    const freeNow = alive.filter((r) => !r.engaged_by).length;
    const idleNow = Math.max(0, (await liveFighterCount(eventId).catch(() => 1)) - (alive.length - freeNow));
    if (wave != null && wave !== CHIEFTAIN_WAVE && alive.length && freeNow < idleNow) {
        const fighters = await liveFighterCount(eventId).catch(() => 1);
        const room = Math.min(fighters, MAX_FOES_PER_WAVE) - alive.length;
        if (room > 0) {
            const maxSlot = Math.max(...alive.map((r) => Number(r.slot) || 0));
            for (let i = 1; i <= room; i += 1) {
                const kind = pickKind(wave);
                const def = enemyKind(kind);
                const hp = Math.round(def.hp * (1 + (wave - 1) * 0.12));
                await db.query(
                    `INSERT INTO mkt_town_enemy (event_id, wave, slot, kind, hp, hp_max, x, y, flip)
                     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
                    [eventId, wave, maxSlot + i, kind, hp,
                        Math.round(rand(10, 90) * 10) / 10, Math.round(rand(70, 82) * 10) / 10, Math.random() < 0.5]
                ).catch(() => {});
            }
            const fresh = await db.query(
                `SELECT e.id, e.wave, e.slot, e.kind, e.hp, e.hp_max, e.x, e.y, e.flip, e.engaged_by,
                        NULL::text AS engaged_name, NULL::text AS engaged_sprite
                   FROM mkt_town_enemy e
                  WHERE e.event_id = $1 AND e.wave = $2 AND e.slot > $3 AND e.died_at IS NULL
                  ORDER BY e.slot ASC`,
                [eventId, wave, maxSlot]
            ).catch(() => []);
            alive = alive.concat(fresh);
        }
    }
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
                takeable: isSharedKind(r.kind) || !r.engaged_by || Boolean(mine),
                // A shared foe is drawn as a boss with its party on it, not as a claimable mook.
                shared: isSharedKind(r.kind),
            };
        }),
    };
}

// ── THE FOES EVERYBODY FIGHTS AT ONCE ────────────────────────────────────────────────────────────────────────
// Every raid ends on wave 6, which is ONE chieftain in the middle of the plaza — one row, one exclusive claim.
// So the climax of a raid was one member fighting it while everybody else stood watching with nothing to hit,
// and the reinforcement rule that rescues every other wave deliberately skips this one because that wave is
// meant to be a single boss.
//
// Luke: "I feel like bosses of raids should always include everyone."
//
// It is a single boss AND everyone fights it. The row already holds shared hp that any bout drains, so the
// only thing making it solo was the holder guard — a claim on a boss is the one place exclusivity buys
// nothing, because nobody is being cheated out of a kill they were working on.
//
// Everyone's bout runs against the same row, the HP comes down from all of them, and whoever lands the last
// blow gets the kill credit exactly as before.
const SHARED_KINDS = new Set(["chieftain"]);
const isSharedKind = (kind) => SHARED_KINDS.has(String(kind || ""));

// ── WHAT ONE WON BOUT TAKES OFF A SHARED BOSS ────────────────────────────────────────────────────────────────
// A won duel deals the foe's whole hpMax — one win, one dead goblin, which is right for a goblin. Applied to a
// shared boss it means the FIRST person to finish their bout deletes it however much health it has, and
// scaling the chieftain with turnout would have bought exactly nothing.
//
// So a win against a shared foe takes off ONE UNIT: the kind's own base HP, which is what the boss used to be
// worth in total. The chieftain now has that much per fighter, so a full plaza has to land a win each. Whoever
// takes it below zero gets the kill.
export const sharedHitFor = (kind) => (isSharedKind(kind) ? (KINDS[String(kind)]?.hp || null) : null);

// Claim a foe. Atomic: the guarded WHERE means two people tapping the same goblin at once can't both win it.
export async function engageEnemy(buyerId, enemyId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // A shared foe is never claimed, so it can never be taken. `engaged_by` is left alone deliberately: it is
    // what the plaza draws the "somebody is on this" badge from, and a boss everybody is on has no such owner.
    const shared = await db.queryOne(
        `SELECT id, kind, hp, hp_max FROM mkt_town_enemy WHERE id = $1 AND died_at IS NULL`,
        [Number(enemyId)],
    ).catch(() => null);
    if (shared && isSharedKind(shared.kind)) {
        return { ok: true, enemyId: Number(shared.id), kind: shared.kind,
            hp: Number(shared.hp), hpMax: Number(shared.hp_max), shared: true };
    }
    const got = await db.queryOne(
        `UPDATE mkt_town_enemy SET engaged_by = $2, engaged_at = NOW()
          WHERE id = $1 AND died_at IS NULL AND (engaged_by IS NULL OR engaged_by = $2)
          RETURNING id, event_id, kind, hp, hp_max`,
        [Number(enemyId), buyerId]
    ).catch(() => null);
    if (got) return { ok: true, enemyId: Number(got.id), kind: got.kind, hp: Number(got.hp), hpMax: Number(got.hp_max) };

    // ── A TAP THAT LANDS ON A TAKEN FOE STILL STARTS A FIGHT ─────────────────────────────────────────────
    // Luke: "I think the fights that reserve enemies in town are annoying."
    //
    // It used to answer "taken" and name whoever got there first, which is honest and useless: you are stood
    // in a plaza full of bandits being told you may not hit that one. Claims are worth keeping — a raid foe
    // is a whole arena bout now, and two people swinging at one bandit would each be fighting half a fight —
    // but the rejection is not. Nobody cares WHICH bandit.
    //
    // So it hands over a free one instead, claimed by the same guarded UPDATE, and the caller is told it
    // redirected so the screen can pan to the foe it actually got. Same wave, because a wave has to be
    // cleared before the next arrives.
    const cur = await db.queryOne(
        `SELECT event_id, wave, died_at IS NOT NULL AS dead FROM mkt_town_enemy WHERE id = $1`,
        [Number(enemyId)],
    ).catch(() => null);
    if (cur) {
        const other = await db.queryOne(
            `UPDATE mkt_town_enemy SET engaged_by = $3, engaged_at = NOW()
              WHERE id = (
                SELECT id FROM mkt_town_enemy
                 WHERE event_id = $1 AND wave = $2 AND died_at IS NULL AND engaged_by IS NULL
                 ORDER BY slot LIMIT 1
                 FOR UPDATE SKIP LOCKED
              ) RETURNING id, kind, hp, hp_max`,
            [cur.event_id, cur.wave, buyerId],
        ).catch(() => null);
        if (other) {
            return { ok: true, redirected: true, enemyId: Number(other.id), kind: other.kind,
                hp: Number(other.hp), hpMax: Number(other.hp_max) };
        }
    }

    // Genuinely nothing free — which the reinforcement rule in swarmState exists to make rare. Say which it
    // was, so the UI can still be honest on the one occasion it matters.
    const who = await db.queryOne(
        `SELECT COALESCE(NULLIF(b.display_name,''), b.alias) AS who
           FROM mkt_town_enemy e LEFT JOIN mkt_buyer b ON b.id = e.engaged_by WHERE e.id = $1`,
        [Number(enemyId)],
    ).catch(() => null);
    return { ok: false, error: cur?.dead ? "already_dead" : "taken", who: who?.who || null };
}

// ── THE CHIEFTAIN IS A PARTY FIGHT, NOT A QUEUE ──────────────────────────────────────────────────────────────
// Luke: "design him to be a shared party thing."
//
// Making it hittable by everyone was the mechanism; this is the fight. Two things turn "we all happen to be
// swinging at the same bar" into something that reads as a party:
//
//   PRESENCE COUNTS. Standing in the plaza while the chieftain is up chips it, the same rule the Treasure
//   Golem already runs on ("passive DPS — just being present chips away, so nobody has to grind taps"). It
//   means nobody is ever idle at the boss, including somebody who has just lost their bout and is waiting to
//   go again, and it is the reason a raid with twelve people feels like twelve people.
//
//   YOU CAN SEE THE PARTY. Everyone who has landed something on it in the last two minutes comes back with the
//   foe, so the plaza can draw them on it — the pack view the golem already has. A shared boss with no visible
//   party is just a health bar going down for no reason anybody can see.
//
// Both are recorded in mkt_town_event_hit, which is the table the raid's rewards are already computed from, so
// helping to bring the chieftain down pays without a second ledger.
const CHIEFTAIN_PASSIVE_PER_SEC = 0.9;   // share of one of your blows, a second
const CHIEFTAIN_PASSIVE_MAX_S = 25;      // a poll gap longer than this is somebody coming back, not standing there
const PARTY_WINDOW_S = 120;

/**
 * Chip the live shared foe for standing in the square. Returns what it took off, or null.
 *
 * Runs on the member's OWN poll, which is the proof they are actually in the plaza — the same reason
 * accrueSquarePassive lives on the poll rather than a cron.
 */
export async function accrueSharedFoePassive(buyerId, eventId, perBlow = 1) {
    if (!buyerId || !eventId) return null;
    const foe = await db.queryOne(
        `SELECT id, kind, hp FROM mkt_town_enemy
          WHERE event_id = $1 AND died_at IS NULL AND kind = ANY($2::text[]) ORDER BY wave DESC LIMIT 1`,
        [Number(eventId), [...SHARED_KINDS]],
    ).catch(() => null);
    if (!foe) return null;

    const row = await db.queryOne(
        `INSERT INTO mkt_town_event_hit (event_id, buyer_id, damage, hits, last_passive_at)
         VALUES ($1, $2, 0, 0, NOW())
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET last_passive_at = COALESCE(mkt_town_event_hit.last_passive_at, NOW())
         RETURNING EXTRACT(EPOCH FROM (NOW() - last_passive_at))::float AS secs`,
        [Number(eventId), buyerId],
    ).catch(() => null);
    const secs = Math.min(CHIEFTAIN_PASSIVE_MAX_S, Math.max(0, Number(row?.secs) || 0));
    if (secs < 1) return null;

    const dmg = Math.max(1, Math.round(Math.max(1, perBlow) * CHIEFTAIN_PASSIVE_PER_SEC * secs));
    const hit = await db.queryOne(
        `UPDATE mkt_town_enemy SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND died_at IS NULL RETURNING hp, hp_max`,
        [foe.id, dmg],
    ).catch(() => null);
    if (!hit) return null;
    await db.query(
        `UPDATE mkt_town_event_hit SET damage = damage + $3, passive_damage = passive_damage + $3, last_passive_at = NOW()
          WHERE event_id = $1 AND buyer_id = $2`,
        [Number(eventId), buyerId, dmg],
    ).catch(() => {});
    // Whoever's chip takes it to zero ends it, exactly as a landed blow would.
    if (Number(hit.hp) <= 0) {
        await db.query(`UPDATE mkt_town_enemy SET died_at = NOW(), killed_by = $2 WHERE id = $1 AND died_at IS NULL`,
            [foe.id, buyerId]).catch(() => {});
    }
    return { enemyId: Number(foe.id), damage: dmg, hp: Number(hit.hp), hpMax: Number(hit.hp_max) };
}

/** Everyone who has landed something on the raid recently — the pack drawn on a shared foe. */
export async function partyOn(eventId, viewerId = null) {
    if (!eventId) return [];
    const rows = await db.query(
        `SELECT h.buyer_id, COALESCE(NULLIF(b.display_name,''), b.alias) AS name, b.avatar_sprite_url AS sprite, h.damage
           FROM mkt_town_event_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
          WHERE h.event_id = $1 AND h.last_hit_at > NOW() - ($2 || ' seconds')::interval
          ORDER BY h.damage DESC LIMIT 12`,
        [Number(eventId), String(PARTY_WINDOW_S)],
    ).catch(() => []);
    return rows.map((r) => ({
        id: String(r.buyer_id), name: r.name || "A member", sprite: r.sprite || null,
        damage: Number(r.damage) || 0, isYou: viewerId != null && String(r.buyer_id) === String(viewerId),
    }));
}

// ── PUT A FOE BACK ON THE BOARD ──────────────────────────────────────────────────────────────────────────────
// A claim was released in exactly ONE place — releaseAbandoned, which needs the holder to stop appearing in
// mkt_town_presence for 45 seconds, i.e. to leave the plaza entirely. Nothing released it when a fighter simply
// LOST, so a lost bout left the foe locked to the loser and unclickable by everyone else for the rest of the
// raid. arena.js's forfeit even documents the opposite ("a raid foe goes back on the shared roster the same way
// it does when you are killed") — it was describing behaviour no code had.
//
// That is the second half of the 2026-08-13 raid. One member held a Lieutenant they could not kill and the
// plaza stood watching: "if a new player joins the raid and attacks a boss they can't kill, [we're] stuck
// twiddling thumbs until raid ends" (GrayKitsune). The only known workaround was closing the tab — which is
// precisely what Rumorleigh found: "Closed out and came back in and it cleared me from that one."
//
// Guarded on the holder so a stale client cannot free somebody else's fight.
export async function releaseEnemy(buyerId, enemyId) {
    if (!buyerId || !enemyId) return false;
    const r = await db.queryOne(
        `UPDATE mkt_town_enemy SET engaged_by = NULL, engaged_at = NULL
          WHERE id = $1 AND engaged_by = $2 AND died_at IS NULL RETURNING id`,
        [Number(enemyId), buyerId]
    ).catch(() => null);
    return Boolean(r);
}

// Damage the foe you hold. Returns whether it died, and whether that cleared the wave.
export async function strikeEnemy(buyerId, enemyId, damage) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const dmg = Math.max(1, Math.round(Number(damage) || 1));
    // Only the holder can hit it — enforced in the WHERE so it can't be raced or spoofed. A SHARED foe has no
    // holder by design (see SHARED_KINDS), so the guard there is simply that it is alive; the GREATEST(0, ...)
    // clamp and the died_at check below already make concurrent killing blows safe.
    const hit = await db.queryOne(
        `UPDATE mkt_town_enemy SET hp = GREATEST(0, hp - $3)
          WHERE id = $1 AND died_at IS NULL
            AND (engaged_by = $2 OR kind = ANY($4::text[]))
          RETURNING id, event_id, wave, kind, hp, hp_max`,
        [Number(enemyId), buyerId, dmg, [...SHARED_KINDS]]
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
    if (killed) await trackActivity(buyerId, "swarm_kill", { kind: hit.kind, wave: Number(hit.wave), eventId: Number(hit.event_id) }).catch(() => {});
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
