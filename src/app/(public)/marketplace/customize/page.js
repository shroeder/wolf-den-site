import Link from "next/link";

import BackgroundPicker from "@/components/BackgroundPicker";
import BorderPicker from "@/components/BorderPicker";
import CardTab from "@/components/CardTab";
import FramePicker from "@/components/FramePicker";
import ShowcaseBadgePicker from "@/components/ShowcaseBadgePicker";
import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import RewardsHubHero from "@/components/RewardsHubHero";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";
import { frameClass } from "@/lib/marketplace/frames.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { getStoreState } from "@/lib/marketplace/store.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Customize | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

// The look-and-feel workshop: everything cosmetic about a member's profile card lives here (avatar, border,
// background, frame, showcased badges), split out of the settings-heavy Profile page. A live hero preview at
// the top reflects each change so you can see your card while you tweak it.
export default async function CustomizePage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return <MarketplaceLoginClient redirectTo="/marketplace/customize" />;

    const [profile, store] = await Promise.all([
        getProfile(buyer.id).catch(() => null),
        getStoreState(buyer.id).catch(() => ({ gold: 0, purchased: { pet: [], border: [], frame: [], cosmetic: [], background: [] } })),
    ]);
    const level = profile?.level || null;
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

            <section className="card">
                <h2 style={{ marginTop: 0 }}>🎨 Customize your look</h2>
                <p className="muted" style={{ marginTop: 0 }}>Everything that shows on your profile card. Changes save instantly and update the preview above.</p>
                <Link href="/marketplace/profile/avatar" className="pill" style={{ display: "inline-block", fontWeight: 700 }}>🧑‍🎨 Build your avatar →</Link>
            </section>

            <details className="card hub-collapse" open>
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
        </div>
    );
}
