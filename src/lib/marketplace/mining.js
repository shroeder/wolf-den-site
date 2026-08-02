import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── MINING (owner-gated, phase 1) ────────────────────────────────────────────────────────────────────────────
// You PROSPECT — one button surfaces a random live seam — then swing at it on
// the SAME timing bar as the Forge anvil and the Treasure Golem — identical grade bands, so the skill a member
// already has transfers instead of being re-learned. Chip a node's HP to zero and its ore is yours.
//
// Ore smelts into FORGE PARTS (crafting.js PART_TIERS 1..5), so mining feeds the Forge that already exists
// rather than minting a parallel currency. Ore tier maps straight onto part tier — that's the whole
// "depending on the ore" rule, kept deliberately legible.
//
// OWNER-GATED. Every read and every write goes through MINING_UNLOCKED. Flip that one function to open it.

export const MINING_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

// ── ORE TIERS ────────────────────────────────────────────────────────────────────────────────────────────────
// Named for the rock, coloured up the usual rarity ladder. `part` is the forge part tier it smelts into, which
// is 1:1 on purpose — a member should be able to look at a lump of ore and know what it becomes.
// `weight` is the spawn share at lantern 0; `hp` is how much chipping the node takes.
export const ORE_TIERS = {
    1: { tier: 1, id: "coal", name: "Coal Seam", color: "#8b8f96", part: 1, weight: 44, hp: 60, xp: 6, gold: 5 },
    2: { tier: 2, id: "iron", name: "Iron Vein", color: "#cfd6dd", part: 2, weight: 30, hp: 110, xp: 12, gold: 11 },
    3: { tier: 3, id: "silver", name: "Silver Lode", color: "#6fb0e6", part: 3, weight: 17, hp: 190, xp: 24, gold: 22 },
    4: { tier: 4, id: "mythril", name: "Mythril Seam", color: "#b98cff", part: 4, weight: 7, hp: 320, xp: 48, gold: 44 },
    5: { tier: 5, id: "emberheart", name: "Emberheart Geode", color: "#ffb020", part: 5, weight: 2, hp: 520, xp: 96, gold: 90 },
};
export const oreTier = (t) => ORE_TIERS[t] || ORE_TIERS[1];

// ── THE LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
// Straight from the Kitchen: you see every rung BEFORE you start, and how well you play decides which one you
// land on. Previously timing only decided how fast a seam cracked — the haul was identical whether you hit
// every marker dead centre or mashed the button, which left the bar with nothing riding on it.
//
// Quality is your AVERAGE swing grade across the seam (0.5 glancing … 5.0 perfect), normalised to 0..1. Using
// the average rather than the best swing means one lucky tap can't carry a sloppy dig, and using it rather
// than the worst means one fumble doesn't erase a good one.
export const MINE_RUNGS = [
    { rung: 1, key: "rough", label: "Rough dig", min: 0, mult: 1.0, blurb: "You got it open." },
    { rung: 2, key: "solid", label: "Solid work", min: 0.34, mult: 1.6, blurb: "Clean enough to keep the good stuff." },
    { rung: 3, key: "clean", label: "Clean break", min: 0.60, mult: 2.4, blurb: "The seam split where you wanted it to." },
    { rung: 4, key: "flawless", label: "Flawless seam", min: 0.84, mult: 3.4, blurb: "Every strike true — the whole vein comes out." },
];
const MAX_GRADE_MULT = 5.0;
export const rungForQuality = (q) => [...MINE_RUNGS].reverse().find((r) => q >= r.min) || MINE_RUNGS[0];
// Base ore a seam holds before the rung multiplier and the Haul track.
export const baseOre = (tier) => 2 + tier;
export const oreArt = (t) => `/images/mining/ore-${oreTier(t).id}.png`;

// ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
// Bands and multipliers mirror town-events.js exactly. They are duplicated rather than imported because a
// mining swing must never accidentally inherit a raid rebalance — but if you change one, change both, and the
// comment in each says so.
const SWING_GRADES = [
    { key: "pixel", max: 0.022, mult: 5.0, label: "PERFECT STRIKE" },
    { key: "perfect", max: 0.055, mult: 3.6, label: "CLEAN HIT" },
    { key: "great", max: 0.10, mult: 2.6, label: "SOLID" },
    { key: "good", max: 0.16, mult: 1.6, label: "GLANCING" },
];
const SWING_MISS = { key: "miss", mult: 0.5, label: "CHIP" };
const gradeForDist = (dist) => SWING_GRADES.find((g) => dist <= g.max) || SWING_MISS;
const GRADE_RANK = { miss: 0, good: 1, great: 2, perfect: 3, pixel: 4 };
// Re-arm by grade, same ladder as the raid. The client owns the cadence and shows it; this is what it re-arms on.
export const SWING_COOLDOWN_MS = { pixel: 700, perfect: 850, great: 1050, good: 1300, miss: 1600 };
// Pure double-tap floor, kept comfortably UNDER the fastest grade cooldown so a legitimately re-armed swing is
// never rejected. (The raid learned this the hard way: a floor above the fastest cooldown silently eats swings.)
const SWING_THROTTLE_MS = 500;

const COMBO_STEP = 0.10;
const COMBO_MAX = 2.0;
const COMBO_MIN_GRADE = "good";

// ── DAILY ALLOWANCE + UPGRADES ───────────────────────────────────────────────────────────────────────────────
const SWINGS_PER_DAY = 60;          // generous: a swing is one tap, and a node takes several
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";

// Four tracks, each buying a different KIND of mining rather than just "more of it" — same design rule as the
// fishing rail, so they don't collapse into one obvious purchase order.
export const MINE_TRACKS = {
    pick: { max: 10, per: 0.12, cap: 1.2, kind: "mult", name: "Pickaxe", icon: "⛏️", desc: "Harder swings — fewer to crack a node.", col: "pick_level" },
    lantern: { max: 10, per: 0.03, cap: 0.30, kind: "pct", name: "Lantern", icon: "🏮", desc: "Light reaches deeper — richer seams surface.", col: "lantern_level" },
    haul: { max: 10, per: 0.10, cap: 1.0, kind: "mult", name: "Haul", icon: "🎒", desc: "More ore out of every node you crack.", col: "haul_level" },
    vigor: { max: 10, per: 4, cap: 40, kind: "count", name: "Vigor", icon: "💪", desc: "More swings each day.", col: "vigor_level" },
};
export const trackValue = (t, lvl) => Math.min(MINE_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * MINE_TRACKS[t].per);
// Cost curve mirrors the boat/rail tracks: each level costs more than the last.
export const trackCost = (level) => 300 + Math.round(Math.pow(Math.max(0, level), 1.6) * 140);

// SMELTING tracks. Its own half of the feature, so it gets its own levers rather than riding the pickaxe's.
export const SMELT_TRACKS = {
    bellows: { max: 10, per: 0.03, cap: 0.30, kind: "pct", name: "Bellows", icon: "🌬️", col: "bellows_level",
        desc: "A hotter burn sometimes yields an extra part.", effect: "Bonus part chance" },
    crucible: { max: 10, per: 1, cap: 10, kind: "count", name: "Crucible", icon: "🫙", col: "crucible_level",
        desc: "A bigger pot needs less ore for the same part.", effect: "Ore per part" },
    flux: { max: 10, per: 0.02, cap: 0.20, kind: "pct", name: "Flux", icon: "✨", col: "flux_level",
        desc: "A purer melt sometimes lifts a part a whole tier.", effect: "Tier-up chance" },
};
export const smeltValue = (t, lvl) => Math.min(SMELT_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * SMELT_TRACKS[t].per);
// Ore per part. The Crucible buys this down twice over its ten levels — a visible, discrete win rather than a
// fraction that never quite changes the number on screen.
export const SMELT_BASE_COST = 3;
export const smeltCostFor = (crucibleLevel = 0) => Math.max(1, SMELT_BASE_COST - Math.floor(Math.max(0, crucibleLevel) / 4));

// FURNACE FORMS — the smelting equivalent of the pickaxe ladder. Total smelting levels (0..30) decide which
// furnace you're feeding, and it's the one you see in the smelt animation, so investment is visible at the
// exact moment it pays off.
const FURNACE_FORMS = [
    { at: 0, id: 1, name: "Stone Hearth" },
    { at: 4, id: 2, name: "Banded Forge" },
    { at: 10, id: 3, name: "Brick Smelter" },
    { at: 17, id: 4, name: "Runed Crucible" },
    { at: 25, id: 5, name: "Emberheart Furnace" },
];
export function furnaceForm(totalSmeltLevels) {
    let form = FURNACE_FORMS[0];
    for (const f of FURNACE_FORMS) if (totalSmeltLevels >= f.at) form = f;
    const next = FURNACE_FORMS.find((f) => f.at > totalSmeltLevels) || null;
    return { ...form, sprite: `/images/mining/furnace-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// PICKAXE FORMS. Total upgrade levels across all four tracks (0..40) decide which pickaxe you're swinging, so
// every purchase moves you toward a visibly better tool — the boat-form trick, which is the single best
// "my upgrades are real" signal in the game.
const PICK_FORMS = [
    { at: 0, id: "worn", name: "Worn Pick" },
    { at: 6, id: "iron", name: "Iron Pick" },
    { at: 13, id: "steel", name: "Steel Pick" },
    { at: 21, id: "mythril", name: "Mythril Pick" },
    { at: 30, id: "emberheart", name: "Emberheart Pick" },
];
export function pickForm(totalLevels) {
    let form = PICK_FORMS[0];
    for (const f of PICK_FORMS) if (totalLevels >= f.at) form = f;
    const next = PICK_FORMS.find((f) => f.at > totalLevels) || null;
    return { ...form, sprite: `/images/mining/pick-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// ── CAVE + SPAWNING ──────────────────────────────────────────────────────────────────────────────────────────
// Nodes live for a while and are replaced as they're mined or expire, so the cave is never empty and never a
// wall of ore. Spawning is lazy — it runs on read, so there's no cron to keep alive.
const MAX_ACTIVE_NODES = 7;
const NODE_TTL_MIN = 90;
// A node still stores an x/y. Nothing renders it since the walk-around came out, but it costs nothing and a
// later "cave map" view would want it back — a spawn without a position is harder to add than to keep.
const CAVE_X = [8, 92];
const CAVE_Y = [62, 88];

const randBetween = (a, b) => a + Math.random() * (b - a);
function rollOreTier(lanternPct = 0) {
    // Lantern shifts weight off the bottom tier and onto everything above it — the same "tilt, don't gate"
    // approach fishing uses, so a new miner still sees the whole table, just less often.
    const entries = Object.values(ORE_TIERS).map((o) => ({
        tier: o.tier,
        w: o.tier === 1 ? o.weight * (1 - Math.min(0.6, lanternPct)) : o.weight * (1 + lanternPct * 2),
    }));
    const total = entries.reduce((s, e) => s + e.w, 0) || 1;
    let r = Math.random() * total;
    for (const e of entries) { r -= e.w; if (r <= 0) return e.tier; }
    return 1;
}

// Retire what's finished and top the cave back up. Safe to call on every read.
async function refreshNodes(lanternPct = 0) {
    await db.query(`UPDATE mkt_ore_node SET status = 'expired' WHERE status = 'active' AND expires_at <= NOW()`).catch(() => {});
    const live = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_ore_node WHERE status = 'active'`).catch(() => null);
    const missing = Math.max(0, MAX_ACTIVE_NODES - (live?.n || 0));
    for (let i = 0; i < missing; i += 1) {
        const tier = rollOreTier(lanternPct);
        const o = oreTier(tier);
        await db.query(
            `INSERT INTO mkt_ore_node (tier, x, y, hp, hp_max, expires_at)
             VALUES ($1, $2, $3, $4, $4, NOW() + ($5 || ' minutes')::interval)`,
            [tier, Math.round(randBetween(...CAVE_X) * 10) / 10, Math.round(randBetween(...CAVE_Y) * 10) / 10, o.hp, String(NODE_TTL_MIN)]
        ).catch(() => {});
    }
}

// ── STATE ────────────────────────────────────────────────────────────────────────────────────────────────────
async function minerRow(buyerId) {
    await db.query(`INSERT INTO mkt_mining (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    return db
        .queryOne(
            `UPDATE mkt_mining
                SET swing_used = CASE WHEN swing_day = ${DAY} THEN swing_used ELSE 0 END,
                    swing_bonus = CASE WHEN swing_day = ${DAY} THEN swing_bonus ELSE 0 END,
                    swing_day = ${DAY}
              WHERE buyer_id = $1
              RETURNING *`,
            [buyerId]
        )
        .catch(() => null);
}

const totalLevels = (row) => Object.values(MINE_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
const totalSmeltLevels = (row) => Object.values(SMELT_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
// One shape for an upgrade card, so the mining and smelting lists render through the same component.
const trackCards = (defs, row, valueFn, costFn, fmt) => Object.entries(defs).map(([key, t]) => {
    const level = Number(row?.[t.col]) || 0;
    return {
        key, name: t.name, icon: t.icon, desc: t.desc, effect: t.effect, level, max: t.max, kind: t.kind,
        now: fmt(key, level), next: level >= t.max ? null : fmt(key, level + 1),
        maxed: level >= t.max, cost: level >= t.max ? null : costFn(level),
    };
});

export async function getMiningState(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { unlocked: false };
    const row = await minerRow(buyerId);
    const lantern = trackValue("lantern", row?.lantern_level);
    await refreshNodes(lantern);

    const [current, ore, goldRow, liveCount] = await Promise.all([
        row?.current_node_id
            ? db.queryOne(
                `SELECT n.id, n.tier, n.hp, n.hp_max, COALESCE(h.damage, 0) AS my_damage, COALESCE(h.swings, 0) AS my_swings,
                        COALESCE(h.grade_sum, 0) AS my_grade_sum
                   FROM mkt_ore_node n
                   LEFT JOIN mkt_ore_node_hit h ON h.node_id = n.id AND h.buyer_id = $1
                  WHERE n.id = $2 AND n.status = 'active'`,
                [buyerId, row.current_node_id]
            ).catch(() => null)
            : Promise.resolve(null),
        db.query(`SELECT tier, qty FROM mkt_ore WHERE buyer_id = $1 AND qty > 0 ORDER BY tier`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_ore_node WHERE status = 'active'`).catch(() => null),
    ]);

    const lvls = totalLevels(row);
    const allowance = SWINGS_PER_DAY + trackValue("vigor", row?.vigor_level) + (Number(row?.swing_bonus) || 0);
    return {
        unlocked: true,

        pick: pickForm(lvls),
        swings: { used: Number(row?.swing_used) || 0, allowance, left: Math.max(0, allowance - (Number(row?.swing_used) || 0)) },
        tracks: trackCards(MINE_TRACKS, row, trackValue, trackCost, (key, lvl) => {
            const v = trackValue(key, lvl);
            if (key === "vigor") return `${SWINGS_PER_DAY + v} swings`;
            if (key === "lantern") return `+${Math.round(v * 100)}% rich`;
            return `×${(1 + v).toFixed(2)}`;
        }),
        furnace: furnaceForm(totalSmeltLevels(row)),
        smeltLevels: totalSmeltLevels(row),
        smeltTracks: trackCards(SMELT_TRACKS, row, smeltValue, trackCost, (key, lvl) => {
            if (key === "crucible") return `${smeltCostFor(lvl)} ore → 1`;
            return `${Math.round(smeltValue(key, lvl) * 100)}%`;
        }),
        // The ONE seam you're working, or null until you prospect.
        node: current ? (() => {
            const o = oreTier(current.tier);
            const haulMult = 1 + trackValue("haul", row?.haul_level);
            const sw = Number(current.my_swings) || 0;
            // Your running quality on THIS seam, so the ladder can show where you'd land if it broke now.
            const q = sw > 0 ? Math.max(0, Math.min(1, (Number(current.my_grade_sum) || 0) / sw / 5.0)) : null;
            return {
                id: Number(current.id), tier: current.tier, name: o.name, color: o.color, art: oreArt(current.tier),
                partTier: o.part, gold: o.gold, xp: o.xp,
                hp: Number(current.hp), hpMax: Number(current.hp_max),
                pct: current.hp_max ? Math.max(0, Math.round((current.hp / current.hp_max) * 100)) : 0,
                mySwings: sw,
                // The LADDER, shown before you swing: what each standard of digging pays out of this seam.
                ladder: MINE_RUNGS.map((r) => ({
                    rung: r.rung, key: r.key, label: r.label, blurb: r.blurb,
                    ore: Math.max(1, Math.round(baseOre(current.tier) * r.mult * haulMult)),
                })),
                quality: q == null ? null : Math.round(q * 100),
                currentRung: q == null ? null : rungForQuality(q).rung,
            };
        })() : null,
        seamsLive: Number(liveCount?.n) || 0,
        ore: (ore || []).map((r) => {
            const o = oreTier(r.tier);
            const cost = smeltCostFor(row?.crucible_level);
            const qty = Number(r.qty);
            return { tier: r.tier, name: o.name, color: o.color, art: oreArt(r.tier), qty, partTier: o.part,
                smeltCost: cost, canSmelt: Math.floor(qty / cost) };
        }),
        oreTotal: (ore || []).reduce((s, r) => s + Number(r.qty), 0),
        gold: Number(goldRow?.gold) || 0,
        stats: {
            nodesMined: Number(row?.nodes_mined) || 0,
            oreTotal: Number(row?.ore_total) || 0,
            bestCombo: Number(row?.best_combo) || 0,
            upgradeLevels: lvls,
        },
    };
}

// PROSPECT — surface a random live seam and make it the one you're working.
//
// Server-assigned, never client-chosen: if the client picked from the visible list, everyone would take the
// Emberheart every time and the spawn weights would stop meaning anything. The tier you get to swing at has to
// be the game's choice, which is also what makes finding a good one feel like something.
export async function prospectNode(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    await refreshNodes(trackValue("lantern", row?.lantern_level));
    // Prefer a seam you haven't already chipped, so prospecting feels like finding something new rather than
    // handing you back the rock you just walked away from.
    const node = await db.queryOne(
        `SELECT n.id FROM mkt_ore_node n
           LEFT JOIN mkt_ore_node_hit h ON h.node_id = n.id AND h.buyer_id = $1
          WHERE n.status = 'active' AND n.id IS DISTINCT FROM $2
          ORDER BY (h.node_id IS NOT NULL), RANDOM() LIMIT 1`,
        [buyerId, row?.current_node_id || -1]
    ).catch(() => null);
    if (!node) return { ok: false, error: "no_seams" };
    await db.query(`UPDATE mkt_mining SET current_node_id = $2, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, node.id]).catch(() => {});
    await trackActivity(buyerId, "ore_prospect", {}).catch(() => {});
    return { ok: true, ...(await getMiningState(buyerId)) };
}

// How hard one swing lands, before the timing grade. Pickaxe track is the whole of it for now; the mining gear
// stat and the mining set plug in here in phase 3.
function swingPower(row) {
    const base = 18;
    return Math.max(1, Math.round(base * (1 + trackValue("pick", row?.pick_level))));
}

// ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
// `dist` is the client's distance-from-centre off the timing bar. Graded HERE and clamped, so a tampered client
// can't claim a perfect strike every time.
export async function swingAtNode(buyerId, nodeId, dist = null) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const arrivedAt = new Date(); // stamped on ARRIVAL — our latency is not the player's cadence
    const row = await minerRow(buyerId);
    if (!row) return { ok: false, error: "no_miner" };

    const allowance = SWINGS_PER_DAY + trackValue("vigor", row.vigor_level) + (Number(row.swing_bonus) || 0);
    if ((Number(row.swing_used) || 0) >= allowance) return { ok: false, error: "out_of_swings" };

    const node = await db.queryOne(`SELECT id, tier, hp, hp_max, x, y FROM mkt_ore_node WHERE id = $1 AND status = 'active'`, [nodeId]).catch(() => null);
    if (!node) return { ok: false, error: "node_gone" };

    const prior = await db.queryOne(`SELECT combo, last_swing_at FROM mkt_ore_node_hit WHERE node_id = $1 AND buyer_id = $2`, [nodeId, buyerId]).catch(() => null);
    if (prior?.last_swing_at && Date.now() - new Date(prior.last_swing_at).getTime() < SWING_THROTTLE_MS) {
        return { ok: false, error: "too_fast" };
    }

    // A distance of exactly 0 is the BEST swing in the game — test for null, never for falsiness. (The raid
    // shipped `|| 0.5` here and graded dead-centre hits as the worst possible outcome.)
    const clamped = dist == null || Number.isNaN(Number(dist)) ? 0.5 : Math.min(0.5, Math.max(0, Number(dist)));
    const grade = gradeForDist(clamped);

    const kept = (GRADE_RANK[grade.key] ?? 0) >= GRADE_RANK[COMBO_MIN_GRADE];
    const combo = kept ? (Number(prior?.combo) || 0) + 1 : 0;
    const comboMult = Math.min(COMBO_MAX, 1 + Math.max(0, combo - 1) * COMBO_STEP);

    const damage = Math.max(1, Math.round(swingPower(row) * grade.mult * comboMult));

    // Spend the swing first, atomically — a swing that lands must always have been paid for.
    const spent = await db
        .queryOne(
            `UPDATE mkt_mining SET swing_used = swing_used + 1, updated_at = NOW()
              WHERE buyer_id = $1 AND swing_day = ${DAY} AND swing_used < $2 RETURNING swing_used`,
            [buyerId, allowance]
        )
        .catch(() => null);
    if (!spent) return { ok: false, error: "out_of_swings" };

    const after = await db.queryOne(
        `UPDATE mkt_ore_node SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`,
        [nodeId, damage]
    ).catch(() => null);
    await db.query(
        `INSERT INTO mkt_ore_node_hit (node_id, buyer_id, damage, swings, combo, last_swing_at, grade_sum) VALUES ($1, $2, $3, 1, $4, $5, $6)
         ON CONFLICT (node_id, buyer_id) DO UPDATE SET damage = mkt_ore_node_hit.damage + $3,
             swings = mkt_ore_node_hit.swings + 1, combo = $4, last_swing_at = $5,
             grade_sum = mkt_ore_node_hit.grade_sum + $6`,
        [nodeId, buyerId, damage, combo, arrivedAt, grade.mult]
    ).catch(() => {});
    if (combo > (Number(row.best_combo) || 0)) {
        await db.query(`UPDATE mkt_mining SET best_combo = $2 WHERE buyer_id = $1`, [buyerId, combo]).catch(() => {});
    }

    const hp = after?.hp ?? node.hp;
    let cracked = null;
    if (hp <= 0) cracked = await claimNode(buyerId, node, row);

    return {
        ok: true,
        damage, grade: grade.key, gradeLabel: grade.label,
        combo, comboMult: Math.round(comboMult * 100) / 100, comboBroken: !kept && (Number(prior?.combo) || 0) >= 3,
        cooldownMs: SWING_COOLDOWN_MS[grade.key] ?? SWING_COOLDOWN_MS.miss,
        nodeId: Number(nodeId), hp, hpMax: Number(node.hp_max),
        pct: node.hp_max ? Math.max(0, Math.round((hp / node.hp_max) * 100)) : 0,
        cracked,
        swingsLeft: Math.max(0, allowance - (Number(spent.swing_used) || 0)),
    };
}

// The node broke. Whoever landed the blow takes the ore; the node closes and the next read spawns a replacement.
async function claimNode(buyerId, node, row) {
    const won = await db
        .queryOne(`UPDATE mkt_ore_node SET status = 'mined', mined_by = $2, mined_at = NOW() WHERE id = $1 AND status = 'active' RETURNING tier`, [node.id, buyerId])
        .catch(() => null);
    if (!won) return null; // someone else's swing landed first

    const o = oreTier(node.tier);
    // How well you actually dug it: mean grade across your swings on this seam, normalised.
    const mine = await db.queryOne(`SELECT swings, grade_sum FROM mkt_ore_node_hit WHERE node_id = $1 AND buyer_id = $2`, [node.id, buyerId]).catch(() => null);
    const swings = Math.max(1, Number(mine?.swings) || 1);
    const quality = Math.max(0, Math.min(1, (Number(mine?.grade_sum) || 0) / swings / MAX_GRADE_MULT));
    const rung = rungForQuality(quality);
    const haul = Math.max(1, Math.round(baseOre(node.tier) * rung.mult * (1 + trackValue("haul", row?.haul_level))));
    await db.query(
        `INSERT INTO mkt_ore (buyer_id, tier, qty) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, tier) DO UPDATE SET qty = mkt_ore.qty + EXCLUDED.qty`,
        [buyerId, node.tier, haul]
    ).catch(() => {});
    await db.query(
        `UPDATE mkt_mining SET nodes_mined = nodes_mined + 1, ore_total = ore_total + $2, updated_at = NOW() WHERE buyer_id = $1`,
        [buyerId, haul]
    ).catch(() => {});

    const gold = o.gold;
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "mining", { balanceAfter: paid?.gold, meta: { tier: node.tier } }).catch(() => {});
    // gold: 0 — awardXp pays gold 1:1 with points otherwise, and this is a repeatable action.
    await awardXp(buyerId, "mining", { points: o.xp, gold: 0 }).catch(() => {});
    await trackActivity(buyerId, "ore_mined", { tier: node.tier, ore: haul }).catch(() => {});

    return {
        tier: node.tier, name: o.name, color: o.color, art: oreArt(node.tier),
        ore: haul, gold, xp: o.xp, partTier: o.part,
        rung: rung.rung, rungKey: rung.key, rungLabel: rung.label, rungBlurb: rung.blurb,
        quality: Math.round(quality * 100), swings,
    };
}

// ── SMELTING ─────────────────────────────────────────────────────────────────────────────────────────────────
// Ore → forge parts, which is the whole reason mining exists: it feeds the Forge rather than running beside it.
// Ore of tier N becomes a part of tier N — the tiers line up 1:1 so nobody has to learn a table. The three
// smelting tracks bend that: the Crucible lowers the ore per part, the Bellows sometimes adds one, and Flux
// sometimes lifts one a tier.
export async function smeltOre(buyerId, tier, batches = 1) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = Number(tier);
    if (!ORE_TIERS[t]) return { ok: false, error: "bad_tier" };
    const row = await minerRow(buyerId);
    const cost = smeltCostFor(row?.crucible_level);
    const n = Math.max(1, Math.min(50, Math.floor(Number(batches) || 1)));
    const spend = cost * n;

    // Atomic guarded spend — the WHERE is what stops a double-tap smelting ore you no longer have.
    const spent = await db
        .queryOne(`UPDATE mkt_ore SET qty = qty - $3 WHERE buyer_id = $1 AND tier = $2 AND qty >= $3 RETURNING qty`, [buyerId, t, spend])
        .catch(() => null);
    if (!spent) return { ok: false, error: "not_enough_ore" };

    const o = oreTier(t);
    // BELLOWS: a hotter burn sometimes yields an extra part. Rolled per batch, so the upgrade is felt on a big
    // smelt rather than being a rounding error on a small one.
    const bonusChance = smeltValue("bellows", row?.bellows_level);
    let bonus = 0;
    for (let i = 0; i < n; i += 1) if (Math.random() < bonusChance) bonus += 1;
    // FLUX: a purer melt sometimes lifts a part a whole tier (never past the top).
    const fluxChance = smeltValue("flux", row?.flux_level);
    const made = {};
    const add = (tierN, count) => { made[tierN] = (made[tierN] || 0) + count; };
    for (let i = 0; i < n + bonus; i += 1) {
        const lifted = o.part < 5 && Math.random() < fluxChance;
        add(lifted ? o.part + 1 : o.part, 1);
    }

    const { addParts } = await import("@/lib/marketplace/crafting.js");
    for (const [partTier, count] of Object.entries(made)) await addParts(buyerId, Number(partTier), count).catch(() => {});
    await trackActivity(buyerId, "ore_smelted", { tier: t, ore: spend, parts: n + bonus, bonus, partTier: o.part }).catch(() => {});
    return {
        ok: true,
        smelted: {
            oreTier: t, oreName: o.name, oreSpent: spend, partTier: o.part,
            parts: n + bonus, bonus,
            // What actually came out, by part tier — Flux means it isn't always the tier you put in.
            byTier: Object.entries(made).map(([pt, count]) => ({ partTier: Number(pt), count, lifted: Number(pt) > o.part })).sort((a, b) => a.partTier - b.partTier),
        },
        ...(await getMiningState(buyerId)),
    };
}

// ── UPGRADES ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function upgradeMining(buyerId, track) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = MINE_TRACKS[track] || SMELT_TRACKS[track];
    if (!t) return { ok: false, error: "bad_track" };
    const row = await minerRow(buyerId);
    const level = Number(row?.[t.col]) || 0;
    if (level >= t.max) return { ok: false, error: "maxed" };
    const cost = trackCost(level);

    const paid = await db
        .queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost])
        .catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    await logCoin(buyerId, -cost, "mining_upgrade", { balanceAfter: paid.gold, meta: { track } }).catch(() => {});
    await db.query(`UPDATE mkt_mining SET ${t.col} = ${t.col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await trackActivity(buyerId, "mining_upgrade", { track, to: level + 1 }).catch(() => {});
    return { ok: true, ...(await getMiningState(buyerId)) };
}
