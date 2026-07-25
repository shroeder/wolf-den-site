import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET /api/admin/store-credit/search?q=<term> — members who HAVE a store-credit balance, name/@alias matching
// the term (blank term → the biggest balances). Powers the "no QR" manual-charge fallback in the app: staff
// find the member, then deduct via /adjust. Anyone with a balance is reachable (not just purchasers), so
// granted/comped credit shows up too. Admin-gated.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/store-credit/search", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const q = String(new URL(request.url).searchParams.get("q") || "").trim().toLowerCase().replace(/^@/, "");
            const params = [];
            let where = "COALESCE(store_credit_cents, 0) > 0 AND alias IS NOT NULL";
            if (q) {
                params.push(`%${q}%`);
                where += ` AND (LOWER(alias) LIKE $${params.length} OR LOWER(COALESCE(display_name, '')) LIKE $${params.length})`;
            }
            const rows = await db
                .query(
                    `SELECT id, alias, display_name, COALESCE(store_credit_cents, 0)::int AS balance_cents
                       FROM mkt_buyer WHERE ${where}
                      ORDER BY store_credit_cents DESC LIMIT 40`,
                    params
                )
                .catch(() => []);
            return noStore({
                members: rows.map((r) => ({
                    id: r.id,
                    name: r.display_name || (r.alias ? `@${r.alias}` : "Member"),
                    alias: r.alias || null,
                    balanceCents: Number(r.balance_cents) || 0,
                })),
            });
        } catch (error) {
            return internalError(error, { event: "admin.store_credit.search.failure" });
        }
    });
}
