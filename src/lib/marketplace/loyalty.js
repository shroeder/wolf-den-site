import "server-only";

import { db } from "@/lib/db";

// In-store loyalty linkage. To credit XP for a register sale, the marketplace account must be tied to a
// Square customer (mkt_buyer.square_customer_id). Online orders set this automatically; this ensures a
// link exists for anyone (e.g. an in-store-only member) so the cashier can attach them at checkout.
//
// Reuses an existing Square customer with the same email when one exists (avoids duplicates), otherwise
// creates one. Best-effort — returns the id, or null if Square isn't reachable / configured.
export async function ensureSquareCustomerForBuyer(buyerId) {
    if (!buyerId) return null;
    const buyer = await db
        .queryOne(`SELECT id, email, first_name, last_name, square_customer_id FROM mkt_buyer WHERE id = $1`, [buyerId])
        .catch(() => null);
    if (!buyer) return null;
    if (buyer.square_customer_id) return buyer.square_customer_id;

    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return null;

    const email = buyer.email ? String(buyer.email).trim() : null;
    const headers = {
        Authorization: `Bearer ${token}`,
        "Square-Version": process.env.SQUARE_API_VERSION || "2026-01-22",
        "Content-Type": "application/json",
    };

    let customerId = null;
    try {
        // Prefer an existing Square customer with this email so we don't create duplicates.
        if (email) {
            const search = await fetch("https://connect.squareup.com/v2/customers/search", {
                method: "POST",
                headers,
                body: JSON.stringify({ query: { filter: { email_address: { exact: email } } }, limit: 1 }),
            });
            if (search.ok) {
                const json = await search.json();
                customerId = json?.customers?.[0]?.id || null;
            }
        }
        if (!customerId) {
            const create = await fetch("https://connect.squareup.com/v2/customers", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    given_name: buyer.first_name || undefined,
                    family_name: buyer.last_name || undefined,
                    email_address: email || undefined,
                    reference_id: `wolfden:${buyer.id}`,
                    note: "Wolf Den loyalty member",
                }),
            });
            if (create.ok) {
                const json = await create.json();
                customerId = json?.customer?.id || null;
            }
        }
    } catch {
        return null;
    }

    if (customerId) {
        await db
            .query(
                `UPDATE mkt_buyer SET square_customer_id = $2 WHERE id = $1 AND (square_customer_id IS NULL OR square_customer_id = '')`,
                [buyer.id, customerId]
            )
            .catch(() => {});
    }
    return customerId;
}
