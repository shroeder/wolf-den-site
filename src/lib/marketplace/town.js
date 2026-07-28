import "server-only";

import { db } from "@/lib/db";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { listFriends } from "@/lib/marketplace/friends.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { getActiveTownEvent } from "@/lib/marketplace/town-events.js";
import { CHEST_TIERS, addChests } from "@/lib/marketplace/chests.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";
import { storeStatus } from "@/lib/marketplace/store-hours.js";
import { bumpTownQuest, getTownQuests } from "@/lib/marketplace/town-quests.js";
import { townEventsLive } from "@/lib/marketplace/town-events.js";
import { getTownProjects, getTownBonuses, contributeToProject } from "@/lib/marketplace/town-projects.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { setSetting } from "@/lib/settings.js";

// The Traveling Merchant's wares — loot chests sold for gold (a gold SINK). Stock + prices improve as the
// community levels up the Trading Post (Town Development merchantTier): rarer chests unlock, prices drop.
const MERCHANT_STOCK = [
    { tier: "wooden", price: 500, minTier: 0 },
    { tier: "iron", price: 2000, minTier: 0 },
    { tier: "gold", price: 6000, minTier: 0 },
    { tier: "mythic", price: 16000, minTier: 3 },
    { tier: "ascendant", price: 40000, minTier: 5 },
];
function merchantWaresForTier(tier = 0, chestArt = {}) {
    const disc = Math.min(0.2, tier * 0.03); // up to 20% off as the Trading Post levels
    return MERCHANT_STOCK.filter((w) => tier >= w.minTier).map((w) => ({
        tier: w.tier, price: Math.round(w.price * (1 - disc)),
        label: CHEST_TIERS[w.tier]?.label || w.tier, emoji: CHEST_TIERS[w.tier]?.emoji || "📦",
        image: chestArt[w.tier] || null,
    }));
}

// Buildings that only appear once the community funds their unlock project (Town Development). They get their
// own art later; for now they render with the emoji-card fallback.
const UNLOCKABLE_BUILDINGS = [
    { id: "vault", emoji: "🏦", label: "The Vault", href: "/marketplace/credit", x: 16 },
    { id: "festival", emoji: "🎪", label: "Festival Stage", href: "/marketplace/track", x: 82 },
];

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
export const TOWN_BUILDINGS = [
    { id: "tavern", emoji: "🍺", label: "The Tavern", href: "/marketplace/friends", x: 8 },
    { id: "boss", emoji: "⚔️", label: "Boss Arena", href: "/marketplace/boss", x: 24 },
    { id: "forge", emoji: "⚒️", label: "The Forge", href: "/marketplace/blacksmith", x: 40 },
    { id: "shop", emoji: "🛒", label: "General Store", href: "/marketplace/store", x: 56 },
    { id: "docks", emoji: "⛵", label: "The Docks", href: "/marketplace/sailing", x: 74 },
    { id: "farm", emoji: "🌾", label: "The Farm", href: "/marketplace/farm", x: 90 },
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

export async function getTownState(buyerId) {
    const owner = isOwner(buyerId);
    const me = buyerId
        ? await db.queryOne(`SELECT display_name, alias, avatar_sprite_url, avatar_sprite_flip, featured_collectible, COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null)
        : null;
    const myPos = buyerId ? await db.queryOne(`SELECT x, y, facing FROM mkt_town_presence WHERE buyer_id = $1`, [buyerId]).catch(() => null) : null;

    // Members who are ONLINE NOW (active within ONLINE_WINDOW), excluding me, capped. Offline members never show.
    const recent = await db.query(
        `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.featured_collectible, MAX(v.last_seen) AS seen
           FROM mkt_visitor v JOIN mkt_buyer b ON b.id = v.buyer_id
          WHERE v.buyer_id IS NOT NULL AND v.buyer_id <> $1 AND v.last_seen > NOW() - $2::interval
          GROUP BY b.id ORDER BY seen DESC LIMIT 40`,
        [buyerId || "00000000-0000-0000-0000-000000000000", ONLINE_WINDOW]
    ).catch(() => []);

    const ids = recent.map((r) => r.id);
    const chatIds = buyerId ? [...ids, buyerId] : ids; // include me so my own bubble persists across polls
    const [art, petSprites, friends, projects, bonuses, event, quests, chestArt, eventsLive] = await Promise.all([
        getTownArt(),
        getPetSpriteData().catch(() => ({})),
        buyerId ? listFriends(buyerId).catch(() => []) : Promise.resolve([]),
        getTownProjects().catch(() => []),
        getTownBonuses(Date.now()).catch(() => ({})),
        getActiveTownEvent(buyerId).catch(() => null),
        buyerId ? getTownQuests(buyerId).catch(() => []) : Promise.resolve([]),
        getChestArt().catch(() => ({})),
        townEventsLive().catch(() => false),
    ]);
    const merchantWares = merchantWaresForTier(bonuses.merchantTier || 0, chestArt);
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
                        (typing_at  > NOW() - INTERVAL '6 seconds')  AS typing
                   FROM mkt_town_presence
                  WHERE buyer_id = ANY($1) AND (updated_at > NOW() - INTERVAL '30 seconds' OR typing_at > NOW() - INTERVAL '6 seconds')`,
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

    const players = recent.map((r) => {
        const a = actBy[r.id];
        const mv = moverBy[r.id];
        const walking = Boolean(mv?.walking);
        const slot = activitySlot(r.id, a?.event, a?.path);
        const pet = petSprites[r.featured_collectible];
        return {
            id: r.id,
            name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"),
            alias: r.alias || null,
            sprite: r.avatar_sprite_url || null,
            flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
            pet: pet?.url || null,
            petFlip: pet ? pet.flip === true : false,
            friend: friendSet.has(r.id),
            status: statusFor(a?.event, a?.path),
            chat: chatBy[r.id] || null,                 // recent speech-bubble message (shows ~8s)
            typing: Boolean(mv?.typing),
            walking,                                    // true = actually in the town, use real x/y
            x: walking ? mv.x : slot.x,
            y: walking ? mv.y : slot.y,
            facing: walking ? mv.facing : 1,
        };
    });

    return {
        signedIn: Boolean(buyerId),
        owner,
        you: {
            id: buyerId,
            name: me?.display_name || (me?.alias ? `@${me.alias}` : "You"),
            sprite: me?.avatar_sprite_url || null,
            flip: me?.avatar_sprite_url ? me.avatar_sprite_flip === true : false,
            x: myPos?.x ?? 50, y: myPos?.y ?? 80, facing: myPos?.facing ?? 1,
            chat: (buyerId ? chatBy[buyerId] : null) || null,
            pet: petSprites[me?.featured_collectible]?.url || null,
            petFlip: petSprites[me?.featured_collectible] ? petSprites[me.featured_collectible].flip === true : false,
            gold: Number(me?.gold || 0),
        },
        players,
        buildings: [...TOWN_BUILDINGS, ...UNLOCKABLE_BUILDINGS.filter((b) => (bonuses.unlocks || []).includes(b.id))],
        art,
        projects,
        bonuses: { xpPct: bonuses.xpPct || 0, goldPct: bonuses.goldPct || 0, depth: bonuses.depth || 0, tavernLevel: bonuses.tavernLevel || 0, raidTier: bonuses.raidTier || 0, unlocks: bonuses.unlocks || [] },
        event,
        merchant: merchantWares,
        store: storeStatus(),
        quests,
        eventsLive,
        onlineCount: players.length + (buyerId ? 1 : 0),
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
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const bonuses = await getTownBonuses().catch(() => ({}));
    const ware = merchantWaresForTier(bonuses.merchantTier || 0).find((w) => w.tier === tier);
    if (!ware) return { ok: false, error: "not_for_sale" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, ware.price]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -ware.price, "merchant_chest", { balanceAfter: paid.gold, meta: { tier } }).catch(() => {});
    await addChests(buyerId, { [tier]: 1 }, { source: "merchant" }).catch(() => {});
    return { ok: true, gold: Number(paid.gold), tier, label: ware.label };
}

// The Traveling Merchant's high-roller table: gamble 1,000 gold on a random piece of gear. Mostly low tiers,
// with a rare shot at a Tier-4 (legendary) drop. Owner-gated during the build.
const GAMBLE_COST = 1000;
const GAMBLE_WEIGHTS = { common: 50, rare: 30, epic: 15, legendary: 5 }; // legendary = the rare Tier-4 jackpot
const RARITY_TIER = { common: 1, rare: 2, epic: 3, legendary: 4 };
export async function gambleMerchantGear(buyerId) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
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
    return { ok: true, item: { id: pick.id, name: pick.name, rarity: pick.rarity, tier: RARITY_TIER[pick.rarity], slot: pick.slot }, gold: Number(paid.gold) };
}

// Contribute gold to a Town Development project (owner-gated during the build). Also ticks the civic quest.
export async function contributeTownProject(buyerId, projectId, amount) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const res = await contributeToProject(buyerId, projectId, amount);
    if (res.ok) bumpTownQuest(buyerId, "civic", 1).catch(() => {});
    return res;
}

// Post a chat message that pops as a speech bubble over your avatar for everyone in the plaza (owner-gated
// during the build). Trimmed + length-capped; empties are dropped.
export async function sendTownChat(buyerId, body) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const text = String(body || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return { ok: false, error: "empty" };
    await db.query(`INSERT INTO mkt_town_chat (buyer_id, body) VALUES ($1, $2)`, [buyerId, text]).catch(() => {});
    bumpTownQuest(buyerId, "social", 1).catch(() => {});
    return { ok: true };
}

// Flag that you're typing (owner-gated). Upserts a presence row without marking you a "mover", so the "…"
// bubble can show even before you've walked. Recent typing_at → the client renders typing dots.
export async function setTownTyping(buyerId) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
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
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
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
