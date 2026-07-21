import "server-only";

import { db } from "@/lib/db";

// SAILING — dispatch your boat on a ONE-WAY voyage to a mysterious island; when it lands you play an
// excavation dig minigame (ESO-style: a grid of dirt, a limited stamina budget, an Augur "hot/cold" locator)
// trying to unearth a treasure-chest FRAGMENT before you run out. Win or fail, you return to port and can set
// sail again. Speed shortens the voyage; Luck adds dig stamina. Owner-gated while in development.

// PROTOTYPE: a short voyage so the whole loop is testable in seconds. Bump toward hours before any real release.
export const BASE_VOYAGE_MS = 20 * 1000;
const SPEED_STEP = 0.90;
const MIN_VOYAGE_MS = 5 * 1000;
const MAX_LEVEL = 50;
export const MAX_SPEED_LEVEL = 12;
export const MAX_LUCK_LEVEL = 12;

// After the free once-a-day tailwind is spent, extra tailwinds can be bought with gold. Temporarily FREE while
// the feature is in testing — set back to 500 before release.
export const WIND_RECHARGE_COST = 0; // TODO(luke): bump to 500 after testing

// Dig board.
const DIG_COLS = 6;
const DIG_ROWS = 5;
const BASE_STAMINA = 12;      // + luck level
const FRAGMENT_SIZE = 3;      // adjacent tiles the buried fragment sits under
const XP_PER_DIG_WIN = 30;

const BOAT_ART = { 1: "/images/sailing/boat-tier1-wood.png" };
export const OCEAN_BG = "/images/sailing/ocean-bg.png";
export const DIG_BG = "/images/sailing/dig-bg.png";
export const ISLAND_ART = "/images/sailing/island.png";

// --- pure curves ---------------------------------------------------------------------------------------
export function boatLevel(xp) { return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1); }
export function boatXpForLevel(level) { return Math.max(0, (level - 1) * (level - 1) * 50); }
export function boatTier(level) { return Math.floor((Math.max(1, level) - 1) / 10) + 1; }
export function boatArt(level) {
    const tier = boatTier(level);
    return BOAT_ART[tier] || BOAT_ART[Math.max(...Object.keys(BOAT_ART).map(Number))];
}
export function voyageDurationMs(speedLevel = 0) {
    return Math.max(MIN_VOYAGE_MS, Math.round(BASE_VOYAGE_MS * Math.pow(SPEED_STEP, Math.max(0, speedLevel))));
}
function upgradeCost(nextLevel) { return 400 * (nextLevel + 1) * (nextLevel + 1); }
function digStamina(luckLevel = 0) { return BASE_STAMINA + Math.max(0, luckLevel); }

// --- dig board -----------------------------------------------------------------------------------------
function randInt(n) { return Math.floor(Math.random() * n); }

// A connected cluster of `size` tiles (the buried fragment footprint).
function growCluster(rows, cols, size) {
    const start = [randInt(rows), randInt(cols)];
    const cells = [start];
    const seen = new Set([`${start[0]},${start[1]}`]);
    let guard = 0;
    while (cells.length < size && guard++ < 200) {
        const [r, c] = cells[randInt(cells.length)];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const [dr, dc] = dirs[randInt(4)];
        const nr = r + dr, nc = c + dc;
        const key = `${nr},${nc}`;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !seen.has(key)) { seen.add(key); cells.push([nr, nc]); }
    }
    return cells;
}

function newBoard(luckLevel) {
    const depth = Array.from({ length: DIG_ROWS }, () => Array.from({ length: DIG_COLS }, () => 1 + randInt(3)));
    const frag = growCluster(DIG_ROWS, DIG_COLS, FRAGMENT_SIZE);
    // Chebyshev distance to the nearest fragment tile drives the Augur hot/cold reading.
    const heat = Array.from({ length: DIG_ROWS }, (_, r) =>
        Array.from({ length: DIG_COLS }, (_, c) => {
            let d = 99;
            for (const [fr, fc] of frag) d = Math.min(d, Math.max(Math.abs(fr - r), Math.abs(fc - c)));
            return d;
        })
    );
    const dug = Array.from({ length: DIG_ROWS }, () => Array.from({ length: DIG_COLS }, () => false));
    const stamina = digStamina(luckLevel);
    return { cols: DIG_COLS, rows: DIG_ROWS, depth, frag, heat, dug, stamina, maxStamina: stamina, status: "active" };
}

// Server-authoritative dig. Returns the mutated board.
function applyDig(board, r, c) {
    if (board.status !== "active" || board.stamina <= 0) return board;
    if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return board;
    board.stamina -= 1;
    board.dug[r][c] = true;
    if (board.depth[r][c] > 0) board.depth[r][c] -= 1;
    const exposed = board.frag.every(([fr, fc]) => board.depth[fr][fc] === 0);
    if (exposed) board.status = "won";
    else if (board.stamina <= 0) board.status = "lost";
    return board;
}

// The client-safe view of a board: reveals heat (the Augur) + depth of dug tiles only (undug depth stays a
// gamble). Fragment tiles are flagged once fully exposed so the client can show the glint.
function boardView(board) {
    const fragSet = new Set(board.frag.map(([r, c]) => `${r},${c}`));
    const tiles = [];
    for (let r = 0; r < board.rows; r++) {
        const row = [];
        for (let c = 0; c < board.cols; c++) {
            const isFrag = fragSet.has(`${r},${c}`);
            row.push({
                heat: board.heat[r][c],                       // 0 = on it … higher = colder
                dug: board.dug[r][c],
                depth: board.dug[r][c] ? board.depth[r][c] : null,
                exposed: isFrag && board.depth[r][c] === 0,
            });
        }
        tiles.push(row);
    }
    const exposedCount = board.frag.filter(([r, c]) => board.depth[r][c] === 0).length;
    return { cols: board.cols, rows: board.rows, stamina: board.stamina, maxStamina: board.maxStamina, status: board.status, tiles, fragmentTotal: board.frag.length, fragmentExposed: exposedCount };
}

// --- state ---------------------------------------------------------------------------------------------
function decorate(row) {
    const xp = row?.boat_xp || 0;
    const level = boatLevel(xp);
    const speedLevel = row?.speed_level || 0;
    const luckLevel = row?.luck_level || 0;
    const level0Xp = boatXpForLevel(level);
    const nextXp = boatXpForLevel(Math.min(MAX_LEVEL, level + 1));
    const span = Math.max(1, nextXp - level0Xp);

    const departedAt = row?.departed_at ? new Date(row.departed_at).getTime() : null;
    const arrivesAt = row?.returns_at ? new Date(row.returns_at).getTime() : null; // returns_at = island arrival
    const dig = row?.dig_state || null;
    const now = Date.now();

    let status = "idle";
    if (dig && dig.status === "active") status = "digging";
    else if (departedAt && arrivesAt) status = now >= arrivesAt ? "arrived" : "sailing";

    let progress = 0;
    if (status === "sailing") progress = Math.min(0.999, Math.max(0, (now - departedAt) / (arrivesAt - departedAt)));
    else if (status === "arrived" || status === "digging") progress = 1;

    return {
        level, maxLevel: MAX_LEVEL, tier: boatTier(level), boatArt: boatArt(level),
        oceanBg: OCEAN_BG, digBg: DIG_BG, islandArt: ISLAND_ART,
        xp, xpInto: Math.max(0, xp - level0Xp), xpSpan: span,
        voyagesCompleted: row?.voyages_completed || 0,
        fragments: row?.fragments || 0,
        speed: { level: speedLevel, max: MAX_SPEED_LEVEL, cost: upgradeCost(speedLevel), maxed: speedLevel >= MAX_SPEED_LEVEL },
        luck: { level: luckLevel, max: MAX_LUCK_LEVEL, cost: upgradeCost(luckLevel), maxed: luckLevel >= MAX_LUCK_LEVEL },
        voyageMs: voyageDurationMs(speedLevel),
        digStamina: digStamina(luckLevel),
        status, progress, departedAt, arrivesAt,
        // Once-a-day "favorable winds" boost (shaves an hour off the trip) — only offered mid-voyage.
        windAvailable: status === "sailing" && !row?.wind_used_today,
        // After the free one is spent, extra tailwinds can be bought for this much gold (0 while testing).
        windRecharge: { cost: WIND_RECHARGE_COST },
        dig: status === "digging" ? boardView(dig) : null,
    };
}

async function readRow(buyerId) {
    // Compute "did they already use today's favorable-winds boost" in SQL (store-local day) to sidestep the
    // JS-Date-from-a-DATE-column timezone trap.
    return db.queryOne(
        `SELECT *, (wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date) AS wind_used_today
           FROM mkt_sailing WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
}

export async function getSailingState(buyerId) {
    const [row, goldRow] = await Promise.all([
        readRow(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    return { ...decorate(row), gold: goldRow?.gold || 0 };
}

export async function startVoyage(buyerId) {
    const state = decorate(await readRow(buyerId));
    if (state.status !== "idle") return { ok: false, error: "busy", ...(await getSailingState(buyerId)) };
    const ms = voyageDurationMs(state.speed.level);
    await db.query(
        `INSERT INTO mkt_sailing (buyer_id, departed_at, returns_at, dig_state, updated_at)
         VALUES ($1, NOW(), NOW() + ($2 || ' milliseconds')::interval, NULL, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET departed_at = NOW(), returns_at = NOW() + ($2 || ' milliseconds')::interval, dig_state = NULL, updated_at = NOW()`,
        [buyerId, String(ms)]
    ).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// Once-a-day favorable winds: shave an hour off the remaining voyage (clamped so it can only reach "arrived",
// never overshoot). Atomic — the WHERE enforces once-per-store-day and that a voyage is actually in progress.
export async function favorableWind(buyerId) {
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = GREATEST(NOW(), returns_at - interval '1 hour'),
                wind_day = (NOW() AT TIME ZONE 'America/Chicago')::date, updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL
            AND returns_at IS NOT NULL AND returns_at > NOW()
            AND wind_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date
          RETURNING returns_at`,
        [buyerId]
    ).catch(() => null);
    if (!updated) return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    return { ok: true, ...(await getSailingState(buyerId)) };
}

// Paid re-use of the tailwind once the free daily one is spent: charge gold, then shave another hour off the
// remaining voyage. Free while WIND_RECHARGE_COST is 0 (testing). Only valid mid-voyage.
export async function rechargeWind(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "sailing") return { ok: false, error: "not_sailing", ...(await getSailingState(buyerId)) };
    if (WIND_RECHARGE_COST > 0 && (state.gold || 0) < WIND_RECHARGE_COST) {
        return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    }
    // Apply the hour first (also validates a voyage is actually in progress) so we never charge with no effect.
    const updated = await db.queryOne(
        `UPDATE mkt_sailing
            SET returns_at = GREATEST(NOW(), returns_at - interval '1 hour'), updated_at = NOW()
          WHERE buyer_id = $1 AND dig_state IS NULL AND returns_at IS NOT NULL AND returns_at > NOW()
          RETURNING returns_at`,
        [buyerId]
    ).catch(() => null);
    if (!updated) return { ok: false, error: "unavailable", ...(await getSailingState(buyerId)) };
    if (WIND_RECHARGE_COST > 0) {
        await db.query(`UPDATE mkt_buyer SET gold = GREATEST(0, gold - $2) WHERE id = $1`, [buyerId, WIND_RECHARGE_COST]).catch(() => {});
    }
    return { ok: true, spent: WIND_RECHARGE_COST, ...(await getSailingState(buyerId)) };
}

export async function beginDig(buyerId) {
    const row = await readRow(buyerId);
    const state = decorate(row);
    if (state.status !== "arrived") return { ok: false, error: "not_arrived", ...(await getSailingState(buyerId)) };
    const board = newBoard(row?.luck_level || 0);
    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

export async function digAt(buyerId, r, c) {
    const row = await readRow(buyerId);
    const board = row?.dig_state;
    if (!board || board.status !== "active") return { ok: false, error: "not_digging", ...(await getSailingState(buyerId)) };
    applyDig(board, Number(r), Number(c));

    if (board.status === "won" || board.status === "lost") {
        const won = board.status === "won";
        // Resolve: grant the fragment on a win, then clear the voyage + board so the boat is back at port.
        await db.query(
            `UPDATE mkt_sailing
                SET dig_state = NULL, departed_at = NULL, returns_at = NULL,
                    fragments = fragments + $2, boat_xp = boat_xp + $3,
                    voyages_completed = voyages_completed + 1, updated_at = NOW()
              WHERE buyer_id = $1`,
            [buyerId, won ? 1 : 0, won ? XP_PER_DIG_WIN : 0]
        ).catch(() => {});
        const state = await getSailingState(buyerId);
        return { ok: true, result: { won, fragments: state.fragments }, ...state };
    }

    await db.query(`UPDATE mkt_sailing SET dig_state = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(board)]).catch(() => {});
    return { ok: true, ...(await getSailingState(buyerId)) };
}

async function buyUpgrade(buyerId, kind) {
    const col = kind === "speed" ? "speed_level" : "luck_level";
    const max = kind === "speed" ? MAX_SPEED_LEVEL : MAX_LUCK_LEVEL;
    const row = await readRow(buyerId);
    const cur = (kind === "speed" ? row?.speed_level : row?.luck_level) || 0;
    if (cur >= max) return { ok: false, error: "maxed", ...(await getSailingState(buyerId)) };
    const cost = upgradeCost(cur);
    await db.query(`INSERT INTO mkt_sailing (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getSailingState(buyerId)) };
    await db.query(`UPDATE mkt_sailing SET ${col} = ${col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, spent: cost, ...(await getSailingState(buyerId)) };
}
export const upgradeSpeed = (buyerId) => buyUpgrade(buyerId, "speed");
export const upgradeLuck = (buyerId) => buyUpgrade(buyerId, "luck");
