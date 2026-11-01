// ── THE $20 MYSTERY BAGS, ON ONE SWITCH ─────────────────────────────────────────────────────────────────────
// Luke, 2026-11-01: "I think we need to, for now, disable the mystery bags. I don't want that page to show up
// anymore for the time being, but I want the freedom to turn it back on later if I do decide I want it back.
// And then on the live rips, that feature, we're going to hide the $20 mystery packs area also."
//
// Same shape as VAULT_PUBLIC and SHELF_PACKS_PUBLIC in vault-gate.js, and for the same stated reason: the
// flag is the way BACK. Deleting /mystery-bags and the bags pool entry would mean re-deriving six doors under
// pressure the day he wants it again, which is [[feature-gates-come-in-pairs]] in its worst form.
//
// ⚠️ THIS IS ITS OWN SWITCH, NOT A REUSE OF VAULT_PUBLIC. The virtual rips room and the Card Vault stay open;
// only the $20 bag goes away. Reusing the vault flag would shut the shelf pools too — the exact mistake
// vault-gate.js documents when SHELF_PACKS_PUBLIC had to be split out.
//
// ⚠️ PLAIN MODULE, NO `server-only` AND NO IMPORTS. SiteHeader is a client component and reads this to drop
// the nav row; pulling in owner.js (and its Hallowe'en/Square chain) from the client bundle is how a server
// module ends up shipped to the browser. `bagsOpenFor` — the per-member question — lives in vault-gate.js
// where the rest of the doors are.
//
// ── EVERY DOOR THIS CLOSES, so turning it back on is one line and not an archaeology exercise ───────────────
//   1. /mystery-bags                      — the page itself, 404s while shut
//   2. SiteHeader                         — the "Mystery Bags" nav row (and the Virtual Rips row it anchors)
//   3. sitemap.js                         — the /mystery-bags entry
//   4. /api/marketplace/packs             — the "bags" tile in the rips carousel
//   5. openPack()                         — the ACT path refuses pool "bags" (the door is not the machine)
//   6. /marketplace/rips, VaultClient     — links that pointed AT /mystery-bags
export const BAGS_PUBLIC = false;
