import Link from "next/link";

import BadgeShopClient from "@/components/BadgeShopClient";
import NextBadgeNudge from "@/components/NextBadgeNudge";
import ShowcaseBadgePicker from "@/components/ShowcaseBadgePicker";
import { getBadgeBoard } from "@/lib/marketplace/badges.js";
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

    const [board, profile] = await Promise.all([
        getBadgeBoard(buyer.id).catch(() => null),
        getProfile(buyer.id).catch(() => null),
    ]);
    const badges = board?.badges || [];

    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🎖️ Your Badges</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    You&apos;ve earned <strong>{board?.earnedCount || 0}</strong> of {board?.totalCount || 0}. Choose up to 3 to show on your card — your top pick becomes the tab that sticks up on your profile.
                </p>
                <NextBadgeNudge next={board?.next} earnedCount={board?.earnedCount || 0} totalCount={board?.totalCount || 0} href="#customize" />
            </section>

            <section className="card" id="customize">
                <h2 style={{ marginTop: 0 }}>Show off on your card</h2>
                <p className="muted" style={{ marginTop: 0 }}>Pick up to 3. Your #1 becomes the folder tab on your card.</p>
                <ShowcaseBadgePicker badges={profile?.badges || []} current={profile?.showcaseSlugs || []} />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>🪙 Badge shop</h2>
                <BadgeShopClient />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>All badges</h2>
                <p className="muted" style={{ marginTop: 0 }}>Everything you can earn — with your progress toward the ones you haven&apos;t yet.</p>
                <div className="badge-board">
                    {badges.map((b) => (
                        <div key={b.slug} className={`badge-tile${b.earned ? " is-earned" : " is-locked"}`} style={b.earned && b.color ? { borderColor: b.color } : undefined}>
                            <span className="badge-tile-icon" style={{ background: b.earned ? b.color || "#333" : undefined }} aria-hidden="true">{b.icon || "🏅"}</span>
                            <span className="badge-tile-label">{b.label}</span>
                            {b.description ? <span className="badge-tile-desc muted">{b.description}</span> : null}
                            {b.earned ? (
                                <span className="badge-tile-status is-earned">Earned ✓</span>
                            ) : b.progress ? (
                                <span className="badge-tile-progress">
                                    <span className="badge-tile-bar"><span style={{ width: `${b.progress.pct}%` }} /></span>
                                    <span className="badge-tile-status muted">{b.progress.current.toLocaleString()} / {b.progress.target.toLocaleString()}</span>
                                </span>
                            ) : b.goldPrice != null ? (
                                <span className="badge-tile-status muted">🪙 {b.goldPrice.toLocaleString()} · in shop</span>
                            ) : b.dropOnly ? (
                                <span className="badge-tile-status muted">Drop only 🎁</span>
                            ) : (
                                <span className="badge-tile-status muted">{b.adminOnly ? "Awarded by staff" : "Locked"}</span>
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
