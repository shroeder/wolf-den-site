"use client";

import { useEffect, useRef, useState } from "react";

import ArenaFx from "@/components/arena/ArenaFx";

// ── THE SPELL BENCH ──────────────────────────────────────────────────────────────────────────────────────────
// Every effect, at the size and in the place it plays, over the real arena plate — on a loop, with its name on
// screen. You on the left, opponent on the right, as in the ring.
//
// This exists because "do the effects look good" cannot be answered by the checks that kept being run: reading
// the DOM tells you WHICH effect mounted, which is correctness rather than quality, and screenshotting a live
// bout races a half-second animation and mostly catches the gap between two of them. One panel, one effect at
// a time, announced — and holdable with ?only= so a single spell can be stared at.
const ELEMENTS = ["fire", "water", "earth", "storm", "light", "shadow"];
const KINDS = ["hit", "flurry", "execute", "rend", "drain", "sunder", "ward", "surge", "riposte", "gamble", "heal"];
const ON_SELF = new Set(["ward", "surge", "heal"]);

// The six affinities first — they are the loudest thing in the game — then the eleven move shapes.
const REEL = [
    ...ELEMENTS.map((el) => ({ label: `spell · ${el}`, spec: { kind: "spell", element: el, side: "them", power: 1.4 } })),
    ...KINDS.map((k) => ({
        label: k,
        spec: { kind: k, element: "fire", side: ON_SELF.has(k) ? "you" : "them", power: 1.2 },
    })),
    { label: "critical hit", spec: { kind: "hit", element: "light", side: "them", power: 1.8, crit: true } },
];

const EVERY = 1600;

export default function FxPreview() {
    const fx = useRef(null);
    const shake = useRef(null);
    const [i, setI] = useState(0);
    const [only, setOnly] = useState(null);

    useEffect(() => {
        const o = new URLSearchParams(window.location.search).get("only");
        if (!o) return;
        const idx = REEL.findIndex((r) => r.label.includes(o));
        if (idx >= 0) setOnly(idx);
    }, []);

    useEffect(() => {
        const n = only ?? i;
        const t = setTimeout(() => fx.current?.play(REEL[n].spec), 120);
        const loop = setInterval(() => {
            if (only !== null) fx.current?.play(REEL[only].spec);
            else setI((x) => (x + 1) % REEL.length);
        }, EVERY);
        return () => { clearTimeout(t); clearInterval(loop); };
    }, [i, only]);

    const cur = REEL[only ?? i];

    return (
        <div className="fxb">
            <div className="fxb-ring" ref={shake}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="fxb-bg" src="/images/arena/arena-bg.webp" alt="" draggable="false" />
                <span className="fxb-scrim" aria-hidden="true" />
                {/* Stand-ins on the ground line, so an effect is judged against bodies rather than empty sand.
                    You left, opponent right — the ring's arrangement. */}
                <span className="fxb-body is-you" aria-hidden="true" />
                <span className="fxb-body is-foe" aria-hidden="true" />
                <ArenaFx ref={fx} onShake={(x, y) => {
                    const el = shake.current;
                    if (el) el.style.transform = x || y ? `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)` : "";
                }} />
                <b className="fxb-lab">{cur.label}</b>
            </div>
            <p className="fxb-help">cycling every {EVERY}ms · <code>?only=fire</code> holds one</p>
            <style jsx global>{`
                .fxb { padding: 12px; max-width: 460px; margin: 0 auto; }
                /* The real ring's proportions, so what is shown here is what plays in a bout. */
                .fxb-ring { position: relative; height: 560px; border-radius: 16px; overflow: hidden;
                    border: 1px solid rgba(255,190,110,0.3);
                    background: linear-gradient(180deg,#150f0c,#1e1410 52%,#33210f); }
                .fxb-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                    object-position: 38% 100%; transform: scale(1.25); transform-origin: 50% 100%; }
                .fxb-scrim { position: absolute; inset: 0;
                    background: radial-gradient(58% 30% at 50% 84%, rgba(255,186,92,.18), transparent 72%),
                                radial-gradient(95% 80% at 50% 56%, transparent, rgba(10,6,4,.5)); }
                .fxb-body { position: absolute; bottom: 22%; width: 96px; height: 156px; z-index: 2;
                    border-radius: 42% 42% 20% 20%;
                    background: linear-gradient(180deg,#6b5330,#2a2018);
                    box-shadow: 0 10px 18px rgba(0,0,0,.6); }
                .fxb-body.is-you { left: 12%; }
                .fxb-body.is-foe { right: 14%; transform: scale(.86); }
                .fxb-lab { position: absolute; left: 10px; top: 8px; z-index: 30; font-size: 12px; font-weight: 900;
                    letter-spacing: .16em; text-transform: uppercase; color: #ffe0b0; text-shadow: 0 2px 8px #000; }
                .fxb-help { margin: 8px 2px 0; font-size: 11px; color: #7f8790; }
                .fxb-help code { color: #ffd75e; }
            `}</style>
        </div>
    );
}
