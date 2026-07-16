import "server-only";

import { db } from "@/lib/db";

// Owned buyer<->vendor messaging. One thread per pair; read state via per-side last-read timestamps.

// The owner's admin app should only be pushed about messages to THEIR OWN storefront (The Wolf Den),
// not other vendors in the marketplace. Matched by display name (the house-vendor convention used by
// the Square sync job); override with MARKETPLACE_OWNER_VENDOR_NAME if the storefront is ever renamed.
export function isOwnerStorefront(vendorName) {
    const needle = (process.env.MARKETPLACE_OWNER_VENDOR_NAME || "wolf den").trim().toLowerCase();
    return String(vendorName || "").toLowerCase().includes(needle);
}

// The Wolf Den's own vendor id, so buyers can message the store directly (e.g. to sell/trade cards).
export async function getOwnerVendorId() {
    const needle = (process.env.MARKETPLACE_OWNER_VENDOR_NAME || "wolf den").trim().toLowerCase();
    const row = await db
        .queryOne(`SELECT id FROM mkt_vendor WHERE LOWER(display_name) LIKE $1 ORDER BY created_at ASC LIMIT 1`, [`%${needle}%`])
        .catch(() => null);
    return row?.id || null;
}

function clampBody(value) {
    const s = String(value || "").trim();
    if (!s) throw new Error("Message can't be empty.");
    return s.slice(0, 4000);
}

export async function getOrCreateThread({ buyerId, vendorId, subject = null, listingId = null, catalogProductId = null }) {
    if (!buyerId || !vendorId) throw new Error("A buyer and vendor are required.");
    const row = await db.queryOne(
        `INSERT INTO mkt_thread (buyer_id, vendor_id, subject, listing_id, catalog_product_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (buyer_id, vendor_id)
         DO UPDATE SET subject = COALESCE(EXCLUDED.subject, mkt_thread.subject),
                       listing_id = COALESCE(EXCLUDED.listing_id, mkt_thread.listing_id),
                       catalog_product_id = COALESCE(EXCLUDED.catalog_product_id, mkt_thread.catalog_product_id)
         RETURNING id, buyer_id, vendor_id`,
        [buyerId, vendorId, subject, listingId, catalogProductId]
    );
    return row;
}

// Post a message and roll up the thread summary. Returns { id, threadId, createdAt }.
export async function postMessage({ threadId, sender, body }) {
    if (sender !== "buyer" && sender !== "vendor") throw new Error("Invalid sender.");
    const text = clampBody(body);
    const msg = await db.queryOne(
        `INSERT INTO mkt_message (thread_id, sender, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [threadId, sender, text]
    );
    // Sender has implicitly read up to their own message.
    const readCol = sender === "buyer" ? "buyer_last_read_at" : "vendor_last_read_at";
    await db.query(
        `UPDATE mkt_thread
         SET last_message_at = $2, last_message_preview = $3, last_sender = $4, ${readCol} = $2
         WHERE id = $1`,
        [threadId, msg.created_at, text.slice(0, 140), sender]
    );
    return { id: msg.id, threadId, createdAt: msg.created_at };
}

// Start (or continue) a conversation with a first message. Returns { threadId }.
export async function startThread({ buyerId, vendorId, sender, body, subject = null, listingId = null, catalogProductId = null }) {
    const thread = await getOrCreateThread({ buyerId, vendorId, subject, listingId, catalogProductId });
    await postMessage({ threadId: thread.id, sender, body });
    return { threadId: thread.id };
}

function mapThreadRow(row, side) {
    const lastRead = side === "buyer" ? row.buyer_last_read_at : row.vendor_last_read_at;
    const unread = row.last_sender && row.last_sender !== side &&
        (lastRead == null || new Date(lastRead) < new Date(row.last_message_at));
    return {
        id: row.id,
        counterpartName: side === "buyer" ? row.vendor_name : row.buyer_name,
        counterpartId: side === "buyer" ? row.vendor_id : row.buyer_id,
        subject: row.subject || null,
        lastPreview: row.last_message_preview || null,
        lastSender: row.last_sender || null,
        lastMessageAt: row.last_message_at,
        catalogProductId: row.catalog_product_id != null ? String(row.catalog_product_id) : null,
        unread: Boolean(unread),
    };
}

export async function listThreadsForBuyer(buyerId) {
    const rows = await db.query(
        `SELECT t.*, v.display_name AS vendor_name, b.display_name AS buyer_name
         FROM mkt_thread t
         JOIN mkt_vendor v ON v.id = t.vendor_id
         JOIN mkt_buyer b ON b.id = t.buyer_id
         WHERE t.buyer_id = $1
         ORDER BY t.last_message_at DESC`,
        [buyerId]
    );
    return rows.map((r) => mapThreadRow(r, "buyer"));
}

export async function listThreadsForVendor(vendorId) {
    const rows = await db.query(
        `SELECT t.*, v.display_name AS vendor_name, b.display_name AS buyer_name
         FROM mkt_thread t
         JOIN mkt_vendor v ON v.id = t.vendor_id
         JOIN mkt_buyer b ON b.id = t.buyer_id
         WHERE t.vendor_id = $1
         ORDER BY t.last_message_at DESC`,
        [vendorId]
    );
    return rows.map((r) => mapThreadRow(r, "vendor"));
}

// Load a thread the viewer participates in, its messages, and mark it read for that side.
export async function getThreadForViewer(threadId, { buyerId = null, vendorId = null }) {
    const t = await db.queryOne(
        `SELECT t.*, v.display_name AS vendor_name, b.display_name AS buyer_name
         FROM mkt_thread t
         JOIN mkt_vendor v ON v.id = t.vendor_id
         JOIN mkt_buyer b ON b.id = t.buyer_id
         WHERE t.id = $1`,
        [threadId]
    );
    if (!t) return null;
    const side = buyerId && t.buyer_id === buyerId ? "buyer" : vendorId && t.vendor_id === vendorId ? "vendor" : null;
    if (!side) return null; // not a participant

    const messages = await db.query(
        `SELECT id, sender, body, created_at FROM mkt_message WHERE thread_id = $1 ORDER BY created_at ASC`,
        [threadId]
    );
    // Mark read up to now for the viewing side.
    const readCol = side === "buyer" ? "buyer_last_read_at" : "vendor_last_read_at";
    await db.query(`UPDATE mkt_thread SET ${readCol} = NOW() WHERE id = $1`, [threadId]);

    return {
        side,
        thread: mapThreadRow(t, side),
        messages: messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at, mine: m.sender === side })),
    };
}

export async function threadParticipantSide(threadId, { buyerId = null, vendorId = null }) {
    const t = await db.queryOne(`SELECT buyer_id, vendor_id FROM mkt_thread WHERE id = $1`, [threadId]);
    if (!t) return null;
    if (buyerId && t.buyer_id === buyerId) return { side: "buyer", buyerId: t.buyer_id, vendorId: t.vendor_id };
    if (vendorId && t.vendor_id === vendorId) return { side: "vendor", buyerId: t.buyer_id, vendorId: t.vendor_id };
    return null;
}

// Both parties' names + emails, for the new-message nudge.
export async function getThreadParties(threadId) {
    return db.queryOne(
        `SELECT t.id, t.buyer_id, t.vendor_id,
                b.email AS buyer_email, b.display_name AS buyer_name,
                v.email AS vendor_email, v.display_name AS vendor_name
         FROM mkt_thread t
         JOIN mkt_buyer b ON b.id = t.buyer_id
         JOIN mkt_vendor v ON v.id = t.vendor_id
         WHERE t.id = $1`,
        [threadId]
    );
}

export async function unreadCountForBuyer(buyerId) {
    const row = await db.queryOne(
        `SELECT count(*)::int AS n FROM mkt_thread
         WHERE buyer_id = $1 AND last_sender = 'vendor'
           AND (buyer_last_read_at IS NULL OR buyer_last_read_at < last_message_at)`,
        [buyerId]
    );
    return row?.n || 0;
}

export async function unreadCountForVendor(vendorId) {
    const row = await db.queryOne(
        `SELECT count(*)::int AS n FROM mkt_thread
         WHERE vendor_id = $1 AND last_sender = 'buyer'
           AND (vendor_last_read_at IS NULL OR vendor_last_read_at < last_message_at)`,
        [vendorId]
    );
    return row?.n || 0;
}
