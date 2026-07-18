import "server-only";

import { db } from "@/lib/db";
import { getProductCards } from "@/lib/marketplace/product-card.js";
import { notifyNewDm } from "@/lib/marketplace/social-notify.js";
import { levelForXp } from "@/lib/marketplace/xp.js";

// User-to-user direct messages. Distinct from the buyer<->vendor mkt_thread system; both are surfaced
// together in the unified inbox.

function pair(a, b) {
    return a < b ? [a, b] : [b, a];
}

function mapUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        alias: row.alias || null,
        // Public label — never the real first/last name (private). Handle / chosen display name only.
        displayLabel: row.display_name || row.alias || "Member",
        avatarUrl: row.avatar_url || null,
        level: levelForXp(row.xp || 0).level,
    };
}

// Get (or create) the DM thread between two members. Open to anyone (like trades) so a member can message
// any player from their profile — not just friends.
export async function getOrCreateDmThread(userId, otherId) {
    if (!userId || !otherId || userId === otherId) return { error: "invalid" };
    const [a, b] = pair(userId, otherId);
    await db.query(`INSERT INTO mkt_dm_thread (user_a, user_b) VALUES ($1, $2) ON CONFLICT (user_a, user_b) WHERE vendor_id IS NULL DO NOTHING`, [a, b]).catch(() => {});
    const row = await db.queryOne(`SELECT id FROM mkt_dm_thread WHERE user_a = $1 AND user_b = $2 AND vendor_id IS NULL`, [a, b]).catch(() => null);
    return row ? { threadId: row.id } : { error: "failed" };
}

export async function postDmMessage(threadId, senderId, body, catalogProductId = null) {
    const t = await db
        .queryOne(`SELECT user_a, user_b, last_message_at, a_last_read_at, b_last_read_at FROM mkt_dm_thread WHERE id = $1 AND vendor_id IS NULL`, [threadId])
        .catch(() => null);
    if (!t || (t.user_a !== senderId && t.user_b !== senderId)) return { error: "forbidden" };
    const text = String(body || "").trim().slice(0, 4000);
    if (!text && !catalogProductId) return { error: "empty" };

    // Was the recipient caught up BEFORE this message? If so, this is their first unread → email-worthy.
    const recipientId = t.user_a === senderId ? t.user_b : t.user_a;
    const recipientRead = t.user_a === recipientId ? t.a_last_read_at : t.b_last_read_at;
    const firstUnread = !t.last_message_at || (recipientRead != null && new Date(recipientRead) >= new Date(t.last_message_at));

    const rows = await db
        .query(
            `INSERT INTO mkt_dm_message (thread_id, sender_id, body, catalog_product_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [threadId, senderId, text, catalogProductId || null]
        )
        .catch(() => []);
    await db.query(`UPDATE mkt_dm_thread SET last_message_at = NOW() WHERE id = $1`, [threadId]).catch(() => {});

    // Best-effort push (always) + email (only when offline + first unread).
    await notifyNewDm(recipientId, senderId, threadId, text || "Shared a card", { firstUnread });

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
              WHERE (t.user_a = $1 OR t.user_b = $1) AND t.vendor_id IS NULL AND t.last_message_at IS NOT NULL
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

// Load a DM thread the user is in, its messages, reactions, presence + typing of the other person,
// and mark it read. Powers the first-class conversation view.
export async function getDmThread(threadId, userId) {
    const t = await db.queryOne(`SELECT id, user_a, user_b, a_last_read_at, b_last_read_at FROM mkt_dm_thread WHERE id = $1 AND vendor_id IS NULL`, [threadId]).catch(() => null);
    if (!t || (t.user_a !== userId && t.user_b !== userId)) return null;
    const otherId = t.user_a === userId ? t.user_b : t.user_a;
    const otherLastReadAt = t.user_a === otherId ? t.a_last_read_at : t.b_last_read_at;
    const otherRow = await db
        .queryOne(`SELECT id, alias, first_name, last_name, display_name, avatar_url, xp, equipped_border, last_seen_at FROM mkt_buyer WHERE id = $1`, [otherId])
        .catch(() => null);
    const other = mapUser(otherRow);
    const otherOnline = otherRow?.last_seen_at ? Date.now() - new Date(otherRow.last_seen_at).getTime() < 2 * 60 * 1000 : false;

    const typingRow = await db.queryOne(`SELECT updated_at FROM mkt_dm_typing WHERE thread_id = $1 AND buyer_id = $2`, [threadId, otherId]).catch(() => null);
    const otherTyping = typingRow?.updated_at ? Date.now() - new Date(typingRow.updated_at).getTime() < 6000 : false;

    const messages = await db
        .query(`SELECT id, sender_id, body, catalog_product_id, created_at FROM mkt_dm_message WHERE thread_id = $1 ORDER BY created_at ASC`, [threadId])
        .catch(() => []);
    const readCol = t.user_a === userId ? "a_last_read_at" : "b_last_read_at";
    await db.query(`UPDATE mkt_dm_thread SET ${readCol} = NOW() WHERE id = $1`, [threadId]).catch(() => {});

    // Reactions across the thread's messages, grouped per message with a "mine" flag.
    const ids = messages.map((m) => m.id);
    const reactRows = ids.length
        ? await db.query(`SELECT message_id, emoji, buyer_id FROM mkt_dm_reaction WHERE message_id = ANY($1)`, [ids]).catch(() => [])
        : [];
    const reactByMsg = new Map();
    for (const rr of reactRows) {
        if (!reactByMsg.has(rr.message_id)) reactByMsg.set(rr.message_id, new Map());
        const em = reactByMsg.get(rr.message_id);
        const cur = em.get(rr.emoji) || { emoji: rr.emoji, count: 0, mine: false };
        cur.count += 1;
        if (rr.buyer_id === userId) cur.mine = true;
        em.set(rr.emoji, cur);
    }

    const cards = await getProductCards(messages.map((m) => m.catalog_product_id).filter(Boolean));

    return {
        id: threadId,
        counterpart: other,
        otherLastReadAt,
        otherOnline,
        otherTyping,
        messages: messages.map((m) => {
            const pid = m.catalog_product_id != null ? String(m.catalog_product_id) : null;
            return {
                id: m.id,
                mine: m.sender_id === userId,
                body: m.body,
                catalogProductId: pid,
                product: pid ? cards[pid] || null : null,
                createdAt: m.created_at,
                reactions: reactByMsg.has(m.id) ? Array.from(reactByMsg.get(m.id).values()) : [],
            };
        }),
    };
}

// Verify the user is a participant of the thread. Returns the thread row or null.
async function threadForUser(threadId, userId) {
    const t = await db.queryOne(`SELECT user_a, user_b FROM mkt_dm_thread WHERE id = $1 AND vendor_id IS NULL`, [threadId]).catch(() => null);
    if (!t || (t.user_a !== userId && t.user_b !== userId)) return null;
    return t;
}

// Toggle an emoji reaction on a message (one reaction per person per message — same emoji removes it,
// a different emoji replaces it).
export async function reactToMessage(threadId, userId, messageId, emoji) {
    if (!threadId || !userId || !messageId || !emoji) return { error: "invalid" };
    const t = await threadForUser(threadId, userId);
    if (!t) return { error: "forbidden" };
    const msg = await db.queryOne(`SELECT thread_id FROM mkt_dm_message WHERE id = $1`, [messageId]).catch(() => null);
    if (!msg || msg.thread_id !== threadId) return { error: "not_found" };
    const e = String(emoji).slice(0, 8);
    const existing = await db.queryOne(`SELECT emoji FROM mkt_dm_reaction WHERE message_id = $1 AND buyer_id = $2`, [messageId, userId]).catch(() => null);
    if (existing?.emoji === e) {
        await db.query(`DELETE FROM mkt_dm_reaction WHERE message_id = $1 AND buyer_id = $2`, [messageId, userId]).catch(() => {});
    } else {
        await db
            .query(
                `INSERT INTO mkt_dm_reaction (message_id, buyer_id, emoji) VALUES ($1, $2, $3)
                 ON CONFLICT (message_id, buyer_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`,
                [messageId, userId, e]
            )
            .catch(() => {});
    }
    return { ok: true };
}

// Ping that the user is typing in a thread (ephemeral; the other side polls it).
export async function setTyping(threadId, userId) {
    if (!threadId || !userId) return { error: "invalid" };
    const t = await threadForUser(threadId, userId);
    if (!t) return { error: "forbidden" };
    await db
        .query(`INSERT INTO mkt_dm_typing (thread_id, buyer_id) VALUES ($1, $2) ON CONFLICT (thread_id, buyer_id) DO UPDATE SET updated_at = NOW()`, [threadId, userId])
        .catch(() => {});
    return { ok: true };
}

export async function unreadDmCount(userId) {
    const row = await db
        .queryOne(
            `SELECT COUNT(*)::int AS n
               FROM mkt_dm_thread t
               JOIN LATERAL (SELECT sender_id, created_at FROM mkt_dm_message WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) m ON true
              WHERE (t.user_a = $1 OR t.user_b = $1) AND t.vendor_id IS NULL AND m.sender_id <> $1
                AND ((CASE WHEN t.user_a = $1 THEN t.a_last_read_at ELSE t.b_last_read_at END) IS NULL
                     OR (CASE WHEN t.user_a = $1 THEN t.a_last_read_at ELSE t.b_last_read_at END) < m.created_at)`,
            [userId]
        )
        .catch(() => null);
    return row?.n || 0;
}
