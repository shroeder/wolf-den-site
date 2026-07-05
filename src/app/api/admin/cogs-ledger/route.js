import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listCogs, insertCogs, deleteCogsByEntryId, deleteCogsRow } from "@/lib/cogs/cogs-ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// COGS / inventory-intake ledger for the app. Admin-key gated.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/cogs-ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const rows = await listCogs({ limit: searchParams.get("limit") || undefined, offset: searchParams.get("offset") || undefined });
            logger.info("admin.cogs.list.success", { count: rows.length });
            return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.cogs.list.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/cogs-ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            if (!body) return NextResponse.json({ error: "Body required." }, { status: 400 });
            try {
                const row = await insertCogs(body);
                return NextResponse.json({ ok: true, row });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "admin.cogs.insert.failure" });
        }
    });
}

export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/admin/cogs-ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const entryId = searchParams.get("entryId");
            const removed = entryId ? await deleteCogsByEntryId(entryId) : await deleteCogsRow(searchParams.get("id"));
            return NextResponse.json({ ok: true, removed });
        } catch (error) {
            return internalError(error, { event: "admin.cogs.delete.failure" });
        }
    });
}
