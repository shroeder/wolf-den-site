// ── THE ONE SWITCH THE CARD GAME HANGS ON ────────────────────────────────────────────────────────────────────
// Its own tiny module for one reason: collectibles.js needs it to hide the four exclusive pets, and
// collectibles.js is imported by nearly everything. Putting the flag in cards-kit.js would drag the whole card
// engine — every card, perk, potion and foe script — into the farm, the arena and the shop.
//
// The Road's two exclusives use exactly this shape (SEASON_HIDDEN off SEASON_PUBLIC) and for exactly this
// reason. When the card game launches, flip CARDS_PUBLIC and the four pets appear in the collection with
// everything else.
export const CARDS_PUBLIC = false;
export const CARDS_HIDDEN = !CARDS_PUBLIC;
