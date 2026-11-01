import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { arrivePreorder, preorderBoard } from "@/lib/admin-app/preorders.js";
import { setPreorder } from "@/lib/shop-item-rules.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── THE PRE-ORDER BOARD ──────────────────────────────────────────────────────────────────────────────────
// Luke: "a screen in the admin and employee app that's pre-sale items, where either me or Eric can go in
// there and when the items arrive, mark them as arrived."
//
// ⚠️ verifyAdminApiKey, WHICH BOTH FLAVOURS ALREADY CARRY. This screen is for Luke AND Eric, so it must not
// be behind an owner-only check — the employee build bakes the same key and the whole point of the screen is
// that either of them can clear an arrival on the day it lands.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/preorders", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            return noStore(await preorderBoard());
        } catch (error) {
            return internalError(error, { event: "admin_app.preorders.list.failure" });
        }
    });
}

// POST — two verbs.
//   { action: "arrive", variationId }                     mark it landed: rename, clear, email everybody
//   { action: "set", variationId, arrivesOn, itemName }   set or move a date (null arrivesOn ends it)
//
// ⚠️ ARRIVING IS NOT IDEMPOTENT-BY-RETRY, IT IS IDEMPOTENT-BY-LEDGER. A second call returns
// already_arrived rather than re-sending, because the holds were claimed in the same UPDATE that
// returned them. The app can retry a timeout without wondering.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/preorders", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const variationId = String(body?.variationId || "").trim();
            if (!variationId) return noStore({ ok: false, error: "variation_required" }, { status: 400 });

            if (body?.action === "arrive") {
                const r = await arrivePreorder(variationId, { by: body?.by || null });
                logger.info("admin_app.preorders.arrive", {
                    variationId, ok: r.ok, holders: r.holders ?? 0, emailed: r.emailed ?? 0,
                    squareOk: r.square?.ok ?? null,
                });
                return noStore({ ...r, ...(await preorderBoard()) }, { status: r.ok ? 200 : 400 });
            }

            if (body?.action === "set") {
                const r = await setPreorder(variationId, {
                    arrivesOn: body?.arrivesOn || null,
                    itemName: body?.itemName || null,
                    baseName: body?.baseName || null,
                    updatedBy: body?.by || null,
                });
                return noStore({ ...r, ...(await preorderBoard()) }, { status: r.ok ? 200 : 400 });
            }

            return noStore({ ok: false, error: "unknown_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "admin_app.preorders.post.failure" });
        }
    });
}
