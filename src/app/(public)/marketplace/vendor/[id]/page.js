import Link from "next/link";
import { notFound } from "next/navigation";

import ViewPing from "@/components/ViewPing";
import VendorStorefrontListings from "@/components/VendorStorefrontListings";
import { getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { getVendorStorefront } from "@/lib/marketplace/search.js";

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

function responseLabel(hours) {
    if (hours == null || Number.isNaN(hours)) return null;
    if (hours < 1) return "Replies within an hour";
    if (hours < 24) return `Replies in ~${Math.round(hours)}h`;
    return `Replies in ~${Math.round(hours / 24)}d`;
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

export default async function VendorStorefrontPage({ params }) {
    const { id } = await params;
    let vendor = await getVendorStorefront(id);
    let adminPreview = false;

    // Inactive vendors (invited / suspended / removed) aren't public — but a marketplace admin should
    // still be able to inspect their inventory from the admin portal instead of hitting a 404.
    if (!vendor) {
        const admin = await getMarketplaceAdmin();
        if (admin) {
            vendor = await getVendorStorefront(id, { includeInactive: true });
            adminPreview = Boolean(vendor);
        }
    }

    if (!vendor) {
        notFound();
    }

    return (
        <div className="stack reveal">
            <ViewPing event="view_vendor" meta={{ vendorId: id }} />
            <section className="card">
                <p className="mkt-breadcrumb">
                    <Link href="/marketplace/vendors">← All vendors</Link>
                </p>
                {adminPreview ? (
                    <p className="mkt-admin-preview-banner">
                        Admin preview — this vendor is <strong>{vendor.status}</strong> and not publicly listed.
                    </p>
                ) : null}
                <div className="mkt-vendor-head">
                    {vendor.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={vendor.logoUrl} alt={`${vendor.displayName} logo`} className="mkt-vendor-logo mkt-vendor-logo-lg" />
                    ) : null}
                    <div>
                        <h1>{vendor.displayName}</h1>
                        <p className="muted">{vendor.locationLabel || vendor.region || "Location TBD"}</p>
                    </div>
                </div>
                <div className="mkt-trust">
                    <span className="mkt-trust-badge">✓ Verified vendor</span>
                    {vendor.activeThisWeek ? <span className="mkt-trust-badge">🟢 Active this week</span> : null}
                    {vendor.localPickup ? <span className="mkt-trust-item">Local pickup</span> : null}
                    {vendor.ships ? <span className="mkt-trust-item">Ships</span> : null}
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
                    {vendor.requestTotal >= 3 && vendor.closeRate != null ? (
                        <span className="mkt-trust-item">{Math.round(vendor.closeRate * 100)}% close rate</span>
                    ) : null}
                    {vendor.requestTotal >= 3 && responseLabel(vendor.avgResponseHours) ? (
                        <span className="mkt-trust-item">{responseLabel(vendor.avgResponseHours)}</span>
                    ) : null}
                    {sinceLabel(vendor.lastListedAt) ? (
                        <span className="mkt-trust-item">Updated {sinceLabel(vendor.lastListedAt)}</span>
                    ) : null}
                </div>
                {vendor.specialties && vendor.specialties.length > 0 ? (
                    <div className="mkt-specialty-tags">
                        {vendor.specialties.map((s) => (
                            <span key={s} className="mkt-specialty-tag">
                                {s}
                            </span>
                        ))}
                    </div>
                ) : null}
            </section>

            <section className="card">
                {vendor.listings.length === 0 ? (
                    <p className="muted">This vendor has no active listings right now.</p>
                ) : (
                    <VendorStorefrontListings listings={vendor.listings} />
                )}
            </section>
        </div>
    );
}
