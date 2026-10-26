import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { getVault } from "@/lib/marketplace/vault.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Door 7 of 9 (docs/virtual-packs-and-the-card-vault.md §16.2).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/vault", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !vaultOpenFor(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            const [vault, balanceCents] = await Promise.all([
                getVault(buyer.id),
                getStoreCredit(buyer.id),
            ]);
            return noStore({ ...vault, balanceCents });
        } catch (error) {
            return internalError(error, { event: "vault.get.failure" });
        }
    });
}
