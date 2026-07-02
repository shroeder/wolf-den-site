import { NextResponse } from "next/server";

import { uploadVendorLogo } from "@/lib/marketplace/logo";
import { getAuthenticatedVendor } from "@/lib/marketplace/vendor-session.js";
import { setVendorLogo } from "@/lib/marketplace/vendors";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Authenticated: a logged-in vendor uploads/replaces their logo from the portal.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/vendor/logo", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        try {
            const form = await request.formData();
            const url = await uploadVendorLogo(form.get("file"));
            const updated = await setVendorLogo(vendor.id, url);
            logger.info("marketplace.vendor.logo_updated", { vendorId: vendor.id });
            return NextResponse.json({ url: updated.logoUrl });
        } catch (error) {
            return NextResponse.json({ error: error.message || "Upload failed." }, { status: 400 });
        }
    });
}

// Remove the vendor's logo.
export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/marketplace/vendor/logo", async ({ logger }) => {
        const vendor = await getAuthenticatedVendor();
        if (!vendor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        await setVendorLogo(vendor.id, null);
        logger.info("marketplace.vendor.logo_removed", { vendorId: vendor.id });
        return NextResponse.json({ ok: true });
    });
}
