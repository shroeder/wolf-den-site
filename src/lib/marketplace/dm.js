import "server-only";

import { db } from "@/lib/db";
import { getProductCards } from "@/lib/marketplace/product-card.js";
import { notifyNewDm } from "@/lib/marketplace/social-notify.js";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
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
        // Prefer the member's BUILT avatar (with baked cosmetics) — same as the hero card — then a photo.
        avatarUrl: avatarImageUrl(row.avatar_config, row.avatar_cosmetics) || row.avatar_url || DEFAULT_AVATAR_URL,
        // Cosmetics (auras/effects/headwear/pet) + equipped border so the chat avatar renders their full look.
        avatarCosmetics: row.avatar_cosmetics || null,
        border: row.equipped_border || "none",
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
        .queryOne(`SELECT user_a, user_b, last_message_at, a_last_read_at, b_last_read_at FROM mkt_dm_thread WHERE id = $1`, [threadId])
        .catch(() => null);
    if (!t || (t.user_a !== senderId && t.user_b !== senderId)) return { error: "forbidden" };
    // ── A BLOCK IS ENFORCED HERE, ON THE SERVER, IN BOTH DIRECTIONS ──────────────────────────────────────
    // Hiding the composer in the client is a courtesy; this is the rule. Symmetric on purpose: if only the
    // blocker were stopped, the blocked party could go on writing into a thread the blocker can no longer
    // answer, which is worse than having no block at all.
    const otherId = t.user_a === senderId ? t.user_b : t.user_a;
    if (await isBlockedBetween(senderId, otherId)) return { error: "blocked" };
    const text = String(body || "").trim().slice(0, 4000);
    if (!text && !catalogProductId) return { error: "empty" };

    // Was the recipient caught up BEFORE this message? If so, this is their first unread → email-worthy.
    const recipientId = otherId;
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
                    ob.id AS ob_id, ob.alias, ob.first_name, ob.last_name, ob.display_name, ob.avatar_url, ob.avatar_config, ob.avatar_cosmetics, ob.equipped_border, ob.xp
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
                display_name: r.display_name, avatar_url: r.avatar_url, avatar_config: r.avatar_config,
                avatar_cosmetics: r.avatar_cosmetics, equipped_border: r.equipped_border, xp: r.xp,
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
    const t = await db.queryOne(`SELECT id, user_a, user_b, vendor_id, a_last_read_at, b_last_read_at FROM mkt_dm_thread WHERE id = $1`, [threadId]).catch(() => null);
    if (!t || (t.user_a !== userId && t.user_b !== userId)) return null;
    const otherId = t.user_a === userId ? t.user_b : t.user_a;
    const otherLastReadAt = t.user_a === otherId ? t.a_last_read_at : t.b_last_read_at;
    const otherRow = await db
        .queryOne(`SELECT id, alias, first_name, last_name, display_name, avatar_url, avatar_config, avatar_cosmetics, xp, equipped_border, last_seen_at FROM mkt_buyer WHERE id = $1`, [otherId])
        .catch(() => null);
    let other = mapUser(otherRow);
    let otherOnline = otherRow?.last_seen_at ? Date.now() - new Date(otherRow.last_seen_at).getTime() < 2 * 60 * 1000 : false;
    // Vendor thread: when the viewer is the BUYER side, show the counterpart as the SHOP (name, logo, link
    // to its storefront) instead of the owner's personal account. The vendor's own side sees the buyer.
    if (t.vendor_id) {
        const v = await db.queryOne(`SELECT id, account_id, display_name, logo_url FROM mkt_vendor WHERE id = $1`, [t.vendor_id]).catch(() => null);
        if (v && v.account_id !== userId) {
            other = { id: null, alias: null, displayLabel: v.display_name || "Shop", avatarUrl: v.logo_url || null, level: null, vendorId: v.id, isShop: true };
            otherOnline = false;
        }
    }

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
    const t = await db.queryOne(`SELECT user_a, user_b FROM mkt_dm_thread WHERE id = $1`, [threadId]).catch(() => null);
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

// ── BLOCK, AND REPORT ────────────────────────────────────────────────────────────────────────────────────────
// DMs shipped with no way out of a conversation. The shared profanity filter (text-filter.js) guards
// member-authored PUBLIC text — town chat, farm names, bounty titles — and a DM is none of those, so a direct
// message is the one place in the Den where a member can write anything to another member with nothing in
// between. Their only options were to ignore it or to tell Luke, and "tell Luke" does not scale past the
// number of people he already knows by name.
//
// Two controls, deliberately small:
//
//   BLOCK is the one that matters, because it needs nobody's permission and it works instantly. Stored
//   directionally (who blocked whom, so the person who set it is the person who can lift it) and enforced
//   SYMMETRICALLY: a block in either direction stops the thread both ways. Enforcing it one-way would let the
//   blocked party keep writing into a thread the blocker can no longer answer, which is worse than nothing.
//
//   REPORT is for when blocking is not the whole answer. It names a MESSAGE where it can, because "this one,
//   here" is what makes a report reviewable a fortnight later, and a message body is immutable so the evidence
//   cannot be edited out from underneath it. Reporting blocks as well, by default — nobody wants to file a
//   report and then keep receiving messages while it is looked at.
export const REPORT_REASONS = ["harassment", "sexual", "scam", "spam", "other"];

/** Either direction. One query, because a block is symmetric at enforcement time. */
export async function isBlockedBetween(a, b) {
    if (!a || !b) return false;
    const row = await db.queryOne(
        `SELECT 1 FROM mkt_dm_block WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
        [a, b]
    ).catch(() => null);
    return Boolean(row);
}

/** Everyone this member has blocked — for the thread list, so a blocked thread can say so. */
export async function blockedIds(userId) {
    if (!userId) return new Set();
    const rows = await db.query(`SELECT blocked_id FROM mkt_dm_block WHERE blocker_id = $1`, [userId]).catch(() => []);
    return new Set(rows.map((r) => r.blocked_id));
}

export async function blockMember(userId, otherId) {
    if (!userId || !otherId || userId === otherId) return { error: "invalid" };
    await db.query(
        `INSERT INTO mkt_dm_block (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, otherId]
    ).catch(() => {});
    return { ok: true, blocked: true };
}

/** Only your OWN block comes off — which is the whole reason the row is stored directionally. */
export async function unblockMember(userId, otherId) {
    if (!userId || !otherId) return { error: "invalid" };
    await db.query(`DELETE FROM mkt_dm_block WHERE blocker_id = $1 AND blocked_id = $2`, [userId, otherId]).catch(() => {});
    return { ok: true, blocked: false };
}

/**
 * File a report, and block by default.
 *
 * `messageId` is verified to belong to the thread and to the person being reported, so a report cannot be
 * used to attach somebody else's words to a member — the one way a reporting tool becomes a weapon.
 */
export async function reportMember(userId, { threadId = null, messageId = null, reason = "other", note = "" } = {}) {
    if (!userId) return { error: "invalid" };
    const t = threadId
        ? await db.queryOne(`SELECT id, user_a, user_b FROM mkt_dm_thread WHERE id = $1`, [threadId]).catch(() => null)
        : null;
    if (!t || (t.user_a !== userId && t.user_b !== userId)) return { error: "forbidden" };
    const otherId = t.user_a === userId ? t.user_b : t.user_a;

    let msgId = null;
    if (messageId) {
        const m = await db.queryOne(
            `SELECT id FROM mkt_dm_message WHERE id = $1 AND thread_id = $2 AND sender_id = $3`,
            [messageId, threadId, otherId]
        ).catch(() => null);
        msgId = m?.id || null;
    }
    const why = REPORT_REASONS.includes(reason) ? reason : "other";
    await db.query(
        `INSERT INTO mkt_dm_report (reporter_id, reported_id, thread_id, message_id, reason, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, otherId, threadId, msgId, why, String(note || "").trim().slice(0, 1000)]
    ).catch(() => {});
    // Reporting blocks too. Filing one and then continuing to receive messages while it is looked at is the
    // shape of a tool nobody uses twice.
    await blockMember(userId, otherId);
    // Straight to the owner's phone. A report sitting in a table nobody opens is the same as no report — and
    // this is the one notification in the Den where the delay matters more than the batching.
    try {
        const { sendAdminPush } = await import("@/lib/push/send.js");
        const who = await db.queryOne(
            `SELECT COALESCE(NULLIF(display_name,''), alias, 'A member') AS a,
                    (SELECT COALESCE(NULLIF(display_name,''), alias, 'a member') FROM mkt_buyer WHERE id = $2) AS b
               FROM mkt_buyer WHERE id = $1`, [userId, otherId]).catch(() => null);
        await sendAdminPush({ title: "A message was reported",
            body: `${who?.a || "A member"} reported ${who?.b || "a member"} — ${why}.`, route: "messages" });
    } catch { /* the report is filed either way; the ping is best-effort */ }
    return { ok: true, blocked: true, reported: true };
}
