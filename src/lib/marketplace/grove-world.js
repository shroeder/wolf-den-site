import { critStacks } from "@/lib/marketplace/arena-engine.js";
import { procFrom, drFrom, LIFESTEAL_PER_POINT } from "@/lib/marketplace/arena-kit.js";

// ── THE ZONE, AS A PLACE ─────────────────────────────────────────────────────────────────────────────────────
// Pure geometry and simulation for one zone: the platforms, who is standing on what, where everything is
// going. No DOM, no React, no db — the scene component owns pixels and this owns the world.
//
// ⚠️ EVERYTHING IS IN WORLD UNITS, NOT PIXELS. A zone is 100 units wide per screen of width and the renderer
// scales. Pixels belong to the camera; if the simulation knew about them the whole thing would behave
// differently on a phone than on a desktop, which is the bug that makes a platformer feel broken rather than
// merely different.
//
// ── WHY PLATFORMS ARE DATA AND NOT ART ───────────────────────────────────────────────────────────────────────
// Luke: "even hop up and down from platforms. Giving us a way to also make these zones vertical as well as
// horizontal." The backdrop is a painting; it has no idea where the ground is. So each zone carries a ladder
// of platforms and the painting sits behind them.

export const UNITS_PER_SCREEN = 100;

// ── ⚠️ GRAVITY, WALK AND HOP USED TO LIVE HERE, AND THAT WAS A SECOND COPY OF THE GAME ─────────────────────
// They are gone to grove-physics.js, where the solver that reads them is. Two reasons, both already paid for
// in this repo:
//
//   1. GRAVITY was declared HERE and again in grove-physics.js — the same fact in two files, which is how a
//      balance number ends up running a second, different game (balance-constants-never-copied). A jump
//      height is the pair (HOP, GRAVITY); separate them and the hero silently stops being able to reach the
//      first ledge, which reads as a level problem rather than as a constant having drifted.
//   2. WALK is not a speed any more. The solver ACCELERATES toward a direction (see drive()), so a top speed
//      is a ceiling rather than an assignment — that is the whole difference between a body with weight and
//      one whose position is authored frame by frame.
//
// The history is worth keeping, because the first set of these was wrong by two orders of magnitude and the
// scene looked perfectly fine while being unplayable: WALK 0.019 is 1.1 units a second, which is ninety
// seconds to cross one screen of a zone that is three to seven screens wide, and HOP 0.072 against GRAVITY
// 0.0042 clears 0.6 units when the lowest ledge is at 26. Enemies spawned, the hero took a step, and nothing
// in the zone could ever be reached by anybody.

// ── HOW BIG A ZONE IS, IN SECONDS ────────────────────────────────────────────────────────────────────────────
// Luke, playing it: "the levels are too long its too much walking."
//
// ⚠️ THE OLD ONE WAS A VIEW-SPACE CONSTANT WEARING A WORLD-SPACE NAME, which is the third time this file has
// been bitten by exactly that. It read `3 + min(4, floor((n-1)/3))` SCREENS and the caller multiplied by
// UNITS_PER_SCREEN = 100 — so a zone was "three to seven screens wide" in a frame that holds a hundred units.
// The camera does not hold a hundred units and never has: viewFor clamps the scale so the hero stays
// 19-26% of the viewport HEIGHT, and on a portrait phone that floor wins outright. Measured through the
// real viewFor:
//
//   phone 390x700   20.5 units on screen      zone 1 = 14.6 screens, 23s to walk end to end
//   desktop 1280    58.9 units on screen      zone 12 = 29.2 screens, 46s to walk end to end
//
// And a zone is crossed SEVERAL TIMES — it takes 20 to 80 kills to open the way and the population refills
// every 45 seconds — so zone 12 was asking for something over five minutes of holding a direction down.
//
// ⚠️ SO IT IS SIZED IN TIME NOW, WHICH IS THE ONE UNIT THAT CANNOT DRIFT WITH THE CAMERA. A player's
// experience of "too long" is seconds, not screens and not units: screens change meaning when the scale
// changes (that is this whole comment), and units never meant anything to anybody. drive() tops out at
// MAX_DRIVE units a frame at 60fps, so the width is simply that speed times the seconds a crossing should
// take — about ten at the Thicket, rising to eighteen in the Heartwood. check-grove.mjs asserts it.
export const TOP_SPEED = 0.22 * 60;          // drive()'s ceiling in units a second — see grove-physics drive()
export const CROSS_SECONDS = (n) => 9.8 + Math.min(11, Math.max(0, (Number(n) || 1) - 1)) * 0.76;
export const zoneWidth = (n) => Math.round(CROSS_SECONDS(n) * TOP_SPEED);

// How far apart the tiers are. ⚠️ ONE NUMBER, AND grove-physics.js HOP IS CHOSEN AGAINST IT — a standing
// hop rises 36 units, so a 26-unit tier is clearable with room to misjudge. Raise this past HOP_RISE and
// the entire vertical half of every zone silently becomes scenery again.
// ⚠️ 11, NOT 26 — see the long note on HOP in grove-physics.js. A tier at 26 units sat off the top of
// an eighteen-unit frame, so the only way to see the ledge you were climbing to was for the camera to crane
// up and lose the ground. At 11 it is about one and a half hero-heights: visible from the floor, reachable
// in one hop, and it finally puts something in the empty canopy that was four-fifths of every phone frame.
export const TIER_RISE = 11;
// How much of its parent a ledge must sit over. This is the landing window: a body standing on the ledge
// below has to be underneath the one above for a straight-up hop to put it there.
const TIER_OVERLAP = 7;

/**
 * The platform ladder for a zone. Deterministic from the zone number, so the server and the client agree
 * about the shape of the place and a player cannot claim to have stood somewhere there is no floor.
 *
 * Ground is always y=0 and always continuous — you can never be stranded. Everything above it is what makes
 * the zone vertical.
 *
 * ── ⚠️ IT IS A STAIRCASE NOW, AND IT USED TO BE THREE INDEPENDENT ROWS OF FLOATING SLABS ─────────────
 * Each tier was laid out across the whole zone with its own random x, which meant a tier-2 ledge had no
 * reason to have a tier-1 ledge anywhere beneath it — and a ledge with nothing under it is, with a 36-unit
 * hop and a 52-unit height, UNREACHABLE FOR EVER. scripts/check-grove-physics.mjs caught it the moment the
 * hero could climb at all: of 36 ledges across five zones, four were stranded, every one of them on a tier
 * above the first.
 *
 * ⚠️ AND THINGS WERE BEING SPAWNED ONTO THEM. spawnOnPlatform weights by width, so a stranded ledge got its
 * fair share of the zone's fifteen-to-thirty creatures — a tappable enemy, holding loot, that no player could
 * ever walk to, in a zone that is cleared by a kill count. That is the worst shape a bug can have: it costs
 * the player progress and reads as them being bad at it.
 *
 * So a ledge is now the child of a ledge below it and must overlap its parent. Which fixes the geometry and,
 * incidentally, the composition — a built staircase reads as somewhere to go, where scattered slabs at three
 * heights read as debris.
 */
export function platformsFor(zoneN, rand) {
    // ⚠️ zoneWidth IS UNITS NOW, NOT SCREENS. It used to be a screen count that every caller multiplied by
    // UNITS_PER_SCREEN; leaving that multiply here would make the zone a hundred times its own length.
    const w = zoneWidth(zoneN);
    // ⚠️ EACH LEDGE RECORDS THE ONE IT WAS BUILT ON TOP OF, and that is not bookkeeping — it is the route.
    // The generator is the only thing that ever KNOWS which ledge is reachable from which; rediscovering it
    // at run time from positions alone is guesswork, and guessing is what left the hero walking to the
    // nearest ledge, finding the next tier was above a DIFFERENT one, stepping off, falling, and starting
    // again for ever. A climb is a walk up this chain.
    const ground = { x: 0, w, y: 0, i: 0, parent: -1 };
    const out = [ground];
    // Later zones get more tiers — the Warren and the Palisade are meant to be climbed.
    const tiers = Math.min(3, Math.floor((zoneN - 1) / 4) + 1);

    let below = [ground];
    for (let t = 1; t <= tiers; t += 1) {
        const y = t * TIER_RISE;
        const row = [];
        // ── ⚠️ A TIER THAT CAN ROLL ITSELF OUT OF EXISTENCE IS NOT A TIER ────────────────────────
        // The first cut gave each parent a child on a dice roll, and across a handful of parents the whole
        // row could come up empty — zones ELEVEN and TWELVE, the two deepest in the map and the ones Luke
        // wanted climbed ("the Warren and the Palisade are meant to be climbed"), generated as FLAT: one
        // ground plank, three ledges, and nothing above them. A zone's shape is content, and content does
        // not get decided by an unguarded coin flip.
        //
        // So the dice choose WHERE and HOW MANY, never WHETHER. If a row comes up empty it is forced onto
        // the widest parent available, which is also the one most likely to have room for the overlap.
        for (const parent of below) {
            const want = parent.y === 0
                ? Math.max(2, Math.round(parent.w / 70))
                : (parent.w > 24 && rand() < 0.34 ? 2 : rand() < 0.78 ? 1 : 0);
            for (let i = 0; i < want; i += 1) addLedge(parent);
        }
        if (!row.length) addLedge([...below].sort((a, b) => b.w - a.w)[0], true);
        if (!row.length) break;
        for (const r of row) { r.i = out.length; out.push(r); }
        below = row;

        // Placing one ledge on a parent: inside the zone, overlapping its parent by at least TIER_OVERLAP,
        // and not shoulder to shoulder with a sibling. ⚠️ IT RETRIES RATHER THAN GIVING UP — a single
        // unlucky x used to drop the ledge entirely and silently, which is how a six-screen zone ended up
        // with three places to stand.
        function addLedge(parent, forced = false) {
            if (!parent) return;
            for (let attempt = 0; attempt < 8; attempt += 1) {
                // ⚠️ 13 TO 29 UNITS, WHICH IS HALF A SCREEN TO ONE AND A HALF. At 30-72 a ledge was
                // two to four screens wide: you could not see either end of it, so it read as another floor
                // rather than as a platform, and a platformer whose platforms have no visible edges is just
                // a corridor at a different height.
                const pw = 13 + rand() * 16;
                const lo = Math.max(2, parent.x - pw + TIER_OVERLAP);
                const hi = Math.min(w - pw - 2, parent.x + parent.w - TIER_OVERLAP);
                if (hi <= lo) return;
                const x = lo + rand() * (hi - lo);
                // Two ledges a few units apart on the same tier read as one broken ledge, and the gap
                // between them is a hole you fall down by accident.
                const crowded = row.some((r) => x < r.x + r.w + 8 && r.x < x + pw + 8);
                if (crowded && !(forced && attempt === 7)) continue;
                row.push({ x, w: pw, y, i: -1, parent: parent.i });
                return;
            }
        }
    }
    return out;
}

// ── WHAT GROWS ON A LEDGE ────────────────────────────────────────────────────────────────────────────────────
// Luke: "add sprite decorations like vines hanging from platforms where biome permits, the platforms are just
// way too plain."
//
// The biome (GROVE_BIOMES in grove-catalog.js) decides WHAT may grow; this decides WHERE. It is handed the
// resolved biome object rather than importing the table, because this file is import-free on purpose.
//
// ⚠️ ROLLED ONCE, AT ZONE BUILD, AND STORED ON THE LEDGE. The ledges are React-rendered, so anything decided
// during a render is re-decided on every re-render — and the scene re-renders whenever a telegraph appears.
// Vines that pick a new x sixty times a fight are not decoration, they are a flicker. The roll happens here,
// off the zone's own seeded rand, and the result is data like everything else in this file.
//
// ⚠️ AND NOTHING GOES ON THE GROUND PLANK. y === 0 is the floor, which the BACKDROP paints — the plank is not
// drawn at all (see the ledge list in GroveScene), so a vine hung on it would hang in mid-air over the grass.
const DEC_EDGE = 1.6;        // units of bare slab kept at each end, so nothing grows out of the rounded cap
const DEC_MIN_GAP = 2.4;     // units between two things on the same ledge, or they read as one lump

/**
 * Dress every ledge in a zone. Mutates each platform with a `dec` array and returns the platforms.
 *
 * Each entry is `{ t: "h" | "s", art, at, s, f, d }` — hanging or sitting, which sprite, the fraction along
 * the ledge it grows at, a scale, a horizontal flip, and an animation delay so no two sway in step.
 */
export function decorateLedges(platforms, biome, rand) {
    const hangs = biome?.hang || [];
    const sits = biome?.sit || [];
    for (const pf of platforms) {
        pf.dec = [];
        if (pf.y <= 0) continue;
        const usable = pf.w - DEC_EDGE * 2;
        if (usable < DEC_MIN_GAP) continue;
        // ⚠️ A COUNT PER TEN UNITS, NOT A COUNT PER LEDGE. A ledge is 13 to 29 units wide, so a flat "two
        // vines each" dresses the short one as a jungle and the long one as a bare plank — the same bug class
        // as a view-space constant, one number meaning two different densities.
        const want = (list, density) =>
            (list.length ? Math.max(1, Math.round((pf.w / 10) * density)) : 0);
        const place = (list, density, t) => {
            const n = want(list, density);
            const taken = pf.dec.filter((d) => d.t === t).map((d) => d.at * pf.w);
            for (let i = 0; i < n; i += 1) {
                // Spread across the usable span with jitter, then rejected if it lands on a sibling. Eight
                // tries and then give up: a ledge with one fewer vine on it is invisible, and a loop that
                // insists reads as a hang on a narrow ledge.
                for (let attempt = 0; attempt < 8; attempt += 1) {
                    const slot = n === 1 ? 0.5 : (i + 0.5) / n;
                    const x = DEC_EDGE + usable * Math.min(1, Math.max(0, slot + (rand() - 0.5) * 0.5));
                    if (taken.some((o) => Math.abs(o - x) < DEC_MIN_GAP)) continue;
                    taken.push(x);
                    pf.dec.push({
                        t,
                        art: list[Math.floor(rand() * list.length) % list.length],
                        at: x / pf.w,
                        s: 0.82 + rand() * 0.5,
                        f: rand() < 0.5 ? -1 : 1,
                        d: Math.round(rand() * 2600),
                    });
                    break;
                }
            }
        };
        place(hangs, biome?.density || 0, "h");
        place(sits, biome?.sitDensity || 0, "s");
    }
    return platforms;
}

// ── ⚠️ floorUnder IS GONE, AND IT WAS THE ROOT OF WHAT LUKE NOTICED ────────────────────────────────────────
// It answered "what is under me" from a position alone, which is not an answerable question: a body inside a
// ledge's x-span is either standing on top of that ledge or walking along underneath it, and only where it
// came FROM distinguishes those two. So nothing in the Grove was ever grounded on a ledge it had not been
// placed on, walking off a lip kept your height until your x left the span and then teleported you down, and
// a big frame could pass a body straight through a floor.
//
// surfaceUnder(platforms, x, fromY) in grove-physics.js replaces it and takes the height being fallen from,
// which is the entire difference. It is also what makes a platform ONE-WAY — landed on from above, passed
// through from below — without anybody writing a special case.

// ── ⚠️ THE SIM MOVED TO grove-physics.js ───────────────────────────────────────────────────────────────────
// stepBody and stepWander used to be here. They did not simulate movement, they AUTHORED it: vx was assigned
// from the sign of the distance to a target and zeroed on arrival, and y was snapped to whatever floorUnder
// returned. Everything therefore started and stopped instantly at exactly one speed, nothing had weight,
// nothing could be knocked back, nothing could be interrupted by a hit, and a wanderer strolled off every
// ledge in the zone because nothing ever looked ahead for the edge of the floor.
//
// What replaces them: integrate() + drive() + hop() + navigate() + wanderIntent(). The split is on purpose —
// an INTENT (which way, and whether to jump) is decided per creature, and the solver turns intents into
// positions. One solver, one set of rules, and a rootrat and the hero differ by a number.

// ── COMBAT ───────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Armor mitigated damage. Life steal applies for the character."
//
// ⚠️ ARMOUR IS DIMINISHING, NOT SUBTRACTIVE. Flat subtraction means that at enough armour an enemy's hit
// rounds to zero and the deep zones become free; a ratio keeps every zone dangerous and keeps armour worth
// stacking without ever reaching immunity. The 60 is the half-point: 60 armour halves incoming damage.
// ⚠️ ARMOUR_K = 60 IS GONE, AND IT HAD TO GO FOR THE SAME REASON power: 12 DID. It meant "60 armour halves
// a hit", which was right for a hero who carried 8 — and the hero carries 4,648 now. Every incoming blow in
// the game resolved to `Math.max(1, ...)`: a zone-12 creature did 1 damage to Eric, 1 to Littlewolf, 1 to
// everybody, so armour had stopped being a stat and become a constant, and nobody could die anywhere.
//
// The failure was not that the number was too small. It is that at this scale EVERY player compressed onto
// the floor — five accounts from 955 to 4,648 armour all took exactly the same 1 — which is the thing a
// defensive stat exists not to do.
//
// So mitigation is the ring's own model now, exactly as the swing is: toughnessFrom/drFrom on
// ARMOUR_TO_DOUBLE, which still separates those same five accounts across 32% to 61%. One armour curve in
// the game. See [[arena-offence-defence-parity]] and [[balance-constants-never-copied]].
export function mitigate(raw, armour) {
    const r = Math.max(0, Number(raw) || 0);
    return Math.max(1, Math.round(r * (1 - drFrom(Number(armour) || 0, 0))));
}

// ── ⚠️ CRIT STACKS, IT DOES NOT JUST ROLL ───────────────────────────────────────────────────────────────────
// Imported from the ring rather than written again, because this is the rule that makes crit worth stacking
// past 100% instead of silently wasting every point above it:
//
//   below 100%   the ordinary roll — you crit that often, for your crit damage
//   exactly 100  you crit every time
//   150%         you crit every time, and half the time that crit lands DOUBLED
//
// A Grove that capped crit at 75% would have told a member who built to 150% that half their investment
// bought nothing — which is the exact complaint this whole change is answering.
// See [[reuse-the-rule-never-restate-it]].

/**
 * A swing, with every stat the player built actually paying.
 *
 * Luke: "Every stat should be important that you have on your gear, as well as all the passives that you
 * get, just like the arena. Attack speed should matter... crit chance, crit damage... anything that's a
 * stat matters."
 *
 * `f` is the Grove fighter off grove-kit.js: damage, critChance and critMult already through the Arena's
 * curves, bleed as shares, lifesteal as raw points. Attack speed is NOT here — it paces the caller's swing
 * timer, not the arithmetic of one blow.
 *
 * ⚠️ THERE IS NO `doublestrike`, AND THAT IS NOT AN OVERSIGHT. The affix was retired in the Arena and its
 * points were converted to Ferocity (migration 415), because a second roll for a second blow was a second
 * route to the attack speed Ferocity already buys. Reviving it here would reintroduce exactly the double
 * payment the ring deleted. A build that wants to swing twice buys Ferocity, and tempo pays it.
 */
export function swing(f, targetArmour, rand) {
    const damage = Math.max(0, Number(f?.damage) || 0);
    const dmgPct = Math.max(0, Number(f?.dmgPct) || 0);
    const stacks = critStacks(Number(f?.critChance) || 0, rand);
    const critMult = Math.max(1, Number(f?.critMult) || 1);
    // Every whole multiple is one more application of crit damage, so a 150% build hits twice as hard as a
    // 100% one rather than identically.
    const mult = stacks > 0 ? Math.pow(critMult, stacks) : 1;
    const raw = Math.round(damage * (1 + dmgPct) * mult);
    const dealt = mitigate(raw, targetArmour);

    // LIFESTEAL IS RAW POINTS and the per-point rate lives with the engine, so a point is worth the same
    // here as it is in the ring.
    const healed = Math.round(dealt * procFrom(Number(f?.lifesteal) || 0, LIFESTEAL_PER_POINT));

    // ── BLEED: A SHARE OF THE BLOW THAT KEEPS ARRIVING ──────────────────────────────────────────────────
    // ⚠️ THE MAGNITUDE IS A SHARE OF WHAT LANDED, NOT A FLAT NUMBER. Piercing armour is bleed's identity —
    // the wound does not care what the target is wearing — but a flat tick would be enormous on a rootrat
    // and nothing on a boss. bleedDamage scales the share, exactly as it does in the ring.
    // See [[bleed-front-load-magnitude]].
    const bleeds = (Number(f?.bleedChance) || 0) > 0 && rand() < Number(f.bleedChance);
    const bleed = bleeds
        ? { dmg: Math.max(1, Math.round(dealt * (BLEED_SHARE + (Number(f?.bleedDamage) || 0)))),
            leech: Math.max(0, Math.min(0.9, Number(f?.bleedLeech) || 0)) }
        : null;

    return { dealt, crit: stacks > 0, stacks, healed, bleed };
}

/** What one bleed tick is worth, before bleedDamage deepens it. A share of the blow that applied it. */
export const BLEED_SHARE = 0.18;
/** How often a wound ticks, and for how long. Short enough to read as bleeding, long enough to matter. */
export const BLEED_TICK_MS = 700;
export const BLEED_TICKS = 5;
// ── THE PET FIGHTS ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I want the pet that you have equipped to matter in the grove, like its level, its rarity. I want it
// to attack, and I want it to do like the associated kind of damage that reflects its rarity and level."
//
// ⚠️ A SHARE OF YOUR OWN BLOW, NOT A NUMBER OF ITS OWN. This is the whole design decision and everything
// else follows from it.
//
// A pet with its own damage figure has to be balanced against the hero's, and the hero's spans three orders
// of magnitude: an account opened this morning swings for single digits and a best-in-slot veteran with a
// full badge set swings for thousands (see grove-kit.js). Any flat number is therefore wrong twice — it is
// the entire fight at zone one and it is a rounding error at zone twelve. Pick a number that matters to the
// veteran and the pet solos the early game; pick one that is polite there and the pet is cosmetic again by
// the time anybody has a rare one, which is the exact complaint this is answering.
//
// A share cannot drift out of relevance. It rides every stat the member has ever invested in, for free and
// for ever, because it is a share OF that investment — which is also what the game already says a pet is:
// "a pet is an extension of you, not a creature with its own sheet" (arena.js). The Grove's reading of that
// line is that your companion hits for a fraction of what you hit for.
//
// ⚠️ AND IT GOES THROUGH swing(), THE HERO'S OWN FUNCTION. Crit chance, crit damage, the crit STACKS a
// 150%-crit build earns, dmgPct and armour mitigation all apply to the pet's blow exactly as they do to
// yours, because it is the same arithmetic with a smaller damage figure fed in. A second damage formula here
// would be a second thing to update every time the first one moves. See [[reuse-the-rule-never-restate-it]].

// -- WHAT A RARITY IS WORTH ----------------------------------------------------------------------------------
// The share of one of your swings that a Lv1 pet of each rarity bites for. Rarity is the coarse lever and
// level is the fine one, so the two together span 5% (a common you were given) to 39% (an eternal you have
// spent three months growing) of your own damage.
//
// ⚠️ IT COVERS ALL NINE TIERS, INCLUDING THE TWO NO PET HAS YET. Four pets in the game are eternal and none
// is celestial or primordial — but the Den has minted those tiers elsewhere, and a rarity table that stops
// at the highest rarity currently in use is the single most repeated bug in this repo: fifty-nine lookups
// never grew past `eternal` and quietly fell back DOWNWARD, which forged celestial gear at a 625th of its
// price. See [[rarity-tables-stop-at-eternal]], [[ladder-lookups-must-fail-upward]].
export const PET_BITE_BY_RARITY = {
    common: 0.05, rare: 0.065, epic: 0.085, legendary: 0.105, mythic: 0.13,
    ascendant: 0.155, eternal: 0.185, celestial: 0.22, primordial: 0.26,
};
// The order the tiers climb in, so an unknown rarity can fail UPWARD to the top of the ladder rather than
// collapsing to `common`. A pet whose rarity this file has never heard of is far likelier to be a tier added
// above eternal than a new kind of common.
const PET_BITE_TIERS = ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial"];

// -- WHAT A LEVEL IS WORTH -----------------------------------------------------------------------------------
// Lv1 to Lv6 roughly doubles the bite (x2.1 at the top). Deliberately NOT petActiveLevelMult, which is the
// equipped pet's ACTIVE curve and runs to x3.5: multiplied into a share that is already rarity-scaled, x3.5
// would put a maxed eternal pet at 65% of your swing, which is a second hero rather than a companion.
//
// The ceiling is the design: at the very top the pet is a bit over a third of one of your blows, landing at
// about half your rate, so it is worth having, worth levelling, and never the thing killing the creature.
export const PET_BITE_PER_LEVEL = 0.22;
export const PET_BITE_MAX_LEVEL = 6;

/** The share of one hero swing this pet bites for. Rarity sets the floor, level multiplies it. */
export function petBiteShare(rarity, level = 1) {
    const known = String(rarity || "").toLowerCase();
    // Unknown rarity fails UPWARD: an unrecognised tier is treated as the top of the ladder, never as the
    // bottom of it. A missing pet is the one case that is genuinely nothing, and the caller handles that by
    // not calling this at all.
    const base = PET_BITE_BY_RARITY[known] ?? PET_BITE_BY_RARITY.primordial;
    const lv = Math.max(1, Math.min(PET_BITE_MAX_LEVEL, Math.round(Number(level) || 1)));
    return base * (1 + (lv - 1) * PET_BITE_PER_LEVEL);
}

// -- HOW OFTEN -----------------------------------------------------------------------------------------------
// ⚠️ ONE LEVER, AND IT IS THE DAMAGE. Cadence is deliberately NOT a second thing rarity and level move: two
// levers on one axis multiply, so a maxed pet would have been 2.1x the damage at 2.1x the rate and the
// "share of your swing" ceiling above would have been a lie by a factor of four.
//
// It tracks the hero's attack speed instead, because a pet that keeps its own fixed rhythm while a tempo-4
// build swings every 102ms stops reading as joining in — it becomes an unrelated thing happening nearby.
// Halved relative to yours, so you are always visibly the one doing the work.
export const PET_BITE_EVERY = 2;
// ⚠️ AND A FLOOR, WHICH IS THE ANSWER TO "it might just get too noisy and confusing". At tempo 4 the hero
// swings every 102ms; half of that is a bite every 51ms, which is not an attack, it is a strobe with damage
// numbers coming out of it. The floor caps the pet at about three bites a second however fast you get, and
// the damage it does not deal below the floor is deliberately dropped rather than banked.
export const PET_BITE_MIN_MS = 300;

/** How long between bites, given the hero's current swing cooldown. */
export const petBiteCd = (heroCdMs) => Math.max(PET_BITE_MIN_MS, (Number(heroCdMs) || 0) * PET_BITE_EVERY);

/**
 * The pet's blow: the hero's own swing, at a share of the damage.
 *
 * ⚠️ LIFESTEAL AND BLEED ARE STRIPPED, AND BOTH FOR THE SAME REASON — they are the hero's weapon drinking
 * and the hero's blade cutting, and a second body applying them is one investment paying twice. Bleed also
 * REFRESHES rather than stacks (see the wound note in GroveScene), so a pet re-applying a weaker wound on
 * top of the hero's stronger one would actively fight the player's own build.
 *
 * Crit is kept, and kept in full: a member who built to crit sees their pet crit, which is the point of
 * every stat mattering.
 */
export function petBite(f, share, targetArmour, rand) {
    const s = Math.max(0, Number(share) || 0);
    if (!s) return { dealt: 0, crit: false, stacks: 0, healed: 0, bleed: null };
    const blow = swing({ ...f, damage: (Number(f?.damage) || 0) * s, lifesteal: 0, bleedChance: 0 },
        targetArmour, rand);
    // A bite always lands for at least 1 if it landed at all, the same floor a bleed tick has: a pet whose
    // share rounds to zero against a heavily-armoured boss reads as broken, not as weak.
    return { ...blow, dealt: Math.max(1, blow.dealt), healed: 0, bleed: null };
}


// ── TELEGRAPHS ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "He is unique had different attack animations that telecast where they will damage" and enemies
// "Also telecasting."
//
// A telegraph is a window with a PLACE: the attack announces where it will land, the player has `ms` to not
// be standing there, and then it resolves against whoever is. That is the whole mechanic — it is what makes
// standing still wrong without making the fight twitchy.
// ⚠️ THIS RETURNS A LIST, AND IT KEYS ON foe.uid.
//
// Two things were wrong and both were invisible:
//
//   1. IT STORED foe.id, WHICH THE RESOLVER LOOKED UP AS f.uid. `id` is the enemy TYPE ("rootrat"); `uid` is
//      the individual body ("f17-480213"). They never matched, so every telegraph in the game resolved
//      against a null foe and fell through to a hardcoded 5 damage — which means the Elderling's [31, 47],
//      every boss number, and the entire dmgPerZone climb did nothing at all. Twelve zones of difficulty
//      curve, and one wrong property name flattened the lot to five.
//
//   2. ONE TELEGRAPH PER ATTACK. A volley lands in three places at once, so the shape has to be a list.
//
// `attack` is a row from a boss's `attacks` (see GROVE_BOSSES). Omitted, this falls back to the creature's own
// single wind-up, which is what every wanderer uses.
// ── ⚠️ A TELEGRAPH HAS TO BE DODGEABLE, AND NOT ONE OF THEM WAS ────────────────────────────────────────
// A band is centred on where you were standing when the attack was cast, so dodging means covering more than
// its reach before it fires. The hero moves 0.26 units a frame, which is 15.6 units a second. So:
//
//   attack   tell     you can cover   old reach   could you dodge it?
//   slam     620ms    9.7 units       13          no
//   sweep    1050ms   16.4 units      34          not even close
//   wanderer 650ms    10.1 units      10          only by standing exactly on the edge
//
// Every wind-up in the feature was a slow hit with a light show on it, which is the exact thing Luke asked
// for the OPPOSITE of. Worse, at the scale the scene actually renders at, a 10-unit reach is a band TWENTY
// UNITS WIDE on an eighteen-unit frame: the tell covered more than the whole screen, so there was visibly
// nowhere to go even if you were fast enough to get there.
//
// ⚠️ THE DEFAULT IS NOW THE CREATURE'S OWN SIZE. A band that matches the body making it reads as that
// creature's reach rather than as an arbitrary rectangle, which is the other half of a telegraph working:
// you learn that the big thing hits further because you can see that it does.
// Against the slower walk: a 650ms wind-up gives the hero 8.6 units of travel, so a band wider than about
// six units either way cannot be left. And six units is already a third of the visible frame.
export const REACH_MIN = 2.5;
export const REACH_MAX = 6;
export const reachOf = (foe) => Number(foe?.reach)
    || Math.max(REACH_MIN, Math.min(REACH_MAX, (Number(foe?.h) || 5) * 0.9));

export function makeTelegraph(foe, at, now, attack = null) {
    const ms = Number(attack?.telegraph) || Number(foe.telegraph) || 600;
    const reach = Number(attack?.reach) || reachOf(foe);
    const shots = Math.max(1, Number(attack?.shots) || 1);
    const spread = Number(attack?.spread) || 0;
    const out = [];
    for (let i = 0; i < shots; i += 1) {
        // Centred on the target: an odd volley puts one directly on you and the rest either side, so there
        // is always somewhere to run to. A volley with no gap is not a telegraph, it is a tax.
        const off = shots === 1 ? 0 : (i - (shots - 1) / 2) * spread;
        out.push({
            uid: `t${Math.round(now)}-${i}-${foe.uid || foe.id}`,
            foeUid: foe.uid || null,
            kind: attack?.kind || "slam",
            mult: Number(attack?.mult) || 1,
            x: at + off,
            // ⚠️ A TELEGRAPH HAS A FLOOR, AND IT USED NOT TO. Every band was drawn at the zone's ground line
            // and resolved on x alone, so a creature standing on a ledge 26 units above you could hit you
            // through the floor it was standing on, and its tell was painted somewhere you were not looking.
            // Attacks belong to the surface they are made on — that is also what makes a ledge worth climbing
            // onto, and worth hopping off.
            y: Number(foe.y) || 0,
            r: reach,
            ms,
            fires: now + ms,
            spawned: now,
        });
    }
    return out;
}

// ⚠️ AND IT TAKES A y. The vertical window is generous (one body height) rather than exact, because a
// telegraph is a danger ZONE and clipping it to a hairline would mean a hop over a slam that visibly
// connected. Standing one tier up is safe; standing on the lip of the same ledge is not.
export const TEL_V_REACH = 7;
export const telegraphHits = (tel, x, y = 0) =>
    Math.abs(x - tel.x) <= tel.r && Math.abs((Number(y) || 0) - (Number(tel.y) || 0)) <= TEL_V_REACH;
