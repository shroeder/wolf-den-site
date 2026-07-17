import { notFound } from "next/navigation";

import AvatarStack from "@/components/AvatarStack";
import CardTab from "@/components/CardTab";
import CollectibleGrid from "@/components/CollectibleGrid";
import FeaturedCollectible from "@/components/FeaturedCollectible";
import ProfileActions from "@/components/ProfileActions";
import PublicGear from "@/components/PublicGear";
import UserBadges from "@/components/UserBadges";
import UserLevel from "@/components/UserLevel";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";
import { frameClass } from "@/lib/marketplace/frames.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { friendStatus } from "@/lib/marketplace/friends.js";
import { getInventory } from "@/lib/marketplace/inventory.js";
import { getPublicProfileByAlias } from "@/lib/marketplace/profile.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
    const { alias } = await params;
    const profile = await getPublicProfileByAlias(alias).catch(() => null);
    if (!profile) return { title: "Member | Wolf Den Marketplace" };
    return {
        title: `${profile.displayLabel}${profile.alias ? ` (@${profile.alias})` : ""} | Wolf Den Marketplace`,
        alternates: { canonical: `/marketplace/u/${profile.alias}` },
    };
}

function Avatar({ profile, size = "lg" }) {
    const initial = (profile.displayLabel || profile.alias || "?").slice(0, 1).toUpperCase();
    return (
        <AvatarStack
            avatarUrl={profile.avatarUrl}
            initial={initial}
            size={size === "lg" ? 84 : 48}
            border={profile.border}
            cosmetics={profile.avatarCosmetics}
        />
    );
}

export default async function UserProfilePage({ params }) {
    const { alias } = await params;
    const profile = await getPublicProfileByAlias(alias).catch(() => null);
    if (!profile) notFound();

    // Viewer context (for the Add friend / Message actions) + the member's gear to inspect.
    const viewer = await getAuthenticatedBuyer().catch(() => null);
    const [relation, inventory] = await Promise.all([
        viewer ? friendStatus(viewer.id, profile.id).catch(() => "none") : Promise.resolve(null),
        getInventory(profile.id).catch(() => null),
    ]);

    return (
        <div className="stack reveal">
            <section className={`card ${backgroundClass(profile.background)} ${frameClass(profile.frame)} ${profile.featuredBadge ? "has-card-tab" : ""}`.trim()}>
                <CardTab badge={profile.featuredBadge} />
                <div className="user-profile-head">
                    <Avatar profile={profile} />
                    <div className="user-profile-meta">
                        <h1>{profile.displayLabel}</h1>
                        {profile.alias ? <p className="muted">@{profile.alias}</p> : null}
                        <UserBadges badges={profile.displayBadges || profile.badges} />
                        {profile.featuredCollectibleId ? <FeaturedCollectible id={profile.featuredCollectibleId} size="sm" /> : null}
                        <UserLevel level={profile.level} />
                    </div>
                </div>
                <ProfileActions targetId={profile.id} relation={relation} signedIn={Boolean(viewer)} />
            </section>

            <PublicGear inventory={inventory} displayLabel={profile.displayLabel} />

            <section className="card">
                <h2 style={{ marginTop: 0 }}>🐾 Pets</h2>
                <p className="muted" style={{ marginTop: 0 }}>Companions {profile.displayLabel} has unlocked by leveling up.</p>
                <CollectibleGrid level={profile.level?.level || 1} unlockedOnly />
            </section>
        </div>
    );
}
