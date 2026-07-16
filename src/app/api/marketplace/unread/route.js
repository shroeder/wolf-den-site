import { after, NextResponse } from "next/server";

import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { unreadDmCount } from "@/lib/marketplace/dm.js";
import { incomingRequestCount } from "@/lib/marketplace/friends.js";
import { unreadCountForBuyer, unreadCountForVendor } from "@/lib/marketplace/messaging.js";
import { markSeen } from "@/lib/marketplace/social-notify.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body) {
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

// Total unread across the unified inbox (friend DMs + buyer/vendor threads) + pending friend requests.
// Drives the nav badge and the notifications bubble. Also stamps presence so we don't email an active
// member.
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/unread", async () => {
        const buyer = await getAuthenticatedBuyer().catch(() => null);
        if (!buyer) return noStore({ authenticated: false, total: 0, requests: 0 });
        after(() => markSeen(buyer.id));
        const vendorId = await getAccountLinkedVendorId(buyer.id).catch(() => null);
        const [dm, buyerUnread, vendorUnread, requests] = await Promise.all([
            unreadDmCount(buyer.id).catch(() => 0),
            unreadCountForBuyer(buyer.id).catch(() => 0),
            vendorId ? unreadCountForVendor(vendorId).catch(() => 0) : Promise.resolve(0),
            incomingRequestCount(buyer.id).catch(() => 0),
        ]);
        return noStore({ authenticated: true, total: (dm || 0) + (buyerUnread || 0) + (vendorUnread || 0), requests: requests || 0 });
    });
}
