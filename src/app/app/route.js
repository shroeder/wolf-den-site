import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stable, human-typeable download link for the Android apps: wolfdengamingmn.com/app always 302s to
// the latest published APK for a channel (default full; ?channel=marketplace / employee for the
// others). Lets the phone's browser handle the big download (resumable/retried) instead of the
// in-app one-shot updater, which is the reliable way to (re)install. The APK URL is already public.
export async function GET(request) {
    const channel = (new URL(request.url).searchParams.get("channel") || "full").trim();
    const row = await db.queryOne(
        `SELECT apk_url FROM app_release WHERE channel = $1 ORDER BY version_code DESC LIMIT 1`,
        [channel]
    );
    if (!row?.apk_url) {
        return new NextResponse(`No build available for channel "${channel}".`, { status: 404 });
    }
    return NextResponse.redirect(row.apk_url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
