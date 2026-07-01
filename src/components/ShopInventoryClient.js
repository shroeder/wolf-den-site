"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { productHandle } from "@/lib/inventory-feed/product-url";
import { useTvMode } from "@/lib/tv-mode-client";

const PAYMENT_TOGGLE_STORAGE_KEY = "wolfden-payments-test-enabled";

const formatPrice = (price) => {
    if (!price) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
};


const normalizeCategoryName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const CATEGORY_PRIORITY_RULES = [
    {
        score: 1,
        match: (name) => name.includes("just in"),
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

const SORT_OPTIONS = [
    { value: "featured", label: "Featured" },
    { value: "price-asc", label: "Price: Low to High" },
    { value: "price-desc", label: "Price: High to Low" },
];

const sortVisibleItems = (items, sortMode) => {
    if (sortMode !== "price-asc" && sortMode !== "price-desc") {
        return items;
    }

    const direction = sortMode === "price-asc" ? 1 : -1;

    return [...items].sort((left, right) => {
        const leftHasPrice = typeof left.price === "number" && !Number.isNaN(left.price);
        const rightHasPrice = typeof right.price === "number" && !Number.isNaN(right.price);

        // Items without a price always sort to the bottom, regardless of direction.
        if (!leftHasPrice && !rightHasPrice) {
            return 0;
        }
        if (!leftHasPrice) {
            return 1;
        }
        if (!rightHasPrice) {
            return -1;
        }

        return (left.price - right.price) * direction;
    });
};

function CartGlyph() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="shop-cart-icon-svg">
            <path
                d="M3 4h2.1c.4 0 .8.3.9.7l.4 2.3h12.5c.7 0 1.2.7 1 1.4l-1.3 5.1c-.1.4-.5.8-1 .8H8.2c-.5 0-.9-.3-1-.8L5.6 6.1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx="9" cy="18.4" r="1.6" fill="currentColor" />
            <circle cx="16.8" cy="18.4" r="1.6" fill="currentColor" />
        </svg>
    );
}

function dedupeSearchItems(items) {
    const seen = new Set();
    const deduped = [];

    for (const item of items) {
        const key = String(item.id || "").trim();

        if (!key || seen.has(key)) {
            continue;
        }

        seen.add(key);
        deduped.push(item);
    }

    return deduped;
}

export default function ShopInventoryClient({
    categories,
    paymentsEnabled,
}) {
    const orderedCategories = useMemo(() => sortShopCategories(categories), [categories]);
    const [activeId, setActiveId] = useState(orderedCategories[0]?.id ?? null);
    const [detailItemKey, setDetailItemKey] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [setFilter, setSetFilter] = useState("");
    const [sortMode, setSortMode] = useState("featured");

    // Sets present among in-stock singles (tagged server-side from the TCG SKU) — drives the Set filter.
    const availableSets = useMemo(() => {
        const seen = new Set();
        for (const category of orderedCategories) {
            for (const item of category.items || []) {
                if (item.setName) seen.add(item.setName);
            }
        }
        return Array.from(seen).sort();
    }, [orderedCategories]);
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
    const [cartCount, setCartCount] = useState(null);
    const [cartItemQuantities, setCartItemQuantities] = useState({});
    const [cartMutatingItemId, setCartMutatingItemId] = useState("");
    const [cartSyncing, setCartSyncing] = useState(false);
    const [vendorMatches, setVendorMatches] = useState([]);
    const [cartError, setCartError] = useState("");
    const swipeStartRef = useRef(null);
    const panelRef = useRef(null);
    const [tvMode] = useTvMode();
    const resolvedCartCount = Number(cartCount || 0);
    const cartCountLoading = cartCount === null || cartSyncing;

    const selectedCategoryId = orderedCategories.some((category) => category.id === activeId)
        ? activeId
        : orderedCategories[0]?.id ?? null;
    const active = orderedCategories.find((c) => c.id === selectedCategoryId) ?? orderedCategories[0];

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;
    const isFiltering = isSearching || Boolean(setFilter);

    const matchedItems = isFiltering
        ? dedupeSearchItems(
            orderedCategories.flatMap((category) =>
                category.items
                    .filter(
                        (item) =>
                            (!normalizedSearch || item.name.toLowerCase().includes(normalizedSearch)) &&
                            (!setFilter || item.setName === setFilter)
                    )
                    .map((item) => ({ ...item, categoryName: category.name }))
            )
        )
        : (active?.items || []).map((item) => ({ ...item, categoryName: active.name }));

    const visibleItems = sortVisibleItems(matchedItems, sortMode);

    // Catalog ids we already stock (scanned singles carry a "TCG-<id>" SKU). The vendor outlet hides
    // anything in this set, so it only ever surfaces products we DON'T have — your stock stays primary.
    const ownCatalogIds = new Set();
    for (const item of matchedItems) {
        const match = /^TCG-(\d+)$/i.exec(item.sku || "");
        if (match) {
            ownCatalogIds.add(match[1]);
        }
    }
    const vendorOnlyMatches = isSearching
        ? vendorMatches.filter((r) => r && !ownCatalogIds.has(String(r.catalogProductId)))
        : [];

    const detailIndex = detailItemKey === null
        ? -1
        : visibleItems.findIndex((item) => getDetailKey(item) === detailItemKey);
    const detailItem = detailIndex >= 0 ? visibleItems[detailIndex] : null;
    const canShowPaymentUi = Boolean(paymentsEnabled && isLocalPaymentsEnabled);

    const cartQuantityForItem = useCallback((itemId) => {
        if (!canShowPaymentUi) {
            return 0;
        }

        return Number(cartItemQuantities[itemId] || 0);
    }, [canShowPaymentUi, cartItemQuantities]);

    const applyCartSnapshot = useCallback((payload) => {
        const itemCount = Number(payload?.itemCount || 0);
        const quantities = {};

        for (const cartItem of payload?.items || []) {
            const key = String(cartItem.catalogObjectId || "").trim();

            if (!key) {
                continue;
            }

            quantities[key] = Number(cartItem.quantity || 0);
        }

        setCartCount(itemCount);
        setCartItemQuantities(quantities);
    }, []);

    const refreshCartCount = useCallback(async () => {
        if (!canShowPaymentUi) {
            return;
        }

        setCartSyncing(true);

        try {
            const response = await fetch("/api/shop/cart", { cache: "no-store" }).catch(() => null);
            const payload = response ? await response.json().catch(() => null) : null;

            if (!response?.ok || !payload) {
                return;
            }

            applyCartSnapshot(payload);
        } finally {
            setCartSyncing(false);
        }
    }, [applyCartSnapshot, canShowPaymentUi]);

    const addToCart = useCallback(async (item) => {
        if (!canShowPaymentUi) {
            return;
        }

        setCartMutatingItemId(item.id);
        setCartError("");

        try {
            const response = await fetch("/api/shop/cart", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    action: "add",
                    catalogObjectId: item.id,
                    quantity: 1,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok || !payload) {
                throw new Error(payload?.error || "Could not update cart.");
            }

            applyCartSnapshot(payload);
            window.dispatchEvent(new CustomEvent("wolfden-shop-cart-updated"));
        } catch (error) {
            setCartError(error instanceof Error ? error.message : "Could not update cart.");
        } finally {
            setCartMutatingItemId("");
        }
    }, [applyCartSnapshot, canShowPaymentUi]);

    useEffect(() => {
        const onStorage = () => {
            try {
                setIsLocalPaymentsEnabled(window.localStorage.getItem(PAYMENT_TOGGLE_STORAGE_KEY) === "1");
            } catch {
                setIsLocalPaymentsEnabled(false);
            }
        };

        window.addEventListener("storage", onStorage);

        return () => {
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    useEffect(() => {
        if (!canShowPaymentUi) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            refreshCartCount();
        }, 0);

        const onCartUpdated = () => {
            refreshCartCount();
        };

        window.addEventListener("wolfden-shop-cart-updated", onCartUpdated);

        return () => {
            window.clearTimeout(timeoutId);
            window.removeEventListener("wolfden-shop-cart-updated", onCartUpdated);
        };
    }, [canShowPaymentUi, refreshCartCount]);

    // Marketplace outlet: when a shopper searches, fetch what local vendors have for the same query.
    // Our own inventory always renders first; these only show as a fallback for products we lack.
    useEffect(() => {
        let cancelled = false;
        const term = normalizedSearch;

        const timeoutId = window.setTimeout(async () => {
            if (term.length < 2) {
                if (!cancelled) setVendorMatches([]);
                return;
            }

            try {
                const response = await fetch(
                    `/api/marketplace/search?q=${encodeURIComponent(term)}&limit=12`,
                    { cache: "no-store" }
                ).catch(() => null);
                const payload = response?.ok ? await response.json().catch(() => null) : null;
                if (!cancelled) {
                    setVendorMatches(Array.isArray(payload?.results) ? payload.results : []);
                }
            } catch {
                if (!cancelled) setVendorMatches([]);
            }
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [normalizedSearch]);

    const closeDetail = () => {
        setDetailItemKey(null);
    };

    const openDetailForItem = (item) => {
        setDetailItemKey(getDetailKey(item));
    };

    const goToPreviousDetailItem = () => {
        if (visibleItems.length < 2 || detailIndex < 0) {
            return;
        }

        const nextIndex = (detailIndex - 1 + visibleItems.length) % visibleItems.length;
        setDetailItemKey(getDetailKey(visibleItems[nextIndex]));
    };

    const goToNextDetailItem = () => {
        if (visibleItems.length < 2 || detailIndex < 0) {
            return;
        }

        const nextIndex = (detailIndex + 1) % visibleItems.length;
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
                    {canShowPaymentUi && cartQuantityForItem(detailItem.id) > 0 && (
                        <p className="shop-in-cart-note">In your cart: {cartQuantityForItem(detailItem.id)}</p>
                    )}

                    {paymentsEnabled && !isLocalPaymentsEnabled && (
                        <p className="shop-payment-note secondary">
                            Test checkout is off. Set local storage key <strong>{PAYMENT_TOGGLE_STORAGE_KEY}</strong> to <strong>1</strong>.
                        </p>
                    )}

                    {cartError && <p className="shop-payment-error">{cartError}</p>}

                    {canShowPaymentUi && detailItem.quantity > 0 && (
                        <div className="shop-payment-panel">
                            <button
                                type="button"
                                className="button primary shop-payment-submit"
                                onClick={() => addToCart(detailItem)}
                                disabled={Boolean(cartMutatingItemId)}
                            >
                                {cartMutatingItemId === detailItem.id ? "Adding to cart..." : "Add to cart"}
                            </button>
                            <Link href="/cart" className="button shop-payment-submit">
                                View cart
                                <span className={cartCountLoading ? "shop-inline-cart-badge shop-inline-cart-badge-loading" : "shop-inline-cart-badge"} aria-live="polite">
                                    {cartCountLoading ? "" : resolvedCartCount}
                                </span>
                            </Link>
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
                    {isFiltering && (
                        <p className="secondary shop-search-meta">
                            {visibleItems.length} result{visibleItems.length === 1 ? "" : "s"}
                            {setFilter ? ` in ${setFilter}` : " across all categories"}
                        </p>
                    )}

                    {availableSets.length > 0 && (
                        <div className="shop-sort-control">
                            <label htmlFor="shop-set-select" className="shop-sort-label">
                                Set
                            </label>
                            <select
                                id="shop-set-select"
                                className="shop-sort-select"
                                value={setFilter}
                                onChange={(event) => setSetFilter(event.target.value)}
                            >
                                <option value="">All sets</option>
                                {availableSets.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="shop-sort-control">
                        <label htmlFor="shop-sort-select" className="shop-sort-label">
                            Sort by
                        </label>
                        <select
                            id="shop-sort-select"
                            className="shop-sort-select"
                            value={sortMode}
                            onChange={(event) => setSortMode(event.target.value)}
                        >
                            {SORT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {canShowPaymentUi && (
                        <Link href="/cart" className="shop-cart-launch" aria-label={`Open cart with ${resolvedCartCount} item${resolvedCartCount === 1 ? "" : "s"}`}>
                            <CartGlyph />
                            <span className={cartCountLoading ? "shop-cart-badge shop-cart-badge-loading" : "shop-cart-badge"} aria-live="polite">
                                {cartCountLoading ? "" : resolvedCartCount}
                            </span>
                            <span className="sr-only">Open cart</span>
                        </Link>
                    )}
                </div>

                {tvMode && active && !isSearching && (
                    <p className="shop-tv-now secondary" aria-live="polite">
                        Showing category: <strong>{active.name}</strong>
                    </p>
                )}

                <div className="shop-category-mobile" aria-hidden={isFiltering ? "true" : "false"}>
                    <label htmlFor="shop-category-select" className="shop-category-mobile-label">
                        Category
                    </label>
                    <select
                        id="shop-category-select"
                        className="shop-category-mobile-select"
                        value={selectedCategoryId ?? ""}
                        onChange={(event) => setActiveId(event.target.value)}
                        disabled={isFiltering}
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
                                        {isFiltering && <p className="shop-item-category">{item.categoryName}</p>}
                                        <div className="shop-tile-meta-row">
                                            <p className="shop-tile-price">{formatPrice(item.price) ?? <span className="muted">Price unavailable</span>}</p>
                                            <div className="shop-tile-badges">
                                                {canShowPaymentUi && cartQuantityForItem(item.id) > 0 && (
                                                    <span className="shop-in-cart-badge">In cart: {cartQuantityForItem(item.id)}</span>
                                                )}
                                                <span className="shop-qty-badge">{item.quantity} in stock</span>
                                            </div>
                                        </div>
                                        <Link
                                            href={`/shop/${productHandle(item.name, item.id)}`}
                                            className="shop-tile-permalink"
                                            onClick={(event) => event.stopPropagation()}
                                            aria-label={`View the ${item.name} page`}
                                        >
                                            View page →
                                        </Link>
                                    </div>
                                </article>
                            ))}

                            {visibleItems.length === 0 && (
                                <p className="consignment-empty shop-empty">
                                    {vendorOnlyMatches.length > 0
                                        ? `We don't carry "${searchTerm}" in store right now — but local vendors do, below ↓`
                                        : setFilter && !isSearching
                                          ? `No in-stock singles from ${setFilter} right now.`
                                          : `No products matched "${searchTerm}".`}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {isSearching && vendorOnlyMatches.length > 0 && (
                    <section className="shop-vendor-outlet" aria-label="Available from local vendors">
                        <div className="shop-vendor-outlet-head">
                            <h2>Also available from local vendors</h2>
                            <p className="secondary">
                                Not on our shelves right now — these are listed by vetted local vendors on the
                                Wolf Den Marketplace. Inspect and pick them up in person.
                            </p>
                        </div>
                        <div className="shop-grid">
                            {vendorOnlyMatches.map((result) => (
                                <Link
                                    key={result.catalogProductId}
                                    href={`/marketplace/product/${result.catalogProductId}`}
                                    className="shop-tile shop-tile-action"
                                >
                                    <div className="shop-tile-image-wrap">
                                        {result.imageUrl ? (
                                            <img
                                                src={result.imageUrl}
                                                alt={result.name}
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
                                        <h3 className="shop-tile-name">{result.name}</h3>
                                        {result.setName || result.game ? (
                                            <p className="shop-item-category">{result.setName || result.game}</p>
                                        ) : null}
                                        <div className="shop-tile-meta-row">
                                            <p className="shop-tile-price">
                                                {result.minPrice != null
                                                    ? `From ${formatPrice(result.minPrice)}`
                                                    : <span className="muted">See offers</span>}
                                            </p>
                                            <span className="shop-qty-badge">
                                                {result.vendorCount} vendor{result.vendorCount === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                        <span className="shop-tile-permalink">View offers →</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {canShowPaymentUi && (cartCountLoading || resolvedCartCount > 0) && (
                    <Link href="/cart" className="shop-mobile-cart-fab" aria-label={`Go to cart with ${resolvedCartCount} item${resolvedCartCount === 1 ? "" : "s"}`}>
                        <CartGlyph />
                        <span className={cartCountLoading ? "shop-cart-badge shop-cart-badge-loading" : "shop-cart-badge"} aria-live="polite">
                            {cartCountLoading ? "" : resolvedCartCount}
                        </span>
                        <span className="sr-only">Go to cart</span>
                    </Link>
                )}
            </div>

            {typeof document !== "undefined" && detailView ? createPortal(detailView, document.body) : null}
        </>
    );
}
