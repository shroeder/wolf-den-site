"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const formatPrice = (price) => {
    if (!price) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
};

const normalizeCategoryName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const CATEGORY_PRIORITY_RULES = [
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

export default function ShopInventoryClient({ categories }) {
    const orderedCategories = useMemo(() => sortShopCategories(categories), [categories]);
    const [activeId, setActiveId] = useState(orderedCategories[0]?.id ?? null);
    const [modalIndex, setModalIndex] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const swipeStartRef = useRef(null);

    const selectedCategoryId = orderedCategories.some((category) => category.id === activeId)
        ? activeId
        : orderedCategories[0]?.id ?? null;
    const active = orderedCategories.find((c) => c.id === selectedCategoryId) ?? orderedCategories[0];

    const closeModalOnOverlayInteraction = (event) => {
        if (event.target === event.currentTarget) {
            setModalIndex(null);
        }
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;

    const visibleItems = isSearching
        ? orderedCategories.flatMap((category) =>
              category.items
                  .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
                  .map((item) => ({ ...item, categoryName: category.name }))
          )
        : (active?.items || []).map((item) => ({ ...item, categoryName: active.name }));

    const modalItems = useMemo(() => visibleItems.filter((item) => item.imageUrl), [visibleItems]);
    const modalItem = modalIndex === null ? null : modalItems[modalIndex] ?? null;

    const closeModal = useCallback(() => setModalIndex(null), []);

    const openModalForItem = (item) => {
        if (!item.imageUrl) {
            return;
        }

        const index = modalItems.findIndex((candidate) => candidate.id === item.id && candidate.categoryName === item.categoryName);
        if (index >= 0) {
            setModalIndex(index);
        }
    };

    const goToPreviousModalItem = useCallback(() => {
        if (modalItems.length < 2) {
            return;
        }

        setModalIndex((previousIndex) => {
            if (previousIndex === null) {
                return previousIndex;
            }

            return (previousIndex - 1 + modalItems.length) % modalItems.length;
        });
    }, [modalItems.length]);

    const goToNextModalItem = useCallback(() => {
        if (modalItems.length < 2) {
            return;
        }

        setModalIndex((previousIndex) => {
            if (previousIndex === null) {
                return previousIndex;
            }

            return (previousIndex + 1) % modalItems.length;
        });
    }, [modalItems.length]);

    const onModalTouchStart = (event) => {
        const touch = event.touches[0];
        swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onModalTouchEnd = (event) => {
        if (!swipeStartRef.current || modalItems.length < 2) {
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
            goToPreviousModalItem();
            return;
        }

        goToNextModalItem();
    };

    useEffect(() => {
        if (modalIndex === null) {
            return undefined;
        }

        const onModalKeys = (event) => {
            if (event.key === "Escape") {
                closeModal();
                return;
            }

            if (event.key === "ArrowLeft") {
                goToPreviousModalItem();
                return;
            }

            if (event.key === "ArrowRight") {
                goToNextModalItem();
            }
        };

        window.addEventListener("keydown", onModalKeys);

        return () => window.removeEventListener("keydown", onModalKeys);
    }, [closeModal, goToNextModalItem, goToPreviousModalItem, modalIndex]);

    useEffect(() => {
        if (!modalItem) {
            return undefined;
        }

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previous;
        };
    }, [modalItem]);

    return (
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
                <div role="tabpanel" className="shop-panel">
                    <div className="shop-grid" aria-live="polite">
                        {visibleItems.map((item) => (
                            <article
                                key={`${item.id}-${item.categoryName}`}
                                className={`shop-tile${item.imageUrl ? " shop-tile-has-image" : ""}`}
                                onClick={() => {
                                    openModalForItem(item);
                                }}
                                role={item.imageUrl ? "button" : undefined}
                                tabIndex={item.imageUrl ? 0 : undefined}
                                aria-label={item.imageUrl ? `Open product gallery for ${item.name}` : undefined}
                                onKeyDown={(event) => {
                                    if (!item.imageUrl) {
                                        return;
                                    }

                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        openModalForItem(item);
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

            {modalItem && (
                <div
                    className="shop-image-modal"
                    onMouseDown={closeModalOnOverlayInteraction}
                    onTouchStart={closeModalOnOverlayInteraction}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Product image viewer"
                >
                    <div
                        className="shop-image-modal-card"
                        onMouseDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                    >
                        <div className="shop-image-modal-topbar">
                            <p className="shop-image-modal-category">{modalItem.categoryName}</p>
                            <p className="shop-image-modal-counter">{modalIndex + 1} / {modalItems.length}</p>
                            <button type="button" className="shop-image-modal-close" onClick={closeModal} aria-label="Close image viewer">
                                Close
                            </button>
                        </div>

                        <div
                            className="shop-image-modal-stage"
                            onTouchStart={onModalTouchStart}
                            onTouchEnd={onModalTouchEnd}
                        >
                            {modalItems.length > 1 && (
                                <button
                                    type="button"
                                    className="shop-image-modal-nav shop-image-modal-nav-prev"
                                    onClick={goToPreviousModalItem}
                                    aria-label="View previous product"
                                >
                                    Prev
                                </button>
                            )}

                            <img
                                src={modalItem.imageUrl}
                                alt={modalItem.name}
                                className="shop-image-modal-photo"
                                decoding="async"
                            />

                            {modalItems.length > 1 && (
                                <button
                                    type="button"
                                    className="shop-image-modal-nav shop-image-modal-nav-next"
                                    onClick={goToNextModalItem}
                                    aria-label="View next product"
                                >
                                    Next
                                </button>
                            )}
                        </div>

                        <div className="shop-image-modal-details">
                            <h3>{modalItem.name}</h3>
                            <p className="secondary">
                                {formatPrice(modalItem.price) ?? "Price unavailable"} | In stock: {modalItem.quantity}
                            </p>
                            {modalItems.length > 1 && (
                                <p className="shop-image-modal-help secondary">Swipe on mobile, or use arrow keys and Prev/Next on desktop.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
