import Link from "next/link";

import BackgroundPicker from "@/components/BackgroundPicker";
import BorderPicker from "@/components/BorderPicker";
import CardTab from "@/components/CardTab";
import EarnChecklist from "@/components/EarnChecklist";
import FramePicker from "@/components/FramePicker";
import GameInterestsCta from "@/components/GameInterestsCta";
import ShowcaseBadgePicker from "@/components/ShowcaseBadgePicker";
import NotifyPrefsClient from "@/components/NotifyPrefsClient";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import NextBadgeNudge from "@/components/NextBadgeNudge";
import RewardsHubHero from "@/components/RewardsHubHero";
import RewardsTrackPreview from "@/components/RewardsTrackPreview";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";
import { frameClass } from "@/lib/marketplace/frames.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getBadgeBoard } from "@/lib/marketplace/badges.js";
import { getMyBossSummary } from "@/lib/marketplace/boss.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { getRewardsTrack } from "@/lib/marketplace/track.js";
import { sailingNeedsAttention } from "@/lib/marketplace/sailing.js";
import { getStoreState } from "@/lib/marketplace/store.js";
import { getRewardsProgress } from "@/lib/marketplace/xp.js";
import { countIncomingTrades } from "@/lib/marketplace/trade.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Your Profile | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

const TILES = [
    { href: "/marketplace/boss", icon: "⚔️", label: "Boss Fight", sub: "Join the raid" },
    { href: "/marketplace/sailing", icon: "⛵", label: "Sailing", sub: "Voyage, dig & raid" },
    { href: "/marketplace/quests", icon: "📜", label: "Daily Quests", sub: "Earn gold daily" },
    { href: "/marketplace/bounties", icon: "🎯", label: "Bounty Board", sub: "Post & claim" },
    { href: "/marketplace/pets", icon: "🐾", label: "Pets", sub: "Collect & equip" },
    { href: "/marketplace/inventory", icon: "🎒", label: "Your gear", sub: "Equip items" },
    { href: "/marketplace/trade", icon: "🤝", label: "Trades", sub: "Swap items & gold" },
    { href: "/marketplace/profile/avatar", icon: "🎨", label: "Your avatar", sub: "Build your look" },
    { href: "/marketplace/friends", icon: "👥", label: "Friends", sub: "Add & message" },
    { href: "/marketplace/inbox", icon: "✉️", label: "Inbox", sub: "All your messages" },
    { href: "/marketplace/badges", icon: "🎖️", label: "Badges", sub: "Show off & earn" },
    { href: "/marketplace/leaderboard", icon: "🏆", label: "Leaderboard", sub: "See your rank" },
    { href: "/marketplace/card", icon: "🎟️", label: "Loyalty card", sub: "Scan at the register" },
    { href: "/marketplace/credit", icon: "💳", label: "Store credit", sub: "Buy credit + coins" },
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

    const [profile, progress, track, bossSummary, badgeBoard, tradeCount, store, sailAttention] = await Promise.all([
        getProfile(buyer.id).catch(() => null),
        getRewardsProgress(buyer.id).catch(() => ({})),
        getRewardsTrack(buyer.id).catch(() => null),
        getMyBossSummary(buyer.id).catch(() => null),
        getBadgeBoard(buyer.id).catch(() => null),
        countIncomingTrades(buyer.id).catch(() => 0),
        getStoreState(buyer.id).catch(() => ({ gold: 0, purchased: { pet: [], border: [], frame: [], cosmetic: [] } })),
        sailingNeedsAttention(buyer.id).catch(() => false),
    ]);
    const level = profile?.level || null;
    // Staff can equip any border regardless of level (matches the server-side bypass).
    const isStaff = (profile?.badges || []).some((b) => ["owner", "site_admin", "staff"].includes(b.slug));

    return (
        <div className="stack reveal">
            <section className={`card rewards-hub-card ${backgroundClass(profile?.background)} ${frameClass(profile?.frame)} ${profile?.featuredBadge ? "has-card-tab" : ""}`.trim()}>
                <CardTab badge={profile?.featuredBadge} />
                <RewardsHubHero
                    displayLabel={profile?.displayLabel}
                    avatarUrl={profile?.avatarUrl}
                    badges={profile?.displayBadges || []}
                    level={level}
                    border={profile?.border}
                    cosmetics={profile?.avatarCosmetics}
                    featuredCollectibleId={profile?.featuredCollectibleId}
                />
            </section>

            {bossSummary ? (
                <Link href="/marketplace/boss" className="card boss-ticket-card">
                    <span className="boss-ticket-icon" aria-hidden="true">⚔️</span>
                    <span className="boss-ticket-body">
                        <span className="boss-ticket-title">This week vs. {bossSummary.bossName}</span>
                        <span className="muted">Your damage {bossSummary.dmg.toLocaleString()} · your avatar is auto-attacking</span>
                    </span>
                    <span className="boss-ticket-tix">🎟️ {bossSummary.tickets}<small>tickets</small></span>
                </Link>
            ) : null}

            <GameInterestsCta interests={profile?.gameInterests} fnmDismissed={profile?.fnmDismissed} />

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Jump in</h2>
                <div className="hub-tiles">
                    {TILES.map((t) => {
                        const badge = t.href === "/marketplace/trade" && tradeCount > 0 ? tradeCount : null;
                        const dot = t.href === "/marketplace/sailing" && sailAttention;
                        return (
                            <Link key={t.href} href={t.href} className={`hub-tile${dot ? " has-dot" : ""}`}>
                                {badge ? <span className="hub-tile-badge">{badge}</span> : null}
                                {dot ? <span className="hub-tile-dot" title="Your boat has landed — time to dig!" /> : null}
                                <span className="hub-tile-icon" aria-hidden="true">{t.icon}</span>
                                <span className="hub-tile-label">{t.label}</span>
                                <span className="hub-tile-sub muted">{t.sub}</span>
                            </Link>
                        );
                    })}
                </div>
            </section>

            {badgeBoard ? <NextBadgeNudge next={badgeBoard.next} earnedCount={badgeBoard.earnedCount} totalCount={badgeBoard.totalCount} /> : null}

            <RewardsTrackPreview track={track} />

            <details className="card hub-collapse">
                <summary><h2>Profile border</h2></summary>
                <p className="muted" style={{ marginTop: 0 }}>Cosmetic frames you unlock by leveling up — tap one you&apos;ve earned to wear it, or tap a locked one to buy it early with gold.</p>
                <BorderPicker
                    current={profile?.border}
                    level={level?.level || 1}
                    avatarUrl={profile?.avatarUrl}
                    displayLabel={profile?.displayLabel}
                    unlockAll={isStaff}
                    badges={(profile?.badges || []).map((b) => b.slug)}
                    owned={store.purchased.border}
                    gold={store.gold}
                />
            </details>

            <details className="card hub-collapse">
                <summary><h2>Profile background</h2></summary>
                <p className="muted" style={{ marginTop: 0 }}>Scenes you unlock by leveling up — they show behind your profile hero.</p>
                <BackgroundPicker current={profile?.background} level={level?.level || 1} unlockAll={isStaff} owned={store.purchased.background} gold={store.gold} />
            </details>

            <details className="card hub-collapse">
                <summary><h2>Profile frame</h2></summary>
                <p className="muted" style={{ marginTop: 0 }}>A textured border that hugs your card&apos;s edge — unlock more by leveling up.</p>
                <FramePicker current={profile?.frame} level={level?.level || 1} unlockAll={isStaff} badges={(profile?.badges || []).map((b) => b.slug)} owned={store.purchased.frame} gold={store.gold} />
            </details>

            <details className="card hub-collapse">
                <summary><h2>Badges on your card</h2></summary>
                <p className="muted" style={{ marginTop: 0 }}>Choose up to 3 to show. Your top-ranked pick becomes the tab that sticks up on your card.</p>
                <ShowcaseBadgePicker badges={profile?.badges || []} current={profile?.showcaseSlugs || []} />
                <p style={{ marginTop: 12 }}><Link href="/marketplace/badges" className="pill">🎖️ See all badges &amp; what&apos;s next →</Link></p>
            </details>

            <details className="card hub-collapse">
                <summary><h2>Earn more XP</h2></summary>
                <EarnChecklist progress={progress} signedIn />
            </details>

            <details className="card hub-collapse">
                <summary><h2>Notifications</h2></summary>
                <p className="muted" style={{ marginTop: 0 }}>Email me when I miss something while I&apos;m away. (You always get in-app + push.)</p>
                <NotifyPrefsClient initialDm={profile?.notifyEmailDm !== false} initialFriend={profile?.notifyEmailFriend !== false} />
            </details>

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
