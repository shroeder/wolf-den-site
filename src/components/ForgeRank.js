"use client";

import { forgeRank } from "@/lib/marketplace/forge-rank.js";

// A small overlay badge for an enhanced item: 1–3 colored stars whose count + color encode the enhancement level
// (no numbers). 1★→3★ within a color, then it climbs to the next color; caps at prismatic (peak). Renders
// nothing for un-enhanced gear.
export default function ForgeRank({ level, size = 26, title = true }) {
    const r = forgeRank(level);
    if (!r) return null;
    return (
        <span
            className={`forge-rank${r.rainbow ? " is-rainbow" : ""}${r.maxed ? " is-max" : ""}`}
            title={title ? r.label : undefined}
            style={{ "--rk": r.color, "--star": `${Math.round(size * 0.62)}px` }}
        >
            {Array.from({ length: r.stars }).map((_, i) => <b key={i} className="forge-star">★</b>)}
        </span>
    );
}
