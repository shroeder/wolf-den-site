import Link from "next/link";

import AvatarStack from "@/components/AvatarStack";
import FeaturedCollectible from "@/components/FeaturedCollectible";
import UserBadges from "@/components/UserBadges";
import UserLevel from "@/components/UserLevel";
import { borderClass } from "@/lib/marketplace/borders.js";
import { nextRank, rankForLevel } from "@/lib/marketplace/ranks.js";

// The top of the rewards hub: identity + progress, built to feel like a game profile, not a form.
// A level ring wraps the avatar and fills with your progress; the XP bar sweeps and counts up on load;
// a rank chip names where you stand and teases the next rank. The CTA opens the full rewards track.
export default function RewardsHubHero({ displayLabel, avatarUrl, badges = [], level, border = "none", cosmetics = null, featuredCollectibleId = null }) {
    if (!level) return null;
    const pct = Math.round(Math.min(1, Math.max(0, level.progress || 0)) * 100);
    const rank = rankForLevel(level.level);
    const next = nextRank(level.level);
    const initial = (displayLabel || "?").slice(0, 1).toUpperCase();

    return (
        <div className="rewards-hero">
            <div className="rewards-hero-id">
                <Link
                    href="/marketplace/profile/avatar"
                    className={`level-ring is-editable ${borderClass(border)}`.trim()}
                    style={{ "--ring-pct": `${pct}%` }}
                    aria-label="Edit your avatar"
                    title="Edit your avatar"
                >
                    <AvatarStack avatarUrl={avatarUrl} initial={initial} size={82} cosmetics={cosmetics} className="level-ring-stack" />
                    <span className="level-ring-badge">Lv {level.level}</span>
                    <span className="level-ring-edit" aria-hidden="true">✏️</span>
                </Link>
                <div className="rewards-hero-meta">
                    <div className="rank-chip">
                        <span aria-hidden="true">{rank.emoji}</span> {rank.title}
                    </div>
                    <div className="rewards-hero-name">{displayLabel || "Member"}</div>
                    <UserBadges badges={badges} />
                    {featuredCollectibleId ? <FeaturedCollectible id={featuredCollectibleId} size="sm" /> : null}
                </div>
            </div>

            <UserLevel level={level} />

            <div className="rewards-hero-next">
                {next ? (
                    <>
                        <span aria-hidden="true">{next.emoji}</span> Next rank: <strong>{next.title}</strong> at Level {next.level}
                    </>
                ) : (
                    <>👑 Top rank reached — you&apos;re a Wolf Den legend.</>
                )}
            </div>

            <div className="rewards-hero-actions">
                <Link href="/marketplace/track" className="rewards-preview-btn">
                    View your rewards track →
                </Link>
            </div>
        </div>
    );
}
