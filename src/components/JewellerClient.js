"use client";

import { useState } from "react";
import * as Gi from "react-icons/gi";

import { MAX_SOCKETS } from "@/lib/marketplace/gems.js";

// ── THE JEWELCUTTER ──────────────────────────────────────────────────────────────────────────────────────────
// Two operations, and the screen is honest that it is only two: CUT a socket into a piece you intend to keep,
// then SET a gem into it. Everything else on here is there to make those two decisions legible — what a gem
// pays, what a socket costs on this particular piece, and what pulling one back out will cost you.
//
// Laid out gem-first rather than gear-first: you come here because something dropped, and the question in your
// head is "what do I put this in", not "which of my items has a hole".
const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCutDiamond;
    return <C className={className} aria-hidden="true" />;
};

const RARITY = { common: "#c9d1d9", rare: "#6bb8ff", epic: "#c98bff", legendary: "#ffb648", mythic: "#ff6b8a",
    ascendant: "#ff8ad8", eternal: "#ffce6b" };
const STAT = { might: "Might", ferocity: "Ferocity", fortune: "Fortune", crit_chance: "Crit chance", crit_power: "Crit power" };
const money = (n) => (Number(n) || 0).toLocaleString();
const describe = (stats) => Object.entries(stats || {}).map(([k, v]) => `+${v} ${STAT[k] || k}`).join(" · ");

export default function JewellerClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [picked, setPicked] = useState(null);       // the gem in your hand
    const [msg, setMsg] = useState(null);
    const [confirm, setConfirm] = useState(null);     // { itemId, idx } — pulling one back out

    async function act(body) {
        if (busy) return null;
        setBusy(true);
        setMsg(null);
        const r = await fetch("/api/marketplace/jeweller", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        setBusy(false);
        if (!r) { setMsg("That did not go through — try again."); return null; }
        if (r.unlocked) setSt(r);
        if (r.error) {
            setMsg(r.error === "not_enough_gold" ? `Not enough gold — that socket costs ${money(r.cost)}.`
                : r.error === "already_socketed" ? "That piece already has its socket."
                : r.error === "socket_full" ? "Something is already set in there."
                : r.error === "no_gem" ? "You do not hold that gem."
                : "That did not go through — try again.");
        }
        return r;
    }

    if (!st?.unlocked) return <section className="card"><p className="muted">The bench is closed.</p></section>;

    const gems = st.gems || [];
    const pieces = st.pieces || [];

    return (
        <div className="stack jw">
            <section className="card jw-head">
                <h1>The Jewelcutter</h1>
                <p className="muted">
                    A socket is the reason to keep a piece you already like. Cut one — once, permanently, for a
                    price that scales with what the piece is worth — then set a jewel into it.
                </p>
                <span className="jw-gold">{money(st.gold)} gold</span>
            </section>

            {msg ? <p className="jw-msg">{msg}</p> : null}

            {/* ── YOUR JEWELS ── the reason you are here, so they are the first thing on the screen. */}
            <section className="card">
                <div className="jw-sec-head"><b>Your jewels</b><em>{gems.length ? "Pick one, then choose where it goes" : null}</em></div>
                {gems.length ? (
                    <div className="jw-gems">
                        {gems.map((g) => (
                            <button key={g.id} type="button"
                                className={`jw-gem${picked === g.id ? " is-on" : ""}${g.secret ? " is-secret" : ""}`}
                                style={{ "--c": g.color }}
                                onClick={() => setPicked((cur) => (cur === g.id ? null : g.id))}>
                                <span className="jw-gem-face" aria-hidden="true"><Icon name="GiCutDiamond" /></span>
                                <b>{g.name}</b>
                                <em>{describe(g.stats)}</em>
                                {g.count > 1 ? <i className="jw-gem-n">×{g.count}</i> : null}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="muted">
                        None yet. They come out of the mine, and only out of the mine — the deeper you go, the
                        better the rock.
                    </p>
                )}
            </section>

            {/* ── YOUR GEAR ── sockets first, because a piece with a hole in it is the one you came to fill. */}
            <section className="card">
                <div className="jw-sec-head">
                    <b>Your gear</b>
                    <em>{MAX_SOCKETS === 1 ? "One socket per piece" : `Up to ${MAX_SOCKETS} sockets per piece`}</em>
                </div>
                <div className="jw-pieces">
                    {pieces.map((p) => {
                        const socket = p.sockets[0] || null;
                        const gem = socket?.gem || null;
                        return (
                            <div key={p.id} className="jw-piece" style={{ "--rar": RARITY[p.rarity] || "#c9d1d9" }}>
                                <span className="jw-piece-ico"><Icon name={p.icon} /></span>
                                <div className="jw-piece-body">
                                    <b>{p.name}</b>
                                    <em>{p.slot.replace(/_/g, " ")} · {p.rarity}</em>
                                    {gem ? <span className="jw-set" style={{ "--c": gem.color }}>{gem.name} — {describe(gem.stats)}</span> : null}
                                </div>
                                <div className="jw-piece-go">
                                    {!socket ? (
                                        <button type="button" className="jw-btn" disabled={busy || st.gold < p.cost}
                                            onClick={() => act({ action: "cut", itemId: p.id })}>
                                            Cut a socket<i>{money(p.cost)} gold</i>
                                        </button>
                                    ) : !gem ? (
                                        <button type="button" className="jw-btn is-set" disabled={busy || !picked}
                                            onClick={() => act({ action: "set", itemId: p.id, gemId: picked, idx: socket.idx })}>
                                            {picked ? "Set the jewel" : "Empty socket"}
                                            {picked ? null : <i>pick a jewel above</i>}
                                        </button>
                                    ) : confirm?.itemId === p.id ? (
                                        <div className="jw-confirm">
                                            {/* Said BEFORE the press, not after: pulling one out breaks it, and that is
                                                the whole reason setting one is a decision. */}
                                            <p>Prise it out? The <b>{gem.name}</b> shatters — you do not get it back.</p>
                                            <button type="button" className="jw-btn is-bad" disabled={busy}
                                                onClick={() => { setConfirm(null); act({ action: "pull", itemId: p.id, idx: socket.idx }); }}>
                                                Break it out
                                            </button>
                                            <button type="button" className="jw-btn is-quiet" onClick={() => setConfirm(null)}>Leave it</button>
                                        </div>
                                    ) : (
                                        <button type="button" className="jw-btn is-quiet" disabled={busy}
                                            onClick={() => setConfirm({ itemId: p.id, idx: socket.idx })}>
                                            Prise it out
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {!pieces.length ? <p className="muted">Nothing to work on yet — find some gear first.</p> : null}
                </div>
            </section>

            <style>{`
                .jw-head { position: relative; }
                .jw-head h1 { margin: 0 0 4px; font-size: 1.3rem; }
                .jw-gold { position: absolute; top: 14px; right: 14px; font-family: var(--font-display);
                    font-weight: 900; color: #ffd75e; font-size: 0.9rem; }
                .jw-msg { margin: 0; padding: 9px 12px; border-radius: 11px; font-size: 0.84rem; color: #ffd0a8;
                    background: rgba(255,150,60,0.12); border: 1px solid rgba(255,150,60,0.35); }
                .jw-sec-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; }
                .jw-sec-head b { font-family: var(--font-display); font-size: 1rem; color: #e8dcc6; }
                .jw-sec-head em { font-style: normal; font-size: 0.74rem; color: #8f98a3; margin-left: auto; }

                .jw-gems { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
                .jw-gem { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
                    padding: 10px; border-radius: 13px; cursor: pointer; text-align: left;
                    background: color-mix(in srgb, var(--c) 10%, rgba(255,255,255,0.03));
                    border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
                .jw-gem.is-on { box-shadow: 0 0 0 2px var(--c), 0 6px 20px color-mix(in srgb, var(--c) 40%, transparent); }
                .jw-gem-face svg { width: 26px; height: 26px; color: var(--c); }
                .jw-gem b { font-family: var(--font-display); font-size: 0.84rem; color: var(--c); }
                .jw-gem em { font-style: normal; font-size: 0.72rem; color: #cbd2da; }
                .jw-gem-n { position: absolute; top: 8px; right: 10px; font-style: normal; font-weight: 900;
                    font-size: 0.78rem; color: #e8dcc6; }
                /* The sixth one gets to look like it knows something. */
                .jw-gem.is-secret { background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(180,140,255,0.12)); }

                .jw-pieces { display: grid; gap: 8px; }
                .jw-piece { display: flex; align-items: center; gap: 11px; padding: 11px; border-radius: 13px;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid color-mix(in srgb, var(--rar) 34%, transparent); }
                .jw-piece-ico svg { width: 30px; height: 30px; color: var(--rar); flex: none; }
                .jw-piece-body { min-width: 0; flex: 1; }
                .jw-piece-body b { display: block; font-family: var(--font-display); font-size: 0.88rem; color: var(--rar); }
                .jw-piece-body em { display: block; font-style: normal; font-size: 0.72rem; text-transform: capitalize; color: #8f98a3; }
                .jw-set { display: block; margin-top: 3px; font-size: 0.76rem; font-weight: 700; color: var(--c); }
                .jw-piece-go { flex: none; }
                .jw-btn { display: block; padding: 9px 12px; border-radius: 11px; cursor: pointer;
                    font-family: var(--font-display); font-weight: 800; font-size: 0.8rem; color: #1a1206;
                    border: 1px solid rgba(255,225,140,0.6);
                    background: linear-gradient(180deg, #ffdf85, #e6c76b 46%, #c79a2c); }
                .jw-btn i { display: block; font-style: normal; font-size: 0.68rem; font-weight: 700; opacity: .75; }
                .jw-btn:disabled { cursor: default; filter: grayscale(0.7) brightness(0.66); }
                .jw-btn.is-quiet { color: #b9a892; background: none; border-color: rgba(255,255,255,0.16); }
                .jw-btn.is-bad { color: #2a0d10; border-color: rgba(255,160,170,0.7);
                    background: linear-gradient(180deg, #ff9aa6, #e0616f); }
                .jw-confirm { max-width: 210px; text-align: right; display: grid; gap: 6px; justify-items: end; }
                .jw-confirm p { margin: 0; font-size: 0.74rem; line-height: 1.4; color: #cbd2da; }
            `}</style>
        </div>
    );
}
