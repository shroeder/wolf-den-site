import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { sailingNeedsAttention } from "@/lib/marketplace/sailing.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight "does sailing need attention?" flag for the nav/hub red-alert badge.
export async function GET() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const attention = buyer ? await sailingNeedsAttention(buyer.id).catch(() => false) : false;
    return NextResponse.json({ attention }, { headers: { "Cache-Control": "no-store" } });
}
