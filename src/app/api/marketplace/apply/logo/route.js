import { NextResponse } from "next/server";

import { uploadVendorLogo } from "@/lib/marketplace/logo";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public: an applicant (not yet a vendor) uploads a logo while filling out /marketplace/apply.
// Returns the Blob URL, which the apply form submits with the rest of the application. Guarded by
// the type/size limits in uploadVendorLogo.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/apply/logo", async ({ logger }) => {
        try {
            const form = await request.formData();
            const url = await uploadVendorLogo(form.get("file"));
            logger.info("marketplace.apply.logo_uploaded");
            return NextResponse.json({ url });
        } catch (error) {
            return NextResponse.json({ error: error.message || "Upload failed." }, { status: 400 });
        }
    });
}
