import Link from "next/link";

import BadgeShopClient from "@/components/BadgeShopClient";
import BadgeCollectionClient from "@/components/BadgeCollectionClient";
import NextBadgeNudge from "@/components/NextBadgeNudge";
import ShowcaseBadgePicker from "@/components/ShowcaseBadgePicker";
import { getBadgeBoard, getBadgeMilestones } from "@/lib/marketplace/badges.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Your Badges | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function BadgesPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <h1 style={{ marginTop: 0 }}>🎖️ Badges</h1>
                    <p className="muted"><Link href="/marketplace/login?returnTo=/marketplace/badges">Sign in</Link> to see your badges, track what&apos;s next, and choose which show on your card.</p>
                </section>
            </div>
        );
    }

    const [board, profile, milestones] = await Promise.all([
        getBadgeBoard(buyer.id).catch(() => null),
        getProfile(buyer.id).catch(() => null),
        getBadgeMilestones(buyer.id).catch(() => null),
    ]);
    const badges = board?.badges || [];

    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🎖️ Your Badges</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    You&apos;ve earned <strong>{board?.earnedCount || 0}</strong> of {board?.totalCount || 0}. Each badge grants a little XP + gold — and many add a passive that buffs your daily boss strike. Choose up to 3 to show on your card.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                    {(() => {
                        const p = board?.passives || {};
                        const bits = [];
                        if (p.might) bits.push(`⚔️ +${p.might} Might`);
                        if (p.crit_chance) bits.push(`🎯 +${p.crit_chance}% Crit Chance`);
                        if (p.crit_power) bits.push(`💥 +${p.crit_power}% Crit Power`);
                        return bits.length ? <div className="badge-passive-strip" style={{ margin: 0 }}>🎖️ Your badges buff your strike: <strong>{bits.join(" · ")}</strong></div> : null;
                    })()}
                    <NextBadgeNudge next={board?.next} earnedCount={board?.earnedCount || 0} totalCount={board?.totalCount || 0} href="#customize" />
                </div>
            </section>

            <section className="card" id="customize">
                <h2 style={{ marginTop: 0 }}>Show off on your card</h2>
                <p className="muted" style={{ marginTop: 0 }}>Pick up to 3. Your #1 becomes the folder tab on your card.</p>
                <ShowcaseBadgePicker badges={profile?.badges || []} current={profile?.showcaseSlugs || []} />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>💰 Badge shop</h2>
                <BadgeShopClient />
            </section>

            <BadgeCollectionClient badges={badges} initialMilestones={milestones} earnedCount={board?.earnedCount || 0} totalCount={board?.totalCount || 0} />
        </div>
    );
}
