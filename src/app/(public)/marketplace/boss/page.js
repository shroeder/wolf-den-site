import Link from "next/link";

import BossFightClient from "@/components/BossFightClient";
import HappyHour from "@/components/HappyHour";
import QuestsClient from "@/components/QuestsClient";
import ViewPing from "@/components/ViewPing";
import ConsumableShelf from "@/components/ConsumableShelf";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { canDressUp } from "@/lib/marketplace/owner.js";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Weekly Boss | Wolf Den",
    robots: { index: false },
};

// The weekly community boss event — real, shared, persistent HP.
export default async function BossPage() {
    // The same gate as the plaza, the sea, the dig, the farm and the mine — the member's own town_halloween
    // behind canDressUp. Resolved here rather than added to the boss API, because the API answer is shared
    // and cached across everybody and this is a per-member preference.
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const hw = buyer && canDressUp(buyer.id)
        ? await db.queryOne(`SELECT town_halloween FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null)
        : null;
    const halloween = Boolean(hw?.town_halloween);
    return (
        <div className="stack reveal">
            <ViewPing event="view_boss" />
            {/* The community donate/rally widget sits ABOVE the fight so the rally is the first thing you see. */}
            <HappyHour compact />
            <section className="card">
                <BossFightClient halloween={halloween} />
            </section>
            {/* Adrenaline, Second Wind, Berserker's Brew — every one of them buys strikes or damage on the
                fight directly above, and until now they could only be drunk from the store two screens away.
                See ConsumableShelf. */}
            <ConsumableShelf feature="boss" title="Potions for this fight" />
            <QuestsClient />
            <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>🎯 <strong>Need a hand from the pack?</strong> Post a bounty — attach gold, get help in the real world.</span>
                <Link href="/marketplace/bounties" className="btn-gold">Bounty board →</Link>
            </section>
        </div>
    );
}
