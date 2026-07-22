import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { listMembersWithBadges } from "@/lib/marketplace/badges.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { borderById } from "@/lib/marketplace/borders.js";
import { frameById } from "@/lib/marketplace/frames.js";
import { cosmeticById } from "@/lib/marketplace/avatar-cosmetics.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — every member who has PURCHASED store credit (a paid mkt_credit_purchase), rendered as the same hero
// cards the Members screen uses, plus purchase aggregates (total bought, # of buys, last buy). Sorted by
// biggest spender. Admin-gated. The drill-in transaction history is a separate endpoint (/history).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/store-credit/buyers", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const agg = await db
                .query(
                    `SELECT buyer_id,
                            COALESCE(SUM(amount_cents), 0)::bigint AS total_cents,
                            COUNT(*)::int AS purchases,
                            MAX(credited_at) AS last_at
                       FROM mkt_credit_purchase
                      WHERE status = 'paid'
                      GROUP BY buyer_id
                      ORDER BY total_cents DESC`
                )
                .catch(() => []);
            if (!agg.length) return noStore({ buyers: [] });

            const ids = agg.map((r) => r.buyer_id);
            const members = await listMembersWithBadges({ filterIds: ids, limit: 200 });

            // Same hero-card enrichment as /api/admin/badges/members so the cards render identically:
            // current balance, active pet sprite, and equipped cosmetics (border/frame/background/aura).
            const [petMap, rows] = await Promise.all([
                getPetSpriteData().catch(() => ({})),
                db.query(`SELECT id, COALESCE(store_credit_cents, 0) AS store_credit_cents, equipped_border, equipped_frame, equipped_background, avatar_cosmetics FROM mkt_buyer WHERE id = ANY($1)`, [ids]).catch(() => []),
            ]);
            const byId = new Map(rows.map((r) => [r.id, r]));
            const meta = (def) => (def && def.id !== "none" ? { id: def.id, label: def.label, icon: def.icon || null } : null);
            for (const m of members) {
                const r = byId.get(m.id) || {};
                m.storeCreditCents = Number(r.store_credit_cents) || 0;
                m.petSpriteUrl = (m.featuredCollectibleId && petMap[m.featuredCollectibleId]?.url) || null;
                m.petSpriteFlip = (m.featuredCollectibleId && petMap[m.featuredCollectibleId]?.flip) || false;
                m.border = meta(borderById(r.equipped_border));
                m.frame = meta(frameById(r.equipped_frame));
                m.background = r.equipped_background && r.equipped_background !== "none" ? r.equipped_background : null;
                let cos = r.avatar_cosmetics;
                if (typeof cos === "string") { try { cos = JSON.parse(cos); } catch { cos = {}; } }
                m.aura = meta(cosmeticById(cos && typeof cos === "object" ? cos.aura : null));
            }

            // Merge in the purchase aggregates, preserving the biggest-spender order.
            const memberById = new Map(members.map((m) => [m.id, m]));
            const buyers = agg
                .map((r) => {
                    const m = memberById.get(r.buyer_id);
                    if (!m) return null;
                    return {
                        ...m,
                        purchasedTotalCents: Number(r.total_cents) || 0,
                        purchaseCount: Number(r.purchases) || 0,
                        lastPurchaseAt: r.last_at ? new Date(r.last_at).toISOString() : null,
                    };
                })
                .filter(Boolean);

            return noStore({ buyers });
        } catch (error) {
            return internalError(error, { event: "admin.store_credit.buyers.failure" });
        }
    });
}
