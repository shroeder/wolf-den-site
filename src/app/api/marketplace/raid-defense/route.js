import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getUnseenRaidDefenses } from "@/lib/marketplace/sailing.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A canned report so the owner can preview the modal on demand (it normally only appears after a real raid).
const PREVIEW_REPORT = {
    preview: true,
    totalWins: 5,
    totalGold: 1240,
    defenses: [
        { attacker: { name: "Nynebreaker", level: 14, avatarUrl: null, avatarFlip: false }, count: 3, gold: 820, gear: [{ name: "Rune Blade", rarity: "epic" }] },
        { attacker: { name: "Ironhowl", level: 9, avatarUrl: null, avatarFlip: false }, count: 2, gold: 420, gear: [] },
    ],
};

// The "you got raided (and won)" welcome-back report. Fetching it marks the entries seen, so it pops once.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/raid-defense", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ defenses: [], totalGold: 0, totalWins: 0 }, { headers: { "Cache-Control": "no-store" } });
            // Owner-only preview: return sample data WITHOUT marking anything seen, so the modal can be debugged.
            const { searchParams } = new URL(request.url);
            if (searchParams.get("preview") === "1") {
                if (!isOwner(buyer.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
                return NextResponse.json(PREVIEW_REPORT, { headers: { "Cache-Control": "no-store" } });
            }
            const report = await getUnseenRaidDefenses(buyer.id);
            return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.raid_defense.failure" });
        }
    });
}
