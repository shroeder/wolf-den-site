"use client";

import { useEffect, useRef, useState } from "react";
import { GiSpellBook } from "react-icons/gi";

// ── A PAGE FROM THE BOOK ─────────────────────────────────────────────────────────────────────────────────────
// Sold in two places at matching prices — the Armoury for laurels, the Quartermaster for doubloons — so neither
// counter is the obviously correct one to walk up to. ONE component for both, because they had drifted into two
// near-identical blocks of markup and the next change would have landed on one of them.
//
// WHAT WAS WRONG WITH IT. A heading, a sentence and a price. Sixty-four pages exist, and a member had no way to
// know that, no way to see how many they were holding, and therefore no reason to want another one: the
// purchase read as a coin toss with a price on it rather than a gap being filled. The collection IS the
// argument for buying, so the collection is now the card — a running count, a bar that fills, and a row of
// tier pips that shows at a glance that the Legendary end of the book is where the holes are.
//
// It also ANTICIPATES. Pressing buy starts the book opening immediately rather than waiting on the round trip,
// so the moment belongs to the tap; the site-wide RecipeFoundWatcher lands the actual reveal a beat later.
export default function RecipeShelf({ shop, busy, canAfford, priceLabel, price = null, onBuy }) {
    const known = Number(shop?.known) || 0;
    const total = Number(shop?.total) || 0;
    const tiers = Array.isArray(shop?.tiers) ? shop.tiers : [];
    const left = Math.max(0, total - known);
    const pct = total ? Math.round((known / total) * 100) : 0;

    // The book cracks open on the tap and stays open for a beat. Purely anticipation — the real card is the
    // watcher's, and this is the half second between pressing and it arriving.
    const [opening, setOpening] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);

    const buy = () => {
        setOpening(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpening(false), 1400);
        onBuy?.();
    };

    const done = shop?.knowsAll;

    return (
        <div className={`rsh${done ? " is-done" : ""}${opening ? " is-opening" : ""}`}>
            <div className="rsh-top">
                <span className="rsh-art" aria-hidden="true">
                    <GiSpellBook />
                    <i className="rsh-glow" />
                </span>
                <span className="rsh-who">
                    <b>A Recipe</b>
                    <em>
                        {done
                            ? "Every page. The book is finished."
                            : "One page, drawn at random from what you have not learned. Mostly everyday cooking — occasionally not."}
                    </em>
                </span>
            </div>

            {total ? (
                <div className="rsh-prog">
                    <div className="rsh-count">
                        <b>{known}</b><i>/{total} pages</i>
                        {left ? <em>{left} still missing</em> : <em className="rsh-full">complete</em>}
                    </div>
                    <div className="rsh-bar"><span style={{ width: `${pct}%` }} /></div>
                    {/* THE TIER PIPS ARE THE HOOK. A flat "18 of 64" says how far along you are; this says
                        WHERE the holes are, and the holes are always at the Legendary end. */}
                    <div className="rsh-tiers">
                        {tiers.map((t) => (
                            <span key={t.tier} className="rsh-tier" style={{ "--t": t.color }}
                                title={`${t.name} — ${t.known}/${t.total}`}>
                                <span className="rsh-pips">
                                    {Array.from({ length: t.total }, (_, i) => (
                                        <i key={i} className={i < t.known ? "is-have" : ""} />
                                    ))}
                                </span>
                                <em>{t.name}</em>
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* THE SAME PRICE TAG THE CRATES WEAR. This button spelled out "750 laurels" in words while every
                other laurel button on the screen showed the wreath sprite and a bare number, so the one shelf
                that is not a crate also looked like it belonged to a different shop. `priceLabel` is still
                accepted for callers that want to override it (the powers lab passes a fixed string). */}
            <button type="button" className="rsh-buy" disabled={busy || done || !canAfford} onClick={buy}>
                {done ? "Nothing left to learn" : price != null ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/arena/armoury/laurel.png" alt="" className="rsh-laurel" draggable="false" />
                        {price.toLocaleString()}
                    </>
                ) : priceLabel}
            </button>

            <style jsx>{`
                /* rsh- prefixed throughout, keyframes included: two @keyframes sharing a name across styled-jsx
                   blocks silently break both, and this component mounts inside two different screens. */
                .rsh { position: relative; overflow: hidden; display: grid; gap: 11px; padding: 13px;
                    border-radius: 15px;
                    border: 1px solid rgba(255,215,94,0.28);
                    background:
                        radial-gradient(80% 120% at 100% 0%, rgba(255,215,94,0.13), transparent 62%),
                        linear-gradient(180deg, rgba(255,255,255,0.045), rgba(0,0,0,0.3)); }
                .rsh.is-done { border-color: rgba(143,214,162,0.35); }

                .rsh-top { display: flex; align-items: flex-start; gap: 11px; }
                .rsh-art { position: relative; flex: 0 0 auto; width: 48px; height: 48px; display: grid;
                    place-items: center; }
                .rsh-art :global(svg) { position: relative; width: 34px; height: 34px; color: #ffd75e;
                    filter: drop-shadow(0 2px 6px rgba(0,0,0,0.55));
                    transform-origin: 50% 60%; }
                /* THE BOOK CRACKS OPEN ON THE TAP. A quarter-second of anticipation is the difference between
                   a button that submits a form and a button that does something. */
                .rsh.is-opening .rsh-art :global(svg) { animation: rsh-open 1.4s cubic-bezier(.2,1.4,.3,1) both; }
                @keyframes rsh-open {
                    0% { transform: scale(1) rotate(0deg); }
                    18% { transform: scale(1.28) rotate(-7deg); }
                    38% { transform: scale(1.18) rotate(5deg); }
                    100% { transform: scale(1) rotate(0deg); }
                }
                .rsh-glow { position: absolute; inset: -6px; border-radius: 50%; opacity: 0;
                    background: radial-gradient(circle, rgba(255,215,94,0.75), transparent 62%); }
                .rsh.is-opening .rsh-glow { animation: rsh-flare 1.4s ease-out both; }
                @keyframes rsh-flare {
                    0% { opacity: 0; transform: scale(.4); }
                    22% { opacity: 1; transform: scale(1.5); }
                    100% { opacity: 0; transform: scale(2.4); }
                }

                .rsh-who { display: grid; gap: 2px; min-width: 0; }
                .rsh-who b { font-family: var(--font-display); font-size: 1.02rem; color: #ffd75e; line-height: 1.1; }
                .rsh-who em { font-style: normal; font-size: .73rem; color: #9aa2ae; line-height: 1.35; }

                .rsh-prog { display: grid; gap: 7px; }
                .rsh-count { display: flex; align-items: baseline; gap: 5px; }
                .rsh-count b { font-family: var(--font-display); font-size: 1.4rem; color: #fff; line-height: 1;
                    font-variant-numeric: tabular-nums; }
                .rsh-count i { font-style: normal; font-size: .78rem; font-weight: 800; color: #6a727d; }
                .rsh-count em { margin-left: auto; font-style: normal; font-size: .68rem; font-weight: 800;
                    color: #8b93a0; }
                .rsh-count em.rsh-full { color: #8fd6a2; }

                .rsh-bar { height: 6px; border-radius: 99px; background: rgba(0,0,0,0.45); overflow: hidden;
                    box-shadow: inset 0 1px 2px rgba(0,0,0,0.5); }
                .rsh-bar > span { position: relative; display: block; height: 100%; border-radius: 99px;
                    background: linear-gradient(90deg, #b8862b, #ffd75e 72%, #fff3c4);
                    box-shadow: 0 0 10px rgba(255,215,94,0.5);
                    transition: width .55s cubic-bezier(.2,.8,.2,1); }
                .rsh-bar > span::after { content: ""; position: absolute; inset: 0; border-radius: 99px;
                    background: linear-gradient(100deg, transparent 32%, rgba(255,255,255,0.6) 50%, transparent 68%);
                    background-size: 220% 100%; animation: rsh-sheen 2.8s linear infinite; }
                @keyframes rsh-sheen { from { background-position: 120% 0; } to { background-position: -120% 0; } }

                .rsh-tiers { display: flex; flex-wrap: wrap; gap: 4px 10px; }
                .rsh-tier { display: grid; gap: 2px; }
                .rsh-pips { display: flex; gap: 2px; }
                .rsh-pips i { display: block; width: 5px; height: 9px; border-radius: 2px;
                    background: rgba(255,255,255,0.12); }
                .rsh-pips i.is-have { background: var(--t); box-shadow: 0 0 5px color-mix(in srgb, var(--t) 65%, transparent); }
                .rsh-tier em { font-style: normal; font-size: .55rem; font-weight: 800; letter-spacing: .06em;
                    text-transform: uppercase; color: color-mix(in srgb, var(--t) 55%, #8b93a0); }

                .rsh-buy { display: flex; align-items: center; justify-content: center; gap: 6px;
                    padding: 11px 16px; border: 0; border-radius: 12px; cursor: pointer;
                    font-family: var(--font-display); font-size: .98rem; color: #17110a;
                    background: linear-gradient(180deg, #ffe89a, #ffc93c);
                    box-shadow: 0 2px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.55);
                    transition: transform .1s ease, filter .12s ease; }
                .rsh-buy:hover:not(:disabled) { filter: brightness(1.06); }
                /* Same 17px the Armoury's crate buttons use, so the two price tags sit at one size. */
                .rsh-laurel { width: 17px; height: 17px; object-fit: contain; }
                .rsh-buy:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 0 0 rgba(0,0,0,0.35); }
                .rsh-buy:disabled { cursor: default; filter: grayscale(.75) brightness(.7); }
            `}</style>
        </div>
    );
}
