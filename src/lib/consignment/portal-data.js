import "server-only";

import { getConsignorById } from "@/lib/consignment/config";
import { getInventoryCounts, listConsignorCatalog, searchSalesForVariations } from "@/lib/consignment/square";
import { createServerLogger } from "@/lib/server-logger";

const portalDataLogger = createServerLogger({ source: "api", subsystem: "consignment-portal-data" });

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

function buildSummary(consignor, inventory, sales, options = {}) {
    const totalGrossRevenue = sales.reduce((sum, entry) => sum + Number(entry.grossRevenue || 0), 0);
    const totalRefunds = sales.reduce((sum, entry) => sum + Number(entry.refundedRevenue || 0), 0);
    const totalRevenue = sales.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0);
    const totalUnitsInStock = inventory.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const payoutRate = Number(consignor.payout_rate || 0);

    return {
        totalGrossRevenue,
        totalRefunds,
        totalRevenue,
        payoutRate,
        estimatedPayout: totalRevenue * payoutRate,
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
            quantity: counts.get(item.id) || 0,
        }))
        .sort(sortByName);

    const sales = await searchSalesForVariations(variationLookup, options);
    const summary = buildSummary(consignor, inventory, sales, options);

    portalDataLogger.info("consignment.portal_data.build_dashboard.succeeded", {
        consignorId: consignor.id,
        inventoryItems: inventory.length,
        salesItems: sales.length,
    });

    return { inventory, sales, summary };
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
            active: Boolean(consignor.active),
        },
        ...dashboard,
    };
}