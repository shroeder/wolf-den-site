import Link from "next/link";
import { gatePage } from "@/lib/marketplace/gate-page.js";

import RewardsTrack from "@/components/RewardsTrack";
import VerifyNudge from "@/components/VerifyNudge";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getRewardsTrack } from "@/lib/marketplace/track.js";
import { verifyOffer } from "@/lib/marketplace/verified-perks.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Your Rewards Track | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function RewardsTrackPage() {
    // The town gate's route half — see gate-page.js. One line, and it is the half that gets forgotten.
    await gatePage("track");
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
    // ── WHERE THE VERIFIED PERKS ARE KEPT ────────────────────────────────────────────────────────────────
    // The offer card lives on the game hub; this is the other half of [[reward-with-no-screen-is-not-shipped]]
    // — a standing perk has to be VISIBLE somewhere after the moment it was won, or a member has no way to
    // tell it is still running. The rewards track is the page that answers "what am I getting", so it says.
    const verify = await verifyOffer(buyer.id).catch(() => null);

    return (
        <div className="stack reveal">
            <div className="track-topbar">
                <h1 style={{ margin: 0 }}>Your rewards track</h1>
                <Link href="/marketplace/profile" className="pill">← Profile</Link>
            </div>
            <RewardsTrack track={track} />
            {verify?.verified ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>Verified perks</h2>
                    <p className="muted" style={{ margin: 0 }}>
                        Your email address is verified, so these are running on your account right now:
                    </p>
                    <ul className="muted" style={{ marginBottom: 0 }}>
                        <li><strong>+{verify.perks.xpPct}% XP</strong> on everything you earn.</li>
                        <li>
                            <strong>+{verify.perks.goldPerDay.toLocaleString()} gold and +{verify.perks.xpPerDay.toLocaleString()} XP a day</strong>{" "}
                            accruing while you&apos;re away — it banks for up to {verify.perks.capHours} hours and lands when you check in.
                        </li>
                    </ul>
                </section>
            ) : (
                /* Not verified: the same offer card as the game hub, off the same shared feed. */
                <VerifyNudge />
            )}
        </div>
    );
}
