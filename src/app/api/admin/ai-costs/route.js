import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getAiCosts } from "@/lib/marketplace/openai-usage.js";
import { listGenerations, listBatch, generationSummary } from "@/lib/marketplace/ai-ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AI spend for the admin app's AI Costs screen.
//
//   (default)        real OpenAI org-level costs — the money side
//   ?view=history    the generation LEDGER: every image, what caused it, what it cost, batches grouped
//   ?view=batch&id=  the individual generations inside one batch
//
// The two are deliberately separate reads. OpenAI's costs are authoritative on DOLLARS; the ledger is ours and
// is authoritative on WHAT and WHO. They're shown side by side rather than reconciled into one figure, because
// a refusal has a ledger row and no image, and art drawn before the ledger existed has an image and no row.
// Forcing them into one number would hide both facts.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/ai-costs", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const url = new URL(request.url);
            const view = url.searchParams.get("view");
            const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));

            if (view === "batch") {
                const id = url.searchParams.get("id");
                if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
                return NextResponse.json({ ok: true, batchId: id, items: await listBatch(id) }, { headers: { "Cache-Control": "no-store" } });
            }

            if (view === "history") {
                const origin = url.searchParams.get("origin") || null;
                const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
                // Pull OpenAI's own total for the SAME window and hand back both, plus the difference.
                // The ledger only knows what it was there to see: art generated before it existed was
                // reconstructed from what survived, and a sprite that was drawn five times and overwritten
                // four leaves exactly one row. Showing the ledger total alone would quietly understate the
                // bill, which is the opposite of the point. Name the gap instead of hiding it.
                const [summary, entries, real] = await Promise.all([
                    generationSummary({ days }),
                    listGenerations({ days, limit, origin }),
                    getAiCosts({ days: Math.min(90, days) }).catch(() => ({ ok: false })),
                ]);
                const openaiTotal = real?.ok ? Number(real.total || 0) : null;
                const reconcile = openaiTotal == null ? null : {
                    openaiTotal: Math.round(openaiTotal * 100) / 100,
                    ledgerTotal: summary.costUsd,
                    unattributed: Math.round(Math.max(0, openaiTotal - summary.costUsd) * 100) / 100,
                    // Capped at 90 by the costs API, so say so rather than silently comparing unlike windows.
                    windowDays: Math.min(90, days),
                    windowMatches: days <= 90,
                };
                return NextResponse.json({ ok: true, days, summary, entries, reconcile }, { headers: { "Cache-Control": "no-store" } });
            }

            const data = await getAiCosts({ days: Math.min(90, days) });
            return NextResponse.json(data, { status: data.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.ai_costs.failure" });
        }
    });
}
