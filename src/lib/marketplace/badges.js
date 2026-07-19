import "server-only";

import { db } from "@/lib/db";
import { itemById } from "@/lib/marketplace/items.js";
import { sendBadgeAwardedEmail } from "@/lib/marketplace/email.js";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { getRewardsProgress, levelForXp } from "@/lib/marketplace/xp.js";
import { sendWebPush } from "@/lib/push/web-push.js";

// The admin app loads avatars over the network, so it needs an ABSOLUTE url (the built DiceBear avatar is
// served relative). Prefer the built avatar (what the website shows), fall back to any uploaded one.
const SITE_ORIGIN = "https://www.wolfdengamingmn.com";
function memberAvatarUrl(row) {
    const built = avatarImageUrl(row.avatar_config, row.avatar_cosmetics);
    if (built) return built.startsWith("/") ? `${SITE_ORIGIN}${built}` : built;
    return row.avatar_url || null;
}

// Browser push for a newly-earned badge. Best-effort; `def` carries { slug, label, icon, description }.
async function pushBadgeEarned(buyerId, def) {
    if (!buyerId || !def?.slug) return;
    await sendWebPush(buyerId, {
        title: `${def.icon || "🏅"} Badge unlocked!`,
        body: def.description ? `${def.label} — ${def.description}` : `You earned ${def.label}`,
        url: "/marketplace/rewards",
        tag: `badge-${def.slug}`,
        data: { type: "badge", slug: def.slug },
    }).catch(() => {});
}

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
        secret: row.secret === true,
        autoRule: row.auto_rule || null,
        autoThreshold: row.auto_threshold != null ? Number(row.auto_threshold) : null,
        goldPrice: row.gold_price != null ? Number(row.gold_price) : null,
        dropOnly: row.drop_only === true,
        sortOrder: Number(row.sort_order || 100),
    };
}

// All badge definitions, ordered for display.
export async function listBadges() {
    const rows = await db
        .query(`SELECT slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, gold_price, drop_only, sort_order FROM mkt_badge ORDER BY sort_order ASC, label ASC`)
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

    const [spendRow, eventRow, daysRow, wishRow, friendRow, topRow, tradeRow, donationRow, bossRow, bossWonRow, messageRow, badgeRow] = await Promise.all([
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
        db.queryOne(
            `SELECT COUNT(*) FILTER (WHERE kind = 'manual')::int AS hits,
                    COALESCE(SUM(damage), 0)::int AS dmg,
                    COUNT(DISTINCT boss_id) FILTER (WHERE kind = 'manual')::int AS bosses
               FROM boss_hit WHERE buyer_id = $1`,
            [buyerId]
        ).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM boss_event WHERE winner_buyer_id = $1`, [buyerId]).catch(() => null),
        // Messages this member has SENT. Since Phase 2, friend DMs AND their side of vendor/store threads
        // both live in mkt_dm_message keyed by sender_id, so one count covers everything.
        db.queryOne(
            `SELECT (SELECT COUNT(*) FROM mkt_dm_message WHERE sender_id = $1)::int AS n`,
            [buyerId]
        ).catch(() => null),
        // How many badges they already hold (drives the meta "collect a lot of badges" badge).
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => null),
    ]);

    // Elite gear owned — counts of top-rarity items (drives the Ascendant/Eternal badges + pet unlocks).
    const ownedItemRows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    let eliteItems = 0, eternalItems = 0;
    for (const r of ownedItemRows) {
        const d = itemById(r.item_id);
        if (!d) continue;
        if (d.rarity === "ascendant" || d.rarity === "eternal") eliteItems++;
        if (d.rarity === "eternal") eternalItems++;
    }

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
        bossHits: bossRow?.hits || 0,
        bossDamage: bossRow?.dmg || 0,
        bossesFought: bossRow?.bosses || 0,
        bossesWon: bossWonRow?.n || 0,
        eliteItems,
        eternalItems,
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
        case "boss_hits": return { current: m.bossHits, target: t };
        case "boss_damage": return { current: m.bossDamage, target: t };
        case "bosses_fought": return { current: m.bossesFought, target: t };
        case "bosses_won": return { current: m.bossesWon, target: t };
        case "elite_items": return { current: m.eliteItems, target: t };
        case "eternal_items": return { current: m.eternalItems, target: t };
        default: return { current: 0, target: t || 1 };
    }
}

function qualifies(rule, threshold, m) {
    const { current, target } = progressForRule(rule, threshold, m);
    return current >= target;
}

// The full badge board for a member: every badge with earned/locked state + progress on the unlockables,
// plus the single "next badge" (closest unearned unlockable). Powers the Badges hub + the next-badge nudge.
export async function getBadgeBoard(buyerId) {
    const [all, held, m] = await Promise.all([listBadges(), heldSlugs(buyerId), getMemberMetrics(buyerId)]);
    // Secret badges stay hidden until you actually hold one — no locked/mystery slot teasing them.
    const visible = all.filter((b) => !b.secret || held.has(b.slug));
    const badges = visible.map((b) => {
        const earned = held.has(b.slug);
        let progress = null;
        if (!earned && b.autoRule) {
            const { current, target } = progressForRule(b.autoRule, b.autoThreshold, m);
            const t = Math.max(1, target);
            progress = { current: Math.max(0, Math.min(current, t)), target: t, pct: Math.max(0, Math.min(100, Math.round((current / t) * 100))) };
        }
        return { slug: b.slug, label: b.label, description: b.description, icon: b.icon, color: b.color, adminOnly: b.adminOnly, unlockable: Boolean(b.autoRule), goldPrice: b.goldPrice, dropOnly: b.dropOnly, earned, progress };
    });
    // Next = closest unearned UNLOCKABLE badge by progress (admin-assigned ones can't be "earned" by progress).
    const next = badges
        .filter((b) => !b.earned && b.unlockable && b.progress)
        .sort((a, z) => z.progress.pct - a.progress.pct)[0] || null;
    return {
        badges,
        earnedCount: badges.filter((b) => b.earned).length,
        totalCount: badges.length,
        next: next ? { label: next.label, icon: next.icon, color: next.color, ...next.progress } : null,
    };
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
    for (const b of granted) await pushBadgeEarned(buyerId, b); // celebrate each newly-earned badge in the browser
    return granted;
}

// Keep the live 1st/2nd/3rd-place badges in sync with the leaderboard: grant place_N to the current
// rank-N member (by XP) and revoke it from everyone else. Idempotent — run on a cron. Unlike normal auto
// badges these are REVOCABLE (you lose your medal when someone overtakes you).
export async function syncLeaderboardBadges() {
    const rows = await db
        .query(`SELECT id FROM mkt_buyer WHERE alias IS NOT NULL AND COALESCE(xp, 0) > 0 ORDER BY xp DESC, created_at ASC LIMIT 3`)
        .catch(() => []);
    const changed = [];
    for (let i = 0; i < 3; i++) {
        const slug = `place_${i + 1}`;
        const winner = rows[i]?.id || null;
        if (!winner) {
            await db.query(`DELETE FROM mkt_user_badge WHERE badge_slug = $1`, [slug]).catch(() => {});
            continue;
        }
        await db.query(`DELETE FROM mkt_user_badge WHERE badge_slug = $1 AND buyer_id <> $2`, [slug, winner]).catch(() => {});
        const ins = await db
            .query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'system') ON CONFLICT DO NOTHING RETURNING buyer_id`, [winner, slug])
            .catch(() => []);
        if (ins.length) { changed.push({ slug, buyerId: winner }); await pushBadgeEarned(winner, { slug, label: `${i + 1}${["st", "nd", "rd"][i]} Place`, icon: ["🥇", "🥈", "🥉"][i] }).catch(() => {}); }
    }
    return { top: rows.map((r) => r.id), changed };
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
            `SELECT id, alias, display_name, first_name, last_name, email, avatar_url, avatar_config, avatar_cosmetics, avatar_sprite_url, featured_collectible, equipped_border, COALESCE(xp, 0) AS xp
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

    return rows.map((r) => {
        const av = memberAvatarUrl(r);
        return {
            id: r.id,
            alias: r.alias || null,
            displayLabel: r.display_name || r.alias || (r.email ? String(r.email).split("@")[0] : "Member"),
            name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
            email: r.email || null,
            avatarUrl: av,
            // A PNG variant the admin app (Coil) can render directly — the built avatar endpoint is SVG.
            avatarPngUrl: av && av.includes("/api/marketplace/avatar?") ? `${av}&format=png` : av,
            // The AI full-body hero sprite (PNG) — already reflects equipped gear; the richest "hero" image.
            avatarSpriteUrl: r.avatar_sprite_url || null,
            featuredCollectibleId: r.featured_collectible || null,
            border: r.equipped_border || "none",
            level: levelForXp(r.xp || 0).level,
            xp: Number(r.xp || 0),
            badges: byBuyer.get(r.id) || [],
        };
    });
}

// Grant a badge to a member (manual/admin). Records who granted it. Idempotent. On a NEW manual grant,
// emails the member a congratulations (best-effort).
export async function grantBadge(buyerId, slug, awardedBy = "admin") {
    if (!buyerId || !slug) return { ok: false, error: "missing_params" };
    const def = await db.queryOne(`SELECT slug, label, icon, description, auto_rule, gold_price, drop_only FROM mkt_badge WHERE slug = $1`, [slug]).catch(() => null);
    if (!def) return { ok: false, error: "unknown_badge" };
    // Only curated (admin_only) badges are hand-assignable — auto / purchasable / drop badges are earned.
    if (awardedBy === "admin" && (def.auto_rule || def.gold_price != null || def.drop_only)) return { ok: false, error: "not_assignable" };
    const inserted = await db
        .query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING buyer_id`, [buyerId, slug, awardedBy])
        .catch(() => []);
    const isNew = Array.isArray(inserted) && inserted.length > 0;
    if (isNew && awardedBy !== "system") await sendBadgeCongrats(buyerId, def).catch(() => {});
    if (isNew) await pushBadgeEarned(buyerId, def);
    return { ok: true, isNew };
}

// Gold-priced badges for the badge shop, with the member's gold + owned/afford state.
export async function listBadgeShop(buyerId) {
    const [held, goldRow, rows] = await Promise.all([
        buyerId ? heldSlugs(buyerId) : Promise.resolve(new Set()),
        buyerId ? db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null) : Promise.resolve(null),
        db.query(`SELECT slug, label, description, icon, color, gold_price FROM mkt_badge WHERE gold_price IS NOT NULL ORDER BY gold_price ASC`).catch(() => []),
    ]);
    const gold = goldRow?.gold || 0;
    return {
        gold,
        badges: rows.map((r) => ({ slug: r.slug, label: r.label, description: r.description, icon: r.icon, color: r.color, price: r.gold_price, owned: held.has(r.slug), canAfford: gold >= r.gold_price })),
    };
}

// Buy a gold-priced badge. Atomic gold deduction + grant. Returns { ok, gold } or an error key.
export async function buyBadge(buyerId, slug) {
    if (!buyerId || !slug) return { ok: false, error: "missing_params" };
    const def = await db.queryOne(`SELECT slug, label, icon, description, gold_price FROM mkt_badge WHERE slug = $1`, [slug]).catch(() => null);
    if (!def || def.gold_price == null) return { ok: false, error: "not_for_sale" };
    const owned = await db.queryOne(`SELECT 1 FROM mkt_user_badge WHERE buyer_id = $1 AND badge_slug = $2`, [buyerId, slug]).catch(() => null);
    if (owned) return { ok: false, error: "already_owned" };
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, def.gold_price]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'purchase') ON CONFLICT DO NOTHING`, [buyerId, slug]).catch(() => {});
    await pushBadgeEarned(buyerId, def).catch(() => {});
    return { ok: true, gold: row.gold };
}

// Grant a random un-owned DROP-ONLY badge (used by loot-chest opens + boss kills). Returns it or null.
export async function grantRandomDropBadge(buyerId) {
    if (!buyerId) return null;
    const rows = await db.query(`SELECT slug, label, icon, description FROM mkt_badge WHERE drop_only = TRUE`).catch(() => []);
    if (!rows.length) return null;
    const held = await heldSlugs(buyerId);
    const pool = rows.filter((r) => !held.has(r.slug));
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const ins = await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'drop') ON CONFLICT DO NOTHING RETURNING buyer_id`, [buyerId, pick.slug]).catch(() => []);
    if (ins.length) { await pushBadgeEarned(buyerId, pick).catch(() => {}); return pick; }
    return null;
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
