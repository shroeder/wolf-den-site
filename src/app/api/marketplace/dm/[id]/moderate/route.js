import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { blockMember, unblockMember, reportMember } from "@/lib/marketplace/dm.js";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// ── THE WAY OUT OF A CONVERSATION ────────────────────────────────────────────────────────────────────────────
// block / unblock / report, all against a thread the caller is actually in. The other member is resolved FROM
// the thread rather than taken from the request body, so this endpoint cannot be used to block or report
// somebody the caller has never spoken to.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/dm/[id]/moderate", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const { id } = await params;
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");

            const t = await db.queryOne(
                `SELECT id, user_a, user_b FROM mkt_dm_thread WHERE id = $1 AND vendor_id IS NULL`, [id]
            ).catch(() => null);
            if (!t || (t.user_a !== buyer.id && t.user_b !== buyer.id)) {
                return noStore({ error: "forbidden" }, { status: 403 });
            }
            const otherId = t.user_a === buyer.id ? t.user_b : t.user_a;

            let result;
            if (action === "block") result = await blockMember(buyer.id, otherId);
            else if (action === "unblock") result = await unblockMember(buyer.id, otherId);
            else if (action === "report") {
                result = await reportMember(buyer.id, {
                    threadId: t.id, messageId: body?.messageId || null,
                    reason: body?.reason || "other", note: body?.note || "",
                });
            } else return noStore({ error: "bad_action" }, { status: 400 });

            if (result?.error) return noStore({ error: result.error }, { status: 400 });
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "marketplace.dm.moderate.failure" });
        }
    });
}
