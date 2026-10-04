"use client";

import { useCallback, useEffect, useState } from "react";

// ── THE GOURDFATHER'S STALL ──────────────────────────────────────────────────────────────────────────────
// Two things behind one door: the wares he sells for candy, and the trick-or-treat round.
//
// ⚠️ THEY ARE TABS ON ONE PANEL RATHER THAN TWO BUTTONS IN THE STREET, and that is a phone decision. The
// plaza already carries ten buildings, five NPCs, the fountain and whatever the season has nailed to it; a
// nineteenth tappable thing out there is how a street stops being readable. He is the event's host, so the
// event lives behind him.
//
// ⚠️ AND THE DIALOGUE IS PASSED IN, NOT IMPORTED. gourdfather.js is `server-only` — it reads the database —
// so a client component that imported his lines would take the whole module with it and fail the build. The
// page hands them down as props, which also means his mouth and his prices can never disagree about whether
// the event is on.
export default function GourdfatherStall({ art, lines, onClose }) {
    const [tab, setTab] = useState("stall");
    const [stall, setStall] = useState(null);
    const [doors, setDoors] = useState(null);
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
        const [s, k] = await Promise.all([post({ action: "gourd_stall" }), post({ action: "knocked" })]);
        if (s?.ok) setStall(s);
        if (k?.ok) setDoors(k.doors || []);
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
            setStall((s) => (s ? { ...s, candy: d.candy } : s));
            load();
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        } else {
            speak(d?.error === "already_owned" ? "owned" : "broke");
            setFlash(null);
        }
        setTimeout(() => setFlash(null), 3500);
    }, [busy, post, load]);

    const knock = useCallback(async (door) => {
        if (busy) return;
        setBusy(door);
        const d = await post({ action: "knock", door });
        setBusy(null);
        if (d?.ok) {
            setDoors((x) => [...(x || []), door]);
            setFlash(`${d.trick ? "🙀 " : "🍬 "}${d.line}${d.candy ? `  (+${d.candy} candy${d.sweet ? `, ${d.sweet.name}` : ""}${d.chest ? ", and a chest!" : ""})` : ""}`);
            setStall((s) => (s ? { ...s, candy: (s.candy || 0) + (d.candy || 0) } : s));
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        }
        setTimeout(() => setFlash(null), 6000);
    }, [busy, post]);

    const bank = lines?.[say.bank] || lines?.greet || [];
    const line = bank.length ? bank[say.n % bank.length] : "";
    const knocked = new Set(doors || []);
    const allDoors = lines?.doors || [];
    const left = allDoors.filter((d) => !knocked.has(d.id)).length;

    return (
        <div className="tw-roster" onClick={onClose} role="presentation">
            <div className="tw-roster-panel gf-panel" onClick={(e) => e.stopPropagation()}>
                <div className="tw-roster-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={art} alt="" draggable={false} style={{ width: 40, height: 40, objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }} />
                    ) : null}
                    <strong style={{ flex: 1 }}>The Gourdfather</strong>
                    <span className="gf-candy">🍬 {(stall?.candy ?? 0).toLocaleString()}</span>
                    <button type="button" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {/* His mouth. Always on screen, because he never stops. */}
                <p className="gf-say">{line}</p>

                <div className="gf-tabs">
                    <button type="button" className={tab === "stall" ? "on" : ""} onClick={() => { setTab("stall"); speak("greet"); }}>The Stall</button>
                    <button type="button" className={tab === "treat" ? "on" : ""} onClick={() => setTab("treat")}>
                        Trick or Treat{left ? <span className="gf-pip">{left}</span> : null}
                    </button>
                </div>

                {flash ? <div className="gf-flash">{flash}</div> : null}

                {tab === "stall" ? (
                    <div className="gf-stock">
                        {(stall?.stock || []).map((w) => {
                            const afford = (stall?.candy || 0) >= w.candy;
                            return (
                                <div key={w.id} className={`gf-ware r-${w.rarity || "rare"}${w.owned ? " is-owned" : ""}`}>
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
                                        {w.owned ? "Yours" : busy === w.id ? "…" : <>🍬 {w.candy.toLocaleString()}</>}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="gf-doors">
                        <p className="gf-doors-note">
                            {left
                                ? <>Knock on every door in the plaza. <b>{left}</b> still have sweets tonight.</>
                                : <>Every door in the plaza has been knocked on tonight. Come back tomorrow.</>}
                        </p>
                        {allDoors.map((d) => {
                            const done = knocked.has(d.id);
                            return (
                                <button
                                    key={d.id}
                                    type="button"
                                    className={`gf-door${done ? " is-done" : ""}`}
                                    disabled={done || busy === d.id}
                                    onClick={() => knock(d.id)}
                                >
                                    <span>{d.label}</span>
                                    <i>{done ? "knocked" : busy === d.id ? "…" : "knock"}</i>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
.gf-panel { max-width: 520px; }
.gf-candy { font-weight: 900; font-size: 0.95rem; color: #ffcf6a; white-space: nowrap; }
/* His line sits in a bubble that is always the same height for one or two lines, so the panel does not jump
   every time he changes his mind. */
.gf-say { margin: -2px 2px 10px; padding: 9px 12px; border-radius: 12px; min-height: 2.9em; display: flex; align-items: center;
    background: linear-gradient(180deg, rgba(255,180,60,0.14), rgba(255,120,20,0.08));
    border: 1px solid rgba(255,170,60,0.3); color: #ffe6bd; font-style: italic; font-size: 0.9rem; line-height: 1.35; }
.gf-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.gf-tabs button { flex: 1; padding: 9px 10px; border-radius: 10px; font-weight: 800; font-size: 0.86rem; cursor: pointer;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: #e8dcc8; }
.gf-tabs button.on { background: linear-gradient(180deg, #ff9a2e, #d9600f); border-color: #ffbe6a; color: #2a1403; }
.gf-pip { display: inline-grid; place-items: center; min-width: 19px; height: 19px; margin-left: 6px; padding: 0 5px;
    border-radius: 999px; background: #2a1403; color: #ffcf6a; font-size: 11px; }
.gf-tabs button:not(.on) .gf-pip { background: #ff7a18; color: #2a1403; }
.gf-flash { margin: 0 2px 9px; padding: 9px 11px; border-radius: 10px; font-size: 0.85rem; line-height: 1.4;
    background: rgba(90,220,160,0.12); border: 1px solid rgba(90,220,160,0.32); color: #c9f5e2; }
.gf-stock, .gf-doors { display: flex; flex-direction: column; gap: 7px; max-height: 52vh; overflow-y: auto; }
.gf-ware { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 11px;
    background: rgba(255,255,255,0.045); border: 1px solid var(--r, rgba(255,255,255,0.12)); }
.gf-ware.r-rare { --r: rgba(92,180,255,0.45); } .gf-ware.r-epic { --r: rgba(186,120,255,0.45); }
.gf-ware.r-legendary { --r: rgba(255,180,60,0.5); } .gf-ware.r-mythic { --r: rgba(92,224,192,0.5); }
.gf-ware.is-owned { opacity: 0.5; }
.gf-ware-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gf-ware-body b { font-size: 0.92rem; color: #fff; }
.gf-slot { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .06em; color: #9aa2ab; font-style: normal; }
.gf-blurb { font-size: 0.76rem; color: #b6ab9a; font-style: italic; line-height: 1.3; }
.gf-buy { flex: 0 0 auto; padding: 8px 12px; border-radius: 999px; font-weight: 900; font-size: 0.82rem; cursor: pointer;
    background: linear-gradient(180deg, #ffcf6a, #e89a1c); border: none; color: #2a1403; white-space: nowrap; }
.gf-buy:disabled { background: rgba(255,255,255,0.08); color: #8b93a0; cursor: default; }
.gf-doors-note { margin: 0 2px 8px; font-size: 0.84rem; color: #c9bda9; }
.gf-door { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
    padding: 10px 12px; border-radius: 11px; cursor: pointer; font-size: 0.88rem; color: #f0e6d6;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,170,60,0.25); }
.gf-door i { font-style: normal; font-weight: 800; font-size: 0.76rem; text-transform: uppercase; letter-spacing: .06em; color: #ffcf6a; }
.gf-door.is-done { opacity: 0.45; border-color: rgba(255,255,255,0.1); cursor: default; }
.gf-door.is-done i { color: #8b93a0; }
`;
