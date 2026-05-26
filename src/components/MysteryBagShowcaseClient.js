"use client";

import { useEffect, useMemo, useRef } from "react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function formatMoney(value) {
    return currencyFormatter.format(Number(value || 0));
}

export default function MysteryBagShowcaseClient({ cards }) {
    const scrollRef = useRef(null);
    const runningRef = useRef(true);

    const visibleCards = useMemo(() => cards, [cards]);

    useEffect(() => {
        const scroller = scrollRef.current;

        if (!scroller || cards.length < 2) {
            return undefined;
        }

        const hasOverflow = scroller.scrollHeight > scroller.clientHeight;

        if (!hasOverflow) {
            return undefined;
        }

        let frameId = null;

        const step = () => {
            if (!runningRef.current) {
                frameId = window.requestAnimationFrame(step);
                return;
            }

            const maxScroll = scroller.scrollHeight - scroller.clientHeight;
            scroller.scrollTop += 0.45;

            if (scroller.scrollTop >= maxScroll) {
                scroller.scrollTop = 0;
            }

            frameId = window.requestAnimationFrame(step);
        };

        frameId = window.requestAnimationFrame(step);

        return () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, [cards.length]);

    if (!cards.length) {
        return <p className="consignment-empty">No cards are currently packed in mystery bags.</p>;
    }

    return (
        <div
            className="mystery-marquee"
            ref={scrollRef}
            onMouseEnter={() => {
                runningRef.current = false;
            }}
            onMouseLeave={() => {
                runningRef.current = true;
            }}
            onTouchStart={() => {
                runningRef.current = false;
            }}
            onTouchEnd={() => {
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
                            <h3 className="mystery-card-name">{card.name}</h3>
                            <p className="mystery-card-meta secondary">
                                {card.set} #{card.number}
                            </p>
                            <p className="mystery-card-price">{formatMoney(card.marketValue)}</p>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
