import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import { confirmWatcherEmail } from "@/lib/looking-for/watchers";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/looking-for/confirm", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const token = searchParams.get("token") || "";

            const confirmed = await confirmWatcherEmail(token);
            const redirectTo = new URL("/looking-for", process.env.NEXT_PUBLIC_BASE_URL || SITE_URL);

            redirectTo.searchParams.set("confirmed", confirmed ? "1" : "invalid");

            return NextResponse.redirect(redirectTo);
        } catch (error) {
            return internalError(error, { event: "looking_for.email.confirm.failed" });
        }
    });
}
