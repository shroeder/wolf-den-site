"use client";

import { useCallback, useEffect, useState } from "react";

import {
    audioAwake, playMusic, setSoundPref, soundPref, stopMusic, wake,
} from "@/lib/marketplace/cards-sound.js";

// ── WAKING THE AUDIO, AND KEEPING THE RIGHT ROOM PLAYING ─────────────────────────────────────────────────
// Two jobs, and neither of them belongs in a screen.
//
// ⚠️ A BROWSER WILL NOT MAKE A NOISE BEFORE IT HAS BEEN TOUCHED. Every mobile browser starts an AudioContext
// suspended and only resumes it inside a real user gesture, so a game that starts its music on mount is a
// game that is silent for its whole first screen and then, confusingly, works on the second. The listener
// below is attached ONCE per screen, fires on the first pointer or key event of any kind, and removes
// itself. Nothing else in the game has to know this rule exists.
//
// The music then follows the ROOM rather than the component: the same hook call in the fight passes "boss"
// on a boss floor and "fight" everywhere else, and playMusic is a no-op when the track is already going, so
// this can sit in a render path without restarting itself.
export default function useCardSound(track = null) {
    const [awake, setAwake] = useState(() => audioAwake());
    const [pref, setPref] = useState(() => soundPref());

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        if (audioAwake()) { setAwake(true); return undefined; }
        const open = () => {
            const ok = wake();
            if (ok) {
                setAwake(true);
                // Resuming is asynchronous on some browsers, so the first track is asked for again a beat
                // later rather than being lost to a context that was still opening.
                setTimeout(() => setAwake(audioAwake()), 250);
            }
        };
        // Passive: none of these ever call preventDefault, and a non-passive touch listener on the document
        // is a scroll-jank warning in every audit tool there is.
        const opts = { passive: true };
        for (const ev of ["pointerdown", "touchstart", "keydown"]) window.addEventListener(ev, open, opts);
        return () => { for (const ev of ["pointerdown", "touchstart", "keydown"]) window.removeEventListener(ev, open, opts); };
    }, []);

    useEffect(() => {
        if (!awake || !track) return undefined;
        playMusic(track);
        return undefined;
    }, [awake, track]);

    // The music stops when the last screen using it goes away — leaving a fight does not leave its drone
    // humming under the town.
    useEffect(() => () => stopMusic(), []);

    const toggle = useCallback((key) => {
        setPref(setSoundPref({ [key]: !soundPref()[key] }));
        // Turning sound back ON is itself a gesture, so it is also a chance to open a context that has never
        // been allowed to run.
        wake();
        setAwake(audioAwake());
    }, []);

    return { awake, pref, toggle };
}
