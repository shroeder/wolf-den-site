import "server-only";

import { db } from "@/lib/db";
import { sendBadgeAwardedEmail } from "@/lib/marketplace/email.js";
import { getRewardsProgress, levelForXp } from "@/lib/marketplace/xp.js";

// The badge system has two tiers (see migration 104):
//   • Curated (admin_only) — roles & recognition the owner assigns by hand.
//   • Unlockable (auto_rule set) — auto-granted when a member crosses a milestone.
// This module is the data-driven engine: it reads each unlockable badge's rule + threshold, computes
// the member's live metrics, and grants any newly-qualified badges. It never auto-revokes — an earned
// badge (or an admin-granted one) stays. All reads are best-effort so they never break a caller.

function mapBadge(row) {
    return {
        slug: row.slug,
        label: row.label,
        description: row.description || null,
        icon: row.icon || null,
        color: row.color || null,
        adminOnly: row.admin_only !== false,
        autoRule: row.auto_rule || null,
        autoThreshold: row.auto_threshold != null ? Number(row.auto_threshold) : null,
        sortOrder: Number(row.sort_order || 100),
    };
}

// All badge definitions, ordered for display.
export async function listBadges() {
    const rows = await db
        .query(`SELECT slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order FROM mkt_badge ORDER BY sort_order ASC, label ASC`)
        .catch(() => []);
    return rows.map(mapBadge);
}

// The badge slugs a member currently holds.
async function heldSlugs(buyerId) {
    const rows = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return new Set(rows.map((r) => r.badge_slug));
}

// Live metrics used to evaluate unlock rules AND to show progress on the rewards track. One buyer, a
// handful of cheap aggregates. Exported so the track page reuses the exact same numbers the engine grants on.
export async function getMemberMetrics(buyerId) {
    const buyer = await db.queryOne(`SELECT xp, created_at FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const xp = buyer?.xp || 0;

    const [spendRow, eventRow, daysRow, wishRow, friendRow, topRow, tradeRow, donationRow, messageRow, badgeRow] = await Promise.all([
        db.queryOne(`SELECT COALESCE(SUM(points), 0)::int AS n FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'purchase_spend'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'event_checkin'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'daily_active'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM card_watchlist_items i JOIN card_watchers w ON w.id = i.watcher_id WHERE w.buyer_id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_friendship WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'accepted'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT id FROM mkt_buyer WHERE alias IS NOT NULL AND COALESCE(xp, 0) > 0 ORDER BY xp DESC, updated_at ASC LIMIT 1`).catch(() => null),
        db.queryOne(
            `SELECT COUNT(*)::int AS trades, COALESCE(SUM(card_count), 0)::int AS cards,
                    COALESCE(SUM(total_value_cents), 0)::bigint AS value_cents, COALESCE(MAX(top_card_value_cents), 0)::int AS top_cents
               FROM mkt_trade_claim WHERE redeemed_buyer_id = $1`,
            [buyerId]
        ).catch(() => null),
        db.queryOne(
            `SELECT COUNT(*)::int AS donations, COALESCE(SUM(amount_cents), 0)::bigint AS value_cents
               FROM mkt_donation_claim WHERE redeemed_buyer_id = $1`,
            [buyerId]
        ).catch(() => null),
        // Messages this member has SENT — friend DMs + their side of store threads.
        db.queryOne(
            `SELECT ((SELECT COUNT(*) FROM mkt_dm_message WHERE sender_id = $1)
                   + (SELECT COUNT(*) FROM mkt_message msg JOIN mkt_thread th ON th.id = msg.thread_id
                       WHERE msg.sender = 'buyer' AND th.buyer_id = $1))::int AS n`,
            [buyerId]
        ).catch(() => null),
        // How many badges they already hold (drives the meta "collect a lot of badges" badge).
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => null),
    ]);

    const progress = await getRewardsProgress(buyerId).catch(() => ({}));
    const allMilestones = ["spend", "first_purchase", "event_checkin", "discord_link", "profile_complete", "daily_active"].every((k) => Boolean(progress[k]));
    // Onboarding completionist: every one-time getting-started task done (the EARN checklist's one-timers).
    const onboardingComplete = ["first_purchase", "discord_link", "profile_complete", "first_message", "first_friend", "first_wishlist", "first_equip"].every((k) => Boolean(progress[k]));

    const tenureDays = buyer?.created_at ? Math.floor((Date.now() - new Date(buyer.created_at).getTime()) / 86400000) : 0;
    const levelObj = levelForXp(xp);

    return {
        xp,
        level: levelObj.level,
        levelObj,
        spend: spendRow?.n || 0,
        events: eventRow?.n || 0,
        activeDays: daysRow?.n || 0,
        wishlist: wishRow?.n || 0,
        friends: friendRow?.n || 0,
        tenureDays,
        isTop: topRow?.id === buyerId,
        allMilestones,
        onboardingComplete,
        messages: messageRow?.n || 0,
        badgeCount: badgeRow?.n || 0,
        tradeCount: tradeRow?.trades || 0,
        cardsTraded: tradeRow?.cards || 0,
        tradeValue: Math.round(Number(tradeRow?.value_cents || 0) / 100),
        topCard: Math.round(Number(tradeRow?.top_cents || 0) / 100),
        donationCount: donationRow?.donations || 0,
        donationValue: Math.round(Number(donationRow?.value_cents || 0) / 100),
    };
}

// Current vs. required for a rule — drives the track's progress bars. Booleans read as 0/1.
export function progressForRule(rule, threshold, m) {
    const t = Number(threshold || 0);
    switch (rule) {
        case "level": return { current: m.level, target: t };
        case "spend": return { current: m.spend, target: t };
        case "events": return { current: m.events, target: t };
        case "active_days": return { current: m.activeDays, target: t };
        case "tenure_days": return { current: m.tenureDays, target: t };
        case "wishlist": return { current: m.wishlist, target: t };
        case "friends": return { current: m.friends, target: t };
        case "messages": return { current: m.messages, target: t };
        case "badge_count": return { current: m.badgeCount, target: t };
        case "leaderboard_top": return { current: m.isTop ? 1 : 0, target: 1 };
        case "all_milestones": return { current: m.allMilestones ? 1 : 0, target: 1 };
        case "onboarding_complete": return { current: m.onboardingComplete ? 1 : 0, target: 1 };
        case "trade_count": return { current: m.tradeCount, target: t };
        case "cards_traded": return { current: m.cardsTraded, target: t };
        case "trade_value": return { current: m.tradeValue, target: t };
        case "top_card": return { current: m.topCard, target: t };
        case "donation_count": return { current: m.donationCount, target: t };
        case "donation_value": return { current: m.donationValue, target: t };
        default: return { current: 0, target: t || 1 };
    }
}

function qualifies(rule, threshold, m) {
    const { current, target } = progressForRule(rule, threshold, m);
    return current >= target;
}

// Grant any unlockable badges the member now qualifies for. Returns the newly-granted badge defs (so a
// caller can celebrate them). Best-effort and idempotent — a held badge is skipped, nothing is revoked.
export async function syncEarnedBadges(buyerId) {
    if (!buyerId) return [];
    const all = await listBadges().catch(() => []);
    const auto = all.filter((b) => b.autoRule);
    if (!auto.length) return [];

    const held = await heldSlugs(buyerId);
    const candidates = auto.filter((b) => !held.has(b.slug));
    if (!candidates.length) return [];

    const m = await getMemberMetrics(buyerId).catch(() => null);
    if (!m) return [];

    const earned = candidates.filter((b) => qualifies(b.autoRule, b.autoThreshold, m));
    const granted = [];
    for (const b of earned) {
        const ok = await db
            .query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'system') ON CONFLICT DO NOTHING`, [buyerId, b.slug])
            .then(() => true)
            .catch(() => false);
        if (ok) granted.push(b);
    }
    return granted;
}

// ---- Admin management ----

// Members with the badges they hold, for the admin browser. Admin context, so PII (name/email) is fine.
// `q` matches alias, display name, first/last name, or email.
export async function listMembersWithBadges({ q = "", limit = 40, offset = 0 } = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 40));
    const off = Math.max(0, Number(offset) || 0);
    const term = String(q || "").trim().toLowerCase();

    const where = term
        ? `WHERE LOWER(COALESCE(alias, '') || ' ' || COALESCE(display_name, '') || ' ' || COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '')) LIKE $1`
        : "";
    const params = term ? [`%${term}%`, lim, off] : [lim, off];
    const rows = await db
        .query(
            `SELECT id, alias, display_name, first_name, last_name, email, avatar_url, equipped_border, COALESCE(xp, 0) AS xp
               FROM mkt_buyer
               ${where}
              ORDER BY COALESCE(xp, 0) DESC, created_at DESC
              LIMIT ${term ? "$2" : "$1"} OFFSET ${term ? "$3" : "$2"}`,
            params
        )
        .catch(() => []);
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const badgeRows = await db
        .query(
            `SELECT ub.buyer_id, b.slug, b.label, b.icon, b.color, b.admin_only
               FROM mkt_user_badge ub JOIN mkt_badge b ON b.slug = ub.badge_slug
              WHERE ub.buyer_id = ANY($1)
              ORDER BY b.sort_order ASC`,
            [ids]
        )
        .catch(() => []);
    const byBuyer = new Map();
    for (const br of badgeRows) {
        if (!byBuyer.has(br.buyer_id)) byBuyer.set(br.buyer_id, []);
        byBuyer.get(br.buyer_id).push({ slug: br.slug, label: br.label, icon: br.icon || null, color: br.color || null, adminOnly: br.admin_only !== false });
    }

    return rows.map((r) => ({
        id: r.id,
        alias: r.alias || null,
        displayLabel: r.display_name || r.alias || (r.email ? String(r.email).split("@")[0] : "Member"),
        name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
        email: r.email || null,
        avatarUrl: r.avatar_url || null,
        border: r.equipped_border || "none",
        level: levelForXp(r.xp || 0).level,
        xp: Number(r.xp || 0),
        badges: byBuyer.get(r.id) || [],
    }));
}

// Grant a badge to a member (manual/admin). Records who granted it. Idempotent. On a NEW manual grant,
// emails the member a congratulations (best-effort).
export async function grantBadge(buyerId, slug, awardedBy = "admin") {
    if (!buyerId || !slug) return { ok: false, error: "missing_params" };
    const def = await db.queryOne(`SELECT slug, label, icon, description FROM mkt_badge WHERE slug = $1`, [slug]).catch(() => null);
    if (!def) return { ok: false, error: "unknown_badge" };
    const inserted = await db
        .query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING buyer_id`, [buyerId, slug, awardedBy])
        .catch(() => []);
    const isNew = Array.isArray(inserted) && inserted.length > 0;
    if (isNew && awardedBy !== "system") await sendBadgeCongrats(buyerId, def).catch(() => {});
    return { ok: true, isNew };
}

// Email a member a congrats for a badge, then mark it emailed so the auto-backfill never re-sends it.
// Best-effort. `def` must carry { slug, label, icon, description }.
async function sendBadgeCongrats(buyerId, def) {
    const member = await db.queryOne(`SELECT email, display_name, alias FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!member?.email) return false;
    const ok = await sendBadgeAwardedEmail(member.email, {
        label: def.label,
        icon: def.icon || "",
        description: def.description || "",
        name: member.display_name || member.alias || "",
    }).catch(() => false);
    if (ok && def.slug) {
        await db.query(`UPDATE mkt_user_badge SET congrats_emailed_at = NOW() WHERE buyer_id = $1 AND badge_slug = $2`, [buyerId, def.slug]).catch(() => {});
    }
    return ok;
}

// Auto-backfill: email congrats for any manually-granted curated badge that hasn't been emailed yet
// (covers grants made before the congrats email existed, e.g. Eric's). Idempotent via
// congrats_emailed_at; only targets awarded_by='admin' so it never spams seeded/system badges. Runs
// best-effort off the admin badge screen, so it needs no manual action.
export async function backfillBadgeCongrats(limit = 25) {
    const rows = await db
        .query(
            `SELECT ub.buyer_id, b.slug, b.label, b.icon, b.description
               FROM mkt_user_badge ub
               JOIN mkt_badge b ON b.slug = ub.badge_slug
               JOIN mkt_buyer m ON m.id = ub.buyer_id
              WHERE ub.congrats_emailed_at IS NULL
                AND ub.awarded_by = 'admin'
                AND b.admin_only = TRUE
                AND m.email IS NOT NULL
              ORDER BY ub.awarded_at ASC
              LIMIT $1`,
            [limit]
        )
        .catch(() => []);
    let sent = 0;
    for (const def of rows) {
        const ok = await sendBadgeCongrats(def.buyer_id, def).catch(() => false);
        if (ok) sent += 1;
    }
    return sent;
}

// Manual re-send (kept for the app button): email congrats for every curated badge a member holds.
export async function notifyMemberBadges(buyerId) {
    if (!buyerId) return 0;
    const rows = await db
        .query(
            `SELECT b.slug, b.label, b.icon, b.description
               FROM mkt_user_badge ub JOIN mkt_badge b ON b.slug = ub.badge_slug
              WHERE ub.buyer_id = $1 AND b.admin_only = TRUE
              ORDER BY b.sort_order ASC`,
            [buyerId]
        )
        .catch(() => []);
    let sent = 0;
    for (const def of rows) {
        const ok = await sendBadgeCongrats(buyerId, def).catch(() => false);
        if (ok) sent += 1;
    }
    return sent;
}

// Remove a badge from a member (works for auto or curated — the owner has final say).
export async function revokeBadge(buyerId, slug) {
    if (!buyerId || !slug) return { ok: false, error: "missing_params" };
    await db.query(`DELETE FROM mkt_user_badge WHERE buyer_id = $1 AND badge_slug = $2`, [buyerId, slug]).catch(() => {});
    return { ok: true };
}
