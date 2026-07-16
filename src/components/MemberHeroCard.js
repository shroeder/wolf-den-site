import Link from "next/link";

import AvatarStack from "@/components/AvatarStack";
import CardTab from "@/components/CardTab";
import UserBadges from "@/components/UserBadges";
import { frameClass } from "@/lib/marketplace/frames.js";
import { rankForLevel } from "@/lib/marketplace/ranks.js";

// One member, rendered as a rich "hero card": avatar with their equipped border, name + @handle, rank
// chip, level, and badge row. `action` is an optional node (Add / Message / Accept button) shown on the
// right. `href` makes the identity area a link (to their public profile). Presentational + reusable.
export default function MemberHeroCard({ member, action = null, href = null, compact = false }) {
    if (!member) return null;
    const rank = rankForLevel(member.level || 1);
    const initial = (member.displayLabel || member.alias || "?").slice(0, 1).toUpperCase();

    const identity = (
        <>
            <AvatarStack avatarUrl={member.avatarUrl} initial={initial} size={48} border={member.border} cosmetics={member.avatarCosmetics} className="hero-card-av-stack" />
            <span className="hero-card-body">
                <span className="hero-card-name">{member.displayLabel}</span>
                {member.alias ? <span className="hero-card-handle muted">@{member.alias}</span> : null}
                <span className="hero-card-meta">
                    <span className="rank-chip rank-chip-sm">{rank.emoji} {rank.title}</span>
                    <span className="hero-card-lv">Lv {member.level || 1}</span>
                </span>
                {!compact && (member.displayBadges || member.badges)?.length ? <UserBadges badges={member.displayBadges || member.badges} /> : null}
            </span>
        </>
    );

    return (
        <div className={`hero-card${compact ? " is-compact" : ""}${member.featuredBadge ? " has-card-tab" : ""} ${frameClass(member.frame)}`.trim()}>
            <CardTab badge={member.featuredBadge} compact />
            {href ? (
                <Link href={href} className="hero-card-main">{identity}</Link>
            ) : (
                <div className="hero-card-main">{identity}</div>
            )}
            {action ? <div className="hero-card-action">{action}</div> : null}
        </div>
    );
}
