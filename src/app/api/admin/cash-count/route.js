import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { listCashCounts, recordCashCount } from "@/lib/cash/cash-count.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Counting the drawer is a shift task, so this is reachable from the employee build — `reports.view` rather
// than an owner permission. It can only ever record a count; it cannot edit or delete ledger history.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/cash-count", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);
        if (authError) return authError;
        try {
            const bal = await db.query(`SELECT COALESCE(SUM(amount),0) AS b FROM cash_ledger`).catch(() => null);
            const recent = await db.query(
                `SELECT occurred_on, description, amount, source FROM cash_ledger
                  ORDER BY occurred_on DESC, id DESC LIMIT 25`
            ).catch(() => []);
            return NextResponse.json({
                expected: Math.round(Number(bal?.[0]?.b ?? 0) * 100) / 100,
                counts: await listCashCounts(20),
                recent: recent.map((r) => ({
                    on: String(r.occurred_on).slice(0, 10),
                    description: r.description,
                    amount: Number(r.amount),
                    source: r.source,
                })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.cash_count.get.failure" });
        }
    });
}

// { actual, context: "clock_in"|"clock_out"|"manual", by, note }
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/cash-count", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);
        if (authError) return authError;
        try {
            const b = await request.json().catch(() => ({}));
            const res = await recordCashCount(b?.actual, {
                context: ["clock_in", "clock_out", "manual"].includes(b?.context) ? b.context : "manual",
                by: b?.by ? String(b.by).slice(0, 80) : null,
                note: b?.note ? String(b.note).slice(0, 200) : null,
            });
            if (!res.ok) return NextResponse.json(res, { status: 400 });
            return NextResponse.json(res);
        } catch (error) {
            return internalError(error, { event: "admin.cash_count.post.failure" });
        }
    });
}
