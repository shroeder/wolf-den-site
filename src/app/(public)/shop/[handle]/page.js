import Link from "next/link";
import { notFound } from "next/navigation";

import { getInventoryItem } from "@/lib/inventory-feed/feed";
import { productHandle, variationIdFromHandle } from "@/lib/inventory-feed/product-url";
import { SITE_URL } from "@/lib/site";

// Regenerate each product's static HTML at most every 30 min (inventory reconcile runs ~every 15).
export const revalidate = 1800;

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function describe(item) {
    const category = item.categoryNames.length ? ` — ${item.categoryNames.join(", ")}` : "";
    const priced = item.price != null ? ` for ${currency.format(item.price)}` : "";
    const stock = item.inStock ? "In stock now" : "Currently out of stock";
    return `${item.name}${category}${priced} at The Wolf Den in Montgomery, MN. ${stock}.`.slice(0, 300);
}

export async function generateMetadata({ params }) {
    const { handle } = await params;
    const item = await getInventoryItem(variationIdFromHandle(handle));

    if (!item) {
        return { title: "Product | The Wolf Den", robots: { index: false, follow: true } };
    }

    const canonical = `/shop/${productHandle(item.name, item.variationId)}`;
    const description = describe(item);

    return {
        title: `${item.name} | The Wolf Den`,
        description,
        alternates: { canonical },
        // Only let Google index it while it's in stock; keep the URL alive (noindex, not 404) once sold.
        robots: item.inStock ? undefined : { index: false, follow: true },
        openGraph: {
            title: item.name,
            description,
            url: canonical,
            type: "website",
            images: item.imageUrl ? [item.imageUrl] : undefined,
        },
    };
}

export default async function ShopProductPage({ params }) {
    const { handle } = await params;
    const item = await getInventoryItem(variationIdFromHandle(handle));

    if (!item) {
        notFound();
    }

    const url = `${SITE_URL}/shop/${productHandle(item.name, item.variationId)}`;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: item.name,
        ...(item.imageUrl ? { image: [item.imageUrl] } : {}),
        ...(item.categoryNames.length ? { category: item.categoryNames[0] } : {}),
        ...(item.price != null
            ? {
                  offers: {
                      "@type": "Offer",
                      price: item.price.toFixed(2),
                      priceCurrency: "USD",
                      availability: item.inStock
                          ? "https://schema.org/InStock"
                          : "https://schema.org/OutOfStock",
                      url,
                      seller: { "@type": "Store", name: "The Wolf Den" },
                  },
              }
            : {}),
    };

    return (
        <div className="stack reveal">
            <section className="card">
                <p className="mkt-breadcrumb">
                    <Link href="/shop">← Back to the shop</Link>
                </p>
                <div className="mkt-product-head">
                    <div className="mkt-product-art">
                        {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt={item.name} className="mkt-product-image" />
                        ) : (
                            <div className="mkt-product-image mkt-card-image-empty" aria-hidden="true" />
                        )}
                    </div>
                    <div className="mkt-product-info">
                        <h1>{item.name}</h1>
                        {item.categoryNames.length > 0 && (
                            <p className="muted">{item.categoryNames.join(" · ")}</p>
                        )}
                        {item.price != null && (
                            <p className="mkt-market-price">
                                <strong>{currency.format(item.price)}</strong>
                            </p>
                        )}
                        <p className="muted">
                            {item.inStock
                                ? `In stock${item.quantity > 1 ? ` · ${item.quantity} available` : ""} at our Montgomery, MN store`
                                : "Currently out of stock"}
                        </p>
                        <div className="cta-row">
                            <a className="button primary" href="tel:+17014090782">
                                Call: (701) 409-0782
                            </a>
                            <Link className="button" href="/shop">
                                Browse the shop
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        </div>
    );
}
