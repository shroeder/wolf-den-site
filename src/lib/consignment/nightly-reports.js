import "server-only";

import { sendNightlyConsignmentReportEmail } from "@/lib/consignment/email";
import { getTotalPaidForConsignor } from "@/lib/consignment/payouts";
import { listConsignorCatalog, searchSalesForVariations } from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

const reportLogger = createServerLogger({ source: "api", subsystem: "consignment-nightly-reports" });
const ALL_TIME_SALES_START_AT = "2000-01-01T00:00:00.000Z";

function getDefaultWindow() {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

    return {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
    };
}

async function listEnabledConsignors() {
    return db.query(
        `SELECT id, slug, display_name, email, square_category_id, payout_rate, created_at
         FROM consignors
         WHERE active = TRUE
           AND nightly_reports_enabled = TRUE
           AND email IS NOT NULL
           AND square_category_id IS NOT NULL`
    );
}

async function buildConsignorReport(consignor, window) {
    const catalog = await listConsignorCatalog(consignor.square_category_id);
    const variationLookup = new Map(catalog.map((item) => [item.id, item]));

    const dailySales = await searchSalesForVariations(variationLookup, {
        startAt: window.startAt,
        endAt: window.endAt,
    });

    const lifetimeSales = await searchSalesForVariations(variationLookup, {
        startAt: ALL_TIME_SALES_START_AT,
        endAt: new Date().toISOString(),
    });

    const todayNetRevenue = dailySales.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0);
    const totalNetRevenue = lifetimeSales.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0);
    const payoutRate = Number(consignor.payout_rate || 0);
    const estimatedPayoutGross = totalNetRevenue * payoutRate;
    const totalPaid = await getTotalPaidForConsignor(consignor.id);

    return {
        windowStart: window.startAt,
        windowEnd: window.endAt,
        dailySales,
        todayNetRevenue,
        totalNetRevenue,
        payoutRate,
        estimatedPayoutGross,
        totalPaid,
        currentOwed: Math.max(0, estimatedPayoutGross - totalPaid),
    };
}

export async function runNightlyConsignmentReports() {
    const window = getDefaultWindow();
    const consignors = await listEnabledConsignors();

    reportLogger.info("consignment.nightly_reports.started", {
        consignorCount: consignors.length,
        windowStart: window.startAt,
        windowEnd: window.endAt,
    });

    const results = {
        sent: 0,
        failed: 0,
        skipped: 0,
        errors: [],
    };

    for (const consignor of consignors) {
        try {
            const report = await buildConsignorReport(consignor, window);

            await sendNightlyConsignmentReportEmail(consignor, report);

            results.sent += 1;

            reportLogger.info("consignment.nightly_reports.email_sent", {
                consignorId: consignor.id,
                todayNetRevenue: Number(report.todayNetRevenue.toFixed(2)),
                currentOwed: Number(report.currentOwed.toFixed(2)),
            });
        } catch (error) {
            results.failed += 1;
            results.errors.push({
                consignorId: consignor.id,
                message: error instanceof Error ? error.message : "unknown_error",
            });

            reportLogger.error("consignment.nightly_reports.email_failed", error, {
                consignorId: consignor.id,
            });
        }
    }

    reportLogger.info("consignment.nightly_reports.completed", {
        ...results,
    });

    return {
        window,
        ...results,
    };
}
