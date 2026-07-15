import "server-only";

import { db } from "@/lib/db";

// In-store loyalty linkage. To credit XP for a register sale, the marketplace account must be tied to a
// Square customer (mkt_buyer.square_customer_id) whose email/phone the cashier can look up. Online orders
// set the link automatically; these helpers create/maintain it so anyone is register-ready.

const SQUARE_BASE = "https://connect.squareup.com";

function squareHeaders() {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return null;
    return {
        Authorization: `Bearer ${token}`,
        "Square-Version": process.env.SQUARE_API_VERSION || "2026-01-22",
        "Content-Type": "application/json",
    };
}

async function loadBuyerContact(buyerId) {
    return db
        .queryOne(`SELECT id, email, first_name, last_name, phone, square_customer_id FROM mkt_buyer WHERE id = $1`, [buyerId])
        .catch(() => null);
}

function contactBody(buyer) {
    const email = buyer.email ? String(buyer.email).trim() : null;
    return {
        given_name: buyer.first_name || undefined,
        family_name: buyer.last_name || undefined,
        email_address: email || undefined,
        phone_number: buyer.phone || undefined,
    };
}

// Find an existing Square customer to reuse (by email, then phone) so we don't create duplicates.
async function findExistingCustomerId(headers, { email, phone }) {
    const searches = [];
    if (email) searches.push({ email_address: { exact: email } });
    if (phone) searches.push({ phone_number: { exact: phone } });
    for (const filter of searches) {
        try {
            const res = await fetch(`${SQUARE_BASE}/v2/customers/search`, {
                method: "POST",
                headers,
                body: JSON.stringify({ query: { filter }, limit: 1 }),
            });
            if (res.ok) {
                const id = (await res.json())?.customers?.[0]?.id;
                if (id) return id;
            }
        } catch {
            // ignore and try the next search
        }
    }
    return null;
}

async function createCustomer(headers, buyer) {
    try {
        const res = await fetch(`${SQUARE_BASE}/v2/customers`, {
            method: "POST",
            headers,
            body: JSON.stringify({ ...contactBody(buyer), reference_id: `wolfden:${buyer.id}`, note: "Wolf Den loyalty member" }),
        });
        if (res.ok) return (await res.json())?.customer?.id || null;
    } catch {
        // fall through
    }
    return null;
}

async function storeCustomerId(buyerId, customerId) {
    await db
        .query(
            `UPDATE mkt_buyer SET square_customer_id = $2 WHERE id = $1 AND (square_customer_id IS NULL OR square_customer_id = '')`,
            [buyerId, customerId]
        )
        .catch(() => {});
}

// Ensure a Square customer link exists (create/link if missing). Cheap — returns immediately if already
// linked. Best-effort; returns the id or null.
export async function ensureSquareCustomerForBuyer(buyerId) {
    if (!buyerId) return null;
    const buyer = await loadBuyerContact(buyerId);
    if (!buyer) return null;
    if (buyer.square_customer_id) return buyer.square_customer_id;

    const headers = squareHeaders();
    if (!headers) return null;

    const email = buyer.email ? String(buyer.email).trim() : null;
    let id = await findExistingCustomerId(headers, { email, phone: buyer.phone });
    if (!id) id = await createCustomer(headers, buyer);
    if (id) await storeCustomerId(buyerId, id);
    return id;
}

// Full upsert: link if missing, then push current name/email/phone to the Square customer so profile
// edits (especially a newly-saved phone the cashier will search) propagate. Best-effort.
export async function syncSquareCustomer(buyerId) {
    if (!buyerId) return null;
    const buyer = await loadBuyerContact(buyerId);
    if (!buyer) return null;

    const email = buyer.email ? String(buyer.email).trim() : null;
    if (!email && !buyer.phone) return buyer.square_customer_id || null; // nothing to look up on

    const headers = squareHeaders();
    if (!headers) return null;

    let id = buyer.square_customer_id;
    if (!id) {
        id = await findExistingCustomerId(headers, { email, phone: buyer.phone });
        if (!id) id = await createCustomer(headers, buyer);
        if (id) await storeCustomerId(buyerId, id);
        return id;
    }

    // Already linked — update the contact fields on the Square customer so lookups stay current.
    try {
        await fetch(`${SQUARE_BASE}/v2/customers/${id}`, { method: "PUT", headers, body: JSON.stringify(contactBody(buyer)) });
    } catch {
        // best-effort
    }
    return id;
}
