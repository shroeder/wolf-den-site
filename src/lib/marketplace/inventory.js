import "server-only";

import { db } from "@/lib/db";
import { getMemberMetrics, progressForRule } from "@/lib/marketplace/badges.js";
import { EQUIP_SLOTS, ITEMS, describeStats, itemById, itemFitsSlot, sumItemStats } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { setBonusStats, activeSetBonuses, setForItem } from "@/lib/marketplace/sets.js";
import { levelForXp } from "@/lib/marketplace/xp.js";

// Equipped item stats merged with any active set-bonus stats (the single source combat + the UI read).
function withSetBonuses(ids) {
    const total = sumItemStats(ids);
    for (const [k, v] of Object.entries(setBonusStats(ids))) total[k] = (total[k] || 0) + v;
    return total;
}

// ---- Requirements ----
async function memberContext(buyerId) {
    const [row, badgeRows] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    return { level: levelForXp(row?.xp || 0).level, badges: new Set(badgeRows.map((r) => r.badge_slug)) };
}

// Grant gate: drives WHEN level/milestone items are auto-gifted (syncLevelItems). Still uses reqLevel.
export function itemLockReason(item, ctx, metrics = null) {
    if (item.reqLevel && ctx.level < item.reqLevel) return `Reach Level ${item.reqLevel}`;
    if (item.reqBadge && !ctx.badges.has(item.reqBadge)) return `Requires the ${item.reqBadge} badge`;
    if (item.reqMetric && metrics) {
        const { current, target } = progressForRule(item.reqMetric, item.reqThreshold, metrics);
        if (current < target) return `Requires ${target} ${item.reqMetric.replace(/_/g, " ")}`;
    }
    return null;
}

// Equip gate: nothing restricts equipping anymore — if you OWN it, you can equip it, at any level.
// (Level, prestige badges, and metric milestones no longer gate equipping.) Item power tracks rarity,
// so gear from chests/drops/giveaways is usable immediately. Kept as a hook in case a future item wants
// a metric milestone; currently no item sets one, so it always returns null.
export function equipLockReason(item, ctx, metrics = null) {
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
    return withSetBonuses(Object.values(bySlot));
}

// Equipped stats for many members at once (one query) — used by the hourly auto-tick.
export async function getEquippedStatsForMembers(buyerIds = []) {
    const out = new Map();
    if (!buyerIds.length) return out;
    const rows = await db.query(`SELECT buyer_id, item_id FROM mkt_user_equipment WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    const byBuyer = new Map();
    for (const r of rows) { if (!byBuyer.has(r.buyer_id)) byBuyer.set(r.buyer_id, []); byBuyer.get(r.buyer_id).push(r.item_id); }
    for (const [id, ids] of byBuyer) out.set(id, withSetBonuses(ids));
    return out;
}

// A natural-language clause describing a member's equipped gear, fed into the hero-sprite prompt so the
// AI draws them wearing/wielding their loadout. Empty string if nothing equipped.
// Rarity flavor fed to the sprite art so higher-tier loot visibly looks more epic on the hero.
const GEAR_RARITY_ADJ = {
    common: "",
    rare: "finely-crafted",
    epic: "ornate glowing",
    legendary: "legendary, radiant, intricately-detailed",
    mythic: "mythic, blazing with otherworldly energy, awe-inspiring",
    ascendant: "ascendant, wreathed in molten light, transcendent",
    eternal: "eternal, radiating impossible prismatic power, godlike",
};
const gearDesc = (def) => {
    const adj = GEAR_RARITY_ADJ[def.rarity] || "";
    return adj ? `${adj} ${def.name}` : def.name;
};

// Build the gear clause from an equipped { slot: itemId } map (sync — no DB).
function gearPhraseFromSlots(bySlot) {
    const items = Object.entries(bySlot || {}).map(([slot, id]) => ({ slot, def: itemById(id) })).filter((x) => x.def);
    if (!items.length) return "";
    const parts = [];
    const weapon = items.find((x) => x.slot === "main_hand");
    const off = items.find((x) => x.slot === "off_hand");
    const back = items.find((x) => x.slot === "back");
    const armor = items.filter((x) => ["helmet", "chest", "belt", "boots"].includes(x.slot)).map((x) => gearDesc(x.def));
    const acc = items.filter((x) => ["ring1", "ring2", "amulet"].includes(x.slot)).map((x) => gearDesc(x.def));
    if (weapon) parts.push(`wielding a ${gearDesc(weapon.def)}`);
    if (off) parts.push(`carrying a ${gearDesc(off.def)}`);
    if (armor.length) parts.push(`wearing ${armor.join(", ")}`);
    if (back) parts.push(`a ${gearDesc(back.def)} flowing dramatically from their back`);
    if (acc.length) parts.push(`adorned with ${acc.join(", ")}`);
    const rank = { legendary: 1, mythic: 2, ascendant: 3, eternal: 4 };
    const best = items.reduce((b, x) => (rank[x.def.rarity] > (rank[b] || 0) ? x.def.rarity : b), null);
    const aura = best === "eternal"
        ? " This is a GODLIKE, eternal champion — their gear blazes with impossible prismatic rainbow light, radiant energy pours off them, and reality bends and warps around their silhouette."
        : best === "ascendant"
        ? " This is an ASCENDANT hero — their gear is wreathed in molten orange-gold light and transcendent fire, clearly beyond legendary."
        : best === "mythic"
        ? " This is a legendary champion — their gear radiates a brilliant teal magical aura and glowing energy."
        : best === "legendary"
        ? " Their finest pieces glow with golden power."
        : "";
    // Powers: signature / charged (elite) gear visibly crackles with magical energy, so the art reads "strong".
    const powered = items.some((x) => signatureFor(x.def.id) || x.def.charged);
    const powerClause = powered ? " Their most powerful pieces crackle with visible arcane energy — glowing runes, sparks, and magical light trailing off the gear." : "";
    return parts.length ? `The hero is ${parts.join(", ")} — draw every piece of equipment clearly as worn armor, a flowing cape, and held weapons, matching each item's rarity and power.${aura}${powerClause}` : "";
}

export async function getEquippedGearPhrase(buyerId) {
    return gearPhraseFromSlots(await getEquippedIds(buyerId));
}

// Batched: gear phrases for many members in ONE query (used by the admin sprite list so the on-phone
// regenerate includes each member's equipment, not just the cron path).
export async function getEquippedGearPhrasesForMembers(buyerIds = []) {
    const map = new Map();
    if (!buyerIds.length) return map;
    const rows = await db.query(`SELECT buyer_id, slot, item_id FROM mkt_user_equipment WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    const bySlotByBuyer = new Map();
    for (const r of rows) {
        if (!bySlotByBuyer.has(r.buyer_id)) bySlotByBuyer.set(r.buyer_id, {});
        bySlotByBuyer.get(r.buyer_id)[r.slot] = r.item_id;
    }
    for (const [id, bySlot] of bySlotByBuyer) map.set(id, gearPhraseFromSlots(bySlot));
    return map;
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

// Grant a random EARNABLE real-world perk the member doesn't already own (used by play rewards, e.g. a
// boss win). Only items flagged `earnable` are eligible — the owner still redeems any charge in-store, so
// real payout stays controlled. Returns the item (with charges) or null if they own them all.
export async function grantRandomEarnablePerk(buyerId) {
    if (!buyerId) return null;
    const pool = ITEMS.filter((i) => i.charged && i.earnable);
    if (!pool.length) return null;
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    const candidates = pool.filter((i) => !owned.has(i.id));
    if (!candidates.length) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const res = await grantItem(buyerId, pick.id, "boss_reward");
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

// Gold a member gets for selling gear back, by rarity (mirrors the chest "dust" values). Charged perk
// items hold real-world value, so they can't be sold for gold.
const SELL_VALUES = { common: 25, rare: 60, epic: 140, legendary: 350, mythic: 900, ascendant: 2500, eternal: 6000 };
// Power ordering for the shop so it reads as one clean worst→best ladder (the catalog itself is grouped
// by when items were added, which otherwise makes the shop restart at "worst" every batch).
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
export const sellValueOf = (item) => (item?.charged ? 0 : (SELL_VALUES[item?.rarity] || 25));

// Full inventory view for the member's screen: owned items (+ charge state), the equipped loadout by slot,
// and total stats.
export async function getInventory(buyerId) {
    if (!buyerId) return { items: [], equipped: {}, slots: EQUIP_SLOTS, stats: {}, gold: 0, shop: [] };
    const [ownedRows, bySlot, goldRow] = await Promise.all([
        db.query(`SELECT item_id, acquired_via, charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getEquippedIds(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const ownedIds = new Set(ownedRows.map((r) => r.item_id));
    const equippedIds = new Set(Object.values(bySlot));
    const items = ownedRows
        .map((r) => {
            const def = itemById(r.item_id);
            if (!def) return null;
            return { ...def, owned: true, equipped: equippedIds.has(def.id), charge: chargeState(r, def), signature: signatureFor(def.id), sellValue: sellValueOf(def), setName: setForItem(def.id)?.name || null };
        })
        .filter(Boolean)
        .sort((a, z) => (a.sort || 100) - (z.sort || 100));
    const gold = goldRow?.gold || 0;
    // The gold shop: xp_shop items you don't own yet.
    const shop = ITEMS.filter((i) => i.source === "xp_shop" && !ownedIds.has(i.id))
        .map((i) => ({
            id: i.id, name: i.name, slot: i.slot, rarity: i.rarity, icon: i.icon, reqLevel: i.reqLevel,
            stats: i.stats, statsText: describeStats(i.stats), signature: signatureFor(i.id),
            cost: Math.max(0, i.xpCost || 0), canAfford: gold >= Math.max(0, i.xpCost || 0), shop: true,
        }))
        // One clean progression: rarity, then price, then level — no more "worst again" as you scroll.
        .sort((a, z) => (RARITY_RANK[a.rarity] ?? 9) - (RARITY_RANK[z.rarity] ?? 9) || a.cost - z.cost || (a.reqLevel || 0) - (z.reqLevel || 0));
    const equippedList = Object.values(bySlot);
    return { items, equipped: bySlot, slots: EQUIP_SLOTS, stats: withSetBonuses(equippedList), gold, shop, setBonuses: activeSetBonuses(equippedList) };
}

// Buy an xp_shop item with gold. Atomic deduction. Body validated in the route.
export async function buyItem(buyerId, itemId) {
    const item = itemById(itemId);
    if (!item || item.source !== "xp_shop") return { ok: false, error: "not_for_sale" };
    const cost = Math.max(0, item.xpCost || 0);
    const owned = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (owned) return { ok: false, error: "already_owned" };
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await grantItem(buyerId, itemId, "xp_shop");
    return { ok: true, gold: row.gold };
}

// Sell an owned item back for gold. Unequips it first if worn, credits the rarity sell value, and records
// the sale so a 'level' item never auto-re-grants itself (which would be an infinite gold farm). Charged
// real-world-perk items can't be sold.
export async function sellItem(buyerId, itemId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    if (item.charged) return { ok: false, error: "not_sellable" };
    const value = sellValueOf(item);
    // Remove ownership atomically-ish: delete the owned row (source of truth) and only pay out if it existed.
    await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => {});
    const del = await db.queryOne(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2 RETURNING id`, [buyerId, itemId]).catch(() => null);
    if (!del) return { ok: false, error: "not_owned" };
    await db.query(`INSERT INTO mkt_sold_item (buyer_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [buyerId, itemId]).catch(() => {});
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, value]).catch(() => null);
    await bumpEquipment(buyerId); // a slot may have emptied — re-gear the sprite
    return { ok: true, sold: value, gold: row?.gold ?? null };
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
    // Nothing gates equipping anymore — own it, equip it. (Metric-milestone hook kept for future items.)
    if (item.reqMetric) {
        const ctx = await memberContext(buyerId);
        const metrics = await getMemberMetrics(buyerId).catch(() => null);
        const lock = equipLockReason(item, ctx, metrics);
        if (lock) throw new Error(lock + " to equip this.");
    }
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
    const [ctx, ownedRows, metrics, soldRows] = await Promise.all([
        memberContext(buyerId),
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getMemberMetrics(buyerId).catch(() => null),
        db.query(`SELECT item_id FROM mkt_sold_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    const owned = new Set(ownedRows.map((r) => r.item_id));
    const sold = new Set(soldRows.map((r) => r.item_id)); // sold gear stays sold — never auto-re-granted
    const granted = [];
    for (const item of ITEMS) {
        if (item.source !== "level" || owned.has(item.id) || sold.has(item.id)) continue;
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

// Admin cost dashboard: real-world perk redemptions over the last `days`, as a total, a per-reward
// breakdown, and the most recent redemptions (who + what + when). Reads the mkt_item_redemption log.
export async function redemptionSummary({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
    const [byReward, recent] = await Promise.all([
        db.query(
            `SELECT COALESCE(reward_label, reward, 'Perk') AS label, COUNT(*)::int AS n
               FROM mkt_item_redemption
              WHERE redeemed_at >= NOW() - ($1::int || ' days')::interval
              GROUP BY 1 ORDER BY n DESC`,
            [d]
        ).catch(() => []),
        db.query(
            `SELECT COALESCE(r.reward_label, r.reward, 'Perk') AS label, r.redeemed_at,
                    COALESCE(b.display_name, b.alias, b.first_name, 'Member') AS member
               FROM mkt_item_redemption r JOIN mkt_buyer b ON b.id = r.buyer_id
              ORDER BY r.redeemed_at DESC LIMIT 15`
        ).catch(() => []),
    ]);
    return { days: d, total: byReward.reduce((s, r) => s + r.n, 0), byReward, recent };
}
