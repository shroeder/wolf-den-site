import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { mint } from "@/lib/marketplace/gold-rate.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import {
    GROVE_ZONES, GROVE_ENEMIES, GROVE_RARE, GROVE_PARTS, GROVE_EMBLEMS, GROVE_POP,
    GROVE_FOODS, HEAL_AT, emblemStars, groveZone,
} from "@/lib/marketplace/grove-catalog.js";
import { settleKills } from "@/lib/marketplace/grove-roll.js";
import {
    GROVE_RECIPES, recipeById, discoveredRecipes, tabletBonuses, TOOL_SLOTS, toolBonusPct,
} from "@/lib/marketplace/grove-recipes.js";

// ── THE GROVE, SERVER SIDE ───────────────────────────────────────────────────────────────────────────────────
// The client plays the whole scene (see grove-roll.js for why). This file does the four things the client is
// not allowed to do: issue the seed, grant what the seed produces, hold the bag and the bank, and craft.
//
// ⚠️ OWNER-GATED. Luke: "We will start by owner gating all of this." One door, checked in one place.
export const groveOpen = (buyerId) => isOwner(buyerId);

const ZONE_BY_ID = Object.fromEntries(GROVE_ZONES.map((z) => [z.id, z]));
const foeById = (id) => (id === GROVE_RARE.id ? GROVE_RARE : GROVE_ENEMIES[id] || null);

// ── WHERE THE SERVER KEEPS AUTHORITY ─────────────────────────────────────────────────────────────────────────
// Luke: "we need to strike a balance between cost and server authority ... since we cant push all of it on the
// client due to exploits and responsiveness. But if we can save cost we should."
//
// The three checks below are the balance. Every one of them costs ZERO extra queries — they are arithmetic and
// table lookups against data already in memory — and between them they close the only lies the client can
// tell. Motion, targeting, telegraph timing, camera and loot spill stay on the client, because those are
// presentation and must be instant; what you GET and HOW FAST you can get it stay here.
//
//   1. the loot roll        already server-side (grove-roll.js) — the client cannot invent a drop
//   2. zone membership      you cannot claim a creature that does not live in that zone
//   3. a rolling window     bounded by wall clock, which nothing the client does can reset
//
// ── 1. THE ROLLING WINDOW ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS USED TO RESET EVERY TIME YOU WALKED IN. groveEnter set kills_settled = 0, so the "session budget"
// was really a budget per ENTRY: enter, settle the maximum, leave, enter again, repeat for ever. The guard
// existed and was free to walk around.
//
// It is wall-clock now. A zone holds at most GROVE_POP.max and refills every respawnMs, so there is a hard
// physical roof on kills per minute, and entering more often does not create more enemies.
//
// Generous on purpose (3x): a laggy phone settling ninety seconds of play in one burst must never be punished
// for it. This stops a thousand-kill claim, not a fast player.
const KILL_CEILING_SLACK = 3;
export const KILL_WINDOW_MS = 10 * 60 * 1000;

export function killCeiling(elapsedMs) {
    const windows = Math.max(1, Math.ceil((Number(elapsedMs) || 0) / GROVE_POP.respawnMs));
    return (GROVE_POP.max * windows + GROVE_POP.max) * KILL_CEILING_SLACK;
}

// ── 2. ZONE MEMBERSHIP ───────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE WORST EXPLOIT THAT WAS OPEN, AND THE CHEAPEST TO CLOSE. Nothing checked that a claimed kill belonged
// to the zone it was claimed in — so a settle could report twelve Elderlings in Thicket Edge and be handed
// tier-6 Elder Heartwood on the first node of the map, skipping the entire thing. A Set built from the zone's
// own enemy list, which is already in memory. No query, no cost.
function allowedIn(zone) {
    return new Set([...(zone.enemies || []), zone.boss, GROVE_RARE.id]);
}

async function playerRow(buyerId) {
    const row = await db.queryOne(`SELECT * FROM mkt_grove_player WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    if (row) return row;
    await db.query(`INSERT INTO mkt_grove_player (buyer_id) VALUES ($1) ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    return db.queryOne(`SELECT * FROM mkt_grove_player WHERE buyer_id = $1`, [buyerId]).catch(() => null);
}

/** Emblem-derived multipliers, which the roll needs and the client is told so its preview matches. */
function bonusesFrom(emblemRows) {
    const out = { rarityFind: 0, emblemFind: 0, rareSpawn: 0 };
    for (const r of emblemRows || []) {
        const meta = GROVE_EMBLEMS[r.emblem_id];
        if (!meta || r.slot === null || r.slot === undefined) continue;   // only EQUIPPED emblems apply
        const { stars } = emblemStars(r.count);
        if (!stars) continue;
        const v = Number(meta.per) * stars;
        if (meta.stat === "rarity_find") out.rarityFind += v;
        else if (meta.stat === "emblem_find") out.emblemFind += v;
        else if (meta.stat === "rare_spawn") out.rareSpawn += v;
    }
    return out;
}

/** The whole screen: where you are, what you carry, what you have seen, what you can make. */
export async function groveState(buyerId) {
    if (!buyerId || !groveOpen(buyerId)) return { ok: false, error: "closed" };

    const [p, zones, items, seen, emblems, tools] = await Promise.all([
        playerRow(buyerId),
        db.query(`SELECT zone_id, kills, boss_done FROM mkt_grove_zone WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT place, part_id, qty FROM mkt_grove_item WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT part_id FROM mkt_grove_seen WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT slot, tier FROM mkt_grove_tool WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);

    const killsBy = Object.fromEntries((zones || []).map((z) => [z.zone_id, z]));
    const seenSet = new Set((seen || []).map((r) => r.part_id));
    // ⚠️ FOOD SHARES mkt_grove_item WITH PARTS AND IS SPLIT OUT HERE. It occupies a bag slot exactly like a
    // part does — which is the whole tension of the belt: carrying healing costs you carrying loot — but the
    // workbench must not offer to craft a poultice OUT OF poultices, so the two are separated by identity
    // rather than by table.
    const pack = {};
    const bank = {};
    const food = {};
    for (const r of items || []) {
        if (GROVE_FOODS[r.part_id]) { food[r.part_id] = Number(r.qty); continue; }
        (r.place === "bank" ? bank : pack)[r.part_id] = Number(r.qty);
    }

    return {
        ok: true,
        unlockedN: Number(p?.unlocked_n) || 1,
        packSlots: Number(p?.pack_slots) || 16,
        bankSlots: Number(p?.bank_slots) || 16,
        packsBuilt: p?.packs_built || [],
        banksBuilt: p?.banks_built || [],
        zones: GROVE_ZONES.map((z) => ({
            ...z,
            kills: Number(killsBy[z.id]?.kills) || 0,
            bossDone: Boolean(killsBy[z.id]?.boss_done),
            unlocked: z.n <= (Number(p?.unlocked_n) || 1),
        })),
        pack,
        bank,
        food,
        // What auto-eats, and the threshold it fires at. Luke: "if you get below 60 percent hp."
        belt: p?.belt || null,
        healAt: HEAL_AT,
        foods: GROVE_FOODS,
        // One row per slot holding the best tier reached. Map two raises these; nothing here changes.
        tools: Object.fromEntries((tools || []).map((t) => [t.slot, Number(t.tier) || 0])),
        toolMeta: TOOL_SLOTS.map((t) => ({
            ...t,
            tier: Number((tools || []).find((x) => x.slot === t.slot)?.tier) || 0,
            pct: toolBonusPct((tools || []).find((x) => x.slot === t.slot)?.tier || 0),
        })),
        seen: [...seenSet],
        // The tablet: what you have seen out of everything there is, and what that is worth.
        tablet: { seen: seenSet.size, total: Object.keys(GROVE_PARTS).length, bonuses: tabletBonuses(seenSet.size) },
        recipes: discoveredRecipes(seenSet).map((r) => r.id),
        emblems: (emblems || []).map((e) => ({
            id: e.emblem_id, count: Number(e.count), slot: e.slot,
            ...emblemStars(Number(e.count)), meta: GROVE_EMBLEMS[e.emblem_id] || null,
        })),
        bonuses: bonusesFrom(emblems),
    };
}

/** Open a zone: hand back the seed the client plays from. */
export async function groveEnter(buyerId, zoneId) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const zone = groveZone(zoneId);
    if (!zone) return { ok: false, error: "no_zone" };
    const p = await playerRow(buyerId);
    if (zone.n > (Number(p?.unlocked_n) || 1)) return { ok: false, error: "locked" };

    // ⚠️ THE SEED IS THE SERVER'S. A client-chosen seed is a client that can shop for one that drops well.
    const seed = Math.floor(Math.random() * 0x7fffffff);
    await db.query(
        // ⚠️ kills_settled IS NO LONGER RESET HERE. It used to be, which made the kill ceiling a budget per
        // ENTRY rather than per unit of time — enter, settle the maximum, leave, enter again. The bound is
        // the rolling window now (see killCeiling), and nothing the client does resets a clock.
        `UPDATE mkt_grove_player SET seed = $2, seed_zone = $3, seed_at = NOW(), updated_at = NOW()
          WHERE buyer_id = $1`,
        [buyerId, seed, zoneId],
    ).catch(() => {});

    const emblems = await db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return { ok: true, seed, zone, pop: GROVE_POP, bonuses: bonusesFrom(emblems) };
}

/**
 * Settle a burst of kills.
 *
 * ⚠️ TAKES IDS AND INDEXES, NEVER ITEMS. The client says what it killed; the server decides what fell out.
 */
export async function groveSettle(buyerId, { zoneId, kills = [], eaten = {} } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const zone = groveZone(zoneId);
    if (!zone) return { ok: false, error: "no_zone" };

    const p = await playerRow(buyerId);
    if (!p?.seed || p.seed_zone !== zoneId) return { ok: false, error: "no_session" };

    // ── THE THREE CHECKS ────────────────────────────────────────────────────────────────────────────
    const now = Date.now();
    const windowAt = new Date(p.kills_window_at || now).getTime();
    const windowFresh = now - windowAt > KILL_WINDOW_MS;
    const windowUsed = windowFresh ? 0 : (Number(p.kills_window) || 0);
    const ceiling = killCeiling(windowFresh ? KILL_WINDOW_MS : now - windowAt);

    // Membership first: a claim for a creature that does not live here is dropped outright rather than
    // trimmed, because it is not a fast player, it is a wrong one.
    const allowed = allowedIn(zone);
    const legal = (kills || []).filter((k) => allowed.has(k?.id));
    const rejected = (kills || []).length - legal.length;

    // Then the window. Trimmed rather than refused — a burst that overruns is far more likely to be a phone
    // catching up than an attack, and refusing it outright would lose honest play.
    const list = legal.slice(0, Math.max(0, ceiling - windowUsed));
    if (!list.length) return { ok: true, granted: null, parts: {}, capped: true, rejected };

    // ── FOOD EATEN IN THE ZONE ──────────────────────────────────────────────────────────────────────
    // ⚠️ DEBITED CONDITIONALLY, AND A SHORTFALL IS NOT AN ERROR. The scene eats when you drop below 60% and
    // reports how many it got through; the server takes what is actually there. It cannot verify the eating
    // — it does not track HP, because combat is the client's — so the honest guard is simply that you cannot
    // eat food you do not own. Claiming more than you have takes what you have and stops, which is the same
    // outcome as running out mid-fight.
    const ate = {};
    for (const [foodId, n] of Object.entries(eaten || {})) {
        if (!GROVE_FOODS[foodId]) continue;
        const want = Math.max(0, Math.round(Number(n) || 0));
        if (!want) continue;
        const row = await db.queryOne(
            `UPDATE mkt_grove_item SET qty = GREATEST(0, qty - $3) WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2
             RETURNING qty`, [buyerId, foodId, want],
        ).catch(() => null);
        if (row) ate[foodId] = want;
    }

    const emblemRows = await db.query(`SELECT emblem_id, count, slot FROM mkt_grove_emblem WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const got = settleKills(list, foeById, Number(p.seed), bonusesFrom(emblemRows));

    // ── PARTS INTO THE BAG ──────────────────────────────────────────────────────────────────────────
    // ⚠️ THE BAG HAS A CEILING AND IT IS COUNTED IN ROWS. Sixteen "unique slots" means sixteen distinct
    // parts, not sixteen items — a part you already hold stacks for free, a new one needs a slot. Anything
    // that does not fit is simply not granted and the client is told, rather than silently vanishing.
    const held = await db.query(`SELECT part_id FROM mkt_grove_item WHERE buyer_id = $1 AND place = 'pack' AND qty > 0`, [buyerId]).catch(() => []);
    const heldSet = new Set((held || []).map((r) => r.part_id));
    const packSlots = Number(p.pack_slots) || 16;

    const stored = {};
    const overflow = {};
    for (const [part, n] of Object.entries(got.parts)) {
        if (!heldSet.has(part) && heldSet.size >= packSlots) { overflow[part] = n; continue; }
        heldSet.add(part);
        stored[part] = n;
        await db.query(
            `INSERT INTO mkt_grove_item (buyer_id, place, part_id, qty) VALUES ($1, 'pack', $2, $3)
             ON CONFLICT (buyer_id, place, part_id) DO UPDATE SET qty = mkt_grove_item.qty + $3`,
            [buyerId, part, n],
        ).catch(() => {});
    }

    // ── SEEN — EVEN WHAT OVERFLOWED ─────────────────────────────────────────────────────────────────
    // ⚠️ DISCOVERY IS SEEING, NOT KEEPING. A part that fell out while the bag was full was still found, and
    // the recipe it unlocks must unlock. This is the exact case the design calls out.
    const newlySeen = [];
    for (const part of [...Object.keys(got.parts)]) {
        const ins = await db.queryOne(
            `INSERT INTO mkt_grove_seen (buyer_id, part_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING RETURNING part_id`, [buyerId, part],
        ).catch(() => null);
        if (ins) newlySeen.push(part);
    }

    // ── EMBLEMS ─────────────────────────────────────────────────────────────────────────────────────
    for (const [em, n] of Object.entries(got.emblems)) {
        await db.query(
            `INSERT INTO mkt_grove_emblem (buyer_id, emblem_id, count) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, emblem_id) DO UPDATE SET count = mkt_grove_emblem.count + $3`,
            [buyerId, em, n],
        ).catch(() => {});
    }

    // ── XP, GOLD, CHESTS ────────────────────────────────────────────────────────────────────────────
    // ⚠️ gold: 0 IS LOAD-BEARING. awardXp pays gold 1:1 with points otherwise, and on a kill loop that is a
    // money printer. See awardxp-gold-tracks-xp-landmine.
    if (got.xp > 0) {
        await awardXp(buyerId, "grove", { points: got.xp, gold: 0 }).catch(() => {});
    }
    // Only ever from the rare spawn — see the roll.
    if (got.gold > 0) {
        const paid = mint(got.gold, "grove_rare");
        const after = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, paid]).catch(() => null);
        await logCoin(buyerId, paid, "grove_rare", { balanceAfter: after?.gold, meta: { zone: zoneId } }).catch(() => {});
    }
    for (const tier of got.chests) {
        await addChests(buyerId, { [tier]: 1 }, { source: "grove_rare" }).catch(() => {});
    }

    // ── ZONE PROGRESS, AND THE UNLOCK ───────────────────────────────────────────────────────────────
    const z = await db.queryOne(
        `INSERT INTO mkt_grove_zone (buyer_id, zone_id, kills) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, zone_id) DO UPDATE SET kills = mkt_grove_zone.kills + $3
         RETURNING kills`,
        [buyerId, zoneId, list.length],
    ).catch(() => null);

    let unlocked = null;
    if (Number(z?.kills) >= zone.toUnlock && zone.n < GROVE_ZONES.length) {
        const next = GROVE_ZONES[zone.n]; // zone.n is 1-based, so this is the one after it
        const up = await db.queryOne(
            `UPDATE mkt_grove_player SET unlocked_n = GREATEST(unlocked_n, $2), updated_at = NOW()
              WHERE buyer_id = $1 RETURNING unlocked_n`,
            [buyerId, next.n],
        ).catch(() => null);
        if (Number(up?.unlocked_n) === next.n) unlocked = next;
    }

    // One UPDATE, folded into what settle already writes — the window costs no extra round trip. A stale
    // window is reset here rather than by a cron: the only thing that needs to know is the next settle.
    await db.query(
        `UPDATE mkt_grove_player
            SET kills_settled = kills_settled + $2,
                kills_window = CASE WHEN NOW() - kills_window_at > ($3 || ' milliseconds')::interval
                                    THEN $2 ELSE kills_window + $2 END,
                kills_window_at = CASE WHEN NOW() - kills_window_at > ($3 || ' milliseconds')::interval
                                       THEN NOW() ELSE kills_window_at END
          WHERE buyer_id = $1`,
        [buyerId, list.length, String(KILL_WINDOW_MS)],
    ).catch(() => {});
    await trackActivity(buyerId, "grove_settle", { zone: zoneId, kills: list.length }).catch(() => {});

    return {
        ok: true,
        parts: stored,
        overflow,
        emblems: got.emblems,
        gold: got.gold,
        chests: got.chests,
        xp: got.xp,
        newlySeen,
        ate,
        rejected,
        zoneKills: Number(z?.kills) || 0,
        unlocked,
        capped: list.length < (kills || []).length,
    };
}

/** Move a part between the bag and the bank. Slots are counted in ROWS at the destination. */
export async function groveMove(buyerId, { partId, from, to, qty = 1 } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    if (!GROVE_PARTS[partId] || !["pack", "bank"].includes(from) || !["pack", "bank"].includes(to) || from === to) {
        return { ok: false, error: "bad_move" };
    }
    const p = await playerRow(buyerId);
    const n = Math.max(1, Math.round(Number(qty) || 1));

    // Conditional debit: two taps must not move the same part twice.
    const taken = await db.queryOne(
        `UPDATE mkt_grove_item SET qty = qty - $4 WHERE buyer_id = $1 AND place = $2 AND part_id = $3 AND qty >= $4
         RETURNING qty`, [buyerId, from, partId, n],
    ).catch(() => null);
    if (!taken) return { ok: false, error: "not_enough" };

    const dstSlots = to === "bank" ? (Number(p.bank_slots) || 16) : (Number(p.pack_slots) || 16);
    const dstHeld = await db.query(
        `SELECT part_id FROM mkt_grove_item WHERE buyer_id = $1 AND place = $2 AND qty > 0`, [buyerId, to],
    ).catch(() => []);
    const dstSet = new Set((dstHeld || []).map((r) => r.part_id));
    if (!dstSet.has(partId) && dstSet.size >= dstSlots) {
        // Put it back rather than destroying it.
        await db.query(`UPDATE mkt_grove_item SET qty = qty + $4 WHERE buyer_id = $1 AND place = $2 AND part_id = $3`,
            [buyerId, from, partId, n]).catch(() => {});
        return { ok: false, error: "no_room" };
    }
    await db.query(
        `INSERT INTO mkt_grove_item (buyer_id, place, part_id, qty) VALUES ($1, $2, $3, $4)
         ON CONFLICT (buyer_id, place, part_id) DO UPDATE SET qty = mkt_grove_item.qty + $4`,
        [buyerId, to, partId, n],
    ).catch(() => {});
    return { ok: true };
}

/** Craft a discovered recipe. Parts come out of the BAG. */
export async function groveCraft(buyerId, recipeId) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    const recipe = recipeById(recipeId);
    if (!recipe) return { ok: false, error: "no_recipe" };

    const p = await playerRow(buyerId);

    // ⚠️ ONE-TIME THINGS ARE CHECKED BEFORE ANYTHING IS SPENT. A backpack expansion crafted twice is four
    // slots paid for and four slots given once.
    if (recipe.kind === "pack" && (p.packs_built || []).includes(recipe.id)) return { ok: false, error: "already_built" };
    if (recipe.kind === "bank" && (p.banks_built || []).includes(recipe.id)) return { ok: false, error: "already_built" };
    if (recipe.kind === "tool") {
        const held = await db.queryOne(`SELECT tier FROM mkt_grove_tool WHERE buyer_id = $1 AND slot = $2`,
            [buyerId, recipe.slot]).catch(() => null);
        if (Number(held?.tier) >= Number(recipe.tier)) return { ok: false, error: "already_built" };
    }

    // Discovery gate: you cannot craft what you have not found.
    const seen = await db.query(`SELECT part_id FROM mkt_grove_seen WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const seenSet = new Set((seen || []).map((r) => r.part_id));
    if (!Object.keys(recipe.parts).every((x) => seenSet.has(x))) return { ok: false, error: "not_discovered" };

    // ⚠️ EVERY PART DEBITED CONDITIONALLY, AND ROLLED BACK IF ANY FAILS. neon() over HTTP has no
    // transactions (see CLAUDE.md), so the rollback is by hand — without it a half-paid craft eats parts and
    // gives nothing.
    const spent = [];
    for (const [part, need] of Object.entries(recipe.parts)) {
        const row = await db.queryOne(
            `UPDATE mkt_grove_item SET qty = qty - $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2 AND qty >= $3
             RETURNING qty`, [buyerId, part, need],
        ).catch(() => null);
        if (!row) {
            for (const [backPart, backN] of spent) {
                await db.query(`UPDATE mkt_grove_item SET qty = qty + $3 WHERE buyer_id = $1 AND place = 'pack' AND part_id = $2`,
                    [buyerId, backPart, backN]).catch(() => {});
            }
            return { ok: false, error: "not_enough_parts", missing: part };
        }
        spent.push([part, need]);
    }

    // ── WHAT IT MAKES ───────────────────────────────────────────────────────────────────────────────
    if (recipe.kind === "pack") {
        await db.query(
            `UPDATE mkt_grove_player SET pack_slots = pack_slots + $2, packs_built = array_append(packs_built, $3), updated_at = NOW()
              WHERE buyer_id = $1`, [buyerId, recipe.adds, recipe.id],
        ).catch(() => {});
    } else if (recipe.kind === "bank") {
        // ⚠️ 64 IS THE CEILING Luke named. LEAST() rather than a check so no sequence of crafts can pass it.
        await db.query(
            `UPDATE mkt_grove_player SET bank_slots = LEAST(64, bank_slots + $2), banks_built = array_append(banks_built, $3), updated_at = NOW()
              WHERE buyer_id = $1`, [buyerId, recipe.adds, recipe.id],
        ).catch(() => {});
    } else if (recipe.kind === "food") {
        // Into the bag, where it takes a slot like anything else.
        await db.query(
            `INSERT INTO mkt_grove_item (buyer_id, place, part_id, qty) VALUES ($1, 'pack', $2, $3)
             ON CONFLICT (buyer_id, place, part_id) DO UPDATE SET qty = mkt_grove_item.qty + $3`,
            [buyerId, recipe.id, Math.max(1, Number(recipe.makes) || 1)],
        ).catch(() => {});
    } else if (recipe.kind === "tool") {
        // ⚠️ THE TIER ONLY EVER GOES UP. GREATEST means crafting a tier you already hold, or one below it,
        // cannot quietly downgrade a tool you climbed twenty maps for — and the guard above refuses the
        // craft outright so the parts are not spent on nothing.
        await db.query(
            `INSERT INTO mkt_grove_tool (buyer_id, slot, tier) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, slot) DO UPDATE SET tier = GREATEST(mkt_grove_tool.tier, $3), made_at = NOW()`,
            [buyerId, recipe.slot, Math.max(1, Number(recipe.tier) || 1)],
        ).catch(() => {});
    }
    // deco / plot grants hang off the farm and are wired as that lands; the parts are spent and the craft is
    // recorded either way so nothing is silently free.

    await trackActivity(buyerId, "grove_craft", { recipe: recipe.id, kind: recipe.kind }).catch(() => {});
    return { ok: true, made: recipe.id, kind: recipe.kind, name: recipe.name };
}

/**
 * Put a food on the belt, or take it off.
 *
 * Luke: "a way to equip food or potions that auto heal you if you get below 60 percent hp." One belt, one
 * food — choosing WHICH is the decision, and a belt that held all four would not be one.
 */
export async function groveBelt(buyerId, foodId) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    if (foodId && !GROVE_FOODS[foodId]) return { ok: false, error: "no_food" };
    await playerRow(buyerId);
    await db.query(`UPDATE mkt_grove_player SET belt = $2, updated_at = NOW() WHERE buyer_id = $1`,
        [buyerId, foodId || null]).catch(() => {});
    return { ok: true, belt: foodId || null };
}

/** Equip or unequip an emblem. Three slots now; three more exist and stay locked. */
export async function groveEquipEmblem(buyerId, { emblemId, slot } = {}) {
    if (!groveOpen(buyerId)) return { ok: false, error: "closed" };
    if (!GROVE_EMBLEMS[emblemId]) return { ok: false, error: "no_emblem" };
    if (slot === null) {
        await db.query(`UPDATE mkt_grove_emblem SET slot = NULL WHERE buyer_id = $1 AND emblem_id = $2`, [buyerId, emblemId]).catch(() => {});
        return { ok: true };
    }
    const n = Number(slot);
    if (!Number.isInteger(n) || n < 0 || n > 2) return { ok: false, error: "slot_locked" };
    // Whatever was in that slot steps out first — the unique index would refuse two in one slot.
    await db.query(`UPDATE mkt_grove_emblem SET slot = NULL WHERE buyer_id = $1 AND slot = $2`, [buyerId, n]).catch(() => {});
    await db.query(`UPDATE mkt_grove_emblem SET slot = $3 WHERE buyer_id = $1 AND emblem_id = $2 AND count > 0`, [buyerId, emblemId, n]).catch(() => {});
    return { ok: true };
}

export { GROVE_RECIPES };
