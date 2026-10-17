import "server-only";

import { db } from "@/lib/db.js";
import { annotateFifoCosts } from "@/lib/admin-app/fifo-annotate.js";
import { createServerLogger } from "@/lib/server-logger";
import { expandShopOrders } from "@/lib/admin-app/shop-order-lines.js";

const logger = createServerLogger({ source: "api", subsystem: "reports-v2" });

// ── REPORTS V2: THE PHONE'S REPORT RULES, ON THE SERVER ──────────────────────────────────────────────────────
// Luke: "Can we make a reports v2 on the admin and employee app, and its all server side, once a night. That
// way we can serve a cached report bundle to the app so it loads faster. Once I can assert reports v2 works
// exactly like reports v1 we will delete the old reports."
//
// This is the port of `SquareTransactionsService.fetchDatedItemizedSales` + `LedgerViewModel.buildReportsData`
// out of Kotlin and onto the server. It exists to produce the SAME NUMBERS, so where a rule here looks odd,
// the rule in the app looks exactly as odd and the comment explaining why lives with it in the Kotlin.
//
// ⚠️ THE GOAL IS PARITY, NOT IMPROVEMENT. Every temptation to fix something in passing has to be resisted
// until v1 is deleted, because a difference is indistinguishable from a porting bug while both exist. If a
// rule below is wrong, it is wrong identically in both places, which is the only state in which the two can
// be diffed. Fix it after the parity assertion passes, in both, deliberately.
//
// What is NOT re-implemented, on purpose:
//   FIFO COSTS — `annotateFifoCosts` already hangs `wolfden_fifo_cost_money` on each line for the phone, and
//   it is the same `costSales()` the reconciler runs. Calling it here means the server and the phone cost a
//   sale through one code path rather than two that can drift. See [[unit-cost-is-exact-fifo-never-averaged]].

const SQUARE_VERSION = process.env.SQUARE_API_VERSION || "2024-10-17";
const SQUARE_BASE = "https://connect.squareup.com";
const UNIT_COST_ATTR = "wolfden_unit_cost";

// Carried over verbatim from the Kotlin so a line collapsed here is named identically to one collapsed there.
const TRADE_CREDIT_REMAINDER_PRODUCT_NAME = "Trade credit order — cash balance";
const TRADE_CREDIT_UNITS_PRODUCT_NAME = "Store Credit — trade-credit order (units only)";
const ITEM_TYPE_ITEM = "ITEM";

const cents = (money) => (money?.amount == null ? null : Number(money.amount) / 100);

function squareHeaders() {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not set.");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Square-Version": SQUARE_VERSION };
}

async function squarePost(path, body) {
    const r = await fetch(`${SQUARE_BASE}${path}`, { method: "POST", headers: squareHeaders(), body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) {
        let detail = "";
        try { detail = JSON.parse(text)?.errors?.[0]?.detail || ""; } catch { /* body was not json */ }
        throw new Error(`Square ${path} failed (${r.status})${detail ? `: ${detail}` : ""}`);
    }
    return { text, json: text ? JSON.parse(text) : {} };
}

async function squareGet(path) {
    const r = await fetch(`${SQUARE_BASE}${path}`, { headers: squareHeaders() });
    if (!r.ok) throw new Error(`Square ${path} failed (${r.status})`);
    return r.json();
}

async function fetchLocationIds() {
    const j = await squareGet("/v2/locations");
    return (j.locations || []).map((l) => l.id).filter(Boolean);
}

/**
 * Completed orders in the window, by CLOSED_AT — the same filter, sort and page size the phone sends.
 *
 * ⚠️ `closed_at` AND NOT `created_at`. An order created on the 30th and closed on the 1st belongs to the
 * month it was paid for, and the whole report is bucketed off the same field it is filtered by.
 */
async function searchCompletedOrders({ locationIds, lookbackDays }) {
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000);
    const iso = (d) => `${d.toISOString().slice(0, 19)}Z`;

    const orders = [];
    let cursor = null;
    do {
        const body = {
            location_ids: locationIds,
            limit: 100,
            query: {
                filter: {
                    date_time_filter: { closed_at: { start_at: iso(startAt), end_at: iso(endAt) } },
                    state_filter: { states: ["COMPLETED"] },
                },
                sort: { sort_field: "CLOSED_AT", sort_order: "DESC" },
            },
            ...(cursor ? { cursor } : {}),
        };
        // ⚠️ THE FIFO ANNOTATION RUNS ON THE RAW RESPONSE BODY, exactly as it does for the phone. It is fed a
        // string and hands one back, so the page is re-parsed rather than used directly — that is the price
        // of there being ONE implementation of "what did this line cost".
        const { text } = await squarePost("/v2/orders/search", body);
        const annotated = await annotateFifoCosts(text);
        const page = JSON.parse(annotated);
        orders.push(...(page.orders || []));
        cursor = page.cursor || null;
    } while (cursor);
    return orders;
}

/** Only `reporting_category` ever reaches a sale — see [[square-reporting-category-is-the-only-one]]. */
function extractItemCategoryId(itemData) {
    if (!itemData) return "";
    const direct = String(itemData.category_id || "").trim();
    if (direct) return direct;
    for (const c of itemData.categories || []) {
        const id = typeof c === "string" ? c.trim() : String(c?.id || "").trim();
        if (id) return id;
    }
    return String(itemData.reporting_category?.id || "").trim();
}

/**
 * Variation → { itemId, squareCategoryId, catalogUnitPrice }.
 *
 * ⚠️ `include_deleted_objects` IS LOAD-BEARING AND IS NOT A TIDINESS FLAG. Reports look backwards, and intake
 * DELETES sold-out items rather than archiving them. Without it every past sale of a deleted item loses its
 * cost, its name and its image — 559 of 877 variations, once. See [[square-deleted-items-cost-loss]].
 */
async function fetchVariationCatalogData(variationIds) {
    const out = new Map();
    for (let i = 0; i < variationIds.length; i += 100) {
        const batch = variationIds.slice(i, i + 100);
        const { json } = await squarePost("/v2/catalog/batch-retrieve", {
            object_ids: batch, include_related_objects: true, include_deleted_objects: true,
        });
        const objects = [...(json.objects || []), ...(json.related_objects || [])];

        const categoryByItemId = new Map();
        for (const o of objects) {
            if (String(o.type).toUpperCase() !== "ITEM") continue;
            const id = String(o.id || "").trim();
            const cat = extractItemCategoryId(o.item_data);
            if (id && cat) categoryByItemId.set(id, cat);
        }
        for (const o of objects) {
            if (String(o.type).toUpperCase() !== "ITEM_VARIATION") continue;
            const variationId = String(o.id || "").trim();
            if (!variationId) continue;
            const vd = o.item_variation_data || null;
            const itemId = String(vd?.item_id || "").trim();
            out.set(variationId, {
                itemId,
                catalogUnitPrice: cents(vd?.price_money) ?? 0,
                squareCategoryId: extractItemCategoryId(o.item_data) || categoryByItemId.get(itemId) || "",
                raw: o,
            });
        }
    }
    return out;
}

/** The `wolfden_unit_cost` custom attribute, in cents, or null. Our own recorded purchase cost. */
function unitCostAttributeCents(catalogObject) {
    const values = catalogObject?.custom_attribute_values;
    if (!values) return null;
    for (const [entryKey, value] of Object.entries(values)) {
        const key = String(value?.key || entryKey).trim();
        if (key !== UNIT_COST_ATTR && !key.endsWith(`:${UNIT_COST_ATTR}`)) continue;
        const n = Number(String(value?.number_value ?? "").trim());
        if (!Number.isFinite(n)) continue;
        const c = Math.round(n * 100);
        if (c > 0) return c;
    }
    return null;
}

/**
 * Variation → unit cost, in the app's precedence order.
 *
 * ⚠️ OUR OWN RECORDED COST WINS OVER SQUARE'S NATIVE FIELDS, and the order is not arbitrary. `wolfden_unit_cost`
 * is the only cost store the app can WRITE through the API; the native ones can only be set in the Square
 * dashboard and are usually stale or absent. Trusting them first silently mis-stated profit.
 * See [[square-unit-cost-storage]].
 */
async function resolveUnitCosts(catalogByVariationId) {
    const out = new Map();
    // 65%-of-list guesses, parked until the real costs have had their turn.
    const estimated = new Map();

    for (const [variationId, lookup] of catalogByVariationId) {
        const o = lookup.raw || {};
        const vd = o.item_variation_data || {};
        // Written out as a list rather than chained so the precedence is visible and ordered.
        const candidates = [
            unitCostAttributeCents(o),
            vd.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money?.amount,
            vd.default_unit_cost?.amount,
            vd.cost_money?.amount,
            vd.cost_price_money?.amount,
            o.item_data?.cost_money?.amount,
        ];
        const hit = candidates.map((c) => Number(c) || 0).find((c) => c > 0);
        if (hit) out.set(variationId, hit / 100);

        const listed = Number(lookup.catalogUnitPrice) || 0;
        if (listed > 0) estimated.set(variationId, Math.max(1, Math.round(listed * 0.65 * 100)));
    }

    // ── TIER 2: OUR OWN TABLE, FOR WHAT SQUARE CANNOT PRICE ───────────────────────────────────────
    // Traded singles live in the trade ledger, not the catalog, so Square has no cost for them at all.
    // The phone reaches `/api/admin/item-costs` for this; on the server it is the table underneath.
    // Best-effort by design: a failure here is the same missing costs as before, not a broken report.
    const unresolved = [...catalogByVariationId.keys()].filter((v) => v && !out.has(v));
    if (unresolved.length) {
        try {
            const rows = await db.query(
                `SELECT variation_id, unit_cost_cents FROM wolfden_item_cost WHERE variation_id = ANY($1)`,
                [unresolved]
            );
            for (const r of rows || []) {
                const c = Number(r.unit_cost_cents) || 0;
                if (c > 0) out.set(String(r.variation_id), c / 100);
            }
        } catch (error) {
            logger.warn("reports_v2.item_cost_lookup_failed", { message: error?.message });
        }
    }

    // ── TIER 3: THE GUESS, AND ONLY NOW ───────────────────────────────────────────────────────────
    // ⚠️ IT IS HELD BACK ON PURPOSE. Committing 65%-of-list at the point it is computed means the real
    // figure in our own table is never even asked for — and those are the same items, the traded
    // singles. Square's entered cost, then what we recorded paying, then the guess.
    for (const [variationId, c] of estimated) {
        if (!out.has(variationId)) out.set(variationId, c / 100);
    }
    return out;
}

/**
 * Packed variation -> what the card inside it actually cost us.
 *
 * A mystery pack's own Square cost is the pack PRICE, so it must never win. The real figure is the cost of
 * the single that was sealed into it, which the app records when the pack is built.
 */
export async function fetchMysteryPackCosts() {
    const out = new Map();
    let rows = [];
    try {
        rows = await db.query(
            `SELECT packed_variation_id, square_variation_id FROM mystery_bag_cards
              WHERE packed_variation_id IS NOT NULL AND packed_variation_id <> ''`
        );
    } catch (error) {
        logger.warn("reports_v2.mystery_pack_lookup_failed", { message: error?.message });
        return out;
    }
    const sourceByPacked = new Map();
    for (const r of rows || []) {
        const packed = String(r.packed_variation_id || "").trim();
        const source = String(r.square_variation_id || "").trim();
        if (packed && source && source !== packed) sourceByPacked.set(packed, source);
    }
    if (!sourceByPacked.size) return out;

    const sourceIds = [...new Set(sourceByPacked.values())];
    try {
        const sourceCatalog = await fetchVariationCatalogData(sourceIds);
        const sourceCosts = await resolveUnitCosts(sourceCatalog);
        for (const [packed, source] of sourceByPacked) {
            const c = sourceCosts.get(source);
            if (c > 0) out.set(packed, c);
        }
    } catch (error) {
        logger.warn("reports_v2.mystery_pack_cost_failed", { message: error?.message });
    }
    return out;
}

/**
 * Card-processing fee per order.
 *
 * Square has no batch payment endpoint (it 404s), so this is one call per payment, in flights of 12. A single
 * payment failing is skipped rather than aborting the run — a missing fee understates cost, which is the same
 * thing the phone does when the lookup fails.
 */
async function fetchProcessingFeesByOrderId(paymentIdsByOrderId) {
    const orderIdByPaymentId = new Map();
    for (const [orderId, paymentIds] of paymentIdsByOrderId) {
        for (const p of paymentIds) if (p) orderIdByPaymentId.set(p, orderId);
    }
    const fees = new Map();
    const ids = [...orderIdByPaymentId.keys()];
    for (let i = 0; i < ids.length; i += 12) {
        const chunk = ids.slice(i, i + 12);
        const payments = await Promise.all(chunk.map(async (paymentId) => {
            try {
                const j = await squareGet(`/v2/payments/${encodeURIComponent(paymentId)}`);
                return j.payment || null;
            } catch { return null; }
        }));
        for (const payment of payments) {
            if (!payment) continue;
            const paymentId = String(payment.id || "").trim();
            const orderId = String(payment.order_id || "").trim() || orderIdByPaymentId.get(paymentId) || "";
            if (!orderId) continue;
            let total = 0;
            for (const f of payment.processing_fee || []) total += Math.abs(Number(f?.amount_money?.amount) || 0) / 100;
            if (total > 0) fees.set(orderId, (fees.get(orderId) || 0) + total);
        }
    }
    return fees;
}

/** Category id → display name. */
export async function fetchCatalogCategories() {
    const names = new Map();
    let cursor = null;
    do {
        const q = `/v2/catalog/list?types=CATEGORY&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const j = await squareGet(q);
        for (const o of j.objects || []) {
            const id = String(o.id || "").trim();
            const name = String(o.category_data?.name || "").trim();
            if (id && name) names.set(id, name);
        }
        cursor = j.cursor || null;
    } while (cursor);
    return names;
}

/**
 * ONE SALE, AS THE REPORTS SEE IT — the port of `fetchDatedItemizedSales`.
 *
 * @returns {Promise<Array>} DatedSaleLine-shaped objects.
 */
export async function fetchSaleLines({ lookbackDays = 180, mysteryPackCostByVariationId = null } = {}) {
    // Fetched here rather than required from the caller, so every caller costs a pack the same way.
    const packCosts = mysteryPackCostByVariationId ?? await fetchMysteryPackCosts();
    const locationIds = await fetchLocationIds();
    if (!locationIds.length) return [];
    const orders = await searchCompletedOrders({ locationIds, lookbackDays });
    if (!orders.length) return [];

    // ── AN ONLINE ORDER IS A LUMP UNTIL THIS RUNS ────────────────────────────────────────────────────────
    // The website's checkout charges Square one anonymous CUSTOM_AMOUNT with no name and no catalog id, so
    // without this an online order reports as a single Uncategorized line at ~100% margin — with the sales
    // tax inside it counted as the shop's profit. The phone has been right about this for months only
    // because it fetches Square THROUGH the admin proxy, which expands on the way past; this report goes to
    // Square directly and so saw the lump. Same function the proxy calls, deliberately.
    const expanded = await expandShopOrders(orders).catch((error) => {
        logger.warn("reports_v2.shop_expand_failed", { message: error?.message });
        return 0;
    });
    if (expanded) logger.info("reports_v2.shop_orders_expanded", { orders: expanded });

    const variationIds = new Set();
    for (const order of orders) {
        for (const li of order.line_items || []) {
            const vid = String(li?.catalog_object_id || "").trim();
            if (vid) variationIds.add(vid);
        }
    }
    const catalogByVariationId = await fetchVariationCatalogData([...variationIds]);
    const costByVariationId = await resolveUnitCosts(catalogByVariationId);

    const paymentIdsByOrderId = new Map();
    for (const order of orders) {
        const orderId = String(order.id || "").trim();
        if (!orderId) continue;
        for (const t of order.tenders || []) {
            const pid = String(t?.payment_id || "").trim();
            if (pid) {
                if (!paymentIdsByOrderId.has(orderId)) paymentIdsByOrderId.set(orderId, new Set());
                paymentIdsByOrderId.get(orderId).add(pid);
            }
        }
    }
    let processingFeeByOrderId = new Map();
    try { processingFeeByOrderId = await fetchProcessingFeesByOrderId(paymentIdsByOrderId); }
    catch (error) { logger.warn("reports_v2.fee_lookup_failed", { message: error?.message }); }

    const results = [];
    for (const order of orders) {
        const orderId = String(order.id || "").trim();
        const soldAt = order.closed_at || order.updated_at || order.created_at;
        const soldMillis = Date.parse(soldAt);
        if (!Number.isFinite(soldMillis)) continue;

        const orderLines = [];
        const lineWeights = [];

        for (const li of order.line_items || []) {
            const quantity = Number(li.quantity);
            // Negative quantities are KEPT so returns reduce sales and profit. Only zero drops out.
            if (!Number.isFinite(quantity) || quantity === 0) continue;

            const productName = String(li.name || "").trim() || "Unknown Product";
            if (/trade-out/i.test(productName)) continue;

            const variationId = String(li.catalog_object_id || "").trim();
            const lookup = catalogByVariationId.get(variationId);

            // gross_sales_money already reflects manual price edits and is net of INCLUSIVE tax.
            const grossSales = li.gross_sales_money
                ? Number(li.gross_sales_money.amount || 0) / 100
                : (Number(li.base_price_money?.amount || 0) / 100) * quantity;
            const netSales = grossSales - Number(li.total_discount_money?.amount || 0) / 100;

            const isMysteryPack = /mystery (pack|bag)/i.test(productName);

            // ⚠️ FIFO IS A WHOLE-LINE AMOUNT and is divided back to a unit cost, because everything below
            // multiplies by quantity again. This is the field the app ignored for months while reporting
            // the newest restock price instead — see [[unit-cost-is-exact-fifo-never-averaged]].
            const fifoLineCents = Number(li.wolfden_fifo_cost_money?.amount || 0);
            const ledgerFifoUnitCost = fifoLineCents > 0 && quantity !== 0
                ? fifoLineCents / 100 / Math.abs(quantity)
                : null;

            const unitCost = isMysteryPack && quantity !== 0
                ? (packCosts.get(variationId)
                    ?? (Math.abs(grossSales) * 0.65) / Math.abs(quantity))
                : (ledgerFifoUnitCost ?? costByVariationId.get(variationId) ?? 0);

            orderLines.push({
                soldAtMillis: soldMillis,
                productName,
                squareCategoryId: lookup?.squareCategoryId || null,
                quantity,
                netSales,
                itemId: lookup?.itemId || null,
                variationId: variationId || null,
                cost: unitCost * quantity,
                unitCost,
                processingFee: 0,
                taxAmount: Number(li.total_tax_money?.amount || 0) / 100,
                itemType: String(li.item_type || "").trim() || ITEM_TYPE_ITEM,
                tradeCreditUnits: 0,
            });
            lineWeights.push(Math.abs(netSales));
        }

        // ── THE FEE IS NET OF THE SURCHARGE THE CUSTOMER ALREADY PAID TO COVER IT ──────────────────────
        // Booking the whole processing fee while ignoring the surcharge collected for it understated profit
        // on every card sale by the entire surcharge. Netted at the single point of allocation so that every
        // downstream `netSales - cost - processingFee` becomes right without being touched.
        let orderSurcharge = 0;
        for (const sc of order.service_charges || []) {
            // Tax charged ON the surcharge is the state's and is counted as tax elsewhere.
            orderSurcharge += (Number(sc?.total_money?.amount || 0) - Number(sc?.total_tax_money?.amount || 0)) / 100;
        }
        const orderProcessingFee = (processingFeeByOrderId.get(orderId) || 0) - orderSurcharge;
        const weightSum = lineWeights.reduce((a, b) => a + b, 0);
        if (orderProcessingFee >= 0.005 && weightSum > 0) {
            let allocated = 0;
            orderLines.forEach((line, idx) => {
                const share = idx === orderLines.length - 1
                    ? orderProcessingFee - allocated
                    : orderProcessingFee * (lineWeights[idx] / weightSum);
                const safeShare = Math.max(0, share);
                line.processingFee = safeShare;
                allocated += safeShare;
            });
        }

        // ── A GIFT-CARD TENDER HERE IS A TRADE PAYOUT, NOT REVENUE ────────────────────────────────────
        // A split tender used to scale every product line to the cash fraction, which listed a $213 Giratina
        // as having sold for $1.59. The product lines are dropped outright and the cash remainder is carried
        // as one labelled line instead.
        let giftCardCents = 0;
        let totalTenderCents = 0;
        for (const t of order.tenders || []) {
            const amt = Number(t?.amount_money?.amount || 0);
            totalTenderCents += amt;
            if (t?.type === "SQUARE_GIFT_CARD") giftCardCents += amt;
        }
        const nonGcFraction = giftCardCents > 0 && totalTenderCents > 0
            ? Math.min(1, Math.max(0, (totalTenderCents - giftCardCents) / totalTenderCents))
            : 1;

        // Units on a trade-credit order are real even when the money is not: 34 of 1,862 units over 90 days.
        const tradeCreditUnits = nonGcFraction >= 0.999
            ? 0
            : orderLines.filter((l) => l.itemType === ITEM_TYPE_ITEM).reduce((a, l) => a + l.quantity, 0);

        const sum = (key) => orderLines.reduce((a, l) => a + l[key], 0);
        if (nonGcFraction >= 0.999) {
            results.push(...orderLines);
        } else if (nonGcFraction > 0.001) {
            results.push({
                soldAtMillis: soldMillis,
                productName: TRADE_CREDIT_REMAINDER_PRODUCT_NAME,
                squareCategoryId: null,
                quantity: 0,
                netSales: sum("netSales") * nonGcFraction,
                itemId: null,
                variationId: null,
                cost: sum("cost") * nonGcFraction,
                unitCost: 0,
                processingFee: sum("processingFee") * nonGcFraction,
                taxAmount: 0,
                itemType: ITEM_TYPE_ITEM,
                tradeCreditUnits,
            });
        } else if (tradeCreditUnits !== 0) {
            results.push({
                soldAtMillis: soldMillis,
                productName: TRADE_CREDIT_UNITS_PRODUCT_NAME,
                squareCategoryId: null,
                quantity: 0, netSales: 0, itemId: null, variationId: null,
                cost: 0, unitCost: 0, processingFee: 0, taxAmount: 0,
                itemType: ITEM_TYPE_ITEM,
                tradeCreditUnits,
            });
        }
    }

    logger.info("reports_v2.lines", { orders: orders.length, lines: results.length, lookbackDays });
    return results;
}

// ── THE CLASSIFICATION RULES ─────────────────────────────────────────────────────────────────────────────
// Four kinds of line are on an order but are NOT the shop's merchandise revenue, and every one of them was
// landing in "Uncategorized" at ~100% margin before it was named:
//   SALES TAX   — the state's, held as a liability until remitted
//   SHIPPING    — cost recovery; the carrier takes what the customer paid
//   STORE CREDIT— deferred revenue; profit is realised when the credit is SPENT
//   MYSTERY PACK— real revenue, but it carries no Square reporting category
export const MYSTERY_PACKS_KEY = "__mystery_packs__";
export const STORE_CREDIT_KEY = "__store_credit__";
export const SALES_TAX_KEY = "__sales_tax__";
export const SHIPPING_KEY = "__shipping_collected__";

function makeClassifiers(lines) {
    // ⚠️ A PROCESSING FEE BELONGS TO WHATEVER ORDER IT IS ON. Matching "Online processing fee" by name alone
    // was right only while store-credit top-ups were the only thing charging one — a $5.95 fee on a booster
    // box then filed itself under "Store Credit (deferred)". Lines off one order share a timestamp, so the
    // fee is deferred only when a Store Credit line was sold in the same second.
    const storeCreditInstants = new Set(
        lines.filter((l) => /^store credit/i.test(l.productName)).map((l) => l.soldAtMillis)
    );
    const isStoreCredit = (l) => /^store credit/i.test(l.productName)
        || (/^online processing fee$/i.test(l.productName) && storeCreditInstants.has(l.soldAtMillis));
    const isSalesTax = (l) => /^sales tax$/i.test(l.productName);
    const isShipping = (l) => /^shipping$/i.test(l.productName);
    // Square's own classification, not the name: a shop can legitimately stock an item called "Gift Card".
    const isMerchandise = (l) => l.itemType === ITEM_TYPE_ITEM && !isStoreCredit(l) && !isSalesTax(l) && !isShipping(l);

    const categoryKeyFor = (l) => {
        if (isStoreCredit(l)) return STORE_CREDIT_KEY;
        if (isSalesTax(l)) return SALES_TAX_KEY;
        if (isShipping(l)) return SHIPPING_KEY;
        if (/^mystery pack/i.test(l.productName)) return MYSTERY_PACKS_KEY;
        return l.squareCategoryId;
    };

    // A pack arrives costed by the card that was actually inside it; 65% survives only as a last resort for
    // a pack the app has no record of, which would otherwise report as 100% profit.
    const effectiveLineCost = (l) => {
        // All three net to exactly $0 rather than showing a phantom gain or loss on their own category.
        if (isStoreCredit(l)) return l.netSales - l.processingFee;
        if (isSalesTax(l)) return l.netSales;
        if (isShipping(l)) return l.netSales;
        if (l.cost > 0) return l.cost;
        if (/^mystery pack/i.test(l.productName)) return l.netSales * 0.65;
        return l.cost;
    };

    return { isStoreCredit, isSalesTax, isShipping, isMerchandise, categoryKeyFor, effectiveLineCost };
}

export function categoryNameFor(id, categoryNamesById) {
    if (id === MYSTERY_PACKS_KEY) return "Mystery Packs";
    if (id === STORE_CREDIT_KEY) return "Store Credit (deferred)";
    if (id === SALES_TAX_KEY) return "Sales Tax (held for the state)";
    if (id === SHIPPING_KEY) return "Shipping (collected)";
    if (!id) return "Uncategorized";
    return categoryNamesById.get(id)?.trim() || "Uncategorized";
}

/**
 * THE WINDOW'S MONEY — store sales, realised profit and margin, by the same rules as the phone's headline.
 *
 * Store totals EXCLUDE consigned categories (that money is the consignor's), store-credit top-ups, sales tax
 * and shipping. The shop's COMMISSION on a consigned sale is added back, because on an 87% payout rate the
 * shop genuinely keeps 13% and that was being thrown away with the gross. Card fees come off the commission
 * because the shop pays them on the whole ticket, not on its share.
 */
export function summarise({ lines, cashRefunds = [], consignedRateByCategoryId = new Map() }) {
    const c = makeClassifiers(lines);

    const storeLines = lines.filter((l) =>
        !c.isStoreCredit(l) && !c.isSalesTax(l) && !c.isShipping(l) &&
        (l.squareCategoryId == null || !consignedRateByCategoryId.has(l.squareCategoryId)));

    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const storeSales = sum(storeLines, (l) => l.netSales);
    const storeCost = sum(storeLines, (l) => c.effectiveLineCost(l));
    const storeFees = sum(storeLines, (l) => l.processingFee);

    const consignedCommission = sum(
        lines.filter((l) => !c.isStoreCredit(l) && l.squareCategoryId != null && consignedRateByCategoryId.has(l.squareCategoryId)),
        (l) => l.netSales * (1 - (consignedRateByCategoryId.get(l.squareCategoryId) || 0)) - l.processingFee
    );

    // A refund is revenue reversed, and it comes off sales as well as profit.
    const refunded = sum(cashRefunds, (r) => r.amount);

    const netSales = storeSales - refunded;
    const profit = storeSales - storeCost - storeFees + consignedCommission - refunded;
    return {
        netSales,
        profit,
        marginPercent: netSales !== 0 ? (profit / netSales) * 100 : 0,
        storeSales, storeCost, storeFees, consignedCommission, refunded,
        lineCount: lines.length,
        unitsSold: sum(lines.filter(c.isMerchandise), (l) => l.quantity),
        tradeCreditUnits: sum(lines, (l) => l.tradeCreditUnits),
    };
}


// ── THE BUNDLE: ReportsSalesData, BUILT ON THE SERVER ────────────────────────────────────────────────────
// Shaped to match the Kotlin `ReportsSalesData` field for field, so the v2 screen renders through the SAME
// composables v1 does and only the data source differs. A second UI would be a second set of rounding and
// sorting decisions, and those are precisely what the parity check is trying to hold still.
//
// ⚠️ THE ZONE IS NAMED, NOT INHERITED. `buildReportsData` buckets with `ZoneId.systemDefault()`, which on the
// phone is America/Chicago and on Vercel is UTC. Left to the default, every sale after 7pm files under
// tomorrow and the daily series silently disagrees with the phone by a day. Same trap as the SQL one in
// [[postgres-landmines]].
const ZONE = "America/Chicago";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", hour12: false,
});

/** The Chicago calendar date of an instant, as YYYY-MM-DD. */
const dayKey = (ms) => dayKeyFmt.format(new Date(ms));

/** Midnight Chicago on a YYYY-MM-DD, in epoch millis — the bucket's `startMillis`. */
function startOfDayMillis(key) {
    // Chicago is UTC-5 or UTC-6 depending on the date, so the offset is measured rather than assumed.
    const noonUtc = Date.parse(`${key}T12:00:00Z`);
    const hourAtNoon = Number(partsFmt.formatToParts(new Date(noonUtc)).find((p) => p.type === "hour").value);
    const offsetHours = 12 - hourAtNoon;
    return Date.parse(`${key}T00:00:00Z`) + offsetHours * 3600000;
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The parts of a YYYY-MM-DD, with the weekday it falls on. */
function dateParts(key) {
    const [y, m, d] = key.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { y, m, d, dow };
}
const addDays = (key, n) => {
    const { y, m, d } = dateParts(key);
    return dayKeyFmt.format(new Date(Date.UTC(y, m - 1, d + n, 12)));
};

// The four label formats the phone uses, reproduced exactly: "M/d", "EEE, MMM d, yyyy", "MMM ''yy", "MMMM yyyy".
const shortDay = (key) => { const { m, d } = dateParts(key); return `${m}/${d}`; };
const fullDay = (key) => {
    const { y, m, d, dow } = dateParts(key);
    return `${DOW[dow]}, ${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
};
const shortMonth = (key) => { const { y, m } = dateParts(key); return `${MONTHS[m - 1].slice(0, 3)} '${String(y).slice(2)}`; };
const fullMonth = (key) => { const { y, m } = dateParts(key); return `${MONTHS[m - 1]} ${y}`; };

// Monday of the week a date falls in — `LocalDate.with(DayOfWeek.MONDAY)`.
const mondayOf = (key) => { const { dow } = dateParts(key); return addDays(key, dow === 0 ? -6 : 1 - dow); };
const firstOfMonth = (key) => `${key.slice(0, 7)}-01`;

const hourLabel = (h) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
const hourOf = (ms) => Number(partsFmt.formatToParts(new Date(ms)).find((p) => p.type === "hour").value) % 24;

/**
 * One granularity's series and breakdowns — the port of `buildLevel`.
 */
function buildLevel({ lines, cashRefunds, consigned, classifiers: c, bucketOf, labels }) {
    const grouped = new Map();
    const labelByStart = new Map();
    const put = (key, line) => {
        const bucketKey = bucketOf(key);
        const start = startOfDayMillis(bucketKey);
        if (!grouped.has(start)) grouped.set(start, []);
        if (line) grouped.get(start).push(line);
        labelByStart.set(start, labels(bucketKey));
        return start;
    };
    for (const line of lines) put(dayKey(line.soldAtMillis), line);

    // A refund on a day with no sales still has to show up, so its bucket is seeded empty rather than
    // being silently dropped for having no line items.
    const refundsByStart = new Map();
    for (const rf of cashRefunds) {
        const start = put(rf.date, null);
        if (!refundsByStart.has(start)) refundsByStart.set(start, []);
        refundsByStart.get(start).push(rf);
    }

    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const sales = [], profit = [], units = [];
    const breakdown = {}, unitsBreakdown = {};

    for (const start of [...grouped.keys()].sort((a, b) => a - b)) {
        const bucketLines = grouped.get(start);
        const [short, full] = labelByStart.get(start) || ["", ""];

        const storeLines = bucketLines.filter((l) =>
            !c.isStoreCredit(l) && !c.isSalesTax(l) && !c.isShipping(l) &&
            (l.squareCategoryId == null || !consigned.has(l.squareCategoryId)));
        const storeSales = sum(storeLines, (l) => l.netSales);
        const storeCost = sum(storeLines, (l) => c.effectiveLineCost(l));
        const storeFees = sum(storeLines, (l) => l.processingFee);

        // The shop's cut of consigned sales. The gross is rightly excluded above — that money is the
        // consignor's — but on an 87% rate the shop genuinely keeps 13%, and that was being thrown away
        // with the gross. Card fees come off it, because the shop pays those on the whole ticket.
        const consignedCommission = sum(
            bucketLines.filter((l) => !c.isStoreCredit(l) && l.squareCategoryId != null && consigned.has(l.squareCategoryId)),
            (l) => l.netSales * (1 - (consigned.get(l.squareCategoryId) || 0)) - l.processingFee);

        const bucketRefunds = refundsByStart.get(start) || [];
        const refunded = sum(bucketRefunds, (r) => r.amount);

        sales.push({ label: short, fullLabel: full, startMillis: start, value: storeSales - refunded });
        profit.push({ label: short, fullLabel: full, startMillis: start, value: storeSales - storeCost - storeFees + consignedCommission - refunded });

        const groupBy = (arr, keyOf) => {
            const m = new Map();
            for (const x of arr) {
                const k = keyOf(x);
                if (!m.has(k)) m.set(k, []);
                m.get(k).push(x);
            }
            return m;
        };

        const categoryRows = (sourceLines, sortItemsBy) => [...groupBy(sourceLines, c.categoryKeyFor)].map(([catId, catLines]) => {
            const rate = catId == null ? undefined : consigned.get(catId);
            // ⚠️ A CONSIGNED ITEM'S COST IS THE CONSIGNOR'S CUT, not whatever catalog price it carries.
            // Costing it at catalog reported a 33% margin on an 87%-to-consignor item.
            const costOf = (ls) => rate != null ? sum(ls, (l) => l.netSales * rate) : sum(ls, (l) => c.effectiveLineCost(l));
            const items = [...groupBy(catLines, (l) => l.productName)].map(([name, prodLines]) => {
                const qty = sum(prodLines, (l) => l.quantity);
                const lineCost = costOf(prodLines);
                return {
                    productName: name,
                    quantity: qty,
                    revenue: sum(prodLines, (l) => l.netSales),
                    imageUrl: null,
                    cost: lineCost,
                    unitCost: qty !== 0 ? lineCost / qty : (prodLines[0]?.unitCost || 0),
                    processingFee: sum(prodLines, (l) => l.processingFee),
                };
            }).sort(sortItemsBy);
            return {
                categoryName: categoryNameFor(catId, c.categoryNamesById),
                total: sum(catLines, (l) => l.netSales),
                items,
                isConsigned: rate != null,
                consignmentRate: rate ?? null,
                cost: costOf(catLines),
                processingFee: sum(catLines, (l) => l.processingFee),
            };
        });

        // Store categories first (by value), then consigned categories (by value).
        const cats = categoryRows(bucketLines, (a, b) => b.revenue - a.revenue)
            .sort((a, b) => (a.isConsigned === b.isConsigned ? b.total - a.total : (a.isConsigned ? 1 : -1)));
        // Refunds get their own visible row. Netting them out of the headline while leaving nothing to click
        // makes the categories stop summing to the total — right, and looking wrong, which is worse.
        if (bucketRefunds.length) {
            cats.push({
                categoryName: "Refunds",
                total: -refunded,
                items: bucketRefunds.map((rf) => ({
                    productName: rf.description, quantity: -1, revenue: -rf.amount,
                    imageUrl: null, cost: 0, unitCost: 0, processingFee: 0,
                })),
                isConsigned: false, consignmentRate: null, cost: 0, processingFee: 0,
            });
        }
        breakdown[start] = cats;

        // The same bucket counted in UNITS, sorted by units at both levels — the thing the shop sells most
        // of is usually a cheap single, which never appears near the top of a revenue-sorted list.
        const itemLines = bucketLines.filter(c.isMerchandise);
        units.push({ label: short, fullLabel: full, startMillis: start, value: sum(itemLines, (l) => l.quantity) });
        unitsBreakdown[start] = categoryRows(itemLines, (a, b) => b.quantity - a.quantity)
            .sort((a, b) => b.items.reduce((x, i) => x + i.quantity, 0) - a.items.reduce((x, i) => x + i.quantity, 0));
    }
    return { sales, profit, units, breakdown, unitsBreakdown };
}

/**
 * Everything the Reports screen needs, in the shape the app's `ReportsSalesData` already parses.
 */
export async function buildReportBundle({ lookbackDays = 400 } = {}) {
    const [lines, categoryNamesById] = await Promise.all([
        fetchSaleLines({ lookbackDays }),
        fetchCatalogCategories().catch(() => new Map()),
    ]);

    // ⚠️ A 100% PAYOUT RATE IS THE OWNER'S TEST ACCOUNT, not a consignment arrangement — it points at a real
    // consignor's Square category on purpose, and left in it reports every sale of theirs at zero profit.
    // Same filter the phone applies. See [[consignor-luke-is-a-test-category]].
    const consignorRows = await db.query(
        `SELECT square_category_id, payout_rate FROM consignors
          WHERE active = true AND payout_rate > 0 AND payout_rate < 1 AND square_category_id IS NOT NULL`
    ).catch(() => []);
    const consigned = new Map(consignorRows.map((r) => [String(r.square_category_id), Number(r.payout_rate)]));

    const refundRows = await db.query(
        `SELECT occurred_on::text AS on, description, amount FROM cash_ledger WHERE source = 'refund'`
    ).catch(() => []);
    const cashRefunds = refundRows.map((r) => ({
        date: String(r.on).slice(0, 10),
        description: r.description || "Customer refund",
        amount: Math.abs(Number(r.amount) || 0),
    }));

    const classifiers = { ...makeClassifiers(lines), categoryNamesById };
    const level = (bucketOf, labels) => buildLevel({ lines, cashRefunds, consigned, classifiers, bucketOf, labels });

    const day = level((k) => k, (k) => [shortDay(k), fullDay(k)]);
    const week = level(mondayOf, (k) => [shortDay(k), `Week of ${fullDay(k)}`]);
    const month = level(firstOfMonth, (k) => [shortMonth(k), fullMonth(k)]);

    // Hour of day, store sales only, summed across the whole window. `count` is the number of distinct days
    // that hour saw a sale, which is what stops a single big Tuesday reading as a good hour every week.
    const storeLinesAll = lines.filter((l) => l.squareCategoryId == null || !consigned.has(l.squareCategoryId));
    const hourly = Array.from({ length: 24 }, (_, h) => {
        const hl = storeLinesAll.filter((l) => hourOf(l.soldAtMillis) === h);
        return {
            label: hourLabel(h),
            fullLabel: `${hourLabel(h)}\u2013${hourLabel((h + 1) % 24)}`,
            startMillis: h,
            value: hl.reduce((a, l) => a + l.netSales, 0),
            count: new Set(hl.map((l) => dayKey(l.soldAtMillis))).size,
        };
    });

    return {
        daily: day.sales, weekly: week.sales, monthly: month.sales,
        dailyBreakdown: day.breakdown, weeklyBreakdown: week.breakdown, monthlyBreakdown: month.breakdown,
        profitDaily: day.profit, profitWeekly: week.profit, profitMonthly: month.profit,
        hourly,
        unitsDaily: day.units, unitsWeekly: week.units, unitsMonthly: month.units,
        unitsDailyBreakdown: day.unitsBreakdown, unitsWeeklyBreakdown: week.unitsBreakdown,
        unitsMonthlyBreakdown: month.unitsBreakdown,
        // Summed over the WHOLE window, not per bucket: it is a footnote saying how much the count is
        // deliberately leaving out, and a per-day version of that would be noise on every card.
        tradeCreditUnits: lines.reduce((a, l) => a + l.tradeCreditUnits, 0),
        lineCount: lines.length,
        lastUpdatedMillis: Date.now(),
    };
}
