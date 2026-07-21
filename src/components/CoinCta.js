"use client";

import Link from "next/link";

// Shown wherever a member can't afford a coin cost. Deliberately styled as a bright, tappable CTA (not the
// muted "need more" text that reads as a disabled state) → takes them to buy store credit for coins.
// stopPropagation so tapping it inside a clickable shop tile doesn't also trigger the tile.
export default function CoinCta({ price = null, label = "Get coins", className = "" }) {
    return (
        <Link
            href="/marketplace/credit"
            className={`coin-cta ${className}`.trim()}
            onClick={(e) => e.stopPropagation()}
            title="Buy store credit for coins"
        >
            {price != null ? <span className="coin-cta-price">🪙 {price.toLocaleString()}</span> : null}
            <span className="coin-cta-get">＋ {label}</span>
        </Link>
    );
}
