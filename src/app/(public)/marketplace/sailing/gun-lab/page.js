import { notFound } from "next/navigation";

import GunLab from "@/components/GunLab";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// OWNER-ONLY ON THE LIVE SITE, not dev-only any more.
//
// It was `NODE_ENV !== "development" → notFound()`, which meant the one person who can actually look at a ship
// on the device members use could not open the tool that positions its guns. Twenty-six hulls stayed on the
// generic even spread because the only way to place them was to guess from a screenshot on a laptop. A 404 for
// everyone else, so the coordinates that decide what every member's ship looks like stay in one pair of hands.
export const dynamic = "force-dynamic";
export const metadata = { title: "Gun Placement Lab", robots: { index: false, follow: false } };

export default async function GunLabPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) notFound();
    return <GunLab />;
}
