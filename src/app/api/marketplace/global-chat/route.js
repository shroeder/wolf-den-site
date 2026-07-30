import { after, NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getGlobalChat, markGlobalChatSeen, sendTownChat } from "@/lib/marketplace/town.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the shared global/plaza chat feed (newest last), each message with its sender's hero sprite + name +
// timestamp. Same stream as the town chat, so a message sent in the plaza shows up here and vice versa.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/global-chat", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const messages = await getGlobalChat(buyer?.id || null, 40);
            // Fetching the feed IS reading it — this endpoint is only called while the chat is on screen. Done
            // after the response so it never delays the render.
            if (buyer) after(() => markGlobalChatSeen(buyer.id));
            return NextResponse.json({ ok: true, authenticated: Boolean(buyer), messages }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.global_chat.list.failure" });
        }
    });
}

// POST { body } — send a message to the shared feed (also pops as a plaza speech bubble if you're in town).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/global-chat", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await sendTownChat(buyer.id, body?.body);
            return NextResponse.json(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.global_chat.send.failure" });
        }
    });
}
