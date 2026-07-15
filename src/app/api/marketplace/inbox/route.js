import { NextResponse } from "next/server";

import { getAccountLinkedVendorId, getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { listDmThreads } from "@/lib/marketplace/dm.js";
import { listThreadsForBuyer, listThreadsForVendor } from "@/lib/marketplace/messaging.js";
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
            const [dms, buyerThreads, vendorThreads] = await Promise.all([
                listDmThreads(buyer.id),
                listThreadsForBuyer(buyer.id),
                vendorId ? listThreadsForVendor(vendorId) : Promise.resolve([]),
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
                    href: `/marketplace/messages?thread=${t.id}`,
                    tag: "Shop",
                })),
                ...vendorThreads.map((t) => ({
                    kind: "vendor",
                    id: t.id,
                    name: t.counterpartName,
                    preview: t.lastPreview,
                    at: t.lastMessageAt,
                    unread: t.unread,
                    href: "/marketplace/portal?tab=messages",
                    tag: "Your shop",
                })),
            ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

            return noStore({ items, isVendor: Boolean(vendorId) });
        } catch (error) {
            return internalError(error, { event: "marketplace.inbox.failure" });
        }
    });
}
