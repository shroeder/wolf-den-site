import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getDmThread, postDmMessage } from "@/lib/marketplace/dm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Load a DM thread's messages (marks read).
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/marketplace/dm/[id]", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const { id } = await params;
            const thread = await getDmThread(id, buyer.id);
            if (!thread) return noStore({ error: "not_found" }, { status: 404 });
            return noStore({ thread });
        } catch (error) {
            return internalError(error, { event: "marketplace.dm.get.failure" });
        }
    });
}

// Post a message (optionally sharing a product) to a DM thread.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/dm/[id]", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const result = await postDmMessage(id, buyer.id, body?.body, body?.catalogProductId || null);
            if (result.error) return noStore({ error: result.error }, { status: result.error === "forbidden" ? 403 : 400 });
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "marketplace.dm.post.failure" });
        }
    });
}
