import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { backfillBadgeCongrats, listMembersWithBadges } from "@/lib/marketplace/badges.js";
import { activityCounts } from "@/lib/marketplace/activity.js";
import { getEquippedStatsForMembers } from "@/lib/marketplace/inventory.js";
import { getPetSpriteMap } from "@/lib/marketplace/pet-sprite.js";
import { borderById } from "@/lib/marketplace/borders.js";
import { frameById } from "@/lib/marketplace/frames.js";
import { cosmeticById } from "@/lib/marketplace/avatar-cosmetics.js";
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
                const [statsMap, petMap, rows] = await Promise.all([
                    getEquippedStatsForMembers(ids).catch(() => new Map()),
                    getPetSpriteMap().catch(() => ({})),
                    db.query(`SELECT id, COALESCE(gold, 0) AS gold, equipped_border, equipped_frame, equipped_background, avatar_cosmetics FROM mkt_buyer WHERE id = ANY($1)`, [ids]).catch(() => []),
                ]);
                const byId = new Map(rows.map((r) => [r.id, r]));
                // A displayable cosmetic (id + label + icon), or null for the default "none".
                const meta = (def) => (def && def.id !== "none" ? { id: def.id, label: def.label, icon: def.icon || null } : null);
                for (const m of members) {
                    const r = byId.get(m.id) || {};
                    m.stats = statsMap.get(m.id) || {};
                    m.gold = Number(r.gold) || 0;
                    m.petSpriteUrl = (m.featuredCollectibleId && petMap[m.featuredCollectibleId]) || null;
                    // Equipped cosmetics so the admin can SEE a member's border, card frame, and aura effect.
                    m.border = meta(borderById(r.equipped_border));
                    m.frame = meta(frameById(r.equipped_frame));
                    m.background = r.equipped_background && r.equipped_background !== "none" ? r.equipped_background : null;
                    let cos = r.avatar_cosmetics;
                    if (typeof cos === "string") { try { cos = JSON.parse(cos); } catch { cos = {}; } }
                    m.aura = meta(cosmeticById(cos && typeof cos === "object" ? cos.aura : null));
                }
            }
            // Engagement enrichment (?activity=1): 30-day action count + last-active, for most/least-active sorting.
            if (searchParams.get("activity") && members.length) {
                const counts = await activityCounts(members.map((m) => m.id), 30).catch(() => new Map());
                for (const m of members) {
                    const c = counts.get(m.id);
                    m.activity30d = c?.count || 0;
                    m.lastActiveAt = c?.lastAt ? new Date(c.lastAt).toISOString() : null;
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
