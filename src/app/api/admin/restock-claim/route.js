import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { createLoyaltyClaim } from "@/lib/marketplace/loyalty-claim.js";
import { PAYOUT_REWARD_RATE } from "@/lib/marketplace/reward-rates.js";
import { SITE_URL } from "@/lib/site";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Mint a scan-to-earn claim for a completed restock buy, so the seller can bank rewards for the deal.
// Reuses the loyalty-claim machinery (dedupe on a synthetic restock id). Returns { claim: { token, url } }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/restock-claim", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            // Restock is a payout (we're buying from the seller), so reward at the discounted payout rate.
            const amountCents = Math.round(Math.max(0, Number(body.amount) || 0) * 100 * PAYOUT_REWARD_RATE);
            const dedupe = String(body.dedupe || "").trim() || `restock-${Date.now()}`;
            if (amountCents <= 0) return noStore({ error: "missing_amount" }, { status: 400 });
            const paymentRef = `restock-${dedupe}`;
            const minted = await createLoyaltyClaim({ squarePaymentId: paymentRef, awardOrderId: paymentRef, amountCents }).catch(() => null);
            if (!minted?.token) return noStore({ error: "claim_failed" }, { status: 500 });
            return noStore({ claim: { token: minted.token, url: `${SITE_URL}/marketplace/claim/${minted.token}`, amountCents } });
        } catch (error) {
            return internalError(error, { event: "admin.restock_claim.failure" });
        }
    });
}
