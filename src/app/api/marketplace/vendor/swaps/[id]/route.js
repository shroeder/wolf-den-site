import { NextResponse } from "next/server";

import { respondToSwap } from "@/lib/marketplace/swaps.js";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Respond to a swap: accept/decline (recipient) or withdraw (proposer).
export async function PATCH(request, { params }) {
    return withRequestLogging(request, "PATCH /api/marketplace/vendor/swaps/[id]", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const action = body?.action;
        if (!["accept", "decline", "withdraw"].includes(action)) {
            return NextResponse.json({ error: "Invalid action." }, { status: 400 });
        }
        try {
            const status = await respondToSwap(id, vendor.id, action);
            logger.info("marketplace.swap.api_responded", { vendorId: vendor.id, swapId: id, status });
            return NextResponse.json({ ok: true, status });
        } catch (validationError) {
            return NextResponse.json({ error: validationError.message }, { status: 400 });
        }
    });
}
