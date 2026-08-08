"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Gi from "react-icons/gi";
import SceneMusic from "@/components/SceneMusic";

// Spoils get their sprite, not a word. `+340 gold` as plain text is a receipt; a coin with a number on it is a
// reward. Only the kinds with art on disk appear here — anything else falls through to text, which is correct
// rather than a gap (see public/images/ui).
const REWARD_ART = {
    gold: "/images/ui/coin.png",
    goldLost: "/images/ui/coin.png",
    chest: "/images/ui/chest.png",
    parts: "/images/ui/parts.png",
    seed: "/images/ui/seed.png",
    item: "/images/ui/gear.png",
    loot: "/images/ui/gear.png",
};
// Chest-tier fragments have their own art per tier, so the sprite says which jar it went into before the words do.
const FRAG_ART = (tier) => `/images/sailing/fragment-${tier || "wooden"}.png`;
const rewardArt = (r) => (r.kind === "fragments" ? FRAG_ART(r.tier) : REWARD_ART[r.kind] || null);

// WHAT THE SPOIL ACTUALLY SAYS. "+1 fragments" was the complaint and it was the right one — fragments are the
// only reward whose VALUE is the tier, and the recap named every other thing precisely while calling that one
// by its plural. Same for a chest ("gold chest" → "Gold Chest") and for plunder, which now names the item and
// its rarity because "you took something off their deck" is the whole point of it.
const TIER_WORD = { wooden: "Wooden", iron: "Iron", gold: "Gold", mythic: "Mythic", ascendant: "Ascendant", eternal: "Eternal" };
const cap1 = (v) => (v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : "");
function rewardText(r) {
    switch (r.kind) {
        case "doubloons": return `+${r.n} doubloons`;
        case "gold": return `+${r.n.toLocaleString()} gold`;
        case "goldLost": return `−${r.n.toLocaleString()} gold`;
        case "xp": return `+${r.n} XP`;
        case "fragments": return `+${r.n} ${TIER_WORD[r.tier] || "Wooden"} fragment${r.n === 1 ? "" : "s"}`;
        case "parts": return `+${r.n} tier-${r.tier} parts`;
        case "chest": return `${TIER_WORD[r.tier] || cap1(r.tier)} Chest`;
        case "loot": return `${r.name} · ${cap1(r.rarity)}`;
        case "item": return `plundered ${r.name}`;
        case "free": return "battle not used up!";
        case "seed": return "a seed for the farm";
        default: return String(r.kind);
    }
}

// ── SOUND ────────────────────────────────────────────────────────────────────────────────────────────────────
// The fight had music and nothing else: guns fired in silence and a hit landed in silence, which is why a
// broadside felt like a number changing. All built live off one AudioContext (no assets to load, same approach
// as the forge and the mine), and every call is wrapped — a browser that blocks audio must never break a tap.
let _ac = null;
const ac = () => {
    if (typeof window === "undefined") return null;
    try {
        _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
        if (_ac.state === "suspended") _ac.resume();
        return _ac;
    } catch { return null; }
};
// Filtered noise — the body of every one of these sounds. A cannon is mostly noise; tone alone reads as a beep.
function noise(a, { dur = 0.4, type = "lowpass", freq = 900, q = 1, gain = 0.3, sweepTo = null } = {}) {
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, a.currentTime); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, a.currentTime + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(); src.stop(a.currentTime + dur);
}
// A BROADSIDE — not one bang but `guns` staggered cracks, so eleven guns sound like eleven guns.
// EVERY ORDER HAS ITS OWN VOICE. All four used to fire the identical stack of cracks, so choosing an order
// changed the numbers and nothing you could hear — the loudest thing in the fight was indifferent to the one
// decision you make in it. Each now bends the same cannon into a different shape:
//   broadside  the honest full-throated bark
//   rake       higher and thinner, aimed up into the rigging rather than into the hull
//   hole       lower and heavier, a shot punched down at the waterline
//   board      one crash rather than a row — grapnels and boots, not a broadside
const ORDER_VOICE = {
    broadside: { top: 1500, low: 120, bottom: 38, gain: 0.22, dur: 0.34 },
    rake:      { top: 2600, low: 210, bottom: 90, gain: 0.15, dur: 0.26 },
    hole:      { top: 1000, low: 82,  bottom: 26, gain: 0.28, dur: 0.44 },
    board:     { top: 900,  low: 150, bottom: 44, gain: 0.26, dur: 0.5 },
};
function sfxFire(guns = 4, order = "broadside") {
    const a = ac(); if (!a) return;
    const v = ORDER_VOICE[order] || ORDER_VOICE.broadside;
    try {
        // Boarding is ONE event — a row of staggered cracks is the sound of guns, and boarding fires none.
        const n = order === "board" ? 1 : Math.max(1, Math.min(7, guns));
        for (let i = 0; i < n; i++) {
            setTimeout(() => {
                const t = ac(); if (!t) return;
                noise(t, { dur: v.dur, freq: v.top, sweepTo: order === "rake" ? 600 : 180, gain: v.gain * 0.72 });
                const o = t.createOscillator(), g = t.createGain();
                o.type = order === "board" ? "sawtooth" : "sine";
                o.frequency.setValueAtTime(v.low, t.currentTime);
                o.frequency.exponentialRampToValueAtTime(v.bottom, t.currentTime + v.dur * 0.65);
                g.gain.setValueAtTime(v.gain, t.currentTime);
                g.gain.exponentialRampToValueAtTime(0.0001, t.currentTime + v.dur * 0.78);
                o.connect(g); g.connect(t.destination); o.start(); o.stop(t.currentTime + v.dur * 0.85);
            }, i * 90);
        }
    } catch { /* audio is a bonus */ }
}
// WATER COMING IN, as a sound. A hole opening was silent, which made the single most dramatic thing that can
// happen in a fight the only one you could miss while looking away.
function sfxLeak() {
    const a = ac(); if (!a) return;
    try {
        noise(a, { dur: 0.9, type: "lowpass", freq: 500, sweepTo: 1800, gain: 0.2 });
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(300, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(70, a.currentTime + 0.5);
        g.gain.setValueAtTime(0.18, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.6);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.62);
    } catch { /* audio is a bonus */ }
}
// SHOT INTO A HULL — timber, not metal: a short low crack with a woody band-pass on the noise.
function sfxHit(big = false) {
    const a = ac(); if (!a) return;
    try {
        noise(a, { dur: big ? 0.5 : 0.3, type: "bandpass", freq: big ? 260 : 420, q: 0.8, gain: big ? 0.3 : 0.2 });
        const o = a.createOscillator(), g = a.createGain();
        o.type = "triangle"; o.frequency.setValueAtTime(big ? 90 : 150, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(big ? 34 : 60, a.currentTime + 0.2);
        g.gain.setValueAtTime(big ? 0.28 : 0.16, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (big ? 0.42 : 0.24));
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.45);
    } catch { /* audio is a bonus */ }
}
// A MISS — shot into the sea. Bright hiss sweeping down, no thump.
function sfxSplash() {
    const a = ac(); if (!a) return;
    try { noise(a, { dur: 0.45, type: "highpass", freq: 900, sweepTo: 2600, gain: 0.11 }); } catch { /* ok */ }
}
// THE RESULT. A win gets a rising major fanfare; a loss gets the same shape falling and detuned, so you know
// which happened before you have read a word of it.
function sfxResult(win) {
    const a = ac(); if (!a) return;
    try {
        const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 293.66, 233.08];
        notes.forEach((f, i) => {
            const o = a.createOscillator(), g = a.createGain();
            const t = a.currentTime + i * (win ? 0.11 : 0.16);
            o.type = win ? "triangle" : "sawtooth";
            o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(win ? 0.16 : 0.1, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + (win ? 0.55 : 0.7));
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.72);
        });
        if (win) { // a bell over the top of the last note
            const o = a.createOscillator(), g = a.createGain();
            const t = a.currentTime + 0.44;
            o.type = "sine"; o.frequency.setValueAtTime(1567.98, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 1.2);
        }
    } catch { /* audio is a bonus */ }
}

// Drifting sea spray. A fixed table rather than Math.random() so the server and the client agree on the first
// paint — randomising these at render is a hydration mismatch, and the whole field is decorative anyway.
const MOTES = [
    { x: 4, d: 0, t: 13, z: 0.5 }, { x: 13, d: 3.5, t: 17, z: 0.8 }, { x: 21, d: 7, t: 11, z: 0.4 },
    { x: 29, d: 1.5, t: 15, z: 0.7 }, { x: 38, d: 9, t: 19, z: 1 }, { x: 46, d: 5, t: 12, z: 0.5 },
    { x: 55, d: 11, t: 16, z: 0.9 }, { x: 63, d: 2.5, t: 14, z: 0.6 }, { x: 71, d: 8, t: 18, z: 0.8 },
    { x: 79, d: 4.5, t: 12, z: 0.4 }, { x: 87, d: 10, t: 16, z: 0.7 }, { x: 95, d: 6, t: 13, z: 0.55 },
];

// ── THE SHIP BATTLE ──────────────────────────────────────────────────────────────────────────────────────────
// The first cut resolved the whole fight server-side and played it back. It looked fine and felt like nothing:
// you pressed Engage and watched a replay you had no part in. A battle is fought a ROUND at a time now — the
// server hands back one exchange per order, and between exchanges the screen waits for you.
//
// Four orders, each a trade rather than a strictly-better button (see ship-battle.js): broadside, rake, brace,
// board. The whole point is that "what do I do about this" has an answer other than watching.
//
// What is on screen and why:
//   • both ships, with their CAPTAIN and their PET on deck — you are fighting a person, not a stat block
//   • a broadside as one ball per gun, from the muzzle, arcing, splashing when it misses
//   • a running LOG of what actually happened, because a number that flashes for 900ms is not information
//   • the state that decides your next order: rigging shredded, fires burning, who has the weather gauge
//
// Styling lives in globals.css — this file has several components, and a scoped <style jsx> block only reaches
// the one that owns it.

const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};
const clampPct = (v, max) => Math.max(0, Math.min(100, Math.round((v / Math.max(1, max)) * 100)));

// One cannonball per gun, leaving the muzzle in a ragged stagger with a puff of smoke behind it. A broadside
// is not a chord — the guns fire as their crews get to them.
function Volley({ ev }) {
    const shots = ev?.shots || [];
    const dir = ev.side === "me" ? "to-foe" : "to-me";
    return (
        <span className={`sbt-volley ${dir}`} aria-hidden="true">
            <i className="sbt-muzzle" />
            {shots.map((s, i) => (
                <i
                    key={i}
                    className={`sbt-ball${s.hit ? "" : " is-miss"}${s.rake ? " is-rake" : ""}`}
                    style={{ animationDelay: `${i * 90}ms`, "--lane": `${((i % 4) - 1.5) * 11}px` }}
                />
            ))}
            {/* EVERY MISS LANDS SOMEWHERE. A shot that missed simply stopped existing, so accuracy — a stat you
                spend doubloons on — had no visible consequence. Now the sea takes it: a plume, a ring and
                droplets, short of the target so it reads as fallen short rather than blocked. Staggered with
                the gun that fired it, so a ragged broadside throws a ragged row of splashes. */}
            {shots.map((s, i) => (s.hit ? null : (
                <span key={`sp${i}`} className="sbt-splash"
                    style={{ [dir === "to-foe" ? "left" : "right"]: `${62 + (i % 3) * 6}%`,
                        bottom: `${16 + ((i % 4) - 1.5) * 5}%`, animationDelay: `${i * 90}ms` }}>
                    <i style={{ animationDelay: `${i * 90 + 300}ms` }} />
                    <b style={{ animationDelay: `${i * 90 + 300}ms` }} />
                    {SPRAY.map((d, k) => (
                        <u key={k} style={{ "--dx": d[0], "--dy": d[1], "--dd": `${i * 90 + 320}ms` }} />
                    ))}
                </span>
            )))}
        </span>
    );
}

// Where the splinters go. A fixed spread rather than Math.random() so a broadside looks the same shape every
// time it lands — a burst that reshuffles every volley reads as noise, not as damage. Angles favour the sides
// and up, because debris coming straight at the camera is invisible.
// Droplet vectors for a splash — fixed, so every one is the same shape.
// Crew shouts. Deliberately loud and slightly silly — a hole below the waterline is the most dramatic thing
// that happens in this fight and it was previously a grey line in a log that is closed by default.
const SHOUTS_HIT = ["We holed her!", "Right on the waterline!", "She's taking it on!", "Below the line — she's open!", "Hull's opened up!"];
const SHOUTS_TAKEN = ["We're holed!", "Water in the hold!", "She's coming in fast!", "Below the line — man the pumps!", "We're taking it on!"];
const SPRAY = [[-26,-20],[-15,-30],[0,-34],[15,-30],[26,-20],[-20,-8],[20,-8]];
const SPLINTERS = [-142, -108, -74, -38, -8, 22, 56, 92, 128, 162];

// How wide one cannon can be drawn without touching its neighbour. Measured off the real gap between the two
// closest ports rather than assumed from the count, so a hand-placed battery with uneven spacing still fits.
function gunWidthPct(ports) {
    // A ship with ONE gun has a whole deck to itself, so the lone cannon is drawn big — it is the entire
    // visual proof of the Cannons track, and at the old shared 13% it read as a smudge on the rail. The
    // ceiling for a real battery goes up too: 13% was tuned when the fallback packed guns tightly, and it
    // left even a four-gun broadside looking like trim.
    if (ports.length < 2) return 30;
    let gap = Infinity;
    for (let i = 1; i < ports.length; i += 1) gap = Math.min(gap, Math.abs(ports[i].x - ports[i - 1].x));
    return Math.max(6, Math.min(16, gap * 100 * 0.92));
}

function Ship({ f, side, firing, hurt, heavy, low, sinking, burning, leaks = 0, hpFrac = 1 }) {
    // THE GUNS, drawn. `f.ports` is the hull's own battery (gun-ports.js) already trimmed to how many guns the
    // ship actually has, so the deck shows exactly what the HUD claims and an upgrade is a barrel you can point
    // at. They fire in sequence rather than together — a broadside is a ripple down the deck, and the stagger
    // here matches the one the audio uses.
    const ports = f?.ports || [];
    return (
        // SHE SITS LOWER AS SHE TAKES IT. A ship at 8% hull floated exactly as high as one at full, so the
        // only evidence of a fight going badly was a bar at the top of the screen. `--settle` is how far the
        // hull has dropped toward the waterline — nothing at full health, most of a hull-height when she is
        // nearly gone — and it makes a losing fight something you can see from the ships alone.
        <div className={`sbt-ship sbt-ship-${side}${firing ? " is-firing" : ""}${hurt ? " is-hurt" : ""}${low ? " is-low" : ""}${sinking ? " is-sinking" : ""}${leaks ? " is-leaking" : ""}`}
            style={{ "--deck": `${f?.deck ?? 30}%`, "--settle": `${Math.round((1 - Math.max(0, Math.min(1, hpFrac))) * 26)}px` }}>
            <div className="sbt-hull">
                {f?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.art} alt="" className={`sbt-boat${f.mirror ? " is-mirror" : ""}`} draggable="false" />
                ) : <span className="sbt-boat-fallback" aria-hidden="true" />}
                {/* THE CREW. A ship with nobody on it is a prop; this is the person you are fighting. */}
                <span className="sbt-crew">
                    {f?.pet?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.pet.url} alt="" className="sbt-pet"
                            style={{ transform: (side === "foe") !== Boolean(f.pet.flip) ? "scaleX(-1)" : undefined }} />
                    ) : null}
                    {f?.rider ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.rider} alt="" className="sbt-rider"
                            style={{ transform: (side === "foe") !== Boolean(f.riderFlip) ? "scaleX(-1)" : undefined }} />
                    ) : null}
                </span>
                {/* THE IMPACT. The shot arrived and the hull did nothing about it — the ball's own flash was
                    the entire consequence. One burst per volley rather than one per ball: a broadside is a
                    single event on the receiving end, and ten separate puffs read as ten separate mistakes. */}
                {hurt ? (
                    <span className={`sbt-hit${heavy ? " is-heavy" : ""}`} aria-hidden="true">
                        {/* The moment the shot lands. Small and FAST — 160ms — because the last version of this
                            was a 34px radial gradient that hung around as an orange pancake. A flash you barely
                            register is what sells an impact; one you can look at is a bug. */}
                        <i className="sbt-hit-flash" />
                        <i className="sbt-hit-smoke" />
                        <i className="sbt-hit-smoke is-two" />
                        {SPLINTERS.map((a, i) => <i key={i} className="sbt-splinter" style={{ "--a": `${a}deg`, animationDelay: `${i * 14}ms` }} />)}
                    </span>
                ) : null}
                {ports.length ? (
                    // Guns shrink as they multiply. Overlapping barrels read as one dark bar across the hull;
                    // the width is derived from the actual spacing between the ports so they always separate.
                    <span className="sbt-guns" aria-hidden="true"
                        style={{ "--gw": `${gunWidthPct(ports)}%` }}>
                        {ports.map((g, i) => (
                            <span key={i} className={`sbt-gun${firing ? " is-firing" : ""}`}
                                style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%`, animationDelay: `${i * 90}ms` }}>
                                <i className="sbt-gun-barrel" />
                                {firing ? <i className="sbt-gun-flash" style={{ animationDelay: `${i * 90}ms` }} /> : null}
                                {firing ? <i className="sbt-gun-smoke" style={{ animationDelay: `${i * 90}ms` }} /> : null}
                            </span>
                        ))}
                    </span>
                ) : null}
                {/* ONE GUSH PER HOLE. A leak was a number in the log and a slice of HP; now every hole she is
                    carrying throws water out of the hull, so "taking on water" is a thing you watch rather
                    than read. Spread along the waterline so three holes look like three. */}
                {leaks > 0 ? (
                    <span className="sbt-leaks" aria-hidden="true">
                        {Array.from({ length: Math.min(4, leaks) }).map((_, i) => (
                            <i key={i} style={{ left: `${28 + i * 15}%`, animationDelay: `${i * 260}ms` }} />
                        ))}
                    </span>
                ) : null}
                {burning ? (
                    <span className="sbt-burning" aria-hidden="true">
                        <i /><i /><i />
                        {/* Embers climbing off the flames — a fire that only flickers in place reads as a decal. */}
                        <b className="sbt-ember" /><b className="sbt-ember is-two" /><b className="sbt-ember is-three" />
                    </span>
                ) : null}
            </div>
            <span className="sbt-wake" aria-hidden="true" />
            {sinking ? <span className="sbt-foam" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span> : null}
        </div>
    );
}

function Bar({ f, hp, max, side, rigged, burning }) {
    const pct = clampPct(hp, max);
    return (
        <div className={`sbt-panel sbt-panel-${side}${pct <= 25 ? " is-critical" : ""}`}>
            <div className="sbt-phead">
                {/* The captain's face on the plate. A name and a number is a scoreboard; a face is an opponent. */}
                {f?.rider ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="sbt-pface" src={f.rider} alt="" draggable="false" />
                ) : <span className="sbt-pface is-blank" aria-hidden="true" />}
                <div className="sbt-pname">
                    <b>{f?.name || "Ship"}</b>
                    <em>{f?.cls || (f?.level != null ? `boat level ${f.level}` : "")}</em>
                </div>
            </div>
            <div className="sbt-hpbar">
                {/* Two fills: the coloured one snaps to the new value, the pale one drains after it, so a hit
                    reads as a chunk being taken off rather than a bar quietly being a bit shorter. */}
                <span className="sbt-hpghost" style={{ width: `${pct}%` }} />
                <span className={`sbt-hpfill is-${side}${pct <= 25 ? " is-low" : ""}`} style={{ width: `${pct}%` }} />
                <b className="sbt-hpnum">{Math.max(0, Math.round(hp))} / {max}</b>
            </div>
            <div className="sbt-meta">
                {/* The gun COUNT is off the HUD. Every gun a ship owns is drawn on its deck, so a chip saying
                    "1 guns" was both redundant and — while the deck was rendering bare — the only evidence the
                    guns existed at all. Count the barrels. */}
                {f?.ammo ? <span className={`sbt-ammo is-${f.ammo}`}>{f.ammo}</span> : null}
                {rigged ? <span className="sbt-flag is-rig">−{rigged} guns</span> : null}
                {burning ? <span className="sbt-flag is-fire">burning</span> : null}
            </div>
        </div>
    );
}

// A line of the log for one event. This is the "more data" the fight was missing: what was fired, how many of
// them hit, what it cost, and what it did besides damage.
function logLine(ev, me, foe) {
    const who = ev.side === "me" ? (me?.name || "You") : (foe?.name || "They");
    if (ev.type === "fire") return { side: ev.side, text: `Fire burns aboard ${ev.side === "me" ? (foe?.name || "them") : (me?.name || "you")} — ${ev.dmg}` };
    // Water gets its own lines: taking it, and fighting it. A leak that only showed up as HP quietly vanishing
    // would read as a bug rather than as the thing you chose not to deal with.
    if (ev.type === "leak") {
        const victim = ev.side === "me" ? (foe?.name || "They") : (me?.name || "You");
        return { side: ev.side, text: `${victim} ship${ev.side === "me" ? " is" : " are"} taking on water — ${ev.dmg} from ${ev.holes} hole${ev.holes === 1 ? "" : "s"}` };
    }
    if (ev.type === "leaksprung") return { side: ev.side, big: true, text: `A hole opens below ${ev.side === "me" ? (foe?.name || "their") : (me?.name || "your")} waterline — ${ev.holes} now` };
    if (ev.type === "order" && ev.order === "patch") {
        if (!ev.sealed) return { side: ev.side, text: `${who} man the pumps — and the water keeps coming (${ev.holes} still open)` };
        return { side: ev.side, text: `${who} man the pumps — ${ev.sealed} hole${ev.sealed === 1 ? "" : "s"} closed${ev.holes ? `, ${ev.holes} still open` : ""}` };
    }
    if (ev.type !== "volley") return null;
    const hits = (ev.shots || []).filter((s) => s.hit).length;
    const raked = (ev.shots || []).some((s) => s.rake);
    const verb = ev.order === "board" ? "boards" : ev.order === "rake" ? "rakes the rigging"
        : ev.order === "hole" ? "fires low, at the waterline" : "fires a broadside";
    return {
        side: ev.side,
        text: `${who} ${verb} — ${hits}/${ev.guns} on target for ${ev.dmg}${raked ? ", RAKED" : ""}${ev.rigged ? ` · ${ev.rigged} of their guns silenced` : ""}`,
        big: raked || ev.order === "board",
    };
}

export default function ShipBattleScene({ battle, busy, onOrder, onClose }) {
    const me = battle?.me || {};
    const foe = battle?.foe || {};
    const events = battle?.events || [];

    const [phase, setPhase] = useState(battle?.round ? "orders" : "intro"); // intro → play → orders → sinking → result
    const [step, setStep] = useState(-1);
    const [myHp, setMyHp] = useState(battle?.myHp ?? battle?.myMax ?? 100);
    const [foeHp, setFoeHp] = useState(battle?.foeHp ?? battle?.foeMax ?? 100);
    const [fx, setFx] = useState(null);
    const [shake, setShake] = useState(null);
    const [log, setLog] = useState([]);
    const [ready, setReady] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    // One floating number per gun that connected, cleared when the round advances.
    const [pops, setPops] = useState([]);
    // What the crew yell when the water starts coming in. Two tables, because "we holed them" and "we are
    // holed" are opposite feelings and one shared line would land wrong half the time.
    const [shout, setShout] = useState(null);
    const logRef = useRef(null);

    // Open the log with the ship you are up against, so round one is not a blank panel over an empty sea. The
    // log sits in the upper half of the screen and it is the only thing up there — it has to say something the
    // moment the fight starts, and "here is who you are fighting and what they are carrying" is the line the
    // player wants before choosing an order anyway.
    useEffect(() => {
        if (!foe?.name) return;
        setLog((l) => (l.length ? l : [{
            k: "open", side: "foe", big: true,
            text: `${foe.name}${foe.cls ? ` — ${foe.cls}` : ""} · ${foe.guns} guns · ${foe.ammo || "round"} shot loaded.`,
        }, ...(foe.flavor ? [{ k: "flavor", side: "foe", text: foe.flavor }] : [])]));
    }, [foe?.name, foe?.cls, foe?.guns, foe?.ammo, foe?.flavor]);

    // A fresh batch of events (the answer to an order) → play it.
    useEffect(() => {
        if (!events.length) { setPhase((ph) => (ph === "intro" ? ph : "orders")); return; }
        setStep(0);
        setPhase("play");
    }, [events]);

    // Opening splash.
    useEffect(() => {
        if (phase !== "intro") return undefined;
        const t = setTimeout(() => setPhase("orders"), 1600);
        return () => clearTimeout(t);
    }, [phase]);

    // Step through this exchange. Each phase transition owns its own timer — scheduling a cross-phase timer
    // inside this effect is how the first version dead-ended on the sinking with no recap.
    useEffect(() => {
        if (phase !== "play" || step < 0) return undefined;
        if (step >= events.length) {
            if (battle?.over) { setPhase(battle?.sunk ? "sinking" : "result"); return undefined; }
            const t = setTimeout(() => setPhase("orders"), 260);
            return () => clearTimeout(t);
        }
        const ev = events[step];
        const line = logLine(ev, me, foe);
        if (line) setLog((l) => [...l.slice(-40), { ...line, k: `${battle?.round}-${step}` }]);

        if (ev.type === "volley") {
            setFx({ k: `${battle?.round}-${step}`, ...ev });
            setPops([]);
            setShout(null);
            // The guns go off as the balls leave, and the timber cracks when they arrive — the 440ms below is
            // the flight time the shot animation is built around, so picture and sound land together.
            sfxFire(ev.guns || (ev.shots || []).length, ev.order);
            // EACH GUN LANDS ITS OWN HIT. The volley resolved as one lump — every barrel fired, then a single
            // number appeared — so a seven-gun broadside felt exactly like a one-gun one. Each hit now throws
            // its own damage number on the beat of the gun that fired it, so you SEE the broadside arrive in
            // pieces and a bigger battery is visibly bigger rather than just a larger total.
            const shotsFired = ev.shots || [];
            const pops = shotsFired.map((sh, i) => (sh.hit ? setTimeout(() => {
                setPops((list) => [...list.slice(-11), { k: `${battle?.round}-${step}-${i}`, side: ev.side, dmg: sh.dmg, rake: sh.rake, lane: (i % 4) - 1.5 }]);
            }, 210 + i * 90) : null)).filter(Boolean);
            const land = setTimeout(() => {
                setMyHp(ev.my); setFoeHp(ev.foe);
                const shots = ev.shots || [];
                const hits = shots.filter((s) => s.hit).length;
                const heavy = shots.some((s) => s.rake) || ev.order === "board";
                if (hits) sfxHit(heavy || hits >= 4); else if (shots.length) sfxSplash();
                if (hits) setShake({ k: step, big: heavy });
            }, 210 + Math.max(0, (shotsFired.length - 1)) * 90);
            const clearShake = setTimeout(() => setShake(null), 900);
            const next = setTimeout(() => setStep((v) => v + 1), 900 + Math.max(0, (shotsFired.length - 1)) * 90);
            return () => { pops.forEach(clearTimeout); clearTimeout(land); clearTimeout(clearShake); clearTimeout(next); };
        }
        // A HOLE OPENING IS THE LOUDEST MOMENT IN THE FIGHT, so it gets a shout and a sound rather than a line
        // of grey text in a log that is closed by default. The crew say what happened; you do not have to read
        // anything to know a ship is filling up.
        if (ev.type === "leaksprung") {
            sfxLeak();
            setShout({ k: `${battle?.round}-${step}`, side: ev.side,
                text: ev.side === "me" ? SHOUTS_HIT[Math.floor(Math.random() * SHOUTS_HIT.length)]
                    : SHOUTS_TAKEN[Math.floor(Math.random() * SHOUTS_TAKEN.length)] });
        }
        if (ev.type === "order" && ev.order === "patch") {
            setShout({ k: `${battle?.round}-${step}`, side: ev.side,
                text: ev.sealed ? (ev.holes ? "Plugged one — she's still coming in!" : "Holes plugged! She's tight again!")
                    : "Pumps aren't holding — she's still taking it!" });
        }
        setMyHp(ev.my); setFoeHp(ev.foe);
        const next = setTimeout(() => setStep((v) => v + 1), 720);
        return () => clearTimeout(next);
    }, [phase, step, events, battle, me, foe]);

    useEffect(() => {
        if (phase !== "sinking") return undefined;
        const t = setTimeout(() => setPhase("result"), 2500);
        return () => clearTimeout(t);
    }, [phase]);

    useEffect(() => {
        if (phase !== "result") return undefined;
        sfxResult(Boolean(battle?.win));
        const t = setTimeout(() => setReady(true), 600);
        return () => clearTimeout(t);
    }, [phase, battle?.win]);

    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

    const give = useCallback((order) => { setFx(null); onOrder?.(order); }, [onOrder]);

    const sinkingSide = phase === "sinking" || phase === "result" ? battle?.sunk : null;
    const win = Boolean(battle?.win);
    const lowAny = clampPct(myHp, battle?.myMax) <= 25 || clampPct(foeHp, battle?.foeMax) <= 25;

    return (
        <div className="sbt-scene" role="dialog" aria-modal="true">
            <div className="sbt-sky" aria-hidden="true" />
            <div className="sbt-sea" aria-hidden="true" />
            {/* AMBIENCE. The scene was two ships sitting still on a flat gradient with two thirds of the screen
                empty above them — nothing on it moved between orders, which made a turn-based fight feel like a
                paused one. Drifting spray and a slow swell give the sea something to do while you think. */}
            <div className="sbt-motes" aria-hidden="true">
                {MOTES.map((m, i) => <i key={i} style={{ left: `${m.x}%`, animationDelay: `${m.d}s`, animationDuration: `${m.t}s`, "--mz": m.z }} />)}
            </div>

            <div className="sbt-hud">
                <Bar f={me} hp={myHp} max={battle?.myMax} side="me" rigged={battle?.rigged?.me} burning={battle?.burning?.me} />
                <div className="sbt-round">
                    <b>Round {Math.max(1, battle?.round || 1)}</b>
                    <em>{battle?.gauge === "me" ? "you hold the gauge" : "they hold the gauge"}</em>
                </div>
                <Bar f={foe} hp={foeHp} max={battle?.foeMax} side="foe" rigged={battle?.rigged?.foe} burning={battle?.burning?.foe} />
            </div>

            {/* CLOSED BY DEFAULT, BEHIND ITS OWN BUTTON. The log has now covered the masts (anchored to the top)
                and then the order cards (anchored to the bottom), because there is no free strip on a phone
                between two ships and four buttons — every position it can hold is on top of something you need.
                So it holds nothing until you ask for it: a pill that says how many lines are waiting, and the
                log only exists on screen while it is open. The fight is the thing you watch; the transcript is
                something you check. */}
            <div className={`sbt-logwrap${logOpen ? " is-open" : ""}`}>
                {/* Music shares this row. Every corner of this scene is occupied — HUD at the top, ships in the
                    middle, orders below — so the two chrome buttons live in the one strip that is genuinely
                    free, in flow, where neither can land on anything. */}
                <SceneMusic vibe="seabattle" place="inline" />
                {/* A WAY OUT, at any point. `onClose` existed but was only wired to the result screen, so once a
                    fight opened there was no leaving it until it ended — and a battle can run twelve rounds.
                    Nothing is forfeited: the fight is stored server-side and the sortie is already spent, so
                    this closes the window and the sailing page hands it straight back. */}
                {onClose ? (
                    <button type="button" className="sbt-leave" onClick={onClose}
                        title={battle?.over ? "Close" : "Leave — this fight will be waiting for you"}>
                        {battle?.over ? "Close" : "Leave fight"}
                    </button>
                ) : null}
                {logOpen ? (
                    <div className="sbt-log is-open" ref={logRef}>
                        {log.map((l) => (
                            <p key={l.k} className={`sbt-logline is-${l.side}${l.big ? " is-big" : ""}`}>{l.text}</p>
                        ))}
                    </div>
                ) : null}
                {/* ALWAYS RENDERED, never conditional. This used to appear only once the log had lines in it, so
                    the row silently grew a button partway through round one and the layout under it shifted —
                    the same class of thing as orders coming and going. It is disabled and dimmed when there is
                    nothing to read instead, so the chrome stays exactly where it was when you last looked. */}
                <button type="button" className={`sbt-logtoggle${logOpen ? " is-open" : ""}${log.length ? "" : " is-idle"}`}
                    disabled={!log.length} onClick={() => setLogOpen((o) => !o)}>
                    {logOpen ? "Hide log" : `Battle log${log.length ? ` · ${log.length}` : ""}`}
                </button>
            </div>

            <div className={`sbt-shakewrap${shake ? (shake.big ? " is-quake" : " is-shake") : ""}`}>
                <div className={`sbt-stage${lowAny ? " is-desperate" : ""}`}>
                    <Ship f={me} side="me" firing={fx?.side === "me" && phase === "play"}
                        hurt={fx?.side === "foe" && phase === "play"}
                        heavy={Boolean(fx?.side === "foe" && ((fx?.shots || []).some((x) => x.rake) || fx?.order === "board"))}
                        low={clampPct(myHp, battle?.myMax) <= 25}
                        sinking={sinkingSide === "me"} burning={(battle?.burning?.me || 0) > 0}
                        leaks={battle?.leaks?.me || 0} hpFrac={(myHp || 0) / Math.max(1, battle?.myMax || 1)} />
                    <Ship f={foe} side="foe" firing={fx?.side === "foe" && phase === "play"}
                        hurt={fx?.side === "me" && phase === "play"}
                        heavy={Boolean(fx?.side === "me" && ((fx?.shots || []).some((x) => x.rake) || fx?.order === "board"))}
                        low={clampPct(foeHp, battle?.foeMax) <= 25}
                        sinking={sinkingSide === "foe"} burning={(battle?.burning?.foe || 0) > 0}
                        leaks={battle?.leaks?.foe || 0} hpFrac={(foeHp || 0) / Math.max(1, battle?.foeMax || 1)} />

                    {phase === "play" && fx ? <Volley key={`v${fx.k}`} ev={fx} /> : null}
                    {/* PER GUN. The single lump total is gone — each barrel that connects throws its own
                        number, on its own beat, staggered down the deck with the gun that fired it. A
                        seven-gun broadside now arrives as seven hits you can count instead of one figure
                        that happened to be larger. Raking shots come in hot and named. */}
                    {/* The shout, over the ship it happened to. Cleared on the next volley so it never lingers. */}
                    {shout ? (
                        <span key={shout.k} className={`sbt-shout ${shout.side === "me" ? "on-foe" : "on-me"}`}>{shout.text}</span>
                    ) : null}
                    {phase === "play" ? pops.map((pp) => (
                        <span key={pp.k} className={`sbt-pop ${pp.side === "me" ? "on-foe" : "on-me"}${pp.rake ? " is-rake" : ""}`}
                            style={{ "--lane": `${pp.lane * 26}px` }}>
                            −{pp.dmg}{pp.rake ? <b>RAKE</b> : null}
                        </span>
                    )) : null}
                    {/* The order's own headline, kept for BOARD — a boarding action is one event, not a volley. */}
                    {phase === "play" && fx?.dmg && fx.order === "board" ? (
                        <span key={`d${fx.k}`} className={`sbt-float ${fx.side === "me" ? "on-foe" : "on-me"}`}>
                            −{fx.dmg}<b>BOARDED</b>
                        </span>
                    ) : null}
                </div>
            </div>

            {/* THE LOG — what actually happened, in order, still there a second later.
                It grows a line per exchange, and by round three a full history was a wall of text sitting over
                the two ships you are trying to look at while choosing an order. So it is COLLAPSED by default
                to the last couple of lines — enough to see what just happened — and taps open to the whole
                fight. The information never goes away; it just stops being in front of the thing it describes. */}

            {/* ORDERS — the reason this is a fight rather than a cutscene, so this is where the juice goes.
                The icons were react-icons glyphs: one flat colour on a flat card, at the single moment the
                player is actually deciding something. They are painted sprites now, and the card carries its
                order's colour rather than being four identical dark rectangles. */}
            {/* THE BOARD STAYS PUT WHILE THE VOLLEY PLAYS. This used to unmount the whole order block the moment
                you tapped and remount it when the round finished — so the controls vanished, the page got
                shorter, everything below jumped up, and then it all came back. Rendered continuously now and
                simply made inert during the exchange: the layout never moves, and the cards visibly go quiet
                while the guns are talking. Only a finished battle removes them, because then they are done. */}
            {!battle?.over ? (
                <div className={`sbt-orders${phase === "orders" ? "" : " is-waiting"}`}>
                    <div className="sbt-orders-call">Give the order</div>
                    {(battle?.orders || []).map((o) => (
                        // `available` is false for the pump until you are taking water. Dimmed and inert rather
                        // than removed, so the grid never reflows under a thumb mid-fight.
                        <button key={o.id} type="button"
                            className={`sbt-order is-${o.id}${o.available === false ? " is-unavailable" : ""}`}
                            disabled={busy || o.available === false || phase !== "orders"}
                            onClick={() => give(o.id)}>
                            <span className="sbt-order-shine" aria-hidden="true" />
                            <span className="sbt-order-art" aria-hidden="true">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/images/sailing/orders/${o.id}.png`} alt="" draggable="false" />
                            </span>
                            <b>{o.name}</b>
                            <em>{o.desc}</em>
                        </button>
                    ))}
                </div>
            ) : null}

            {phase === "intro" ? (
                <div className="sbt-intro">
                    <div className="sbt-intro-tag">{foe.boss ? "FLAGSHIP" : "SHIP BATTLE"}</div>
                    <div className="sbt-intro-name">{foe.name}</div>
                    {foe.cls ? <div className="sbt-intro-cls">{foe.cls}</div> : null}
                    {foe.flavor ? <p className="sbt-intro-flavor">{foe.flavor}</p> : null}
                </div>
            ) : null}

            {phase === "sinking" ? (
                <div className="sbt-sinkcall">
                    {battle?.sunk === "foe" ? <>You sank <b>{foe.name}</b></> : <>Your ship is going down</>}
                </div>
            ) : null}

            {phase === "result" ? (
                <div className="sbt-result">
                    <div className={`card sbt-result-card ${win ? "is-win" : "is-lose"}`}>
                        <div className={`sbt-result-banner ${win ? "is-win" : "is-lose"}`}>
                            {win ? (battle?.sunk === "foe" ? "Sunk!" : "Victory") : (battle?.sunk === "me" ? "Sent to the bottom" : "Driven off")}
                        </div>
                        <p className="sbt-result-line">
                            {win
                                ? <>{foe.name} {battle?.sunk === "foe" ? "went down by the bow" : "broke off and ran"} after {battle?.round} round{battle?.round === 1 ? "" : "s"}.</>
                                : <>{foe.name} had the better of it after {battle?.round} round{battle?.round === 1 ? "" : "s"}.</>}
                        </p>
                        {battle?.reward?.length ? (
                            <div className="sbt-rewards">
                                {battle.reward.map((r, i) => {
                                    const art = rewardArt(r);
                                    return (
                                        <span key={i} className={`sbt-reward is-${r.kind}${r.rarity ? ` is-r-${r.rarity}` : ""}`}
                                            style={{ animationDelay: `${0.18 + i * 0.11}s` }}>
                                            {art ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className="sbt-reward-art" src={art} alt="" draggable="false" />
                                            ) : null}
                                            {rewardText(r)}
                                        </span>
                                    );
                                })}
                            </div>
                        ) : null}
                        <button className="sail-cta" disabled={!ready} onClick={onClose}>{ready ? "Back to the helm ⚓" : "…"}</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
