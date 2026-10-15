"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ── THE PITCH ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "a pile of awesome sprites from the game all over and calls to action to sign up... so juicy and sexy
// with sprites galore like a hoard of enemies weapons chests ships cannons pets evolves stones. I really need
// to convert visits to game sign ups."
//
// ⚠️ THE ONE JOB IS THE SIGN-UP, AND EVERY DECISION BELOW IS SUBORDINATE TO IT.
//
//   1. THE PROOF IS REAL PRIZES WITH REAL NAMES. The strongest argument for joining a game run out of a card
//      shop is not a feature list, it is that somebody who is not you walked out with a box last week. Those
//      rows come from boss_event, so the wall updates itself — a hand-authored list of winners is accurate
//      for one week and a lie after that.
//   2. THE SPRITE WALL IS DECOR AND MUST NEVER COST THE SIGN-UP. Sixty sprites is sixty requests, so they
//      are lazy, decoding async, fixed-size, and behind aria-hidden. A hero that janks on a mid-range phone
//      converts worse than no hero.
//   3. THE CTA IS NEVER MORE THAN A THUMB AWAY. One at the top, one after the prizes, one at the end -- the
//      page is scrolled by people deciding, and a decision made halfway down must not require scrolling back.
//
// ⚠️ AND IT IGNORES prefers-reduced-motion, deliberately, like the rest of this game's surfaces. See
// [[animations-always-play]]. The drift is slow and nothing flashes.

// The hoard. Hand-picked across every corner of the game so the wall reads as "there is a LOT here" rather
// than as one feature photographed sixty times — enemies, bosses, ships, gems, loot, classes, fish, relics.
const HOARD = [
    "/images/grove/boss-glutmaw.webp", "/images/gems/ruby_t5.png", "/images/fleet/fleet_assize.png",
    "/images/grove/foe-goblin.webp", "/images/delves/ev-chest.webp", "/images/gems/wolfeye_t5.png",
    "/images/grove/boss-great_weaver.webp", "/images/fish/fish_anglerfish.png", "/images/arena/class/reaver.webp",
    "/images/grove/part-crystal_shard.webp", "/images/fleet/fleet_boss_ash.png", "/images/gems/emerald_t5.png",
    "/images/grove/foe-crystal_stag.webp", "/images/delves/ev-cache.webp", "/images/arena/class/runecaller.webp",
    "/images/grove/boss-everburning.webp", "/images/gems/sapphire_t5.png", "/images/fleet/fleet_blockade.png",
    "/images/grove/foe-elderling.webp", "/images/delves/ev-shrine.webp", "/images/arena/class/warden.webp",
    "/images/grove/part-elder_heartwood.webp", "/images/fish/fish_coelacanth.png", "/images/gems/topaz_t5.png",
    "/images/grove/boss-harvestman.webp", "/images/fleet/fleet_bomb.png", "/images/grove/foe-husk.webp",
    "/images/gems/amethyst_t5.png", "/images/grove/part-barrow_tooth.webp", "/images/delves/ev-merchant.webp",
    "/images/grove/boss-barrow_warden.webp", "/images/fish/fish_bonecrab.png", "/images/fleet/fleet_assurance.png",
    "/images/grove/part-ash_ember.webp", "/images/grove/boss-grandfather_bristle.webp", "/images/delves/ev-well.webp",
];

// What is actually in there. Named as places you go, not as systems -- "a forest that fights back" is a
// thing to picture; "procedural combat zones" is a thing to skim past.
const WORLDS = [
    { art: "/images/grove/boss-glutmaw.webp", name: "The Grove", line: "A forest that fights back. Twelve zones, a boss at the end of each." },
    { art: "/images/arena/class/reaver.webp", name: "The Arena", line: "Three classes, a skill tree, and a ladder of real opponents." },
    { art: "/images/fleet/fleet_assize.png", name: "The Fleet", line: "Sail, haul, and come home heavier than you left." },
    { art: "/images/delves/ev-chest.webp", name: "Delves", line: "Push deeper for better loot and know when to walk out." },
    { art: "/images/gems/ruby_t5.png", name: "The Forge", line: "Gems, ascension, and gear worth chasing for months." },
    { art: "/images/fish/fish_anglerfish.png", name: "And more", line: "Fishing, mining, cooking, a farm, pets, a casino, raids." },
];

function Sprite({ src, size = 64, className = "" }) {
    return (
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            className={className}
            draggable="false"
        />
    );
}

function timeAgo(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return null;
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
}

export default function PlayLanding({ pitch }) {
    const { winners = [], prize = null, stats = {} } = pitch || {};
    const joinHref = "/marketplace/login?signup=1";
    const hoardRef = useRef(null);
    const [lit, setLit] = useState(false);

    // The wall fades up once, after mount, so the page never paints a grid of half-loaded boxes.
    useEffect(() => {
        const t = setTimeout(() => setLit(true), 60);
        return () => clearTimeout(t);
    }, []);

    const proof = [
        stats.members ? { n: stats.members.toLocaleString(), label: "members" } : null,
        stats.bossesFelled ? { n: stats.bossesFelled.toLocaleString(), label: "bosses felled" } : null,
        stats.prizesGiven ? { n: stats.prizesGiven.toLocaleString(), label: "prizes handed out" } : null,
    ].filter(Boolean);

    return (
        <div className="pl">
            {/* ── THE HOARD ─────────────────────────────────────────────────────────────────────── */}
            <section className="pl-hero">
                <div className={`pl-hoard${lit ? " is-lit" : ""}`} ref={hoardRef} aria-hidden="true">
                    {HOARD.map((src, i) => (
                        <span key={src} className="pl-h" style={{ "--i": i }}>
                            <Sprite src={src} size={72} />
                        </span>
                    ))}
                </div>

                <div className="pl-hero-copy">
                    <p className="pl-eyebrow">Free · Play in your browser</p>
                    <h1>There is a whole game<br />inside the card shop.</h1>
                    <p className="pl-sub">
                        Hunt a forest that fights back. Sail a fleet. Forge gear for months.
                        Then win real cards off the weekly boss.
                    </p>
                    <div className="pl-cta">
                        <Link className="pl-go" href={joinHref}>Create your character</Link>
                        <span className="pl-free">No download. No cost. Takes a minute.</span>
                    </div>
                    {proof.length ? (
                        <ul className="pl-proof">
                            {proof.map((p) => (
                                <li key={p.label}><b>{p.n}</b><span>{p.label}</span></li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </section>

            {/* ── THE PRIZE ON THE TABLE ────────────────────────────────────────────────────────── */}
            {prize ? (
                <section className="pl-prize">
                    <div className="pl-prize-art">
                        {prize.prizeImage
                            ? <img src={prize.prizeImage} alt={prize.prize} width={180} height={180} loading="lazy" decoding="async" />
                            : <Sprite src="/images/delves/ev-chest.webp" size={160} />}
                    </div>
                    <div className="pl-prize-copy">
                        <p className="pl-eyebrow pl-live">On the table right now</p>
                        <h2>{prize.prize}</h2>
                        <p>
                            Every member who swings at <b>{prize.boss}</b> earns tickets. When it falls,
                            one ticket is drawn and somebody collects this in store.
                        </p>
                        <Link className="pl-go pl-go-sm" href={joinHref}>Get in on this one</Link>
                    </div>
                </section>
            ) : null}

            {/* ── WHO ALREADY WON ───────────────────────────────────────────────────────────────── */}
            {winners.length ? (
                <section className="pl-won">
                    <header>
                        <p className="pl-eyebrow">Already handed out</p>
                        <h2>Real prizes. Real members.</h2>
                        <p className="pl-sub pl-sub-sm">
                            Every weekly boss carries a prize. These went home with people who play.
                        </p>
                    </header>
                    <ul className="pl-wins">
                        {winners.map((w, i) => (
                            <li key={`${w.winner}-${i}`}>
                                <span className="pl-win-art">
                                    {w.prizeImage
                                        ? <img src={w.prizeImage} alt="" width={64} height={64} loading="lazy" decoding="async" />
                                        : <Sprite src="/images/delves/ev-cache.webp" size={56} />}
                                </span>
                                <span className="pl-win-text">
                                    <b>{w.prize}</b>
                                    <em>{w.winner}{timeAgo(w.wonAt) ? ` · ${timeAgo(w.wonAt)}` : ""}</em>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* ── WHAT IS IN THERE ──────────────────────────────────────────────────────────────── */}
            <section className="pl-worlds">
                <header>
                    <p className="pl-eyebrow">What you get</p>
                    <h2>Not one game. Nine.</h2>
                </header>
                <ul>
                    {WORLDS.map((wd) => (
                        <li key={wd.name}>
                            <Sprite src={wd.art} size={56} />
                            <div>
                                <b>{wd.name}</b>
                                <span>{wd.line}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            {/* ── THE LAST ASK ──────────────────────────────────────────────────────────────────── */}
            <section className="pl-last">
                <div className="pl-last-row" aria-hidden="true">
                    {HOARD.slice(0, 14).map((src) => <Sprite key={`l${src}`} src={src} size={48} />)}
                </div>
                <h2>Your character is one minute away.</h2>
                <p>Free, in your browser, and the next boss is already walking.</p>
                <Link className="pl-go" href={joinHref}>Create your character</Link>
            </section>

            <style jsx>{`
                .pl { display: flex; flex-direction: column; gap: 18px; }
                .pl :global(img) { image-rendering: auto; user-select: none; }

                .pl-eyebrow { margin: 0; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em;
                    text-transform: uppercase; color: #e0a83c; }
                .pl-live { color: #43c46b; }
                .pl-sub { margin: 10px 0 0; color: #cfc6b6; font-size: 1.02rem; line-height: 1.55; max-width: 46ch; }
                .pl-sub-sm { font-size: 0.92rem; }

                /* ── HERO ───────────────────────────────────────────────────────────────────── */
                .pl-hero { position: relative; overflow: hidden; border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.10);
                    background:
                        radial-gradient(120% 90% at 50% 0%, rgba(224,168,60,0.18), transparent 62%),
                        linear-gradient(180deg, #121510, #0b0d0a 70%);
                    padding: 26px 20px 30px; }

                /* The wall sits BEHIND the words and is dimmed, because a sprite that competes with the
                   headline costs the sign-up the headline is there to get. */
                .pl-hoard { position: absolute; inset: -6% -2% auto -2%; display: flex; flex-wrap: wrap;
                    gap: 10px; justify-content: center; pointer-events: none;
                    opacity: 0; transition: opacity 900ms ease-out;
                    mask-image: linear-gradient(180deg, #000 0%, rgba(0,0,0,0.55) 46%, transparent 78%);
                    -webkit-mask-image: linear-gradient(180deg, #000 0%, rgba(0,0,0,0.55) 46%, transparent 78%); }
                .pl-hoard.is-lit { opacity: 0.5; }
                .pl-h { display: block; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6));
                    animation: plDrift 9s ease-in-out infinite both;
                    animation-delay: calc(var(--i) * -0.37s); }
                @keyframes plDrift {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-7px) rotate(1.6deg); }
                }

                .pl-hero-copy { position: relative; z-index: 1; padding-top: 108px; text-align: center; }
                .pl-hero-copy h1 { margin: 10px 0 0; font-size: clamp(1.9rem, 7.4vw, 3rem); line-height: 1.05;
                    letter-spacing: -0.015em; color: #fff6df;
                    text-shadow: 0 2px 18px rgba(0,0,0,0.95), 0 0 42px rgba(224,168,60,0.28); }
                .pl-hero-copy .pl-sub { margin-left: auto; margin-right: auto; }

                .pl-cta { margin-top: 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
                .pl-free { font-size: 0.82rem; color: #9aa08f; }

                /* One button treatment for every ask on the page, so the thing to press is never in doubt. */
                .pl :global(.pl-go) { display: inline-block; padding: 15px 30px; border-radius: 999px;
                    font-weight: 800; font-size: 1.02rem; letter-spacing: 0.01em; text-decoration: none;
                    color: #1a1403; background: linear-gradient(180deg, #ffd166, #e0a83c);
                    box-shadow: 0 8px 26px rgba(224,168,60,0.36), inset 0 1px 0 rgba(255,255,255,0.5);
                    transition: transform 140ms ease, box-shadow 140ms ease; }
                .pl :global(.pl-go:hover) { transform: translateY(-2px);
                    box-shadow: 0 12px 32px rgba(224,168,60,0.46), inset 0 1px 0 rgba(255,255,255,0.5); }
                .pl :global(.pl-go:focus-visible) { outline: 3px solid #fff6df; outline-offset: 3px; }
                .pl :global(.pl-go-sm) { padding: 11px 22px; font-size: 0.92rem; }

                .pl-proof { list-style: none; margin: 22px 0 0; padding: 0; display: flex; flex-wrap: wrap;
                    justify-content: center; gap: 10px 26px; }
                .pl-proof li { display: flex; flex-direction: column; align-items: center; }
                .pl-proof b { font-size: 1.5rem; color: #fff6df; line-height: 1; }
                .pl-proof span { font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: #9aa08f; }

                /* ── PRIZE ──────────────────────────────────────────────────────────────────── */
                .pl-prize { display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: center;
                    padding: 20px; border-radius: 14px; border: 1px solid rgba(67,196,107,0.38);
                    background: radial-gradient(120% 140% at 0% 0%, rgba(67,196,107,0.14), transparent 60%), #0e1210; }
                .pl-prize-art :global(img) { border-radius: 12px; object-fit: contain; }
                .pl-prize-copy h2 { margin: 8px 0 6px; font-size: clamp(1.25rem, 5vw, 1.7rem); color: #fff6df; }
                .pl-prize-copy p { margin: 0 0 14px; color: #cfc6b6; font-size: 0.95rem; line-height: 1.5; }
                .pl-prize-copy b { color: #fff6df; }

                /* ── WINNERS ────────────────────────────────────────────────────────────────── */
                .pl-won, .pl-worlds { padding: 22px 20px; border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.09); background: #0e1110; }
                .pl-won header h2, .pl-worlds header h2 { margin: 8px 0 0;
                    font-size: clamp(1.3rem, 5.4vw, 1.9rem); color: #fff6df; }
                .pl-wins { list-style: none; margin: 18px 0 0; padding: 0; display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
                .pl-wins li { display: flex; align-items: center; gap: 12px; padding: 10px 12px;
                    border-radius: 11px; background: rgba(255,255,255,0.045);
                    border: 1px solid rgba(255,255,255,0.07); }
                .pl-win-art { flex: none; width: 56px; height: 56px; display: grid; place-items: center;
                    border-radius: 9px; background: rgba(0,0,0,0.35); }
                .pl-win-art :global(img) { object-fit: contain; max-width: 56px; max-height: 56px; }
                .pl-win-text { display: flex; flex-direction: column; min-width: 0; }
                .pl-win-text b { color: #fff6df; font-size: 0.92rem; overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap; }
                .pl-win-text em { font-style: normal; font-size: 0.78rem; color: #9aa08f; }

                /* ── WORLDS ─────────────────────────────────────────────────────────────────── */
                .pl-worlds ul { list-style: none; margin: 18px 0 0; padding: 0; display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
                .pl-worlds li { display: flex; align-items: flex-start; gap: 12px; }
                .pl-worlds b { display: block; color: #fff6df; font-size: 1rem; }
                .pl-worlds span { display: block; color: #cfc6b6; font-size: 0.88rem; line-height: 1.45; }

                /* ── LAST ASK ───────────────────────────────────────────────────────────────── */
                .pl-last { text-align: center; padding: 26px 20px 30px; border-radius: 16px;
                    border: 1px solid rgba(224,168,60,0.3);
                    background: radial-gradient(120% 140% at 50% 0%, rgba(224,168,60,0.16), transparent 64%), #0e1110; }
                .pl-last-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
                    opacity: 0.62; margin-bottom: 14px; }
                .pl-last h2 { margin: 0 0 6px; font-size: clamp(1.3rem, 5.6vw, 2rem); color: #fff6df; }
                .pl-last p { margin: 0 0 18px; color: #cfc6b6; font-size: 0.95rem; }

                @media (max-width: 560px) {
                    .pl-hero-copy { padding-top: 92px; }
                    .pl-prize { grid-template-columns: 1fr; text-align: center; justify-items: center; }
                }
            `}</style>
        </div>
    );
}
