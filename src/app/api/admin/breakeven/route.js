import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";
import { listOverhead, upsertOverhead, deleteOverhead, getConfig, setConfig, listTeamMembers, breakevenSummary } from "@/lib/admin-app/breakeven.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Break-even tracker — admin-key gated. GET returns overhead items + config + Square team roster, and (when
// ?from=&to= are supplied) the cost-side break-even summary for that range. POST is action-based mutation.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/breakeven", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const from = searchParams.get("from") || null;
            const to = searchParams.get("to") || null;
            const [items, config, team] = await Promise.all([listOverhead(), getConfig(), listTeamMembers()]);
            const summary = (from || to) ? await breakevenSummary({ from, to }) : null;
            return NextResponse.json({ items, config, team, summary }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.breakeven.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/breakeven", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const b = await request.json().catch(() => null);
            if (!b?.action) return NextResponse.json({ error: "action required" }, { status: 400 });
            let ok = true;
            switch (b.action) {
                case "upsert_item": await upsertOverhead(b.item || {}); break;
                case "delete_item": await deleteOverhead(b.id); break;
                case "set_config": await setConfig(b.config || {}); break;
                default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
            }
            const [items, config] = await Promise.all([listOverhead(), getConfig()]);
            return NextResponse.json({ ok, items, config });
        } catch (error) {
            return internalError(error, { event: "admin.breakeven.post.failure" });
        }
    });
}
