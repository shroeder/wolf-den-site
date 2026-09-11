import "server-only";

// ── WHO MAY WALK INTO THE FOREST ─────────────────────────────────────────────────────────────────────────────
// One question, asked in three places: the page (the door), the API (the play path) and the HUD (the menu
// entry). It lives here rather than in forest.js because answering it needs the owner allow-list, and owner.js
// reaches the database — `hasOwnerStanding` does `await import("@/lib/db")` — while forest.js is imported by
// ForestClient and so ends up in the browser bundle. Putting the two together is a build failure, and the
// build failure is the honest signal: a gate is server business.
//
// ⚠️ SERVER-ONLY ON PURPOSE, so that stays true no matter who imports this next.
//
// It takes the BUYER ID rather than a boolean the caller worked out. It used to take `isOwner(id)`, which
// meant the rule was really written three times, and adding a single guest would have been three edits with
// three chances to leave a door shut behind a menu entry that had already opened.
//
// See [[feature-gates-come-in-pairs]]. On launch day, flip FOREST_PUBLIC in forest.js and nothing here
// changes.
import { FOREST_PUBLIC } from "@/lib/marketplace/forest.js";
import { canPreview } from "@/lib/marketplace/owner.js";

export const forestOpenTo = (buyerId) => FOREST_PUBLIC || canPreview("forest", buyerId);
