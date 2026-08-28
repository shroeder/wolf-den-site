import "server-only";

import { equipMemo } from "@/lib/marketplace/equip-cache.js";

// ── ONE MEMBER'S FORTUNE, FROM ALL FOUR PLACES IT COMES FROM ─────────────────────────────────────────────────
// The pure half of this stat lives in fortune.js; this is the one place that answers "how much has this member
// actually got". It exists because the last version of Fortune asked exactly one source — the pet pack — and
// silently ignored the other three, which is how a stat printed on sixteen items came to be worth nothing.
//
// The four sources are the same four every other total in the Den merges (see combat-stat-sources-four):
//   · GEAR      getEquippedStats — base stats, set bonuses, forge enhancements, socketed gems, and the
//               compendium milestones it folds in internally
//   · PETS      getPetCombatBonus — the pack you own plus the one you carry
//   · BADGES    getBadgePassives — the combat domain, where a badge worth 4+ Might also carries Fortune
//
// ── AND IT IS ASKED ONCE ─────────────────────────────────────────────────────────────────────────────────────
// Fortune is now read on every drop roll in the game, which means a single delve floor could ask three times
// and a chest-opening loop once per chest. Three round trips each would be a fortune of its own on the meter —
// see the note in equip-cache.js, which is the same problem measured on the arena and the same fix. equipMemo
// stores the IN-FLIGHT promise, so callers inside a Promise.all share one answer instead of racing to ask, and
// every path that changes gear already calls forgetEquipment.
export async function fortuneFor(buyerId) {
    if (!buyerId) return 0;
    return equipMemo("fortune", buyerId, async () => {
        const [{ getEquippedStats }, { getPetCombatBonus }, { getBadgePassives }] = await Promise.all([
            import("@/lib/marketplace/inventory.js"),
            import("@/lib/marketplace/pet-combat.js"),
            import("@/lib/marketplace/badges.js"),
        ]);
        const [gear, pet, badges] = await Promise.all([
            getEquippedStats(buyerId).catch(() => ({})),
            getPetCombatBonus(buyerId).catch(() => ({ stats: {} })),
            getBadgePassives(buyerId).catch(() => ({})),
        ]);
        return (Number(gear?.fortune) || 0) + (Number(pet?.stats?.fortune) || 0) + (Number(badges?.fortune) || 0);
    });
}

// ── THE PACK'S FORTUNE, IN ONE PASS ──────────────────────────────────────────────────────────────────────────
// For anything that has to weigh many members at once. Caching cannot fix a fan-out; only batching can — the
// same lesson ascension-powers.js learned when seventy cache keys each missed exactly once.
export async function fortuneForMembers(buyerIds = []) {
    const out = new Map();
    if (!buyerIds.length) return out;
    const [{ getEquippedStatsForMembers }, { getPackPetBonuses }, { getBadgePassivesForMembers }, { compendiumBonus }, { db }] = await Promise.all([
        import("@/lib/marketplace/inventory.js"),
        import("@/lib/marketplace/pet-combat.js"),
        import("@/lib/marketplace/badges.js"),
        import("@/lib/marketplace/compendium.js"),
        import("@/lib/db"),
    ]);
    // ⚠️ The compendium is added BY HAND here and comes for free in the single-member path, because
    // getEquippedStats folds it in and getEquippedStatsForMembers does not. Without this line the two would
    // answer differently for the same member — the exact class of drift that made the boss screen and the
    // boss draw quote different ticket counts for a year.
    const [gear, pets, badges, collected] = await Promise.all([
        getEquippedStatsForMembers(buyerIds).catch(() => new Map()),
        getPackPetBonuses().catch(() => new Map()),
        getBadgePassivesForMembers(buyerIds).catch(() => new Map()),
        db.query(`SELECT buyer_id, COUNT(*)::int AS n FROM mkt_item_collected WHERE buyer_id = ANY($1) GROUP BY buyer_id`, [buyerIds]).catch(() => []),
    ]);
    const compBy = new Map(collected.map((r) => [r.buyer_id, Number(compendiumBonus(r.n)?.fortune) || 0]));
    for (const id of buyerIds) {
        out.set(id, (Number(gear.get(id)?.fortune) || 0)
            + (Number(pets.get(id)?.stats?.fortune) || 0)
            + (Number(badges.get(id)?.fortune) || 0)
            + (compBy.get(id) || 0));
    }
    return out;
}
