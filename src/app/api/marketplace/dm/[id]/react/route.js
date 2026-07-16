import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { reactToMessage } from "@/lib/marketplace/dm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Toggle an emoji reaction on a message. Body: { messageId, emoji }.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/dm/[id]/react", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const result = await reactToMessage(id, buyer.id, String(body?.messageId || ""), String(body?.emoji || ""));
            if (result.error) return noStore({ error: result.error }, { status: result.error === "forbidden" ? 403 : 400 });
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "marketplace.dm.react.failure" });
        }
    });
}
