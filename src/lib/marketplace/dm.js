import "server-only";

import { db } from "@/lib/db";
import { areFriends } from "@/lib/marketplace/friends.js";
import { getProductCards } from "@/lib/marketplace/product-card.js";
import { notifyNewDm } from "@/lib/marketplace/social-notify.js";
import { levelForXp } from "@/lib/marketplace/xp.js";

// User-to-user direct messages between friends. Distinct from the buyer<->vendor mkt_thread system; both
// are surfaced together in the unified inbox.

function pair(a, b) {
    return a < b ? [a, b] : [b, a];
}

function mapUser(row) {
    if (!row) return null;
    const name = `${row.first_name || ""} ${row.last_name || ""}`.trim();
    return {
        id: row.id,
        alias: row.alias || null,
        displayLabel: name || row.alias || row.display_name || "Member",
        avatarUrl: row.avatar_url || null,
        level: levelForXp(row.xp || 0).level,
    };
}

// Get (or create) the DM thread between two friends. Friends-only.
export async function getOrCreateDmThread(userId, otherId) {
    if (!userId || !otherId || userId === otherId) return { error: "invalid" };
    if (!(await areFriends(userId, otherId))) return { error: "not_friends" };
    const [a, b] = pair(userId, otherId);
    await db.query(`INSERT INTO mkt_dm_thread (user_a, user_b) VALUES ($1, $2) ON CONFLICT (user_a, user_b) DO NOTHING`, [a, b]).catch(() => {});
    const row = await db.queryOne(`SELECT id FROM mkt_dm_thread WHERE user_a = $1 AND user_b = $2`, [a, b]).catch(() => null);
    return row ? { threadId: row.id } : { error: "failed" };
}

export async function postDmMessage(threadId, senderId, body, catalogProductId = null) {
    const t = await db.queryOne(`SELECT user_a, user_b FROM mkt_dm_thread WHERE id = $1`, [threadId]).catch(() => null);
    if (!t || (t.user_a !== senderId && t.user_b !== senderId)) return { error: "forbidden" };
    const text = String(body || "").trim().slice(0, 4000);
    if (!text && !catalogProductId) return { error: "empty" };
    const rows = await db
        .query(
            `INSERT INTO mkt_dm_message (thread_id, sender_id, body, catalog_product_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [threadId, senderId, text, catalogProductId || null]
        )
        .catch(() => []);
    await db.query(`UPDATE mkt_dm_thread SET last_message_at = NOW() WHERE id = $1`, [threadId]).catch(() => {});

    // Best-effort push to the other participant.
    const recipientId = t.user_a === senderId ? t.user_b : t.user_a;
    await notifyNewDm(recipientId, senderId, threadId, text || "Shared a card");

    return { ok: true, messageId: rows[0]?.id || null, createdAt: rows[0]?.created_at || null };
}

// Conversations for the inbox (only threads with at least one message), newest first.
export async function listDmThreads(userId) {
    const rows = await db
        .query(
            `SELECT t.id, t.user_a, t.user_b, t.last_message_at, t.a_last_read_at, t.b_last_read_at,
                    m.body AS last_body, m.sender_id AS last_sender, m.catalog_product_id AS last_product,
                    ob.id AS ob_id, ob.alias, ob.first_name, ob.last_name, ob.display_name, ob.avatar_url, ob.xp
               FROM mkt_dm_thread t
               JOIN mkt_buyer ob ON ob.id = CASE WHEN t.user_a = $1 THEN t.user_b ELSE t.user_a END
               LEFT JOIN LATERAL (
                   SELECT body, sender_id, catalog_product_id FROM mkt_dm_message WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1
               ) m ON true
              WHERE (t.user_a = $1 OR t.user_b = $1) AND t.last_message_at IS NOT NULL
              ORDER BY t.last_message_at DESC`,
            [userId]
        )
        .catch(() => []);
    return rows.map((r) => {
        const myRead = r.user_a === userId ? r.a_last_read_at : r.b_last_read_at;
        const unread = r.last_sender && r.last_sender !== userId && (myRead == null || new Date(myRead) < new Date(r.last_message_at));
        return {
            type: "dm",
            id: r.id,
            counterpart: mapUser({
                id: r.ob_id, alias: r.alias, first_name: r.first_name, last_name: r.last_name,
                display_name: r.display_name, avatar_url: r.avatar_url, xp: r.xp,
            }),
            lastPreview: r.last_body || (r.last_product ? "Shared a card" : null),
            lastMessageAt: r.last_message_at,
            unread: Boolean(unread),
        };
    });
}

// Load a DM thread the user is in, its messages, and mark it read.
export async function getDmThread(threadId, userId) {
    const t = await db.queryOne(`SELECT id, user_a, user_b FROM mkt_dm_thread WHERE id = $1`, [threadId]).catch(() => null);
    if (!t || (t.user_a !== userId && t.user_b !== userId)) return null;
    const otherId = t.user_a === userId ? t.user_b : t.user_a;
    const other = mapUser(
        await db
            .queryOne(`SELECT id, alias, first_name, last_name, display_name, avatar_url, xp FROM mkt_buyer WHERE id = $1`, [otherId])
            .catch(() => null)
    );
    const messages = await db
        .query(`SELECT id, sender_id, body, catalog_product_id, created_at FROM mkt_dm_message WHERE thread_id = $1 ORDER BY created_at ASC`, [threadId])
        .catch(() => []);
    const readCol = t.user_a === userId ? "a_last_read_at" : "b_last_read_at";
    await db.query(`UPDATE mkt_dm_thread SET ${readCol} = NOW() WHERE id = $1`, [threadId]).catch(() => {});

    // Resolve any shared products so the client can render a rich card inline.
    const cards = await getProductCards(messages.map((m) => m.catalog_product_id).filter(Boolean));

    return {
        id: threadId,
        counterpart: other,
        messages: messages.map((m) => {
            const pid = m.catalog_product_id != null ? String(m.catalog_product_id) : null;
            return {
                id: m.id,
                mine: m.sender_id === userId,
                body: m.body,
                catalogProductId: pid,
                product: pid ? cards[pid] || null : null,
                createdAt: m.created_at,
            };
        }),
    };
}

export async function unreadDmCount(userId) {
    const row = await db
        .queryOne(
            `SELECT COUNT(*)::int AS n
               FROM mkt_dm_thread t
               JOIN LATERAL (SELECT sender_id, created_at FROM mkt_dm_message WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) m ON true
              WHERE (t.user_a = $1 OR t.user_b = $1) AND m.sender_id <> $1
                AND ((CASE WHEN t.user_a = $1 THEN t.a_last_read_at ELSE t.b_last_read_at END) IS NULL
                     OR (CASE WHEN t.user_a = $1 THEN t.a_last_read_at ELSE t.b_last_read_at END) < m.created_at)`,
            [userId]
        )
        .catch(() => null);
    return row?.n || 0;
}
