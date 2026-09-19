import "server-only";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "admin-app-shop-lines" });

// ── AN ONLINE ORDER ARRIVES AT SQUARE AS ONE ANONYMOUS LUMP ──────────────────────────────────────────────────
// The website's checkout charges a single card payment for the whole basket and does NOT create an itemised
// Square order. Square then invents one for the payment: a single line, `item_type: CUSTOM_AMOUNT`, no name
// and no catalog id, carrying only a note — "Shop order <uuid>".
//
// Every report downstream reads Square's line items, so that lands as "Unknown Product · Uncategorized ·
// cost $0.00 · 97% margin". The shop knows exactly what was in the basket; Square simply was never told.
//
// ⚠️ FIXED HERE, IN THE PROXY, AND THAT IS DELIBERATE. The phone reaches Square THROUGH this proxy, so one
// server-side change repairs every screen at once — the category report, the sale itemisation, the COGS
// reader — with no app release. It also repairs orders that have ALREADY been placed, which nothing else
// could: a paid Square order is immutable, so the five that exist can never be itemised at the source.
//
// The alternative (itemise at checkout) is the better long-term fix for Square's OWN dashboard, but it means
// changing a live payment path and how sales tax is expressed to Square. That is not a trade worth making
// for a reporting bug, and it would do nothing for the orders already taken.
const NOTE_RE = /^Shop order ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const money = (cents) => ({ amount: Math.round(Number(cents) || 0), currency: "USD" });

function parseItems(raw) {
    if (!raw) return [];
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
}

/**
 * Rewrite a Square orders-search response so shop-order lumps become the lines they actually were.
 *
 * ⚠️ THE MONEY MUST NOT MOVE. The lump's gross is the basket PLUS tax, shipping and the online fee; the
 * product lines alone are only the subtotal. Replacing one with the other would quietly drop every online
 * order's revenue by its tax. So the remainder is emitted as its own named lines, taken from the shop order's
 * own columns, and the expansion is REFUSED outright if the parts do not add back to the original. A report
 * that silently loses money is worse than one that says "Unknown Product".
 *
 * Never throws: any failure returns the body untouched, because a proxy that can break a report while trying
 * to improve it is not worth having.
 */
export async function expandShopOrderLines(responseBody) {
    let payload;
    try {
        payload = JSON.parse(responseBody);
    } catch { return responseBody; }
    const orders = payload?.orders;
    if (!Array.isArray(orders) || !orders.length) return responseBody;

    // Which shop orders are referenced at all? One pass, so a page with none costs a single scan and no query.
    const wanted = new Set();
    for (const order of orders) {
        for (const li of order?.line_items || []) {
            if (li?.catalog_object_id) continue;
            const id = NOTE_RE.exec(String(li?.note || ""))?.[1];
            if (id) wanted.add(id.toLowerCase());
        }
    }
    if (!wanted.size) return responseBody;

    let rows = [];
    try {
        rows = await db.query(
            `SELECT id, items_json, subtotal_cents, tax_cents, shipping_cents, online_fee_cents, total_cents
               FROM shop_orders WHERE id = ANY($1::uuid[])`,
            [[...wanted]]
        );
    } catch (error) {
        logger.warn("admin_app.shop_lines.lookup_failed", { message: error?.message });
        return responseBody;
    }
    const byId = new Map(rows.map((r) => [String(r.id).toLowerCase(), r]));
    if (!byId.size) return responseBody;

    let expanded = 0;
    for (const order of orders) {
        const lines = order?.line_items;
        if (!Array.isArray(lines)) continue;
        const out = [];
        let changed = false;

        for (const li of lines) {
            const id = li?.catalog_object_id ? null : NOTE_RE.exec(String(li?.note || ""))?.[1]?.toLowerCase();
            const shop = id ? byId.get(id) : null;
            if (!shop) { out.push(li); continue; }

            let items;
            try { items = parseItems(shop.items_json); } catch { items = []; }
            if (!items.length) { out.push(li); continue; }

            // What Square recorded for the lump — the number every report already trusts.
            const lumpCents = Number(li?.gross_sales_money?.amount)
                || Number(li?.total_money?.amount)
                || Number(shop.total_cents) || 0;

            const built = [];
            let productCents = 0;
            items.forEach((item, i) => {
                const qty = Math.max(1, Math.round(Number(item?.quantity) || 1));
                const lineCents = Math.round(Number(item?.lineTotalCents) || (Number(item?.priceCents) || 0) * qty);
                productCents += lineCents;
                built.push({
                    uid: `shop-${shop.id}-${i}`,
                    name: String(item?.name || "Item"),
                    quantity: String(qty),
                    // The catalog id is the whole point: it is what lets the report find the category and the
                    // unit cost it already knows how to look up.
                    ...(item?.catalogObjectId ? { catalog_object_id: String(item.catalogObjectId) } : {}),
                    item_type: "ITEM",
                    base_price_money: money(Number(item?.priceCents) || 0),
                    gross_sales_money: money(lineCents),
                    total_money: money(lineCents),
                    note: `Shop order ${shop.id}`,
                });
            });

            // Tax, shipping and the online fee, named rather than buried in a product's price.
            const extras = [
                ["Sales tax", Number(shop.tax_cents) || 0],
                ["Shipping", Number(shop.shipping_cents) || 0],
                ["Online processing fee", Number(shop.online_fee_cents) || 0],
            ];
            let extraCents = 0;
            for (const [name, cents] of extras) {
                if (cents <= 0) continue;
                extraCents += cents;
                built.push({
                    uid: `shop-${shop.id}-${name.replace(/\W+/g, "-").toLowerCase()}`,
                    name, quantity: "1", item_type: "CUSTOM_AMOUNT",
                    base_price_money: money(cents),
                    gross_sales_money: money(cents),
                    total_money: money(cents),
                    note: `Shop order ${shop.id}`,
                });
            }

            // ⚠️ THE REFUSAL. If the rebuilt lines do not add back to what Square charged, something about this
            // order is not what we think it is (a partial refund, a discount we did not model, a stale row) —
            // and the honest response is to leave it alone rather than publish a number that is merely close.
            if (productCents + extraCents !== lumpCents) {
                logger.warn("admin_app.shop_lines.total_mismatch", {
                    shopOrderId: shop.id, lumpCents, productCents, extraCents,
                });
                out.push(li);
                continue;
            }

            out.push(...built);
            changed = true;
            expanded += 1;
        }

        if (changed) order.line_items = out;
    }

    if (!expanded) return responseBody;
    logger.info("admin_app.shop_lines.expanded", { orders: expanded });
    try { return JSON.stringify(payload); } catch { return responseBody; }
}
