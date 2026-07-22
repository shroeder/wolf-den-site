"use client";

import Link from "next/link";

// Shown wherever a member can't afford a coin cost. Deliberately styled as a bright, tappable CTA (not the
// muted "need more" text that reads as a disabled state) → takes them to buy store credit for coins.
// Pass `have` (their current balance) and it shows the exact SHORTFALL ("620 short") — the strongest nudge,
// right at the moment of intent. stopPropagation so tapping it inside a clickable shop tile doesn't fire it.
export default function CoinCta({ price = null, have = null, label = "Get coins", className = "" }) {
    const short = price != null && have != null ? Math.max(0, price - have) : null;
    return (
        <Link
            href="/marketplace/credit"
            className={`coin-cta ${className}`.trim()}
            onClick={(e) => e.stopPropagation()}
            title="Buy store credit for coins"
        >
            {short != null && short > 0
                ? <span className="coin-cta-price">🪙 {short.toLocaleString()} short</span>
                : price != null ? <span className="coin-cta-price">🪙 {price.toLocaleString()}</span> : null}
            <span className="coin-cta-get">＋ {label}</span>
        </Link>
    );
}
