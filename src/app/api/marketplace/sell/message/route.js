import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getOwnerVendorId, startThread } from "@/lib/marketplace/messaging.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Start (or continue) a direct conversation with The Wolf Den to sell/trade cards. Body: { message }.
// Returns the thread + the URL to open it — a real, tracked conversation, not a form into the void.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/sell/message", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const message = String(body?.message || "").trim();
            if (!message) return noStore({ error: "empty" }, { status: 400 });

            const vendorId = await getOwnerVendorId();
            if (!vendorId) return noStore({ error: "store_unavailable" }, { status: 503 });

            const { threadId } = await startThread({ buyerId: buyer.id, vendorId, sender: "buyer", body: message, subject: "Selling / trading cards" });
            return noStore({ ok: true, threadId, href: `/marketplace/messages?thread=${threadId}` });
        } catch (error) {
            return internalError(error, { event: "marketplace.sell.message.failure" });
        }
    });
}
