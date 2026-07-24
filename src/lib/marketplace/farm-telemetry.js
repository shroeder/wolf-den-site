import "server-only";

import { db } from "@/lib/db";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { petLevelInfo } from "@/lib/marketplace/pet-level.js";

// Admin farm telemetry: pack-wide PET LEVELING (the one cross-member farm signal today — every member's
// equipped pet levels, not farm-gated) + owner farm activity (gardens, decorations, ratings, petting). The
// farm view itself is still owner-only, so gardens/decor/ratings are thin until it opens pack-wide.
export async function getFarmTelemetry() {
    const [members, petRows, gardeners, plots, deco, ratings, visits, fertUp] = await Promise.all([
        db.queryOne(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE featured_collectible IS NOT NULL)::int AS with_pet FROM mkt_buyer`).catch(() => null),
        // mkt_pet_level.buyer_id is TEXT — compare via b.id::text.
        db.query(`SELECT pl.buyer_id, pl.pet_id, pl.xp, COALESCE(NULLIF(b.display_name, ''), b.alias, 'Member') AS name
                    FROM mkt_pet_level pl JOIN mkt_buyer b ON b.id::text = pl.buyer_id`).catch(() => []),
        db.queryOne(`SELECT (SELECT COUNT(DISTINCT buyer_id) FROM mkt_farm_plot)::int AS plots, (SELECT COUNT(DISTINCT buyer_id) FROM mkt_farm_seed)::int AS seeds`).catch(() => null),
        db.queryOne(`SELECT (SELECT COUNT(*) FROM mkt_farm_plot)::int AS planted,
                            (SELECT COUNT(*) FROM mkt_farm_plot WHERE ready_at <= NOW())::int AS ready,
                            (SELECT COALESCE(SUM(count),0) FROM mkt_farm_seed)::int AS seeds_held`).catch(() => ({ planted: 0, ready: 0, seeds_held: 0 })),
        db.queryOne(`SELECT (SELECT COUNT(DISTINCT buyer_id) FROM mkt_deco_owned)::int AS owners, (SELECT COALESCE(SUM(qty),0) FROM mkt_deco_owned)::int AS owned, (SELECT COUNT(*) FROM mkt_deco_placement)::int AS placed`).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n, COUNT(DISTINCT owner_id)::int AS farms, COUNT(DISTINCT rater_id)::int AS raters FROM mkt_farm_rating`).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_pet_visit`).catch(() => ({ n: 0 })),
        db.queryOne(`SELECT COUNT(*) FILTER (WHERE COALESCE(farm_fertilizer,0) > 0)::int AS fert, COUNT(*) FILTER (WHERE farm_upgrades IS NOT NULL AND farm_upgrades::text <> '{}')::int AS upgraded FROM mkt_buyer`).catch(() => null),
    ]);

    const membersN = members?.n || 0;
    const withPet = members?.with_pet || 0;

    // ── Pet leveling: compute each pet's level from its XP + rarity, then aggregate ──
    const levelDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let maxed = 0;
    let totalPetXp = 0;
    const byMember = new Map();
    for (const r of petRows || []) {
        const def = collectibleById(r.pet_id);
        const info = petLevelInfo(Number(r.xp) || 0, def?.rarity || "common");
        const lvl = Math.max(1, Math.min(5, info.level || 1));
        levelDist[lvl] = (levelDist[lvl] || 0) + 1;
        if (info.maxed || lvl >= 5) maxed += 1;
        totalPetXp += Number(r.xp) || 0;
        const cur = byMember.get(r.buyer_id) || { name: r.name, pets: 0, totalXp: 0, maxLevel: 0 };
        cur.pets += 1;
        cur.totalXp += Number(r.xp) || 0;
        cur.maxLevel = Math.max(cur.maxLevel, lvl);
        byMember.set(r.buyer_id, cur);
    }
    const petLevelers = byMember.size;
    const topLevelers = [...byMember.values()].sort((a, b) => b.maxLevel - a.maxLevel || b.totalXp - a.totalXp).slice(0, 8);

    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

    const summary = {
        members: membersN,
        withPet, withPetPct: pct(withPet, membersN),
        petLevelers, petLevelersPct: pct(petLevelers, membersN),
        totalPetXp,
        gardeners: gardeners?.plots || 0,
        seedHolders: gardeners?.seeds || 0,
        decorators: deco?.owners || 0,
    };

    const petsBlock = {
        total: (petRows || []).length,
        maxed,
        levelDist: [1, 2, 3, 4, 5].map((l) => ({ level: l, n: levelDist[l] || 0 })),
        topLevelers,
    };

    const farm = {
        gardeners: gardeners?.plots || 0,
        cropsPlanted: plots?.planted || 0,
        cropsReady: plots?.ready || 0,
        seedsHeld: plots?.seeds_held || 0,
        fertHolders: fertUp?.fert || 0,
        upgraders: fertUp?.upgraded || 0,
        decoOwners: deco?.owners || 0,
        decoOwned: deco?.owned || 0,
        decoPlaced: deco?.placed || 0,
        ratings: ratings?.n || 0,
        ratedFarms: ratings?.farms || 0,
        raters: ratings?.raters || 0,
        petVisits: visits?.n || 0,
    };

    const flags = [];
    flags.push({ sev: withPet >= membersN * 0.5 ? "good" : "warn", text: `${pct(withPet, membersN)}% of the pack equips a pet (${withPet}/${membersN}).` });
    flags.push({ sev: "info", text: `${petLevelers} members are leveling pets — ${petsBlock.total} pets, ${totalPetXp.toLocaleString()} XP earned${maxed ? `, ${maxed} at max level` : ""}.` });
    if (farm.decoOwners === 0) flags.push({ sev: "info", text: `Decorations just launched — nobody owns one yet. Seed the shop / spin drops to kick it off.` });
    flags.push({ sev: "info", text: `Farm is owner-only right now, so gardens, decorations & ratings are just yours (${farm.cropsPlanted} crops planted). Petting/rating goes pack-wide when the farm opens up.` });

    return { summary, pets: petsBlock, farm, flags };
}
