import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getForgeState, salvageItem, combineParts, enhanceItem, buyForgeUpgrade, claimForgeDaily, debugAddParts } from "@/lib/marketplace/crafting.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Forge — OWNER-ONLY in Phase 1. Salvage / combine / enhance gear.
async function requireOwner() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    return buyer && isOwner(buyer.id) ? buyer : null;
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/crafting", async ({ internalError }) => {
        try {
            const buyer = await requireOwner();
            if (!buyer) return NextResponse.json({ error: "forbidden" }, { status: 403 });
            return NextResponse.json(await getForgeState(buyer.id), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "crafting.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/crafting", async ({ internalError }) => {
        try {
            const buyer = await requireOwner();
            if (!buyer) return NextResponse.json({ error: "forbidden" }, { status: 403 });
            const b = await request.json().catch(() => ({}));
            let res = null;
            if (b?.action === "salvage") res = await salvageItem(buyer.id, String(b?.itemId || ""));
            else if (b?.action === "combine") res = await combineParts(buyer.id, Number(b?.tier));
            else if (b?.action === "enhance") res = await enhanceItem(buyer.id, String(b?.itemId || ""), { quality: Number(b?.quality) || 0, grade: String(b?.grade || "good"), combo: Number(b?.combo) || 0 });
            else if (b?.action === "upgrade") res = await buyForgeUpgrade(buyer.id, String(b?.key || ""));
            else if (b?.action === "claim_daily") res = await claimForgeDaily(buyer.id, String(b?.key || ""));
            else if (b?.action === "debug_add_parts") res = await debugAddParts(buyer.id, Number(b?.tier), Number(b?.n) || 10); // ⚠️ TEST-ONLY — remove before launch
            else return NextResponse.json({ error: "bad_action" }, { status: 400 });
            return NextResponse.json(res, { status: res?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "crafting.action.failure" });
        }
    });
}
