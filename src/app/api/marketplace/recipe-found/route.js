import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { ackRecipeReveals, pendingRecipeReveals } from "@/lib/marketplace/cooking.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Recipes found but never celebrated. Polled by RecipeFoundWatcher, which is mounted site-wide because a
// recipe can drop from roughly eighteen different places — the field, the sea, a chest, the boss, the forge,
// the tavern — and wiring a modal into each of those screens is what left the reveal unbuilt in the first
// place. Signed out is an empty list, never an error: this runs on every page for everyone.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/recipe-found", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ pending: [] });
            return noStore({ pending: await pendingRecipeReveals(buyer.id) });
        } catch (error) {
            internalError(error);
            return noStore({ pending: [] });
        }
    });
}

// Acknowledge. The client calls this the moment the modal opens rather than when it closes, so a closed tab
// mid-animation costs you the animation and not the record of having seen it.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/recipe-found", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ ok: false }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            return noStore(await ackRecipeReveals(buyer.id, body?.ids));
        } catch (error) {
            internalError(error);
            return noStore({ ok: false }, { status: 500 });
        }
    });
}
