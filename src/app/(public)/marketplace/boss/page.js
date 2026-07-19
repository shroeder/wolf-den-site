import Link from "next/link";

import BossFightClient from "@/components/BossFightClient";
import QuestsClient from "@/components/QuestsClient";
import ViewPing from "@/components/ViewPing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Weekly Boss | Wolf Den",
    robots: { index: false },
};

// The weekly community boss event — real, shared, persistent HP.
export default function BossPage() {
    return (
        <div className="stack reveal">
            <ViewPing event="view_boss" />
            <section className="card">
                <h1 style={{ marginTop: 0 }}>⚔️ Weekly Boss</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    The whole pack chips away at one shared boss all week. Everyone gets <strong>one swing a day</strong> — land
                    your hit to earn XP and raffle tickets for the giveaway. Its HP is real and shared across all members: drop
                    in daily and help finish it off.
                </p>
                <BossFightClient />
            </section>
            <QuestsClient />
            <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>🎯 <strong>Need a hand from the pack?</strong> Post a bounty — attach gold, get help in the real world.</span>
                <Link href="/marketplace/bounties" className="btn-gold">Bounty board →</Link>
            </section>
        </div>
    );
}
