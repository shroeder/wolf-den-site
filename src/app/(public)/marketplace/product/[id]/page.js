import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import MarketplaceOffers from "@/components/MarketplaceOffers";
import ProductViewBeacon from "@/components/ProductViewBeacon";
import { getProductWithOffers } from "@/lib/marketplace/search.js";
import { SITE_URL } from "@/lib/site";

// Regenerate cached HTML every 30 min as vendor offers change.
export const revalidate = 1800;

const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function formatPrice(value) {
    return value === null || value === undefined ? null : priceFormatter.format(Number(value));
}

export async function generateMetadata({ params }) {
    const { id } = await params;
    const product = await getProductWithOffers(id);

    if (!product) {
        return { title: "Marketplace", description: "The Wolf Den Vendor Marketplace.", robots: { index: false, follow: true } };
    }

    const canonical = `/marketplace/product/${product.catalogProductId}`;
    const description = `See vendor prices for ${product.name}${product.setName ? ` (${product.setName})` : ""} on The Wolf Den Vendor Marketplace.`;

    return {
        title: `${product.name} | Wolf Den Marketplace`,
        description,
        alternates: { canonical },
        // Only index products a vendor actually has in stock — never the empty catalog pages.
        robots: product.offers.length > 0 ? undefined : { index: false, follow: true },
        openGraph: {
            title: product.name,
            description,
            url: canonical,
            type: "website",
            images: product.imageUrl ? [product.imageUrl] : undefined,
        },
    };
}

export default async function MarketplaceProductPage({ params }) {
    const { id } = await params;
    const product = await getProductWithOffers(id);

    if (!product) {
        notFound();
    }

    const marketPrice = formatPrice(product.marketPrice);

    const offerPrices = product.offers.map((o) => o.price).filter((p) => p != null);
    const jsonLd =
        offerPrices.length > 0
            ? {
                  "@context": "https://schema.org",
                  "@type": "Product",
                  name: product.name,
                  ...(product.imageUrl ? { image: [product.imageUrl] } : {}),
                  ...(product.setName ? { category: product.setName } : {}),
                  offers: {
                      "@type": "AggregateOffer",
                      priceCurrency: "USD",
                      lowPrice: Math.min(...offerPrices).toFixed(2),
                      highPrice: Math.max(...offerPrices).toFixed(2),
                      offerCount: product.offers.length,
                      availability: "https://schema.org/InStock",
                      url: `${SITE_URL}/marketplace/product/${product.catalogProductId}`,
                  },
              }
            : null;

    return (
        <div className="stack reveal">
            <ProductViewBeacon catalogProductId={product.catalogProductId} />
            <section className="card">
                <p className="mkt-breadcrumb">
                    <Link href="/marketplace">← Back to marketplace</Link>
                </p>
                <div className="mkt-product-head">
                    <div className="mkt-product-art">
                        {product.imageUrl ? (
                            <Image
                                src={product.imageUrl}
                                alt={product.name}
                                width={240}
                                height={335}
                                sizes="240px"
                                className="mkt-product-image"
                            />
                        ) : (
                            <div className="mkt-product-image mkt-card-image-empty" aria-hidden="true" />
                        )}
                    </div>
                    <div className="mkt-product-info">
                        <h1>{product.name}</h1>
                        <p className="muted">
                            {product.setName}
                            {product.number ? ` · #${product.number}` : ""}
                            {product.rarity ? ` · ${product.rarity}` : ""}
                        </p>
                        {marketPrice ? (
                            <p className="mkt-market-price">
                                TCG market price: <strong>{marketPrice}</strong>
                            </p>
                        ) : null}
                        <p className="muted">
                            {product.offers.length} vendor offer{product.offers.length === 1 ? "" : "s"} available.
                        </p>
                    </div>
                </div>
            </section>

            {product.networkStats && product.networkStats.vendorCount > 0 ? (
                <section className="card">
                    <h2>In this network</h2>
                    <div className="mkt-live-stats">
                        <span className="mkt-live-stat">
                            <strong>{product.networkStats.copies}</strong> cop{product.networkStats.copies === 1 ? "y" : "ies"} available
                        </span>
                        <span className="mkt-live-stat">
                            across <strong>{product.networkStats.vendorCount}</strong> vendor
                            {product.networkStats.vendorCount === 1 ? "" : "s"}
                        </span>
                        {product.networkStats.lowestPrice != null ? (
                            <span className="mkt-live-stat">
                                lowest local <strong>{formatPrice(product.networkStats.lowestPrice)}</strong>
                            </span>
                        ) : null}
                        {product.networkStats.avgPrice != null ? (
                            <span className="mkt-live-stat">
                                avg asking <strong>{formatPrice(product.networkStats.avgPrice)}</strong>
                            </span>
                        ) : null}
                        {product.networkStats.trend && product.networkStats.trend.copiesDelta !== 0 ? (
                            <span className="mkt-live-stat">
                                copies {product.networkStats.trend.copiesDelta > 0 ? "▲" : "▼"}
                                {Math.abs(product.networkStats.trend.copiesDelta)} vs last wk
                            </span>
                        ) : null}
                        {product.networkStats.trend &&
                        product.networkStats.trend.lowPriceDelta != null &&
                        product.networkStats.trend.lowPriceDelta !== 0 ? (
                            <span className="mkt-live-stat">
                                low price {product.networkStats.trend.lowPriceDelta > 0 ? "▲" : "▼"}
                                {formatPrice(Math.abs(product.networkStats.trend.lowPriceDelta))} vs last wk
                            </span>
                        ) : null}
                    </div>
                    <p className="muted">Prices seen inside The Wolf Den network — not a global price guide.</p>
                </section>
            ) : null}

            <section className="card">
                <h2>Vendor offers</h2>
                <MarketplaceOffers
                    offers={product.offers}
                    productName={product.name}
                    catalogProductId={product.catalogProductId}
                />
            </section>

            {jsonLd ? (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            ) : null}
        </div>
    );
}
