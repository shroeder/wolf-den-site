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
                await addChests(buyerId, { [x.tier]: 1 }, { source: "patronage" });
                out.push({ kind: "chest", tier: x.tier });
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
                    out.push({ kind: "gear", id: pickItem.id, name: pickItem.name, rarity: pickItem.rarity, slot: pickItem.slot || null, isNew: Boolean(g?.granted) });
                }
            }
        } catch { /* one line of a haul is never worth failing the scan over */ }
    }
    return out;
}

/**
 * Everything the counter pays for one scan: the ladder, then the haul.
 *
 * Called from redeemLoyaltyClaim AFTER awardPurchaseXp has written the purchase, so `after` already includes
 * this receipt and `before` is it minus what was just spent — which is what makes "you just unlocked the
 * Ledger Lynx" true rather than approximately true.
 */
export async function patronageForScan(buyerId, amountCents) {
    const dollars = Math.max(0, Math.round((Number(amountCents) || 0) / 100));
    const after = await lifetimeSpendDollars(buyerId);
    const before = Math.max(0, after - dollars);
    const [unlocked, rolled] = [patronPetsCrossed(before, after), rollHaul(dollars)];
    // Grants the whole earned ladder; `newPets` is only what had not been granted before, so a member whose
    // backfill already handed them the Copper Stag is not told they just won it again.
    const newPets = await grantPatronPets(buyerId, after).catch(() => []);
    const hand = dollars > 0 ? await payHaul(buyerId, rolled.hand, rolled.band).catch(() => []) : [];
    return {
        dollars,
        lifetime: after,
        band: rolled.band,
        rolls: rolled.rolls,
        hand,
        // What THIS scan crossed, intersected with what was actually new — the announcement.
        pets: newPets.filter((p) => unlocked.some((u) => u.id === p.id) || before === 0)
            .map((p) => ({ id: p.id, name: p.name, rarity: p.rarity, hint: p.hint, spend: p.spend })),
        // Everything the backfill or this scan handed over that the member had not seen, so nothing is silent.
        alsoGranted: newPets.filter((p) => !unlocked.some((u) => u.id === p.id))
            .map((p) => ({ id: p.id, name: p.name, rarity: p.rarity, spend: p.spend })),
        // The rung ahead, so the receipt can say how far off it is. A ladder whose next rung nobody can see
        // is not a ladder — it is a series of surprises, and a surprise is not a reason to come back.
        next: (() => {
            const n = nextPatronRung(after);
            return n ? { id: n.pet.id, name: n.pet.name, rarity: n.pet.rarity, spend: n.pet.spend, need: n.need } : null;
        })(),
    };
}
