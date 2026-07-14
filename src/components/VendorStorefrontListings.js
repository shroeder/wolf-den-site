"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import ThemedSelect from "@/components/ThemedSelect";
import { GAME_SLUGS, gameLabel } from "@/lib/tcg-games";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const CONDITION_LABELS = {
    NM: "Near Mint",
    LP: "Lightly Played",
    MP: "Moderately Played",
    HP: "Heavily Played",
    DMG: "Damaged",
};
const CONDITION_ORDER = ["NM", "LP", "MP", "HP", "DMG"];

const SORT_OPTIONS = [
    { value: "featured", label: "Featured" },
    { value: "price-asc", label: "Price: Low to High" },
    { value: "price-desc", label: "Price: High to Low" },
];

function formatPrice(value) {
    return value === null || value === undefined ? null : priceFormatter.format(Number(value));
}

// The value the condition filter matches on: graded cards collapse to "GRADED", everything else uses
// its raw condition code (NM/LP/MP/HP/DMG).
function listingCondition(listing) {
    return listing.graded ? "GRADED" : listing.condition || null;
}

function ListingTile({ listing }) {
    const price = formatPrice(listing.price);
    const market = formatPrice(listing.marketPrice);
    const condition = listing.graded
        ? [listing.gradingCompany, listing.grade].filter(Boolean).join(" ") || "Graded"
        : listing.condition
          ? CONDITION_LABELS[listing.condition] || listing.condition
          : null;

    const inner = (
        <>
            <div className="mkt-card-art">
                {listing.imageUrl ? (
                    <Image
                        src={listing.imageUrl}
                        alt={listing.title}
                        width={146}
                        height={204}
                        sizes="146px"
                        className="mkt-card-image"
                    />
                ) : (
                    <div className="mkt-card-image mkt-card-image-empty" aria-hidden="true" />
                )}
            </div>
            <div className="mkt-card-body">
                <h3 className="mkt-card-name">{listing.title}</h3>
                <p className="mkt-card-meta">
                    {listing.setName || (listing.kind === "sealed" ? "Sealed" : "Single")}
                    {condition ? ` · ${condition}` : ""}
                    {listing.language && listing.language !== "English" ? ` · ${listing.language}` : ""}
                </p>
                {price ? <p className="mkt-card-price">{price}</p> : null}
                {market ? <p className="mkt-card-market">Market {market}</p> : null}
                <p className="mkt-card-sub">{listing.quantity} available</p>
            </div>
        </>
    );

    return listing.catalogProductId ? (
        <Link href={`/marketplace/product/${listing.catalogProductId}`} className="mkt-card">
            {inner}
        </Link>
    ) : (
        <div className="mkt-card">{inner}</div>
    );
}

export default function VendorStorefrontListings({ listings }) {
    const [search, setSearch] = useState("");
    const [gameFilter, setGameFilter] = useState("");
    const [setFilter, setSetFilter] = useState("");
    const [conditionFilter, setConditionFilter] = useState("");
    const [sortMode, setSortMode] = useState("featured");

    // Games present in this vendor's stock, in the canonical TCG_GAMES order (Magic, Pokémon, Yu-Gi-Oh…).
    const availableGames = useMemo(() => {
        const seen = new Set();
        for (const l of listings) if (l.game) seen.add(l.game);
        return GAME_SLUGS.filter((g) => seen.has(g));
    }, [listings]);

    const availableSets = useMemo(() => {
        const seen = new Set();
        for (const l of listings) if (l.setName) seen.add(l.setName);
        return Array.from(seen).sort();
    }, [listings]);

    const availableConditions = useMemo(() => {
        const seen = new Set();
        let hasGraded = false;
        for (const l of listings) {
            const c = listingCondition(l);
            if (c === "GRADED") hasGraded = true;
            else if (c) seen.add(c);
        }
        const out = CONDITION_ORDER.filter((c) => seen.has(c));
        if (hasGraded) out.push("GRADED");
        return out;
    }, [listings]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        let out = listings.filter(
            (l) =>
                (!q || (l.title || "").toLowerCase().includes(q) || (l.setName || "").toLowerCase().includes(q)) &&
                (!gameFilter || l.game === gameFilter) &&
                (!setFilter || l.setName === setFilter) &&
                (!conditionFilter || listingCondition(l) === conditionFilter)
        );
        if (sortMode === "price-asc" || sortMode === "price-desc") {
            const dir = sortMode === "price-asc" ? 1 : -1;
            out = [...out].sort((a, b) => {
                const aNull = a.price === null || a.price === undefined;
                const bNull = b.price === null || b.price === undefined;
                if (aNull && bNull) return 0;
                if (aNull) return 1; // unpriced listings sink to the bottom
                if (bNull) return -1;
                return (Number(a.price) - Number(b.price)) * dir;
            });
        }
        return out;
    }, [listings, search, setFilter, conditionFilter, sortMode]);

    return (
        <>
            <div className="mkt-filter-bar">
                <input
                    className="mkt-filter-search"
                    type="search"
                    placeholder="Search this vendor…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search listings"
                />
                {availableGames.length > 1 && (
                    <div className="shop-sort-control">
                        <label className="shop-sort-label">Game</label>
                        <ThemedSelect
                            block
                            ariaLabel="Filter by game"
                            value={gameFilter}
                            onChange={setGameFilter}
                            options={[{ value: "", label: "All games" }, ...availableGames.map((g) => ({ value: g, label: gameLabel(g) }))]}
                        />
                    </div>
                )}
                {availableSets.length > 0 && (
                    <div className="shop-sort-control">
                        <label className="shop-sort-label">Set</label>
                        <ThemedSelect
                            block
                            ariaLabel="Filter by set"
                            value={setFilter}
                            onChange={setSetFilter}
                            options={[{ value: "", label: "All sets" }, ...availableSets.map((n) => ({ value: n, label: n }))]}
                        />
                    </div>
                )}
                {availableConditions.length > 0 && (
                    <div className="shop-sort-control">
                        <label className="shop-sort-label">Condition</label>
                        <ThemedSelect
                            block
                            ariaLabel="Filter by condition"
                            value={conditionFilter}
                            onChange={setConditionFilter}
                            options={[
                                { value: "", label: "All conditions" },
                                ...availableConditions.map((c) => ({ value: c, label: c === "GRADED" ? "Graded" : CONDITION_LABELS[c] || c })),
                            ]}
                        />
                    </div>
                )}
                <div className="shop-sort-control">
                    <label className="shop-sort-label">Sort</label>
                    <ThemedSelect block ariaLabel="Sort by" value={sortMode} onChange={setSortMode} options={SORT_OPTIONS} />
                </div>
            </div>

            {visible.length === 0 ? (
                <p className="muted">No listings match your filters.</p>
            ) : (
                <div className="mkt-grid">
                    {visible.map((listing) => (
                        <ListingTile key={listing.listingId} listing={listing} />
                    ))}
                </div>
            )}
        </>
    );
}
