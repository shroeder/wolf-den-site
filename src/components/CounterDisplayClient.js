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
// Luke: "I want info in the middle, sprites packed together in all 4 corners, clustered together so it looks
// like groupings of sprites."
//
// Four PILES, one per corner, with the message sitting in the hole between them. That is a different idea
// from the even scatter it replaces, and a better one: an evenly-spread field reads as wallpaper because the
// eye has nowhere to rest, whereas four dense clumps read as four HOARDS — which is what the game actually
// is, four or five features' worth of stuff — and they frame the words instead of competing with them.
//
// Each cluster is an anchor plus tight local offsets in percent, deliberately overlapping. Sizes alternate
// big/small INSIDE a cluster so it piles rather than tiles, and the rotations are uneven for the same reason.
const CLUSTERS = [
    // top-left
    { at: [7, 12], items: [[0, 0, 176, -9], [26, -6, 116, 8], [12, 22, 132, 5], [34, 18, 100, -14], [-8, 26, 96, 11]] },
    // top-right
    { at: [93, 11], items: [[0, 0, 184, 7], [-27, -5, 120, -8], [-11, 21, 140, -4], [-33, 17, 104, 12], [8, 25, 92, -12]] },
    // bottom-left
    { at: [7, 89], items: [[0, 0, 168, 6], [27, 5, 124, -9], [11, -20, 136, -5], [33, -17, 100, 13], [-8, -25, 92, 9]] },
    // bottom-right
    { at: [93, 90], items: [[0, 0, 180, -6], [-26, 6, 118, 10], [-12, -19, 138, 4], [-34, -16, 102, -11], [7, -24, 94, 13]] },
];
// Flattened once at module scope — the render just walks it against the sprite list.
const PILE = CLUSTERS.flatMap((c) => c.items.map(([dx, dy, s, r]) => ({
    x: c.at[0] + dx, y: c.at[1] + dy, s, r,
})));

function SlideWorld({ collage }) {
    return (
        <div className="pos-slide pos-world">
            <div className="pos-world-art" aria-hidden="true">
                {PILE.map((p, i) => collage[i % Math.max(1, collage.length)] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${i}-${collage[i % collage.length]}`} src={collage[i % collage.length]} alt=""
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
