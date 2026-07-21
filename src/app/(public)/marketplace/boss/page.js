import Link from "next/link";

import BossFightClient from "@/components/BossFightClient";
import HappyHour from "@/components/HappyHour";
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
                <BossFightClient />
            </section>
            {/* The community donate/rally widget lives here (boss page only) — compact so it doesn't hog space. */}
            <HappyHour compact />
            <QuestsClient />
            <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>🎯 <strong>Need a hand from the pack?</strong> Post a bounty — attach gold, get help in the real world.</span>
                <Link href="/marketplace/bounties" className="btn-gold">Bounty board →</Link>
            </section>
        </div>
    );
}
