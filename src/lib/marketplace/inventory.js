import "server-only";

import { db } from "@/lib/db";
import { getMemberMetrics, progressForRule } from "@/lib/marketplace/badges.js";
import { EQUIP_SLOTS, ITEMS, itemById, itemFitsSlot, sumItemStats } from "@/lib/marketplace/items.js";
import { levelForXp } from "@/lib/marketplace/xp.js";

// ---- Requirements ----
async function memberContext(buyerId) {
    const [row, badgeRows] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    return { level: levelForXp(row?.xp || 0).level, badges: new Set(badgeRows.map((r) => r.badge_slug)) };
}

export function itemLockReason(item, ctx, metrics = null) {
    if (item.reqLevel && ctx.level < item.reqLevel) return `Reach Level ${item.reqLevel}`;
    if (item.reqBadge && !ctx.badges.has(item.reqBadge)) return `Requires the ${item.reqBadge} badge`;
    if (item.reqMetric && metrics) {
        const { current, target } = progressForRule(item.reqMetric, item.reqThreshold, metrics);
        if (current < target) return `Requires ${target} ${item.reqMetric.replace(/_/g, " ")}`;
    }
    return null;
}

// ---- Ownership + equipped state + aggregated stats ----
export async function getEquippedIds(buyerId) {
    const rows = await db.query(`SELECT slot, item_id FROM mkt_user_equipment WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const bySlot = {};
    for (const r of rows) bySlot[r.slot] = r.item_id;
    return bySlot;
}

// Aggregated equipped stats — used by the boss combat.
export async function getEquippedStats(buyerId) {
    if (!buyerId) return {};
    const bySlot = await getEquippedIds(buyerId);
    return sumItemStats(Object.values(bySlot));
}

// Equipped stats for many members at once (one query) — used by the hourly auto-tick.
export async function getEquippedStatsForMembers(buyerIds = []) {
    const out = new Map();
    if (!buyerIds.length) return out;
    const rows = await db.query(`SELECT buyer_id, item_id FROM mkt_user_equipment WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    const byBuyer = new Map();
    for (const r of rows) { if (!byBuyer.has(r.buyer_id)) byBuyer.set(r.buyer_id, []); byBuyer.get(r.buyer_id).push(r.item_id); }
    for (const [id, ids] of byBuyer) out.set(id, sumItemStats(ids));
    return out;
}

// Grant a random not-yet-owned item from a source pool (e.g. a boss-kill drop). Returns the item or null.
export async function grantRandomDrop(buyerId, { source = "boss_drop" } = {}) {
    const pool = ITEMS.filter((i) => i.source === source);
    if (!pool.length) return null;
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    const candidates = pool.filter((i) => !owned.has(i.id));
    if (!candidates.length) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const res = await grantItem(buyerId, pick.id, source);
    return res.granted ? pick : null;
}

// Availability of a charged item's next use (charges left + cooldown elapsed).
function chargeState(ownedRow, item) {
    if (!item?.charged) return null;
    const left = Math.max(0, ownedRow?.charges_left ?? 0);
    const cd = Math.max(0, item.cooldownDays || 0);
    const last = ownedRow?.last_charge_at ? new Date(ownedRow.last_charge_at).getTime() : 0;
    const readyAt = last ? last + cd * 86400000 : 0;
    const now = Date.now();
    return {
        charges: item.charges, left,
        available: left > 0 && now >= readyAt,
        cooldownUntil: left > 0 && now < readyAt ? new Date(readyAt).toISOString() : null,
        reward: item.chargeReward, rewardLabel: item.chargeRewardLabel,
    };
}

// Full inventory view for the member's screen: owned items (+ charge state), the equipped loadout by slot,
// and total stats.
export async function getInventory(buyerId) {
    if (!buyerId) return { items: [], equipped: {}, slots: EQUIP_SLOTS, stats: {} };
    const [ownedRows, bySlot] = await Promise.all([
        db.query(`SELECT item_id, acquired_via, charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getEquippedIds(buyerId),
    ]);
    const equippedIds = new Set(Object.values(bySlot));
    const items = ownedRows
        .map((r) => {
            const def = itemById(r.item_id);
            if (!def) return null;
            return { ...def, owned: true, equipped: equippedIds.has(def.id), charge: chargeState(r, def) };
        })
        .filter(Boolean)
        .sort((a, z) => (a.sort || 100) - (z.sort || 100));
    return { items, equipped: bySlot, slots: EQUIP_SLOTS, stats: sumItemStats(Object.values(bySlot)) };
}

// ---- Mutations ----
async function bumpEquipment(buyerId) {
    await db.query(`UPDATE mkt_buyer SET equipment_updated_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
}

export async function equipItem(buyerId, slot, itemId) {
    if (!buyerId) throw new Error("Not signed in.");
    const item = itemById(itemId);
    if (!item) throw new Error("Unknown item.");
    if (!itemFitsSlot(item, slot)) throw new Error(`That doesn't go in the ${slot} slot.`);
    const owned = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owned) throw new Error("You don't own that item.");
    // Enforce the item's requirements — you can OWN gear above your level, but not equip it yet.
    const ctx = await memberContext(buyerId);
    const metrics = item.reqMetric ? await getMemberMetrics(buyerId).catch(() => null) : null;
    const lock = itemLockReason(item, ctx, metrics);
    if (lock) throw new Error(lock + " to equip this.");
    // If it's equipped in the OTHER ring slot, move it (an item can't be in two slots).
    await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => {});
    await db.query(
        `INSERT INTO mkt_user_equipment (buyer_id, slot, item_id) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, slot) DO UPDATE SET item_id = $3`,
        [buyerId, slot, itemId]
    );
    await bumpEquipment(buyerId);
    return getInventory(buyerId);
}

export async function unequipItem(buyerId, slot) {
    if (!buyerId) throw new Error("Not signed in.");
    await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND slot = $2`, [buyerId, slot]).catch(() => {});
    await bumpEquipment(buyerId);
    return getInventory(buyerId);
}

// Grant an item (level unlock, boss drop, admin, xp shop). Idempotent per (buyer, item). Inits charges.
export async function grantItem(buyerId, itemId, via = "admin") {
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    const rows = await db
        .query(
            `INSERT INTO mkt_user_item (buyer_id, item_id, acquired_via, charges_left)
             VALUES ($1, $2, $3, $4) ON CONFLICT (buyer_id, item_id) DO NOTHING RETURNING id`,
            [buyerId, itemId, via, item.charged ? item.charges : 0]
        )
        .catch(() => []);
    return { ok: true, granted: rows.length > 0 };
}

// Auto-grant the level/milestone items a member now qualifies for (source: 'level'). Like pets unlocking.
export async function syncLevelItems(buyerId) {
    if (!buyerId) return [];
    const [ctx, ownedRows, metrics] = await Promise.all([
        memberContext(buyerId),
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getMemberMetrics(buyerId).catch(() => null),
    ]);
    const owned = new Set(ownedRows.map((r) => r.item_id));
    const granted = [];
    for (const item of ITEMS) {
        if (item.source !== "level" || owned.has(item.id)) continue;
        if (itemLockReason(item, ctx, metrics)) continue;
        const res = await grantItem(buyerId, item.id, "level");
        if (res.granted) granted.push(item);
    }
    return granted;
}

// ---- Admin: charged-perk redemption ----
export async function redeemCharge(buyerId, itemId, { by = "admin", note = null } = {}) {
    const item = itemById(itemId);
    if (!item?.charged) return { ok: false, error: "not_chargeable" };
    const owned = await db.queryOne(`SELECT charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owned) return { ok: false, error: "not_owned" };
    const state = chargeState(owned, item);
    if (!state.available) return { ok: false, error: state.left <= 0 ? "no_charges" : "on_cooldown", cooldownUntil: state.cooldownUntil };
    await db.query(`UPDATE mkt_user_item SET charges_left = charges_left - 1, last_charge_at = NOW() WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]);
    await db.query(
        `INSERT INTO mkt_item_redemption (buyer_id, item_id, reward, reward_label, redeemed_by, note) VALUES ($1, $2, $3, $4, $5, $6)`,
        [buyerId, itemId, item.chargeReward, item.chargeRewardLabel, by, note]
    ).catch(() => {});
    return { ok: true, chargesLeft: Math.max(0, state.left - 1), reward: item.chargeRewardLabel };
}

// Members holding charged items, for the admin redemption browser. `q` matches name/alias/email.
export async function listUsableItems({ q = "" } = {}) {
    const term = String(q || "").trim().toLowerCase();
    const chargedIds = ITEMS.filter((i) => i.charged).map((i) => i.id);
    if (!chargedIds.length) return [];
    const params = [chargedIds];
    let where = `ui.item_id = ANY($1)`;
    if (term) { params.push(`%${term}%`); where += ` AND LOWER(COALESCE(b.display_name,'') || ' ' || COALESCE(b.alias,'') || ' ' || COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'') || ' ' || COALESCE(b.email,'')) LIKE $2`; }
    const rows = await db
        .query(
            `SELECT b.id AS buyer_id, b.display_name, b.first_name, b.last_name, b.alias, b.email,
                    ui.item_id, ui.charges_left, ui.last_charge_at
               FROM mkt_user_item ui JOIN mkt_buyer b ON b.id = ui.buyer_id
              WHERE ${where}
              ORDER BY b.display_name NULLS LAST, b.alias NULLS LAST`,
            params
        )
        .catch(() => []);
    const byBuyer = new Map();
    for (const r of rows) {
        const def = itemById(r.item_id);
        if (!def) continue;
        if (!byBuyer.has(r.buyer_id)) {
            byBuyer.set(r.buyer_id, {
                buyerId: r.buyer_id,
                name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || r.alias || "Member",
                alias: r.alias || null,
                email: r.email || null,
                items: [],
            });
        }
        byBuyer.get(r.buyer_id).items.push({ itemId: def.id, name: def.name, ...chargeState(r, def) });
    }
    return [...byBuyer.values()];
}
