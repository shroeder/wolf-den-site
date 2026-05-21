"use client";

import { useEffect, useState } from "react";

const formatPrice = (price) => {
    if (!price) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
};

export default function ShopInventoryClient({ categories }) {
    const [activeId, setActiveId] = useState(categories[0]?.id ?? null);
    const [modalItem, setModalItem] = useState(null);

    const active = categories.find((c) => c.id === activeId) ?? categories[0];
    useEffect(() => {
        const onEscape = (event) => {
            if (event.key === "Escape") {
                setModalItem(null);
            }
        };

        window.addEventListener("keydown", onEscape);

        return () => window.removeEventListener("keydown", onEscape);
    }, []);

    return (
        <div className="shop-inventory">
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
                    <div className="consignment-table-wrap">
                        <table className="consignment-table shop-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th className="shop-col-price">Price</th>
                                    <th className="shop-col-qty">In Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                {active.items.map((item) => (
                                        <tr
                                            key={item.id}
                                            className={item.imageUrl ? "shop-row-has-image" : undefined}
                                            onClick={() => {
                                                if (item.imageUrl) {
                                                    setModalItem(item);
                                                }
                                            }}
                                        >
                                        <td>{item.name}</td>
                                        <td className="shop-col-price">
                                            {formatPrice(item.price) ?? <span className="muted">—</span>}
                                        </td>
                                        <td className="shop-col-qty">
                                            <span className="shop-qty-badge">{item.quantity}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {modalItem && (
                <div className="shop-image-modal" onClick={() => setModalItem(null)}>
                    <div className="shop-image-modal-card" onClick={(event) => event.stopPropagation()}>
                        <button className="shop-image-modal-close" onClick={() => setModalItem(null)} aria-label="Close image">
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
