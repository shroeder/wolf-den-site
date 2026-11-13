// ── ⚠️ PURE, AND NOT server-only ────────────────────────────────────────────────────────────────────────────
// The vault screen counts down to this deadline and says how long the window is, so the CLIENT reads
// VAULT_HOLD_DAYS. An `import "server-only"` here would break the build the moment VaultClient imported it —
// which is the correct outcome, and the reason this file holds a rule and no data access. Same shape as
// grove-recipes.js: the screen and the server read the same constants, so neither can quote a different
// number at the member than the one the sweep enforces.
//
// ── ⚠️ ITS OWN MODULE SO IT HAS NO IMPORTS TO CYCLE ON ──────────────────────────────────────────────────────
// Both vault.js and packs.js need this rule, and they already import each other's halves — vault.js takes
// `releasableAt` from packs.js, and packs.js is where a card is first written into the vault. Putting the
// rule in either one makes that a cycle. A leaf module with no dependencies cannot.
// ── HOW LONG A CARD SITS IN THE VAULT ───────────────────────────────────────────────────────────────────────
// Luke, 2026-11-12: "Cards should auto sell back after 3 days. And the timer should be apparant for users."
//
// The vault is a decision, not a locker. While a card is held the physical single is off the shelf and
// unsellable — idx_vault_held_variation exists so the counter can ask "is this one spoken for?" — and the
// member has already been paid in cards for credit they spent once. Three days is the window: order it
// (shipped or collected) and it is yours, or it trades back at the counter rate and the credit comes home.
export const VAULT_HOLD_DAYS = 3;
const HOLD_MS = VAULT_HOLD_DAYS * 864e5;

/**
 * When a card's window closes.
 *
 * ⚠️ THE CLOCK STARTS WHEN THE CARD BECOMES ORDERABLE, NOT WHEN IT WAS PULLED. §12 holds a card in the
 * building until seven days after the member's most recent credit top-up, and createVaultOrder only accepts
 * cards past that hold — so a three-day clock measured from the pull would force-sell cards the member was
 * never ALLOWED to keep. That is the one state this feature must never create, and it is not an edge case:
 * it is every member who tops up credit and immediately opens a pack.
 *
 * So: three days from whichever comes later, the pull or the release. A member who keeps topping up keeps
 * pushing both dates out, which is correct — you cannot run a decision clock on somebody who is not yet
 * allowed to decide.
 */
export function vaultExpiryAt(releaseAt = null, from = Date.now()) {
    const start = Math.max(new Date(from).getTime(), releaseAt ? new Date(releaseAt).getTime() : 0);
    return new Date(start + HOLD_MS);
}
