// Custom profile borders — cosmetic avatar frames. Two kinds:
//   • Level borders — unlocked by reaching a level (the grindable collection).
//   • Role borders — EXCLUSIVE, unlocked only by holding a specific badge (Admin/Dev/Staff/Volunteer).
//     Role borders are NOT unlocked by the staff "unlockAll" bypass — you need the actual badge.
// Pure (no server-only) so the picker, header, track, hero cards, and any avatar surface can import it.
// The visual for each id lives in globals.css as `.av-border-<id>`. Keep ids STABLE (they're stored in
// mkt_buyer.equipped_border).
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
    { id: "solar", label: "Solar", level: 58, icon: "☀️", hint: "A blazing corona", animated: true },
    { id: "abyss", label: "Abyss", level: 72, icon: "🕳️", hint: "Light-swallowing dark", animated: true },
    { id: "godray", label: "Godray", level: 90, icon: "🌟", hint: "Radiance of the divine", animated: true },
    { id: "singularity", label: "Singularity", level: 100, icon: "🌌", hint: "Only for the Fenrir", animated: true },
    // --- Activity-earned (achievement-gated) — NOT level-gated and NOT for sale. Granted into
    // mkt_cosmetic_unlock when you hit the milestone at the activity's completion site (see each system).
    // No `level` on purpose so they never show on the level track; unlocked purely by the `owned` grant.
    { id: "sailor", label: "Seasoned Sailor", icon: "⚓", hint: "A weathered rope-and-anchor frame", animated: false, achievement: true, rarity: "epic", earn: "Complete 10 voyages" },
    { id: "warborn", label: "Warborn", icon: "⚔️", hint: "A raider's war-banner frame", animated: true, achievement: true, rarity: "epic", earn: "Win 10 sea raids" },
    { id: "harvest_crown", label: "Harvest Crown", icon: "🌾", hint: "A crown of golden wheat", animated: false, achievement: true, rarity: "epic", earn: "Harvest 20 crops" },
    { id: "artisan", label: "Artisan's Mark", icon: "🎨", hint: "The maker's signature frame", animated: true, achievement: true, rarity: "rare", earn: "Finish a custom creation" },
    { id: "kindred", label: "Kindred Spirit", icon: "💞", hint: "A warm glow of generosity", animated: true, achievement: true, rarity: "rare", earn: "Rate 10 friends' farms" },
    // --- Role-exclusive (badge-gated) ---
    { id: "role_volunteer", label: "Volunteer", icon: "🙌", hint: "Volunteer-only frame", animated: true, requiresBadges: ["volunteer"], lockLabel: "Volunteers" },
    { id: "role_staff", label: "Staff", icon: "⭐", hint: "Staff-only frame", animated: true, requiresBadges: ["staff"], lockLabel: "Staff only" },
    { id: "role_dev", label: "Developer", icon: "💻", hint: "Dev-only frame", animated: true, requiresBadges: ["developer"], lockLabel: "Devs only" },
    { id: "role_admin", label: "Admin", icon: "🛡️", hint: "Admin-only frame", animated: true, requiresBadges: ["owner", "site_admin"], lockLabel: "Admins only" },
];

export function borderById(id) {
    return BORDERS.find((b) => b.id === id) || BORDERS[0];
}

// True if a member has unlocked this border. Role borders require the badge; level borders the level
// (or `unlockAll`, the staff bypass — which does NOT unlock role borders).
export function isBorderUnlocked(id, level, { badges = [], unlockAll = false, owned = null } = {}) {
    const b = borderById(id);
    if (b.requiresBadges) return b.requiresBadges.some((s) => badges.includes(s));
    // Activity-earned borders are unlocked ONLY by the grant (no level, no staff bypass) — like role borders,
    // they're earned, not leveled into.
    if (b.achievement) return Boolean(owned && owned.has(b.id));
    return (owned && owned.has(b.id)) || unlockAll || Math.max(1, Math.floor(Number(level) || 1)) >= b.level;
}

// The class(es) to hang on an avatar container so it renders the frame. Empty for the default/none.
export function borderClass(id) {
    return id && id !== "none" ? `av-border av-border-${id}` : "";
}

// The catalog annotated with unlocked state for the picker.
export function bordersForLevel(level, { unlockAll = false, badges = [], owned = null } = {}) {
    return BORDERS.map((b) => ({ ...b, unlocked: isBorderUnlocked(b.id, level, { badges, unlockAll, owned }) }));
}
