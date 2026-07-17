import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { generateMissingPetSprites, generatePetSprite, petSpriteStatus } from "@/lib/marketplace/pet-sprite.js";
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

// POST — generate sprites. Body: { action: "generate", limit } to fill missing ones (a few per call), or
// { action: "one", petId } to (re)generate a single pet.
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
            return noStore(await generateMissingPetSprites(Number(body?.limit) || 4));
        } catch (error) {
            return internalError(error, { event: "admin.pet_sprites.generate.failure" });
        }
    });
}
