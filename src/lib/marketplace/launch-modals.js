// ── WHAT A LAUNCH MODAL IS FOR, AND WHO IT IS NOT FOR ────────────────────────────────────────────────────────
// Each of the keys below belongs to a dialog that announces a feature as NEW. That is the right thing to show
// somebody who was already here when it shipped — and it announces nothing at all to somebody who joined
// today. The farm, the mine, the forge and the arena have always existed as far as a new member is concerned.
// There is no "new" to tell them about.
//
// AND THEY QUEUE. Every one of them keys off nothing but its own localStorage marker — `if (!seen) show` —
// with no account-age check anywhere, so a fresh browser on a fresh account meets all seven in a row.
// Dismissing Dungeons reveals the Mine, which reveals the Farm. That is the first thing the Den says to
// somebody who has just scanned a QR code at the counter to spin a wheel, and it is a wall of dialogs about
// things they have never heard of.
//
// So a brand-new account starts with all of them already read. Not special-cased inside seven components, and
// not suppressed by a flag they would trip over later — MARKED, once, at the moment we know the account is
// new, with the very same markers the modals write for themselves. From then on they behave normally.
//
// ── WHAT IS DELIBERATELY NOT IN THIS LIST ────────────────────────────────────────────────────────────────────
// The daily check-in, which is a REWARD rather than an announcement and should absolutely greet a new member.
// The happy-hour card, which is a live promotion that is as true for them as for anybody. And the push and
// location prompts, which are permission asks with their own reasons — they are friction, but hiding them is
// a different decision from this one.
export const LAUNCH_SEEN_KEYS = [
    "wolfden-feature-farm-launch-2026-07",
    "wolfden-dungeons-announce-v1",
    "wolfden-fishing-announce-v1",
    "wolfden-forge-announce-v1",
    "wolfden-market-announce-v1",
    "wolfden-mining-announce-v2",
    "wolfden-arena-reopen-v1",
];

/**
 * Mark every feature-launch announcement as already read. Call at the moment an account is created — the one
 * moment we know for certain the member predates none of it.
 *
 * ADDING A NEW LAUNCH MODAL? Add its key here in the same commit. A key that is missing does not break
 * anything; it just means the next person to join gets told about a feature that was there before they were.
 */
export function markLaunchesSeen() {
    if (typeof window === "undefined") return;
    for (const key of LAUNCH_SEEN_KEYS) {
        // Private mode, or a browser with storage disabled: nothing to mark and nothing to do about it. The
        // modals themselves already fail the same way, so behaviour matches rather than diverging.
        try { window.localStorage.setItem(key, "1"); } catch { /* storage unavailable */ }
    }
}
