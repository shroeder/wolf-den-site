import "server-only";

// ── THE DB HALF OF PATRONAGE ─────────────────────────────────────────────────────────────────────────────────
// patronage.js holds the rules and is pure so the haul can be simulated across ten thousand receipts; this
// holds the grants. Same split as forest/forest-store and captains/captains-store, for the same reason.

import { db } from "@/lib/db";
// lifetimeSpendDollars lives in xp.js, beside the purchase event it reads. It was briefly redefined
// here, which would have been the third copy of a rule that was already written twice.
import { lifetimeSpendDollars } from "@/lib/marketplace/xp.js";
import { nextPatronRung, patronPetsCrossed, patronPetsFor, rollHaul } from "@/lib/marketplace/patronage.js";

// ── THE LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Grant every patronage pet a member's lifetime spend has earned, and say which ones were actually new.
 *
 * ⚠️ IT GRANTS THE WHOLE LADDER, NOT THE RUNG JUST CROSSED — which is what makes the backfill free. A member
 * who has spent $300 over four months owns the first three the first time this runs for them, because the
 * question asked is "what has this lifetime earned" and never "what happened just now". ON CONFLICT DO NOTHING
 * makes it idempotent, so running it again, or running the backfill script twice, cannot double-grant or
 * re-announce anything.
 */
export async function grantPatronPets(buyerId, dollars) {
    const earned = patronPetsFor(dollars);
    if (!earned.length) return [];
    const rows = await db.query(
        `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref)
         SELECT $1, 'pet', unnest($2::text[])
         ON CONFLICT DO NOTHING
         RETURNING ref`,
        [buyerId, earned.map((p) => p.id)]
    ).catch(() => []);
    const fresh = new Set((rows || []).map((r) => r.ref));
    return earned.filter((p) => fresh.has(p.id));
}

// ── THE HAUL ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Turn a rolled hand of intents into real things, and hand back what to draw.
 *
 * Every grant is best-effort and independently caught. A member standing at the counter with their phone out
 * must not see a scan fail because the Forge module threw — the XP and the gold are already banked by the time
 * this runs, and a haul that pays six of seven lines is a far better outcome than a red error on the one
 * screen where the shop has their full attention.
 */
// What a recipe roll pays when the member has already read every page in their band. One tier below the
// band's own chest, so a full book is still worth something and never worth MORE than the roll it replaced.
const FALLBACK_CHEST = { plain: "wooden", good: "wooden", rich: "iron", lavish: "gold" };

export async function payHaul(buyerId, hand, band) {
    const out = [];
    for (const x of hand) {
        try {
            if (x.kind === "gold") {
                const { mint } = await import("@/lib/marketplace/gold-rate.js");
                const { logCoin } = await import("@/lib/marketplace/coins.js");
                // ⚠️ THROUGH mint(), like every other faucet. Gold added straight to the row is gold the one
                // lever that controls the mint rate cannot see. See [[gold-mint-rate-lever]].
                const n = mint(x.n, "patronage");
                const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, n]).catch(() => null);
                await logCoin(buyerId, n, "patronage", { balanceAfter: paid?.gold }).catch(() => {});
                out.push({ kind: "gold", n });
            } else if (x.kind === "doubloons") {
                const { grantDoubloons } = await import("@/lib/marketplace/sailing.js");
                await grantDoubloons(buyerId, x.n);
                out.push({ kind: "doubloons", n: x.n });
            } else if (x.kind === "parts") {
                const { addParts } = await import("@/lib/marketplace/crafting.js");
                await addParts(buyerId, x.tier, x.n);
                out.push({ kind: "parts", n: x.n, tier: x.tier });
            } else if (x.kind === "chest") {
                const { addChests } = await import("@/lib/marketplace/chests.js");
                // n, not 1 — chests of one tier merge into a single intent, so a rich hand that rolled three
                // gold chests is one line saying x3 rather than three identical rows.
                const n = Math.max(1, Number(x.n) || 1);
                await addChests(buyerId, { [x.tier]: n }, { source: "patronage" });
                out.push({ kind: "chest", tier: x.tier, n });
            } else if (x.kind === "token") {
                // ── A CREATION, THROWN IN AT THE COUNTER ─────────────────────────────────────────────
                // Luke: "a 190 dollar purchase should give ... a few generation tokens." Worth being explicit
                // that this is a DELIBERATE reversal: creation-tokens-server.js says a Creation is minted at
                // checkout, by an admin grant, "or not at all", because token grants had been scattered across
                // reward paths and a SKU that is also loot is a SKU nobody buys. The line still holds for
                // every free earner in the game — this is the one exception, and it is the one that cannot be
                // farmed, because the only way to roll on this table is to spend real money at the counter.
                const { grantCustomCredit } = await import("@/lib/marketplace/custom-deco.js");
                const n = Math.max(1, Number(x.n) || 1);
                await grantCustomCredit(buyerId, n, {
                    source: "patronage", actorId: buyerId, actorLabel: "counter haul", meta: { band },
                });
                out.push({ kind: "token", n });
            } else if (x.kind === "recipe") {
                const { grantRecipeReward } = await import("@/lib/marketplace/cooking.js");
                // Returns null when they already know every page in the band. A dud line reads as the screen
                // being broken, so the roll falls through to the band's chest instead of paying nothing —
                // same fallback shape grantRecipeReward's own doc comment recommends.
                const rec = await grantRecipeReward(buyerId, x.band);
                if (rec) {
                    out.push({ kind: "recipe", id: rec.id, name: rec.name, tier: rec.tier || 1 });
                } else {
                    const { addChests } = await import("@/lib/marketplace/chests.js");
                    const tier = FALLBACK_CHEST[band] || "wooden";
                    await addChests(buyerId, { [tier]: 1 }, { source: "patronage" });
                    out.push({ kind: "chest", tier, n: 1 });
                }
            } else if (x.kind === "seed") {
                const { grantSeedFromBand } = await import("@/lib/marketplace/farm-crops.js");
                // The band name is `patron_<band>` and every one of the four is declared in SEED_BANDS. An
                // undeclared band is not an error here, it is a silent nothing — which is exactly how
                // `ship_battle` spent a while promising seeds and handing over none.
                const sd = await grantSeedFromBand(buyerId, `patron_${band}`);
                if (sd) out.push({ kind: "seed", id: sd.seedId || null, name: sd.name || null, emoji: sd.emoji || null, rarity: sd.rarity || null, n: x.n });
            } else if (x.kind === "crop") {
                const { SEEDS, SEED_BANDS } = await import("@/lib/marketplace/farm-crops.js");
                const { addToPantry } = await import("@/lib/marketplace/cooking.js");
                // Crops come out of the same band as the seeds, so a lavish receipt is not paying rich seeds
                // and common turnips. Picked here rather than by grantSeedFromBand because a crop goes to the
                // PANTRY, which is where a harvested one goes — the haul feeds the kitchen the way the garden
                // does rather than inventing a second kind of crop.
                const w = SEED_BANDS[`patron_${band}`] || {};
                const total = Object.values(w).reduce((n, v) => n + v, 0) || 1;
                let r = Math.random() * total, rarity = "common";
                for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) { rarity = k; break; } }
                const pool = Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === rarity);
                const cropId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "wheat";
                await addToPantry(buyerId, "crop", cropId, x.n);
                out.push({ kind: "crop", id: cropId, name: SEEDS[cropId]?.name || cropId, emoji: SEEDS[cropId]?.emoji || "🌾", rarity, n: x.n });
            } else if (x.kind === "gear") {
                const { randomDropPool } = await import("@/lib/marketplace/items.js");
                const { grantItem } = await import("@/lib/marketplace/inventory.js");
                const pool = randomDropPool((i) => i.rarity === x.rarity && !i.charged);
                const pickItem = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
                if (pickItem) {
                    const g = await grantItem(buyerId, pickItem.id, "patronage");
                    out.push({ kind: "gear", id: pickItem.id, name: pickItem.name, rarity: pickItem.rarity,
                        slot: pickItem.slot || null, icon: pickItem.icon || null, isNew: Boolean(g?.granted) });
                }
            }
        } catch { /* one line of a haul is never worth failing the scan over */ }
    }
    return out;
}

// ── AND EVERY LINE GETS ITS REAL ARTWORK ─────────────────────────────────────────────────────────────────────
// Luke: "Show actual sprites ... And it should always use full sprites and item cards."
//
// The screen drew nine different kinds of reward as the same handful of react-icons glyphs — a pair of crossed
// swords for a Legendary ring, a cog for Tempered Steel — while the painted sprite for every one of them was
// already generated, already paid for and already on the shelf somewhere else in the Den. A reward you cannot
// recognise is a receipt line.
//
// ⚠️ RESOLVED HERE, ON THE SERVER, IN ONE PASS — not per card in the browser. Four reads at most, each an
// ANY($1) over the ids this hand actually contains, and itemSpriteMap is already a five-minute cache. The
// alternative is every card fetching its own art on the one screen a member opens holding their phone at the
// counter. See CLAUDE.md on convenience calls, and road-prizes.js for the same shape.
//
// Nothing here can fail the scan: every read falls back to the kind's generic sprite, and ChestIcon draws a
// chest for a tier whose art the cron has not made yet.
const KIND_ART = {
    gold: "/images/ui/coin.png",
    doubloons: "/images/sailing/doubloon.png",
    parts: "/images/ui/parts.png",
    chest: "/images/ui/chest.png",
    seed: "/images/ui/seed.png",
    crop: "/images/nav/farm.png",
    recipe: "/images/cooking/dish.png",
    // The Creations palette the nav already uses. It was the ONE kind in the haul with no artwork anywhere —
    // CreationTokensClient draws a paintbrush emoji in seven places — and this file is on disk, in the house
    // style, referenced by nothing. See [[check-existing-sprites-first]] and [[no-emoji-in-ui]].
    token: "/images/nav/creations.png",
};

// What rarity frame a thing that has no rarity of its own wears. A chest is the tier it is; a page is its tier.
const CHEST_RARITY = { wooden: "common", iron: "rare", gold: "epic", mythic: "legendary", ascendant: "ascendant", eternal: "eternal" };
const TIER_RARITY = ["common", "common", "rare", "epic", "legendary", "mythic", "mythic"];

export async function dressHaul(hand) {
    const gearIds = hand.filter((x) => x.kind === "gear" && x.id).map((x) => x.id);
    const pageIds = hand.filter((x) => x.kind === "recipe" && x.id).map((x) => x.id);
    const cropIds = hand.filter((x) => (x.kind === "seed" || x.kind === "crop") && x.id).map((x) => x.id);
    const anyChest = hand.some((x) => x.kind === "chest");

    const [{ itemSpriteMap }, { getChestArt }, { partColor, partName, partSprite }, { CHEST_TIERS }, { SEEDS }] = await Promise.all([
        import("@/lib/marketplace/item-sprites.js"),
        import("@/lib/marketplace/chest-art.js"),
        import("@/lib/marketplace/forge-parts.js"),
        import("@/lib/marketplace/chests.js"),
        import("@/lib/marketplace/farm-crops.js"),
    ]);

    const [items, chestArt, pages, crops] = await Promise.all([
        gearIds.length ? itemSpriteMap().catch(() => ({})) : {},
        anyChest ? getChestArt().catch(() => ({})) : {},
        pageIds.length
            ? db.query(`SELECT ref, url FROM mkt_cooking_sprite WHERE ref = ANY($1)`, [pageIds]).catch(() => [])
            : [],
        cropIds.length
            // The RIPE stage, because that is what the thing looks like — a sprout is what a seed looks like
            // after you have already planted it, which is not what is being handed over.
            ? db.query(`SELECT art_key, url FROM mkt_town_art WHERE art_key = ANY($1)`,
                [cropIds.map((id) => `crop_${id}_ripe`)]).catch(() => [])
            : [],
    ]);
    const pageArt = Object.fromEntries((pages || []).map((r) => [r.ref, r.url]));
    const cropArt = Object.fromEntries((crops || []).map((r) => [r.art_key, r.url]));

    return hand.map((x) => {
        const base = { ...x, fallback: KIND_ART[x.kind] || null };
        if (x.kind === "gold") return { ...base, name: "Gold", n: x.n, rarity: "coin", sprite: KIND_ART.gold };
        if (x.kind === "doubloons") return { ...base, name: "Doubloons", n: x.n, rarity: "coin", sprite: KIND_ART.doubloons };
        if (x.kind === "parts") {
            return { ...base, name: partName(x.tier), sub: `Forge · tier ${x.tier}`, n: x.n,
                rarity: "coin", tone: partColor(x.tier), sprite: partSprite(x.tier) || KIND_ART.parts };
        }
        if (x.kind === "chest") {
            const t = CHEST_TIERS[x.tier] || {};
            return { ...base, name: t.label || `${x.tier} chest`, n: x.n || 1,
                rarity: CHEST_RARITY[x.tier] || "common", tone: t.color || null, sprite: chestArt[x.tier] || null };
        }
        if (x.kind === "token") {
            return { ...base, name: x.n === 1 ? "Creation" : "Creations", sub: "Make your own art", n: x.n,
                rarity: "epic", sprite: KIND_ART.token };
        }
        if (x.kind === "recipe") {
            return { ...base, name: x.name, sub: `Recipe · tier ${x.tier}`, n: 1,
                rarity: TIER_RARITY[x.tier] || "rare", sprite: pageArt[x.id] || null };
        }
        if (x.kind === "seed") {
            // The crop's own name, not "Grapes seeds" — SEEDS names are already plural where the plant is
            // ("Strawberries", "Grapes"), so appending the word made a mess of half of them. The sub says
            // which of the two things this is.
            return { ...base, name: SEEDS[x.id]?.name || x.name || "Seed", sub: "Seeds for the farm", n: x.n,
                rarity: x.rarity || "common", sprite: cropArt[`crop_${x.id}_ripe`] || null };
        }
        if (x.kind === "crop") {
            return { ...base, name: SEEDS[x.id]?.name || x.name || "Crop", sub: "Into the pantry", n: x.n,
                rarity: x.rarity || "common", sprite: cropArt[`crop_${x.id}_ripe`] || null };
        }
        if (x.kind === "gear") {
            return { ...base, name: x.name, sub: x.isNew ? (x.slot || "Gear") : "Already owned — salvage it",
                n: 1, rarity: x.rarity || "common", sprite: items[x.id] || null, icon: x.icon || null };
        }
        return base;
    });
}

/**
 * Everything the counter pays for one scan: the ladder, then the haul.
 *
 * Called from redeemLoyaltyClaim AFTER awardPurchaseXp has written the purchase, so `after` already includes
 * this receipt and `before` is it minus what was just spent — which is what makes "you just unlocked the
 * Ledger Lynx" true rather than approximately true.
 */
// ── THE ANIMAL, NOT A PAW PRINT ──────────────────────────────────────────────────────────────────────────────
// The five ladder pets are the whole reason to keep scanning after the novelty wears off, and the screen drew
// every one of them as the same grey react-icons paw -- including the NEXT rung, which is the thing that is
// supposed to make somebody come back. A pet you cannot see is not a reward, it is a receipt line.
//
// One query, and only when a rung was actually crossed or a next rung exists -- which is at most six ids and
// happens five times in a member's life. The sprites are the ones every other shelf in the Den draws.
async function petArt(ids) {
    const want = [...new Set((ids || []).filter(Boolean))];
    if (!want.length) return {};
    const rows = await db.query(
        `SELECT pet_id, url, flip FROM mkt_pet_sprite WHERE pet_id = ANY($1) AND url IS NOT NULL`,
        [want]
    ).catch(() => []);
    const out = {};
    for (const r of rows || []) out[r.pet_id] = { url: r.url, flip: r.flip === true };
    return out;
}

export async function patronageForScan(buyerId, amountCents) {
    const dollars = Math.max(0, Math.round((Number(amountCents) || 0) / 100));
    const after = await lifetimeSpendDollars(buyerId);
    const before = Math.max(0, after - dollars);
    const [unlocked, rolled] = [patronPetsCrossed(before, after), rollHaul(dollars)];
    // Grants the whole earned ladder; `newPets` is only what had not been granted before, so a member whose
    // backfill already handed them the Copper Stag is not told they just won it again.
    const newPets = await grantPatronPets(buyerId, after).catch(() => []);
    const paid = dollars > 0 ? await payHaul(buyerId, rolled.hand, rolled.band).catch(() => []) : [];
    const hand = paid.length ? await dressHaul(paid).catch(() => paid) : paid;
    const ahead = nextPatronRung(after);
    const art = await petArt([...newPets.map((p) => p.id), ahead?.pet?.id]).catch(() => ({}));
    return {
        dollars,
        lifetime: after,
        band: rolled.band,
        rolls: rolled.rolls,
        hand,
        // What THIS scan crossed, intersected with what was actually new — the announcement.
        pets: newPets.filter((p) => unlocked.some((u) => u.id === p.id) || before === 0)
            .map((p) => ({ id: p.id, name: p.name, rarity: p.rarity, hint: p.hint, spend: p.spend, art: art[p.id] || null })),
        // Everything the backfill or this scan handed over that the member had not seen, so nothing is silent.
        alsoGranted: newPets.filter((p) => !unlocked.some((u) => u.id === p.id))
            .map((p) => ({ id: p.id, name: p.name, rarity: p.rarity, spend: p.spend, art: art[p.id] || null })),
        // The rung ahead, so the receipt can say how far off it is. A ladder whose next rung nobody can see
        // is not a ladder — it is a series of surprises, and a surprise is not a reason to come back.
        next: (() => {
            const n = ahead;
            return n ? { id: n.pet.id, name: n.pet.name, rarity: n.pet.rarity, spend: n.pet.spend, need: n.need,
                art: art[n.pet.id] || null } : null;
        })(),
    };
}
