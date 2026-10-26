import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { tierByKey } from "@/lib/marketplace/pack-rarity.js";
import { releasableAt } from "@/lib/marketplace/packs.js";
import { addCredit } from "@/lib/marketplace/store-credit.js";
import { restockBoughtBackCard } from "@/lib/marketplace/vault-restock.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "vault" });

// ── THE CARD VAULT ───────────────────────────────────────────────────────────────────────────────────────────
// Cards a member pulled and kept. They can sell any of them back for store credit at any time, ship them, or
// collect them from the shop.
//
// ⚠️ A VAULT CARD IS A REAL CARD IN OUR BUILDING. Everything here moves physical stock or real money, so every
// transition is guarded on the row's current status rather than on what the client believed when it rendered.

const money = (cents) => Math.max(0, Math.round(Number(cents) || 0));

function toVaultCard(row) {
    const tier = tierByKey(row.tier);
    return {
        id: row.id,
        name: row.card_name,
        subtitle: [row.set_name, row.card_number, row.condition].filter(Boolean).join(" · "),
        setName: row.set_name,
        cardNumber: row.card_number,
        condition: row.condition,
        imageUrl: row.image_url,
        tier: row.tier,
        tierLabel: tier.label,
        glow: tier.glow,
        edge: tier.edge,
        valueCents: money(row.current_value_cents),
        pulledValueCents: money(row.pulled_value_cents),
        status: row.status,
        orderId: row.order_id || null,
        // Null means releasable now. A date means the credit that bought it has not settled yet (§12).
        releasableAt: row.releasable_at || null,
        releasable: !row.releasable_at || new Date(row.releasable_at) <= new Date(),
        pulledAt: row.created_at,
    };
}

/** Everything the vault screen needs, in one read. */
export async function getVault(buyerId) {
    if (!vaultOpenFor(buyerId)) return null;

    const [cards, events, order] = await Promise.all([
        db.query(
            `SELECT id, card_name, set_name, card_number, condition, image_url, tier,
                    pulled_value_cents, current_value_cents, status, order_id, releasable_at, created_at
             FROM mkt_vault_card
             WHERE buyer_id = $1 AND status IN ('held', 'on_order')
             ORDER BY current_value_cents DESC, created_at DESC`,
            [buyerId]
        ),
        db.query(
            `SELECT id, action, credit_delta_cents, meta, created_at
             FROM mkt_vault_event
             WHERE buyer_id = $1
             ORDER BY created_at DESC
             LIMIT 60`,
            [buyerId]
        ),
        db.query(
            `SELECT o.id, o.fulfillment_mode, o.fulfillment_status, o.status, o.tracking_number,
                    o.shipping_carrier, o.total_cents, o.created_at,
                    COUNT(v.id)::int AS card_count
             FROM shop_orders o
             JOIN mkt_vault_card v ON v.order_id = o.id
             WHERE v.buyer_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC
             LIMIT 25`,
            [buyerId]
        ),
    ]);

    const mapped = cards.map(toVaultCard);
    const held = mapped.filter((c) => c.status === "held");
    const onOrder = mapped.filter((c) => c.status === "on_order");

    return {
        held,
        onOrder,
        orders: order.map((o) => ({
            id: o.id,
            mode: o.fulfillment_mode,
            fulfillmentStatus: o.fulfillment_status,
            status: o.status,
            trackingNumber: o.tracking_number,
            carrier: o.shipping_carrier,
            totalCents: money(o.total_cents),
            cardCount: o.card_count,
            createdAt: o.created_at,
            // ⚠️ Luke's call: a PICKUP order can be self-cancelled right up until it is picked up — even once
            //    staff have prepared it. A prepared-then-cancelled order raises a re-file task so the cards do
            //    not sit in a holding bag the system believes are back in the vault.
            canCancel: o.fulfillment_mode === "pickup"
                && !["picked_up", "cancelled"].includes(o.fulfillment_status),
        })),
        history: events.map((e) => ({
            id: Number(e.id),
            action: e.action,
            creditDeltaCents: Number(e.credit_delta_cents || 0),
            meta: e.meta || null,
            at: e.created_at,
        })),
        totals: {
            heldCount: held.length,
            heldValueCents: held.reduce((sum, c) => sum + c.valueCents, 0),
            onOrderCount: onOrder.length,
        },
    };
}

/**
 * Sell cards back to us for store credit, at 100% of their current value.
 *
 * ⚠️ THE CREDIT GOES OUT FIRST, AND THE SQUARE RESTOCK IS BEST-EFFORT AFTER IT. That ordering is deliberate:
 * the member's money is the part that has to be right, and a Square outage must not leave somebody holding
 * neither the card nor the credit. A restock that fails leaves a loud warning and a card for a human to put
 * back — recoverable. A credit that fails after we took the card is not.
 */
export async function sellVaultCards({ buyerId, cardIds }) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };
    const ids = (Array.isArray(cardIds) ? cardIds : []).filter(Boolean).slice(0, 50);
    if (!ids.length) return { ok: false, error: "nothing_selected" };

    // Guarded on status: a card already in an order, or already sold, cannot be sold again. The UPDATE is the
    // claim — two taps can only win once.
    const claimed = await db.query(
        `UPDATE mkt_vault_card
         SET status = 'sold_back', sold_back_at = NOW(), sold_back_cents = current_value_cents, updated_at = NOW()
         WHERE buyer_id = $1 AND id = ANY($2::uuid[]) AND status = 'held'
         RETURNING id, card_name, set_name, card_number, condition, image_url,
                   square_variation_id, current_value_cents, tier`,
        [buyerId, ids]
    );
    if (!claimed.length) return { ok: false, error: "nothing_sellable" };

    const totalCents = claimed.reduce((sum, c) => sum + money(c.current_value_cents), 0);
    const ref = `vault:${randomUUID()}`;
    const balanceCents = await addCredit(buyerId, totalCents, "vault_sellback", ref, {
        cards: claimed.map((c) => c.card_name),
    });

    for (const card of claimed) {
        await db
            .query(
                `INSERT INTO mkt_vault_event (buyer_id, vault_card_id, action, credit_delta_cents, meta)
                 VALUES ($1, $2, 'sold_back', $3, $4)`,
                [buyerId, card.id, money(card.current_value_cents), JSON.stringify({ card: card.card_name })]
            )
            .catch(() => {});
    }

    // ── The card becomes sellable again, and the trade ledger learns we bought it ──────────────────────────
    const restocked = [];
    for (const card of claimed) {
        const result = await restockBoughtBackCard({
            squareVariationId: card.square_variation_id,
            name: card.card_name,
            subtitle: [card.set_name, card.card_number, card.condition].filter(Boolean).join(" · "),
            imageUrl: card.image_url,
            valueCents: money(card.current_value_cents),
            paidCents: money(card.current_value_cents),
        });
        restocked.push({ card, result });
        if (result.variationId && result.variationId !== card.square_variation_id) {
            await db
                .query(`UPDATE mkt_vault_card SET square_variation_id = $2 WHERE id = $1`, [card.id, result.variationId])
                .catch(() => {});
        }
    }

    await recordBuybackTrade(buyerId, restocked).catch((error) =>
        logger.error("vault.sell.trade_ledger_failed", error, { buyerId })
    );

    await trackActivity(buyerId, "vault_sellback", { cents: totalCents, count: claimed.length }).catch(() => {});
    logger.info("vault.sell.success", { buyerId, count: claimed.length, totalCents });

    return { ok: true, soldCount: claimed.length, creditedCents: totalCents, balanceCents };
}

/**
 * Put the buy-back through the SAME pipe as a counter trade.
 *
 * ⚠️ NOT A NEW LEDGER. `trade` + `trade_line` already model "we bought cards from a person and paid them in
 * credit", and trade reporting, cost capture and the consignment hooks all read it. A vault buy-back that
 * invented its own table would be invisible to every one of them.
 *
 * buy_rate_percent is 100 because that is literally what was paid — see §5. The rate is RECORDED rather than
 * assumed, which is the rule that keeps traded-single costs honest.
 */
async function recordBuybackTrade(buyerId, restocked) {
    const rows = restocked.filter((r) => money(r.card.current_value_cents) > 0);
    if (!rows.length) return;

    const tradeId = `vault-${randomUUID()}`;
    const total = rows.reduce((sum, r) => sum + money(r.card.current_value_cents), 0) / 100;

    await db.tx(async (client) => {
        await client.query(
            `INSERT INTO trade
                (id, traded_at, buy_rate_percent, market_total, offer_total, credit_total,
                 cash_total, gift_card_total, cash_in_total, net_total, notes, created_by, source)
             VALUES ($1, NOW(), 100, $2, $2, $2, 0, 0, 0, $2, $3, 'vault', 'vault_buyback')`,
            [tradeId, total, `Card Vault buy-back (member ${buyerId})`]
        );
        let sort = 0;
        for (const { card, result } of rows) {
            const value = money(card.current_value_cents) / 100;
            await client.query(
                `INSERT INTO trade_line
                    (trade_id, direction, item_name, quantity, unit_market, line_total, buy_rate_percent,
                     square_variation_id, set_name, card_number, condition, image_url, sort_order)
                 VALUES ($1, 'IN', $2, 1, $3, $3, 100, $4, $5, $6, $7, $8, $9)`,
                [
                    tradeId, card.card_name, value, result.variationId || card.square_variation_id,
                    card.set_name, card.card_number, card.condition, card.image_url, sort += 1,
                ]
            );
        }
        // The credit side, so the trade balances the way a counter trade does.
        await client.query(
            `INSERT INTO trade_line (trade_id, direction, item_name, quantity, line_total, sort_order)
             VALUES ($1, 'OUT', 'Store credit', 1, $2, $3)`,
            [tradeId, total, sort + 1]
        );
    });
}

/** Cards eligible to leave the building right now — the hold in §12 is applied here, not in the UI. */
export async function releasableCards(buyerId, cardIds) {
    const rows = await db.query(
        `SELECT id, card_name, current_value_cents, releasable_at, square_variation_id
         FROM mkt_vault_card
         WHERE buyer_id = $1 AND id = ANY($2::uuid[]) AND status = 'held'`,
        [buyerId, cardIds]
    );
    const now = new Date();
    return {
        ready: rows.filter((r) => !r.releasable_at || new Date(r.releasable_at) <= now),
        held: rows.filter((r) => r.releasable_at && new Date(r.releasable_at) > now),
    };
}

/** Refresh the hold stamp on every held card — used after a credit purchase settles. */
export async function refreshReleaseHold(buyerId) {
    const at = await releasableAt(buyerId);
    await db
        .query(`UPDATE mkt_vault_card SET releasable_at = $2, updated_at = NOW() WHERE buyer_id = $1 AND status = 'held'`,
            [buyerId, at])
        .catch(() => {});
}
