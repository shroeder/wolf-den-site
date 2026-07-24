import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getAiCosts } from "@/lib/marketplace/openai-usage.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Real OpenAI spend for the admin app's AI Costs screen. ?days=30 (default). Reads OPEN_AI_ADMIN_KEY.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/ai-costs", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const days = Math.max(1, Math.min(90, Number(new URL(request.url).searchParams.get("days")) || 30));
            const data = await getAiCosts({ days });
            return NextResponse.json(data, { status: data.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.ai_costs.failure" });
        }
    });
}
