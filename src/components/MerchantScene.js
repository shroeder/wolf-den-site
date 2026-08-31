"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import CoinCta from "@/components/CoinCta";
import Coin from "@/components/Coin";

// The Gold Merchant island event — shown when you LAND (before the dig) if he rolled in. A coin-catch arcade
// minigame (move to catch falling gold, dodge the bricks, 3 lives, ~20s), his discounted exclusive shop, a
// rare free pet, and funky synth music. All rewards are server-authoritative; this drives the visuals + reports
// the minigame score (clamped server-side to [floor, ceil]).
const MERCHANT_ART = "/images/sailing/merchant.png";
const ELEPHANT_ART = "/images/sailing/pet-elephant.png";
const GAME_MS = 20000;

// Static coin-shower config for the beach stage (deterministic → no hydration mismatch). Coins rain across the
// whole stage and spin/drift so it reads as "coins flying everywhere." Negative delays pre-fill the field.
const STAGE_COINS = Array.from({ length: 18 }, (_, i) => ({
    i,
    left: (i * 53 + 7) % 100,          // spread across the width
    delay: -(((i * 0.41) % 3.4).toFixed(2)), // negative → coins already mid-air on mount
    dur: 2.3 + ((i * 7) % 22) / 10,    // 2.3–4.4s fall
    drift: ((i % 5) - 2) * 18,         // -36..+36px sideways sway
    size: 12 + (i % 3) * 5,            // 12 / 17 / 22px
}));

// ── Funky synth loop (Web-Audio, no asset files, CSP-safe). Best-effort; silent if audio is blocked. ──
function makeFunkMusic() {
    let ctx = null, timer = null, step = 0;
    const bass = [55, 55, 82.4, 55, 73.4, 55, 65.4, 98]; // a walking-ish funky bass in A
    const stab = [220, 261.6, 329.6]; // a bright chord stab
    const beat = () => {
        if (!ctx) return;
        const t = ctx.currentTime;
        // bass pluck
        const b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = "sawtooth"; b.frequency.value = bass[step % bass.length];
        bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.16, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        b.connect(bg).connect(ctx.destination); b.start(t); b.stop(t + 0.24);
        // off-beat chord stab
        if (step % 2 === 1) {
            stab.forEach((f) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = "square"; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
                o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.16);
            });
        }
        // hi-hat (noise burst)
        const buf = ctx.createBuffer(1, 800, ctx.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        const n = ctx.createBufferSource(); n.buffer = buf; const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.03, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        n.connect(ng).connect(ctx.destination); n.start(t);
        step += 1;
    };
    return {
        start() {
            try {
                const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
                ctx = new AC(); if (ctx.state === "suspended") ctx.resume().catch(() => {});
                step = 0; beat(); timer = setInterval(beat, 214); // ~140 BPM eighths
            } catch { /* audio blocked */ }
        },
        stop() { if (timer) clearInterval(timer); timer = null; if (ctx) ctx.close().catch(() => {}); ctx = null; },
    };
}

export default function MerchantScene({ merchant, gold = 0, floor = 20, ceil = 300, busy, heroImg, onPlay, onBuy, onLeave }) {
    const [phase, setPhase] = useState(merchant.minigamePlayed ? "done" : "intro"); // intro | playing | done
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [lives, setLives] = useState(3);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(GAME_MS / 1000);
    const [render, setRender] = useState({ entities: [], playerX: 0.5, hitAt: 0, floaters: [], combo: 0, mult: 1 }); // per-frame render snapshot
    const [recap, setRecap] = useState(null);      // post-game recap modal data (null = closed)
    const [recapReady, setRecapReady] = useState(false); // recap accepts the "Continue" click (anti-misclick delay)
    const areaRef = useRef(null);
    const padRef = useRef(null);
    const gs = useRef({ entities: [], eid: 0, playerX: 0.5, targetX: 0.5, lives: 3, score: 0, missed: 0, combo: 0, bestCombo: 0, floaters: [], fid: 0, running: false, endAt: 0, last: 0, lastSpawn: 0, spawnGap: 500, hitAt: 0 });
    const raf = useRef(0);
    const music = useRef(null);
    const loopRef = useRef(null); // holds the latest loop fn so it can schedule itself without a self-reference

    // Music plays for the whole scene; clean up on unmount.
    useEffect(() => {
        music.current = makeFunkMusic();
        music.current.start();
        return () => { music.current?.stop(); cancelAnimationFrame(raf.current); };
    }, []);

    const endGame = useCallback(() => {
        const s = gs.current;
        if (!s.running) return;
        s.running = false;
        cancelAnimationFrame(raf.current);
        const gold = Math.max(floor, Math.min(ceil, s.score));
        const perfect = s.lives >= 3 && s.missed === 0; // caught EVERY coin AND never took a hit
        setRecap({ gold, hits: 3 - s.lives, missed: s.missed, perfect });
        setRecapReady(false);
        setPhase("done");
        onPlay(gold, perfect); // server clamps + grants the badge/pet on a perfect run
    }, [onPlay, floor, ceil]);
    // Anti-misclick: the recap ignores clicks for a beat after it appears (you're often mid-tapping the game).
    useEffect(() => { if (!recap) return undefined; const t = setTimeout(() => setRecapReady(true), 750); return () => clearTimeout(t); }, [recap]);

    const loop = useCallback((now) => {
        const s = gs.current;
        if (!s.running) return;
        // Frame-rate INDEPENDENT: advance by real elapsed time so it plays identically on 60Hz and 120Hz
        // screens (and never speeds up / stalls on a janky frame). Velocities below are in px/SECOND.
        const dt = Math.min(0.05, ((now - (s.last || now)) / 1000) || 0);
        s.last = now;
        const area = areaRef.current;
        const W = area?.clientWidth || 320, H = area?.clientHeight || 360;
        if (now - s.lastSpawn > s.spawnGap) {
            s.lastSpawn = now; s.spawnGap = 360 + Math.random() * 420;
            const brick = Math.random() < 0.2;
            // Coins spill from the merchant's hands (top-center); bricks he lobs from anywhere.
            const x = brick ? 0.08 + Math.random() * 0.84 : 0.5 + (Math.random() - 0.5) * 0.7;
            s.entities.push({ id: (s.eid += 1), x: Math.max(0.06, Math.min(0.94, x)), y: -24, vy: (brick ? 165 : 135) + Math.random() * 80, type: brick ? "brick" : "gold" });
        }
        const px = s.playerX * W, catchY = H - 56;
        s.entities = s.entities.filter((e) => {
            e.y += e.vy * dt;
            const near = e.y > catchY - 34 && e.y < catchY + 26 && Math.abs(e.x * W - px) < 50;
            if (near) {
                if (e.type === "gold") {
                    s.combo += 1; if (s.combo > s.bestCombo) s.bestCombo = s.combo;
                    const mult = comboMult(s.combo);
                    const amt = Math.round((2 + Math.floor(Math.random() * 5)) * mult); // tuned so a great run lands ~150, not 300
                    s.score += amt;
                    s.floaters.push({ id: (s.fid += 1), x: e.x, y: catchY, txt: `+${amt}`, kind: mult > 1 ? "big" : "gold", born: now });
                    return false;
                }
                s.lives -= 1; s.hitAt = now; s.combo = 0;
                s.floaters.push({ id: (s.fid += 1), x: e.x, y: catchY, txt: "−1 ❤", kind: "hit", born: now });
                if (s.lives <= 0) { endGame(); return false; }
                return false;
            }
            if (e.y >= H + 34) { if (e.type === "gold") { s.missed += 1; s.combo = 0; } return false; } // a coin fell past uncaught
            return true;
        });
        s.floaters = s.floaters.filter((f) => now - f.born < 750);
        s.playerX += (s.targetX - s.playerX) * Math.min(1, dt * 22); // snappy, dt-normalized follow of your thumb
        setLives(s.lives); setScore(s.score); setTimeLeft(Math.max(0, Math.ceil((s.endAt - now) / 1000)));
        setRender({
            entities: s.entities.map((e) => ({ id: e.id, x: e.x, y: e.y, type: e.type })),
            playerX: s.playerX, hitAt: s.hitAt,
            floaters: s.floaters.map((f) => ({ id: f.id, x: f.x, y: f.y, txt: f.txt, kind: f.kind })),
            combo: s.combo, mult: comboMult(s.combo),
        });
        if (now >= s.endAt) { endGame(); return; }
        raf.current = requestAnimationFrame((t) => loopRef.current && loopRef.current(t));
    }, [endGame]);
    useEffect(() => { loopRef.current = loop; }, [loop]);

    const start = useCallback(() => {
        // ── PLAYED IS PLAYED, WHATEVER THE HISTORY STACK SAYS ────────────────────────────────────────────
        // Luke: "if you get the coin catch minigame, finish it, click get gold, click browser back, you can
        // do it again."
        //
        // The SERVER has always been safe — merchantMinigame pays under an atomic guard on minigamePlayed, and
        // 65 payouts over ten days show no member ever collecting twice. So nothing was ever double-paid. But
        // going back re-mounted this component with a stale `merchant` prop, `phase` initialised to "intro"
        // off it, and the whole catch played again for a reward the server would refuse — a minute of somebody's
        // evening spent on a result that could not exist.
        //
        // Guarded here rather than by hiding the button, because the history stack can put you in front of any
        // button it likes; the refusal has to sit on the thing that starts the game.
        if (merchant.minigamePlayed) { setPhase("done"); return; }
        const s = gs.current;
        s.entities = []; s.playerX = 0.5; s.targetX = 0.5; s.lives = 3; s.score = 0; s.missed = 0;
        s.combo = 0; s.bestCombo = 0; s.floaters = []; s.running = true;
        s.last = performance.now(); s.lastSpawn = performance.now(); s.spawnGap = 500; s.endAt = performance.now() + GAME_MS;
        setLives(3); setScore(0); setTimeLeft(GAME_MS / 1000); setPhase("playing");
        raf.current = requestAnimationFrame((t) => loopRef.current && loopRef.current(t));
    }, [merchant.minigamePlayed]);

    // Move by an absolute clientX relative to a control element (the pad OR the arena — either works).
    const moveByEl = useCallback((el, clientX) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        gs.current.targetX = Math.max(0.05, Math.min(0.95, (clientX - r.left) / r.width));
    }, []);
    const move = useCallback((clientX) => moveByEl(areaRef.current, clientX), [moveByEl]);
    const movePad = useCallback((clientX) => moveByEl(padRef.current, clientX), [moveByEl]);

    const played = phase === "done" || merchant.minigamePlayed;

    if (!mounted) return null;
    return createPortal((
        <div className="merchant-cine">
            <div className="merchant-cine-inner">
                {/* Immersive beach stage: the merchant stands on the sand under a golden-hour sky, showering coins. */}
                <div className={`merchant-stage${phase === "playing" ? " is-compact" : ""}`}>
                    <div className="merchant-coinfall" aria-hidden="true">
                        {STAGE_COINS.map((c) => (
                            <span
                                key={c.i}
                                className="merchant-coin"
                                style={{ left: `${c.left}%`, width: c.size, height: c.size, marginLeft: -(c.size / 2), "--drift": `${c.drift}px`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
                            />
                        ))}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={MERCHANT_ART} alt="The Gold Merchant" className="merchant-figure" />
                    <div className="merchant-stage-cap">💰 The Gold Merchant!</div>
                </div>
                <p className="muted merchant-sub">A rare showman on the sand, coins flying everywhere. Catch what you can, then browse his wares.</p>

                {phase === "playing" ? (
                    <>
                    <div
                        className="mg-area" ref={areaRef}
                        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") move(e.clientX); }}
                        onTouchMove={(e) => { if (e.touches[0]) move(e.touches[0].clientX); }}
                    >
                        <div className="mg-hud">
                            <span>{"❤️".repeat(Math.max(0, lives))}<span style={{ opacity: 0.3 }}>{"❤️".repeat(Math.max(0, 3 - lives))}</span></span>
                            <span className="mg-hud-score"><Coin /> {score}</span>
                            <span>⏱️ {timeLeft}s</span>
                        </div>
                        {/* The merchant leans in from the top, flinging the coins into play. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="mg-tosser" src={MERCHANT_ART} alt="" />
                        {render.combo >= 3 ? (
                            <div className={`mg-combo${render.mult >= 1.75 ? " is-hot" : ""}`}>{render.combo}× combo · <b>{render.mult}×</b> gold</div>
                        ) : null}
                        {render.entities.map((e) => (
                            <span key={e.id} className={e.type === "gold" ? "mg-gold" : "mg-brick"} style={{ left: `${e.x * 100}%`, top: `${e.y}px` }} />
                        ))}
                        {render.floaters.map((f) => (
                            <span key={f.id} className={`mg-float mg-float-${f.kind}`} style={{ left: `${f.x * 100}%`, top: `${f.y}px` }}>{f.txt}</span>
                        ))}
                        {/* Catch-zone glow so you can read where the catch line is without your finger anywhere near it. */}
                        <span className="mg-catchline" />
                        <span className={`mg-player${hitClass(render.hitAt)}`} style={{ left: `${render.playerX * 100}%` }}>
                            <span className="mg-player-glow" />
                            {heroImg ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={heroImg} alt="" />
                            ) : "🧍"}
                        </span>
                    </div>
                    {/* Control PAD below the field — slide your thumb here so it never covers the coins or your guy. */}
                    <div
                        className="mg-pad" ref={padRef}
                        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); movePad(e.clientX); }}
                        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") movePad(e.clientX); }}
                        onTouchStart={(e) => { if (e.touches[0]) movePad(e.touches[0].clientX); }}
                        onTouchMove={(e) => { if (e.touches[0]) movePad(e.touches[0].clientX); }}
                    >
                        <span className="mg-pad-knob" style={{ left: `${render.playerX * 100}%` }}>⛵</span>
                        <span className="mg-pad-label">◀ slide your thumb to move ▶</span>
                    </div>
                    </>) : (
                    <>
                        {played ? (
                            <div className="merchant-won"><Coin /> You caught <strong>{merchant.goldWon || Math.max(floor, Math.min(ceil, score))}</strong> gold from the coin toss!</div>
                        ) : (
                            <button type="button" className="sail-cta sail-cta-wind" onClick={start}><Coin /> Catch the coin toss!</button>
                        )}

                        {/* 10th-meeting milestone: the exclusive elephant pet is yours (not tied to the minigame). */}
                        {merchant.petGranted ? (
                            <div className="merchant-won" style={{ borderColor: "rgba(124,201,255,0.5)", color: "#bfe3ff" }}>🐘 <strong>10th meeting!</strong> The Merchant&apos;s Guard is yours — equip it to find him more often.</div>
                        ) : null}
                        {played && merchant.perfect ? (
                            <div className="merchant-won">✨ Perfect run — flawless coin catch!</div>
                        ) : null}

                        <h4 style={{ margin: "14px 0 6px" }}>🛍️ Exclusive wares <span className="muted" style={{ fontWeight: 600, fontSize: "0.78rem" }}>· you own <Coin /> {gold.toLocaleString()}</span></h4>
                        {/* Buy coins right from the merchant — he trades in gold, after all. The merchant WAITS on your
                            beach until you dig, so nipping off to top up your coins never loses him. */}
                        <Link href="/marketplace/credit" className="merchant-buycoins">
                            <span className="merchant-buycoins-ico" aria-hidden="true">💰</span>
                            <span className="merchant-buycoins-body">
                                <strong>Buy more coins</strong>
                                <span>Top up your gold — the merchant waits right here.</span>
                            </span>
                            <span className="merchant-buycoins-go">Get coins →</span>
                        </Link>
                        <div className="merchant-shop">
                            {(merchant.shop || []).map((it) => {
                                const afford = gold >= it.price;
                                return (
                                    <div key={it.id} className={`merchant-item${it.bought ? " is-bought" : ""}`}>
                                        <span className="merchant-item-emoji">{it.emoji}</span>
                                        <div className="merchant-item-body">
                                            <strong>{it.name} <span className="merchant-off">-{it.off}%</span></strong>
                                            <span className="muted" style={{ fontSize: "0.76rem" }}>{it.desc}</span>
                                        </div>
                                        {/* ONE OF EACH PER DAY. Said on the button rather than on the tap: a price
                                            you can see and press, that then refuses, is worse than no button. */}
                                        {it.bought ? (
                                            <button type="button" className="btn btn-small" disabled>Bought today</button>
                                        ) : afford ? (
                                            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onBuy(it.id)}><Coin /> {it.price.toLocaleString()}</button>
                                        ) : (
                                            <CoinCta price={it.price} have={gold} label="coins" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <button type="button" className="sail-cta sail-cta-dig" disabled={busy} onClick={onLeave} style={{ marginTop: 16 }}>
                            <span className="sail-cta-ico">⛏️</span> Take my leave — dig for treasure
                        </button>
                    </>
                )}
            </div>

            {/* Post-game recap so the sudden end has a beat. Ignores clicks for ~0.75s (anti-misclick). */}
            {recap ? (
                <div className="mg-recap-scrim">
                    <div className={`mg-recap${recap.perfect ? " is-perfect" : ""}`}>
                        <div className="mg-recap-title">{recap.perfect ? "✨ PERFECT RUN! ✨" : "Coin toss complete!"}</div>
                        <div className="mg-recap-stats">
                            <div><span><Coin /> Gold caught</span><strong>{recap.gold}</strong></div>
                            <div><span>💥 Hits taken</span><strong>{recap.hits}</strong></div>
                            <div><span>💨 Coins missed</span><strong>{recap.missed}</strong></div>
                        </div>
                        {merchant.petGranted ? (
                            <div className="merchant-pet mg-recap-pet">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ELEPHANT_ART} alt="Merchant's Guard" />
                                <div>
                                    <strong>🐘 The Merchant&apos;s Guard is yours!</strong>
                                    <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.8rem" }}>Your 10th meeting with the merchant — his exclusive elephant. Equip it to find him more often.</p>
                                </div>
                            </div>
                        ) : recap.perfect ? (
                            <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.82rem" }}>✨ Flawless run! Meet the merchant <strong>10 times</strong> to earn his exclusive elephant pet.</p>
                        ) : (
                            <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.82rem" }}>Meet the merchant <strong>10 times</strong> to earn his exclusive elephant pet.</p>
                        )}
                        <button type="button" className="btn-gold mg-recap-btn" disabled={!recapReady} onClick={() => setRecap(null)}>
                            {recapReady ? "Continue" : "…"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    ), document.body);
}

// Adds a brief hit-flash class to the player when they took a hit in the last 220ms.
function hitClass(hitAt) {
    return hitAt && performance.now() - hitAt < 220 ? " is-hit" : "";
}

// Combo multiplier: catching coins in a row without a miss/hit ramps the payout, so skilled play pays more.
function comboMult(combo) {
    if (combo >= 15) return 2;
    if (combo >= 10) return 1.75;
    if (combo >= 6) return 1.5;
    if (combo >= 3) return 1.25;
    return 1;
}
