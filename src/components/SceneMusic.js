"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Gentle procedural ambient MUSIC for the walkable scenes (Town + Tavern). No audio files — a warm chord pad
// (Web Audio) that slowly cycles a cozy folk progression, with an occasional soft pluck. Autoplay is blocked
// until a user gesture, so it kicks in on the first tap; a mute toggle persists the player's choice.
const CHORDS = [
    [110.0, 261.63, 329.63, 440.0], // Am
    [87.31, 220.0, 261.63, 349.23], // F
    [130.81, 261.63, 329.63, 392.0], // C
    [98.0, 246.94, 293.66, 392.0],  // G
];
const KEY = "wolfden-scene-music-muted";

export default function SceneMusic({ vibe = "town" }) {
    const [muted, setMuted] = useState(true);
    const started = useRef(false);
    const audio = useRef(null); // { ctx, master, voices, chordTimer, pluckTimer }

    // read saved preference (default: ON)
    useEffect(() => {
        try { setMuted(localStorage.getItem(KEY) === "1"); } catch { /* default on */ setMuted(false); }
    }, []);

    const stop = useCallback(() => {
        const a = audio.current; if (!a) return;
        clearInterval(a.chordTimer); clearTimeout(a.pluckTimer);
        try { a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.4); } catch { /* ok */ }
        setTimeout(() => { try { a.ctx.close(); } catch { /* ok */ } }, 900);
        audio.current = null; started.current = false;
    }, []);

    const start = useCallback(() => {
        if (started.current || audio.current) return;
        let ctx;
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
        started.current = true;
        const master = ctx.createGain(); master.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = vibe === "tavern" ? 820 : 1100;
        lp.connect(master); master.connect(ctx.destination);
        // 4 sustained voices (bass + 3 chord tones)
        const voices = CHORDS[0].map((f, i) => {
            const o = ctx.createOscillator(); o.type = i === 0 ? "sine" : "triangle"; o.frequency.value = f;
            const g = ctx.createGain(); g.gain.value = i === 0 ? 0.16 : 0.09;
            o.connect(g); g.connect(lp); o.start();
            return { o, g };
        });
        // slow breathing swell on the master
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.4; lfo.connect(lfoG); lfoG.connect(master.gain); lfo.start();
        master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2); // fade in
        // cycle chords
        let ci = 0;
        const chordTimer = setInterval(() => {
            ci = (ci + 1) % CHORDS.length;
            const now = ctx.currentTime;
            CHORDS[ci].forEach((f, i) => { try { voices[i].o.frequency.setTargetAtTime(f, now, 0.35); } catch { /* ok */ } });
        }, 6000);
        // occasional soft pluck from the current chord (a little life)
        const pluck = () => {
            const a = audio.current; if (!a) return;
            const chord = CHORDS[ci];
            const f = chord[1 + Math.floor(Math.random() * 3)] * 2;
            const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
            const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(lp); o.start();
            const t = ctx.currentTime;
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
            o.stop(t + 1.7);
            a.pluckTimer = setTimeout(pluck, 3500 + Math.random() * 5000);
        };
        const pluckTimer = setTimeout(pluck, 2500);
        audio.current = { ctx, master, voices, lp, chordTimer, pluckTimer };
    }, [vibe]);

    // Kick off on the first user gesture (autoplay policy) if not muted.
    useEffect(() => {
        if (muted) { stop(); return undefined; }
        const go = () => { start(); window.removeEventListener("pointerdown", go); };
        // try immediately (in case audio is already unlocked), else wait for a tap
        start();
        window.addEventListener("pointerdown", go, { once: true });
        return () => window.removeEventListener("pointerdown", go);
    }, [muted, start, stop]);

    useEffect(() => () => stop(), [stop]); // cleanup on unmount

    const toggle = useCallback(() => {
        setMuted((m) => { const nm = !m; try { localStorage.setItem(KEY, nm ? "1" : "0"); } catch { /* ok */ } return nm; });
    }, []);

    return (
        <button type="button" onClick={toggle} aria-label={muted ? "Play music" : "Mute music"} title={muted ? "Play tavern music" : "Mute music"}
            style={{ position: "absolute", top: 10, right: 10, zIndex: 9, width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(255,215,110,0.4)", background: "rgba(20,10,4,0.72)", color: "#ffe0b0", fontSize: 15, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
            {muted ? "🔇" : "🎵"}
        </button>
    );
}
