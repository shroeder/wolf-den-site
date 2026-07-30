import "server-only";

import { db } from "@/lib/db";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { sendRecapDigestEmail } from "@/lib/marketplace/email.js";

// ── THE WIN-BACK RECAP ───────────────────────────────────────────────────────────────────────────────────────
// An occasional "here's what you missed" email for members we CANNOT reach by push. The entire design goal is
// to not get us unsubscribed, because one unsubscribe costs us that member's inbox permanently. So:
//
//   1. Only people push can't reach. If they have a live subscription, push already did the job.
//   2. Only people who are actually AWAY (AWAY_DAYS). Emailing someone who logged in this morning to tell
//      them what they missed is the single fastest way to look like spam.
//   3. Only when there's something REAL to say — and something waiting *for them* beats general news, so a
//      recap with no personal hooks needs a genuinely busy Den to justify sending.
//   4. One per member per COOLDOWN_DAYS, hard-enforced by digest_last_sent_at, whatever the cron does.
//   5. The primary CTA turns ON push. Converting an email reader into a push subscriber is the actual win —
//      after that they stop needing this email at all.
//
// Everything here is READ-ONLY except the digest_last_sent_at stamp.

const AWAY_DAYS = 6;        // must have been gone at least this long
const COOLDOWN_DAYS = 14;   // never more often than this
const MIN_DEN_NEWS = 3;     // "the Den was busy" threshold when they have no personal hooks
const BATCH = 40;           // members per cron run, so one run can't fan out into a mass mailing

// Members eligible on the hard filters alone (unreachable by push, away, cooled down, opted in, verified).
async function candidates(limit) {
    return db
        .query(
            `SELECT b.id, b.email, COALESCE(NULLIF(b.first_name,''), NULLIF(b.display_name,''), NULLIF(b.alias,'')) AS name,
                    b.last_seen_at
               FROM mkt_buyer b
              WHERE b.email IS NOT NULL AND b.email <> '' AND b.email_verified = TRUE
                AND b.alias IS NOT NULL
                -- opted in (absent key = on)
                AND COALESCE((b.notify_prefs ->> 'email:digest')::boolean, TRUE) IS NOT FALSE
                -- cooled down
                AND (b.digest_last_sent_at IS NULL OR b.digest_last_sent_at < NOW() - INTERVAL '${COOLDOWN_DAYS} days')
                -- actually away
                AND (b.last_seen_at IS NULL OR b.last_seen_at < NOW() - INTERVAL '${AWAY_DAYS} days')
                -- push genuinely can't reach them: no subscription at all
                AND NOT EXISTS (SELECT 1 FROM mkt_web_push w WHERE w.buyer_id = b.id)
              ORDER BY b.last_seen_at ASC NULLS FIRST
              LIMIT ${Math.max(1, Math.min(200, Number(limit) || BATCH))}`
        )
        .catch(() => []);
}

// Things waiting specifically for THIS member — the only content strong enough to earn an email on its own.
async function personalHooks(buyerId) {
    const [gifts, trades, chests] = await Promise.all([
        db.query(
            `SELECT s.pet_id, COALESCE(NULLIF(b.display_name,''), b.alias) AS from_name
               FROM mkt_pet_share s LEFT JOIN mkt_buyer b ON b.id = s.from_buyer_id
              WHERE s.to_buyer_id = $1 AND s.status = 'pending'`,
            [buyerId]
        ).catch(() => []),
        db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_trade_offer
              WHERE to_buyer_id = $1 AND status = 'pending' AND expires_at > NOW()`,
            [buyerId]
        ).catch(() => null),
        db.queryOne(`SELECT COALESCE(SUM(count),0)::int AS n FROM mkt_user_chest WHERE buyer_id = $1`, [buyerId]).catch(() => null),
    ]);

    const hooks = [];
    for (const g of gifts || []) {
        const pet = collectibleById(g.pet_id);
        hooks.push({ icon: "🎁", text: `${g.from_name || "A member"} is giving you <strong>${pet?.name || "a pet"}</strong> — it's still waiting for you to accept.`, url: "/marketplace/pets" });
    }
    if (trades?.n) hooks.push({ icon: "🤝", text: `You have <strong>${trades.n} trade offer${trades.n === 1 ? "" : "s"}</strong> waiting on an answer.`, url: "/marketplace/trade" });
    if (chests?.n) hooks.push({ icon: "🎲", text: `<strong>${chests.n} unopened chest${chests.n === 1 ? "" : "s"}</strong> are sitting in your stash.`, url: "/marketplace/rewards" });
    return hooks;
}

// What actually happened in the Den since they left. Deliberately light — this is flavour, not the reason to
// send. Scoped to their absence so we never claim news they were present for.
async function denNews(since) {
    const [raids, boss, arrivals] = await Promise.all([
        db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_town_event
              WHERE started_at > $1 AND COALESCE(meta->>'silent','false') <> 'true'`,
            [since]
        ).catch(() => null),
        db.queryOne(`SELECT name FROM boss_event WHERE defeated_at IS NOT NULL AND defeated_at > $1 ORDER BY defeated_at DESC LIMIT 1`, [since]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM inventory_feed WHERE in_stock = TRUE AND last_change_at > $1`, [since]).catch(() => null),
    ]);
    const news = [];
    if (raids?.n) news.push({ icon: "⚔️", text: `<strong>${raids.n} town raid${raids.n === 1 ? "" : "s"}</strong> hit the plaza.` });
    if (boss?.name) news.push({ icon: "☠️", text: `The pack brought down <strong>${boss.name}</strong>.` });
    if (arrivals?.n) news.push({ icon: "🃏", text: `<strong>${arrivals.n} new card${arrivals.n === 1 ? "" : "s"}</strong> landed in the shop.` });
    return news;
}

// Run a batch. Returns a summary so the cron response says exactly who was skipped and why — silent skipping
// is how a digest quietly stops working for months.
export async function runRecapDigest({ limit = BATCH, dryRun = false } = {}) {
    const rows = await candidates(limit);
    const out = { considered: rows.length, sent: 0, skippedNothingToSay: 0, failed: 0, dryRun: Boolean(dryRun), recipients: [] };

    for (const m of rows) {
        // Their absence window — for a member who has never been seen, fall back to the cooldown length.
        const since = m.last_seen_at || new Date(Date.now() - COOLDOWN_DAYS * 86400000).toISOString();
        const [hooks, news] = await Promise.all([personalHooks(m.id), denNews(since)]);

        // Rule 3: personal hooks justify a send on their own; otherwise the Den has to have been busy.
        if (!hooks.length && news.length < MIN_DEN_NEWS) {
            out.skippedNothingToSay += 1;
            continue;
        }

        if (dryRun) {
            out.recipients.push({ name: m.name, hooks: hooks.length, news: news.length, awayDays: daysSince(m.last_seen_at) });
            out.sent += 1;
            continue;
        }

        const ok = await sendRecapDigestEmail(m.email, {
            name: m.name || "",
            hooks,
            news,
            awayDays: daysSince(m.last_seen_at),
        }).catch(() => false);

        if (ok) {
            await db.query(`UPDATE mkt_buyer SET digest_last_sent_at = NOW() WHERE id = $1`, [m.id]).catch(() => {});
            out.sent += 1;
            out.recipients.push({ name: m.name, hooks: hooks.length, news: news.length });
        } else {
            out.failed += 1;
        }
    }
    return out;
}

function daysSince(ts) {
    if (!ts) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
}
