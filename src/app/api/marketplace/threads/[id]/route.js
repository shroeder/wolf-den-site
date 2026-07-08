import { after, NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { sendNewMessageEmail } from "@/lib/marketplace/email.js";
import { getThreadForViewer, getThreadParties, postMessage, threadParticipantSide } from "@/lib/marketplace/messaging.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://www.wolfdengamingmn.com";

async function callerIds() {
    const [buyer, vendor] = await Promise.all([getAuthenticatedBuyer(), getAuthenticatedVendor()]);
    return { buyerId: buyer?.id || null, vendorId: vendor?.id || null };
}

async function nudge(threadId, senderSide, preview) {
    try {
        const p = await getThreadParties(threadId);
        if (!p) return;
        const buyerIsRecipient = senderSide === "vendor";
        const to = buyerIsRecipient ? p.buyer_email : p.vendor_email;
        const fromName = senderSide === "vendor" ? p.vendor_name : p.buyer_name;
        const openUrl = `${SITE}/marketplace/messages?thread=${threadId}`;
        if (to) await sendNewMessageEmail(to, { fromName: fromName || "A member", preview, openUrl });
    } catch {
        // best-effort
    }
}

// GET messages in a thread (and mark read for the viewing side).
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/marketplace/threads/[id]", async ({ internalError }) => {
        try {
            const { id } = await params;
            const ids = await callerIds();
            if (!ids.buyerId && !ids.vendorId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const result = await getThreadForViewer(id, ids);
            if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
            return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.thread.get.failure" });
        }
    });
}

// POST a reply to a thread.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/threads/[id]", async ({ logger, internalError }) => {
        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const message = String(body?.message || "").trim();
            if (!message) return NextResponse.json({ error: "A message is required." }, { status: 400 });

            const ids = await callerIds();
            const participant = await threadParticipantSide(id, ids);
            if (!participant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

            await postMessage({ threadId: id, sender: participant.side, body: message });
            logger.info("marketplace.thread.reply", { threadId: id, side: participant.side });
            after(() => nudge(id, participant.side, message));
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.thread.reply.failure" });
        }
    });
}
