import "server-only";

import { db } from "@/lib/db";
import { isOwner, isPrimaryOwner } from "@/lib/marketplace/owner.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { listFriends } from "@/lib/marketplace/friends.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { getActiveTownEvent, lastRaidRecap } from "@/lib/marketplace/town-events.js";
import { CHEST_TIERS, addChests } from "@/lib/marketplace/chests.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";
import { storeStatus } from "@/lib/marketplace/store-hours.js";
import { shared, TTL } from "@/lib/marketplace/shared-cache.js";
import { getDefaultSpriteUrl } from "@/lib/marketplace/avatar-sprite.js";
import { bumpTownQuest, getTownQuests, townQuestsClaimable } from "@/lib/marketplace/town-quests.js";
import { townEventsLive, TOWN_EVENT_TYPES } from "@/lib/marketplace/town-events.js";
import { getTownProjects, getTownBonuses, contributeToProject, wellClaimedToday } from "@/lib/marketplace/town-projects.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { describeItemElements } from "@/lib/marketplace/item-element.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { itemSpriteFor } from "@/lib/marketplace/item-sprites.js";
import { checkTownContribBadges, checkMerchantBadges } from "@/lib/marketplace/town-badges.js";
import { getActiveShiny } from "@/lib/marketplace/town-shiny.js";
import { getSetting, setSetting } from "@/lib/settings.js";
import { equippedPowers, hasPower } from "@/lib/marketplace/ascension-powers.js";
import { NOTICE_ALIAS } from "@/lib/marketplace/notice-format.js";
import { chipFor } from "@/lib/marketplace/roles.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// The Traveling Merchant's wares — loot chests sold for gold (a gold SINK), always at a DISCOUNT off their
// "list" price. Stock + the discount improve as the community levels up the Trading Post (merchantTier): rarer
// chests unlock, prices drop further. Daily caps keep it a treat: one of each chest a day (the humble wooden
// chest, three) so it's a habit, not a gold-dump.
const MERCHANT_BASE_DISCOUNT = 0.05; // the merchant always undercuts the list price by at least this much
// Halved across the board. A Gold chest at 6,000 was most of a day's income for one roll of a table you can
// also earn from play, so the merchant read as a place you look at rather than a place you buy from.
const MERCHANT_STOCK = [
    { tier: "wooden", price: 250, minTier: 0, capPerDay: 3 },
    { tier: "iron", price: 1000, minTier: 0, capPerDay: 1 },
    { tier: "gold", price: 3000, minTier: 0, capPerDay: 1 },
    // The Trading Post unlocks ONE tier above Gold — a Mythic chest (at merchant tier 3). Nothing higher: the
    // Ascendant+ chests stay exclusive to real gameplay (boss/sailing/forge), not something you can just buy.
    { tier: "mythic", price: 8000, minTier: 3, capPerDay: 1 },
];
// `powers` is the viewer's ascension set. Three of them reach the merchant and all three are about what he
// will SELL YOU, so they resolve together here rather than in three places:
//   FOUNDER'S CHARTER      half price, past the 45% discount ceiling the Trading Post tops out at
//   THE STANDING ORDER     his one-a-day chest limit becomes three of each
//   THE MERCHANT'S LEDGER  his whole catalogue, whatever your Trading Post level
function merchantWaresForTier(tier = 0, chestArt = {}, boughtToday = {}, powers = null) {
    const charter = powers?.has?.("founder_s_charter");
    const disc = charter ? 0.5 : Math.min(0.45, MERCHANT_BASE_DISCOUNT + tier * 0.03);
    const capMult = powers?.has?.("standing_order") ? 3 : 1;
    const wares = powers?.has?.("merchant_s_ledger") ? MERCHANT_STOCK : MERCHANT_STOCK.filter((w) => tier >= w.minTier);
    return wares.map((w) => {
        const cap = w.capPerDay * capMult;
        const bought = boughtToday[w.tier] || 0;
        return {
            tier: w.tier, price: Math.round(w.price * (1 - disc)), orig: w.price, discountPct: Math.round(disc * 100),
            label: CHEST_TIERS[w.tier]?.label || w.tier, emoji: CHEST_TIERS[w.tier]?.emoji || "📦",
            image: chestArt[w.tier] || null,
            capPerDay: cap, boughtToday: bought, remaining: Math.max(0, cap - bought),
        };
    });
}
// How many chests of each tier this member has already bought from the merchant TODAY (UTC day). Powers the
// per-tier daily cap. Read from the coin ledger (reason 'merchant_chest', meta.tier) so no extra table is needed.
async function merchantBoughtToday(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(
        `SELECT meta->>'tier' AS tier, COUNT(*)::int AS n FROM mkt_coin_event
          WHERE buyer_id = $1 AND reason = 'merchant_chest' AND created_at >= date_trunc('day', NOW())
          GROUP BY 1`,
        [buyerId]
    ).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.tier, Number(r.n) || 0]));
}

// ── THE WOLF DEN TOWN ─────────────────────────────────────────────────────────────────────────────────────
// A persistent social overworld: your hero sprite walks a plaza and you see other players (as their real hero
// sprites) with a live status of what they're doing. Owner-gated during the build. Shows ONLY members who are
// online RIGHT NOW (active within ONLINE_WINDOW) — nobody offline appears, so the plaza reflects who's actually
// around. Real movers walk at their live position; other online members render as ambient (idle-wandering)
// avatars until the town ships. Positions of real movers live in mkt_town_presence.

// "Online now" window: a member counts as present if they've pinged this recently. PresenceHeartbeat pings
// every ~40s while the tab is visible, so 90s comfortably spans 2 pings — a live member never flickers out,
// and someone who closes the tab drops off within ~90s. True real-time presence.
const ONLINE_WINDOW = "90 seconds";

// Buildings line the side-scrolling street at fixed x positions (0..100 % of the WIDE world); tapping one fast-
// travels into that system (the menu still works for speed). Each optionally shows a generated sprite (mkt_town_art).
// All nine are on by default. The Vault + Festival Stage used to be community-funded unlocks; they're now
// standing fixtures on the (widened) street, so the plaza always feels full. x is a % of the WIDE world.
export const TOWN_BUILDINGS = [
    { id: "tavern", emoji: "🍺", label: "The Tavern", href: "/marketplace/friends", x: 4 },
    { id: "boss", emoji: "⚔️", label: "Boss Arena", href: "/marketplace/boss", x: 15 },
    { id: "forge", emoji: "⚒️", label: "The Forge", href: "/marketplace/blacksmith", x: 26 },
    { id: "auction", emoji: "🏛️", label: "Auction House", href: "/marketplace/auction", x: 37 },
    { id: "shop", emoji: "🛒", label: "General Store", href: "/marketplace/store", x: 48 },
    { id: "docks", emoji: "⛵", label: "The Docks", href: "/marketplace/sailing", x: 59 },
    { id: "farm", emoji: "🌾", label: "The Farm", href: "/marketplace/farm", x: 70 },
    { id: "vault", emoji: "🏦", label: "The Vault", href: "/marketplace/credit", x: 81 },
    { id: "festival", emoji: "🎪", label: "Festival Stage", href: "/marketplace/track", x: 92 },
    { id: "mine", emoji: "⛏️", label: "The Mine", href: "/marketplace/mining", x: 103 },
];

// Buildings that only some members can see. The Kitchen is owner-gated while the design settles, and the town
// is the one place a new feature has to appear or nobody will find it — so the gate lives here rather than the
// building being quietly absent from the list.
export const GATED_BUILDINGS = [
    { id: "kitchen", emoji: "🍳", label: "The Kitchen", href: "/marketplace/cooking", x: 86 },
    // gate: "owner" is load-bearing — the filter below is `b.gate !== "owner" || isOwner(...)`, so an entry
    // WITHOUT it is shown to everybody. The Kitchen has none because the Kitchen is public now.
    { id: "delves", emoji: "🗝️", label: "Dungeons", href: "/marketplace/dungeons", x: 30 },
    { id: "arena", emoji: "⚔️", label: "The Arena", href: "/marketplace/arena", x: 34, gate: "owner" },
    // No `gate` — the Market is public. (An entry WITHOUT it is shown to everybody, per the note above.)
    { id: "market", emoji: "🏪", label: "The Market", href: "/marketplace/market", x: 40 },
    // The casino is being built. `gate: "owner"` is what keeps it off everybody else's street — see the note
    // above: an entry WITHOUT it is shown to the whole Den.
    { id: "casino", emoji: "🎰", label: "The Casino", href: "/marketplace/casino", x: 46, gate: "owner" },
];

// Lay the street out evenly for however many buildings the viewer can actually see.
//
// The x values on TOWN_BUILDINGS were hand-picked 11% apart, which is ~319px of the 2900px street — comfortably
// clear of the 244px a building sprite can occupy. Dropping a tenth building in at a hand-picked 86% put it 5%
// from the Vault and 6% from the Festival Stage, i.e. straight through both of them. Computing the spread means
// adding a building can never collide with one again, and a viewer who can't see the gated one still gets the
// original nine-building layout they're used to.
function spaceOut(list) {
    if (!list.length) return list;
    const FIRST = 4, LAST = 92;
    const step = list.length > 1 ? (LAST - FIRST) / (list.length - 1) : 0;
    return list.map((b, i) => ({ ...b, x: Math.round((FIRST + step * i) * 10) / 10 }));
}

// Shared generated art (background + building sprites), keyed. Empty until generated via the admin tool.
export async function getTownArt() {
    const rows = await db.query(`SELECT art_key, url, flip FROM mkt_town_art`).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.art_key, { url: r.url, flip: r.flip === true }]));
}

// Map a member's most-recent activity → a friendly "what they're up to" status. Prefer a known game event,
// else the page they're on, else a gentle default so everyone has a bubble.
const EVENT_STATUS = {
    daily_spin: "🎡 spinning the wheel",
    harvest_crop: "🌾 tending the farm", fertilize_crop: "🌾 tending the farm", place_deco: "🌾 decorating the farm",
    pet_farm: "🐾 petting pets", pet_other: "🐾 visiting a farm", feed_other: "🐾 feeding pets", loot_pig: "🐷 chasing the loot pig",
    trade: "🤝 trading", bounty_post: "🎯 posting a bounty", bounty_win: "🎯 claiming a bounty",
    buy_consumable: "🛒 shopping", use_consumable: "🧪 using an item", buy_pet: "🐾 adopting a pet",
};
const PATH_STATUS = [
    // The Town itself was missing, so EVERYONE standing in the plaza fell through to "around town" — the single
    // most common case in the whole list read as "not really here".
    ["/marketplace/town", "🐺 in the plaza"],
    ["/marketplace/blacksmith", "⚒️ forging gear"],
    ["/marketplace/sailing", "⛵ out at sea"],
    ["/marketplace/boss", "⚔️ fighting the boss"],
    ["/marketplace/farm", "🌾 on the farm"],
    ["/marketplace/spin", "🎡 spinning the wheel"],
    ["/marketplace/store", "🛒 at the store"],
    ["/marketplace/pets", "🐾 with the pets"],
    ["/marketplace/sets", "🛡️ tuning their loadout"],
    ["/marketplace/inventory", "🛡️ sorting gear"],
    ["/marketplace/trade", "🤝 trading"],
];
function statusFor(event, path) {
    if (event && EVENT_STATUS[event]) return EVENT_STATUS[event];
    if (path) { const hit = PATH_STATUS.find(([p]) => path.startsWith(p)); if (hit) return hit[1]; }
    return "🐺 around town";
}

// A stable pseudo-random 0..1 from a string (for a consistent ambient home-slot per player).
function hash01(str, salt = 0) {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
}
// Ambient players (not actively walking the town) get a deterministic home slot along the street — spread
// across the WIDE world horizontally, on a tight ground band vertically (it's a side-scroller now).
function homeSlot(id) {
    return { x: 5 + hash01(id, 1) * 90, y: 74 + hash01(id, 2) * 10 };
}

// Which plaza building an activity gravitates toward, so members cluster where they're actually "doing it"
// (boss fighters by the Arena, farmers by the Barn, …). Falls back to a spread home slot when unknown.
const EVENT_BUILDING = {
    harvest_crop: "farm", fertilize_crop: "farm", place_deco: "farm", pet_farm: "farm", pet_other: "farm", feed_other: "farm", loot_pig: "farm",
    buy_consumable: "shop", use_consumable: "shop", buy_pet: "shop", trade: "tavern",
};
const PATH_BUILDING = [
    ["/marketplace/blacksmith", "forge"], ["/marketplace/sailing", "docks"], ["/marketplace/boss", "boss"],
    ["/marketplace/farm", "farm"], ["/marketplace/store", "shop"], ["/marketplace/friends", "tavern"],
    ["/marketplace/trade", "tavern"],
];
function activitySlot(id, event, path) {
    let bId = event && EVENT_BUILDING[event] ? EVENT_BUILDING[event] : null;
    if (!bId && path) { const hit = PATH_BUILDING.find(([p]) => path.startsWith(p)); if (hit) bId = hit[1]; }
    const b = bId ? TOWN_BUILDINGS.find((x) => x.id === bId) : null;
    if (!b) return homeSlot(id); // unknown activity → mill along the street
    const x = Math.max(3, Math.min(97, b.x + (hash01(id, 3) - 0.5) * 12)); // a few steps around the building
    return { x, y: 76 + hash01(id, 4) * 10 };
}

// The pet sprite at a member's ACTUAL level for their featured pet (evolved art at Lv2-5), so town pets reflect
// their level like the boss scene does. Returns { url, flip } or null.
function petSpriteForLevel(collId, petXp, petSprites, petSpriteLevels, stone = null) {
    if (!collId) return null;
    const lvl = petLevelForXp(petXp || 0, collectibleById(collId)?.rarity) || 1;
    return pickPetSpriteForLevel(petSprites[collId], petSpriteLevels[collId], lvl, stone) || null;
}

// Heartbeat: the caller is on the Town page RIGHT NOW. Bumps town_seen_at every poll; (re)starts town_since when
// they've just arrived (no ping in >90s). Returns how long they've been continuously in town so getTownState can
// grant the 3-minute hangout buff. The upsert seeds a default slot for someone who never walked, and never
// clobbers the x/y of someone already in the plaza.
async function markTownSeen(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, town_seen_at, town_since)
         VALUES ($1, 50, 80, 1, NOW(), NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET
            town_since = CASE WHEN mkt_town_presence.town_seen_at IS NULL OR mkt_town_presence.town_seen_at < NOW() - INTERVAL '90 seconds'
                              THEN NOW() ELSE mkt_town_presence.town_since END,
            town_seen_at = NOW()
         RETURNING EXTRACT(EPOCH FROM (NOW() - town_since))::int AS in_town_secs`,
        [buyerId]
    ).catch(() => null);
    return row ? { inTownSecs: Number(row.in_town_secs) || 0 } : null;
}

// The Town HANGOUT buff: hang in the plaza for 3 continuous minutes → a personal +5% XP & gold for 2 hours.
// Not advertised anywhere until you actually earn it (then the client celebrates it). Re-earns after it lapses
// if you're still around. Returns the buff state for the client (incl. justGranted, the one-shot celebrate flag).
const HANGOUT_PCT = 5, HANGOUT_HOURS = 2, HANGOUT_EARN_SECS = 180;
async function hangoutBuffState(buyerId, inTownSecs) {
    if (!buyerId) return null;
    const active = await db.queryOne(
        `SELECT EXTRACT(EPOCH FROM (expires_at - NOW()))::int AS secs_left
           FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'town_hangout' AND expires_at > NOW()
          ORDER BY expires_at DESC LIMIT 1`, [buyerId]
    ).catch(() => null);
    if (active) return { active: true, pct: HANGOUT_PCT, secsLeft: Number(active.secs_left) || 0, justGranted: false, earnSecs: HANGOUT_EARN_SECS, inTownSecs };
    if (inTownSecs >= HANGOUT_EARN_SECS) {
        const ins = await db.queryOne(
            `INSERT INTO mkt_user_boost (buyer_id, kind, magnitude, expires_at)
             VALUES ($1, 'town_hangout', $2, NOW() + ($3 || ' hours')::interval)
             RETURNING EXTRACT(EPOCH FROM (expires_at - NOW()))::int AS secs_left`,
            [buyerId, 1 + HANGOUT_PCT / 100, String(HANGOUT_HOURS)]
        ).catch(() => null);
        if (ins) return { active: true, pct: HANGOUT_PCT, secsLeft: Number(ins.secs_left) || HANGOUT_HOURS * 3600, justGranted: true, earnSecs: HANGOUT_EARN_SECS, inTownSecs };
    }
    return { active: false, pct: HANGOUT_PCT, secsLeft: 0, justGranted: false, earnSecs: HANGOUT_EARN_SECS, inTownSecs };
}

// The todo counts ALONE, for the nav pill.
//
// getTownState is the highest-volume request in the app and renders the whole plaza — rosters, art, projects,
// chat. The nav needs four small numbers, on every page, for everyone. Running the full state to read them
// would have made a badge more expensive than the screen it points at, so this asks only what it needs.
//
// Same fields and the same meanings as the `todo` block inside getTownState; if one changes, change both.
export async function getTownTodo(buyerId) {
    if (!buyerId) return { quests: 0, well: 0, tavern: 0, event: 0, total: 0, byBuilding: {} };
    const [claimable, wished, pint, live] = await Promise.all([
        townQuestsClaimable(buyerId).catch(() => 0),
        wellClaimedToday(buyerId).catch(() => true),
        db.queryOne(`SELECT (last_drink_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date) AS ready
                       FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT 1 AS x FROM mkt_town_event WHERE status = 'active' LIMIT 1`).catch(() => null),
    ]);
    const quests = Number(claimable) || 0;
    const well = wished ? 0 : 1;
    // No tavern row yet means they have never drunk, so the pint is waiting.
    const tavern = (pint === null || pint?.ready) ? 1 : 0;
    const event = live ? 1 : 0;
    return {
        quests, well, tavern, event,
        total: quests + well + tavern + event,
        byBuilding: { tavern, well, quests, plaza: event },
    };
}

export async function getTownState(buyerId) {
    const owner = isOwner(buyerId);

    // This is the highest-volume request in the app — every viewer runs it on a timer — and it used to open
    // with FIVE round-trips one after another. The `neon()` HTTP driver gives each query its own HTTPS request,
    // so sequential queries don't just add up, they add up in wall time while a gigabyte of memory sits idle.
    // That's the gap between 46ms of CPU and 221ms of held memory per request.
    //
    // Only two orderings are real:
    //   markTownSeen WRITES mkt_town_presence, and myPos READS it   -> myPos must follow it
    //   hangoutBuffState needs heartbeat.inTownSecs                 -> must follow it
    // `me` (mkt_buyer) and `recent` (mkt_visitor, and it excludes this member anyway) share nothing with it.
    // So five stages collapse to two, with identical results.
    const [heartbeat, me, rosterAll, pintReady] = await Promise.all([
        markTownSeen(buyerId), // stamp presence + measure how long they've been here
        buyerId
            ? db.queryOne(`SELECT display_name, alias, avatar_sprite_url, avatar_sprite_flip, featured_collectible,
                    (SELECT xp FROM mkt_pet_level pl WHERE pl.buyer_id = mkt_buyer.id::text AND pl.pet_id = mkt_buyer.featured_collectible) AS featured_pet_xp,
                    COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null)
            : Promise.resolve(null),
        // Who is ONLINE NOW. This was per-viewer only because it excluded the caller — so every viewer ran the
        // same scan to get the same answer minus themselves. Fetch it ONCE for everyone and drop the caller
        // below; a 2.5s TTL is well inside the 4-8s poll, so nobody sees a staler plaza than before.
        shared("town:online", TTL.LIVE, () => db.query(
            `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.featured_collectible,
                    (SELECT xp FROM mkt_pet_level pl WHERE pl.buyer_id = b.id::text AND pl.pet_id = b.featured_collectible) AS featured_pet_xp,
                    MAX(v.last_seen) AS seen
               FROM mkt_visitor v JOIN mkt_buyer b ON b.id = v.buyer_id
              WHERE v.buyer_id IS NOT NULL AND v.last_seen > NOW() - $1::interval
              GROUP BY b.id ORDER BY seen DESC LIMIT 41`,
            [ONLINE_WINDOW]
        ).catch(() => [])),
        // The daily pint is the tavern's ONE genuinely transient task, so it is the only thing the tavern
        // contributes to the todo badge. Dice were considered and left out on purpose: you can gamble every
        // day, so counting them would leave the badge permanently lit, which is the same as having no badge.
        buyerId
            ? db.queryOne(`SELECT (last_drink_day IS DISTINCT FROM (NOW() AT TIME ZONE 'America/Chicago')::date) AS ready
                             FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null)
            : Promise.resolve(null),
    ]);
    const [hangout, myPos] = await Promise.all([
        hangoutBuffState(buyerId, heartbeat?.inTownSecs || 0),
        buyerId ? db.queryOne(`SELECT x, y, facing FROM mkt_town_presence WHERE buyer_id = $1`, [buyerId]).catch(() => null) : Promise.resolve(null),
    ]);

    // The cached roster includes everyone; drop the caller here (it fetched 41 so the cap still lands at 40).
    const recent = rosterAll.filter((r) => String(r.id) !== String(buyerId || "")).slice(0, 40);
    const ids = recent.map((r) => r.id);
    const chatIds = buyerId ? [...ids, buyerId] : ids; // include me so my own bubble persists across polls
    // EIGHT of these twelve are byte-identical for every viewer, and this handler runs on a timer for everyone
    // in town. Uncached, fifteen concurrent viewers ran the same queries fifteen times every four seconds; at
    // 300 members that would be sixty. They go through the shared cache — the per-viewer four (friends, event,
    // quests, chat) do not. See shared-cache.js for why each TTL is what it is.
    const [art, petSprites, petSpriteLevels, friends, projects, bonuses, event, quests, chestArt, eventsLive, chatLog, defaultSprite] = await Promise.all([
        shared("town:art", TTL.ART, () => getTownArt()),
        shared("town:petSprites", TTL.ART, () => getPetSpriteData().catch(() => ({}))),
        shared("town:petSpriteLevels", TTL.ART, () => getPetSpriteLevelData().catch(() => ({}))),
        buyerId ? listFriends(buyerId).catch(() => []) : Promise.resolve([]),
        shared("town:projects", TTL.SLOW, () => getTownProjects().catch(() => [])),
        shared("town:bonuses", TTL.SLOW, () => getTownBonuses(Date.now()).catch(() => ({}))),
        getActiveTownEvent(buyerId).catch(() => null),
        buyerId ? getTownQuests(buyerId).catch(() => []) : Promise.resolve([]),
        shared("town:chestArt", TTL.ART, () => getChestArt().catch(() => ({}))),
        shared("town:eventsLive", TTL.SLOW, () => townEventsLive().catch(() => false)),
        getGlobalChat(buyerId, 30).catch(() => []),
        shared("town:defaultSprite", TTL.ART, () => getDefaultSpriteUrl().catch(() => null)),
    ]);
    // The itemised wrap-up for a raid that just ended, for anyone who took part — served from the DB so it
    // survives a refresh and reaches everyone, not just whoever landed the killing blow.
    const raidRecap = event ? null : await lastRaidRecap(buyerId).catch(() => null);
    const boughtToday = await merchantBoughtToday(buyerId);
    const merchantWares = merchantWaresForTier(bonuses.merchantTier || 0, chestArt, boughtToday, await equippedPowers(buyerId));
    // Wishing Well: only surfaced once the town has funded it (wellGold > 0). Tells the client the daily payout
    // and whether THIS member has already tossed their coin today (so the fountain shows a claim prompt or not).
    const well = (bonuses.wellGold || 0) > 0
        ? { gold: bonuses.wellGold, xp: bonuses.wellXp || 0, claimedToday: buyerId ? await wellClaimedToday(buyerId) : true }
        : null;
    const friendSet = new Set((friends || []).map((f) => f.id));
    // Latest activity per player (status bubble), who's walking/typing now, and recent chat speech-bubbles.
    const [acts, presence, chats] = await Promise.all([
        ids.length
            ? db.query(
                `SELECT DISTINCT ON (buyer_id) buyer_id, event, path FROM mkt_activity_event
                  WHERE buyer_id = ANY($1) AND created_at > NOW() - INTERVAL '30 minutes'
                  ORDER BY buyer_id, created_at DESC`,
                [ids]
            ).catch(() => [])
            : Promise.resolve([]),
        ids.length
            ? db.query(
                `SELECT buyer_id, x, y, facing,
                        (updated_at > NOW() - INTERVAL '30 seconds') AS walking,
                        (typing_at  > NOW() - INTERVAL '6 seconds')  AS typing,
                        (town_seen_at > NOW() - INTERVAL '45 seconds') AS in_town
                   FROM mkt_town_presence
                  WHERE buyer_id = ANY($1) AND (updated_at > NOW() - INTERVAL '30 seconds' OR typing_at > NOW() - INTERVAL '6 seconds' OR town_seen_at > NOW() - INTERVAL '45 seconds')`,
                [ids]
            ).catch(() => [])
            : Promise.resolve([]),
        chatIds.length
            ? db.query(
                `SELECT DISTINCT ON (buyer_id) buyer_id, body FROM mkt_town_chat
                  WHERE buyer_id = ANY($1) AND created_at > NOW() - INTERVAL '8 seconds'
                  ORDER BY buyer_id, created_at DESC`,
                [chatIds]
            ).catch(() => [])
            : Promise.resolve([]),
    ]);
    const actBy = Object.fromEntries(acts.map((a) => [a.buyer_id, a]));
    const moverBy = Object.fromEntries(presence.map((m) => [m.buyer_id, m]));
    const chatBy = Object.fromEntries(chats.map((c) => [c.buyer_id, c.body]));

    // Anyone who has swung at the live raid in the last 90s is IN the fight — so they get a fighting status and
    // count as in-town regardless of what their last tracked activity happened to be. Without this, two people
    // standing in the same brawl both read "🐺 around town", which made a shared fight feel like solo play.
    const fightingSet = new Set((event?.activeFighterIds || []).map(String));
    const raidLabel = event ? `⚔️ fighting the ${String(event.name || "raid").toLowerCase()}` : null;

    // ONE query for everybody in the plaza rather than one per avatar — this renders every few seconds and a
    // per-member round trip here is how a live scene turns into a load.
    const { stoneMapForMembers } = await import("@/lib/marketplace/pet-ascension.js");
    const petStones = await stoneMapForMembers([...recent.map((r) => r.id), buyerId].filter(Boolean)).catch(() => new Map());
    const myStone = (petStones.get(buyerId) || {})[me?.featured_collectible] || null;
    const players = recent.map((r) => {
        const a = actBy[r.id];
        const mv = moverBy[r.id];
        const walking = Boolean(mv?.walking);
        const fighting = fightingSet.has(String(r.id));
        const slot = activitySlot(r.id, a?.event, a?.path);
        const pet = petSpriteForLevel(r.featured_collectible, r.featured_pet_xp, petSprites, petSpriteLevels,
            (petStones.get(r.id) || {})[r.featured_collectible] || null);
        return {
            id: r.id,
            name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"),
            alias: r.alias || null,
            // Fall back to the SHARED default sprite, the way the boss fight already does. Members who have
            // never opened the customiser no longer get a bespoke draw (see pendingSpriteIds), so without this
            // they'd walk the plaza with no hero at all.
            sprite: r.avatar_sprite_url || defaultSprite || null,
            flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
            pet: pet?.url || null,
            petFlip: pet ? pet.flip === true : false,
            friend: friendSet.has(r.id),
            status: fighting && raidLabel ? raidLabel : statusFor(a?.event, a?.path),
            fighting,                                   // swinging at the live raid right now
            chat: chatBy[r.id] || null,                 // recent speech-bubble message (shows ~8s)
            typing: Boolean(mv?.typing),
            walking,                                    // true = actively moving in the plaza, use real x/y
            // Swinging at the raid IS being here — a stale heartbeat shouldn't ghost someone mid-fight.
            inTown: Boolean(mv?.in_town) || fighting,
            x: walking ? mv.x : slot.x,
            y: walking ? mv.y : slot.y,
            facing: walking ? mv.facing : 1,
        };
    });
    // Delineate who is ACTUALLY in the plaza (on this page) vs merely online elsewhere on the site.
    const inTownCount = players.filter((p) => p.inTown).length + (buyerId ? 1 : 0); // you count as in-town
    const aroundCount = players.filter((p) => !p.inTown).length;

    return {
        signedIn: Boolean(buyerId),
        owner,
        raidAdmin: isPrimaryOwner(buyerId), // ONLY Luke sees the raid trigger/end controls (surprise-drop lever)
        // ── SOMETHING IS FOR SALE AT THE VAULT ───────────────────────────────────────────────────────────
        // A package lived on one screen nobody visits unless they were already buying credit, which is
        // backwards — the package is the REASON to go there. The Vault is already the door to it on the
        // street, so it gets a flag when there is something behind it. Names the package so the plaza says
        // WHAT is for sale rather than just that something is; a banner with no noun is ignorable.
        //
        // Owner-preview packages are deliberately EXCLUDED: the plaza is the most public surface in the game
        // and an unreleased item must not advertise itself there even to the owner, or the one place the gate
        // is easiest to forget is the one place everybody looks.
        // The Vault flies a sign when something is for sale. The owner sees an unreleased one too, labelled
        // as a preview by `ownerPreview` — building the advertising and never being able to look at it in
        // place is how you ship a banner nobody checked.
        vaultOffer: await (async () => {
            const { featuredPackage } = await import("@/lib/marketplace/packages-server.js");
            const p = await featuredPackage(buyerId).catch(() => null);
            return p ? { id: p.id, name: p.name, priceCents: p.priceCents, ownerPreview: p.ownerPreview } : null;
        })(),
        // ── EVERY RAID THERE IS, NOT THE THREE SOMEBODY TYPED OUT ────────────────────────────────────────
        // The spawn buttons were three hard-coded kinds while TOWN_EVENT_TYPES held six. Frost Pack, the
        // Drowned Crew and the Hollow Court shipped with their own archetypes, art and push copy and could
        // only ever appear by random cron roll — the owner had no way to fire one on purpose, which is the
        // whole point of the lever. Derived from the catalog now, so a seventh faction gets its button by
        // existing rather than by somebody remembering this list.
        raidKinds: isPrimaryOwner(buyerId)
            ? Object.entries(TOWN_EVENT_TYPES).map(([key, t]) => ({ key, name: t.name, emoji: t.emoji || "⚔️", boss: Boolean(t.boss) }))
            : [],
        // Read only for the one person who can act on it — everybody else would pay a query to render nothing.
        ownerGamePush: isPrimaryOwner(buyerId)
            ? String(await getSetting("push.owner_game", "off").catch(() => "off")) === "on"
            : false,
        you: {
            id: buyerId,
            name: me?.display_name || (me?.alias ? `@${me.alias}` : "You"),
            sprite: me?.avatar_sprite_url || null,
            flip: me?.avatar_sprite_url ? me.avatar_sprite_flip === true : false,
            x: myPos?.x ?? 50, y: myPos?.y ?? 80, facing: myPos?.facing ?? 1,
            chat: (buyerId ? chatBy[buyerId] : null) || null,
            inTown: true,
            pet: petSpriteForLevel(me?.featured_collectible, me?.featured_pet_xp, petSprites, petSpriteLevels, myStone)?.url || null,
            petFlip: Boolean(petSpriteForLevel(me?.featured_collectible, me?.featured_pet_xp, petSprites, petSpriteLevels, myStone)?.flip),
            gold: Number(me?.gold || 0),
        },
        players,
        // All nine are standing fixtures (no funded unlocks); gated ones are appended per viewer, and the whole
        // street is then RE-SPACED to fit however many that is.
        // The WELL gets a slot in the layout rather than a hardcoded x. It used to sit at a fixed left:20%,
        // which is exactly where spaceOut puts the third building — so the fountain was drawn on top of The
        // Forge, and its badge collided with the Forge's label. Laying it out WITH the buildings means it can
        // never overlap one no matter how many are visible (the owner sees two more than everyone else).
        ...(() => {
            const visible = [...TOWN_BUILDINGS, ...GATED_BUILDINGS.filter((b) => b.gate !== "owner" || isOwner(buyerId))];
            const mid = Math.ceil(visible.length / 2);
            const laid = spaceOut([...visible.slice(0, mid), { id: "__well" }, ...visible.slice(mid)]);
            return {
                buildings: laid.filter((b) => b.id !== "__well"),
                wellX: laid.find((b) => b.id === "__well")?.x ?? 20,
            };
        })(),
        art,
        projects,
        bonuses: { xpPct: bonuses.xpPct || 0, goldPct: bonuses.goldPct || 0, diceGoldPct: bonuses.diceGoldPct || 0, raidGoldPct: bonuses.raidGoldPct || 0, farmGrowPct: bonuses.farmGrowPct || 0, farmYieldPct: bonuses.farmYieldPct || 0 },
        well,
        event,
        raidRecap,
        merchant: merchantWares,
        store: storeStatus(),
        quests,
        // ── WHAT IS ACTUALLY WAITING FOR YOU ──────────────────────────────────────────────────────────────
        // One shape, read by two places: the Town pill in the nav (so you know there's something here without
        // opening it) and the buildings themselves (so once you're inside, the badge points at the door it
        // belongs to). Computed here rather than in the client, because the nav needs it WITHOUT loading the
        // whole town — a lone number on a pill should not cost a full town render.
        todo: (() => {
            const claimable = (quests?.list || quests || []).filter?.((q) => q?.done && !q?.claimed).length || 0;
            const wish = well && !well.claimedToday ? 1 : 0;
            // No row yet means they have never drunk, so the pint IS waiting.
            const pint = !buyerId ? 0 : (pintReady === null || pintReady?.ready) ? 1 : 0;
            const fight = event && event.status === "active" ? 1 : 0;
            return {
                quests: claimable,
                well: wish,
                tavern: pint,
                event: fight,
                total: claimable + wish + pint + fight,
                // Per-building so the client never has to re-derive which door a number belongs to.
                byBuilding: { tavern: pint, well: wish, quests: claimable, plaza: fight },
            };
        })(),
        eventsLive,
        onlineCount: players.length + (buyerId ? 1 : 0),
        inTownCount,
        aroundCount,
        hangout,
        shiny: await getActiveShiny().catch(() => null),
        chatLog,
    };
}

// Owner toggle for the auto opening-events cron (DB setting — no Vercel env needed).
export async function setTownEventsLive(buyerId, on) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    await setSetting("town_events_live", on ? "1" : "0").catch(() => {});
    return { ok: true, eventsLive: Boolean(on) };
}

// Owner toggle for whether GAME announcements also ring the ledger app (see lib/push/broadcast.js). Off by
// default and deliberately not something the game asks for: the owner's member account already carries browser
// push, so leaving this on delivered every raid twice and put game traffic in the surface that carries orders
// and customer messages. Business push is unaffected either way — it never came through broadcastToEveryone.
export async function setOwnerGamePush(buyerId, on) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    await setSetting("push.owner_game", on ? "on" : "off").catch(() => {});
    return { ok: true, ownerGamePush: Boolean(on) };
}

// Buy a loot chest from the Traveling Merchant (owner-gated during the build). Price/stock follow the town's
// Trading Post tier. Guarded gold spend → a chest.
export async function buyMerchantChest(buyerId, tier) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const [bonuses, boughtToday] = await Promise.all([getTownBonuses().catch(() => ({})), merchantBoughtToday(buyerId)]);
    const ware = merchantWaresForTier(bonuses.merchantTier || 0, {}, boughtToday, await equippedPowers(buyerId)).find((w) => w.tier === tier);
    if (!ware) return { ok: false, error: "not_for_sale" };
    if (ware.remaining <= 0) return { ok: false, error: "daily_limit" };
    // A haggling companion knocks its stated percentage off the asking price.
    let haggle = 0;
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        haggle = await getPetSystemPerk(buyerId, "town_haggle");
    } catch { /* no companion, no discount */ }
    const price = Math.max(1, Math.round(ware.price * (1 - Math.min(0.4, haggle / 100))));
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, price]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -price, "merchant_chest", { balanceAfter: paid.gold, meta: { tier } }).catch(() => {});
    await addChests(buyerId, { [tier]: 1 }, { source: "merchant" }).catch(() => {});
    bumpTownQuest(buyerId, "merchant", 1).catch(() => {}); // "Window Shopping" town quest

    return { ok: true, gold: Number(paid.gold), tier, label: ware.label, remaining: ware.remaining - 1 };
}

// The Traveling Merchant's high-roller table: gamble 1,000 gold on a random piece of gear. Mostly low tiers,
// with a rare shot at a Tier-4 (legendary) drop. Owner-gated during the build.
const GAMBLE_COST = 1000;
// Tier 4 is meant to be the story you tell, not a 1-in-20. At 5% a thousand-gold table handed out a
// legendary every twenty rolls, which is roughly one a week for anyone who visits the merchant daily.
const GAMBLE_WEIGHTS = { common: 52, rare: 32, epic: 15, legendary: 1 }; // legendary = a 1% Tier-4 jackpot
const RARITY_TIER = { common: 1, rare: 2, epic: 3, legendary: 4 };
export async function gambleMerchantGear(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, GAMBLE_COST]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -GAMBLE_COST, "merchant_gamble", { balanceAfter: paid.gold }).catch(() => {});
    const total = Object.values(GAMBLE_WEIGHTS).reduce((s, w) => s + w, 0);
    let r = Math.random() * total; let rolled = "common";
    for (const [rar, w] of Object.entries(GAMBLE_WEIGHTS)) { if ((r -= w) < 0) { rolled = rar; break; } }
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((x) => x.item_id));
    const gear = ITEMS.filter((i) => i.slot && !i.charged && RARITY_TIER[i.rarity]); // equippable, non-perk, tiers 1-4
    let pool = gear.filter((i) => i.rarity === rolled && !owned.has(i.id));
    if (!pool.length) pool = gear.filter((i) => !owned.has(i.id)); // owns every piece of that rarity → any un-owned
    if (!pool.length) { // owns literally everything — hand some gold back
        const back = 400;
        const ref = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, back]).catch(() => null);
        await logCoin(buyerId, back, "merchant_gamble_refund", { balanceAfter: ref?.gold }).catch(() => {});
        return { ok: true, dupeAll: true, refund: back, gold: Number(ref?.gold ?? paid.gold) };
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    await grantItem(buyerId, pick.id, "merchant_gamble").catch(() => {});
    checkMerchantBadges(buyerId, { jackpot: pick.rarity === "legendary" }).catch(() => {}); // High Stakes + Merchant Jackpot
    const image = await itemSpriteFor(pick.id).catch(() => null);
    // Full detail so the reveal shows the real gear — stats, signature ability, element & spin-off affinities.
    return {
        ok: true,
        item: {
            id: pick.id, name: pick.name, rarity: pick.rarity, tier: RARITY_TIER[pick.rarity], slot: pick.slot, image,
            stats: pick.stats || {}, reqLevel: pick.reqLevel || 0,
            signature: signatureFor(pick.id) || null,
            elements: describeItemElements(pick.id) || [],
            sea: pick.sea || null, farm: pick.farm || null,
            chargeReward: pick.chargeRewardLabel || null,
        },
        gold: Number(paid.gold),
    };
}

// Contribute gold to a Town Development project (owner-gated during the build). Also ticks the civic quest.
export async function contributeTownProject(buyerId, projectId, amount) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const res = await contributeToProject(buyerId, projectId, amount);
    if (res.ok) { bumpTownQuest(buyerId, "civic", 1).catch(() => {}); checkTownContribBadges(buyerId).catch(() => {}); }
    return res;
}

// Post a chat message that pops as a speech bubble over your avatar for everyone in the plaza (owner-gated
// during the build). Trimmed + length-capped; empties are dropped.
export async function sendTownChat(buyerId, body, channel = "global") {
    if (!buyerId) return { ok: false, error: "not_signed_in" };

    // ── THE PRIVATE ROOMS ARE CHECKED HERE, NOT ONLY WHERE THEY ARE DRAWN ────────────────────────────────
    // A tab that only renders for VIPs is a hidden door, and a hidden door is not a locked one — this
    // endpoint takes a channel name from a POST body. Every write is authorised against what the server says
    // the member has earned, the same list the tab was drawn from.
    const chan = ["global", "vip", "staff"].includes(String(channel)) ? String(channel) : "global";
    // Nobody writes to the noticeboard but the house. postSystemChat inserts directly and never comes
    // through here, so this needs no exception for the Arbiter — it just closes the room to members.
    if (String(channel) === "announce") return { ok: false, error: "read_only" };
    if (chan !== "global") {
        const { standingFor, channelsFor, joinedAt } = await import("@/lib/marketplace/roles.js");
        const { roles } = await standingFor(buyerId);
        if (!channelsFor(buyerId, roles).includes(chan)) return { ok: false, error: "not_in_channel" };
        // ── WRITING IS ARRIVING ──────────────────────────────────────────────────────────────────────────
        // The join row is normally created by the first READ of a room, and the window starts there. Post
        // before you have ever opened the room and the row gets stamped AFTER your own message, so the feed
        // filters it out and you have just talked to a wall — which is exactly what the first person into
        // the staff room did while I was testing it. Speaking is arriving too, and it has to be recorded
        // before the message it is arriving with.
        await joinedAt(buyerId, chan);
    }
    const text = String(body || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return { ok: false, error: "empty" };

    // ── SAYING THE SAME THING OVER AND OVER ──────────────────────────────────────────────────────────────
    // Five identical wolf emoji in a row, then "There's bugs". The daily that once PAID for five chats is
    // long gone (see town-quests.js) and people still do it, because nothing stops them.
    //
    // Checked against the last few messages rather than only the previous one — a straight "no repeats in a
    // row" is beaten by alternating two things, which is the same wall of noise. Saying something again
    // LATER is fine and always was; this only refuses it while it is still on screen.
    const recent = await db.query(
        `SELECT body FROM mkt_town_chat
          WHERE buyer_id = $1 AND channel = $2 AND created_at > NOW() - INTERVAL '5 minutes'
          ORDER BY created_at DESC LIMIT 4`,
        [buyerId, chan]
    ).catch(() => []);
    const norm = (v) => String(v || "").toLowerCase().replace(/[\s\p{P}]+/gu, "");
    const key = norm(text);
    if (key && (recent || []).some((r) => norm(r.body) === key)) {
        return { ok: false, error: "duplicate_chat" };
    }
    // And a ceiling on sheer volume, whatever the words are. Generous enough that a fast conversation never
    // trips it — six in a minute is typing, not talking.
    if ((recent || []).length >= 4) {
        const burst = await db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_town_chat
              WHERE buyer_id = $1 AND channel = $2 AND created_at > NOW() - INTERVAL '1 minute'`,
            [buyerId, chan]
        ).catch(() => null);
        if ((burst?.n || 0) >= 6) return { ok: false, error: "too_fast" };
    }

    await db.query(`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES ($1, $2, $3)`, [buyerId, text, chan]).catch(() => {});
    await trackActivity(buyerId, "town_chat", { channel: chan, length: text.length }).catch(() => {});
    // Chatting pays NOTHING. It used to tick a "send 5 chats" daily, which turned the Den's global feed into
    // five identical wolf emoji from whoever wanted the 80 gold. See the note in town-quests.js.
    return { ok: true };
}

// The shared plaza chat feed as a persistent LOG (newest LAST so the client can append + auto-scroll). Each
// message carries its sender's HERO sprite (avatar_sprite_url) + name + timestamp. Powers both the town chat
// log under the scene AND the Social hub's Global tab — one stream: a message sent from either shows in both.
// How many global-chat messages this member hasn't seen. Excludes their OWN messages — your own chatter is
// never "unread". A member who has never opened the chat gets everything from the last 7 days rather than all
// history, so a new member isn't met with a meaningless pile.
/**
 * How much of each room this member has not seen, keyed by channel.
 *
 * ── ONE QUERY, NOT ONE PER TAB ───────────────────────────────────────────────────────────────────────────
 * Luke: "ensure badges work for each tab, and the global badge on the chat bubble should reflect messages
 * from all unread tabs combined." Six tabs polling their own count would be six round trips every thirty
 * seconds for a number that is one GROUP BY. The private rooms are filtered by the same membership row that
 * carries the seen mark, so a member who is not in a room cannot be given a count for it — the badge cannot
 * leak the existence of a conversation the tab is hiding.
 */
export async function channelUnread(buyerId, channels = ["global", "announce"]) {
    if (!buyerId) return {};
    const rows = await db.query(
        `SELECT c.channel, COUNT(*)::int AS n
           FROM mkt_town_chat c
           LEFT JOIN mkt_channel_member m ON m.buyer_id = $1 AND m.channel = c.channel
          WHERE c.channel = ANY($2)
            AND c.buyer_id <> $1
            AND c.created_at > COALESCE(m.seen_at, NOW() - INTERVAL '7 days')
            AND (m.joined_at IS NULL OR c.created_at >= m.joined_at)
          GROUP BY c.channel`,
        [buyerId, channels],
        // `seen_at` arrives in migration 403. For the minutes between the new code serving and that landing,
        // this query names a column that does not exist — which would show every member a badge counting the
        // whole history of every room. Falling back to the plaza's own mark keeps the numbers sane until the
        // column is there, and it is the same value the migration seeds from anyway.
    ).catch(() => db.query(
        `SELECT c.channel, COUNT(*)::int AS n
           FROM mkt_town_chat c
           JOIN mkt_buyer b ON b.id = $1
          WHERE c.channel = ANY($2) AND c.buyer_id <> $1
            AND c.created_at > COALESCE(b.global_chat_seen_at, NOW() - INTERVAL '7 days')
          GROUP BY c.channel`,
        [buyerId, channels],
    ).catch(() => []));
    const out = {};
    for (const r of rows || []) out[r.channel] = r.n;
    return out;
}

/** Stamp one room as read. */
// ── WHO IS IN THIS ROOM ────────────────────────────────────────────────────────────
// Luke: "in a chat I'd like to see who's in the channel and who's online that's in that channel, on the
// right in a bar, with their avatar sprite, name, and role."
//
// "IN THE CHANNEL" MEANS TWO DIFFERENT THINGS and the query has to respect that:
//
//   THE PRIVATE ROOMS (vip, staff) have an exact membership list already — mkt_channel_member, written by
//   joinedAt the first time somebody opens the room. That IS the roster, so it is used directly.
//
//   THE OPEN ROOMS (global, announce) have no membership: every member of the Den is in them. A list of
//   everybody is not a rail, it is a phone book. So the roster is the people who are actually PRESENT to it
//   — online right now, or having said something here in the last fortnight. That is the question the rail
//   is really being asked: who might answer me.
//
// ONLINE IS THE SAME 90-SECOND WINDOW THE PLAZA USES. One definition of "here" in the whole game; a rail
// that called somebody online while the plaza did not would be two answers to one question.
export async function channelRoster(buyerId, channel = "global") {
    const chan = ["global", "announce", "vip", "staff"].includes(String(channel)) ? String(channel) : "global";
    const gated = chan === "vip" || chan === "staff";

    // AUTHORISED SERVER-SIDE, against the earned list rather than the tab that was asked for — the same rule
    // getGlobalChat applies, because a roster is as much a leak as a transcript. Knowing who is in the staff
    // room is not public information.
    // ── WHO IS IN A PRIVATE ROOM IS COMPUTED, NOT REMEMBERED ─────────────────────────────────────────────
    // This used to read `mkt_channel_member`, which is written the first time somebody OPENS a room — so it
    // listed people who had VISITED rather than people who BELONG, and four members who had cleared the VIP
    // threshold in the shop but never tapped the tab were missing from their own room. `channelMemberIds`
    // answers it from the same facts the door is gated on, so the rail and the gate cannot disagree.
    let members = null;
    if (gated) {
        if (!buyerId) return [];
        const { standingFor, channelsFor, channelMemberIds } = await import("@/lib/marketplace/roles.js");
        const { roles } = await standingFor(buyerId);
        if (!channelsFor(buyerId, roles).includes(chan)) return [];
        members = await channelMemberIds(chan);
        if (!members?.length) return [];
    }

    const sql = gated
        ? `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.role, b.xp,
                  o.seen, s.said
             FROM mkt_buyer b
             LEFT JOIN (SELECT v.buyer_id, MAX(v.last_seen) AS seen FROM mkt_visitor v
                         WHERE v.buyer_id IS NOT NULL AND v.last_seen > NOW() - $2::interval
                         GROUP BY v.buyer_id) o ON o.buyer_id = b.id
             LEFT JOIN (SELECT c.buyer_id, MAX(c.created_at) AS said FROM mkt_town_chat c
                         WHERE c.channel = $1 GROUP BY c.buyer_id) s ON s.buyer_id = b.id
            WHERE b.id = ANY($3::uuid[])
            ORDER BY (o.seen IS NOT NULL) DESC, o.seen DESC NULLS LAST, s.said DESC NULLS LAST,
                     LOWER(COALESCE(b.display_name, b.alias, '')) ASC
            LIMIT 80`
        : `WITH online AS (
                SELECT v.buyer_id, MAX(v.last_seen) AS seen FROM mkt_visitor v
                 WHERE v.buyer_id IS NOT NULL AND v.last_seen > NOW() - $2::interval
                 GROUP BY v.buyer_id),
              spoke AS (
                SELECT c.buyer_id, MAX(c.created_at) AS said FROM mkt_town_chat c
                 WHERE c.channel = $1 AND c.created_at > NOW() - INTERVAL '14 days'
                 GROUP BY c.buyer_id)
           SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.role, b.xp,
                  o.seen, s.said
             FROM mkt_buyer b
             LEFT JOIN online o ON o.buyer_id = b.id
             LEFT JOIN spoke  s ON s.buyer_id = b.id
            WHERE o.buyer_id IS NOT NULL OR s.buyer_id IS NOT NULL
            ORDER BY (o.seen IS NOT NULL) DESC, o.seen DESC NULLS LAST, s.said DESC NULLS LAST
            LIMIT 80`;

    const rows = await db.query(sql, [chan, ONLINE_WINDOW]).catch(() => []);
    return rows.map((r) => ({
        id: r.id,
        name: r.display_name || r.alias || "A member",
        alias: r.alias || null,
        sprite: r.avatar_sprite_url || null,
        flip: Boolean(r.avatar_sprite_flip),
        // ── THE SAME BADGE THE MESSAGES WEAR ─────────────────────────────────────────────
        // chipFor is the one rule for what somebody is called — it validates the stored choice against what
        // the row can actually prove and falls back to the XP rank, which is why the plaza shows OWNER and
        // STAFF beside LEGEND and ALPHA. Called here rather than reimplemented, so a name in the rail and
        // the same name on a message three lines away can never disagree. Returns { name, tone, glow }.
        role: chipFor(r.id, r.role, Number(r.xp) || 0),
        online: r.seen != null,
    }));
}

export async function markChannelSeen(buyerId, channel) {
    if (!buyerId) return;
    await db.query(
        `INSERT INTO mkt_channel_member (buyer_id, channel, seen_at) VALUES ($1, $2, NOW())
              ON CONFLICT (buyer_id, channel) DO UPDATE SET seen_at = NOW()`,
        [buyerId, String(channel || "global")],
    ).catch(() => {});
}

export async function globalChatUnread(buyerId) {
    if (!buyerId) return 0;
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS n
           FROM mkt_town_chat c
           JOIN mkt_buyer b ON b.id = $1
          WHERE c.buyer_id <> $1
            AND c.created_at > COALESCE(b.global_chat_seen_at, NOW() - INTERVAL '7 days')`,
        [buyerId]
    ).catch(() => null);
    return row?.n || 0;
}

// Stamp the chat as read. Called when the member actually looks at the feed.
export async function markGlobalChatSeen(buyerId) {
    if (!buyerId) return;
    await db.query(`UPDATE mkt_buyer SET global_chat_seen_at = NOW() WHERE id = $1`, [buyerId]).catch(() => {});
}

export async function getGlobalChat(buyerId = null, limit = 40, channel = "global") {
    const n = Math.max(1, Math.min(100, Number(limit) || 40));
    const chan = ["global", "announce", "vip", "staff"].includes(String(channel)) ? String(channel) : "global";

    // ── A PRIVATE ROOM IS AUTHORISED AND WINDOWED ────────────────────────────────────────────────────────
    // Two separate rules, and they are not the same rule. AUTHORISED: you are in the room or you get nothing,
    // checked server-side against the earned list rather than against whichever tab the client asked for.
    // WINDOWED: you see what was said after you arrived — Luke's "once you join that chat you are only able
    // to see messages from after your join date" — so a new VIP opens a door rather than being handed a
    // transcript of a conversation they were not part of.
    let since = null;
    if (chan !== "global" && chan !== "announce") {
        if (!buyerId) return [];
        const { standingFor, channelsFor, joinedAt } = await import("@/lib/marketplace/roles.js");
        const { roles } = await standingFor(buyerId);
        if (!channelsFor(buyerId, roles).includes(chan)) return [];
        since = await joinedAt(buyerId, chan);
    }
    // The QUERY is identical for everyone — buyerId only decides the `mine` flag, which is computed in JS below.
    // So the join runs once for the whole plaza instead of once per viewer per poll. This was the last live
    // piece of the Town poll still doing per-viewer database work for a shared answer.
    // ── THE GLOBAL FEED STAYS SHARED; THE PRIVATE ONES CANNOT BE ────────────────────────────────────────
    // The plaza query is deliberately cached for the whole room — one join per poll for everybody. A private
    // room's answer depends on WHO IS ASKING (their join date), so caching it under a shared key would serve
    // one member's window to the next. Global keeps the shared read; vip and staff take their own.
    const sql = `SELECT c.id, c.body, c.created_at, c.buyer_id, c.kind, c.channel,
                b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.role, b.xp
           FROM mkt_town_chat c
           JOIN mkt_buyer b ON b.id = c.buyer_id
          WHERE c.channel = $2 AND ($3::timestamptz IS NULL OR c.created_at >= $3)
          ORDER BY c.created_at DESC
          LIMIT $1`;
    // ── AND IT SURVIVES ITS OWN DEPLOY ───────────────────────────────────────────────────────────────────
    // `c.channel` arrives in migration 402, and for the minutes between the new code serving and that
    // migration landing the query above is a reference to a column that does not exist — which the .catch
    // turns into an EMPTY PLAZA for everybody. A chat that silently empties itself is the worst possible
    // failure here, so the global feed falls back to the channel-less query it used yesterday. The private
    // rooms have no fallback and need none: before the migration there is nothing in them to miss.
    const legacy = `SELECT c.id, c.body, c.created_at, c.buyer_id, c.kind,
                b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, NULL AS role, b.xp
           FROM mkt_town_chat c
           JOIN mkt_buyer b ON b.id = c.buyer_id
          ORDER BY c.created_at DESC
          LIMIT $1`;
    const readGlobal = async () => {
        const r = await db.query(sql, [n, chan, null]).catch(() => null);
        if (r) return r;
        return db.query(legacy, [n]).catch(() => []);
    };
    const rows = (chan === "global" || chan === "announce")
        ? await shared(`town:chat:${chan}:${n}`, TTL.LIVE, readGlobal)
        : await db.query(sql, [n, chan, since]).catch(() => []);
    // ── MUTED MILESTONES ARE FILTERED PER VIEWER, NOT PER QUERY ──────────────────────────────────────────
    // The query above is deliberately shared across the whole plaza — one join per poll for everybody — so
    // this cannot become a WHERE clause without giving every viewer their own database round trip. One extra
    // row read for the viewer's prefs is the cheaper half of that trade by a wide margin.
    let hideMilestones = false;
    if (buyerId) {
        const { getNotifyPrefs, allowsNotify } = await import("@/lib/marketplace/notify-prefs.js");
        const prefs = await getNotifyPrefs(buyerId).catch(() => ({}));
        hideMilestones = !allowsNotify(prefs, "chat", "milestone");
    }
    return rows.slice().reverse().filter((r) => !(hideMilestones && r.kind === "milestone")).map((r) => ({
        id: String(r.id),
        body: r.body,
        at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        alias: r.alias || null,
        // Fall back to the @handle before the generic "Wolf" — the plaza roster already does this, and skipping it
        // here is why a member with a handle but no display name showed up as "Wolf" in chat.
        name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"),
        sprite: r.avatar_sprite_url || null,
        flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
        mine: buyerId ? String(r.buyer_id) === String(buyerId) : false,
        // ── THE ROLE CHIP ────────────────────────────────────────────────────────────────────────────────
        // Luke: "it shows up next to my name in chat, each role has its own colour." Resolved from the two
        // columns the join already carries rather than with a lookup per message — a forty-message feed
        // would otherwise be forty extra reads. `chipFor` validates the stored choice against what the row
        // can actually prove, so a lapsed VIP's old preference does not keep drawing a VIP chip.
        role: chipFor(r.buyer_id, r.role, r.xp),
        // ── AN ANNOUNCEMENT, FLAGGED AS ONE ──────────────────────────────────────────────────────────────
        // The Arbiter's posts are patch notes, and the chat log renders a message as one span of text — so
        // they arrive as an unbroken wall between the emotes and push the actual conversation off the screen.
        // Flagged here rather than sniffed in the client, and matched on the ALIAS rather than an id in an
        // env var: the Arbiter is a mkt_buyer row, not code, and its row is the thing that identifies it.
        // See notice-format.js for what the client does with this.
        notice: r.alias === NOTICE_ALIAS,
    }));
}

// Flag that you're typing (owner-gated). Upserts a presence row without marking you a "mover", so the "…"
// bubble can show even before you've walked. Recent typing_at → the client renders typing dots.
export async function setTownTyping(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    await db.query(
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, typing_at, updated_at)
         VALUES ($1, 50, 80, 1, NOW(), NOW() - INTERVAL '1 hour')
         ON CONFLICT (buyer_id) DO UPDATE SET typing_at = NOW()`,
        [buyerId]
    ).catch(() => {});
    return { ok: true };
}

// Upsert the mover's position (owner-gated during the build). x/y clamped to the plaza; facing derives from dx.
export async function moveTown(buyerId, { x, y, facing } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const cx = Math.max(1, Math.min(99, Number(x) || 50));
    const cy = Math.max(70, Math.min(88, Number(y) || 80));
    const f = facing === -1 ? -1 : 1;
    await db.query(
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, zone, updated_at) VALUES ($1, $2, $3, $4, 'plaza', NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET x = $2, y = $3, facing = $4, zone = 'plaza', updated_at = NOW()`,
        [buyerId, cx, cy, f]
    ).catch(() => {});
    return { ok: true };
}
