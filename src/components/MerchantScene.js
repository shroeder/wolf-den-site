"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The Gold Merchant island event — shown when you LAND (before the dig) if he rolled in. A coin-catch arcade
// minigame (move to catch falling gold, dodge the bricks, 3 lives, ~20s), his discounted exclusive shop, a
// rare free pet, and funky synth music. All rewards are server-authoritative; this drives the visuals + reports
// the minigame score (clamped server-side to [floor, ceil]).
const MERCHANT_ART = "/images/sailing/merchant.png";
const ELEPHANT_ART = "/images/sailing/pet-elephant.png";
const GAME_MS = 20000;

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

export default function MerchantScene({ merchant, gold = 0, floor = 20, ceil = 300, busy, heroImg, onPlay, onBuy, onClaimPet, onLeave }) {
    const [phase, setPhase] = useState(merchant.minigamePlayed ? "done" : "intro"); // intro | playing | done
    const [lives, setLives] = useState(3);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(GAME_MS / 1000);
    const [render, setRender] = useState({ entities: [], playerX: 0.5, hitAt: 0 }); // per-frame render snapshot
    const areaRef = useRef(null);
    const gs = useRef({ entities: [], eid: 0, playerX: 0.5, targetX: 0.5, lives: 3, score: 0, running: false, endAt: 0, lastSpawn: 0, spawnGap: 500, hitAt: 0 });
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
        setPhase("done");
        onPlay(Math.max(floor, Math.min(ceil, s.score))); // server clamps too
    }, [onPlay, floor, ceil]);

    const loop = useCallback((now) => {
        const s = gs.current;
        if (!s.running) return;
        const area = areaRef.current;
        const W = area?.clientWidth || 320, H = area?.clientHeight || 360;
        if (now - s.lastSpawn > s.spawnGap) {
            s.lastSpawn = now; s.spawnGap = 340 + Math.random() * 460;
            const brick = Math.random() < 0.26;
            s.entities.push({ id: (s.eid += 1), x: 0.08 + Math.random() * 0.84, y: -24, vy: (brick ? 3.0 : 2.2) + Math.random() * 1.6, type: brick ? "brick" : "gold" });
        }
        const px = s.playerX * W, catchY = H - 42;
        s.entities = s.entities.filter((e) => {
            e.y += e.vy;
            const near = e.y > catchY - 30 && e.y < catchY + 22 && Math.abs(e.x * W - px) < 44;
            if (near) {
                if (e.type === "gold") { s.score += 5 + Math.floor(Math.random() * 11); return false; }
                s.lives -= 1; s.hitAt = now; if (s.lives <= 0) { endGame(); return false; }
                return false;
            }
            return e.y < H + 34;
        });
        s.playerX += (s.targetX - s.playerX) * 0.34;
        setLives(s.lives); setScore(s.score); setTimeLeft(Math.max(0, Math.ceil((s.endAt - now) / 1000)));
        setRender({ entities: s.entities.map((e) => ({ id: e.id, x: e.x, y: e.y, type: e.type })), playerX: s.playerX, hitAt: s.hitAt });
        if (now >= s.endAt) { endGame(); return; }
        raf.current = requestAnimationFrame((t) => loopRef.current && loopRef.current(t));
    }, [endGame]);
    useEffect(() => { loopRef.current = loop; }, [loop]);

    const start = useCallback(() => {
        const s = gs.current;
        s.entities = []; s.playerX = 0.5; s.targetX = 0.5; s.lives = 3; s.score = 0; s.running = true;
        s.lastSpawn = performance.now(); s.spawnGap = 500; s.endAt = performance.now() + GAME_MS;
        setLives(3); setScore(0); setTimeLeft(GAME_MS / 1000); setPhase("playing");
        raf.current = requestAnimationFrame((t) => loopRef.current && loopRef.current(t));
    }, []);

    const move = useCallback((clientX) => {
        const area = areaRef.current; if (!area) return;
        const r = area.getBoundingClientRect();
        gs.current.targetX = Math.max(0.05, Math.min(0.95, (clientX - r.left) / r.width));
    }, []);

    const petOfferable = merchant.petOffered && !merchant.petClaimed;

    return (
        <div className="merchant card">
            <div className="merchant-head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MERCHANT_ART} alt="The Gold Merchant" className="merchant-art" />
                <div>
                    <h3 style={{ margin: 0 }}>💰 The Gold Merchant!</h3>
                    <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.85rem" }}>A rare showman on the sand, coins flying everywhere. Catch what you can, then browse his wares.</p>
                </div>
            </div>

            {phase === "playing" ? (
                <div
                    className="mg-area" ref={areaRef}
                    onPointerMove={(e) => move(e.clientX)}
                    onTouchMove={(e) => { if (e.touches[0]) move(e.touches[0].clientX); }}
                >
                    <div className="mg-hud">
                        <span>{"❤️".repeat(Math.max(0, lives))}<span style={{ opacity: 0.3 }}>{"❤️".repeat(Math.max(0, 3 - lives))}</span></span>
                        <span>🪙 {score}</span>
                        <span>⏱️ {timeLeft}s</span>
                    </div>
                    {render.entities.map((e) => (
                        <span key={e.id} className={e.type === "gold" ? "mg-gold" : "mg-brick"} style={{ left: `${e.x * 100}%`, top: `${e.y}px` }} />
                    ))}
                    <span className={`mg-player${hitClass(render.hitAt)}`} style={{ left: `${render.playerX * 100}%`, bottom: 8 }}>
                        {heroImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={heroImg} alt="" />
                        ) : "🧍"}
                    </span>
                    <p className="mg-hint">Drag to move · catch 🪙 · dodge the bricks</p>
                </div>
            ) : (
                <>
                    {phase === "done" || merchant.minigamePlayed ? (
                        <div className="merchant-won">🪙 You caught <strong>{merchant.goldWon || Math.max(floor, Math.min(ceil, score))}</strong> gold from the coin toss!</div>
                    ) : (
                        <button type="button" className="sail-cta sail-cta-wind" onClick={start}>🪙 Catch the coin toss!</button>
                    )}

                    {petOfferable ? (
                        <div className="merchant-pet">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ELEPHANT_ART} alt="Merchant's Guard" />
                            <div>
                                <strong>✨ A rare gift: Merchant&apos;s Guard</strong>
                                <p className="muted" style={{ margin: "2px 0 6px", fontSize: "0.82rem" }}>An elephant warrior only he carries — equip it to raise your odds of finding him again.</p>
                                <button type="button" className="btn-gold" disabled={busy} onClick={onClaimPet}>🐘 Take the pet — free</button>
                            </div>
                        </div>
                    ) : merchant.petClaimed ? (
                        <div className="merchant-won">🐘 You took the Merchant&apos;s Guard!</div>
                    ) : null}

                    <h4 style={{ margin: "12px 0 6px" }}>🛍️ Exclusive wares <span className="muted" style={{ fontWeight: 600, fontSize: "0.78rem" }}>· you own 🪙 {gold.toLocaleString()}</span></h4>
                    <div className="merchant-shop">
                        {(merchant.shop || []).map((it) => (
                            <div key={it.id} className="merchant-item">
                                <span className="merchant-item-emoji">{it.emoji}</span>
                                <div className="merchant-item-body">
                                    <strong>{it.name} <span className="merchant-off">-{it.off}%</span></strong>
                                    <span className="muted" style={{ fontSize: "0.76rem" }}>{it.desc}</span>
                                </div>
                                <button type="button" className="btn btn-small" disabled={busy || gold < it.price} onClick={() => onBuy(it.id)}>🪙 {it.price.toLocaleString()}</button>
                            </div>
                        ))}
                    </div>

                    <button type="button" className="sail-cta sail-cta-dig" disabled={busy} onClick={onLeave} style={{ marginTop: 14 }}>
                        <span className="sail-cta-ico">⛏️</span> Take my leave — dig for treasure
                    </button>
                </>
            )}
        </div>
    );
}

// Adds a brief hit-flash class to the player when they took a hit in the last 220ms.
function hitClass(hitAt) {
    return hitAt && performance.now() - hitAt < 220 ? " is-hit" : "";
}
