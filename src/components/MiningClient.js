"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE MINE (owner-gated, phase 1) ──────────────────────────────────────────────────────────────────────────
// A cave you walk your hero around. Tap a seam to open the timing bar and swing at it; chip its HP to zero and
// the ore is yours. The bar's bands are identical to the Forge anvil and the Treasure Golem — a member who has
// learned one has learned all three, which is the point.

const SWEEP_MS = 900;               // marker sweep, a touch quicker than the golem
const GRADE_CD = { pixel: 700, perfect: 850, great: 1050, good: 1300, miss: 1600 };
const CD_DEFAULT = 1600;
// Pure double-tap guard. MUST stay under the fastest grade cooldown above, or it silently eats swings the bar
// says are ready — the exact bug the raid shipped with a 2500ms floor against a 1000ms re-arm.
const MIN_GAP_MS = 500;
const REACH = 14;                   // how close (in scene %) you must stand to swing at a seam

const money = (n) => Number(n || 0).toLocaleString();

// tiny synth kit — no assets, CSP-safe (same approach as the wheel + minigame)
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

export default function MiningClient({ initial }) {
    const [state, setState] = useState(initial);
    const [target, setTarget] = useState(null);   // node id we're swinging at
    const [msg, setMsg] = useState(null);
    const [crack, setCrack] = useState(null);     // the "you cracked it" reveal
    const [floats, setFloats] = useState([]);
    const floatId = useRef(0);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/mining", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? await r.json().catch(() => null) : null;
    }, []);

    const reload = useCallback(async () => {
        const r = await fetch("/api/marketplace/mining", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d?.unlocked) setState(d);
    }, []);
    // Seams expire and respawn on a timer, so the cave refreshes itself while you stand in it.
    useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t); }, [reload]);

    const say = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2200); };

    // ── MOVEMENT ── tap the floor to walk there. Position is optimistic locally and posted behind, so walking
    // never waits on the network (the mine is a place, not a form).
    const you = state.you || { x: 50, y: 78, facing: 1 };
    const sceneRef = useRef(null);
    const moveTo = useCallback((x, y) => {
        const facing = x < (state.you?.x ?? 50) ? -1 : 1;
        setState((s) => ({ ...s, you: { x, y, facing } }));
        post({ action: "move", x, y, facing });
    }, [post, state.you?.x]);

    const onSceneTap = (e) => {
        const el = sceneRef.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        moveTo(Math.max(8, Math.min(92, x)), Math.max(62, Math.min(88, y)));
    };

    const dist = (n) => Math.hypot((n.x - you.x), (n.y - you.y) * 1.6);
    const inReach = (n) => dist(n) <= REACH;

    const tapNode = (n) => {
        if (!inReach(n)) { moveTo(n.x, Math.min(88, n.y + 6)); say("Walking over…"); return; }
        if ((state.swings?.left ?? 0) <= 0) { say("You're out of swings for today."); return; }
        setTarget(n.id);
    };

    const onSwing = useCallback(async (d) => {
        const r = await post({ action: "swing", nodeId: target, dist: d });
        if (!r?.ok) {
            if (r?.error === "out_of_swings") { say("You're out of swings for today."); setTarget(null); reload(); }
            else if (r?.error === "node_gone") { say("That seam is gone."); setTarget(null); reload(); }
            else if (r?.error !== "too_fast") say("That swing didn't land.");
            return r;
        }
        clink(r.grade === "pixel" ? 1 : r.grade === "perfect" ? 0.8 : r.grade === "great" ? 0.6 : 0.35);
        const id = (floatId.current += 1);
        setFloats((f) => [...f.slice(-5), { id, dmg: r.damage, grade: r.grade }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 850);
        setState((s) => ({
            ...s,
            swings: { ...s.swings, left: r.swingsLeft, used: (s.swings?.allowance ?? 0) - r.swingsLeft },
            nodes: (s.nodes || []).map((n) => (n.id === r.nodeId ? { ...n, hp: r.hp, pct: r.pct } : n)),
        }));
        if (r.cracked) {
            setCrack(r.cracked);
            setTarget(null);
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
            setTimeout(reload, 400);
        }
        return r;
    }, [post, target, reload]);

    // Smelt the whole stack at once — nobody wants to tap three-at-a-time through 40 ore.
    const smelt = async (tier) => {
        const stack = (state.ore || []).find((o) => o.tier === tier);
        if (!stack?.canSmelt) return;
        const r = await post({ action: "smelt", tier, batches: stack.canSmelt });
        if (r?.unlocked) {
            setState(r);
            say(`Smelted into ${r.smelted?.parts ?? stack.canSmelt} tier-${stack.partTier} part${(r.smelted?.parts ?? 1) === 1 ? "" : "s"} — they're in the Forge.`);
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
        } else say(r?.error === "not_enough_ore" ? "Not enough ore." : "Couldn't smelt that.");
    };

    const upgrade = async (track) => {
        const r = await post({ action: "upgrade", track });
        if (r?.unlocked) setState(r);
        else say(r?.error === "not_enough_gold" ? "Not enough gold." : r?.error === "maxed" ? "Already at max." : "Couldn't upgrade.");
    };

    const s = state;
    const node = (s.nodes || []).find((n) => n.id === target) || null;

    return (
        <section className="card mine-wrap">
            <div className="mine-top">
                <span className="mine-title">⛏️ The Mine</span>
                <span className="mine-sub">owner preview · {s.swings?.left ?? 0}/{s.swings?.allowance ?? 0} swings left</span>
            </div>

            {/* THE CAVE — tap the floor to walk, tap a seam to swing. */}
            <div className="mine-cave" ref={sceneRef} onClick={onSceneTap} role="presentation">
                <div className="mine-dark" aria-hidden="true" />
                {(s.nodes || []).map((n) => {
                    const near = inReach(n);
                    return (
                        <button key={n.id} type="button" className={`mine-node${near ? " is-near" : ""}${target === n.id ? " is-target" : ""}`}
                            style={{ left: `${n.x}%`, top: `${n.y}%`, "--ore": n.color }}
                            onClick={(e) => { e.stopPropagation(); tapNode(n); }}
                            title={`${n.name} — ${n.pct}% left${near ? "" : " (walk closer)"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={n.art} alt="" draggable="false" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                            <span className="mine-node-fallback" aria-hidden="true">⬢</span>
                            <span className="mine-node-hp"><span style={{ width: `${n.pct}%`, background: n.color }} /></span>
                        </button>
                    );
                })}
                {/* YOU */}
                <div className="mine-you" style={{ left: `${you.x}%`, top: `${you.y}%`, transform: `translate(-50%,-100%) scaleX(${you.facing})` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.pick?.sprite} alt="" draggable="false" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    <span className="mine-you-fallback" aria-hidden="true">🧍</span>
                </div>
                {floats.map((f) => (
                    <span key={f.id} className={`mine-float is-${f.grade}`} style={{ left: `${you.x}%`, top: `${you.y - 8}%` }}>{f.dmg}</span>
                ))}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {/* Swing bar — opens on the seam you tapped. */}
            {node ? <SwingBar node={node} onSwing={onSwing} onClose={() => setTarget(null)} swingsLeft={s.swings?.left ?? 0} /> : null}

            {/* Ore stash */}
            <div className="mine-stash">
                <div className="mine-stash-head">Ore in your pack <span className="muted">· smelts into forge parts</span></div>
                {(s.ore || []).length ? (
                    <div className="mine-stash-rows">
                        {s.ore.map((o) => (
                            <div className="mine-stash-row" key={o.tier}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={o.art} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                <span style={{ color: o.color }}>{o.name}</span>
                                <em className="muted">{o.smeltCost} → 1 tier-{o.partTier} part</em>
                                <b>×{o.qty}</b>
                                <button type="button" className="mine-smelt" disabled={!o.canSmelt} onClick={() => smelt(o.tier)}
                                    title={o.canSmelt ? `Smelt ${o.canSmelt * o.smeltCost} ore into ${o.canSmelt} part${o.canSmelt === 1 ? "" : "s"}` : `Need ${o.smeltCost} to smelt`}>
                                    🔥 {o.canSmelt || 0}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing yet — crack a seam and it lands here.</p>}
            </div>

            {/* Upgrades */}
            <div className="mine-tracks">
                <div className="mine-stash-head">The Pickaxe — {s.pick?.name}{s.pick?.nextName ? <span className="muted"> · {s.pick.nextName} at {s.pick.nextAt} levels</span> : <span className="muted"> · fully forged</span>}</div>
                {(s.tracks || []).map((t) => (
                    <div className="mine-track" key={t.key}>
                        <span className="mine-track-ico" aria-hidden="true">{t.icon}</span>
                        <span className="mine-track-body">
                            <b>{t.name} <span className="muted">Lv {t.level}/{t.max}</span></b>
                            <em>{t.desc}</em>
                        </span>
                        <button type="button" className="mine-buy" disabled={t.cost == null || (s.gold ?? 0) < t.cost} onClick={() => upgrade(t.key)}>
                            {t.cost == null ? "MAX" : `🪙 ${money(t.cost)}`}
                        </button>
                    </div>
                ))}
            </div>

            <p className="mine-hint">Tap the floor to walk. Tap a seam you&apos;re standing near to swing — time the marker to the middle, exactly like the anvil and the golem. Chains build with clean hits.</p>

            {/* Cracked-it reveal */}
            {crack ? (
                <div className="mine-crack" role="presentation" onClick={() => setCrack(null)}>
                    <div className="mine-crack-card" onClick={(e) => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={crack.art} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        <h3 style={{ color: crack.color }}>{crack.name} cracked!</h3>
                        <div className="mine-crack-rows">
                            <span>Ore<b>+{crack.ore}</b></span>
                            <span>Gold<b>+{money(crack.gold)}</b></span>
                            <span>XP<b>+{money(crack.xp)}</b></span>
                        </div>
                        <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Smelts into tier {crack.partTier} forge parts.</p>
                        <button type="button" className="mine-buy" onClick={() => setCrack(null)}>Keep digging</button>
                    </div>
                </div>
            ) : null}

            <style jsx global>{`
                .mine-wrap { position: relative; }
                .mine-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
                .mine-title { font-size: 1.15rem; font-weight: 900; color: #ffe28a; }
                .mine-sub { font-size: 0.78rem; color: #9aa2ab; }
                .mine-cave { position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 16px; overflow: hidden; cursor: pointer;
                    background: radial-gradient(120% 90% at 50% 12%, #3a3020 0%, #1b1710 45%, #0c0a07 100%); border: 1px solid rgba(255,215,94,0.22); }
                .mine-dark { position: absolute; inset: 0; pointer-events: none;
                    background: radial-gradient(60% 55% at 50% 70%, transparent 0%, rgba(0,0,0,0.55) 100%); }
                .mine-node { position: absolute; transform: translate(-50%,-50%); width: 54px; height: 54px; padding: 0; border: none; background: none;
                    cursor: pointer; filter: grayscale(0.5) brightness(0.7); transition: filter .18s ease, transform .18s ease; }
                .mine-node.is-near { filter: none; }
                .mine-node.is-near:hover { transform: translate(-50%,-50%) scale(1.08); }
                .mine-node.is-target { filter: drop-shadow(0 0 12px var(--ore)); }
                .mine-node img { width: 100%; height: 100%; object-fit: contain; }
                .mine-node-fallback { position: absolute; inset: 0; display: grid; place-items: center; font-size: 30px; color: var(--ore); z-index: -1; }
                .mine-node-hp { position: absolute; left: 8%; right: 8%; bottom: -7px; height: 4px; border-radius: 999px; background: rgba(0,0,0,0.6); overflow: hidden; display: block; }
                .mine-node-hp > span { display: block; height: 100%; }
                .mine-you { position: absolute; width: 52px; height: 68px; pointer-events: none; transition: left .35s ease, top .35s ease; }
                .mine-you img { width: 100%; height: 100%; object-fit: contain; }
                .mine-you-fallback { position: absolute; inset: 0; display: grid; place-items: center; font-size: 34px; z-index: -1; }
                .mine-float { position: absolute; transform: translate(-50%,-50%); font-weight: 900; pointer-events: none; animation: mineFloat .85s ease-out forwards; color: #ffe28a; }
                .mine-float.is-pixel { color: #ffd75e; font-size: 1.5rem; }
                .mine-float.is-perfect { color: #8fe3ff; font-size: 1.3rem; }
                .mine-float.is-miss { color: #9aa2ab; font-size: 1rem; }
                @keyframes mineFloat { to { transform: translate(-50%,-160%); opacity: 0; } }
                .mine-msg { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: #ffcf6a;
                    font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px; pointer-events: none; }
                .mine-stash, .mine-tracks { margin-top: 14px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-stash-head { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #ffd75e; margin-bottom: 8px; }
                .mine-stash-rows { display: grid; gap: 6px; }
                .mine-stash-row { display: flex; align-items: center; gap: 9px; font-size: 0.86rem; padding: 6px 9px; border-radius: 9px; background: rgba(255,255,255,0.04); }
                .mine-stash-row img { width: 22px; height: 22px; object-fit: contain; }
                .mine-stash-row em { margin-left: auto; font-size: 11px; font-style: normal; }
                .mine-smelt { padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,176,32,0.5); background: rgba(255,176,32,0.14); color: #ffd08a; font-weight: 800; font-size: 12px; cursor: pointer; }
                .mine-smelt:disabled { opacity: 0.35; cursor: default; }
                .mine-track { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid rgba(255,255,255,0.06); }
                .mine-track:first-of-type { border-top: none; }
                .mine-track-ico { font-size: 22px; }
                .mine-track-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-track-body em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                .mine-buy { padding: 7px 13px; border-radius: 10px; border: none; font-weight: 900; cursor: pointer; color: #2a1400;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 2px 0 #b47a12; }
                .mine-buy:disabled { filter: grayscale(0.7) brightness(0.8); cursor: default; }
                .mine-hint { font-size: 12px; color: #9aa2ab; margin: 10px 0 0; }
                .mine-crack { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto;
                    background: rgba(6,4,10,0.8); padding: max(16px, env(safe-area-inset-top)) 18px max(16px, env(safe-area-inset-bottom)); }
                .mine-crack > * { margin: auto; }
                .mine-crack-card { width: 100%; max-width: 330px; text-align: center; padding: 20px; border-radius: 18px;
                    background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.5); }
                .mine-crack-card img { width: 84px; height: 84px; object-fit: contain; }
                .mine-crack-card h3 { margin: 6px 0 10px; }
                .mine-crack-rows { display: flex; justify-content: center; gap: 14px; margin-bottom: 12px; }
                .mine-crack-rows span { display: flex; flex-direction: column; font-size: 11px; color: #9aa2ab; }
                .mine-crack-rows b { font-size: 1.05rem; color: #ffe28a; }
            `}</style>
        </section>
    );
}

// ── THE SWING BAR ────────────────────────────────────────────────────────────────────────────────────────────
// Judged LOCALLY the instant your finger lands (haptics + grade), then reconciled against the server's answer.
// Cooldown is grade-based and owned here; the server's floor sits safely below it.
function SwingBar({ node, onSwing, onClose, swingsLeft }) {
    const [marker, setMarker] = useState(0.5);
    const markerRef = useRef(0.5);
    const [cooling, setCooling] = useState(false);
    const [grade, setGrade] = useState(null);
    const [notice, setNotice] = useState(null);
    const cdRef = useRef(false);
    const busyRef = useRef(false);
    const cdUntil = useRef(0);
    const cdMs = useRef(CD_DEFAULT);
    const cdEl = useRef(null);

    useEffect(() => {
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const phase = ((t - t0) % (SWEEP_MS * 2)) / SWEEP_MS;
            const pos = phase <= 1 ? phase : 2 - phase;
            markerRef.current = pos; setMarker(pos);
            if (cdEl.current) {
                const left = Math.max(0, cdUntil.current - Date.now());
                cdEl.current.style.transform = `scaleX(${left / (cdMs.current || CD_DEFAULT)})`;
            }
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
            const pattern = key === "pixel" ? [30, 30, 30, 30, 60, 40, 110] : key === "perfect" ? [22, 34, 26, 34, 70]
                : key === "great" ? [16, 30, 40] : key === "good" ? [12, 26] : [8];
            navigator.vibrate?.(pattern);
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
            // Never charge a cooldown for a swing that didn't happen, and never fail silently.
            clearTimeout(timer);
            cdRef.current = false; cdUntil.current = 0; setCooling(false);
            setNotice(r?.error === "too_fast" ? "Easy — let the bar refill" : r?.error === "out_of_swings" ? "Out of swings today" : "That swing didn't land");
            setTimeout(() => setNotice(null), 1400);
        }
    }, [onSwing]);

    return (
        <div className="mine-swing">
            <div className="mine-swing-head">
                <b style={{ color: node.color }}>{node.name}</b>
                <span className="muted">{node.pct}% left · {swingsLeft} swings</span>
                <button type="button" className="mine-swing-x" onClick={onClose} aria-label="Step away">✕</button>
            </div>
            <div className="mine-swing-bar" aria-hidden="true">
                <span className="mine-swing-zone" />
                <span className="mine-swing-marker" style={{ left: `${marker * 100}%` }} />
            </div>
            <button type="button" className="mine-swing-go" onPointerDown={(e) => { e.preventDefault(); swing(); }} disabled={cooling}>
                <span className="mine-swing-cd" ref={cdEl} aria-hidden="true" />
                <span>⛏️ Swing</span>
            </button>
            {grade ? <div className={`mine-swing-grade is-${grade.key}`}>{grade.label} · {grade.dmg}{grade.combo >= 2 ? ` · ${grade.combo}× chain` : ""}</div> : null}
            {!grade && notice ? <div className="mine-swing-notice">{notice}</div> : null}

            <style jsx global>{`
                .mine-swing { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,215,94,0.3); }
                .mine-swing-head { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; margin-bottom: 9px; }
                .mine-swing-head .muted { margin-left: auto; font-size: 11.5px; }
                .mine-swing-x { background: none; border: none; color: #9aa2ab; font-size: 15px; cursor: pointer; padding: 0 2px; }
                .mine-swing-bar { position: relative; height: 26px; border-radius: 999px; background: linear-gradient(90deg, #2a2f3a, #3a4150, #2a2f3a); overflow: hidden; }
                .mine-swing-zone { position: absolute; left: 50%; top: 0; bottom: 0; width: 11%; transform: translateX(-50%);
                    background: linear-gradient(90deg, rgba(255,215,94,0.15), rgba(255,215,94,0.55), rgba(255,215,94,0.15)); }
                .mine-swing-marker { position: absolute; top: -3px; bottom: -3px; width: 4px; transform: translateX(-50%); border-radius: 2px;
                    background: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.9); }
                .mine-swing-go { position: relative; overflow: hidden; margin-top: 10px; width: 100%; padding: 12px; border-radius: 12px; border: none;
                    font-weight: 900; font-size: 1.05rem; color: #2a1400; cursor: pointer; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
                .mine-swing-go:disabled { filter: saturate(0.75) brightness(0.92); cursor: default; }
                .mine-swing-cd { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left center; background: rgba(0,0,0,0.28); }
                .mine-swing-grade { text-align: center; margin-top: 7px; font-weight: 900; font-size: 0.92rem; }
                .mine-swing-grade.is-pixel { color: #ffd75e; } .mine-swing-grade.is-perfect { color: #8fe3ff; }
                .mine-swing-grade.is-great { color: #8fe39a; } .mine-swing-grade.is-good { color: #d7c48a; } .mine-swing-grade.is-miss { color: #ff8f9a; }
                .mine-swing-notice { text-align: center; margin-top: 7px; font-size: 0.8rem; font-weight: 700; color: #b9a98f; }
            `}</style>
        </div>
    );
}
