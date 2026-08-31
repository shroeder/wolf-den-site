import "server-only";

import { db } from "@/lib/db";
import { itemById } from "@/lib/marketplace/items.js";
import { COLLECTIBLES, collectibleById, isCollectibleUnlocked } from "@/lib/marketplace/collectibles.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { sendBadgeAwardedEmail } from "@/lib/marketplace/email.js";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { awardXp, getRewardsProgress, levelForXp, SPEND_XP_PER_DOLLAR } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { allowsNotify } from "@/lib/marketplace/notify-prefs.js";
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
        kind: "badge",
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
        // ── SPEND IS DOLLARS, NOT XP ─────────────────────────────────────────────────────────────────
        // This summed POINTS, and points are dollars x SPEND_XP_PER_DOLLAR (5). So every spend badge fired
        // at a FIFTH of its stated price: "Whale — $2,000 of actual money", per the comment forty lines
        // down, was actually granted at $400. A member noticed before we did — SunflowerJinxx, in global
        // chat, on a figure that read five times what she had spent.
        //
        // `amountCents` is what the order was really worth and is stored on every event since July; older
        // ones fall back to points / SPEND_XP_PER_DOLLAR, which is the same reconstruction awardXp documents.
        db.queryOne(
            `SELECT COALESCE(SUM(COALESCE((meta->>'amountCents')::numeric / 100.0, points / ${SPEND_XP_PER_DOLLAR}.0)), 0)::int AS n
               FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'purchase_spend'`,
            [buyerId]
        ).catch(() => null),
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

    // Auction House activity — completed SALES (as seller) + BUYS (as buyer) + your biggest single sale.
    const auctionRow = await db.queryOne(
        `SELECT COUNT(*) FILTER (WHERE seller_id = $1 AND status = 'sold')::int AS sales,
                COUNT(*) FILTER (WHERE buyer_id = $1 AND status = 'sold')::int AS buys,
                COALESCE(MAX(price) FILTER (WHERE seller_id = $1 AND status = 'sold'), 0)::int AS top_sale
           FROM mkt_auction WHERE seller_id = $1 OR buyer_id = $1`,
        [buyerId]
    ).catch(() => null);

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

    // Forge (crafting) counts — drive the forge-themed achievement pets. Enhances/salvages/combines from the
    // craft-event log, plus the highest enhancement level reached on any owned piece (0..MAX_FORGE_LEVEL=21).
    const forgeRow = await db.queryOne(
        `SELECT COUNT(*) FILTER (WHERE action = 'enhance')::int AS enhances,
                COUNT(*) FILTER (WHERE action = 'salvage')::int AS salvages,
                COUNT(*) FILTER (WHERE action = 'combine')::int AS combines
           FROM mkt_craft_event WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);
    const forgeLevelRow = await db.queryOne(`SELECT COALESCE(MAX(level), 0)::int AS n FROM mkt_item_enhance WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    // The Kitchen's counters, for the cooking pet unlocks. Nulls all the way through if they've never cooked.
    const kitchenRow = await db.queryOne(
        `SELECT cooks_total, preps_total, tiers_cooked, best_quality FROM mkt_kitchen WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => null);

    // Farm ratings RECEIVED (Well-Liked / Adored), custom creations FINALIZED (First Creation / Artisan /
    // Gallery), and converted referrals (Recruiter / Pack Builder / Pack Leader) — one cheap count each.
    const [ratingRow, creationRow, referralRow, playerTradeRow] = await Promise.all([
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_farm_rating WHERE owner_id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_custom_deco WHERE buyer_id = $1 AND status = 'final'`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer WHERE referred_by = $1 AND referral_reward_at IS NOT NULL`, [buyerId]).catch(() => null),
        // ── A TRADE IS A TRADE ───────────────────────────────────────────────────────────────────────
        // `trade_count` only ever counted mkt_trade_claim, which is the SHOP path: you trade cards in over
        // the counter and scan the receipt. Member-to-member trades live in mkt_trade_offer and were counted
        // by nothing, so "Completed your first trade" and the Raccoon ("Complete 5 trades") sat unearned for
        // people who had done dozens. ValkyrieSylve reported it after running trades with SoullessShiitake
        // and neither side moving. Both sides of an accepted offer count, which is what a trade means.
        //
        // Only the COUNT joins the two paths. `cards_traded`, `trade_value` and `top_card` are card and
        // dollar figures off a real receipt — a player trade has no equivalent, and inventing one would put
        // a number on those badges that no receipt backs.
        db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_trade_offer
              WHERE status = 'accepted' AND (from_buyer_id = $1 OR to_buyer_id = $1)`,
            [buyerId]
        ).catch(() => null),
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

    // ── THE CASINO ───────────────────────────────────────────────────────────────────────────────────
    // Every one of these comes out of the coin ledger the floor already writes, so the casino needed no
    // counters of its own and no table to drift out of step with the money. One query, because the three
    // machines all log the same shapes: a bet row per play and a win row carrying what it was.
    //
    // The three rare ones are read off the win rows' meta rather than tracked separately: the slot stamps
    // its own jackpot, `choice` names the wheel bet, and keno stamps how many of the five came up. Note the
    // absence of an import from casino.js — fishing.js already imports THIS file, so reaching the other way
    // would close a cycle. Counting facts the floor wrote down avoids needing to.
    //
    // ── AND IT COUNTS EVERY CABINET, BECAUSE A LIST OF THREE ROTS ────────────────────────────────────
    // GrayKitsune: "The badges dont count gold spent across every activity, it says I've only used 200
    // gold total."
    //
    // He had spent 1,600 over 16 plays; the badge saw 200 over 2. `plays` and `wagered` named three
    // reasons — the one slot, the wheel and keno — and the floor has grown five more cabinets, blackjack
    // and bingo since. Across the whole Den at the time of the fix: 36,650 gold counted against 185,561
    // actually staked, so FOUR FIFTHS of the floor was invisible, and `casino_slot5_bet` alone (the five
    // new machines, 118,200 gold) was bigger than everything the list knew about put together.
    //
    // Matched on the shape of the reason rather than by name, so the next cabinet counts the day it opens
    // instead of the day somebody remembers this query exists. Every stake on the floor is logged as
    // `casino_<game>_bet` — see logCoin in casino.js, casino-slot5-play.js, blackjack and bingo — and
    // nothing else on the floor ends that way. ⚠️ A new cabinet that names its stake anything else is
    // invisible here again, which is the one thing to check when adding one.
    const casinoRow = await db.queryOne(
        `SELECT COUNT(*) FILTER (WHERE reason ~ '_bet$')::int AS plays,
                COALESCE(-SUM(delta) FILTER (WHERE reason ~ '_bet$'), 0)::bigint AS wagered,
                COUNT(*) FILTER (WHERE reason = 'casino_slot_win' AND meta->>'jackpot' = 'true')::int AS jackpots,
                COUNT(*) FILTER (WHERE reason = 'casino_keno_win' AND (meta->>'hits')::int = 5)::int AS perfect
           FROM mkt_coin_event WHERE buyer_id = $1 AND reason LIKE 'casino_%'`,
        [buyerId],
    ).catch(() => null);
    // Owning all five is its own badge, and it is the hardest thing on the floor by a distance: the rarest
    // of the five is one drop in 5,556 plays.
    const casinoPetRow = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND ref = ANY($2)`,
        [buyerId, COLLECTIBLES.filter((p) => p.casinoExclusive).map((p) => p.id)],
    ).catch(() => null);

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
    // ENSHRINED PETS. `pets_maxed` above deliberately still tests >= 5 — that is what every existing maxed-pet
    // reward has always meant and raising the ceiling must not take one back off anybody. This is the separate,
    // harder thing: a pet taken to six AND paid for with a stone.
    const enshrinedRows = await db.query(`SELECT stone FROM mkt_pet_enshrined WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const petsEnshrined = enshrinedRows.length;
    const petBothStones = enshrinedRows.some((r) => r.stone === "light") && enshrinedRows.some((r) => r.stone === "dark") ? 1 : 0;

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
        tradeCount: (tradeRow?.trades || 0) + (playerTradeRow?.n || 0), // shop trade-ins + member-to-member trades
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
        petsEnshrined,
        petBothStones,
        petLevelsTotal,
        maxedLegendaryPlus,
        eventDonated: Number(buyer?.event_gold_donated || 0),
        spinCount: Number(buyer?.spin_count || 0),
        mysteryBags: Number(buyer?.mystery_bags_bought || 0),
        mysteryBigHit: Boolean(buyer?.mystery_big_hit),
        cheersGiven: Number(buyer?.cheers_given || 0),
        cheersReceived: Number(buyer?.cheers_received || 0),
        creditPurchased: Math.round(Number(creditRow?.c || 0) / 100), // lifetime $ of store credit bought
        forgeEnhances: forgeRow?.enhances || 0,
        forgeSalvages: forgeRow?.salvages || 0,
        // Kitchen metrics, for the cooking pet unlocks (see pets.js ACHIEVEMENTS).
        cooksTotal: kitchenRow?.cooks_total || 0,
        prepsTotal: kitchenRow?.preps_total || 0,
        cookTiers: kitchenRow?.tiers_cooked || 0,
        cookBestQuality: kitchenRow?.best_quality || 0,
        forgeCombines: forgeRow?.combines || 0,
        maxForgeLevel: forgeLevelRow?.n || 0,
        auctionSales: auctionRow?.sales || 0,
        auctionBuys: auctionRow?.buys || 0,
        auctionTopSale: auctionRow?.top_sale || 0,
        casinoPlays: casinoRow?.plays || 0,
        casinoWagered: Number(casinoRow?.wagered || 0),
        casinoJackpots: casinoRow?.jackpots || 0,
        casinoPerfect: casinoRow?.perfect || 0,
        casinoPets: casinoPetRow?.n || 0,
    };
}

// Earning a badge grants a little XP + gold, so every unlock feels rewarding (not just cosmetic).
// Exported as a pair because the celebration card states them, and a card that says 120 while the ledger
// hands over 90 is worse than a card that says nothing.
const BADGE_REWARD_XP = 120;
const BADGE_REWARD_GOLD = 60; // halved with the rest of the faucets — see gold-rate.js
export const BADGE_REWARD = { xp: BADGE_REWARD_XP, gold: BADGE_REWARD_GOLD };
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
// ── HALF OF WHAT A BADGE PAYS IS NOW TOUGHNESS ───────────────────────────────────────────────────────────────
// 118 of the 131 badges carrying a combat bonus paid Might and nothing else; vitality appeared on none of them,
// and neither did ferocity. So the entire permanent layer of the game was offence, and no collection ever made
// anybody harder to kill.
//
// Rather than re-authoring 131 call sites, the split happens HERE: the first argument is still "what this badge
// is worth", and it is divided between Might and Vitality. Might keeps the odd point, so a C(1) badge stays a
// Might badge and nothing rounds away to nothing.
// Half of what a badge is worth is offence and half is defence; the defensive half then splits again between
// staying alive (vitality) and the armour multiplier (tenacity), which had no permanent source at all.
// Half of what a badge is worth stays offence; the rest splits between the two defensive stats, vitality
// first. Most badges are worth 1-3 points, so a share-of-a-share rounds badly at that size — carving the
// remainder directly keeps both stats present instead of one of them taking every small badge.
// ── C() AND BADGE_BONUSES LIVE IN badge-bonus-meta.js NOW ────────────────────────────────────────────────────
// This file imports `server-only`, and the arena's opponent builder needs the bonus table so a rung can carry
// the badge wall a member of its standing would have. Importing it from here dragged db.js into a client
// bundle and failed the build with 165 errors. The table is pure data, and badge-bonus-meta.js already exists
// to hold exactly that — its own header says "Client-safe (pure data, no server-only imports). Mirrors the
// four bonus domains in badges.js (BADGE_BONUSES)". It holds them now rather than mirroring them.
//
// Re-exported, so every existing importer of badges.js is untouched.
// ⚠️ IMPORTED AS WELL AS RE-EXPORTED. `export { X } from "..."` forwards the name to importers but binds
// NOTHING locally, and sumBadgeDomain below reads BADGE_BONUSES directly — so the re-export alone left
// three live references to an undefined identifier. The turbopack build passed; npm run lint:undef is
// what caught it, which is the whole reason that gate exists.
import { BADGE_BONUSES } from "@/lib/marketplace/badge-bonus-meta.js";
export { BADGE_BONUSES };

// Sum one bonus DOMAIN across every badge a member holds. Cheap (one held-slugs read); safe on hot paths.
async function sumBadgeDomain(buyerId, domain) {
    if (!buyerId) return {};
    const held = await heldSlugs(buyerId).catch(() => new Set());
    // ── THE LONG SERVICE RECORD ──────────────────────────────────────────────────────────────────────────
    // Your TEN BEST badges pay twice — not all of them. Measured: 131 badges carry a bonus and the full set is
    // +356 Might, against +202 for a best-in-slot loadout, so doubling the lot would have been worth more than
    // every piece of gear in the game put together. The ten best is a big number a completionist still feels.
    const { hasPower } = await import("@/lib/marketplace/ascension-powers.js");
    const doubleTop = await hasPower(buyerId, "long_service_record").catch(() => false);
    const rows = [];
    for (const slug of held) {
        const d = BADGE_BONUSES[slug]?.[domain];
        if (d) rows.push(d);
    }
    // "Best" is the biggest total across the domain's own stats, so the ten it picks are the ten that matter
    // to the system asking — a farm badge does not out-rank a combat one when the boss is the one asking.
    const weight = (d) => Object.values(d).reduce((a, x) => a + x, 0);
    const top = doubleTop ? new Set([...rows].sort((a, b) => weight(b) - weight(a)).slice(0, 10)) : null;
    const total = {};
    for (const d of rows) {
        const mult = top?.has(d) ? 2 : 1;
        for (const [k, v] of Object.entries(d)) total[k] = (total[k] || 0) + v * mult;
    }
    return total;
}
/**
 * The same sum, for a whole list of members, in TWO queries total rather than two per member.
 *
 * Written for the Arena's standings board, which ranks every member with a bout to their name. The per-member
 * version would have been eighty round trips to sort one list, and the honest reason the board went without
 * badges was that nobody had written this — not that it could not be written. It follows the
 * `getEquippedStatsForMembers` convention already used for gear a few lines above the caller.
 *
 * Returns Map<buyerId, statsObject>. Members with no badges are absent from the map; read it with `|| {}`.
 */
export async function getBadgeDomainForMembers(buyerIds, domain) {
    const ids = [...new Set((buyerIds || []).filter(Boolean))];
    if (!ids.length) return new Map();
    const [badgeRows, equipRows] = await Promise.all([
        db.query(`SELECT buyer_id, badge_slug FROM mkt_user_badge WHERE buyer_id = ANY($1::uuid[])`, [ids]).catch(() => []),
        // Only to answer "who has Long Service Record", which doubles a member's ten best. One table, so it
        // batches the same way; leaving it out would quietly under-rate exactly the members who invested in it.
        db.query(`SELECT buyer_id, item_id FROM mkt_user_equipment WHERE buyer_id = ANY($1::uuid[]) AND item_id IS NOT NULL`, [ids]).catch(() => []),
    ]);
    const { ITEM_POWER } = await import("@/lib/marketplace/ascension-powers.js");
    const doubles = new Set();
    for (const r of equipRows) if (ITEM_POWER[r.item_id] === "long_service_record") doubles.add(r.buyer_id);

    const held = new Map();
    for (const r of badgeRows) {
        const d = BADGE_BONUSES[r.badge_slug]?.[domain];
        if (!d) continue;
        if (!held.has(r.buyer_id)) held.set(r.buyer_id, []);
        held.get(r.buyer_id).push(d);
    }
    // Identical arithmetic to sumBadgeDomain — same "ten best by total across the domain's own stats" rule.
    const weight = (d) => Object.values(d).reduce((a, x) => a + x, 0);
    const out = new Map();
    for (const [buyerId, rows] of held) {
        const top = doubles.has(buyerId) ? new Set([...rows].sort((a, b) => weight(b) - weight(a)).slice(0, 10)) : null;
        const total = {};
        for (const d of rows) {
            const mult = top?.has(d) ? 2 : 1;
            for (const [k, v] of Object.entries(d)) total[k] = (total[k] || 0) + v * mult;
        }
        out.set(buyerId, total);
    }
    return out;
}

// Domain-specific aggregators, each folded into that system's own bonus sum (mirrors gear/pets).
export const getBadgePassives = (buyerId) => sumBadgeDomain(buyerId, "combat"); // → boss strike (unchanged callers)
export const getBadgePassivesForMembers = (buyerIds) => getBadgeDomainForMembers(buyerIds, "combat");
export const getBadgeSea = (buyerId) => sumBadgeDomain(buyerId, "sea");         // → equippedSeaAffinity (sailing)
export const getBadgeFarm = (buyerId) => sumBadgeDomain(buyerId, "farm");       // → farmBonuses (farm)
export const getBadgeForge = (buyerId) => sumBadgeDomain(buyerId, "forge");     // → forge smithing odds (crafting)
export const getBadgeDepth = (buyerId) => sumBadgeDomain(buyerId, "depth");   // → equippedDepthAffinity (the mine)

// All domain totals from ONE held-slugs read — for the Badges page's "Badge Power" summary.
export async function getBadgeBonusTotals(buyerId) {
    if (!buyerId) return { combat: {}, sea: {}, farm: {}, forge: {}, depth: {} };
    const held = await heldSlugs(buyerId).catch(() => new Set());
    const totals = { combat: {}, sea: {}, farm: {}, forge: {}, depth: {} };
    for (const slug of held) {
        const b = BADGE_BONUSES[slug];
        if (!b) continue;
        for (const dom of ["combat", "sea", "farm", "forge", "depth"]) {
            if (!b[dom]) continue;
            for (const [k, v] of Object.entries(b[dom])) totals[dom][k] = (totals[dom][k] || 0) + v;
        }
    }
    return totals;
}

// ── Collection milestones ── as your badge count climbs, hit these thresholds for a chunk of gold + a chest
// (escalating chest tiers). Claimed on the Badges page. The high tiers are long-term aspirations as more
// badges are added over time.
// Chest rewards are capped at MYTHIC on purpose — the top two tiers (Ascendant/Eternal) are far too strong to
// hand out for a badge count right now. The high milestones escalate the QUANTITY of mythic chests instead.
export const BADGE_MILESTONES = [
    { count: 10,  gold: 50,  chest: "wooden", chestCount: 1 },
    { count: 25,  gold: 125,  chest: "iron",   chestCount: 1 },
    { count: 50,  gold: 250,  chest: "gold",   chestCount: 1 },
    { count: 100, gold: 500, chest: "mythic", chestCount: 1 },
    { count: 250, gold: 1250, chest: "mythic", chestCount: 2 },
    { count: 500, gold: 2500, chest: "mythic", chestCount: 3 },
];
const CHEST_LABEL = { wooden: "Wooden", iron: "Iron", gold: "Gold", mythic: "Mythic" };

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
        count: mst.count, gold: mst.gold, chest: mst.chest, chestCount: mst.chestCount || 1, chestLabel: CHEST_LABEL[mst.chest] || mst.chest,
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
        await addChests(buyerId, { [mst.chest]: mst.chestCount || 1 }, { source: "badge_milestone", meta: { count: mst.count } });
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
        case "pets_enshrined": return { current: m.petsEnshrined, target: t }; // # taken to Lv6 AND given a stone
        case "pet_both_stones": return { current: m.petBothStones, target: t }; // used a Lightstone AND a Darkstone
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
        case "auction_sales": return { current: m.auctionSales, target: t }; // items SOLD on the Auction House
        case "auction_buys": return { current: m.auctionBuys, target: t }; // items BOUGHT on the Auction House
        case "auction_top_sale": return { current: m.auctionTopSale, target: t }; // biggest single sale (gold)
        case "casino_plays": return { current: m.casinoPlays, target: t };       // pulls, spins and tickets
        case "casino_wagered": return { current: m.casinoWagered, target: t };   // lifetime gold across the floor
        case "casino_jackpot": return { current: m.casinoJackpots, target: t };  // three wolves on the slot
        // `casino_pocket` lived here until the wheel was removed. Its badge ("Called It") was held by
        // nobody, so it went with the game rather than becoming a trophy that can never be earned.
        case "casino_perfect": return { current: m.casinoPerfect, target: t };   // five of five on a keno ticket
        case "casino_pets": return { current: m.casinoPets, target: t };         // how many of the five you hold
        default: return { current: 0, target: t || 1 };
    }
}

function qualifies(rule, threshold, m) {
    const { current, target } = progressForRule(rule, threshold, m);
    return current >= target;
}

// The full badge board for a member: every badge with earned/locked state + progress on the unlockables,
// plus the single "next badge" (closest unearned unlockable). Powers the Badges hub + the next-badge nudge.
// ── HOW RARE IS IT ───────────────────────────────────────────────────────────────────────────────────────────
// How many people hold each badge, and how many people there are to hold them. A member asked for this
// directly: "## other players have earned this, to see the rarity of each you've earned/haven't earned" —
// and it is the one fact a collection screen is missing without. A wall of 210 badges with no idea which are
// hard tells you nothing about what you have done; "3 of 84 have this" turns the same wall into a scoreboard.
//
// Two rows total (one grouped count, one population count), so it costs nothing to answer for every badge.
// The denominator is members with an ALIAS — the same "is a real player" test the directory and the
// leaderboards use, so 4% here means the same thing as 4% anywhere else in the Den.
async function badgeRarity() {
    const [rows, pop] = await Promise.all([
        db.query(`SELECT badge_slug, COUNT(*)::int AS n FROM mkt_user_badge GROUP BY badge_slug`).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => null),
    ]);
    return { holders: new Map(rows.map((r) => [r.badge_slug, Number(r.n) || 0])), population: Math.max(1, Number(pop?.n) || 1) };
}

export async function getBadgeBoard(buyerId) {
    const [all, held, m, totals, rarity] = await Promise.all([listBadges(), heldSlugs(buyerId), getMemberMetrics(buyerId), getBadgeBonusTotals(buyerId), badgeRarity()]);
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
        // Rarity. `others` is the number asked for — holders NOT counting you — so a badge only you hold reads
        // "nobody else", not "1 person". The percentage is of the whole Den either way, because that is the
        // number that says how hard the thing was.
        const holders = rarity.holders.get(b.slug) || 0;
        return {
            slug: b.slug, label: b.label, description: b.description, icon: b.icon, color: b.color,
            adminOnly: b.adminOnly, unlockable: Boolean(b.autoRule), goldPrice: b.goldPrice, dropOnly: b.dropOnly,
            earned, progress, bonus: BADGE_BONUSES[b.slug] || null,
            holders,
            others: Math.max(0, holders - (earned ? 1 : 0)),
            pct: Math.round((holders / rarity.population) * 100),
        };
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
        population: rarity.population, // members the rarity percentages are OF — shown so the % is not a mystery
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

/**
 * A badge off the board the member has not earned — The Herald's Licence.
 *
 * "Chosen from what you are missing", so the pool is every badge they do not hold. SECRET badges are excluded:
 * a secret is a thing you find out about by doing it, and having one handed over by a licence would spoil the
 * only reward it has. Returns the badge def, or null when the board is complete.
 */
export async function grantMissingBadge(buyerId) {
    if (!buyerId) return null;
    const all = await listBadges().catch(() => []);
    const held = await heldSlugs(buyerId);
    const pool = all.filter((b) => !held.has(b.slug) && !b.secret);
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return (await grantEventBadge(buyerId, pick.slug)) ? pick : null;
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

// Grant a random un-owned DROP-ONLY badge. BOSS KILLS ONLY — to the top damage dealer. Returns it or null.
//
// Chests used to call this too, and that was the mistake: a badge for opening a box says nothing about you.
// Topping the damage board on a boss the whole Den fought does, which is why this caller stayed.
//
// `drop_only` is the ONLY gate here, so anything flagged with it lands in this pool. Nine ACHIEVEMENT badges
// had been flagged — "Forged a single item all the way to +10", "Landed a PIXEL-PERFECT hammer strike",
// "Maxed out every one of the Forge's smithing perks" — and chests were handing them out to members who had
// never touched the Forge. A badge that describes something you DID means nothing if a chest can grant it.
//
// The pool is now only badges whose description IS "you found this": boss_relic, lucky_find, mythic_find,
// treasure_hunter. Before flagging a badge drop_only, read its description: if it names an action, it belongs
// to the event that performs that action (grantEventBadge), not to a loot table. The Mark of Shame was also in
// here and is not any more — it is reserved, and admin_only alone did not keep it out of the pool.
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
    const member = await db.queryOne(`SELECT email, display_name, alias, notify_prefs FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!member?.email) return false;
    // Badges also push, so a member who muted badge email should not get a second ping for the same event.
    if (!allowsNotify(member.notify_prefs || {}, "email", "badge")) return false;
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
