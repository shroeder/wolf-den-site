"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { collectibleById, petActive, petActiveLevelMult, petPassive, petPassiveLevelMult, PET_STAT_META } from "@/lib/marketplace/collectibles.js";

// ── GLOBAL pet level-up watcher ──────────────────────────────────────────────────────────────────────────
// Mounted once in the marketplace layout so a pet leveling up is celebrated ANYWHERE in the app — not just on
// the pets page. Pets gain XP from your actions (boss strikes, farm petting, treats) and a slow trickle; every
// such action fires `wolfden-hud-refresh`, which we listen for. We compare each pet's level to what this browser
// last saw (localStorage) and, on a gain, play a juiced Pokémon-style evolution reveal: the OLD-level sprite
// flashes to a silhouette and transforms into the NEW-level sprite.
const SEEN_KEY = "wd_pet_levels_seen";
const RARITY_COLOR = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const rc = (r) => RARITY_COLOR[r] || "#ffd75e";

let ac = null;
function chime() {
    try {
        const Ctx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!Ctx) return;
        ac = ac || new Ctx();
        const now = ac.currentTime;
        // Rising arpeggio + a sparkle on top — a proper "evolution" flourish.
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
            const osc = ac.createOscillator(), gain = ac.createGain();
            osc.type = "triangle"; osc.frequency.value = freq;
            const t = now + i * 0.11;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.24, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            osc.connect(gain).connect(ac.destination); osc.start(t); osc.stop(t + 0.32);
        });
    } catch { /* audio may be blocked until a gesture — fine */ }
}

export default function PetLevelUp() {
    const [queue, setQueue] = useState([]); // pending celebrations (one shown at a time)
    const [mounted, setMounted] = useState(false);
    const inFlight = useRef(false);
    const lastCheck = useRef(0);

    useEffect(() => { setMounted(true); }, []);

    const check = useCallback(async () => {
        if (inFlight.current) return;
        const nowMs = Date.now();
        if (nowMs - lastCheck.current < 3500) return; // rate-limit so event bursts don't hammer the pets endpoint
        lastCheck.current = nowMs;
        inFlight.current = true;
        try {
            const r = await fetch("/api/marketplace/pets?peek=1", { cache: "no-store" }).catch(() => null);
            const d = r?.ok ? await r.json().catch(() => null) : null;
            if (!d?.petLevels || !d.signedIn) return;
            let seen = {};
            try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { seen = {}; }
            const firstEver = Object.keys(seen).length === 0; // brand-new browser: record, don't celebrate
            const now = {};
            const gains = [];
            for (const [pid, info] of Object.entries(d.petLevels)) {
                now[pid] = info.level;
                const prev = Number.isFinite(seen[pid]) ? seen[pid] : info.level;
                if (!firstEver && info.level > prev) {
                    const pet = collectibleById(pid);
                    if (pet) {
                        const sprites = d.petSprites?.[pid] || {};
                        gains.push({
                            key: `${pid}:${info.level}:${nowMs}`,
                            pet, from: prev, to: info.level,
                            oldArt: sprites[prev] || null, newArt: sprites[info.level] || null,
                            value: info.value, stat: info.stat,
                        });
                    }
                }
            }
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(now)); } catch { /* ignore */ }
            if (gains.length) {
                gains.sort((a, b) => b.to - a.to);
                setQueue((q) => [...q, ...gains]);
                chime();
            }
        } finally {
            inFlight.current = false;
        }
    }, []);

    // A DIRECT hand-off from whatever caused the level-up (feeding a treat, working the farm). Those screens
    // used to pop their own celebration, so a single level-up produced two modals back to back. They now fire
    // this event and the one modal below handles it — immediately, with no wait for the poll.
    useEffect(() => {
        const onDirect = (e) => {
            const d = e?.detail;
            if (!d?.petId) return;
            const pet = collectibleById(d.petId);
            if (!pet) return;
            setQueue((q) => {
                // The poller may also spot this level a moment later; don't celebrate the same one twice.
                const key = `${d.petId}:${d.level}`;
                if (q.some((x) => x.key.startsWith(key))) return q;
                return [...q, {
                    key: `${key}:${Date.now()}`,
                    pet, from: Math.max(0, Number(d.level) - 1), to: Number(d.level),
                    oldArt: d.oldArt || null,
                    newArt: d.spriteUrl ? { url: d.spriteUrl, flip: d.spriteFlip } : null,
                    value: d.value, stat: d.stat,
                }];
            });
            // Keep the poller's baseline in step, or it will re-detect this level and queue it again.
            try {
                const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
                seen[d.petId] = Number(d.level);
                localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
            } catch { /* ignore */ }
            chime();
        };
        window.addEventListener("wolfden-pet-levelup", onDirect);
        return () => window.removeEventListener("wolfden-pet-levelup", onDirect);
    }, []);

    // Check on mount (catches trickle level-ups), whenever an action awards XP (pets earn a 12% share, so this
    // is the moment a pet may tick over a level), on tab focus, and a slow safety poll.
    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        check();
        const trigger = () => { setTimeout(check, 1200); }; // let the server settle the XP share first
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        window.addEventListener("wolfden-xp-updated", trigger);
        window.addEventListener("wolfden-hud-refresh", trigger);
        document.addEventListener("visibilitychange", onVisible);
        const poll = setInterval(() => { if (document.visibilityState === "visible") check(); }, 45000);
        return () => {
            window.removeEventListener("wolfden-xp-updated", trigger);
            window.removeEventListener("wolfden-hud-refresh", trigger);
            document.removeEventListener("visibilitychange", onVisible);
            clearInterval(poll);
        };
    }, [check]);

    const current = queue[0] || null;
    const dismiss = () => setQueue((q) => q.slice(1));
    if (!mounted || !current) return null;

    const accent = rc(current.pet.rarity);
    const evolves = current.oldArt?.url && current.newArt?.url && current.oldArt.url !== current.newArt.url;
    // WHAT THE LEVEL ACTUALLY BOUGHT. A pet carries two stats — an always-on PASSIVE for owning it and an
    // ACTIVE that only counts while it's your companion — and both scale, at different rates. The modal used
    // to state one number with nothing to compare it to, which is the least interesting true thing it could
    // say. Both are pure client-safe functions, so this needs nothing from the server.
    const meta = (k) => PET_STAT_META[k] || {};
    const gains = (() => {
        const p = current.pet ? petPassive(current.pet) : null;
        const a = current.pet ? petActive(current.pet) : null;
        const line = (kind, stat, base, mult) => {
            const from = Math.round(base * mult(current.from));
            const to = Math.round(base * mult(current.to));
            return { kind, stat, from, to, up: to - from, label: meta(stat).label || stat, icon: meta(stat).icon || "", desc: meta(stat).desc || "" };
        };
        const out = [];
        if (p) out.push(line("Passive", p.stat, p.value, petPassiveLevelMult));
        // Listed even when both stats share a key: they scale at different rates (passive ×0.25/level, active
        // ×0.5), so "the same stat" still moves by different amounts on the two lines.
        if (a) out.push(line("Active", a.stat, a.value, petActiveLevelMult));
        return out;
    })();
    const maxed = current.to >= 5;

    return createPortal(
        <div className="plu-scrim" onClick={dismiss} role="dialog" aria-modal="true" aria-label={`${current.pet.name} leveled up`}>
            <style>{PLU_CSS}</style>
            <div className="plu-card" style={{ "--acc": accent }} onClick={(e) => e.stopPropagation()}>
                <div className="plu-confetti" aria-hidden="true">
                    {Array.from({ length: 42 }).map((_, i) => (
                        <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${1.5 + (i % 10) * 0.04}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c", accent][i % 6] }} />
                    ))}
                </div>

                <div className={`plu-stage${evolves ? " is-evo" : " is-simple"}`}>
                    <div className="plu-rays" aria-hidden="true" />
                    <div className="plu-halo" aria-hidden="true" />
                    {evolves ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="plu-sprite plu-old" src={current.oldArt.url} alt="" style={current.oldArt.flip ? { transform: "scaleX(-1)" } : undefined} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="plu-sprite plu-new" src={current.newArt.url} alt={current.pet.name} style={current.newArt.flip ? { transform: "scaleX(-1)" } : undefined} />
                        </>
                    ) : current.newArt?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="plu-sprite plu-new" src={current.newArt.url} alt={current.pet.name} style={current.newArt.flip ? { transform: "scaleX(-1)" } : undefined} />
                    ) : (
                        <span className="plu-sprite plu-new plu-emoji" style={{ color: current.pet.color }}>🐾</span>
                    )}
                    <span className="plu-flash" aria-hidden="true" />
                </div>

                <div className="plu-banner">{evolves ? "EVOLVED!" : "LEVEL UP!"}</div>
                <h2 className="plu-title">{current.pet.name} reached Lv {current.to}</h2>
                <div className="plu-stars" aria-label={`Level ${current.to} of 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < current.to ? "on" : "off"} style={i < current.to ? { animationDelay: `${2 + i * 0.12}s` } : undefined}>★</span>
                    ))}
                </div>
                {/* BEFORE → AFTER, for both stats. The whole point of a level is the number moving. */}
                {gains.length ? (
                    <div className="plu-gains">
                        {gains.map((g) => (
                            <div className={`plu-gain is-${g.kind.toLowerCase()}`} key={g.kind}>
                                <span className="plu-gain-kind">{g.kind}</span>
                                <span className="plu-gain-stat">{g.icon} {g.label}</span>
                                <span className="plu-gain-nums">
                                    <b className="was">+{g.from}</b>
                                    <i aria-hidden="true">›</i>
                                    <b className="now">+{g.to}</b>
                                    {g.up > 0 ? <em>+{g.up}</em> : null}
                                </span>
                            </div>
                        ))}
                        <p className="plu-gains-note">
                            {gains.length > 1
                                ? "Passive counts while you simply own it. Active only counts while it's your companion."
                                : "Counts while it's your companion."}
                            {maxed ? " · MAX LEVEL" : ""}
                        </p>
                    </div>
                ) : null}
                <div className="plu-hint" aria-hidden="true">{queue.length > 1 ? `tap for the next one · ${queue.length - 1} more` : "tap anywhere to close"}</div>
            </div>
        </div>,
        document.body
    );
}

const PLU_CSS = `
/* WHAT THE LEVEL BOUGHT — one row per stat, before › after. */
.plu-gains { margin-top: 14px; display: grid; gap: 7px; text-align: left; }
.plu-gain { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 9px;
    padding: 9px 11px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); }
.plu-gain.is-active { border-color: color-mix(in srgb, var(--acc) 45%, transparent); background: color-mix(in srgb, var(--acc) 10%, rgba(255,255,255,0.04)); }
.plu-gain-kind { font-size: 9.5px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase; color: #9aa2ab;
    padding: 3px 7px; border-radius: 999px; background: rgba(0,0,0,0.4); }
.plu-gain.is-active .plu-gain-kind { color: #2a1400; background: var(--acc); }
.plu-gain-stat { font-size: 12.5px; font-weight: 700; color: #e7dcc8; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plu-gain-nums { display: inline-flex; align-items: baseline; gap: 5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.plu-gain-nums .was { font-size: 12.5px; color: #7f8791; text-decoration: line-through; }
.plu-gain-nums i { font-style: normal; color: #7f8791; }
.plu-gain-nums .now { font-size: 15px; color: #fff; }
.plu-gain-nums em { font-style: normal; font-size: 11px; font-weight: 900; color: #7cffb2; }
.plu-gains-note { margin: 4px 2px 0; font-size: 10.5px; line-height: 1.45; color: #8b93a0; text-align: center; }

.plu-scrim { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 18px;
    background: radial-gradient(120% 90% at 50% 30%, color-mix(in srgb, var(--acc, #ffd75e) 12%, rgba(6,4,12,0.82)), rgba(6,4,12,0.9) 70%);
    backdrop-filter: blur(5px); animation: pluFade .3s ease both; }
@keyframes pluFade { from { opacity: 0; } to { opacity: 1; } }
.plu-card { --acc: #ffd75e; position: relative; width: 100%; max-width: 380px; text-align: center; padding: 26px 22px 20px; border-radius: 24px; overflow: hidden;
    background: linear-gradient(180deg, #211634, #120c22 70%, #0d0819);
    border: 1px solid color-mix(in srgb, var(--acc) 55%, transparent);
    box-shadow: 0 30px 80px rgba(0,0,0,0.72), 0 0 60px color-mix(in srgb, var(--acc) 30%, transparent);
    animation: pluPop .45s cubic-bezier(.2,1.35,.35,1) both; }
@keyframes pluPop { from { opacity: 0; transform: translateY(16px) scale(.9); } to { opacity: 1; transform: none; } }

.plu-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.plu-confetti span { position: absolute; top: -14px; width: 8px; height: 13px; border-radius: 2px; opacity: 0; animation: pluConfetti 1.6s ease-in forwards; }
@keyframes pluConfetti { 0% { transform: translateY(0) rotate(0); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(560px) rotate(700deg); opacity: 0; } }

/* ── the sprite transform stage ── */
.plu-stage { position: relative; width: 176px; height: 176px; margin: 4px auto 6px; display: grid; place-items: center; }
.plu-halo { position: absolute; width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--acc) 55%, transparent), transparent 62%); filter: blur(6px); opacity: 0; animation: pluHalo 1.4s ease-in-out 1.3s infinite; }
@keyframes pluHalo { 0%,100% { opacity: .5; transform: scale(.9); } 50% { opacity: .95; transform: scale(1.12); } }
.plu-rays { position: absolute; width: 300px; height: 300px; border-radius: 50%; opacity: 0;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--acc) 60%, transparent) 0deg 7deg, transparent 7deg 20deg);
    -webkit-mask: radial-gradient(circle, transparent 60px, #000 66px, transparent 150px); mask: radial-gradient(circle, transparent 60px, #000 66px, transparent 150px);
    animation: pluRaysIn .6s ease 1.5s forwards, pluRaysSpin 10s linear 1.5s infinite; }
@keyframes pluRaysIn { to { opacity: .6; } }
@keyframes pluRaysSpin { to { transform: rotate(360deg); } }
.plu-sprite { position: absolute; width: 132px; height: 132px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6)); }
.plu-emoji { font-size: 96px; display: grid; place-items: center; }
/* Old form: bobs, shakes, then flashes to a white silhouette and vanishes. */
.is-evo .plu-old { animation: pluOld 1.7s ease forwards; }
@keyframes pluOld {
    0% { opacity: 1; transform: scale(1); filter: none; }
    35% { transform: scale(1) translateX(0); }
    42% { transform: scale(1.02) translateX(-4px); } 48% { transform: translateX(4px); } 54% { transform: translateX(-3px); } 59% { transform: translateX(0); }
    62% { filter: brightness(0) invert(1); transform: scale(1.04); }
    74% { filter: brightness(0) invert(1); opacity: 1; transform: scale(.9); }
    82% { opacity: 0; transform: scale(.7); }
    100% { opacity: 0; }
}
/* New form: bursts in as a white silhouette, then colors resolve with a pop. */
.is-evo .plu-new { opacity: 0; animation: pluNew 1.2s cubic-bezier(.2,1.3,.35,1) 1.15s forwards; }
@keyframes pluNew {
    0% { opacity: 0; transform: scale(.5); filter: brightness(0) invert(1); }
    18% { opacity: 1; transform: scale(1.05); filter: brightness(0) invert(1); }
    46% { filter: brightness(0) invert(1); }
    70% { filter: none; transform: scale(1.12); }
    100% { opacity: 1; transform: scale(1); filter: none; }
}
/* Simple level-up (no distinct sprite): a confident pop + glow. */
.is-simple .plu-new { animation: pluSimple .7s cubic-bezier(.2,1.4,.35,1) both, pluBob 2.4s ease-in-out .7s infinite; }
@keyframes pluSimple { from { opacity: 0; transform: scale(.5) rotate(-12deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes pluBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.plu-flash { position: absolute; width: 240px; height: 240px; border-radius: 50%; background: radial-gradient(circle, #fff, transparent 60%); opacity: 0; animation: pluFlash .5s ease 1.05s; }
.is-simple .plu-flash { animation: pluFlash .5s ease .1s; }
@keyframes pluFlash { 0% { opacity: 0; transform: scale(.4); } 45% { opacity: .95; } 100% { opacity: 0; transform: scale(1.3); } }

.plu-banner { font-size: 1.05rem; font-weight: 900; letter-spacing: 0.08em; color: var(--acc); text-shadow: 0 0 16px color-mix(in srgb, var(--acc) 60%, transparent); opacity: 0; animation: pluRise .5s ease 1.9s both; }
.plu-title { margin: 4px 0 0; font-size: 1.35rem; font-weight: 900; color: #f4ecff; opacity: 0; animation: pluRise .5s ease 2.05s both; text-wrap: balance; }
.plu-stars { display: inline-flex; gap: 3px; margin-top: 8px; font-size: 1.35rem; line-height: 1; }
.plu-stars .off { color: rgba(255,255,255,0.16); }
.plu-stars .on { color: var(--acc); text-shadow: 0 0 12px color-mix(in srgb, var(--acc) 70%, transparent); transform: scale(0); animation: pluStar .4s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes pluStar { from { transform: scale(0) rotate(-40deg); } to { transform: scale(1) rotate(0); } }
.plu-sub { margin: 9px 4px 0; font-size: 0.9rem; color: #d7ccec; opacity: 0; animation: pluRise .5s ease 2.35s both; }
.plu-sub b { color: #fff; }
@keyframes pluRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.plu-hint { margin-top: 16px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.03em; text-transform: lowercase;
    color: rgba(255,255,255,0.42); animation: pluFade .4s ease 2.4s both; }
.plu-btn { margin-top: 16px; width: 100%; padding: 13px 16px; border-radius: 13px; border: none; font-weight: 900; font-size: 1rem; cursor: pointer;
    color: #24123a; background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 90%, #fff), var(--acc));
    box-shadow: 0 4px 0 color-mix(in srgb, var(--acc) 55%, #000), 0 10px 24px color-mix(in srgb, var(--acc) 35%, transparent);
    opacity: 0; animation: pluRise .5s ease 2.5s both; }
.plu-btn:active { transform: translateY(2px); }
`;
