import "server-only";

// ── WHO MAY PUT TO SEA ───────────────────────────────────────────────────────────────────────────────────────
// One question asked in two places: the page (the door) and the HUD (the menu entry). Same shape as the
// Forest's gate and for the same reasons —
//
// It lives in its own module rather than in highseas.js because answering it needs owner.js, and owner.js
// reaches the database at `hasOwnerStanding`; highseas.js is imported by HighSeasLab and so ends up in the
// browser bundle. Putting the two together is a build failure, and the build failure is the honest signal
// that a gate is server business.
//
// It takes the BUYER ID rather than a boolean the caller worked out, so adding one guest is one edit rather
// than two with two chances to leave a door shut behind a menu entry that has already opened. See
// [[feature-gates-come-in-pairs]].
//
// ⚠️ isOwner, NOT hasOwnerStanding. The allow-list is a synchronous Set lookup; hasOwnerStanding is a badge
// query. This is read by /api/marketplace/hud, which bills on every navigation by every member, so the gate
// that decides a menu entry must not cost a round trip to answer. See npm run check:chrome.
import { isOwner } from "@/lib/marketplace/owner.js";
import { HIGHSEAS_PUBLIC } from "@/lib/marketplace/highseas.js";

export const highSeasOpenTo = (buyerId) => HIGHSEAS_PUBLIC || isOwner(buyerId);
