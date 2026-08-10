"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import PetArt from "@/components/PetArt";

// ── THE ENSHRINING, AS A MOMENT ──────────────────────────────────────────────────────────────────────────────
// Reaching level six already fires the existing evolution reveal, because it is a level like any other. THIS is
// the other thing — the ritual — and it is the one that deserves the screen: six weeks of carrying one animal
// around, and a stone somebody had to go and find, spent on a decision that cannot be taken back.
//
// It plays in four beats rather than one, because a single cross-fade would be over before you registered what
// changed, and what changed is the whole point:
//
//   1. THE OLD FORM, alone, still. A breath. You are looking at the pet you have had all along.
//   2. THE STONE falls into it and shatters. This is the beat that spends the thing you found.
//   3. THE FLASH. The screen goes to the stone's colour and the silhouette burns through it.
//   4. THE NEW FORM lands, with the one sentence that matters: the ability is yours whether it is out or not.
//
// Held on a tap rather than a timer at the end — you should be able to sit and look at it.
const BEATS = { hold: 900, drop: 700, flash: 420 };

let ac = null;
function ring(stone) {
    try {
        const Ctx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!Ctx) return;
        ac = ac || new Ctx();
        const t0 = ac.currentTime;
        // Light rings UP and open; dark falls AWAY and closes. Same gesture, opposite direction — the sound
        // should tell you which rock you spent even with your eyes shut.
        const notes = stone === "dark" ? [392, 311.1, 261.6, 196] : [392, 523.25, 659.25, 880];
        notes.forEach((f, i) => {
            const o = ac.createOscillator(); const g = ac.createGain();
            o.type = stone === "dark" ? "sawtooth" : "triangle";
            o.frequency.value = f;
            const at = t0 + 0.9 + i * 0.11;
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
            o.connect(g); g.connect(ac.destination); o.start(at); o.stop(at + 0.75);
        });
        // The shatter: a short noise burst under the first note, so the stone reads as breaking rather than
        // as a chime that happens to play.
        const buf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
        const src = ac.createBufferSource(); src.buffer = buf;
        const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = stone === "dark" ? 900 : 2600; f.Q.value = 0.8;
        const g = ac.createGain(); g.gain.value = 0.22;
        src.connect(f); f.connect(g); g.connect(ac.destination);
        src.start(t0 + 0.86);
    } catch { /* sound is a bonus, never a failure */ }
}

export default function PetEnshrineReveal({ open, pet, stone, before, after, onClose }) {
    const [beat, setBeat] = useState(0);
    const timers = useRef([]);

    useEffect(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (!open) { setBeat(0); return undefined; }
        setBeat(1);
        ring(stone);
        try { navigator.vibrate?.([12, 70, 26, 40, 120]); } catch { /* unsupported */ }
        const t = [
            setTimeout(() => setBeat(2), BEATS.hold),
            setTimeout(() => setBeat(3), BEATS.hold + BEATS.drop),
            setTimeout(() => setBeat(4), BEATS.hold + BEATS.drop + BEATS.flash),
        ];
        timers.current = t;
        return () => t.forEach(clearTimeout);
    }, [open, stone]);

    if (!open || typeof document === "undefined") return null;
    const color = stone === "dark" ? "#b061ff" : "#ffe08a";
    const art = stone === "dark" ? "/images/pets/stone-dark.png" : "/images/pets/stone-light.png";

    return createPortal(
        <div className={`penr penr-b${beat}`} style={{ "--stone": color }} role="dialog" aria-modal="true"
            onClick={() => beat >= 4 && onClose?.()}>
            <span className="penr-rays" aria-hidden="true" />
            <div className="penr-stage">
                {/* Both forms are in the DOM the whole time and cross-faded by class. Swapping the src at the
                    flash would show a blank frame while the new image decoded — on a phone, every time. */}
                <span className="penr-form penr-old"><PetArt id={pet?.id} url={before?.url} flip={before?.flip} /></span>
                <span className="penr-form penr-new"><PetArt id={pet?.id} url={after?.url} flip={after?.flip} /></span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="penr-stone" src={art} alt="" draggable="false" />
                <span className="penr-shards" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--i": i }} />)}
                </span>
            </div>
            <div className="penr-words">
                <span className="penr-kick">{stone === "dark" ? "Darkstone" : "Lightstone"}</span>
                <b className="penr-name">{pet?.name} is enshrined</b>
                <p className="penr-line">
                    Its ability is yours for good now — equipped or not. Put something else out; it keeps working.
                </p>
                <button type="button" className="penr-go" onClick={() => onClose?.()}>Done</button>
            </div>
        </div>,
        document.body
    );
}
