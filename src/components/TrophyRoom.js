"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE TROPHY ROOM ──────────────────────────────────────────────────────────────────────────────────────────
// A room hung with one object per subsystem. The object IS the readout: its plaque carries your best placing
// there, and a wall you have never touched hangs dark and unlabelled. Tapping one opens what you have built
// (upgrade levels) and what you have done (records, each with where you stand).
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
    const detailRef = useRef(null);

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

    const pick = useCallback((key) => {
        setOpen((k) => (k === key ? null : key));
    }, []);

    // On a phone the detail card opens below the fold, so bring it to the reader rather than making them hunt.
    useEffect(() => {
        if (!open || !detailRef.current) return;
        detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [open]);

    const shelf = room?.shelves?.find((s) => s.key === open) || null;

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

                .tr-detail { margin-top: 12px; border-radius: 14px; padding: 14px 14px 12px;
                    background: linear-gradient(180deg, rgba(58,38,22,0.55), rgba(30,20,12,0.55));
                    border: 1px solid rgba(255,205,120,0.22); }
                .tr-detail h4 { margin: 0 0 2px; font-size: 1rem; color: #ffe6b8; }
                .tr-detail .tr-blurb { margin: 0 0 12px; font-size: 0.84rem; color: #cbb79c; font-style: italic; }
                .tr-sub { margin: 14px 0 6px; font-size: 0.74rem; letter-spacing: 0.09em; text-transform: uppercase;
                    color: #c69a5c; font-weight: 700; }

                .tr-tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 7px; }
                .tr-tool { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center;
                    padding: 6px 9px; border-radius: 9px; background: rgba(0,0,0,0.22); }
                .tr-tool b { font-weight: 600; font-size: 0.82rem; color: #ecdcc4; }
                .tr-tool span { font-size: 0.78rem; font-variant-numeric: tabular-nums; color: #ffd98a; }
                .tr-tool.is-max span { color: #8ce39a; }
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
                .tr-pctbar { grid-column: 1 / -1; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; }
                .tr-pctbar i { display: block; height: 100%; background: linear-gradient(90deg, #8a6a3a, #ffd27a); }

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
                                    onClick={() => pick(s.key)}
                                    title={s.best ? `${s.name} — ${s.best.label}: ${ord(s.best.rank)} of ${s.best.of}` : s.name}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={s.art} alt={s.name} draggable={false} />
                                    <span className={`tr-plaque${first ? " is-gold" : ""}${cold ? " is-cold" : ""}`}>{plaque}</span>
                                </button>
                            );
                        })}
                    </div>

                    {shelf ? (
                        <div className="tr-detail" ref={detailRef}>
                            <h4>{shelf.name}</h4>
                            <p className="tr-blurb">{shelf.blurb}</p>

                            {shelf.tools.length ? (
                                <>
                                    <p className="tr-sub">What you&apos;ve built — {shelf.built} of {shelf.buildable}</p>
                                    <div className="tr-tools">
                                        {shelf.tools.map((t) => (
                                            <div key={t.name} className={`tr-tool${t.level >= t.max ? " is-max" : ""}`} title={t.desc || ""}>
                                                <b>{t.name}</b>
                                                <span>{t.level}/{t.max}</span>
                                                <div className="tr-bar"><i style={{ width: `${Math.round((t.level / Math.max(1, t.max)) * 100)}%` }} /></div>
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
                                                    // You have none of this, so everyone with any is ahead — which
                                                    // is both accurate and the more useful thing to be told.
                                                    <em className="tr-note">{r.of} ahead of you</em>
                                                ) : <em className="tr-note" />}
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
                    ) : (
                        <p className="tr-empty">Tap anything on the wall to see what it&apos;s worth.</p>
                    )}
                </>
            )}
        </section>
    );
}
