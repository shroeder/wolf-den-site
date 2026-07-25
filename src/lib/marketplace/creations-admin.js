import "server-only";

import { db } from "@/lib/db";

// Admin console data for the CREATIONS economy (presented to members as "Creations"; stored as
// custom_deco_credits). Two sides:
//   • PURCHASES  — who bought which bundle (mkt_creation_purchase): revenue, creations + coins granted.
//   • USAGE      — who spent a Creation to make custom art (mkt_custom_deco): the prompt, status, chosen image.
// Plus outstanding balances (unspent Creations still held). Read-only; safe to poll.

const LIST_CAP = 300; // most-recent N per list (flagged in the payload if we hit it)

const nameOf = (r) => r.display_name || (r.alias ? `@${r.alias}` : "Member");

export async function getCreationsAdmin() {
    const [purchaseRows, creationRows, balanceRows, purchaseAgg, usageAgg, outstanding] = await Promise.all([
        // Recent purchases with the buyer's name.
        db.query(
            `SELECT p.id, p.tier_id, p.amount_cents, p.tokens, p.coins, p.status, p.created_at, p.granted_at,
                    p.square_payment_id, p.receipt_url, b.id AS buyer_id, b.alias, b.display_name
               FROM mkt_creation_purchase p JOIN mkt_buyer b ON b.id = p.buyer_id
              ORDER BY p.created_at DESC LIMIT ${LIST_CAP + 1}`
        ).catch(() => []),
        // Recent creations (art the members made by spending a Creation).
        db.query(
            `SELECT c.id, c.name, c.prompt, c.status, c.attempts, c.chosen_url, c.created_at, c.updated_at,
                    b.id AS buyer_id, b.alias, b.display_name
               FROM mkt_custom_deco c JOIN mkt_buyer b ON b.id = c.buyer_id
              ORDER BY c.created_at DESC LIMIT ${LIST_CAP + 1}`
        ).catch(() => []),
        // Members still holding unspent Creations.
        db.query(
            `SELECT id, alias, display_name, custom_deco_credits AS credits
               FROM mkt_buyer WHERE COALESCE(custom_deco_credits, 0) > 0
              ORDER BY custom_deco_credits DESC LIMIT ${LIST_CAP}`
        ).catch(() => []),
        // Purchase rollups (paid only for money figures; count of distinct buyers).
        db.queryOne(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'paid')::int              AS paid_count,
                COUNT(*) FILTER (WHERE status = 'pending')::int           AS pending_count,
                COUNT(*) FILTER (WHERE status = 'failed')::int            AS failed_count,
                COALESCE(SUM(amount_cents) FILTER (WHERE status='paid'),0)::bigint AS revenue_cents,
                COALESCE(SUM(tokens)       FILTER (WHERE status='paid'),0)::int    AS creations_sold,
                COALESCE(SUM(coins)        FILTER (WHERE status='paid'),0)::bigint AS coins_sold,
                COUNT(DISTINCT buyer_id) FILTER (WHERE status='paid')::int AS buyers
               FROM mkt_creation_purchase`
        ).catch(() => ({})),
        // Usage rollups by status.
        db.queryOne(
            `SELECT
                COUNT(*)::int                                        AS started,
                COUNT(*) FILTER (WHERE status = 'final')::int        AS finished,
                COUNT(*) FILTER (WHERE status = 'drafting')::int     AS drafting,
                COUNT(*) FILTER (WHERE status = 'abandoned')::int    AS abandoned,
                COUNT(DISTINCT buyer_id)::int                        AS creators
               FROM mkt_custom_deco`
        ).catch(() => ({})),
        db.queryOne(`SELECT COALESCE(SUM(custom_deco_credits),0)::int AS held FROM mkt_buyer WHERE COALESCE(custom_deco_credits,0) > 0`).catch(() => ({})),
    ]);

    const purchasesCapped = purchaseRows.length > LIST_CAP;
    const creationsCapped = creationRows.length > LIST_CAP;

    const purchases = purchaseRows.slice(0, LIST_CAP).map((r) => ({
        id: r.id,
        buyerId: r.buyer_id,
        name: nameOf(r),
        alias: r.alias || null,
        tierId: r.tier_id,
        amountCents: Number(r.amount_cents) || 0,
        creations: Number(r.tokens) || 0, // "tokens" column = Creation count
        coins: Number(r.coins) || 0,
        status: r.status,
        createdAt: r.created_at,
        grantedAt: r.granted_at,
        squarePaymentId: r.square_payment_id || null,
        receiptUrl: r.receipt_url || null,
    }));

    const creations = creationRows.slice(0, LIST_CAP).map((r) => ({
        id: Number(r.id),
        buyerId: r.buyer_id,
        name: nameOf(r),
        alias: r.alias || null,
        title: r.name || "Untitled",
        prompt: r.prompt || "",
        status: r.status, // drafting | final | abandoned
        attempts: Number(r.attempts) || 0,
        imageUrl: r.chosen_url || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    }));

    const balances = balanceRows.map((r) => ({
        buyerId: r.id,
        name: nameOf(r),
        alias: r.alias || null,
        credits: Number(r.credits) || 0,
    }));

    const revenueCents = Number(purchaseAgg?.revenue_cents) || 0;
    const summary = {
        revenueCents,
        revenue: `$${(revenueCents / 100).toFixed(2)}`,
        paidPurchases: purchaseAgg?.paid_count || 0,
        pendingPurchases: purchaseAgg?.pending_count || 0,
        failedPurchases: purchaseAgg?.failed_count || 0,
        buyers: purchaseAgg?.buyers || 0,
        creationsSold: purchaseAgg?.creations_sold || 0,
        coinsSold: Number(purchaseAgg?.coins_sold) || 0,
        creationsStarted: usageAgg?.started || 0,
        creationsFinished: usageAgg?.finished || 0,
        creationsDrafting: usageAgg?.drafting || 0,
        creationsAbandoned: usageAgg?.abandoned || 0,
        creators: usageAgg?.creators || 0,
        creationsHeld: outstanding?.held || 0, // unspent Creations still in wallets
    };

    return { summary, purchases, creations, balances, caps: { purchasesCapped, creationsCapped, listCap: LIST_CAP } };
}
