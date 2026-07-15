import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";
import { attachWatcherAccount, disableWatcherAlerts, getOrCreateWatcher } from "@/lib/looking-for/watchers";

export const runtime = "nodejs";

// Turn on restock alerts for this device's wishlist. Requires a marketplace account — the alerts go to
// the account's (already-verified) email, so there's no separate confirmation step.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/looking-for/email", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) {
                return NextResponse.json({ error: "Sign in to turn on alerts." }, { status: 401 });
            }

            const cookieStore = await cookies();
            const watcher = await getOrCreateWatcher(cookieStore);
            await attachWatcherAccount(watcher.id, buyer);

            return NextResponse.json({
                success: true,
                email: buyer.email,
                emailVerified: true,
                message: "Alerts are on.",
            });
        } catch (error) {
            return internalError(error, { event: "looking_for.email.attach.failed" });
        }
    });
}

// Turn OFF restock alerts for the signed-in member (account-wide). Keeps the wishlist.
export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/looking-for/email", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) {
                return NextResponse.json({ error: "Sign in to manage alerts." }, { status: 401 });
            }
            const cookieStore = await cookies();
            const watcher = await getOrCreateWatcher(cookieStore);
            await disableWatcherAlerts(watcher.id, buyer.id);
            return NextResponse.json({ success: true, emailVerified: false });
        } catch (error) {
            return internalError(error, { event: "looking_for.email.disable.failed" });
        }
    });
}
