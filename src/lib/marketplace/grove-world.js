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

// A zone is this many screens wide. Zone 1 is small and they open out.
export const zoneWidth = (n) => 3 + Math.min(4, Math.floor((n - 1) / 3));

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
    const w = zoneWidth(zoneN) * UNITS_PER_SCREEN;
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
export const ARMOUR_K = 60;
export function mitigate(raw, armour) {
    const a = Math.max(0, Number(armour) || 0);
    return Math.max(1, Math.round(raw * (ARMOUR_K / (ARMOUR_K + a))));
}

/** A swing. Returns what landed and what it healed, so the caller can float both. */
export function swing({ power, critRate = 0, critDamage = 0, lifeSteal = 0 }, targetArmour, rand) {
    const crit = rand() < Math.min(0.75, (Number(critRate) || 0) / 100);
    const raw = Math.round(power * (crit ? 1 + Math.max(0.5, (Number(critDamage) || 0) / 100) : 1));
    const dealt = mitigate(raw, targetArmour);
    return { dealt, crit, healed: Math.round(dealt * (Math.max(0, Number(lifeSteal) || 0) / 100)) };
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
