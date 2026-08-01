import "server-only";

import { db } from "@/lib/db";

// ── LAUNCH ANNOUNCEMENTS ─────────────────────────────────────────────────────────────────────────────────────
//
// One card, shown once, the next time a member opens the game. Built because the Kitchen went public and there
// was no way to tell anybody: the Den's members do not read release notes, they open the app.
//
// Two rules keep it from becoming spam:
//   ONE AT A TIME    — the newest unseen announcement only. Three features shipping in a week should not stack
//                      three modals in front of somebody who just wanted to check their farm.
//   NEW MEMBERS ARE  — someone who joined after an announcement went out never knew the old state, so telling
//   ALREADY CAUGHT UP  them the Kitchen "just opened" is noise about a thing that has always been there.

export async function getPendingAnnouncement(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `SELECT a.key, a.title, a.body, a.emoji, a.art_url, a.cta_label, a.cta_href
           FROM mkt_announcement a
           JOIN mkt_buyer b ON b.id = $1
          WHERE a.active = TRUE
            AND b.created_at < a.starts_at
            AND NOT EXISTS (SELECT 1 FROM mkt_announcement_seen s WHERE s.buyer_id = $1 AND s.key = a.key)
          ORDER BY a.created_at DESC
          LIMIT 1`,
        [buyerId]
    ).catch(() => null);
    if (!row) return null;
    return {
        key: row.key,
        title: row.title,
        body: row.body,
        emoji: row.emoji || "✨",
        artUrl: row.art_url || null,
        ctaLabel: row.cta_label || null,
        ctaHref: row.cta_href || null,
    };
}

// Dismissing is idempotent — a double-tap, or the card being closed on two devices, must not error.
export async function markAnnouncementSeen(buyerId, key) {
    if (!buyerId || !key) return { ok: false };
    await db.query(
        `INSERT INTO mkt_announcement_seen (buyer_id, key) VALUES ($1, $2) ON CONFLICT (buyer_id, key) DO NOTHING`,
        [buyerId, String(key).slice(0, 120)]
    ).catch(() => {});
    return { ok: true };
}
