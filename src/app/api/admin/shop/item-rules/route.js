import { NextResponse } from "next/server";

import { requireAdminAccess, getAdminActor } from "@/lib/admin/admin-auth";
import { listItemRules, setItemRule, startNewRun, releaseByEmail, listRunClaims } from "@/lib/shop-item-rules.js";
import { searchSellableVariations } from "@/lib/shop-item-search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init) => {
    const res = NextResponse.json(body, init);
    res.headers.set("Cache-Control", "no-store");
    return res;
};

// ── SELLING RULES, FROM THE APP ──────────────────────────────────────────────────────────────────────────────
// Luke: "I need some kind of system that I can, in my admin and employee app, I can mark items as like in-store
// pickup only."
//
// ⚠️ GATED ON "shop.rules", WHICH BOTH THE OWNER AND STAFF HOLD. Luke asked for employees to be able to set
// these — they are the ones unpacking a distribution box and they know what arrived. It is a real permission
// rather than an owner check so one person can still have it taken away without taking it from everybody.
const PERMISSION = "shop.rules";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/shop/item-rules", async ({ internalError, logger }) => {
        try {
            const denied = await requireAdminAccess(request, PERMISSION, logger);
            if (denied) return denied;

            // ?q= searches the catalogue so a product can be found by name; no q just lists what is already
            // ruled, which is the screen's resting state.
            const q = String(new URL(request.url).searchParams.get("q") || "").trim();
            if (q) {
                return noStore({ ok: true, mode: "search", results: await searchSellableVariations(q) });
            }
            return noStore({ ok: true, mode: "list", rules: await listItemRules() });
        } catch (error) {
            return internalError(error, { event: "shop.item_rules.read.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/shop/item-rules", async ({ internalError, logger }) => {
        try {
            const denied = await requireAdminAccess(request, PERMISSION, logger);
            if (denied) return denied;

            const body = await request.json().catch(() => ({}));
            const variationId = String(body?.variationId || "").trim();
            if (!variationId) return noStore({ ok: false, error: "variationId required" }, { status: 400 });

            const actor = (await getAdminActor(request).catch(() => null))?.email || "admin";

            // A new run is its own action, never a side effect of editing the limit — fixing a typo mid-drop
            // must not hand a second box to everybody who already has one.
            if (body?.action === "newRun") {
                const out = await startNewRun(variationId, actor);
                logger.info("shop.item_rules.new_run", { variationId, actor, ok: out.ok });
                return noStore(out, { status: out.ok ? 200 : 400 });
            }

            // Letting one blocked person through. The refusal message tells the customer to ring the shop,
            // so somebody behind the counter has to be able to act on that call.
            if (body?.action === "release") {
                const out = await releaseByEmail(variationId, body?.email);
                logger.info("shop.item_rules.release", { variationId, actor, freed: out.freed ?? 0 });
                return noStore(out, { status: out.ok ? 200 : 400 });
            }

            if (body?.action === "claims") {
                return noStore({ ok: true, claims: await listRunClaims(variationId) });
            }

            const out = await setItemRule(variationId, {
                pickupOnly: body?.pickupOnly === true,
                limitPerCustomer: body?.limitPerCustomer,
                itemName: body?.itemName || null,
                note: body?.note || null,
            }, actor);

            logger.info("shop.item_rules.set", {
                variationId, actor, pickupOnly: body?.pickupOnly === true,
                limitPerCustomer: body?.limitPerCustomer ?? null, ok: out.ok,
            });
            return noStore(out, { status: out.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "shop.item_rules.write.failure" });
        }
    });
}
