"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

// BUYING, ON THE PRODUCT PAGE ITSELF.
//
// /shop/[handle] is the page every OUTSIDE visitor lands on — it is what the Google Shopping feed links to,
// what the sitemap gets indexed as, what the Discord new-arrival alert points at, and what "Just In" opens.
// It shipped before the online store existed and still offered nothing but the shop's phone number, so the
// highest-intent traffic there is — somebody who searched for one specific card and clicked it — arrived at
// the only page in the shop that could not sell them anything. Browsing /shop and opening the same item in
// the grid's detail modal worked fine, which is why it went unnoticed.
//
// Same cart endpoint and the same rules as the grid: only when payments are on and there is stock. When the
// store cannot take the order online the phone CTA is still the right answer — it is just no longer the only
// answer.
export default function ShopProductBuy({ catalogObjectId, inStock, paymentsEnabled, phone = "+17014090782", phoneLabel = "(701) 409-0782" }) {
    const [busy, setBusy] = useState(false);
    const [added, setAdded] = useState(false);
    const [error, setError] = useState("");

    const addToCart = useCallback(async () => {
        if (!paymentsEnabled || !catalogObjectId) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/shop/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add", catalogObjectId, quantity: 1 }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload) throw new Error(payload?.error || "Could not update cart.");
            setAdded(true);
            // The header's cart badge listens for this — without it the count sits stale until a navigation.
            window.dispatchEvent(new CustomEvent("wolfden-shop-cart-updated"));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update cart.");
        } finally {
            setBusy(false);
        }
    }, [catalogObjectId, paymentsEnabled]);

    const canBuy = Boolean(paymentsEnabled && inStock && catalogObjectId);

    return (
        <>
            <div className="cta-row">
                {canBuy ? (
                    <>
                        <button type="button" className="button primary" onClick={addToCart} disabled={busy}>
                            {busy ? "Adding to cart…" : added ? "Added — add another" : "Add to cart"}
                        </button>
                        <Link className="button" href="/cart">View cart</Link>
                    </>
                ) : (
                    <a className="button primary" href={`tel:${phone}`}>Call: {phoneLabel}</a>
                )}
                <Link className="button" href="/shop">Browse the shop</Link>
            </div>
            {added && !error ? <p className="shop-in-cart-note">Added to your cart.</p> : null}
            {error ? <p className="shop-payment-error">{error}</p> : null}
            {/* Out of stock is not a payments problem — say which one it is rather than silently showing a phone
                number and letting the visitor guess why. */}
            {paymentsEnabled && !inStock ? (
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    This one has sold. Give us a call and we&rsquo;ll tell you if another is on the way.
                </p>
            ) : null}
        </>
    );
}
