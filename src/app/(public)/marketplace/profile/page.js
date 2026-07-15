import Link from "next/link";

import BorderPicker from "@/components/BorderPicker";
import EarnChecklist from "@/components/EarnChecklist";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import RewardsHubHero from "@/components/RewardsHubHero";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { getRewardsProgress } from "@/lib/marketplace/xp.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Your Profile | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

const TILES = [
    { href: "/marketplace/card", icon: "🎟️", label: "Loyalty card", sub: "Scan at the register" },
    { href: "/marketplace/leaderboard", icon: "🏆", label: "Leaderboard", sub: "See your rank" },
    { href: "/marketplace/friends", icon: "👥", label: "Friends", sub: "Add & message" },
    { href: "/marketplace/inbox", icon: "✉️", label: "Inbox", sub: "All your messages" },
];

export default async function ProfileHubPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <MarketplaceProfileClient />
                </section>
            </div>
        );
    }

    const [profile, progress] = await Promise.all([
        getProfile(buyer.id).catch(() => null),
        getRewardsProgress(buyer.id).catch(() => ({})),
    ]);
    const level = profile?.level || null;

    return (
        <div className="stack reveal">
            <section className="card rewards-hub-card">
                <RewardsHubHero
                    displayLabel={profile?.displayLabel}
                    avatarUrl={profile?.avatarUrl}
                    badges={profile?.badges || []}
                    level={level}
                    border={profile?.border}
                />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Profile border</h2>
                <p className="muted" style={{ marginTop: 0 }}>Cosmetic frames you unlock by leveling up. Tap one you&apos;ve earned to wear it.</p>
                <BorderPicker
                    current={profile?.border}
                    level={level?.level || 1}
                    avatarUrl={profile?.avatarUrl}
                    displayLabel={profile?.displayLabel}
                />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Earn more XP</h2>
                <EarnChecklist progress={progress} signedIn />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Your stuff</h2>
                <div className="hub-tiles">
                    {TILES.map((t) => (
                        <Link key={t.href} href={t.href} className="hub-tile">
                            <span className="hub-tile-icon" aria-hidden="true">{t.icon}</span>
                            <span className="hub-tile-label">{t.label}</span>
                            <span className="hub-tile-sub muted">{t.sub}</span>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="card">
                <details className="hub-account">
                    <summary>
                        <span className="hub-account-summary">Account details &amp; settings</span>
                        <span className="muted" style={{ fontSize: "0.85rem" }}>name · photo · handle · phone · Discord</span>
                    </summary>
                    <div style={{ marginTop: "1rem" }}>
                        <MarketplaceProfileClient embedded />
                    </div>
                </details>
            </section>
        </div>
    );
}
