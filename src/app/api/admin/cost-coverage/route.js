import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { squareFetch } from "@/lib/consignment/square";
import { resolveUnitCostAttributeKey } from "@/lib/cogs/cost-sync";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── HOW MUCH OF THE SHELF ACTUALLY HAS A COST ────────────────────────────────────────────────────────────
// Luke: "you're saying 37% of the inventory has a unit cost that we set with that custom attribute — is that
// right? So of the remaining 63%, how many of those items actually have a quantity?"
//
// ⚠️ THE FIRST ANSWER I GAVE HIM WAS TO THE WRONG QUESTION. Counting rows in wolfden_item_cost measures our
// MIRROR of the cost, not the cost itself: the number the reports actually read is the `wolfden_unit_cost`
// custom attribute on the Square variation, and an item can carry that attribute with no row on our side —
// which is exactly what happens when storeUnitCosts fails (it swallows the error and logs) while the Square
// write went through. So a low table count proves nothing about the shelf.
//
// This counts the thing itself. One walk of the catalog, reading each variation's attribute, joined against
// what is actually in stock and against our own table — so the three numbers can be compared:
//
//   · attribute present  — the report will use it, and it is a cost somebody entered
//   · table only         — we know the cost; Square does not. Reports fall back for these
//   · neither            — the report is guessing (65% of list), and this is the real gap
//
// Read-only, admin-gated, and slow by nature (a page per 100 objects), which is why it is a button and not a
// dashboard tile.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/cost-coverage", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const attributeKey = await resolveUnitCostAttributeKey();
            if (!attributeKey) {
                return NextResponse.json({ error: "No wolfden_unit_cost attribute definition in this Square account." }, { status: 500 });
            }

            // What we hold, and what is on the shelf — both cheap, both from our own tables.
            const ours = new Map();
            for (const row of await db.query(
                `SELECT variation_id, unit_cost_cents, source FROM wolfden_item_cost WHERE unit_cost_cents > 0`,
            )) ours.set(row.variation_id, row);
            const stock = new Map();
            for (const row of await db.query(
                `SELECT variation_id, name, quantity, price FROM inventory_feed`,
            )) stock.set(row.variation_id, row);

            // ⚠️ include_deleted_objects IS DELIBERATE ELSEWHERE AND WRONG HERE. This question is about the
            // shelf as it stands, not about history, so a deleted variation is simply not part of it.
            const counts = {
                variations: 0,
                withAttribute: 0, withTableOnly: 0, withNeither: 0,
                inStock: { variations: 0, withAttribute: 0, withTableOnly: 0, withNeither: 0, units: 0, unitsUncosted: 0, retailUncosted: 0 },
            };
            const worst = [];

            let cursor = null;
            do {
                const params = new URLSearchParams({ types: "ITEM_VARIATION", limit: "200" });
                if (cursor) params.set("cursor", cursor);
                const page = await squareFetch(`/v2/catalog/list?${params.toString()}`);
                cursor = page?.cursor || null;
                for (const object of page?.objects || []) {
                    if (object?.type !== "ITEM_VARIATION" || object?.is_deleted) continue;
                    const id = object.id;
                    const attr = object.custom_attribute_values?.[attributeKey]
                        ?? Object.values(object.custom_attribute_values || {}).find((v) => v?.key === attributeKey);
                    const attrCents = Math.round(Number(attr?.number_value || 0) * 100);
                    const hasAttr = attrCents > 0;
                    const hasTable = (Number(ours.get(id)?.unit_cost_cents) || 0) > 0;
                    const onHand = Number(stock.get(id)?.quantity) || 0;

                    counts.variations += 1;
                    if (hasAttr) counts.withAttribute += 1;
                    else if (hasTable) counts.withTableOnly += 1;
                    else counts.withNeither += 1;

                    if (onHand > 0) {
                        const s = counts.inStock;
                        s.variations += 1;
                        s.units += onHand;
                        if (hasAttr) s.withAttribute += 1;
                        else if (hasTable) s.withTableOnly += 1;
                        else {
                            s.withNeither += 1;
                            s.unitsUncosted += onHand;
                            const retail = onHand * (Number(stock.get(id)?.price) || 0);
                            s.retailUncosted += retail;
                            // The biggest exposures, so the answer comes with a place to start.
                            worst.push({ id, name: stock.get(id)?.name || null, units: onHand, retail: Math.round(retail) });
                        }
                    }
                }
            } while (cursor);

            counts.inStock.retailUncosted = Math.round(counts.inStock.retailUncosted);
            worst.sort((a, b) => b.retail - a.retail);
            return NextResponse.json({ ...counts, worstUncosted: worst.slice(0, 25) }, {
                headers: { "Cache-Control": "no-store" },
            });
        } catch (error) {
            return internalError(error, { event: "admin.cost_coverage.failure" });
        }
    });
}
