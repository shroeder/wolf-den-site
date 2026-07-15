import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { deleteWant, listWantsByEmail } from "@/lib/marketplace/wants.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// The signed-in buyer's want list (account required).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/wants", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const wants = await listWantsByEmail(buyer.email);
            return NextResponse.json({ wants }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.wants.list.failure" });
        }
    });
}

// Remove one of the signed-in buyer's wants.
export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/marketplace/wants", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            if (!body?.id) {
                return NextResponse.json({ error: "id is required." }, { status: 400 });
            }
            const removed = await deleteWant(body.id, buyer.email);
            return NextResponse.json({ ok: removed });
        } catch (error) {
            return internalError(error, { event: "marketplace.wants.delete.failure" });
        }
    });
}
