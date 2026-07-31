import { NextResponse } from "next/server";

import { requireAdminAccess, verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";
import { listOverhead, upsertOverhead, deleteOverhead, getConfig, setConfig, listTeamMembers, breakevenSummary } from "@/lib/admin-app/breakeven.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Break-even tracker — admin-key gated. GET returns overhead items + config + Square team roster, and (when
// ?from=&to= are supplied) the cost-side break-even summary for that range. POST is action-based mutation.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/breakeven", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const from = searchParams.get("from") || null;
            const to = searchParams.get("to") || null;
            const [items, config, team] = await Promise.all([listOverhead(), getConfig(), listTeamMembers()]);
            const summary = (from || to) ? await breakevenSummary({ from, to }) : null;
            return NextResponse.json({ items, config, team, summary }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.breakeven.get.failure" });
        }
    });
}

// WRITES ARE NOT FOR EMPLOYEES.
//
// Reading break-even is the whole point of putting it on an employee's phone; changing what the shop's fixed
// costs ARE is not. Gating that in the app was cosmetic — both the admin and employee builds ship the SAME
// shared admin key (AppSecrets.adminApiKey), so as far as this endpoint was concerned they were the same
// caller and any employee device could POST upsert_item / delete_item / set_config.
//
// Two locks, because the honest one isn't available yet:
//   1. `cogs.edit` via requireAdminAccess — the REAL check. It does nothing today (a shared-key request falls
//      through to the legacy path), but it starts enforcing by itself the moment per-user admin sessions land,
//      with no change needed here.
//   2. The build flavour header the app sends. Trivially spoofable by anyone holding the key, so it is not
//      security — it is the lock on the door an employee actually walks through.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/breakeven", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "cogs.edit", logger);
        if (authError) return authError;
        if ((request.headers.get("x-app-flavor") || "").toLowerCase() === "employee") {
            logger.warn("admin.breakeven.write.blocked", { step: "employee_build_write", detail: "Employee build attempted a break-even mutation." });
            return NextResponse.json({ error: "forbidden", detail: "Fixed costs are owner-only." }, { status: 403 });
        }
        try {
            const b = await request.json().catch(() => null);
            if (!b?.action) return NextResponse.json({ error: "action required" }, { status: 400 });
            let ok = true;
            switch (b.action) {
                case "upsert_item": await upsertOverhead(b.item || {}); break;
                case "delete_item": await deleteOverhead(b.id); break;
                case "set_config": await setConfig(b.config || {}); break;
                default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
            }
            const [items, config] = await Promise.all([listOverhead(), getConfig()]);
            return NextResponse.json({ ok, items, config });
        } catch (error) {
            return internalError(error, { event: "admin.breakeven.post.failure" });
        }
    });
}
