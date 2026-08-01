import { notFound } from "next/navigation";
import { after } from "next/server";

import { trackActivity } from "@/lib/marketplace/activity.js";

import AvatarStack from "@/components/AvatarStack";
import CardTab from "@/components/CardTab";
import FeaturedCollectible from "@/components/FeaturedCollectible";
import ProfileActions from "@/components/ProfileActions";
import PublicFishing from "@/components/PublicFishing";
import PublicGear from "@/components/PublicGear";
import PublicPets from "@/components/PublicPets";
import PublicRecipeBook from "@/components/PublicRecipeBook";
import UserBadges from "@/components/UserBadges";
import UserLevel from "@/components/UserLevel";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";
import { frameClass } from "@/lib/marketplace/frames.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getMemberRecipeBook } from "@/lib/marketplace/cooking.js";
import { memberFishLog } from "@/lib/marketplace/fishing.js";
import { fishingUnlocked } from "@/lib/marketplace/sailing.js";
import { collectibleById, petActive, petPassive, petSpecialPassive, petPassiveLevelMult } from "@/lib/marketplace/collectibles.js";
import { friendStatus } from "@/lib/marketplace/friends.js";
import { getInventory } from "@/lib/marketplace/inventory.js";
import { petActiveLevelMult } from "@/lib/marketplace/pet-level.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { petsState } from "@/lib/marketplace/pets.js";
import { getPublicShip } from "@/lib/marketplace/sailing.js";
import { getPublicProfileByAlias } from "@/lib/marketplace/profile.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
    const { alias } = await params;
    const profile = await getPublicProfileByAlias(alias).catch(() => null);
    if (!profile) return { title: "Member | Wolf Den Marketplace" };
    const lvl = profile.level?.level ?? profile.level ?? 1;
    const badgeCount = (profile.badges || []).length;
    const label = `${profile.displayLabel}${profile.alias ? ` (@${profile.alias})` : ""}`;
    // Share-friendly blurb. The 1200×630 hero card comes from opengraph-image.js and is auto-attached to
    // both the OpenGraph and Twitter tags — so a shared profile link renders a rich preview.
    const description = `Level ${lvl} at The Wolf Den${badgeCount ? ` · ${badgeCount} badge${badgeCount === 1 ? "" : "s"} earned` : ""}. Check out their gear, loadout, and rank in the pack.`;
    const url = `/marketplace/u/${profile.alias}`;
    return {
        title: `${label} | Wolf Den Marketplace`,
        description,
        alternates: { canonical: url },
        openGraph: {
            type: "profile",
            title: `${label} · Level ${lvl}`,
            description,
            url,
            siteName: "The Wolf Den",
        },
        twitter: {
            card: "summary_large_image",
            title: `${label} · Level ${lvl}`,
            description,
        },
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
    const [relation, inventory, pets, ship] = await Promise.all([
        viewer ? friendStatus(viewer.id, profile.id).catch(() => "none") : Promise.resolve(null),
        getInventory(profile.id).catch(() => null),
        petsState(profile.id).catch(() => ({ ownedIds: [] })),
        getPublicShip(profile.id).catch(() => null),
    ]);
    // Telemetry: someone inspected another member's profile.
    if (viewer && viewer.id !== profile.id) after(() => trackActivity(viewer.id, "view_profile", { alias: profile.alias, name: profile.displayLabel }));

    // Rich pet data for the public view: each owned pet's level, its accurate level-appropriate battle
    // sprite, and whether it's the equipped/featured companion — so visitors can inspect them.
    const [petSpriteBase, petSpriteLevels] = await Promise.all([
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
    ]);
    const fmtStat = (s) => String(s || "").replace(/_/g, " ");
    // Owner-gated: only someone who can fish sees anyone's fishing log, so an unreleased feature doesn't
    // surface on every member profile in the Den.
    const fishLog = viewer && fishingUnlocked(viewer.id) ? await memberFishLog(profile.id).catch(() => null) : null;
    // Same viewer-gate as the fishing log, and for the same reason: the Kitchen is still owner-only, so a
    // recipe book must not appear on every profile in the Den before the feature is public.
    const recipeBook = viewer ? await getMemberRecipeBook(viewer.id, profile.id).catch(() => null) : null;
    const petsData = (pets.ownedIds || [])
        .map((id) => {
            const def = collectibleById(id);
            if (!def) return null;
            const lvl = pets.petLevels?.[id]?.level || 1;
            const art = pickPetSpriteForLevel(petSpriteBase[id], petSpriteLevels[id], lvl);
            const active = petActive(def);
            const passive = petPassive(def);
            const pl = pets.petLevels?.[id] || {};
            const activeVal = Math.round((active?.value || 0) * petActiveLevelMult(lvl));
            const sp = petSpecialPassive(def);
            const specialDesc = [];
            if (sp) {
                if (sp.secondStat) specialDesc.push(`🌟 Dual affinity — also +${Math.round(sp.secondValue * petPassiveLevelMult(lvl))} ${fmtStat(sp.secondStat)}`);
                if (sp.aura > 0) specialDesc.push(`✨ Menagerie Aura — +${Math.round(sp.aura * 100)}% to all your pets' passives`);
            }
            return {
                id,
                name: def.name,
                rarity: def.rarity || null,
                source: def.source || null,
                hint: def.hint || null,
                level: lvl,
                into: pl.into ?? 0,
                span: pl.span ?? 0,
                maxed: Boolean(pl.maxed),
                tradeable: (pets.earnedTradeableIds || []).includes(id),
                featured: pets.featured === id,
                spriteUrl: art?.url || null,
                spriteFlip: art?.flip || false,
                activeDesc: active ? `+${activeVal}% ${fmtStat(active.stat)} when equipped (Lv ${lvl})` : null,
                passiveDesc: passive ? `+${pets.petLevels?.[id]?.value ?? passive.value} ${fmtStat(passive.stat)} owned (all pets stack)` : null,
                specialDesc,
            };
        })
        .filter(Boolean)
        .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.level - a.level || a.name.localeCompare(b.name));

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
                        <div className="user-profile-dps" title="Passive boss damage per day from equipped gear + pet (before the boss's element bonus)">
                            ⚔️ <strong>{(profile.damagePerDay || 0).toLocaleString()}</strong> boss dmg/day
                        </div>
                    </div>
                </div>
                <ProfileActions targetId={profile.id} targetAlias={profile.alias} relation={relation} signedIn={Boolean(viewer)} />
                {viewer && profile.alias ? (
                    <div style={{ marginTop: 10 }}>
                        <a
                            href={viewer.id === profile.id ? "/marketplace/farm" : `/marketplace/farm?u=${encodeURIComponent(profile.alias)}`}
                            className="pill"
                            style={{ display: "inline-block", fontWeight: 700 }}
                        >
                            🏡 {viewer.id === profile.id ? "Your farm" : `Visit ${profile.displayLabel}'s farm`}
                        </a>
                    </div>
                ) : null}
            </section>

            <PublicGear inventory={inventory} displayLabel={profile.displayLabel} canTrade={Boolean(viewer && viewer.id !== profile.id)} targetAlias={profile.alias} />

            {ship ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>⛵ Ship</h2>
                    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ flex: "0 0 auto", width: 140, maxWidth: "40vw", borderRadius: 14, overflow: "hidden", background: "linear-gradient(180deg,#0b2a45,#123a5c)", padding: 8 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ship.art} alt={ship.name} style={{ width: "100%", height: "auto", display: "block" }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{ship.name}</div>
                            <div className="muted" style={{ marginTop: 2 }}>Level {ship.level} · Form {ship.tier}/{ship.forms}</div>
                            <div className="muted" style={{ marginTop: 2 }}>🏝️ {ship.voyages.toLocaleString()} voyage{ship.voyages === 1 ? "" : "s"} completed</div>
                        </div>
                    </div>
                </section>
            ) : null}

            {(profile.badges || []).length ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>🏅 Badges <span className="muted" style={{ fontSize: "0.8rem", fontWeight: 600 }}>· {profile.badges.length} earned</span></h2>
                    <UserBadges badges={profile.badges} />
                </section>
            ) : null}

            <section className="card">
                <h2 style={{ marginTop: 0 }}>🐾 Pets</h2>
                <p className="muted" style={{ marginTop: 0 }}>Companions {profile.displayLabel} has collected — from leveling, chests, the boss, and the shop.</p>
                <PublicPets pets={petsData} canTrade={Boolean(viewer && viewer.id !== profile.id)} targetAlias={profile.alias} />
            </section>

            {/* Their fishing collection. Gated on the VIEWER being able to fish at all — fishing is still
                owner-only, so this must not advertise itself on every profile in the Den. Renders nothing
                unless they've actually landed something. */}
            {/* Owner-gated exactly like the fishing log above. Renders nothing until they've found a recipe. */}
            {recipeBook?.known ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>📖 Recipe Book</h2>
                    <p className="muted" style={{ marginTop: 0 }}>What {profile.displayLabel} has learned to cook.</p>
                    <PublicRecipeBook book={recipeBook} displayLabel={profile.displayLabel} />
                </section>
            ) : null}

            {fishLog?.caught?.length ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>🎣 Fishing Log</h2>
                    <p className="muted" style={{ marginTop: 0 }}>The biggest of each species {profile.displayLabel} has landed.</p>
                    <PublicFishing log={fishLog} displayLabel={profile.displayLabel} />
                </section>
            ) : null}
        </div>
    );
}
