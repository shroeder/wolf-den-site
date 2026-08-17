import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { enqueueCostSync } from "@/lib/cogs/cost-sync.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// OUR OWN COPY OF WHAT WE PAID.
//
// The ledger's unit costs lived only in Square, on the catalog variation, read live whenever a report was
// drawn. That made the catalog the ledger's memory — and when intake began DELETING sold-out items instead of
// archiving them, every historical sale of a deleted item reported $0.00 cost and 100% profit going back
// months. Square soft-deletes, so those costs were recoverable once (scripts/capture-item-costs.mjs), and
// they now live in wolfden_item_cost where nothing done to the catalog can reach them.
//
// The app asks here LAST — Square is still the live source for anything currently on the shelf. This is the
// answer to "the catalog no longer knows, but we do".

// GET ?ids=a,b,c → { costs: { variationId: unitCostCents } }. Unknown ids are simply absent.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/item-costs", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);
        if (authError) return authError;
        try {
            const raw = new URL(request.url).searchParams.get("ids") || "";
            const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
            if (!ids.length) return noStore({ costs: {} });
            const rows = await db.query(
                `SELECT variation_id, unit_cost_cents, source FROM wolfden_item_cost WHERE variation_id = ANY($1)`,
                [ids]
            ).catch(() => []);
            const costs = {};
            const sources = {};
            for (const r of rows || []) { costs[r.variation_id] = Number(r.unit_cost_cents) || 0; sources[r.variation_id] = r.source; }
            return noStore({ costs, sources });
        } catch (error) {
            return internalError(error, { event: "admin.item_costs.get.failure" });
        }
    });
}

// POST { costs: [{ variationId, unitCostCents, source?, itemName?, sku? }] } — record what we paid, so the
// next catalog delete cannot take it with it. Called whenever the app writes a cost to Square.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/item-costs", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "cogs.edit", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const list = Array.isArray(body?.costs) ? body.costs.slice(0, 500) : [];
            let n = 0;
            const failures = [];
            for (const c of list) {
                const id = String(c?.variationId || "").trim();
                const cents = Math.round(Number(c?.unitCostCents) || 0);
                if (!id || cents <= 0) continue;
                try {
                    await db.query(
                        `INSERT INTO wolfden_item_cost (variation_id, unit_cost_cents, source, item_name, sku)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (variation_id) DO UPDATE
                            SET unit_cost_cents = EXCLUDED.unit_cost_cents,
                                source          = EXCLUDED.source,
                                item_name       = COALESCE(EXCLUDED.item_name, wolfden_item_cost.item_name),
                                sku             = COALESCE(EXCLUDED.sku, wolfden_item_cost.sku),
                                updated_at      = NOW()`,
                        [id, cents, String(c?.source || "app").slice(0, 40), c?.itemName || null, c?.sku || null]
                    );
                    n += 1;
                } catch (writeError) {
                    // This used to be `.catch(() => {})` and then counted the row as saved anyway. A swallowed
                    // write that reports success is the same failure mode this endpoint exists to fix.
                    failures.push({ variationId: id, error: String(writeError?.message || writeError).slice(0, 200) });
                    logger.error("admin.item_costs.row.failed", writeError, { variationId: id });
                }
            }

            // The cost is now OURS. Queue it for Square as well, so the catalog — and Square's own COGS
            // reporting — stops depending on a fire-and-forget write nobody checks. Best-effort by design:
            // the durable copy above is already saved, and an unreachable queue must not fail the restock.
            let queued = 0;
            try {
                ({ queued } = await enqueueCostSync(list));
            } catch (queueError) {
                logger.error("admin.item_costs.enqueue.failed", queueError, { count: list.length });
            }

            return noStore({ ok: true, saved: n, queued, ...(failures.length ? { failed: failures } : {}) });
        } catch (error) {
            return internalError(error, { event: "admin.item_costs.post.failure" });
        }
    });
}
