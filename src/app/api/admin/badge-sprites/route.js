import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { generateMissingBadgeSprites, generateBadgeSprite } from "@/lib/marketplace/badge-sprites.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — how many badges have art yet.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/badge-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const row = await db
                .queryOne(
                    `SELECT (SELECT COUNT(*)::int FROM mkt_badge) AS total,
                            (SELECT COUNT(*)::int FROM mkt_badge_sprite) AS done`
                )
                .catch(() => null);
            return noStore({ total: row?.total || 0, done: row?.done || 0, remaining: (row?.total || 0) - (row?.done || 0) });
        } catch (error) {
            return internalError(error, { event: "admin.badge_sprites.status.failure" });
        }
    });
}

// POST — generate badge art. Body: { action:"generate", limit } fills missing ones (a few per call; loop until
// remaining=0), or { action:"one", slug } to (re)generate a single badge.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/badge-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            if (body?.action === "one" && body?.slug) {
                const url = await generateBadgeSprite(String(body.slug));
                return noStore({ ok: Boolean(url), slug: body.slug, url });
            }
            return noStore(await generateMissingBadgeSprites(Number(body?.limit) || 6));
        } catch (error) {
            return internalError(error, { event: "admin.badge_sprites.generate.failure" });
        }
    });
}
