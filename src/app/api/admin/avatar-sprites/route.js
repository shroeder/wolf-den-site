import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { DEFAULT_SPRITE_AVATAR_PATH, DEFAULT_SPRITE_PROMPT, generateBuyerSprite, generateDefaultSprite, getDefaultSpriteUrl, listSpritesAdmin, setBuyerSprite, setBuyerSpriteFlip, detectBuyerSpriteFacings, resetSpriteFacingChecks, setDefaultSpriteFromImage } from "@/lib/marketplace/avatar-sprite.js";
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
            return noStore({
                members: await listSpritesAdmin(),
                defaultSpriteUrl: await getDefaultSpriteUrl(),
                defaultSpriteAvatarPath: DEFAULT_SPRITE_AVATAR_PATH,
                defaultSpritePrompt: DEFAULT_SPRITE_PROMPT,
            });
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
            // Default sprite (one shared image for everyone without their own) — no buyerId needed.
            if (action === "setDefaultSprite") {
                if (!body.image) return noStore({ error: "missing_image" }, { status: 400 });
                return noStore({ defaultSpriteUrl: await setDefaultSpriteFromImage(body.image) });
            }
            if (action === "generateDefaultSprite") return noStore({ defaultSpriteUrl: await generateDefaultSprite() });
            // AI read-pass: mark left-facing sprites so they render mirrored (a few per call; call until remaining=0).
            if (action === "detectFacing") return noStore(await detectBuyerSpriteFacings(Number(body?.limit) || 6));
            // Re-audit: clear facing checks so the (improved) detector re-runs. Optional buyerId scopes to one.
            if (action === "recheckFacings") return noStore(await resetSpriteFacingChecks({ buyerId: body?.buyerId ? String(body.buyerId) : null }));
            if (!body.buyerId) return noStore({ error: "missing_buyer" }, { status: 400 });
            // Owner hand-toggles a member's render flip.
            if (action === "setFlip") return noStore(await setBuyerSpriteFlip(String(body.buyerId), Boolean(body.flip)));
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
