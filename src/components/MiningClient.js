"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE MINE (owner-gated) ───────────────────────────────────────────────────────────────────────────────────
// PROSPECT to surface a random seam, then swing at it on the same timing bar as the Forge anvil and the
// Treasure Golem. There is no walking: steering a hero across a cave to reach a rock was motion without
// meaning, and every tap it cost came out of the part that's actually a game — the timing.
//
// Ore smelts into forge parts, and the smelt is shown as a SEQUENCE rather than a toast, because "my ore
// became something the Forge wants" is the payoff the whole feature is built on.

const SWEEP_MS = 900;
const GRADE_CD = { pixel: 700, perfect: 850, great: 1050, good: 1300, miss: 1600 };
const CD_DEFAULT = 1600;

const money = (n) => Number(n || 0).toLocaleString();
const PART_NAME = { 1: "Cinder Scrap", 2: "Iron Filings", 3: "Tempered Steel", 4: "Mythril Dust", 5: "Emberheart Shard" };

let _ac = null;
const ac = () => { if (typeof window === "undefined") return null; try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); return _ac; } catch { return null; } };
function clink(strength = 1) {
    const a = ac(); if (!a) return;
    try {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square"; o.frequency.setValueAtTime(220 + 520 * strength, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(90, a.currentTime + 0.16);
        g.gain.setValueAtTime(0.09 * strength + 0.03, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.2);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.22);
    } catch { /* audio is a bonus */ }
}

const Img = ({ src, alt = "", className, fallback }) => {
    const [bad, setBad] = useState(false);
    if (bad || !src) return <span className={className} aria-hidden="true">{fallback}</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt={alt} draggable="false" onError={() => setBad(true)} />;
};

export default function MiningClient({ initial }) {
    const [state, setState] = useState(initial);
    const [msg, setMsg] = useState(null);
    const [crack, setCrack] = useState(null);
    const [smelting, setSmelting] = useState(null); // { stage, ore, parts, partTier, oreArt }
    const [busy, setBusy] = useState(false);
    const [floats, setFloats] = useState([]);
    const [shake, setShake] = useState(0);
    const floatId = useRef(0);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/mining", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? await r.json().catch(() => null) : null;
    }, []);
    const say = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2400); };

    const prospect = async () => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "prospect" });
        setBusy(false);
        if (r?.unlocked) { setState(r); setCrack(null); }
        else say(r?.error === "no_seams" ? "No seams exposed right now — try again shortly." : "Couldn't find a seam.");
    };

    const onSwing = useCallback(async (d) => {
        const r = await post({ action: "swing", nodeId: state.node?.id, dist: d });
        if (!r?.ok) {
            if (r?.error === "out_of_swings") say("You're out of swings for today.");
            else if (r?.error === "node_gone") { say("That seam collapsed — find another."); prospect(); }
            else if (r?.error !== "too_fast") say("That swing didn't land.");
            return r;
        }
        clink(r.grade === "pixel" ? 1 : r.grade === "perfect" ? 0.8 : r.grade === "great" ? 0.6 : 0.35);
        setShake((n) => n + 1);
        const id = (floatId.current += 1);
        setFloats((f) => [...f.slice(-5), { id, dmg: r.damage, grade: r.grade }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
        setState((s) => ({
            ...s,
            swings: { ...s.swings, left: r.swingsLeft, used: (s.swings?.allowance ?? 0) - r.swingsLeft },
            node: s.node ? { ...s.node, hp: r.hp, pct: r.pct } : null,
        }));
        if (r.cracked) {
            setCrack(r.cracked);
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
            const fresh = await fetch("/api/marketplace/mining", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
            if (fresh?.unlocked) setState((s) => ({ ...fresh, node: s.node ? { ...s.node, hp: 0, pct: 0 } : null }));
        }
        return r;
    }, [post, state.node?.id]);

    // SMELTING, shown as a sequence: ore into the furnace → the burn → the parts that came out. It's the whole
    // reason to mine, and it was previously a toast you could miss entirely.
    const smelt = async (tier) => {
        const stack = (state.ore || []).find((o) => o.tier === tier);
        if (!stack?.canSmelt || smelting) return;
        setSmelting({ stage: "load", oreArt: stack.art, oreName: stack.name, color: stack.color, partTier: stack.partTier, parts: stack.canSmelt, ore: stack.canSmelt * stack.smeltCost });
        const r = await post({ action: "smelt", tier, batches: stack.canSmelt });
        setTimeout(() => setSmelting((v) => (v ? { ...v, stage: "burn" } : v)), 450);
        setTimeout(() => {
            if (r?.unlocked) {
                setState(r);
                setSmelting((v) => (v ? { ...v, stage: "done" } : v));
                try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
            } else { setSmelting(null); say(r?.error === "not_enough_ore" ? "Not enough ore." : "Couldn't smelt that."); }
        }, 1500);
    };

    const upgrade = async (track) => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "upgrade", track });
        setBusy(false);
        if (r?.unlocked) setState(r);
        else say(r?.error === "not_enough_gold" ? "Not enough gold." : r?.error === "maxed" ? "Already at max." : "Couldn't upgrade.");
    };

    const s = state;
    const node = s.node;
    const swingsLeft = s.swings?.left ?? 0;
    const lvls = s.stats?.upgradeLevels ?? 0;

    return (
        <section className="card mine-wrap">
            <div className="mine-top">
                <span className="mine-title">⛏️ The Mine</span>
                <span className="mine-sub">owner preview · {swingsLeft}/{s.swings?.allowance ?? 0} swings today</span>
            </div>

            {/* ── THE SEAM ── the whole screen is the rock you're working. */}
            <div className={`mine-face${node ? "" : " is-empty"}`} key={node?.id || "none"}>
                <div className="mine-face-bg" aria-hidden="true" />
                {node ? (
                    <>
                        <div className="mine-rock" style={{ "--ore": node.color, animation: shake ? "mineHit .18s ease" : undefined }} key={shake}>
                            <Img src={node.art} className="mine-rock-img" fallback="⬢" />
                        </div>
                        <div className="mine-seam-head">
                            <b style={{ color: node.color }}>{node.name}</b>
                            <span className="muted">smelts to {PART_NAME[node.partTier]}</span>
                        </div>
                        <div className="mine-hpbar"><span style={{ width: `${node.pct}%`, background: node.color }} /></div>
                        <div className="mine-hpnum">{node.pct}% left{node.mySwings ? ` · ${node.mySwings} swing${node.mySwings === 1 ? "" : "s"} in` : ""}</div>
                        {floats.map((f) => <span key={f.id} className={`mine-float is-${f.grade}`}>{f.dmg}</span>)}
                    </>
                ) : (
                    <div className="mine-empty">
                        <Img src={s.pick?.sprite} className="mine-empty-pick" fallback="⛏️" />
                        <p>Nothing on the rock face yet.</p>
                        <span className="muted">{s.seamsLive || 0} seam{(s.seamsLive || 0) === 1 ? "" : "s"} exposed in the mine right now.</span>
                    </div>
                )}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {/* THE LADDER — what this seam pays, shown BEFORE you swing. Straight from the Kitchen: the reward
                isn't a surprise, how well you dig is. */}
            {node && node.pct > 0 ? (
                <div className="mine-ladder">
                    <p className="mine-ladder-intro">
                        <b>How well you swing decides what comes out.</b> Your average timing across this seam picks the rung.
                        {node.quality != null ? <> Right now you&rsquo;re digging at <b>{node.quality}%</b>.</> : null}
                    </p>
                    {[...(node.ladder || [])].reverse().map((r) => (
                        <div key={r.rung} className={`mine-rung is-${r.key}${node.currentRung === r.rung ? " is-here" : ""}`}>
                            <span className="mine-rung-n">{r.rung}</span>
                            <span className="mine-rung-copy"><b>{r.label}</b><em>{r.blurb}</em></span>
                            <span className="mine-rung-pay">
                                <Img src={node.art} className="mine-rung-ore" fallback="⬢" />
                                <b>×{r.ore}</b>
                            </span>
                        </div>
                    ))}
                    <p className="mine-ladder-foot">Plus <b>{money(node.gold)}</b> gold and <b>{money(node.xp)}</b> XP on the crack, whatever the rung.</p>
                </div>
            ) : null}

            {node && node.pct > 0 && swingsLeft > 0
                ? <SwingBar node={node} onSwing={onSwing} pick={s.pick} />
                : (
                    <button type="button" className="mine-prospect" onClick={prospect} disabled={busy || swingsLeft <= 0}>
                        {swingsLeft <= 0 ? "No swings left today" : node ? "⛏️ Find another seam" : "⛏️ Find a seam"}
                    </button>
                )}
            {node && node.pct > 0 && swingsLeft > 0 ? (
                <button type="button" className="mine-prospect is-ghost" onClick={prospect} disabled={busy}>Look for a different seam</button>
            ) : null}

            {/* ── THE PICKAXE ── the upgrade ladder, with the tool you've actually earned front and centre. */}
            <div className="mine-panel">
                <div className="mine-pickhead">
                    <div className="mine-pickart"><Img src={s.pick?.sprite} className="mine-pickart-img" fallback="⛏️" /></div>
                    <div className="mine-pickbody">
                        <b>{s.pick?.name}</b>
                        {s.pick?.nextName
                            ? <em>{s.pick.nextName} at {s.pick.nextAt} upgrades · you have {lvls}</em>
                            : <em>Fully forged — every upgrade bought.</em>}
                        {s.pick?.nextAt ? (
                            <span className="mine-pickbar"><span style={{ width: `${Math.min(100, (lvls / s.pick.nextAt) * 100)}%` }} /></span>
                        ) : null}
                    </div>
                </div>
                {(s.tracks || []).map((t) => (
                    <div className="mine-track" key={t.key}>
                        <span className="mine-track-ico" aria-hidden="true">{t.icon}</span>
                        <span className="mine-track-body">
                            <b>{t.name}</b>
                            <em>{t.desc}</em>
                            <span className="mine-pips" aria-label={`level ${t.level} of ${t.max}`}>
                                {Array.from({ length: t.max }, (_, i) => <i key={i} className={i < t.level ? "on" : ""} />)}
                            </span>
                        </span>
                        <button type="button" className="mine-buy" disabled={busy || t.cost == null || (s.gold ?? 0) < t.cost} onClick={() => upgrade(t.key)}>
                            {t.cost == null ? "MAX" : `🪙 ${money(t.cost)}`}
                        </button>
                    </div>
                ))}
            </div>

            {/* ── THE STASH ── ore, and what it turns into. */}
            <div className="mine-panel">
                <div className="mine-panel-head">Ore in your pack <span className="muted">· smelts into forge parts</span></div>
                {(s.ore || []).length ? (
                    <div className="mine-stash-rows">
                        {s.ore.map((o) => (
                            <div className="mine-stash-row" key={o.tier}>
                                <Img src={o.art} className="mine-stash-img" fallback="⬢" />
                                <span className="mine-stash-name">
                                    <b style={{ color: o.color }}>{o.name}</b>
                                    <em>{o.smeltCost} ore → 1 {PART_NAME[o.partTier]}</em>
                                </span>
                                <b className="mine-stash-qty">×{o.qty}</b>
                                <button type="button" className="mine-smelt" disabled={!o.canSmelt || Boolean(smelting)} onClick={() => smelt(o.tier)}>
                                    🔥 Smelt {o.canSmelt || ""}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing yet — crack a seam and it lands here.</p>}
            </div>

            <p className="mine-hint">Find a seam, then time the marker to the middle — same bands as the anvil and the golem. Clean hits chain for more damage.</p>

            {/* Cracked-it reveal */}
            {crack ? (
                <div className="mine-modal" role="presentation" onClick={() => setCrack(null)}>
                    <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                        <Img src={crack.art} className="mine-modal-img" fallback="⬢" />
                        <h3 style={{ color: crack.color }}>{crack.name} cracked!</h3>
                        {crack.rungLabel ? (
                            <div className={`mine-rung-won is-${crack.rungKey}`}>
                                <b>{crack.rungLabel}</b>
                                <em>{crack.rungBlurb} · {crack.quality}% average over {crack.swings} swing{crack.swings === 1 ? "" : "s"}</em>
                            </div>
                        ) : null}
                        <div className="mine-modal-rows">
                            <span>Ore<b>+{crack.ore}</b></span>
                            <span>Gold<b>+{money(crack.gold)}</b></span>
                            <span>XP<b>+{money(crack.xp)}</b></span>
                        </div>
                        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Smelts into {PART_NAME[crack.partTier]}.</p>
                        <button type="button" className="mine-buy" style={{ marginTop: 12 }} onClick={() => { setCrack(null); prospect(); }}>Find another seam</button>
                    </div>
                </div>
            ) : null}

            {/* Smelting sequence */}
            {smelting ? (
                <div className="mine-modal" role="presentation" onClick={() => smelting.stage === "done" && setSmelting(null)}>
                    <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className={`mine-smelt-stage is-${smelting.stage}`}>
                            <Img src={smelting.oreArt} className="mine-smelt-ore" fallback="⬢" />
                            <Img src="/images/mining/furnace.png" className="mine-smelt-furnace" fallback="🔥" />
                            <span className="mine-smelt-glow" aria-hidden="true" />
                        </div>
                        {smelting.stage === "done" ? (
                            <>
                                <h3 style={{ color: "#ffd08a" }}>{smelting.parts} × {PART_NAME[smelting.partTier]}</h3>
                                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                                    {smelting.ore} {smelting.oreName} went in. The parts are waiting in the Forge.
                                </p>
                                <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={() => setSmelting(null)}>Back to the rock</button>
                            </>
                        ) : (
                            <h3 style={{ color: "#ffd08a" }}>{smelting.stage === "load" ? "Into the furnace…" : "Smelting…"}</h3>
                        )}
                    </div>
                </div>
            ) : null}

            <style jsx global>{`
                .mine-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
                .mine-title { font-size: 1.15rem; font-weight: 900; color: #ffe28a; }
                .mine-sub { font-size: 0.78rem; color: #9aa2ab; }

                .mine-face { position: relative; width: 100%; aspect-ratio: 3 / 2; border-radius: 16px; overflow: hidden;
                    border: 1px solid rgba(255,215,94,0.22); display: grid; place-items: center; }
                .mine-face-bg { position: absolute; inset: 0; background: #150f0a center/cover no-repeat url("/images/mining/cave-bg.png"); }
                .mine-face-bg::after { content: ""; position: absolute; inset: 0; background: radial-gradient(60% 55% at 50% 45%, transparent, rgba(0,0,0,0.62)); }
                .mine-rock { position: relative; width: 42%; max-width: 190px; aspect-ratio: 1; display: grid; place-items: center;
                    filter: drop-shadow(0 0 26px var(--ore)); }
                .mine-rock-img { width: 100%; height: 100%; object-fit: contain; }
                @keyframes mineHit { 0% { transform: none; } 40% { transform: translate(-3px, 2px) scale(0.97); } 100% { transform: none; } }
                .mine-seam-head { position: absolute; top: 10px; left: 0; right: 0; text-align: center; font-size: 0.92rem; text-shadow: 0 2px 6px #000; }
                .mine-seam-head .muted { display: block; font-size: 11px; }
                .mine-hpbar { position: absolute; left: 12%; right: 12%; bottom: 30px; height: 8px; border-radius: 999px; background: rgba(0,0,0,0.65); overflow: hidden; }
                .mine-hpbar > span { display: block; height: 100%; transition: width .2s ease; }
                .mine-hpnum { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-size: 11.5px; color: #cdd3d8; text-shadow: 0 2px 6px #000; }
                .mine-float { position: absolute; left: 50%; top: 38%; transform: translate(-50%,-50%); font-weight: 900; pointer-events: none;
                    animation: mineFloat .9s ease-out forwards; color: #ffe28a; text-shadow: 0 2px 8px #000; }
                .mine-float.is-pixel { color: #ffd75e; font-size: 1.7rem; } .mine-float.is-perfect { color: #8fe3ff; font-size: 1.45rem; }
                .mine-float.is-great { color: #8fe39a; font-size: 1.25rem; } .mine-float.is-miss { color: #9aa2ab; font-size: 1rem; }
                @keyframes mineFloat { to { transform: translate(-50%,-190%); opacity: 0; } }
                .mine-empty { position: relative; text-align: center; padding: 18px; }
                .mine-empty-pick { width: 88px; height: 88px; object-fit: contain; opacity: 0.9; }
                .mine-empty p { margin: 8px 0 2px; font-weight: 700; color: #e7dcc8; text-shadow: 0 2px 6px #000; }
                .mine-empty .muted { font-size: 12px; text-shadow: 0 2px 6px #000; }
                .mine-msg { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); background: rgba(0,0,0,0.78); color: #ffcf6a;
                    font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px; }

                .mine-prospect { width: 100%; margin-top: 12px; padding: 14px; border-radius: 13px; border: none; font-weight: 900; font-size: 1.06rem;
                    color: #2a1400; cursor: pointer; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
                .mine-prospect:disabled { filter: saturate(0.7) brightness(0.9); cursor: default; }
                .mine-prospect.is-ghost { margin-top: 8px; padding: 9px; font-size: 0.84rem; font-weight: 700; color: #cdb894;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); box-shadow: none; }

                .mine-panel { margin-top: 14px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-panel-head { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #ffd75e; margin-bottom: 9px; }
                .mine-pickhead { display: flex; align-items: center; gap: 12px; padding-bottom: 11px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); }
                .mine-pickart { width: 66px; height: 66px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 14px;
                    background: radial-gradient(circle at 50% 35%, rgba(255,215,94,0.20), rgba(255,215,94,0.04)); border: 1px solid rgba(255,215,94,0.28); }
                .mine-pickart-img { width: 82%; height: 82%; object-fit: contain; }
                .mine-pickbody { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
                .mine-pickbody b { font-size: 1.02rem; color: #ffe28a; }
                .mine-pickbody em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                .mine-pickbar { display: block; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.09); overflow: hidden; margin-top: 3px; }
                .mine-pickbar > span { display: block; height: 100%; background: linear-gradient(90deg, #ffb020, #ffe08a); }
                .mine-track { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,0.06); }
                .mine-track-ico { font-size: 22px; }
                .mine-track-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
                .mine-track-body em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                .mine-pips { display: flex; gap: 3px; margin-top: 3px; }
                .mine-pips i { width: 11px; height: 5px; border-radius: 2px; background: rgba(255,255,255,0.13); }
                .mine-pips i.on { background: linear-gradient(90deg, #ffb020, #ffe08a); }
                .mine-buy { padding: 8px 14px; border-radius: 10px; border: none; font-weight: 900; cursor: pointer; color: #2a1400;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 2px 0 #b47a12; }
                .mine-buy:disabled { filter: grayscale(0.7) brightness(0.8); cursor: default; }

                .mine-stash-rows { display: grid; gap: 7px; }
                .mine-stash-row { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; background: rgba(255,255,255,0.04); }
                .mine-stash-img { width: 34px; height: 34px; object-fit: contain; flex: 0 0 auto; }
                .mine-stash-name { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-stash-name em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-stash-qty { font-variant-numeric: tabular-nums; }
                .mine-smelt { padding: 7px 12px; border-radius: 9px; border: 1px solid rgba(255,120,32,0.55); background: rgba(255,120,32,0.16);
                    color: #ffcf9a; font-weight: 800; font-size: 12px; cursor: pointer; white-space: nowrap; }
                .mine-smelt:disabled { opacity: 0.32; cursor: default; }
                .mine-ladder { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-ladder-intro { margin: 0 0 10px; font-size: 12.5px; color: #cdd3d8; line-height: 1.5; }
                .mine-rung { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; margin-bottom: 6px;
                    background: rgba(255,255,255,0.04); border: 1px solid transparent; }
                .mine-rung.is-here { border-color: rgba(255,215,94,0.6); background: rgba(255,215,94,0.1); }
                .mine-rung-n { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
                    background: rgba(255,255,255,0.1); font-size: 11px; font-weight: 900; }
                .mine-rung.is-flawless .mine-rung-n { background: #ffd75e; color: #2a1400; }
                .mine-rung.is-clean .mine-rung-n { background: #8fe3ff; color: #10222a; }
                .mine-rung.is-solid .mine-rung-n { background: #8fe39a; color: #12261a; }
                .mine-rung-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-rung-copy b { font-size: 0.9rem; }
                .mine-rung-copy em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-rung-pay { display: flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
                .mine-rung-ore { width: 24px; height: 24px; object-fit: contain; }
                .mine-ladder-foot { margin: 8px 0 0; font-size: 11.5px; color: #9aa2ab; }
                .mine-rung-won { margin: 0 0 10px; padding: 8px; border-radius: 10px; background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.4); }
                .mine-rung-won b { display: block; color: #ffe28a; }
                .mine-rung-won em { font-size: 11px; font-style: normal; color: #cdb894; }
                .mine-hint { font-size: 12px; color: #9aa2ab; margin: 10px 0 0; }

                .mine-modal { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto;
                    background: rgba(6,4,10,0.82); padding: max(16px, env(safe-area-inset-top)) 18px max(16px, env(safe-area-inset-bottom)); }
                .mine-modal > * { margin: auto; }
                .mine-modal-card { width: 100%; max-width: 340px; text-align: center; padding: 22px; border-radius: 18px;
                    background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.5); }
                .mine-modal-img { width: 96px; height: 96px; object-fit: contain; }
                .mine-modal-card h3 { margin: 8px 0 10px; }
                .mine-modal-rows { display: flex; justify-content: center; gap: 16px; }
                .mine-modal-rows span { display: flex; flex-direction: column; font-size: 11px; color: #9aa2ab; }
                .mine-modal-rows b { font-size: 1.08rem; color: #ffe28a; }

                /* The smelt: ore slides into the furnace mouth, the furnace flares, the parts are announced. */
                .mine-smelt-stage { position: relative; height: 140px; display: grid; place-items: center; }
                .mine-smelt-furnace { width: 120px; height: 120px; object-fit: contain; }
                .mine-smelt-ore { position: absolute; width: 48px; height: 48px; object-fit: contain; left: 50%; top: 0;
                    transform: translate(-50%, 0); transition: transform .45s cubic-bezier(.4,0,.7,1), opacity .25s ease; }
                .mine-smelt-stage.is-burn .mine-smelt-ore, .mine-smelt-stage.is-done .mine-smelt-ore { transform: translate(-50%, 62px) scale(0.55); opacity: 0; }
                .mine-smelt-glow { position: absolute; width: 120px; height: 120px; border-radius: 50%; pointer-events: none; opacity: 0;
                    background: radial-gradient(circle, rgba(255,150,40,0.85), transparent 65%); transition: opacity .3s ease; }
                .mine-smelt-stage.is-burn .mine-smelt-glow { opacity: 1; animation: mineBurn .5s ease-in-out infinite alternate; }
                .mine-smelt-stage.is-done .mine-smelt-glow { opacity: 0.45; }
                @keyframes mineBurn { from { transform: scale(0.9); } to { transform: scale(1.15); } }
            `}</style>
        </section>
    );
}

// The timing bar. Judged locally the instant your finger lands, then reconciled against the server's grade.
function SwingBar({ node, onSwing, pick }) {
    const [marker, setMarker] = useState(0.5);
    const markerRef = useRef(0.5);
    const [cooling, setCooling] = useState(false);
    const [grade, setGrade] = useState(null);
    const [notice, setNotice] = useState(null);
    const cdRef = useRef(false), busyRef = useRef(false), cdUntil = useRef(0), cdMs = useRef(CD_DEFAULT), cdEl = useRef(null);

    useEffect(() => {
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const phase = ((t - t0) % (SWEEP_MS * 2)) / SWEEP_MS;
            const pos = phase <= 1 ? phase : 2 - phase;
            markerRef.current = pos; setMarker(pos);
            if (cdEl.current) cdEl.current.style.transform = `scaleX(${Math.max(0, cdUntil.current - Date.now()) / (cdMs.current || CD_DEFAULT)})`;
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    const swing = useCallback(async () => {
        if (cdRef.current || busyRef.current) return;
        busyRef.current = true; cdRef.current = true;
        const d = Math.abs(markerRef.current - 0.5);
        const key = d <= 0.022 ? "pixel" : d <= 0.055 ? "perfect" : d <= 0.10 ? "great" : d <= 0.16 ? "good" : "miss";
        const guess = GRADE_CD[key] ?? CD_DEFAULT;
        cdMs.current = guess; cdUntil.current = Date.now() + guess;
        let timer = setTimeout(() => { cdRef.current = false; setCooling(false); }, guess);
        setCooling(true);
        try {
            navigator.vibrate?.(key === "pixel" ? [30, 30, 30, 30, 60, 40, 110] : key === "perfect" ? [22, 34, 26, 34, 70]
                : key === "great" ? [16, 30, 40] : key === "good" ? [12, 26] : [8]);
        } catch { /* no haptics here */ }

        const r = await onSwing(d);
        busyRef.current = false;
        if (typeof r?.cooldownMs === "number" && r.cooldownMs !== guess) {
            clearTimeout(timer);
            const remain = Math.max(0, r.cooldownMs - (guess - Math.max(0, cdUntil.current - Date.now())));
            cdMs.current = r.cooldownMs; cdUntil.current = Date.now() + remain;
            timer = setTimeout(() => { cdRef.current = false; setCooling(false); }, remain);
        }
        if (r?.ok) {
            setGrade({ key: r.grade, label: r.gradeLabel, dmg: r.damage, combo: r.combo });
            setTimeout(() => setGrade(null), 1000);
        } else {
            clearTimeout(timer);
            cdRef.current = false; cdUntil.current = 0; setCooling(false);
            setNotice(r?.error === "too_fast" ? "Easy — let the bar refill" : r?.error === "out_of_swings" ? "Out of swings today" : "That swing didn't land");
            setTimeout(() => setNotice(null), 1400);
        }
    }, [onSwing]);

    return (
        <div className="mine-swing">
            <div className="mine-swing-bar" aria-hidden="true">
                <span className="mine-swing-zone" />
                <span className="mine-swing-marker" style={{ left: `${marker * 100}%` }} />
            </div>
            <button type="button" className="mine-swing-go" onPointerDown={(e) => { e.preventDefault(); swing(); }} disabled={cooling}>
                <span className="mine-swing-cd" ref={cdEl} aria-hidden="true" />
                <Img src={pick?.sprite} className="mine-swing-pick" fallback="⛏️" />
                <span>Swing</span>
            </button>
            {grade ? <div className={`mine-swing-grade is-${grade.key}`}>{grade.label} · {grade.dmg}{grade.combo >= 2 ? ` · ${grade.combo}× chain` : ""}</div> : null}
            {!grade && notice ? <div className="mine-swing-notice">{notice}</div> : null}

            <style jsx global>{`
                .mine-swing { margin-top: 12px; }
                .mine-swing-bar { position: relative; height: 28px; border-radius: 999px; background: linear-gradient(90deg, #2a2f3a, #3a4150, #2a2f3a); overflow: hidden; }
                .mine-swing-zone { position: absolute; left: 50%; top: 0; bottom: 0; width: 11%; transform: translateX(-50%);
                    background: linear-gradient(90deg, rgba(255,215,94,0.15), rgba(255,215,94,0.6), rgba(255,215,94,0.15)); }
                .mine-swing-marker { position: absolute; top: -3px; bottom: -3px; width: 4px; transform: translateX(-50%); border-radius: 2px;
                    background: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.9); }
                .mine-swing-go { position: relative; overflow: hidden; margin-top: 10px; width: 100%; padding: 12px; border-radius: 13px; border: none;
                    display: flex; align-items: center; justify-content: center; gap: 9px;
                    font-weight: 900; font-size: 1.1rem; color: #2a1400; cursor: pointer;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
                .mine-swing-go:disabled { filter: saturate(0.75) brightness(0.92); cursor: default; }
                .mine-swing-pick { width: 30px; height: 30px; object-fit: contain; }
                .mine-swing-cd { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; background: rgba(0,0,0,0.3); }
                .mine-swing-grade { text-align: center; margin-top: 8px; font-weight: 900; font-size: 0.95rem; }
                .mine-swing-grade.is-pixel { color: #ffd75e; } .mine-swing-grade.is-perfect { color: #8fe3ff; }
                .mine-swing-grade.is-great { color: #8fe39a; } .mine-swing-grade.is-good { color: #d7c48a; } .mine-swing-grade.is-miss { color: #ff8f9a; }
                .mine-swing-notice { text-align: center; margin-top: 8px; font-size: 0.82rem; font-weight: 700; color: #b9a98f; }
            `}</style>
        </div>
    );
}
