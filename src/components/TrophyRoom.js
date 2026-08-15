"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── THE TROPHY ROOM ──────────────────────────────────────────────────────────────────────────────────────────
// A room hung with one object per subsystem. The object IS the readout: its plaque carries your best placing
// there, and a wall you have never touched hangs dark and unlabelled. Tapping one opens a modal: what the
// system actually is, where to go and do it, what you have built there (upgrade levels) and what you have done
// (records, each with where you stand).
//
// WHY A MODAL AND NOT THE CARD IT WAS. The detail opened inline underneath the room, which put a 400px card
// below the fold on a phone and left the wall — the thing you were reading it against — scrolled off the top.
// It also could not say much: anything longer made the scroll worse. A sheet takes the screen, so it can carry
// the explanation, and closing it puts you back on the wall exactly where you were.
//
// It is PORTALLED TO <body>. The room lives inside FarmClient, whose scenes carry transforms — a `position:
// fixed` overlay inside a transformed ancestor is positioned against that ancestor instead of the viewport and
// lands off-screen. Same reason <InspectableGear> portals its inspect sheet.
//
// NOTE ON <style jsx>: it lives as a DIRECT CHILD of the root <section>. Nested inside a child, styled-jsx
// stamps its hash class only on the subtree containing the tag, and the root renders unstyled — which cost
// three rounds of wrong diagnoses on the petting stand. If you move this tag, check the ROOT element's class
// list for the jsx-<hash>, not whether the CSS made it into the bundle.

// Where each object hangs — the CENTRE of the piece, as a percentage of the room's fixed 3:2 plate, so the
// arrangement holds identically from a 320px phone to a wide desktop. Three tiers of 4 / 4 / 3, with a little
// vertical jitter: a perfect grid reads as a spreadsheet, and this is meant to be somebody's front room.
// Tiers sit at 20 / 44 / 68 percent: the painted wall runs from about 8% to 72% before it meets the stone
// course, and a piece is ~23% of the plate tall, so the bottom row rests ON the stone ledge rather than
// floating over the rug. Columns stay inside 16-84% — outside that are the hearth and the candle sconce.
const WALL = {
    arena: { left: 16, top: 20 }, ships: { left: 39, top: 17 }, sailing: { left: 61, top: 20 }, digging: { left: 84, top: 17 },
    mining: { left: 16, top: 45 }, delves: { left: 39, top: 42 }, fishing: { left: 61, top: 45 }, kitchen: { left: 84, top: 42 },
    forge: { left: 27, top: 68 }, farm: { left: 50, top: 70 }, den: { left: 73, top: 68 },
};

const ord = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const fmtVal = (r) => (r.kind === "pct" ? `${(r.value * 100).toFixed(1)}%` : Math.round(r.value).toLocaleString());

// `initial` is the arena-lab idiom: hand the component a server-built payload and it renders without fetching,
// so the visual rig can drive it at both screen sizes without a session.
export default function TrophyRoom({ active, initial = null }) {
    const [room, setRoom] = useState(initial);
    const [err, setErr] = useState(null);
    const [open, setOpen] = useState(null);
    const cardRef = useRef(null);
    // Which button opened the sheet, so closing hands focus back to the piece on the wall rather than dumping
    // it at the top of the document.
    const openerRef = useRef(null);

    // Fetched when the tab is opened — assembling the room reads every member's rows across ten tables, and
    // that has no business running each time somebody looks at their pigs. FarmClient unmounts this component
    // when you leave the tab, so opening it again refetches; at ~250ms that is the right trade.
    //
    // THERE WAS A `loaded` REF GUARD HERE AND IT WAS THE BUG. It could not prevent a refetch — the component is
    // unmounted between visits, so the ref is new every time — but under StrictMode's double-invoke it did
    // real damage: pass one set the flag and its cleanup set `dead`, so its response was discarded; pass two
    // saw the flag and returned without fetching. Nothing ever resolved and the room sat on "Unlocking the
    // trophy room…" forever. The `dead` flag alone is the whole correct pattern.
    useEffect(() => {
        // A server-supplied payload is the whole point of `initial`; fetching over it would defeat the rig.
        if (!active || initial) return undefined;
        let dead = false;
        (async () => {
            try {
                const res = await fetch("/api/marketplace/farm/trophies", { cache: "no-store" });
                const d = await res.json();
                if (dead) return;
                if (d?.error) setErr(d.error); else setRoom(d);
            } catch {
                if (!dead) setErr("offline");
            }
        })();
        return () => { dead = true; };
    }, [active, initial]);

    const pick = useCallback((key, ev) => {
        openerRef.current = ev?.currentTarget || null;
        setOpen((k) => (k === key ? null : key));
    }, []);

    const close = useCallback(() => {
        setOpen(null);
        // The wall button is still mounted behind the sheet, so this is a straight hand-back.
        openerRef.current?.focus?.();
    }, []);

    // ESCAPE CLOSES IT, AND THE PAGE BEHIND IT HOLDS STILL. Without the overflow lock, a phone scrolls the farm
    // underneath the sheet while you drag inside it, and closing leaves you somewhere you never navigated to.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, close]);

    // Focus the sheet itself when it opens, so Escape lands and a screen reader is put inside the dialog rather
    // than left on the wall behind it.
    useEffect(() => {
        if (open && cardRef.current) cardRef.current.focus();
    }, [open]);

    const shelves = room?.shelves || [];
    const at = shelves.findIndex((s) => s.key === open);
    const shelf = at >= 0 ? shelves[at] : null;
    // The room is a ring: off the end of the last wall is the first one. Walking it is how you read the whole
    // room without closing and re-aiming at an 80px target eleven times.
    const prevShelf = shelf ? shelves[(at - 1 + shelves.length) % shelves.length] : null;
    const nextShelf = shelf ? shelves[(at + 1) % shelves.length] : null;

    return (
        <section className="trophy">
            <style jsx>{`
                .trophy { margin-top: 10px; }
                .tr-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 0 2px 8px; }
                .tr-head h3 { margin: 0; font-size: 1.05rem; letter-spacing: 0.01em; }
                .tr-head em { font-style: normal; color: var(--muted, #9aa4b2); font-size: 0.82rem; }

                /* The plate. 3:2 on anything roomy, so the hung positions hold across desktop widths. */
                .tr-room { position: relative; width: 100%; aspect-ratio: 3 / 2; border-radius: 16px; overflow: hidden;
                    background: #2a1c12; box-shadow: inset 0 -40px 70px rgba(0,0,0,0.45), 0 2px 14px rgba(0,0,0,0.3); }
                /* ON A PHONE THE PLATE GOES SQUARE. At 375px the 3:2 plate is only 234px tall; three rows of a
                   54px piece plus its plaque need ~220px of box, so the rows collided and every plaque hid
                   behind the piece below it. Squaring the plate buys 117px of wall and nothing else changes —
                   the positions are percentages, and the backdrop is a wide bare wall that crops happily. */
                @media (max-width: 620px) {
                    .tr-room { aspect-ratio: 1 / 1; }
                }
                .tr-room > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
                .tr-room::after { content: ""; position: absolute; inset: 0; pointer-events: none;
                    background: radial-gradient(120% 90% at 50% 30%, rgba(255,190,110,0.16), transparent 60%); }

                /* One hung object. The button IS the frame — no nested interactive elements. */
                .tr-hook { position: absolute; transform: translate(-50%, -50%); display: grid; justify-items: center;
                    gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; z-index: 2;
                    width: clamp(52px, 15.5%, 108px); }
                .tr-hook img { width: 100%; aspect-ratio: 1; object-fit: contain;
                    filter: drop-shadow(0 3px 5px rgba(0,0,0,0.55)); transition: transform 140ms ease, filter 140ms ease; }
                .tr-hook:hover img, .tr-hook.is-open img { transform: translateY(-3px) scale(1.06);
                    filter: drop-shadow(0 6px 9px rgba(0,0,0,0.6)) brightness(1.08); }
                /* An untouched wall hangs dark. Nothing is hidden — it reads as "not yet", not as "missing". */
                .tr-hook.is-cold img { filter: grayscale(0.85) brightness(0.5) drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }

                /* The plaque under each object carries the live number, so the wall reads without opening anything. */
                .tr-plaque { font-size: clamp(9px, 2.5vw, 11px); line-height: 1.15; font-weight: 700; white-space: nowrap;
                    padding: 2px 6px; border-radius: 6px; color: #ffe9c2; background: rgba(26,15,8,0.82);
                    border: 1px solid rgba(255,205,120,0.35); text-shadow: 0 1px 2px rgba(0,0,0,0.7); }
                .tr-plaque.is-gold { color: #1d1206; background: linear-gradient(#ffdc7a, #e8ac3c); border-color: #ffe9a8; }
                .tr-plaque.is-cold { color: #9d8f80; background: rgba(20,13,8,0.7); border-color: rgba(255,255,255,0.08); }
                .tr-hook.is-open .tr-plaque { box-shadow: 0 0 0 2px rgba(255,214,130,0.55); }

                /* ── THE SHEET ──────────────────────────────────────────────────────────────────────────────
                   Bottom sheet on a phone, centred card on a wide screen — the same shape the inspect sheet
                   uses elsewhere, because this is the same gesture: tap a thing, read the thing, dismiss.
                   KEYFRAME NAMES ARE PREFIXED. styled-jsx does not scope @keyframes, so a second "fadeIn"
                   anywhere in the app silently wins and both animations play the wrong one. */
                @keyframes trmBackIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes trmCardIn { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }

                .trm-back { position: fixed; inset: 0; z-index: 10050; display: flex; justify-content: center;
                    align-items: center; padding: 16px; background: rgba(6,4,2,0.78);
                    backdrop-filter: blur(3px); animation: trmBackIn 180ms ease both; }
                .trm-card { position: relative; width: 100%; max-width: 560px; max-height: 88vh;
                    display: flex; flex-direction: column; border-radius: 18px; overflow: hidden; outline: none;
                    background: linear-gradient(180deg, #3b2716, #1d130a);
                    border: 1px solid rgba(255,205,120,0.34);
                    box-shadow: 0 26px 70px rgba(0,0,0,0.66), 0 0 40px rgba(255,180,90,0.08);
                    animation: trmCardIn 240ms cubic-bezier(.2,.9,.3,1.1) both; }
                @media (max-width: 620px) {
                    /* Flush to the bottom edge: on a phone the reachable half of the screen is the bottom half,
                       and 88vh of card floating in the middle wastes the only part you can comfortably touch. */
                    .trm-back { padding: 0; align-items: flex-end; }
                    .trm-card { max-width: none; max-height: 92vh; border-radius: 18px 18px 0 0;
                        border-bottom: 0; padding-bottom: env(safe-area-inset-bottom); }
                }

                .trm-x { position: absolute; top: 9px; right: 10px; z-index: 3; width: 32px; height: 32px;
                    border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); cursor: pointer;
                    background: rgba(0,0,0,0.45); color: #f0dcc0; font-size: 19px; line-height: 1; padding: 0; }
                .trm-x:hover { background: rgba(0,0,0,0.7); color: #fff; }

                /* Header — the piece itself, big, so the sheet is visibly the thing you just tapped. */
                .trm-top { display: flex; gap: 13px; align-items: center; padding: 15px 52px 13px 15px;
                    background: radial-gradient(120% 130% at 12% 0%, rgba(255,190,110,0.2), transparent 62%);
                    border-bottom: 1px solid rgba(255,205,120,0.16); }
                .trm-top img { width: 66px; height: 66px; object-fit: contain; flex: none;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.6)); }
                .trm-top.is-cold img { filter: grayscale(0.85) brightness(0.55) drop-shadow(0 4px 7px rgba(0,0,0,0.5)); }
                .trm-top h4 { margin: 0; font-size: 1.16rem; color: #ffe6b8; }
                .trm-top .tr-blurb { margin: 2px 0 0; font-size: 0.8rem; line-height: 1.35; color: #cbb79c; font-style: italic; }

                /* The one number the wall was bragging about, said in words. */
                .trm-best { display: inline-flex; align-items: baseline; gap: 6px; margin-top: 7px;
                    padding: 3px 10px; border-radius: 999px; font-size: 0.76rem; font-weight: 700;
                    color: #ffd98a; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,205,120,0.3); }
                .trm-best.is-first { color: #1d1206; background: linear-gradient(#ffdc7a, #e8ac3c); border-color: #ffe9a8; }
                .trm-best em { font-style: normal; font-weight: 600; opacity: 0.85; }
                .trm-best.is-none { color: #a99b86; border-color: rgba(255,255,255,0.12); font-weight: 600; }

                /* The body scrolls; the header and the walk-the-room footer do not. */
                .trm-body { overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 13px 15px 16px; }
                .trm-what { margin: 0; font-size: 0.875rem; line-height: 1.5; color: #ddcbb0; }
                .trm-field { margin: 9px 0 0; font-size: 0.775rem; line-height: 1.45; color: #a99b86; }
                .trm-field b { color: #ffd98a; font-weight: 700; }
                .trm-go { display: inline-block; margin-top: 12px; padding: 9px 16px; border-radius: 11px;
                    font-weight: 800; font-size: 0.88rem; text-decoration: none; color: #241604;
                    background: linear-gradient(180deg, #ffdc8f, #e5a63a); box-shadow: 0 3px 0 #96661b; }
                .trm-go:hover { filter: brightness(1.06); }

                .tr-sub { margin: 16px 0 6px; font-size: 0.74rem; letter-spacing: 0.09em; text-transform: uppercase;
                    color: #c69a5c; font-weight: 700; }

                /* Walk the room. The NEXT WALL'S NAME, not a bare chevron — you are choosing where to go, and
                   "‹" alone makes you open it to find out what it was. */
                .trm-nav { display: flex; gap: 8px; padding: 9px 12px; border-top: 1px solid rgba(255,205,120,0.16);
                    background: rgba(0,0,0,0.3); }
                .trm-nav button { flex: 1 1 0; min-width: 0; padding: 8px 10px; border-radius: 10px; cursor: pointer;
                    border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #d9c6ab;
                    font-size: 0.78rem; font-weight: 700; white-space: nowrap; overflow: hidden;
                    text-overflow: ellipsis; }
                .trm-nav button:hover { background: rgba(255,205,120,0.14); color: #ffe6b8; }
                .trm-nav .is-next { text-align: right; }

                /* Wider cells than the bare name+level version needed: each card now carries a sentence, and at
                   148px a description wrapped to five ragged lines. */
                .tr-tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 7px; }
                .tr-tool { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center;
                    align-content: start; padding: 8px 10px; border-radius: 9px; background: rgba(0,0,0,0.22); }
                .tr-tool b { font-weight: 600; font-size: 0.82rem; color: #ecdcc4; }
                .tr-tool span { font-size: 0.78rem; font-variant-numeric: tabular-nums; color: #ffd98a; }
                .tr-tool.is-max span { color: #8ce39a; }
                /* The explainer line. Same class under a tool and under a record, because they answer the same
                   question — "what is this?" — and two different treatments would read as two different kinds
                   of thing. Sits full width under the row so a long sentence never squeezes the number. */
                .tr-what { grid-column: 1 / -1; font-style: normal; font-size: 0.755rem; line-height: 1.35;
                    color: #a99b86; margin-top: 3px; }
                /* What the level is worth RIGHT NOW — the live number, next to the axis it moves. */
                .tr-now { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
                    font-style: normal; font-size: 0.74rem; margin-top: 2px; }
                .tr-now span { color: #8d7f6c; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.68rem; }
                .tr-now b { color: #ffd98a; font-weight: 700; font-variant-numeric: tabular-nums; }
                .tr-tool.is-max .tr-now b { color: #8ce39a; }

                .tr-bar { grid-column: 1 / -1; height: 4px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
                .tr-bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #d99a3c, #ffd27a); }
                .tr-tool.is-max .tr-bar i { background: linear-gradient(90deg, #4fae63, #8ce39a); }

                .tr-recs { display: grid; gap: 5px; }
                .tr-rec { display: grid; grid-template-columns: 1fr auto auto; gap: 3px 10px; align-items: baseline;
                    padding: 7px 9px; border-radius: 9px; background: rgba(0,0,0,0.22); }
                .tr-rec > b { font-weight: 600; font-size: 0.84rem; color: #ecdcc4; }
                .tr-rec > span { font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #fff2d8; }
                .tr-place { font-size: 0.76rem; font-weight: 700; color: #c8a56a; white-space: nowrap; }
                .tr-place.is-top { color: #ffd27a; }
                .tr-place.is-first { color: #1d1206; background: linear-gradient(#ffdc7a, #e8ac3c);
                    padding: 1px 7px; border-radius: 999px; }
                .tr-note { font-size: 0.72rem; color: #90806e; white-space: nowrap; }
                /* Sits clear of the row above it — flush against the label it read as a strikethrough. */
                .tr-pctbar { grid-column: 1 / -1; margin-top: 6px; height: 3px; border-radius: 2px;
                    background: rgba(255,255,255,0.08); overflow: hidden; }
                .tr-pctbar i { display: block; height: 100%; background: linear-gradient(90deg, #8a6a3a, #ffd27a); }

                .tr-legend { margin: 9px 2px 0; font-size: 0.775rem; line-height: 1.4; color: #a99b86; }
                .tr-legend b { color: #ffd98a; font-weight: 700; }
                .tr-empty { margin: 10px 0 2px; font-size: 0.86rem; color: #c0ad95; }
                .tr-loading, .tr-err { padding: 26px 12px; text-align: center; color: var(--muted, #9aa4b2); font-size: 0.88rem; }
            `}</style>

            <div className="tr-head">
                <h3>Trophy Room</h3>
                {room ? (
                    <em>
                        Level {room.level}{room.rank ? ` · ${room.rank}` : ""} · {room.touched} of {room.total} walls
                        {" "}· measured against {room.memberCount} members
                    </em>
                ) : null}
            </div>

            {err ? (
                <p className="tr-err">Couldn&apos;t open the trophy room just now. Try again in a moment.</p>
            ) : !room ? (
                <p className="tr-loading">Unlocking the trophy room…</p>
            ) : (
                <>
                    <div className="tr-room">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/trophy/room-bg.webp" alt="" draggable={false} />
                        {room.shelves.map((s) => {
                            const pos = WALL[s.key] || { left: 50, top: 50 };
                            const cold = !s.touched;
                            const first = s.best?.rank === 1;
                            // The plaque says the best thing true about this wall: a placing if you have one,
                            // otherwise how much of it you have built, otherwise nothing at all.
                            const plaque = s.best ? `#${s.best.rank}` : s.built ? `${s.built}/${s.buildable}` : "—";
                            return (
                                <button
                                    key={s.key} type="button"
                                    className={`tr-hook${open === s.key ? " is-open" : ""}${cold ? " is-cold" : ""}`}
                                    style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                                    onClick={(e) => pick(s.key, e)}
                                    aria-haspopup="dialog"
                                    title={s.best ? `${s.name} — ${s.best.label}: ${ord(s.best.rank)} of ${s.best.of}` : s.name}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={s.art} alt={s.name} draggable={false} />
                                    <span className={`tr-plaque${first ? " is-gold" : ""}${cold ? " is-cold" : ""}`}>{plaque}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* SAY WHAT THE PLAQUE MEANS. A bare "#6" hanging under a helmet is only obvious to whoever
                        wrote it; on the wall it could as easily be a level, a count or a tier. The legend stays
                        up whether or not something is open — it explains the room, it is not a prompt. */}
                    <p className="tr-legend">
                        {/* Explicit {" "} after the bold: the space written after </b> is swallowed because the
                            text node runs on to the next line, and it shipped as "#1is the best in the Den." */}
                        Each plaque is your best <b>placing</b> on that wall — <b>#1</b>{" "}
                        is the best in the Den. A dark piece is something you haven&apos;t started.
                        Tap one for everything it counts.
                    </p>

                    {/* No `mounted` guard is needed: `open` can only be set by a click, so a server render
                        never reaches createPortal and there is no hydration mismatch to avoid. */}
                    {shelf ? createPortal((
                        <div
                            className="trm-back" role="dialog" aria-modal="true" aria-label={shelf.name}
                            onClick={close}
                        >
                            <div
                                className="trm-card" ref={cardRef} tabIndex={-1}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button type="button" className="trm-x" onClick={close} aria-label="Close">×</button>

                                <div className={`trm-top${shelf.touched ? "" : " is-cold"}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={shelf.art} alt="" draggable={false} />
                                    <div>
                                        <h4>{shelf.name}</h4>
                                        <p className="tr-blurb">{shelf.blurb}</p>
                                        {/* THE PLAQUE, IN WORDS. On the wall it is "#6" and you have to already
                                            know what it counts; here it says which record earned it. */}
                                        {shelf.best ? (
                                            <span className={`trm-best${shelf.best.rank === 1 ? " is-first" : ""}`}>
                                                {ord(shelf.best.rank)} of {shelf.best.of}
                                                {" "}<em>in {shelf.best.label.toLowerCase()}</em>
                                            </span>
                                        ) : (
                                            <span className="trm-best is-none">
                                                {shelf.touched ? "No placing here yet" : "You haven't started this one"}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="trm-body">
                                    {/* WHAT THE THING IS. The blurb above is the object talking; this is the
                                        system explained to somebody who has never opened it. */}
                                    {shelf.what ? <p className="trm-what">{shelf.what}</p> : null}

                                    {/* WHO YOU ARE BEING MEASURED AGAINST. "6th of 27" reads as a small field
                                        until you know the room only counts people who have actually played it.
                                        THE SECOND SENTENCE ONLY HOLDS IF THERE ARE PLACINGS BELOW. On a wall
                                        you have never touched there are none, and promising them under an
                                        empty card is how a screen loses the reader's trust. */}
                                    <p className="trm-field">
                                        {shelf.players === 0 ? (
                                            "Nobody in the Den has played this yet — the wall is waiting."
                                        ) : shelf.touched ? (
                                            <>
                                                <b>{shelf.players}</b> of {room.memberCount} members have played this.
                                                {" "}Every placing below is out of them — not out of everybody.
                                            </>
                                        ) : (
                                            <>
                                                <b>{shelf.players}</b> of {room.memberCount} members have played this.
                                                {" "}You haven&apos;t yet, so nothing of yours hangs here.
                                            </>
                                        )}
                                    </p>

                                    {shelf.href ? (
                                        <a className="trm-go" href={shelf.href}>{shelf.cta}</a>
                                    ) : null}

                                    {shelf.tools.length ? (
                                        <>
                                            <p className="tr-sub">What you&apos;ve built — {shelf.built} of {shelf.buildable}</p>
                                            <div className="tr-tools">
                                                {shelf.tools.map((t) => (
                                                    <div key={t.name} className={`tr-tool${t.level >= t.max ? " is-max" : ""}`}>
                                                        <b>{t.name}</b>
                                                        <span>{t.level}/{t.max}</span>
                                                        <div className="tr-bar"><i style={{ width: `${Math.round((t.level / Math.max(1, t.max)) * 100)}%` }} /></div>
                                                        {/* What it is, then what you have actually bought. A title
                                                            tooltip was useless here — this screen is read on a
                                                            phone, where nothing hovers. */}
                                                        {t.desc ? <em className="tr-what">{t.desc}</em> : null}
                                                        {t.now || t.effect ? (
                                                            <em className="tr-now">
                                                                {t.effect ? <span>{t.effect}</span> : null}
                                                                {t.now ? <b>{t.now}</b> : null}
                                                            </em>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : null}

                                    {shelf.records.length ? (
                                        <>
                                            <p className="tr-sub">What you&apos;ve done</p>
                                            <div className="tr-recs">
                                                {shelf.records.map((r) => (
                                                    <div key={r.label} className="tr-rec">
                                                        <b>{r.label}</b>
                                                        <span>{fmtVal(r)}</span>
                                                        {r.rank ? (
                                                            <em className={`tr-place${r.rank === 1 ? " is-first" : r.pct >= 75 ? " is-top" : ""}`}>
                                                                {ord(r.rank)} of {r.of}
                                                            </em>
                                                        ) : r.note ? (
                                                            <em className="tr-note">{r.note}</em>
                                                        ) : r.of ? (
                                                            // You have none of this, so everyone with any is ahead —
                                                            // which is both accurate and the more useful thing to
                                                            // be told.
                                                            <em className="tr-note">{r.of} ahead of you</em>
                                                        ) : <em className="tr-note" />}
                                                        {r.hint ? <em className="tr-what">{r.hint}</em> : null}
                                                        {r.pct != null ? (
                                                            <div className="tr-pctbar"><i style={{ width: `${r.pct}%` }} /></div>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <p className="tr-empty">Nothing on this wall yet — play some and it fills in.</p>
                                    )}
                                </div>

                                {/* WALK THE ROOM. Eleven pieces at 80px on a phone is eleven careful taps and ten
                                    dismissals to read the wall; this reads it in ten. */}
                                <div className="trm-nav">
                                    <button type="button" onClick={() => setOpen(prevShelf.key)}>
                                        ‹ {prevShelf.name}
                                    </button>
                                    <button type="button" className="is-next" onClick={() => setOpen(nextShelf.key)}>
                                        {nextShelf.name} ›
                                    </button>
                                </div>
                            </div>
                        </div>
                    ), document.body) : null}
                </>
            )}
        </section>
    );
}
