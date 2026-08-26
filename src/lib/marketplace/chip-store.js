import "server-only";

import { db } from "@/lib/db";
import {
    chipItem, moveChips, chipShelf, casinoTrophies, counterDiscount, pricedFor, basePriceFor,
} from "@/lib/marketplace/chips.js";
import { getCasinoPerks, grantCasinoPerk, revokeCasinoPerk } from "@/lib/marketplace/casino-perks.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── THE COUNTER ──────────────────────────────────────────────────────────────────────────────────────────────
// Where chips turn into things. This is the half of the casino that decides what a chip is WORTH — the
// machines only decide how many of them you get — so it is also the only place in the new casino where a bug
// can hand out something real.
//
// THREE RULES, and they are the whole file:
//
//   1. THE PRICE COMES FROM THE CATALOG, never from the request. `item` is a key and nothing else.
//   2. THE CHIPS COME OUT FIRST, guarded inside the UPDATE, and the goods are granted after. Granting first
//      and charging second is how a failed charge becomes a free item, and a double-tap becomes two.
//   3. IF THE GRANT FAILS, THE CHIPS GO BACK. Every branch below either delivers or refunds; none of them
//      may return an error while the member is down the price.
//
// And the standing rule from the design: nothing on this shelf converts back to GOLD. Chips are a one-way
// door out of the gold economy, which is the entire reason the machines can pay what they pay.

/** One purchase. Returns the updated shelf so the screen never has to re-ask. */
export async function buyWithChips(buyerId, itemId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const item = chipItem(itemId);
    if (!item) return { ok: false, error: "no_such_item" };

    // ── THE VENDOR BEHIND THE ROPE SELLS TO VIPS ───────────────────────────────────────
    // The VIP items are not on the Counter's list, but "not listed" is not a gate — `item` is an id from a
    // POST body and the whole shelf's ids are guessable. Checked at the TILL, which is the only place that
    // matters, and re-checked on every purchase rather than trusted from whenever the room was entered.
    if (item.vip) {
        const { vipStanding } = await import("@/lib/marketplace/vip.js");
        const { vip } = await vipStanding(buyerId);
        if (!vip) return { ok: false, error: "not_vip" };
    }

    // ── AND THE PRICE IS RECOMPUTED, NEVER TAKEN FROM THE SCREEN ───────────────────────────
    // The floor's own trophies take a little off (see counterDiscount in chips.js). The shelf showed a
    // number and this charges one, and they are the same number because they come out of the same two
    // functions given the same inputs — not because anybody passed a price along. A till that trusts a
    // price from the client is a till that charges whatever the client says.
    const [trophies, perks] = await Promise.all([casinoTrophies(buyerId), getCasinoPerks(buyerId)]);
    // `basePriceFor` is what makes an INFINITE track safe to sell: a stat's price is a function of how many
    // the member already has, read here at the moment of sale rather than taken from the screen. A stale tab
    // quoting level 3's price gets charged level 4's, which is the direction that error has to fail in.
    const price = pricedFor(basePriceFor(item, perks), counterDiscount(trophies));

    // ── ONCE MEANS ONCE ──────────────────────────────────────────────────────────────────────────────────
    // Checked here for the message, and enforced by a partial UNIQUE index in the migration for the truth —
    // two taps arriving together both pass this read, and only the index stops the second one.
    // An UNLOCK is owned when its perk row exists, which is also the thing that gates the feature — so the
    // receipt log cannot disagree with whether the door is open. Checked before the once-only receipt below,
    // because for an unlock the perk IS the answer.
    if (item.kind === "unlock" && (Number(perks[item.ref]) || 0) > 0) {
        return { ok: false, error: "already_owned" };
    }
    // ── AND A ROLL IS NOT SOLD WHEN THERE IS NOTHING LEFT TO ROLL ────────────────────────────────────────
    // A page draws from a BAND, and a member who already knows every recipe in that band can only ever buy a
    // failure. The grant would return false and the till would refund correctly — but "that didn't go
    // through" is the wrong thing to tell somebody whose only problem is that they have finished the book.
    if (item.kind === "recipe") {
        const { hasUnknownRecipe } = await import("@/lib/marketplace/cooking.js");
        const left = await hasUnknownRecipe(buyerId, item.ref).catch(() => false);
        if (!left) return { ok: false, error: "nothing_left" };
    }
    if (item.once) {
        const had = await db.queryOne(
            `SELECT 1 FROM mkt_chip_purchase WHERE buyer_id = $1 AND item_id = $2 AND once LIMIT 1`,
            [buyerId, item.id]).catch(() => null);
        if (had) return { ok: false, error: "already_owned" };
    }

    // Charged first. `moveChips` guards the balance inside the UPDATE and returns null if it could not.
    const after = await moveChips(buyerId, -price, "store", { ref: item.id, meta: { name: item.name, list: item.price, paid: price } });
    if (after === null) return { ok: false, error: "not_enough_chips" };

    // The receipt, and the second half of the once-only guard. If THIS is the write that loses the race, the
    // member has paid for something they already own — so the refund is not optional and not best-effort.
    const receipt = await db.queryOne(
        `INSERT INTO mkt_chip_purchase (buyer_id, item_id, price, once)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (buyer_id, item_id) WHERE once DO NOTHING
         RETURNING id`,
        [buyerId, item.id, price, Boolean(item.once)]).catch(() => null);
    if (item.once && !receipt) {
        await moveChips(buyerId, price, "store_refund", { ref: item.id, meta: { why: "already owned" } });
        return { ok: false, error: "already_owned" };
    }

    const granted = await grant(buyerId, item).catch(() => false);
    if (!granted) {
        // A perk that half-landed would leave a level nobody paid for. Undone first, before the chips go
        // back, so the two can never both be true.
        if (item.kind === "stat" || item.kind === "unlock") await revokeCasinoPerk(buyerId, item.ref);
        // Put it back, and take the receipt with it — otherwise a once-only item is marked owned and was
        // never delivered, which is the worst outcome available and the hardest to notice.
        await moveChips(buyerId, price, "store_refund", { ref: item.id, meta: { why: "grant failed" } });
        if (receipt) await db.query(`DELETE FROM mkt_chip_purchase WHERE id = $1`, [receipt.id]).catch(() => {});
        return { ok: false, error: "grant_failed" };
    }

    // The shelf that comes back is the one they are standing at — handing a VIP the Counter's list after
    // they bought a pet from the vendor would redraw the wrong room around them.
    const back = item.kind === "stat" ? { shelf: "stat" }
        : item.kind === "unlock" ? { shelf: "unlock" }
            : { vip: Boolean(item.vip) };
    // What chips are actually SPENT on. The shelf now sells four different kinds of thing (chests, pets,
    // permanent stats, feature unlocks) and which of them people buy is the whole question.
    await trackActivity(buyerId, "casino_buy", {
        item: item.id, kind: item.kind, ref: item.ref || null, price, vip: Boolean(item.vip),
    }).catch(() => {});
    return { ok: true, bought: item.id, name: item.name, ...(await chipShelf(buyerId, back)) };
}

// ── DELIVERING THE GOODS ─────────────────────────────────────────────────────────────────────────────────────
// One branch per `kind`. Each returns true only if the thing actually landed, because the caller refunds on
// false — a branch that returns true optimistically turns a failed grant into a silent theft.
//
// Everything here writes through the table the owning feature already uses, rather than inventing a
// casino-shaped copy of it: a decoration bought with chips must be the same row as a decoration bought with
// gold, or the farm has two kinds of decoration and only one of them works.
async function grant(buyerId, item) {
    switch (item.kind) {
        // Cosmetic unlocks — decorations, farm backdrops and pets — all live in one table keyed by category
        // and ref. A conflict means they already had it, which is still "delivered": the once-only index is
        // what stops a second sale, not this.
        case "decoration":
        case "pet": {
            const cat = item.kind;
            const r = await db.query(
                `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref)
                 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [buyerId, cat, item.ref]);
            return r !== null && r !== undefined;
        }
        // ── A PAGE, ROLLED AT THE COUNTER ────────────────────────────────────────────
        // The only thing on any shelf that is decided at the moment of sale. It returns false rather than
        // throwing when there is nothing left to teach, which is all it has to do — buyWithChips refunds the
        // chips and deletes the receipt on a grant that comes back false, so the "paid for a book they had
        // already finished" case is already covered by the path every other kind uses. There is a nicer
        // refusal in front of it too, before any money moves, purely so the member gets told WHY.
        case "recipe": {
            const { grantRecipeReward } = await import("@/lib/marketplace/cooking.js");
            const got = await grantRecipeReward(buyerId, item.ref).catch(() => null);
            return Boolean(got);
        }
        // Forge parts are per TIER, so `ref` is [tier, count] rather than a bare number — a "handful of
        // parts" with no tier is not a thing the forge can hold.
        case "parts": {
            const [tier, count] = item.ref;
            const r = await db.queryOne(
                `INSERT INTO mkt_salvage_part (buyer_id, tier, count) VALUES ($1, $2, $3)
                 ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_salvage_part.count + EXCLUDED.count
                 RETURNING count`,
                [buyerId, tier, count]);
            return Boolean(r);
        }
        case "gems": {
            const r = await db.queryOne(
                `INSERT INTO mkt_gem (buyer_id, gem_id, count) VALUES ($1, $2, 1)
                 ON CONFLICT (buyer_id, gem_id) DO UPDATE SET count = mkt_gem.count + 1
                 RETURNING count`,
                [buyerId, item.ref]);
            return Boolean(r);
        }
        // ── A CHEST, THROUGH THE FEATURE'S OWN DOOR ──────────────────────────────────────────────────
        // `addChests` is what every other source of a chest calls — levelling, the boss, the master key —
        // so a chest bought with chips lands in the same tally, opens with the same animation and rolls
        // off the same table. Writing the row here would be a second kind of chest that only half works,
        // which is the exact mistake the note at the top of this file warns about.
        case "chest": {
            // It swallows its own errors, so its resolving proves nothing. Read the row back: the tally
            // has to have actually moved, or the chips go home.
            const before = await db.queryOne(
                `SELECT count FROM mkt_user_chest WHERE buyer_id = $1 AND tier = $2`, [buyerId, item.ref]);
            await addChests(buyerId, { [item.ref]: 1 }, { source: "chip_store", meta: { item: item.id } });
            const after = await db.queryOne(
                `SELECT count FROM mkt_user_chest WHERE buyer_id = $1 AND tier = $2`, [buyerId, item.ref]);
            return Boolean(after) && Number(after.count) > Number(before?.count || 0);
        }
        // ── A PET, THROUGH THE SAME DOOR EVERY OTHER PET USES ───────────────────────────
        // `mkt_cosmetic_unlock` with category 'pet' is what pet-drops.js writes for a chest, a boss, a fish
        // and the casino floor, so a pet bought from the vendor is the same row and shows up in the same
        // place. RETURNING is what proves it landed: ON CONFLICT DO NOTHING returns no row when it was
        // already owned, and reporting success for a grant that did nothing is how somebody pays twice.
        case "pet": {
            const r = await db.queryOne(
                `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2)
                 ON CONFLICT DO NOTHING RETURNING ref`,
                [buyerId, item.ref]);
            return Boolean(r);
        }
        // ── A PERMANENT THING ───────────────────────────────────────────────────
        // Both kinds are one row in mkt_casino_perk — a stat track counts up for ever and an unlock stops at
        // one. `grantCasinoPerk` returns the new level, so a null is a failed write and the chips go back.
        case "stat":
        case "unlock": {
            const level = await grantCasinoPerk(buyerId, item.ref);
            if (!(Number(level) > 0)) return false;
            // ── AND ALL FOUR ARE PURE GATES ──────────────────────────────────────────────────────────
            // The golden wheel, the deep water and the Long Road are read from the perk row at the moment
            // they matter, so owning the row IS the feature. The Master's Book used to be the exception: tier
            // 6 was outside every band, so buying the book had to write all eight pages itself.
            //
            // That was the wrong shape and it is gone. chest_high reaches tier 6 now and rollRecipe draws
            // from recipeBookFor(master), so an owner FINDS master pages the way every other page is found
            // and a non-owner cannot roll one, see one, or tell the tier exists. The perk row is the whole
            // product for all four, and this case grants nothing but the row.
            return true;
        }
        case "consumables": {
            // `ref` is a list of consumable ids, because the House Pack is three things rather than one.
            // Every one of them has to land or the whole grant is a failure and the chips go back — a pack
            // that delivers two thirds of itself is worse than one that fails.
            for (const id of item.ref) {
                const r = await db.queryOne(
                    `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, 1)
                     ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = mkt_user_consumable.count + 1
                     RETURNING count`,
                    [buyerId, id]);
                if (!r) return false;
            }
            return true;
        }
        default:
            // An item whose kind nothing here handles must NOT report success. This is the branch that
            // catches a shelf entry added without its delivery, which is exactly the mistake that ships.
            return false;
    }
}
