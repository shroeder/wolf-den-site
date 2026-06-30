import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Latest published Android build. The app calls this on launch and compares versionCode against its
// own BuildConfig.VERSION_CODE to decide whether to offer a self-update. Public: it returns only the
// build's version + an unguessable Blob URL, no secrets.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/app/version", async ({ internalError }) => {
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
