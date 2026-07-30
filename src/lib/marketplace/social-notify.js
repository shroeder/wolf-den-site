import "server-only";

import { db } from "@/lib/db";
import { sendDmNotificationEmail, sendFriendRequestEmail } from "@/lib/marketplace/email.js";
import { sendBuyerPush } from "@/lib/push/send.js";
import { sendWebPush } from "@/lib/push/web-push.js";

// Best-effort notifications for marketplace social events (DMs, friend requests): push to the member's
// phone app always, plus an EMAIL when they're offline (so an away member doesn't miss it). Every
// function swallows its own errors so a failure never blocks the underlying action.

const OFFLINE_AFTER_MS = 5 * 60 * 1000; // treat as "offline" if not seen in the last 5 minutes

async function displayName(userId) {
    const row = await db
        .queryOne(`SELECT first_name, last_name, alias, display_name FROM mkt_buyer WHERE id = $1`, [userId])
        .catch(() => null);
    if (!row) return "Someone";
    const name = `${row.first_name || ""} ${row.last_name || ""}`.trim();
    return name || row.alias || row.display_name || "Someone";
}

// PUBLIC label only — display name or @handle, NEVER a real first/last name. Used for browser (web)
// push, which surfaces on a shared desktop, so it must not leak a member's real name.
async function publicLabel(userId) {
    const row = await db
        .queryOne(`SELECT alias, display_name FROM mkt_buyer WHERE id = $1`, [userId])
        .catch(() => null);
    return row?.display_name || row?.alias || "Someone";
}

// Recipient's email + prefs + presence, for deciding whether to email.
async function recipientContact(userId) {
    return db
        .queryOne(
            `SELECT email, display_name, first_name, alias, notify_email_dm, notify_email_friend, last_seen_at FROM mkt_buyer WHERE id = $1`,
            [userId]
        )
        .catch(() => null);
}

function isOffline(lastSeenAt) {
    if (!lastSeenAt) return true;
    return Date.now() - new Date(lastSeenAt).getTime() > OFFLINE_AFTER_MS;
}

// Record that a member is currently active (called from the poll endpoints), so we don't email while
// they're using the app/site.
export async function markSeen(userId) {
    if (!userId) return;
    await db.query(`UPDATE mkt_buyer SET last_seen_at = NOW() WHERE id = $1`, [userId]).catch(() => {});
}

// New DM message -> push always; email when offline. `firstUnread` (only the first unread message in a
// thread sets it) rate-limits the email so a burst of messages is at most one email.
export async function notifyNewDm(recipientId, senderId, threadId, preview, { firstUnread = false } = {}) {
    try {
        if (!recipientId || recipientId === senderId) return;
        const name = await displayName(senderId);
        await sendBuyerPush(recipientId, {
            title: name,
            body: preview?.trim() ? preview.trim().slice(0, 140) : "Sent you a message",
            route: `dm/${threadId}`,
            data: { type: "dm", threadId },
        });
        // Browser push uses the public label (no real names on a possibly-shared desktop).
        await sendWebPush(recipientId, {
            kind: "dm",
            title: `💬 ${await publicLabel(senderId)}`,
            body: preview?.trim() ? preview.trim().slice(0, 140) : "Sent you a message",
            // Open the actual DM conversation — NOT the vendor messages page (that mismatch was the bug).
            url: `/marketplace/dm/${threadId}`,
            tag: `dm-${threadId}`,
            data: { type: "dm", threadId },
        });
        if (firstUnread) {
            const c = await recipientContact(recipientId);
            if (c?.email && c.notify_email_dm !== false && isOffline(c.last_seen_at)) {
                await sendDmNotificationEmail(c.email, { senderName: name, preview, name: c.first_name || c.display_name || c.alias || "" }).catch(() => {});
            }
        }
    } catch {
        /* best-effort */
    }
}

// New friend request -> push always; email when offline.
export async function notifyFriendRequest(addresseeId, requesterId) {
    try {
        if (!addresseeId || addresseeId === requesterId) return;
        const name = await displayName(requesterId);
        await sendBuyerPush(addresseeId, {
            title: "New friend request",
            body: `${name} wants to be friends`,
            route: "friends",
            data: { type: "friend_request" },
        });
        await sendWebPush(addresseeId, {
            kind: "friend",
            title: "🤝 New friend request",
            body: `${await publicLabel(requesterId)} wants to be friends`,
            url: "/marketplace/friends",
            tag: "friend-request",
            data: { type: "friend_request" },
        });
        const c = await recipientContact(addresseeId);
        if (c?.email && c.notify_email_friend !== false && isOffline(c.last_seen_at)) {
            await sendFriendRequestEmail(c.email, { requesterName: name, name: c.first_name || c.display_name || c.alias || "" }).catch(() => {});
        }
    } catch {
        /* best-effort */
    }
}

// Friend request accepted -> notify the original requester.
export async function notifyFriendAccepted(requesterId, accepterId) {
    try {
        if (!requesterId || requesterId === accepterId) return;
        const name = await displayName(accepterId);
        await sendBuyerPush(requesterId, {
            title: "Friend request accepted",
            body: `${name} accepted your friend request`,
            route: "friends",
            data: { type: "friend_accept" },
        });
        await sendWebPush(requesterId, {
            kind: "friend",
            title: "🎉 Friend request accepted",
            body: `${await publicLabel(accepterId)} accepted your friend request`,
            url: "/marketplace/friends",
            tag: "friend-accept",
            data: { type: "friend_accept" },
        });
    } catch {
        /* best-effort */
    }
}
