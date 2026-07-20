import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listCashLedger, upsertCashEntry, deleteCashEntryByEntryId, deleteCashRow, reconcileCashBalance } from "@/lib/cash/cash-ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cash on Hand ledger for the app. Admin-key gated (same as the app's other backends).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/cash-ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const limit = searchParams.get("limit") || undefined;
            const offset = searchParams.get("offset") || undefined;
            const { rows, balance } = await listCashLedger({ limit, offset });
            logger.info("admin.cash.list.success", { count: rows.length, balance });
            return NextResponse.json({ rows, balance }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.cash.list.failure" });
        }
    });
}

// Upsert a cash movement (by entryId when present — edit-safe replace; otherwise inserts a new row).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/cash-ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            if (!body) return NextResponse.json({ error: "Body required." }, { status: 400 });
            // Reconcile to a physically-counted balance → inserts one visible "cash count adjustment" row.
            if (body.action === "reconcile") {
                try {
                    const res = await reconcileCashBalance(body.target, { note: body.note, createdBy: body.createdBy });
                    logger.info("admin.cash.reconcile.success", res);
                    return NextResponse.json({ ok: true, ...res });
                } catch (validationError) {
                    return NextResponse.json({ error: validationError.message }, { status: 400 });
                }
            }
            try {
                const row = await upsertCashEntry(body);
                logger.info("admin.cash.upsert.success", { id: row.id, entryId: row.entryId });
                return NextResponse.json({ ok: true, row });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "admin.cash.upsert.failure" });
        }
    });
}

// Remove a row — by entryId (reclassified out of cash) or by row id (a hand-entered row).
export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/admin/cash-ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const entryId = searchParams.get("entryId");
            const id = searchParams.get("id");
            const removed = entryId ? await deleteCashEntryByEntryId(entryId) : await deleteCashRow(id);
            return NextResponse.json({ ok: true, removed });
        } catch (error) {
            return internalError(error, { event: "admin.cash.delete.failure" });
        }
    });
}
