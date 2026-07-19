import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { getMemberMetrics } from "@/lib/marketplace/badges.js";
import { getInventory } from "@/lib/marketplace/inventory.js";
import { memberPetPerks } from "@/lib/marketplace/pet-redemption.js";
import { describeStats } from "@/lib/marketplace/items.js";
import { getUserBadges } from "@/lib/marketplace/profile.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iso = (d) => (d ? new Date(d).toISOString() : null);

// Friendly labels for the raw XP-event action keys (the member's historical action log).
const ACTION_LABEL = {
    message: "💬 Sent a message",
    wishlist_add: "❤️ Added a card to wishlist",
    daily_active: "📅 Opened the app",
    profile_complete: "✅ Completed their profile",
    purchase_flat: "🛒 Made a purchase",
    purchase_spend: "🛒 Spent in store",
    first_purchase: "🛒 First purchase",
    event_checkin: "🎪 Checked in at an event",
    discord_link: "🔗 Linked Discord",
    first_message: "💬 First message",
    first_friend: "🤝 Made their first friend",
    first_wishlist: "❤️ First wishlist item",
    first_equip: "✨ Equipped a cosmetic",
    boss_attack: "⚔️ Attacked the boss",
    boss_participated: "🏆 Fought a boss",
    boss_won: "🥇 Won a boss raffle",
    consumable: "🧪 Used a consumable",
};
const actionLabel = (a) => ACTION_LABEL[a] || String(a || "").replace(/_/g, " ");

// Friendly labels for the granular activity-telemetry events (equipping, viewing profiles, searching, …).
const ACTIVITY_LABEL = {
    equip: (m) => `🎽 Equipped ${m?.name || "gear"}`,
    unequip: (m) => `➖ Unequipped ${m?.slot || "gear"}`,
    buy_gear: (m) => `🛒 Bought ${m?.name || "gear"}`,
    sell_gear: (m) => `💰 Sold ${m?.name || "gear"}`,
    buy_cosmetic: (m) => `🎨 Bought cosmetic${m?.name ? ` ${m.name}` : ""}`,
    buy_badge: (m) => `🎖️ Bought badge${m?.name ? ` ${m.name}` : ""}`,
    buy_consumable: (m) => `🧪 Bought ${m?.name || "a consumable"}`,
    use_consumable: (m) => `🧪 Used ${m?.name || "a consumable"}`,
    open_chest: (m) => `🎁 Opened a ${m?.tier || ""} chest`.replace("  ", " "),
    trade_propose: () => "🤝 Proposed a trade",
    trade_accept: () => "🤝 Accepted a trade",
    view_profile: (m) => `👀 Viewed ${m?.alias ? `@${m.alias}` : m?.name || "a profile"}`,
    shop_search: (m) => `🔍 Searched the shop${m?.q ? ` “${m.q}”` : ""}`,
    inspect_item: (m) => `🔎 Inspected ${m?.name || "an item"}`,
    browse_shop: () => "🛍️ Browsed the shop",
    view_boss: () => "⚔️ Viewed the boss",
    view_leaderboard: () => "🏆 Viewed the leaderboard",
    view_vendor: () => "🏪 Viewed a shop",
};
const activityLabel = (event, meta, path) => {
    if (event === "page_view") return `📄 Viewed ${path || "a page"}`;
    return ACTIVITY_LABEL[event] ? ACTIVITY_LABEL[event](meta) : String(event || "").replace(/_/g, " ");
};

// Full drill-down on ONE member for the admin app: identity, level/gold, boss + engagement stats, their
// gear (equipped + owned), badges, and recent in-store redemptions.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/member/[id]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { id } = await params;
            const row = await db.queryOne(
                `SELECT id, display_name, alias, first_name, last_name, email, COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, created_at, last_seen_at FROM mkt_buyer WHERE id = $1`,
                [id]
            ).catch(() => null);
            if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

            const [metrics, inv, badges, redemptions, historyRows, petPerks] = await Promise.all([
                getMemberMetrics(id).catch(() => ({})),
                getInventory(id).catch(() => null),
                getUserBadges(id).catch(() => []),
                db.query(`SELECT reward_label, redeemed_at FROM mkt_item_redemption WHERE buyer_id = $1 ORDER BY redeemed_at DESC LIMIT 12`, [id]).catch(() => []),
                db.query(`SELECT action, points, created_at FROM mkt_xp_event WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT 80`, [id]).catch(() => []),
                memberPetPerks(id).catch(() => []),
            ]);
            // Granular activity telemetry, merged with the XP ledger into one detailed timeline.
            const activityRows = await db.query(`SELECT event, meta, path, created_at FROM mkt_activity_event WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT 120`, [id]).catch(() => []);
            const history = [
                ...(historyRows || []).map((r) => ({ label: actionLabel(r.action), points: Number(r.points) || 0, at: r.created_at })),
                ...(activityRows || []).map((r) => {
                    let meta = r.meta;
                    if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = null; } }
                    return { label: activityLabel(r.event, meta, r.path), points: 0, at: r.created_at };
                }),
            ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 120);

            const equippedIds = new Set(Object.values(inv?.equipped || {}));
            const gear = (inv?.items || []).map((i) => ({
                id: i.id,
                name: i.name,
                rarity: i.rarity,
                slot: i.slot,
                equipped: equippedIds.has(i.id),
                stats: describeStats(i.stats),
                signature: i.signature ? `${i.signature.label}: ${i.signature.desc}` : null,
                flavor: i.flavor || null,
            }));

            return NextResponse.json({
                profile: {
                    id: row.id,
                    name: row.display_name || row.alias || (row.email ? row.email.split("@")[0] : "Member"),
                    realName: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
                    alias: row.alias || null,
                    email: row.email || null,
                    level: levelForXp(row.xp).level,
                    xp: row.xp,
                    gold: row.gold,
                    createdAt: iso(row.created_at),
                    lastSeenAt: iso(row.last_seen_at),
                },
                boss: { damage: metrics.bossDamage || 0, hits: metrics.bossHits || 0, fought: metrics.bossesFought || 0, won: metrics.bossesWon || 0 },
                activity: { spend: metrics.spend || 0, events: metrics.events || 0, activeDays: metrics.activeDays || 0, friends: metrics.friends || 0, messages: metrics.messages || 0, tenureDays: metrics.tenureDays || 0, eliteItems: metrics.eliteItems || 0 },
                gear,
                badges: (badges || []).map((b) => ({ label: b.label, icon: b.icon })),
                redemptions: (redemptions || []).map((r) => ({ label: r.reward_label, at: iso(r.redeemed_at) })),
                petPerks: (petPerks || []).map((p) => ({ petId: p.petId, name: p.name, reward: p.reward, available: p.available, cooldownUntil: p.cooldownUntil })),
                history: history.map((x) => ({ label: x.label, points: x.points, at: iso(x.at) })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.member.detail.failure" });
        }
    });
}
