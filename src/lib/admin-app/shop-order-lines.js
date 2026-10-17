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
    if (!Array.isArray(payload?.orders) || !payload.orders.length) return responseBody;
    const n = await expandShopOrders(payload.orders);
    if (!n) return responseBody;
    try { return JSON.stringify(payload); } catch { return responseBody; }
}

/**
 * The expansion itself, over PARSED orders, mutating them in place and returning how many it rewrote.
 *
 * ⚠️ IT IS SPLIT OUT BECAUSE THE SECOND READER ARRIVED AND DID NOT GET IT. For months the only caller was
 * the proxy, so the work lived inside a function that takes and returns a JSON STRING — the shape a proxy
 * happens to hold. reports-v2.js then went straight to Square instead of through the proxy, could not call
 * a string-in/string-out helper against parsed orders, and silently did without: the same online order that
 * the phone splits into the product, "Sales tax" and "Online processing fee" landed in v2 as one unnamed
 * CUSTOM_AMOUNT line under Uncategorized at ~100% margin, counting the state's sales tax as profit. That is
 * the exact bug this file was written to kill, alive again in the report meant to REPLACE the one it fixed.
 *
 * So the rule is the rule everywhere else in this codebase: one implementation, two thin callers. See
 * [[two-paths-for-one-payout-always-drift]].
 */
export async function expandShopOrders(orders) {
    if (!Array.isArray(orders) || !orders.length) return 0;

    // Which shop orders are referenced at all? One pass, so a page with none costs a single scan and no query.
    const wanted = new Set();
    for (const order of orders) {
        for (const li of order?.line_items || []) {
            if (li?.catalog_object_id) continue;
            const id = NOTE_RE.exec(String(li?.note || ""))?.[1];
            if (id) wanted.add(id.toLowerCase());
        }
    }
    if (!wanted.size) return 0;

    let rows = [];
    try {
        rows = await db.query(
            `SELECT id, items_json, subtotal_cents, tax_cents, shipping_cents, online_fee_cents, total_cents
               FROM shop_orders WHERE id = ANY($1::uuid[])`,
            [[...wanted]]
        );
    } catch (error) {
        logger.warn("admin_app.shop_lines.lookup_failed", { message: error?.message });
        return 0;
    }
    const byId = new Map(rows.map((r) => [String(r.id).toLowerCase(), r]));
    if (!byId.size) return 0;

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

            // ── TAX RIDES THE UNITS, LIKE EVERY OTHER SALE IN THE SHOP ──────────────────────────────────
            // Luke: "every tax is associated to a unit, why is this unique".
            //
            // It was unique, and the online order was the odd one out rather than the tax. On a register
            // sale Square hangs the tax on the LINE — `total_tax_money`, sitting beside the sale, never
            // inside it — so tax is never revenue, never a category, and has no margin to be wrong about.
            // 64 of 71 lines on the day this was written worked that way; one online order did not.
            //
            // Tax was emitted here as a named CUSTOM_AMOUNT line instead, because the lump Square charged
            // includes it and dropping it would leave the order short. But a line is REVENUE, so it then
            // needed a fake "cost" equal to itself to cancel out, and the card fee allocated to it had
            // nowhere to go — which is what surfaced as "Sales Tax (held for the state) ... -3%" on the
            // day's category list. Every one of those problems is downstream of the shape.
            //
            // So it goes where the register puts it: spread across the product lines as `total_tax_money`,
            // which is the exact field both readers already use (reports-v2.js `fetchSaleLines`, Kotlin
            // `SquareTransactionsService`). The money does not move — it is still counted, still inside
            // the reconciliation below — it just stops pretending to be a sale.
            const taxCents = Number(shop.tax_cents) || 0;
            if (taxCents > 0 && built.length) {
                // Proportional to each line's share, with the rounding remainder landing on the biggest
                // line. The parts MUST add back to taxCents exactly: this number is a liability to the
                // state, and a penny invented here is a penny that never gets remitted.
                let assigned = 0;
                const shares = built.map((b, i) => {
                    const base = Number(b.total_money?.amount) || 0;
                    const share = productCents > 0 ? Math.floor((taxCents * base) / productCents) : (i === 0 ? taxCents : 0);
                    assigned += share;
                    return share;
                });
                let biggest = 0;
                for (let i = 1; i < built.length; i += 1) {
                    if ((Number(built[i].total_money?.amount) || 0) > (Number(built[biggest].total_money?.amount) || 0)) biggest = i;
                }
                shares[biggest] += taxCents - assigned;
                built.forEach((b, i) => { if (shares[i] > 0) b.total_tax_money = money(shares[i]); });
            }

            // Shipping and the online fee stay NAMED LINES, and that is not an oversight. Both are money the
            // shop actually took — shipping is cost recovery the carrier then takes back, the fee is revenue
            // that offsets the card cost — so each is a sale with a story, unlike tax, which was never ours.
            const extras = [
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
            //
            // ⚠️ TAX IS STILL IN THIS SUM EVEN THOUGH IT IS NO LONGER A LINE. The lump Square charged is the
            // basket PLUS tax, so the moment tax stopped being counted in `extraCents` it had to be counted
            // here instead — otherwise every online order in the shop fails this check by exactly its tax
            // and the expansion silently stops happening, which is the bug this whole file exists to fix,
            // restored by the fix for a different one.
            if (productCents + taxCents + extraCents !== lumpCents) {
                logger.warn("admin_app.shop_lines.total_mismatch", {
                    shopOrderId: shop.id, lumpCents, productCents, taxCents, extraCents,
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

    if (!expanded) return 0;
    logger.info("admin_app.shop_lines.expanded", { orders: expanded });
    return expanded;
}
