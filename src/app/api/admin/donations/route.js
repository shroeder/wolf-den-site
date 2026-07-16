import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { createDonation, donationTotals, listDonations } from "@/lib/donations/donations.js";
import { createDonationClaim, donationXp } from "@/lib/marketplace/donation-claim.js";
import { SITE_URL } from "@/lib/site";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Donation history + running total for the admin app's Donations tab. Admin-key gated.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/donations", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const limit = searchParams.get("limit") || undefined;
            const [donations, totals] = await Promise.all([listDonations({ limit }), donationTotals()]);
            return NextResponse.json({ donations, totals }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.donations.list.failure" });
        }
    });
}

// Record a donation and mint its scan-to-earn claim. Body: { id, amount, itemDescription, donorName,
// notes }. Idempotent on the donation id. Returns the donation + claim { token, url, potentialXp }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/donations", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            if (!body || !body.id) return NextResponse.json({ error: "A donation id is required." }, { status: 400 });

            const { donation, created } = await createDonation(body);
            let claim = null;
            if (created && donation.amount > 0) {
                const amountCents = Math.round(donation.amount * 100);
                const minted = await createDonationClaim({ donationId: donation.id, amountCents }).catch(() => null);
                if (minted?.token) {
                    claim = { token: minted.token, url: `${SITE_URL}/marketplace/claim-donation/${minted.token}`, potentialXp: donationXp({ amountCents }), amountCents };
                }
            }
            logger.info("admin.donations.create.success", { donationId: donation.id, created, claimed: Boolean(claim) });
            return NextResponse.json({ ok: true, donation, created, claim }, { status: created ? 201 : 200 });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "admin.donations.create.failure" });
        }
    });
}
