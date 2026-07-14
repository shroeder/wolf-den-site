import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { aliasFormatError, isAliasAvailable } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live handle availability for the signup/edit forms. { available, reason }.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/profile/alias-available", async ({ internalError }) => {
        try {
            const alias = new URL(request.url).searchParams.get("alias") || "";
            const formatError = aliasFormatError(alias);
            if (formatError) {
                return NextResponse.json({ available: false, reason: formatError }, { headers: { "Cache-Control": "no-store" } });
            }
            // Ignore the caller's own current handle when they're editing.
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const available = await isAliasAvailable(alias, buyer?.id || null);
            return NextResponse.json(
                { available, reason: available ? null : "That handle is taken." },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "marketplace.profile.alias.failure" });
        }
    });
}
