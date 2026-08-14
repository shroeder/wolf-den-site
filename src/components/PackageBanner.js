"use client";

import Link from "next/link";
import { GiPadlock } from "react-icons/gi";

// ── THE ADVERTISEMENT, AWAY FROM THE TILL ────────────────────────────────────────────────────────────────────
// The package card lives on the store-credit screen, which nobody opens unless they were already going to buy
// store credit — so the offer only ever reached people who had already decided. This is the same offer where
// members actually are.
//
// It is a BANNER, not the card: the item drawn working, the name, the three headline numbers and a price, and
// then it gets out of the way. Anybody who wants the detail taps through to the real card, which is where the
// buying happens. Two full pitches on one screen is one too many.
//
// While a package is unreleased this renders for the OWNER ONLY, labelled — advertising you cannot look at in
// place is advertising nobody checked. `offer` is null for everybody else and the banner does not mount.
export default function PackageBanner({ offer, className = "" }) {
    if (!offer) return null;
    const price = `$${((offer.priceCents || 0) / 100).toFixed(2)}`;
    const size = offer.decoSize || 132;
    const tiers = offer.tiers || [];
    const pets = offer.demoPetSprites || [];

    return (
        <Link href="/marketplace/credit" className={`pkgb ${className}`.trim()}>
            <span className="pkgb-art" aria-hidden="true">
                <span className="pkgb-glow" />
                <span className="pkgb-stand" style={{ width: size * 0.82, height: size * 0.82 }}>
                    {offer.decoSprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={offer.decoSprite} alt="" className="pkgb-deco" draggable="false" />
                    ) : null}
                    {tiers.map((t, i) => (pets[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={t.y} src={pets[i]} alt="" draggable="false" className="pkgb-pet"
                            style={{
                                left: `${t.x}%`, top: `${t.y}%`,
                                width: Math.round(size * 0.82 * (t.s / 100)), height: Math.round(size * 0.82 * (t.s / 100)),
                            }}
                        />
                    ) : null))}
                </span>
            </span>
            <span className="pkgb-body">
                {offer.ownerPreview ? (
                    <span className="pkgb-preview"><GiPadlock aria-hidden="true" /> Owner preview</span>
                ) : (
                    <span className="pkgb-kick">Package</span>
                )}
                <b>{offer.name}</b>
                <em>{offer.blurb}</em>
                <span className="pkgb-gets">
                    {(offer.gets || []).map((g) => (
                        <i key={g.key}><b>{g.big}</b> {g.label}</i>
                    ))}
                </span>
            </span>
            <span className="pkgb-cta">
                <b>{price}</b>
                <i>See it</i>
            </span>
        </Link>
    );
}
