"use client";

import { useMemo, useState } from "react";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const formatPrice = (price) => (typeof price === "number" ? currency.format(price) : null);

const relativeTime = (iso) => {
    const then = Date.parse(iso || "");
    if (Number.isNaN(then)) return null;

    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
};

// Derive sealed/single from the Square category names (e.g. "Pokemon Single Card", "Magic Sealed",
// "Pokemon Booster Packs"). Anything else (paintings, comics, figures, accessories) is "other".
function deriveType(categoryNames) {
    const joined = categoryNames.join(" ").toLowerCase();
    if (/single/.test(joined)) return "single";
    if (/sealed|booster/.test(joined)) return "sealed";
    return "other";
}

const TYPES = [
    { id: "all", label: "All" },
    { id: "single", label: "Singles" },
    { id: "sealed", label: "Sealed" },
];

export default function JustInClient({ items }) {
    const [type, setType] = useState("all");
    const [category, setCategory] = useState("all");

    const typed = useMemo(() => items.map((i) => ({ ...i, type: deriveType(i.categoryNames) })), [items]);

    const categories = useMemo(
        () => Array.from(new Set(items.flatMap((i) => i.categoryNames))).sort((a, b) => a.localeCompare(b)),
        [items]
    );

    const filtered = typed.filter(
        (i) =>
            (type === "all" || i.type === type) &&
            (category === "all" || i.categoryNames.includes(category))
    );

    return (
        <>
            <section className="card just-in-filters">
                <div className="lf-game-toggle" role="group" aria-label="Filter by type">
                    {TYPES.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className={`pill${type === t.id ? " lf-game-active" : ""}`}
                            onClick={() => setType(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="just-in-category">
                    <label className="lf-search-label" htmlFor="just-in-cat">
                        Category
                    </label>
                    <select
                        id="just-in-cat"
                        className="lf-set-select"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                    >
                        <option value="all">All categories</option>
                        {categories.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>
            </section>

            {filtered.length > 0 ? (
                <section className="card">
                    <div className="shop-grid just-in-grid" aria-label="Recently scanned-in items">
                        {filtered.map((item) => {
                            const badgeLabel =
                                item.kind === "restock"
                                    ? "Back in stock"
                                    : item.kind === "price_drop"
                                      ? "Price drop"
                                      : "New";
                            const badgeModifier =
                                item.kind === "restock"
                                    ? " just-in-badge-restock"
                                    : item.kind === "price_drop"
                                      ? " just-in-badge-price-drop"
                                      : "";

                            return (
                                <article key={item.id} className="shop-tile just-in-tile">
                                    <div className="shop-tile-image-wrap">
                                        <span className={`just-in-badge${badgeModifier}`}>{badgeLabel}</span>
                                        {item.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
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
                                        <h2 className="shop-tile-name">{item.name}</h2>
                                        {item.categoryNames.length > 0 && (
                                            <p className="shop-item-category">{item.categoryNames.join(" · ")}</p>
                                        )}
                                        {item.quantity > 1 && (
                                            <p className="just-in-qty">{item.quantity} in stock</p>
                                        )}
                                        <div className="shop-tile-meta-row">
                                            <p className="shop-tile-price">
                                                {formatPrice(item.price) ?? <span className="muted">See in store</span>}
                                            </p>
                                            {relativeTime(item.createdAt) && (
                                                <span className="just-in-time">{relativeTime(item.createdAt)}</span>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : (
                <section className="card">
                    <p className="muted">Nothing matches that filter right now. Try a different type or category.</p>
                </section>
            )}
        </>
    );
}
