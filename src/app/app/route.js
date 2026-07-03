import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public download link for the MARKETPLACE app only (wolfdengamingmn.com/app). Marketplace is the
// public buyer/seller app and carries no secrets, so a public download is fine. The owner/staff
// (full/employee) apps carry the shared admin key, so they are NOT downloadable here — they install
// via their in-app self-update / adb, never a public URL.
export async function GET(request) {
    const requested = (new URL(request.url).searchParams.get("channel") || "marketplace").trim();
    if (requested !== "marketplace") {
        return new NextResponse("Not available.", { status: 404 });
    }
    const row = await db.queryOne(
        `SELECT apk_url FROM app_release WHERE channel = 'marketplace' ORDER BY version_code DESC LIMIT 1`
    );
    if (!row?.apk_url) {
        return new NextResponse("No build available.", { status: 404 });
    }
    return NextResponse.redirect(row.apk_url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
