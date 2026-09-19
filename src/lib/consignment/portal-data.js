import "server-only";

import { getConsignorById } from "@/lib/consignment/config";
import { getLastPayoutAtForConsignor, getTotalPaidForConsignor, listPayoutsForConsignor } from "@/lib/consignment/payouts";
import { getInventoryCounts, listConsignorCatalog, searchSalesForVariations } from "@/lib/consignment/square";
import { listConsignmentTradeSales } from "@/lib/consignment/trade-sales";
import { createServerLogger } from "@/lib/server-logger";

const portalDataLogger = createServerLogger({ source: "api", subsystem: "consignment-portal-data" });
const ALL_TIME_SALES_START_AT = "2000-01-01T00:00:00.000Z";

const sortByName = (left, right) => left.name.localeCompare(right.name);

async function loadConsignor(consignorId) {
    portalDataLogger.info("consignment.portal_data.load_consignor.started", {
        consignorId,
    });

    const consignor = await getConsignorById(consignorId);

    if (!consignor) {
        const error = new Error("Consignor not found");

        error.code = "consignor_not_found";

        portalDataLogger.warn("consignment.portal_data.load_consignor.failed", {
            consignorId,
            reason: "consignor_not_found",
        });

        throw error;
    }

    portalDataLogger.info("consignment.portal_data.load_consignor.succeeded", {
        consignorId,
        slug: consignor.slug,
    });

    return consignor;
}

// ── WHAT WE OWE, AND WHY IT IS NOT A LIFETIME BALANCE ANY MORE ───────────────────────────────────────────────
// This used to be `max(0, lifetime earned - lifetime paid)`, and that formula cannot be trusted on this data.
//
// The earned half is rebuilt from Square EVERY TIME it is read: a consignor's sales are found by listing the
// items currently in their Square category and then searching orders for those variations. So the moment an
// item is deleted from the catalogue — which is what happens to a card single when it sells out and somebody
// tidies up — every sale it ever made disappears from "earned". The paid half never moves. Earned shrinks,
// paid does not, and the balance drifts permanently toward "we already paid you".
//
// It had gone wrong in exactly that direction on a real consignor: his items had grossed about $1,290 across
// their whole life (7 of them since deleted), $1,427.15 had been recorded as paid, and the screen therefore
// read "Current owed $0.00" on a day one of his $240 boxes had just sold. The sale was recorded correctly and
// attributed correctly; it was being netted against a deficit that only existed because older sales had
// evaporated from the catalogue.
//
// So OWED IS NOW THE PERIOD SINCE THE LAST PAYOUT. A payout is a settlement: it says "everything up to this
// moment is square". What is owed is what has sold since, which no amount of later catalogue tidying can
// rewrite, because those sales are inside a window that starts after the last time money changed hands.
//
// The lifetime figures are still reported — totalPaid, estimatedPayoutGross, netBalance — because they are
// useful context and because hiding them would make an overpayment invisible. They are simply no longer what
// the "owed" number is computed from.
async function buildSummary(consignor, inventory, salesForSummary, options = {}, sinceLastPayout = null) {
    const totalGrossRevenue = salesForSummary.reduce((sum, entry) => sum + Number(entry.grossRevenue || 0), 0);
    const totalRefunds = salesForSummary.reduce((sum, entry) => sum + Number(entry.refundedRevenue || 0), 0);
    const totalRevenue = salesForSummary.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0);
    const totalUnitsInStock = inventory.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const payoutRate = Number(consignor.payout_rate || 0);
    const estimatedPayoutGross = totalRevenue * payoutRate;
    const totalPaid = await getTotalPaidForConsignor(consignor.id);

    // The window that actually decides the number on screen.
    const sinceSales = sinceLastPayout?.sales || [];
    const revenueSincePayout = sinceSales.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0);
    const estimatedPayout = Math.max(0, revenueSincePayout * payoutRate);

    // Kept, and still signed, so an overpayment is visible rather than floored away — it is just no longer
    // what we ask anybody to pay.
    const netBalance = estimatedPayoutGross - totalPaid;

    return {
        totalGrossRevenue,
        totalRefunds,
        totalRevenue,
        payoutRate,
        estimatedPayoutGross,
        totalPaid,
        estimatedPayout,
        netBalance,
        overpaid: netBalance < 0 ? -netBalance : 0,
        outstandingBalance: estimatedPayout,
        // What the owed figure was measured over, so the screen can say "since 13 Aug" instead of asking
        // anybody to take the number on faith.
        lastPayoutAt: sinceLastPayout?.lastPayoutAt || null,
        revenueSincePayout,
        unitsSincePayout: sinceSales.reduce((sum, entry) => sum + Number(entry.quantitySold || 0), 0),
        catalogItems: inventory.length,
        unitsInStock: totalUnitsInStock,
        lookbackDays: Number(options.lookbackDays) || 90,
    };
}

async function buildDashboard(consignor, options = {}) {
    portalDataLogger.info("consignment.portal_data.build_dashboard.started", {
        consignorId: consignor.id,
        lookbackDays: options.lookbackDays,
    });

    const catalog = await listConsignorCatalog(consignor.square_category_id);
    const counts = await getInventoryCounts(catalog.map((item) => item.id));
    const variationLookup = new Map(catalog.map((item) => [item.id, item]));

    const inventory = catalog
        .map((item) => ({
            name: item.name,
            price: item.price,
            imageUrl: item.imageUrl || null,
            quantity: counts.get(item.id) || 0,
        }))
        .sort(sortByName);

    const nowIso = new Date().toISOString();
    const lookbackDays = Number(options.lookbackDays) || 90;
    const displayStart = options.startAt || new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const displayEnd = options.endAt || nowIso;

    // Square order sales + off-Square trade store-credit sales (consigned items taken in a trade decrement
    // Square inventory instead of creating an order, so they never show up in searchSalesForVariations).
    const squareSales = await searchSalesForVariations(variationLookup, options);
    const tradeSales = await listConsignmentTradeSales(consignor.id, { startAt: displayStart, endAt: displayEnd });
    const sales = [...squareSales, ...tradeSales].sort(
        (left, right) => Number(right.revenue || 0) - Number(left.revenue || 0) || left.name.localeCompare(right.name)
    );

    const squareSalesAllTime = await searchSalesForVariations(variationLookup, {
        startAt: ALL_TIME_SALES_START_AT,
        endAt: nowIso,
    });
    const tradeSalesAllTime = await listConsignmentTradeSales(consignor.id, {
        startAt: ALL_TIME_SALES_START_AT,
        endAt: nowIso,
    });
    const salesForSummary = [...squareSalesAllTime, ...tradeSalesAllTime];

    const payouts = await listPayoutsForConsignor(consignor.id);

    // ── THE SETTLEMENT WINDOW ────────────────────────────────────────────────────────────────────────────
    // What has sold since the last time this consignor was paid — the window the owed figure is measured
    // over. Its own fetch rather than a slice of the all-time numbers above, because those are aggregated
    // per ITEM (one row carrying a total and a lastSoldAt) and an aggregate cannot be cut by date.
    //
    // It is the cheapest of the three reads: a few weeks of orders against a handful of variations, where
    // the all-time pass walks the shop's whole order history. Somebody who has never been paid reckons from
    // the beginning, which is the same answer the old lifetime sum would have given them.
    const lastPayoutAt = await getLastPayoutAtForConsignor(consignor.id);
    const sinceStart = lastPayoutAt || ALL_TIME_SALES_START_AT;
    const [sinceSquare, sinceTrade] = await Promise.all([
        searchSalesForVariations(variationLookup, { startAt: sinceStart, endAt: nowIso }),
        listConsignmentTradeSales(consignor.id, { startAt: sinceStart, endAt: nowIso }),
    ]);
    const sinceLastPayout = { lastPayoutAt, sales: [...sinceSquare, ...sinceTrade] };

    const summary = await buildSummary(consignor, inventory, salesForSummary, options, sinceLastPayout);

    portalDataLogger.info("consignment.portal_data.build_dashboard.succeeded", {
        consignorId: consignor.id,
        inventoryItems: inventory.length,
        salesItems: sales.length,
    });

    return { inventory, sales, payouts, summary, sinceLastPayout: sinceLastPayout.sales };
}

export async function getConsignorInventory(consignorId) {
    const consignor = await loadConsignor(consignorId);
    const dashboard = await buildDashboard(consignor);

    return dashboard.inventory;
}

export async function getConsignorSales(consignorId, options = {}) {
    const consignor = await loadConsignor(consignorId);
    const dashboard = await buildDashboard(consignor, options);

    return dashboard.sales;
}

export async function getConsignorSummary(consignorId, options = {}) {
    const consignor = await loadConsignor(consignorId);
    const dashboard = await buildDashboard(consignor, options);

    return dashboard.summary;
}

export async function getConsignorDashboard(consignorId, options = {}) {
    const consignor = await loadConsignor(consignorId);
    const dashboard = await buildDashboard(consignor, options);

    return {
        consignor: {
            id: consignor.id,
            slug: consignor.slug,
            displayName: consignor.display_name,
            payoutRate: Number(consignor.payout_rate || 0),
            nightlyReportsEnabled: Boolean(consignor.nightly_reports_enabled),
            active: Boolean(consignor.active),
        },
        ...dashboard,
    };
}