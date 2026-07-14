import { notFound } from "next/navigation";

import UserBadges from "@/components/UserBadges";
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
        <div className={`user-avatar user-avatar-${size}`}>
            {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt={`${profile.displayLabel} avatar`} />
            ) : (
                <span aria-hidden="true">{initial}</span>
            )}
        </div>
    );
}

export default async function UserProfilePage({ params }) {
    const { alias } = await params;
    const profile = await getPublicProfileByAlias(alias).catch(() => null);
    if (!profile) notFound();

    return (
        <div className="stack reveal">
            <section className="card">
                <div className="user-profile-head">
                    <Avatar profile={profile} />
                    <div className="user-profile-meta">
                        <h1>{profile.displayLabel}</h1>
                        {profile.alias ? <p className="muted">@{profile.alias}</p> : null}
                        <UserBadges badges={profile.badges} />
                    </div>
                </div>
            </section>
        </div>
    );
}
