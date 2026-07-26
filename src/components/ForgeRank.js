"use client";

import { forgeRank } from "@/lib/marketplace/forge-rank.js";

// A small overlay badge for an enhanced item: the AI tier emblem (or a numeral fallback), a colored aura, and a
// "+level" tag. Renders nothing for un-enhanced gear. Owner-gated by virtue of who has enhancement data.
export default function ForgeRank({ level, size = 26, showLevel = true, title = true }) {
    const r = forgeRank(level);
    if (!r) return null;
    return (
        <span className="forge-rank" title={title ? `${r.label} · +${r.level}` : undefined} style={{ "--rk": r.color, width: size, height: size }}>
            {r.emblem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.emblem} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />
            ) : <b style={{ color: r.color }}>{r.tier}</b>}
            {showLevel ? <em>+{r.level}</em> : null}
        </span>
    );
}
