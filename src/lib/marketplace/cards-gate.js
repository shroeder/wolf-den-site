// ── THE ONE SWITCH THE CARD GAME HANGS ON ────────────────────────────────────────────────────────────────────
// Its own tiny module for one reason: collectibles.js needs it to hide the four exclusive pets, and
// collectibles.js is imported by nearly everything. Putting the flag in cards-kit.js would drag the whole card
// engine — every card, perk, potion and foe script — into the farm, the arena and the shop.
//
// The Road's two exclusives use exactly this shape (SEASON_HIDDEN off SEASON_PUBLIC) and for exactly this
// reason. LAUNCHED 2026-09-11: the four pets are in the collection with everything else, earned at card
// ranks 3, 5, 10 and 15 and reachable no other way -- `source: "cards"` matches no drop pool.
export const CARDS_PUBLIC = true;
export const CARDS_HIDDEN = !CARDS_PUBLIC;
