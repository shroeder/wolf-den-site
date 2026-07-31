import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { claimBossPrize } from "@/lib/marketplace/boss-admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PRIZES WAITING AT THE COUNTER.
//
// Handing a boss prize to the person who won it is a counter job — whoever is working takes the box off the
// shelf and gives it to them. That's the ONLY thing this endpoint does, which is why it exists at all rather
// than opening the full boss admin (art generation, HP, giveaways, deletion) to the employee build.
//
// It reads `reports.view` rather than `marketplace.manage`, so a staff role can be granted the counter task
// without also being handed the boss editor.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/prize-handouts", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);
        if (authError) return authError;
        try {
            const rows = await db.query(
                `SELECT be.id, be.name, be.prize_name, be.prize_image_url, be.winner_tickets,
                        be.defeated_at, be.winner_drawn_at, be.prize_claimed_at,
                        b.display_name, b.alias, b.email, b.phone, b.avatar_sprite_url
                   FROM boss_event be
                   JOIN mkt_buyer b ON b.id = be.winner_buyer_id
                  WHERE be.prize_name IS NOT NULL
                    AND be.winner_buyer_id IS NOT NULL
                  ORDER BY (be.prize_claimed_at IS NULL) DESC, be.winner_drawn_at DESC NULLS LAST
                  LIMIT 30`
            ).catch(() => []);
            const prizes = rows.map((r) => ({
                bossId: r.id,
                boss: r.name,
                prize: r.prize_name,
                prizeImage: r.prize_image_url || null,
                tickets: Number(r.winner_tickets) || 0,
                wonAt: r.winner_drawn_at || r.defeated_at || null,
                claimedAt: r.prize_claimed_at || null,
                winner: {
                    name: r.display_name || r.alias || "Member",
                    alias: r.alias || null,
                    // Contact details so whoever is on the counter can actually reach them if they haven't
                    // been in — the whole point of the list is prizes that are still sitting on the shelf.
                    email: r.email || null,
                    phone: r.phone || null,
                    spriteUrl: r.avatar_sprite_url || null,
                },
            }));
            return NextResponse.json({
                pending: prizes.filter((p) => !p.claimedAt),
                recent: prizes.filter((p) => p.claimedAt).slice(0, 10),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.prize_handouts.get.failure" });
        }
    });
}

// { bossId } — mark it handed over. Deliberately the only action.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/prize-handouts", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "reports.view", logger);
        if (authError) return authError;
        try {
            const b = await request.json().catch(() => ({}));
            if (!b?.bossId) return NextResponse.json({ error: "bossId required" }, { status: 400 });
            await claimBossPrize(b.bossId);
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "admin.prize_handouts.post.failure" });
        }
    });
}
