import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { collectVaultCards } from "@/lib/marketplace/vault.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── STAFF LOOKING AT SOMEBODY ELSE'S VAULT ──────────────────────────────────────────────────────────────────
// There was no admin view of a member's vault at all, which is how a card could be handed over with nothing
// in the system to mark. GET lists what is still in there; POST hands it over.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/vault/[buyerId]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { buyerId } = await params;
            const buyer = await db.queryOne(
                `SELECT id, display_name, alias, first_name, last_name FROM mkt_buyer WHERE id = $1`, [buyerId]);
            if (!buyer) return NextResponse.json({ error: "No such member." }, { status: 404 });

            const cards = await db.query(
                `SELECT id, card_name, set_name, card_number, condition, image_url, tier,
                        current_value_cents, status, created_at
                   FROM mkt_vault_card
                  WHERE buyer_id = $1 AND status IN ('held', 'on_order')
                  ORDER BY current_value_cents DESC, created_at DESC`,
                [buyerId]);

            return NextResponse.json({
                ok: true,
                member: {
                    id: buyer.id,
                    name: buyer.display_name
                        || [buyer.first_name, buyer.last_name].filter(Boolean).join(" ")
                        || (buyer.alias ? `@${buyer.alias}` : "Member"),
                },
                cards: cards.map((c) => ({
                    id: c.id,
                    name: c.card_name,
                    subtitle: [c.set_name, c.card_number, c.condition].filter(Boolean).join(" · "),
                    imageUrl: c.image_url,
                    tier: c.tier,
                    valueCents: c.current_value_cents,
                    status: c.status,
                })),
                totalCents: cards.reduce((a, c) => a + (c.current_value_cents || 0), 0),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.vault.list.failure" });
        }
    });
}

// Hand cards over. { cardIds: [...] } for a partial hand-over, or { all: true } for the whole vault.
//
// ⚠️ THE SAME collectVaultCards THE QUEUE AND ORDER PATHS USE. A third way to empty a vault would be a third
// place for the status, the timestamp and the member's event row to drift apart -- and this one is operated
// by hand at a counter, which is exactly where a quiet divergence would go unnoticed longest.
export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/vault/[buyerId]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { buyerId } = await params;
            const body = await request.json().catch(() => ({}));
            const cardIds = Array.isArray(body?.cardIds) ? body.cardIds.map(String).filter(Boolean) : null;
            if (!body?.all && !cardIds?.length) {
                return NextResponse.json({ error: "Nothing selected." }, { status: 400 });
            }
            const handed = await collectVaultCards({
                buyerId,
                cardIds: body?.all ? null : cardIds,
                by: String(body?.by || "staff").slice(0, 60),
            });
            logger.info("admin.vault.collected", { buyerId, cards: handed.length, all: Boolean(body?.all) });
            return NextResponse.json({
                ok: true,
                collected: handed.length,
                totalCents: handed.reduce((a, c) => a + (c.current_value_cents || 0), 0),
            });
        } catch (error) {
            return internalError(error, { event: "admin.vault.collect.failure" });
        }
    });
}
