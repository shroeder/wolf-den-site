import Link from "next/link";

import BadgeShopClient from "@/components/BadgeShopClient";
import BadgeCollectionClient from "@/components/BadgeCollectionClient";
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
    const p = board?.passives || {};
    const powers = [
        { key: "might", ico: "⚔️", val: p.might ? `+${p.might}` : null, lab: "Might" },
        { key: "crit_chance", ico: "🎯", val: p.crit_chance ? `+${p.crit_chance}%` : null, lab: "Crit Chance" },
        { key: "crit_power", ico: "💥", val: p.crit_power ? `+${p.crit_power}%` : null, lab: "Crit Power" },
    ].filter((x) => x.val);

    return (
        <div className="stack reveal">
            {/* Compact hero: title + a couple of numbers, then the juiced badge-power panel. */}
            <section className="card badges-hero">
                <div className="bh-head">
                    <h1>🎖️ Your Badges</h1>
                    <span className="bh-count"><b>{board?.earnedCount || 0}</b><span>/ {board?.totalCount || 0}</span></span>
                </div>
                {powers.length ? (
                    <div className="bh-power">
                        <div className="bh-power-label">⚡ Badge Power <span>— buffs your daily boss strike</span></div>
                        <div className="bh-power-tiles">
                            {powers.map((x) => (
                                <div key={x.key} className={`bh-tile ${x.key}`}>
                                    <span className="bh-ico">{x.ico}</span>
                                    <span className="bh-val">{x.val}</span>
                                    <span className="bh-lab">{x.lab}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bh-power bh-power-empty">⚡ Earn badges with <b>⚔️ / 🎯 / 💥</b> bonuses to power up your daily boss strike.</div>
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
