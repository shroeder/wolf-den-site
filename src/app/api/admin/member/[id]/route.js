import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { getMemberMetrics } from "@/lib/marketplace/badges.js";
import { getInventory } from "@/lib/marketplace/inventory.js";
import { forgeRank } from "@/lib/marketplace/forge-rank.js";
import { memberPetPerks } from "@/lib/marketplace/pet-redemption.js";
import { petsState } from "@/lib/marketplace/pets.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { collectibleById, petActive, petPassive } from "@/lib/marketplace/collectibles.js";
import { CHEST_TIERS, CHEST_ORDER, chestGrantHistory } from "@/lib/marketplace/chests.js";
import { describeStats, itemById } from "@/lib/marketplace/items.js";
import { getUserBadges } from "@/lib/marketplace/profile.js";
import { levelForXp, SPEND_XP_PER_DOLLAR } from "@/lib/marketplace/xp.js";
import { coinLedger, coinBreakdown } from "@/lib/marketplace/coins.js";
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
    restock: "📦 Sold cards to the store (restock)",
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
    buy_pet: (m) => `🐾 Bought a pet${m?.price ? ` (${m.price}g)` : ""}`,
    buy_daily_deal: () => "🏷️ Bought a daily deal",
    daily_spin: (m) => `🎡 Spun the wheel${m?.prize ? ` → ${m.prize}` : ""}`,
    daily_checkin: (m) => `📆 Daily check-in${m?.streak ? ` (streak ${m.streak})` : ""}`,
    equip_pet: () => "🐾 Equipped a pet",
    happy_hour_donate: (m) => `🎉 Donated ${m?.gold || m?.amount || ""}g to Happy Hour`,
    cheer: (m) => `📣 Cheered ${m?.toName || "a teammate"}${m?.damage ? ` (+${m.damage} dmg)` : ""}`,
    boss_attack: (m) => `⚔️ Hit the boss${m?.damage ? ` for ${m.damage}` : ""}${m?.crit ? " 💥CRIT" : ""}${m?.defeated ? " ☠️KILL" : ""}`,
    sail_voyage: (m) => `⛵ Set sail${m?.option ? ` (${m.option})` : ""}`,
    sail_dig: (m) => `⛏️ Dug up ${m?.frags ?? 0} fragment(s)${m?.relic ? " + a relic!" : ""}`,
    sail_forge: (m) => `🔨 Forged a ${m?.tier || ""} chest`,
    sail_raid: (m) => `🏴‍☠️ Raided ${m?.foe || "a ship"}${m?.outcome ? ` — ${m.outcome}` : ""}${m?.item ? ` (won ${m.item})` : ""}`,
    sail_merchant: () => "💰 Met the Gold Merchant",
    sail_merchant_buy: (m) => `🛒 Bought ${m?.name || "an item"} from the Merchant`,
    sail_wave: () => "👋 Waved at a passing sailor",
    sail_encounter: (m) => `🌊 Sailing encounter${m?.type ? `: ${String(m.type).replace(/_/g, " ")}` : ""}`,
    buy_upgrade: (m) => `⬆️ Upgraded ${m?.track || m?.kind || "boat"}${m?.level ? ` to Lv${m.level}` : ""}`,
    buy_digs: () => "⛏️ Bought extra digs",
    buy_spin: () => "🎡 Bought an extra spin",
    cooldown_skip: (m) => `⏩ Skipped a cooldown${m?.kind ? ` (${String(m.kind).replace(/_/g, " ")})` : ""}`,
    // Farm / pets
    pet_farm: () => "❤️ Petted one of their pets",
    pet_other: () => "❤️ Petted a friend's pet",
    feed_other: () => "🎁 Fed a treat to a friend's pet",
    plant_seed: (m) => `🌱 Planted ${m?.seedId || "a seed"}`,
    harvest_crop: (m) => `🌾 Harvested ${m?.seedId || "a crop"}${m?.chest ? ` — found a ${m.chest} chest!` : ""}`,
    loot_pig: (m) => `🐷 Loot Pig haul (+${m?.gold || 0}g${m?.item ? ` + ${m.item}` : ""})`,
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
                `SELECT id, display_name, alias, first_name, last_name, email, phone, COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, COALESCE(store_credit_cents,0) AS store_credit_cents, created_at, last_seen_at, avatar_sprite_url, avatar_sprite_flip, equipped_border, featured_collectible, notify_prefs, discord_user_id FROM mkt_buyer WHERE id = $1`,
                [id]
            ).catch(() => null);
            if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

            const [metrics, inv, badges, redemptions, historyRows, petPerks, pets, petSprites, coins, coinBd, tradeRows, buckets, purchaseXpRows, creditEvents, chestGrants, reach, geo] = await Promise.all([
                getMemberMetrics(id).catch(() => ({})),
                getInventory(id).catch(() => null),
                getUserBadges(id).catch(() => []),
                db.query(`SELECT reward_label, redeemed_at FROM mkt_item_redemption WHERE buyer_id = $1 ORDER BY redeemed_at DESC LIMIT 12`, [id]).catch(() => []),
                db.query(`SELECT action, points, created_at FROM mkt_xp_event WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT 500`, [id]).catch(() => []),
                memberPetPerks(id).catch(() => []),
                petsState(id).catch(() => null),
                getPetSpriteData().catch(() => ({})),
                // Coin (gold) ledger — all-time, newest first — and a per-reason coin breakdown.
                coinLedger(id, { limit: 400 }).catch(() => ({ events: [], earned: 0, spent: 0 })),
                coinBreakdown(id).catch(() => []),
                // Player-to-player trades (both directions), pending + resolved, with full give/get.
                db.query(
                    `SELECT id, from_buyer_id, to_buyer_id, offered_items, offered_gold, offered_pets,
                            requested_items, requested_gold, requested_pets, status, note, created_at, resolved_at
                       FROM mkt_trade_offer WHERE from_buyer_id = $1 OR to_buyer_id = $1
                      ORDER BY created_at DESC LIMIT 50`,
                    [id]
                ).catch(() => []),
                // Activity-volume buckets: today (store-local), last 3/7/30 days, and all-time.
                db.queryOne(
                    `SELECT
                        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date)::int AS today,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '3 days')::int  AS d3,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int  AS d7,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS d30,
                        COUNT(*)::int AS all_time
                       FROM mkt_activity_event WHERE buyer_id = $1`,
                    [id]
                ).catch(() => null),
                // Real in-store purchases attributed to this member. The authoritative record is the
                // per-order purchase_spend XP event (deduped by order id); its meta carries the merchandise
                // amount (older rows reconstruct it from points ÷ SPEND_XP_PER_DOLLAR). Covers both walk-in
                // sales auto-credited to their account and pre-account purchases they later claimed.
                db.query(
                    `SELECT points, meta, created_at
                       FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'purchase_spend'
                      ORDER BY created_at DESC LIMIT 80`,
                    [id]
                ).catch(() => []),
                // Store-credit money movements: bought credit, spent in-store (QR), applied online, refunds.
                db.query(
                    `SELECT delta_cents, balance_after_cents, reason, ref, created_at
                       FROM mkt_store_credit_event WHERE buyer_id = $1
                      ORDER BY created_at DESC LIMIT 120`,
                    [id]
                ).catch(() => []),
                // Chest-grant history — every loot chest this member received, and WHERE it came from.
                chestGrantHistory(id, { limit: 150 }).catch(() => []),
                // CAN WE ACTUALLY REACH THIS PERSON? Three independent channels, and knowing a member has
                // pushes DISABLED matters as much as knowing they're on: it's the difference between "they
                // ignored the raid alert" and "they never got it".
                db.queryOne(
                    `SELECT
                        (SELECT COUNT(*)::int FROM mkt_web_push   WHERE buyer_id = $1) AS web_push,
                        (SELECT COUNT(*)::int FROM mkt_push_token WHERE buyer_id = $1) AS app_push,
                        (SELECT MAX(last_used_at) FROM mkt_web_push WHERE buyer_id = $1) AS web_push_last`,
                    [id]
                ).catch(() => null),
                // Where they are. Two very different things, shown as such: precise geolocation is OPT-IN (they
                // tapped allow on the browser prompt) and accurate to metres; IP geo is always there and is a
                // guess. Newest visitor row wins.
                db.queryOne(
                    `SELECT city, region, country, timezone, geo_lat, geo_lng, geo_accuracy, geo_at,
                            device, browser, os, last_seen
                       FROM mkt_visitor
                      WHERE buyer_id = $1
                      ORDER BY (geo_lat IS NOT NULL) DESC, last_seen DESC NULLS LAST
                      LIMIT 1`,
                    [id]
                ).catch(() => null),
            ]);
            // Hero-card visuals + a featured-pet + pets summary.
            const featuredPet = row.featured_collectible ? collectibleById(row.featured_collectible) : null;
            const petSpriteUrl = (row.featured_collectible && petSprites[row.featured_collectible]?.url) || null;
            const petSpriteFlip = (row.featured_collectible && petSprites[row.featured_collectible]?.flip) || false;
            // Granular activity telemetry, merged with the XP ledger into one detailed timeline.
            const activityRows = await db.query(`SELECT event, meta, path, created_at FROM mkt_activity_event WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT 500`, [id]).catch(() => []);
            const history = [
                ...(historyRows || []).map((r) => ({ label: actionLabel(r.action), points: Number(r.points) || 0, at: r.created_at })),
                ...(activityRows || []).map((r) => {
                    let meta = r.meta;
                    if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = null; } }
                    return { label: activityLabel(r.event, meta, r.path), points: 0, at: r.created_at };
                }),
            ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 500);
            // Clean XP-only ledger (no view/telemetry noise) — shows exactly how the member is leveling.
            const xpLedger = (historyRows || []).filter((r) => Number(r.points)).map((r) => ({ label: actionLabel(r.action), points: Number(r.points) || 0, at: iso(r.created_at) }));

            // Resolve trade give/get into human names. `direction` is relative to THIS member: out = they
            // proposed it, in = it was proposed TO them. give/get are always from this member's point of view.
            const itemNm = (iid) => itemById(iid)?.name || iid;
            const petNm = (pid) => collectibleById(pid)?.name || pid;
            const partyIds = [...new Set((tradeRows || []).map((t) => (t.from_buyer_id === id ? t.to_buyer_id : t.from_buyer_id)))];
            const partyRows = partyIds.length
                ? await db.query(`SELECT id, display_name, alias FROM mkt_buyer WHERE id = ANY($1)`, [partyIds]).catch(() => [])
                : [];
            const partyName = new Map((partyRows || []).map((p) => [p.id, p.display_name || p.alias || "Member"]));
            const arr = (v) => (Array.isArray(v) ? v : []);
            const trades = (tradeRows || []).map((t) => {
                const iAmProposer = t.from_buyer_id === id;
                const mineSide = { items: arr(iAmProposer ? t.offered_items : t.requested_items).map(itemNm), pets: arr(iAmProposer ? t.offered_pets : t.requested_pets).map(petNm), gold: Number(iAmProposer ? t.offered_gold : t.requested_gold) || 0 };
                const theirSide = { items: arr(iAmProposer ? t.requested_items : t.offered_items).map(itemNm), pets: arr(iAmProposer ? t.requested_pets : t.offered_pets).map(petNm), gold: Number(iAmProposer ? t.requested_gold : t.offered_gold) || 0 };
                return {
                    id: t.id,
                    direction: iAmProposer ? "out" : "in",
                    status: t.status,
                    with: partyName.get(iAmProposer ? t.to_buyer_id : t.from_buyer_id) || "Member",
                    give: mineSide, // what this member gives up
                    get: theirSide, // what this member receives
                    note: t.note || null,
                    at: iso(t.created_at),
                    resolvedAt: iso(t.resolved_at),
                };
            });

            // Unified purchase & redemption feed: real in-store Square sales + every store-credit money move
            // (buying credit online, spending it in-store via QR, applying it at online checkout, refunds).
            const CREDIT_REASON = {
                purchase: "💳 Bought store credit",
                spend_store: "🧾 Spent credit in-store (QR)",
                spend_online: "🛒 Applied credit at online checkout",
                refund: "💵 Store-credit refund",
                adjust: "⚙️ Store-credit adjustment",
            };
            // Friendly, icon-led labels for the coin ledger reason keys, so the true up/down statement reads
            // like plain English instead of raw snake_case keys.
            const COIN_REASON = {
                raid_win: "⚔️ Raid win", raid_loss: "🛡️ Raid loss", spin_prize: "🎡 Spin prize", boss_reward: "🐉 Boss reward",
                quest_reward: "📜 Quest reward", badge_reward: "🎖️ Badge reward", chest_reward: "🧰 Chest reward",
                checkin: "📅 Daily check-in", bounty: "🎯 Bounty", giveaway: "🎁 Giveaway", sell_gear: "💰 Sold gear",
                xp_accrual: "✨ XP accrual", coin_purchase: "🪙 Bought coins", admin_grant: "⚙️ Admin grant",
                buy_gear: "🛒 Bought gear", buy_pet: "🐾 Bought pet", buy_badge: "🎖️ Bought badge", buy_cosmetic: "🎨 Bought cosmetic",
                buy_consumable: "🧪 Bought supply", buy_daily_deal: "🔥 Daily deal", upgrade: "⬆️ Upgrade", cooldown_skip: "⏩ Cooldown skip",
                buy_digs: "⛏️ Bought digs", buy_spin: "🎟️ Bought spin", merchant_buy: "⛵ Merchant buy", happy_hour: "🍻 Happy hour",
                trade: "🤝 Trade", trade_escrow: "🤝 Trade escrow", harvest: "🌾 Harvest", harvest_loot: "🎁 Harvest loot",
                farm_upgrade: "🌱 Farm upgrade", loot_pig: "🐷 Loot pig", cheer: "📣 Cheer", seed_buy: "🌱 Seed",
            };
            const coinLabel = (reason) => COIN_REASON[reason] || String(reason || "coins").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
            // The merchandise amount for a purchase_spend event: prefer the stamped meta amount (exact, new
            // rows). Older rows only have points, which already had the Happy-Hour multiplier baked in, so we
            // estimate whole dollars (spend was always whole dollars) — flagged approx so the UI can mark it.
            const purchaseAmount = (row) => {
                let m = row.meta;
                if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = null; } }
                if (m && m.amountCents != null) return { cents: Math.max(0, Number(m.amountCents) || 0), approx: false };
                return { cents: Math.max(0, Math.round((Number(row.points) || 0) / SPEND_XP_PER_DOLLAR) * 100), approx: true };
            };
            const instorePurchases = (purchaseXpRows || []).map((r) => {
                const { cents, approx } = purchaseAmount(r);
                return { kind: "instore", label: "🛒 In-store purchase", amountCents: cents, approx, at: iso(r.created_at) };
            });
            const purchases = [
                ...instorePurchases,
                ...(creditEvents || []).map((r) => ({ kind: "credit", reason: r.reason, label: CREDIT_REASON[r.reason] || String(r.reason || "").replace(/_/g, " "), amountCents: Number(r.delta_cents) || 0, balanceAfterCents: Number(r.balance_after_cents) || 0, at: iso(r.created_at) })),
            ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 80);
            const purchaseSummary = {
                // Real money spent in-store (loyalty-attributed Square sales).
                instoreCents: instorePurchases.reduce((s, r) => s + r.amountCents, 0),
                // Store credit they bought online (real money).
                creditBoughtCents: (creditEvents || []).filter((r) => r.reason === "purchase").reduce((s, r) => s + (Number(r.delta_cents) || 0), 0),
                // Store credit they've redeemed/spent (in-store QR + online).
                creditSpentCents: (creditEvents || []).filter((r) => r.reason === "spend_store" || r.reason === "spend_online").reduce((s, r) => s + Math.abs(Number(r.delta_cents) || 0), 0),
                count: instorePurchases.length + (creditEvents || []).length,
            };

            const equippedIds = new Set(Object.values(inv?.equipped || {}));
            const gear = (inv?.items || []).map((i) => ({
                id: i.id,
                name: i.name,
                rarity: i.rarity,
                slot: i.slot,
                equipped: equippedIds.has(i.id),
                enhanceLevel: i.enhanceLevel || 0,
                forge: forgeRank(i.enhanceLevel || 0), // { level, stars, color, rainbow, tierName, maxed } or null
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
                    storeCreditCents: row.store_credit_cents,
                    createdAt: iso(row.created_at),
                    lastSeenAt: iso(row.last_seen_at),
                    // Hero-card visuals.
                    spriteUrl: row.avatar_sprite_url || null,
                    spriteFlip: row.avatar_sprite_url ? row.avatar_sprite_flip === true : false,
                    border: row.equipped_border && row.equipped_border !== "none" ? row.equipped_border : null,
                    petSpriteUrl,
                    petSpriteFlip,
                    profileUrl: row.alias ? `/marketplace/u/${row.alias}` : null,
                },
                // ── Can we reach them, and where are they? ────────────────────────────────────────────────
                // A member with zero subscriptions never SAW the announcement — worth knowing before assuming
                // they ignored it. notify_prefs stores explicit opt-OUTs ("channel:kind": false) and an absent
                // key means ON, so `mutedCount` counts deliberate switch-offs, not defaults.
                reach: (() => {
                    let prefs = row.notify_prefs;
                    if (typeof prefs === "string") { try { prefs = JSON.parse(prefs); } catch { prefs = null; } }
                    const entries = Object.entries(prefs || {});
                    const muted = entries.filter(([, v]) => v === false).map(([k]) => k);
                    const webPush = Number(reach?.web_push || 0);
                    const appPush = Number(reach?.app_push || 0);
                    // An EMPTY notify_prefs means nothing has been opted out, i.e. every channel is on. Testing
                    // `muted < entries.length` read 0 < 0 as false and reported members with live subscriptions
                    // and zero opt-outs as unreachable — the exact opposite of the truth.
                    const allMuted = entries.length > 0 && muted.length === entries.length;
                    return {
                        webPush, appPush,
                        pushEnabled: webPush + appPush > 0 && !allMuted,
                        webPushLastUsed: iso(reach?.web_push_last),
                        mutedCount: muted.length,
                        allMuted,
                        muted: muted.slice(0, 24),
                        discordLinked: Boolean(row.discord_user_id),
                        email: row.email || null,
                        phone: row.phone || null,
                    };
                })(),
                location: geo ? {
                    // Opt-in browser geolocation: they tapped "allow". Accurate to metres.
                    precise: geo.geo_lat != null && geo.geo_lng != null
                        ? { lat: Number(geo.geo_lat), lng: Number(geo.geo_lng), accuracyM: geo.geo_accuracy != null ? Number(geo.geo_accuracy) : null, at: iso(geo.geo_at) }
                        : null,
                    // IP-derived. Always present, always a guess — never show it as if they shared it.
                    city: geo.city || null, region: geo.region || null, country: geo.country || null,
                    timezone: geo.timezone || null,
                    device: [geo.device, geo.browser, geo.os].filter(Boolean).join(" · ") || null,
                    lastSeen: iso(geo.last_seen),
                } : null,
                boss: { damage: metrics.bossDamage || 0, hits: metrics.bossHits || 0, fought: metrics.bossesFought || 0, won: metrics.bossesWon || 0 },
                activity: { spend: metrics.spend || 0, events: metrics.events || 0, activeDays: metrics.activeDays || 0, friends: metrics.friends || 0, messages: metrics.messages || 0, tenureDays: metrics.tenureDays || 0, eliteItems: metrics.eliteItems || 0 },
                gear,
                pets: {
                    owned: pets?.ownedIds?.length || 0,
                    featured: featuredPet ? { id: featuredPet.id, name: featuredPet.name, rarity: featuredPet.rarity, spriteUrl: petSpriteUrl, spriteFlip: petSpriteFlip } : null,
                    // Full owned-pet list so the admin can inspect every companion (sprite + rarity + level).
                    list: (pets?.ownedIds || []).map((pid) => {
                        const def = collectibleById(pid);
                        const sp = petSprites[pid];
                        const lvl = pets?.petLevels?.[pid];
                        const active = def ? petActive(def) : null;
                        const passive = def ? petPassive(def) : null;
                        const fmtStat = (s) => String(s || "").replace(/_/g, " ");
                        return {
                            id: pid,
                            name: def?.name || pid,
                            rarity: def?.rarity || null,
                            source: def?.source || null,
                            level: lvl?.level || 1,
                            spriteUrl: sp?.url || null,
                            spriteFlip: sp?.flip || false,
                            hint: def?.hint || null,
                            // What it does: an equipped (active) buff + the always-on owned (passive) bonus.
                            activeDesc: active ? `+${active.value}% ${fmtStat(active.stat)} when equipped` : null,
                            passiveDesc: passive ? `+${lvl?.value ?? passive.value} ${fmtStat(passive.stat)} (owned, all pets stack)` : null,
                        };
                    }),
                },
                chestTiers: CHEST_ORDER.map((t) => ({ tier: t, label: CHEST_TIERS[t].label, emoji: CHEST_TIERS[t].emoji })),
                badges: (badges || []).map((b) => ({ label: b.label, icon: b.icon, slug: b.slug, spriteUrl: b.sprite_url || null })),
                redemptions: (redemptions || []).map((r) => ({ label: r.reward_label, at: iso(r.redeemed_at) })),
                // Real purchases + store-credit money moves (incl. in-store QR redemptions).
                purchases,
                purchaseSummary,
                petPerks: (petPerks || []).map((p) => ({ petId: p.petId, name: p.name, reward: p.reward, available: p.available, cooldownUntil: p.cooldownUntil })),
                history: history.map((x) => ({ label: x.label, points: x.points, at: iso(x.at) })),
                xpLedger,
                // Activity volume by window (today = store-local calendar day).
                buckets: {
                    today: buckets?.today || 0,
                    d3: buckets?.d3 || 0,
                    d7: buckets?.d7 || 0,
                    d30: buckets?.d30 || 0,
                    allTime: buckets?.all_time || 0,
                },
                // Coin (gold) statement — all-time, newest first — plus earned/spent totals + per-reason breakdown.
                coinLedger: {
                    earned: coins?.earned || 0,
                    spent: coins?.spent || 0,
                    balance: (coins?.events || []).find((e) => e.balanceAfter != null)?.balanceAfter ?? null, // newest known running balance
                    events: (coins?.events || []).map((e) => ({ delta: e.delta, balanceAfter: e.balanceAfter, reason: e.reason, label: coinLabel(e.reason), meta: e.meta, at: iso(e.at) })),
                    breakdown: (coinBd || []).map((b) => ({ reason: b.reason, n: b.n, earned: b.earned, spent: b.spent, label: coinLabel(b.reason) })),
                },
                trades,
                // Chest-grant history: what chest, where from, when.
                chestGrants: (chestGrants || []).map((g) => ({ tier: g.tier, count: g.count, source: g.source, meta: g.meta, at: iso(g.at) })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.member.detail.failure" });
        }
    });
}
