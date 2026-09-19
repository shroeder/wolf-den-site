// ── THE HUNT: HOW AN EXPEDITION STARTS NOW ───────────────────────────────────────────────────────────────────
// Luke's shape for the seamless journey: *"you get a certain amount of sailing attempts per day and there's no
// longer a sailing duration, and so you set sail, and then you encounter a ship like you normally would during
// an NPC raid, and then you fight them."*
//
// So a chart is no longer something you find in your pocket. It is the thing you take off a man, in a fight
// you went looking for, at the front of the journey that spends it. Everything downstream — the grade, the
// island, the tide — is unchanged; what changed is that the first beat is now a sail and a fight instead of a
// row that already existed in a table.
//
// ⚠️ THE QUARRY IS NOT A FLEET LADDER FIGHT, AND MUST NOT BE. `openFleetBattle` spends a raid from the daily
// pool, advances `fleet_depth` and books a rank as beaten. Reusing it would make every expedition also a rung
// of a different feature's progression, and would charge the member twice for one decision. The hunt is an
// ENCOUNTERS-shaped foe opened through `openEncounterBattle`, exactly as the island wardens are — which is the
// same reason those exist in that shape: no second combat system, and no second economy either.
//
// ⚠️ AND THE ALLOWANCE IS COUNTED OFF THE ROWS, NOT OFF A COLUMN. `mkt_ship_expedition` already stamps
// `opened_at`, so "how many did I start today" is a COUNT with a date predicate. A counter column would be a
// second source for a number the table already holds, and the kind that drifts when a row is deleted.

import { FLEET, MAX_FLEET_RANK, fleetArt, fleetShip } from "@/lib/marketplace/fleet.js";
import { captainFor, handoverFor } from "@/lib/marketplace/captains.js";
import { hash } from "@/lib/marketplace/world-hash.js";

// ── HOW MANY TIMES A DAY ─────────────────────────────────────────────────────────────────────────────────────
// Three. The journey is about two and a half minutes of real play end to end, and the thing being replaced is
// a sixteen-hour wait — so the limiter has to be a number of GOES rather than a clock, or the feature has
// simply moved the waiting somewhere else. Three is a first number for a prototype and is expected to move:
// it is here, alone, so that moving it is one edit.
// ── SHOW THE NEW LOOP INSTEAD OF THE OLD ONE ─────────────────────────────────────────────────────────────────
// Luke: "right now I see the old sailing experience — three options to sail, each a different duration, and a
// ship battles button. In the new experience this is all tied together. I'd like to see just that."
//
// The two loops cannot share a harbour. The old one asks how many HOURS you want to be away and sells battles
// separately; the new one gives you a number of ATTEMPTS a day, and the fight, the captain, the chart, the
// island are all inside one attempt. Showing both makes the page a menu of two games.
//
// ⚠️ OWNER ONLY, AND SEPARATE FROM CAPTAINS_PUBLIC ON PURPOSE. CAPTAINS_PUBLIC decides whether the expedition
// EXISTS for somebody. This decides whether it REPLACES what they had. They are different questions and the
// second one is the dangerous one: flipping it for everybody retires live sailing — durations, the dig, the
// battle economy — for every member at once. Live sailing is untouched for everyone else while this is
// owner-only, which is the whole point of a prototype.
export const SEAMLESS_ONLY = true;

export const SAILINGS_PER_DAY = 3;

// ── WHICH SHIP COMES OVER THE HORIZON ────────────────────────────────────────────────────────────────────────
// Scaled to the member's own boat, because the captain's STARS are the chart's grade and the chart's grade is
// the island's rung band. A member in a dinghy who is handed a five-star captain has been handed an island
// eight rungs above anything they can survive; a maxed member who only ever meets rank 1 is capped at the
// bottom shelf of the archipelago forever.
//
// `starsForRank` is ceil(rank/8), so ranks 1-8 are one star, 9-16 two, and so on to 40. Boat level runs 1..100
// across eleven hulls. Mapping level onto rank at roughly 0.4 gives a level-20 member ranks around 8 (two
// stars) and a level-90 member the high twenties (four), with the seed moving it a rung or two either way so
// two expeditions on one day are not the same fight.
export function huntRankFor(boatLevel, seed) {
    const lvl = Math.max(1, Number(boatLevel) || 1);
    const base = Math.max(1, Math.min(MAX_FLEET_RANK, Math.round(lvl * 0.4)));
    const wob = Math.round((hash(Math.floor(Number(seed) || 0) ^ 0x51d3, 0) - 0.5) * 4);
    return Math.max(1, Math.min(MAX_FLEET_RANK, base + wob));
}

/**
 * The quarry, in the shape `openEncounterBattle` takes — the same shape an island warden is in, for the same
 * reason. Stats come off the authored FLEET row so a rank 12 here and a rank 12 on the ladder are the same
 * ship; only the door differs.
 */
export function huntFoe(rank) {
    const ship = fleetShip(rank) || FLEET[0];
    return {
        id: `hunt_${ship.art}`,
        kind: "ship",
        // Tier drives the battle scene's tint and the encounter chrome. Five tiers over forty ranks.
        tier: Math.max(1, Math.min(5, Math.ceil(ship.rank / 8))),
        name: ship.name,
        cls: ship.cls,
        blurb: ship.flavor,
        hits: ship.hits,
        guns: ship.guns,
        accuracy: ship.accuracy,
        rake: ship.rake,
        ammo: ship.ammo,
        art: fleetArt(ship),
        rank: ship.rank,
    };
}

/**
 * The man on her quarterdeck, and what his chart will be worth.
 *
 * His handover line is baked in HERE rather than looked up on the screen, because the beat that shows it is a
 * client component and `handoverFor` lives beside the fleet — and because the line is part of what the row
 * recorded about that capture, not a thing to be re-derived later from a number.
 */
export function huntCaptain(rank) {
    const cap = captainFor(rank);
    return { ...cap, portrait: `/images/fleet/crew/${cap.art}.png`, handover: handoverFor(cap.stars) };
}

// How long the hunt at the front runs before the sail is alongside. The run to the island has its own number
// and it lives in expedition-view.js beside the wire shape that carries it; where the two encounters sit on
// that run is RUN_MARKS in island-wardens.js. Neither is restated here — a second copy of a number is a
// second, wrong game as soon as one of them moves. See [[balance-constants-never-copied]].
export const HUNT_MS = 16_000;
