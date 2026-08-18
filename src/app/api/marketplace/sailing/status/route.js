import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { fishingUnlocked, sailingNeedsAttention, unusedCasts } from "@/lib/marketplace/sailing.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight nav helper: the sailing red-alert flag + whether the viewer is the owner (so the game nav can
// surface owner-only preview links like the Farm).
export async function GET() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const [attention, casts] = buyer
        ? await Promise.all([
            sailingNeedsAttention(buyer.id).catch(() => false),
            unusedCasts(buyer.id).catch(() => 0),
        ])
        : [false, 0];
    // `casts` drives the nav nudge: a count people can act on, rather than a dot they learn to ignore. The
    // `forgeable` count went with forging itself — chests are dug up now, so there is nothing waiting to be
    // assembled on another screen.
    // `fishing` is the nav's copy of the one gate (fishingUnlocked). Without it the nav kept a Fishing entry
    // for every signed-in member while the page behind it 404s — a door to a room that is not there, which is
    // worse than no door. Sent rather than recomputed client-side because the gate is server-only.
    return NextResponse.json({
        attention, casts, forgeable: 0,
        fishing: buyer ? fishingUnlocked(buyer.id) : false,
        owner: buyer ? isOwner(buyer.id) : false,
    }, { headers: { "Cache-Control": "no-store" } });
}
