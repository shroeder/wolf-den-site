import Link from "next/link";

import RewardsTrack from "@/components/RewardsTrack";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getRewardsTrack } from "@/lib/marketplace/track.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Your Rewards Track | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function RewardsTrackPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <h1>Your rewards track</h1>
                    <p className="statement-copy">
                        <Link href="/marketplace/login?signup=1">Create a free account</Link> to start earning XP, leveling up, and
                        unlocking ranks, badges, and perks.
                    </p>
                    <Link href="/marketplace/rewards" className="btn-gold" style={{ marginTop: 8 }}>See how rewards work →</Link>
                </section>
            </div>
        );
    }

    const track = await getRewardsTrack(buyer.id).catch(() => null);

    return (
        <div className="stack reveal">
            <div className="track-topbar">
                <h1 style={{ margin: 0 }}>Your rewards track</h1>
                <Link href="/marketplace/profile" className="pill">← Profile</Link>
            </div>
            <RewardsTrack track={track} />
        </div>
    );
}
