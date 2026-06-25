import "server-only";

import { db } from "@/lib/db";

export async function getStore(storeId) {
    return db.queryOne(
        "SELECT id, slug, name, status, plan, trial_ends_at FROM stores WHERE id = $1",
        [storeId]
    );
}

/** Shape returned to the app (e.g. in /auth/me) for trial banners etc. */
export async function getStorePublic(storeId) {
    const row = await getStore(storeId);

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        plan: row.plan,
        trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
    };
}

/**
 * Trial/subscription gate. STUB for now — always allows, so the app behaves the
 * same. Flip the commented checks on later to enforce trial expiry / suspension
 * (return { ok:false, reason } and have callers map it to 402/403).
 */
export async function assertStoreActive(storeId) {
    const store = await getStore(storeId);

    if (!store) {
        return { ok: false, reason: "store_not_found" };
    }

    // if (store.status === "suspended" || store.status === "closed") {
    //     return { ok: false, reason: "store_suspended", store };
    // }
    // if (store.status === "trialing" && store.trial_ends_at && new Date(store.trial_ends_at) < new Date()) {
    //     return { ok: false, reason: "trial_expired", store };
    // }

    return { ok: true, store };
}
