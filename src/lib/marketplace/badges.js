import "server-only";

import { db } from "@/lib/db";
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

// Live metrics used to evaluate unlock rules. One buyer, a handful of cheap aggregates.
async function computeMetrics(buyerId) {
    const buyer = await db.queryOne(`SELECT xp, created_at FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const xp = buyer?.xp || 0;

    const [spendRow, eventRow, daysRow, wishRow, friendRow, topRow] = await Promise.all([
        db.queryOne(`SELECT COALESCE(SUM(points), 0)::int AS n FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'purchase_spend'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'event_checkin'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'daily_active'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM card_watchlist_items i JOIN card_watchers w ON w.id = i.watcher_id WHERE w.buyer_id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_friendship WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'accepted'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT id FROM mkt_buyer WHERE alias IS NOT NULL AND COALESCE(xp, 0) > 0 ORDER BY xp DESC, updated_at ASC LIMIT 1`).catch(() => null),
    ]);

    const progress = await getRewardsProgress(buyerId).catch(() => ({}));
    const allMilestones = ["spend", "first_purchase", "event_checkin", "discord_link", "profile_complete", "daily_active"].every((k) => Boolean(progress[k]));

    const tenureDays = buyer?.created_at ? Math.floor((Date.now() - new Date(buyer.created_at).getTime()) / 86400000) : 0;

    return {
        level: levelForXp(xp).level,
        spend: spendRow?.n || 0,
        events: eventRow?.n || 0,
        activeDays: daysRow?.n || 0,
        wishlist: wishRow?.n || 0,
        friends: friendRow?.n || 0,
        tenureDays,
        isTop: topRow?.id === buyerId,
        allMilestones,
    };
}

function qualifies(rule, threshold, m) {
    const t = Number(threshold || 0);
    switch (rule) {
        case "level": return m.level >= t;
        case "spend": return m.spend >= t;
        case "events": return m.events >= t;
        case "active_days": return m.activeDays >= t;
        case "tenure_days": return m.tenureDays >= t;
        case "wishlist": return m.wishlist >= t;
        case "friends": return m.friends >= t;
        case "leaderboard_top": return m.isTop;
        case "all_milestones": return m.allMilestones;
        default: return false;
    }
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

    const m = await computeMetrics(buyerId).catch(() => null);
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
            `SELECT id, alias, display_name, first_name, last_name, email, avatar_url, COALESCE(xp, 0) AS xp
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
        level: levelForXp(r.xp || 0).level,
        xp: Number(r.xp || 0),
        badges: byBuyer.get(r.id) || [],
    }));
}

// Grant a badge to a member (manual/admin). Records who granted it. Idempotent.
export async function grantBadge(buyerId, slug, awardedBy = "admin") {
    if (!buyerId || !slug) return { ok: false, error: "missing_params" };
    const def = await db.queryOne(`SELECT slug FROM mkt_badge WHERE slug = $1`, [slug]).catch(() => null);
    if (!def) return { ok: false, error: "unknown_badge" };
    await db
        .query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [buyerId, slug, awardedBy])
        .catch(() => {});
    return { ok: true };
}

// Remove a badge from a member (works for auto or curated — the owner has final say).
export async function revokeBadge(buyerId, slug) {
    if (!buyerId || !slug) return { ok: false, error: "missing_params" };
    await db.query(`DELETE FROM mkt_user_badge WHERE buyer_id = $1 AND badge_slug = $2`, [buyerId, slug]).catch(() => {});
    return { ok: true };
}
