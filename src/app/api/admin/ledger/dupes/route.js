import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { recentMerges } from "@/lib/ledger/dupes.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── WHAT THE DEDUPLICATOR HAS BEEN DOING ────────────────────────────────────────────────────────────────────
// Luke: "I dont want to manually resolve this. The ledger is automated."
//
// So this is a window, not a queue. It used to be a review list that waited for somebody to judge two hundred
// pairs; duplicates now resolve themselves from the ids Plaid supplies, and the only thing left worth showing
// is what got merged and which fields it improved.
//
// ⚠️ `ledger.view`, NOT `ledger.edit`. Nothing here changes anything any more — the POST that recorded
// verdicts is gone with the queue that needed it. A read of the books should not require the right to alter
// them.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/ledger/dupes", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "ledger.view", logger);
        if (authError) return authError;
        try {
            const limit = Number(new URL(request.url).searchParams.get("limit")) || 100;
            const merges = await recentMerges({ limit });
            const by = {};
            for (const m of merges) by[m.kind] = (by[m.kind] || 0) + 1;
            return noStore({
                merges,
                // How often each rule fires. `adopted_manual` climbing would mean somebody is hand-entering
                // things the bank sync already covers, which is a workflow problem rather than a bug.
                counts: by,
                total: merges.length,
            });
        } catch (error) {
            return internalError(error, { event: "admin.ledger_dupes.get.failure" });
        }
    });
}
