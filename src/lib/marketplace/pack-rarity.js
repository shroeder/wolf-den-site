// ── HOW GOOD WAS THAT PULL ───────────────────────────────────────────────────────────────────────────────────
// One table, imported by the reveal, the vault tile, the pool board and the admin screens. Never copied — a
// second copy of a rarity table is how the card that slammed down gold gets filed under "rare" in the vault.
//
// ⚠️ THE COLOUR IS DRIVEN BY VALUE, NOT BY PRINTED RARITY. The pool knows both (printed rarity is parsed out
// of card_name — see pack-card-name.js) and the readout shows both, but what drives the flash, the shake and
// the sound is what the card is WORTH. In a mystery pack that is the thing the player actually cares about,
// and a $4 Secret Rare must not out-flash an $80 promo.
//
// ⚠️ AND THE TIER IS STAMPED ON THE OPEN, NOT RECOMPUTED. mkt_pack_open.tier is written once, at open. Retune
// these bands whenever you like and every pull that already happened keeps the tier it was celebrated with.
//
// ── WHERE THE BANDS CAME FROM ────────────────────────────────────────────────────────────────────────────────
// Measured against the live pool on 2026-10-26 (79 active bags, EV $17.39). The first proposal was a guess —
// <$5 / $5-15 / $15-40 / $40-100 / $100-250 / $250+ — and against the real spread it put **53.2% of every open
// on the bottom tier**: more than half of all pulls would be grey slate and a dry tap. These bands are the
// same six names re-cut against what is actually in the tub:
//
//     common    <$3      32.9%        epic      $20-60     16.5%
//     uncommon  $3-8     35.4%        legendary $60-150     5.1%
//     rare      $8-20     8.9%        mythic    $150+       1.3%
//
// A third common, a third uncommon, and ~23% landing rare-or-better instead of 10%.
//
// The middle band is thin no matter where the lines go, and that is a property of the pool rather than a fault
// in the table: the bags are bimodal — cheap filler and genuine hits, little in between. Which is a compliment
// to how they are built. It means roughly one open in four is genuinely worth sitting through the animation.

/**
 * Lowest first. `min` is inclusive, and the last tier is open-ended.
 *
 * `glow`/`edge` are the rarity colour; `shake` is the slam's screen-shake amplitude in CSS pixels; `sustain`
 * is how long the flood holds, in ms. Everything the reveal needs to differentiate a tier is here, so the
 * component never hard-codes a colour or a duration of its own.
 */
export const PACK_TIERS = [
    { key: "common", label: "Common", min: 0, glow: "#94a3b8", edge: "#64748b", shake: 2, sustain: 260 },
    { key: "uncommon", label: "Uncommon", min: 300, glow: "#4ade80", edge: "#16a34a", shake: 4, sustain: 360 },
    { key: "rare", label: "Rare", min: 800, glow: "#60a5fa", edge: "#2563eb", shake: 7, sustain: 480 },
    { key: "epic", label: "Epic", min: 2000, glow: "#c084fc", edge: "#7c3aed", shake: 10, sustain: 620 },
    { key: "legendary", label: "Legendary", min: 6000, glow: "#fbbf24", edge: "#d97706", shake: 14, sustain: 900 },
    { key: "mythic", label: "Mythic", min: 15000, glow: "#fb7185", edge: "#e11d48", shake: 14, sustain: 1200 },
];

/** A pull at or above this is a "big hit" — the same $100 threshold the in-store badge already uses. */
export const BIG_HIT_CENTS = 10000;

const FALLBACK = PACK_TIERS[0];

/** The tier for a value in CENTS. Everything in this feature is cents; a dollars float here is a bug. */
export function tierForCents(cents) {
    const value = Math.max(0, Math.round(Number(cents) || 0));
    let found = FALLBACK;
    for (const tier of PACK_TIERS) {
        if (value >= tier.min) found = tier;
        else break;
    }
    return found;
}

/**
 * Look a tier up by the key stored on a historical row.
 *
 * ⚠️ FALLS BACK TO THE BOTTOM TIER, DELIBERATELY. If these bands are ever renamed, an old `mkt_pack_open` row
 * still carries the old key — and a lookup that returned undefined would crash the vault rather than render a
 * slightly wrong colour. A ladder lookup must never drop a caller on the floor.
 */
export function tierByKey(key) {
    return PACK_TIERS.find((t) => t.key === String(key || "")) || FALLBACK;
}

export const isBigHit = (cents) => (Number(cents) || 0) >= BIG_HIT_CENTS;
