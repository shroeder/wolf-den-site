import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { fixPetSpriteOrientations, generateMissingPetSprites, generatePetSprite, petSpriteStatus } from "@/lib/marketplace/pet-sprite.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — which pets have a battle sprite yet.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/pet-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore(await petSpriteStatus());
        } catch (error) {
            return internalError(error, { event: "admin.pet_sprites.status.failure" });
        }
    });
}

// POST — generate sprites. Body: { action: "generate", limit } to fill missing ones (a few per call),
// { action: "one", petId } to (re)generate a single pet, or { action: "fixOrientation", limit } to flip
// any existing left-facing sprites to face right WITHOUT regenerating (resumable — call until remaining=0).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/pet-sprites", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            if (body?.action === "one" && body?.petId) {
                const url = await generatePetSprite(String(body.petId));
                return noStore({ ok: true, petId: body.petId, url });
            }
            if (body?.action === "fixOrientation") {
                return noStore(await fixPetSpriteOrientations(Number(body?.limit) || 6));
            }
            return noStore(await generateMissingPetSprites(Number(body?.limit) || 4));
        } catch (error) {
            return internalError(error, { event: "admin.pet_sprites.generate.failure" });
        }
    });
}
