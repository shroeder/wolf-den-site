"use client";

import { useEffect, useMemo, useState } from "react";

import { useTvMode } from "@/lib/tv-mode-client";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function formatMoney(value) {
    return currencyFormatter.format(Number(value || 0));
}

function formatDisplayName(name) {
    return String(name || "")
        .split(/\s[-\u2013\u2014]\s|-/)[0]
        .trim();
}

function toNumber(value) {
    return Number(value || 0);
}

export default function MysteryBagShowcaseClient({ cards, metrics, bagPrice }) {
    const [tvMode] = useTvMode();
    const [activeTopIndex, setActiveTopIndex] = useState(0);
    const [tickerIndex, setTickerIndex] = useState(0);

    const sortedCards = useMemo(
        () => [...cards].sort((left, right) => toNumber(right.marketValue) - toNumber(left.marketValue)),
        [cards]
    );

    const featuredCards = useMemo(() => {
        const chaseThreshold = Math.max(toNumber(bagPrice) * 1.6, 20);
        const thresholdMatches = sortedCards.filter((card) => toNumber(card.marketValue) >= chaseThreshold);

        if (thresholdMatches.length >= 6) {
            return thresholdMatches.slice(0, 12);
        }

        return sortedCards.slice(0, 10);
    }, [bagPrice, sortedCards]);

    const topCards = useMemo(() => featuredCards.slice(0, 6), [featuredCards]);

    const spotlightCards = useMemo(() => {
        if (!featuredCards.length) {
            return [];
        }

        return featuredCards.slice(0, 10);
    }, [featuredCards]);

    const headlineStats = useMemo(() => {
        const biggestRemainingHit = sortedCards[0] || null;

        return {
            bagsRemaining: Number(metrics?.itemCount || cards.length || 0),
            totalLiveValue: toNumber(metrics?.marketTotal),
            biggestRemainingHit,
            chaseHitsRemaining: featuredCards.length,
            pricePerBag: toNumber(bagPrice),
            totalChaseValue: featuredCards.reduce((sum, card) => sum + toNumber(card.marketValue), 0),
        };
    }, [bagPrice, cards.length, featuredCards, metrics?.itemCount, metrics?.marketTotal, sortedCards]);

    const activeTopCard = topCards.length ? topCards[activeTopIndex % topCards.length] : null;
    const activeTickerCard = spotlightCards.length ? spotlightCards[tickerIndex % spotlightCards.length] : null;

    useEffect(() => {
        if (topCards.length <= 1) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setActiveTopIndex((current) => (current + 1) % topCards.length);
        }, tvMode ? 7000 : 5500);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [topCards.length, tvMode]);

    useEffect(() => {
        if (spotlightCards.length <= 1) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setTickerIndex((current) => (current + 1) % spotlightCards.length);
        }, tvMode ? 4200 : 3200);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [spotlightCards.length, tvMode]);

    if (!cards.length) {
        return <p className="consignment-empty">No cards are currently packed in mystery bags.</p>;
    }

    return (
        <div className="mystery-chase-board">
            <header className="mystery-vault-head">
                <div>
                    <p className="mystery-vault-kicker">The Wolf Den Mystery Bags</p>
                    <h1>Mystery Chase Board</h1>
                </div>
                <div className="mystery-live-pill" aria-label="Live status">
                    <span className="mystery-live-dot" aria-hidden="true" />
                    STILL LIVE
                </div>
            </header>

            <section className="mystery-live-metrics" aria-label="Live mystery bag metrics">
                <article className="mystery-metric-card">
                    <p>Bags Remaining</p>
                    <strong>{headlineStats.bagsRemaining}</strong>
                </article>
                <article className="mystery-metric-card">
                    <p>Total Live Value</p>
                    <strong>{formatMoney(headlineStats.totalLiveValue)}</strong>
                </article>
                <article className="mystery-metric-card">
                    <p>Biggest Remaining Hit</p>
                    <strong>
                        {headlineStats.biggestRemainingHit
                            ? formatMoney(headlineStats.biggestRemainingHit.marketValue)
                            : formatMoney(0)}
                    </strong>
                </article>
                <article className="mystery-metric-card">
                    <p>Price Per Bag</p>
                    <strong>{formatMoney(headlineStats.pricePerBag)}</strong>
                </article>
                <article className="mystery-metric-card">
                    <p>Chase Hits Remaining</p>
                    <strong>{headlineStats.chaseHitsRemaining}</strong>
                </article>
            </section>

            <div className="mystery-hero-layout">
                <section className="mystery-hero-stage" aria-live="polite" aria-label="Featured chase hit">
                    {activeTopCard ? (
                        <article key={activeTopCard.id} className="mystery-hero-card">
                            <div className="mystery-hero-image-wrap">
                                {activeTopCard.imageUrl ? (
                                    <img
                                        src={activeTopCard.imageUrl}
                                        alt={activeTopCard.name}
                                        className="mystery-hero-image"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : (
                                    <div className="mystery-card-image-placeholder" aria-hidden="true">
                                        No image
                                    </div>
                                )}
                            </div>
                            <div className="mystery-hero-copy">
                                <p className="mystery-hero-flag">Featured Chase Hit</p>
                                <h2>{formatDisplayName(activeTopCard.name)}</h2>
                                <p className="mystery-hero-price">{formatMoney(activeTopCard.marketValue)}</p>
                                <p className="mystery-hero-status">STILL LIVE</p>
                            </div>
                        </article>
                    ) : null}
                </section>

                <aside className="mystery-top-hits" aria-label="Top live chase hits">
                    <h3>Top Live Hits</h3>
                    <div className="mystery-top-hits-grid">
                        {topCards.map((card, index) => (
                            <article
                                key={card.id}
                                className={`mystery-top-hit ${activeTopCard?.id === card.id ? "is-active" : ""}`}
                                aria-label={`Top hit ${index + 1} ${card.name} worth ${formatMoney(card.marketValue)}`}
                            >
                                <p className="mystery-top-hit-rank">#{index + 1}</p>
                                <p className="mystery-top-hit-name">{formatDisplayName(card.name)}</p>
                                <p className="mystery-top-hit-price">{formatMoney(card.marketValue)}</p>
                            </article>
                        ))}
                    </div>
                </aside>
            </div>

            <section className="mystery-hot-ticker" aria-live="polite">
                <p className="mystery-hot-ticker-label">Hot Pulls In The Vault</p>
                <p className="mystery-hot-ticker-value">
                    {activeTickerCard ? `${formatDisplayName(activeTickerCard.name)} - ${formatMoney(activeTickerCard.marketValue)}` : "Loading live hits"}
                </p>
                <p className="mystery-hot-ticker-total">
                    Featured Pool Value: <strong>{formatMoney(headlineStats.totalChaseValue)}</strong>
                </p>
            </section>
        </div>
    );
}
