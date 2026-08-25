import { after, NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getGlobalChat, markChannelSeen, markGlobalChatSeen, sendTownChat } from "@/lib/marketplace/town.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the shared global/plaza chat feed (newest last), each message with its sender's hero sprite + name +
// timestamp. Same stream as the town chat, so a message sent in the plaza shows up here and vice versa.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/global-chat", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            // ── WHICH ROOM ──────────────────────────────────────────────────────────────────────────
            // Named in the query string; authorised in getGlobalChat against what the server says the
            // member has earned, never against what the client asked for. An unknown or forbidden room
            // comes back empty rather than as an error, because "this room exists and you may not see
            // it" is itself a thing worth not telling people.
            const channel = new URL(request.url).searchParams.get("channel") || "global";
            const messages = await getGlobalChat(buyer?.id || null, 40, channel);
            // Which rooms this member can see, so the hub knows which tabs to draw. Cheap, and it has to
            // come from the same place the gate does or the tabs and the door disagree.
            let channels = ["global"];
            let role = null;
            if (buyer) {
                const { standingFor, channelsFor } = await import("@/lib/marketplace/roles.js");
                const st = await standingFor(buyer.id).catch(() => null);
                if (st) { channels = channelsFor(buyer.id, st.roles); role = st.chosen; }
            }
            // Fetching the feed IS reading it — this endpoint is only called while the chat is on screen. Done
            // after the response so it never delays the render.
            // Reading a room IS reading it — this endpoint is only called while that tab is on screen. Both
            // marks are stamped for the plaza: the per-room one drives the tab badges, and the old column on
            // mkt_buyer still drives the town's own indicator.
            if (buyer) {
                after(() => markChannelSeen(buyer.id, channel));
                if (channel === "global") after(() => markGlobalChatSeen(buyer.id));
            }
            return NextResponse.json({ ok: true, authenticated: Boolean(buyer), messages, channels, role, channel }, { headers: { "Cache-Control": "no-store" } });
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
            const res = await sendTownChat(buyer.id, body?.body, body?.channel || "global");
            return NextResponse.json(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.global_chat.send.failure" });
        }
    });
}
