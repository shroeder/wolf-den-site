import { after, NextResponse } from "next/server";

import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { unreadDmCount } from "@/lib/marketplace/dm.js";
import { incomingRequestCount } from "@/lib/marketplace/friends.js";
import { unreadCountForBuyer, unreadCountForVendor } from "@/lib/marketplace/messaging.js";
import { markSeen } from "@/lib/marketplace/social-notify.js";
import { channelUnread } from "@/lib/marketplace/town.js";
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
        const [dm, buyerUnread, vendorUnread, requests, global] = await Promise.all([
            unreadDmCount(buyer.id).catch(() => 0),
            unreadCountForBuyer(buyer.id).catch(() => 0),
            vendorId ? unreadCountForVendor(vendorId).catch(() => 0) : Promise.resolve(0),
            incomingRequestCount(buyer.id).catch(() => 0),
            // ── EVERY ROOM THIS MEMBER CAN SEE ───────────────────────────────────────────────────────
            // Luke: "ensure badges work for each tab, and the global badge on the chat bubble should
            // reflect messages from all unread tabs combined." Which rooms exist for somebody is a fact
            // only the server has, so it is asked here and the counts come back keyed by room — a client
            // that decided its own list could ask for a count of a room it is not in.
            (async () => {
                const { standingFor, channelsFor } = await import("@/lib/marketplace/roles.js");
                const st = await standingFor(buyer.id).catch(() => null);
                const rooms = st ? channelsFor(buyer.id, st.roles) : ["global", "announce"];
                return channelUnread(buyer.id, rooms).catch(() => ({}));
            })(),
        ]);
        // `rooms` is returned SEPARATELY from `total` on purpose. A DM or friend request is addressed to
        // YOU and wants a reply; room chatter is not. Folding them into one number would inflate the badge
        // permanently and train people to ignore the one signal that actually needs them.
        //
        // The bubble's own badge is the sum of every room plus the things addressed to you, because from
        // outside the hub there is one dot and it has to mean "something in here is new" — the split only
        // matters once you are looking at the tabs.
        const roomTotal = Object.values(global || {}).reduce((a, n) => a + (n || 0), 0);
        return noStore({
            authenticated: true,
            total: (dm || 0) + (buyerUnread || 0) + (vendorUnread || 0),
            requests: requests || 0,
            rooms: global || {},
            global: roomTotal,
        });
    });
}
