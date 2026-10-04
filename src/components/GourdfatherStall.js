"use client";

import { useCallback, useEffect, useState } from "react";

// ── THE GOURDFATHER'S STALL ──────────────────────────────────────────────────────────────────────────────
// What he sells for candy, and nothing else.
//
// ⚠️ TRICK-OR-TREAT USED TO BE A TAB IN HERE AND IT IS NOT ANY MORE. Luke: "Trick or treating is an immersive
// thing, nothing in a modal. You go door to door at each buikding." A list of eighteen buttons behind a panel
// is a chore list; walking the street and knocking on the actual doors is the ritual. It lives in the town
// scene now — see the door markers in TownClient — and this panel went back to being a shop.
//
// ⚠️ AND THERE IS NO SCROLLER INSIDE THIS ONE. `.tw-roster-panel` is already a 70dvh scroll box, so an
// `overflow-y: auto` on the stock list underneath it meant two nested scrollers sharing one thumb-drag: on a
// phone the inner one swallows the gesture, you reach its end, and the sheet beneath refuses to move. One
// panel, one scroll.
//
// ⚠️ AND THE DIALOGUE IS PASSED IN, NOT IMPORTED. gourdfather.js is `server-only` — it reads the database —
// so a client component that imported his lines would take the whole module with it and fail the build. The
// page hands them down as props, which also means his mouth and his prices can never disagree about whether
// the event is on.

// His shelves, in the order a member reads them: the thing you can afford today, then the thing you are
// saving for. The headings are not decoration — each group is a different KIND of purchase (a sealed gamble,
// a wearable set bought a piece at a time, a one-off pet, a thing for the farm) and they are priced on
// different scales, so a flat list of sixteen rows reads as sixteen unrelated numbers.
const SHELVES = [
    { kind: "chest", title: "Gift Boxes", note: "Sealed. He insists he does not know." },
    { kind: "item", title: "Harvest's End", note: "Five pieces. 2,500 candy for the set." },
    { kind: "pet", title: "His Friends", note: "One each — they do not come twice." },
    { kind: "deco", title: "For the Farm", note: "Standing decorations." },
];

export default function GourdfatherStall({ art, lines, onClose }) {
    const [stall, setStall] = useState(null);
    const [busy, setBusy] = useState(null);
    // His current line. An INDEX rather than the string, so a re-render does not reshuffle his mouth
    // mid-sentence — the same reason the wheel keeps its own rotation in a ref.
    const [say, setSay] = useState({ bank: "greet", n: Math.floor(Math.random() * 1000) });
    const [flash, setFlash] = useState(null);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/town", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? r.json().catch(() => null) : null;
    }, []);

    const load = useCallback(async () => {
        const s = await post({ action: "gourd_stall" });
        if (s?.ok) setStall(s);
    }, [post]);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await)
    useEffect(() => { load(); }, [load]);

    const speak = (bank) => setSay({ bank, n: Math.floor(Math.random() * 1000) });

    const buy = useCallback(async (id) => {
        if (busy) return;
        setBusy(id);
        const d = await post({ action: "gourd_buy", id });
        setBusy(null);
        if (d?.ok) {
            speak("buy");
            setFlash(`${d.granted?.name} — yours.`);
            load();
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        } else {
            speak(d?.error === "already_owned" ? "owned" : "broke");
            setFlash(null);
        }
        setTimeout(() => setFlash(null), 3500);
    }, [busy, post, load]);

    const bank = lines?.[say.bank] || lines?.greet || [];
    const line = bank.length ? bank[say.n % bank.length] : "";
    const candy = stall?.candy ?? 0;
    const stock = stall?.stock || [];

    return (
        <div className="tw-roster" onClick={onClose} role="presentation">
            <div className="tw-roster-panel gf-panel" onClick={(e) => e.stopPropagation()}>
                <div className="tw-roster-head gf-head">
                    {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="gf-face" src={art} alt="" draggable={false} />
                    ) : null}
                    <strong className="gf-name">The Gourdfather</strong>
                    <span className="gf-candy">{candy.toLocaleString()} candy</span>
                    <button type="button" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {/* His mouth. Always on screen, because he never stops. */}
                <p className="gf-say">{line}</p>

                {flash ? <div className="gf-flash">{flash}</div> : null}

                {stock.length === 0 ? <p className="gf-empty">He is still unpacking the cart…</p> : null}

                {SHELVES.map((shelf) => {
                    const rows = stock.filter((w) => w.kind === shelf.kind);
                    if (!rows.length) return null;
                    return (
                        <section key={shelf.kind} className="gf-shelf">
                            <h4 className="gf-shelf-head">{shelf.title}<i>{shelf.note}</i></h4>
                            <div className="gf-stock">
                                {rows.map((w) => {
                                    const afford = candy >= w.candy;
                                    return (
                                        <div key={w.id} className={`gf-ware r-${w.rarity || "rare"}${w.owned ? " is-owned" : ""}`}>
                                            {/* ⚠️ A PICTURE, NOT A GLYPH. Every one of these sixteen already had a
                                                sprite drawn for it in its own table and this shop was listing
                                                them as lines of text. */}
                                            <span className="gf-pic">
                                                {w.sprite ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={w.sprite} alt="" draggable={false} />
                                                ) : null}
                                            </span>
                                            <div className="gf-ware-body">
                                                <b>{w.name}</b>
                                                {w.slot ? <i className="gf-slot">{String(w.slot).replace("_", " ")}</i> : null}
                                                {w.blurb ? <span className="gf-blurb">{w.blurb}</span> : null}
                                            </div>
                                            <button
                                                type="button"
                                                className="gf-buy"
                                                disabled={w.owned || !afford || busy === w.id}
                                                onClick={() => buy(w.id)}
                                            >
                                                {/* The unit, under the number. A bare "2,200" on a button in a
                                                    game with gold, chips, doubloons and laurels in it is a
                                                    number in an unnamed currency. */}
                                                {w.owned ? "Yours" : busy === w.id ? "…" : (
                                                    <><b>{w.candy.toLocaleString()}</b><i>candy</i></>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
.gf-panel { max-width: 540px; }
.gf-head { gap: 8px; align-items: center; }
.gf-face { width: 42px; height: 42px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
.gf-name { flex: 1; min-width: 0; }
.gf-candy { font-weight: 900; font-size: 0.86rem; color: #ffcf6a; white-space: nowrap;
    background: rgba(255,170,60,0.14); border: 1px solid rgba(255,170,60,0.34); border-radius: 999px; padding: 3px 10px; }
/* His line sits in a bubble that is always the same height for one or two lines, so the panel does not jump
   every time he changes his mind. */
.gf-say { margin: -2px 2px 10px; padding: 9px 12px; border-radius: 12px; min-height: 2.9em; display: flex; align-items: center;
    background: linear-gradient(180deg, rgba(255,180,60,0.14), rgba(255,120,20,0.08));
    border: 1px solid rgba(255,170,60,0.3); color: #ffe6bd; font-style: italic; font-size: 0.9rem; line-height: 1.35; }
.gf-flash { margin: 0 2px 9px; padding: 9px 11px; border-radius: 10px; font-size: 0.85rem; line-height: 1.4;
    background: rgba(90,220,160,0.12); border: 1px solid rgba(90,220,160,0.32); color: #c9f5e2; }
.gf-empty { margin: 10px 2px; font-size: 0.86rem; color: #b6ab9a; font-style: italic; }
.gf-shelf { margin: 0 0 12px; }
.gf-shelf-head { display: flex; align-items: baseline; gap: 8px; margin: 0 2px 6px; font-size: 0.74rem;
    font-weight: 900; text-transform: uppercase; letter-spacing: .09em; color: #ffcf6a; }
.gf-shelf-head i { font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0;
    font-size: 0.72rem; color: #9b9080; }
/* ⚠️ NO max-height AND NO overflow HERE. The panel above is the scroller; a second one inside it eats the
   drag on a phone. See the note at the top of this file. */
.gf-stock { display: flex; flex-direction: column; gap: 7px; }
.gf-ware { display: flex; align-items: center; gap: 10px; padding: 8px 11px 8px 8px; border-radius: 11px;
    background: rgba(255,255,255,0.045); border: 1px solid var(--r, rgba(255,255,255,0.12)); }
.gf-ware.r-rare { --r: rgba(92,180,255,0.45); } .gf-ware.r-epic { --r: rgba(186,120,255,0.45); }
.gf-ware.r-legendary { --r: rgba(255,180,60,0.5); } .gf-ware.r-mythic { --r: rgba(92,224,192,0.5); }
.gf-ware.is-owned { opacity: 0.5; }
/* A fixed box whether the sprite loaded or not, so a missing picture leaves a gap rather than reflowing the
   row — the same reason the avatar tiles reserve their square. */
.gf-pic { flex: 0 0 auto; display: grid; place-items: center; width: 52px; height: 52px; border-radius: 9px;
    background: radial-gradient(circle at 50% 62%, rgba(255,170,60,0.14), rgba(0,0,0,0.22) 70%); }
.gf-pic img { max-width: 48px; max-height: 48px; object-fit: contain; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.55)); }
.gf-ware-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gf-ware-body b { font-size: 0.92rem; color: #fff; }
.gf-slot { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .06em; color: #9aa2ab; font-style: normal; }
.gf-blurb { font-size: 0.76rem; color: #b6ab9a; font-style: italic; line-height: 1.3; }
.gf-buy { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0;
    min-width: 62px; padding: 6px 11px; border-radius: 13px; font-weight: 900; font-size: 0.82rem; cursor: pointer;
    background: linear-gradient(180deg, #ffcf6a, #e89a1c); border: none; color: #2a1403; white-space: nowrap;
    font-variant-numeric: tabular-nums; line-height: 1.12; }
.gf-buy b { font-size: 0.92rem; }
.gf-buy i { font-style: normal; font-size: 8.5px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; opacity: 0.72; }
.gf-buy:disabled { background: rgba(255,255,255,0.08); color: #8b93a0; cursor: default; }
`;
