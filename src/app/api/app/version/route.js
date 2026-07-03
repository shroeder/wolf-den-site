import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Latest published Android build. The app calls this on launch and compares versionCode against its
// own BuildConfig.VERSION_CODE to decide whether to self-update.
//
// The 'marketplace' channel is a PUBLIC (Play Store) app that carries NO admin key, so its version
// lookup is open. The 'full'/'employee' channels are the owner/staff apps that DO carry the shared
// admin key (they use the proxy), so those stay gated — their key-carrying APK URLs never go public.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/app/version", async ({ logger, internalError }) => {
        const { searchParams } = new URL(request.url);
        const channel = (searchParams.get("channel") || "full").trim();

        if (channel !== "marketplace") {
            const authError = verifyAdminApiKey(request, logger);
            if (authError) {
                return authError;
            }
        }

        try {

            const row = await db.queryOne(
                `SELECT version_code, version_name, apk_url, notes, size_bytes, created_at
                 FROM app_release
                 WHERE channel = $1
                 ORDER BY version_code DESC
                 LIMIT 1`,
                [channel]
            );

            if (!row) {
                return NextResponse.json({ available: false }, { headers: { "Cache-Control": "no-store" } });
            }

            return NextResponse.json(
                {
                    available: true,
                    versionCode: row.version_code,
                    versionName: row.version_name,
                    apkUrl: row.apk_url,
                    notes: row.notes || null,
                    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
                    publishedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
                },
                { headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            return internalError(error, { event: "app.version.failure" });
        }
    });
}
