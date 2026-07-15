"use client";

import UserBadges from "@/components/UserBadges";
import UserLevel from "@/components/UserLevel";
import { nextRank, rankForLevel } from "@/lib/marketplace/ranks.js";

// The top of the rewards hub: identity + progress, built to feel like a game profile, not a form.
// A level ring wraps the avatar and fills with your progress; the XP bar sweeps and counts up on load;
// a rank chip names where you stand and teases the next rank. Preview buttons let you watch the
// level-up celebration on demand (fires the same overlay a real level-up does, via a window event).
export default function RewardsHubHero({ displayLabel, avatarUrl, badges = [], level }) {
    if (!level) return null;
    const pct = Math.round(Math.min(1, Math.max(0, level.progress || 0)) * 100);
    const rank = rankForLevel(level.level);
    const next = nextRank(level.level);
    const initial = (displayLabel || "?").slice(0, 1).toUpperCase();

    const preview = (lvl) => {
        window.dispatchEvent(new CustomEvent("wolfden-levelup-preview", { detail: { level: lvl } }));
    };
    // Pick a milestone level to preview: the next multiple of 5 at or above their next level.
    const previewLevel = level.level + 1;
    const milestoneLevel = Math.max(5, Math.ceil(previewLevel / 5) * 5);

    return (
        <div className="rewards-hero">
            <div className="rewards-hero-id">
                <div className="level-ring" style={{ "--ring-pct": `${pct}%` }}>
                    <div className="user-avatar user-avatar-xl">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" />
                        ) : (
                            <span aria-hidden="true">{initial}</span>
                        )}
                    </div>
                    <span className="level-ring-badge">Lv {level.level}</span>
                </div>
                <div className="rewards-hero-meta">
                    <div className="rank-chip">
                        <span aria-hidden="true">{rank.emoji}</span> {rank.title}
                    </div>
                    <div className="rewards-hero-name">{displayLabel || "Member"}</div>
                    <UserBadges badges={badges} />
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
                <button type="button" className="rewards-preview-btn" onClick={() => preview(previewLevel)}>
                    ✨ Preview my level-up
                </button>
                <button type="button" className="rewards-preview-btn is-ghost" onClick={() => preview(milestoneLevel)}>
                    🏆 Preview a milestone
                </button>
            </div>
        </div>
    );
}
