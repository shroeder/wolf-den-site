// Custom profile frames — a decorative textured border drawn INSET from the card edge (in the card's
// padding / "quiet zone"), so it differentiates a member's card without overlapping the avatar, name,
// or badges. Unlocked by level, equipped by the member. Pure (no server-only) so the picker + hero +
// public profile can all import it. The visual for each id lives in globals.css as `.frame-<id>::after`.
// Keep ids STABLE (stored in mkt_buyer.equipped_frame).
export const FRAMES = [
    { id: "none", label: "None", level: 1, icon: "⬜", hint: "No frame", animated: false },
    { id: "hairline", label: "Hairline", level: 2, icon: "▫️", hint: "A thin gold edge", animated: false },
    { id: "rope", label: "Rope", level: 5, icon: "🪢", hint: "Braided rope trim", animated: false },
    { id: "studded", label: "Studded", level: 8, icon: "⚙️", hint: "Riveted metal studs", animated: false },
    { id: "bevel", label: "Bevel", level: 11, icon: "🔲", hint: "A beveled double edge", animated: false },
    { id: "groove", label: "Groove", level: 15, icon: "〰️", hint: "An embossed groove", animated: false },
    { id: "weave", label: "Weave", level: 20, icon: "🧶", hint: "A woven lattice", animated: false },
    { id: "circuit", label: "Circuit", level: 26, icon: "🔌", hint: "Glowing circuit lines", animated: false },
    { id: "laurel", label: "Laurel", level: 32, icon: "🌿", hint: "A gilded laurel edge", animated: false },
    { id: "ember", label: "Ember", level: 40, icon: "🔥", hint: "A smoldering ember trim", animated: true },
    { id: "royal", label: "Royal", level: 46, icon: "👑", hint: "An ornate royal frame", animated: false },
    { id: "mythic", label: "Mythic", level: 50, icon: "🌈", hint: "A living prismatic frame", animated: true },
];

export function frameById(id) {
    return FRAMES.find((f) => f.id === id) || FRAMES[0];
}

export function isFrameUnlocked(id, level, { unlockAll = false } = {}) {
    return unlockAll || Math.max(1, Math.floor(Number(level) || 1)) >= frameById(id).level;
}

// The class(es) to hang on the card container so it draws the inset frame. Empty for the default/none.
export function frameClass(id) {
    return id && id !== "none" ? `frame frame-${id}` : "";
}

export function framesForLevel(level, { unlockAll = false } = {}) {
    return FRAMES.map((f) => ({ ...f, unlocked: isFrameUnlocked(f.id, level, { unlockAll }) }));
}
