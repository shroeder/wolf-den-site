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
import { bumpTownQuest, getTownQuests } from "@/lib/marketplace/town-quests.js";
import { townEventsLive } from "@/lib/marketplace/town-events.js";
import { getTownProjects, getTownBonuses, contributeToProject, wellClaimedToday } from "@/lib/marketplace/town-projects.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { describeItemElements } from "@/lib/marketplace/item-element.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { itemSpriteFor } from "@/lib/marketplace/item-sprites.js";
import { checkTownContribBadges, checkMerchantBadges } from "@/lib/marketplace/town-badges.js";
import { getActiveShiny } from "@/lib/marketplace/town-shiny.js";
import { setSetting } from "@/lib/settings.js";

// The Traveling Merchant's wares — loot chests sold for gold (a gold SINK), always at a DISCOUNT off their
// "list" price. Stock + the discount improve as the community levels up the Trading Post (merchantTier): rarer
// chests unlock, prices drop further. Daily caps keep it a treat: one of each chest a day (the humble wooden
// chest, three) so it's a habit, not a gold-dump.
const MERCHANT_BASE_DISCOUNT = 0.05; // the merchant always undercuts the list price by at least this much
const MERCHANT_STOCK = [
    { tier: "wooden", price: 500, minTier: 0, capPerDay: 3 },
    { tier: "iron", price: 2000, minTier: 0, capPerDay: 1 },
    { tier: "gold", price: 6000, minTier: 0, capPerDay: 1 },
    // The Trading Post unlocks ONE tier above Gold — a Mythic chest (at merchant tier 3). Nothing higher: the
    // Ascendant+ chests stay exclusive to real gameplay (boss/sailing/forge), not something you can just buy.
    { tier: "mythic", price: 16000, minTier: 3, capPerDay: 1 },
];
function merchantWaresForTier(tier = 0, chestArt = {}, boughtToday = {}) {
    const disc = Math.min(0.45, MERCHANT_BASE_DISCOUNT + tier * 0.03); // deeper discount as the Trading Post levels
    return MERCHANT_STOCK.filter((w) => tier >= w.minTier).map((w) => {
        const bought = boughtToday[w.tier] || 0;
        return {
            tier: w.tier, price: Math.round(w.price * (1 - disc)), orig: w.price, discountPct: Math.round(disc * 100),
            label: CHEST_TIERS[w.tier]?.label || w.tier, emoji: CHEST_TIERS[w.tier]?.emoji || "📦",
            image: chestArt[w.tier] || null,
            capPerDay: w.capPerDay, boughtToday: bought, remaining: Math.max(0, w.capPerDay - bought),
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
];

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
function petSpriteForLevel(collId, petXp, petSprites, petSpriteLevels) {
    if (!collId) return null;
    const lvl = petLevelForXp(petXp || 0, collectibleById(collId)?.rarity) || 1;
    return pickPetSpriteForLevel(petSprites[collId], petSpriteLevels[collId], lvl) || null;
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

export async function getTownState(buyerId) {
    const owner = isOwner(buyerId);
    const heartbeat = await markTownSeen(buyerId); // stamp presence + measure how long they've been here
    const hangout = await hangoutBuffState(buyerId, heartbeat?.inTownSecs || 0);
    const me = buyerId
        ? await db.queryOne(`SELECT display_name, alias, avatar_sprite_url, avatar_sprite_flip, featured_collectible,
                (SELECT xp FROM mkt_pet_level pl WHERE pl.buyer_id = mkt_buyer.id::text AND pl.pet_id = mkt_buyer.featured_collectible) AS featured_pet_xp,
                COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null)
        : null;
    const myPos = buyerId ? await db.queryOne(`SELECT x, y, facing FROM mkt_town_presence WHERE buyer_id = $1`, [buyerId]).catch(() => null) : null;

    // Members who are ONLINE NOW (active within ONLINE_WINDOW), excluding me, capped. Offline members never show.
    const recent = await db.query(
        `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.featured_collectible,
                (SELECT xp FROM mkt_pet_level pl WHERE pl.buyer_id = b.id::text AND pl.pet_id = b.featured_collectible) AS featured_pet_xp,
                MAX(v.last_seen) AS seen
           FROM mkt_visitor v JOIN mkt_buyer b ON b.id = v.buyer_id
          WHERE v.buyer_id IS NOT NULL AND v.buyer_id <> $1 AND v.last_seen > NOW() - $2::interval
          GROUP BY b.id ORDER BY seen DESC LIMIT 40`,
        [buyerId || "00000000-0000-0000-0000-000000000000", ONLINE_WINDOW]
    ).catch(() => []);

    const ids = recent.map((r) => r.id);
    const chatIds = buyerId ? [...ids, buyerId] : ids; // include me so my own bubble persists across polls
    const [art, petSprites, petSpriteLevels, friends, projects, bonuses, event, quests, chestArt, eventsLive, chatLog] = await Promise.all([
        getTownArt(),
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
        buyerId ? listFriends(buyerId).catch(() => []) : Promise.resolve([]),
        getTownProjects().catch(() => []),
        getTownBonuses(Date.now()).catch(() => ({})),
        getActiveTownEvent(buyerId).catch(() => null),
        buyerId ? getTownQuests(buyerId).catch(() => []) : Promise.resolve([]),
        getChestArt().catch(() => ({})),
        townEventsLive().catch(() => false),
        getGlobalChat(buyerId, 30).catch(() => []),
    ]);
    // The itemised wrap-up for a raid that just ended, for anyone who took part — served from the DB so it
    // survives a refresh and reaches everyone, not just whoever landed the killing blow.
    const raidRecap = event ? null : await lastRaidRecap(buyerId).catch(() => null);
    const boughtToday = await merchantBoughtToday(buyerId);
    const merchantWares = merchantWaresForTier(bonuses.merchantTier || 0, chestArt, boughtToday);
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

    const players = recent.map((r) => {
        const a = actBy[r.id];
        const mv = moverBy[r.id];
        const walking = Boolean(mv?.walking);
        const fighting = fightingSet.has(String(r.id));
        const slot = activitySlot(r.id, a?.event, a?.path);
        const pet = petSpriteForLevel(r.featured_collectible, r.featured_pet_xp, petSprites, petSpriteLevels);
        return {
            id: r.id,
            name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"),
            alias: r.alias || null,
            sprite: r.avatar_sprite_url || null,
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
        you: {
            id: buyerId,
            name: me?.display_name || (me?.alias ? `@${me.alias}` : "You"),
            sprite: me?.avatar_sprite_url || null,
            flip: me?.avatar_sprite_url ? me.avatar_sprite_flip === true : false,
            x: myPos?.x ?? 50, y: myPos?.y ?? 80, facing: myPos?.facing ?? 1,
            chat: (buyerId ? chatBy[buyerId] : null) || null,
            inTown: true,
            pet: petSpriteForLevel(me?.featured_collectible, me?.featured_pet_xp, petSprites, petSpriteLevels)?.url || null,
            petFlip: Boolean(petSpriteForLevel(me?.featured_collectible, me?.featured_pet_xp, petSprites, petSpriteLevels)?.flip),
            gold: Number(me?.gold || 0),
        },
        players,
        buildings: TOWN_BUILDINGS, // all nine are standing fixtures now (no funded unlocks)
        art,
        projects,
        bonuses: { xpPct: bonuses.xpPct || 0, goldPct: bonuses.goldPct || 0, diceGoldPct: bonuses.diceGoldPct || 0, raidGoldPct: bonuses.raidGoldPct || 0, farmGrowPct: bonuses.farmGrowPct || 0, farmYieldPct: bonuses.farmYieldPct || 0 },
        well,
        event,
        raidRecap,
        merchant: merchantWares,
        store: storeStatus(),
        quests,
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

// Buy a loot chest from the Traveling Merchant (owner-gated during the build). Price/stock follow the town's
// Trading Post tier. Guarded gold spend → a chest.
export async function buyMerchantChest(buyerId, tier) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const [bonuses, boughtToday] = await Promise.all([getTownBonuses().catch(() => ({})), merchantBoughtToday(buyerId)]);
    const ware = merchantWaresForTier(bonuses.merchantTier || 0, {}, boughtToday).find((w) => w.tier === tier);
    if (!ware) return { ok: false, error: "not_for_sale" };
    if (ware.remaining <= 0) return { ok: false, error: "daily_limit" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, ware.price]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -ware.price, "merchant_chest", { balanceAfter: paid.gold, meta: { tier } }).catch(() => {});
    await addChests(buyerId, { [tier]: 1 }, { source: "merchant" }).catch(() => {});
    bumpTownQuest(buyerId, "merchant", 1).catch(() => {}); // "Window Shopping" town quest
    return { ok: true, gold: Number(paid.gold), tier, label: ware.label, remaining: ware.remaining - 1 };
}

// The Traveling Merchant's high-roller table: gamble 1,000 gold on a random piece of gear. Mostly low tiers,
// with a rare shot at a Tier-4 (legendary) drop. Owner-gated during the build.
const GAMBLE_COST = 1000;
const GAMBLE_WEIGHTS = { common: 50, rare: 30, epic: 15, legendary: 5 }; // legendary = the rare Tier-4 jackpot
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
export async function sendTownChat(buyerId, body) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const text = String(body || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return { ok: false, error: "empty" };
    await db.query(`INSERT INTO mkt_town_chat (buyer_id, body) VALUES ($1, $2)`, [buyerId, text]).catch(() => {});
    bumpTownQuest(buyerId, "social", 1).catch(() => {});
    return { ok: true };
}

// The shared plaza chat feed as a persistent LOG (newest LAST so the client can append + auto-scroll). Each
// message carries its sender's HERO sprite (avatar_sprite_url) + name + timestamp. Powers both the town chat
// log under the scene AND the Social hub's Global tab — one stream: a message sent from either shows in both.
// How many global-chat messages this member hasn't seen. Excludes their OWN messages — your own chatter is
// never "unread". A member who has never opened the chat gets everything from the last 7 days rather than all
// history, so a new member isn't met with a meaningless pile.
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

export async function getGlobalChat(buyerId = null, limit = 40) {
    const n = Math.max(1, Math.min(100, Number(limit) || 40));
    const rows = await db.query(
        `SELECT c.id, c.body, c.created_at, c.buyer_id,
                b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip
           FROM mkt_town_chat c
           JOIN mkt_buyer b ON b.id = c.buyer_id
          ORDER BY c.created_at DESC
          LIMIT $1`,
        [n]
    ).catch(() => []);
    return rows.reverse().map((r) => ({
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
