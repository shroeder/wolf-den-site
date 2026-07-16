import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { backfillMissingAvatars, countMissingAvatars, generateBuyerSprite, listSpritesAdmin, setBuyerSprite } from "@/lib/marketplace/avatar-sprite.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// List members + their avatar-sprite status for the admin preview screen.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/avatar-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore({ members: await listSpritesAdmin(), missingCount: await countMissingAvatars() });
        } catch (error) {
            return internalError(error, { event: "admin.sprites.list.failure" });
        }
    });
}

// setSprite = phone uploads a finished PNG (base64). generate = server-side draw (web fallback).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/avatar-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            if (action === "backfillAvatars") return noStore(await backfillMissingAvatars());
            if (!body.buyerId) return noStore({ error: "missing_buyer" }, { status: 400 });
            if (action === "setSprite") {
                if (!body.image) return noStore({ error: "missing_image" }, { status: 400 });
                return noStore({ spriteUrl: await setBuyerSprite(body.buyerId, body.image) });
            }
            if (action === "generate") return noStore({ spriteUrl: await generateBuyerSprite(body.buyerId) });
            return noStore({ error: "unknown_action" }, { status: 400 });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) return noStore({ error: error.message }, { status: 400 });
            return internalError(error, { event: "admin.sprites.action.failure" });
        }
    });
}
