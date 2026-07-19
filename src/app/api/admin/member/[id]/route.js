import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { getMemberMetrics } from "@/lib/marketplace/badges.js";
import { getInventory } from "@/lib/marketplace/inventory.js";
import { getUserBadges } from "@/lib/marketplace/profile.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iso = (d) => (d ? new Date(d).toISOString() : null);

// Full drill-down on ONE member for the admin app: identity, level/gold, boss + engagement stats, their
// gear (equipped + owned), badges, and recent in-store redemptions.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/member/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const row = await db.queryOne(
                `SELECT id, display_name, alias, first_name, last_name, email, COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, created_at, last_seen_at FROM mkt_buyer WHERE id = $1`,
                [id]
            ).catch(() => null);
            if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

            const [metrics, inv, badges, redemptions] = await Promise.all([
                getMemberMetrics(id).catch(() => ({})),
                getInventory(id).catch(() => null),
                getUserBadges(id).catch(() => []),
                db.query(`SELECT reward_label, redeemed_at FROM mkt_item_redemption WHERE buyer_id = $1 ORDER BY redeemed_at DESC LIMIT 12`, [id]).catch(() => []),
            ]);

            const equippedIds = new Set(Object.values(inv?.equipped || {}));
            const gear = (inv?.items || []).map((i) => ({ name: i.name, rarity: i.rarity, slot: i.slot, equipped: equippedIds.has(i.id) }));

            return NextResponse.json({
                profile: {
                    id: row.id,
                    name: row.display_name || row.alias || (row.email ? row.email.split("@")[0] : "Member"),
                    realName: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
                    alias: row.alias || null,
                    email: row.email || null,
                    level: levelForXp(row.xp).level,
                    xp: row.xp,
                    gold: row.gold,
                    createdAt: iso(row.created_at),
                    lastSeenAt: iso(row.last_seen_at),
                },
                boss: { damage: metrics.bossDamage || 0, hits: metrics.bossHits || 0, fought: metrics.bossesFought || 0, won: metrics.bossesWon || 0 },
                activity: { spend: metrics.spend || 0, events: metrics.events || 0, activeDays: metrics.activeDays || 0, friends: metrics.friends || 0, messages: metrics.messages || 0, tenureDays: metrics.tenureDays || 0, eliteItems: metrics.eliteItems || 0 },
                gear,
                badges: (badges || []).map((b) => ({ label: b.label, icon: b.icon })),
                redemptions: (redemptions || []).map((r) => ({ label: r.reward_label, at: iso(r.redeemed_at) })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.member.detail.failure" });
        }
    });
}
