import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";

// ── FISHING ──────────────────────────────────────────────────────────────────────────────────────────────────
// A voyage is four hours of nothing happening. That dead time is where fishing lives: while the boat is at sea
// (or docked at the island before you dig), you can drop a line over the rail.
//
// The loop is three beats and takes about fifteen seconds:
//   CAST   you pick a spot; the server rolls what's down there and how long it takes to notice your bait.
//   BITE   the line twitches at a moment you can't predict. Tap.
//   REEL   a tension band sweeps; keep the line in the green. How well you reel decides how BIG the fish is.
//
// Two design rules, both from things that went wrong elsewhere in the game:
//
//   1. NOTHING IS PUNISHED. A sloppy reel lands a smaller fish, never nothing. Miss the bite entirely and the
//      fish "steals your bait" — and the cast is REFUNDED, because losing a limited daily resource to a
//      half-second reaction window is the exact kind of forced-timing pressure this game deliberately avoids.
//   2. THE PRIZE IS THE LOG, NOT THE GOLD. Payouts here are small on purpose (a good catch is worth less than a
//      single raid duel). What you're actually playing for is a filled-in Fishing Log, a personal best for every
//      species, and your name on the Den's record board. That scales forever without inflating the economy.
//
// The fish is rolled SERVER-side at cast time and parked in `fish_state`, so the client cannot reroll for a
// rarer one, and the landing is guarded by an atomic clear of that column so a resubmit can't double-pay.

// ── THE SPECIES ──────────────────────────────────────────────────────────────────────────────────────────────
// weight   relative likelihood within the pool you're fishing (before rarity gating)
// cm       [min, max] length — where personal bests come from
// gold/xp  paid at the TOP of the size range and scaled down by how big yours actually was
// minVoyages  progression gate: the deep-water monsters simply aren't there until you've sailed a while
// sky      optional weather/time gate, which is why the real-world sky matters: some fish only bite at night,
//          some only in a storm. Nothing else in the game rewards you for playing at 11pm in the rain.
const F = (id, name, emoji, rarity, weight, cm, gold, xp, extra = {}) => ({ id, name, emoji, rarity, weight, cm, gold, xp, minVoyages: 0, sky: null, ...extra });

// PAYOUT TUNING, and the story behind these numbers so nobody re-derives them from scratch:
//
// The first pass paid 150-300 gold a day. That got cut by 75% on the belief that fishing had handed out a
// 2,000-gold catch — but the ledger showed the catches themselves paid 4 and 27 gold. The jackpot was two
// one-time BADGES (fish_first + fish_record_holder, 120 each) firing on the very first cast. The cut was made
// on a false premise and left a full day of fishing worth 30-58 gold, under half of one daily quest.
//
// These sit at roughly HALF the original: a day lands around 60-120 gold, a mythic near 300. Still well under
// a daily quest at 110-140, so it can't be farmed as an income source, but a legendary is worth landing and a
// mythic — which shows up about twice a month — actually feels like an event.
export const FISH = [
    // ── COMMON · the harbour regulars (always available, so a brand-new member always catches something) ──
    F("fish_sardine", "Sardine", "🐟", "common", 100, [8, 22], 4, 4),
    F("fish_perch", "Silver Perch", "🐟", "common", 90, [14, 38], 4, 4),
    F("fish_mackerel", "Mackerel", "🐟", "common", 80, [20, 46], 6, 6),
    F("fish_crab", "Rock Crab", "🦀", "common", 60, [9, 26], 6, 6),
    F("fish_squid", "Bay Squid", "🦑", "common", 55, [18, 55], 8, 6),

    // ── RARE · worth stopping for ──
    F("fish_snapper", "Ruby Snapper", "🐠", "rare", 46, [26, 62], 14, 10),
    F("fish_shrimp", "Tiger Prawn", "🦐", "rare", 40, [10, 24], 12, 8),
    F("fish_pufferfish", "Pufferfish", "🐡", "rare", 34, [16, 40], 16, 10),
    F("fish_lobster", "Blue Lobster", "🦞", "rare", 26, [22, 58], 20, 14),
    F("fish_octopus", "Reef Octopus", "🐙", "rare", 24, [30, 90], 18, 12, { minVoyages: 4 }),
    F("fish_moonfish", "Moonfish", "🌙", "rare", 22, [24, 70], 20, 14, { sky: ["night"], minVoyages: 3 }),

    // ── EPIC · a story when you land one ──
    F("fish_swordfish", "Swordfish", "🗡️", "epic", 16, [90, 240], 40, 26, { minVoyages: 8 }),
    F("fish_tuna", "Bluefin Tuna", "🐟", "epic", 15, [80, 220], 36, 24, { minVoyages: 8 }),
    F("fish_manta", "Manta Ray", "🪁", "epic", 11, [120, 340], 46, 30, { minVoyages: 12 }),
    F("fish_stormpike", "Storm Pike", "⚡", "epic", 10, [60, 160], 48, 32, { sky: ["storm"], minVoyages: 6 }),
    F("fish_anglerfish", "Anglerfish", "🏮", "epic", 9, [18, 52], 44, 28, { sky: ["night", "dusk"], minVoyages: 10 }),

    // ── LEGENDARY · the deep ──
    F("fish_shark", "Great White", "🦈", "legendary", 5, [280, 620], 96, 66, { minVoyages: 16 }),
    // Fog + overcast, not fog alone. Open-Meteo only reports fog for WMO 45/48, which at the Den is a handful
    // of autumn mornings a year — this fish was effectively unobtainable. Overcast/drizzle is the same grey
    // weather to look at and happens often enough for a legendary to be a real chase rather than a lottery.
    F("fish_dolphin", "Ghost Dolphin", "🐬", "legendary", 4, [190, 330], 88, 60, { sky: ["fog", "overcast"], minVoyages: 14 }),
    F("fish_marlin", "Black Marlin", "🐟", "legendary", 4, [240, 500], 104, 72, { minVoyages: 20 }),
    F("fish_coelacanth", "Coelacanth", "🦴", "legendary", 3, [110, 200], 120, 84, { minVoyages: 24 }),

    // ── MYTHIC · four of these exist in the whole ocean ──
    F("fish_whale", "Sunlit Whale", "🐋", "mythic", 2, [900, 2600], 210, 156, { minVoyages: 30 }),
    F("fish_kraken", "Kraken Spawn", "🦑", "mythic", 1.5, [400, 1200], 240, 180, { sky: ["storm", "night"], minVoyages: 34 }),
    F("fish_leviathan", "Leviathan Fry", "🐉", "mythic", 1, [520, 1800], 280, 204, { minVoyages: 40 }),
    F("fish_starfish", "Fallen Star", "⭐", "mythic", 1, [30, 90], 300, 228, { sky: ["night"], minVoyages: 26 }),
];

const BY_ID = new Map(FISH.map((f) => [f.id, f]));
export const fishById = (id) => BY_ID.get(id) || null;
export const FISH_COUNT = FISH.length;

const RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"];
const RARITY_RANK = Object.fromEntries(RARITY_ORDER.map((r, i) => [r, i]));

// ── TUNING ───────────────────────────────────────────────────────────────────────────────────────────────────
const CASTS_PER_DAY = 10;            // the daily allowance
const CASTS_PER_ANGLING = 4;         // +1 cast per this many Angling points (sea affinity)
const CASTS_MAX = 18;                // hard ceiling however much Angling you stack
const BITE_MIN_MS = 900;             // the line twitches somewhere in this window — unpredictable on purpose
const BITE_MAX_MS = 4200;
const BITE_GRACE_MS = 12000;         // after which the fish has clearly gone (the cast is refunded)
// Rarity weighting: a plain cast is mostly commons. Angling tilts it, and so does a LURE consumable if we ever
// add one. Multiplicative on the weight of anything above common.
const RARE_TILT_PER_ANGLING = 0.035; // +3.5% weight to non-common fish per Angling point
const RARE_TILT_CAP = 0.9;
// How much of the final size comes from your REELING vs. the luck of what bit. Skill-forward, but a bad reel on
// a big fish still beats a perfect reel on a sardine — species matters more than execution, which is what makes
// the chase for a rare species the point.
const SIZE_FROM_QUALITY = 0.62;
const SIZE_FROM_ROLL = 0.38;
// Fragment/chest sprinkles, so fishing feeds the existing forge loop rather than being a closed economy.
// Halfway back up with the gold. A mythic surfaces roughly twice a month, so it keeps the gold chest.
const FRAGMENT_CHANCE = { epic: 0.14, legendary: 0.30, mythic: 0.60 };
const CHEST_ON_MYTHIC = "gold";
const CHEST_ON_RECORD_LEGENDARY = "wooden";  // a personal best on a legendary+ also drops a chest

// ── HELPERS ──────────────────────────────────────────────────────────────────────────────────────────────────
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const round1 = (n) => Math.round(n * 10) / 10;

// Angling points → the two things they buy.
export function anglingEffects(angling = 0) {
    const pts = Math.max(0, Number(angling) || 0);
    return {
        bonusCasts: Math.floor(pts / CASTS_PER_ANGLING),
        rareTilt: Math.min(RARE_TILT_CAP, pts * RARE_TILT_PER_ANGLING),
    };
}

export const castsPerDay = (angling = 0) => Math.min(CASTS_MAX, CASTS_PER_DAY + anglingEffects(angling).bonusCasts);

// ── WHAT SKY ARE YOU ACTUALLY UNDER? ─────────────────────────────────────────────────────────────────────────
// The weather-gated species are the reason to fish at 11pm in a thunderstorm, so the gate has to mean something
// — and, crucially, has to be REACHABLE.
//
// It wasn't. The gate used to read the sky the CLIENT said it was rendering, which comes from the ambiance
// route and needs the member's granted coordinates. Most members never granted location, so `sky` arrived null
// and nine of the twenty-four species — every weather-gated one — could never bite for them. Silently. With no
// way to tell from inside the game that a permission prompt was the reason.
//
// Both halves are now resolved on the SERVER, and the weather half is the sky over THE DEN itself:
//
//   TIME-OF-DAY (night, dusk)      — server clock, store-local. Unspoofable, same for everyone.
//   WEATHER (storm, fog, aurora…)  — live weather at the shop's own coordinates, via sky.js.
//
// One shop, one sky, everybody fishing under the same weather. Nothing the client sends is trusted any more,
// and nobody is gated behind a browser permission they declined.
// Exactly the sky types sky.js can actually return. "aurora" used to be listed here and on two fish, but
// pickSky has no branch that produces it — it was a gate on a value the weather service never emits. Both of
// those fish also allowed "night", so they were still catchable and nothing looked broken; the aurora half was
// simply dead. Anything added here must correspond to a real pickSky output or it silently gates a fish out.
const WEATHER_SKIES = new Set(["storm", "fog", "overcast", "clearday", "sunrise", "sunset", "goldenhour"]);

// Time-of-day half — pure, synchronous, always available even if the weather service is down.
function clockSkies() {
    const out = new Set();
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(new Date()));
    if (hour >= 21 || hour < 5) out.add("night");
    if ((hour >= 19 && hour < 21) || (hour >= 5 && hour < 7)) out.add("dusk");
    return out;
}

/**
 * The skies in effect right now. `knownWeather` is an already-resolved sky type (see denSkies) — passing it in
 * keeps this function pure so fishingView can stay a free, synchronous read off the sailing row.
 */
export function effectiveSkies(knownWeather = null) {
    const out = clockSkies();
    const w = String(knownWeather || "");
    if (WEATHER_SKIES.has(w)) out.add(w);
    return [...out];
}

// The live version: asks sky.js for the weather over the shop. Falls back to time-of-day alone if the weather
// service is unreachable, so a fetch failure narrows the pool rather than breaking a cast.
export async function denSkies() {
    const { skyAtTheDen } = await import("@/lib/marketplace/sky.js");
    const resolved = await skyAtTheDen().catch(() => null);
    return effectiveSkies(resolved?.skyType || null);
}

// Which fish could bite right now, given the skies in effect.
function poolFor({ voyages = 0, skies = [] }) {
    return FISH.filter((f) => voyages >= f.minVoyages && (!f.sky || f.sky.some((s) => skies.includes(s))));
}

// Weighted pick, with non-commons tilted up by Angling.
function rollSpecies(pool, rareTilt = 0) {
    if (!pool.length) return FISH[0];
    const weights = pool.map((f) => f.weight * (f.rarity === "common" ? 1 : 1 + rareTilt));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
}

// Length in cm from the pre-rolled luck and how well the member reeled.
function sizeFor(species, roll, quality) {
    const [min, max] = species.cm;
    const t = clamp01(SIZE_FROM_ROLL * clamp01(roll) + SIZE_FROM_QUALITY * clamp01(quality));
    return round1(min + (max - min) * t);
}
// Where this fish sits in its species' size range (0..1) — drives payout and the "monster!" callouts.
const percentileOf = (species, cm) => clamp01((cm - species.cm[0]) / Math.max(0.01, species.cm[1] - species.cm[0]));

// ── THE LOG ──────────────────────────────────────────────────────────────────────────────────────────────────
// fish_log is `{ [speciesId]: { n, best, firstAt } }` on mkt_sailing — a JSONB map rather than a row per catch,
// because the log is read on every sailing state load and a map is one column instead of a join.
const logOf = (row) => (row && row.fish_log) || {};

async function readFishRow(buyerId) {
    return db.queryOne(
        `SELECT buyer_id, voyages_completed, fish_state, fish_log, fish_caught,
                COALESCE(fish_casts, 0) AS fish_casts,
                (fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS fish_is_today
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

// Casts already spent TODAY. The day comparison happens in SQL (store-local) because building a JS Date from a
// Postgres DATE column reads today as yesterday on Vercel — that bug already broke the daily check-in once.
const castsUsed = (row) => (row?.fish_is_today ? Number(row.fish_casts) || 0 : 0);

// ── CLIENT VIEW ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE function off the sailing row — no extra query, so this is free to include in every sailing state load.
// `status` is the voyage status decorate() already computed; fishing is only offered at sea or docked.
export function fishingView(row, angling = 0, status = "idle", sky = null) {
    const log = logOf(row);
    const voyages = Number(row?.voyages_completed) || 0;
    const max = castsPerDay(angling);
    const used = castsUsed(row);
    const hooked = row?.fish_state || null;
    // Takes the already-resolved list (getSailingState hands down denSkies()), or a bare weather string for
    // any caller that still has one. Stays synchronous either way so this is free on every sailing load.
    const skies = Array.isArray(sky) ? sky : effectiveSkies(sky);
    const pool = poolFor({ voyages, skies });
    // Species the member has SEEN (their log) plus which of the rest could bite here — enough for a progress
    // ring and an "unknown waters" teaser, without leaking exactly which mythic is swimming under the boat.
    const caughtIds = Object.keys(log);
    return {
        available: status === "sailing" || status === "arrived",
        casts: { used, max, left: Math.max(0, max - used) },
        angling,
        // Something is on the line right now (survives a refresh mid-cast — you can always come back and reel).
        hooked: hooked ? { castAt: hooked.castAt, biteAt: hooked.biteAt, graceMs: BITE_GRACE_MS } : null,
        biteWindow: { minMs: BITE_MIN_MS, maxMs: BITE_MAX_MS, graceMs: BITE_GRACE_MS },
        totalCaught: Number(row?.fish_caught) || 0,
        speciesKnown: caughtIds.length,
        speciesTotal: FISH_COUNT,
        // The full log, always — this is the actual reward, so it should never be a second round-trip.
        log: FISH.map((f) => {
            const e = log[f.id];
            const inRange = voyages >= f.minVoyages && (!f.sky || f.sky.some((s) => skies.includes(s)));
            return {
                id: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity,
                cm: f.cm, gold: f.gold,
                caught: Number(e?.n) || 0,
                best: e?.best ? round1(Number(e.best)) : null,
                // Never spoil an unseen species' unlock condition beyond a nudge — "bites at night" is a hint
                // worth chasing; "requires 34 voyages" is a spreadsheet.
                hint: e ? null : (f.sky ? `bites in the ${f.sky[0]}` : (f.minVoyages > voyages ? "deeper water" : "out there somewhere")),
                biting: inRange,
            };
        }),
        poolSize: pool.length,
    };
}

// ── CAST ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Spends a cast, rolls the fish, and parks it on the line. Returns only the bite TIMING — never the species,
// because the surprise of what surfaces is most of the fun.
export async function castLine(buyerId, { status = "sailing", angling = 0 } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (status !== "sailing" && status !== "arrived") return { ok: false, error: "not_at_sea" };
    const row = await readFishRow(buyerId);
    if (!row) return { ok: false, error: "no_ship" };
    if (row.fish_state) return { ok: false, error: "already_cast" };
    const max = castsPerDay(angling);
    if (castsUsed(row) >= max) return { ok: false, error: "out_of_casts" };

    // Resolved here, not taken from the caller — this is the roll that decides which species is on the line,
    // so it must not be something the client can influence.
    const skies = await denSkies();
    const pool = poolFor({ voyages: Number(row.voyages_completed) || 0, skies });
    const species = rollSpecies(pool, anglingEffects(angling).rareTilt);
    const state = {
        species: species.id,
        roll: Math.round(Math.random() * 1000) / 1000,     // the luck half of the final size
        castAt: Date.now(),
        biteAt: Date.now() + Math.round(BITE_MIN_MS + Math.random() * (BITE_MAX_MS - BITE_MIN_MS)),
        sky: skies[0] || null,
    };
    // One statement spends the cast AND puts the fish on the line, guarded on fish_state IS NULL so two taps
    // can't both cast. The day roll-over is handled inline: a stale fish_day resets the counter to 1.
    const cast = await db.queryOne(
        `UPDATE mkt_sailing
            SET fish_state = $2::jsonb,
                fish_casts = CASE WHEN fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date
                                  THEN COALESCE(fish_casts, 0) + 1 ELSE 1 END,
                fish_day = (NOW() AT TIME ZONE 'America/Chicago')::date,
                updated_at = NOW()
          WHERE buyer_id = $1 AND fish_state IS NULL
          RETURNING fish_casts`,
        [buyerId, JSON.stringify(state)]
    ).catch(() => null);
    if (!cast) return { ok: false, error: "already_cast" };

    return {
        ok: true,
        cast: { castAt: state.castAt, biteAt: state.biteAt, graceMs: BITE_GRACE_MS },
        castsLeft: Math.max(0, max - (Number(cast.fish_casts) || 0)),
    };
}

// ── LAND IT ──────────────────────────────────────────────────────────────────────────────────────────────────
// `quality` is the reel score the client reports (0..1), clamped here — the same trust model as the forge's
// enhance minigame and the merchant's coin game. `missed` means the bite window elapsed untapped.
export async function landFish(buyerId, { quality = 0, missed = false } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // Atomically TAKE the fish off the line. Whoever lands this owns the catch; a resubmit finds nothing.
    //
    // It has to be a CTE rather than the obvious `UPDATE … SET fish_state = NULL … RETURNING fish_state`, because
    // RETURNING hands back the NEW row — which is the NULL we just wrote, not the fish. (Caught by running this
    // against prod before shipping: every single catch came back "nothing_on_the_line".) The SELECT … FOR UPDATE
    // reads and locks the row, the UPDATE clears it, and both happen in one statement, so it stays a race-proof
    // single claim.
    const taken = await db.queryOne(
        `WITH hooked AS (
             SELECT buyer_id, fish_state, COALESCE(fish_casts, 0) AS fish_casts, fish_log, voyages_completed
               FROM mkt_sailing WHERE buyer_id = $1 AND fish_state IS NOT NULL FOR UPDATE
         ), cleared AS (
             UPDATE mkt_sailing s SET fish_state = NULL, updated_at = NOW()
               FROM hooked h WHERE s.buyer_id = h.buyer_id RETURNING s.buyer_id
         )
         SELECT h.fish_state, h.fish_casts, h.fish_log, h.voyages_completed FROM hooked h`,
        [buyerId]
    ).catch(() => null);
    if (!taken?.fish_state) return { ok: false, error: "nothing_on_the_line" };
    // jsonb normally arrives parsed; tolerate a string in case a driver path hands it back raw.
    const state = typeof taken.fish_state === "string" ? (JSON.parse(taken.fish_state) || {}) : taken.fish_state;
    const species = fishById(state.species) || FISH[0];

    // MISSED THE BITE. It took the bait and left — and the cast comes back, because a limited daily resource
    // should never evaporate on a reaction test.
    const elapsed = Date.now() - Number(state.biteAt || 0);
    if (missed || elapsed > BITE_GRACE_MS) {
        await db.query(
            `UPDATE mkt_sailing SET fish_casts = GREATEST(0, COALESCE(fish_casts, 0) - 1) WHERE buyer_id = $1`,
            [buyerId]
        ).catch(() => {});
        await trackActivity(buyerId, "fish_missed", { species: species.id }).catch(() => {});
        return { ok: true, landed: false, refunded: true, message: "It stole your bait and slipped away — cast refunded." };
    }

    // ── THE CATCH ────────────────────────────────────────────────────────────────────────────────────────────
    const q = clamp01(quality);
    const cm = sizeFor(species, state.roll, q);
    const pct = percentileOf(species, cm);
    // Payout scales from 45% of the species value at the small end to 100% at the top of its range, so a
    // well-reeled fish is worth roughly double a badly-reeled one of the same species — never zero.
    const scale = 0.45 + 0.55 * pct;
    const gold = Math.max(1, Math.round(species.gold * scale));
    const xp = Math.max(1, Math.round(species.xp * scale));

    const log = (taken.fish_log && typeof taken.fish_log === "object") ? taken.fish_log : {};
    const prev = log[species.id] || null;
    const firstEver = !prev;
    const personalBest = !prev || cm > Number(prev.best || 0);

    // Merge the log entry in SQL so a concurrent catch can't clobber the map.
    const entry = { n: (Number(prev?.n) || 0) + 1, best: personalBest ? cm : Number(prev.best), firstAt: prev?.firstAt || new Date().toISOString() };
    await db.query(
        `UPDATE mkt_sailing
            SET fish_log = COALESCE(fish_log, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
                fish_caught = COALESCE(fish_caught, 0) + 1,
                updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, species.id, JSON.stringify(entry)]
    ).catch(() => {});

    // Every catch is also a row on the record board — that's the social half of the feature, and it makes the
    // "biggest in the Den" board possible without any extra bookkeeping.
    await db.query(
        `INSERT INTO mkt_fish_catch (buyer_id, species, cm, quality, sky) VALUES ($1, $2, $3, $4, $5)`,
        [buyerId, species.id, cm, Math.round(q * 1000) / 1000, state.sky || null]
    ).catch(() => {});

    // awardXp pays the gold too, so Happy Hour / prosperity multipliers apply consistently with everything else.
    await awardXp(buyerId, "sail_fish", { points: xp, gold }).catch(() => {});
    await logCoin(buyerId, gold, "fishing", { meta: { species: species.id, cm, quality: q } }).catch(() => {});

    // Sprinkles that feed the forge loop rather than a closed fishing economy.
    const extras = [];
    const fragChance = FRAGMENT_CHANCE[species.rarity] || 0;
    if (fragChance && Math.random() < fragChance) {
        const { grantFragment } = await import("@/lib/marketplace/sailing.js");
        await grantFragment(buyerId, 1).catch(() => {});
        extras.push({ kind: "fragment", label: "Hull Fragment", emoji: "🔷" });
    }
    if (species.rarity === "mythic") {
        await addChests(buyerId, { [CHEST_ON_MYTHIC]: 1 }, { source: "fishing" }).catch(() => {});
        extras.push({ kind: "chest", label: "Gold Chest", emoji: "🧰" });
    } else if (personalBest && RARITY_RANK[species.rarity] >= RARITY_RANK.legendary) {
        await addChests(buyerId, { [CHEST_ON_RECORD_LEGENDARY]: 1 }, { source: "fishing" }).catch(() => {});
        extras.push({ kind: "chest", label: "Iron Chest", emoji: "🧰" });
    }

    await trackActivity(buyerId, "fish_caught", { species: species.id, rarity: species.rarity, cm, quality: q, gold, xp, firstEver, personalBest }).catch(() => {});
    await checkFishingBadges(buyerId).catch(() => {});

    // Is this the biggest one in the whole Den? Checked after the insert, so it includes this catch.
    const denBest = await db.queryOne(
        `SELECT buyer_id, cm FROM mkt_fish_catch WHERE species = $1 ORDER BY cm DESC, caught_at ASC LIMIT 1`,
        [species.id]
    ).catch(() => null);
    const denRecord = denBest && String(denBest.buyer_id) === String(buyerId) && Number(denBest.cm) === cm;

    return {
        ok: true, landed: true,
        fish: { id: species.id, name: species.name, emoji: species.emoji, rarity: species.rarity, cm, range: species.cm },
        pct: Math.round(pct * 100),
        gold, xp, extras,
        quality: q,
        firstEver, personalBest, denRecord,
        previousBest: prev?.best ? round1(Number(prev.best)) : null,
    };
}

// ── BADGES ───────────────────────────────────────────────────────────────────────────────────────────────────
// Counted off the catch table and the log, so the numbers can't drift from what actually happened.
export async function checkFishingBadges(buyerId) {
    if (!buyerId) return;
    const num = (v) => Number(v) || 0;
    const row = await db.queryOne(
        `SELECT COALESCE(fish_caught, 0) AS n, fish_log FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);
    const n = num(row?.n);
    const log = (row?.fish_log && typeof row.fish_log === "object") ? row.fish_log : {};
    const known = Object.keys(log).length;

    if (n >= 1) await grantEventBadge(buyerId, "fish_first").catch(() => {});
    if (n >= 50) await grantEventBadge(buyerId, "fish_angler").catch(() => {});
    if (n >= 250) await grantEventBadge(buyerId, "fish_master").catch(() => {});
    if (known >= 10) await grantEventBadge(buyerId, "fish_naturalist").catch(() => {});
    if (known >= FISH_COUNT) await grantEventBadge(buyerId, "fish_complete").catch(() => {});
    // Landed one of the four mythics.
    const mythics = FISH.filter((f) => f.rarity === "mythic").map((f) => f.id);
    if (mythics.some((id) => log[id])) await grantEventBadge(buyerId, "fish_deepwater").catch(() => {});
    // A fish within 2% of its species maximum — a genuinely perfect specimen.
    const trophy = FISH.some((f) => { const e = log[f.id]; return e && Number(e.best) >= f.cm[1] * 0.98; });
    if (trophy) await grantEventBadge(buyerId, "fish_trophy").catch(() => {});
    // Holding the Den record for any species right now — but only where a record was actually CONTESTED.
    //
    // On an empty board the first person to catch anything automatically "holds its record", so this secret
    // prestige badge fired on the very first cast of the feature (a 14cm Sardine) and paid out 120 gold for
    // nothing. Every new member would have got the same freebie. The species now needs catches from at least
    // two different members before its record means anything.
    const holds = await db.queryOne(
        `WITH contested AS (
             SELECT species FROM mkt_fish_catch GROUP BY species HAVING COUNT(DISTINCT buyer_id) >= 2
         ), leaders AS (
             SELECT DISTINCT ON (c.species) c.species, c.buyer_id
               FROM mkt_fish_catch c JOIN contested x ON x.species = c.species
              ORDER BY c.species, c.cm DESC, c.caught_at ASC
         )
         SELECT 1 FROM leaders WHERE buyer_id = $1 LIMIT 1`,
        [buyerId]
    ).catch(() => null);
    if (holds) await grantEventBadge(buyerId, "fish_record_holder").catch(() => {});
}

// ── TOP CATCHES ──────────────────────────────────────────────────────────────────────────────────────────────
// The board people actually want: the best catches in the Den, ranked against each other.
//
// Ranking on raw cm would be a whale leaderboard and nothing else — a Sunlit Whale's floor (900cm) is larger
// than a Great White's ceiling, so no other species could ever appear. Instead every catch is scored on how
// close it came to ITS OWN species maximum, which is the thing that actually took skill and luck. A 21.8cm
// Sardine at 99% of possible beats a middling whale, and the board stays winnable from the first cast.
// Rarity breaks ties, so a perfect Kraken still outranks a perfect Sardine.
export async function denTopCatches(limit = 25) {
    const rows = await db.query(
        `SELECT c.buyer_id, c.species, c.cm, c.caught_at,
                COALESCE(NULLIF(b.display_name, ''), b.alias) AS who, b.alias
           FROM mkt_fish_catch c LEFT JOIN mkt_buyer b ON b.id = c.buyer_id
          ORDER BY c.cm DESC LIMIT 600`
    ).catch(() => []);
    return (rows || [])
        .map((r) => {
            const f = fishById(r.species);
            if (!f) return null;
            return {
                species: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity,
                cm: round1(Number(r.cm)), max: f.cm[1],
                pct: Math.round(percentileOf(f, Number(r.cm)) * 100),
                who: r.who || null, alias: r.alias || null, at: r.caught_at || null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => (b.pct - a.pct) || (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]) || (b.cm - a.cm))
        .slice(0, Math.max(1, Math.min(100, limit)));
}

// ── THE RECORD BOARD ─────────────────────────────────────────────────────────────────────────────────────────
// Biggest of every species anyone in the Den has ever landed. This is the leaderboard the log is chasing.
export async function denFishRecords() {
    const rows = await db.query(
        `SELECT DISTINCT ON (c.species) c.species, c.cm, c.caught_at,
                COALESCE(NULLIF(b.display_name, ''), b.alias) AS who, b.alias
           FROM mkt_fish_catch c LEFT JOIN mkt_buyer b ON b.id = c.buyer_id
          ORDER BY c.species, c.cm DESC, c.caught_at ASC`
    ).catch(() => []);
    const byId = new Map((rows || []).map((r) => [r.species, r]));
    return FISH.map((f) => {
        const r = byId.get(f.id);
        return {
            id: f.id, name: f.name, emoji: f.emoji, rarity: f.rarity, max: f.cm[1],
            record: r ? round1(Number(r.cm)) : null,
            who: r?.who || null, alias: r?.alias || null,
            at: r?.caught_at || null,
        };
    });
}
