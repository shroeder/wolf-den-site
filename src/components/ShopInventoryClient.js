"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTvMode } from "@/lib/tv-mode-client";

const PAYMENT_TOGGLE_STORAGE_KEY = "wolfden-payments-test-enabled";

const formatPrice = (price) => {
    if (!price) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
};

const formatCents = (cents) => formatPrice((Number(cents || 0) / 100));

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

const normalizeCategoryName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const CATEGORY_PRIORITY_RULES = [
    {
        score: 1,
        match: (name) => name.includes("new") && name.includes("last 4 days"),
    },
    {
        score: 10,
        match: (name) => name.includes("pokemon") && (name.includes("single") || name.includes("singles")),
    },
    {
        score: 20,
        match: (name) => name.includes("pokemon") && name.includes("sealed"),
    },
    {
        score: 30,
        match: (name) =>
            name.includes("pokemon") &&
            (name.includes("booster pack") || name.includes("booster packs") || name.includes("packs")),
    },
    {
        score: 40,
        match: (name) => (name.includes("magic") || name.includes("mtg")) && name.includes("sealed"),
    },
    {
        score: 50,
        match: (name) =>
            (name.includes("magic") || name.includes("mtg")) &&
            (name.includes("booster pack") || name.includes("booster packs") || name.includes("packs")),
    },
    {
        score: 900,
        match: (name) => name.includes("accessories") || name.includes("accessory"),
    },
];

const getCategoryPriority = (categoryName) => {
    const normalized = normalizeCategoryName(categoryName);
    const rule = CATEGORY_PRIORITY_RULES.find((entry) => entry.match(normalized));

    if (rule) {
        return rule.score;
    }

    return 500;
};

const sortShopCategories = (categories) =>
    [...categories].sort((left, right) => {
        const priorityDiff = getCategoryPriority(left.name) - getCategoryPriority(right.name);

        if (priorityDiff !== 0) {
            return priorityDiff;
        }

        return left.name.localeCompare(right.name);
    });

const getDetailKey = (item) => `${item.id}-${item.categoryName}`;

export default function ShopInventoryClient({
    categories,
    paymentsEnabled,
    squareApplicationId,
    squareLocationId,
}) {
    const orderedCategories = useMemo(() => sortShopCategories(categories), [categories]);
    const [activeId, setActiveId] = useState(orderedCategories[0]?.id ?? null);
    const [detailItemKey, setDetailItemKey] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLocalPaymentsEnabled, setIsLocalPaymentsEnabled] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }

        try {
            return window.localStorage.getItem(PAYMENT_TOGGLE_STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });
    const [checkoutCardState, setCheckoutCardState] = useState("idle");
    const [checkoutError, setCheckoutError] = useState("");
    const [checkoutMessage, setCheckoutMessage] = useState("");
    const [checkoutBusy, setCheckoutBusy] = useState(false);
    const swipeStartRef = useRef(null);
    const panelRef = useRef(null);
    const cardRef = useRef(null);
    const mountedCardItemIdRef = useRef(null);
    const [tvMode] = useTvMode();

    const selectedCategoryId = orderedCategories.some((category) => category.id === activeId)
        ? activeId
        : orderedCategories[0]?.id ?? null;
    const active = orderedCategories.find((c) => c.id === selectedCategoryId) ?? orderedCategories[0];

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;

    const visibleItems = isSearching
        ? orderedCategories.flatMap((category) =>
            category.items
                .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
                .map((item) => ({ ...item, categoryName: category.name }))
        )
        : (active?.items || []).map((item) => ({ ...item, categoryName: active.name }));

    const detailIndex = detailItemKey === null
        ? -1
        : visibleItems.findIndex((item) => getDetailKey(item) === detailItemKey);
    const detailItem = detailIndex >= 0 ? visibleItems[detailIndex] : null;
    const detailItemId = detailItem?.id || null;
    const canShowPaymentUi = Boolean(paymentsEnabled && isLocalPaymentsEnabled);
    const detailSubtotalCents = detailItem ? Math.round(Number(detailItem.price || 0) * 100) : 0;
    const detailFeeCents = detailSubtotalCents > 0 ? Math.round(detailSubtotalCents * 0.035) : 0;
    const detailTotalCents = detailSubtotalCents + detailFeeCents;
    const squareMountId = detailItemId ? `square-card-${detailItemId.replace(/[^a-zA-Z0-9_-]/g, "-")}` : "";
    const missingSquareConfig = canShowPaymentUi && (!squareApplicationId || !squareLocationId);
    const checkoutReady = checkoutCardState === "ready";

    const resetCheckoutFeedback = () => {
        setCheckoutError("");
        setCheckoutMessage("");
    };

    const closeDetail = () => {
        resetCheckoutFeedback();
        setCheckoutCardState("idle");
        setDetailItemKey(null);
    };

    const openDetailForItem = (item) => {
        resetCheckoutFeedback();
        setCheckoutCardState("idle");
        setDetailItemKey(getDetailKey(item));
    };

    const goToPreviousDetailItem = () => {
        if (visibleItems.length < 2 || detailIndex < 0) {
            return;
        }

        const nextIndex = (detailIndex - 1 + visibleItems.length) % visibleItems.length;
        resetCheckoutFeedback();
        setCheckoutCardState("idle");
        setDetailItemKey(getDetailKey(visibleItems[nextIndex]));
    };

    const goToNextDetailItem = () => {
        if (visibleItems.length < 2 || detailIndex < 0) {
            return;
        }

        const nextIndex = (detailIndex + 1) % visibleItems.length;
        resetCheckoutFeedback();
        setCheckoutCardState("idle");
        setDetailItemKey(getDetailKey(visibleItems[nextIndex]));
    };

    const onDetailTouchStart = (event) => {
        const touch = event.touches[0];
        swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onDetailTouchEnd = (event) => {
        if (!swipeStartRef.current || visibleItems.length < 2) {
            swipeStartRef.current = null;
            return;
        }

        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - swipeStartRef.current.x;
        const deltaY = touch.clientY - swipeStartRef.current.y;
        swipeStartRef.current = null;

        if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
            return;
        }

        if (deltaX > 0) {
            goToPreviousDetailItem();
            return;
        }

        goToNextDetailItem();
    };

    useEffect(() => {
        if (!detailItemId || !canShowPaymentUi) {
            if (cardRef.current && typeof cardRef.current.destroy === "function") {
                cardRef.current.destroy().catch(() => undefined);
            }

            cardRef.current = null;
            mountedCardItemIdRef.current = null;
            return undefined;
        }

        if (missingSquareConfig) {
            return undefined;
        }

        if (mountedCardItemIdRef.current === detailItemId && cardRef.current) {
            return undefined;
        }

        let disposed = false;

        const mountCard = async () => {
            try {
                setCheckoutCardState("loading");
                setCheckoutError("");

                const Square = await loadSquarePaymentsScript();

                if (disposed) {
                    return;
                }

                if (!Square?.payments) {
                    throw new Error("Square Web Payments SDK did not load correctly.");
                }

                if (mountedCardItemIdRef.current !== detailItemId && cardRef.current?.destroy) {
                    await cardRef.current.destroy().catch(() => undefined);
                    cardRef.current = null;
                }

                const payments = Square.payments(squareApplicationId, squareLocationId);
                const card = await payments.card();

                await card.attach(`#${squareMountId}`);

                if (disposed) {
                    await card.destroy().catch(() => undefined);
                    return;
                }

                cardRef.current = card;
                mountedCardItemIdRef.current = detailItemId;
                setCheckoutCardState("ready");
            } catch (error) {
                if (disposed) {
                    return;
                }

                setCheckoutCardState("error");
                setCheckoutError(error instanceof Error ? error.message : "Could not initialize card checkout.");
            }
        };

        mountCard();

        return () => {
            disposed = true;
        };
    }, [canShowPaymentUi, detailItemId, missingSquareConfig, squareApplicationId, squareLocationId, squareMountId]);

    const handleCheckout = async () => {
        if (!detailItem || !cardRef.current || !checkoutReady || checkoutBusy) {
            return;
        }

        setCheckoutBusy(true);
        setCheckoutError("");
        setCheckoutMessage("");

        try {
            const tokenized = await cardRef.current.tokenize();

            if (tokenized?.status !== "OK" || !tokenized.token) {
                throw new Error("Card details were not accepted. Please review and try again.");
            }

            const response = await fetch("/api/shop/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    catalogObjectId: detailItem.id,
                    sourceId: tokenized.token,
                }),
            });

            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || "Checkout failed. Please try again.");
            }

            if (payload?.order?.status === "completed") {
                setCheckoutMessage("Payment complete. Your card was charged successfully.");
                return;
            }

            setCheckoutMessage("Payment submitted and is pending confirmation.");
        } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : "Checkout failed.");
        } finally {
            setCheckoutBusy(false);
        }
    };

    useEffect(() => {
        if (!detailItem) {
            return undefined;
        }

        const onDetailKeys = (event) => {
            if (event.key === "Escape") {
                setDetailItemKey(null);
                return;
            }

            if (event.key === "ArrowLeft") {
                if (visibleItems.length < 2 || detailIndex < 0) {
                    return;
                }

                const nextIndex = (detailIndex - 1 + visibleItems.length) % visibleItems.length;
                setDetailItemKey(getDetailKey(visibleItems[nextIndex]));
                return;
            }

            if (event.key === "ArrowRight") {
                if (visibleItems.length < 2 || detailIndex < 0) {
                    return;
                }

                const nextIndex = (detailIndex + 1) % visibleItems.length;
                setDetailItemKey(getDetailKey(visibleItems[nextIndex]));
            }
        };

        window.addEventListener("keydown", onDetailKeys);

        return () => window.removeEventListener("keydown", onDetailKeys);
    }, [detailIndex, detailItem, visibleItems]);

    useEffect(() => {
        if (!detailItem) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [detailItem]);

    useEffect(() => {
        if (!tvMode || isSearching || orderedCategories.length < 1) {
            return undefined;
        }

        const autoRotateDelayMs = 2600;
        let frameId = null;
        let switchTimeoutId = null;

        const selectNextCategory = () => {
            setActiveId((current) => {
                const activeIndex = orderedCategories.findIndex((category) => category.id === current);

                if (activeIndex < 0) {
                    return orderedCategories[0].id;
                }

                const nextIndex = (activeIndex + 1) % orderedCategories.length;
                return orderedCategories[nextIndex].id;
            });
        };

        const scheduleCategorySwitch = () => {
            if (switchTimeoutId !== null) {
                return;
            }

            switchTimeoutId = window.setTimeout(() => {
                switchTimeoutId = null;
                selectNextCategory();
            }, autoRotateDelayMs);
        };

        const panel = panelRef.current;

        if (panel) {
            panel.scrollTop = 0;
        }

        const tick = () => {
            const scroller = panelRef.current;

            if (!scroller) {
                frameId = window.requestAnimationFrame(tick);
                return;
            }

            const maxScroll = scroller.scrollHeight - scroller.clientHeight;

            if (maxScroll <= 1) {
                scheduleCategorySwitch();
                frameId = window.requestAnimationFrame(tick);
                return;
            }

            scroller.scrollTop = Math.min(scroller.scrollTop + 0.65, maxScroll);

            if (scroller.scrollTop >= maxScroll - 1) {
                scheduleCategorySwitch();
            }

            frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);

        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }

            if (switchTimeoutId !== null) {
                window.clearTimeout(switchTimeoutId);
            }
        };
    }, [tvMode, isSearching, orderedCategories, selectedCategoryId, visibleItems.length]);

    const detailView = detailItem ? (
        <section className="shop-detail-viewport" aria-live="polite" aria-label="Product detail view">
            <div className="shop-detail-shell">
                <div className="shop-detail-head">
                    <button type="button" className="shop-detail-back" onClick={closeDetail} aria-label="Back to shop items">
                        &lt; Back to items
                    </button>
                    <p className="shop-detail-counter">{detailIndex + 1} / {visibleItems.length}</p>
                </div>

                <div
                    className="shop-detail-stage"
                    onTouchStart={onDetailTouchStart}
                    onTouchEnd={onDetailTouchEnd}
                >
                    {visibleItems.length > 1 && (
                        <button
                            type="button"
                            className="shop-detail-nav shop-detail-nav-prev"
                            onClick={goToPreviousDetailItem}
                            aria-label="View previous product"
                        >
                            &lt;
                        </button>
                    )}

                    {detailItem.imageUrl ? (
                        <img
                            src={detailItem.imageUrl}
                            alt={detailItem.name}
                            className="shop-detail-photo"
                            decoding="async"
                        />
                    ) : (
                        <div className="shop-detail-photo-placeholder" aria-hidden="true">
                            No image available
                        </div>
                    )}

                    {visibleItems.length > 1 && (
                        <button
                            type="button"
                            className="shop-detail-nav shop-detail-nav-next"
                            onClick={goToNextDetailItem}
                            aria-label="View next product"
                        >
                            &gt;
                        </button>
                    )}
                </div>

                <div className="shop-detail-meta">
                    <h3>{detailItem.name}</h3>
                    <p className="shop-detail-summary">
                        {formatPrice(detailItem.price) ?? "Price unavailable"} | {detailItem.quantity} in stock
                    </p>
                    <p className="shop-detail-category secondary">{detailItem.categoryName}</p>

                    {paymentsEnabled && !isLocalPaymentsEnabled && (
                        <p className="shop-payment-note secondary">
                            Test checkout is off. Use the toggle above to enable payment testing.
                        </p>
                    )}

                    {canShowPaymentUi && detailSubtotalCents > 0 && detailItem.quantity > 0 && (
                        <div className="shop-payment-panel">
                            <div className="shop-payment-breakdown">
                                <p><span>Subtotal</span><strong>{formatCents(detailSubtotalCents)}</strong></p>
                                <p><span>Online fee (3.5%)</span><strong>{formatCents(detailFeeCents)}</strong></p>
                                <p className="shop-payment-total"><span>Total</span><strong>{formatCents(detailTotalCents)}</strong></p>
                            </div>

                            {!missingSquareConfig && <div id={squareMountId} className="shop-payment-card" aria-live="polite" />}

                            {missingSquareConfig && (
                                <p className="shop-payment-error">Square configuration is missing. Add public app and location IDs.</p>
                            )}

                            {!missingSquareConfig && checkoutCardState === "loading" && (
                                <p className="shop-payment-note secondary">Loading secure card form...</p>
                            )}

                            {checkoutError && <p className="shop-payment-error">{checkoutError}</p>}
                            {checkoutMessage && <p className="shop-payment-success">{checkoutMessage}</p>}

                            <button
                                type="button"
                                className="button primary shop-payment-submit"
                                onClick={handleCheckout}
                                disabled={!checkoutReady || checkoutBusy}
                            >
                                {checkoutBusy ? "Processing..." : `Pay ${formatCents(detailTotalCents)}`}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    ) : null;

    return (
        <>
            <div className="shop-inventory">
                <div className="shop-search-row">
                    <label htmlFor="shop-product-search" className="sr-only">
                        Search products across categories
                    </label>
                    <input
                        id="shop-product-search"
                        type="search"
                        className="shop-search-input"
                        placeholder="Search products across all categories"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    {isSearching && (
                        <p className="secondary shop-search-meta">
                            {visibleItems.length} result{visibleItems.length === 1 ? "" : "s"} across all categories
                        </p>
                    )}
                </div>

                {tvMode && active && !isSearching && (
                    <p className="shop-tv-now secondary" aria-live="polite">
                        Showing category: <strong>{active.name}</strong>
                    </p>
                )}

                <div className="shop-category-mobile" aria-hidden={isSearching ? "true" : "false"}>
                    <label htmlFor="shop-category-select" className="shop-category-mobile-label">
                        Category
                    </label>
                    <select
                        id="shop-category-select"
                        className="shop-category-mobile-select"
                        value={selectedCategoryId ?? ""}
                        onChange={(event) => setActiveId(event.target.value)}
                        disabled={isSearching}
                    >
                        {orderedCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name} ({category.items.length})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="shop-category-tabs" role="tablist" aria-label="Inventory categories">
                    {orderedCategories.map((category) => (
                        <button
                            key={category.id}
                            role="tab"
                            aria-selected={category.id === selectedCategoryId}
                            className={`shop-tab${category.id === selectedCategoryId ? " shop-tab-active" : ""}`}
                            onClick={() => setActiveId(category.id)}
                        >
                            {category.name}
                            <span className="shop-tab-count">{category.items.length}</span>
                        </button>
                    ))}
                </div>

                {active && (
                    <div role="tabpanel" className="shop-panel" ref={panelRef}>
                        <div className="shop-grid" aria-live="polite">
                            {visibleItems.map((item) => (
                                <article
                                    key={`${item.id}-${item.categoryName}`}
                                    className="shop-tile shop-tile-action"
                                    onClick={() => {
                                        openDetailForItem(item);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Open product details for ${item.name}`}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            openDetailForItem(item);
                                        }
                                    }}
                                >
                                    <div className="shop-tile-image-wrap">
                                        {item.imageUrl ? (
                                            <img
                                                src={item.imageUrl}
                                                alt={item.name}
                                                className="shop-tile-image"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <div className="shop-tile-image-placeholder" aria-hidden="true">
                                                No image
                                            </div>
                                        )}
                                    </div>

                                    <div className="shop-tile-body">
                                        <h3 className="shop-tile-name">{item.name}</h3>
                                        {isSearching && <p className="shop-item-category">{item.categoryName}</p>}
                                        <div className="shop-tile-meta-row">
                                            <p className="shop-tile-price">{formatPrice(item.price) ?? <span className="muted">Price unavailable</span>}</p>
                                            <span className="shop-qty-badge">{item.quantity} in stock</span>
                                        </div>
                                    </div>
                                </article>
                            ))}

                            {visibleItems.length === 0 && (
                                <p className="consignment-empty shop-empty">No products matched &quot;{searchTerm}&quot;.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {typeof document !== "undefined" && detailView ? createPortal(detailView, document.body) : null}
        </>
    );
}
