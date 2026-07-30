"use client";

import { useState } from "react";

// Someone else's fishing collection, on their profile. A log only you can see is half a collection — the
// reason to keep casting once you've seen every species is that your Marlin can be bigger than theirs.
//
// Shows only what they've actually LANDED: the full roster on a stranger's profile would read as a list of
// their gaps rather than their trophies (and would leak the whole species list while fishing is unreleased).

const RARITY_COLOR = {
    common: "#cfd8e3", rare: "#7ec8ff", epic: "#c9a2ff", legendary: "#ffd75e", mythic: "#ff9ec4",
};

function weightLabel(lb) {
    const n = Number(lb) || 0;
    if (!n) return "—";
    if (n < 1) return `${Math.round(n * 16)} oz`;
    if (n < 10) return `${n.toFixed(1)} lb`;
    return `${Math.round(n).toLocaleString()} lb`;
}

function FishArt({ id, emoji, size = 34 }) {
    const [failed, setFailed] = useState(false);
    if (!id || failed) return <span style={{ fontSize: size * 0.8 }} aria-hidden="true">{emoji}</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/images/fish/${id}.png`} alt="" aria-hidden="true" width={size} height={size}
        style={{ width: size, height: size, objectFit: "contain" }} onError={() => setFailed(true)} />;
}

export default function PublicFishing({ log, displayLabel = "They" }) {
    if (!log?.caught?.length) return null;
    return (
        <div className="cshare" style={{ marginTop: 0 }}>
            <div className="cshare-grouphead">
                🎣 Fishing
                <span>{log.known} of {log.species} species · {log.total.toLocaleString()} landed</span>
            </div>
            <div className="fish-log-grid">
                {log.caught.map((f) => (
                    <div key={f.id} className="fish-log-row">
                        <FishArt id={f.id} emoji={f.emoji} />
                        <span className="fish-log-name">
                            {f.name}
                            <em style={{ color: RARITY_COLOR[f.rarity] }}>×{f.caught}</em>
                        </span>
                        <span className="fish-log-best">
                            <strong>{weightLabel(f.best)}</strong>
                            {f.beatsRange ? <em className="fish-over">🏆 record class</em> : null}
                        </span>
                    </div>
                ))}
            </div>
            <p className="muted" style={{ fontSize: "0.74rem", margin: "6px 2px 0" }}>
                {displayLabel}&apos;s personal bests — beat one and it&apos;s yours.
            </p>
        </div>
    );
}
