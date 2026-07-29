import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { itemById } from "@/lib/marketplace/items.js";
import { itemElement, ELEMENTS } from "@/lib/marketplace/boss-weakness.js";

// Grant an event badge WITHOUT a static import of badges.js (that would create a cycle:
// item-element → badges → xp → pet-level → item-element). Dynamic import, best-effort.
const grantBadge = (buyerId, slug) => import("@/lib/marketplace/badges.js").then((m) => m.grantEventBadge(buyerId, slug)).catch(() => {});

// ── ELEMENTAL REFORGE ("Attune") ──────────────────────────────────────────────────────────────────────────
// The Forge can change a piece's elemental affinity for gold. A small chance it instead KEEPS the current
// element and ADDS the one you picked → a rare DUAL-affinity piece that matches TWO of the rotating boss
// weaknesses. Stored as an override on mkt_item_element; combat + display read the EFFECTIVE elements.

export const DUAL_ELEMENT_CHANCE = 0.12; // small chance a reforge yields dual affinity instead of replacing
// Gold cost by rarity (a solid sink — reforging is a meta reroll).
const REFORGE_GOLD = { common: 400, rare: 900, epic: 1800, legendary: 3500, mythic: 6000, ascendant: 9000, eternal: 12000 };
export const reforgeCost = (rarity) => REFORGE_GOLD[rarity] || 1500;

// A reforge yields at most 2 (dual); the Enchantment Scroll can push an item past that, so the STORAGE cap is
// higher (6 = all elements). Dedupe.
const ELEMENT_STORE_CAP = 6;
export function parseElements(v) {
    if (!v) return null;
    let a = v;
    if (typeof v === "string") { try { a = JSON.parse(v); } catch { return null; } }
    if (!Array.isArray(a)) return null;
    const out = [...new Set(a.filter((e) => ELEMENTS[e]))];
    return out.slice(0, ELEMENT_STORE_CAP);
}

// The item's EFFECTIVE elements: the override array if present, else its deterministic base ([] when neutral).
export function effectiveElements(itemId, overrideArr) {
    if (overrideArr && overrideArr.length) return overrideArr.slice(0, ELEMENT_STORE_CAP);
    const base = itemElement(itemId);
    return base ? [base] : [];
}

export function describeItemElements(itemId, overrideArr) {
    return effectiveElements(itemId, overrideArr).map((k) => ({ key: k, label: ELEMENTS[k].label, emoji: ELEMENTS[k].emoji, color: ELEMENTS[k].color }));
}

// One member's element overrides → { itemId: [elements] } (only reforged items have rows).
export async function getElementOverrides(buyerId, itemIds = null) {
    if (!buyerId) return {};
    const rows = itemIds && itemIds.length
        ? await db.query(`SELECT item_id, elements FROM mkt_item_element WHERE buyer_id = $1 AND item_id = ANY($2)`, [buyerId, itemIds]).catch(() => [])
        : await db.query(`SELECT item_id, elements FROM mkt_item_element WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const out = {};
    for (const r of rows) { const els = parseElements(r.elements); if (els && els.length) out[r.item_id] = els; }
    return out;
}

// Many members at once → Map(buyerId → { itemId: [elements] }). For the passive-damage tick.
export async function getElementOverridesForMembers(buyerIds = []) {
    const map = new Map();
    if (!buyerIds.length) return map;
    const rows = await db.query(`SELECT buyer_id, item_id, elements FROM mkt_item_element WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    for (const r of rows) {
        const els = parseElements(r.elements);
        if (!els || !els.length) continue;
        const bid = r.buyer_id;
        if (!map.has(bid)) map.set(bid, {});
        map.get(bid)[r.item_id] = els;
    }
    return map;
}

// Move an item's element override to a new owner when it changes hands (trade / auction) — mirrors the
// enhancement/attunement transfer so a reforged piece stays reforged for whoever holds it.
export async function transferItemElement(fromId, toId, itemId) {
    if (!fromId || !toId || !itemId || fromId === toId) return;
    const row = await db.queryOne(`DELETE FROM mkt_item_element WHERE buyer_id = $1 AND item_id = $2 RETURNING elements`, [fromId, itemId]).catch(() => null);
    if (!row) return;
    const els = typeof row.elements === "string" ? row.elements : JSON.stringify(row.elements || []);
    await db.query(
        `INSERT INTO mkt_item_element (buyer_id, item_id, elements, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (buyer_id, item_id) DO UPDATE SET elements = EXCLUDED.elements, updated_at = NOW()`,
        [toId, itemId, els]
    ).catch(() => {});
}

// Reforge an OWNED item's elemental affinity to `target`. Charges gold; a single-element piece has a small
// chance to instead go DUAL (keep the current element + add the target). For a DUAL item you pass `replaceKey`
// to choose WHICH of its two elements to swap out (the other is kept). Can't reforge to an element it has.
export async function reforgeItemElement(buyerId, itemId, target, replaceKey = null) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "bad_item" };
    if (!ELEMENTS[target]) return { ok: false, error: "bad_element" };
    const owns = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owns) return { ok: false, error: "not_owned" };
    const cur = (await getElementOverrides(buyerId, [itemId]))[itemId] || (itemElement(itemId) ? [itemElement(itemId)] : []);
    if (cur.includes(target)) return { ok: false, error: "already_has", elements: cur };
    const cost = reforgeCost(item.rarity);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold", cost };
    await logCoin(buyerId, -cost, "reforge_element", { balanceAfter: paid.gold, meta: { itemId, target } }).catch(() => {});
    let dual = false;
    let elements;
    if (cur.length >= 2) {
        // Multi-affinity item: swap out the chosen element (default the first), KEEP all the others.
        const drop = cur.includes(replaceKey) ? replaceKey : cur[0];
        elements = [...cur.filter((e) => e !== drop), target];
    } else {
        // Single/neutral: small chance to keep the current one AND add the target (go dual).
        dual = cur.length === 1 && Math.random() < DUAL_ELEMENT_CHANCE;
        elements = dual ? [cur[0], target] : [target];
    }
    await db.query(
        `INSERT INTO mkt_item_element (buyer_id, item_id, elements, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (buyer_id, item_id) DO UPDATE SET elements = $3::jsonb, updated_at = NOW()`,
        [buyerId, itemId, JSON.stringify(elements)]
    ).catch(() => {});
    await trackActivity(buyerId, "reforge_element", { itemId, target, dual, elements }).catch(() => {});
    if (elements.length >= 2) grantBadge(buyerId, "forge_dual_affinity");
    return { ok: true, elements, dual, from: cur, cost, gold: Number(paid.gold) };
}

// ENCHANTMENT SCROLL — permanently ADD an element to an item (keeps all its current ones, so it can go past two).
// Consumes one forge_enchant_scroll. Can't add one it already has, or exceed the storage cap.
export async function enchantItemElement(buyerId, itemId, element) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "bad_item" };
    if (!ELEMENTS[element]) return { ok: false, error: "bad_element" };
    const owns = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owns) return { ok: false, error: "not_owned" };
    const cur = (await getElementOverrides(buyerId, [itemId]))[itemId] || (itemElement(itemId) ? [itemElement(itemId)] : []);
    if (cur.includes(element)) return { ok: false, error: "already_has", elements: cur };
    if (cur.length >= ELEMENT_STORE_CAP) return { ok: false, error: "max_elements", elements: cur };
    const sc = await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = 'forge_enchant_scroll' AND count > 0 RETURNING count`, [buyerId]).catch(() => null);
    if (!sc) return { ok: false, error: "no_scroll" };
    const elements = [...cur, element];
    await db.query(
        `INSERT INTO mkt_item_element (buyer_id, item_id, elements, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (buyer_id, item_id) DO UPDATE SET elements = $3::jsonb, updated_at = NOW()`,
        [buyerId, itemId, JSON.stringify(elements)]
    ).catch(() => {});
    await trackActivity(buyerId, "enchant_element", { itemId, element, elements }).catch(() => {});
    grantBadge(buyerId, "forge_enchanter");
    if (elements.length >= 2) grantBadge(buyerId, "forge_dual_affinity");
    return { ok: true, elements, added: element, scrollsLeft: Number(sc.count) };
}
