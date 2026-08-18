// ── HOW BIG THE THING THAT CAME UP IS ────────────────────────────────────────────────────────────────────────
// Pure and client-safe, in its own module rather than inside the scene component, for one practical reason:
// this is arithmetic with a 400,000x input range and it needs to be checkable. A formula living in a .js file
// full of JSX cannot be imported by a script, and the only way to "verify" it would be to re-type it somewhere
// else — which is exactly the trap sim-arena.mjs spent months in.
//
// Everything surfaced at one size, so a chest came up as big as a leviathan and a sardine came up as big as the
// chest — which made the one beat the whole rework exists for say nothing about what you caught.
//
// A FISH IS SCALED BY WHAT IT ACTUALLY WEIGHED, not by its species or its rarity. The catch already carries the
// measured weight, the table spans a Sand Cockle at 0.1 to a Sunlit Whale at 40,000, and that is 400,000x — so
// it has to be a log scale or everything below a whale is a dot. It also means a record specimen visibly comes
// up bigger than an ordinary one of the same fish, which is free and is the entire point of having measured it.
//
// The Fallen Star is mythic and tiny (0.5-9), and it correctly surfaces small. That is right: rarity is not
// size, and a starfish the size of a kraken would be a lie the water told you.
const HAUL_MIN = 0.5, HAUL_MAX = 1.85;
const clampScale = (n) => Math.max(HAUL_MIN, Math.min(HAUL_MAX, Math.round(n * 100) / 100));
export function haulScale(landed) {
    if (!landed) return 1;
    // A monster is sized by its tier — a Reef Crawler is a nuisance on the deck, the World Serpent is bigger
    // than the boat, and the tier is the only thing that orders them.
    if (landed.kind === "monster") return clampScale(0.78 + (Number(landed.tier) || 1) * 0.21);
    // A chest is a chest. It does not grow with its tier: a mythic chest is worth more, not larger, and the
    // rarity ring on the reveal card is what says so.
    if (landed.kind === "treasure") return clampScale(0.62);
    const lb = Number(landed.lb) || 0;
    if (lb <= 0) return 0.8;
    return clampScale(0.42 + 0.16 * Math.log10(Math.max(1, lb / 0.1)));
}
