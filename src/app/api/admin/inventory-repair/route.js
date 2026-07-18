import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listOpenRepairs, markRepairResolved, recordInventoryRepair } from "@/lib/inventory-feed/repair.js";
import { applyPhantomFix, listPhantoms } from "@/lib/inventory-feed/phantoms.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the Remediations review data: the failed-decrement queue + the reconciler's phantom candidates.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/inventory-repair", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const [repairs, phantoms] = await Promise.all([listOpenRepairs(), listPhantoms()]);
            return noStore({ repairs, phantoms });
        } catch (error) {
            return internalError(error, { event: "admin.inventory_repair.list.failure" });
        }
    });
}

// POST — record a failed/needed inventory adjustment from the app (a decrement that didn't land), so it's
// never silently lost. Body: { variationId, itemName?, quantity?, fromState?, toState?, source, reference?, error? }
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/inventory-repair", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const b = await request.json().catch(() => ({}));
            const action = String(b?.action || "record");
            // Operator applies a correction: mark the phantom units SOLD in Square (review-gated, destructive).
            if (action === "fix") {
                if (!b?.variationId) return noStore({ error: "missing_variation" }, { status: 400 });
                return noStore(await applyPhantomFix(b.variationId, b.quantity || 1));
            }
            // Dismiss a repair-queue row (false positive / handled elsewhere).
            if (action === "dismiss") {
                if (b?.repairId) await markRepairResolved(b.repairId, "dismissed");
                return noStore({ ok: true });
            }
            if (!b?.source) return noStore({ error: "source_required" }, { status: 400 });
            await recordInventoryRepair({
                variationId: b.variationId || null,
                itemName: b.itemName || null,
                fromState: b.fromState || "IN_STOCK",
                toState: b.toState || "SOLD",
                quantity: b.quantity || 1,
                source: String(b.source),
                reference: b.reference || null,
                error: b.error || null,
            });
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "admin.inventory_repair.record.failure" });
        }
    });
}
