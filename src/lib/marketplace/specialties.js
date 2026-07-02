// Curated vendor-specialty vocabulary. Shared by the portal editor (checkboxes), server-side
// validation, and the browse-directory filter — a fixed list keeps filtering consistent.

export const VENDOR_SPECIALTIES = [
    "Pokémon Sealed",
    "Pokémon Singles",
    "Vintage Pokémon",
    "Japanese Pokémon",
    "MTG Sealed",
    "MTG Commander",
    "MTG Singles",
    "Yu-Gi-Oh!",
    "One Piece",
    "Lorcana",
    "Sports Cards",
    "Sports Wax",
    "High-End Singles",
    "Graded / Slabs",
    "Supplies & Accessories",
];

const VENDOR_SPECIALTY_SET = new Set(VENDOR_SPECIALTIES);

// Keep only valid, de-duplicated specialties (order preserved by the canonical list).
export function sanitizeSpecialties(input) {
    if (!Array.isArray(input)) {
        return [];
    }
    const chosen = new Set(input.filter((s) => VENDOR_SPECIALTY_SET.has(s)));
    return VENDOR_SPECIALTIES.filter((s) => chosen.has(s));
}
