import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { fixPetSpriteOrientations, generateMissingPetSprites, generatePetSprite, petSpriteStatus, setPetSpriteFlip, detectPetSpriteFacings, generateMissingPetSpriteLevels, generatePetSpriteLevel, setPetSpriteLevelFlip, detectPetSpriteLevelFacings, petSpriteLevelStatus } from "@/lib/marketplace/pet-sprite.js";
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
            // ?levels=1 → the per-level (Lv2–5) evolution status; default → the base (Lv1) status.
            const wantLevels = new URL(request.url).searchParams.get("levels");
            return noStore(wantLevels ? await petSpriteLevelStatus() : await petSpriteStatus());
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
            // Owner hand-toggles a pet's render flip.
            if (body?.action === "setFlip" && body?.petId) {
                return noStore(await setPetSpriteFlip(String(body.petId), Boolean(body.flip)));
            }
            // AI read-pass: mark left-facing sprites so they render mirrored (a few per call; call until remaining=0).
            if (body?.action === "detectFacing") {
                return noStore(await detectPetSpriteFacings(Number(body?.limit) || 6));
            }
            // ── Per-level (Lv2–5) evolved sprites ──
            if (body?.action === "oneLevel" && body?.petId && body?.level) {
                const url = await generatePetSpriteLevel(String(body.petId), Number(body.level));
                return noStore({ ok: true, petId: body.petId, level: Number(body.level), url });
            }
            if (body?.action === "setLevelFlip" && body?.petId && body?.level) {
                return noStore(await setPetSpriteLevelFlip(String(body.petId), Number(body.level), Boolean(body.flip)));
            }
            if (body?.action === "detectLevelFacing") {
                return noStore(await detectPetSpriteLevelFacings(Number(body?.limit) || 6));
            }
            // Bulk-fill missing Lv2–5 sprites (a few per call; loop until remaining=0).
            if (body?.action === "generateLevels") {
                return noStore(await generateMissingPetSpriteLevels(Number(body?.limit) || 4));
            }
            return noStore(await generateMissingPetSprites(Number(body?.limit) || 4));
        } catch (error) {
            return internalError(error, { event: "admin.pet_sprites.generate.failure" });
        }
    });
}
