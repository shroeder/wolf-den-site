import "server-only";

import { db } from "@/lib/db";
import { petsState } from "@/lib/marketplace/pets.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel, getPetLevelSprite } from "@/lib/marketplace/pet-sprite.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { petLevelInfo, petMaxXp, addPetXp, levelUpPet } from "@/lib/marketplace/pet-level.js";
import { getEquippedUtilTotals } from "@/lib/marketplace/item-affix.js";
import { CONSUMABLES, listConsumables, useConsumable as applyConsumable, buyConsumable } from "@/lib/marketplace/consumables.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { ITEMS, randomDropPool } from "@/lib/marketplace/items.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { itemSpriteFor } from "@/lib/marketplace/item-sprites.js";
import { getGarden, farmPetCapBonus, dropSeedFrom } from "@/lib/marketplace/farm-crops.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { farmRatingBits, farmLoveBoard } from "@/lib/marketplace/farm-rating.js";
import { decoState, getPlacements } from "@/lib/marketplace/farm-decorations.js";
import { getStandState } from "@/lib/marketplace/petting-stand.js";
import { farmBonuses } from "@/lib/marketplace/farm-bonus.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { getSetting } from "@/lib/settings.js";
import { powerRoll, hasPower, equippedPowers, claimPowerUse } from "@/lib/marketplace/ascension-powers.js";
import { mint } from "@/lib/marketplace/gold-rate.js";

// Loot-pig crown placement (owner-calibrated via the crown tool). left = flip ? 50+side% : 50-side%.
const CROWN_DEFAULT = { top: 9, side: 8, size: 22 };
export async function getCrownConfig() {
    const raw = await getSetting("loot_pig_crown", null).catch(() => null);
    if (!raw) return CROWN_DEFAULT;
    try { const c = JSON.parse(raw); return { top: Number(c.top ?? CROWN_DEFAULT.top), side: Number(c.side ?? CROWN_DEFAULT.side), size: Number(c.size ?? CROWN_DEFAULT.size) }; } catch { return CROWN_DEFAULT; }
}

// The Farm: a member's owned pets roam a little pasture. You can PET pets — a shared daily budget of 3
// (rechargeable for gold at a doubling cost), spent on your OWN pets (once/day/pet) OR a friend's pets when
// visiting their farm (petting theirs pays you a small thank-you). You can also FEED any pet a treat from your
// own bag — unlimited; feeding a friend's pet grants the feeder a small generosity bonus. (mkt_pet_level.buyer_id
// is TEXT → ::text.)
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date"; // store-local day, matches the rest of the game

// ── WHEN THE PIG COMES ROUND ─────────────────────────────────────────────────────────────────────────────────
// The pig used to be available from midnight, which in practice meant it charged through on the FIRST time you
// opened your farm that day, every day, for everybody. Once you have seen that twice it is not a rampaging
// animal any more, it is a login bonus with hooves — the surprise was spent on the most predictable moment in
// the day.
//
// So each member gets their own arrival TIME, different every day and unknowable in advance: visit before it
// and the field is empty, visit after and he may be waiting. The point is that "is he there today?" stops
// having an answer you can be sure of before you look.
//
// Derived from a hash of (member, date) rather than stored, so there is no column, no cron, no row to go
// stale — and it is stable within the day, so two page loads a minute apart cannot roll different answers and
// make him flicker in and out.
const PIG_FROM = 6;    // earliest arrival, store-local hour
const PIG_UNTIL = 18;  // and the latest, so an evening visit always catches a pig you have not claimed
function pigHourFor(buyerId, ymd) {
    let h = 2166136261;
    for (const ch of `${buyerId}:${ymd}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    // ── AND THEN MIX IT PROPERLY ─────────────────────────────────────────────────────────────────────────
    // FNV alone is not enough here. Consecutive dates differ by one character, and the raw hash walks in
    // step with them: the first cut gave one member 10:01, 13:00, 15:59, 06:58 — exactly three hours later
    // every day, which is a schedule anybody would spot inside a week and the opposite of the point. This is
    // the standard 32-bit avalanche finaliser; after it, one character of input changes half the output bits.
    h ^= h >>> 16; h = Math.imul(h, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    // >>> 0 first: Math.imul returns a SIGNED int, and a negative modulo would put the pig before dawn.
    return PIG_FROM + ((h >>> 0) % ((PIG_UNTIL - PIG_FROM) * 60)) / 60;
}
export const PET_PET_XP = 30; // pet XP the fed pet gains per petting
const PET_PET_GOLD = 12; // gold YOU earn per petting (petting is rewarding, not just chores)
const PET_PET_PLAYER_XP = 5; // player XP you earn per petting
const PET_PETS_PER_DAY = 3; // free daily pettings on your OWN pets (+ Pet Whisperer upgrade + gold recharges)
const PET_OTHERS_PER_DAY = 3; // SEPARATE free daily pettings on OTHER members' pets
// Petting a FRIEND'S pet: a smaller thank-you to the petter (their pet gets the full PET_PET_XP). Shares the
// same 3/day budget as petting your own.
const PET_OTHER_GOLD = 8;
const PET_OTHER_PLAYER_XP = 5;
// The Toll House (ascension power): what a visitor is worth to the farm's owner, and how many visitors a day
// pay. Ten a day is above what any farm currently sees, so it reads as uncapped without being one.
const TOLL_HOUSE_GOLD = 40;
const TOLL_HOUSE_PER_DAY = 10;
// Feeding a FRIEND'S pet (unlimited — it costs one of YOUR treats): a small generosity bonus to the feeder.
// Always worth less than a treat, so it can't be farmed for profit.
const FEED_OTHER_GOLD = 15;
const FEED_OTHER_PLAYER_XP = 8;
const PET_RECHARGE_AMOUNT = 3; // extra pettings granted per paid recharge
const PET_RECHARGE_BASE = 500; // gold cost of the FIRST recharge each day; doubles every recharge (500 → 1000 → 2000 …), resets daily
const rechargeCost = (n) => PET_RECHARGE_BASE * 2 ** n;
// Wild Loot Pig
const PIG_GOLD_MIN = 100, PIG_GOLD_MAX = 250;
const PIG_ITEM_CHANCE = 0.2; // chance the pig drops an item at all
const PIG_RARITY_WEIGHTS = { common: 65, rare: 28, epic: 7 }; // up to 3rd tier, weighted toward the low end
const PIG_PET_CHANCE = 0.03; // rare chance the pig gifts the farm-only Golden Goose pet
const randInt = (n) => Math.floor(Math.random() * n);
const weightedPick = (weights) => {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= w; if (r < 0) return k; }
    return entries[0][0];
};
const treatXp = (id) => {
    const e = CONSUMABLES[id]?.effect;
    return e?.type === "pet_level" ? "level" : e?.amount || 0;
};

// Directory of members to visit, as hero-card data (avatar + level + pet count). Newest-active first; optional
// name/alias search.
// The default was 60 while the Den has 95 members — fine when this only ever answered a search term, and
// silently a third short the moment it became the browsable directory the farm page now renders.
export async function farmDirectory(viewerId, { q = "", limit = 250 } = {}) {
    const term = String(q || "").trim().toLowerCase().replace(/^@/, "");
    const params = [];
    let where = "b.alias IS NOT NULL";
    if (viewerId) { params.push(viewerId); where += ` AND b.id <> $${params.length}`; }
    if (term) { params.push(`%${term}%`); where += ` AND (LOWER(b.alias) LIKE $${params.length} OR LOWER(COALESCE(b.display_name,'')) LIKE $${params.length})`; }
    params.push(Math.min(500, limit));
    // Farm search is about the FARM, not pets: rank by rating quality (tier-weighted likes) then decoration
    // count, so the best-kept farms surface first.
    const rows = await db
        .query(
            `SELECT b.id, b.alias, b.display_name, b.avatar_sprite_url, b.avatar_sprite_flip,
                    b.avatar_url, b.avatar_config, b.avatar_cosmetics, b.equipped_border,
                    COALESCE(d.deco_count, 0) AS deco_count,
                    COALESCE(r.rating_count, 0) AS rating_count,
                    COALESCE(r.rating_score, 0) AS rating_score
               FROM mkt_buyer b
               LEFT JOIN (SELECT buyer_id, COUNT(*)::int AS deco_count FROM mkt_deco_placement GROUP BY buyer_id) d ON d.buyer_id = b.id
               LEFT JOIN (SELECT owner_id, COUNT(*)::int AS rating_count, COALESCE(SUM(tier),0)::int AS rating_score FROM mkt_farm_rating GROUP BY owner_id) r ON r.owner_id = b.id
              WHERE ${where}
              ORDER BY rating_score DESC, deco_count DESC, b.last_seen_at DESC NULLS LAST
              LIMIT $${params.length}`,
            params
        )
        .catch(() => []);
    return rows.map((r) => ({
        id: r.id,
        alias: r.alias,
        name: r.display_name || r.alias || "Member",
        decoCount: Number(r.deco_count) || 0,
        ratingCount: Number(r.rating_count) || 0,
        ratingScore: Number(r.rating_score) || 0,
        spriteUrl: r.avatar_sprite_url || null,
        spriteFlip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
        avatarUrl: avatarImageUrl(r.avatar_config, r.avatar_cosmetics) || r.avatar_url || null,
        border: r.equipped_border && r.equipped_border !== "none" ? r.equipped_border : null,
    }));
}

// ── NEIGHBOURS ───────────────────────────────────────────────────────────────────────────────────────────────
// The two social loops on the farm — rating someone's farm and petting someone's pets — were both real, both
// rewarding, and both invisible: the rating lived behind a collapsed summary on a farm you had to already be
// standing on, and petting someone else's pet required knowing whose farm to open. The directory that would
// have told you was itself collapsed, inside the same collapsed summary, and sorted by "best farms" rather
// than by anything to do with what you had left to spend today.
//
// This is the missing question answered directly: WHO HAVE I NOT VISITED YET TODAY. Un-rated farms first,
// each one carrying the two facts that decide whether it is worth the tap — whether you have rated them today,
// and how many of their pets are still worth petting.
export async function farmNeighbours(viewerId, { limit = 8 } = {}) {
    if (!viewerId) return [];
    const rows = await db
        .query(
            `SELECT b.id, b.alias, b.display_name, b.avatar_sprite_url, b.avatar_sprite_flip,
                    b.avatar_url, b.avatar_config, b.avatar_cosmetics, b.equipped_border,
                    COALESCE(d.deco_count, 0) AS deco_count,
                    COALESCE(p.pet_count, 0) AS pet_count,
                    (fr.last_rated_day = ${DAY}) AS rated_today,
                    (fr.rater_id IS NOT NULL) AS ever_rated,
                    -- Did THEY come to YOU lately? Either half of the visit counts: petting one of your pets,
                    -- or rating your farm. This is the reciprocity signal and it outranks everything except
                    -- "have I already rated them today".
                    (pv.at IS NOT NULL OR rin.rater_id IS NOT NULL) AS came_by,
                    (fx.requester_id IS NOT NULL) AS is_friend
               FROM mkt_buyer b
               LEFT JOIN (SELECT buyer_id, COUNT(*)::int AS deco_count FROM mkt_deco_placement GROUP BY buyer_id) d ON d.buyer_id = b.id
               LEFT JOIN (SELECT buyer_id::text AS buyer_id, COUNT(*)::int AS pet_count FROM mkt_pet_level GROUP BY buyer_id) p ON p.buyer_id = b.id::text
               LEFT JOIN mkt_farm_rating fr ON fr.owner_id = b.id AND fr.rater_id = $1
               LEFT JOIN LATERAL (
                   SELECT MAX(v.created_at) AS at FROM mkt_pet_visit v
                    WHERE v.owner_id = $1 AND v.petter_id = b.id AND v.created_at > NOW() - INTERVAL '3 days'
               ) pv ON TRUE
               LEFT JOIN mkt_farm_rating rin ON rin.owner_id = $1 AND rin.rater_id = b.id
                    AND rin.updated_at > NOW() - INTERVAL '3 days'
               LEFT JOIN mkt_friendship fx ON fx.status = 'accepted'
                    AND ((fx.requester_id = $1 AND fx.addressee_id = b.id) OR (fx.addressee_id = $1 AND fx.requester_id = b.id))
              WHERE b.alias IS NOT NULL AND b.id <> $1
              -- The order IS the feature. Eight faces picked by "whoever logged in last" is a directory with
              -- the search box removed; this is a list of who you owe a visit to.
              ORDER BY (fr.last_rated_day = ${DAY}) NULLS FIRST,                        -- not yet rated today
                       (pv.at IS NOT NULL OR rin.rater_id IS NOT NULL) DESC,            -- they came to you
                       (fx.requester_id IS NOT NULL) DESC,                              -- then friends
                       b.last_seen_at DESC NULLS LAST                                   -- then whoever is around
              LIMIT $2`,
            [viewerId, Math.min(24, Math.max(1, limit))]
        )
        .catch(() => []);
    return rows.map((r) => ({
        id: r.id,
        alias: r.alias,
        name: r.display_name || r.alias || "Member",
        decoCount: Number(r.deco_count) || 0,
        petCount: Number(r.pet_count) || 0,
        ratedToday: r.rated_today === true,
        everRated: r.ever_rated === true,
        cameBy: r.came_by === true,
        friend: r.is_friend === true,
        spriteUrl: r.avatar_sprite_url || null,
        spriteFlip: r.avatar_sprite_url ? r.avatar_sprite_flip === true : false,
        avatarUrl: avatarImageUrl(r.avatar_config, r.avatar_cosmetics) || r.avatar_url || null,
        border: r.equipped_border && r.equipped_border !== "none" ? r.equipped_border : null,
    }));
}

// The farm's own collection sets, for the permanent panel on the farm screen. Owned-based (see sets.js).
async function farmCollections(buyerId) {
    const [{ collectionsForFeature }, { getOwnedPieceIds: ownedPieces }] = await Promise.all([
        import("@/lib/marketplace/sets.js"),
        import("@/lib/marketplace/collection-owned.js"),
    ]);
    // Collections count TROPHIES, which live in mkt_user_collection — reading the item bag here would
        // report every set as 0 collected.
        return collectionsForFeature("farm", await ownedPieces(buyerId).catch(() => []));
}

// Resolve a farm owner by @alias (for inspecting someone else's farm). Returns { id, name, alias } or null.
export async function resolveFarmOwner(alias) {
    if (!alias) return null;
    const row = await db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE alias = $1`, [String(alias)]).catch(() => null);
    return row ? { id: row.id, name: row.display_name || row.alias || "Member", alias: row.alias } : null;
}

// Read (and lazily day-reset) a member's daily petting budgets — SEPARATE pools for your OWN pets and for
// OTHER members' pets. Idempotent — safe to call on a plain farm load.
async function pettingBudget(buyerId) {
    const b = await db
        .queryOne(
            `UPDATE mkt_buyer
                SET pet_farm_used = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_used ELSE 0 END,
                    pet_farm_used_others = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_used_others ELSE 0 END,
                    pet_farm_recharges = CASE WHEN pet_farm_day = ${DAY} THEN pet_farm_recharges ELSE 0 END,
                    pet_farm_extra = CASE WHEN pet_farm_day = ${DAY} THEN COALESCE(pet_farm_extra,0) ELSE 0 END,
                    pet_farm_day = ${DAY}
              WHERE id = $1
              RETURNING pet_farm_used, pet_farm_used_others, pet_farm_recharges, COALESCE(pet_farm_extra,0) AS pet_farm_extra, COALESCE(farm_upgrades,'{}'::jsonb) AS farm_upgrades`,
            [buyerId]
        )
        .catch(() => null);
    const usedOwn = b?.pet_farm_used || 0;
    const usedOthers = b?.pet_farm_used_others || 0;
    const recharges = b?.pet_farm_recharges || 0;
    const extra = b?.pet_farm_extra || 0; // Pettin' Whistle consumable — extra pettings today
    // A paid gold recharge (+ a Pettin' Whistle) is a general "more pettings today" purchase, so it boosts BOTH
    // pools — otherwise recharging while visiting a friend's farm did nothing (you'd buy more but still be capped).
    const bought = recharges * PET_RECHARGE_AMOUNT + extra;
    const ownAllowance = PET_PETS_PER_DAY + farmPetCapBonus(b?.farm_upgrades || {}) + bought;
    // The Open Gate: tending OTHER people's animals stops costing you anything. The pool is still counted —
    // the recap and the visit UI both read `used` — it simply never runs out. Lifting the allowance is what
    // does the work, because the allowance is also the value the reservation guard checks against.
    const othersAllowance = (await hasPower(buyerId, "open_gate")) ? 999 : PET_OTHERS_PER_DAY + bought;
    return {
        own: { used: usedOwn, allowance: ownAllowance, left: Math.max(0, ownAllowance - usedOwn) },
        others: { used: usedOthers, allowance: othersAllowance, left: Math.max(0, othersAllowance - usedOthers) },
        recharges, rechargeCost: rechargeCost(recharges), rechargeAmount: PET_RECHARGE_AMOUNT,
    };
}

// Flatten the two-pool budget to the shape the client uses, keyed to the CURRENT context (your own farm →
// the "own" pool; a friend's farm → the "others" pool), while still carrying both pools for the UI.
function flatBudget(b, own) {
    const scope = own ? b.own : b.others;
    return { used: scope.used, allowance: scope.allowance, left: scope.left, scope: own ? "own" : "others", own: b.own, others: b.others, recharges: b.recharges, rechargeCost: b.rechargeCost, rechargeAmount: b.rechargeAmount };
}

// The "your own farm" extras: treats you own + a treat shop + your wallet + the petting budget. Reused on load
// and after a buy/recharge so the client can patch without a full refetch.
async function farmMineBits(buyerId, mine = true) {
    const [cons, wallet, rawBudget] = await Promise.all([
        listConsumables(buyerId).catch(() => ({ stash: [], shop: [] })),
        // `pig_hour` is the store-local time NOW, so the arrival check below can be made in JS against the
        // member's own hash-derived hour without a second round trip or a clock that disagrees with the DAY.
        db.queryOne(
            `SELECT COALESCE(gold, 0) AS gold, COALESCE(store_credit_cents, 0) AS cc,
                    (pig_day IS DISTINCT FROM ${DAY}) AS pig_unclaimed,
                    -- The hog turned him around today and that second visit is still unspent. Without this
                    -- the pig vanished the instant the first was claimed, and the perk could never fire.
                    (pig_again_day = ${DAY} AND pig_second_day IS DISTINCT FROM ${DAY}) AS pig_again,
                    ${DAY}::text AS today,
                    EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Chicago'))
                      + EXTRACT(MINUTE FROM (NOW() AT TIME ZONE 'America/Chicago')) / 60.0 AS local_hour
               FROM mkt_buyer WHERE id = $1`, [buyerId]
        ).catch(() => null),
        pettingBudget(buyerId),
    ]);
    // Show the budget for the pets you're actually looking at: your own pool on your farm, the others pool on a friend's.
    const petting = flatBudget(rawBudget, mine);
    // listConsumables returns owned items under `stash` (NOT `owned`) — reading the wrong key is why banked
    // treats never showed and you could only buy. Feed from your real stash.
    // ── ANYTHING THAT FEEDS A PET BELONGS IN THE FEED LIST ───────────────────────────────────────────────
    // This filtered on `kind === "treat"`, which was the same thing as "feeds a pet" right up until dishes
    // became food. feedPetItem — the server on the other end of these buttons — has never asked about `kind`;
    // it asks whether the effect is pet_xp or pet_level. So the list was refusing to OFFER items the server
    // would happily have accepted, and a member with forty cooked dishes could not feed one to a chosen pet
    // from the only screen that lets you choose the pet.
    //
    // Same rule as feedPetItem, read off the effect, so a future food cannot go missing here again.
    const feedable = (o) => {
        const e = CONSUMABLES[o.id]?.effect;
        return e?.type === "pet_xp" || e?.type === "pet_level";
    };
    const treats = (cons.stash || [])
        .filter(feedable)
        .map((o) => ({ id: o.id, name: o.name, emoji: o.emoji, xp: treatXp(o.id), count: o.count, kind: o.kind }))
        // Dishes first and strongest-first within each group: the plates are the ones you cooked and have most
        // of, and the shop treats keep their ladder order underneath.
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "dish" ? -1 : 1)
            || (b.xp === "level" ? 1 : 0) - (a.xp === "level" ? 1 : 0)
            || (Number(b.xp) || 0) - (Number(a.xp) || 0));
    const treatShop = (cons.shop || [])
        .filter((o) => o.kind === "treat")
        .map((o) => ({ id: o.id, name: o.name, emoji: o.emoji, xp: treatXp(o.id), price: o.effectivePrice ?? o.price, canAfford: o.canAfford }));
    // He is only about once he has ARRIVED — see pigHourFor. Unclaimed is necessary and no longer sufficient.
    const arrived = wallet
        ? Number(wallet.local_hour) >= pigHourFor(buyerId, wallet.today)
        : false;
    // ── AND A SECOND VISIT PUTS HIM BACK ON THE FARM ─────────────────────────────────────────────────
    // A turned-around pig does NOT wait for the arrival hour again — that hour is about when he first shows
    // up, and making the member wait a second unknowable stretch for a bonus they already earned would read
    // as the perk not working. He comes back the same day, once, and this is what says so.
    const again = Boolean(wallet?.pig_again);
    return {
        treats, treatShop, wallet: { gold: wallet?.gold || 0, storeCreditCents: wallet?.cc || 0 }, petting,
        pigAvailable: (Boolean(wallet?.pig_unclaimed) && arrived) || again,
        // The client says something different for a return visit, so it needs to know which one this is.
        pigSecond: again && !wallet?.pig_unclaimed,
    };
}

// The Wild Loot Pig payout — once per store-local day, guarded atomically. Rolls gold + a rare item drop.
export async function claimPig(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    // ── HE HAS TO HAVE TURNED UP ─────────────────────────────────────────────────────────────────────────
    // The arrival time is enforced HERE as well as in the view. Gating it only where the pig is drawn would
    // make the whole schedule a client-side suggestion: a crafted POST at 00:01 would collect every day.
    const clock = await db.queryOne(
        `SELECT ${DAY}::text AS today,
                EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Chicago'))
                  + EXTRACT(MINUTE FROM (NOW() AT TIME ZONE 'America/Chicago')) / 60.0 AS local_hour`
    ).catch(() => null);
    if (clock && Number(clock.local_hour) < pigHourFor(buyerId, clock.today)) {
        return { ok: false, error: "no_pig" };
    }
    const claim = await db.queryOne(`UPDATE mkt_buyer SET pig_day = ${DAY} WHERE id = $1 AND pig_day IS DISTINCT FROM ${DAY} RETURNING id`, [buyerId]).catch(() => null);

    // ── THE HOG DECIDES AT THE FIRST CLAIM, NOT AT THE SECOND ────────────────────────────────────────
    // This roll used to live in the `!claim` branch below — i.e. it only ran if you asked to claim a pig you
    // had already claimed, which the client has no way to do, because a claimed pig is not on the farm any
    // more. So it was a branch nothing could reach: 54 members had claimed a first pig and not one had ever
    // been given a second.
    //
    // Rolled here, the moment the first is banked, and written down. pigAvailable reads that column and puts
    // him back on the farm, which is the whole of what was missing.
    let turnedAround = false;
    if (claim) {
        try {
            const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
            const th = await getPetSystemPerk(buyerId, "truffle_hog");
            if (th > 0 && Math.random() < th / 100) {
                await db.query(`UPDATE mkt_buyer SET pig_again_day = ${DAY} WHERE id = $1`, [buyerId]);
                turnedAround = true;
            }
        } catch { /* no companion, no second visit */ }
    } else {
        // Not the first claim. It is only allowed at all if the hog turned him around today, and it is spent
        // atomically on its own column so retrying the request cannot pay it twice.
        const second = await db.queryOne(
            `UPDATE mkt_buyer SET pig_second_day = ${DAY}
              WHERE id = $1 AND pig_again_day = ${DAY} AND pig_second_day IS DISTINCT FROM ${DAY}
              RETURNING id`,
            [buyerId]
        ).catch(() => null);
        if (!second) return { ok: false, error: "already_claimed" };
    }
    const gold = mint(PIG_GOLD_MIN + randInt(PIG_GOLD_MAX - PIG_GOLD_MIN + 1), "loot_pig");
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "loot_pig", { balanceAfter: paid?.gold }).catch(() => {});
    let item = null;
    if (Math.random() < PIG_ITEM_CHANCE) {
        const rarity = weightedPick(PIG_RARITY_WEIGHTS);
        const pool = randomDropPool((it) => it.rarity === rarity);
        const def = pool.length ? pool[randInt(pool.length)] : null;
        if (def) {
            const g = await grantItem(buyerId, def.id, "loot_pig").catch(() => null);
            item = { id: def.id, name: def.name, rarity: def.rarity, slot: def.slot || null, image: await itemSpriteFor(def.id).catch(() => null), isNew: Boolean(g?.granted) };
        }
    }
    // FARM-ONLY pet: a rare Golden Goose drop from the Wild Loot Pig (never from the boss/shop/spin/chests).
    // Small chance; idempotent grant that only flags as new when the row is actually inserted.
    let pet = null;
    if (Math.random() < PIG_PET_CHANCE) {
        const ins = await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', 'golden_goose') ON CONFLICT DO NOTHING RETURNING ref`, [buyerId]).catch(() => []);
        if (ins.length) { const def = collectibleById("golden_goose"); pet = { id: "golden_goose", name: def?.name || "Golden Goose", rarity: def?.rarity || "epic", hint: def?.hint || null }; }
    }
    await trackActivity(buyerId, "loot_pig", { gold, item: item?.name || null, pet: pet?.name || null }).catch(() => {});
    await syncEarnedBadges(buyerId).catch(() => {}); // Pig Whisperer / Pig Tycoon
    // `again` tells the screen the hog turned him around, so the moment can be announced when it is earned
    // rather than leaving the member to notice a pig they were not expecting.
    return { ok: true, gold, goldAfter: paid?.gold ?? null, item, pet, again: turnedAround };
}

// A member's farm state. viewerId === ownerId ⟺ it's your farm (petting enabled + per-pet "petted today" flags).
// Stamp the viewer as present on THIS farm and return everyone currently viewing it (active in the last 60s).
// So the owner sees visitors at their farm, and a visitor sees themself standing on the farm they're viewing.
export async function farmVisitors(farmOwnerId, viewerId) {
    if (!viewerId || !farmOwnerId) return [];
    await db.query(
        `INSERT INTO mkt_farm_presence (viewer_id, farm_owner_id, last_seen) VALUES ($1, $2, NOW())
         ON CONFLICT (viewer_id) DO UPDATE SET farm_owner_id = $2, last_seen = NOW()`,
        [viewerId, farmOwnerId]
    ).catch(() => {});
    const rows = await db.query(
        `SELECT b.id, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_sprite_flip, b.equipped_border, b.featured_collectible
           FROM mkt_farm_presence p JOIN mkt_buyer b ON b.id = p.viewer_id
          WHERE p.farm_owner_id = $1 AND p.last_seen > NOW() - INTERVAL '60 seconds'
          ORDER BY (p.viewer_id = $2) DESC, p.last_seen DESC LIMIT 12`,
        [farmOwnerId, viewerId]
    ).catch(() => []);
    return rows.map((r) => ({
        id: r.id, name: r.display_name || (r.alias ? `@${r.alias}` : "a wolf"), alias: r.alias || null,
        sprite: r.avatar_sprite_url || null, flip: r.avatar_sprite_flip === true,
        border: r.equipped_border && r.equipped_border !== "none" ? r.equipped_border : null,
        isYou: String(r.id) === String(viewerId),
    }));
}

export async function getFarm(ownerId, viewerId) {
    if (!ownerId) return null;
    const [owner, state, sprites, levelSprites, pettedRows] = await Promise.all([
        db.queryOne(`SELECT id, display_name, alias, avatar_sprite_url, avatar_sprite_flip, equipped_border, farm_bg_draft_url, (SELECT url FROM mkt_farm_bg WHERE id = b.farm_bg_active_id) AS farm_bg_active_url, COALESCE(sprite_brightness, 1.0) AS sprite_brightness FROM mkt_buyer b WHERE id = $1`, [ownerId]).catch(() => null),
        petsState(ownerId).catch(() => null),
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
        db.query(`SELECT pet_id FROM mkt_pet_level WHERE buyer_id = $1::text AND petted_day = ${DAY}`, [ownerId]).catch(() => []),
    ]);
    if (!owner || !state) return null;
    const pettedToday = new Set(pettedRows.map((r) => r.pet_id));
    const mine = String(viewerId) === String(ownerId);
    // Whose farm this is — a visitor sees the OWNER's enshrined forms, not their own.
    const { stoneMapFor } = await import("@/lib/marketplace/pet-ascension.js");
    const farmStones = await stoneMapFor(ownerId).catch(() => ({}));
    const pets = (state.ownedIds || [])
        .map((id) => {
            const def = collectibleById(id);
            const lvl = state.petLevels?.[id];
            // Show the sprite for the pet's CURRENT level (evolved 2-6), like the boss scene — not the Lv1
            // base — and its ENSHRINED form if it has one, which is the whole visible payoff of level six.
            const sp = pickPetSpriteForLevel(sprites[id], levelSprites[id], lvl?.level || 1, farmStones[id] || null);
            return {
                id,
                name: def?.name || id,
                rarity: def?.rarity || "common",
                source: def?.source || null,
                level: lvl?.level || 1,
                xp: lvl?.xp || 0,
                into: lvl?.into || 0,
                span: lvl?.span || 0,
                maxed: Boolean(lvl?.maxed),
                spriteUrl: sp?.url || null,
                flip: sp?.flip === true,
                petted: pettedToday.has(id),
            };
        })
        .filter((p) => p.spriteUrl);
    // The VIEWER's own treats / wallet / petting budget power the pet + feed actions — whether they're standing
    // on their own farm or a friend's. (On a friend's farm you can still pet, spending your budget, and feed
    // using your treats.) pettedToday only limits YOUR OWN pets; a friend's pets you can pet freely (budget cap).
    const extras = viewerId ? await farmMineBits(viewerId, mine) : { treats: [], treatShop: [], wallet: null, petting: null, pigAvailable: false };
    // Your crops only show on your own farm (you tend your own garden).
    const [garden, ratingBits, placements, decorations, crownCfg, neighbours, collections, loveBoard] = await Promise.all([
        mine ? getGarden(ownerId).catch(() => null) : Promise.resolve(null),
        farmRatingBits(ownerId, viewerId).catch(() => ({ rating: null })),
        getPlacements(ownerId).catch(() => []), // the OWNER's placed decorations — rendered on any farm
        mine ? decoState(viewerId).catch(() => null) : Promise.resolve(null), // your inventory — manage on your own farm only
        getCrownConfig().catch(() => null), // loot-pig crown placement (owner-calibrated)
        // Only on your OWN farm: the "who haven't I visited today" strip. On someone else's you are already
        // doing the visiting, and a list of other people to go and see is the last thing that screen needs.
        mine ? farmNeighbours(viewerId, { limit: 8 }).catch(() => []) : Promise.resolve([]),
        // The farm COLLECTIONS (Harvester / Forager) — shown permanently on the farm screen, because that is
        // where their bonuses land and where somebody chasing them is standing.
        mine ? farmCollections(viewerId).catch(() => []) : Promise.resolve([]),
        // The most-loved board. Only on your own farm — Standing is the tab that asks "how do I compare?", and
        // a position with nobody else's name next to it is not an answer.
        mine ? farmLoveBoard(viewerId).catch(() => ({ top: [], mine: null })) : Promise.resolve({ top: [], mine: null }),
    ]);
    return {
        owner: { id: owner.id, name: owner.display_name || owner.alias || "Member", alias: owner.alias || null, avatarUrl: owner.avatar_sprite_url || null, avatarFlip: owner.avatar_sprite_flip === true, border: owner.equipped_border && owner.equipped_border !== "none" ? owner.equipped_border : null },
        mine,
        garden,
        customBg: owner.farm_bg_active_url || null, // the equipped library background (shown to everyone), or none → default scenes
        customBgDraft: mine ? (owner.farm_bg_draft_url || null) : null, // your pending, not-yet-accepted preview
        // Clamped on read as well as on write: a value stored before the floor existed would otherwise keep
        // rendering this farm's pets as silhouettes until the owner happened to touch the slider.
        spriteBrightness: Math.max(0.6, Math.min(2.2, Number(owner.sprite_brightness ?? 1))), // global brightness multiplier for this farm's sprites
        visitors: await farmVisitors(ownerId, viewerId).catch(() => []), // live wolves viewing this farm (incl. you when visiting)
        canPet: Boolean(viewerId), // pet your own OR a friend's pets (spends your shared 3/day budget)
        // How many of your own pets you can actually pet RIGHT NOW (charges left ∩ un-petted pets) — nudges the
        // nav badge + an in-farm hint so a free daily reward never sits unclaimed.
        petNudge: mine ? Math.min((extras.petting?.left) || 0, pets.filter((p) => !p.petted).length) : 0,
        canFeed: Boolean(viewerId), // feed with your own treats
        petXp: PET_PET_XP,
        petGold: mine ? PET_PET_GOLD : PET_OTHER_GOLD,
        pets: mine ? pets : pets.map((p) => ({ ...p, petted: false })),
        placements, // decorations placed in this pasture (rendered for everyone)
        // THE PETTING STAND, for the OWNER of this farm — so a visitor sees whose pets are on display and how
        // rare each one is, which is the entire point of putting them there. Keyed off ownerId, never viewerId.
        stand: await getStandState(ownerId).catch(() => ({ placed: false, slots: [] })),
        decorations, // your owned-decoration inventory + buffs (own farm only; null when visiting)
        crownCfg, // loot-pig crown placement
        neighbours, // own farm only: who you have not visited yet today (see farmNeighbours)
        collections, // own farm only: the Harvester / Forager chases, always visible
        loveBoard, // own farm only: { top, mine } — the most-loved farms, for the Standing tab
        ...extras,
        ...ratingBits,
    };
}

/**
 * FEED THE WHOLE BAG — one tap instead of forty.
 *
 * Luke: "maybe a feed all, and feed all pet consumables entirely, otherwise this is going to annoy people."
 * He is right, and dishes are what made it urgent: a cook can hold dozens of plates worth ten XP each, and
 * the only way to spend them was one button per plate.
 *
 * Two shapes, one function. `consumableId` set = every copy of THAT item. `consumableId` null = every pet food
 * in the bag.
 *
 * ── IT STOPS AT FULL, AND IT SPENDS THE CHEAP STUFF FIRST ────────────────────────────────────────────────
 * The single-feed path already refuses to feed a maxed pet rather than destroying the treat for nothing. Bulk
 * has to honour that for every item it touches, or "feed everything" becomes the fastest way to burn a Golden
 * Bone on a pet that could not use it. So the ceiling is computed ONCE, items are walked cheapest-first, and
 * the walk stops the moment the pet is full — leaving the good treats in the bag, which is also what anybody
 * pressing this button actually wants.
 *
 * ── OWN PETS ONLY ────────────────────────────────────────────────────────────────────────────────────────
 * Feeding a friend's pet stays one at a time. That path pays the FEEDER xp and gold per feed and shares the
 * treat's XP to every earning pet the owner has; bulking it would multiply both, and a button that pays you
 * per item is a button somebody empties their bag into a stranger for. The annoyance being fixed is your own
 * forty plates.
 *
 * ── AMBROSIA IS NEVER SWEPT UP ───────────────────────────────────────────────────────────────────────────
 * `pet_level` grants a whole level outright. Nobody pressing "feed everything" means "and my one instant
 * level, too". Bulk moves pet_xp only; Ambrosia keeps its own deliberate tap.
 */
export async function feedPetBulk(feederId, petId, consumableId = null) {
    if (!feederId || !petId) return { ok: false, error: "bad_request" };
    const state = await petsState(feederId).catch(() => null);
    if (!state || !(state.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };
    const def = collectibleById(petId);
    const rarity = def?.rarity || "common";
    const maxXp = petMaxXp(rarity);

    const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [feederId, petId]).catch(() => null);
    let xp = Number(row?.xp) || 0;
    if (xp >= maxXp) return { ok: false, error: "pet_maxed", message: `${def?.name || "That pet"} is already at max level.` };

    const owned = await db.query(
        `SELECT consumable_id, count FROM mkt_user_consumable WHERE buyer_id = $1 AND count > 0`, [feederId]
    ).catch(() => []);
    const pool = owned
        .filter((r) => (consumableId ? r.consumable_id === consumableId : true))
        .map((r) => ({ id: r.consumable_id, count: Number(r.count) || 0, amount: CONSUMABLES[r.consumable_id]?.effect?.type === "pet_xp" ? Number(CONSUMABLES[r.consumable_id].effect.amount) || 0 : 0 }))
        .filter((r) => r.amount > 0 && r.count > 0)
        .sort((a, b) => a.amount - b.amount); // cheapest first — keep the good ones for a pet that needs them
    if (!pool.length) return { ok: false, error: "nothing_to_feed" };

    // Work out what to spend BEFORE spending any of it, so the write loop cannot half-finish into a full pet.
    //
    // The Pet Bond attunement on equipped gear multiplies every pet-XP grant (addPetXp applies it), so the
    // shortfall in ITEMS is smaller than the shortfall in XP. Planning without it would feed a few more plates
    // than the pet could use — a small waste, but this button's whole promise is that it does not waste, and a
    // promise the code only mostly keeps is the kind that gets reported as a bug.
    const petBond = (await getEquippedUtilTotals(feederId).catch(() => ({ petXp: 0 })))?.petXp || 0;
    const plan = [];
    let need = Math.ceil((maxXp - xp) / (1 + petBond / 100));
    for (const item of pool) {
        if (need <= 0) break;
        const want = Math.min(item.count, Math.ceil(need / item.amount));
        if (want <= 0) continue;
        plan.push({ id: item.id, n: want, amount: item.amount });
        need -= want * item.amount;
    }
    if (!plan.length) return { ok: false, error: "nothing_to_feed" };

    let fed = 0, gained = 0;
    for (const step of plan) {
        // Conditional decrement: another tab feeding the same stack cannot take the count negative.
        const dec = await db.queryOne(
            `UPDATE mkt_user_consumable SET count = count - $3 WHERE buyer_id = $1 AND consumable_id = $2 AND count >= $3 RETURNING count`,
            [feederId, step.id, step.n]
        ).catch(() => null);
        if (!dec) continue;
        const res = await addPetXp(feederId, petId, step.amount * step.n).catch(() => null);
        if (!res?.ok) continue;
        fed += step.n;
        gained += step.amount * step.n;
    }
    if (!fed) return { ok: false, error: "nothing_to_feed" };

    await trackActivity(feederId, "feed_pet_bulk", { petId, items: fed, xp: gained }).catch(() => {});
    await bumpQuestProgress(feederId, "feed_pet", fed).catch(() => {});
    const after = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [feederId, petId]).catch(() => null);
    xp = Number(after?.xp) || xp + gained;
    const info = petLevelInfo(xp, rarity);
    return {
        ok: true, petId, fed, gained, level: info.level, xp,
        into: info.into, span: info.span, maxed: info.maxed,
        // What is still in the bag, so the panel can redraw without a full farm reload.
        ...(await farmMineBits(feederId, true).catch(() => ({}))), // refreshed treats + wallet for the panel
    };
}

// Use a pet TREAT on a specific owned pet (feed it XP or instant-level it).
export async function feedPetItem(feederId, petId, consumableId, ownerId = null) {
    if (!feederId || !petId || !consumableId) return { ok: false, error: "bad_request" };
    const c = CONSUMABLES[consumableId];
    if (!c || (c.effect?.type !== "pet_xp" && c.effect?.type !== "pet_level")) return { ok: false, error: "not_a_treat" };
    const petOwner = ownerId || feederId;
    const own = String(petOwner) === String(feederId);
    // The pet must belong to whoever's farm this is; the treat always comes from the feeder's own bag.
    const ownerState = await petsState(petOwner).catch(() => null);
    if (!ownerState || !(ownerState.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };
    const def = collectibleById(petId);

    if (own) {
        const res = await applyConsumable(feederId, consumableId, null, petId);
        if (!res.ok) return res;
        await trackActivity(feederId, "feed_pet", { petId }).catch(() => {});
        await bumpQuestProgress(feederId, "feed_pet", 1).catch(() => {});
        const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [feederId, petId]).catch(() => null);
        const info = petLevelInfo(row?.xp || 0, def?.rarity || "common");
        return { ...res, petId, level: info.level, xp: row?.xp || 0, into: info.into, span: info.span, maxed: info.maxed };
    }

    // Feeding a FRIEND'S pet: spend one of the feeder's treats, land the XP on the OWNER's pet, and thank the
    // feeder for the generosity. Unlimited (each feed costs a real treat).
    // The Deep Bowl: one treat in three feeds the pet without being used up. Checked as a SPEND OF ZERO rather
    // than as a refund — a refund would need the decrement to have succeeded first, and a member on their last
    // treat would still have been told they had none.
    const keepTreat = await powerRoll(feederId, "deep_bowl", 3);
    const dec = keepTreat
        ? await db.queryOne(`SELECT count FROM mkt_user_consumable WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0`, [feederId, consumableId]).catch(() => null)
        : await db.queryOne(`UPDATE mkt_user_consumable SET count = count - 1 WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`, [feederId, consumableId]).catch(() => null);
    if (!dec) return { ok: false, error: "insufficient" };
    const applied = c.effect.type === "pet_level"
        ? await levelUpPet(petOwner, petId).catch(() => ({ ok: false }))
        : await addPetXp(petOwner, petId, c.effect.amount).catch(() => ({ ok: false }));
    // ── AND EVERY OTHER PET THAT EARNS FOR THIS OWNER ────────────────────────────────────────────────────
    // Luke: "if I feed my active pet it should also give that exp to the stand pets." A treat was the one
    // pet-XP source the stand did not share in — the farm, the character-XP share and the passive trickle all
    // pay every earning pet, and this paid exactly one.
    //
    // It pays whichever pet was fed AND the rest, rather than only firing when the FEATURED pet is the one
    // fed: an asymmetry there would quietly make "always feed the equipped one" the correct play, and a
    // hidden optimal way to use an item is worse than either rule on its own.
    //
    // A LEVEL treat is deliberately NOT shared. `pet_level` grants a whole level outright, and four levels
    // from one item is a different item — this shares the XP treats, which is what was asked for.
    if (c.effect.type === "pet_xp") {
        const { earningPetIds } = await import("@/lib/marketplace/pet-level.js");
        const others = (await earningPetIds(petOwner).catch(() => [])).filter((id) => id !== petId);
        for (const id of others) await addPetXp(petOwner, id, c.effect.amount).catch(() => {});
    }
    const leveled = c.effect.type === "pet_level" ? Boolean(applied?.ok) : Boolean(applied?.leveled);
    await awardXp(feederId, "feed_other", { points: FEED_OTHER_PLAYER_XP, gold: FEED_OTHER_GOLD }).catch(() => {});
    await trackActivity(feederId, "feed_other", { petId, owner: petOwner }).catch(() => {});
    await bumpQuestProgress(feederId, "feed_pet", 1).catch(() => {});
    // Feeds count as love too → show up in the owner's "who petted your pets" recap, crediting the pet-XP fed.
    await db.query(`INSERT INTO mkt_pet_visit (owner_id, petter_id, pet_id, xp) VALUES ($1, $2, $3, $4)`, [petOwner, feederId, petId, c.effect?.amount || 0]).catch(() => {});
    const row = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [petOwner, petId]).catch(() => null);
    const info = petLevelInfo(row?.xp || 0, def?.rarity || "common");
    // The sprite the pet JUST evolved into (so the level-up celebration shows the new form, not the Lv1 base).
    const evolved = leveled ? await getPetLevelSprite(petId, applied.level).catch(() => null) : null;
    return {
        ok: true,
        petId,
        remaining: dec.count,
        gave: c.name,
        forOther: true,
        goldGained: FEED_OTHER_GOLD,
        playerXp: FEED_OTHER_PLAYER_XP,
        petLevelUp: leveled ? { petId, petName: def?.name || "the pet", level: applied.level, rarity: def?.rarity || "common", maxed: applied.level >= 5, spriteUrl: evolved?.url || null, spriteFlip: evolved?.flip || false } : null,
        level: info.level,
        xp: row?.xp || 0,
        into: info.into,
        span: info.span,
        maxed: info.maxed,
    };
}

// Buy a pet treat from the farm (routes through buyConsumable). Returns fresh treats + wallet on success, or
// { ok:false, error:"insufficient" } so the client can surface the store-credit CTA.
export async function buyTreat(buyerId, consumableId) {
    const c = CONSUMABLES[consumableId];
    if (!c || c.kind !== "treat" || !c.price) return { ok: false, error: "not_buyable" };
    const res = await buyConsumable(buyerId, consumableId);
    if (!res.ok) return res;
    const bits = await farmMineBits(buyerId);
    return { ok: true, name: c.name, ...bits };
}

// Pet one of YOUR pets: spends one from the shared daily budget, gives the pet XP + rewards YOU gold & XP.
// Each pet can only be petted once/day (spread the love), and the 3/day total is the real cap.
export async function petPet(petterId, petId, ownerId = null) {
    if (!petterId || !petId) return { ok: false, error: "bad_request" };
    const petOwner = ownerId || petterId;
    const own = String(petOwner) === String(petterId);
    // The pet must belong to whoever's farm this is.
    const ownerState = await petsState(petOwner).catch(() => null);
    if (!ownerState || !(ownerState.ownedIds || []).includes(petId)) return { ok: false, error: "not_owned" };

    // A pet at Lv5 has nothing left to gain, so petting it burned one of your daily charges to teach it
     // nothing. Refused outright rather than quietly wasting the charge.
    const petXpRow = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [petOwner, petId]).catch(() => null);
    if (petLevelInfo(Number(petXpRow?.xp) || 0, collectibleById(petId)?.rarity).maxed) {
        return { ok: false, error: "pet_maxed" };
    }

    const budget = await pettingBudget(petterId);
    // Separate pools: your OWN pets vs OTHER members' pets (3 each per day).
    const col = own ? "pet_farm_used" : "pet_farm_used_others";
    const pool = own ? budget.own : budget.others;
    if (pool.left <= 0) return { ok: false, error: "no_pets_left", petting: flatBudget(budget, own) };

    // Reserve a slot from the right pool FIRST (guarded so a burst can't exceed the allowance).
    const slot = await db
        .queryOne(
            `UPDATE mkt_buyer SET ${col} = ${col} + 1
              WHERE id = $1 AND pet_farm_day = ${DAY} AND ${col} < $2
              RETURNING ${col} AS n`,
            [petterId, pool.allowance]
        )
        .catch(() => null);
    if (!slot) return { ok: false, error: "no_pets_left", petting: flatBudget(await pettingBudget(petterId), own) };

    const def = collectibleById(petId);
    const maxXp = petMaxXp(def?.rarity || "common");
    // The FARM OWNER's farm bonuses (decorations + their equipped gear farm affix + equipped pet's pet-bond
    // passive) boost the pet XP earned from petting on their farm.
    const ownerBuffs = await farmBonuses(petOwner).catch(() => null);
    // ── ON THE PETTING STAND, A PETTING IS WORTH DOUBLE ──────────────────────────────────────────────────────
    // This is the social half of the stand: putting a companion on display is how you tell visitors which one
    // you want fussed over, and the doubling is what makes answering worth their tap. It applies to the OWNER
    // petting their own too — the stand is a statement about that animal, not a tax on the person reading it.
    //
    // Multiplied on top of the farm's petXp buffs rather than folded into them, so a decorated farm and a
    // stand stack the way anyone would expect them to.
    const { isOnStand, STAND_PET_MULT } = await import("@/lib/marketplace/petting-stand.js");
    const onStand = await isOnStand(petOwner, petId).catch(() => false);
    const petXpAmt = Math.round(PET_PET_XP * (1 + (ownerBuffs?.petXp || 0) / 100) * (onStand ? STAND_PET_MULT : 1));
    let newXp = null;
    if (own) {
        // Your OWN pet: once/day/pet guard (spread the love). If already petted today, refund the slot.
        const row = await db
            .queryOne(
                `INSERT INTO mkt_pet_level (buyer_id, pet_id, xp, petted_day, last_tick_at, updated_at)
                 VALUES ($1::text, $2, LEAST($3::int, $4::int), ${DAY}, NOW(), NOW())
                 ON CONFLICT (buyer_id, pet_id)
                 DO UPDATE SET xp = LEAST(mkt_pet_level.xp + $3::int, $4::int), petted_day = ${DAY}, updated_at = NOW()
                  WHERE mkt_pet_level.petted_day IS DISTINCT FROM ${DAY}
                 RETURNING xp`,
                [petterId, petId, petXpAmt, maxXp]
            )
            .catch(() => null);
        if (!row) {
            await db.query(`UPDATE mkt_buyer SET ${col} = GREATEST(0, ${col} - 1) WHERE id = $1 AND pet_farm_day = ${DAY}`, [petterId]).catch(() => {});
            return { ok: false, error: "already_petted", petting: flatBudget(await pettingBudget(petterId), own) };
        }
        newXp = row.xp;
    } else {
        // A FRIEND'S pet: no per-pet guard (your 3/day budget is the cap), XP lands on the owner's pet.
        const res = await addPetXp(petOwner, petId, petXpAmt).catch(() => null);
        if (!res) {
            await db.query(`UPDATE mkt_buyer SET ${col} = GREATEST(0, ${col} - 1) WHERE id = $1 AND pet_farm_day = ${DAY}`, [petterId]).catch(() => {});
            return { ok: false, error: "pet_error", petting: flatBudget(await pettingBudget(petterId), own) };
        }
        const r = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1::text AND pet_id = $2`, [petOwner, petId]).catch(() => null);
        newXp = r?.xp || 0;
        // Log it so the owner sees who petted which of their pets (and the XP it earned) on their next visit.
        await db.query(`INSERT INTO mkt_pet_visit (owner_id, petter_id, pet_id, xp) VALUES ($1, $2, $3, $4)`, [petOwner, petterId, petId, petXpAmt]).catch(() => {});
        // Pack Visit: a share of that XP also goes to the VISITOR's own equipped pet. Only on someone else's
        // farm — on your own it would just be a flat multiplier on petting yourself.
        try {
            const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
            const share = await getPetSystemPerk(petterId, "pack_visit");
            if (share > 0) {
                const me = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [petterId]).catch(() => null);
                const mine = me?.featured_collectible;
                if (mine) await addPetXp(petterId, mine, Math.max(1, Math.round(petXpAmt * share / 100))).catch(() => {});
            }
        } catch { /* a share is a bonus; never fail the visit */ }
    }

    // ── ASCENSION POWERS ON A VISIT ──────────────────────────────────────────────────────────────────────
    // Two of these belong to the FARM OWNER and one to the visitor, which is why both sets are read. Read
    // after the pet has already been credited so a power can never be the reason a visit fails.
    if (!own) {
        const [mine, theirs] = await Promise.all([
            equippedPowers(petterId).catch(() => new Set()),
            equippedPowers(petOwner).catch(() => new Set()),
        ]);
        // Standing Invitation is the owner's, and it refunds the VISITOR's charge — the slot was reserved
        // above, so the refund is the same statement the failure paths already use.
        if (theirs.has("standing_invitation")) {
            await db.query(`UPDATE mkt_buyer SET ${col} = GREATEST(0, ${col} - 1) WHERE id = $1 AND pet_farm_day = ${DAY}`, [petterId]).catch(() => {});
        }
        // The Toll House pays the owner FROM THE HOUSE — the visitor is never charged, which is the whole
        // point of the card. Ten tolls a day, so a popular farm is a good day rather than a gold printer.
        if (theirs.has("toll_house") && (await claimPowerUse(petOwner, "toll_house", TOLL_HOUSE_PER_DAY))) {
            await awardXp(petOwner, "farm_toll", { points: 0, gold: TOLL_HOUSE_GOLD }).catch(() => {});
        }
        // The Long Leash. On someone else's land it is the OWNER's farm bonuses that scale the XP — your own
        // pet's pet-bond passive is doing nothing. This tops the pet up by the share yours would have paid.
        if (mine.has("long_leash")) {
            const bonus = await farmBonuses(petterId).catch(() => null);
            const extra = Math.round(PET_PET_XP * ((bonus?.petXp || 0) / 100));
            if (extra > 0) await addPetXp(petOwner, petId, extra).catch(() => {});
        }
    }

    // Reward the petter: your own pet pays a bit more (the bond); a friend's pet a small thank-you.
    const goldGained = own ? PET_PET_GOLD : PET_OTHER_GOLD;
    const playerXp = own ? PET_PET_PLAYER_XP : PET_OTHER_PLAYER_XP;
    await awardXp(petterId, own ? "pet_farm" : "pet_farm_other", { points: playerXp, gold: goldGained }).catch(() => {});
    await trackActivity(petterId, own ? "pet_farm" : "pet_other", { petId, owner: own ? undefined : petOwner }).catch(() => {});
    await bumpQuestProgress(petterId, "pet_animal", 1).catch(() => {});
    // A SEPARATE metric for someone else's pet. "pet_animal" fires on your own too, so a bounty built on it
    // can be finished without ever leaving your own farm — which is exactly how the social half of this
    // feature ended up with no bounty asking for it.
    if (!own) await bumpQuestProgress(petterId, "pet_other", 1).catch(() => {});
    // Farm-native seed drop: tending a pet on the farm can turn up a fresh seed (mostly common). Best-effort,
    // Forager-scaled inside dropSeedFrom — feeds the farm's own seed supply.
    const foundSeed = await dropSeedFrom(petterId, "pet_farm").catch(() => null);

    const info = petLevelInfo(newXp, def?.rarity || "common");
    return {
        ok: true,
        petId,
        forOther: !own,
        xpGained: petXpAmt,
        goldGained,
        playerXp,
        level: info.level,
        xp: newXp,
        into: info.into,
        span: info.span,
        maxed: info.maxed,
        foundSeed,
        petting: flatBudget(await pettingBudget(petterId), own),
    };
}

// "Who petted your pets" welcome-back recap. Returns every unseen petting on YOUR pets, grouped by the visitor
// (and, under each visitor, which pets they petted + the XP each gained). Fetching it marks the rows seen so it
// pops once — same contract as the raid-defense report.
export async function getUnseenPetVisits(ownerId) {
    if (!ownerId) return { visits: [], totalXp: 0, totalVisits: 0, petterCount: 0 };
    const rows = await db
        .query(
            `SELECT petter_id, pet_id, COUNT(*)::int AS n, COALESCE(SUM(xp), 0)::int AS xp
               FROM mkt_pet_visit WHERE owner_id = $1 AND seen_at IS NULL
              GROUP BY petter_id, pet_id`,
            [ownerId]
        )
        .catch(() => []);
    if (!rows.length) return { visits: [], totalXp: 0, totalVisits: 0, petterCount: 0 };
    const ids = [...new Set(rows.map((r) => r.petter_id))];
    const [buyers, petMap] = await Promise.all([
        db.query(`SELECT id, display_name, alias, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip, equipped_border FROM mkt_buyer WHERE id = ANY($1)`, [ids]).catch(() => []),
        getPetSpriteData().catch(() => ({})),
    ]);
    const byId = new Map((buyers || []).map((b) => [b.id, b]));
    const grouped = new Map();
    for (const r of rows) {
        if (!grouped.has(r.petter_id)) grouped.set(r.petter_id, []);
        const def = collectibleById(r.pet_id);
        const sp = petMap[r.pet_id] || {};
        grouped.get(r.petter_id).push({
            petId: r.pet_id, name: def?.name || r.pet_id, rarity: def?.rarity || "common",
            spriteUrl: sp.url || null, spriteFlip: sp.flip === true, count: r.n, xp: r.xp,
        });
    }
    const visits = [...grouped.entries()].map(([pid, pets]) => {
        const b = byId.get(pid) || {};
        return {
            petter: {
                name: b.display_name || b.alias || "A visitor",
                alias: b.alias || null,
                level: levelForXp(b.xp || 0).level,
                avatarUrl: b.avatar_sprite_url || null,
                avatarFlip: b.avatar_sprite_url ? b.avatar_sprite_flip === true : false,
                border: b.equipped_border && b.equipped_border !== "none" ? b.equipped_border : null,
            },
            pets: pets.sort((a, c) => c.xp - a.xp),
            xp: pets.reduce((s, p) => s + p.xp, 0),
            count: pets.reduce((s, p) => s + p.count, 0),
        };
    }).sort((a, b) => b.xp - a.xp);
    await db.query(`UPDATE mkt_pet_visit SET seen_at = NOW() WHERE owner_id = $1 AND seen_at IS NULL`, [ownerId]).catch(() => {});
    return { visits, totalXp: rows.reduce((s, r) => s + r.xp, 0), totalVisits: rows.reduce((s, r) => s + r.n, 0), petterCount: ids.length };
}

// Pay gold to recharge the daily petting budget. Cost doubles each recharge that day.
export async function rechargePetting(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const budget = await pettingBudget(buyerId); // day-resets + gives current recharge count
    const cost = rechargeCost(budget.recharges);
    const paid = await db
        .queryOne(
            `UPDATE mkt_buyer SET gold = gold - $2, pet_farm_recharges = pet_farm_recharges + 1
              WHERE id = $1 AND pet_farm_day = ${DAY} AND gold >= $2
              RETURNING gold, pet_farm_recharges`,
            [buyerId, cost]
        )
        .catch(() => null);
    if (!paid) return { ok: false, error: "insufficient", cost, petting: flatBudget(budget, true) };
    await logCoin(buyerId, -cost, "pet_recharge", { balanceAfter: paid.gold }).catch(() => {});
    return { ok: true, spent: cost, petting: flatBudget(await pettingBudget(buyerId), true), wallet: { gold: paid.gold } };
}
