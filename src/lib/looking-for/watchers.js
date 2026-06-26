import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { getAuthenticatedShopCustomerFromCookies } from "@/lib/shop-customer-session";
import { getCardsByIds } from "@/lib/looking-for/catalog";
import {
    WATCHER_COOKIE,
    createWatcherToken,
    getWatcherCookieOptions,
    verifyWatcherToken,
} from "@/lib/looking-for/session";

// A single watcher can want at most this many copies of one card — a sane guard against runaway
// input. Shared with the API route so client and server clamp to the same ceiling.
export const MAX_WATCHLIST_QUANTITY = 99;

function clampQuantity(value) {
    const numeric = Math.trunc(Number(value));

    if (!Number.isFinite(numeric)) {
        return 1;
    }

    return Math.max(1, Math.min(MAX_WATCHLIST_QUANTITY, numeric));
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

async function getWatcherById(id) {
    return db.queryOne(
        `SELECT id, email, email_verified, customer_id FROM card_watchers WHERE id = $1`,
        [id]
    );
}

async function createWatcher() {
    return db.queryOne(
        `INSERT INTO card_watchers DEFAULT VALUES RETURNING id, email, email_verified, customer_id`
    );
}

async function linkCustomerIfNeeded(watcher) {
    if (watcher.customer_id) {
        return watcher;
    }

    const customer = await getAuthenticatedShopCustomerFromCookies().catch(() => null);

    if (!customer?.id) {
        return watcher;
    }

    const updated = await db.queryOne(
        `UPDATE card_watchers SET customer_id = $2, updated_at = NOW()
         WHERE id = $1 AND customer_id IS NULL
         RETURNING id, email, email_verified, customer_id`,
        [watcher.id, customer.id]
    );

    return updated || watcher;
}

/**
 * Resolve the current visitor's watcher from the signed cookie, creating one (and setting the
 * cookie) on first contact. `cookieStore` must be a mutable cookies() store from a Route
 * Handler so the cookie can be persisted on the response.
 */
export async function getOrCreateWatcher(cookieStore) {
    const token = cookieStore.get(WATCHER_COOKIE)?.value;
    const payload = verifyWatcherToken(token);

    if (payload?.wid) {
        const existing = await getWatcherById(payload.wid);

        if (existing) {
            return linkCustomerIfNeeded(existing);
        }
    }

    const created = await createWatcher();

    cookieStore.set(WATCHER_COOKIE, createWatcherToken(created.id), getWatcherCookieOptions());

    return linkCustomerIfNeeded(created);
}

export async function listWatchlistItems(watcherId) {
    const rows = await db.query(
        `SELECT card_id, quantity FROM card_watchlist_items WHERE watcher_id = $1 ORDER BY created_at DESC`,
        [watcherId]
    );

    return rows.map((row) => ({ cardId: Number(row.card_id), quantity: Number(row.quantity) }));
}

/**
 * Return the watcher's wishlist hydrated with full card display rows (newest first), each carrying
 * the wanted `quantity`.
 */
export async function getWatchlist(watcherId) {
    const items = await listWatchlistItems(watcherId);
    const cards = await getCardsByIds(items.map((item) => item.cardId));
    const quantityByCardId = new Map(items.map((item) => [item.cardId, item.quantity]));

    return cards.map((card) => ({ ...card, quantity: quantityByCardId.get(card.id) ?? 1 }));
}

export async function addWatchlistItem(watcherId, cardId) {
    const card = await db.queryOne(`SELECT id FROM tcg_cards WHERE id = $1`, [cardId]);

    if (!card) {
        return { status: "not_found" };
    }

    // Re-adding a card already on the list is a no-op: it must not reset a quantity the shopper
    // already bumped up.
    await db.query(
        `INSERT INTO card_watchlist_items (watcher_id, card_id)
         VALUES ($1, $2)
         ON CONFLICT (watcher_id, card_id) DO NOTHING`,
        [watcherId, cardId]
    );

    return { status: "ok" };
}

/**
 * Set how many copies of a card the watcher wants. The card must already be on their list; the
 * quantity is clamped to [1, MAX_WATCHLIST_QUANTITY].
 */
export async function setWatchlistItemQuantity(watcherId, cardId, quantity) {
    const clamped = clampQuantity(quantity);

    const updated = await db.queryOne(
        `UPDATE card_watchlist_items SET quantity = $3
         WHERE watcher_id = $1 AND card_id = $2
         RETURNING card_id`,
        [watcherId, cardId, clamped]
    );

    return updated ? { status: "ok", quantity: clamped } : { status: "not_found" };
}

export async function removeWatchlistItem(watcherId, cardId) {
    await db.query(
        `DELETE FROM card_watchlist_items WHERE watcher_id = $1 AND card_id = $2`,
        [watcherId, cardId]
    );

    return { status: "ok" };
}

/**
 * Attach (or change) the watcher's alert email and issue a fresh confirmation token. Changing
 * the email resets verification so a new double opt-in is required. Returns the raw token.
 */
export async function attachWatcherEmail(watcherId, email) {
    const normalized = normalizeEmail(email);
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    await db.query(
        `UPDATE card_watchers SET
            email = $2,
            email_normalized = $3,
            email_verified = FALSE,
            verify_token_hash = $4,
            verify_sent_at = NOW(),
            updated_at = NOW()
         WHERE id = $1`,
        [watcherId, String(email).trim(), normalized, tokenHash]
    );

    return rawToken;
}

export async function confirmWatcherEmail(rawToken) {
    if (!rawToken) {
        return null;
    }

    return db.queryOne(
        `UPDATE card_watchers SET
            email_verified = TRUE,
            verify_token_hash = NULL,
            updated_at = NOW()
         WHERE verify_token_hash = $1
         RETURNING id, email`,
        [hashToken(rawToken)]
    );
}
