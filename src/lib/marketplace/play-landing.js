import "server-only";

import { db } from "@/lib/db";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { ITEMS, isOwnerOnlyItem, itemById } from "@/lib/marketplace/items.js";

// ── WHAT A STRANGER SEES ─────────────────────────────────────────────────────────────────────────────────────
// The logged-out game page was a grid of emoji with feature names under them. It described the software. It
// never mentioned the only thing that actually makes this different from every other idle game: the loot is
// real. Gear in the Den carries charges you redeem at the counter — a booster pack, store credit, a sealed
// box, a grail card of your choice — and every boss the pack fells hands a real prize to a real member.
//
// So this page is built out of TRUE things, pulled live rather than written into copy:
//   · the actual gear, with the actual art, naming the actual reward it carries
//   · the prizes that have actually been handed over, by name
//   · how many people actually play
// Nothing here is a placeholder or a promise. If a claim can't be read out of the database or the item
// catalogue, it isn't on the page.

// The six pieces that best tell the story, cheapest to rarest. Each one exists, each one is obtainable, and
// each one's reward text is read straight off the item rather than retyped here.
const SHOWCASE = [
    "starter_pack_charm",
    "restock_signet",
    "collectors_signet",
    "ascendant_crown",
    "eternal_wolf_crown",
    "eternal_infinity",
];

// Rarity order for the hero parade, so it reads as a treasure spill rather than a random dump.
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };

export async function landingData() {
    const [art, counts, prizes] = await Promise.all([
        itemSpriteMap().catch(() => ({})),
        db.queryOne(`
            SELECT (SELECT COUNT(*) FROM mkt_buyer WHERE COALESCE(xp, 0) > 0)::int AS members,
                   (SELECT COUNT(*) FROM boss_event WHERE defeated_at IS NOT NULL)::int AS bosses,
                   (SELECT COUNT(*) FROM mkt_item_sprite)::int AS gear,
                   (SELECT COUNT(*) FROM mkt_pet_sprite)::int AS pets,
                   (SELECT COUNT(*) FROM mkt_badge_sprite)::int AS badges
        `).catch(() => null),
        db.query(`
            SELECT name, prize_name FROM boss_event
             WHERE defeated_at IS NOT NULL AND prize_name IS NOT NULL
             ORDER BY defeated_at DESC LIMIT 3
        `).catch(() => []),
    ]);

    const perks = SHOWCASE
        .map((id) => {
            const it = itemById(id);
            if (!it || !art[id] || !it.chargeRewardLabel) return null;
            return { id, name: it.name, rarity: it.rarity, reward: it.chargeRewardLabel, sprite: art[id] };
        })
        .filter(Boolean);

    // A spill of real gear behind the headline. ownerOnly pieces belong to features that have not launched —
    // they must never appear anywhere public, and a marketing page is the most public place there is.
    const parade = ITEMS
        .filter((i) => !isOwnerOnlyItem(i) && art[i.id] && (RARITY_RANK[i.rarity] ?? 0) >= 2)
        .sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || String(a.id).localeCompare(String(b.id)))
        .slice(0, 18)
        .map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, sprite: art[i.id] }));

    return {
        perks,
        parade,
        prizes: (prizes || []).map((p) => ({ boss: p.name, prize: p.prize_name })),
        counts: {
            members: counts?.members || 0,
            bosses: counts?.bosses || 0,
            gear: counts?.gear || 0,
            pets: counts?.pets || 0,
            badges: counts?.badges || 0,
        },
    };
}
