import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { vendorThreadViewer } from "@/lib/marketplace/messaging.js";
import { reactToMessage } from "@/lib/marketplace/dm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Toggle an emoji reaction on a message in a vendor thread. Works for either side; the reaction is stored
// in the shared DM reaction table keyed by the caller's member id, so both sides see it.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/threads/[id]/react", async ({ internalError }) => {
        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const [buyer, vendor] = await Promise.all([getAuthenticatedBuyer(), getAuthenticatedVendor()]);
            const viewer = await vendorThreadViewer(id, { buyerId: buyer?.id || null, vendorId: vendor?.id || null });
            if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const result = await reactToMessage(id, viewer.viewerMemberId, body?.messageId, body?.emoji);
            if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
            return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.thread.react.failure" });
        }
    });
}
