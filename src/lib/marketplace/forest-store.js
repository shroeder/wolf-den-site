import "server-only";

// ── THE DB HALF OF THE FOREST ────────────────────────────────────────────────────────────────────────────────
// forest.js holds the rules and is pure so the chop can be simulated; this holds the row. Same split as
// ship-battle/sailing and captains/captains-store, and for the same reason — a tap-speed minigame whose maths
// can only be run by tapping is a minigame nobody can balance.
//
// ⚠️ THE SERVER DOES NOT SEE EVERY SWING, AND MUST NOT. A tap game at ten taps a second would be ten requests a
// second, per player, which is the single most expensive shape this codebase could adopt (see CLAUDE.md: round
// trips ARE the bill). The browser runs the swing loop against the same pure rules and posts ONCE, when a tree
// comes down, saying which patch and how many swings it took. The server re-derives whether that was possible.

import { db } from "@/lib/db";
import {
    PATCHES, TREES, axeTotal, biteFor, isReady, plant, regrow, streakWindow,
    STREAK_CAP, treeById, woodFor,
} from "@/lib/marketplace/forest.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

const COLS = "buyer_id, wood, edge_level, haft_level, heft_level, stand, felled, swings, best_streak";

function readStand(raw) {
    const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
    return Array.isArray(arr) ? arr : [];
}

/**
 * The stand, grown forward to now.
 *
 * ⚠️ REGROWTH IS LAZY AND HAS NO CRON. A patch that was felled forty minutes ago is simply read as whatever
 * it grew back into the moment somebody looks. A timer that only advances when a page is open is the thing
 * a cron is usually reached for, and a cron that ticks every member's forest is a cost with no player on the
 * other end of it — see the note on static assets and crons in CLAUDE.md.
 */
function grown(stand, now = Date.now()) {
    const out = [];
    for (let i = 0; i < PATCHES; i += 1) {
        const p = stand[i];
        if (!p || !p.tree) { out.push(plant(regrow())); continue; }
        if (p.felled && isReady(p.tree, p.felledAt, now)) { out.push(plant(regrow())); continue; }
        out.push(p);
    }
    return out;
}

const axeOf = (row) => ({
    edge: Number(row?.edge_level) || 0,
    haft: Number(row?.haft_level) || 0,
    heft: Number(row?.heft_level) || 0,
});

/** Read the member's forest, planting one if this is their first walk into it. */
export async function forestState(buyerId) {
    let row = await db.queryOne(`SELECT ${COLS} FROM mkt_forest WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!row) {
        const stand = Array.from({ length: PATCHES }, () => plant(regrow()));
        row = await db.queryOne(
            `INSERT INTO mkt_forest (buyer_id, stand) VALUES ($1, $2::jsonb)
             ON CONFLICT (buyer_id) DO UPDATE SET updated_at = NOW()
             RETURNING ${COLS}`,
            [buyerId, JSON.stringify(stand)]
        ).catch(() => null);
        if (!row) return null;
    }
    const now = Date.now();
    const before = readStand(row.stand);
    const stand = grown(before, now);
    // Only write when something actually grew — a read of a forest with nothing ready is a read.
    if (JSON.stringify(stand) !== JSON.stringify(before)) {
        await db.query(`UPDATE mkt_forest SET stand = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`,
            [buyerId, JSON.stringify(stand)]).catch(() => {});
    }
    return view(row, stand, now);
}

function view(row, stand, now = Date.now()) {
    const axe = axeOf(row);
    return {
        wood: Number(row.wood) || 0,
        axe,
        total: axeTotal(axe),
        bite: Math.round(biteFor(axe.edge) * 100) / 100,
        window: streakWindow(axe.haft),
        streakCap: STREAK_CAP,
        felled: Number(row.felled) || 0,
        swings: Number(row.swings) || 0,
        bestStreak: Number(row.best_streak) || 0,
        stand: stand.map((p, i) => ({
            i,
            tree: p.tree,
            hp: Math.max(0, Number(p.hp) || 0),
            max: treeById(p.tree).bites,
            felled: Boolean(p.felled),
            // Milliseconds until it is back, so the screen counts down rather than polling for a change.
            backIn: p.felled ? Math.max(0, Number(p.felledAt || 0) + treeById(p.tree).regrow * 60000 - now) : 0,
        })),
    };
}

/**
 * Fell a tree.
 *
 * ⚠️ THE CLIENT SAYS HOW MANY SWINGS IT TOOK AND THE SERVER CHECKS WHETHER THAT IS POSSIBLE. It cannot check
 * exactly — it did not see the taps, and the whole point of not seeing them is the request count — so it
 * checks the only bound that matters: the BEST case. A swing cannot do more than the axe's bite times the
 * streak ceiling times two for a double, so a tree cannot come down in fewer swings than that allows. Claim
 * fewer and the fell is refused. That makes the worst possible cheat "chopped a tree slightly faster than
 * they really did", which costs the Den nothing and needs no per-tap policing.
 */
export async function fellTree(buyerId, index, swings) {
    const row = await db.queryOne(`SELECT ${COLS} FROM mkt_forest WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "no_forest" };
    const now = Date.now();
    const stand = grown(readStand(row.stand), now);
    const i = Math.max(0, Math.min(PATCHES - 1, Math.floor(Number(index) || 0)));
    const patch = stand[i];
    if (!patch || patch.felled) return { ok: false, error: "nothing_there" };

    const axe = axeOf(row);
    const took = Math.max(1, Math.floor(Number(swings) || 0));
    const best = biteFor(axe.edge) * STREAK_CAP * 2;
    const floor = Math.ceil(treeById(patch.tree).bites / best);
    if (took < floor) return { ok: false, error: "too_fast" };

    const tree = patch.tree;
    const wood = woodFor(tree);
    stand[i] = { tree, hp: 0, felled: true, felledAt: now };
    const saved = await db.queryOne(
        `UPDATE mkt_forest
            SET wood = wood + $2, stand = $3::jsonb, felled = felled + 1, swings = swings + $4,
                updated_at = NOW()
          WHERE buyer_id = $1
          RETURNING ${COLS}`,
        [buyerId, wood, JSON.stringify(stand), took]
    ).catch(() => null);
    if (!saved) return { ok: false, error: "failed" };
    await trackActivity(buyerId, "forest_fell", { tree, wood, swings: took }).catch(() => {});
    return { ok: true, tree, wood, name: TREES[tree]?.name || tree, forest: view(saved, stand, now) };
}

/** Remember the longest rhythm anybody has held. Written only when it improves, so it is rarely a write. */
export async function noteStreak(buyerId, streak) {
    const n = Math.max(0, Math.floor(Number(streak) || 0));
    if (!n) return;
    await db.query(
        `UPDATE mkt_forest SET best_streak = GREATEST(best_streak, $2) WHERE buyer_id = $1 AND best_streak < $2`,
        [buyerId, n]
    ).catch(() => {});
}

/** Spend wood on the axe. One statement carries the condition, because there is no transaction here. */
export async function upgradeAxe(buyerId, track) {
    const { AXE_TRACKS, trackCost } = await import("@/lib/marketplace/forest.js");
    const t = AXE_TRACKS[track];
    if (!t) return { ok: false, error: "no_track" };
    const col = { edge: "edge_level", haft: "haft_level", heft: "heft_level" }[track];
    const row = await db.queryOne(`SELECT ${COLS} FROM mkt_forest WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "no_forest" };
    const level = Number(row[col]) || 0;
    if (level >= t.max) return { ok: false, error: "maxed" };
    const cost = trackCost(track, level);
    // ⚠️ THE PRICE IS IN THE WHERE. A double-tapped upgrade button must not be able to buy two levels for one
    // purse, and there is no transaction on this driver to lean on.
    const saved = await db.queryOne(
        `UPDATE mkt_forest SET ${col} = ${col} + 1, wood = wood - $2, updated_at = NOW()
          WHERE buyer_id = $1 AND wood >= $2 AND ${col} = $3
          RETURNING ${COLS}`,
        [buyerId, cost, level]
    ).catch(() => null);
    if (!saved) return { ok: false, error: "not_enough_wood", cost };
    await trackActivity(buyerId, "forest_axe", { track, level: level + 1, cost }).catch(() => {});
    const now = Date.now();
    return { ok: true, track, level: level + 1, cost, forest: view(saved, grown(readStand(saved.stand), now), now) };
}
