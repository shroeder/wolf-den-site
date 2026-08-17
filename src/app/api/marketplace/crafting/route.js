import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getForgeState, salvageItem, combineParts, salvageAllOfRarity, combineAllAtTier, enhanceItem, rerollEnhance, rerollStat, buyForgeUpgrade, claimForgeDaily } from "@/lib/marketplace/crafting.js";
import { reforgeItemElement, enchantItemElement } from "@/lib/marketplace/item-element.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Forge — LIVE for every signed-in member. Salvage / combine / enhance gear.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/crafting", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            return NextResponse.json(await getForgeState(buyer.id), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "crafting.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/crafting", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            let res = null;
            if (b?.action === "salvage") res = await salvageItem(buyer.id, String(b?.itemId || ""));
            else if (b?.action === "combine") res = await combineParts(buyer.id, Number(b?.tier));
            // Bulk. Both loop the single-item paths, so every roll, bonus and daily behaves identically.
            else if (b?.action === "salvage_all") res = await salvageAllOfRarity(buyer.id, String(b?.rarity || ""));
            else if (b?.action === "combine_all") res = await combineAllAtTier(buyer.id, Number(b?.tier));
            else if (b?.action === "reroll") res = await rerollEnhance(buyer.id, String(b?.itemId || ""));
            else if (b?.action === "reroll_stat") res = await rerollStat(buyer.id, String(b?.itemId || ""), String(b?.stat || ""));
            else if (b?.action === "enhance") res = await enhanceItem(buyer.id, String(b?.itemId || ""), { quality: Number(b?.quality) || 0, grade: String(b?.grade || "good"), combo: Number(b?.combo) || 0, useScroll: Boolean(b?.useScroll) });
            else if (b?.action === "enchant_element") { res = await enchantItemElement(buyer.id, String(b?.itemId || ""), String(b?.element || "")); if (res?.ok) res = { ...res, ...(await getForgeState(buyer.id)) }; }
            else if (b?.action === "reforge_element") { res = await reforgeItemElement(buyer.id, String(b?.itemId || ""), String(b?.element || ""), b?.replace ? String(b.replace) : null); if (res?.ok) res = { ...res, ...(await getForgeState(buyer.id)) }; }
            else if (b?.action === "upgrade") res = await buyForgeUpgrade(buyer.id, String(b?.key || ""));
            else if (b?.action === "claim_daily") res = await claimForgeDaily(buyer.id, String(b?.key || ""));
            else return NextResponse.json({ error: "bad_action" }, { status: 400 });
            return NextResponse.json(res, { status: res?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "crafting.action.failure" });
        }
    });
}
