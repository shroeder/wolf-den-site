import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { sailingNeedsAttention } from "@/lib/marketplace/sailing.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight nav helper: the sailing red-alert flag + whether the viewer is the owner (so the game nav can
// surface owner-only preview links like the Farm).
export async function GET() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const attention = buyer ? await sailingNeedsAttention(buyer.id).catch(() => false) : false;
    return NextResponse.json({ attention, owner: buyer ? isOwner(buyer.id) : false }, { headers: { "Cache-Control": "no-store" } });
}
