import { after, NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { db } from "@/lib/db";
import { sendNewMessageEmail } from "@/lib/marketplace/email.js";
import { getThreadParties, listThreadsForBuyer, listThreadsForVendor, startThread } from "@/lib/marketplace/messaging.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { getBuyOrderById } from "@/lib/marketplace/wants.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://www.wolfdengamingmn.com";

// Nudge the recipient (the side that did NOT send) that they have a new message.
async function nudge(threadId, senderSide, preview) {
    try {
        const p = await getThreadParties(threadId);
        if (!p) return;
        const buyerIsRecipient = senderSide === "vendor";
        const to = buyerIsRecipient ? p.buyer_email : p.vendor_email;
        const fromName = senderSide === "vendor" ? p.vendor_name : p.buyer_name;
        const openUrl = buyerIsRecipient
            ? `${SITE}/marketplace/messages?thread=${threadId}`
            : `${SITE}/marketplace/portal?tab=messages`;
        if (to) await sendNewMessageEmail(to, { fromName: fromName || "A member", preview, openUrl });
    } catch {
        // best-effort
    }
}

// GET /api/marketplace/threads?role=buyer|vendor — the caller's conversations in that role.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/threads", async ({ internalError }) => {
        try {
            const role = new URL(request.url).searchParams.get("role") === "vendor" ? "vendor" : "buyer";
            if (role === "vendor") {
                const vendor = await getAuthenticatedVendor();
                if (!vendor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
                return NextResponse.json({ threads: await listThreadsForVendor(vendor.id) }, { headers: { "Cache-Control": "no-store" } });
            }
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            return NextResponse.json({ threads: await listThreadsForBuyer(buyer.id) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.threads.list.failure" });
        }
    });
}

// POST /api/marketplace/threads — start (or continue) a conversation with a first message.
// Body: { as:"buyer"|"vendor", message, vendorId?, listingId?, buyerId?, buyOrderId?, catalogProductId?, subject? }
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/threads", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const as = body?.as === "vendor" ? "vendor" : "buyer";
            const message = String(body?.message || "").trim();
            if (!message) return NextResponse.json({ error: "A message is required." }, { status: 400 });

            let buyerId = null;
            let vendorId = null;
            let subject = body?.subject || null;
            let listingId = null;
            let catalogProductId = body?.catalogProductId || null;

            if (as === "buyer") {
                const buyer = await getAuthenticatedBuyer();
                if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
                buyerId = buyer.id;
                if (body?.listingId) {
                    const l = await db.queryOne("SELECT id, vendor_id, title, catalog_product_id FROM mkt_listing WHERE id = $1", [body.listingId]);
                    if (l) {
                        vendorId = l.vendor_id;
                        listingId = l.id;
                        subject = subject || l.title;
                        catalogProductId = catalogProductId || (l.catalog_product_id != null ? String(l.catalog_product_id) : null);
                    }
                }
                vendorId = vendorId || body?.vendorId || null;
                if (!vendorId) return NextResponse.json({ error: "A vendor is required." }, { status: 400 });
            } else {
                const vendor = await getAuthenticatedVendor();
                if (!vendor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
                vendorId = vendor.id;
                if (body?.buyOrderId) {
                    const o = await getBuyOrderById(body.buyOrderId);
                    if (o?.buyer_id) {
                        buyerId = o.buyer_id;
                        subject = subject || o.name;
                        catalogProductId = catalogProductId || (o.catalog_product_id != null ? String(o.catalog_product_id) : null);
                    } else if (o && !o.buyer_id) {
                        return NextResponse.json({ error: "That buyer doesn't have an account to message." }, { status: 409 });
                    }
                }
                buyerId = buyerId || body?.buyerId || null;
                if (!buyerId) return NextResponse.json({ error: "A buyer is required." }, { status: 400 });
            }

            const { threadId } = await startThread({ buyerId, vendorId, sender: as, body: message, subject, listingId, catalogProductId });
            logger.info("marketplace.thread.started", { threadId, as });
            after(() => nudge(threadId, as, message));
            return NextResponse.json({ threadId });
        } catch (error) {
            return internalError(error, { event: "marketplace.threads.start.failure" });
        }
    });
}
