import "server-only";

import { db } from "@/lib/db";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── THE WOLF DEN TOWN ─────────────────────────────────────────────────────────────────────────────────────
// A persistent social overworld: your hero sprite walks a plaza and you see other players (as their real hero
// sprites) with a live status of what they're doing. Owner-gated during the build, but populated with REAL
// recently-active members so it never feels empty — they render as ambient avatars (idle-wandering client-side)
// until the town ships and they can walk it themselves. Positions of real movers live in mkt_town_presence.

// Buildings ring the square; tapping one fast-travels into that system (the menu still works for speed).
export const TOWN_BUILDINGS = [
    { id: "boss", emoji: "⚔️", label: "Boss Arena", href: "/marketplace/boss", x: 18, y: 30 },
    { id: "forge", emoji: "⚒️", label: "The Forge", href: "/marketplace/blacksmith", x: 40, y: 24 },
    { id: "docks", emoji: "⛵", label: "The Docks", href: "/marketplace/sailing", x: 62, y: 24 },
    { id: "farm", emoji: "🌾", label: "The Farm", href: "/marketplace/farm", x: 84, y: 30 },
    { id: "shop", emoji: "🛒", label: "General Store", href: "/marketplace/store", x: 50, y: 46 },
];

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
// Ambient players (not actively walking the town) get a deterministic home slot in the ground band.
function homeSlot(id) {
    return { x: 8 + hash01(id, 1) * 84, y: 60 + hash01(id, 2) * 30 };
}

export async function getTownState(buyerId) {
    const owner = isOwner(buyerId);
    const me = buyerId
        ? await db.queryOne(`SELECT display_name, alias, avatar_sprite_url, avatar_sprite_flip FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null)
        : null;
    const myPos = buyerId ? await db.queryOne(`SELECT x, y, facing FROM mkt_town_presence WHERE buyer_id = $1`, [buyerId]).catch(() => null) : null;

    // Recently-active members (last ~20 min), excluding me, capped.
    const recent = await db.query(
        `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, MAX(v.last_seen) AS seen
           FROM mkt_visitor v JOIN mkt_buyer b ON b.id = v.buyer_id
          WHERE v.buyer_id IS NOT NULL AND v.buyer_id <> $1 AND v.last_seen > NOW() - INTERVAL '20 minutes'
          GROUP BY b.id ORDER BY seen DESC LIMIT 40`,
        [buyerId || "00000000-0000-0000-0000-000000000000"]
    ).catch(() => []);

    const ids = recent.map((r) => r.id);
    // Latest activity per recent player (for the status bubble) + any who are actually walking the town now.
    const [acts, movers] = await Promise.all([
        ids.length
            ? db.query(
                `SELECT DISTINCT ON (buyer_id) buyer_id, event, path FROM mkt_activity_event
                  WHERE buyer_id = ANY($1) AND created_at > NOW() - INTERVAL '30 minutes'
                  ORDER BY buyer_id, created_at DESC`,
                [ids]
            ).catch(() => [])
            : Promise.resolve([]),
        ids.length
            ? db.query(`SELECT buyer_id, x, y, facing FROM mkt_town_presence WHERE buyer_id = ANY($1) AND updated_at > NOW() - INTERVAL '30 seconds'`, [ids]).catch(() => [])
            : Promise.resolve([]),
    ]);
    const actBy = Object.fromEntries(acts.map((a) => [a.buyer_id, a]));
    const moverBy = Object.fromEntries(movers.map((m) => [m.buyer_id, m]));

    const players = recent.map((r) => {
        const a = actBy[r.id];
        const mv = moverBy[r.id];
        const slot = homeSlot(r.id);
        return {
            id: r.id,
            name: r.display_name || (r.alias ? `@${r.alias}` : "Wolf"),
            alias: r.alias || null,
            sprite: r.avatar_sprite_url || null,
            flip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
            status: statusFor(a?.event, a?.path),
            walking: Boolean(mv),                       // true = actually in the town, use real x/y
            x: mv ? mv.x : slot.x,
            y: mv ? mv.y : slot.y,
            facing: mv ? mv.facing : 1,
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
            x: myPos?.x ?? 50, y: myPos?.y ?? 76, facing: myPos?.facing ?? 1,
        },
        players,
        buildings: TOWN_BUILDINGS,
        onlineCount: players.length + (buyerId ? 1 : 0),
    };
}

// Upsert the mover's position (owner-gated during the build). x/y clamped to the plaza; facing derives from dx.
export async function moveTown(buyerId, { x, y, facing } = {}) {
    if (!isOwner(buyerId)) return { ok: false, error: "forbidden" };
    const cx = Math.max(2, Math.min(98, Number(x) || 50));
    const cy = Math.max(52, Math.min(94, Number(y) || 76));
    const f = facing === -1 ? -1 : 1;
    await db.query(
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, updated_at) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET x = $2, y = $3, facing = $4, updated_at = NOW()`,
        [buyerId, cx, cy, f]
    ).catch(() => {});
    return { ok: true };
}
