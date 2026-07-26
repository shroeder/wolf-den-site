import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { createTradeClaim, tradeStatsFromLines, tradeXp } from "@/lib/marketplace/trade-claim.js";
import { SITE_URL } from "@/lib/site";
import { createTrade, listTrades } from "@/lib/trades/trades.js";
import { sendAdminPush } from "@/lib/push/send.js";
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
                // On a NEW trade with cards coming in, mint a scan-to-earn claim so the customer can bank
                // XP + trade badges. The app shows its QR. Only for real card trades (cards in > 0).
                let claim = null;
                if (created) {
                    const stats = tradeStatsFromLines(body.lines || [], body.marketTotal);
                    if (stats.cardCount > 0) {
                        const minted = await createTradeClaim({ tradeId: trade.id, ...stats }).catch(() => null);
                        if (minted?.token) {
                            claim = { token: minted.token, url: `${SITE_URL}/marketplace/claim-trade/${minted.token}`, potentialXp: tradeXp(stats), ...stats };
                        }
                    }
                }
                // Notify all admin devices whenever a trade completes at the shop — so you always know (even if a
                // helper's phone recorded it) and can tap through to inspect it. Best-effort; never fails the trade.
                if (created) {
                    const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
                    const cardCount = Number(trade.lines?.filter((l) => l.direction === "IN").reduce((s, l) => s + (Number(l.quantity) || 0), 0)) || 0;
                    const bits = [`${cardCount} card${cardCount === 1 ? "" : "s"} in`];
                    if (trade.creditTotal > 0) bits.push(`${money(trade.creditTotal)} credit`);
                    if (trade.cashTotal > 0) bits.push(`${money(trade.cashTotal)} cash`);
                    if (trade.giftCardTotal > 0) bits.push(`${money(trade.giftCardTotal)} gift card`);
                    if (claim) bits.push("QR reward ready");
                    sendAdminPush({
                        title: "🤝 Trade completed",
                        body: bits.join(" · "),
                        route: "trades",
                        data: { tradeId: String(trade.id), ...(claim ? { claimToken: claim.token } : {}) },
                    }).catch((e) => logger.warn?.("admin.trades.push.failure", { error: e?.message }));
                }
                logger.info("admin.trades.create.success", { tradeId: trade.id, created, claimed: Boolean(claim) });
                return NextResponse.json({ ok: true, trade, created, claim }, { status: created ? 201 : 200 });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "admin.trades.create.failure" });
        }
    });
}
