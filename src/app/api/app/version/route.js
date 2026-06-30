import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Latest published Android build. The app calls this on launch and compares versionCode against its
// own BuildConfig.VERSION_CODE to decide whether to self-update. Gated by the same shared admin key
// the app already sends to other admin endpoints, so the (public-CDN) APK URL is only ever handed to
// the app itself — random callers get 401. The APK download itself is a direct, unguessable CDN URL.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/app/version", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) {
            return authError;
        }

        try {
            const row = await db.queryOne(
                `SELECT version_code, version_name, apk_url, notes, size_bytes, created_at
                 FROM app_release
                 ORDER BY version_code DESC
                 LIMIT 1`
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
