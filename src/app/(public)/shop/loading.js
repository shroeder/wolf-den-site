// Shown automatically by Next.js as a Suspense fallback while the shop page's
// server component awaits the (sometimes slow) Square inventory pull. The
// skeleton mirrors the real shop layout so the page feels like it is loading
// rather than broken — important for mobile visitors who bounce quickly.

const SKELETON_TILE_COUNT = 8;

export default function ShopLoading() {
    return (
        <div className="stack reveal">
            <section className="card">
                <div className="shop-skeleton" role="status" aria-live="polite">
                    <span className="sr-only">Loading shop inventory…</span>

                    <div className="shop-skeleton-head" aria-hidden="true">
                        <div className="shop-skeleton-block shop-skeleton-search" />
                        <div className="shop-skeleton-tabs">
                            <div className="shop-skeleton-block shop-skeleton-pill" />
                            <div className="shop-skeleton-block shop-skeleton-pill" />
                            <div className="shop-skeleton-block shop-skeleton-pill" />
                            <div className="shop-skeleton-block shop-skeleton-pill" />
                        </div>
                    </div>

                    <p className="shop-skeleton-note" aria-hidden="true">
                        Loading current inventory…
                    </p>

                    <div className="shop-skeleton-grid" aria-hidden="true">
                        {Array.from({ length: SKELETON_TILE_COUNT }).map((_, index) => (
                            <div className="shop-skeleton-tile" key={index}>
                                <div className="shop-skeleton-block shop-skeleton-image" />
                                <div className="shop-skeleton-tile-body">
                                    <div className="shop-skeleton-block shop-skeleton-line" />
                                    <div className="shop-skeleton-block shop-skeleton-line shop-skeleton-line-short" />
                                    <div className="shop-skeleton-meta">
                                        <div className="shop-skeleton-block shop-skeleton-price" />
                                        <div className="shop-skeleton-block shop-skeleton-badge" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
