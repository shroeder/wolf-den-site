import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { generateMissingDecorationSprites, generateDecorationSprite } from "@/lib/marketplace/decoration-sprites.js";
import { DECORATIONS } from "@/lib/marketplace/decorations.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // several AI images per call

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — how many of the 100 decorations have art yet.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/farm-decoration-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const done = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_deco_sprite`).catch(() => null);
            const total = DECORATIONS.length;
            return noStore({ total, done: done?.n || 0, remaining: total - (done?.n || 0) });
        } catch (error) {
            return internalError(error, { event: "admin.deco_sprites.status.failure" });
        }
    });
}

// POST — generate decoration art. Body: { action:"generate", limit } fills missing ones (a handful per call;
// loop until remaining=0), or { action:"one", decoId } to (re)generate a single decoration.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/farm-decoration-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            if (body?.action === "one" && body?.decoId) {
                const url = await generateDecorationSprite(String(body.decoId));
                return noStore({ ok: Boolean(url), decoId: body.decoId, url });
            }
            return noStore(await generateMissingDecorationSprites(Number(body?.limit) || 6));
        } catch (error) {
            return internalError(error, { event: "admin.deco_sprites.generate.failure" });
        }
    });
}
