import "server-only";

import { db } from "@/lib/db";
import { itemById } from "@/lib/marketplace/items.js";

// Admin rare-item economy off the mkt_user_item ledger: how many RARE-or-better gear pieces enter the game,
// by source (acquired_via) and by rarity, over a window. Rarity isn't stored on the row, so we resolve it
// from the item catalog in JS. Read-only. Sibling of coin-economy.js / xp-economy.js.

const VIA_LABEL = {
    chest: "🧰 Loot chest", level: "⬆️ Level unlock", xp_shop: "🛒 Gear shop", boss_reward: "🐉 Boss reward",
    boss_drop: "🐉 Boss drop", wheel_bonus: "🎡 Wheel bonus", daily_deal: "🔥 Daily deal", loot_pig: "🐷 Loot pig",
    raid: "🏴‍☠️ Sea raid", raid_defense: "🛡️ Raid defense", trade: "🤝 Trade", admin: "⚙️ Admin grant", forge: "⚒️ Forge",
};
const viaLabel = (v) => VIA_LABEL[v] || String(v || "other").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Rarities counted as "rare" (common is excluded). Order drives display.
const RARE_TIERS = ["rare", "epic", "legendary", "mythic", "ascendant", "eternal"];
const RANK = Object.fromEntries(RARE_TIERS.map((r, i) => [r, i]));

export async function getRareItemEconomy({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(365, Number(days) || 30));
    const win = `NOW() - make_interval(days => $1::int)`;
    const [rows, totalRow] = await Promise.all([
        // Every gear piece acquired in the window, by source + item (rarity resolved below).
        db.query(
            `SELECT acquired_via, item_id, COUNT(*)::int AS n
               FROM mkt_user_item WHERE acquired_at >= ${win}
              GROUP BY acquired_via, item_id`,
            [d]
        ).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS all_items FROM mkt_user_item WHERE acquired_at >= ${win}`, [d]).catch(() => null),
    ]);

    const bySourceMap = new Map(); // via -> { via, label, count, byRarity }
    const byRarity = Object.fromEntries(RARE_TIERS.map((r) => [r, 0]));
    const itemMap = new Map(); // id -> { id, name, rarity, count }
    let totalRare = 0;

    for (const r of rows || []) {
        const def = itemById(r.item_id);
        const rarity = def?.rarity;
        if (!rarity || !(rarity in RANK)) continue; // skip commons / unknown
        const n = Number(r.n) || 0;
        totalRare += n;
        byRarity[rarity] += n;
        const via = r.acquired_via || "other";
        if (!bySourceMap.has(via)) bySourceMap.set(via, { via, label: viaLabel(via), count: 0, byRarity: Object.fromEntries(RARE_TIERS.map((x) => [x, 0])) });
        const s = bySourceMap.get(via);
        s.count += n; s.byRarity[rarity] += n;
        const it = itemMap.get(r.item_id) || { id: r.item_id, name: def?.name || r.item_id, rarity, count: 0 };
        it.count += n; itemMap.set(r.item_id, it);
    }

    const bySource = [...bySourceMap.values()].sort((a, z) => z.count - a.count);
    const rarityDist = RARE_TIERS.map((rarity) => ({ rarity, count: byRarity[rarity] })).filter((x) => x.count > 0);
    const topItems = [...itemMap.values()]
        .sort((a, z) => z.count - a.count || (RANK[z.rarity] - RANK[a.rarity]))
        .slice(0, 20);

    return {
        days: d,
        totalItems: Number(totalRow?.all_items) || 0, // ALL gear acquired (incl. common) in the window
        totalRare,                                     // rare-or-better only
        byRarity: rarityDist,                          // [{ rarity, count }]
        bySource,                                      // [{ via, label, count, byRarity }]
        topItems,                                      // [{ id, name, rarity, count }]
    };
}
