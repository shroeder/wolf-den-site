"use client";

// ── THE BRIG ─────────────────────────────────────────────────────────────────────────────────────────────────
// Four berths, the men in them, and the one question you are trying to get answered. The rules are in
// captains.js and the rows are in captains-store.js; nothing here decides anything, which is deliberate —
// the disposition is the answer to the puzzle and it is not in this payload until he breaks.
//
// Built for a phone first: a captain is a wide row you tap, and the interrogation is a full-height sheet
// rather than a modal you have to aim at.

import { useCallback, useEffect, useState } from "react";
import {
    GiCardRandom, GiTwoCoins, GiPrisoner, GiSandsOfTime,
    GiScrollUnfurled, GiCompass, GiBrokenSkull, GiCoinflip, GiOpenGate,
} from "react-icons/gi";

const TACTIC_ICON = { bluff: GiCardRandom, offer: GiTwoCoins, confront: GiPrisoner, wait: GiSandsOfTime };
const TACTICS = [
    { id: "bluff", name: "Bluff", blurb: "Tell him you already have it, and that his own crew is why." },
    { id: "offer", name: "Offer", blurb: "Name a number. The rest is haggling." },
    { id: "confront", name: "Confront", blurb: "Walk another captive in and let him hear it.", needsOther: true },
    { id: "wait", name: "Wait", blurb: "Say nothing. Leave him with the dark." },
];

const Stars = ({ n }) => (
    <span className="bg-stars" aria-label={`${n} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "is-on" : ""} />)}
    </span>
);

const art = (id) => `/images/fleet/crew/${id}.png`;

export default function Brig() {
    const [brig, setBrig] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [say, setSay] = useState(null);        // the last thing he did, shown over the sheet
    const [err, setErr] = useState("");

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/sailing/brig", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setBrig(d);
    }, []);
    useEffect(() => { load(); }, [load]);

    const act = useCallback(async (body) => {
        setBusy(true); setErr("");
        const r = await fetch("/api/marketplace/sailing/brig", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (!d || d.error) { setErr(errorText(d?.error)); return null; }
        if (d.brig) setBrig(d.brig);
        return d;
    }, []);

    const ask = useCallback(async (captive, tactic) => {
        const d = await act({ action: "ask", id: captive.id, tactic });
        if (!d) return;
        setSay({ outcome: d.outcome, said: d.said, broke: d.broke, spent: d.spent, name: captive.name, broke_text: d.captive?.broke });
        // A man who is finished is no longer a man you have open.
        if (d.broke || d.spent) setOpenId(d.broke ? null : captive.id);
    }, [act]);

    if (!brig) return <p className="bg-wait">Opening the brig…</p>;

    const open = (brig.captives || []).find((c) => c.id === openId) || null;

    return (
        <section className="bg">
            <header className="bg-top">
                <GiPrisoner aria-hidden="true" />
                <b>The Brig</b>
                <span className="bg-berths">{brig.captives.length} of {brig.berths}</span>
            </header>

            {err ? <p className="bg-err" role="alert">{err}</p> : null}

            {/* ── STILL ON DECK ── he is not yours until he is paid for, and he will not wait all day. */}
            {(brig.offers || []).length ? (
                <div className="bg-deck">
                    <p className="bg-head">On your deck</p>
                    {brig.offers.map((o) => (
                        <div key={o.id} className="bg-offer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={art(o.art)} alt="" className="bg-face" draggable="false" />
                            <span className="bg-who">
                                <b>{o.name}</b>
                                <i>{o.ship}</i>
                                <Stars n={o.stars} />
                            </span>
                            <button type="button" className="bg-btn is-go" disabled={busy || brig.room <= 0}
                                onClick={() => act({ action: "take", id: o.id })}>
                                {brig.room <= 0 ? "No berth" : <>Take him <em>{o.cost.toLocaleString()}</em></>}
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* ── THE BERTHS ── */}
            <div className="bg-cells">
                {Array.from({ length: brig.berths }, (_, i) => {
                    const c = brig.captives[i];
                    if (!c) return <div key={`empty${i}`} className="bg-cell is-empty"><span>Empty berth</span></div>;
                    return (
                        <button key={c.id} type="button" className={`bg-cell${c.status === "spent" ? " is-spent" : ""}`}
                            onClick={() => { setSay(null); setOpenId(c.id); }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={art(c.art)} alt="" className="bg-face" draggable="false" />
                            <span className="bg-who">
                                <b>{c.name}</b>
                                <i>{c.ship}</i>
                                <Stars n={c.stars} />
                            </span>
                            <span className="bg-gauge">
                                <span className="bg-will" aria-label={`${c.will} left in him`}>
                                    {Array.from({ length: c.will }, (_, k) => <i key={k} />)}
                                </span>
                                <em>{c.status === "spent" ? "Out of nerve" : `${c.nerve} nerve`}</em>
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── WHAT THEY HAVE GIVEN UP ── */}
            <div className="bg-conf">
                <p className="bg-head"><GiScrollUnfurled aria-hidden="true" /> Confessions</p>
                <div className="bg-conf-row">
                    {Array.from({ length: brig.piecesNeeded }, (_, i) => {
                        const c = brig.confessions[i];
                        return (
                            <span key={i} className={`bg-piece${c ? " is-had" : ""}`}>
                                {c ? <><b>{c.name}</b><Stars n={c.stars} /></> : <i>—</i>}
                            </span>
                        );
                    })}
                </div>
                <button type="button" className="bg-btn is-go" disabled={busy || brig.confessions.length < brig.piecesNeeded}
                    onClick={() => act({ action: "chart" })}>
                    {brig.confessions.length < brig.piecesNeeded
                        ? `${brig.piecesNeeded - brig.confessions.length} more to make a chart`
                        : "Put them together"}
                </button>
                {brig.confessions.length > brig.piecesNeeded ? (
                    <p className="bg-note">{brig.confessions.length - brig.piecesNeeded} more waiting for the next one.</p>
                ) : null}
            </div>

            {/* ── CHARTS YOU CAN SAIL ── */}
            {(brig.charts || []).length ? (
                <div className="bg-charts">
                    <p className="bg-head"><GiCompass aria-hidden="true" /> Charts</p>
                    {brig.charts.map((ch) => (
                        <div key={ch.id} className="bg-chart">
                            <b>{bandName(ch.band)}</b>
                            <em>{ch.grade} of 15</em>
                            <span>Set sail from the harbour to spend it.</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* ── THE INTERROGATION ── a sheet, not a dialog: on a phone this IS the screen. */}
            {open ? (
                <div className="bg-sheet-over" role="presentation" onClick={() => setOpenId(null)}>
                    <div className="bg-sheet" role="dialog" aria-label={open.name} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="bg-x" onClick={() => setOpenId(null)} aria-label="Close">✕</button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={art(open.art)} alt="" className="bg-sheet-face" draggable="false" />
                        <p className="bg-sheet-name">{open.name}</p>
                        <p className="bg-sheet-ship">{open.ship} · <Stars n={open.stars} /></p>

                        {/* THE TELL. The one thing that lets a player who reads people skip the probing. */}
                        <p className="bg-tell">{open.tell}</p>

                        <div className="bg-bars">
                            <span><i>Left in him</i><b>{open.will}</b></span>
                            <span><i>Your nerve</i><b>{open.nerve}</b></span>
                        </div>

                        {say ? (
                            <p className={`bg-said is-${say.outcome}`} role="status">
                                {say.said}
                                {say.broke ? <em>He breaks. {say.broke_text}</em> : null}
                                {say.spent ? <em>You have nothing left to try on him.</em> : null}
                            </p>
                        ) : null}

                        {(open.tried || []).length ? (
                            <div className="bg-hist">
                                {open.tried.map((t, i) => (
                                    <span key={i} className={`bg-h is-${t.outcome}`}>{t.tactic}</span>
                                ))}
                            </div>
                        ) : null}

                        {open.status === "spent" ? (
                            <div className="bg-done">
                                <p>His nerve outlasted yours. He will buy himself back, or you can put him off at the next port.</p>
                                <button type="button" className="bg-btn is-go" disabled={busy}
                                    onClick={() => { act({ action: "ransom", id: open.id }); setOpenId(null); }}>
                                    <GiCoinflip aria-hidden="true" /> Ransom him <em>{open.ransom.toLocaleString()}</em>
                                </button>
                                <button type="button" className="bg-btn" disabled={busy}
                                    onClick={() => { act({ action: "release", id: open.id }); setOpenId(null); }}>
                                    <GiOpenGate aria-hidden="true" /> Let him go
                                </button>
                            </div>
                        ) : (
                            <div className="bg-tactics">
                                {TACTICS.map((t) => {
                                    const Icon = TACTIC_ICON[t.id];
                                    const locked = t.needsOther && !brig.canConfront;
                                    return (
                                        <button key={t.id} type="button" className="bg-tactic" disabled={busy || locked}
                                            onClick={() => ask(open, t.id)}>
                                            <Icon aria-hidden="true" />
                                            <b>{t.name}</b>
                                            <i>{locked ? "You are holding nobody else." : t.blurb}</i>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            <style jsx>{`
                .bg { display: block; }
                .bg-wait { padding: 24px; text-align: center; color: #8d97a6; }
                .bg-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
                    font-size: 17px; font-weight: 800; color: #e8edf5; }
                .bg-top :global(svg) { width: 22px; height: 22px; color: #c8a86a; }
                .bg-berths { margin-left: auto; font-size: 12.5px; font-weight: 700; color: #8d97a6; }
                .bg-err { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px;
                    background: #3a1c20; color: #ffc9cf; font-size: 13px; }
                .bg-head { display: flex; align-items: center; gap: 6px; margin: 16px 0 8px;
                    font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #8d97a6; }
                .bg-head :global(svg) { width: 15px; height: 15px; }
                .bg-note { margin: 6px 0 0; font-size: 12px; color: #8d97a6; }

                .bg-face { width: 46px; height: 46px; object-fit: contain; flex: 0 0 auto; }
                .bg-who { display: flex; flex-direction: column; gap: 1px; min-width: 0; text-align: left; }
                .bg-who b { font-size: 14px; font-weight: 800; color: #e8edf5;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .bg-who i { font-size: 11.5px; font-style: normal; color: #8d97a6;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

                .bg-stars { display: inline-flex; gap: 2px; }
                .bg-stars i { width: 7px; height: 7px; border-radius: 50%; background: #333b48; }
                .bg-stars i.is-on { background: #e8b64c; box-shadow: 0 0 5px rgba(232,182,76,.5); }

                .bg-offer { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 6px;
                    border: 1px solid #55452a; border-radius: 10px; background: #241f16; }
                .bg-offer .bg-btn { margin-left: auto; }

                .bg-cells { display: grid; grid-template-columns: 1fr; gap: 6px; }
                .bg-cell { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px;
                    border: 1px solid #2b3240; border-radius: 10px; background: #171b23;
                    font: inherit; color: #e8edf5; cursor: pointer; text-align: left; }
                .bg-cell.is-empty { justify-content: center; border-style: dashed; color: #5c6675;
                    font-size: 12.5px; cursor: default; padding: 14px 10px; }
                .bg-cell.is-spent { opacity: .72; border-color: #4a3030; }
                .bg-gauge { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
                .bg-will { display: flex; gap: 3px; }
                .bg-will i { width: 6px; height: 14px; border-radius: 2px; background: #c05b5b; }
                .bg-gauge em { font-size: 11px; font-style: normal; color: #8d97a6; }

                .bg-conf-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
                .bg-piece { display: flex; flex-direction: column; align-items: center; justify-content: center;
                    gap: 4px; min-height: 54px; padding: 6px 4px; border: 1px dashed #333b48;
                    border-radius: 9px; background: #14181f; }
                .bg-piece.is-had { border-style: solid; border-color: #4a5f45; background: #18211a; }
                .bg-piece b { font-size: 11.5px; font-weight: 700; color: #cfe0cd; text-align: center;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
                .bg-piece i { color: #48505c; font-style: normal; }

                .bg-chart { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
                    padding: 9px 11px; margin-bottom: 6px; border: 1px solid #3d5568;
                    border-radius: 10px; background: #16202a; }
                .bg-chart b { font-size: 14px; color: #9fd0ff; }
                .bg-chart em { font-size: 12px; font-style: normal; color: #8d97a6; }
                .bg-chart span { flex-basis: 100%; font-size: 12px; color: #8d97a6; }

                /* The site's global link colouring reaches buttons, so every one of these states its own. */
                .bg-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px;
                    border: 1px solid #3a4353; border-radius: 9px; background: #1e242e;
                    font: inherit; font-size: 13px; font-weight: 700; color: #dfe6f0; cursor: pointer; }
                .bg-btn.is-go { border-color: #5c6f45; background: #23301d; color: #d6ecc9; }
                .bg-btn:disabled { opacity: .5; cursor: default; }
                .bg-btn em { font-style: normal; color: #e8b64c; }
                .bg-btn :global(svg) { width: 16px; height: 16px; }

                .bg-sheet-over { position: fixed; inset: 0; z-index: 4200; display: flex;
                    align-items: flex-end; justify-content: center;
                    background: rgba(4,7,12,.72); backdrop-filter: blur(2px); }
                .bg-sheet { position: relative; width: min(520px, 100%); max-height: 92vh; overflow-y: auto;
                    padding: 18px 16px 22px; border-radius: 16px 16px 0 0;
                    border-top: 1px solid #38414f; background: #10141b;
                    animation: bgUp .22s ease both; }
                @keyframes bgUp { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
                .bg-x { position: absolute; top: 10px; right: 12px; width: 32px; height: 32px;
                    border: 0; background: none; font-size: 17px; color: #8d97a6; cursor: pointer; }
                .bg-sheet-face { display: block; width: 96px; height: 96px; margin: 0 auto 4px; object-fit: contain; }
                .bg-sheet-name { margin: 0; text-align: center; font-size: 19px; font-weight: 800; color: #e8edf5; }
                .bg-sheet-ship { margin: 2px 0 12px; text-align: center; font-size: 12.5px; color: #8d97a6; }
                .bg-tell { margin: 0 0 12px; padding: 10px 12px; border-left: 3px solid #7a6a3f;
                    border-radius: 0 8px 8px 0; background: #1b1a14;
                    font-size: 13.5px; line-height: 1.5; color: #d8cfae; font-style: italic; }
                .bg-bars { display: flex; gap: 10px; margin-bottom: 12px; }
                .bg-bars span { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px;
                    border-radius: 9px; background: #171b23; }
                .bg-bars i { font-size: 11px; font-style: normal; color: #8d97a6; }
                .bg-bars b { font-size: 18px; font-weight: 800; color: #e8edf5; }

                .bg-said { margin: 0 0 12px; padding: 11px 13px; border-radius: 10px;
                    background: #171b23; font-size: 13.5px; line-height: 1.55; color: #cfd6e0; }
                .bg-said.is-crack { background: #17251a; color: #cfe6c6; }
                .bg-said.is-harden { background: #251a1a; color: #eec9c4; }
                .bg-said em { display: block; margin-top: 7px; font-style: normal; font-weight: 700; color: #ffd98f; }

                .bg-hist { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
                .bg-h { padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 700;
                    text-transform: capitalize; background: #232a35; color: #9aa4b2; }
                .bg-h.is-crack { background: #24371f; color: #b9dcae; }
                .bg-h.is-harden { background: #3a2222; color: #e5b3ad; }

                .bg-tactics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
                .bg-tactic { display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
                    padding: 11px 12px; border: 1px solid #333b48; border-radius: 11px;
                    background: #171b23; font: inherit; color: #e8edf5; cursor: pointer; text-align: left; }
                .bg-tactic:disabled { opacity: .42; cursor: default; }
                .bg-tactic :global(svg) { width: 21px; height: 21px; color: #c8a86a; }
                .bg-tactic b { font-size: 14px; font-weight: 800; }
                .bg-tactic i { font-size: 11.5px; font-style: normal; line-height: 1.35; color: #8d97a6; }

                .bg-done p { margin: 0 0 10px; font-size: 13.5px; line-height: 1.5; color: #cfd6e0; }
                .bg-done .bg-btn { width: 100%; justify-content: center; margin-bottom: 6px; }

                @media (min-width: 620px) {
                    .bg-cells { grid-template-columns: 1fr 1fr; }
                    .bg-sheet { align-self: center; border-radius: 16px; border: 1px solid #38414f; }
                    .bg-sheet-over { align-items: center; }
                }
            `}</style>
        </section>
    );
}

const BANDS = { sounding: "A Sounding", bearing: "A Bearing", reckoning: "A Reckoning", certainty: "A Certainty" };
const bandName = (id) => BANDS[id] || "A Chart";

function errorText(code) {
    switch (code) {
        case "brig_full": return "Every berth is full. Break one of them, or put one off at the next port.";
        case "not_enough_doubloons": return "Not enough doubloons to keep him.";
        case "needs_other": return "You are holding nobody else to walk in.";
        case "no_offer": case "gone": return "He is gone — that one waited as long as he was going to.";
        case "spent": return "You have nothing left to try on him.";
        case "not_enough": return "Not enough confessions yet.";
        default: return "That did not go through.";
    }
}
