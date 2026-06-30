import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getVendorStorefront } from "@/lib/marketplace/search.js";

const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const CONDITION_LABELS = {
    NM: "Near Mint",
    LP: "Lightly Played",
    MP: "Moderately Played",
    HP: "Heavily Played",
    DMG: "Damaged",
};

function formatPrice(value) {
    return value === null || value === undefined ? null : priceFormatter.format(Number(value));
}

function monthYear(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : null;
}

function sinceLabel(iso) {
    const then = Date.parse(iso || "");
    if (Number.isNaN(then)) return null;
    const days = Math.round((Date.now() - then) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.round(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

export async function generateMetadata({ params }) {
    const { id } = await params;
    const vendor = await getVendorStorefront(id);

    if (!vendor) {
        return { title: "Vendor | Wolf Den Marketplace" };
    }

    return {
        title: `${vendor.displayName} | Wolf Den Marketplace`,
        description: `Browse ${vendor.displayName}'s inventory${vendor.locationLabel ? ` in ${vendor.locationLabel}` : ""} on The Wolf Den Vendor Marketplace.`,
        alternates: { canonical: `/marketplace/vendor/${vendor.id}` },
    };
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
                </p>
                {price ? <p className="mkt-card-price">{price}</p> : null}
                {market ? <p className="mkt-card-market">Market {market}</p> : null}
                <p className="mkt-card-sub">{listing.quantity} available</p>
            </div>
        </>
    );

    // Matched items link to the shared product page; unmatched ones are just shown.
    return listing.catalogProductId ? (
        <Link href={`/marketplace/product/${listing.catalogProductId}`} className="mkt-card">
            {inner}
        </Link>
    ) : (
        <div className="mkt-card">{inner}</div>
    );
}

export default async function VendorStorefrontPage({ params }) {
    const { id } = await params;
    const vendor = await getVendorStorefront(id);

    if (!vendor) {
        notFound();
    }

    return (
        <div className="stack reveal">
            <section className="card">
                <p className="mkt-breadcrumb">
                    <Link href="/marketplace/vendors">← All vendors</Link>
                </p>
                <h1>{vendor.displayName}</h1>
                <p className="muted">{vendor.locationLabel || vendor.region || "Location TBD"}</p>
                <div className="mkt-trust">
                    <span className="mkt-trust-badge">✓ Verified vendor</span>
                    {monthYear(vendor.memberSince) ? (
                        <span className="mkt-trust-item">Member since {monthYear(vendor.memberSince)}</span>
                    ) : null}
                    <span className="mkt-trust-item">
                        {vendor.listingCount} active listing{vendor.listingCount === 1 ? "" : "s"}
                    </span>
                    {vendor.salesCount > 0 ? (
                        <span className="mkt-trust-item">
                            {vendor.salesCount} completed sale{vendor.salesCount === 1 ? "" : "s"}
                        </span>
                    ) : null}
                    {sinceLabel(vendor.lastListedAt) ? (
                        <span className="mkt-trust-item">Updated {sinceLabel(vendor.lastListedAt)}</span>
                    ) : null}
                </div>
            </section>

            <section className="card">
                {vendor.listings.length === 0 ? (
                    <p className="muted">This vendor has no active listings right now.</p>
                ) : (
                    <div className="mkt-grid">
                        {vendor.listings.map((listing) => (
                            <ListingTile key={listing.listingId} listing={listing} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
