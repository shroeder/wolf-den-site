import { notFound } from "next/navigation";

import BountyDetailClient from "@/components/BountyDetailClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getBountyDetail } from "@/lib/marketplace/bounties.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
    const { id } = await params;
    const b = await getBountyDetail(id).catch(() => null);
    return { title: b ? `${b.title} | Bounty Board` : "Bounty | The Wolf Den" };
}

export default async function BountyDetailPage({ params }) {
    const { id } = await params;
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const bounty = await getBountyDetail(id, buyer?.id || null);
    if (!bounty) notFound();
    return (
        <div className="stack reveal">
            <BountyDetailClient initial={bounty} signedIn={Boolean(buyer)} />
        </div>
    );
}
