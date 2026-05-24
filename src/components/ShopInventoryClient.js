"use client";

import { useEffect, useState } from "react";

const formatPrice = (price) => {
    if (!price) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
};

export default function ShopInventoryClient({ categories }) {
    const [activeId, setActiveId] = useState(categories[0]?.id ?? null);
    const [modalItem, setModalItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    const active = categories.find((c) => c.id === activeId) ?? categories[0];

    const closeModalOnOverlayInteraction = (event) => {
        if (event.target === event.currentTarget) {
            setModalItem(null);
        }
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;

    const visibleItems = isSearching
        ? categories.flatMap((category) =>
              category.items
                  .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
                  .map((item) => ({ ...item, categoryName: category.name }))
          )
        : (active?.items || []).map((item) => ({ ...item, categoryName: active.name }));
    useEffect(() => {
        const onEscape = (event) => {
            if (event.key === "Escape") {
                setModalItem(null);
            }
        };

        window.addEventListener("keydown", onEscape);

        return () => window.removeEventListener("keydown", onEscape);
    }, []);

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
                {categories.map((category) => (
                    <button
                        key={category.id}
                        role="tab"
                        aria-selected={category.id === activeId}
                        className={`shop-tab${category.id === activeId ? " shop-tab-active" : ""}`}
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
                                    if (item.imageUrl) {
                                        setModalItem(item);
                                    }
                                }}
                                role={item.imageUrl ? "button" : undefined}
                                tabIndex={item.imageUrl ? 0 : undefined}
                                aria-label={item.imageUrl ? `View larger image for ${item.name}` : undefined}
                                onKeyDown={(event) => {
                                    if (!item.imageUrl) {
                                        return;
                                    }

                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setModalItem(item);
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
                >
                    <div
                        className="shop-image-modal-card"
                        onMouseDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                    >
                        <button type="button" className="shop-image-modal-close" onClick={() => setModalItem(null)} aria-label="Close image">
                            Close
                        </button>
                        <h3>{modalItem.name}</h3>
                        <img src={modalItem.imageUrl} alt={modalItem.name} className="shop-image-modal-photo" />
                        <p className="secondary">
                            {formatPrice(modalItem.price) ?? "Price unavailable"} | In stock: {modalItem.quantity}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
