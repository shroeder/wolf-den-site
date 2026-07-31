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
                const [summary, entries] = await Promise.all([
                    generationSummary({ days }),
                    listGenerations({ days, limit, origin }),
                ]);
                return NextResponse.json({ ok: true, days, summary, entries }, { headers: { "Cache-Control": "no-store" } });
            }

            const data = await getAiCosts({ days: Math.min(90, days) });
            return NextResponse.json(data, { status: data.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.ai_costs.failure" });
        }
    });
}
