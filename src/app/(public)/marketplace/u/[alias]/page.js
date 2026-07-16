import { notFound } from "next/navigation";

import AvatarStack from "@/components/AvatarStack";
import CardTab from "@/components/CardTab";
import UserBadges from "@/components/UserBadges";
import UserLevel from "@/components/UserLevel";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";
import { frameClass } from "@/lib/marketplace/frames.js";
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
                        <UserLevel level={profile.level} />
                    </div>
                </div>
            </section>
        </div>
    );
}
