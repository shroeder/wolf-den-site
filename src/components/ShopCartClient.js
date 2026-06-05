"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const PAYMENT_TOGGLE_STORAGE_KEY = "wolfden-payments-test-enabled";
const SHOP_CART_UPDATED_EVENT = "wolfden-shop-cart-updated";

const formatMoney = (cents) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents || 0) / 100));

function loadSquarePaymentsScript() {
    if (typeof window === "undefined") {
        return Promise.resolve(null);
    }

    if (window.Square) {
        return Promise.resolve(window.Square);
    }

    const existing = document.querySelector('script[data-square-payments="1"]');

    if (existing) {
        if (window.Square) {
            return Promise.resolve(window.Square);
        }

        if (existing.dataset.squarePaymentsState === "error") {
            return Promise.reject(new Error("Failed to load Square Web Payments SDK."));
        }

        return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                cleanup();
                reject(new Error("Timed out loading Square Web Payments SDK."));
            }, 12000);

            const onLoad = () => {
                cleanup();

                if (window.Square) {
                    resolve(window.Square);
                    return;
                }

                reject(new Error("Square Web Payments SDK loaded without exposing window.Square."));
            };

            const onError = () => {
                cleanup();
                reject(new Error("Failed to load Square Web Payments SDK."));
            };

            const cleanup = () => {
                window.clearTimeout(timeoutId);
                existing.removeEventListener("load", onLoad);
                existing.removeEventListener("error", onError);
            };

            existing.addEventListener("load", onLoad, { once: true });
            existing.addEventListener("error", onError, { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const timeoutId = window.setTimeout(() => {
            script.dataset.squarePaymentsState = "error";
            reject(new Error("Timed out loading Square Web Payments SDK."));
        }, 12000);

        script.src = "https://web.squarecdn.com/v1/square.js";
        script.async = true;
        script.dataset.squarePayments = "1";
        script.dataset.squarePaymentsState = "loading";
        script.onload = () => {
            window.clearTimeout(timeoutId);
            script.dataset.squarePaymentsState = "loaded";

            if (window.Square) {
                resolve(window.Square);
                return;
            }

            reject(new Error("Square Web Payments SDK loaded without exposing window.Square."));
        };
        script.onerror = () => {
            window.clearTimeout(timeoutId);
            script.dataset.squarePaymentsState = "error";
            reject(new Error("Failed to load Square Web Payments SDK."));
        };

        document.head.appendChild(script);
    });
}

function isLocalPaymentsEnabled() {
    try {
        return window.localStorage.getItem(PAYMENT_TOGGLE_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function emitCartUpdated() {
    window.dispatchEvent(new CustomEvent(SHOP_CART_UPDATED_EVENT));
}

export default function ShopCartClient({ paymentsEnabled, squareApplicationId, squareLocationId }) {
    const [localToggleEnabled, setLocalToggleEnabled] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }

        return isLocalPaymentsEnabled();
    });
    const [cartLoading, setCartLoading] = useState(false);
    const [cartMutating, setCartMutating] = useState(false);
    const [checkoutCardState, setCheckoutCardState] = useState("idle");
    const [checkoutBusy, setCheckoutBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [cartData, setCartData] = useState({
        items: [],
        itemCount: 0,
        subtotalCents: 0,
        onlineFeeCents: 0,
        totalCents: 0,
        hasUnavailableItems: false,
    });

    const cardRef = useRef(null);
    const mountId = "square-cart-page-card";

    const canShowCart = Boolean(paymentsEnabled && localToggleEnabled);
    const missingSquareConfig = canShowCart && (!squareApplicationId || !squareLocationId);

    const refreshCart = useCallback(async () => {
        if (!canShowCart) {
            return;
        }

        setCartLoading(true);

        try {
            const response = await fetch("/api/shop/cart", { cache: "no-store" });
            const payload = await response.json().catch(() => null);

            if (!response.ok || !payload) {
                throw new Error(payload?.error || "Could not load cart.");
            }

            setCartData(payload);
            emitCartUpdated();
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not load cart.");
        } finally {
            setCartLoading(false);
        }
    }, [canShowCart]);

    const mutateCart = useCallback(async (payload) => {
        setCartMutating(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch("/api/shop/cart", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
            const nextCart = await response.json().catch(() => null);

            if (!response.ok || !nextCart) {
                throw new Error(nextCart?.error || "Could not update cart.");
            }

            setCartData(nextCart);
            emitCartUpdated();
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not update cart.");
        } finally {
            setCartMutating(false);
        }
    }, []);

    useEffect(() => {
        const onStorage = () => {
            setLocalToggleEnabled(isLocalPaymentsEnabled());
        };

        window.addEventListener("storage", onStorage);

        return () => window.removeEventListener("storage", onStorage);
    }, []);

    useEffect(() => {
        if (!canShowCart) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            refreshCart();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [canShowCart, refreshCart]);

    useEffect(() => {
        if (!canShowCart || !cartData.items.length) {
            if (cardRef.current?.destroy) {
                cardRef.current.destroy().catch(() => undefined);
            }

            cardRef.current = null;
            return;
        }

        if (missingSquareConfig) {
            return;
        }

        let disposed = false;

        const mountCard = async () => {
            try {
                setCheckoutCardState("loading");

                const Square = await loadSquarePaymentsScript();

                if (disposed) {
                    return;
                }

                const payments = Square?.payments?.(squareApplicationId, squareLocationId);

                if (!payments) {
                    throw new Error("Square Web Payments SDK did not initialize.");
                }

                const card = await payments.card();
                await card.attach(`#${mountId}`);

                if (disposed) {
                    await card.destroy().catch(() => undefined);
                    return;
                }

                cardRef.current = card;
                setCheckoutCardState("ready");
            } catch (nextError) {
                if (disposed) {
                    return;
                }

                setCheckoutCardState("error");
                setError(nextError instanceof Error ? nextError.message : "Could not initialize checkout.");
            }
        };

        mountCard();

        return () => {
            disposed = true;
        };
    }, [canShowCart, cartData.items.length, missingSquareConfig, squareApplicationId, squareLocationId]);

    const handleCheckout = async () => {
        if (!cardRef.current || checkoutCardState !== "ready" || checkoutBusy || !cartData.items.length) {
            return;
        }

        setCheckoutBusy(true);
        setError("");
        setSuccess("");

        try {
            const tokenized = await cardRef.current.tokenize();

            if (tokenized?.status !== "OK" || !tokenized.token) {
                throw new Error("Card details were not accepted. Please verify and try again.");
            }

            const response = await fetch("/api/shop/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ sourceId: tokenized.token }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || "Checkout failed. Please try again.");
            }

            setSuccess("Payment complete. Thank you for your order.");
            await refreshCart();
            emitCartUpdated();
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Checkout failed.");
        } finally {
            setCheckoutBusy(false);
        }
    };

    if (!paymentsEnabled) {
        return (
            <section className="card cart-page-shell">
                <h1>Cart</h1>
                <p className="secondary">Online checkout is currently unavailable.</p>
            </section>
        );
    }

    if (!localToggleEnabled) {
        return (
            <section className="card cart-page-shell">
                <h1>Cart</h1>
                <p className="secondary">
                    Cart is hidden by your local test flag. Set <strong>{PAYMENT_TOGGLE_STORAGE_KEY}</strong> to <strong>1</strong> to enable.
                </p>
            </section>
        );
    }

    return (
        <section className="cart-page-shell">
            <article className="card cart-hero-card">
                <h1>Your Cart</h1>
                <p className="secondary cart-hero-copy">Secure checkout powered by Square. We only charge after successful authorization.</p>
                <div className="cart-trust-row">
                    <span className="cart-trust-pill">Square Encrypted Payments</span>
                    <span className="cart-trust-pill">No Card Data Stored On Site</span>
                    <span className="cart-trust-pill">In-Stock Verification At Checkout</span>
                </div>
            </article>

            {cartLoading && <article className="card"><p className="secondary">Loading cart...</p></article>}

            {!cartLoading && !cartData.items.length && (
                <article className="card cart-empty-card">
                    <h2>Your cart is empty</h2>
                    <p className="secondary">Find cards in the shop and add them here for one fast checkout.</p>
                    <Link href="/shop" className="button primary">Browse shop</Link>
                </article>
            )}

            {cartData.items.length > 0 && (
                <div className="cart-grid-layout">
                    <article className="card cart-items-card">
                        {cartData.items.map((item) => (
                            <div key={item.catalogObjectId} className="cart-line-item">
                                <div className="cart-line-image-wrap">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} className="cart-line-image" />
                                    ) : (
                                        <div className="cart-line-image-placeholder">No image</div>
                                    )}
                                </div>
                                <div className="cart-line-main">
                                    <h3>{item.name}</h3>
                                    <p className="secondary">{formatMoney(item.priceCents)} each</p>
                                    {item.unavailable && (
                                        <p className="shop-payment-error">Availability changed. Update quantity to continue.</p>
                                    )}
                                </div>
                                <div className="cart-line-actions">
                                    <button type="button" className="button" disabled={cartMutating} onClick={() => mutateCart({ action: "update", catalogObjectId: item.catalogObjectId, quantity: Math.max(0, item.quantity - 1) })}>-</button>
                                    <span>{item.quantity}</span>
                                    <button type="button" className="button" disabled={cartMutating} onClick={() => mutateCart({ action: "update", catalogObjectId: item.catalogObjectId, quantity: item.quantity + 1 })}>+</button>
                                    <button type="button" className="button" disabled={cartMutating} onClick={() => mutateCart({ action: "remove", catalogObjectId: item.catalogObjectId })}>Remove</button>
                                </div>
                            </div>
                        ))}
                    </article>

                    <article className="card cart-checkout-card">
                        <div className="shop-payment-breakdown">
                            <p><span>Subtotal</span><strong>{formatMoney(cartData.subtotalCents)}</strong></p>
                            <p><span>Online fee (3.5%)</span><strong>{formatMoney(cartData.onlineFeeCents)}</strong></p>
                            <p className="shop-payment-total"><span>Total</span><strong>{formatMoney(cartData.totalCents)}</strong></p>
                        </div>

                        {!missingSquareConfig && <div id={mountId} className="shop-payment-card" />}

                        {missingSquareConfig && <p className="shop-payment-error">Square public configuration is missing.</p>}
                        {!missingSquareConfig && checkoutCardState === "loading" && <p className="secondary">Loading secure card form...</p>}
                        {error && <p className="shop-payment-error">{error}</p>}
                        {success && <p className="shop-payment-success">{success}</p>}

                        <button
                            type="button"
                            className="button primary shop-payment-submit"
                            disabled={checkoutBusy || checkoutCardState !== "ready" || cartData.hasUnavailableItems}
                            onClick={handleCheckout}
                        >
                            {checkoutBusy ? "Processing..." : `Pay ${formatMoney(cartData.totalCents)}`}
                        </button>
                    </article>
                </div>
            )}
        </section>
    );
}
