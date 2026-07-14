import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { uploadAvatar } from "@/lib/marketplace/logo.js";
import { setAvatar } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Upload / replace the signed-in user's avatar.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/profile/avatar", async ({ logger }) => {
        const buyer = await getAuthenticatedBuyer();
        if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        try {
            const form = await request.formData();
            const url = await uploadAvatar(form.get("file"));
            const profile = await setAvatar(buyer.id, url);
            logger.info("marketplace.profile.avatar_updated", { buyerId: buyer.id });
            return NextResponse.json({ profile });
        } catch (error) {
            return NextResponse.json({ error: error.message || "Upload failed." }, { status: 400 });
        }
    });
}

// Remove the avatar.
export async function DELETE() {
    return withRequestLogging(null, "DELETE /api/marketplace/profile/avatar", async ({ logger }) => {
        const buyer = await getAuthenticatedBuyer();
        if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        const profile = await setAvatar(buyer.id, null);
        logger.info("marketplace.profile.avatar_removed", { buyerId: buyer.id });
        return NextResponse.json({ profile });
    });
}
