import "server-only";

import { db } from "@/lib/db";
import { getMemberMetrics, progressForRule, syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { EQUIP_SLOTS, ITEMS, describeStats, describeSea, describeFarm, describeDepth, itemById, itemFitsSlot, sumItemStats, isTradeLocked } from "@/lib/marketplace/items.js";
import { COLLECTION_PIECES, pieceById } from "@/lib/marketplace/collection-pieces.js";
import { getOwnedPieceIds, grantPiece } from "@/lib/marketplace/collection-owned.js";
import { describeUtil } from "@/lib/marketplace/item-affix.js";
import { getElementOverrides, describeItemElements } from "@/lib/marketplace/item-element.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { previewShopCoupon, consumeShopCoupon, getShopCoupon, couponedPrice } from "@/lib/marketplace/shop-coupon.js";
import { setBonusStats, activeSetBonuses, setForItem, getSetsOverview } from "@/lib/marketplace/sets.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { voidPendingTradesForItem } from "@/lib/marketplace/trade.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";

// Equipped item stats merged with any active set-bonus stats (the single source combat + the UI read).
function withSetBonuses(ids) {
    const total = sumItemStats(ids);
    for (const [k, v] of Object.entries(setBonusStats(ids))) total[k] = (total[k] || 0) + v;
    return total;
}

// ---- Requirements ----
async function memberContext(buyerId) {
    const [row, badgeRows] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    return { level: levelForXp(row?.xp || 0).level, badges: new Set(badgeRows.map((r) => r.badge_slug)) };
}

// Grant gate: drives WHEN level/milestone items are auto-gifted (syncLevelItems). Still uses reqLevel.
export function itemLockReason(item, ctx, metrics = null) {
    if (item.reqLevel && ctx.level < item.reqLevel) return `Reach Level ${item.reqLevel}`;
    if (item.reqBadge && !ctx.badges.has(item.reqBadge)) return `Requires the ${item.reqBadge} badge`;
    if (item.reqMetric && metrics) {
        const { current, target } = progressForRule(item.reqMetric, item.reqThreshold, metrics);
        if (current < target) return `Requires ${target} ${item.reqMetric.replace(/_/g, " ")}`;
    }
    return null;
}

// Equip gate: nothing restricts equipping anymore — if you OWN it, you can equip it, at any level.
// (Level, prestige badges, and metric milestones no longer gate equipping.) Item power tracks rarity,
// so gear from chests/drops/giveaways is usable immediately. Kept as a hook in case a future item wants
// a metric milestone; currently no item sets one, so it always returns null.
export function equipLockReason(item, ctx, metrics = null) {
    if (item.reqMetric && metrics) {
        const { current, target } = progressForRule(item.reqMetric, item.reqThreshold, metrics);
        if (current < target) return `Requires ${target} ${item.reqMetric.replace(/_/g, " ")}`;
    }
    return null;
}

// ---- Ownership + equipped state + aggregated stats ----
export async function getEquippedIds(buyerId) {
    const rows = await db.query(`SELECT slot, item_id FROM mkt_user_equipment WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const bySlot = {};
    for (const r of rows) bySlot[r.slot] = r.item_id;
    return bySlot;
}

// ── EVERY PIECE YOU OWN ──────────────────────────────────────────────────────────────────────────────────────
// The counterpart to getEquippedIds, and the pool the COLLECTION sets count from (see sets.js). A farming or
// mining set asks you to collect it, not to wear it: making its bonus depend on what is equipped forced people
// to keep a crafting loadout and a fighting loadout and swap between them to do two different activities,
// which is bookkeeping, not a decision. Owning the piece is the achievement; the bonus follows the piece.
// GEAR ONLY — the item bag. Named for what it returns, because the old name (`getOwnedItemIds`) read like
// "everything you own" and every caller used it that way: when trophies moved to their own table all nine
// silently began reporting sets as unfinished. If you want what a SET counts, call getOwnedSetIds.
export async function getOwnedGearIds(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return rows.map((r) => r.item_id);
}

// Forge enhancement stat bonuses for a member's given items → merged combat-stat totals. Only the items that
// are actually equipped should be passed in (enhancement rides with the item wherever it's equipped).
async function enhanceBonusFor(buyerId, itemIds) {
    if (!buyerId || !itemIds?.length) return {};
    const rows = await db.query(`SELECT stat_bonus FROM mkt_item_enhance WHERE buyer_id = $1 AND item_id = ANY($2)`, [buyerId, itemIds]).catch(() => []);
    const total = {};
    for (const r of rows) {
        const b = typeof r.stat_bonus === "string" ? (() => { try { return JSON.parse(r.stat_bonus); } catch { return {}; } })() : (r.stat_bonus || {});
        for (const [k, v] of Object.entries(b)) total[k] = (total[k] || 0) + (Number(v) || 0);
    }
    return total;
}

// Aggregated equipped stats — used by the boss combat. Includes set bonuses, Forge enhancement AND anything
// set into a socket. A gem is the same kind of number as an enhancement by the time a fight reads it, so it
// merges in the same place rather than being a fourth thing every call site has to remember.
export async function getEquippedStats(buyerId) {
    if (!buyerId) return {};
    const ids = Object.values(await getEquippedIds(buyerId));
    const total = withSetBonuses(ids);
    for (const [k, v] of Object.entries(await enhanceBonusFor(buyerId, ids))) total[k] = (total[k] || 0) + v;
    // Lazily imported: jeweller.js is server-only and this module is imported widely.
    try {
        const { socketBonusFor } = await import("@/lib/marketplace/jeweller.js");
        for (const [k, v] of Object.entries(await socketBonusFor(buyerId, ids))) total[k] = (total[k] || 0) + v;
    } catch { /* no jeweller, no gems */ }
    return total;
}

// Equipped item IDs for many members at once (Map buyer_id -> [item_id]). Used by the auto-tick to apply
// each member's elemental affinity (matching gear boosts passive damage vs a boss weak to that element).
export async function getEquippedIdsForMembers(buyerIds = []) {
    const out = new Map();
    if (!buyerIds.length) return out;
    const rows = await db.query(`SELECT buyer_id, item_id FROM mkt_user_equipment WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    for (const r of rows) { if (!out.has(r.buyer_id)) out.set(r.buyer_id, []); out.get(r.buyer_id).push(r.item_id); }
    return out;
}

// Equipped stats for many members at once (one query) — used by the hourly auto-tick.
export async function getEquippedStatsForMembers(buyerIds = []) {
    const out = new Map();
    if (!buyerIds.length) return out;
    const rows = await db.query(`SELECT buyer_id, item_id FROM mkt_user_equipment WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    const byBuyer = new Map();
    for (const r of rows) { if (!byBuyer.has(r.buyer_id)) byBuyer.set(r.buyer_id, []); byBuyer.get(r.buyer_id).push(r.item_id); }
    // Forge enhancement bonuses for all these members' EQUIPPED items, in one query.
    const enhRows = await db.query(`SELECT buyer_id, item_id, stat_bonus FROM mkt_item_enhance WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    const enhByBuyer = new Map();
    for (const r of enhRows) {
        if (!byBuyer.get(r.buyer_id)?.includes(r.item_id)) continue; // enhancement only counts while the item is equipped
        const b = typeof r.stat_bonus === "string" ? (() => { try { return JSON.parse(r.stat_bonus); } catch { return {}; } })() : (r.stat_bonus || {});
        if (!enhByBuyer.has(r.buyer_id)) enhByBuyer.set(r.buyer_id, {});
        const acc = enhByBuyer.get(r.buyer_id);
        for (const [k, v] of Object.entries(b)) acc[k] = (acc[k] || 0) + (Number(v) || 0);
    }
    // ── AND THE JEWELS ── one query for everyone, same rule as the enhancement above: it only counts while
    // the item is equipped. Without this the LADDER weighed other members without their gems while the fight
    // itself counted them, so matchmaking was aiming at a number nobody actually fought with.
    const gemByBuyer = new Map();
    try {
        const { jewelsEnabled } = await import("@/lib/marketplace/jeweller.js");
        const { sumGemStats } = await import("@/lib/marketplace/gems.js");
        const eligible = buyerIds.filter((x) => jewelsEnabled(x));
        if (eligible.length) {
            const socketRows = await db.query(
                `SELECT buyer_id, item_id, gem_id FROM mkt_item_socket WHERE buyer_id = ANY($1) AND gem_id IS NOT NULL`,
                [eligible]
            ).catch(() => []);
            const held = new Map();
            for (const r of socketRows) {
                if (!byBuyer.get(r.buyer_id)?.includes(r.item_id)) continue;
                if (!held.has(r.buyer_id)) held.set(r.buyer_id, []);
                held.get(r.buyer_id).push(r.gem_id);
            }
            for (const [bid, gemIds] of held) gemByBuyer.set(bid, sumGemStats(gemIds));
        }
    } catch { /* no bench, no gems */ }

    for (const [id, ids] of byBuyer) {
        const total = withSetBonuses(ids);
        const enh = enhByBuyer.get(id);
        if (enh) for (const [k, v] of Object.entries(enh)) total[k] = (total[k] || 0) + v;
        const gem = gemByBuyer.get(id);
        if (gem) for (const [k, v] of Object.entries(gem)) total[k] = (total[k] || 0) + v;
        out.set(id, total);
    }
    return out;
}

// A natural-language clause describing a member's equipped gear, fed into the hero-sprite prompt so the
// AI draws them wearing/wielding their loadout. Empty string if nothing equipped.
// Rarity flavor fed to the sprite art so higher-tier loot visibly looks more epic on the hero.
const GEAR_RARITY_ADJ = {
    common: "",
    rare: "finely-crafted",
    epic: "ornate glowing",
    legendary: "legendary, radiant, intricately-detailed",
    mythic: "mythic, blazing with otherworldly energy, awe-inspiring",
    ascendant: "ascendant, wreathed in molten light, transcendent",
    eternal: "eternal, radiating impossible prismatic power, godlike",
};
const gearDesc = (def) => {
    const adj = GEAR_RARITY_ADJ[def.rarity] || "";
    return adj ? `${adj} ${def.name}` : def.name;
};

// Build the gear clause from an equipped { slot: itemId } map (sync — no DB).
function gearPhraseFromSlots(bySlot) {
    const items = Object.entries(bySlot || {}).map(([slot, id]) => ({ slot, def: itemById(id) })).filter((x) => x.def);
    if (!items.length) return "";
    const parts = [];
    const weapon = items.find((x) => x.slot === "main_hand");
    const off = items.find((x) => x.slot === "off_hand");
    const back = items.find((x) => x.slot === "back");
    const armor = items.filter((x) => ["helmet", "chest", "belt", "boots"].includes(x.slot)).map((x) => gearDesc(x.def));
    const acc = items.filter((x) => ["ring1", "ring2", "amulet"].includes(x.slot)).map((x) => gearDesc(x.def));
    if (weapon) parts.push(`wielding a ${gearDesc(weapon.def)}`);
    if (off) parts.push(`carrying a ${gearDesc(off.def)}`);
    if (armor.length) parts.push(`wearing ${armor.join(", ")}`);
    if (back) parts.push(`a ${gearDesc(back.def)} flowing dramatically from their back`);
    if (acc.length) parts.push(`adorned with ${acc.join(", ")}`);
    const rank = { legendary: 1, mythic: 2, ascendant: 3, eternal: 4 };
    const best = items.reduce((b, x) => (rank[x.def.rarity] > (rank[b] || 0) ? x.def.rarity : b), null);
    const aura = best === "eternal"
        ? " This is a GODLIKE, eternal champion — their gear blazes with impossible prismatic rainbow light, radiant energy pours off them, and reality bends and warps around their silhouette."
        : best === "ascendant"
        ? " This is an ASCENDANT hero — their gear is wreathed in molten orange-gold light and transcendent fire, clearly beyond legendary."
        : best === "mythic"
        ? " This is a legendary champion — their gear radiates a brilliant teal magical aura and glowing energy."
        : best === "legendary"
        ? " Their finest pieces glow with golden power."
        : "";
    // Powers: signature / charged (elite) gear visibly crackles with magical energy, so the art reads "strong".
    const powered = items.some((x) => signatureFor(x.def.id) || x.def.charged);
    const powerClause = powered ? " Their most powerful pieces crackle with visible arcane energy — glowing runes, sparks, and magical light trailing off the gear." : "";
    return parts.length ? `The hero is ${parts.join(", ")} — draw every piece of equipment clearly as worn armor, a flowing cape, and held weapons, matching each item's rarity and power.${aura}${powerClause}` : "";
}

export async function getEquippedGearPhrase(buyerId) {
    return gearPhraseFromSlots(await getEquippedIds(buyerId));
}

// Batched: gear phrases for many members in ONE query (used by the admin sprite list so the on-phone
// regenerate includes each member's equipment, not just the cron path).
export async function getEquippedGearPhrasesForMembers(buyerIds = []) {
    const map = new Map();
    if (!buyerIds.length) return map;
    const rows = await db.query(`SELECT buyer_id, slot, item_id FROM mkt_user_equipment WHERE buyer_id = ANY($1)`, [buyerIds]).catch(() => []);
    const bySlotByBuyer = new Map();
    for (const r of rows) {
        if (!bySlotByBuyer.has(r.buyer_id)) bySlotByBuyer.set(r.buyer_id, {});
        bySlotByBuyer.get(r.buyer_id)[r.slot] = r.item_id;
    }
    for (const [id, bySlot] of bySlotByBuyer) map.set(id, gearPhraseFromSlots(bySlot));
    return map;
}

// Grant a random not-yet-owned item from a source pool (e.g. a boss-kill drop). Returns the item or null.
export async function grantRandomDrop(buyerId, { source = "boss_drop" } = {}) {
    const pool = ITEMS.filter((i) => i.source === source);
    if (!pool.length) return null;
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    const candidates = pool.filter((i) => !owned.has(i.id));
    if (!candidates.length) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const res = await grantItem(buyerId, pick.id, source);
    return res.granted ? pick : null;
}

// ── SALVAGE FODDER ───────────────────────────────────────────────────────────────────────────────────────────
// Junk gear, granted on purpose. The Forge eats gear to make parts, but every other source of gear is either
// slow (chests) or one-per-lifetime, so a smith runs out of things to melt long before they run out of things
// to enhance. Skirmish foes (goblins/bandits) fill that gap: they drop cheap COMMON/RARE pieces from the chest
// pool, which is a renewable supply precisely because salvaging destroys the item — melt it and it becomes
// eligible to drop again. Deliberately capped at rare so this never becomes a shortcut to real gear.
const FODDER_RARITIES = new Set(["common", "rare"]);
export async function grantSalvageFodder(buyerId, { source = "raid_drop" } = {}) {
    if (!buyerId) return null;
    const pool = ITEMS.filter((i) => i.source === "chest" && FODDER_RARITIES.has(i.rarity) && !i.charged);
    if (!pool.length) return null;
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    const candidates = pool.filter((i) => !owned.has(i.id));
    if (!candidates.length) return null; // owns every scrap already — the caller falls back to gold/chests
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const res = await grantItem(buyerId, pick.id, source);
    return res.granted ? pick : null;
}

// Grant a random EARNABLE real-world perk the member doesn't already own (used by play rewards, e.g. a
// boss win). Only items flagged `earnable` are eligible — the owner still redeems any charge in-store, so
// real payout stays controlled. Returns the item (with charges) or null if they own them all.
export async function grantRandomEarnablePerk(buyerId) {
    if (!buyerId) return null;
    const pool = ITEMS.filter((i) => i.charged && i.earnable);
    if (!pool.length) return null;
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    const candidates = pool.filter((i) => !owned.has(i.id));
    if (!candidates.length) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const res = await grantItem(buyerId, pick.id, "boss_reward");
    return res.granted ? pick : null;
}

// Availability of a charged item's next use (charges left + cooldown elapsed).
function chargeState(ownedRow, item) {
    if (!item?.charged) return null;
    const left = Math.max(0, ownedRow?.charges_left ?? 0);
    const cd = Math.max(0, item.cooldownDays || 0);
    const last = ownedRow?.last_charge_at ? new Date(ownedRow.last_charge_at).getTime() : 0;
    const readyAt = last ? last + cd * 86400000 : 0;
    const now = Date.now();
    return {
        charges: item.charges, left,
        available: left > 0 && now >= readyAt,
        cooldownUntil: left > 0 && now < readyAt ? new Date(readyAt).toISOString() : null,
        reward: item.chargeReward, rewardLabel: item.chargeRewardLabel,
    };
}

// Gold a member gets for selling gear back, by rarity (mirrors the chest "dust" values). Charged perk
// items hold real-world value, so they can't be sold for gold.
const SELL_VALUES = { common: 25, rare: 60, epic: 140, legendary: 350, mythic: 900, ascendant: 2500, eternal: 6000 };
// Power ordering for the shop so it reads as one clean worst→best ladder (the catalog itself is grouped
// by when items were added, which otherwise makes the shop restart at "worst" every batch).
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
export const sellValueOf = (item) => (item?.charged ? 0 : (SELL_VALUES[item?.rarity] || 25));

// Full inventory view for the member's screen: owned items (+ charge state), the equipped loadout by slot,
// and total stats.
export async function getInventory(buyerId) {
    if (!buyerId) return { items: [], equipped: {}, slots: EQUIP_SLOTS, stats: {}, gold: 0, shop: [] };
    const [ownedRows, bySlot, goldRow, enhRows, listedRows] = await Promise.all([
        db.query(`SELECT item_id, acquired_via, charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getEquippedIds(buyerId),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        // stat_bonus comes along too. Without it the bag could say an item was "+1" but not what the +1 gave
        // you — you could see that you had forged something and never what it bought.
        db.query(`SELECT item_id, level, util, stat_bonus FROM mkt_item_enhance WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id FROM mkt_auction WHERE seller_id = $1 AND status = 'active'`, [buyerId]).catch(() => []),
    ]);
    const elemOver = await getElementOverrides(buyerId).catch(() => ({})); // reforged elemental affinities
    // Sockets and what is set in them. Lazily imported (jeweller.js is server-only and this module is imported
    // widely) and empty for anyone the bench is not open to, so a gated feature adds nothing to their bag.
    const socketed = await (async () => {
        try {
            const { socketsFor, jewelsEnabled } = await import("@/lib/marketplace/jeweller.js");
            if (!jewelsEnabled(buyerId)) return {};
            return await socketsFor(buyerId);
        } catch { return {}; }
    })();
    const { gemById } = await import("@/lib/marketplace/gems.js");
    // Items you have up for auction are "in escrow" — don't show them in the bag (an auto-re-granted level item
    // could otherwise reappear here while it's still listed).
    const listedSet = new Set(listedRows.map((r) => r.item_id));
    const ownedIds = new Set(ownedRows.map((r) => r.item_id));
    const equippedIds = new Set(Object.values(bySlot));
    const enhById = new Map((enhRows || []).map((r) => [r.item_id, { level: r.level, util: r.util, statBonus: r.stat_bonus || null }]));
    const items = ownedRows
        .filter((r) => !listedSet.has(r.item_id)) // hide anything currently up for auction
        .map((r) => {
            const def = itemById(r.item_id);
            if (!def) return null;
            const set = setForItem(def.id);
            const enh = enhById.get(def.id);
            return { ...def, owned: true, equipped: equippedIds.has(def.id), bound: isTradeLocked(def.rarity), enhanceLevel: enh?.level || 0,
                // The forge bonus ALONE, phrased like every other stat line, so "+1" can finally say what it
                // bought. The Auction House has shown this on a listing for ages; your own bag never did, so
                // the one place you inspect your own gear was the one place the enhancement was invisible.
                forgeStats: enh?.statBonus && Object.keys(enh.statBonus).length ? describeStats(enh.statBonus) : null,
                // The forge bonus as NUMBERS as well as prose. The compare panel needs to add it to the base
                // stats: without it, weighing a new piece against an enhanced one compared the new item to the
                // equipped item's UNFORGED self and called a downgrade a sidegrade.
                forgeBonus: enh?.statBonus && Object.keys(enh.statBonus).length ? enh.statBonus : null,
                // The socket, and the gem in it — so every grid that draws this item can show it.
                socket: Boolean((socketed[def.id] || []).length),
                gem: (() => { const g = (socketed[def.id] || []).find((x) => x.gemId); return g ? gemById(g.gemId) : null; })(),
                util: describeUtil(enh?.util), elements: describeItemElements(def.id, elemOver[def.id]), charge: chargeState(r, def), signature: signatureFor(def.id), sellValue: sellValueOf(def), setName: set?.name || null, setId: set?.id || null, farmText: def.farm ? describeFarm(def.farm) : null,
                // Trophies are not items any more, so nothing in this bag can be one and the flag is always
                // false. Kept on the payload so the client's existing branches stay valid until they are cleaned
                // up; the collections panel reads mkt_user_collection directly.
                collectionPiece: false };
        })
        .filter(Boolean)
        .sort((a, z) => (a.sort || 100) - (z.sort || 100));
    const gold = goldRow?.gold || 0;
    const coupon = await getShopCoupon(buyerId).catch(() => null);
    // The gold shop: xp_shop items you don't own yet. effectiveCost folds in an active coupon so the price
    // shown + affordability match what the buy actually charges (canAfford on FULL price was a bug — an item
    // you could afford at half price still read "need more").
    // The shop sells GEAR and the nine COLLECTION pieces priced in gold. Trophies live in their own table now,
    // so they have to be concatenated in explicitly — leaving them to ITEMS would have quietly emptied nine
    // shelves. A trophy shows no slot and no combat stats, because it has neither.
    const ownedPieceIds = new Set(await getOwnedPieceIds(buyerId).catch(() => []));
    const shopPieces = COLLECTION_PIECES.filter((p) => p.source === "xp_shop" && !ownedPieceIds.has(p.id))
        .map((p) => {
            const cost = Math.max(0, p.xpCost || 0);
            const effectiveCost = couponedPrice(coupon, cost);
            const set = setForItem(p.id);
            return {
                id: p.id, name: p.name, slot: null, rarity: p.rarity, icon: p.icon, reqLevel: null,
                stats: null, statsText: "", sea: p.sea || null, depth: p.depth || null, signature: null,
                farmText: p.farm ? describeFarm(p.farm) : null,
                setName: set?.name || null, setId: set?.id || null, collectionPiece: true,
                cost, effectiveCost, discounted: effectiveCost < cost, canAfford: gold >= effectiveCost, shop: true,
            };
        });
    const shop = ITEMS.filter((i) => i.source === "xp_shop" && !ownedIds.has(i.id))
        .map((i) => {
            const cost = Math.max(0, i.xpCost || 0);
            const effectiveCost = couponedPrice(coupon, cost);
            const set = setForItem(i.id);
            return {
                id: i.id, name: i.name, slot: i.slot, rarity: i.rarity, icon: i.icon, reqLevel: i.reqLevel,
                stats: i.stats, statsText: describeStats(i.stats), sea: i.sea || null, depth: i.depth || null, signature: signatureFor(i.id),
                // Base elements only, and correctly so: an override belongs to an OWNER, and nothing in the
                // shop is owned yet. What you see on the shelf is what the piece arrives attuned to.
                elements: describeItemElements(i.id, null),
                farmText: i.farm ? describeFarm(i.farm) : null,
                setName: set?.name || null, setId: set?.id || null,
                cost, effectiveCost, discounted: effectiveCost < cost, canAfford: gold >= effectiveCost, shop: true,
            };
        })
        .concat(shopPieces)
        // One clean progression: rarity, then price, then level — no more "worst again" as you scroll.
        .sort((a, z) => (RARITY_RANK[a.rarity] ?? 9) - (RARITY_RANK[z.rarity] ?? 9) || a.cost - z.cost || (a.reqLevel || 0) - (z.reqLevel || 0));
    const equippedList = Object.values(bySlot);
    // THE TROPHIES YOU OWN. They stopped being items, which is right — but the bag screen built its Trophies
    // section by FILTERING the bag, so the moment they left it the section emptied and members watched
    // collections they had nearly finished disappear. They come down as their own list now.
    const pieces = [...ownedPieceIds]
        .map((id) => { const p = pieceById(id); if (!p) return null; const set = setForItem(id);
            return { id, name: p.name, rarity: p.rarity, icon: p.icon, flavor: p.flavor || null,
                sea: p.sea || null, farm: p.farm || null, depth: p.depth || null,
                seaText: p.sea ? describeSea(p.sea) : null, farmText: p.farm ? describeFarm(p.farm) : null,
                depthText: p.depth ? describeDepth(p.depth) : null,
                setName: set?.name || null, setId: set?.id || null, collectionPiece: true }; })
        .filter(Boolean)
        .sort((a, z) => String(a.setName || "").localeCompare(String(z.setName || "")) || a.name.localeCompare(z.name));
    return { items, pieces, equipped: bySlot, slots: EQUIP_SLOTS, stats: withSetBonuses(equippedList), gold, shop, setBonuses: activeSetBonuses(equippedList), setsOverview: getSetsOverview(equippedList, [...ownedIds, ...ownedPieceIds]), coupon };
}

// Buy an xp_shop item with gold. Atomic deduction. Body validated in the route.
export async function buyItem(buyerId, itemId) {
    // A shop shelf can hold a trophy as well as gear. Same gold, same coupon, different bag on the way out.
    const piece = pieceById(itemId);
    if (piece) return buyPiece(buyerId, piece);
    const item = itemById(itemId);
    if (!item || item.source !== "xp_shop") return { ok: false, error: "not_for_sale" };
    const base = Math.max(0, item.xpCost || 0);
    const owned = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (owned) return { ok: false, error: "already_owned" };
    const cp = await previewShopCoupon(buyerId, base); // apply a login coupon if one's active
    const cost = cp.price;
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await logCoin(buyerId, -cost, "buy_gear", { meta: { name: item.name }, balanceAfter: row.gold }).catch(() => {});
    if (cp.pct > 0) await consumeShopCoupon(buyerId);
    await grantItem(buyerId, itemId, "xp_shop");
    await trackActivity(buyerId, "buy_gear", { itemId, name: item.name, cost, couponPct: cp.pct || 0 });
    return { ok: true, gold: row.gold, couponPct: cp.pct || 0 };
}

// Buying a COLLECTION piece. Deliberately a sibling of buyItem rather than a branch inside it: the two share a
// price and a coupon and nothing else — a trophy is never equipped, never sold back, and owning it is the whole
// transaction.
async function buyPiece(buyerId, piece) {
    if (piece.source !== "xp_shop") return { ok: false, error: "not_for_sale" };
    const already = await getOwnedPieceIds(buyerId).catch(() => []);
    if (already.includes(piece.id)) return { ok: false, error: "already_owned" };
    const cp = await previewShopCoupon(buyerId, Math.max(0, piece.xpCost || 0));
    const cost = cp.price;
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await logCoin(buyerId, -cost, "buy_gear", { meta: { name: piece.name }, balanceAfter: row.gold }).catch(() => {});
    if (cp.pct > 0) await consumeShopCoupon(buyerId);
    await grantPiece(buyerId, piece.id, "xp_shop");
    await trackActivity(buyerId, "buy_gear", { itemId: piece.id, name: piece.name, cost, couponPct: cp.pct || 0 });
    return { ok: true, gold: row.gold, couponPct: cp.pct || 0 };
}

// Sell an owned item back for gold. Unequips it first if worn, credits the rarity sell value, and records
// the sale so a 'level' item never auto-re-grants itself (which would be an infinite gold farm). Charged
// real-world-perk items can't be sold.
export async function sellItem(buyerId, itemId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    if (item.charged) return { ok: false, error: "not_sellable" };
    // Selling a collection piece would silently delete a permanent bonus for a handful of gold. There is no
    // version of that trade anybody takes on purpose.
    const value = sellValueOf(item);
    // Remove ownership atomically-ish: delete the owned row (source of truth) and only pay out if it existed.
    await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => {});
    const del = await db.queryOne(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2 RETURNING id`, [buyerId, itemId]).catch(() => null);
    // The jewel is yours, not the item's — it comes back to the bag rather than leaving with the piece.
    try { const { reclaimGems } = await import("@/lib/marketplace/jeweller.js"); await reclaimGems(buyerId, itemId, "sold"); } catch { /* no bench, no gems */ }
    if (!del) return { ok: false, error: "not_owned" };
    await db.query(`INSERT INTO mkt_sold_item (buyer_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [buyerId, itemId]).catch(() => {});
    // The item is gone — void any pending trades that were counting on it (refunds their escrow).
    await voidPendingTradesForItem(buyerId, itemId).catch(() => {});
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, value]).catch(() => null);
    await logCoin(buyerId, value, "sell_gear", { meta: { name: item.name }, balanceAfter: row?.gold }).catch(() => {});
    await bumpEquipment(buyerId); // a slot may have emptied — re-gear the sprite
    await trackActivity(buyerId, "sell_gear", { itemId, name: item.name, value });
    return { ok: true, sold: value, gold: row?.gold ?? null };
}

// ---- Mutations ----
async function bumpEquipment(buyerId) {
    // Mark gear changed (queues a nightly sprite redraw) and reset the sprite retry counter — a real gear
    // change earns a fresh retry budget so a previously-stuck sprite gets another shot.
    await db
        .query(`UPDATE mkt_buyer SET equipment_updated_at = NOW(), avatar_sprite_attempts = 0, avatar_sprite_error = NULL WHERE id = $1`, [buyerId])
        .catch(() => {});
}

export async function equipItem(buyerId, slot, itemId) {
    if (!buyerId) throw new Error("Not signed in.");
    const item = itemById(itemId);
    if (!item) throw new Error("Unknown item.");
    // A collection piece is a trophy, not gear: its bonus is already yours for owning it, so a slot spent on
    if (!itemFitsSlot(item, slot)) throw new Error(`That doesn't go in the ${slot} slot.`);
    const owned = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owned) throw new Error("You don't own that item.");
    // Nothing gates equipping anymore — own it, equip it. (Metric-milestone hook kept for future items.)
    if (item.reqMetric) {
        const ctx = await memberContext(buyerId);
        const metrics = await getMemberMetrics(buyerId).catch(() => null);
        const lock = equipLockReason(item, ctx, metrics);
        if (lock) throw new Error(lock + " to equip this.");
    }
    // If it's equipped in the OTHER ring slot, move it (an item can't be in two slots).
    await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => {});
    await db.query(
        `INSERT INTO mkt_user_equipment (buyer_id, slot, item_id) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, slot) DO UPDATE SET item_id = $3`,
        [buyerId, slot, itemId]
    );
    await bumpEquipment(buyerId);
    await trackActivity(buyerId, "equip", { itemId, name: item.name, slot });
    return getInventory(buyerId);
}

export async function unequipItem(buyerId, slot) {
    if (!buyerId) throw new Error("Not signed in.");
    await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND slot = $2`, [buyerId, slot]).catch(() => {});
    await bumpEquipment(buyerId);
    await trackActivity(buyerId, "unequip", { slot });
    return getInventory(buyerId);
}

// Grant an item (level unlock, boss drop, admin, xp shop). Idempotent per (buyer, item). Inits charges.
export async function grantItem(buyerId, itemId, via = "admin") {
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    const rows = await db
        .query(
            `INSERT INTO mkt_user_item (buyer_id, item_id, acquired_via, charges_left)
             VALUES ($1, $2, $3, $4) ON CONFLICT (buyer_id, item_id) DO NOTHING RETURNING id`,
            [buyerId, itemId, via, item.charged ? item.charges : 0]
        )
        .catch(() => []);
    const granted = rows.length > 0;
    // Getting a NEW top-rarity item unlocks its elite pet + re-checks the Ascendant/Eternal badges.
    if (granted && (item.rarity === "ascendant" || item.rarity === "eternal")) await onEliteItemGained(buyerId, item).catch(() => {});
    return { ok: true, granted };
}

// Elite-item side effects: re-check the Ascendant/Eternal badges. (The apex pets Molten Phoenix / Eternal
// Wolf Spirit are NO LONGER auto-granted just for owning an elite item — that was far too easy. They now
// require a hard achievement — an elite relic PLUS boss-raffle wins — see ACHIEVEMENT_PET_RULES in pets.js.)
async function onEliteItemGained(buyerId, item) {
    await syncEarnedBadges(buyerId).catch(() => {});
}

// Auto-grant the level/milestone items a member now qualifies for (source: 'level'). Like pets unlocking.
export async function syncLevelItems(buyerId) {
    if (!buyerId) return [];
    const [ctx, ownedRows, metrics, soldRows, listedRows] = await Promise.all([
        memberContext(buyerId),
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        getMemberMetrics(buyerId).catch(() => null),
        db.query(`SELECT item_id FROM mkt_sold_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id FROM mkt_auction WHERE seller_id = $1 AND status = 'active'`, [buyerId]).catch(() => []),
    ]);
    const owned = new Set(ownedRows.map((r) => r.item_id));
    const sold = new Set(soldRows.map((r) => r.item_id)); // sold gear stays sold — never auto-re-granted
    const listed = new Set(listedRows.map((r) => r.item_id)); // a level item you've LISTED must not be re-granted under you
    const granted = [];
    for (const item of ITEMS) {
        if (item.source !== "level" || owned.has(item.id) || sold.has(item.id) || listed.has(item.id)) continue;
        if (itemLockReason(item, ctx, metrics)) continue;
        const res = await grantItem(buyerId, item.id, "level");
        if (res.granted) granted.push(item);
    }
    return granted;
}

// ---- Admin: charged-perk redemption ----
export async function redeemCharge(buyerId, itemId, { by = "admin", note = null } = {}) {
    const item = itemById(itemId);
    if (!item?.charged) return { ok: false, error: "not_chargeable" };
    const owned = await db.queryOne(`SELECT charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owned) return { ok: false, error: "not_owned" };
    const state = chargeState(owned, item);
    if (!state.available) return { ok: false, error: state.left <= 0 ? "no_charges" : "on_cooldown", cooldownUntil: state.cooldownUntil };

    // CHECK-THEN-ACT, and these are REAL-WORLD rewards — a free pack, a playmat, a tournament seat. The read
    // above and the write below were separate, and the write carried no guard of its own: two taps landing
    // together in the admin app both passed the JS check off the same stale row, both decremented, and the
    // member walked out with two of something they owned one of. charges_left could even go negative.
    //
    // The UPDATE is now the authority. The cooldown is in the WHERE too, expressed against last_charge_at in
    // SQL rather than compared in JS, so a second tap inside the cooldown window loses the race in the
    // database instead of being waved through by a clock that was read a moment ago.
    const spent = await db.queryOne(
        `UPDATE mkt_user_item
            SET charges_left = charges_left - 1, last_charge_at = NOW()
          WHERE buyer_id = $1 AND item_id = $2 AND charges_left > 0
            AND (last_charge_at IS NULL OR last_charge_at <= NOW() - ($3 || ' days')::interval)
          RETURNING charges_left`,
        [buyerId, itemId, Math.max(0, item.cooldownDays || 0)]
    ).catch(() => null);
    if (!spent) {
        // Lost the race. Re-read so the caller is told which of the two reasons it actually was.
        const now = await db.queryOne(`SELECT charges_left, last_charge_at FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
        const s2 = chargeState(now, item);
        return { ok: false, error: (s2?.left ?? 0) <= 0 ? "no_charges" : "on_cooldown", cooldownUntil: s2?.cooldownUntil ?? null };
    }
    await db.query(
        `INSERT INTO mkt_item_redemption (buyer_id, item_id, reward, reward_label, redeemed_by, note) VALUES ($1, $2, $3, $4, $5, $6)`,
        [buyerId, itemId, item.chargeReward, item.chargeRewardLabel, by, note]
    ).catch(() => {});
    return { ok: true, chargesLeft: Math.max(0, Number(spent.charges_left) || 0), reward: item.chargeRewardLabel };
}

// Members holding charged items, for the admin redemption browser. `q` matches name/alias/email.
export async function listUsableItems({ q = "" } = {}) {
    const term = String(q || "").trim().toLowerCase();
    const chargedIds = ITEMS.filter((i) => i.charged).map((i) => i.id);
    if (!chargedIds.length) return [];
    const params = [chargedIds];
    let where = `ui.item_id = ANY($1)`;
    if (term) { params.push(`%${term}%`); where += ` AND LOWER(COALESCE(b.display_name,'') || ' ' || COALESCE(b.alias,'') || ' ' || COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'') || ' ' || COALESCE(b.email,'')) LIKE $2`; }
    const rows = await db
        .query(
            `SELECT b.id AS buyer_id, b.display_name, b.first_name, b.last_name, b.alias, b.email,
                    ui.item_id, ui.charges_left, ui.last_charge_at
               FROM mkt_user_item ui JOIN mkt_buyer b ON b.id = ui.buyer_id
              WHERE ${where}
              ORDER BY b.display_name NULLS LAST, b.alias NULLS LAST`,
            params
        )
        .catch(() => []);
    const byBuyer = new Map();
    for (const r of rows) {
        const def = itemById(r.item_id);
        if (!def) continue;
        if (!byBuyer.has(r.buyer_id)) {
            byBuyer.set(r.buyer_id, {
                buyerId: r.buyer_id,
                name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || r.alias || "Member",
                alias: r.alias || null,
                email: r.email || null,
                items: [],
            });
        }
        byBuyer.get(r.buyer_id).items.push({ itemId: def.id, name: def.name, ...chargeState(r, def) });
    }
    return [...byBuyer.values()];
}

// Admin cost dashboard: real-world perk redemptions over the last `days`, as a total, a per-reward
// breakdown, and the most recent redemptions (who + what + when). Reads the mkt_item_redemption log.
export async function redemptionSummary({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
    const [byReward, recent] = await Promise.all([
        db.query(
            `SELECT COALESCE(reward_label, reward, 'Perk') AS label, COUNT(*)::int AS n
               FROM mkt_item_redemption
              WHERE redeemed_at >= NOW() - ($1::int || ' days')::interval
              GROUP BY 1 ORDER BY n DESC`,
            [d]
        ).catch(() => []),
        db.query(
            `SELECT COALESCE(r.reward_label, r.reward, 'Perk') AS label, r.redeemed_at,
                    COALESCE(b.display_name, b.alias, b.first_name, 'Member') AS member
               FROM mkt_item_redemption r JOIN mkt_buyer b ON b.id = r.buyer_id
              ORDER BY r.redeemed_at DESC LIMIT 15`
        ).catch(() => []),
    ]);
    return { days: d, total: byReward.reduce((s, r) => s + r.n, 0), byReward, recent };
}
