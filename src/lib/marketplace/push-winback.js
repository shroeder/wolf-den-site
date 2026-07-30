import "server-only";

import { db } from "@/lib/db";
import { sendPushWinbackEmail } from "@/lib/marketplace/email.js";
import { ONBOARDING_TASKS } from "@/lib/marketplace/onboarding.js";
import { VAPID_ROTATED_AT } from "@/lib/marketplace/notify-prefs.js";

// ── ONE-TIME PUSH WIN-BACK ───────────────────────────────────────────────────────────────────────────────────
// A single deliberate email to every member push can't reach, offering the gold that the onboarding
// "notifications" task already pays. Most members never saw that offer because the first-visit card was gone
// by the time they cared.
//
// This is a BULK send, which is exactly why it isn't a cron: it's admin-triggered, and push_winback_sent_at
// makes it idempotent so hitting the route twice can't mail anyone twice. Always dry-run first.
//
// It does NOT bypass preferences — someone who muted announcement email doesn't get it, because an email
// asking permission to send more notifications is the last thing that should ignore an opt-out.

const NOTIF_GOLD = ONBOARDING_TASKS.find((t) => t.key === "notifications")?.gold || 250;

async function targets(limit) {
    return db
        .query(
            `SELECT b.id, b.email,
                    COALESCE(NULLIF(b.first_name,''), NULLIF(b.display_name,''), NULLIF(b.alias,'')) AS name,
                    NOT (COALESCE(b.onboarding_done,'[]'::jsonb) @> '["notifications"]') AS owed_gold
               FROM mkt_buyer b
              WHERE b.email IS NOT NULL AND b.email <> '' AND b.email_verified = TRUE
                AND b.alias IS NOT NULL
                -- never sent this before
                AND b.push_winback_sent_at IS NULL
                -- respects the announcement opt-out
                AND COALESCE((b.notify_prefs ->> 'email:announce')::boolean, TRUE) IS NOT FALSE
                -- push genuinely can't reach them; a pre-rotation subscription is dead, so it doesn't count
                AND NOT EXISTS (
                    SELECT 1 FROM mkt_web_push w
                     WHERE w.buyer_id = b.id AND w.created_at >= '${VAPID_ROTATED_AT}'
                )
              ORDER BY b.created_at ASC
              LIMIT ${Math.max(1, Math.min(500, Number(limit) || 500))}`
        )
        .catch(() => []);
}

export async function runPushWinback({ limit, dryRun = true } = {}) {
    const rows = await targets(limit);
    const out = {
        dryRun: Boolean(dryRun),
        targets: rows.length,
        owedGold: rows.filter((r) => r.owed_gold).length,
        goldExposure: rows.filter((r) => r.owed_gold).length * NOTIF_GOLD,
        sent: 0,
        failed: 0,
        recipients: rows.map((r) => ({ name: r.name, owedGold: Boolean(r.owed_gold) })),
    };
    if (dryRun) return out;

    for (const m of rows) {
        const ok = await sendPushWinbackEmail(m.email, {
            name: m.name || "",
            gold: m.owed_gold ? NOTIF_GOLD : 0,
        }).catch(() => false);
        if (ok) {
            // Stamp per-member as we go, so a timeout halfway through can't re-mail the ones already done.
            await db.query(`UPDATE mkt_buyer SET push_winback_sent_at = NOW() WHERE id = $1`, [m.id]).catch(() => {});
            out.sent += 1;
        } else {
            out.failed += 1;
        }
    }
    return out;
}
