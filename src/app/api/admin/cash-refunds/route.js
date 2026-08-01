import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── CUSTOMER REFUNDS PAID IN CASH ────────────────────────────────────────────────────────────────────────────
//
// A refund handed back over the counter in cash leaves NO trace in Square — no refund object, no return order,
// no negative line. Confirmed on the live account: a $101 refund for a fake card existed only as a hand-typed
// cash-ledger row, so the profit report (built entirely from Square orders) could never see it and kept
// reporting a sale that had been undone.
//
// These rows are that missing channel. The report reads them and books each as negative revenue, which is what
// a refund is. Scope-wise this stays inside the report's stated boundary — Square + Plaid + CASH — because a
// cash refund IS cash; it just wasn't being collected anywhere the report looked.
//
// `source = 'refund'` is the marker, set when the movement is recorded, rather than matching on the description
// text. Guessing "does this row look like a refund?" from free text would silently swallow a float top-up
// worded badly, or miss a refund worded plainly.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/cash-refunds", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const url = new URL(request.url);
            const from = url.searchParams.get("from");
            const to = url.searchParams.get("to");
            const rows = await db.query(
                `SELECT id, occurred_on, description, amount
                   FROM cash_ledger
                  WHERE source = 'refund'
                    AND ($1::date IS NULL OR occurred_on >= $1::date)
                    AND ($2::date IS NULL OR occurred_on <= $2::date)
                  ORDER BY occurred_on DESC, created_at DESC
                  LIMIT 500`,
                [from || null, to || null]
            ).catch(() => []);
            return NextResponse.json({
                refunds: rows.map((r) => ({
                    id: String(r.id),
                    on: String(r.occurred_on).slice(0, 10),
                    description: r.description || "Customer refund",
                    // Stored negative (cash leaving the drawer). Reported as a positive magnitude so the
                    // consumer decides the sign rather than inheriting the ledger's convention by accident.
                    amount: Math.abs(Number(r.amount) || 0),
                })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.cash_refunds.get.failure" });
        }
    });
}
