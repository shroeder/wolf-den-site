"use client";

import { useState } from "react";

const formatPrice = (price) => {
    if (!price) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
};

export default function ShopInventoryClient({ categories }) {
    const [activeId, setActiveId] = useState(categories[0]?.id ?? null);

    const active = categories.find((c) => c.id === activeId) ?? categories[0];

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
                                    <tr key={item.id}>
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
        </div>
    );
}
