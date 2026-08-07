"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Procedural ambient MUSIC for the walkable scenes (Town + Tavern). No audio files — a proper little looping
// tune built live with Web Audio: a plucked-lute arpeggio + a walking bass on the downbeats + (in town) a
// gentle lead melody, over a cozy 4-bar folk progression, warmed with a feedback delay. Autoplay is blocked
// until a user gesture, so it kicks in on the first tap; a mute toggle persists the player's choice.
const KEY = "wolfden-scene-music-muted";
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Each bar = one chord (arp tones low→high + a bass root). Two moods: town is brighter/livelier with a lead
// melody; the tavern is slower, warmer and mellower with no lead.
const CHORD = {
    C: { arp: [60, 64, 67, 72], bass: 48 },
    G: { arp: [55, 59, 62, 67], bass: 43 },
    Am: { arp: [57, 60, 64, 69], bass: 45 },
    F: { arp: [53, 57, 60, 65], bass: 41 },
    Em: { arp: [64, 67, 71, 76], bass: 40 },
    Dm: { arp: [62, 65, 69, 74], bass: 38 },
    E: { arp: [64, 68, 71, 76], bass: 40 },
};
const ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2]; // which chord tone plays on each of the 8 eighth-notes in a bar
// Town lead melody over the 4-bar loop (step 0..31 = eighth-notes). Sparse + singable; null = rest.
const TOWN_LEAD = { 0: 64, 3: 67, 8: 71, 11: 67, 16: 69, 19: 72, 24: 72, 27: 69 };
// Raid lead — urgent, driving, higher register.
const RAID_LEAD = { 0: 76, 2: 74, 4: 72, 6: 74, 8: 76, 12: 79, 16: 72, 18: 71, 20: 72, 24: 76, 26: 77, 28: 79 };
// Sea battle — a SHANTY, not a chase. Dotted, swung-feeling phrases that land hard on the downbeat and hold,
// so the loop has the sway of something sung on a deck rather than the flat urgency of the raid lead. It plays
// under a fight where you sit and choose an order, so it has to stay listenable for a couple of minutes.
const SEA_LEAD = { 0: 69, 4: 72, 6: 74, 8: 76, 14: 74, 16: 72, 20: 69, 22: 67, 24: 65, 28: 69, 30: 72 };

const VIBES = {
    town: { bpm: 104, lpf: 1600, prog: ["C", "G", "Am", "F"], lead: TOWN_LEAD, arpType: "triangle", arpGain: 0.06, bassType: "triangle", bassGain: 0.15, arpRelease: 0.55, master: 0.42 },
    tavern: { bpm: 76, lpf: 950, prog: ["Am", "F", "C", "G"], lead: null, arpType: "triangle", arpGain: 0.05, bassType: "sine", bassGain: 0.17, arpRelease: 0.95, master: 0.4 },
    // Raid — a fast, tense minor loop with a driving bass + urgent lead; kicks in while a town event is active.
    raid: { bpm: 144, lpf: 2500, prog: ["Am", "Em", "Dm", "E"], lead: RAID_LEAD, arpType: "triangle", arpGain: 0.06, bassType: "triangle", bassGain: 0.22, arpRelease: 0.28, master: 0.46 },
    // Ship battle — swaggering minor sea shanty. Slower than the raid because a ship fight is turn-based: you
    // sit and weigh four orders, and a 144bpm chase loop under that just nags. The heavy sawtooth bass is the
    // swell under the hull; the open filter lets the lead ring out over it.
    seabattle: { bpm: 112, lpf: 2200, prog: ["Am", "F", "C", "E"], lead: SEA_LEAD, arpType: "triangle", arpGain: 0.055, bassType: "sawtooth", bassGain: 0.17, arpRelease: 0.42, master: 0.44 },
};

// `place` lets a scene put the toggle somewhere its own HUD isn't. The default top-right corner sits exactly
// on top of the enemy's name plate in a ship battle, so that scene asks for the opposite corner.
const PLACE = {
    "top-right": { top: 10, right: 10 },
    "bottom-left": { bottom: 10, left: 10 },
};

export default function SceneMusic({ vibe = "town", place = "top-right" }) {
    const [muted, setMuted] = useState(true);
    const started = useRef(false);
    const audio = useRef(null);

    // read saved preference (default: ON)
    useEffect(() => {
        try { setMuted(localStorage.getItem(KEY) === "1"); } catch { /* default on */ setMuted(false); }
    }, []);

    const stop = useCallback(() => {
        const a = audio.current; if (!a) return;
        clearInterval(a.schedTimer);
        try { a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.4); } catch { /* ok */ }
        setTimeout(() => { try { a.ctx.close(); } catch { /* ok */ } }, 900);
        audio.current = null; started.current = false;
    }, []);

    const start = useCallback(() => {
        if (started.current || audio.current) return;
        let ctx;
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
        started.current = true;
        const cfg = VIBES[vibe] || VIBES.town;

        const master = ctx.createGain(); master.gain.value = 0;
        master.connect(ctx.destination);
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cfg.lpf; lp.Q.value = 0.6;
        lp.connect(master);
        // A soft feedback delay for space/warmth (a fake reverb tail).
        const delay = ctx.createDelay(1.0); delay.delayTime.value = (60 / cfg.bpm) * 0.75;
        const fb = ctx.createGain(); fb.gain.value = 0.26;
        const wet = ctx.createGain(); wet.gain.value = 0.34;
        lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
        master.gain.setTargetAtTime(cfg.master, ctx.currentTime, 1.4); // fade in

        // A single plucked note with a quick attack + exponential decay (lute-ish).
        const pluck = (midi, t, dur, gainVal, type, detune = 0) => {
            const f = midiToFreq(midi);
            const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
            const g = ctx.createGain(); g.gain.value = 0;
            o.connect(g); g.connect(lp);
            let o2 = null;
            if (detune) { o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f; o2.detune.value = detune; o2.connect(g); }
            o.start(t); if (o2) o2.start(t);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(gainVal, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.stop(t + dur + 0.06); if (o2) o2.stop(t + dur + 0.06);
        };

        const step8 = 30 / cfg.bpm; // seconds per eighth-note
        let step = 0;
        let nextTime = ctx.currentTime + 0.12;
        const scheduleStep = (s, t) => {
            const bar = Math.floor(s / 8) % 4;
            const inBar = s % 8;
            const chord = CHORD[cfg.prog[bar]];
            // Arpeggio (every eighth-note)
            pluck(chord.arp[ARP_PATTERN[inBar] % chord.arp.length], t, cfg.arpRelease, cfg.arpGain, cfg.arpType);
            // Bass on beats 1 and 3
            if (inBar === 0 || inBar === 4) pluck(chord.bass, t, step8 * 3.6, cfg.bassGain, cfg.bassType);
            // Lead melody (town), longer + slightly detuned for a singing tone
            if (cfg.lead && cfg.lead[s] != null) pluck(cfg.lead[s], t, step8 * 3.2, 0.075, "triangle", 7);
        };
        const tick = () => {
            const a = audio.current; if (!a) return;
            while (nextTime < ctx.currentTime + 0.14) {
                scheduleStep(step, nextTime);
                nextTime += step8;
                step = (step + 1) % 32;
            }
        };
        tick();
        const schedTimer = setInterval(tick, 25);
        audio.current = { ctx, master, lp, delay, schedTimer };
    }, [vibe]);

    // Kick off on the first user gesture (autoplay policy) if not muted.
    useEffect(() => {
        if (muted) { stop(); return undefined; }
        const go = () => { start(); window.removeEventListener("pointerdown", go); };
        start(); // try immediately (in case audio is already unlocked)
        window.addEventListener("pointerdown", go, { once: true });
        return () => window.removeEventListener("pointerdown", go);
    }, [muted, start, stop]);

    useEffect(() => () => stop(), [stop]); // cleanup on unmount

    // When the vibe changes (e.g. town → raid), swap the loop so the new mood takes over immediately.
    const prevVibe = useRef(vibe);
    useEffect(() => {
        if (prevVibe.current !== vibe) {
            prevVibe.current = vibe;
            if (!muted && audio.current) { stop(); start(); }
        }
    }, [vibe, muted, start, stop]);

    const toggle = useCallback(() => {
        setMuted((m) => { const nm = !m; try { localStorage.setItem(KEY, nm ? "1" : "0"); } catch { /* ok */ } return nm; });
    }, []);

    return (
        <button type="button" onClick={toggle} aria-label={muted ? "Play music" : "Mute music"} title={muted ? `Play ${vibe} music` : "Mute music"}
            style={{ position: "absolute", ...(PLACE[place] || PLACE["top-right"]), zIndex: 9, width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(255,215,110,0.4)", background: "rgba(20,10,4,0.72)", color: "#ffe0b0", fontSize: 15, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
            {muted ? "🔇" : "🎵"}
        </button>
    );
}
