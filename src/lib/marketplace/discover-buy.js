import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { adjustInventoryForSale, getInventoryCounts } from "@/lib/consignment/square";
import { addCredit, getStoreCredit, spendCredit } from "@/lib/marketplace/store-credit.js";
import { parsePackCardName } from "@/lib/marketplace/pack-card-name.js";
import { releasableAt } from "@/lib/marketplace/packs.js";
import { tierForCents } from "@/lib/marketplace/pack-rarity.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "discover-buy" });

// ── BUY IT NOW, WITH STORE CREDIT, STRAIGHT INTO THE VAULT ───────────────────────────────────────────────────
// Luke, 2026-10-27: "people should be able to use store credit and have the card end up in their vault
// immediately vs only having the option to add to cart."
//
// ⚠️ THIS IS THE SECOND PURCHASE PATH I ARGUED AGAINST, so it is built to answer that argument rather than
// to ignore it. The worry was two ways to decrement one single-copy shelf — the exact shape behind the
// Square double-decrement that once read as theft. The answer is that this path does NOT invent its own
// stock handling: it follows openPack()'s ordering exactly, because that ordering is already proven against
// this shelf.
//
//     1. confirm the item is really there, with a LIVE Square count
//     2. spend the credit, guarded — an overdraw is impossible, not merely unlikely
//     3. decrement Square, and REFUND IN FULL if that fails
//     4. only then put it in the vault
//
// ⚠️ THE ORDER IS THE WHOLE SAFETY ARGUMENT. Decrementing before charging gives away stock on a failed
// payment; vaulting before decrementing hands over a card the shop still thinks it owns. Charging second
// and refunding on a failed decrement is the only arrangement where every failure leaves the member whole.
//
// ⚠️ AND THE FEED IS A MIRROR, NOT THE TRUTH. inventory_feed is refreshed on a schedule, so "quantity > 0"
// there means "was in stock when we last looked". It picks the candidate; Square confirms it. Skipping the
// confirmation sells cards that left the building at the weekend.

/** The window between the live count and the decrement. Documented, not closed — see the note in packs. */
export async function buyNowWithCredit({ buyerId, variationId, idempotencyKey = null }) {
    if (!buyerId) return { ok: false, error: "signed_out" };
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };
    if (!variationId) return { ok: false, error: "bad_request" };

    const key = idempotencyKey || `dbuy:${randomUUID()}`;

    // ── 1. WHAT IS IT, AND IS IT REALLY THERE ───────────────────────────────────────────────────────────
    const item = await db
        .queryOne(
            `SELECT variation_id, name, price, image_url, category_names, consigned
               FROM inventory_feed
              WHERE variation_id = $1 AND in_stock AND quantity > 0`,
            [variationId]
        )
        .catch(() => null);
    if (!item) return { ok: false, error: "gone" };
    // ⚠️ RE-CHECKED HERE even though the deck already filters it out. Consigned stock is somebody else's,
    //    and a direct-buy endpoint is exactly the kind of thing that gets called with an id from anywhere.
    if (item.consigned) return { ok: false, error: "not_for_sale" };

    const priceCents = Math.round(Number(item.price || 0) * 100);
    if (!(priceCents > 0)) return { ok: false, error: "no_price" };

    const counts = await getInventoryCounts([variationId]).catch((error) => {
        logger.warn("discover_buy.count_failed", { variationId, message: error?.message });
        return null;
    });
    // A count we could not read is not a card we may sell.
    if (!counts || Number(counts.get(variationId) || 0) < 1) return { ok: false, error: "gone" };

    const balanceCents = await getStoreCredit(buyerId).catch(() => 0);
    if (balanceCents < priceCents) {
        return { ok: false, error: "insufficient", shortfallCents: priceCents - balanceCents, priceCents };
    }

    // ── 2. CHARGE, GUARDED ──────────────────────────────────────────────────────────────────────────────
    // spendCredit's conditional UPDATE only wins when the balance covers it, so two taps cannot overdraw.
    const spent = await spendCredit(buyerId, priceCents, "shop_credit_buy", key, {
        variationId, name: item.name,
    });
    if (!spent?.ok) {
        return { ok: false, error: "insufficient", priceCents };
    }

    // ── 3. DECREMENT, OR GIVE THE MONEY BACK ────────────────────────────────────────────────────────────
    const sold = await adjustInventoryForSale(
        [{ catalogObjectId: variationId, quantity: 1 }],
        { idempotencyKey: `${key}:sale` }
    ).catch((error) => {
        logger.error("discover_buy.decrement_failed", error, { buyerId, variationId });
        return null;
    });
    if (!sold) {
        await addCredit(buyerId, priceCents, "refund", key, { reason: "square_decrement_failed" })
            .catch(() => {});
        return { ok: false, error: "stock_failed" };
    }

    // Mirror the decrement locally so the deck stops offering a card that is gone, without waiting for the
    // next feed sync. Best effort: the register is the truth and the sync will correct it either way.
    await db.query(
        `UPDATE inventory_feed SET quantity = GREATEST(quantity - 1, 0), updated_at = NOW()
          WHERE variation_id = $1`,
        [variationId]
    ).catch(() => {});

    // ── 4. INTO THE VAULT ───────────────────────────────────────────────────────────────────────────────
    const parsed = parsePackCardName(item.name || "");
    const tier = tierForCents(priceCents);
    const vaultCard = await db
        .queryOne(
            `INSERT INTO mkt_vault_card
                (buyer_id, square_variation_id, card_name, set_name, card_number, condition,
                 image_url, tier, pulled_value_cents, current_value_cents, releasable_at, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, 'credit_buy')
             RETURNING id`,
            [
                buyerId, variationId, parsed.name || item.name, parsed.setCode,
                parsed.number, parsed.condition, item.image_url || null, tier.key,
                priceCents, await releasableAt(buyerId),
            ]
        )
        .catch((error) => {
            // ⚠️ THE CARD IS PAID FOR AND OFF THE SHELF BY NOW, so this must never look like a failure to
            //    the member. It is logged loudly for a human instead — the money moved and the stock moved,
            //    and the only thing missing is the row that shows it to them.
            logger.error("discover_buy.vault_insert_failed", error, { buyerId, variationId });
            return null;
        });

    // ── THE BOOKS ───────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ A CREDIT PURCHASE NEVER TOUCHES A SQUARE ORDER, so nothing in the normal sales reporting can see
    // it — the business report's scope is Square + Plaid + cash. Packs have the same problem and solve it
    // with their own row (mkt_pack_open); this does the same. Without it, a card leaves the building and
    // the books show nothing at all.
    await db.query(
        `INSERT INTO mkt_credit_sale
            (buyer_id, variation_id, item_name, price_cents, cogs_cents, cogs_basis, vault_card_id, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'discover')`,
        [
            buyerId, variationId, item.name, priceCents,
            ...(await costFor(variationId, priceCents)),
            vaultCard?.id || null,
        ]
    ).catch((error) => logger.error("discover_buy.books_failed", error, { buyerId, variationId }));

    logger.info("discover_buy.sold", { buyerId, variationId, priceCents });
    return {
        ok: true,
        vaultCardId: vaultCard?.id || null,
        priceCents,
        balanceCents: await getStoreCredit(buyerId).catch(() => 0),
    };
}

/**
 * What the card cost us, as [cents, basis].
 *
 * ⚠️ OUR RECORDED COST FIRST, AN ESTIMATE ONLY AS A FALLBACK — and the fallback says so in the basis, so a
 * report can tell a measured margin from a guessed one. The 46% is the same shelf rate resolvePackCost uses
 * for singles; keeping them equal is the point, since both describe the same stock.
 */
async function costFor(variationId, priceCents) {
    const row = await db
        .queryOne(`SELECT unit_cost_cents FROM wolfden_item_cost WHERE variation_id = $1`, [variationId])
        .catch(() => null);
    if (row?.unit_cost_cents > 0) return [Number(row.unit_cost_cents), "captured"];
    return [Math.round(priceCents * 0.46), "estimate_shelf_46"];
}
