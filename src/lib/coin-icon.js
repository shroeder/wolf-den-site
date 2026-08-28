// ── ONE PATH TO THE COIN ─────────────────────────────────────────────────────────────────────────────────────
// Both the <Coin /> component and the plain data tables (crop labels, check-in tiles, town projects) need to
// name the coin art, and the tables are server-side data that must not import a React component to do it. So
// the path lives here, in lib, and both sides import it rather than each writing the string out again.
export const COIN_ICON = "/images/ui/coin.png";

// Some of those tables are also flattened into a plain SENTENCE server-side ("🌱 +5% more harvest gold"), and
// a file path pasted into a sentence reads as a file path. A builder that cannot draw a picture drops the
// glyph rather than spelling it out; the JSX render sites use <Glyph /> and still show the coin.
export const isIconPath = (v) => typeof v === "string" && v.startsWith("/");
export const textIcon = (v) => (isIconPath(v) ? "" : `${v} `);
