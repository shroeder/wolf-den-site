import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { createTrade, listTrades } from "@/lib/trades/trades.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trade history for the app's Trade Ledger screen. Admin-key gated (same as the app's other backends).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/trades", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) {
            return authError;
        }

        try {
            const { searchParams } = new URL(request.url);
            const limit = searchParams.get("limit") || undefined;
            const offset = searchParams.get("offset") || undefined;

            const trades = await listTrades({ limit, offset });

            logger.info("admin.trades.list.success", { count: trades.length });

            return NextResponse.json({ trades }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.trades.list.failure" });
        }
    });
}

// Record a completed trade. Idempotent on the trade id, so an app retry never double-posts.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/trades", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) {
            return authError;
        }

        try {
            const body = await request.json().catch(() => null);

            if (!body || !body.id) {
                return NextResponse.json({ error: "A trade id is required." }, { status: 400 });
            }

            try {
                const { trade, created } = await createTrade(body);
                logger.info("admin.trades.create.success", { tradeId: trade.id, created });
                return NextResponse.json({ ok: true, trade, created }, { status: created ? 201 : 200 });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "admin.trades.create.failure" });
        }
    });
}
