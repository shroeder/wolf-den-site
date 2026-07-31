import "server-only";

// ── Shared-state cache ────────────────────────────────────────────────────────────────────────────────────
//
// The Town poll is the highest-volume request in the app, and roughly two thirds of the work it does is
// IDENTICAL for every viewer: the town art, the pet sprite maps, the funded projects, the active bonuses, the
// chest art, who is online. Fifteen people with the Town open meant those same queries ran fifteen times every
// four seconds, all returning the same rows.
//
// That is the part that doesn't scale. Per-viewer work grows with members and there's no avoiding it; shared
// work grows with members too, but only because we recompute it per viewer, which is avoidable. At 300 members
// with ~60 concurrent, an uncached shared read is 60x duplicate load on Neon for one answer.
//
// TTLs are set by how stale each thing is ALLOWED to be, not by how expensive it is:
//   · art / sprite maps  — only change when an admin generates art. Minutes.
//   · projects / bonuses — change when someone contributes. Tens of seconds; the contributor's own response
//                          returns the new value directly, so only OTHER people wait.
//   · presence / chat    — genuinely live. A couple of seconds, which still collapses 60 viewers into one read.
//
// In-process, so each serverless instance keeps its own copy. Under Fluid compute instances are reused and
// serve concurrent requests, so one instance handling ten simultaneous polls does the shared work once.
// Nothing here is correctness-critical: a stale read shows slightly old art or an online list a second behind.

const store = new Map();

export const TTL = {
    ART: 300_000,     // 5 min — town art, pet sprites, chest art, default hero
    SLOW: 30_000,     // 30 s  — projects, bonuses, event-live flag
    LIVE: 2_500,      // 2.5 s — who's online, global chat
};

/**
 * Run `fn` at most once per `ttl` per key, sharing the in-flight promise so concurrent callers don't stampede.
 *
 * The in-flight sharing matters more than the caching here: ten polls landing in the same tick would otherwise
 * all miss the cache and all hit the database. They now await one query.
 */
export function shared(key, ttl, fn) {
    const hit = store.get(key);
    const now = Date.now();
    if (hit && (hit.pending || now - hit.at < ttl)) return hit.value;

    const value = Promise.resolve()
        .then(fn)
        .then((v) => {
            store.set(key, { at: Date.now(), value: Promise.resolve(v), pending: false });
            return v;
        })
        .catch((e) => {
            // Never cache a failure — one blip would otherwise be served for the whole TTL. Fall back to the
            // last good value if we have one, so a transient error doesn't blank the Town for everyone.
            const prev = store.get(key);
            if (prev && !prev.pending) { store.set(key, { ...prev, at: 0 }); return prev.value; }
            store.delete(key);
            throw e;
        });

    store.set(key, { at: now, value, pending: true });
    return value;
}

/** Drop a cached entry immediately — for writes that must be visible to everyone at once. */
export function invalidate(key) {
    store.delete(key);
}
