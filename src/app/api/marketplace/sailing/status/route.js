import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { sailingNeedsAttention, unusedCasts, forgeableChests } from "@/lib/marketplace/sailing.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight nav helper: the sailing red-alert flag + whether the viewer is the owner (so the game nav can
// surface owner-only preview links like the Farm).
export async function GET() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const [attention, casts, forgeable] = buyer
        ? await Promise.all([
            sailingNeedsAttention(buyer.id).catch(() => false),
            unusedCasts(buyer.id).catch(() => 0),
            forgeableChests(buyer.id).catch(() => 0),
        ])
        : [false, 0, 0];
    // `casts` and `forgeable` drive the nav nudge: counts people can act on, rather than a dot they learn to
    // ignore. `forgeable` deliberately stays OUT of `attention` (the red alert dot) — a chest waiting to be
    // forged is an opportunity, not something going wrong, and the dot should keep meaning "go look now".
    return NextResponse.json({ attention, casts, forgeable, owner: buyer ? isOwner(buyer.id) : false }, { headers: { "Cache-Control": "no-store" } });
}
