import "server-only";

import { randomUUID } from "crypto";
import { cookies } from "next/headers";

import { getShopCustomerByEmail, registerShopCustomer, verifyShopCustomerEmail } from "@/lib/shop-customers";
import { setShopCustomerSession } from "@/lib/shop-customer-session";

// ONE account: after a marketplace login/verify, establish a matching SHOP customer session so the same
// account also authorizes checkout — the customer never sees the separate shop login. The shop account is
// a verified shadow keyed by email (random password; login only ever happens via the marketplace account).
// Best-effort — it must never block or fail a marketplace login.
export async function bridgeMarketplaceToShop(email) {
    if (!email) return;
    try {
        const existing = await getShopCustomerByEmail(email);
        let customerId = existing?.id || null;
        if (!customerId) {
            const created = await registerShopCustomer(email, `${randomUUID()}${randomUUID()}`);
            customerId = created?.id || null;
            if (customerId) await verifyShopCustomerEmail(customerId).catch(() => {});
        }
        if (customerId) setShopCustomerSession(await cookies(), customerId);
    } catch {
        // never block login on the bridge
    }
}
