import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { claimHunt, getHunts } from "@/lib/marketplace/town-hunts.js";
import { gateStateFor } from "@/lib/marketplace/town-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── THE HUNT BOARD'S DOOR ────────────────────────────────────────────────────────────────────────────────────
// GET   ?town=N   today's three hunts for that town, with this member's progress
// POST  { key }   claim a finished one
//
// ⚠️ ITS OWN ROUTE, NOT A FIELD ON THE TOWN STATE. getTownState renders the whole plaza and is among the
// highest-volume requests in the game; folding the board into it would bill three more reads on every town
// load for every member whether or not they ever talk to the quest giver. This is read when the giver is
// TAPPED, which is rare.
//
// ⚠️ THE TOWN FALLS BACK TO WHERE THE GROVE SAYS YOU ARE. Gating is off today, so nobody carries a biome town
// — and without this fallback the hunts would be unreachable by every member who exists, including while we
// are trying to test them. gateStateFor already derives a town from Grove depth for exactly this reason.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/hunts", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ hunts: [] });
            const asked = Number(new URL(request.url).searchParams.get("town")) || 0;
            const town = asked > 0 ? asked : (await gateStateFor(buyer.id).catch(() => null))?.town || 1;
            return noStore({ town, hunts: await getHunts(buyer.id, town) });
        } catch (error) {
            return internalError(error, { event: "marketplace.hunts.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/hunts", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ ok: false, error: "signed_out" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const asked = Number(body?.town) || 0;
            const town = asked > 0 ? asked : (await gateStateFor(buyer.id).catch(() => null))?.town || 1;
            const res = await claimHunt(buyer.id, String(body?.key || ""), town);
            // Re-read from the server rather than patching on the client, so what the board shows after a
            // claim is what the database says.
            return noStore({ ...res, hunts: await getHunts(buyer.id, town) });
        } catch (error) {
            return internalError(error, { event: "marketplace.hunts.claim.failure" });
        }
    });
}
