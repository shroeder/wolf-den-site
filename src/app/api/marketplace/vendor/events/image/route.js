import { NextResponse } from "next/server";

import { uploadEventImage } from "@/lib/marketplace/logo";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// A logged-in vendor uploads an event cover image; returns the blob URL to attach on event create.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/events/image", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        try {
            const form = await request.formData();
            const url = await uploadEventImage(form.get("file"));
            logger.info("marketplace.vendor.event_image_uploaded", { vendorId: vendor.id });
            return NextResponse.json({ url });
        } catch (error) {
            return NextResponse.json({ error: error.message || "Upload failed." }, { status: 400 });
        }
    });
}
