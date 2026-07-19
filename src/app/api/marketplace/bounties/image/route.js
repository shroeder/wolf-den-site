import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { uploadBountyImage } from "@/lib/marketplace/logo";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// A signed-in member uploads an image to attach to a bounty; returns the blob URL.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/bounties/image", async () => {
        const buyer = await getAuthenticatedBuyer().catch(() => null);
        if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        try {
            const form = await request.formData();
            const url = await uploadBountyImage(form.get("file"));
            return NextResponse.json({ url });
        } catch (error) {
            return NextResponse.json({ error: error.message || "Upload failed." }, { status: 400 });
        }
    });
}
