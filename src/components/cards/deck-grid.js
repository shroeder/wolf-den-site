// ── LOOKING AT A WHOLE DECK, ON A PHONE ──────────────────────────────────────────────────────────────────
// Four screens show you every card you own at once — the campfire's "hold one in the fire", the merchant's
// "burn one", the map's deck panel, and the fight's draw/discard peek — and all four laid them out the same
// way: a wrapping flex row of 96px cards with an 8px gap.
//
// ⚠️ THAT ROW FITS THREE ACROSS ON SOME PHONES AND TWO ON OTHERS, AND NOBODY CHOSE WHICH. The campfire panel
// is min(560px, 100vw - 28px) with 14px of its own padding, so its inner width is the screen minus 56. Three
// 96px cards and two 8px gaps need 304. That clears 393px comfortably (337 available) and MISSES on a 355px
// screen (299 available) by five pixels — so the same panel is a tidy three-wide grid on one handset and a
// two-wide column you scroll twice as far on the next. Luke, on the second kind: "feels like we could do 3
// per row."
//
// So the row stops being a row. Three real columns, and the CARD is measured off the column it landed in
// rather than off a number somebody hoped would fit: 100cqw is the column's own width, and the card takes
// that or 96px, whichever is smaller. A narrower phone gets slightly smaller cards; it never gets a
// different layout. The four pixels come off because .cf-name hangs about 7px past the card on each side —
// see CardFace — so a card drawn at exactly the column width has its title banner touching its neighbour's.
//
// ⚠️ ONE COPY, IMPORTED FOUR TIMES, and that is the point. This started as four identical CSS lines in four
// files, which is how they came to be identical in the wrong way: the flaw was written once and pasted three
// times, and fixing it in the file you happened to be looking at would have left three screens still doing
// it. Interpolated into each component's own <style jsx global>; styled-jsx de-duplicates identical rules.
//
// If a container query is unsupported the min() is invalid and --cf-w is simply never set, so .cf-card falls
// back to its own var(--cf-w, 96px) default — the layout it had before this file existed.
export const DECK_GRID_CSS = `
    .cf-deck-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px 8px; align-items: start; width: 100%; }
    .cf-deck-grid > * { container-type: inline-size;
        display: flex; justify-content: center; align-items: flex-start; }
    .cf-deck-grid .cf-card { --cf-w: min(96px, calc(100cqw - 4px));
        --cf-h: calc(var(--cf-w) * 1.4375); }
`;
