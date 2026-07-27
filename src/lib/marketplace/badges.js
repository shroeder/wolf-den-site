import "server-only";

import { db } from "@/lib/db";
import { itemById } from "@/lib/marketplace/items.js";
import { COLLECTIBLES, collectibleById, isCollectibleUnlocked } from "@/lib/marketplace/collectibles.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { sendBadgeAwardedEmail } from "@/lib/marketplace/email.js";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { awardXp, getRewardsProgress, levelForXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { logCoin } from "@/lib/marketplace/coins.js";

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
    const buyer = await db.queryOne(`SELECT xp, created_at, COALESCE(event_gold_donated, 0) AS event_gold_donated, COALESCE(spin_count, 0) AS spin_count, COALESCE(mystery_bags_bought, 0) AS mystery_bags_bought, COALESCE(mystery_big_hit, FALSE) AS mystery_big_hit, COALESCE(cheers_given, 0) AS cheers_given, COALESCE(cheers_received, 0) AS cheers_received FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const xp = buyer?.xp || 0;

    const [spendRow, eventRow, daysRow, wishRow, friendRow, topRow, tradeRow, donationRow, bossRow, bossWonRow, messageRow, badgeRow, bountyPostRow, bountyWinRow, grantedPetRows, petLevelRows] = await Promise.all([
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
        // Bounty board: bounties posted + bounties fulfilled (won) — drive the bounty badges.
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_bounty WHERE creator_id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_bounty_claim WHERE buyer_id = $1 AND is_winner = TRUE`, [buyerId]).catch(() => null),
        // Explicitly-granted pets (shop/chest/boss/achievement/elite/trade) — level pets are added below.
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
        // Per-pet leveling XP, for pet-level milestone badges + leveling achievement pets.
        db.query(`SELECT pet_id, xp FROM mkt_pet_level WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);

    // Lifetime store credit PURCHASED (paid top-ups only, in dollars) — drives the store-credit badges. Admin
    // adjustments never create a mkt_credit_purchase row, so hand-granted credit correctly doesn't count.
    const creditRow = await db.queryOne(`SELECT COALESCE(SUM(amount_cents), 0)::bigint AS c FROM mkt_credit_purchase WHERE buyer_id = $1 AND status = 'paid'`, [buyerId]).catch(() => null);

    // Farming + petting counts (from the activity log) — drive the farm/pet badges. crop_types = how many
    // DISTINCT crop kinds you've ever harvested (the Botanist "one of each" badge; there are 9 seeds).
    const farmRow = await db.queryOne(
        `SELECT COUNT(*) FILTER (WHERE event = 'harvest_crop')::int AS harvests,
                COUNT(DISTINCT meta->>'seedId') FILTER (WHERE event = 'harvest_crop')::int AS crop_types,
                COUNT(*) FILTER (WHERE event IN ('pet_farm', 'pet_other'))::int AS pets_petted,
                COUNT(*) FILTER (WHERE event = 'feed_other')::int AS pets_fed,
                COUNT(*) FILTER (WHERE event = 'place_deco')::int AS decos_placed,
                COUNT(*) FILTER (WHERE event = 'fertilize_crop')::int AS fertilizer_used,
                COUNT(*) FILTER (WHERE event = 'loot_pig')::int AS pig_claims
           FROM mkt_activity_event WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);

    // Farm ratings RECEIVED (Well-Liked / Adored), custom creations FINALIZED (First Creation / Artisan /
    // Gallery), and converted referrals (Recruiter / Pack Builder / Pack Leader) — one cheap count each.
    const [ratingRow, creationRow, referralRow] = await Promise.all([
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_farm_rating WHERE owner_id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_custom_deco WHERE buyer_id = $1 AND status = 'final'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer WHERE referred_by = $1 AND referral_reward_at IS NOT NULL`, [buyerId]).catch(() => null),
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
    const allMilestones = ["spend", "first_purchase", "discord_link", "profile_complete", "daily_active"].every((k) => Boolean(progress[k]));
    // Onboarding completionist: every one-time getting-started task done (the EARN checklist's one-timers).
    const onboardingComplete = ["first_purchase", "discord_link", "profile_complete", "first_message", "first_friend", "first_wishlist", "first_equip"].every((k) => Boolean(progress[k]));

    const tenureDays = buyer?.created_at ? Math.floor((Date.now() - new Date(buyer.created_at).getTime()) / 86400000) : 0;
    const levelObj = levelForXp(xp);
    // Pets owned = level-unlocked + explicitly-granted.
    const grantedPets = new Set((grantedPetRows || []).map((r) => r.ref));
    const petsOwned = COLLECTIBLES.filter((p) => isCollectibleUnlocked(p, levelObj.level, { owned: grantedPets })).length;
    // Pet-leveling milestones: highest single-pet level, # maxed (Lv5), total levels gained, and whether any
    // maxed pet is legendary-or-higher (for the Radiant Phoenix unlock).
    const LEGENDARY_PLUS = new Set(["legendary", "mythic", "ascendant", "eternal"]);
    const petLevelValues = (petLevelRows || []).map((r) => petLevelForXp(r.xp, collectibleById(r.pet_id)?.rarity));
    const maxPetLevel = petLevelValues.length ? Math.max(...petLevelValues) : 1;
    const petsMaxed = petLevelValues.filter((lv) => lv >= 5).length;
    const petLevelsTotal = petLevelValues.reduce((sum, lv) => sum + Math.max(0, lv - 1), 0);
    const maxedLegendaryPlus = (petLevelRows || []).some((r) => petLevelForXp(r.xp, collectibleById(r.pet_id)?.rarity) >= 5 && LEGENDARY_PLUS.has(collectibleById(r.pet_id)?.rarity));

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
        cropsHarvested: farmRow?.harvests || 0,
        cropTypes: farmRow?.crop_types || 0,
        petsPetted: farmRow?.pets_petted || 0,
        petsFed: farmRow?.pets_fed || 0,
        decosPlaced: farmRow?.decos_placed || 0,
        fertilizerUsed: farmRow?.fertilizer_used || 0,
        pigClaims: farmRow?.pig_claims || 0,
        farmRatingsReceived: ratingRow?.n || 0,
        creationsMade: creationRow?.n || 0,
        referralsConverted: referralRow?.n || 0,
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
        bountiesPosted: bountyPostRow?.n || 0,
        bountiesWon: bountyWinRow?.n || 0,
        petsOwned,
        maxPetLevel,
        petsMaxed,
        petLevelsTotal,
        maxedLegendaryPlus,
        eventDonated: Number(buyer?.event_gold_donated || 0),
        spinCount: Number(buyer?.spin_count || 0),
        mysteryBags: Number(buyer?.mystery_bags_bought || 0),
        mysteryBigHit: Boolean(buyer?.mystery_big_hit),
        cheersGiven: Number(buyer?.cheers_given || 0),
        cheersReceived: Number(buyer?.cheers_received || 0),
        creditPurchased: Math.round(Number(creditRow?.c || 0) / 100), // lifetime $ of store credit bought
    };
}

// Earning a badge grants a little XP + gold, so every unlock feels rewarding (not just cosmetic).
const BADGE_REWARD_XP = 120;
const BADGE_REWARD_GOLD = 250;
async function rewardBadgeEarned(buyerId, slug) {
    // dedupeKey keys off the slug so re-syncs never double-pay, even though the INSERT is idempotent.
    await awardXp(buyerId, "badge_earned", { points: BADGE_REWARD_XP, dedupeKey: `badge_reward:${slug}` }).catch(() => {});
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, BADGE_REWARD_GOLD]).catch(() => {});
    await logCoin(buyerId, BADGE_REWARD_GOLD, "badge_reward", { meta: { slug } }).catch(() => {});
}

// ── PER-BADGE BONUSES ── every badge grants a bonus, in the vocabulary of the SYSTEM it belongs to, scaled by
// how hard it is to earn. Four quarantined domains (mirroring how gear/pets feed them), so a farming badge
// buffs farming, a sailing badge buffs the seas, etc. — they stack across every badge you hold.
//   • combat  { might, crit_chance, crit_power }   → your daily boss strike        (boss.js)
//   • sea     { broadside, ironclad, plunder, bounty, dredge, trove, tailwind } → raids/digging/voyages (sailing.js)
//   • farm    { growSpeed, seedLuck, harvestLuck, petXp, fertPower, goldHarvest } → your farm            (farm-bonus.js)
//   • forge   { efficient, keen_eye, masters_touch, steady_hand }  → smithing odds (crafting.js)
// Authoring helpers keep the map readable; zero args are dropped.
const C = (might = 0, crit_chance = 0, crit_power = 0) => { const o = {}; if (might) o.might = might; if (crit_chance) o.crit_chance = crit_chance; if (crit_power) o.crit_power = crit_power; return { combat: o }; };
const S = (sea) => ({ sea });
const F = (farm) => ({ farm });
const G = (forge) => ({ forge });

const BADGE_BONUSES = {
    // ── Staff / identity / prestige (hand-assigned) → modest Might, a nod for the recognition ──
    owner: C(5), site_admin: C(2), secret: C(3), staff: C(2), event_coordinator: C(2), volunteer: C(1),
    judge: C(2), developer: C(2), loyal: C(2), helping_paw: C(2), mvp: C(3), opening_day: C(3), first_week: C(2),
    founding_member: C(3), tournament_champ: C(3, 2), draft_king: C(3, 2), commander: C(2), lore_master: C(2),
    featured_artist: C(2), trade_master: C(3), content_creator: C(2), og: C(3), birthday_star: C(1), generous: C(2),
    hype_master: C(2), rival: C(2, 2),
    // ── Level (prestige) → scaling power ──
    night_hunter: C(2), alpha: C(3), ascended: C(4, 3), veteran: C(5, 0, 3), living_legend: C(7, 4, 4),
    // ── Wealth / spend → power ──
    big_spender: C(2), whale: C(3), high_roller_badge: C(4), legendary_spend: C(6, 0, 4),
    gold_hoarder: C(2), gilded: C(3), big_baller: C(5), one_percent: C(10, 0, 6),
    // ── Bounties → power ──
    bounty_poster: C(1), bounty_hunter: C(2), bounty_pro: C(3), bounty_legend: C(5, 3),
    // ── Trading → power / crit ──
    first_trade: C(1), trader: C(2), deal_maker: C(3), trader_cards_100: C(2), trader_cards_500: C(4),
    trade_value_500: C(2), trade_value_2k: C(3), trade_value_10k: C(6), high_roller: C(0, 3), whale_trader: C(0, 5),
    // ── Donations / generosity → power ──
    first_donation: C(1), generous_soul: C(2), benefactor: C(4), patron: C(2), gold_benefactor: C(3), philanthropist: C(5, 0, 3),
    // ── Events / tenure / activity / social → loyalty power ──
    event_regular: C(1), event_grinder: C(2), event_legend: C(3), event_god: C(5),
    one_year: C(2), two_year: C(4), on_a_roll: C(1), ever_present: C(3), always_here: C(4),
    well_connected: C(1), pack_leader: C(2), social_butterfly: C(3), chatterbox: C(1), town_crier: C(2),
    collector: C(1), curator: C(2), hoarder: C(3),
    // ── Wheel / mystery / credit / meta / lucky drops → power ──
    wheel_regular: C(1), wheel_devotee: C(3), jackpot: C(0, 3),
    mystery_first: C(1), mystery_big_hit: C(0, 4), mystery_20: C(3), mystery_100: C(6, 0, 4),
    credit_patron: C(1), credit_backer: C(2), credit_benefactor: C(4),
    well_rounded: C(3, 2), completionist: C(2), decorated: C(3),
    lucky_find: C(0, 3), treasure_hunter: C(4), boss_relic: C(3), mythic_find: C(0, 0, 6),
    // ── Referrals → power ──
    referral_recruiter: C(2), referral_packbuilder: C(3), referral_packleader: C(5),
    // ── Boss combat + gear tier → power ──
    boss_challenger: C(1), boss_raider: C(2), boss_slayer: C(3), boss_veteran: C(2), boss_warlord: C(4),
    boss_legend: C(6, 0, 4), boss_champion: C(0, 4), transcendent: C(5), ascendant_gear: C(3), eternal_bearer: C(8, 0, 6),
    // ── Cheer (boss-fight social) → power ──
    cheer_given_100: C(2), cheer_given_500: C(3, 2), cheer_given_1000: C(4, 3),
    cheer_recv_100: C(0, 2), cheer_recv_500: C(0, 3), cheer_recv_1000: C(0, 4, 3),

    // ── SAILING: voyages → tailwind, merchant/waves → sea gold, encounters → armor ──
    first_voyage: S({ tailwind: 1 }), sail_regular: S({ tailwind: 2 }), sail_voyager: S({ tailwind: 4 }),
    sail_leviathan: S({ tailwind: 3, bounty: 3 }), sail_admiral: S({ tailwind: 4, bounty: 4, broadside: 3 }),
    merchant_met: S({ bounty: 2 }), merchant_perfect: S({ bounty: 3 }),
    wave_friendly: S({ tailwind: 1 }), wave_ambassador: S({ tailwind: 2, bounty: 1 }), wave_beloved: S({ tailwind: 3, bounty: 2 }),
    sea_tested: S({ ironclad: 2 }), sea_veteran: S({ ironclad: 3 }),
    // ── RAIDING → broadside / ironclad / plunder ──
    raid_marauder: S({ broadside: 3 }), raid_scourge: S({ broadside: 5, plunder: 3 }), raid_untouchable: S({ ironclad: 4 }),
    raid_plunderer: S({ plunder: 5 }), raid_defender: S({ ironclad: 3 }), raid_bastion: S({ ironclad: 5 }),
    // ── DIGGING → dredge / trove ──
    dig_excavator: S({ trove: 4 }), dig_goldtouch: S({ trove: 3, dredge: 2 }), dig_cleansweep: S({ dredge: 4 }),
    // ── Upgrade mastery (ship + dig) ──
    sail_shipwright: S({ broadside: 2, dredge: 2 }), sail_sovereign: S({ broadside: 3, ironclad: 3, dredge: 3, trove: 3, tailwind: 3, bounty: 3 }),

    // ── FARMING → grow speed / harvest / gold / etc. ──
    farm_first: F({ growSpeed: 2 }), farm_hand: F({ growSpeed: 3 }), farm_master: F({ growSpeed: 5 }),
    green_thumb: F({ growSpeed: 6, harvestLuck: 4 }), master_gardener: F({ growSpeed: 8, harvestLuck: 6, goldHarvest: 6 }),
    botanist: F({ seedLuck: 6 }), decorator: F({ growSpeed: 2 }), landscaper: F({ growSpeed: 3, goldHarvest: 3 }),
    well_liked: F({ goldHarvest: 3 }), adored: F({ goldHarvest: 6 }), fertilizer_baron: F({ fertPower: 6 }),
    pig_whisperer: F({ harvestLuck: 3 }), pig_tycoon: F({ harvestLuck: 5, goldHarvest: 4 }),
    farm_cultivator: F({ growSpeed: 4, seedLuck: 4 }), farm_steward: F({ growSpeed: 8, seedLuck: 8, harvestLuck: 6, goldHarvest: 6, fertPower: 6 }),
    // ── PETS → pet XP (pasture leveling), the pet system's own currency ──
    pet_tamer: F({ petXp: 2 }), pet_keeper: F({ petXp: 3 }), pet_whisperer: F({ petXp: 5 }), pet_trained: F({ petXp: 1 }),
    pet_seasoned: F({ petXp: 3 }), beastmaster: F({ petXp: 6 }), pack_master: F({ petXp: 3 }), pet_devoted: F({ petXp: 5 }),
    pet_pal: F({ petXp: 2 }), farm_giver: F({ petXp: 4 }),
    // ── CREATIONS (art/decorations) → farm gold & growth ──
    creation_first: F({ goldHarvest: 2 }), creation_artisan: F({ goldHarvest: 3 }), creation_gallery: F({ goldHarvest: 5 }),
    creation_curator: F({ growSpeed: 2 }), creation_patron: F({ goldHarvest: 3 }),

    // ── FORGING → smithing odds ──
    forge_first: G({ efficient: 1 }), forge_smith: G({ masters_touch: 1 }), forge_master: G({ masters_touch: 3 }),
    forge_plus10: G({ steady_hand: 3 }), forge_pixel: G({ steady_hand: 2 }), forge_emberheart: G({ keen_eye: 3 }),
    forge_artisan: G({ efficient: 2, keen_eye: 2 }), forge_grandmaster: G({ efficient: 4, keen_eye: 4, masters_touch: 4, steady_hand: 4 }),
};

// Sum one bonus DOMAIN across every badge a member holds. Cheap (one held-slugs read); safe on hot paths.
async function sumBadgeDomain(buyerId, domain) {
    if (!buyerId) return {};
    const held = await heldSlugs(buyerId).catch(() => new Set());
    const total = {};
    for (const slug of held) {
        const d = BADGE_BONUSES[slug]?.[domain];
        if (!d) continue;
        for (const [k, v] of Object.entries(d)) total[k] = (total[k] || 0) + v;
    }
    return total;
}
// Domain-specific aggregators, each folded into that system's own bonus sum (mirrors gear/pets).
export const getBadgePassives = (buyerId) => sumBadgeDomain(buyerId, "combat"); // → boss strike (unchanged callers)
export const getBadgeSea = (buyerId) => sumBadgeDomain(buyerId, "sea");         // → equippedSeaAffinity (sailing)
export const getBadgeFarm = (buyerId) => sumBadgeDomain(buyerId, "farm");       // → farmBonuses (farm)
export const getBadgeForge = (buyerId) => sumBadgeDomain(buyerId, "forge");     // → forge smithing odds (crafting)

// All four domain totals from ONE held-slugs read — for the Badges page's "Badge Power" summary.
export async function getBadgeBonusTotals(buyerId) {
    if (!buyerId) return { combat: {}, sea: {}, farm: {}, forge: {} };
    const held = await heldSlugs(buyerId).catch(() => new Set());
    const totals = { combat: {}, sea: {}, farm: {}, forge: {} };
    for (const slug of held) {
        const b = BADGE_BONUSES[slug];
        if (!b) continue;
        for (const dom of ["combat", "sea", "farm", "forge"]) {
            if (!b[dom]) continue;
            for (const [k, v] of Object.entries(b[dom])) totals[dom][k] = (totals[dom][k] || 0) + v;
        }
    }
    return totals;
}

// ── Collection milestones ── as your badge count climbs, hit these thresholds for a chunk of gold + a chest
// (escalating chest tiers). Claimed on the Badges page. The high tiers are long-term aspirations as more
// badges are added over time.
export const BADGE_MILESTONES = [
    { count: 10,  gold: 100,  chest: "wooden" },
    { count: 25,  gold: 250,  chest: "iron" },
    { count: 50,  gold: 500,  chest: "gold" },
    { count: 100, gold: 1000, chest: "mythic" },
    { count: 250, gold: 2500, chest: "ascendant" },
    { count: 500, gold: 5000, chest: "eternal" },
];
const CHEST_LABEL = { wooden: "Wooden", iron: "Iron", gold: "Gold", mythic: "Mythic", ascendant: "Ascendant", eternal: "Eternal" };

// How many badges a member holds right now (earned count, excluding nothing — every held badge counts).
async function earnedBadgeCount(buyerId) {
    const row = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    return row?.n || 0;
}

// Milestone board for a member: each tier with reached/claimed + which are claimable now.
export async function getBadgeMilestones(buyerId) {
    if (!buyerId) return { earnedCount: 0, tiers: [], claimable: 0 };
    const [count, row] = await Promise.all([
        earnedBadgeCount(buyerId),
        db.queryOne(`SELECT COALESCE(badge_milestones_claimed, '[]'::jsonb) AS claimed FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const claimed = new Set((Array.isArray(row?.claimed) ? row.claimed : []).map(Number));
    const tiers = BADGE_MILESTONES.map((mst) => ({
        count: mst.count, gold: mst.gold, chest: mst.chest, chestLabel: CHEST_LABEL[mst.chest] || mst.chest,
        reached: count >= mst.count, claimed: claimed.has(mst.count), claimable: count >= mst.count && !claimed.has(mst.count),
    }));
    return { earnedCount: count, tiers, claimable: tiers.filter((t) => t.claimable).length };
}

// Claim one reached-but-unclaimed collection milestone → gold + a chest. Idempotent (a claimed tier is a no-op).
export async function claimBadgeMilestone(buyerId, count) {
    const mst = BADGE_MILESTONES.find((x) => x.count === Number(count));
    if (!buyerId || !mst) return { ok: false, error: "bad_milestone" };
    const have = await earnedBadgeCount(buyerId);
    if (have < mst.count) return { ok: false, error: "not_reached" };
    // Atomically add this tier to the claimed set only if it isn't already there (guards double-claims).
    const upd = await db
        .queryOne(
            `UPDATE mkt_buyer
                SET badge_milestones_claimed = COALESCE(badge_milestones_claimed, '[]'::jsonb) || to_jsonb($2::int),
                    gold = gold + $3
              WHERE id = $1 AND NOT (COALESCE(badge_milestones_claimed, '[]'::jsonb) @> to_jsonb($2::int))
              RETURNING gold`,
            [buyerId, mst.count, mst.gold]
        )
        .catch(() => null);
    if (!upd) return { ok: false, error: "already_claimed" };
    await logCoin(buyerId, mst.gold, "badge_milestone", { balanceAfter: upd.gold, meta: { count: mst.count } }).catch(() => {});
    // Grant the chest (best-effort; logged to the chest-grant ledger with its source).
    try {
        const { addChests } = await import("@/lib/marketplace/chests.js");
        await addChests(buyerId, { [mst.chest]: 1 }, { source: "badge_milestone", meta: { count: mst.count } });
    } catch { /* best-effort */ }
    await trackActivity(buyerId, "badge_milestone", { count: mst.count, gold: mst.gold, chest: mst.chest }).catch(() => {});
    return { ok: true, gold: upd.gold, milestones: await getBadgeMilestones(buyerId) };
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
        case "bounties_posted": return { current: m.bountiesPosted, target: t };
        case "bounties_won": return { current: m.bountiesWon, target: t };
        case "pets_owned": return { current: m.petsOwned, target: t };
        case "pet_level_reached": return { current: m.maxPetLevel, target: t }; // highest level on any single pet
        case "pets_maxed": return { current: m.petsMaxed, target: t }; // # of pets at Lv5
        case "pet_levels_total": return { current: m.petLevelsTotal, target: t }; // total levels gained across pets
        case "event_donated": return { current: m.eventDonated, target: t }; // lifetime gold donated to Happy Hour / rally
        case "spin_count": return { current: m.spinCount, target: t }; // lifetime wheel spins
        case "mystery_bags": return { current: m.mysteryBags, target: t }; // mystery bags bought from the real store
        case "mystery_big_hit": return { current: m.mysteryBigHit ? 1 : 0, target: 1 }; // pulled a big hit from a bag
        case "cheers_given": return { current: m.cheersGiven, target: t }; // times you've cheered a hero in the boss fight
        case "cheers_received": return { current: m.cheersReceived, target: t }; // times the pack has cheered you
        case "credit_purchased": return { current: m.creditPurchased, target: t }; // lifetime $ of store credit bought
        case "crops_harvested": return { current: m.cropsHarvested, target: t }; // crops harvested on the farm
        case "crop_types": return { current: m.cropTypes, target: t }; // distinct crop kinds harvested (Botanist)
        case "pets_petted": return { current: m.petsPetted, target: t }; // times you've petted a pet
        case "pets_fed_others": return { current: m.petsFed, target: t }; // treats given to friends' pets (generosity)
        case "decos_placed": return { current: m.decosPlaced, target: t }; // decorations placed on the farm
        case "fertilizer_used": return { current: m.fertilizerUsed, target: t }; // fertilizer applied to crops
        case "pig_claims": return { current: m.pigClaims, target: t }; // Wild Loot Pig claims
        case "farm_ratings_received": return { current: m.farmRatingsReceived, target: t }; // ratings your farm earned
        case "creations_made": return { current: m.creationsMade, target: t }; // custom creations finalized
        case "referrals_converted": return { current: m.referralsConverted, target: t }; // invited friends who joined
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
    const [all, held, m, totals] = await Promise.all([listBadges(), heldSlugs(buyerId), getMemberMetrics(buyerId), getBadgeBonusTotals(buyerId)]);
    const passives = totals.combat; // { might, crit_chance, crit_power } — buffs your daily boss strike
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
        return { slug: b.slug, label: b.label, description: b.description, icon: b.icon, color: b.color, adminOnly: b.adminOnly, unlockable: Boolean(b.autoRule), goldPrice: b.goldPrice, dropOnly: b.dropOnly, earned, progress, bonus: BADGE_BONUSES[b.slug] || null };
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
        passives, // { might, crit_chance, crit_power } summed from earned badges — buffs your daily boss strike
        bonusTotals: totals, // { combat, sea, farm, forge } — every earned badge's bonuses, grouped by system
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
        // RETURNING so we only reward on a genuinely NEW grant (ON CONFLICT → no row → no double reward).
        const ins = await db
            .queryOne(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'system') ON CONFLICT DO NOTHING RETURNING buyer_id`, [buyerId, b.slug])
            .catch(() => null);
        if (ins) { granted.push(b); await rewardBadgeEarned(buyerId, b.slug); }
    }
    for (const b of granted) await pushBadgeEarned(buyerId, b); // celebrate each newly-earned badge in the browser
    return granted;
}

// Grant a specific badge directly (for EVENT badges that aren't metric-threshold based — e.g. "met the Gold
// Merchant", "perfect coin toss"). Idempotent; rewards XP/gold + browser-pushes only on a genuinely new grant.
// Returns true if it was newly granted.
export async function grantEventBadge(buyerId, slug) {
    if (!buyerId || !slug) return false;
    const ins = await db
        .queryOne(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'system') ON CONFLICT DO NOTHING RETURNING buyer_id`, [buyerId, slug])
        .catch(() => null);
    if (!ins) return false;
    await rewardBadgeEarned(buyerId, slug);
    const def = (await listBadges().catch(() => [])).find((b) => b.slug === slug);
    if (def) await pushBadgeEarned(buyerId, def);
    return true;
}

// RETIRED. The 1st/2nd/3rd-place leaderboard badges kept hijacking members' chosen showcase (they carried the
// top sort_order). Top-damage recognition now lives on the boss "Hall of Heroes" as live rank medals (UI only).
// Kept as a harmless cleanup so the existing cron just sweeps up any stragglers.
export async function syncLeaderboardBadges() {
    await db.query(`DELETE FROM mkt_user_badge WHERE badge_slug IN ('place_1', 'place_2', 'place_3')`).catch(() => {});
    return { retired: true };
}

// ---- Admin management ----

// Members with the badges they hold, for the admin browser. Admin context, so PII (name/email) is fine.
// `q` matches alias, display name, first/last name, or email.
export async function listMembersWithBadges({ q = "", limit = 40, offset = 0, filterIds = null } = {}) {
    const lim = Math.min(200, Math.max(1, Number(limit) || 40));
    const off = Math.max(0, Number(offset) || 0);
    const term = String(q || "").trim().toLowerCase();
    const idList = Array.isArray(filterIds) ? filterIds.filter(Boolean) : null;

    // Three ways to scope the roster: an explicit id set (e.g. "who bought store credit"), a search term,
    // or unfiltered. Each shifts the LIMIT/OFFSET placeholder numbers.
    let where = "";
    let params;
    let limPh;
    let offPh;
    if (idList && idList.length) {
        where = `WHERE id = ANY($1)`;
        params = [idList, lim, off];
        limPh = "$2"; offPh = "$3";
    } else if (term) {
        where = `WHERE LOWER(COALESCE(alias, '') || ' ' || COALESCE(display_name, '') || ' ' || COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '')) LIKE $1`;
        params = [`%${term}%`, lim, off];
        limPh = "$2"; offPh = "$3";
    } else {
        params = [lim, off];
        limPh = "$1"; offPh = "$2";
    }
    const rows = await db
        .query(
            `SELECT id, alias, display_name, first_name, last_name, email, avatar_url, avatar_config, avatar_cosmetics, avatar_sprite_url, avatar_sprite_flip, featured_collectible, equipped_border, COALESCE(xp, 0) AS xp, last_seen_at, created_at
               FROM mkt_buyer
               ${where}
              ORDER BY COALESCE(xp, 0) DESC, created_at DESC
              LIMIT ${limPh} OFFSET ${offPh}`,
            params
        )
        .catch(() => []);
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const badgeRows = await db
        .query(
            `SELECT ub.buyer_id, b.slug, b.label, b.icon, b.color, b.admin_only, sp.url AS sprite_url
               FROM mkt_user_badge ub JOIN mkt_badge b ON b.slug = ub.badge_slug
               LEFT JOIN mkt_badge_sprite sp ON sp.slug = b.slug
              WHERE ub.buyer_id = ANY($1)
              ORDER BY b.sort_order ASC`,
            [ids]
        )
        .catch(() => []);
    const byBuyer = new Map();
    for (const br of badgeRows) {
        if (!byBuyer.has(br.buyer_id)) byBuyer.set(br.buyer_id, []);
        byBuyer.get(br.buyer_id).push({ slug: br.slug, label: br.label, icon: br.icon || null, color: br.color || null, adminOnly: br.admin_only !== false, spriteUrl: br.sprite_url || null });
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
            // Mirror flag: the sprite art faces left; render it scaleX(-1) so it faces right.
            avatarSpriteFlip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
            featuredCollectibleId: r.featured_collectible || null,
            border: r.equipped_border || "none",
            level: levelForXp(r.xp || 0).level,
            xp: Number(r.xp || 0),
            // Last-seen recency: a real signal every member has, used as the active-sort tiebreak while
            // 30-day telemetry is still filling in.
            lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
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
    await logCoin(buyerId, -def.gold_price, "buy_badge", { meta: { slug }, balanceAfter: row.gold }).catch(() => {});
    await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug, awarded_by) VALUES ($1, $2, 'purchase') ON CONFLICT DO NOTHING`, [buyerId, slug]).catch(() => {});
    await pushBadgeEarned(buyerId, def).catch(() => {});
    await trackActivity(buyerId, "buy_badge", { slug, name: def.label });
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
