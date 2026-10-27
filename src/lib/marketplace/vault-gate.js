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
 * The launch switch. `true` since 2026-10-27 — Luke: "Ok I think we can remove the owner gate from that
 * feature." Everything behind it opened at once, for everybody.
 *
 * ⚠️ THE FLAG IS KEPT RATHER THAN DELETED ALONG WITH ITS CALL SITES. It is the only way back: a pool that
 * empties, a Square problem or a pull queue nobody is working is closed by one line here, and the
 * alternative — re-deriving eleven door checks under pressure — is how a feature gets half-closed.
 *
 * Checked before flipping, per §16.2, because this is where it goes wrong: every door asks vaultOpenFor
 * (ten of them now, the casino's pack vendor being the one the doc's table does not have), there is no bare
 * isOwner anywhere in the pack or vault subsystem, and no second `OPEN =` or `*OpenFor` shadows it. The
 * casino launch failed that check and worked for exactly one person for twenty minutes.
 */
export const VAULT_PUBLIC = true;

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

// ── ── CATEGORY PACKS GET THEIR OWN SWITCH ── ───────────────────────────────────────────────────────────────
// Luke, 2026-10-27: "this will be owner gated. We won't regress and owner gate the mystery packs, but for all
// the extended features that we're about to develop, it will be gated, owner only."
//
// ⚠️ SO IT CANNOT REUSE VAULT_PUBLIC, WHICH IS NOW `true`. Reusing it would open the shelf pools to everybody
// the moment they deploy, and the only way to prevent that afterwards would be putting the BAGS back behind a
// gate — which is the one thing the instruction rules out. Two features, two switches.
//
// ⚠️ AND IT IS AND-ED WITH THE VAULT GATE, NOT OR-ED. Everything a category pack does afterwards — the
// reveal, the sell-back, the vault, shipping — is the vault feature. Somebody who could open a shelf pack
// while the vault was shut would be buying a card into a room they cannot enter.
// `true` since 2026-10-27 — Luke: "Ungate mystery bags, the new stuff we've just been working on, so it's
// not owner gated anymore." Pokémon Singles and Magic Singles are open to every member; Yu-Gi-Oh stays shut
// by its own concentration rule, not by this, and opens itself when the shelf allows.
//
// ⚠️ THE FLAG STAYS rather than being deleted with its call sites — the same argument as VAULT_PUBLIC above.
// It is the only way back if the shelf runs thin or Square plays up, and re-deriving the gate under pressure
// is how a feature gets half-closed.
export const SHELF_PACKS_PUBLIC = true;

export function shelfPacksOpenFor(buyerId) {
    if (!buyerId) return false;
    if (!vaultOpenFor(buyerId)) return false;
    return SHELF_PACKS_PUBLIC || canPreview("vault", buyerId);
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
export function isPreviewOpen(buyerId, poolKey = "bags") {
    // ── ⚠️ A GATED POOL IS A PREVIEW EVEN THOUGH THE BAGS ARE PUBLIC ────────────────────────────────────
    // This read VAULT_PUBLIC alone, which was right while there was one feature behind one flag. The first
    // live category-pack open came out stamped `preview = false` — a real member open, in the averages —
    // because the BAGS had gone public. The category packs are owner-only and every open of them is a test.
    //
    // §16.4's argument is unchanged and is the reason this matters: one owner with a test panel outweighs
    // the whole membership, and the telemetry split by pool makes polluting one pool's numbers easy.
    if (poolKey && poolKey !== "bags") return !SHELF_PACKS_PUBLIC && shelfPacksOpenFor(buyerId);
    // ⚠️ NOTHING IS A PREVIEW ANY MORE, AND THAT INCLUDES LUKE'S OWN TEST OPENS. Once the feature is public
    // there is no gated cohort to exclude, so from here the telemetry averages count every open including
    // his. That is correct — he is a member on a public feature now — but it does mean a run of test opens
    // moves the numbers, where before they could not. The rows stamped `preview` before today keep that
    // stamp, because it was written at open time and is a fact about the row rather than about the flag.
    return !VAULT_PUBLIC && vaultOpenFor(buyerId);
}
