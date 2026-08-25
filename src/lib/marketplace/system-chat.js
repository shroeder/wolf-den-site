import "server-only";

import { db } from "@/lib/db";

// ── THE DEN SAYS SOMETHING, NOT A MEMBER ─────────────────────────────────────────────────────────────────────
// Automated announcements go out as the WOLF DEN ARBITER, which is the game's established system voice — a real
// mkt_buyer row with its own hero sprite, so it renders like any other speaker without the chat needing to learn
// a new kind of message.
//
// This exists because the first cut of the Long Road announcement posted as the MEMBER who earned it, and the
// result was Luke's own avatar and bubble saying "The Wolf Den is the first in the Den to take rung 22" — a
// third-person boast, apparently typed by him, about himself. Luke: "I didn't picture the announcement being me
// sending a message. I told you a system announcement." He is right, and the comment I wrote defending it
// (something about it reading as "a celebration of a person") was reasoning backwards from what the code
// already did.
//
// The rule is simple: if a HUMAN did not type it, a human's name must not be on it.
//
// Looked up by ALIAS rather than a pasted uuid — the id is stable today and an id in source is the kind of
// thing that rots silently. Returns false if the Arbiter is missing, so a failure is a missing announcement
// rather than an exception in the middle of paying somebody out.
// `kind` marks an AUTOMATED post so it can be muted without muting the Arbiter, who also writes the
// hand-authored triage posts members ask for. NULL — the default, and every message written before this — is
// "a human typed this". See migration 388 and NOTIFY_KINDS "milestone".
export async function postSystemChat(body, kind = null) {
    const text = String(body || "").trim();
    if (!text) return false;
    const arbiter = await db.queryOne(`SELECT id FROM mkt_buyer WHERE alias = 'arbiter' LIMIT 1`).catch(() => null);
    if (!arbiter?.id) return false;
    const r = await db.queryOne(
        // ── INTO THE NEWS ROOM ───────────────────────────────────────────────────────────────────────
        // Both kinds the house writes go here: the automated milestones and the hand-written
        // announcements. From a reader's side they are one thing — the house talking — and in the plaza
        // they were a wall of unbroken text sitting between people trying to have a conversation.
        `INSERT INTO mkt_town_chat (buyer_id, body, kind, channel) VALUES ($1, $2, $3, 'announce') RETURNING id`,
        [arbiter.id, text, kind || null]
    ).catch(() => null);
    return Boolean(r);
}
