import { after, NextResponse } from "next/server";

import { syncEarnedBadgesHourly } from "@/lib/marketplace/badges.js";
import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
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
                // HOURLY, not every call: this endpoint answers "who am I" on every page load, and the sweep
                // behind it was the single biggest reader in the database. Every path that can actually earn
                // a badge still sweeps the instant it happens; this is the net under them. See badges.js.
                after(() => syncEarnedBadgesHourly(account.id));
                // Enrich with the first-class profile (name/alias/avatar/badges) so every surface can
                // show it. Keep displayName for back-compat with existing consumers.
                const profile = await getProfile(account.id);
                // ⚠️ `vault` RIDES THIS REPLY (door 8 of 9, docs/virtual-packs-and-the-card-vault.md §16.2).
                //    SiteHeader needs to know whether to offer the Card Vault in the site menu, and it is
                //    mounted in the ROOT LAYOUT — a second endpoint there bills on every navigation by every
                //    visitor, for ever, which is what check:chrome exists to catch. vaultOpenFor() is a pure
                //    in-process predicate, so this costs nothing but a boolean on a reply already being sent.
                //    And it is the SAME predicate as every other door, so the day VAULT_PUBLIC flips, this
                //    one opens with the rest instead of being the gate somebody forgot.
                const buyer = { ...account, ...(profile || {}), displayName: profile?.displayLabel || account.displayName || null, owner: isOwner(account.id), vault: vaultOpenFor(account.id) };
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
