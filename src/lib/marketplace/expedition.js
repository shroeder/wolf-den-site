import "server-only";

// ── THE EXPEDITION: OPEN THE CHART, PUSH OFF, WALK THE ISLAND ────────────────────────────────────────────────
// The rows half. islands.js, chart-plot.js, island-world.js and island-wardens.js are all pure and hold every
// rule; this is the only file in the feature that writes anything or pays anybody.
//
// The loop, end to end:
//
//   openChart   spend the best chart in hand, resolve WHICH island it names, draw the face   → phase "plot"
//   commitPlot  score the pin, fix the landfall, roll the two fights                         → phase "run"
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
import { openEncounterBattle, payFleetReward } from "@/lib/marketplace/sailing.js";
import { ISLANDS, islandById, islandCard, prizeFor } from "@/lib/marketplace/islands.js";
import { chartFace, landfall, plotAccuracy, plotBand } from "@/lib/marketplace/chart-plot.js";
import { TAKEABLE, nodeAt, nodeValue, reachable } from "@/lib/marketplace/island-world.js";
import { RUN_MS, viewOf } from "@/lib/marketplace/expedition-view.js";
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
    const held = await db.queryOne(
        `SELECT (SELECT COUNT(*)::int FROM mkt_ship_chart WHERE buyer_id = $1 AND sailed_at IS NULL) AS n,
                b.avatar_sprite_url AS art, b.avatar_sprite_flip AS flip
           FROM mkt_buyer b WHERE b.id = $1`, [buyerId]
    ).catch(() => null);
    const hero = { art: held?.art || null, flip: held?.flip === true };
    const charts = Number(held?.n) || 0;

    if (!row) return { ok: true, open: false, charts, hero };
    return { ok: true, open: true, charts, hero, expedition: viewOf(row) };
}


// ── 1 · OPEN THE CHART ───────────────────────────────────────────────────────────────────────────────────────
// Spends the best chart in hand — same "best one is spent" rule the helm has always used — and resolves the
// island there and then. Marked sailed BEFORE the expedition row is written, conditionally, so a double tap
// cannot put one chart on two expeditions; there is no transaction on this driver to lean on (see
// [[postgres-landmines]]), so nothing between the UPDATE and the INSERT is allowed to throw.
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
         VALUES ($1,$2,$3,$4,$5,'plot') RETURNING *`,
        [buyerId, Number(chart.id), seed, grade, face.island]
    ).catch(() => null);
    // The unique partial index is the real guard against two tabs. If it raised, somebody else already opened
    // one — hand back whatever is open rather than an error about a race the player did not cause.
    if (!made) return { ok: true, ...(await getExpeditionState(buyerId)) };

    await trackActivity(buyerId, "chart_opened", { grade, island: face.island }).catch(() => {});
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

// ── 2 · COMMIT THE PLOT ──────────────────────────────────────────────────────────────────────────────────────
// The pin goes down and everything downstream is decided at once: how well it was read, where the boat
// beaches, how long the tide gives you, and which two things are in the water on the way in.
//
// ⚠️ IT CANNOT REFUSE. Any pin on the paper is a legal plot, including a terrible one, and a pin off the paper
// is clamped rather than rejected. There is no input here that produces "no, try again".
export async function commitPlot(buyerId, at) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row) return { ok: false, error: "no_expedition" };
    if (row.phase !== "plot") return { ok: true, ...(await getExpeditionState(buyerId)) };

    const isle = islandById(row.island) || ISLANDS[0];
    const pin = {
        x: Math.max(0, Math.min(1, Number(at?.x))) || 0,
        y: Math.max(0, Math.min(1, Number(at?.y))) || 0,
    };
    const face = chartFace(Number(row.seed), Number(row.grade));
    const accuracy = plotAccuracy(face, pin);
    const lf = landfall(face, accuracy, isle.span);

    // The two fights on the way in — the biome's escort, then the island's own warden at the anchorage.
    const escort = escortFor(isle.id, Number(row.seed));
    const warden = wardenFor(isle.id);
    const marks = [escort, warden].filter(Boolean).map((foe, i) => ({
        at: RUN_MARKS[i] ?? 0.5, foe: foe.id, name: foe.name, art: foe.art, anchorage: Boolean(foe.anchorage), done: false,
    }));

    await db.query(
        `UPDATE mkt_ship_expedition
            SET phase = 'run', plot_x = $2, plot_y = $3, accuracy = $4,
                span = $5, entry = $6, fix_index = $7, tide = $8, marks = $9::jsonb, ran_at = NOW()
          WHERE id = $1`,
        [row.id, pin.x, pin.y, accuracy, lf.span, lf.entry, lf.fixIndex, lf.tide, jsonb(marks)]
    ).catch(() => {});

    await trackActivity(buyerId, "chart_plotted", { island: isle.id, accuracy: Math.round(accuracy * 100) }).catch(() => {});
    return { ok: true, ...(await getExpeditionState(buyerId)) };
}

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
    if (!foe) return { ok: false, error: "no_foe" };

    const sailing = await db.queryOne(`SELECT * FROM mkt_sailing WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    await openEncounterBattle(buyerId, foe, sailing || {}, {
        kind: "warden",
        art: wardenArt(foe.id),
        extra: { expeditionId: Number(row.id), markIndex: i, island: isle.id },
    });
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
    await db.query(
        `UPDATE mkt_ship_expedition SET marks = $2::jsonb, purse = purse + $3 WHERE id = $1`,
        [row.id, jsonb(marks), coin]
    ).catch(() => {});
    return paid;
}

// ── 4 · THE BOAT BEACHES ─────────────────────────────────────────────────────────────────────────────────────
// Only once the thirty seconds are genuinely up and both marks are behind you.
export async function goAshore(buyerId) {
    if (!expeditionsOpenTo(buyerId)) return { ok: false, error: "gated" };
    const row = await readExpedition(buyerId);
    if (!row) return { ok: false, error: "no_expedition" };
    if (row.phase === "ashore") return { ok: true, ...(await getExpeditionState(buyerId)) };
    if (row.phase !== "run") return { ok: false, error: "not_running" };

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

    await db.query(
        `UPDATE mkt_ship_expedition
            SET at_node = $2, spent = GREATEST(spent, $3), taken = $4::jsonb, purse = purse + $5
          WHERE id = $1`,
        [row.id, at, used, jsonb([...taken, at]), coin]
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
