import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { sendBuyerPush } from "@/lib/push/send.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ONE-TIME (idempotent) loyalty backpay for the coin-rate doubling. Every member who ever bought coins gets
// an ADDITIONAL grant equal to what they already received (so their lifetime purchased coins double to match
// the new 200-coins/$1 rate), plus a push thanking them. Guarded by a distinct ledger reason so re-running
// never double-pays. POST { dryRun: true } to preview without granting.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/coin-rate-backpay", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const dryRun = Boolean(body?.dryRun);

            // Coins already granted per member from PAID purchases.
            const purchasers = await db
                .query(`SELECT buyer_id, SUM(coins)::int AS coins, COUNT(*)::int AS n FROM mkt_credit_purchase WHERE status = 'paid' GROUP BY buyer_id HAVING SUM(coins) > 0`)
                .catch(() => []);
            // Anyone already backpaid (idempotency).
            const done = await db.query(`SELECT DISTINCT buyer_id FROM mkt_coin_event WHERE reason = 'rate_doubling_backpay'`).catch(() => []);
            const doneSet = new Set((done || []).map((r) => r.buyer_id));

            const targets = (purchasers || []).filter((p) => !doneSet.has(p.buyer_id));
            let credited = 0;
            let totalCoins = 0;
            let pushed = 0;

            for (const p of targets) {
                const bonus = p.coins; // match what they already got → doubles their lifetime purchased coins
                totalCoins += bonus;
                if (dryRun) continue;
                const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2, updated_at = NOW() WHERE id = $1 RETURNING gold`, [p.buyer_id, bonus]).catch(() => null);
                await logCoin(p.buyer_id, bonus, "rate_doubling_backpay", { balanceAfter: paid?.gold, meta: { originalCoins: bonus, purchases: p.n } }).catch(() => {});
                credited += 1;
                const push = {
                    title: "🪙 Your coins just doubled!",
                    body: `We doubled the coin rate — $10 now gets 2,000 coins. As a thank-you for supporting us early, we matched all your past purchases: ${bonus.toLocaleString()} bonus coins are in your wallet.`,
                    data: { type: "coin_rate_doubling" },
                };
                const [a, b] = await Promise.all([
                    sendBuyerPush(p.buyer_id, { ...push, route: "credit" }).then(() => true).catch(() => false),
                    sendWebPush(p.buyer_id, { ...push, url: "/marketplace/credit", tag: "coin-rate-doubling" }).then(() => true).catch(() => false),
                ]);
                if (a || b) pushed += 1;
            }

            logger.info("coin_rate_backpay.done", { dryRun, targets: targets.length, credited, totalCoins, pushed });
            return NextResponse.json({ ok: true, dryRun, eligible: targets.length, alreadyDone: doneSet.size, credited, totalCoins, pushed }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "coin_rate_backpay.failure" });
        }
    });
}
