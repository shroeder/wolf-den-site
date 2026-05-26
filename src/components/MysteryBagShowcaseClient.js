"use client";

import { useEffect, useMemo, useRef } from "react";

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

export default function MysteryBagShowcaseClient({ cards }) {
    const scrollRef = useRef(null);
    const runningRef = useRef(true);
    const refreshTriggeredRef = useRef(false);
    const [tvMode] = useTvMode();

    const visibleCards = useMemo(() => cards, [cards]);
    const topCards = useMemo(
        () => [...cards].sort((left, right) => Number(right.marketValue || 0) - Number(left.marketValue || 0)).slice(0, 3),
        [cards]
    );

    useEffect(() => {
        const scroller = scrollRef.current;
        refreshTriggeredRef.current = false;

        const triggerRefresh = () => {
            if (refreshTriggeredRef.current) {
                return;
            }

            refreshTriggeredRef.current = true;
            window.location.reload();
        };

        let refreshTimer = null;

        if (!scroller) {
            refreshTimer = window.setInterval(triggerRefresh, 30000);

            return () => {
                if (refreshTimer) {
                    window.clearInterval(refreshTimer);
                }
            };
        }

        const hasOverflow = scroller.scrollHeight > scroller.clientHeight;

        if (!hasOverflow) {
            refreshTimer = window.setInterval(triggerRefresh, 30000);

            return () => {
                if (refreshTimer) {
                    window.clearInterval(refreshTimer);
                }
            };
        }

        let frameId = null;

        const step = () => {
            if (!runningRef.current) {
                frameId = window.requestAnimationFrame(step);
                return;
            }

            const maxScroll = scroller.scrollHeight - scroller.clientHeight;
            scroller.scrollTop += tvMode ? 0.8 : 0.45;

            if (scroller.scrollTop >= maxScroll) {
                triggerRefresh();
                return;
            }

            frameId = window.requestAnimationFrame(step);
        };

        frameId = window.requestAnimationFrame(step);

        return () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }

            if (refreshTimer) {
                window.clearInterval(refreshTimer);
            }
        };
    }, [cards.length, tvMode]);

    if (!cards.length) {
        return <p className="consignment-empty">No cards are currently packed in mystery bags.</p>;
    }

    const leaderboard = topCards.length ? (
        <div className="mystery-leaderboard-list">
            {topCards.map((card) => (
                <article key={card.id} className="mystery-leaderboard-item">
                    <div className="mystery-leaderboard-image-wrap">
                        {card.imageUrl ? (
                            <img
                                src={card.imageUrl}
                                alt={card.name}
                                className="mystery-leaderboard-image"
                                loading="lazy"
                                decoding="async"
                            />
                        ) : (
                            <div className="mystery-card-image-placeholder" aria-hidden="true">
                                No image
                            </div>
                        )}
                    </div>
                    <div className="mystery-leaderboard-copy">
                        <h3>{formatDisplayName(card.name)}</h3>
                    </div>
                    <p className="mystery-leaderboard-price">{formatMoney(card.marketValue)}</p>
                </article>
            ))}
        </div>
    ) : null;

    return (
        <div className="mystery-live-board">
            <div
                className="mystery-marquee"
                ref={scrollRef}
                onMouseEnter={() => {
                    if (tvMode) {
                        return;
                    }
                    runningRef.current = false;
                }}
                onMouseLeave={() => {
                    if (tvMode) {
                        return;
                    }
                    runningRef.current = true;
                }}
                onTouchStart={() => {
                    if (tvMode) {
                        return;
                    }
                    runningRef.current = false;
                }}
                onTouchEnd={() => {
                    if (tvMode) {
                        return;
                    }
                    runningRef.current = true;
                }}
            >
                <div className="mystery-marquee-inner" aria-live="polite">
                    {visibleCards.map((card) => (
                        <article
                            key={card.id}
                            className="mystery-card-tile"
                            aria-label={`Mystery bag card ${card.name} market value ${formatMoney(card.marketValue)}`}
                        >
                            <div className="mystery-card-image-wrap">
                                {card.imageUrl ? (
                                    <img
                                        src={card.imageUrl}
                                        alt={card.name}
                                        className="mystery-card-image"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : (
                                    <div className="mystery-card-image-placeholder" aria-hidden="true">
                                        No image
                                    </div>
                                )}
                            </div>
                            <div className="mystery-card-copy">
                                <h3 className="mystery-card-name">{formatDisplayName(card.name)}</h3>
                                <p className="mystery-card-price">{formatMoney(card.marketValue)}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </div>

            <aside className="mystery-side-panel" aria-label="Top three mystery bag cards">
                <p className="mystery-side-eyebrow">Highest Value</p>
                <h2>Top 3 cards</h2>
                {leaderboard}
            </aside>
        </div>
    );
}
