"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

// ── THE CUSTOMER-FACING SCREEN AT THE TILL ───────────────────────────────────────────────────────────────────
// One screen doing every job that screen has, because Luke has exactly one of them: "I don't want to have to
// flip between mystery packs and then this marketing thing."
//
//   THE RAIL never changes. The QR lives here and only here — it is not part of the slideshow, so a customer
//   who decides to scan halfway through any slide is not waiting for the QR to come back around.
//   THE STAGE rotates: what the game is, what the gear is worth in real money, the mystery board, the loop.
//   A SALE interrupts all of it — their number and their QR, full width, until it is claimed or times out.
//
// ── WHY THE PICTURES ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "text isn't going to do it." He is right, and the first version of this screen was three lines of copy
// and a QR. Somebody who has never heard of any of this needs to SEE that there are pets and boats and gear
// and a farm and a casino behind that code, and there is no sentence that does that job in the four seconds
// they are looking.

const POLL_MS = 4000;
const SLIDE_MS = 11000;

export default function CounterDisplayClient({ displayKey, idleQr, pitch, gear, gearArt, collage, prizes, pinned, claimBase }) {
    const [claim, setClaim] = useState(null);
    const [mystery, setMystery] = useState(null);
    const [qr, setQr] = useState(null);
    const [slide, setSlide] = useState(0);
    const [offline, setOffline] = useState(false);
    const drawnFor = useRef(null);

    const poll = useCallback(async () => {
        // The repo's rule for any timer that talks to the server (check:polls). A shop screen is the
        // foreground tab all day so this rarely fires — but a machine left on overnight should not ask a
        // question 21,600 times before opening.
        if (typeof document !== "undefined" && document.hidden) return;
        const r = await fetch(`/api/pos/display?key=${encodeURIComponent(displayKey)}`, { cache: "no-store" }).catch(() => null);
        if (!r || !r.ok) { setOffline(true); return; }
        const d = await r.json().catch(() => null);
        setOffline(false);
        setClaim(d?.claim || null);
        if (d?.mystery !== undefined) setMystery(d.mystery);
    }, [displayKey]);

    useEffect(() => {
        poll();
        const t = setInterval(poll, POLL_MS);
        return () => clearInterval(t);
    }, [poll]);

    // Slides only advance while nothing is being claimed — a customer reading their own points must never
    // have the screen change under them. `pinned` holds one panel up indefinitely: useful for a bag drop
    // (park it on the mystery board for the afternoon) and for photographing a specific panel.
    useEffect(() => {
        if (claim || pinned) return undefined;
        const t = setInterval(() => setSlide((n) => n + 1), SLIDE_MS);
        return () => clearInterval(t);
    }, [claim, pinned]);

    // Redraw the claim QR only when the TOKEN changes. A QR that flickers every four seconds is one nobody
    // manages to scan.
    useEffect(() => {
        const token = claim?.token || null;
        if (!token) { drawnFor.current = null; setQr(null); return; }
        if (drawnFor.current === token) return;
        drawnFor.current = token;
        QRCode.toDataURL(`${claimBase}${token}`, {
            width: 720, margin: 1, errorCorrectionLevel: "M",
            color: { dark: "#101014", light: "#ffffff" },
        }).then(setQr).catch(() => setQr(null));
    }, [claim?.token, claimBase]);

    // ── A SALE LANDED ── everything else gets out of the way.
    if (claim) {
        return (
            <div className="pos pos-claim">
                <div className="pos-claim-left">
                    <span className="pos-kick">You just earned</span>
                    <strong className="pos-points">{claim.points.toLocaleString()}</strong>
                    <span className="pos-unit">points</span>
                    <ul className="pos-break">
                        {claim.lines.map((l) => (
                            <li key={l.label}><span>{l.label}</span><b>+{l.points.toLocaleString()}</b></li>
                        ))}
                    </ul>
                </div>
                <div className="pos-claim-right">
                    {qr ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="pos-qr" src={qr} alt="" />
                    ) : <div className="pos-qr pos-qr-wait" />}
                    <b className="pos-scan">Scan to keep them</b>
                    <span className="pos-scan-sub">One tap, no password. About ten seconds.</span>
                </div>
            </div>
        );
    }

    // Built here rather than as a constant because two of the four depend on live data — a mystery slide with
    // no bags in the case is a slide about nothing, so it drops out of the rotation entirely rather than
    // showing zeroes.
    const slides = [
        { key: "world", render: () => <SlideWorld collage={collage} /> },
        // The prize slide only exists once something has actually been given away — a panel that says "we
        // have given away nothing yet" is worse than one fewer panel.
        ...(prizes?.given?.length || prizes?.upNext ? [{ key: "prizes", render: () => <SlidePrizes p={prizes} /> }] : []),
        ...(gear.length ? [{ key: "gear", render: () => <SlideGear gear={gear} art={gearArt} /> }] : []),
        ...(mystery?.remaining ? [{ key: "mystery", render: () => <SlideMystery m={mystery} /> }] : []),
        { key: "loop", render: () => <SlideLoop rate={pitch.rate} /> },
    ];
    // A pin that names a panel which is not currently in the rotation (no bags in the case, say) falls back
    // to the rotation rather than showing a blank stage.
    const pinnedAt = pinned ? slides.findIndex((s) => s.key === pinned) : -1;
    const index = pinnedAt >= 0 ? pinnedAt : slide % slides.length;
    const current = slides[index];

    return (
        <div className="pos pos-idle">
            {/* THE STAGE — keyed on the slide so each one re-mounts and replays its entrance. */}
            <div className="pos-stage" key={current.key + index}>
                {current.render()}
            </div>

            {/* THE RAIL — never rotates. See the note at the top. */}
            <aside className="pos-rail">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pos-qr" src={idleQr} alt="" />
                <b className="pos-scan">Scan to join</b>
                <span className="pos-scan-sub">Free. {pitch.rate} points per $1, every purchase.</span>
                <div className="pos-dots" aria-hidden="true">
                    {slides.map((s, i) => (
                        <i key={s.key} className={i === index ? "is-on" : ""} />
                    ))}
                </div>
            </aside>

            {offline ? <span className="pos-offline">offline</span> : null}
        </div>
    );
}

// ── WHAT THIS IS ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I want the art to pop, and be read big and stuff, like a real exciting brochure."
//
// The first version was a tidy grid at half opacity behind a frosted card, which is wallpaper — the sprites
// were present and said nothing. This is a COMPOSITION: hand-placed, deliberately uneven, sprites at four
// different sizes overlapping each other and running off the edges, at full brightness with real shadows
// under them.
//
// The positions are AUTHORED rather than generated. A random scatter reliably produces a clump and a hole,
// and the one thing this panel has to do is look designed in the two seconds somebody glances at it. Sizes
// alternate large/small so the eye has somewhere to land, and the biggest pieces sit on the right where the
// copy is not.
//
// `--x/--y` are percentages of the stage, `--s` is the size in px at 1366 wide (it scales with the viewport),
// `--r` the tilt. Nothing here is centred and nothing is aligned to anything, on purpose.
const SCATTER = [
    { x: 46, y: 12, s: 168, r: -8 }, { x: 66, y: 4, s: 116, r: 7 }, { x: 84, y: 16, s: 196, r: -5 },
    { x: 38, y: 40, s: 132, r: 11 }, { x: 57, y: 33, s: 224, r: -3 }, { x: 78, y: 46, s: 140, r: 9 },
    { x: 94, y: 38, s: 120, r: -11 }, { x: 44, y: 70, s: 188, r: 6 }, { x: 64, y: 66, s: 128, r: -9 },
    { x: 82, y: 76, s: 172, r: 4 }, { x: 96, y: 66, s: 104, r: 12 }, { x: 34, y: 92, s: 120, r: -6 },
    { x: 56, y: 95, s: 148, r: 8 }, { x: 74, y: 96, s: 108, r: -4 }, { x: 92, y: 94, s: 132, r: 10 },
    { x: 30, y: 18, s: 96, r: 14 }, { x: 27, y: 58, s: 88, r: -13 }, { x: 88, y: 2, s: 92, r: 5 },
];

function SlideWorld({ collage }) {
    return (
        <div className="pos-slide pos-world">
            <div className="pos-world-art" aria-hidden="true">
                {SCATTER.map((p, i) => collage[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={collage[i]} src={collage[i]} alt=""
                        style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--s": p.s, "--r": `${p.r}deg`, "--i": i }} />
                ) : null)}
            </div>
            <div className="pos-world-copy">
                <span className="pos-kick">The Wolf Den</span>
                <h1>There is a whole game behind that code</h1>
                <p>Pets, gear, a farm, a casino, dungeons, ships — and every dollar you spend in
                    this shop levels you up in it.</p>
            </div>
        </div>
    );
}

// ── REAL THINGS, REAL WINNERS ────────────────────────────────────────────────────────────────────────────────
// The only panel on this screen that is not a promise. Product photos off the shelf and the name of the member
// who took each one home — no prices, no odds, no "could be you". Somebody who does not believe a word of the
// rest of this screen believes a photograph of a box that Alstier1 walked out with.
function SlidePrizes({ p }) {
    return (
        <div className="pos-slide pos-prize">
            <span className="pos-kick">Beat the boss, win the box</span>
            <h1>We give a real one away every time</h1>
            <ul className="pos-prize-list">
                {p.given.map((g) => (
                    <li key={g.name}>
                        {g.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={g.image} alt="" />
                        ) : <span className="pos-prize-noart" aria-hidden="true" />}
                        <span className="pos-prize-meta">
                            <b>{g.name}</b>
                            <em>won by {g.winner}</em>
                        </span>
                    </li>
                ))}
            </ul>
            {p.upNext ? (
                <p className="pos-prize-next">
                    Up for grabs right now: <b>{p.upNext.name}</b>
                </p>
            ) : (
                <p className="pos-prize-next">Free to enter. You just have to be playing when the boss shows up.</p>
            )}
        </div>
    );
}

// ── WHAT IT IS WORTH ── the strongest thing the screen can say, so it gets the biggest number.
function SlideGear({ gear, art }) {
    const best = gear[0];
    const bestArt = art?.[best?.id] || null;
    return (
        <div className="pos-slide pos-gear">
            <span className="pos-kick">Gear you can cash in</span>
            <h1>Some of it is worth real money at this counter</h1>
            {best?.dollars ? (
                <div className="pos-gear-hero">
                    {/* The crown, actual size. A sentence about a $200 crown is an argument; the crown is a
                        picture of one, and this panel exists because pictures do the work. */}
                    {bestArt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="pos-gear-heroart" src={bestArt} alt="" />
                    ) : null}
                    <span>
                        The <b>{best.name}</b> is worth
                        <strong> ${(best.dollars * best.charges).toLocaleString()}</strong> in store credit.
                    </span>
                </div>
            ) : null}
            <ul className="pos-gear-list">
                {gear.slice(0, 5).map((g) => (
                    <li key={g.id}>
                        {art?.[g.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="pos-gear-ico" src={art[g.id]} alt="" />
                        ) : <span className="pos-gear-ico" aria-hidden="true" />}
                        <span className="pos-gear-name">{g.name}</span>
                        <span className="pos-gear-val">{g.reward}{g.charges > 1 ? ` ×${g.charges}` : ""}</span>
                    </li>
                ))}
            </ul>
            <p className="pos-gear-fine">Equip it, tap it, show the code at the till. That is the whole process.</p>
        </div>
    );
}

// ── THE MYSTERY BOARD ── the thing this screen already showed, folded in rather than replaced.
function SlideMystery({ m }) {
    const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return (
        <div className="pos-slide pos-myst">
            <span className="pos-kick">Mystery packs</span>
            <h1>{m.remaining} left in the case</h1>
            <div className="pos-myst-stats">
                {m.price ? <div><b>{money(m.price)}</b><span>a pack</span></div> : null}
                <div><b>{money(m.marketTotal)}</b><span>still in there</span></div>
                {m.average ? <div><b>{money(m.average)}</b><span>average pack</span></div> : null}
            </div>
            {m.top?.length ? (
                <>
                    <span className="pos-myst-kick">Biggest cards still unclaimed</span>
                    <ul className="pos-myst-top">
                        {m.top.map((c) => (
                            <li key={c.name}>
                                {c.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={c.image} alt="" />
                                ) : <span className="pos-myst-noart" aria-hidden="true" />}
                                <span className="pos-myst-name">{c.name}</span>
                                <b>{money(c.value)}</b>
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
        </div>
    );
}

// ── THE LOOP ── how the money becomes the thing. Four steps, because anybody can hold four.
function SlideLoop({ rate }) {
    const steps = [
        { n: "1", t: "Spend here", s: `${rate} points per $1` },
        { n: "2", t: "Level up", s: "Chests, gear, pets" },
        { n: "3", t: "Equip it", s: "Some gear carries in-store perks" },
        { n: "4", t: "Cash it in", s: "Store credit, free packs, entries" },
    ];
    return (
        <div className="pos-slide pos-loop">
            <span className="pos-kick">How it works</span>
            <h1>Money in, money back out</h1>
            <ol className="pos-loop-steps">
                {steps.map((s) => (
                    <li key={s.n}>
                        <b>{s.n}</b>
                        <span className="pos-loop-t">{s.t}</span>
                        <span className="pos-loop-s">{s.s}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
