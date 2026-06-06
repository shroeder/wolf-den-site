"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAYMENT_TOGGLE_STORAGE_KEY = "wolfden-payments-test-enabled";
const SHOP_CART_UPDATED_EVENT = "wolfden-shop-cart-updated";

const formatMoney = (cents) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents || 0) / 100));

const US_STATE_OPTIONS = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

function buildSquareCardStyles() {
    return {
        ".input-container": {
            "border-color": "rgba(255, 255, 255, 0.18)",
            "border-radius": "10px",
            "background-color": "rgba(16, 16, 16, 0.96)",
        },
        ".input-container.is-focus": {
            "border-color": "rgba(212, 175, 55, 0.65)",
        },
        ".input-container.is-error": {
            "border-color": "rgba(246, 147, 147, 0.92)",
        },
        input: {
            color: "#f4f2eb",
            "font-size": "15px",
        },
        "input::placeholder": {
            color: "rgba(228, 228, 228, 0.62)",
        },
        ".message-text": {
            color: "rgba(236, 230, 214, 0.86)",
            "font-size": "12px",
        },
        ".message-icon": {
            color: "rgba(236, 230, 214, 0.86)",
        },
        ".message-text.is-error": {
            color: "#f7a6a6",
        },
        ".message-icon.is-error": {
            color: "#f7a6a6",
        },
    };
}

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

function validateShippingForm(shipping) {
    const fieldErrors = {};

    if (!String(shipping.name || "").trim()) {
        fieldErrors.shippingName = "Full name is required.";
    }

    const email = String(shipping.email || "").trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        fieldErrors.shippingEmail = "Enter a valid email address.";
    }

    const phone = String(shipping.phone || "").replace(/\D/g, "");

    if (phone.length < 10) {
        fieldErrors.shippingPhone = "Enter a valid phone number.";
    }

    if (!String(shipping.addressLine1 || "").trim()) {
        fieldErrors.shippingAddressLine1 = "Address line 1 is required.";
    }

    if (!String(shipping.city || "").trim()) {
        fieldErrors.shippingCity = "City is required.";
    }

    const state = String(shipping.state || "").trim().toUpperCase();

    if (!/^[A-Z]{2}$/.test(state)) {
        fieldErrors.shippingState = "Use a valid 2-letter US state.";
    }

    const postalCode = String(shipping.postalCode || "").trim();

    if (!/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
        fieldErrors.shippingPostalCode = "Use ZIP format 12345 or 12345-6789.";
    }

    return fieldErrors;
}

function normalizeShippingForm(shipping) {
    return {
        name: String(shipping.name || "").trim(),
        email: String(shipping.email || "").trim().toLowerCase(),
        phone: String(shipping.phone || "").trim(),
        addressLine1: String(shipping.addressLine1 || "").trim(),
        addressLine2: String(shipping.addressLine2 || "").trim(),
        city: String(shipping.city || "").trim(),
        state: String(shipping.state || "").trim().toUpperCase(),
        postalCode: String(shipping.postalCode || "").trim(),
        country: "US",
    };
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
    const [lineItemMutatingId, setLineItemMutatingId] = useState("");
    const [checkoutCardState, setCheckoutCardState] = useState("idle");
    const [checkoutBusy, setCheckoutBusy] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [authCustomer, setAuthCustomer] = useState(null);
    const [fulfillmentMode, setFulfillmentMode] = useState("");
    const [saveCustomerProfile, setSaveCustomerProfile] = useState(false);
    const [profileLookupBusy, setProfileLookupBusy] = useState(false);
    const [profileLookupMessage, setProfileLookupMessage] = useState("");
    const [shippingForm, setShippingForm] = useState({
        name: "",
        email: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
    });
    const [fieldErrors, setFieldErrors] = useState({});
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
    const normalizedShipping = useMemo(() => normalizeShippingForm(shippingForm), [shippingForm]);
    const shippingFieldErrors = useMemo(() => validateShippingForm(normalizedShipping), [normalizedShipping]);
    const hasFulfillmentChoice = fulfillmentMode === "shipping" || fulfillmentMode === "pickup";
    const isShippingReady = fulfillmentMode === "shipping" && Object.keys(shippingFieldErrors).length === 0;
    const isFulfillmentReady = fulfillmentMode === "pickup" || isShippingReady;
    const canSubmitCheckout = Boolean(
        checkoutCardState === "ready"
        && !checkoutBusy
        && cartData.items.length
        && !cartData.hasUnavailableItems
        && hasFulfillmentChoice
        && isFulfillmentReady
    );

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
        const targetCatalogObjectId = String(payload?.catalogObjectId || "").trim();

        setCartMutating(true);
        setLineItemMutatingId(targetCatalogObjectId);
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
            setLineItemMutatingId("");
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

    const refreshAuthSession = useCallback(async () => {
        if (!canShowCart) {
            setAuthCustomer(null);
            return;
        }

        setAuthLoading(true);

        try {
            const response = await fetch("/api/shop/auth", { cache: "no-store" });
            const payload = await response.json().catch(() => null);

            if (!response.ok || !payload) {
                throw new Error("Could not load sign-in status.");
            }

            setAuthCustomer(payload.authenticated ? payload.customer : null);
        } catch (nextError) {
            setAuthCustomer(null);
        } finally {
            setAuthLoading(false);
        }
    }, [canShowCart]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            refreshAuthSession();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [refreshAuthSession]);

    useEffect(() => {
        if (canShowCart && cartData.items.length) {
            return;
        }

        if (cardRef.current?.destroy) {
            cardRef.current.destroy().catch(() => undefined);
        }

        cardRef.current = null;

        const mountNode = document.getElementById(mountId);

        if (mountNode) {
            mountNode.innerHTML = "";
        }
    }, [canShowCart, cartData.items.length]);

    useEffect(() => {
        if (!canShowCart || !cartData.items.length) {
            return;
        }

        if (missingSquareConfig) {
            return;
        }

        if (cardRef.current) {
            setCheckoutCardState("ready");
            return;
        }

        let disposed = false;
        let mountedCard = null;

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

                const mountNode = document.getElementById(mountId);

                if (mountNode) {
                    mountNode.innerHTML = "";
                }

                const card = await payments.card({
                    style: buildSquareCardStyles(),
                });
                mountedCard = card;
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
                console.warn("Square card initialization failed", nextError);
                setError("Secure card form is temporarily unavailable. Refresh and try again.");
            }
        };

        mountCard();

        return () => {
            disposed = true;

            if (mountedCard?.destroy) {
                mountedCard.destroy().catch(() => undefined);
            }
        };
    }, [canShowCart, cartData.items.length, missingSquareConfig, squareApplicationId, squareLocationId]);

    const handleCheckout = async () => {
        if (!canSubmitCheckout) {
            return;
        }

        setCheckoutBusy(true);
        setError("");
        setSuccess("");
        setFieldErrors({});

        if (!hasFulfillmentChoice) {
            setError("Choose shipping or local pickup before paying.");
            setCheckoutBusy(false);
            return;
        }

        const checkoutPayload = {
            sourceId: null,
            fulfillmentMode,
            saveCustomerProfile: Boolean(saveCustomerProfile && authCustomer),
        };

        if (fulfillmentMode === "shipping") {
            const localFieldErrors = validateShippingForm(normalizedShipping);

            if (Object.keys(localFieldErrors).length > 0) {
                setFieldErrors(localFieldErrors);
                setCheckoutBusy(false);
                return;
            }

            checkoutPayload.shipping = normalizedShipping;
        }

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
                body: JSON.stringify({
                    ...checkoutPayload,
                    sourceId: tokenized.token,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                if (payload?.fieldErrors && typeof payload.fieldErrors === "object") {
                    setFieldErrors(payload.fieldErrors);
                }
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

    const handleLoadAuthenticatedProfile = async () => {
        setProfileLookupBusy(true);
        setProfileLookupMessage("");

        try {
            const response = await fetch("/api/shop/customer-profile", {
                cache: "no-store",
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || "Could not load saved profile.");
            }

            if (!payload?.found || !payload?.profile) {
                setProfileLookupMessage("No saved profile is linked to your account yet.");
                return;
            }

            setShippingForm((current) => ({
                ...current,
                name: payload.profile.name || current.name,
                email: payload.profile.email || current.email,
                phone: payload.profile.phone || current.phone,
                addressLine1: payload.profile.addressLine1 || current.addressLine1,
                addressLine2: payload.profile.addressLine2 || current.addressLine2,
                city: payload.profile.city || current.city,
                state: payload.profile.state || current.state,
                postalCode: payload.profile.postalCode || current.postalCode,
            }));
            setFieldErrors({});
            setProfileLookupMessage("Saved profile loaded from your account.");
            setFulfillmentMode("shipping");
        } catch (nextError) {
            setProfileLookupMessage(nextError instanceof Error ? nextError.message : "Could not load saved profile.");
        } finally {
            setProfileLookupBusy(false);
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

            {cartLoading && !cartData.items.length && (
                <article className="card cart-loading-card" aria-busy="true" aria-live="polite">
                    <div className="cart-loading-line cart-loading-line-title" />
                    <div className="cart-loading-line" />
                    <div className="cart-loading-line cart-loading-line-short" />
                </article>
            )}

            {cartLoading && cartData.items.length > 0 && <p className="secondary cart-loading-inline">Refreshing cart totals...</p>}

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
                            <div key={item.catalogObjectId} className="cart-line-item" aria-busy={lineItemMutatingId === item.catalogObjectId ? "true" : "false"}>
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
                                    <button
                                        type="button"
                                        className="button"
                                        disabled={cartMutating || item.unavailable || item.quantity >= item.maxQuantity}
                                        onClick={() => mutateCart({ action: "update", catalogObjectId: item.catalogObjectId, quantity: Math.min(item.maxQuantity, item.quantity + 1) })}
                                    >
                                        +
                                    </button>
                                    <button type="button" className="button" disabled={cartMutating} onClick={() => mutateCart({ action: "remove", catalogObjectId: item.catalogObjectId })}>
                                        {lineItemMutatingId === item.catalogObjectId ? "Updating..." : "Remove"}
                                    </button>
                                </div>
                                {lineItemMutatingId === item.catalogObjectId && <p className="cart-line-status secondary">Updating item...</p>}
                            </div>
                        ))}
                    </article>

                    <article className="card cart-checkout-card">
                        <div className="cart-fulfillment-panel" aria-live="polite">
                            <div className="cart-account-panel">
                                <p className="cart-fulfillment-label">Account</p>
                                <div className="cart-account-row">
                                    <p className="secondary">
                                        {authLoading
                                            ? "Checking account status..."
                                            : authCustomer
                                                ? <>Signed in as <strong>{authCustomer.email}</strong></>
                                                : "Not signed in. Sign in to load and save shipping info."}
                                    </p>
                                    <Link href="/shop/account" className="button" prefetch={false}>Manage account</Link>
                                </div>
                            </div>

                            <section className="cart-fulfillment-section" aria-label="Fulfillment">
                                <p className="cart-fulfillment-label">Fulfillment</p>
                                <div className="cart-fulfillment-toggle" role="tablist" aria-label="Choose shipping or pickup">
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={fulfillmentMode === "shipping"}
                                        className={fulfillmentMode === "shipping" ? "cart-fulfillment-mode cart-fulfillment-mode-active" : "cart-fulfillment-mode"}
                                        onClick={() => setFulfillmentMode("shipping")}
                                        disabled={checkoutBusy}
                                    >
                                        Ship to me
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={fulfillmentMode === "pickup"}
                                        className={fulfillmentMode === "pickup" ? "cart-fulfillment-mode cart-fulfillment-mode-active" : "cart-fulfillment-mode"}
                                        onClick={() => setFulfillmentMode("pickup")}
                                        disabled={checkoutBusy}
                                    >
                                        Local pickup
                                    </button>
                                </div>
                                {!hasFulfillmentChoice ? <p className="secondary">Choose shipping or pickup to continue.</p> : null}

                                {fulfillmentMode === "shipping" ? (
                                <div className="cart-shipping-form">
                                    <div className="cart-saved-profile-row cart-field-full">
                                        {authCustomer ? (
                                            <button
                                                type="button"
                                                className="button"
                                                onClick={handleLoadAuthenticatedProfile}
                                                disabled={profileLookupBusy || checkoutBusy}
                                            >
                                                {profileLookupBusy ? "Loading..." : "Load my saved info"}
                                            </button>
                                        ) : (
                                            <p className="secondary">Sign in to load saved shipping info.</p>
                                        )}
                                        {profileLookupMessage ? <p className="secondary cart-field-full">{profileLookupMessage}</p> : null}
                                    </div>

                                    <label className="cart-field cart-field-full">
                                        <span>Full name</span>
                                        <input
                                            type="text"
                                            value={shippingForm.name}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, name: event.target.value }))}
                                            aria-invalid={fieldErrors.shippingName ? "true" : "false"}
                                            autoComplete="name"
                                        />
                                        {fieldErrors.shippingName ? <small className="shop-payment-error">{fieldErrors.shippingName}</small> : null}
                                    </label>
                                    <label className="cart-field">
                                        <span>Email</span>
                                        <input
                                            type="email"
                                            value={shippingForm.email}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, email: event.target.value }))}
                                            aria-invalid={fieldErrors.shippingEmail ? "true" : "false"}
                                            autoComplete="email"
                                        />
                                        {fieldErrors.shippingEmail ? <small className="shop-payment-error">{fieldErrors.shippingEmail}</small> : null}
                                    </label>
                                    <label className="cart-field">
                                        <span>Phone</span>
                                        <input
                                            type="tel"
                                            value={shippingForm.phone}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, phone: event.target.value }))}
                                            aria-invalid={fieldErrors.shippingPhone ? "true" : "false"}
                                            autoComplete="tel"
                                        />
                                        {fieldErrors.shippingPhone ? <small className="shop-payment-error">{fieldErrors.shippingPhone}</small> : null}
                                    </label>
                                    <label className="cart-field cart-field-full">
                                        <span>Address line 1</span>
                                        <input
                                            type="text"
                                            value={shippingForm.addressLine1}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, addressLine1: event.target.value }))}
                                            aria-invalid={fieldErrors.shippingAddressLine1 ? "true" : "false"}
                                            autoComplete="address-line1"
                                        />
                                        {fieldErrors.shippingAddressLine1 ? <small className="shop-payment-error">{fieldErrors.shippingAddressLine1}</small> : null}
                                    </label>
                                    <label className="cart-field cart-field-full">
                                        <span>Address line 2 (optional)</span>
                                        <input
                                            type="text"
                                            value={shippingForm.addressLine2}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, addressLine2: event.target.value }))}
                                            autoComplete="address-line2"
                                        />
                                    </label>
                                    <label className="cart-field">
                                        <span>City</span>
                                        <input
                                            type="text"
                                            value={shippingForm.city}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, city: event.target.value }))}
                                            aria-invalid={fieldErrors.shippingCity ? "true" : "false"}
                                            autoComplete="address-level2"
                                        />
                                        {fieldErrors.shippingCity ? <small className="shop-payment-error">{fieldErrors.shippingCity}</small> : null}
                                    </label>
                                    <label className="cart-field">
                                        <span>State</span>
                                        <select
                                            value={shippingForm.state}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, state: event.target.value }))}
                                            aria-invalid={fieldErrors.shippingState ? "true" : "false"}
                                            autoComplete="address-level1"
                                        >
                                            <option value="">Select state</option>
                                            {US_STATE_OPTIONS.map((stateCode) => (
                                                <option key={stateCode} value={stateCode}>{stateCode}</option>
                                            ))}
                                        </select>
                                        {fieldErrors.shippingState ? <small className="shop-payment-error">{fieldErrors.shippingState}</small> : null}
                                    </label>
                                    <label className="cart-field">
                                        <span>ZIP code</span>
                                        <input
                                            type="text"
                                            value={shippingForm.postalCode}
                                            onChange={(event) => setShippingForm((current) => ({ ...current, postalCode: event.target.value }))}
                                            aria-invalid={fieldErrors.shippingPostalCode ? "true" : "false"}
                                            autoComplete="postal-code"
                                        />
                                        {fieldErrors.shippingPostalCode ? <small className="shop-payment-error">{fieldErrors.shippingPostalCode}</small> : null}
                                    </label>
                                    <label className="cart-field-full cart-save-profile-toggle">
                                        <input
                                            type="checkbox"
                                            checked={saveCustomerProfile}
                                            onChange={(event) => setSaveCustomerProfile(event.target.checked)}
                                            disabled={checkoutBusy || !authCustomer}
                                        />
                                        <span>
                                            {authCustomer
                                                ? "Save this shipping info for faster checkout next time."
                                                : "Sign in to save shipping info to your account."}
                                        </span>
                                    </label>
                                    {fieldErrors.shippingCountry ? <p className="shop-payment-error cart-field-full">{fieldErrors.shippingCountry}</p> : null}
                                </div>
                                ) : null}

                                {fulfillmentMode === "pickup" ? (
                                    <p className="secondary">Local pickup selected. Shipping address is not required.</p>
                                ) : null}
                            </section>
                        </div>

                        <div className="shop-payment-breakdown">
                            <p><span>Subtotal</span><strong>{formatMoney(cartData.subtotalCents)}</strong></p>
                            <p><span>Online fee (3.5%)</span><strong>{formatMoney(cartData.onlineFeeCents)}</strong></p>
                            <p className="shop-payment-total"><span>Total</span><strong>{formatMoney(cartData.totalCents)}</strong></p>
                        </div>

                        {!missingSquareConfig && checkoutCardState !== "error" && (
                            <div className={checkoutCardState === "loading" ? "shop-payment-card shop-payment-card-loading" : "shop-payment-card"}>
                                <div id={mountId} />
                            </div>
                        )}

                        {missingSquareConfig && <p className="shop-payment-error">Square public configuration is missing.</p>}
                        {!missingSquareConfig && checkoutCardState === "loading" && <p className="secondary">Loading secure card form...</p>}
                        {error && <p className="shop-payment-error">{error}</p>}
                        {success && <p className="shop-payment-success">{success}</p>}

                        <button
                            type="button"
                            className="button primary shop-payment-submit shop-payment-submit-desktop"
                            disabled={!canSubmitCheckout}
                            onClick={handleCheckout}
                        >
                            {checkoutBusy ? "Processing..." : `Pay ${formatMoney(cartData.totalCents)}`}
                        </button>
                        {!hasFulfillmentChoice ? <p className="secondary">Select shipping or pickup to enable payment.</p> : null}
                        {fulfillmentMode === "shipping" && !isShippingReady ? <p className="secondary">Complete shipping fields to enable payment.</p> : null}
                    </article>
                </div>
            )}

            {cartData.items.length > 0 && (
                <div className="shop-payment-mobile-bar" aria-live="polite">
                    <div className="shop-payment-mobile-meta">
                        <p className="shop-payment-mobile-total-label">Total</p>
                        <strong className="shop-payment-mobile-total-value">{formatMoney(cartData.totalCents)}</strong>
                    </div>
                    <button
                        type="button"
                        className="button primary shop-payment-submit shop-payment-submit-mobile"
                        disabled={!canSubmitCheckout}
                        onClick={handleCheckout}
                    >
                        {checkoutBusy ? "Processing..." : "Pay now"}
                    </button>
                </div>
            )}
        </section>
    );
}
