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
    { id: "runed", label: "Runed", level: 74, icon: "🔯", hint: "Etched with glowing runes", animated: true },
    { id: "celestial", label: "Celestial", level: 96, icon: "🌌", hint: "Woven from starlight", animated: true },
    // --- Role-exclusive (badge-gated, NOT unlocked by the level/staff bypass) ---
    { id: "role_volunteer", label: "Volunteer", icon: "🙌", hint: "Volunteer-only frame", animated: false, requiresBadges: ["volunteer"], lockLabel: "Volunteers" },
    { id: "role_staff", label: "Staff", icon: "⭐", hint: "Staff-only frame", animated: false, requiresBadges: ["staff"], lockLabel: "Staff only" },
    { id: "role_dev", label: "Developer", icon: "💻", hint: "Dev-only frame", animated: true, requiresBadges: ["developer"], lockLabel: "Devs only" },
    { id: "role_admin", label: "Admin", icon: "🛡️", hint: "Admin-only frame", animated: true, requiresBadges: ["owner", "site_admin"], lockLabel: "Admins only" },
];

export function frameById(id) {
    return FRAMES.find((f) => f.id === id) || FRAMES[0];
}

// Role frames require the badge; level frames the level (or `unlockAll`, the staff bypass — which does
// NOT unlock role frames).
export function isFrameUnlocked(id, level, { badges = [], unlockAll = false } = {}) {
    const f = frameById(id);
    if (f.requiresBadges) return f.requiresBadges.some((s) => badges.includes(s));
    return unlockAll || Math.max(1, Math.floor(Number(level) || 1)) >= f.level;
}

// The class(es) to hang on the card container so it draws the inset frame. Empty for the default/none.
export function frameClass(id) {
    return id && id !== "none" ? `frame frame-${id}` : "";
}

export function framesForLevel(level, { unlockAll = false, badges = [] } = {}) {
    return FRAMES.map((f) => ({ ...f, unlocked: isFrameUnlocked(f.id, level, { badges, unlockAll }) }));
}
