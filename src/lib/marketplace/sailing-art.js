// ── ART THAT GETS REDRAWN NEEDS A VERSION ────────────────────────────────────────────────────────────────
// Static files under /public are served `max-age=86400`. Redraw one and keep the filename and every device
// that already loaded it keeps the OLD picture for up to a day — the CDN can be perfectly up to date while
// the phone in your hand is not.
//
// That is exactly what happened here. The haunted sky was regenerated four times at the same path while
// Luke watched a screen that never changed, and he worked it out before I did: "why do you not bring the
// water line up, is the background image cached or something?" It was. The edge was serving the new bytes;
// his phone was not asking for them.
//
// ⚠️ BUMP THIS WHENEVER SKY ART IS REDRAWN IN PLACE. New art at a NEW path does not need it — only
// replacement does. And this file deliberately has no server-only imports, so the client component and the
// server page can share one constant instead of drifting apart.
export const SAILING_ART_V = 5;

/** The haunted sky, cache-busted. Both the server page and the client picker must use this, not a literal. */
export const HAUNTED_SKY = `/images/sailing/sky-haunted.png?v=${SAILING_ART_V}`;

/** The dig pit, when the flag is up. A NEW path, so it needs no version — only replacement does. */
export const HAUNTED_DIG_BG = "/images/sailing/dig-haunted.png";
