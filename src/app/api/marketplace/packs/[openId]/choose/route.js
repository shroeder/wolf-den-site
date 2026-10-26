import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { choosePackOutcome } from "@/lib/marketplace/packs.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Door 6 of 9. Sell it back for credit, or keep it in the vault.
//
// `already_chosen` is a 409 rather than an error the member sees as a failure: the overwhelmingly likely cause
// is a double-tap on a button that pays real money, and the guarded UPDATE in choosePackOutcome is what makes
// the second tap harmless. The client treats it as "the first one worked".
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/marketplace/packs/[openId]/choose", async ({ internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return noStore({ error: "Invalid request origin." }, { status: 403 });
        }
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "Sign in first." }, { status: 401 });
            if (!vaultOpenFor(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            const { openId } = await params;
            const body = await request.json().catch(() => ({}));
            const choice = String(body?.choice || "").trim();

            const result = await choosePackOutcome({ buyerId: buyer.id, openId, choice });
            if (!result.ok) {
                const status = result.error === "already_chosen" ? 409 : 400;
                return noStore({ error: result.error, code: result.error }, { status });
            }
            return noStore(result);
        } catch (error) {
            return internalError(error, { event: "packs.choose.failure" });
        }
    });
}
