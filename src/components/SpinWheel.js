"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import CoinCta from "@/components/CoinCta";
import useScrollLock from "@/lib/useScrollLock";

// ── THE PRIZE WHEEL — hand-painted game art: a big rotating 20-wedge disc inside a slim bulb-lit gold frame
// with a wolf-head pointer. Real prize sprites on every wedge (no emoji). Feeds a shared PROGRESSIVE jackpot,
// and has two bonus rounds: a MINI WHEEL and a pick-a-box BONUS GAME that reveals wheel-exclusive gear. ──

const WEDGES = 20;
const WEDGE_DEG = 360 / WEDGES;
const WEDGE_OFFSET = 0;      // icon ring phase: disc dividers sit at 9°,27°… so wedge CENTERS are at 0°,18°… (measured from the art). Icons were landing on the divider lines at offset 9.
// ── WHERE THE PRIZE SPRITES SIT ──────────────────────────────────────────────────────────────────────────────
// READ THE UNITS BEFORE TOUCHING THIS NUMBER. iconPos writes `left: ${50 + r*sinθ}%`, and a percentage there is
// a percentage of the rotor's WIDTH — so the offset from centre is r% of the width, and the rotor's RADIUS is
// 50 of these units, not 100. Every past attempt at this number got that wrong in one direction or the other:
// 25.5 and 28.5 read as "huddled around the hub" because they are only 0.51 and 0.57 of the radius, and 62 —
// picked while thinking 100 was the rim — put the whole ring of sprites outside the wheel, floating in the page
// around the frame.
//
// Measured off the composited art (disc at 82% inside the frame), in ROTOR RADII:
//     the disc's hub ends at        0.308   →  ICON_R 15.4
//     the frame's inner rim starts  0.812   →  ICON_R 40.6
// An icon is 9.5% of the rotor wide and its <img> is 116% of that, so it reaches ±5.5 ICON_R units:
//     15.4 + 5.5 = 20.9   <=   ICON_R   <=   40.6 - 5.5 = 35.1
// 34 is the top of that band: dead centre of each wedge, out in the FAT end where a pie slice is widest, which
// is where every prize wheel ever built puts them. The size is set from the geometry too — at this radius each
// wedge is 0.215 rotor radii wide at the icon ring, and a 9.5% icon is 0.220 across, so they sit one per slice
// and just touch instead of overlapping their neighbours.
//
// The wolf's muzzle hangs down to 0.583 of the radius, so an icon does pass behind it once per turn. That is
// deliberate and already handled: the WINNING icon lifts above the frame when the wheel stops (see
// .cw-ring.has-won .cw-rotor), so the one sprite that has to be readable never is covered.
const ICON_R = 34;
const SPIN_MS = 5600;
// The wheel starts turning the INSTANT you tap, on a constant-speed lead-in, and only retargets to the
// winning wedge once the server answers. It used to sit dead still until the POST came back — on a cold
// lambda that's several seconds of a wheel that looks frozen, followed by a spin. A transition retargeted
// mid-flight interpolates from wherever the disc actually is, so the hand-off is seamless.
const LEAD_MS = 9000;
const LEAD_DEG = 360 * 7;

// mini-wheel.png is painted with NINE wedges — gold dividers measured every 40° starting at 0°, so wedge
// CENTRES land on 20° + k·40°. It was driven as an eight-wedge disc: icons every 45° over dividers every 40°,
// which walked them off their wedges by up to 20° (a whole half-wedge), and put the ninth prize at 8×45 = 360
// = 0°, drawn straight on top of the first one. spin.js now hard-fails if the prize list isn't nine long.
// Same units as ICON_R above — 50 is the rim, not 100 — and the same correction: 49.5 was 0.99 of the radius,
// i.e. sitting on the decorative border. In disc radii the hub ends at 0.25 and the rim starts at 0.74, so the
// band for a 16% icon (±9.3 units) is 21.8 … 27.7, and 27 is the outer end of it. Nine wedges of 40° give each
// icon 0.377 radii of arc against a 0.371 icon, so they fit one per slice with room to spare.
const MINI_WEDGES = 9;
const MINI_DEG = 360 / MINI_WEDGES;
const MINI_OFFSET = 20;
const MINI_ICON_R = 27;

// Human tier names for the prize-inspect card.
const TIER_LABEL = { normal: "Common", rare: "Rare", bonus: "Bonus round", mini: "Mini Jackpot", jackpot: "Grand Jackpot" };

// Gear rarity colors (match the inventory) — drives the juiced match-3 win reveal.
const RARITY_COLOR = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const rarCol = (r) => RARITY_COLOR[r] || "#4aa3ff";

// ── tiny Web-Audio kit (no assets, CSP-safe) ──
let _ac = null;
const ac = () => { if (typeof window === "undefined") return null; try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); return _ac; } catch { return null; } };
function tick(v = 0.05) {
    const a = ac(); if (!a) return;
    try { const o = a.createOscillator(), g = a.createGain(); o.type = "square"; o.frequency.value = 1100; g.gain.setValueAtTime(v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.03); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.035); } catch { /* ignore */ }
}
function playWin(kind) {
    const a = ac(); if (!a) return;
    const notes = kind === "jackpot" ? [523, 659, 784, 1047, 1319, 1568] : kind === "mini" ? [523, 659, 784, 1047] : kind === "bonus" ? [660, 990] : [523, 784];
    notes.forEach((freq, i) => {
        try { const t = a.currentTime + i * 0.1; const o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.38); } catch { /* ignore */ }
    });
}

// Position an icon at wedge i of an N-wedge ring (percent coords + radial rotation).
function iconPos(i, offset, deg, r) {
    const th = i * deg + offset;
    const rad = (th * Math.PI) / 180;
    return { left: `${50 + r * Math.sin(rad)}%`, top: `${50 - r * Math.cos(rad)}%`, transform: `translate(-50%, -50%) rotate(${th}deg)` };
}

// Render full-screen overlays into <body> so `position: fixed` is measured against the VIEWPORT, not a
// transformed/filtered ancestor (the marketplace page animates its content, which was capturing our fixed
// overlays — the bonus game ended up centered in a tall scroll container and ran off-screen with no scroll).
function Portal({ children }) {
    const [el] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
    useEffect(() => {
        if (!el) return undefined;
        document.body.appendChild(el);
        return () => { document.body.removeChild(el); };
    }, [el]);
    if (!el) return null;
    return createPortal(children, el);
}

export default function SpinWheel() {
    const [st, setSt] = useState(null);
    const [rot, setRot] = useState(0);
    // Which wedge the server picked, kept after the spin so the winning slice can be marked at rest. Without
    // it the wheel stops and says nothing about WHICH icon won — see the pointer note below.
    const [wonIdx, setWonIdx] = useState(null);
    const [spinning, setSpinning] = useState(false);
    const [phase, setPhase] = useState("idle"); // idle | lead (waiting on the server) | land (easing onto the wedge)
    const [result, setResult] = useState(null);
    const [celebrate, setCelebrate] = useState(null);
    const [mini, setMini] = useState(null);       // { prizes, index, prize } bonus mini-wheel
    const [bonus, setBonus] = useState(null);      // { reveals } pick-a-box gear game
    const [inspect, setInspect] = useState(null);  // a legend prize the player tapped to inspect
    useScrollLock(Boolean(celebrate) || Boolean(mini) || Boolean(bonus) || Boolean(inspect));
    const [msg, setMsg] = useState(null);
    const [refundFlash, setRefundFlash] = useState(false); // Wheelwarden capstone: "FREE SPIN!" celebration
    const [lowCoins, setLowCoins] = useState(false);

    const rotorRef = useRef(null);
    const rotRef = useRef(0); // committed rotation, so the error path can freeze without an impure updater
    const rafRef = useRef(0);
    const timerRef = useRef(null);
    const chainRef = useRef(0);
    const runSpinRef = useRef(null);
    const bonusRef = useRef(null);
    useEffect(() => { bonusRef.current = bonus; }, [bonus]); // current bonus state for the flip guard (no stale closure)
    useEffect(() => { rotRef.current = rot; }, [rot]);

    // Open the match-3 board from a fresh bonusGame payload OR a bonusResume (revealed tiles pre-filled).
    const openBonus = useCallback((payload) => {
        if (!payload) return;
        const flipped = {};
        if (payload.revealed) for (const [i, card] of Object.entries(payload.revealed)) flipped[i] = card;
        setBonus({ size: payload.size, need: payload.need || 3, roster: payload.roster || [], flipped, done: false, won: null, busy: false });
    }, []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d) { setSt(d); if (d.bonusResume && !bonusRef.current) openBonus(d.bonusResume); } // resume an unfinished game
    }, [openBonus]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await, not sync)
    useEffect(() => { load(); return () => { clearTimeout(timerRef.current); cancelAnimationFrame(rafRef.current); }; }, [load]);

    // Where the disc actually is right now, mid-transition (degrees, unwrapped onto `rot`'s turn count).
    const liveAngle = useCallback((fallback) => {
        const el = rotorRef.current;
        if (!el) return fallback;
        try {
            const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
            const deg = (Math.atan2(m.b, m.a) * 180) / Math.PI;
            const turns = Math.round((fallback - deg) / 360);
            return deg + turns * 360;
        } catch { return fallback; }
    }, []);

    const startTickLoop = useCallback(() => {
        let lastWedge = null, lastTick = 0;
        const step = (ts) => {
            const el = rotorRef.current;
            if (el) {
                let ang = 0;
                try { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); ang = Math.atan2(m.b, m.a); } catch { /* ignore */ }
                const w = Math.round((ang / (Math.PI * 2)) * WEDGES);
                if (w !== lastWedge) { if (ts - lastTick > 24) { tick(); lastTick = ts; } lastWedge = w; }
            }
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    }, []);

    const runSpin = useCallback(async () => {
        setSpinning(true); setResult(null); setMsg(null); setCelebrate(null);
        tick(0.04);
        // Move NOW, decide later: a constant-speed lead-in covers the round trip. Arm the transition a couple
        // of frames before moving — turning a transition on and changing the transform in one commit lets the
        // browser skip the animation (the same trap the mini wheel fell into).
        let landed = false;
        setPhase("lead");
        setWonIdx(null);
        requestAnimationFrame(() => requestAnimationFrame(() => { if (!landed) setRot((prev) => prev + LEAD_DEG); }));
        cancelAnimationFrame(rafRef.current); startTickLoop();
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "spin" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (!d?.ok) {
            // Stop where the disc visibly is, not wherever the lead-in was headed.
            landed = true;
            cancelAnimationFrame(rafRef.current);
            setRot(liveAngle(rotRef.current)); setPhase("idle");
            setSpinning(false); chainRef.current = 0;
            setMsg(d?.error === "no_spins" ? "No spins left — earn or buy one." : "Couldn't spin.");
            return;
        }
        // Wrap, don't clamp. The old Math.min(WEDGES - 1, …) silently mapped any out-of-range index onto the
        // LAST wedge — so while the prize list was one entry too long, winning the MAJOR JACKPOT (index 20)
        // would have parked the wheel on MINI JACKPOT and looked like a payout bug. spin.js now hard-fails a
        // wrong-length list at build time, and a modulo here degrades honestly if one ever slips past.
        const idx = ((Math.round(Number(d.prizeIndex) || 0) % WEDGES) + WEDGES) % WEDGES;
        setWonIdx(idx);
        // NO JITTER. It used to stop up to ±3.6° off centre "for feel" — noise on the one signal the whole
        // wheel exists to send. Dead centre under the wolf, every time.
        const turns = 5 + Math.floor(Math.random() * 4);
        const targetMod = (((-(idx * WEDGE_DEG + WEDGE_OFFSET)) % 360) + 360) % 360;
        // `prev` is the lead-in's target, which is always at or ahead of the live angle — so landing from it
        // can only ever move the disc forward. The land transition REPLACES a running one, which interpolates
        // from wherever the disc actually is; that hand-off is safe (unlike arming from `none`).
        landed = true;
        setPhase("land");
        setRot((prev) => { let n = Math.ceil(prev / 360) * 360 + turns * 360 + targetMod; if (n <= prev + 360) n += 360; return n; });
        timerRef.current = setTimeout(() => {
            cancelAnimationFrame(rafRef.current);
            setSpinning(false); setPhase("idle");
            setSt((s) => ({ ...s, ...d, prize: undefined, miniWheel: undefined, bonusGame: undefined }));
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
            // Route to the right outcome.
            if (d.prize?.miniWheel && d.miniWheel) { setMini({ ...d.miniWheel, rot: 0, spinning: false, revealed: false }); playWin("bonus"); return; }
            if (d.prize?.bonusGame && d.bonusGame) { openBonus(d.bonusGame); playWin("bonus"); return; }
            setResult(d.prize);
            const kind = d.prize?.jackpot ? "jackpot" : d.prize?.mini ? "mini" : d.prize?.respin ? "bonus" : null;
            // The major jackpot gets to breathe — 4.6s was barely past the shockwave for a once-in-133 win.
            if (kind === "jackpot" || kind === "mini") { setCelebrate({ kind, prize: d.prize }); setTimeout(() => setCelebrate(null), kind === "jackpot" ? 8000 : 4600); }
            playWin(kind || (d.prize?.rare ? "rare" : "normal"));
            if (d.refunded) { setRefundFlash(true); setTimeout(() => { try { playWin("bonus"); } catch { /* ignore */ } }, 120); setTimeout(() => setRefundFlash(false), 3000); }
            else if (d.lucky) setMsg("Lucky Spin! Wheelwarden's Fortune fattened the payout.");
            if (d.prize?.respin && chainRef.current < 6) { chainRef.current += 1; setTimeout(() => runSpinRef.current?.(), 1400); }
            else chainRef.current = 0;
        }, SPIN_MS);
    }, [startTickLoop, openBonus, liveAngle]);
    useEffect(() => { runSpinRef.current = runSpin; }, [runSpin]);

    const spin = useCallback(async () => {
        if (spinning || mini || bonus) return;
        if (!st?.canSpin) {
            const rs = await fetch("/api/marketplace/spin", { cache: "no-store" }).catch(() => null);
            const ds = rs?.ok ? await rs.json().catch(() => null) : null;
            if (ds) setSt(ds);
            if (!ds?.canSpin) { setMsg("No spins right now — your free spin resets daily; earn or buy a token."); return; }
        }
        chainRef.current = 0; runSpin();
    }, [spinning, mini, bonus, st, runSpin]);

    const buy = useCallback(async () => {
        if (spinning) return;
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy" }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok) { setSt(d); setLowCoins(false); if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh")); }
        else { setMsg(d?.error === "not_enough_gold" ? "Not enough coins for a spin." : "Couldn't buy a spin."); setLowCoins(d?.error === "not_enough_gold"); }
    }, [spinning]);

    // ── MINI WHEEL bonus round: auto-spin to its winning index, then reveal. ──
    // Step 1 — ARM the transition once the modal has popped. The disc doesn't move yet.
    useEffect(() => {
        if (!mini || mini.spinning || mini.revealed) return undefined;
        const t = setTimeout(() => setMini((m) => (m && !m.spinning ? { ...m, spinning: true } : m)), 450);
        return () => clearTimeout(t);
    }, [mini]);
    // Step 2 — a frame later, set the landing angle. Switching the transition on and moving the disc in the
    // SAME commit is what let the browser skip the animation entirely: the wheel snapped straight to its
    // result, and because nothing animated there was no transitionend either, so the reveal sat waiting on
    // the fallback timer below. (The main wheel never hit this because its transform lands a fetch after its
    // transition.) Two frames of daylight between the two guarantees a real animation.
    useEffect(() => {
        if (!mini || !mini.spinning || mini.revealed || mini.rot !== 0) return undefined;
        let cancelled = false;
        const id = requestAnimationFrame(() => {
            if (cancelled) return;
            requestAnimationFrame(() => {
                if (cancelled) return;
                setMini((m) => {
                    if (!m || !m.spinning || m.rot !== 0) return m;
                    const targetMod = (((-(m.index * MINI_DEG + MINI_OFFSET)) % 360) + 360) % 360;
                    const turns = 5 + Math.floor(Math.random() * 3);
                    return { ...m, rot: turns * 360 + targetMod }; // always ≥ 1800°, so rot === 0 stays a safe "hasn't moved" flag
                });
            });
        });
        return () => { cancelled = true; cancelAnimationFrame(id); };
    }, [mini]);
    const onMiniLanded = useCallback(() => {
        setMini((m) => (m ? { ...m, revealed: true } : m));
        playWin("mini");
    }, []);
    // Fallback: force the reveal if the CSS transitionend never fires (so the mini wheel can't get stuck).
    // Timed from the frame the disc actually STARTS moving, not from when the transition was armed.
    useEffect(() => {
        if (!mini || !mini.spinning || mini.revealed || mini.rot === 0) return undefined;
        const t = setTimeout(() => onMiniLanded(), 4200);
        return () => clearTimeout(t);
    }, [mini, onMiniLanded]);

    const revealBonus = useCallback(async (i) => {
        const b = bonusRef.current; // read CURRENT state via ref — the old `allow`-in-updater trick never ran in time
        if (!b || b.done || b.busy || b.flipped[i]) return;
        setBonus((s) => (s ? { ...s, busy: true } : s));
        tick(0.05);
        const r = await fetch("/api/marketplace/spin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "bonus_flip", index: i }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBonus((s) => {
            if (!s) return s;
            if (!d?.ok) return { ...s, busy: false };
            const flipped = { ...s.flipped, [d.index]: d.tile };
            if (d.done) {
                playWin("jackpot");
                const full = {};
                (d.board || []).forEach((c, idx) => { full[idx] = c; });
                return { ...s, flipped: { ...full, ...flipped }, done: true, won: d.winner, busy: false };
            }
            return { ...s, flipped, busy: false };
        });
        if (d?.done && typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
    }, []);

    if (!st) return <section className="card"><p className="muted" style={{ margin: 0 }}>Loading…</p></section>;
    if (!st.signedIn) return <section className="card"><p className="muted" style={{ margin: 0 }}>Sign in to spin the daily wheel.</p></section>;

    const prizes = st?.wheel?.prizes || [];
    const resultKind = result?.jackpot ? "jackpot" : result?.mini ? "mini" : result?.respin ? "bonus" : result?.rare ? "rare" : "normal";
    const spinLabel = spinning ? "Spinning…" : st.freeAvailable ? "FREE SPIN" : st.tokens > 0 ? `Spin · ${st.tokens} left` : "No spins left";

    return (
        <section className="card cw-card">
            <div className="cw-top">
                <span className="cw-title">{st.wheel.name}</span>
                <span className="cw-sub">🎟️ {st.tokens} · spun {st.spinCount}×</span>
            </div>

            {/* Shared progressive jackpot banner */}
            <div className="cw-jackpot">
                <span className="cw-jackpot-lab">MAJOR JACKPOT</span>
                <span className="cw-jackpot-amt">{(st.jackpotPot || 0).toLocaleString()}<small>gold</small></span>
                <span className="cw-jackpot-note">grows every spin · community pot</span>
            </div>

            <div className={`cw-stage${spinning ? " is-spinning" : ""}`}>
                <div className={`cw-ring${wonIdx != null && !spinning ? " has-won" : ""}`}>
                    <div ref={rotorRef} className="cw-rotor" style={{ transform: `translate(-50%, -50%) rotate(${rot}deg)`, transition: phase === "lead" ? `transform ${LEAD_MS}ms linear` : phase === "land" ? `transform ${SPIN_MS}ms cubic-bezier(0.08,0.72,0.04,1)` : "none" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cw-disc" src="/images/spin/wheel-disc.png" alt="" draggable="false" />
                        <div className="cw-icons">
                            {prizes.map((p, i) => (
                                <div key={i} className={`cw-ico tier-${p.tier}${wonIdx === i && !spinning ? " is-won" : ""}`} style={iconPos(i, WEDGE_OFFSET, WEDGE_DEG, ICON_R)}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {p.sprite ? <img className="cw-ico-img" src={p.sprite} alt="" draggable="false" /> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cw-frame" src="/images/spin/wheel-frame.png" alt="" draggable="false" />
                    {/* No separate pointer marker — the frame's wolf ornament ends in a gold chevron at dead
                        top, and that IS the pointer. See .cw-ring.has-won for why the winner draws over it. */}
                </div>
            </div>

            {result ? (
                <div className={`cw-result tier-${resultKind}`}>
                    {result.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="cw-result-img" src={result.sprite} alt="" draggable="false" />
                    ) : null}
                    <span className="cw-result-kicker">{resultKind === "jackpot" ? "JACKPOT!" : resultKind === "mini" ? "MINI JACKPOT!" : resultKind === "bonus" ? "BONUS SPIN!" : resultKind === "rare" ? "Rare!" : "You won"}</span>
                    <span className="cw-result-prize">{result.text}</span>
                </div>
            ) : null}
            {msg ? <div className="cw-msg">{msg}{lowCoins ? <span style={{ marginLeft: 8 }}><CoinCta label="Get coins" /></span> : null}</div> : null}

            <div className="cw-actions">
                <button type="button" className="cw-go" onClick={spin} disabled={spinning || !st.canSpin} style={{ opacity: spinning || !st.canSpin ? 0.6 : 1 }}>{spinLabel}</button>
                {!st.freeAvailable ? <button type="button" className="cw-buy" onClick={buy} disabled={spinning || st.gold < st.tokenCost}>Buy spin · 🪙 {st.tokenCost}</button> : null}
            </div>

            <details className="cw-legend" open>
                <summary>🎁 What&apos;s on the wheel <span>{prizes.length} prizes</span></summary>
                <div className="cw-legend-grid">
                    {prizes.map((p, i) => (
                        <button key={i} type="button" className={`cw-leg tier-${p.tier}`} onClick={() => setInspect(p)} title="Tap to inspect">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {p.sprite ? <img className="cw-leg-img" src={p.sprite} alt="" /> : null}
                            <span className="cw-leg-label">{p.label}</span>
                            <span className="cw-leg-odds">{p.odds}%</span>
                        </button>
                    ))}
                </div>
            </details>

            <p className="cw-hint">One free spin daily. Earn spin tokens from quests, boss kills &amp; streaks. Every spin is its own roll — and every spin feeds the community jackpot.</p>

            {/* ── MINI WHEEL modal ── */}
            {mini ? (
                <Portal><div className="cw-modal">
                    <div className="cw-modal-card">
                        {mini.revealed ? <button type="button" className="cw-bonus-close" onClick={() => setMini(null)} aria-label="Close">✕</button> : null}
                        <div className="cw-modal-title">Mini Wheel Bonus!</div>
                        <div className="cw-mini-stage">
                            <div className="cw-mini-rotor" style={{ transform: `rotate(${mini.rot}deg)`, transition: mini.spinning ? "transform 3600ms cubic-bezier(0.08,0.72,0.05,1)" : "none" }} onTransitionEnd={mini.spinning && !mini.revealed ? onMiniLanded : undefined}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="cw-mini-disc" src="/images/spin/mini-wheel.png" alt="" draggable="false" />
                                <div className="cw-icons">
                                    {mini.prizes.map((p, i) => (
                                        <div key={i} className={`cw-ico cw-mini-ico tier-${p.tier}`} style={iconPos(i, MINI_OFFSET, MINI_DEG, MINI_ICON_R)}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img className="cw-ico-img" src={p.sprite} alt="" draggable="false" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <span className="cw-mini-pointer" aria-hidden="true" />
                        </div>
                        {mini.revealed ? (
                            <>
                                <div className="cw-modal-won">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {mini.prize?.sprite ? <img src={mini.prize.sprite} alt="" className="cw-modal-won-img" /> : null}
                                    <span>You won <b>{mini.prize?.text}</b>!</span>
                                </div>
                                <button type="button" className="cw-collect" onClick={() => setMini(null)}>Collect</button>
                            </>
                        ) : <p className="cw-modal-sub">Spinning for a bonus prize…</p>}
                    </div>
                </div></Portal>
            ) : null}

            {/* ── BONUS GAME — full-screen match-3: flip tiles, win the gear you get 3 of ── */}
            {bonus ? (
                <Portal><div className="cw-bonus-full">
                    <button type="button" className="cw-bonus-close" onClick={() => setBonus(null)} aria-label="Close">✕</button>
                    <div className="cw-bonus-inner">
                        <div className="cw-bonus-title">🎁 Match 3 to Win!</div>
                        <p className="cw-bonus-sub">{bonus.done ? "THREE OF A KIND!" : "Flip tiles — the first gear you match 3 of is yours to keep."}</p>

                        {!bonus.done ? (
                            <div className="cw-bonus-track">
                                {bonus.roster.map((g) => {
                                    const c = Object.values(bonus.flipped).filter((t) => t.id === g.id).length;
                                    return (
                                        <div key={g.id} className={`cw-bonus-track-item${c >= bonus.need ? " is-hit" : ""}`} title={g.name}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={g.sprite} alt="" />
                                            <span>{c}/{bonus.need}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}

                        <div className="cw-bonus-grid">
                            {Array.from({ length: bonus.size }).map((_, i) => {
                                const t = bonus.flipped[i];
                                const isWin = bonus.done && t && bonus.won?.id === t.id;
                                return (
                                    <button key={i} type="button" className={`cw-btile${t ? " is-open" : ""}${isWin ? " is-win" : ""}${bonus.done && t && !isWin ? " is-dim" : ""}`} disabled={Boolean(t) || bonus.done || bonus.busy} onClick={() => revealBonus(i)}>
                                        <span className="cw-btile-flip">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <span className="cw-btile-face cw-btile-back"><img src="/images/spin/prizes/mystery-box.png" alt="" draggable="false" /></span>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <span className="cw-btile-face cw-btile-front">{t ? <img src={t.sprite} alt="" draggable="false" /> : null}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {bonus.done ? (
                            <div className="cw-bonus-win" style={{ "--rar": rarCol(bonus.won.rarity) }}>
                                <div className="cw-bonus-win-rays" aria-hidden="true" />
                                <div className="cw-bonus-win-confetti" aria-hidden="true">
                                    {Array.from({ length: 40 }).map((_, i) => (
                                        <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 10) * 0.05}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c", rarCol(bonus.won.rarity)][i % 6] }} />
                                    ))}
                                </div>
                                <div className="cw-bonus-win-burst" aria-hidden="true" />
                                <div className="cw-bonus-win-frame">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={bonus.won.sprite} alt="" className="cw-bonus-win-img" />
                                </div>
                                <div className="cw-bonus-win-rar">{(bonus.won.rarity || "rare").toUpperCase()}{bonus.won.slot ? ` · ${bonus.won.slot.replace("_", " ")}` : ""}</div>
                                <div className="cw-bonus-win-txt">You won <b>{bonus.won.name}</b>!</div>
                                {bonus.won.stats ? <div className="cw-bonus-win-stats">{bonus.won.stats}</div> : null}
                                <button type="button" className="cw-collect" onClick={() => setBonus(null)}>Collect gear</button>
                            </div>
                        ) : (
                            <p className="cw-bonus-hint">Tap ✕ to step away — your board is saved and you can finish it later.</p>
                        )}
                    </div>
                </div></Portal>
            ) : null}

            {celebrate ? (
                <Portal><div className={`cw-celebrate cw-celebrate-${celebrate.kind}`} onClick={() => setCelebrate(null)}>
                    {/* THE MAJOR JACKPOT BLOWS THE SCREEN UP. It is the rarest thing on the wheel — a 1-weight
                        wedge out of 133, once in 133 spins, paying the whole community pot — and it used to
                        land with the same card and the same confetti as a 1,000-gold mini. The big one now
                        gets its own detonation: a white flash, three shockwave rings punching outward, gold
                        shards thrown from the centre, and a card that shakes on impact. */}
                    {celebrate.kind === "jackpot" ? (
                        <>
                            <span className="cw-flash" aria-hidden="true" />
                            <div className="cw-shock" aria-hidden="true"><span /><span /><span /></div>
                            <div className="cw-shards" aria-hidden="true">
                                {Array.from({ length: 28 }).map((_, i) => (
                                    <span key={i} style={{ "--a": `${i * (360 / 28)}deg`, animationDelay: `${(i % 7) * 0.045}s`, background: ["#ffd75e", "#fff3c4", "#ffb020"][i % 3] }} />
                                ))}
                            </div>
                        </>
                    ) : null}
                    <div className="cw-confetti" aria-hidden="true">
                        {Array.from({ length: celebrate.kind === "jackpot" ? 140 : 54 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 12) * 0.07}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c"][i % 5] }} />
                        ))}
                    </div>
                    <div className="cw-celebrate-card">
                        {celebrate.prize?.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="cw-celebrate-img" src={celebrate.prize.sprite} alt="" />
                        ) : null}
                        {/* The wedge says MAJOR JACKPOT, so the celebration says MAJOR JACKPOT. */}
                        <div className="cw-celebrate-title">{celebrate.kind === "jackpot" ? "MAJOR JACKPOT!" : "MINI JACKPOT!"}</div>
                        {result ? <div className="cw-celebrate-sub">{result.text}</div> : null}
                        {celebrate.kind === "jackpot" ? <div className="cw-celebrate-brag">You took the whole pot.</div> : null}
                        <button type="button" className="cw-collect" onClick={() => setCelebrate(null)}>Collect</button>
                    </div>
                </div></Portal>
            ) : null}

            {/* ── INSPECT a prize (tap a legend row) ── */}
            {inspect ? (
                <Portal><div className="cw-modal" onClick={() => setInspect(null)}>
                    <div className="cw-modal-card cw-inspect" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="cw-bonus-close" onClick={() => setInspect(null)} aria-label="Close">✕</button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {inspect.sprite ? <img className="cw-inspect-img" src={inspect.sprite} alt="" /> : null}
                        <div className="cw-inspect-name">{inspect.label}</div>
                        <div className={`cw-inspect-tier tier-${inspect.tier}`}>{TIER_LABEL[inspect.tier] || "Prize"}</div>
                        <p className="cw-inspect-desc">{inspect.desc || inspect.label}</p>
                        <div className="cw-inspect-odds">Odds this spin · <b>{inspect.odds}%</b></div>
                    </div>
                </div></Portal>
            ) : null}

            {/* ── Wheelwarden capstone: a juicy, non-blocking "FREE SPIN!" burst when a spin is refunded ── */}
            {refundFlash ? (
                <Portal><div className="cw-refund" aria-hidden="true">
                    <div className="cw-refund-confetti">
                        {Array.from({ length: 44 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${(i % 10) * 0.05}s`, background: ["#8fe39a", "#ffd75e", "#5ce0c0", "#8fd8ff", "#ff9f1c"][i % 5] }} />
                        ))}
                    </div>
                    <div className="cw-refund-pill">
                        <span className="cw-refund-clover">🍀</span>
                        <span className="cw-refund-txt"><b>FREE SPIN!</b><small>Lucky Streak — your spin was refunded</small></span>
                    </div>
                </div></Portal>
            ) : null}

            <style>{CW_CSS}</style>
        </section>
    );
}

const CW_CSS = `
.cw-card { position: relative; overflow: hidden; }
.cw-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.cw-title { font-weight: 900; font-size: 1.05rem; }
.cw-sub { font-size: 11.5px; color: #9aa2ab; font-weight: 700; }

.cw-jackpot { margin: 10px auto 2px; max-width: 420px; text-align: center; padding: 8px 14px; border-radius: 14px;
    background: linear-gradient(180deg, rgba(255,200,80,0.16), rgba(255,150,40,0.06)); border: 1px solid rgba(255,215,94,0.5); box-shadow: 0 0 22px -6px rgba(255,190,60,0.6); }
.cw-jackpot-lab { display: block; font-size: 10.5px; font-weight: 900; letter-spacing: 0.14em; color: #ffcf6a; }
.cw-jackpot-amt { display: block; font-size: 1.8rem; font-weight: 900; color: #ffe9a8; text-shadow: 0 2px 12px rgba(255,180,40,0.6); font-variant-numeric: tabular-nums; line-height: 1.1; }
.cw-jackpot-amt small { font-size: 0.7rem; font-weight: 800; color: #d8b46a; margin-left: 5px; letter-spacing: 0.04em; }
.cw-jackpot-note { display: block; font-size: 9.5px; color: #b79a5e; font-weight: 700; }

.cw-stage { position: relative; display: grid; place-items: center; margin: 8px auto 6px; width: 100%; max-width: 440px; aspect-ratio: 1; }
.cw-stage::before { content: ""; position: absolute; inset: 4%; border-radius: 50%; background: radial-gradient(circle, rgba(255,190,70,0.14), transparent 68%); filter: blur(8px); transition: opacity .4s; }
@keyframes cwHalo { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
.cw-ring { position: relative; width: 100%; height: 100%; }
.cw-rotor { position: absolute; top: 50%; left: 50%; width: 82%; height: 82%; transform-origin: center; will-change: transform; }
.cw-disc { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 8px 26px rgba(0,0,0,0.55); }
.cw-icons { position: absolute; inset: 0; }
.cw-ico { position: absolute; width: 9.5%; height: 9.5%; display: grid; place-items: center; border-radius: 50%;
    background: radial-gradient(circle, rgba(8,5,2,0.62) 48%, rgba(8,5,2,0) 74%); }
.cw-ico-img { width: 116%; height: 116%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
.cw-ico.tier-jackpot .cw-ico-img { filter: drop-shadow(0 0 6px rgba(255,215,94,0.95)); }
.cw-ico.tier-mini .cw-ico-img { filter: drop-shadow(0 0 5px rgba(200,150,255,0.8)); }
.cw-ico.tier-bonus .cw-ico-img { filter: drop-shadow(0 0 5px rgba(255,140,240,0.7)); }
/* ── THE WINNER, AND WHY IT USED TO BE INVISIBLE ──────────────────────────────────────────────────────────
   The landing maths always brought the winning wedge to dead top, which is correct — and dead top is the one
   spot on the whole wheel the player cannot see. Measured off wheel-frame.png's alpha channel: at 0° the wolf
   ornament goes opaque at 23.7% of the rotor, and an icon centred at 28.5 spans 23.0–34.0. The prize you just
   won was sitting behind the wolf's snout. Every other wedge centre is clear (the rim starts at 34.8% there),
   so the eye skipped to the fully-visible neighbours at ±18° — which is exactly how a 50-gold win got read as
   the jackpot two wedges over.
   Fix: once the disc has STOPPED, the rotor rises above the frame so the won icon draws in front of the
   ornament, spotlit, held in the wolf's jaws. Only while stopped — mid-spin the icons must still sweep behind
   the frame or the whole thing looks like stickers on glass.
   The pulse lives on the IMG, never on .cw-ico — the ico's transform is its polar position (translate + the
   wedge's own rotation), set inline, and the old keyframe overwrote it with rotate(var(--rot)) against a
   variable nothing sets, so the winner nudged itself off its wedge while it celebrated. */
.cw-ring.has-won .cw-rotor { z-index: 4; }
.cw-ico.is-won { z-index: 5; }
.cw-ico.is-won::before { content: ""; position: absolute; inset: -80%; border-radius: 50%; z-index: -1;
    background: radial-gradient(circle, rgba(255,215,94,0.6), rgba(255,150,30,0.24) 42%, transparent 70%);
    animation: cwWonHalo 1.1s ease-in-out infinite alternate; }
.cw-ico.is-won .cw-ico-img { animation: cwWon 1.1s ease-in-out infinite alternate; }
@keyframes cwWonHalo { from { opacity: 0.5; transform: scale(0.84); } to { opacity: 1; transform: scale(1.14); } }
@keyframes cwWon { from { transform: scale(1.06); filter: drop-shadow(0 0 5px #ffd75e); }
    to { transform: scale(1.3); filter: drop-shadow(0 0 16px #ffd75e) drop-shadow(0 0 26px #ffb020); } }
.cw-frame { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.45)); }
.cw-stage.is-spinning .cw-frame { animation: cwBuzz 0.14s steps(2) infinite; }
@keyframes cwBuzz { 0% { transform: translate(0,0); } 50% { transform: translate(0,-0.6px); } }


.cw-result { margin: 10px 0 0; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); animation: cwPop .35s cubic-bezier(.2,1.4,.35,1) both; }
.cw-result-img { width: 54px; height: 54px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5)); }
.cw-result-kicker { font-size: 11px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #9aa2ab; }
.cw-result-prize { font-size: 1.05rem; font-weight: 900; color: #fff; }
.cw-result.tier-rare { border-color: rgba(92,224,192,0.5); } .cw-result.tier-rare .cw-result-kicker { color: #8bf5d6; }
.cw-result.tier-bonus { border-color: rgba(255,140,240,0.5); } .cw-result.tier-bonus .cw-result-kicker { color: #ffb6f2; }
.cw-result.tier-mini { border-color: rgba(200,150,255,0.6); } .cw-result.tier-mini .cw-result-kicker { color: #d3aaff; }
.cw-result.tier-jackpot { border-color: rgba(255,215,94,0.7); background: rgba(255,215,94,0.08); } .cw-result.tier-jackpot .cw-result-kicker { color: #ffe28a; }
.cw-msg { margin: 10px 0 0; text-align: center; font-size: 0.85rem; color: #ffd1a1; }

.cw-actions { display: flex; gap: 10px; margin: 12px 0 0; }
.cw-go { flex: 1; padding: 13px; border-radius: 13px; border: none; cursor: pointer; font-weight: 900; font-size: 1rem; letter-spacing: 0.03em; color: #201206; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12, 0 8px 20px -6px rgba(255,176,32,0.6); }
.cw-go:active { transform: translateY(2px); box-shadow: 0 1px 0 #b47a12; }
@keyframes cwPulse { 0%,100% { box-shadow: 0 3px 0 #b47a12, 0 0 18px rgba(255,206,90,0.6); } 50% { box-shadow: 0 3px 0 #b47a12, 0 0 30px rgba(255,206,90,0.95); } }
.cw-buy { flex: none; padding: 13px 16px; border-radius: 13px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e6ebf2; font-weight: 800; font-size: 0.9rem; cursor: pointer; }
.cw-buy:disabled { opacity: 0.5; cursor: default; }

.cw-legend { margin: 14px 0 0; }
.cw-legend > summary { cursor: pointer; font-weight: 800; font-size: 0.9rem; list-style: none; display: flex; align-items: center; gap: 8px; }
.cw-legend > summary::-webkit-details-marker { display: none; }
.cw-legend > summary span { font-size: 11px; color: #9aa2ab; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.06); }
.cw-legend > summary::after { content: "▸"; margin-left: auto; color: #9aa2ab; transition: transform .18s; }
.cw-legend[open] > summary::after { transform: rotate(90deg); }
.cw-legend-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin-top: 10px; }
.cw-leg { display: flex; align-items: center; gap: 7px; padding: 5px 9px; border-radius: 9px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); font-size: 12px; width: 100%; text-align: left; color: inherit; font-family: inherit; cursor: pointer; transition: transform .12s, background .12s, border-color .12s; }
.cw-leg:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,215,94,0.4); transform: translateY(-1px); }
.cw-leg:active { transform: translateY(0); }
.cw-leg-img { width: 22px; height: 22px; object-fit: contain; flex: none; }
.cw-leg-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cw-leg-odds { font-size: 10.5px; color: #9aa2ab; font-weight: 700; font-variant-numeric: tabular-nums; }
.cw-leg.tier-rare { border-color: rgba(92,224,192,0.35); }
.cw-leg.tier-bonus { border-color: rgba(255,140,240,0.35); }
.cw-leg.tier-mini { border-color: rgba(200,150,255,0.4); }
.cw-leg.tier-jackpot { border-color: rgba(255,215,94,0.5); background: rgba(255,215,94,0.06); }
.cw-hint { margin: 12px 0 0; font-size: 11px; color: #8a9099; text-align: center; line-height: 1.5; }

/* inspect card (tap a legend prize) */
.cw-inspect { position: relative; max-width: 320px; }
.cw-inspect-img { width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.55)); }
.cw-inspect-name { font-size: 1.2rem; font-weight: 900; color: #ffe9bf; margin-top: 6px; }
.cw-inspect-tier { display: inline-block; margin-top: 8px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; padding: 2px 10px; border-radius: 999px; color: #cbd2da; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); }
.cw-inspect-tier.tier-rare { color: #7defd0; border-color: rgba(92,224,192,0.5); background: rgba(92,224,192,0.08); }
.cw-inspect-tier.tier-bonus { color: #ff9cf0; border-color: rgba(255,140,240,0.5); background: rgba(255,140,240,0.08); }
.cw-inspect-tier.tier-mini { color: #d3b0ff; border-color: rgba(200,150,255,0.55); background: rgba(200,150,255,0.1); }
.cw-inspect-tier.tier-jackpot { color: #ffe28a; border-color: rgba(255,215,94,0.6); background: rgba(255,215,94,0.1); }
.cw-inspect-desc { margin: 12px 0 0; font-size: 13.5px; line-height: 1.5; color: #ecd6bc; }
.cw-inspect-odds { margin-top: 12px; font-size: 12px; color: #9aa2ab; }
.cw-inspect-odds b { color: #ffe28a; font-variant-numeric: tabular-nums; }

/* modals (mini wheel + bonus game) */
.cw-modal { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 18px; background: rgba(6,4,10,0.78); backdrop-filter: blur(4px); }
.cw-modal-card { width: 100%; max-width: 360px; text-align: center; padding: 20px; border-radius: 20px; background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.5); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 44px rgba(255,190,60,0.3); animation: cwPop .35s cubic-bezier(.2,1.4,.35,1) both; }
.cw-modal-title { font-size: 1.3rem; font-weight: 900; color: #ffe28a; text-shadow: 0 2px 10px rgba(255,180,40,0.5); }
.cw-modal-sub { font-size: 0.85rem; color: #d3bd98; margin: 4px 0 12px; }
/* Was a fixed 240px. The disc is the whole show in this modal and the card has room for 300. */
.cw-mini-stage { position: relative; width: min(300px, 100%); aspect-ratio: 1; margin: 10px auto 6px; }
.cw-mini-rotor { position: absolute; inset: 0; transform-origin: center; }
.cw-mini-disc { width: 100%; height: 100%; border-radius: 50%; }
/* Drawn, not typed. A ▼ renders as a different shape (and sometimes a colour emoji) per platform. */
.cw-mini-pointer { position: absolute; top: -3px; left: 50%; transform: translateX(-50%); z-index: 3; width: 0; height: 0;
    border-left: 13px solid transparent; border-right: 13px solid transparent; border-top: 20px solid #ffd75e;
    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.75)) drop-shadow(0 0 8px rgba(255,190,60,0.7)); }
/* Nine wedges of 40° give each icon a lot more arc than the main wheel's 18°, so they're painted bigger. */
.cw-mini-ico { width: 16%; height: 16%; }
.cw-modal-won { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 12px 0 4px; font-size: 1rem; color: #ecd6bc; }
.cw-modal-won b { color: #fff; }
.cw-modal-won-img { width: 42px; height: 42px; object-fit: contain; }
.cw-collect { margin-top: 14px; padding: 11px 28px; border-radius: 12px; border: none; cursor: pointer; font-weight: 900; color: #201206; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
/* ── BONUS GAME — full-screen match-3 (first-class, big, juicy, escapable) ── */
.cw-bonus-full { position: fixed; inset: 0; z-index: 320; display: grid; place-items: center; padding: 12px; overflow: hidden;
    background: radial-gradient(120% 90% at 50% 0%, #2a1c40, #0a0612 70%); animation: cwFade .25s ease both; }
@keyframes cwFade { from { opacity: 0; } to { opacity: 1; } }
.cw-bonus-close { position: fixed; top: 14px; right: 14px; z-index: 2; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.4); color: #fff; font-size: 18px; font-weight: 900; cursor: pointer; }
/* Fit the whole board in the viewport — never scroll. The grid width is capped by height (dvh) so 3 rows of
   tiles always fit; header spacing is compact so the board is the star. */
.cw-bonus-inner { width: 100%; max-width: 480px; max-height: 100dvh; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.cw-bonus-title { font-size: clamp(1.15rem, 5vw, 1.5rem); font-weight: 900; color: #ffe28a; text-shadow: 0 2px 14px rgba(255,180,40,0.6); letter-spacing: 0.02em; }
.cw-bonus-sub { font-size: 0.86rem; color: #d9c7ff; margin: 3px 0 8px; }
.cw-bonus-track { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.cw-bonus-track-item { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 3px 6px 2px; border-radius: 9px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); min-width: 38px; }
.cw-bonus-track-item img { width: 22px; height: 22px; object-fit: contain; }
.cw-bonus-track-item span { font-size: 10px; font-weight: 900; color: #b7a6e0; font-variant-numeric: tabular-nums; }
.cw-bonus-track-item.is-hit { border-color: #ffd75e; background: rgba(255,215,94,0.18); box-shadow: 0 0 14px rgba(255,215,94,0.6); }
.cw-bonus-track-item.is-hit span { color: #ffe28a; }
.cw-bonus-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; width: min(94vw, 480px, calc((100dvh - 220px) * 2)); margin: 0 auto; }
.cw-btile { aspect-ratio: 1; border: none; background: none; padding: 0; cursor: pointer; perspective: 600px; }
.cw-btile:not(:disabled):active { transform: scale(0.94); }
.cw-btile-flip { position: relative; display: block; width: 100%; height: 100%; transition: transform .45s cubic-bezier(.3,1.2,.4,1); transform-style: preserve-3d; }
.cw-btile.is-open .cw-btile-flip { transform: rotateY(180deg); }
.cw-btile-face { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 14px; backface-visibility: hidden; -webkit-backface-visibility: hidden; padding: 8px; }
.cw-btile-back { background: linear-gradient(180deg, #3a2a5e, #241640); border: 1px solid rgba(180,140,255,0.4); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
.cw-btile-back img { width: 76%; height: 76%; object-fit: contain; opacity: 0.95; }
.cw-btile-front { transform: rotateY(180deg); background: radial-gradient(circle at 50% 35%, rgba(120,90,200,0.4), rgba(20,12,40,0.9)); border: 1px solid rgba(120,220,255,0.35); }
.cw-btile-front img { width: 84%; height: 84%; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }
.cw-btile.is-win .cw-btile-front { border-color: #ffd75e; box-shadow: 0 0 22px rgba(255,215,94,0.9); animation: cwWinPulse 1s ease-in-out infinite; }
.cw-btile.is-dim { opacity: 0.5; }
@keyframes cwWinPulse { 0%,100% { box-shadow: 0 0 16px rgba(255,215,94,0.7); } 50% { box-shadow: 0 0 30px rgba(255,215,94,1); } }
.cw-bonus-win { position: relative; margin-top: 10px; display: flex; flex-direction: column; align-items: center; gap: 6px; animation: cwPop .4s cubic-bezier(.2,1.4,.35,1) both; --rar: #4aa3ff; }
/* rotating rarity-colored ray burst behind the prize */
.cw-bonus-win-rays { position: absolute; top: -34px; width: 260px; height: 260px; border-radius: 50%; pointer-events: none;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--rar) 55%, transparent) 0deg 8deg, transparent 8deg 20deg);
    -webkit-mask: radial-gradient(circle, transparent 34px, #000 40px, transparent 122px); mask: radial-gradient(circle, transparent 34px, #000 40px, transparent 122px);
    opacity: 0.55; animation: cwRays 9s linear infinite; }
@keyframes cwRays { to { transform: rotate(360deg); } }
.cw-bonus-win-burst { position: absolute; top: -18px; width: 190px; height: 190px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--rar) 55%, transparent), transparent 62%); filter: blur(5px); animation: cwHalo 1.6s ease-in-out infinite; }
.cw-bonus-win-confetti { position: absolute; top: -30px; left: 50%; width: 300px; height: 220px; transform: translateX(-50%); overflow: hidden; pointer-events: none; }
.cw-bonus-win-confetti span { position: absolute; top: -12px; width: 8px; height: 12px; border-radius: 2px; opacity: 0; animation: cwBonusConfetti 1.5s ease-in forwards; }
@keyframes cwBonusConfetti { 0% { transform: translateY(0) rotate(0deg); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(230px) rotate(540deg); opacity: 0; } }
.cw-bonus-win-frame { position: relative; width: 116px; height: 116px; display: grid; place-items: center; border-radius: 22px; margin-bottom: 2px;
    background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--rar) 32%, transparent), rgba(10,6,20,0.65));
    border: 2px solid var(--rar); box-shadow: 0 0 26px color-mix(in srgb, var(--rar) 75%, transparent), inset 0 0 18px color-mix(in srgb, var(--rar) 30%, transparent); animation: cwFramePulse 1.3s ease-in-out infinite; }
@keyframes cwFramePulse { 0%,100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.045); filter: brightness(1.12); } }
.cw-bonus-win-img { position: relative; width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6)); animation: cwSpin .6s ease both, cwBob 2.4s ease-in-out .6s infinite; }
@keyframes cwBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
.cw-bonus-win-rar { position: relative; font-size: 0.8rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: var(--rar); text-shadow: 0 0 12px color-mix(in srgb, var(--rar) 70%, transparent); }
.cw-bonus-win-txt { position: relative; font-size: 1.2rem; color: #ecd6bc; } .cw-bonus-win-txt b { color: #fff; }
.cw-bonus-win-stats { position: relative; font-size: 0.9rem; font-weight: 800; color: #d7e9ff; background: rgba(255,255,255,0.06); border: 1px solid color-mix(in srgb, var(--rar) 45%, transparent); border-radius: 999px; padding: 4px 12px; }
.cw-bonus-hint { margin-top: 10px; font-size: 11px; color: #9a8fc0; }

.cw-celebrate { position: fixed; inset: 0; z-index: 320; display: grid; place-items: center; background: rgba(6,4,10,0.72); backdrop-filter: blur(3px); }
.cw-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.cw-confetti span { position: absolute; top: -12px; width: 9px; height: 14px; border-radius: 2px; animation: cwFall 3.4s linear infinite; }
@keyframes cwFall { 0% { transform: translateY(-20px) rotate(0); opacity: 1; } 100% { transform: translateY(102vh) rotate(720deg); opacity: 0.9; } }
.cw-celebrate-card { position: relative; text-align: center; padding: 26px 34px; border-radius: 20px; background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.55); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 50px rgba(255,190,60,0.4); animation: cwPop .4s cubic-bezier(.2,1.4,.35,1) both; }
.cw-celebrate-img { width: 84px; height: 84px; object-fit: contain; animation: cwSpin .7s ease both; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); }
.cw-celebrate-title { font-size: 1.6rem; font-weight: 900; color: #ffe28a; text-shadow: 0 2px 12px rgba(255,180,40,0.6); letter-spacing: 0.04em; }
.cw-celebrate-sub { font-size: 1rem; color: #ecd6bc; margin-top: 4px; }

/* ── MAJOR JACKPOT DETONATION ───────────────────────────────────────────────────────────────────────────── */
.cw-celebrate-jackpot { background: rgba(10,4,0,0.82); }
.cw-flash { position: absolute; inset: 0; background: #fff; pointer-events: none; animation: cwFlash 0.9s ease-out both; }
@keyframes cwFlash { 0% { opacity: 0.95; } 22% { opacity: 0.35; } 100% { opacity: 0; } }
.cw-shock { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.cw-shock span { position: absolute; width: 120px; height: 120px; border-radius: 50%; border: 3px solid rgba(255,215,94,0.85);
    box-shadow: 0 0 30px rgba(255,190,60,0.7), inset 0 0 26px rgba(255,190,60,0.45); animation: cwShock 1.5s cubic-bezier(.16,.72,.3,1) both; }
.cw-shock span:nth-child(2) { animation-delay: 0.16s; border-color: rgba(255,243,196,0.75); }
.cw-shock span:nth-child(3) { animation-delay: 0.34s; border-color: rgba(255,160,40,0.6); }
@keyframes cwShock { from { transform: scale(0.2); opacity: 1; } to { transform: scale(9); opacity: 0; } }
.cw-shards { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; overflow: hidden; }
/* Each shard is thrown along its own angle: rotate to the bearing, then translate outward along it. */
.cw-shards span { position: absolute; width: 7px; height: 20px; border-radius: 2px; transform-origin: center;
    animation: cwShard 1.5s cubic-bezier(.12,.7,.25,1) both; }
@keyframes cwShard { from { transform: rotate(var(--a)) translateY(0) scale(1); opacity: 1; }
    to { transform: rotate(var(--a)) translateY(-62vh) scale(0.35); opacity: 0; } }
.cw-celebrate-jackpot .cw-celebrate-card { animation: cwPop .4s cubic-bezier(.2,1.4,.35,1) both, cwQuake 0.5s 0.1s ease-in-out 3; }
.cw-celebrate-jackpot .cw-celebrate-img { width: 116px; height: 116px; filter: drop-shadow(0 0 22px rgba(255,215,94,0.95)); }
.cw-celebrate-jackpot .cw-celebrate-title { font-size: 2.2rem; }
@keyframes cwQuake { 0%,100% { margin-left: 0; } 25% { margin-left: -5px; } 75% { margin-left: 5px; } }
.cw-celebrate-brag { margin-top: 6px; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.09em; color: #ffb020; text-transform: uppercase; }
@keyframes cwPop { from { opacity: 0; transform: scale(.85) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes cwSpin { from { transform: rotate(-30deg) scale(.6); } to { transform: rotate(0) scale(1); } }

/* Wheelwarden free-spin flash — non-blocking celebratory burst */
.cw-refund { position: fixed; inset: 0; z-index: 330; display: grid; place-items: center; pointer-events: none; }
.cw-refund-confetti { position: absolute; inset: 0; overflow: hidden; }
.cw-refund-confetti span { position: absolute; top: -14px; width: 8px; height: 13px; border-radius: 2px; opacity: 0; animation: cwRefundFall 1.5s ease-in forwards; }
@keyframes cwRefundFall { 0% { transform: translateY(0) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(105vh) rotate(680deg); opacity: 0; } }
.cw-refund-pill { display: inline-flex; align-items: center; gap: 12px; padding: 14px 22px; border-radius: 999px;
    background: linear-gradient(180deg, #1f3a22, #12240f); border: 1px solid rgba(143,227,154,0.7);
    box-shadow: 0 16px 44px rgba(0,0,0,0.6), 0 0 34px rgba(143,227,154,0.5); animation: cwRefundPop .5s cubic-bezier(.2,1.5,.35,1) both; }
@keyframes cwRefundPop { 0% { opacity: 0; transform: scale(.6) translateY(10px); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
.cw-refund-clover { font-size: 34px; animation: cwRefundSpin .6s ease both, cwBob 1.8s ease-in-out .6s infinite; }
@keyframes cwRefundSpin { from { transform: rotate(-40deg) scale(.4); } to { transform: rotate(0) scale(1); } }
.cw-refund-txt { display: flex; flex-direction: column; line-height: 1.15; }
.cw-refund-txt b { font-size: 1.2rem; font-weight: 900; color: #b6f2be; letter-spacing: 0.03em; text-shadow: 0 0 12px rgba(143,227,154,0.6); }
.cw-refund-txt small { font-size: 0.72rem; color: #cfe8d6; }
`;
