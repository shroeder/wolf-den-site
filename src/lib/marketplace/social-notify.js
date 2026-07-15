import "server-only";

import { db } from "@/lib/db";
import { sendBuyerPush } from "@/lib/push/send.js";

// Best-effort push notifications for marketplace social events (DMs, friend requests) to the member's
// phone app. Every function swallows its own errors so a push failure never blocks the underlying
// action (sending a DM, adding a friend).

async function displayName(userId) {
    const row = await db
        .queryOne(`SELECT first_name, last_name, alias, display_name FROM mkt_buyer WHERE id = $1`, [userId])
        .catch(() => null);
    if (!row) return "Someone";
    const name = `${row.first_name || ""} ${row.last_name || ""}`.trim();
    return name || row.alias || row.display_name || "Someone";
}

// New DM message -> notify the recipient.
export async function notifyNewDm(recipientId, senderId, threadId, preview) {
    try {
        if (!recipientId || recipientId === senderId) return;
        const name = await displayName(senderId);
        await sendBuyerPush(recipientId, {
            title: name,
            body: preview?.trim() ? preview.trim().slice(0, 140) : "Sent you a message",
            route: `dm/${threadId}`,
            data: { type: "dm", threadId },
        });
    } catch {
        /* best-effort */
    }
}

// New friend request -> notify the addressee.
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
    } catch {
        /* best-effort */
    }
}
