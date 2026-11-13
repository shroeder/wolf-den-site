import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { auditProgress, auditWorklist, currentRound, recordAudit } from "@/lib/admin/stock-audit";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── THE CASE AUDIT, FOR BOTH APPS ───────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "we need something in both apps to manually verify what we have for singles."
//
// GET  -> the next cards to look at, worst-known-first, plus how far through the round the shop is.
// POST -> one verdict: present / missing / skipped. 'missing' writes the card off in Square.
//
// ⚠️ ONE ENDPOINT FOR THE OWNER BUILD AND THE EMPLOYEE BUILD. Both phones are the same app with a different
// flavour, and the permission is the existing `marketplace.manage` rather than a new owner-only one —
// counting the case is exactly the kind of work an employee is meant to do, and a screen only Luke can open
// is a screen that gets used once. `verifiedBy` is what distinguishes them afterwards.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/stock-audit", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const url = new URL(request.url);
            const round = url.searchParams.get("round") || currentRound();
            const [items, progress] = await Promise.all([
                auditWorklist({
                    round,
                    category: url.searchParams.get("category") || null,
                    tier: url.searchParams.get("tier") || "all",
                    limit: Number(url.searchParams.get("limit")) || 50,
                    includeDone: url.searchParams.get("includeDone") === "1",
                }),
                auditProgress({ round }),
            ]);
            return NextResponse.json({ ok: true, round, progress, items });
        } catch (error) {
            return internalError(error, { event: "stock_audit.list_failed" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/stock-audit", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            if (!body?.variationId || !body?.status) {
                return NextResponse.json({ error: "variationId and status are required" }, { status: 400 });
            }
            const result = await recordAudit({
                variationId: body.variationId,
                round: body.round || currentRound(),
                status: body.status,
                quantity: body.quantity ?? null,
                note: body.note ?? null,
                verifiedBy: body.verifiedBy ?? null,
            });
            if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
            const progress = await auditProgress({ round: body.round || currentRound() });
            return NextResponse.json({ ok: true, ...result, progress });
        } catch (error) {
            return internalError(error, { event: "stock_audit.record_failed" });
        }
    });
}
