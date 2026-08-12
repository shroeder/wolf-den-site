"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GiCrystalGrowth, GiOpenTreasureChest } from "react-icons/gi";

// ── THE SKY OPENED ───────────────────────────────────────────────────────────────────────────────────────────
// One of the four rarest chests dropped out of ordinary play. Community-wide a Primordial is expected about
// twice a year, so this screen is something most members will see once and some will never see at all — which
// is the entire argument for it being this loud. A line of text in a notification tray would be a waste of the
// rarest thing the game does.
//
// It escalates by tier rather than being one animation with the colour swapped: an Ascendant gets the beam and
// the chest, a Primordial gets the whole sky. Deliberately ignores prefers-reduced-motion, like the rest of the
// Den's celebration work.

const TIER = {
    ascendant: { label: "Ascendant Chest", color: "#ff7a3c", cry: "The sky opened.", rays: 10, sparks: 14, shake: 1 },
    eternal: { label: "Eternal Chest", color: "#ff5cc8", cry: "The sky opened.", rays: 14, sparks: 20, shake: 1.4 },
    celestial: { label: "Celestial Chest", color: "#7c5cff", cry: "Something answered.", rays: 18, sparks: 28, shake: 1.8 },
    primordial: { label: "Primordial Chest", color: "#ffe9b0", cry: "The first light.", rays: 24, sparks: 40, shake: 2.4 },
};

// Where it came from, in the member's own words rather than the ledger's. A drop is far better when you can
// point at the exact ordinary thing you were doing when it landed.
const FROM = {
    harvest: "out of a crop you pulled", harvest_loot: "out of a crop you pulled",
    fishing: "on the end of a line", mining: "out of the rock", farm_encounter: "out on the farm",
    loot_pig: "from a very smug pig", wishing_well: "up out of the well",
    town_duel: "off something you put down in the plaza", arena_win: "off the arena floor",
    ship_battle: "out of the water beside your hull", delve: "from somewhere under the Den",
    spin_prize: "off the wheel", checkin: "for simply turning up",
    boss_raid: "off the boss", boss_reward: "off the boss", raid_complete: "out of the raid",
    raid_defense: "out of the raid", town_event: "out of the town",
};

export default function WindfallPop({ windfall, image, onClose }) {
    const t = TIER[windfall?.tier] || TIER.ascendant;
    const [stage, setStage] = useState(0);   // 0 the beam · 1 the chest lands · 2 the words
    // Portalled to <body>, like BadgePop. This mounts inside the nav, which is itself a positioned, stacked
    // element — a full-screen takeover rendered inside one is a takeover of the nav, not of the screen.
    const [host, setHost] = useState(null);

    useEffect(() => {
        setHost(document.body);
        const a = setTimeout(() => setStage(1), 620);
        const b = setTimeout(() => setStage(2), 1180);
        return () => { clearTimeout(a); clearTimeout(b); };
    }, []);

    if (!windfall?.tier || !host) return null;
    const from = FROM[windfall.reason] || "out of nowhere at all";

    return createPortal((
        <div className={`wf-veil wf-s${stage}`} style={{ "--c": t.color, "--shake": t.shake }} role="dialog" aria-label={t.label}>
            {/* The rays sit BEHIND everything and turn slowly. They are the reason the screen reads as an event
                rather than as a card with a picture on it. */}
            <div className="wf-rays" aria-hidden="true">
                {Array.from({ length: t.rays }, (_, i) => (
                    <i key={i} style={{ transform: `rotate(${(360 / t.rays) * i}deg)` }} />
                ))}
            </div>
            <div className="wf-beam" aria-hidden="true" />
            <div className="wf-sparks" aria-hidden="true">
                {Array.from({ length: t.sparks }, (_, i) => (
                    <b key={i} style={{
                        left: `${(i * 37) % 100}%`,
                        animationDelay: `${(i % 9) * 0.14}s`,
                        animationDuration: `${2.4 + ((i * 7) % 20) / 10}s`,
                    }} />
                ))}
            </div>

            <div className="wf-card">
                <div className="wf-art">
                    {image
                        ? <img src={image} alt="" draggable="false" />
                        : <GiOpenTreasureChest aria-hidden="true" />}
                </div>
                <p className="wf-cry">{t.cry}</p>
                <h2 className="wf-tier">{t.label}</h2>
                <p className="wf-from">It dropped {from}.</p>
                <div className="wf-actions">
                    <Link href="/marketplace/inventory" className="wf-go" onClick={onClose}>
                        <GiCrystalGrowth aria-hidden="true" /> Go and open it
                    </Link>
                    <button type="button" className="wf-later" onClick={onClose}>Later</button>
                </div>
            </div>

            <style jsx>{`
                /* Every keyframe here is wf- prefixed. Two @keyframes sharing a name across styled-jsx blocks
                   silently break BOTH of them, and this component mounts on the nav beside a dozen others. */
                /* TWO LAYERS, and the bottom one is nearly solid. A single radial gradient from the tier
                   colour to near-black looked right in isolation and was 74% TRANSPARENT through the middle,
                   so the site's footer read straight through the middle of the celebration. The wash goes on
                   TOP of an opaque ground rather than being asked to be the ground. */
                .wf-veil { position: fixed; inset: 0; z-index: 4000; display: grid; place-items: center;
                    padding: 20px; overflow: hidden;
                    background:
                        radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--c) 26%, transparent), transparent 62%),
                        #05060a;
                    animation: wf-in .45s ease both; }
                @keyframes wf-in { from { opacity: 0; } to { opacity: 1; } }

                .wf-rays { position: absolute; left: 50%; top: 34%; width: 1px; height: 1px;
                    animation: wf-turn 26s linear infinite; }
                .wf-rays i { position: absolute; left: 0; top: 0; transform-origin: 0 0; display: block;
                    width: 3px; height: 78vmax; margin-left: -1.5px;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 55%, transparent), transparent 62%);
                    filter: blur(1px); opacity: 0; }
                .wf-s1 .wf-rays i, .wf-s2 .wf-rays i { opacity: .55; transition: opacity 1.4s ease; }
                @keyframes wf-turn { to { transform: rotate(360deg); } }

                /* The beam lands first and the chest lands in it — the order is what makes it read as arriving
                   from somewhere rather than fading in on the spot. */
                .wf-beam { position: absolute; left: 50%; top: -10%; width: 46vmin; height: 90vmin;
                    margin-left: -23vmin; transform-origin: 50% 0;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 62%, transparent), transparent 78%);
                    filter: blur(16px); clip-path: polygon(42% 0, 58% 0, 96% 100%, 4% 100%);
                    animation: wf-beam-drop .62s cubic-bezier(.16,1,.3,1) both; }
                @keyframes wf-beam-drop { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }

                .wf-sparks { position: absolute; inset: 0; }
                .wf-sparks b { position: absolute; bottom: -12px; width: 3px; height: 3px; border-radius: 50%;
                    background: var(--c); box-shadow: 0 0 8px var(--c);
                    animation: wf-rise linear infinite; }
                @keyframes wf-rise {
                    from { transform: translateY(0) scale(.6); opacity: 0; }
                    18% { opacity: 1; }
                    to { transform: translateY(-86vh) scale(1.25); opacity: 0; }
                }

                .wf-card { position: relative; text-align: center; max-width: 420px; }
                .wf-art { width: 190px; height: 190px; margin: 0 auto 6px; display: grid; place-items: center;
                    opacity: 0; transform: scale(.2) translateY(-120px); }
                .wf-s1 .wf-art, .wf-s2 .wf-art { animation: wf-land .58s cubic-bezier(.2,1.6,.35,1) both; }
                @keyframes wf-land {
                    from { opacity: 0; transform: scale(.2) translateY(-120px); }
                    68% { opacity: 1; transform: scale(1.16) translateY(6px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .wf-art :global(img) { width: 100%; height: 100%; object-fit: contain;
                    filter: drop-shadow(0 0 34px color-mix(in srgb, var(--c) 75%, transparent)) drop-shadow(0 12px 22px rgba(0,0,0,0.7)); }
                .wf-art :global(svg) { width: 130px; height: 130px; color: var(--c);
                    filter: drop-shadow(0 0 30px color-mix(in srgb, var(--c) 70%, transparent)); }

                /* THE SLAM. The whole card kicks once on the frame the chest lands, scaled by tier — a
                   Primordial hits noticeably harder than an Ascendant, which is the point of having four. */
                .wf-s1 .wf-card, .wf-s2 .wf-card { animation: wf-slam .5s ease-out both; }
                @keyframes wf-slam {
                    0% { transform: translate(0, 0); }
                    22% { transform: translate(calc(-4px * var(--shake)), calc(3px * var(--shake))); }
                    44% { transform: translate(calc(4px * var(--shake)), calc(-2px * var(--shake))); }
                    66% { transform: translate(calc(-2px * var(--shake)), calc(2px * var(--shake))); }
                    to { transform: translate(0, 0); }
                }

                .wf-cry, .wf-tier, .wf-from, .wf-actions { opacity: 0; }
                .wf-s2 .wf-cry { animation: wf-up .5s ease .00s both; }
                .wf-s2 .wf-tier { animation: wf-up .5s ease .09s both; }
                .wf-s2 .wf-from { animation: wf-up .5s ease .19s both; }
                .wf-s2 .wf-actions { animation: wf-up .5s ease .30s both; }
                @keyframes wf-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

                .wf-cry { margin: 0; font-size: 12px; font-weight: 900; letter-spacing: .22em;
                    text-transform: uppercase; color: color-mix(in srgb, var(--c) 60%, white); }
                .wf-tier { margin: 4px 0 0; font-family: var(--font-display); font-size: clamp(28px, 8vw, 46px);
                    line-height: 1.02; color: #fff; text-wrap: balance;
                    text-shadow: 0 0 30px color-mix(in srgb, var(--c) 80%, transparent); }
                .wf-from { margin: 8px 0 0; font-size: 14px; color: #c3c9d2; }

                .wf-actions { display: grid; gap: 8px; margin-top: 20px; }
                /* :global, because next/link is a CUSTOM COMPONENT and styled-jsx cannot put its scoping class
                   on one — a plain ".wf-go" rule compiles to a selector that matches nothing, which is exactly
                   how the main call to action rendered as bare gold text instead of a button. Nested inside
                   .wf-actions so the escape hatch stays inside this component. */
                .wf-actions :global(.wf-go) { display: flex; align-items: center; justify-content: center;
                    gap: 8px; padding: 14px 18px; border-radius: 14px; text-decoration: none;
                    font-family: var(--font-display); font-size: 17px; color: #17110a;
                    background: linear-gradient(180deg, #ffe89a, #ffc93c);
                    box-shadow: 0 3px 0 rgba(0,0,0,0.4), 0 0 26px color-mix(in srgb, var(--c) 45%, transparent); }
                .wf-actions :global(.wf-go svg) { width: 20px; height: 20px; }
                .wf-later { padding: 10px; border: 0; background: none; color: #8b93a0; font-size: 13px;
                    font-weight: 700; cursor: pointer; }
                .wf-later:hover { color: #cfd4da; }
            `}</style>
        </div>
    ), host);
}
