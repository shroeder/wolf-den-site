"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
    const router = useRouter();
    const [tvMode] = useTvMode();
    const [activeTopIndex, setActiveTopIndex] = useState(0);
    const [tickerIndex, setTickerIndex] = useState(0);

    const sortedCards = useMemo(
        () => [...cards].sort((a, b) => toNumber(b.marketValue) - toNumber(a.marketValue)),
        [cards]
    );

    const featuredCards = useMemo(() => {
        const threshold = Math.max(toNumber(bagPrice) * 1.6, 20);
        const matches = sortedCards.filter((c) => toNumber(c.marketValue) >= threshold);

        if (matches.length >= 6) {
            return matches.slice(0, 12);
        }

        return sortedCards.slice(0, 10);
    }, [bagPrice, sortedCards]);

    const topCards = useMemo(() => featuredCards.slice(0, 6), [featuredCards]);

    const spotlightCards = useMemo(() => featuredCards.slice(0, 10), [featuredCards]);

    const stats = useMemo(
        () => ({
            bagsRemaining: Number(metrics?.itemCount || cards.length || 0),
            totalLiveValue: toNumber(metrics?.marketTotal),
            biggestHit: sortedCards[0] || null,
            chaseHitsLeft: featuredCards.length,
            pricePerBag: toNumber(bagPrice),
            totalChaseValue: featuredCards.reduce((sum, c) => sum + toNumber(c.marketValue), 0),
        }),
        [bagPrice, cards.length, featuredCards, metrics?.itemCount, metrics?.marketTotal, sortedCards]
    );

    const activeCard = topCards.length ? topCards[activeTopIndex % topCards.length] : null;
    const tickerCard = spotlightCards.length ? spotlightCards[tickerIndex % spotlightCards.length] : null;

    useEffect(() => {
        if (topCards.length <= 1) return;

        const id = window.setInterval(() => {
            setActiveTopIndex((i) => (i + 1) % topCards.length);
        }, tvMode ? 7000 : 5500);

        return () => window.clearInterval(id);
    }, [topCards.length, tvMode]);

    useEffect(() => {
        if (spotlightCards.length <= 1) return;

        const id = window.setInterval(() => {
            setTickerIndex((i) => (i + 1) % spotlightCards.length);
        }, tvMode ? 4200 : 3200);

        return () => window.clearInterval(id);
    }, [spotlightCards.length, tvMode]);

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
        <div className="mb-board">
            <header className="mb-head">
                <div className="mb-head-copy">
                    <p className="mb-kicker">The Wolf Den Mystery Bags</p>
                    <h1>Mystery Chase Board</h1>
                </div>
                <div className="mb-live-pill" aria-label="Live status">
                    <span className="mb-live-dot" aria-hidden="true" />
                    STILL LIVE
                </div>
            </header>

            <section className="mb-metrics" aria-label="Live mystery bag metrics">
                <article className="mb-metric">
                    <p>Bags Remaining</p>
                    <strong>{stats.bagsRemaining}</strong>
                </article>
                <article className="mb-metric">
                    <p>Total Live Value</p>
                    <strong>{formatMoney(stats.totalLiveValue)}</strong>
                </article>
                <article className="mb-metric">
                    <p>Biggest Hit Left</p>
                    <strong>{stats.biggestHit ? formatMoney(stats.biggestHit.marketValue) : formatMoney(0)}</strong>
                </article>
                <article className="mb-metric">
                    <p>Price Per Bag</p>
                    <strong>{formatMoney(stats.pricePerBag)}</strong>
                </article>
                <article className="mb-metric">
                    <p>Chase Hits Left</p>
                    <strong>{stats.chaseHitsLeft}</strong>
                </article>
            </section>

            <div className="mb-main">
                <section className="mb-feature" aria-live="polite" aria-label="Featured chase hit">
                    {activeCard ? (
                        <article key={activeTopIndex} className="mb-feature-card">
                            <div className="mb-feature-image">
                                {activeCard.imageUrl ? (
                                    <img
                                        src={activeCard.imageUrl}
                                        alt={activeCard.name}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : (
                                    <div className="mb-feature-placeholder" aria-hidden="true">
                                        No image
                                    </div>
                                )}
                            </div>
                            <div className="mb-feature-info">
                                <p className="mb-flag">Featured Chase Hit</p>
                                <h2>{formatDisplayName(activeCard.name)}</h2>
                                <p className="mb-price">{formatMoney(activeCard.marketValue)}</p>
                                <p className="mb-status">Still Live</p>
                            </div>
                        </article>
                    ) : null}
                </section>

                <aside className="mb-hits" aria-label="Top live chase hits">
                    <h3>Top Live Hits</h3>
                    <ol className="mb-hits-list">
                        {topCards.map((card, i) => (
                            <li
                                key={card.id}
                                className={`mb-hit${activeCard?.id === card.id ? " is-active" : ""}`}
                                aria-label={`#${i + 1} ${card.name}`}
                            >
                                <span className="mb-hit-rank">#{i + 1}</span>
                                <span className="mb-hit-name">{formatDisplayName(card.name)}</span>
                                <span className="mb-hit-price">{formatMoney(card.marketValue)}</span>
                            </li>
                        ))}
                    </ol>
                </aside>
            </div>

            <section className="mb-ticker" aria-live="polite">
                <span className="mb-ticker-label">Hot Pulls In The Vault</span>
                <span className="mb-ticker-value" key={tickerIndex}>
                    {tickerCard
                        ? `${formatDisplayName(tickerCard.name)} -- ${formatMoney(tickerCard.marketValue)}`
                        : "Loading live hits"}
                </span>
                <span className="mb-ticker-total">
                    Featured Pool: <strong>{formatMoney(stats.totalChaseValue)}</strong>
                </span>
            </section>
        </div>
    );
}