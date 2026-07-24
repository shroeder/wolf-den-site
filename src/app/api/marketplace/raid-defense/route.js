import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getUnseenRaidDefenses } from "@/lib/marketplace/sailing.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A canned report so the owner can preview the modal on demand (it normally only appears after a real raid).
// 10 attackers on purpose, so the owner can test how a long list scrolls inside the modal.
const PREVIEW_NAMES = ["Nynebreaker", "Ironhowl", "Snappy", "Direfang", "Emberpaw", "Stormjaw", "Ashenclaw", "Grimtail", "Frostmane", "Nightbite"];
const PREVIEW_REPORT = {
    preview: true,
    totalWins: 27,
    totalGold: 6420,
    defenses: PREVIEW_NAMES.map((name, i) => ({
        attacker: { name, level: 6 + ((i * 3) % 12), avatarUrl: null, avatarFlip: i % 2 === 0 },
        count: 1 + ((i * 2) % 4),
        gold: 240 + i * 130,
        gear: i % 3 === 0 ? [{ name: ["Rune Blade", "Frost Brand", "Dragonplate", "Void Maelstrom"][i % 4], rarity: ["epic", "rare", "legendary", "mythic"][i % 4] }] : [],
    })),
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
