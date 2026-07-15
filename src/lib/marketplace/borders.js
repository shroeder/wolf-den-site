// Custom profile borders — cosmetic avatar frames unlocked by level and equipped by the member.
// Pure (no server-only) so the picker, header, track, and any avatar surface can import from here.
// The visual for each id lives in globals.css as `.av-border-<id>` (box-shadow rings/glows so they
// render on ANY avatar without being clipped). `level` = unlock level; `animated`/`glow` are hints;
// `icon` is shown on the rewards track. Keep ids STABLE (they're stored in mkt_buyer.equipped_border).
export const BORDERS = [
    { id: "none", label: "No border", level: 1, icon: "⚪", hint: "Clean look", animated: false },
    { id: "ember", label: "Ember", level: 3, icon: "🔥", hint: "A warm breathing glow", animated: true },
    { id: "bronze", label: "Bronze", level: 5, icon: "🥉", hint: "First mark of a regular", animated: false },
    { id: "aqua", label: "Aqua", level: 7, icon: "💧", hint: "Cool cyan glow", animated: false },
    { id: "neon", label: "Neon", level: 10, icon: "⚡", hint: "Electric pulse", animated: true },
    { id: "silver", label: "Silver", level: 15, icon: "🥈", hint: "A known face", animated: false },
    { id: "crimson", label: "Crimson", level: 18, icon: "❤️", hint: "Bold red glow", animated: false },
    { id: "emerald", label: "Emerald", level: 20, icon: "🟢", hint: "Standing out", animated: false },
    { id: "sunset", label: "Sunset", level: 22, icon: "🌇", hint: "Orange-to-pink shift", animated: true },
    { id: "sky", label: "Sky", level: 25, icon: "💙", hint: "Bright blue glow", animated: false },
    { id: "rose", label: "Rose", level: 28, icon: "🌹", hint: "Soft pink glow", animated: false },
    { id: "gold", label: "Gold", level: 30, icon: "🥇", hint: "Wolf Den elite", animated: false },
    { id: "ocean", label: "Ocean", level: 33, icon: "🌊", hint: "Rolling blue-cyan wave", animated: true },
    { id: "aurora", label: "Aurora", level: 36, icon: "🌌", hint: "Northern-lights drift", animated: true },
    { id: "amethyst", label: "Amethyst", level: 40, icon: "🔮", hint: "Glowing prestige", animated: true },
    { id: "frost", label: "Frost", level: 43, icon: "❄️", hint: "Icy shimmer", animated: true },
    { id: "inferno", label: "Inferno", level: 46, icon: "🌋", hint: "Flickering fire", animated: true },
    { id: "rainbow", label: "Rainbow", level: 48, icon: "🌈", hint: "Full-spectrum cycle", animated: true },
    { id: "cosmic", label: "Cosmic", level: 49, icon: "✨", hint: "Deep-space color drift", animated: true },
    { id: "legendary", label: "Legendary", level: 50, icon: "👑", hint: "The rarest frame in the Den", animated: true },
];

export function borderById(id) {
    return BORDERS.find((b) => b.id === id) || BORDERS[0];
}

// True if a member at `level` has unlocked this border.
export function isBorderUnlocked(id, level) {
    return (Math.max(1, Math.floor(Number(level) || 1))) >= borderById(id).level;
}

// The class(es) to hang on an avatar container so it renders the frame. Empty for the default/none.
export function borderClass(id) {
    return id && id !== "none" ? `av-border av-border-${id}` : "";
}

// The catalog annotated with unlocked state for the picker. `unlockAll` (staff perk) unlocks everything.
export function bordersForLevel(level, unlockAll = false) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    return BORDERS.map((b) => ({ ...b, unlocked: unlockAll || lvl >= b.level }));
}
