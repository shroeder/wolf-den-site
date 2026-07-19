import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { vendorThreadViewer } from "@/lib/marketplace/messaging.js";
import { setTyping } from "@/lib/marketplace/dm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ping that the caller is typing in a vendor thread — written into the shared DM typing table keyed by
// the caller's member id, so the other side (buyer DM UI or vendor portal) sees it.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/threads/[id]/typing", async ({ internalError }) => {
        try {
            const { id } = await params;
            const [buyer, vendor] = await Promise.all([getAuthenticatedBuyer(), getAuthenticatedVendor()]);
            const viewer = await vendorThreadViewer(id, { buyerId: buyer?.id || null, vendorId: vendor?.id || null });
            if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            await setTyping(id, viewer.viewerMemberId);
            return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.thread.typing.failure" });
        }
    });
}
