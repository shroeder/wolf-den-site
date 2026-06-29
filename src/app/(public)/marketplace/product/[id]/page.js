import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import MarketplaceOffers from "@/components/MarketplaceOffers";
import { getProductWithOffers } from "@/lib/marketplace/search.js";

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
        return { title: "Marketplace", description: "The Wolf Den Vendor Marketplace." };
    }

    return {
        title: `${product.name} | Wolf Den Marketplace`,
        description: `See vendor prices for ${product.name}${product.setName ? ` (${product.setName})` : ""} on The Wolf Den Vendor Marketplace.`,
        alternates: { canonical: `/marketplace/product/${product.catalogProductId}` },
    };
}

export default async function MarketplaceProductPage({ params }) {
    const { id } = await params;
    const product = await getProductWithOffers(id);

    if (!product) {
        notFound();
    }

    const marketPrice = formatPrice(product.marketPrice);

    return (
        <div className="stack reveal">
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

            <section className="card">
                <h2>Vendor offers</h2>
                <MarketplaceOffers offers={product.offers} productName={product.name} />
            </section>
        </div>
    );
}
