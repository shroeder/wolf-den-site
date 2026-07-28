import "server-only";

import { db } from "@/lib/db";
import { isOwner } from "@/lib/marketplace/owner.js";

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

export async function getTownState(buyerId) {
    const owner = isOwner(buyerId);
    const me = buyerId
        ? await db.queryOne(`SELECT display_name, alias, avatar_sprite_url, avatar_sprite_flip FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null)
        : null;
    const myPos = buyerId ? await db.queryOne(`SELECT x, y, facing FROM mkt_town_presence WHERE buyer_id = $1`, [buyerId]).catch(() => null) : null;

    // Members who are ONLINE NOW (active within ONLINE_WINDOW), excluding me, capped. Offline members never show.
    const recent = await db.query(
        `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, MAX(v.last_seen) AS seen
           FROM mkt_visitor v JOIN mkt_buyer b ON b.id = v.buyer_id
          WHERE v.buyer_id IS NOT NULL AND v.buyer_id <> $1 AND v.last_seen > NOW() - $2::interval
          GROUP BY b.id ORDER BY seen DESC LIMIT 40`,
        [buyerId || "00000000-0000-0000-0000-000000000000", ONLINE_WINDOW]
    ).catch(() => []);

    const ids = recent.map((r) => r.id);
    const chatIds = buyerId ? [...ids, buyerId] : ids; // include me so my own bubble persists across polls
    const art = await getTownArt();
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
        const slot = homeSlot(r.id);
        return {
            id: r.id,
            name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"),
            alias: r.alias || null,
            sprite: r.avatar_sprite_url || null,
            flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
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
        },
        players,
        buildings: TOWN_BUILDINGS,
        art,
        onlineCount: players.length + (buyerId ? 1 : 0),
    };
}

// Post a chat message that pops as a speech bubble over your avatar for everyone in the plaza (owner-gated
// during the build). Trimmed + length-capped; empties are dropped.
export async function sendTownChat(buyerId, body) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const text = String(body || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return { ok: false, error: "empty" };
    await db.query(`INSERT INTO mkt_town_chat (buyer_id, body) VALUES ($1, $2)`, [buyerId, text]).catch(() => {});
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
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, updated_at) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET x = $2, y = $3, facing = $4, updated_at = NOW()`,
        [buyerId, cx, cy, f]
    ).catch(() => {});
    return { ok: true };
}
