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

// ── ⚠️ AND THE SAME DOOR THE OTHER WAY ROUND ────────────────────────────────────────────────────────────────
// Luke, 2026-11-12: "When people sign up to buy stuff I dont see a sign up for the game. Why?"
//
// Because this file only ever ran one way. A GAME signup silently provisioned a shop customer (above), so
// the player could check out without ever meeting a second login. A SHOP signup wrote a
// shop_customer_accounts row and stopped: no mkt_buyer, no member, nothing the game could see.
//
// The machinery to do it already existed — getOrCreateBuyerByEmail provisions a passwordless marketplace
// account and mirrors every piece of new-member setup (pending purchases claimed, Square customer linked,
// public @handle, starter seeds). It was only ever reached by `buyerFromShopSession`, which runs when a
// shop customer happens to load a MARKETPLACE page. Somebody who signs up to buy a booster box and never
// wanders into the game is never provisioned at all.
//
// Measured before fixing: 199 shop accounts, 4 of them with no game account — small, because almost
// everybody arrives through the game. Those 4 are the ones who came the other way, and they are exactly
// the people this was supposed to catch.
//
// ⚠️ IT RUNS AT VERIFICATION, NOT AT REGISTRATION. An unverified signup is an email address somebody typed;
// provisioning a member for it would put unowned accounts on the leaderboard and hand starter seeds to a
// typo. Verification is the first moment there is a person.
//
// ⚠️ AND IT NEVER TOUCHES AN EXISTING ACCOUNT. getOrCreateBuyerByEmail returns the existing row untouched
// when there is one, so the overwhelmingly common case — a player whose shop shadow was made by the bridge
// above — is a lookup and nothing else.
export async function bridgeShopToMarketplace(email) {
    if (!email) return null;
    try {
        // Imported lazily: buyer-session.js imports THIS file, and a static import both ways is a cycle.
        const { getOrCreateBuyerByEmail } = await import("@/lib/marketplace/buyer-session.js");
        return await getOrCreateBuyerByEmail(email, { emailVerified: true });
    } catch {
        // Never block a shop verification on the game half. The customer came here to buy something.
        return null;
    }
}
