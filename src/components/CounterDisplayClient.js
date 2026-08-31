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

export default function CounterDisplayClient({ displayKey, idleQr, pitch, gear, gearArt, collage, prizes, shelf, pinned, claimBase }) {
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
    // THREE SLIDES. Luke: "we can probably fit all of that on one slide."
    //
    // What the game IS, what is in the case, and the call to arms. The gear-for-store-credit fact and the real
    // prizes are one LINE each on the first slide now rather than two slides of their own — they are proof
    // points for "this is worth your time", not chapters of their own.
    const slides = [
        { key: "world", render: () => <SlideWorld collage={collage} gear={gear} gearArt={gearArt} prizes={prizes} shelf={shelf} /> },
        ...(mystery?.remaining ? [{ key: "mystery", render: () => <SlideMystery m={mystery} /> }] : []),
        { key: "call", render: () => <SlideCall prizes={prizes} /> },
    ];
    // A pin naming a panel that is not currently in the rotation (no bags in the case, say) falls back to the
    // rotation rather than showing a blank stage.
    const pinnedAt = pinned ? slides.findIndex((x) => x.key === pinned) : -1;
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

// ── SLIDE 1 · DEN QUEST ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "the whole thing needs to have lore, it needs to feel like the tale of the Wolf Den, and Den Quest
// needs to be front and centre ... it's obviously a loyalty program but we want it to feel like you're calling
// heroes to action."
//
// So the frame is not "join our rewards programme", it is "there is a game here and your receipts are already
// part of it". The two proof points — gear that cashes out at this counter, and a real box given away every
// boss — sit UNDER the pitch as one line each, because they are evidence rather than the argument.
//
// Four corner piles of hand-picked sprites with the message in the hole between them. See GROOMED in
// pos-display.js: every one of those was chosen off a contact sheet rather than drawn at random.
const CLUSTERS = [
    { at: [15, 20], items: [[0, 0, 178, -8], [13, 9, 124, 9], [-9, 13, 112, 5], [10, -11, 98, 14]] },
    { at: [85, 19], items: [[0, 0, 186, 7], [-13, 10, 126, -9], [9, 14, 110, -4], [-11, -10, 100, 12]] },
    { at: [15, 81], items: [[0, 0, 172, 6], [13, -9, 128, -9], [-9, -13, 114, -5], [11, 11, 96, 13]] },
    { at: [85, 82], items: [[0, 0, 182, -6], [-13, -10, 122, 10], [9, -14, 116, 4], [-11, 10, 98, -12]] },
];
const PILE = CLUSTERS.flatMap((c) => c.items.map(([dx, dy, sz, r]) => ({ x: c.at[0] + dx, y: c.at[1] + dy, s: sz, r })));

function SlideWorld({ collage, gear, gearArt, prizes, shelf }) {
    const best = gear?.[0];
    const bestWorth = best?.dollars ? best.dollars * best.charges : null;
    return (
        <div className="pos-slide pos-world">
            <div className="pos-world-art" aria-hidden="true">
                {PILE.map((p, i) => (collage[i % Math.max(1, collage.length)] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${i}-${collage[i % collage.length]}`} src={collage[i % collage.length]} alt=""
                        style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--s": p.s, "--r": `${p.r}deg`, "--i": i }} />
                ) : null))}
            </div>
            <div className="pos-world-copy">
                <span className="pos-kick">Den Quest</span>
                <h1>Every dollar you spend here arms a hero</h1>
                <p>The Wolf Den has a game inside it — gear, pets, dungeons, ships, a farm, a casino.
                    Your receipts are what level you up in it.</p>
                <ul className="pos-proof">
                    {bestWorth ? (
                        <li>
                            {gearArt?.[best.id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={gearArt[best.id]} alt="" />
                            ) : null}
                            <span>Some of the gear cashes in <b>at this counter</b> — the {best.name} is
                                worth <b>${bestWorth.toLocaleString()}</b> in store credit.</span>
                        </li>
                    ) : null}
                    {(prizes?.given?.length || shelf) ? (
                        <li>
                            {shelf?.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="pos-proof-box" src={shelf.image} alt="" />
                            ) : null}
                            <span>Every boss the pack brings down, we give away <b>a real box off the
                                shelf</b>{prizes?.given?.[0] ? <> — {prizes.given[0].winner} took the last one</> : null}.</span>
                        </li>
                    ) : null}
                </ul>
            </div>
        </div>
    );
}

// ── SLIDE 2 · THE CASE ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "render the top five chase cards and their price. It needs to be up to date since people are constantly
// buying them ... it really needs to sell the mystery packs that are twenty bucks a piece, and you have such a
// good chance of finding a card that is fifteen times your money."
//
// The multiple is COMPUTED from the real top card against the real price rather than asserted, so the number on
// the screen is one the case can actually pay. It moves down as the good cards get pulled, which is honest and
// is also the urgency: what is on this screen is what is still in there right now.
function SlideMystery({ m }) {
    const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const best = m.top?.[0]?.value || 0;
    const mult = m.price > 0 && best > 0 ? Math.floor(best / m.price) : 0;
    return (
        <div className="pos-slide pos-myst">
            <span className="pos-kick">Mystery packs · {money(m.price)} each</span>
            <h1>{mult ? <>One card in there is worth <em>{mult}&times;</em> a pack</> : <>{m.remaining} left in the case</>}</h1>
            <div className="pos-myst-head">
                <span><b>{m.remaining}</b> packs left</span>
                <span><b>{money(m.marketTotal)}</b> still in the case</span>
                {m.average ? <span><b>{money(m.average)}</b> average pack</span> : null}
            </div>
            <span className="pos-myst-kick">The five biggest still unclaimed</span>
            <ol className="pos-myst-top">
                {(m.top || []).map((c, i) => (
                    <li key={c.name}>
                        <i>{i + 1}</i>
                        {c.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.image} alt="" />
                        ) : <span className="pos-myst-noart" aria-hidden="true" />}
                        <span className="pos-myst-name">{c.name}</span>
                        <b>{money(c.value)}</b>
                    </li>
                ))}
            </ol>
        </div>
    );
}

// ── SLIDE 3 · THE CALL ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "show a picture of the boss and then a picture of one of our heroes ... like this could be you. We need
// heroes to help battle the boss. You could be next. Do you have what it takes?"
//
// The hero is a PURPOSE-BUILT asset in the repo (scripts/gen-counter-hero.mjs) rather than a member's avatar.
// Luke spotted the reason himself: "we throw away generated sprites, so we would need to enshrine it so that we
// don't get it lost from underneath us." A member's sprite is REDRAWN every time they change gear — point a
// shop screen at one and the picture changes when somebody swaps a hat, then eventually 404s. It is also
// somebody else's likeness, which is not ours to spend on a marketing screen.
//
// This champion belongs to nobody and wears the best gear in the game, and the helm hides the face on purpose:
// "this could be you" only works if it could.
function SlideCall({ prizes }) {
    const boss = prizes?.boss;
    return (
        <div className="pos-slide pos-call">
            <div className="pos-call-copy">
                <span className="pos-kick">Den Quest</span>
                <h1>The Den needs heroes</h1>
                <p>
                    {boss?.name
                        ? <><b>{boss.name}</b> is standing in the plaza right now, and the pack is already swinging.</>
                        : <>Something crawls out of the dark every week, and the pack goes at it together.</>}
                </p>
                <p className="pos-call-ask">You could be next. Do you have what it takes?</p>
            </div>
            <div className="pos-call-fight" aria-hidden="true">
                {boss?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pos-call-boss" src={boss.image} alt="" />
                ) : null}
                <span className="pos-call-vs">vs</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pos-call-hero" src="/images/counter/hero.webp" alt="" />
            </div>
        </div>
    );
}
