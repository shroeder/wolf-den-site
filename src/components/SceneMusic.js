"use client";

import { GiMusicalNotes, GiSpeakerOff } from "react-icons/gi";
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
    // Added for the cabinet tunes below. Bb and Gm give The Deep and The Harvest somewhere to go that the
    // original seven could not reach; D turns Keno's loop into a real cadence instead of a shuffle.
    Bb: { arp: [58, 62, 65, 70], bass: 46 },
    Gm: { arp: [55, 58, 62, 67], bass: 43 },
    D: { arp: [62, 66, 69, 74], bass: 50 },
};
const ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2]; // which chord tone plays on each of the 8 eighth-notes in a bar
// Town lead melody over the 4-bar loop (step 0..31 = eighth-notes). Sparse + singable; null = rest.
const TOWN_LEAD = { 0: 64, 3: 67, 8: 71, 11: 67, 16: 69, 19: 72, 24: 72, 27: 69 };
// The casino's lead. Late, lazy entries that come in behind the beat and hold — a lounge line, not a chase.
const CASINO_LEAD = { 2: 69, 6: 72, 10: 71, 14: 69, 18: 67, 22: 69, 26: 72, 30: 74 };
// Raid lead — urgent, driving, higher register.
const RAID_LEAD = { 0: 76, 2: 74, 4: 72, 6: 74, 8: 76, 12: 79, 16: 72, 18: 71, 20: 72, 24: 76, 26: 77, 28: 79 };
// Sea battle — a SHANTY, not a chase. Dotted, swung-feeling phrases that land hard on the downbeat and hold,
// so the loop has the sway of something sung on a deck rather than the flat urgency of the raid lead. It plays
// under a fight where you sit and choose an order, so it has to stay listenable for a couple of minutes.
const SEA_LEAD = { 0: 69, 4: 72, 6: 74, 8: 76, 14: 74, 16: 72, 20: 69, 22: 67, 24: 65, 28: 69, 30: 72 };

// -- ONE TUNE PER CABINET ------------------------------------------------------------------------------------
// Luke: "every game should have its own music and sound fx." The casino floor had a tune and every machine on
// it had silence -- sitting down actually turned the music OFF, which is backwards: the floor is the corridor
// and the cabinet is the room. Each of the eight now has a loop of its own, and the floor's lounge turnaround
// is what you walk back out into.
//
// They are written to be told apart in one bar, because that is all anybody gives them. The lever the ear
// notices first is TEMPO and REGISTER, not harmony -- so The Menagerie is fast and high, The Deep is slow and
// low, and no two neighbours on the floor share a speed.

// The Hunt -- a horn call. Root, fifth, octave, landing on downbeats and holding: the oldest melodic shape
// there is for "something is out there", and the only lead here built on open fifths.
const HUNT_LEAD = { 0: 60, 3: 67, 6: 72, 12: 71, 16: 65, 19: 72, 22: 77, 28: 67 };
// The Harvest -- sweet, singable, unhurried. Nothing clever; the kindest machine gets the kindest tune.
const HARVEST_LEAD = { 0: 65, 4: 69, 8: 72, 14: 69, 16: 67, 20: 72, 24: 69, 28: 65 };
// The Deep -- four notes in thirty-two steps, all of them low and long. Almost nothing happens, which is the
// point: this is the only cabinet whose music is trying to make you uneasy rather than to keep you company.
const DEEP_LEAD = { 0: 50, 12: 53, 16: 57, 28: 50 };
// The Menagerie -- busy, high and skipping, with more notes than any other loop in the game. Small animals.
const MENAGERIE_LEAD = { 0: 72, 2: 76, 4: 74, 6: 79, 8: 77, 10: 81, 12: 79, 16: 76, 18: 72, 20: 74, 24: 79, 26: 81, 28: 84, 30: 79 };
// The Vault -- four held notes climbing a minor arpeggio, low and stately. A tune with a lot of money in it.
const VAULT_LEAD = { 0: 45, 8: 52, 16: 48, 24: 57 };
// Keno -- sparse and glassy, the notes arriving like numbers being called rather than like a melody.
const KENO_LEAD = { 0: 76, 6: 79, 12: 76, 20: 83, 26: 79 };
// The Hall -- a bouncing music-hall line with repeated notes, which is what a room full of people sounds like.
const BINGO_LEAD = { 0: 72, 2: 72, 4: 76, 6: 79, 8: 77, 12: 76, 16: 74, 18: 74, 20: 77, 24: 79, 28: 76 };
// The Table -- every entry lands off the downbeat and holds. Lounge phrasing: nothing here is in a hurry, and
// the loop has to survive somebody sitting at it for twenty hands.
const BLACKJACK_LEAD = { 3: 69, 9: 72, 15: 70, 21: 69, 27: 65 };

const VIBES = {
    town: { bpm: 104, lpf: 1600, prog: ["C", "G", "Am", "F"], lead: TOWN_LEAD, arpType: "triangle", arpGain: 0.06, bassType: "triangle", bassGain: 0.15, arpRelease: 0.55, master: 0.42 },
    // ── THE CASINO FLOOR ── Am -> Dm -> G -> C is a TURNAROUND: it never resolves, it just keeps handing
    // you back to the top, which is exactly the feeling a room full of machines is trying to produce. Slow
    // enough to stand around in, a soft sine arp for the glassy lounge shimmer over the top, and a fat
    // triangle bass walking underneath. The lead enters late in each bar and holds, because anything that
    // pushes would be nagging by the third loop — and people stand in this room for half an hour.
    casino: { bpm: 92, lpf: 1150, prog: ["Am", "Dm", "G", "C"], lead: CASINO_LEAD, arpType: "sine",
        arpGain: 0.055, bassType: "triangle", bassGain: 0.2, arpRelease: 0.7, master: 0.36 },
    tavern: { bpm: 76, lpf: 950, prog: ["Am", "F", "C", "G"], lead: null, arpType: "triangle", arpGain: 0.05, bassType: "sine", bassGain: 0.17, arpRelease: 0.95, master: 0.4 },
    // Raid — a fast, tense minor loop with a driving bass + urgent lead; kicks in while a town event is active.
    raid: { bpm: 144, lpf: 2500, prog: ["Am", "Em", "Dm", "E"], lead: RAID_LEAD, arpType: "triangle", arpGain: 0.06, bassType: "triangle", bassGain: 0.22, arpRelease: 0.28, master: 0.46 },
    // Ship battle — swaggering minor sea shanty. Slower than the raid because a ship fight is turn-based: you
    // sit and weigh four orders, and a 144bpm chase loop under that just nags. The heavy sawtooth bass is the
    // swell under the hull; the open filter lets the lead ring out over it.
    // -- THE EIGHT CABINETS ----------------------------------------------------------------------------
    // C -> Am -> F -> G, brisk and open. The only major-key cabinet tune with a horn on it.
    slot: { bpm: 102, lpf: 1900, prog: ["C", "Am", "F", "G"], lead: HUNT_LEAD, arpType: "triangle",
        arpGain: 0.055, bassType: "triangle", bassGain: 0.18, arpRelease: 0.5, master: 0.36 },
    // Slower, rounder, filtered right down. Bb at the end of the loop is what makes it pastoral rather
    // than merely slow -- it leans flat, the way folk tunes do.
    slot2: { bpm: 84, lpf: 1050, prog: ["F", "C", "Dm", "Bb"], lead: HARVEST_LEAD, arpType: "sine",
        arpGain: 0.05, bassType: "sine", bassGain: 0.16, arpRelease: 0.9, master: 0.34 },
    // 62bpm and a 620Hz ceiling: the slowest, darkest thing in the building by a distance. All minor, sine
    // everywhere, and a release long enough that the notes smear into each other like something underwater.
    slot3: { bpm: 62, lpf: 620, prog: ["Dm", "Gm", "Bb", "Am"], lead: DEEP_LEAD, arpType: "sine",
        arpGain: 0.06, bassType: "sine", bassGain: 0.2, arpRelease: 1.25, master: 0.34 },
    // Twice The Deep's tempo, a wide-open filter and a release short enough to skip. Directly next door to
    // it on the floor, which is deliberate -- walking four paces should be a complete change of room.
    slot4: { bpm: 124, lpf: 2600, prog: ["C", "G", "Am", "F"], lead: MENAGERIE_LEAD, arpType: "triangle",
        arpGain: 0.045, bassType: "triangle", bassGain: 0.15, arpRelease: 0.24, master: 0.34 },
    // A sawtooth bass at 0.26 is the heaviest low end anywhere in the game, under a slow minor cadence.
    // The Vault should sound like a door rather than a machine.
    slot5: { bpm: 70, lpf: 900, prog: ["Am", "Dm", "E", "Am"], lead: VAULT_LEAD, arpType: "triangle",
        arpGain: 0.05, bassType: "sawtooth", bassGain: 0.26, arpRelease: 0.8, master: 0.36 },
    // Em -> C -> G -> D, high and thin, with the quietest arp on the floor. A numbers game, not a party.
    keno: { bpm: 98, lpf: 2100, prog: ["Em", "C", "G", "D"], lead: KENO_LEAD, arpType: "sine",
        arpGain: 0.04, bassType: "triangle", bassGain: 0.15, arpRelease: 0.34, master: 0.33 },
    // The one plain major loop in the set, quick and warm. A hall full of people is not a mood piece.
    bingo: { bpm: 118, lpf: 1800, prog: ["C", "F", "G", "C"], lead: BINGO_LEAD, arpType: "triangle",
        arpGain: 0.055, bassType: "triangle", bassGain: 0.19, arpRelease: 0.3, master: 0.35 },
    // Dm -> G -> C -> Am is a ii-V-I that then refuses to stay home -- the jazz turnaround, and the only
    // cabinet whose harmony is doing something the others are not. Slow, dark, sine, low ceiling.
    blackjack: { bpm: 78, lpf: 950, prog: ["Dm", "G", "C", "Am"], lead: BLACKJACK_LEAD, arpType: "sine",
        arpGain: 0.05, bassType: "triangle", bassGain: 0.18, arpRelease: 0.85, master: 0.34 },
    seabattle: { bpm: 112, lpf: 2200, prog: ["Am", "F", "C", "E"], lead: SEA_LEAD, arpType: "triangle", arpGain: 0.055, bassType: "sawtooth", bassGain: 0.17, arpRelease: 0.42, master: 0.44 },
};

// `place` lets a scene put the toggle somewhere its own HUD isn't. The default top-right corner sits exactly
// on top of the enemy's name plate in a ship battle, so that scene asks for the opposite corner.
const PLACE = {
    "top-right": { top: 10, right: 10 },
    "bottom-left": { bottom: 10, left: 10 },
    // "inline" opts OUT of absolute positioning entirely, so a scene can place this button in its own layout
    // instead of guessing a corner. The ship battle needs it: every corner of that scene is occupied by
    // something, and a fallback to top-right put the toggle on the enemy's name.
    inline: null,
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
            style={{ ...(place === "inline" ? { position: "static", flex: "0 0 auto" } : { position: "absolute", ...(PLACE[place] || PLACE["top-right"]) }), zIndex: 9, width: 34, height: 34, borderRadius: place === "inline" ? 10 : 999, border: "1px solid rgba(255,215,94,0.28)", background: "rgba(255,255,255,0.05)", color: "#e8dcc6", fontSize: 17, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
            {/* A GLYPH, NOT AN EMOJI. 🎵 renders in the operating system's own colours — a purple note in a
                warm gold-and-timber scene, immune to the `color` set right above it — which is precisely the
                reason this app does not use emoji on its own surfaces. */}
            {muted ? <GiSpeakerOff aria-hidden="true" /> : <GiMusicalNotes aria-hidden="true" />}
        </button>
    );
}
