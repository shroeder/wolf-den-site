import "server-only";

import { db } from "@/lib/db";

// Buyer<->vendor messaging. As of the Phase 2 unification this is a FACADE over the shared member DM store
// (mkt_dm_thread / mkt_dm_message): a "vendor thread" is a DM thread carrying vendor context (vendor_id +
// subject/listing/product) between the buyer member and the vendor's linked account member. The buyer/
// vendor "side" is derived from which participant equals the vendor's account_id. Public API shapes are
// unchanged, so the routes, unified inbox, notification nudges, and the marketplace_app all keep working
// with no changes. Legacy mkt_thread/mkt_message remain untouched for rollback.

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

// The member id a vendor acts as in the shared DM store (its linked account). Null if the shop hasn't
// linked an account — such a vendor can't send/receive messages under the unified model.
async function vendorAccountId(vendorId) {
    const r = await db.queryOne(`SELECT account_id FROM mkt_vendor WHERE id = $1`, [vendorId]).catch(() => null);
    return r?.account_id || null;
}

// Last-resort: link a vendor to its owner's member account by matching email (so a legacy unlinked shop
// can still receive messages the first time someone contacts it). Returns the linked account id, or null.
async function tryLinkVendorAccount(vendorId) {
    const row = await db
        .queryOne(
            `UPDATE mkt_vendor v SET account_id = b.id
               FROM mkt_buyer b
              WHERE v.id = $1 AND v.account_id IS NULL AND LOWER(b.email) = LOWER(v.email)
              RETURNING v.account_id`,
            [vendorId]
        )
        .catch(() => null);
    return row?.account_id || null;
}

// Load a vendor-context DM thread with its vendor + members resolved.
async function loadVendorThread(threadId) {
    const t = await db
        .queryOne(
            `SELECT t.id, t.user_a, t.user_b, t.vendor_id, t.subject, t.listing_id, t.catalog_product_id,
                    t.last_message_at, t.a_last_read_at, t.b_last_read_at,
                    v.account_id AS vendor_account, v.display_name AS vendor_name, v.email AS vendor_email
               FROM mkt_dm_thread t JOIN mkt_vendor v ON v.id = t.vendor_id
              WHERE t.id = $1 AND t.vendor_id IS NOT NULL`,
            [threadId]
        )
        .catch(() => null);
    if (!t) return null;
    t.buyer_member = t.user_a === t.vendor_account ? t.user_b : t.user_a;
    return t;
}

// Shape a thread row for the list/summary views (matches the legacy mkt_thread mapping).
function mapThreadRow(row, side) {
    const viewerMember = side === "buyer" ? row.buyer_member : row.vendor_account;
    const lastSender = row.last_sender_id ? (row.last_sender_id === row.vendor_account ? "vendor" : "buyer") : null;
    const viewerRead = viewerMember === row.user_a ? row.a_last_read_at : row.b_last_read_at;
    const unread =
        row.last_sender_id && row.last_sender_id !== viewerMember &&
        (viewerRead == null || new Date(viewerRead) < new Date(row.last_message_at));
    return {
        id: row.id,
        counterpartName: side === "buyer" ? row.vendor_name : row.buyer_name,
        counterpartId: side === "buyer" ? row.vendor_id : row.buyer_member,
        subject: row.subject || null,
        lastPreview: row.last_body || null,
        lastSender,
        lastMessageAt: row.last_message_at,
        catalogProductId: row.catalog_product_id != null ? String(row.catalog_product_id) : null,
        unread: Boolean(unread),
    };
}

export async function getOrCreateThread({ buyerId, vendorId, subject = null, listingId = null, catalogProductId = null }) {
    if (!buyerId || !vendorId) throw new Error("A buyer and vendor are required.");
    const account = (await vendorAccountId(vendorId)) || (await tryLinkVendorAccount(vendorId));
    if (!account) throw new Error("This shop hasn't set up messaging yet — please reach out another way.");
    if (account === buyerId) throw new Error("You can't message your own shop.");
    const [a, b] = buyerId < account ? [buyerId, account] : [account, buyerId];
    const productText = catalogProductId != null ? String(catalogProductId) : null;
    await db.query(
        `INSERT INTO mkt_dm_thread (user_a, user_b, vendor_id, subject, listing_id, catalog_product_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_a, user_b, vendor_id) WHERE vendor_id IS NOT NULL
         DO UPDATE SET subject = COALESCE(EXCLUDED.subject, mkt_dm_thread.subject),
                       listing_id = COALESCE(EXCLUDED.listing_id, mkt_dm_thread.listing_id),
                       catalog_product_id = COALESCE(EXCLUDED.catalog_product_id, mkt_dm_thread.catalog_product_id)`,
        [a, b, vendorId, subject, listingId, productText]
    );
    const row = await db.queryOne(`SELECT id FROM mkt_dm_thread WHERE user_a = $1 AND user_b = $2 AND vendor_id = $3`, [a, b, vendorId]);
    return { id: row.id, buyer_id: buyerId, vendor_id: vendorId };
}

// Post a message to a vendor thread. sender is a SIDE ("buyer"|"vendor") — mapped to the member id.
// Returns { id, threadId, createdAt }.
export async function postMessage({ threadId, sender, body }) {
    if (sender !== "buyer" && sender !== "vendor") throw new Error("Invalid sender.");
    const t = await loadVendorThread(threadId);
    if (!t) throw new Error("Thread not found.");
    const text = clampBody(body);
    const senderId = sender === "vendor" ? t.vendor_account : t.buyer_member;
    const msg = await db.queryOne(
        `INSERT INTO mkt_dm_message (thread_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [threadId, senderId, text]
    );
    // Sender has implicitly read up to their own message.
    const readCol = senderId === t.user_a ? "a_last_read_at" : "b_last_read_at";
    await db.query(`UPDATE mkt_dm_thread SET last_message_at = $2, ${readCol} = $2 WHERE id = $1`, [threadId, msg.created_at]);
    return { id: msg.id, threadId, createdAt: msg.created_at };
}

// Start (or continue) a conversation with a first message. Returns { threadId }.
export async function startThread({ buyerId, vendorId, sender, body, subject = null, listingId = null, catalogProductId = null }) {
    const thread = await getOrCreateThread({ buyerId, vendorId, subject, listingId, catalogProductId });
    await postMessage({ threadId: thread.id, sender, body });
    return { threadId: thread.id };
}

// The shared SELECT for a member's vendor threads (buyer OR vendor side), with the latest message + names.
const THREAD_LIST_SQL = `
    SELECT t.id, t.user_a, t.user_b, t.vendor_id, t.subject, t.catalog_product_id,
           t.last_message_at, t.a_last_read_at, t.b_last_read_at,
           v.account_id AS vendor_account, v.display_name AS vendor_name,
           bm.display_name AS buyer_name,
           (CASE WHEN t.user_a = v.account_id THEN t.user_b ELSE t.user_a END) AS buyer_member,
           m.body AS last_body, m.sender_id AS last_sender_id
      FROM mkt_dm_thread t
      JOIN mkt_vendor v ON v.id = t.vendor_id
      JOIN mkt_buyer bm ON bm.id = (CASE WHEN t.user_a = v.account_id THEN t.user_b ELSE t.user_a END)
      LEFT JOIN LATERAL (
          SELECT body, sender_id FROM mkt_dm_message WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1
      ) m ON true
     WHERE t.vendor_id IS NOT NULL AND t.last_message_at IS NOT NULL`;

export async function listThreadsForBuyer(buyerId) {
    // Threads where the viewer is the BUYER side (the member that is not the vendor's account).
    const rows = await db
        .query(`${THREAD_LIST_SQL} AND (t.user_a = $1 OR t.user_b = $1) AND v.account_id <> $1 ORDER BY t.last_message_at DESC`, [buyerId])
        .catch(() => []);
    return rows.map((r) => mapThreadRow(r, "buyer"));
}

export async function listThreadsForVendor(vendorId) {
    const rows = await db.query(`${THREAD_LIST_SQL} AND t.vendor_id = $1 ORDER BY t.last_message_at DESC`, [vendorId]).catch(() => []);
    return rows.map((r) => mapThreadRow(r, "vendor"));
}

// Load a thread the viewer participates in, its messages, and mark it read for that side.
export async function getThreadForViewer(threadId, { buyerId = null, vendorId = null }) {
    const t = await loadVendorThread(threadId);
    if (!t) return null;
    const side = buyerId && t.buyer_member === buyerId ? "buyer" : vendorId && t.vendor_id === vendorId ? "vendor" : null;
    if (!side) return null; // not a participant

    const buyerName = await db.queryOne(`SELECT display_name FROM mkt_buyer WHERE id = $1`, [t.buyer_member]).catch(() => null);
    t.buyer_name = buyerName?.display_name || "Member";

    const rows = await db.query(`SELECT id, sender_id, body, created_at FROM mkt_dm_message WHERE thread_id = $1 ORDER BY created_at ASC`, [threadId]);
    const last = rows[rows.length - 1];
    t.last_body = last?.body || null;
    t.last_sender_id = last?.sender_id || null;

    // Mark read up to now for the viewing side.
    const viewerMember = side === "buyer" ? t.buyer_member : t.vendor_account;
    const readCol = viewerMember === t.user_a ? "a_last_read_at" : "b_last_read_at";
    await db.query(`UPDATE mkt_dm_thread SET ${readCol} = NOW() WHERE id = $1`, [threadId]);

    return {
        side,
        thread: mapThreadRow(t, side),
        messages: rows.map((m) => {
            const s = m.sender_id === t.vendor_account ? "vendor" : "buyer";
            return { id: m.id, sender: s, body: m.body, createdAt: m.created_at, mine: s === side };
        }),
    };
}

export async function threadParticipantSide(threadId, { buyerId = null, vendorId = null }) {
    const t = await loadVendorThread(threadId);
    if (!t) return null;
    if (buyerId && t.buyer_member === buyerId) return { side: "buyer", buyerId: t.buyer_member, vendorId: t.vendor_id };
    if (vendorId && t.vendor_id === vendorId) return { side: "vendor", buyerId: t.buyer_member, vendorId: t.vendor_id };
    return null;
}

// Both parties' names + emails, for the new-message nudge.
export async function getThreadParties(threadId) {
    const t = await loadVendorThread(threadId);
    if (!t) return null;
    const b = await db.queryOne(`SELECT email, display_name FROM mkt_buyer WHERE id = $1`, [t.buyer_member]).catch(() => null);
    return {
        id: t.id,
        buyer_id: t.buyer_member,
        vendor_id: t.vendor_id,
        buyer_email: b?.email || null,
        buyer_name: b?.display_name || null,
        vendor_email: t.vendor_email || null,
        vendor_name: t.vendor_name || null,
    };
}

export async function unreadCountForBuyer(buyerId) {
    const row = await db
        .queryOne(
            `SELECT count(*)::int AS n
               FROM mkt_dm_thread t
               JOIN mkt_vendor v ON v.id = t.vendor_id
               JOIN LATERAL (SELECT sender_id, created_at FROM mkt_dm_message WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) m ON true
              WHERE t.vendor_id IS NOT NULL AND (t.user_a = $1 OR t.user_b = $1) AND v.account_id <> $1
                AND m.sender_id <> $1
                AND ((CASE WHEN t.user_a = $1 THEN t.a_last_read_at ELSE t.b_last_read_at END) IS NULL
                     OR (CASE WHEN t.user_a = $1 THEN t.a_last_read_at ELSE t.b_last_read_at END) < m.created_at)`,
            [buyerId]
        )
        .catch(() => null);
    return row?.n || 0;
}

export async function unreadCountForVendor(vendorId) {
    const row = await db
        .queryOne(
            `SELECT count(*)::int AS n
               FROM mkt_dm_thread t
               JOIN mkt_vendor v ON v.id = t.vendor_id
               JOIN LATERAL (SELECT sender_id, created_at FROM mkt_dm_message WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) m ON true
              WHERE t.vendor_id = $1
                AND m.sender_id <> v.account_id
                AND ((CASE WHEN t.user_a = v.account_id THEN t.a_last_read_at ELSE t.b_last_read_at END) IS NULL
                     OR (CASE WHEN t.user_a = v.account_id THEN t.a_last_read_at ELSE t.b_last_read_at END) < m.created_at)`,
            [vendorId]
        )
        .catch(() => null);
    return row?.n || 0;
}
