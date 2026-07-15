// Custom profile borders — cosmetic avatar frames unlocked by level and equipped by the member.
// Pure (no server-only) so the picker, header, and any avatar surface can import the class helper.
// The visual for each id lives in globals.css as `.av-border-<id>`. `level` is the unlock level.
export const BORDERS = [
    { id: "none", label: "No border", level: 1, hint: "Clean look", animated: false },
    { id: "bronze", label: "Bronze", level: 5, hint: "A first mark of a regular", animated: false },
    { id: "silver", label: "Silver", level: 15, hint: "You're a known face", animated: false },
    { id: "emerald", label: "Emerald", level: 20, hint: "Standing out", animated: false },
    { id: "gold", label: "Gold", level: 30, hint: "Wolf Den elite", animated: false },
    { id: "amethyst", label: "Amethyst", level: 40, hint: "Glowing prestige", animated: true },
    { id: "legendary", label: "Legendary", level: 50, hint: "The rarest frame in the Den", animated: true },
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

// The catalog annotated with unlocked state for the picker.
export function bordersForLevel(level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    return BORDERS.map((b) => ({ ...b, unlocked: lvl >= b.level }));
}
