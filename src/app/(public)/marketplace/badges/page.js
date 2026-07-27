import Link from "next/link";

import BadgeShopClient from "@/components/BadgeShopClient";
import BadgeCollectionClient from "@/components/BadgeCollectionClient";
import ShowcaseBadgePicker from "@/components/ShowcaseBadgePicker";
import { getBadgeBoard, getBadgeMilestones } from "@/lib/marketplace/badges.js";
import { activeDomains } from "@/lib/marketplace/badge-bonus-meta.js";
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
    const domains = activeDomains(board?.bonusTotals);

    return (
        <div className="stack reveal">
            {/* Compact hero: title + a couple of numbers, then the juiced badge-power panel (all systems). */}
            <section className="card badges-hero">
                <div className="bh-head">
                    <h1>🎖️ Your Badges</h1>
                    <span className="bh-count"><b>{board?.earnedCount || 0}</b><span>/ {board?.totalCount || 0}</span></span>
                </div>
                {domains.length ? (
                    <div className="bh-power">
                        <div className="bh-power-label">⚡ Badge Power <span>— bonuses your badges grant across every system</span></div>
                        <div className="bh-domains">
                            {domains.map((d) => (
                                <div key={d.domain} className="bh-domain" style={{ "--acc": d.accent }}>
                                    <div className="bh-domain-head"><span className="bh-domain-ico">{d.icon}</span><b>{d.label}</b><em>{d.blurb}</em></div>
                                    <div className="bh-domain-tiles">
                                        {d.stats.map((s) => (
                                            <div key={s.key} className="bh-stat">
                                                <span className="bh-stat-ico">{s.icon}</span>
                                                <span className="bh-stat-val">+{s.value}{s.suffix}</span>
                                                <span className="bh-stat-lab">{s.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bh-power bh-power-empty">⚡ Every badge grants a bonus to the system it belongs to — combat, sailing, farming or the forge. Earn some to power up.</div>
                )}
            </section>

            {/* The meat — right up top. */}
            <BadgeCollectionClient badges={badges} initialMilestones={milestones} earnedCount={board?.earnedCount || 0} totalCount={board?.totalCount || 0} />

            {/* Chrome, tucked below and collapsed. */}
            <details className="card badges-collapse">
                <summary><span className="bc-sum-title">✨ Show off on your card</span><span className="bc-sum-hint">pick up to 3</span></summary>
                <p className="muted" style={{ margin: "8px 0 0" }}>Your #1 becomes the folder tab on your card.</p>
                <div style={{ marginTop: 10 }}><ShowcaseBadgePicker badges={profile?.badges || []} current={profile?.showcaseSlugs || []} /></div>
            </details>

            <details className="card badges-collapse">
                <summary><span className="bc-sum-title">🛒 Badge shop</span><span className="bc-sum-hint">buy with gold</span></summary>
                <div style={{ marginTop: 10 }}><BadgeShopClient /></div>
            </details>
        </div>
    );
}
