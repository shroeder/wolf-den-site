import "server-only";

// ── WHAT A MEMBER IS WEARING, ASKED ONCE ─────────────────────────────────────────────────────────────────────
// Counted against a real member: ONE `/api/marketplace/arena` read made 161 database round trips, and 158 of
// them were two questions asked over and over with the same argument —
//
//     x89  SELECT item_id FROM mkt_user_equipment ...      (equippedPowers, 73 call sites)
//     x69  SELECT item_id FROM mkt_user_equipment ...      (getEquippedUtilTotals, 2 queries each)
//
// That is what the arena's cost actually is. A CPU profile of the handler came back 95.7% IDLE with
// `configSecureContext` among the live frames: it is not arithmetic, it is a hundred and fifty TLS handshakes
// and a hundred and fifty JSON parses to re-answer a question whose answer cannot change mid-request. The
// route bills 235ms of Active CPU against a 54ms P75 and takes 4.7 seconds of wall clock, and that is why.
//
// ── WHY THIS IS NOT THE CACHE ascension-powers.js WARNS ABOUT ────────────────────────────────────────────────
// That file says, correctly: "a member equips a piece and the next harvest has to know; a five-minute cache
// would make the whole system feel broken." It then never built any cache at all, and every caller paid.
//
// The difference is INVALIDATION. Every path that writes to mkt_user_equipment calls forgetEquipment, so
// equipping is visible on the very next read — the window is only there to collapse the repeats inside one
// request, not to hold an answer past the moment it stops being true.
//
// React's `cache` is the textbook answer and it was tried first. It only dedupes inside a request context,
// which means it cannot be verified anywhere but production, and "it should work in prod" is not a
// measurement. This can be measured from a script, and was.
const TTL_MS = 15000;
const store = new Map();   // `${kind}:${buyerId}` -> { at, value }

/**
 * Ask `load()` at most once per buyer per window. `kind` keeps two different questions about the same member
 * apart, so the powers set and the attunement totals do not overwrite each other.
 */
export function equipMemo(kind, buyerId, load) {
    if (!buyerId) return load();
    const key = `${kind}:${buyerId}`;
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    // ⚠️ THE PROMISE IS STORED, NOT THE RESOLVED VALUE, and that is the whole fix rather than a nicety.
    // Caching after the await only helps callers that arrive AFTER the first one finishes. These callers do
    // not: they are inside Promise.all, so seventy of them ask before any answer exists, every one misses,
    // and seventy queries go out anyway. Measured exactly that way — the first version of this file cut 161
    // round trips to 142, because it was only catching the handful that happened to be sequential.
    //
    // Storing the in-flight promise means the second caller waits on the first caller's query instead of
    // opening its own. A rejection is evicted so the next read genuinely retries rather than inheriting a
    // failure for the rest of the window.
    const value = Promise.resolve().then(load);
    store.set(key, { at: Date.now(), value });
    value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
    return value;
}

/** Fill an answer somebody already fetched in bulk — see primePowers. */
export function primeEquip(kind, buyerId, value) {
    if (buyerId) store.set(`${kind}:${buyerId}`, { at: Date.now(), value: Promise.resolve(value) });
}

/** Called by everything that changes what a member is wearing. One buyer, or all of them. */
export function forgetEquipment(buyerId) {
    if (!buyerId) { store.clear(); return; }
    const suffix = `:${buyerId}`;
    for (const k of store.keys()) if (k.endsWith(suffix)) store.delete(k);
}
