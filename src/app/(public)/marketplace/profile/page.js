import Link from "next/link";

import AvatarStack from "@/components/AvatarStack";
import BackgroundPicker from "@/components/BackgroundPicker";
import BorderPicker from "@/components/BorderPicker";
import CollectibleGrid from "@/components/CollectibleGrid";
import CardTab from "@/components/CardTab";
import EarnChecklist from "@/components/EarnChecklist";
import FramePicker from "@/components/FramePicker";
import ShowcaseBadgePicker from "@/components/ShowcaseBadgePicker";
import NotifyPrefsClient from "@/components/NotifyPrefsClient";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import RewardsHubHero from "@/components/RewardsHubHero";
import RewardsTrackPreview from "@/components/RewardsTrackPreview";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";
import { frameClass } from "@/lib/marketplace/frames.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { getRewardsTrack } from "@/lib/marketplace/track.js";
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

    const [profile, progress, track] = await Promise.all([
        getProfile(buyer.id).catch(() => null),
        getRewardsProgress(buyer.id).catch(() => ({})),
        getRewardsTrack(buyer.id).catch(() => null),
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
                />
            </section>

            <RewardsTrackPreview track={track} />

            <section className="card avatar-cta">
                <AvatarStack
                    avatarUrl={profile?.avatarUrl}
                    initial={(profile?.displayLabel || "?").slice(0, 1).toUpperCase()}
                    size={72}
                    border={profile?.border}
                    cosmetics={profile?.avatarCosmetics}
                />
                <div className="avatar-cta-body">
                    <h2 style={{ margin: 0 }}>Your avatar</h2>
                    <p className="muted" style={{ margin: "2px 0 10px" }}>Customize your character, hats, colors, and aura.</p>
                    <Link href="/marketplace/profile/avatar" className="button primary">✏️ Edit avatar</Link>
                </div>
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Profile border</h2>
                <p className="muted" style={{ marginTop: 0 }}>Cosmetic frames you unlock by leveling up. Tap one you&apos;ve earned to wear it.</p>
                <BorderPicker
                    current={profile?.border}
                    level={level?.level || 1}
                    avatarUrl={profile?.avatarUrl}
                    displayLabel={profile?.displayLabel}
                    unlockAll={isStaff}
                    badges={(profile?.badges || []).map((b) => b.slug)}
                />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Profile background</h2>
                <p className="muted" style={{ marginTop: 0 }}>Scenes you unlock by leveling up — they show behind your profile hero.</p>
                <BackgroundPicker current={profile?.background} level={level?.level || 1} unlockAll={isStaff} />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Profile frame</h2>
                <p className="muted" style={{ marginTop: 0 }}>A textured border that hugs your card&apos;s edge — unlock more by leveling up.</p>
                <FramePicker current={profile?.frame} level={level?.level || 1} unlockAll={isStaff} badges={(profile?.badges || []).map((b) => b.slug)} />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Collection</h2>
                <p className="muted" style={{ marginTop: 0 }}>Relics, weapons, and beasts you unlock as you level up. These become real, equippable gear down the road.</p>
                <CollectibleGrid level={level?.level || 1} unlockAll={isStaff} />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Badges on your card</h2>
                <p className="muted" style={{ marginTop: 0 }}>Choose up to 3 to show. Your top-ranked pick becomes the tab that sticks up on your card.</p>
                <ShowcaseBadgePicker badges={profile?.badges || []} current={profile?.showcaseSlugs || []} />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Earn more XP</h2>
                <EarnChecklist progress={progress} signedIn />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Notifications</h2>
                <p className="muted" style={{ marginTop: 0 }}>Email me when I miss something while I&apos;m away. (You always get in-app + push.)</p>
                <NotifyPrefsClient initialDm={profile?.notifyEmailDm !== false} initialFriend={profile?.notifyEmailFriend !== false} />
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
