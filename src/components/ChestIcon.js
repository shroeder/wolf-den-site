// A crafted fantasy treasure-chest icon (per tier) — the reliable default so chests never look like a
// cardboard box. Scales cleanly (used tiny in the grid + big in the opening modal). If an AI-generated
// image exists for a tier it takes precedence in ChestOpener; this is the always-available fallback.

const PALETTES = {
    wooden: { lidA: "#c88a4f", lidB: "#8a552b", bodyA: "#a9713f", bodyB: "#6d4222", band: "#2f2013", metal: "#caa06a", metalD: "#8a6a3f", gem: null, plank: "#5c3a1e" },
    iron: { lidA: "#c6d0da", lidB: "#7c8894", bodyA: "#aab4bf", bodyB: "#69737e", band: "#333b43", metal: "#dfe6ec", metalD: "#8b95a0", gem: null, plank: "#525b64" },
    gold: { lidA: "#ffe79a", lidB: "#e0ac33", bodyA: "#ffd66b", bodyB: "#cf9a25", band: "#9a6f1c", metal: "#fff3c4", metalD: "#c79320", gem: "#ff5c8a", plank: "#b9861f" },
    mythic: { lidA: "#8bffd7", lidB: "#1f6d63", bodyA: "#2a8f86", bodyB: "#123f4a", band: "#0c2733", metal: "#b8fff0", metalD: "#2f9d8c", gem: "#b48bff", plank: "#1b5a5a" },
    ascendant: { lidA: "#ffb37a", lidB: "#d1521a", bodyA: "#ff8a3d", bodyB: "#a8380f", band: "#5c1e08", metal: "#ffd9b0", metalD: "#c9541f", gem: "#fff2a8", plank: "#7a2c0e" },
    eternal: { lidA: "#ff9ee6", lidB: "#c31a9a", bodyA: "#ff5cc8", bodyB: "#8f0e78", band: "#450a3c", metal: "#ffd6f4", metalD: "#c92fa8", gem: "#a8f0ff", plank: "#6a1257" },
};

export default function ChestIcon({ tier = "wooden", className = "", size }) {
    const p = PALETTES[tier] || PALETTES.wooden;
    const uid = `ch-${tier}`;
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            style={{ overflow: "visible" }}
        >
            <defs>
                <linearGradient id={`${uid}-lid`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={p.lidA} />
                    <stop offset="1" stopColor={p.lidB} />
                </linearGradient>
                <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={p.bodyA} />
                    <stop offset="1" stopColor={p.bodyB} />
                </linearGradient>
                <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={p.metal} />
                    <stop offset="1" stopColor={p.metalD} />
                </linearGradient>
                <clipPath id={`${uid}-clip`}>
                    <path d="M9 34 V28 Q9 17 32 17 Q55 17 55 28 V34 Z M8 34 h48 v13 a4 4 0 0 1-4 4 H12 a4 4 0 0 1-4-4 z" />
                </clipPath>
            </defs>

            {/* body */}
            <path d="M8 34 h48 v13 a4 4 0 0 1-4 4 H12 a4 4 0 0 1-4-4 z" fill={`url(#${uid}-body)`} />
            {/* domed lid */}
            <path d="M9 34 V28 Q9 17 32 17 Q55 17 55 28 V34 Z" fill={`url(#${uid}-lid)`} />

            {/* plank / plate seams (clipped to the chest silhouette) */}
            <g clipPath={`url(#${uid}-clip)`} stroke={p.plank} strokeWidth="1" opacity="0.55">
                <path d="M8 41 h48" />
                <path d="M8 46 h48" />
                <path d="M32 34 V52" />
            </g>

            {/* lid top highlight */}
            <path d="M14 26 Q32 20 50 26" stroke={p.metal} strokeWidth="1.4" strokeLinecap="round" opacity="0.45" fill="none" />

            {/* metal rim between lid and body */}
            <rect x="6" y="32.5" width="52" height="4.5" rx="2.2" fill={`url(#${uid}-metal)`} />

            {/* vertical bands with rivets */}
            <g clipPath={`url(#${uid}-clip)`}>
                {[15.5, 42.5].map((x) => (
                    <g key={x}>
                        <rect x={x} y="16" width="6" height="36" fill={p.band} />
                        <rect x={x} y="16" width="2" height="36" fill={p.metal} opacity="0.25" />
                        {[21, 44, 49].map((cy) => (
                            <circle key={cy} cx={x + 3} cy={cy} r="1" fill={p.metal} opacity="0.8" />
                        ))}
                    </g>
                ))}
            </g>

            {/* lock plate */}
            <rect x="27.5" y="31" width="9" height="11" rx="1.6" fill={`url(#${uid}-metal)`} stroke={p.metalD} strokeWidth="0.6" />
            {p.gem ? (
                <circle cx="32" cy="35.5" r="2.1" fill={p.gem} stroke="#ffffff" strokeWidth="0.5" opacity="0.95" />
            ) : (
                <circle cx="32" cy="35.5" r="1.5" fill={p.band} />
            )}
            <rect x="31.2" y="36.4" width="1.6" height="3.4" rx="0.8" fill={p.band} />

            {/* corner brackets */}
            {[[8.5, 47.5], [52, 47.5]].map(([x, y], i) => (
                <path key={i} d={`M${x} ${y} h4 M${x} ${y} v-3`} stroke={p.metalD} strokeWidth="1.4" strokeLinecap="round" />
            ))}

            {/* mythic: floating rune sparks */}
            {tier === "mythic" ? (
                <g fill="#d6fff4">
                    <circle cx="12" cy="22" r="1.1" opacity="0.9" />
                    <circle cx="53" cy="24" r="0.9" opacity="0.75" />
                    <circle cx="48" cy="14" r="0.8" opacity="0.6" />
                </g>
            ) : null}
        </svg>
    );
}
