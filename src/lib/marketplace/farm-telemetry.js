import "server-only";

import { db } from "@/lib/db";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { petLevelInfo } from "@/lib/marketplace/pet-level.js";

// Admin farm telemetry — brought to parity with the Sailing insights screen. Two headline outputs:
//   • adoption : per-feature "% of members who've used it" gauges (pets are pack-wide; crops/decorations/ratings
//                are owner-gated today so they read thin until the farm opens up — the structure fills in then).
//   • members  : one drill-in row per member carrying their whole farm/pet footprint (pets, crops, decorations,
//                ratings) so the screen can expand any member and read their usage in plain English.
// The legacy summary / pets / farm / flags fields are kept intact so the old screen still renders.
// (mkt_pet_level.buyer_id is TEXT — everything is keyed by the id as a STRING so uuid ↔ text ids line up.)

const num = (v) => Number(v) || 0;
const iso = (d) => (d ? new Date(d).toISOString() : null);
const mapBy = (rows, key = "buyer_id") => new Map((rows || []).map((r) => [String(r[key]), r]));
const sumAgg = (rows, k) => (rows || []).reduce((s, r) => s + num(r[k]), 0);

export async function getFarmTelemetry() {
    const [
        memberRow, buyers, petRows, plotAgg, seedAgg, decoOwnedAgg, decoPlacedAgg,
        customAgg, ratingGiven, ratingRecv, visitGiven, visitRecv, cropActivity,
    ] = await Promise.all([
        db.queryOne(
            `SELECT COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE featured_collectible IS NOT NULL)::int AS with_pet,
                    COUNT(*) FILTER (WHERE COALESCE(farm_fertilizer,0) > 0)::int AS fert,
                    COUNT(*) FILTER (WHERE farm_upgrades IS NOT NULL AND farm_upgrades::text <> '{}')::int AS upgraded
               FROM mkt_buyer`
        ).catch(() => null),
        // Every member + their on-row farm/pet signals. We filter to those with a real footprint below.
        db.query(
            `SELECT id, COALESCE(NULLIF(display_name, ''), alias, 'Member') AS name, alias,
                    featured_collectible, COALESCE(farm_fertilizer,0) AS fert,
                    COALESCE(farm_upgrades,'{}'::jsonb) AS farm_upgrades, last_seen_at, COALESCE(xp,0) AS xp
               FROM mkt_buyer`
        ).catch(() => []),
        // Pet leveling rows — buyer_id is TEXT here. Levels are computed in JS (needs the pet's rarity).
        db.query(`SELECT buyer_id, pet_id, xp FROM mkt_pet_level`).catch(() => []),
        // Currently-planted plots per member (plots are deleted on harvest, so this is "growing now", not lifetime).
        db.query(`SELECT buyer_id, COUNT(*)::int AS planted, COUNT(*) FILTER (WHERE ready_at <= NOW())::int AS ready FROM mkt_farm_plot GROUP BY buyer_id`).catch(() => []),
        db.query(`SELECT buyer_id, COALESCE(SUM(count),0)::int AS seeds FROM mkt_farm_seed GROUP BY buyer_id`).catch(() => []),
        db.query(`SELECT buyer_id, COUNT(*)::int AS kinds, COALESCE(SUM(qty),0)::int AS owned FROM mkt_deco_owned GROUP BY buyer_id`).catch(() => []),
        db.query(`SELECT buyer_id, COUNT(*)::int AS placed FROM mkt_deco_placement GROUP BY buyer_id`).catch(() => []),
        db.query(`SELECT buyer_id, COUNT(*)::int AS customs FROM mkt_custom_deco WHERE status = 'final' GROUP BY buyer_id`).catch(() => []),
        db.query(`SELECT rater_id AS buyer_id, COUNT(*)::int AS given FROM mkt_farm_rating GROUP BY rater_id`).catch(() => []),
        db.query(`SELECT owner_id AS buyer_id, COUNT(*)::int AS received FROM mkt_farm_rating GROUP BY owner_id`).catch(() => []),
        // Petting / feeding a FRIEND'S pet lands a mkt_pet_visit row (petter → owner). Petting your own doesn't.
        db.query(`SELECT petter_id AS buyer_id, COUNT(*)::int AS given, COALESCE(SUM(xp),0)::int AS xp FROM mkt_pet_visit GROUP BY petter_id`).catch(() => []),
        db.query(`SELECT owner_id AS buyer_id, COUNT(*)::int AS received FROM mkt_pet_visit GROUP BY owner_id`).catch(() => []),
        // Lifetime plant/harvest counts survive plot deletion via the activity log (plant_seed / harvest_crop).
        db.query(
            `SELECT buyer_id, COUNT(*) FILTER (WHERE event = 'plant_seed')::int AS planted,
                    COUNT(*) FILTER (WHERE event = 'harvest_crop')::int AS harvested
               FROM mkt_activity_event
              WHERE buyer_id IS NOT NULL AND event IN ('plant_seed','harvest_crop')
              GROUP BY buyer_id`
        ).catch(() => []),
    ]);

    const membersN = num(memberRow?.n);
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const buyerById = new Map((buyers || []).map((b) => [String(b.id), b]));
    const nameOf = (id) => { const b = buyerById.get(String(id)); return b ? (b.name || b.alias || "Member") : "Member"; };

    // ── Pet leveling: compute each pet's level from its XP + rarity, then aggregate per member ──
    const levelDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let maxed = 0;
    let totalPetXp = 0;
    const petByMember = new Map();
    for (const r of petRows || []) {
        const def = collectibleById(r.pet_id);
        const info = petLevelInfo(num(r.xp), def?.rarity || "common");
        const lvl = Math.max(1, Math.min(5, info.level || 1));
        levelDist[lvl] = (levelDist[lvl] || 0) + 1;
        if (info.maxed || lvl >= 5) maxed += 1;
        totalPetXp += num(r.xp);
        const id = String(r.buyer_id);
        const cur = petByMember.get(id) || { pets: 0, totalXp: 0, maxLevel: 0 };
        cur.pets += 1;
        cur.totalXp += num(r.xp);
        cur.maxLevel = Math.max(cur.maxLevel, lvl);
        petByMember.set(id, cur);
    }
    const topLevelers = [...petByMember.entries()]
        .map(([id, v]) => ({ name: nameOf(id), pets: v.pets, totalXp: v.totalXp, maxLevel: v.maxLevel }))
        .sort((a, b) => b.maxLevel - a.maxLevel || b.totalXp - a.totalXp)
        .slice(0, 8);

    // ── Index the per-member aggregates for O(1) merge ──
    const plotBy = mapBy(plotAgg);
    const seedBy = mapBy(seedAgg);
    const ownedBy = mapBy(decoOwnedAgg);
    const placedBy = mapBy(decoPlacedAgg);
    const customBy = mapBy(customAgg);
    const rateGivenBy = new Map((ratingGiven || []).map((r) => [String(r.buyer_id), num(r.given)]));
    const rateRecvBy = new Map((ratingRecv || []).map((r) => [String(r.buyer_id), num(r.received)]));
    const visitGivenBy = new Map((visitGiven || []).map((r) => [String(r.buyer_id), { n: num(r.given), xp: num(r.xp) }]));
    const visitRecvBy = new Map((visitRecv || []).map((r) => [String(r.buyer_id), num(r.received)]));
    const cropActBy = mapBy(cropActivity);

    // ── Per-member drill-in rows (only members with a real farm/pet footprint) ──
    const now = Date.now();
    const daysSince = (isoStr) => (isoStr ? (now - new Date(isoStr).getTime()) / 86400000 : Infinity);
    const members = [];
    for (const b of buyers || []) {
        const id = String(b.id);
        const pet = petByMember.get(id);
        const plot = plotBy.get(id);
        const seed = seedBy.get(id);
        const owned = ownedBy.get(id);
        const placed = placedBy.get(id);
        const custom = customBy.get(id);
        const rateGiven = rateGivenBy.get(id) || 0;
        const rateRecv = rateRecvBy.get(id) || 0;
        const visited = visitGivenBy.get(id);
        const visitRec = visitRecvBy.get(id) || 0;
        const crop = cropActBy.get(id);
        const up = b.farm_upgrades && typeof b.farm_upgrades === "object" ? b.farm_upgrades : {};
        const upgradeLevels = Object.values(up).reduce((s, v) => s + num(v), 0);
        const fert = num(b.fert);
        const equipped = Boolean(b.featured_collectible);
        const petsOwned = num(pet?.pets);
        const maxLevel = num(pet?.maxLevel);
        const plantedNow = num(plot?.planted);
        const plantedEver = Math.max(num(crop?.planted), plantedNow);
        const harvestedEver = num(crop?.harvested);

        const hasSignal = equipped || petsOwned > 0 || fert > 0 || upgradeLevels > 0 ||
            plantedNow > 0 || num(seed?.seeds) > 0 || num(owned?.kinds) > 0 || num(placed?.placed) > 0 ||
            num(custom?.customs) > 0 || rateGiven > 0 || rateRecv > 0 || (visited?.n || 0) > 0 || visitRec > 0 ||
            plantedEver > 0 || harvestedEver > 0;
        if (!hasSignal) continue;

        const lastActive = iso(b.last_seen_at);
        const idle = daysSince(lastActive);
        const status = idle < 2 ? "active" : idle < 7 ? "idle" : "dormant";
        members.push({
            id,
            name: b.name || b.alias || "Member",
            alias: b.alias || null,
            lastActive,
            daysIdle: Number.isFinite(idle) ? Math.floor(idle) : null,
            status,
            pets: {
                owned: petsOwned, maxLevel, totalXp: num(pet?.totalXp),
                equipped, leveledTo2: maxLevel >= 2,
                fedOrPetted: visited?.n || 0, petXpGiven: visited?.xp || 0, lovedBack: visitRec,
            },
            crops: {
                plantedNow, readyNow: num(plot?.ready),
                plantedEver, harvestedEver, seedsHeld: num(seed?.seeds),
                fertilizer: fert, upgradeLevels,
            },
            deco: { ownedKinds: num(owned?.kinds), ownedQty: num(owned?.owned), placed: num(placed?.placed), customs: num(custom?.customs) },
            ratings: { given: rateGiven, received: rateRecv },
        });
    }
    const statusRank = (s) => (s === "active" ? 2 : s === "idle" ? 1 : 0);
    members.sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.pets.owned - a.pets.owned || b.pets.totalXp - a.pets.totalXp);

    // ── Feature-adoption gauges — % of ALL members who've used each measurable feature ──
    const countMembers = (fn) => members.filter(fn).length;
    const adoption = [
        { key: "equip_pet", label: "Equipped a pet", adopted: countMembers((m) => m.pets.equipped) },
        { key: "level_pet", label: "Leveling a pet", adopted: countMembers((m) => m.pets.owned > 0) },
        { key: "pet_lv2", label: "Leveled a pet to Lv2+", adopted: countMembers((m) => m.pets.leveledTo2) },
        { key: "pet_friend", label: "Petted / fed a friend's pet", adopted: countMembers((m) => m.pets.fedOrPetted > 0) },
        { key: "plant_crop", label: "Planted a crop", adopted: countMembers((m) => m.crops.plantedEver > 0) },
        { key: "harvest_crop", label: "Harvested a crop", adopted: countMembers((m) => m.crops.harvestedEver > 0) },
        { key: "fertilizer", label: "Holds fertilizer", adopted: countMembers((m) => m.crops.fertilizer > 0) },
        { key: "farm_upgrade", label: "Bought a farm upgrade", adopted: countMembers((m) => m.crops.upgradeLevels > 0) },
        { key: "own_deco", label: "Owns a decoration", adopted: countMembers((m) => m.deco.ownedKinds > 0) },
        { key: "place_deco", label: "Placed a decoration", adopted: countMembers((m) => m.deco.placed > 0) },
        { key: "custom_deco", label: "Made a custom decoration", adopted: countMembers((m) => m.deco.customs > 0) },
        { key: "rate_farm", label: "Rated a farm", adopted: countMembers((m) => m.ratings.given > 0) },
    ].map((a) => ({ ...a, total: membersN, pct: pct(a.adopted, membersN) }));

    // ── Legacy fields (unchanged shape) so the previous screen still renders ──
    const withPet = num(memberRow?.with_pet);
    const petLevelers = petByMember.size;
    const gardeners = (plotAgg || []).length;
    const seedHolders = (seedAgg || []).length;
    const decorators = (decoOwnedAgg || []).length;

    const summary = {
        members: membersN,
        withPet, withPetPct: pct(withPet, membersN),
        petLevelers, petLevelersPct: pct(petLevelers, membersN),
        totalPetXp,
        gardeners, seedHolders, decorators,
        engaged: members.length,
    };

    const petsBlock = {
        total: (petRows || []).length,
        maxed,
        levelDist: [1, 2, 3, 4, 5].map((l) => ({ level: l, n: levelDist[l] || 0 })),
        topLevelers,
    };

    const farm = {
        gardeners,
        cropsPlanted: sumAgg(plotAgg, "planted"),
        cropsReady: sumAgg(plotAgg, "ready"),
        seedsHeld: sumAgg(seedAgg, "seeds"),
        fertHolders: num(memberRow?.fert),
        upgraders: num(memberRow?.upgraded),
        decoOwners: decorators,
        decoOwned: sumAgg(decoOwnedAgg, "owned"),
        decoPlaced: sumAgg(decoPlacedAgg, "placed"),
        ratings: sumAgg(ratingRecv, "received"),
        ratedFarms: (ratingRecv || []).length,
        raters: (ratingGiven || []).length,
        petVisits: sumAgg(visitGiven, "given"),
        plantedEver: countMembers((m) => m.crops.plantedEver > 0),
        harvestedEver: countMembers((m) => m.crops.harvestedEver > 0),
        customDecos: sumAgg(customAgg, "customs"),
    };

    const flags = [];
    flags.push({ sev: withPet >= membersN * 0.5 ? "good" : "warn", text: `${pct(withPet, membersN)}% of the pack equips a pet (${withPet}/${membersN}).` });
    flags.push({ sev: "info", text: `${petLevelers} members are leveling pets — ${petsBlock.total} pets, ${totalPetXp.toLocaleString()} XP earned${maxed ? `, ${maxed} at max level` : ""}.` });
    const petFriends = countMembers((m) => m.pets.fedOrPetted > 0);
    if (petFriends > 0) flags.push({ sev: "good", text: `${petFriends} members have petted or fed a friend's pet — the social loop is live.` });
    if (farm.decoOwners === 0) flags.push({ sev: "info", text: `Decorations haven't been claimed yet — seed the shop / spin drops to kick it off.` });
    flags.push({ sev: "info", text: `Farm (crops, decorations, ratings) is owner-only right now, so those bars stay thin until it opens pack-wide. Pets are already pack-wide.` });

    return { summary, pets: petsBlock, farm, flags, adoption, members };
}
