import { NextResponse } from "next/server";

import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { listDmThreads } from "@/lib/marketplace/dm.js";
import { listThreadsForBuyer } from "@/lib/marketplace/messaging.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// One inbox for everything: friend DMs + buyer<->vendor conversations (both sides), newest first.
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/inbox", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });

            const vendorId = await getAccountLinkedVendorId(buyer.id);
            // Only threads the member is a PARTY to as a buyer. Shop-inbound threads live in the vendor
            // portal — see the note below.
            const [dms, buyerThreads] = await Promise.all([
                listDmThreads(buyer.id),
                listThreadsForBuyer(buyer.id),
            ]);

            const items = [
                ...dms.map((d) => ({
                    kind: "dm",
                    id: d.id,
                    name: d.counterpart?.displayLabel || "Member",
                    alias: d.counterpart?.alias || null,
                    avatarUrl: d.counterpart?.avatarUrl || null,
                    preview: d.lastPreview,
                    at: d.lastMessageAt,
                    unread: d.unread,
                    href: `/marketplace/dm/${d.id}`,
                    tag: "Friend",
                })),
                ...buyerThreads.map((t) => ({
                    kind: "vendor",
                    id: t.id,
                    name: t.counterpartName,
                    preview: t.lastPreview,
                    at: t.lastMessageAt,
                    unread: t.unread,
                    href: `/marketplace/dm/${t.id}`,
                    tag: "Shop",
                })),
                // Threads where YOU are the vendor are deliberately NOT here. They were, tagged "Your shop", but
                // their href pointed at the portal's messages TAB rather than the conversation — so tapping one
                // navigated away and showed nothing readable, which is a worse outcome than not listing it.
                // They belong in the vendor portal, which is built for them (product context, quote flow,
                // dealer tools) and already pushes a notification when one arrives. Listing them twice, with
                // the copy in Social being the broken one, helped nobody.
            ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

            return noStore({ items, isVendor: Boolean(vendorId) });
        } catch (error) {
            return internalError(error, { event: "marketplace.inbox.failure" });
        }
    });
}
