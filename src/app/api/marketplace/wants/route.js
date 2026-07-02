import { NextResponse } from "next/server";

import { deleteWant, listWantsByEmail } from "@/lib/marketplace/wants.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// A buyer's want list, by email (accountless — low-sensitivity, just cards they want).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/wants", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const wants = await listWantsByEmail(searchParams.get("email") || "");
            return NextResponse.json({ wants }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.wants.list.failure" });
        }
    });
}

// Remove one want, authorized by the email it was created under.
export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/marketplace/wants", async ({ internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            if (!body?.id || !body?.email) {
                return NextResponse.json({ error: "id and email are required." }, { status: 400 });
            }
            const removed = await deleteWant(body.id, body.email);
            return NextResponse.json({ ok: removed });
        } catch (error) {
            return internalError(error, { event: "marketplace.wants.delete.failure" });
        }
    });
}
