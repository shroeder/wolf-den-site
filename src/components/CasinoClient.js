"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio.js";

// ── THE FLOOR ────────────────────────────────────────────────────────────────────────────────────────────────
// A room laid out like the tavern: you walk left and right along it, the other people in it are really there,
// and the things you walk up to are MACHINES rather than people. Luke's brief, and the reason it is a room at
// all rather than a menu of games — a casino you scroll is a list; a casino you walk into is a place.
//
// WHAT IS HERE AND WHAT IS NOT. One machine works end to end: the slot. The other cabinets are drawn, named
// and dark, because a floor with one machine and no sign of the rest reads as finished when it is not — and
// because the shape of the room is the thing worth agreeing on before four more games are written into it.
//
// The art is CSS. Every cabinet on this floor is a gradient and a border, deliberately: art costs money to
// generate and this is a layout to be argued with first. When the floor plan is right, the cabinets get
// painted.
const MACHINES = [
    { id: "slot", x: 12, label: "Wolf's Luck", kind: "Slots", live: true },
    { id: "slot2", x: 28, label: "Den Fortune", kind: "Slots", live: false },
    { id: "slot3", x: 44, label: "Moonrise", kind: "Slots", live: false },
    { id: "roulette", x: 60, label: "The Wheel", kind: "Roulette", live: false },
    { id: "keno", x: 75, label: "Keno", kind: "Keno", live: false },
    { id: "blackjack", x: 90, label: "The Table", kind: "Blackjack", live: false },
];

// How close you have to stand for a machine to be usable. Wide enough that walking to something feels like
// arriving rather than threading a needle.
const REACH = 9;

const SYMBOL_ART = {
    wolf: { glyph: "▲", tone: "#ffd75e" },
    chest: { glyph: "■", tone: "#ff9f43" },
    laurel: { glyph: "❖", tone: "#8bf0b4" },
    doubloon: { glyph: "●", tone: "#ffe9b8" },
    bone: { glyph: "▬", tone: "#cbd3dc" },
    moon: { glyph: "◗", tone: "#9fc6dd" },
};

const money = (n) => Math.round(Number(n) || 0).toLocaleString();

export default function CasinoClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [x, setX] = useState(14);
    const [facing, setFacing] = useState(1);
    const [at, setAt] = useState(null);          // the machine you are standing at
    const [bet, setBet] = useState(100);
    const [spin, setSpin] = useState(null);      // the last pull, for the reels and the callout
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const xRef = useRef(x);
    // ── THE CAMERA ───────────────────────────────────────────────────────────────────────────────────────
    // The floor is WIDER than the screen and scrolls with you. Six cabinets already crowd a phone; fitting
    // the whole room into one viewport stops working the moment there are more, and a casino you can see all
    // of at once is a menu with a carpet. The room is the window, `.cas-world` is the floor, and the window
    // follows you.
    const roomRef = useRef(null);
    // Reels mid-spin: the symbols cycling before they land. Null when the machine is at rest.
    const [rolling, setRolling] = useState(null);
    const [landed, setLanded] = useState(0);     // how many reels have stopped, 0..3
    const [flash, setFlash] = useState(null);    // "win" | "big" — the celebration, cleared on a timer
    const timers = useRef([]);

    // ── WALKING ──────────────────────────────────────────────────────────────────────────────────────────────
    // Your position is local and immediate — the walk must never wait on a round trip — and pushed to the
    // server on a timer so the other people in the room see you move. The same shape the tavern uses.
    useEffect(() => { xRef.current = x; }, [x]);
    useEffect(() => {
        const id = setInterval(() => {
            fetch("/api/marketplace/casino", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "move", x: xRef.current, y: 72, facing }),
            }).catch(() => {});
        }, 2500);
        return () => clearInterval(id);
    }, [facing]);

    // Who else is on the floor. Polled rather than pushed, because a casino is not a fight — a few seconds of
    // staleness in where somebody is standing costs nothing.
    useEffect(() => {
        const id = setInterval(async () => {
            const r = await fetch("/api/marketplace/casino").then((x2) => x2.json()).catch(() => null);
            if (r?.open) setSt((p) => ({ ...p, others: r.others, gold: r.gold }));
        }, 6000);
        return () => clearInterval(id);
    }, []);

    // Keep the window centred on you. Written imperatively rather than as a transform because scrollLeft
    // needs no arithmetic about percentages of percentages, and the browser smooths it for free.
    useEffect(() => {
        const el = roomRef.current;
        if (!el) return;
        const world = el.scrollWidth;
        el.scrollTo({ left: (world * x) / 100 - el.clientWidth / 2, behavior: "smooth" });
    }, [x]);

    const walk = useCallback((dir) => {
        unlock();
        Sfx.ui();
        setFacing(dir);
        setX((p) => Math.max(4, Math.min(96, p + dir * 6)));
        setErr(null);
    }, []);

    // What you are standing in front of. Recomputed from position rather than remembered, so walking away
    // closes the machine without anything having to tell it to.
    useEffect(() => {
        const near = MACHINES.find((m) => Math.abs(m.x - x) <= REACH);
        setAt(near || null);
    }, [x]);

    // ── ONE PULL, AS AN EVENT ────────────────────────────────────────────────────────────────────────────
    // The server answers in a few milliseconds and that is exactly the problem: an instant result is a number
    // appearing, not a spin. The reels cycle while the request is in flight and then land LEFT TO RIGHT with
    // a thunk each, which is the whole drama of a slot machine — the third reel is where the tension lives,
    // and it cannot exist if all three resolve on the same frame.
    //
    // The outcome is never in doubt by then: the server decided it before the first reel stopped. The
    // ceremony is presentation over a result already banked, which is the honest version of this — nothing
    // here can change what was rolled.
    const pull = useCallback(async () => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setLanded(0);
        Sfx.whoosh();

        // Cycle the reels while we wait. Cleared when the result lands, so a slow network spins longer
        // rather than freezing on the old result.
        const ids = Object.keys(SYMBOL_ART);
        const spinner = setInterval(() => {
            setRolling([0, 1, 2].map(() => ids[Math.floor(Math.random() * ids.length)]));
        }, 70);

        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "spin", bet }),
        }).then((x2) => x2.json()).catch(() => null);

        if (!r?.ok) {
            clearInterval(spinner);
            setRolling(null); setBusy(false);
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet." : "That didn't go through.");
            return;
        }

        // A minimum spin, so a fast answer still feels like a machine rather than a calculator.
        const MIN_SPIN = 520;
        timers.current.push(setTimeout(() => {
            clearInterval(spinner);
            setRolling(null);
            setSpin(r);
            setSt((p) => ({ ...p, gold: r.gold }));

            // Reels stop one at a time. The gap widens for the last one — that pause IS the near-miss.
            [0, 1, 2].forEach((i) => {
                timers.current.push(setTimeout(() => {
                    setLanded(i + 1);
                    Sfx.impact(0.3 + i * 0.12);
                    Haptic.hit(0.35);
                }, i === 2 ? 620 : i * 230));
            });

            timers.current.push(setTimeout(() => {
                setBusy(false);
                const three = r.reels[0] === r.reels[1] && r.reels[1] === r.reels[2];
                if (r.won > 0) {
                    setFlash(three ? "big" : "win");
                    if (three) { Sfx.crit(0.9); Haptic.crit(); } else { Sfx.gemSet?.(); Haptic.hit(0.6); }
                    timers.current.push(setTimeout(() => setFlash(null), three ? 2200 : 1200));
                }
            }, 780));
        }, MIN_SPIN));
    }, [bet, busy]);

    // Every timer this component starts is cleared on unmount — walking out mid-spin must not leave a
    // callback firing into a component that is gone.
    useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

    const canPlay = at?.live && !busy && (st?.gold || 0) >= bet;

    return (
        <section className="cas">
            <header className="cas-top">
                <a className="cas-out" href="/marketplace/town">← Town</a>
                <b className="cas-name">The Casino</b>
                <span className="cas-purse">{money(st?.gold)}<i>gold</i></span>
            </header>

            {/* ── THE ROOM ────────────────────────────────────────────────────────────────────────────────
                Positioned in percentages so the floor is the same room on any screen: a machine at 50 is in
                the middle of a phone and the middle of a desktop, rather than drifting with the viewport. */}
            <div className="cas-room" ref={roomRef}>
              <div className="cas-world">
                <div className="cas-floor" aria-hidden="true" />
                {MACHINES.map((m) => (
                    <div key={m.id} className={`cas-mach${m.live ? " is-live" : ""}${at?.id === m.id ? " is-near" : ""}`}
                        style={{ left: `${m.x}%` }}>
                        <span className="cas-mach-body">
                            <i className="cas-mach-screen" />
                        </span>
                        <b>{m.label}</b>
                        <em>{m.live ? m.kind : "soon"}</em>
                    </div>
                ))}

                {/* Everybody else, really here. Drawn behind you so your own hero is never hidden by a crowd. */}
                {(st?.others || []).map((o) => (
                    <div key={o.id} className="cas-other" style={{ left: `${o.x}%` }} title={o.name}>
                        {o.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.sprite} alt="" draggable="false" style={{ transform: `scaleX(${o.facing})` }} />
                        ) : <span className="cas-blank" />}
                        <b>{o.name}</b>
                    </div>
                ))}

                <div className="cas-you" style={{ left: `${x}%` }}>
                    <span className="cas-blank is-you" style={{ transform: `scaleX(${facing})` }} />
                </div>
              </div>
            </div>

            <div className="cas-walk">
                <button type="button" onClick={() => walk(-1)} aria-label="Walk left">◀</button>
                <span>{at ? at.label : "walk to a machine"}</span>
                <button type="button" onClick={() => walk(1)} aria-label="Walk right">▶</button>
            </div>

            {/* ── THE MACHINE YOU ARE AT ──────────────────────────────────────────────────────────────────
                Only rendered when you are standing at one, so the room is the screen and the game is
                something you walk up to rather than a panel that is always there. */}
            {at ? (
                <div className={`cas-panel${at.live ? "" : " is-dark"}`}>
                    <div className="cas-panel-head">
                        <b>{at.label}</b>
                        <em>{at.live ? at.kind : "not built yet"}</em>
                    </div>

                    {at.live ? (
                        <>
                            <div className={`cas-reels${flash ? ` is-${flash}` : ""}`}>
                                {(rolling || spin?.reels || ["moon", "bone", "doubloon"]).map((sym, i) => {
                                    // A reel is SPINNING until its own stop lands. Each one is independent,
                                    // which is what lets the third hang while the first two already match.
                                    const stopped = !rolling && landed > i;
                                    return (
                                        <span key={i}
                                            className={`cas-reel${rolling ? " is-spin" : ""}${stopped ? " is-stop" : ""}`}
                                            style={{ "--tone": SYMBOL_ART[sym]?.tone || "#cbd3dc", "--i": i }}>
                                            {SYMBOL_ART[sym]?.glyph || "?"}
                                        </span>
                                    );
                                })}
                                {/* The celebration sits OVER the reels rather than beside them, so the win
                                    happens where you were already looking. */}
                                {flash ? (
                                    <span className={`cas-pop is-${flash}`} aria-hidden="true">
                                        {flash === "big" ? "JACKPOT" : "WIN"}
                                    </span>
                                ) : null}
                            </div>
                            {spin ? (
                                <p className={`cas-result${spin.won > 0 ? " is-win" : ""}`}>
                                    {spin.won > 0
                                        ? `${money(spin.won)} gold — ${spin.mult}x`
                                        : "Nothing. Again?"}
                                </p>
                            ) : <p className="cas-result">Pick a stake and pull.</p>}

                            <div className="cas-bets">
                                {[25, 100, 500, 2500].map((v) => (
                                    <button key={v} type="button"
                                        className={`cas-bet${bet === v ? " is-on" : ""}`}
                                        onClick={() => setBet(v)}>{money(v)}</button>
                                ))}
                            </div>
                            <button type="button" className="cas-pull" disabled={!canPlay} onClick={pull}>
                                {busy ? "…" : (st?.gold || 0) < bet ? "Not enough gold" : `Pull · ${money(bet)}`}
                            </button>
                            {err ? <p className="cas-err">{err}</p> : null}
                        </>
                    ) : (
                        <p className="cas-soon">The lights are on and nothing is inside yet.</p>
                    )}
                </div>
            ) : null}

        </section>
    );
}
