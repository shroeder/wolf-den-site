import { canPreview } from "@/lib/marketplace/owner.js";

// ── THE ONE DOOR FOR VIRTUAL PACKS AND THE CARD VAULT ───────────────────────────────────────────────────────
// Luke, 2026-10-26: "this needs to be a feature flagged thing for now. For now I would prefer it only show up
// for me."
//
// ONE flag, ONE question, asked everywhere. Same shape as ROAD_OPEN/roadOpenFor in arena.js, and for the same
// reason the Hallowe'en note in owner.js gives: a feature with two flags is a feature whose two flags
// disagree, and the member ends up in a state where half of it exists.
//
// ⚠️ IT ASKS canPreview("vault"), NOT isOwner. That distinction is the whole reason PREVIEW_GUESTS exists:
// `isOwner` is checked in 44 files and decides casino controls, credit checkout, the role system, creation
// tokens and pet drops. Inviting somebody to test pack opening must not hand them the shop. Keyed per
// feature, an invite carries exactly what it says and revoking it is deleting one line.
//
// ⚠️ AND THE DOOR IS NOT THE MACHINE. The casino launch removed three owner checks, all three correct, and
// members still could not play: a FOURTH gate sat inside spinSlot5 rather than at the door, and it worked for
// exactly one person for twenty minutes. So every door is enumerated in the design doc (§16.2) and the PLAY
// path — POST /api/marketplace/packs/open — is on that list in bold. Before calling this released, grep the
// subsystem for all three shapes the house has been bitten by: `OPEN =`, `*OpenFor`, and a bare `isOwner`
// inside an act path.

/**
 * The launch switch. Flip to `true` and everything below opens at once, for everybody.
 *
 * ⚠️ Flipping this is not the whole launch — see docs/virtual-packs-and-the-card-vault.md §16.5. A feature
 * nobody is told about reads as a feature that is switched off.
 */
export const VAULT_PUBLIC = false;

/**
 * May this member open packs online and use the Card Vault?
 *
 * Signed out is always false: every surface behind this gate is per-member (a balance, a vault, an open), so
 * there is nothing to show without a buyer id — and a `true` here would send a `WHERE buyer_id = null` at the
 * database on the next line.
 */
export function vaultOpenFor(buyerId) {
    if (!buyerId) return false;
    return VAULT_PUBLIC || canPreview("vault", buyerId);
}

/**
 * Is this open a gated PREVIEW rather than a real member's? Stamped onto `mkt_pack_open.preview` at open time.
 *
 * ⚠️ READ IT ONCE, AT OPEN, AND STORE THE ANSWER. Deriving it later from the buyer id would mean the history
 * changes whenever the allow-list does — a member invited today would retroactively turn last month's real
 * opens into previews, and the telemetry would quietly restate itself.
 *
 * A preview open is excluded from ENGAGEMENT telemetry (there is precedent in casino-report.js: the owner
 * plays the floor to test it, and one owner with a test panel outweighs the whole membership) and included in
 * the BOOKS, because the bag really did leave the shelf. Those are different questions.
 */
export function isPreviewOpen(buyerId) {
    return !VAULT_PUBLIC && vaultOpenFor(buyerId);
}
