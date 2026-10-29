import { NextResponse } from "next/server";

import { getAdminActor, requireAdminAccess } from "@/lib/admin/admin-auth";
import { findNearDuplicates, recordVerdict } from "@/lib/ledger/dupes.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── THE DUPLICATE REVIEW QUEUE ──────────────────────────────────────────────────────────────────────────────
// GET            every unjudged near-match, strongest first, with the reason it was flagged
// POST {a,b,verdict}  record 'duplicate' or 'distinct' — and never ask about that pair again
//
// ⚠️ `ledger.edit`, NOT `ledger.view`. A verdict is a judgement about the books that changes what the reviewer
// after you is shown; reading the queue and deciding it are different rights.
//
// ⚠️ AND NOTHING HERE DELETES A ROW. Recording that two entries are the same money and removing one of them
// are separate acts with very different blast radii — bundling them means a mis-tap on a list silently alters
// a financial record. See the note on recordVerdict.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/ledger/dupes", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "ledger.edit", logger);
        if (authError) return authError;
        try {
            const limit = Number(new URL(request.url).searchParams.get("limit")) || 200;
            const pairs = await findNearDuplicates({ limit });
            return noStore({
                pairs,
                // The headline a reviewer needs before deciding whether to start: how much is actually in
                // doubt, and how much of it is doubt worth having.
                total: pairs.length,
                confident: pairs.filter((p) => p.confidence >= 0.8).length,
                confidentValue: pairs.filter((p) => p.confidence >= 0.8).reduce((s, p) => s + p.amount, 0),
            });
        } catch (error) {
            return internalError(error, { event: "admin.ledger_dupes.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/ledger/dupes", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "ledger.edit", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const actor = await getAdminActor(request).catch(() => null);
            const res = await recordVerdict(
                String(body?.a || ""), String(body?.b || ""), String(body?.verdict || ""),
                { by: actor?.label || null, note: body?.note || null },
            );
            if (!res.ok) return noStore(res, { status: 400 });
            return noStore({ ...res, pairs: await findNearDuplicates({ limit: 200 }) });
        } catch (error) {
            return internalError(error, { event: "admin.ledger_dupes.post.failure" });
        }
    });
}
