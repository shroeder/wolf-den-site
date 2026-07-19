import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { redeemPetPerk } from "@/lib/marketplace/pet-redemption.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — staff redeems a member's real-world pet perk in-store. Body: { buyerId, petId, note }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/pet-perks", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const buyerId = String(body?.buyerId || "").trim();
            const petId = String(body?.petId || "").trim();
            if (!buyerId || !petId) return NextResponse.json({ error: "missing_params" }, { status: 400 });
            const res = await redeemPetPerk(buyerId, petId, { by: "admin", note: body?.note || null });
            return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.pet_perks.redeem.failure" });
        }
    });
}
