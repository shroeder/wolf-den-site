import "server-only";

// ── THE EXPEDITION: OPEN THE CHART, PUSH OFF, WALK THE ISLAND ────────────────────────────────────────────────
// The rows half. islands.js, chart-plot.js, island-world.js and island-wardens.js are all pure and hold every
// rule; this is the only file in the feature that writes anything or pays anybody.
//
// The loop, end to end:
//
//   openChart   spend the best chart in hand, resolve WHICH island it names, draw the face   → phase "plot"
//   commitBearings  mark the three bearings, fix the landfall, roll the two fights          → phase "course"
//   reachMark   the client reaches a mark in the thirty seconds; a warden comes alongside    (battle_state)
//   goAshore    the boat beaches                                                             → phase "ashore"
//   takeNode    walk somewhere and take what is standing there                               (repeats)
//   leaveIsland the tide turns, or you call it, and the boat goes home                       → phase "done"
//
// ⚠️ THE CHART IS SPENT AT `openChart` AND THE ISLAND IS DECIDED THERE TOO. Not at push-off, and never lazily
// on first read: an island resolved when you got round to looking would be a destination that depends on the
// clock. The captain named a place when he named it.
//
// ⚠️ AND NOTHING IN HERE CAN COST SOMEBODY THE PRIZE. `landfall()` guarantees the tide is long enough to walk
// from the beach to the mark, measured rather than assumed, and scripts/island-sim.mjs asserts it over 250,000
// plots on every island at every grade. If that ever starts failing this feature is a wall — see
// [[captains-brig]] for what happened the last time a step in the middle of this loop could fail.

import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { captainsOpenTo } from "@/lib/marketplace/captains.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { boatArt, boatLevelFromUpgrades, boatName, boatTier, openEncounterBattle, payFleetReward } from "@/lib/marketplace/sailing.js";
import { ISLANDS, islandById, islandCard, prizeFor } from "@/lib/marketplace/islands.js";
import { bearingAccuracy, bearingFace, bearingScore, chartFace, landfall, plotBand } from "@/lib/marketplace/chart-plot.js";
import { HUNT_MS, SAILINGS_PER_DAY, huntCaptain, huntFoe, huntRankFor } from "@/lib/marketplace/hunt.js";
import { TAKEABLE, nodeAt, nodeValue, reachable } from "@/lib/marketplace/island-world.js";
import { RUN_MS, phaseAfter, viewOf } from "@/lib/marketplace/expedition-view.js";
import { RUN_MARKS, escortFor, wardenArt, wardenFor } from "@/lib/marketplace/island-wardens.js";

// The client animates the run and asks for a mark when it reaches one; the server checks the wall clock has
// actually got there, so the run cannot be skipped and a locked phone comes back to a boat that has already
// arrived rather than to a broken expedition. RUN_MS itself lives in expedition-view.js beside the shape.
const RUN_GRACE_MS = 400;    // the client's animation frame can beat the server's clock by a frame or two

const jsonb = (v) => JSON.stringify(v ?? null);
const asArr = (v) => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || "[]"); } catch { return []; } })());

// ── THE GATE ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ ONE SWITCH, READ IN EVERY DOOR. CAPTAINS_PUBLIC already gates the capture and the helm's charted option;
// the expedition is the third door and it reads the SAME constant, because a member who can hold a chart but
// cannot open it has been sold something they cannot look at. See [[feature-gates-come-in-pairs]] and the
// master list in [[sailing-test-overrides]].
export const expeditionsOpenTo = (buyerId) => captainsOpenTo(isOwner(buyerId));

async function readExpedition(buyerId) {
    return db.queryOne(
        `SELECT * FROM mkt_ship_expedition WHERE buyer_id = $1 AND ended_at IS NULL LIMIT 1`, [buyerId]
    ).catch(() => null);
}

const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : (() => { try { return JSON.parse(v || "{}") || {}; } catch { return {}; } })());

// ── ⚠️ WHEN THE DAY TURNS OVER, AND WHY THIS IS NOT `::date` ─────────────────────────────────────────────────
// `opened_at >= (NOW() AT TIME ZONE 'America/Chicago')::date` looks right and is wrong. The left side is a
// timestamptz and the right side is a bare DATE, so Postgres promotes the date using the SESSION time zone —
// and src/lib/db.js never sets one, so on Neon that is UTC. The cutoff lands at UTC midnight of the Chicago
// date, which is 7pm Chicago THE EVENING BEFORE.
//
// What that does to a player: sail three times at 8pm on Monday and on Tuesday morning you still have none,
// because Tuesday's allowance does not begin until 7pm Tuesday. Every evening sailing is charged to two days.
//
// The round trip is the fix, and it is the idiom the rest of the codebase already uses (chests.js does it
// this way). Declared once because it is now asked in two places and a predicate copied into two SQL strings
// is two predicates the moment one of them is edited.
const SINCE_MIDNIGHT = "date_trunc('day', NOW() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'";

// ── 0 · SET SAIL ─────────────────────────────────────────────────────────────────────────────────────────────
// The journey begins here now, before a chart exists. Luke: *"you get a certain amount of sailing attempts per
// day and there's no longer a sailing duration."*
//
// ⚠️ EVERYTHING IS DECIDED AT THE PUSH-OFF, AND NOTHING IS REVEALED. The quarry, her captain, his stars, the
// seed and therefore the island are all resolved in this one write. That is not the same as telling anybody:
// `viewOf` withholds the lot until the fight is won, the way it has always withheld the fix during the plot.
// Resolving late would mean a destination that depends on when you got round to looking, which is the thing
// openChart's comment has warned about since the feature was built.
export async function sailingsLeft(buyerId) {
    const r = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_ship_expedition
          WHERE buyer_id = $1 AND opened_at >= ${SINCE_MIDNIGHT}`, [buyerId]
    ).catch(() => null);
    return leftOf(r?.n);
}

/** The allowance arithmetic, once, so the inline read on the state and this cannot drift apart. */
const leftOf = (usedToday) => Math.max(0, SAILINGS_PER_DAY - (Number(usedToday) || 0));

export async function setSail(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const already = await readExpedition(buyerId);
    if (already) return { ok: true, ...(await getExpeditionState(buyerId)) };
    if ((await sailingsLeft(buyerId)) <= 0) return { ok: false, error: "no_sailings", ...(await getExpeditionState(buyerId)) };

    // The seed is the chart's face AND the island's layout AND the quarry's wobble — one number, as it has
    // always been, so the whole journey is reproducible from the row.
    const seed = Math.floor(Math.random() * 2147483647);
    const sail = await db.queryOne(
        `SELECT COALESCE(speed_level,0) AS s, COALESCE(luck_level,0) AS f, COALESCE(rarity_level,0) AS r,
                COALESCE(find_level,0) AS l, COALESCE(raid_level,0) AS rd
           FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);
    const level = boatLevelFromUpgrades(sail?.s || 0, sail?.f || 0, sail?.r || 0, sail?.l || 0, sail?.rd || 0);
    const rank = huntRankFor(level, seed);
    const foe = huntFoe(rank);
    const captain = huntCaptain(rank);
    const grade = Math.max(1, Math.min(5, Number(captain.stars) || 1));
    const isle = islandForChartSafe(seed, grade);

    const ins = await db.queryOne(
        `INSERT INTO mkt_ship_expedition (buyer_id, seed, grade, island, phase, journey, ran_at)
         VALUES ($1, $2, $3, $4, 'hunt', $5::jsonb, NOW())
         ON CONFLICT DO NOTHING RETURNING id`,
        [buyerId, seed, grade, isle.id, jsonb({ rank, foe, captain, huntMs: HUNT_MS })]
    ).catch(() => null);
    if (!ins) return { ok: true, ...(await getExpeditionState(buyerId)) };
    await trackActivity(buyerId, "expedition_set_sail", { rank, grade, island: isle.id }).catch(() => {});
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

// islandForChart lives in chart-plot and can only return a real island, but a bad grade would throw here
// rather than at the screen, and this write is the one that cannot fail.
function islandForChartSafe(seed, grade) {
    try {
        const face = chartFace(seed, grade);
        return islandById(face.island) || ISLANDS[0];
    } catch { return ISLANDS[0]; }
}

// ── 0b · SHE IS ALONGSIDE ────────────────────────────────────────────────────────────────────────────────────
// The client sails the hunt on its own clock and asks for the fight when the sail it has been watching grow is
// finally on top of it. The server checks the wall clock the same way the run's marks are checked, so the
// approach cannot be skipped by a fast tap.
export async function engage(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row || row.phase !== "hunt") return { ok: false, error: "not_hunting" };
    const j = asObj(row.journey);
    const since = row.ran_at ? Date.now() - new Date(row.ran_at).getTime() : 0;
    if (since + RUN_GRACE_MS < (Number(j.huntMs) || HUNT_MS)) return { ok: false, error: "not_yet" };

    const busy = await db.queryOne(`SELECT battle_state FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (busy?.battle_state) return { ok: true, ...(await getExpeditionState(buyerId)) };

    const foe = j.foe || huntFoe(Number(j.rank) || 1);
    const sailing = await db.queryOne(`SELECT * FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    await openEncounterBattle(buyerId, foe, sailing || {}, {
        kind: "hunt", art: foe.art, extra: { expeditionId: Number(row.id) },
    });
    return { ok: true, fight: true, ...(await getExpeditionState(buyerId)) };
}

// ── 0c · SHE IS TAKEN ────────────────────────────────────────────────────────────────────────────────────────
// Called by the battle finisher in sailing.js. A WIN takes her captain and moves to the beat that says so; a
// LOSS ends the journey and the sailing is spent — which is the whole tension of an allowance.
export async function huntFinished(buyerId, meta, res) {
    const row = await readExpedition(buyerId);
    if (!row || row.phase !== "hunt") return null;
    if (!res?.win) {
        await db.query(`UPDATE mkt_ship_expedition SET phase = 'lost', ended_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});
        await trackActivity(buyerId, "expedition_lost", { rank: asObj(row.journey).rank || 0 }).catch(() => {});
        return { lost: true };
    }
    await db.query(`UPDATE mkt_ship_expedition SET phase = 'spoils' WHERE id = $1`, [row.id]).catch(() => {});
    await trackActivity(buyerId, "captain_taken", { rank: asObj(row.journey).rank || 0, grade: Number(row.grade) || 1 }).catch(() => {});
    return { captain: asObj(row.journey).captain || null };
}

// ── 0d · THE GLASS GOES UP ───────────────────────────────────────────────────────────────────────────────────
// The spoils beat has been read. Nothing is decided here; it is the door between a beat you look at and a beat
// you play, and it exists as a server phase rather than a client flag so a reload lands you back on the right
// screen rather than on the one before it.
export async function readSpoils(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row) return { ok: true, ...(await getExpeditionState(buyerId)) };
    if (row.phase === "spoils") {
        await db.query(`UPDATE mkt_ship_expedition SET phase = $2 WHERE id = $1`, [row.id, phaseAfter("spoils")]).catch(() => {});
    }
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

// ── 0e · THREE BEARINGS ──────────────────────────────────────────────────────────────────────────────────────
// The rebuilt minigame's one write. The browser owns the sweep — sixty frames a second of a glass moving is
// nothing that belongs on a wire — and posts three numbers. The server regenerates the same face off the same
// seed and marks them, so a client that posts three perfect bearings has posted three numbers it was always
// going to be marked on.
//
// ⚠️ IT STILL PRODUCES AN `accuracy` AND HANDS IT TO THE SAME `landfall()`. That is what keeps the promise the
// whole feature rests on: the tide is measured off the real walk plus a floor, so a bad reading lands you
// further out and never nowhere. See [[charted-expedition]] and section 1 of scripts/island-sim.mjs.
//
// ⚠️ AND IT CANNOT REFUSE. Missing, wild or malformed bearings score zero and sail anyway. A minigame that can
// ERROR is a minigame that can cost somebody the captain they just beat — which is the interrogation all over
// again, and that one was deleted for it.
export async function commitBearings(buyerId, taken) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row) return { ok: false, error: "no_expedition" };
    if (row.phase !== "bearings") return { ok: true, ...(await getExpeditionState(buyerId)) };

    const isle = islandById(row.island) || ISLANDS[0];
    const face = bearingFace(Number(row.seed), Number(row.grade));
    const list = (Array.isArray(taken) ? taken : []).slice(0, face.marks.length).map((n) => Number(n));
    const accuracy = bearingAccuracy(face, list);
    const lf = landfall(chartFace(Number(row.seed), Number(row.grade)), accuracy, isle.span);

    // The two encounters on the way in, decided here so the run has a schedule the server can check against.
    const escort = escortFor(isle.id, Number(row.seed));
    const warden = wardenFor(isle.id);
    const marks = [escort, warden].filter(Boolean).map((foe, i) => ({
        at: RUN_MARKS[i] ?? 0.5, foe: foe.id, name: foe.name, art: foe.art,
        anchorage: Boolean(foe.anchorage), done: false,
    }));

    const j = asObj(row.journey);
    await db.query(
        `UPDATE mkt_ship_expedition
            SET phase = 'course', accuracy = $2, span = $3, entry = $4, fix_index = $5, tide = $6,
                marks = $7::jsonb, journey = $8::jsonb
          WHERE id = $1`,
        [row.id, accuracy, lf.span, lf.entry, lf.fixIndex, lf.tide, jsonb(marks),
            jsonb({ ...j, bearings: list, scores: face.marks.map((m, i) => bearingScore(m, list[i])) })]
    ).catch(() => {});
    await trackActivity(buyerId, "chart_solved", { island: isle.id, accuracy: Math.round(accuracy * 100) }).catch(() => {});
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

// ── 0f · THE COURSE IS SET ───────────────────────────────────────────────────────────────────────────────────
// The second beat has been read and the boat pushes off for the island. `ran_at` is re-stamped HERE rather
// than at the bearings, so the run's clock starts when the run starts — reading a beat for a minute must not
// spend a minute of the sail.
export async function setCourse(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row) return { ok: true, ...(await getExpeditionState(buyerId)) };
    if (row.phase === "course") {
        await db.query(`UPDATE mkt_ship_expedition SET phase = $2, ran_at = NOW() WHERE id = $1`, [row.id, phaseAfter("course")]).catch(() => {});
    }
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

// ── WHAT THE SCREEN SEES ─────────────────────────────────────────────────────────────────────────────────────
export async function getExpeditionState(buyerId) {
    if (!buyerId) return { ok: false, error: "no_session" };
    if (!expeditionsOpenTo(buyerId)) return { ok: true, open: false, charts: 0, gated: true };

    const row = await readExpedition(buyerId);
    // The chart count is gated at the QUERY, not just at the render — every member loads this on a harbour
    // visit, and a count that leaks is a feature announcing itself.
    // ONE query for both, because this is read on every poll of the page and two round trips for two small
    // numbers is exactly the shape CLAUDE.md calls the bill. The avatar rides along because the walker on the
    // island has to BE the member — a gold capsule standing in for them is temp scaffolding, and the sprite is
    // one column on a row we are already touching.
    // ⚠️ THE BOAT RIDES ALONG ON THIS ROW TOO, AND IT IS A LEFT JOIN. The hull that sails the thirty seconds
    // and sits beached on the island is the member's OWN — one of eleven forms — not a glyph. mkt_sailing is
    // LEFT JOINed because a member can hold a chart without ever having launched (a fleet win pays one), and
    // an INNER JOIN there would drop the avatar and the chart count with it.
    const held = await db.queryOne(
        `SELECT (SELECT COUNT(*)::int FROM mkt_ship_chart WHERE buyer_id = $1 AND sailed_at IS NULL) AS n,
                -- ⚠️ THE DAY'S SAILINGS COME ALONG ON THIS ROW, NOT ON A SECOND QUERY. They were a separate
                -- queryOne for one integer, on a read that runs on mount and after EVERY action of the
                -- journey — which is the exact shape CLAUDE.md calls the bill, since neon() is the HTTP
                -- driver and every query is its own TLS handshake. A scalar subquery costs nothing here.
                (SELECT COUNT(*)::int FROM mkt_ship_expedition
                  WHERE buyer_id = $1 AND opened_at >= ${SINCE_MIDNIGHT}) AS today,
                b.avatar_sprite_url AS art, b.avatar_sprite_flip AS flip,
                COALESCE(s.speed_level, 0) AS speed_level, COALESCE(s.luck_level, 0) AS luck_level,
                COALESCE(s.rarity_level, 0) AS rarity_level, COALESCE(s.find_level, 0) AS find_level,
                COALESCE(s.raid_level, 0) AS raid_level
           FROM mkt_buyer b LEFT JOIN mkt_sailing s ON s.buyer_id = b.id
          WHERE b.id = $1`, [buyerId]
    ).catch(() => null);
    const hero = { art: held?.art || null, flip: held?.flip === true };
    const boat = shipOf(held);
    const charts = Number(held?.n) || 0;

    const sailings = leftOf(held?.today);
    if (!row) return { ok: true, open: false, charts, hero, boat, sailings, perDay: SAILINGS_PER_DAY };
    return { ok: true, open: true, charts, hero, boat, sailings, perDay: SAILINGS_PER_DAY, expedition: viewOf(row) };
}

// The hull to draw, off the five upgrade tracks — the SAME sum the helm and the profile take, called rather
// than restated. A member who has never launched has no mkt_sailing row and still gets the starter dinghy,
// because the alternative on screen is nothing at all where a boat should be.
function shipOf(row) {
    const level = boatLevelFromUpgrades(
        row?.speed_level || 0, row?.luck_level || 0, row?.rarity_level || 0, row?.find_level || 0, row?.raid_level || 0,
    );
    return { art: boatArt(level), name: boatName(level), tier: boatTier(level) };
}


// ── 1 · OPEN THE CHART ───────────────────────────────────────────────────────────────────────────────────────
// Spends the best chart in hand — same "best one is spent" rule the helm has always used — and resolves the
// island there and then. Marked sailed BEFORE the expedition row is written, conditionally, so a double tap
// cannot put one chart on two expeditions; there is no transaction on this driver to lean on (see
// [[postgres-landmines]]), so nothing between the UPDATE and the INSERT is allowed to throw.
// ⚠️ IT OPENS AT `bearings`, NOT AT `plot`, AND THAT IS A STUCK-STATE FIX.
// The seamless journey takes its chart off a captain at the front of the run, so nothing NEW ever arrives
// here. But members who beat a fleet ship under the old rules are still holding rows in mkt_ship_chart, and
// this is the only door those rows have. It used to open them at phase 'plot' — a phase the rebuilt client
// renders NOTHING for, because the ring-and-pin screen it belonged to is gone. That is an expedition a member
// cannot leave, on a table with a one-open-row unique index, which means they could never sail again either.
// Old charts land in the glass with everyone else.
export async function openChart(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const already = await readExpedition(buyerId);
    if (already) return { ok: true, ...(await getExpeditionState(buyerId)) };

    const [chart] = await db.query(
        `UPDATE mkt_ship_chart SET sailed_at = NOW()
          WHERE id = (SELECT id FROM mkt_ship_chart WHERE buyer_id = $1 AND sailed_at IS NULL
                       ORDER BY grade DESC, made_at LIMIT 1)
          RETURNING id, grade, seed`, [buyerId]
    ).catch(() => []);
    if (!chart) return { ok: false, error: "no_chart" };

    // A chart minted before migration 449 could still be holding a NULL seed if the backfill missed it; derive
    // the same way the migration does rather than refusing to open a chart somebody earned.
    const seed = Number(chart.seed) || ((Number(chart.id) * 7919 + 104729) % 2147483647);
    const grade = Math.max(1, Math.min(5, Number(chart.grade) || 1));
    const face = chartFace(seed, grade);

    const made = await db.queryOne(
        `INSERT INTO mkt_ship_expedition (buyer_id, chart_id, seed, grade, island, phase)
         VALUES ($1,$2,$3,$4,$5,'bearings') RETURNING *`,
        [buyerId, Number(chart.id), seed, grade, face.island]
    ).catch(() => null);
    // The unique partial index is the real guard against two tabs. If it raised, somebody else already opened
    // one — hand back whatever is open rather than an error about a race the player did not cause.
    if (!made) return { ok: true, ...(await getExpeditionState(buyerId)) };

    await trackActivity(buyerId, "chart_opened", { grade, island: face.island }).catch(() => {});
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

// ── 2 · THE PIN IS GONE ──────────────────────────────────────────────────────────────────────────────────────
// `commitPlot` used to live here: it scored a pin dropped on three distance rings, fixed the landfall and
// pushed off. The rings screen was replaced by the glass (see commitBearings above, and the note at the
// bottom of chart-plot.js on why). Nothing writes phase 'plot' any more, nothing renders it, and the route
// no longer carries the action — so the scorer went with it rather than staying as a function that looks
// live and can never run. `plotAccuracy` stays in chart-plot.js: it is pure, it is tested, and it is the
// worked example of how an accuracy is meant to be shaped.

// ── 3 · SOMETHING COMES ALONGSIDE ────────────────────────────────────────────────────────────────────────────
// The client reaches a mark and says so. The server checks the wall clock actually got there — the run cannot
// be rushed — and opens a real ship battle under meta.kind = "warden". Every mark is a fight you have to
// finish; there is no sailing past one, which is what makes them fights rather than weather.
export async function reachMark(buyerId, k) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row || row.phase !== "run") return { ok: false, error: "not_running" };

    const marks = asArr(row.marks);
    const i = Math.max(0, Math.min(marks.length - 1, Math.floor(Number(k) || 0)));
    const mark = marks[i];
    if (!mark || mark.done) return { ok: true, ...(await getExpeditionState(buyerId)) };

    const since = row.ran_at ? Date.now() - new Date(row.ran_at).getTime() : 0;
    if (since + RUN_GRACE_MS < RUN_MS * mark.at) return { ok: false, error: "not_yet" };

    // Already fighting something? Then this is a reload, not a new mark.
    const busy = await db.queryOne(`SELECT battle_state FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (busy?.battle_state) return { ok: true, ...(await getExpeditionState(buyerId)) };

    const isle = islandById(row.island) || ISLANDS[0];
    const foe = mark.anchorage ? wardenFor(isle.id) : escortFor(isle.id, Number(row.seed));
    // ⚠️ A MARK WITH NO FOE IS SKIPPED, NOT REFUSED. This cannot fire today — WARDENS has one row per island
    // and ESCORTS covers all five biomes — but if it ever did, refusing here pinned the expedition in `run`
    // forever: both comeAlongside and goAshore delegate to this for any pending mark, so the row could never
    // advance, the client would retry it every second, and the one-open-row index would bar that member from
    // ever sailing again. A fight that cannot be staged is a fight that did not happen; the journey goes on.
    if (!foe) {
        const skipped = marks.map((m, n) => (n === i ? { ...m, done: true, skipped: true } : m));
        await db.query(`UPDATE mkt_ship_expedition SET marks = $2::jsonb WHERE id = $1`, [row.id, jsonb(skipped)]).catch(() => {});
        return { ok: true, ...(await getExpeditionState(buyerId)) };
    }

    const sailing = await db.queryOne(`SELECT * FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    await openEncounterBattle(buyerId, foe, sailing || {}, {
        kind: "warden",
        art: wardenArt(foe.id),
        extra: { expeditionId: Number(row.id), markIndex: i, island: isle.id },
    });
    // ⚠️ THE RUN'S CLOCK STOPS FOR THE FIGHT. `ran_at` is the only thing the journey's pacing is measured
    // off, and a battle takes minutes where the whole run is thirty seconds — so without this you come back
    // from the first fight to find the second mark AND the landfall both already due, and they fire
    // back-to-back with no sailing between them. The seam is the one thing this rebuild exists to remove.
    // Stamped here, spent in wardenBeaten.
    await db.query(
        `UPDATE mkt_ship_expedition SET journey = journey || jsonb_build_object('pausedAt', $2::text) WHERE id = $1`,
        [row.id, new Date().toISOString()]
    ).catch(() => {});
    return { ok: true, fight: true, ...(await getExpeditionState(buyerId)) };
}

// ── ...AND IS BEATEN ─────────────────────────────────────────────────────────────────────────────────────────
// Called from sailing.js's battle finisher. Pays through the SAME hand a fleet win pays through, so there is
// no second granting path to keep in step.
//
// ⚠️ A LOST FIGHT STILL ENDS THE MARK. Losing a warden costs the spoils, and that is all it costs — the run
// continues, the island is still there, the chart is not consumed twice. A fight you can fail in the middle of
// the loop is fine; a fight that takes the island away is the interrogation minigame again.
export async function wardenBeaten(buyerId, meta, res) {
    const row = await readExpedition(buyerId);
    if (!row) return [];

    const marks = asArr(row.marks);
    const i = Math.max(0, Math.min(marks.length - 1, Number(meta?.markIndex) || 0));
    if (marks[i]) marks[i] = { ...marks[i], done: true, won: Boolean(res?.win) };

    let paid = [];
    if (res?.win) {
        const isle = islandById(row.island) || ISLANDS[0];
        const foe = marks[i]?.anchorage ? wardenFor(isle.id) : escortFor(isle.id, Number(row.seed));
        const reward = {};
        for (const l of foe?.loot || []) {
            if (l.kind === "doubloons") reward.doubloons = (reward.doubloons || 0) + l.n;
            else if (l.kind === "chest") reward.chest = l.tier;
            else if (l.kind === "parts") reward.parts = { tier: l.tier, n: l.n };
        }
        reward.xp = 8 + isle.rung * 3;
        paid = await payFleetReward(buyerId, reward).catch(() => []);
    }

    const coin = paid.filter((p) => p.kind === "doubloons").reduce((a, p) => a + (p.n || 0), 0);
    // Give back exactly the time the fight took, by pushing the run's start stamp forward by the same
    // amount. Clamped to an hour so a member who walked away mid-battle for a day does not come back to a
    // run that still has twenty-nine seconds left on it three days running.
    const j = asObj(row.journey);
    const pausedMs = j.pausedAt ? Math.max(0, Math.min(3_600_000, Date.now() - new Date(j.pausedAt).getTime())) : 0;
    await db.query(
        `UPDATE mkt_ship_expedition
            SET marks = $2::jsonb, purse = purse + $3,
                ran_at = ran_at + ($4 || ' milliseconds')::interval,
                journey = journey - 'pausedAt'
          WHERE id = $1`,
        [row.id, jsonb(marks), coin, String(Math.round(pausedMs))]
    ).catch(() => {});
    return paid;
}

// ── 4 · THE BOAT BEACHES ─────────────────────────────────────────────────────────────────────────────────────
// Only once the thirty seconds are genuinely up and both marks are behind you.
// ── 3b · COMING ALONGSIDE ────────────────────────────────────────────────────────────────────────────────────
// The run's clock is up and the island fills the screen. This is its own phase rather than a client-side
// flourish because the landing is where the boat docks and the member steps off — a reload in the middle of
// that must come back to the dock, not to the middle of the sea it already crossed.
export async function comeAlongside(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row || row.phase !== "run") return { ok: true, ...(await getExpeditionState(buyerId)) };
    const marks = asArr(row.marks);
    const pending = marks.findIndex((m) => !m.done);
    if (pending >= 0) return reachMark(buyerId, pending);
    const since = row.ran_at ? Date.now() - new Date(row.ran_at).getTime() : 0;
    if (since + RUN_GRACE_MS < RUN_MS) return { ok: false, error: "not_yet" };
    await db.query(`UPDATE mkt_ship_expedition SET phase = 'landing' WHERE id = $1`, [row.id]).catch(() => {});
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

export async function goAshore(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row) return { ok: false, error: "no_expedition" };
    if (row.phase === "ashore") return { ok: true, ...(await getExpeditionState(buyerId)) };
    // `landing` is the boat coming alongside; stepping off is this call. `run` is still accepted because a
    // client that reloaded through the landing cinematic must be able to reach the beach from either.
    if (row.phase !== "run" && row.phase !== "landing") return { ok: false, error: "not_running" };

    const since = row.ran_at ? Date.now() - new Date(row.ran_at).getTime() : 0;
    if (since + RUN_GRACE_MS < RUN_MS) return { ok: false, error: "still_sailing" };
    // An unfought mark means a fight is still open or was never asked for. Resolve it rather than beach past
    // it — otherwise the anchorage warden is a thing you can simply decline to meet.
    const marks = asArr(row.marks);
    const pending = marks.findIndex((m) => !m.done);
    if (pending >= 0) return await reachMark(buyerId, pending);

    await db.query(
        `UPDATE mkt_ship_expedition SET phase = 'ashore', ashore_at = NOW(), at_node = entry WHERE id = $1`,
        [row.id]
    ).catch(() => {});
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

// ── 5 · WALK, AND TAKE WHAT IS THERE ─────────────────────────────────────────────────────────────────────────
// The browser owns the walk. What arrives here is a CLAIM — "I am at node 22, having spent 14 steps" — and the
// island is regenerated to check it: is 22 on this island, could 14 steps have got there from the beach, is
// the tide still in, is there actually something at 22, and has it already been taken?
//
// A forged node index produces a different node than the cheater expected, or an empty beach. The worst
// available cheat is walking a slightly more efficient line than they really walked, which is worth nothing.
export async function takeNode(buyerId, { to, spent } = {}) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row || row.phase !== "ashore") return { ok: false, error: "not_ashore" };

    const isle = islandById(row.island) || ISLANDS[0];
    const at = Math.round(Number(to));
    const used = Math.max(0, Math.round(Number(spent) || 0));

    if (!reachable({ span: Number(row.span), entry: Number(row.entry), to: at, spent: used, tide: Number(row.tide) })) {
        return { ok: false, error: "unreachable" };
    }

    const taken = asArr(row.taken);
    if (taken.includes(at)) return { ok: false, error: "already_taken" };

    const node = nodeAt(Number(row.seed), isle.id, at, Number(row.fix_index));
    if (!TAKEABLE.has(node.kind)) {
        // Nothing there, but the walk is real — bank the steps so the tide still runs down.
        await db.query(`UPDATE mkt_ship_expedition SET at_node = $2, spent = GREATEST(spent, $3) WHERE id = $1`,
            [row.id, at, used]).catch(() => {});
        return { ok: true, took: null, ...(await getExpeditionState(buyerId)) };
    }

    // ⚠️ THE NODE IS MARKED TAKEN BEFORE A PENNY IS PAID, AND THAT ORDER IS THE ANTI-DOUBLE-CLAIM.
    // It used to pay first and record second, with the record swallowed by a bare catch — so one transient
    // Neon failure on that UPDATE meant the member had been paid (possibly the chart's own prize chest or an
    // ascension stone), the node was still un-taken on the row and in the view, and walking back one node
    // paid it again. Nothing errored and nothing logged. Claiming the node first means the worst case is a
    // node marked taken that paid nothing — a loss the member can see and complain about, rather than a
    // silent mint. Same rule as the chart being written before the captive: see [[captains-brig]].
    const claimed = await db.queryOne(
        `UPDATE mkt_ship_expedition
            SET at_node = $2, spent = GREATEST(spent, $3), taken = taken || $4::jsonb
          WHERE id = $1 AND NOT (taken @> $4::jsonb)
        RETURNING id`,
        [row.id, at, used, jsonb([at])]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "already_taken", ...(await getExpeditionState(buyerId)) };

    const value = nodeValue(node, isle.rung);
    const reward = {};
    if (value.doubloons) reward.doubloons = value.doubloons;
    if (value.parts) reward.parts = value.parts;
    if (value.chest) reward.chest = value.chest;
    if (value.xp) reward.xp = value.xp;
    let paid = await payFleetReward(buyerId, reward).catch(() => []);

    // ── THE THING THE CHART WAS FOR ──────────────────────────────────────────────────────────────────────
    const extras = [];
    if (node.kind === "fix") {
        const prize = prizeFor(isle);
        if (prize.kind === "chest" && prize.tier) {
            await addChests(buyerId, { [prize.tier]: 1 }, { source: "sail_charted" }).catch(() => {});
            extras.push({ kind: "chest", tier: prize.tier, prize: prize.name });
        } else if (prize.kind === "part") {
            try {
                const { addParts } = await import("@/lib/marketplace/crafting.js");
                await addParts(buyerId, prize.tier, 2);
                extras.push({ kind: "parts", tier: prize.tier, n: 2, prize: prize.name });
            } catch { /* the Forge is optional */ }
        } else if (prize.kind === "consumable" && prize.id) {
            try {
                const { grantConsumable } = await import("@/lib/marketplace/consumables.js");
                await grantConsumable(buyerId, prize.id, 1);
                extras.push({ kind: "consumable", id: prize.id, prize: prize.name });
            } catch { /* a missing consumable must not eat the prize silently — logged by the grant */ }
        } else if (prize.kind === "stone") {
            // ⚠️ DECLARED IN STONE_SOURCES AS `sail_charted` so the supply of ascension stones stays readable
            // in ONE place. See [[pet-enshrinement-stones]].
            try {
                const { rollStone } = await import("@/lib/marketplace/pet-ascension.js");
                const { STONE_SOURCES } = await import("@/lib/marketplace/pet-stones.js");
                // ⚠️ (buyerId, CHANCE, source) — the first cut passed the source string as the chance, and
                // rollStone's guard is `!(chance > 0)`, so it returned null every single time. A prize that
                // silently never pays is the worst shape a bug can take: nothing errors and nobody notices.
                const got = await rollStone(buyerId, STONE_SOURCES.sail_charted.chance, "sail_charted");
                if (got) extras.push({ kind: "stone", ...got, prize: prize.name });
            } catch { /* no stone, still a prize-worth of coin above */ }
        }
    }
    // A shrine can hand one over too, rarely, off its own roll.
    if (node.kind === "shrine" && value.stone) {
        try {
            const { rollStone } = await import("@/lib/marketplace/pet-ascension.js");
            const { STONE_SOURCES } = await import("@/lib/marketplace/pet-stones.js");
            const got = await rollStone(buyerId, STONE_SOURCES.island_shrine.chance, "island_shrine");
            if (got) extras.push({ kind: "stone", ...got });
        } catch { /* optional */ }
    }
    // Growth pays a consumable off the island's own biome, through the existing tables.
    if (node.kind === "forage") {
        try {
            const { grantConsumable } = await import("@/lib/marketplace/consumables.js");
            const pick = ["treat_bone", "treat_snack", "spin_lucky_coin"][Math.floor(Math.random() * 3)];
            await grantConsumable(buyerId, pick, 1);
            extras.push({ kind: "consumable", id: pick });
        } catch { /* optional */ }
    }

    paid = [...paid, ...extras];
    const coin = paid.filter((p) => p.kind === "doubloons").reduce((a, p) => a + (p.n || 0), 0);

    // The node itself was claimed above, before anything was paid. All that is left is the purse — and it is
    // ONLY the purse: rewriting `taken` wholesale here would clobber a claim made by a request that landed in
    // between, which is the race the conditional claim above exists to win.
    await db.query(
        `UPDATE mkt_ship_expedition SET purse = purse + $2 WHERE id = $1`,
        [row.id, coin]
    ).catch(() => {});

    return { ok: true, took: { i: at, kind: node.kind, reward: paid }, ...(await getExpeditionState(buyerId)) };
}

// ── 6 · THE TIDE TURNS ───────────────────────────────────────────────────────────────────────────────────────
// Ends the expedition and sails home. Called deliberately, or by the client when the tide runs out — and it is
// idempotent, because the last thing this loop needs is a way to end twice.
export async function leaveIsland(buyerId) {
    const row = await readExpedition(buyerId);
    if (!row) return { ok: true, ...(await getExpeditionState(buyerId)) };

    const isle = islandById(row.island) || ISLANDS[0];
    const taken = asArr(row.taken);
    const gotPrize = taken.includes(Number(row.fix_index));

    await db.query(`UPDATE mkt_ship_expedition SET phase = 'done', ended_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});
    await trackActivity(buyerId, "expedition_done", {
        island: isle.id, rung: isle.rung, purse: Number(row.purse) || 0,
        took: taken.length, prize: gotPrize, accuracy: Math.round((Number(row.accuracy) || 0) * 100),
    }).catch(() => {});

    return {
        ok: true,
        summary: {
            island: islandCard(isle.id),
            purse: Number(row.purse) || 0,
            took: taken.length,
            prize: gotPrize ? prizeFor(isle) : null,
            accuracy: Number(row.accuracy) || 0,
            band: plotBand(Number(row.accuracy) || 0),
        },
        ...(await getExpeditionState(buyerId)),
    };
}

/** Used by the helm to decide whether to draw the door at all. One query, because every harbour visit runs it. */
export async function expeditionBadge(buyerId) {
    if (!buyerId || !expeditionsOpenTo(buyerId)) return { charts: 0, open: false };
    const r = await db.queryOne(
        `SELECT (SELECT COUNT(*)::int FROM mkt_ship_chart WHERE buyer_id = $1 AND sailed_at IS NULL) AS charts,
                (SELECT COUNT(*)::int FROM mkt_ship_expedition WHERE buyer_id = $1 AND ended_at IS NULL) AS open`,
        [buyerId]
    ).catch(() => null);
    return { charts: Number(r?.charts) || 0, open: (Number(r?.open) || 0) > 0 };
}
