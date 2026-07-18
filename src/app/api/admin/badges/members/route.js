import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { backfillBadgeCongrats, listMembersWithBadges } from "@/lib/marketplace/badges.js";
import { getEquippedStatsForMembers } from "@/lib/marketplace/inventory.js";
import { getPetSpriteMap } from "@/lib/marketplace/pet-sprite.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Members + the badges they hold, for browsing/inspecting in the admin app. Admin-gated. `q` searches
// alias, name, or email.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/badges/members", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        try {
            const { searchParams } = new URL(request.url);
            const q = searchParams.get("q") || "";
            const limit = searchParams.get("limit") || 40;
            const offset = searchParams.get("offset") || 0;
            const members = await listMembersWithBadges({ q, limit, offset });
            // Optional gear enrichment (?gear=1) for the "give to a member" hero cards: equipped stat totals,
            // gold, and the member's active pet sprite. Batched, so it stays cheap across the whole roster.
            if (searchParams.get("gear") && members.length) {
                const ids = members.map((m) => m.id);
                const [statsMap, petMap, goldRows] = await Promise.all([
                    getEquippedStatsForMembers(ids).catch(() => new Map()),
                    getPetSpriteMap().catch(() => ({})),
                    db.query(`SELECT id, COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = ANY($1)`, [ids]).catch(() => []),
                ]);
                const goldById = new Map(goldRows.map((r) => [r.id, Number(r.gold) || 0]));
                for (const m of members) {
                    m.stats = statsMap.get(m.id) || {};
                    m.gold = goldById.get(m.id) || 0;
                    m.petSpriteUrl = (m.featuredCollectibleId && petMap[m.featuredCollectibleId]) || null;
                }
            }
            // Auto-send any pending badge-congrats emails (no manual action needed). Best-effort, off-path.
            after(() => backfillBadgeCongrats());
            return NextResponse.json({ members }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.badges.members.failure" });
        }
    });
}
