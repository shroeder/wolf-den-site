import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { setTyping } from "@/lib/marketplace/dm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Ping "I'm typing" for a thread (ephemeral). The other side sees it via the thread poll.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/dm/[id]/typing", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const { id } = await params;
            const result = await setTyping(id, buyer.id);
            if (result.error) return noStore({ error: result.error }, { status: result.error === "forbidden" ? 403 : 400 });
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "marketplace.dm.typing.failure" });
        }
    });
}
