"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function formatMoney(value) {
    return currencyFormatter.format(Number(value || 0));
}

function formatDisplayName(name) {
    return String(name || "")
        .split(/\s[-–—]\s|-/)[0]
        .trim();
}

function toNumber(value) {
    return Number(value || 0);
}

const QR_ROTATE_MS = 8000;

export default function MysteryBagShowcaseClient({
    cards,
    bagPrice,
    remainingPacks = null,
    averagePackValue = null,
    marketTotal = 0,
    qrCodes = [],
}) {
    const router = useRouter();
    const [featuredIndex, setFeaturedIndex] = useState(0);
    const [qrIndex, setQrIndex] = useState(0);

    const sortedCards = useMemo(
        () => [...cards].sort((a, b) => toNumber(b.marketValue) - toNumber(a.marketValue)),
        [cards]
    );

    // The board now shows every card still in circulation, highest value first.
    const spotlightCards = useMemo(() => sortedCards.slice(0, 3), [sortedCards]);
    const tickerCards = useMemo(() => sortedCards.slice(0, 8), [sortedCards]);
    const totalValueLeft = useMemo(() => {
        const summed = sortedCards.reduce((sum, card) => sum + toNumber(card.marketValue), 0);
        return toNumber(marketTotal) > 0 ? toNumber(marketTotal) : summed;
    }, [marketTotal, sortedCards]);

    const activeFeatured = spotlightCards.length ? spotlightCards[featuredIndex % spotlightCards.length] : null;
    const topHitValue = toNumber(sortedCards[0]?.marketValue || 0);
    const topHitMultiplier = bagPrice > 0 ? topHitValue / bagPrice : null;
    const activeQr = qrCodes.length ? qrCodes[qrIndex % qrCodes.length] : null;

    useEffect(() => {
        if (spotlightCards.length <= 1) {
            return undefined;
        }

        const id = window.setInterval(() => {
            setFeaturedIndex((index) => (index + 1) % spotlightCards.length);
        }, 4200);

        return () => window.clearInterval(id);
    }, [spotlightCards.length]);

    useEffect(() => {
        if (qrCodes.length <= 1) {
            return undefined;
        }

        const id = window.setInterval(() => {
            setQrIndex((index) => (index + 1) % qrCodes.length);
        }, QR_ROTATE_MS);

        return () => window.clearInterval(id);
    }, [qrCodes.length]);

    useEffect(() => {
        const id = window.setInterval(() => {
            router.refresh();
        }, 180000);

        return () => window.clearInterval(id);
    }, [router]);

    if (!cards.length) {
        return <p className="consignment-empty">No cards are currently packed in mystery bags.</p>;
    }

    return (
        <div className="mb2-board">
            <header className="mb2-head">
                <div className="mb2-head-copy">
                    <p className="mb2-kicker">Mystery Bags</p>
                    <h1>Live Chase Board</h1>
                    <p className="mb2-subhead">
                        Every card shown here is currently still in circulation. Pull one and it is gone from the board.
                    </p>
                </div>
                <div className="mb2-count" aria-live="polite">
                    {sortedCards.length} cards live
                </div>
            </header>

            <section className="mb2-stats" aria-label="Mystery bag value highlights">
                <article className="mb2-stat-card">
                    <span>Bag price</span>
                    <strong>{formatMoney(bagPrice)}</strong>
                </article>
                <article className="mb2-stat-card">
                    <span>Packs left</span>
                    <strong>{remainingPacks !== null ? remainingPacks.toLocaleString("en-US") : "—"}</strong>
                </article>
                <article className="mb2-stat-card">
                    <span>Avg. value / pack</span>
                    <strong>{averagePackValue !== null ? formatMoney(averagePackValue) : "—"}</strong>
                </article>
                <article className="mb2-stat-card">
                    <span>Current top hit</span>
                    <strong>{formatMoney(topHitValue)}</strong>
                </article>
                <article className="mb2-stat-card">
                    <span>Best possible pull</span>
                    <strong>{topHitMultiplier ? `${topHitMultiplier.toFixed(1)}x` : "-"}</strong>
                </article>
            </section>

            <div className="mb2-layout">
                <div className="mb2-main-col">
                    <section className="mb2-spotlight" aria-live="polite" aria-label="Featured rare card">
                        {activeFeatured ? (
                            <article className="mb2-spotlight-card" key={`${activeFeatured.id}-${featuredIndex}`}>
                                {activeFeatured.imageUrl ? (
                                    <img src={activeFeatured.imageUrl} alt={activeFeatured.name} loading="lazy" decoding="async" />
                                ) : (
                                    <div className="mb2-tile-placeholder" aria-hidden="true">
                                        No image
                                    </div>
                                )}
                                <div className="mb2-spotlight-meta">
                                    <p className="mb2-spotlight-label">Now spotlighting</p>
                                    <h2>{formatDisplayName(activeFeatured.name)}</h2>
                                    <p>{formatMoney(activeFeatured.marketValue)}</p>
                                </div>
                            </article>
                        ) : null}
                        <div className="mb2-spotlight-dots" aria-hidden="true">
                            {spotlightCards.map((card, index) => (
                                <span
                                    key={card.id}
                                    className={index === featuredIndex % spotlightCards.length ? "mb2-dot mb2-dot-active" : "mb2-dot"}
                                />
                            ))}
                        </div>
                    </section>

                    {tickerCards.length ? (
                        <section className="mb2-ticker-wrap" aria-label="Top chase cards">
                            <div className="mb2-ticker-track">
                                {[...tickerCards, ...tickerCards].map((card, index) => (
                                    <span className="mb2-ticker-item" key={`${card.id}-${index}`}>
                                        {formatDisplayName(card.name)} <strong>{formatMoney(card.marketValue)}</strong>
                                    </span>
                                ))}
                            </div>
                        </section>
                    ) : null}

                    <section className="mb2-grid" aria-label="All cards left in circulation">
                        {sortedCards.map((card) => {
                            const marketValue = toNumber(card.marketValue);
                            const valueMultiplier = bagPrice > 0 ? marketValue / bagPrice : null;

                            return (
                                <article key={card.id} className="mb2-tile">
                                    <div className="mb2-tile-media">
                                        {card.imageUrl ? (
                                            <img src={card.imageUrl} alt={card.name} loading="lazy" decoding="async" />
                                        ) : (
                                            <div className="mb2-tile-placeholder" aria-hidden="true">
                                                No image
                                            </div>
                                        )}
                                    </div>
                                    <div className="mb2-tile-meta">
                                        <h3>{formatDisplayName(card.name)}</h3>
                                        <p className="mb2-value">{formatMoney(marketValue)}</p>
                                        {valueMultiplier ? <p className="mb2-multiplier">{valueMultiplier.toFixed(1)}x bag value</p> : null}
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                </div>

                {activeQr ? (
                    <aside className="mb2-qr-rail" aria-label="Scan to connect with The Wolf Den">
                        <p className="mb2-qr-rail-title">Scan &amp; connect</p>
                        <div className="mb2-qr-card" aria-live="polite" key={activeQr.key}>
                            <div
                                className="mb2-qr-code"
                                role="img"
                                aria-label={`QR code: ${activeQr.title}`}
                                dangerouslySetInnerHTML={{ __html: activeQr.svg }}
                            />
                            <div className="mb2-qr-meta">
                                <h3>{activeQr.title}</h3>
                                <p>{activeQr.caption}</p>
                            </div>
                        </div>
                        <div className="mb2-qr-dots" aria-hidden="true">
                            {qrCodes.map((qr, index) => (
                                <span
                                    key={qr.key}
                                    className={index === qrIndex % qrCodes.length ? "mb2-qr-dot mb2-qr-dot-active" : "mb2-qr-dot"}
                                />
                            ))}
                        </div>
                    </aside>
                ) : null}
            </div>

            <footer className="mb2-footer" aria-live="polite">
                <div className="mb2-footer-value">
                    <span>Total value left in circulation</span>
                    <strong>{formatMoney(totalValueLeft)}</strong>
                </div>
                <div className="mb2-footer-actions">
                    <Link href="/shop" className="mb2-cta-primary">
                        Grab a Mystery Bag
                    </Link>
                    <Link href="/events" className="mb2-cta-secondary">
                        Watch Live Pulls
                    </Link>
                </div>
            </footer>
        </div>
    );
}
