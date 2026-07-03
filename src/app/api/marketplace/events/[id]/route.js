import { NextResponse } from "next/server";

import { getEventWithVendors, listEventInventory } from "@/lib/marketplace/events.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public event detail: the event + attending vendors + their combined inventory.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/marketplace/events/[id]", async ({ internalError }) => {
        try {
            const { id } = await params;
            const event = await getEventWithVendors(id);
            if (!event) {
                return NextResponse.json({ error: "not_found" }, { status: 404 });
            }
            const inventory = await listEventInventory(id, {}).catch(() => []);
            return NextResponse.json({ event, inventory }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.event.detail.failure" });
        }
    });
}
