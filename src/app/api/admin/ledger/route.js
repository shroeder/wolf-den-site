import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listEntries, upsertEntry, deleteEntry } from "@/lib/ledger/ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Main ledger for the app. Admin-key gated (same as the app's other backends).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const limit = searchParams.get("limit") || undefined;
            const offset = searchParams.get("offset") || undefined;
            const entries = await listEntries({ limit, offset });
            logger.info("admin.ledger.list.success", { count: entries.length });
            return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.ledger.list.failure" });
        }
    });
}

// Upsert an entry (insert or edit — keyed on entryId). Idempotent; a retry never double-posts.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            if (!body) return NextResponse.json({ error: "Body required." }, { status: 400 });
            try {
                const entry = await upsertEntry(body);
                return NextResponse.json({ ok: true, entry });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "admin.ledger.upsert.failure" });
        }
    });
}

export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/admin/ledger", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const removed = await deleteEntry(searchParams.get("entryId"));
            return NextResponse.json({ ok: true, removed });
        } catch (error) {
            return internalError(error, { event: "admin.ledger.delete.failure" });
        }
    });
}
