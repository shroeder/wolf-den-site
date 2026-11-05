import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { createConsignorItem, listConsignorItems } from "@/lib/admin/consignor-inventory";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── A CONSIGNOR'S ITEMS ──────────────────────────────────────────────────────────────────────────────────
// GET   list everything of theirs on the shelf, with live counts
// POST  add one: { name, description?, priceCents, quantity }
//
// ⚠️ requireAdminAccess WITH THE SAME PERMISSION KEY the rest of the consignor admin uses, so this is open
// to Eric on the employee build exactly as the consignor screens already are. Luke asked for "the admin and
// employee app"; an owner-only check here would have shipped half of that.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/consignors/[id]/inventory", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const r = await listConsignorItems(id);
            return noStore(r, { status: r.ok ? 200 : 404 });
        } catch (error) {
            return internalError(error, { event: "consignor.inventory.list.failure" });
        }
    });
}

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/consignors/[id]/inventory", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "consignors.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const r = await createConsignorItem(id, {
                name: body?.name,
                description: body?.description,
                priceCents: body?.priceCents,
                quantity: body?.quantity,
            });
            return noStore(r, { status: r.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "consignor.inventory.create.failure" });
        }
    });
}
