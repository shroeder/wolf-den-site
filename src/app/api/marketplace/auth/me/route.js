import { after, NextResponse } from "next/server";

import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { awardXp, claimPendingPurchases, dailyKey } from "@/lib/marketplace/xp.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { getVendorById } from "@/lib/marketplace/vendors.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Resolve the current app session to an identity + derived role (one account; seller if it has a
// linked active vendor profile, otherwise buyer).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/auth/me", async ({ internalError }) => {
        try {
            const account = await getAuthenticatedBuyer();
            if (account) {
                // Daily-active XP: first app open of the day (dedupe key = once per day). Best-effort.
                after(() => awardXp(account.id, "daily_active", { dedupeKey: dailyKey("daily_active", account.id) }));
                // Safety net: redeem any purchases parked for this email before signup (deduped, so a
                // no-op once claimed). Covers races where a pending row lands after account creation.
                after(() => claimPendingPurchases(account.id, account.email));
                // Grant any unlockable badges the member now qualifies for (level, spend, tenure, …).
                after(() => syncEarnedBadges(account.id));
                // Enrich with the first-class profile (name/alias/avatar/badges) so every surface can
                // show it. Keep displayName for back-compat with existing consumers.
                const profile = await getProfile(account.id);
                const buyer = { ...account, ...(profile || {}), displayName: profile?.displayLabel || account.displayName || null };
                const vendorId = await getAccountLinkedVendorId(account.id);
                if (vendorId) {
                    const vendor = await getVendorById(vendorId);
                    return NextResponse.json(
                        {
                            role: "vendor",
                            account,
                            buyer,
                            vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email },
                        },
                        { headers: { "Cache-Control": "no-store" } }
                    );
                }
                return NextResponse.json({ role: "buyer", buyer }, { headers: { "Cache-Control": "no-store" } });
            }

            // Legacy vendor session (web cookie / old vendor-login token).
            const vendor = await getAuthenticatedVendor();
            if (vendor) {
                return NextResponse.json(
                    { role: "vendor", vendor: { id: vendor.id, displayName: vendor.displayName, email: vendor.email } },
                    { headers: { "Cache-Control": "no-store" } }
                );
            }
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        } catch (error) {
            return internalError(error, { event: "marketplace.auth.me.failure" });
        }
    });
}
