"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as Gi from "react-icons/gi";
import SceneMusic from "@/components/SceneMusic";
import { zoneById, zoneNear, zoneRects, zoneKeyFromArt } from "@/lib/marketplace/ship-zones.js";

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
const FRAG_ART = (tier) => `/images/sailing/fragment-${tier || "wooden"}.png`;
const rewardArt = (r) => (r.kind === "fragments" ? FRAG_ART(r.tier) : REWARD_ART[r.kind] || null);

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
// All built live off one AudioContext (no assets to load, same approach as the forge and the mine), and every
// call is wrapped — a browser that blocks audio must never break a tap.
let _ac = null;
const ac = () => {
    if (typeof window === "undefined") return null;
    try {
        _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
        if (_ac.state === "suspended") _ac.resume();
        return _ac;
    } catch { return null; }
};
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
// A BROADSIDE — not one bang but a stagger of cracks, so seven guns sound like seven guns. Each gun now carries
// its own round, so the shape of the crack follows the AMMUNITION rather than a single order for the volley:
// chain rings, grape hisses, a shell is a heavier, slower thud.
const AMMO_VOICE = {
    round:     { top: 1500, low: 120, bottom: 38, gain: 0.22, dur: 0.34, wave: "sine" },
    chain:     { top: 2400, low: 260, bottom: 110, gain: 0.17, dur: 0.3, wave: "triangle" },
    grape:     { top: 3000, low: 180, bottom: 70, gain: 0.15, dur: 0.24, wave: "sawtooth" },
    explosive: { top: 1000, low: 82, bottom: 26, gain: 0.3, dur: 0.5, wave: "sine" },
};
function sfxGun(ammo = "round") {
    const a = ac(); if (!a) return;
    const v = AMMO_VOICE[ammo] || AMMO_VOICE.round;
    try {
        noise(a, { dur: v.dur, freq: v.top, sweepTo: 180, gain: v.gain * 0.72 });
        const o = a.createOscillator(), g = a.createGain();
        o.type = v.wave;
        o.frequency.setValueAtTime(v.low, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(v.bottom, a.currentTime + v.dur * 0.65);
        g.gain.setValueAtTime(v.gain, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + v.dur * 0.78);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + v.dur * 0.85);
    } catch { /* audio is a bonus */ }
}
// A crew being told where to aim. Tiny and dry — this fires once per tap and anything with a tail would turn
// laying seven guns into a drum solo.
function sfxAim(clear = false) {
    const a = ac(); if (!a) return;
    try {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(clear ? 420 : 720, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(clear ? 260 : 980, a.currentTime + 0.06);
        g.gain.setValueAtTime(0.05, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.09);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.1);
    } catch { /* ok */ }
}
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
    } catch { /* ok */ }
}
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
    } catch { /* ok */ }
}
function sfxSplash() {
    const a = ac(); if (!a) return;
    try { noise(a, { dur: 0.45, type: "highpass", freq: 900, sweepTo: 2600, gain: 0.11 }); } catch { /* ok */ }
}
// THE MAGAZINE. The one sound in the fight that is allowed to be enormous, because it is the one event that
// can end a battle in a single ball.
function sfxBlast() {
    const a = ac(); if (!a) return;
    try {
        noise(a, { dur: 1.4, type: "lowpass", freq: 1800, sweepTo: 60, gain: 0.42 });
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(160, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(24, a.currentTime + 0.9);
        g.gain.setValueAtTime(0.4, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.2);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 1.25);
    } catch { /* ok */ }
}
// Timber giving way — a mast coming down, a rudder unshipping, a gun going over. Wooden and final.
function sfxWreck() {
    const a = ac(); if (!a) return;
    try {
        noise(a, { dur: 0.7, type: "bandpass", freq: 300, q: 0.6, gain: 0.26, sweepTo: 120 });
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sawtooth"; o.frequency.setValueAtTime(110, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(40, a.currentTime + 0.55);
        g.gain.setValueAtTime(0.16, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.6);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.65);
    } catch { /* ok */ }
}
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
        if (win) {
            const o = a.createOscillator(), g = a.createGain();
            const t = a.currentTime + 0.44;
            o.type = "sine"; o.frequency.setValueAtTime(1567.98, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 1.2);
        }
    } catch { /* ok */ }
}

// Drifting sea spray. A fixed table rather than Math.random() so the server and the client agree on the first
// paint — randomising these at render is a hydration mismatch, and the whole field is decorative anyway.
const MOTES = [
    { x: 4, d: 0, t: 13, z: 0.5 }, { x: 13, d: 3.5, t: 17, z: 0.8 }, { x: 21, d: 7, t: 11, z: 0.4 },
    { x: 29, d: 1.5, t: 15, z: 0.7 }, { x: 38, d: 9, t: 19, z: 1 }, { x: 46, d: 5, t: 12, z: 0.5 },
    { x: 55, d: 11, t: 16, z: 0.9 }, { x: 63, d: 2.5, t: 14, z: 0.6 }, { x: 71, d: 8, t: 18, z: 0.8 },
    { x: 79, d: 4.5, t: 12, z: 0.4 }, { x: 87, d: 10, t: 16, z: 0.7 }, { x: 95, d: 6, t: 13, z: 0.55 },
];
const SPRAY = [[-26, -20], [-15, -30], [0, -34], [15, -30], [26, -20], [-20, -8], [20, -8]];
const SPLINTERS = [-142, -108, -74, -38, -8, 22, 56, 92, 128, 162];
const SHOUTS_HIT = ["We holed her!", "Right on the waterline!", "She's taking it on!", "Below the line — she's open!", "Hull's opened up!"];
const SHOUTS_TAKEN = ["We're holed!", "Water in the hold!", "She's coming in fast!", "Below the line — man the pumps!", "We're taking it on!"];

// ── THE SHIP BATTLE ──────────────────────────────────────────────────────────────────────────────────────────
// You do not choose an ORDER any more. You lay every gun you own, one at a time, at a part of the ship in front
// of you — her sails, her hull, her rudder, one particular cannon, or the powder store if the odds appeal — and
// nothing fires until you commit the volley. Seven guns is seven decisions.
//
// The parts are not drawn by hand: ship-zones.js holds a grid measured off each hull's own pixels, so a tap
// anywhere on a ship resolves to whatever is actually under it, and the same table decides the outcome on the
// server. What is on screen and why:
//   • the two ships, big, with their captain and pet on deck — you are fighting a person, not a stat block
//   • a HIGHLIGHT under your finger naming the part, its odds and what it does — aiming is the game now
//   • every ball flying to the exact place it was aimed at, splashing short when it misses
//   • damage you can SEE on the hull: shredded canvas, an unshipped rudder, a gun lying dismounted
//   • their aim, shown on YOUR ship, so their volley is something you watched coming
//
// Styling lives in globals.css — this file has several components, and a scoped <style jsx> block only reaches
// the one that owns it.

const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};
const clampPct = (v, max) => Math.max(0, Math.min(100, Math.round((v / Math.max(1, max)) * 100)));
const shipKey = (f) => zoneKeyFromArt(f?.art, f?.level);

// How wide one cannon can be drawn without touching its neighbour. Measured off the real gap between the two
// closest ports rather than assumed from the count, so a hand-placed battery with uneven spacing still fits.
function gunWidthPct(ports) {
    if (ports.length < 2) return 30;
    let gap = Infinity;
    for (let i = 1; i < ports.length; i += 1) gap = Math.min(gap, Math.abs(ports[i].x - ports[i - 1].x));
    return Math.max(6, Math.min(16, gap * 100 * 0.92));
}

// ── ONE SHIP ─────────────────────────────────────────────────────────────────────────────────────────────────
// Everything that can be aimed at is drawn here, and everything that has been shot off is drawn here too: the
// zone highlight under a finger, the pips saying how many guns are laid where, torn canvas, a dead gun.
function Ship({ f, side, hurt, heavy, low, sinking, burning, leaks = 0, hpFrac = 1, sys, caps,
                aimAt = null, marks = [], preview = null, incoming = [], firingGuns = [], hullRef = null, onAim = null }) {
    const ports = f?.ports || [];
    const key = shipKey(f);
    const mirror = Boolean(f?.mirror);
    const gunHp = sys?.guns || [];

    // Torn canvas and a wrecked rudder, clipped to the real shape of those parts. The sprite cannot be edited,
    // but it can be DARKENED exactly where the damage is — which is why the zone grid earns its keep twice.
    const sailFrac = caps?.sails ? Math.max(0, Math.min(1, (sys?.sails ?? caps.sails) / caps.sails)) : 1;
    const rudderGone = (sys?.rudder ?? 1) <= 0;
    const damage = useMemo(() => {
        if (!key) return { sails: [], rudder: [] };
        return {
            sails: sailFrac < 1 ? zoneRects(key, "sails", { mirror }) : [],
            rudder: rudderGone ? zoneRects(key, "rudder", { mirror }) : [],
        };
    }, [key, mirror, sailFrac, rudderGone]);

    const previewRects = useMemo(
        () => (preview && key ? zoneRects(key, preview, { mirror }) : []),
        [preview, key, mirror],
    );

    return (
        <div className={`sbt-ship sbt-ship-${side}${hurt ? " is-hurt" : ""}${low ? " is-low" : ""}${sinking ? " is-sinking" : ""}${leaks ? " is-leaking" : ""}${onAim ? " is-aimable" : ""}`}
            style={{ "--deck": `${f?.deck ?? 30}%`, "--settle": `${Math.round((1 - Math.max(0, Math.min(1, hpFrac))) * 26)}px` }}>
            <div className="sbt-hull" ref={hullRef}>
                {f?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.art} alt="" className={`sbt-boat${mirror ? " is-mirror" : ""}`} draggable="false" />
                ) : <span className="sbt-boat-fallback" aria-hidden="true" />}

                {/* CANVAS IN RAGS. Opacity rides the damage, so one hit dulls the sails and a wrecked suit is
                    dark and ragged — the ship visibly stops being able to dodge. */}
                {damage.sails.length ? (
                    <span className="sbt-dmg is-sails" aria-hidden="true" style={{ "--torn": 1 - sailFrac }}>
                        {damage.sails.map((r, i) => (
                            <i key={i} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} />
                        ))}
                    </span>
                ) : null}
                {damage.rudder.length ? (
                    <span className="sbt-dmg is-rudder" aria-hidden="true">
                        {damage.rudder.map((r, i) => (
                            <i key={i} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} />
                        ))}
                    </span>
                ) : null}

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

                {hurt ? (
                    <span className={`sbt-hit${heavy ? " is-heavy" : ""}`} aria-hidden="true">
                        <i className="sbt-hit-flash" />
                        <i className="sbt-hit-smoke" />
                        <i className="sbt-hit-smoke is-two" />
                        {SPLINTERS.map((a, i) => <i key={i} className="sbt-splinter" style={{ "--a": `${a}deg`, animationDelay: `${i * 14}ms` }} />)}
                    </span>
                ) : null}

                {/* THE GUNS. A dismounted one stays on the deck, dark and canted over — "that gun is gone" has
                    to be visible on the ship, or aiming at a gun deck is a stat nobody can see working. */}
                {ports.length ? (
                    <span className="sbt-guns" aria-hidden="true" style={{ "--gw": `${gunWidthPct(ports)}%` }}>
                        {ports.map((g, i) => {
                            const dead = gunHp.length ? (gunHp[i] ?? 0) <= 0 : false;
                            const hurtGun = gunHp.length ? (gunHp[i] ?? 0) === 1 : false;
                            const fires = firingGuns.includes(i);
                            return (
                                <span key={i} className={`sbt-gun${fires ? " is-firing" : ""}${dead ? " is-dead" : ""}${hurtGun ? " is-damaged" : ""}`}
                                    style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%` }}>
                                    <i className="sbt-gun-barrel" />
                                    {fires ? <i className="sbt-gun-flash" /> : null}
                                    {fires ? <i className="sbt-gun-smoke" /> : null}
                                </span>
                            );
                        })}
                    </span>
                ) : null}

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
                        <b className="sbt-ember" /><b className="sbt-ember is-two" /><b className="sbt-ember is-three" />
                    </span>
                ) : null}

                {/* WHAT IS UNDER YOUR FINGER. The zone you are about to lay a gun on, lit in its own colour and
                    shaped like the actual part rather than a box drawn over it. */}
                {previewRects.length ? (
                    <span className="sbt-zone is-preview" aria-hidden="true" style={{ "--tint": zoneById(preview).tint }}>
                        {previewRects.map((r, i) => (
                            <i key={i} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} />
                        ))}
                    </span>
                ) : null}

                {/* GUNS ALREADY LAID — one pip per crew, sitting on the part they are aiming at, in the colour
                    of the round they have loaded. This is the whole board state of your own volley. */}
                {marks.map((m) => (
                    <span key={m.k} className={`sbt-mark is-${m.ammo}${m.at === "self" ? " is-repair" : ""}`}
                        style={{ left: `${m.x}%`, top: `${m.y}%` }}
                        onClick={m.onClick ? (e) => { e.stopPropagation(); m.onClick(); } : undefined}>
                        <b>{m.n > 1 ? m.n : ""}</b>
                    </span>
                ))}

                {/* THEIR AIM, ON YOUR SHIP. Their volley used to arrive out of nowhere; now you can see the
                    crosshairs sitting on your rudder before they fire, which is what makes sending a crew to
                    repair something a decision rather than a guess. */}
                {incoming.map((m, i) => (
                    <span key={`in${i}`} className="sbt-incoming" aria-hidden="true" style={{ left: `${m.x}%`, top: `${m.y}%` }} />
                ))}

                {/* The tap surface. One layer over the whole hull that works out WHERE it was tapped — a div per
                    zone cell would be three hundred hit targets and would still not handle the mirror. */}
                {onAim ? <button type="button" className="sbt-aimlayer" onClick={onAim} aria-label={`Aim at ${f?.name || "ship"}`} /> : null}
            </div>
            {sinking ? <span className="sbt-foam" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span> : null}
        </div>
    );
}

// ── THE PANELS ───────────────────────────────────────────────────────────────────────────────────────────────
// Hull, canvas, steering and guns, per ship. The systems live up here as pips rather than numbers: the question
// they answer is "is there anything left to shoot off her", and that is a shape, not a figure.
function Bar({ f, hp, max, side, burning, sys, caps }) {
    const pct = clampPct(hp, max);
    const guns = sys?.guns || [];
    const gunsUp = guns.filter((h) => h > 0).length;
    return (
        <div className={`sbt-panel sbt-panel-${side}${pct <= 25 ? " is-critical" : ""}`}>
            <div className="sbt-phead">
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
                <span className="sbt-hpghost" style={{ width: `${pct}%` }} />
                <span className={`sbt-hpfill is-${side}${pct <= 25 ? " is-low" : ""}`} style={{ width: `${pct}%` }} />
                <b className="sbt-hpnum">{Math.max(0, Math.round(hp))} / {max}</b>
            </div>
            <div className="sbt-sys">
                <span className={`sbt-syschip${(sys?.sails ?? 1) <= 0 ? " is-out" : ""}`} title="Canvas — what keeps her dodging">
                    <Icon name="GiSailboat" className="sbt-sysicon" />
                    {Array.from({ length: caps?.sails || 4 }).map((_, i) => (
                        <i key={i} className={i < (sys?.sails ?? 0) ? "is-up" : ""} />
                    ))}
                </span>
                <span className={`sbt-syschip${(sys?.rudder ?? 1) <= 0 ? " is-out" : ""}`} title="Rudder — whoever has one takes the weather gauge">
                    <Icon name="GiShipWheel" className="sbt-sysicon" />
                    {Array.from({ length: caps?.rudder || 3 }).map((_, i) => (
                        <i key={i} className={i < (sys?.rudder ?? 0) ? "is-up" : ""} />
                    ))}
                </span>
                <span className={`sbt-syschip${gunsUp === 0 ? " is-out" : ""}`} title="Guns still mounted">
                    <Icon name="GiCannon" className="sbt-sysicon" />
                    <em>{gunsUp}/{guns.length || "–"}</em>
                </span>
                {burning ? <span className="sbt-flag is-fire">burning</span> : null}
            </div>
        </div>
    );
}

// A line of the log for one event.
function logLine(ev, me, foe) {
    const nameOf = (who) => (who === "me" ? (me?.name || "You") : (foe?.name || "They"));
    if (ev.type === "burn") return { side: ev.victim === "me" ? "foe" : "me", text: `Fire burns aboard ${nameOf(ev.victim)} — ${ev.dmg}` };
    if (ev.type === "flood") return { side: ev.victim === "me" ? "foe" : "me", text: `${nameOf(ev.victim)} taking on water — ${ev.dmg} from ${ev.holes} hole${ev.holes === 1 ? "" : "s"}` };
    if (ev.type === "leaksprung") return { side: ev.victim === "me" ? "foe" : "me", big: true, text: `A hole opens below ${nameOf(ev.victim)}'s waterline — ${ev.holes} now` };
    if (ev.type === "blast") return { side: ev.victim === "me" ? "foe" : "me", big: true, text: `THE MAGAZINE GOES UP aboard ${nameOf(ev.victim)} — ${ev.dmg}` };
    if (ev.type === "wreck") {
        const what = ev.sys === "sails" ? "sails are in rags" : ev.sys === "rudder" ? "rudder is unshipped — the gauge is lost" : "gun is dismounted";
        return { side: ev.victim === "me" ? "foe" : "me", big: true, text: `${nameOf(ev.victim)}'s ${what}` };
    }
    if (ev.type === "repair") {
        if (ev.sys === "hull") {
            return { side: ev.side, text: ev.sealed
                ? `${nameOf(ev.side)} man the pumps — ${ev.sealed} hole${ev.sealed === 1 ? "" : "s"} closed${ev.left ? `, ${ev.left} still open` : ""}`
                : `${nameOf(ev.side)} man the pumps — and the water keeps coming` };
        }
        const what = ev.sys === "sails" ? "bend on fresh canvas" : ev.sys === "rudder" ? "ship a spare rudder" : "remount a gun";
        return { side: ev.side, text: `${nameOf(ev.side)} ${what}${ev.gained ? "" : " — nothing left to mend"}` };
    }
    if (ev.type !== "volley") return null;
    const shots = ev.shots || [];
    const hits = shots.filter((s) => s.hit).length;
    const where = {};
    for (const s of shots) if (s.hit) where[s.zone] = (where[s.zone] || 0) + 1;
    const parts = Object.entries(where).map(([z, n]) => `${n}×${zoneById(z).name.toLowerCase()}`);
    return {
        side: ev.side,
        text: `${nameOf(ev.side)} fire ${shots.length} gun${shots.length === 1 ? "" : "s"} — ${hits} on target for ${ev.dmg}${parts.length ? ` (${parts.join(", ")})` : ""}`,
        big: shots.some((s) => s.rake || s.blast),
    };
}

export default function ShipBattleScene({ battle, busy, onVolley, onClose }) {
    const me = battle?.me || {};
    const foe = battle?.foe || {};
    const events = useMemo(() => battle?.events || [], [battle?.events]);

    const [phase, setPhase] = useState(battle?.round ? "aim" : "intro"); // intro → aim → play → sinking → result
    const [step, setStep] = useState(-1);
    const [myHp, setMyHp] = useState(battle?.myHp ?? battle?.myMax ?? 100);
    const [foeHp, setFoeHp] = useState(battle?.foeHp ?? battle?.foeMax ?? 100);
    const [shake, setShake] = useState(null);
    const [log, setLog] = useState([]);
    const [ready, setReady] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    const [pops, setPops] = useState([]);
    const [shout, setShout] = useState(null);
    const [balls, setBalls] = useState([]);
    const [hitFx, setHitFx] = useState(null);      // which ship is visibly taking it right now
    const [firing, setFiring] = useState({ side: null, guns: [] });
    const logRef = useRef(null);

    // ── AIMING STATE ─────────────────────────────────────────────────────────────────────────────────────────
    // One entry per gun you have laid. `at` is which ship it is pointed at — "them" to fire, "self" to send the
    // crew below with the pumps or up into the rigging.
    const [aim, setAim] = useState([]);
    const [picking, setPicking] = useState(null);   // the assignment whose ammunition palette is open
    const [preview, setPreview] = useState(null);   // { side, zone } — what the last tap landed on
    const [hint, setHint] = useState(null);

    const stageRef = useRef(null);
    const meHullRef = useRef(null);
    const foeHullRef = useRef(null);
    const [boxes, setBoxes] = useState(null);

    const myGuns = battle?.sys?.me?.guns || [];
    const gunsUp = useMemo(() => myGuns.map((hp, i) => (hp > 0 ? i : -1)).filter((i) => i >= 0), [myGuns]);
    const laid = useMemo(() => new Set(aim.map((a) => a.gun)), [aim]);
    const nextGun = useMemo(() => gunsUp.find((g) => !laid.has(g)), [gunsUp, laid]);
    const rack = battle?.rack || [];
    const defaultAmmo = battle?.loadout || "round";

    // Where each hull is on the stage, in pixels — needed to fly a ball from a muzzle to a rudder. Measured
    // rather than assumed: the ships are sized in vw/px caps and move as they settle.
    const measure = useCallback(() => {
        const stage = stageRef.current, a = meHullRef.current, b = foeHullRef.current;
        if (!stage || !a || !b) return;
        const s = stage.getBoundingClientRect();
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
        setBoxes({ me: box(a), foe: box(b), w: s.width, h: s.height });
    }, []);
    useLayoutEffect(() => {
        measure();
        if (typeof window === "undefined") return undefined;
        window.addEventListener("resize", measure);
        const t = setTimeout(measure, 400);   // the boat art loads after first paint
        return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
    }, [measure, battle?.round]);

    // A point on a ship, in stage pixels: the centre of a zone, or one particular gun port.
    const pointOn = useCallback((side, zone, target) => {
        const box = boxes?.[side];
        const f = side === "me" ? me : foe;
        if (!box) return null;
        if (zone === "guns") {
            const ports = f?.ports || [];
            const p = ports[target] || ports[0];
            if (p) return { x: box.x + p.x * box.w, y: box.y + p.y * box.h };
        }
        const rects = zoneRects(shipKey(f), zone, { mirror: Boolean(f?.mirror) });
        if (!rects.length) return { x: box.x + box.w / 2, y: box.y + box.h * 0.6 };
        let sx = 0, sy = 0, n = 0;
        for (const r of rects) { sx += r.x + r.w / 2; sy += r.y + r.h / 2; n += 1; }
        return { x: box.x + (sx / n / 100) * box.w, y: box.y + (sy / n / 100) * box.h };
    }, [boxes, me, foe]);

    // Where a marker sits ON a ship, as a percentage of that hull — for the pips and the incoming crosshairs.
    const markPos = useCallback((f, zone, target) => {
        if (zone === "guns") {
            const p = (f?.ports || [])[target] ?? (f?.ports || [])[0];
            if (p) return { x: p.x * 100, y: p.y * 100 };
        }
        const rects = zoneRects(shipKey(f), zone, { mirror: Boolean(f?.mirror) });
        if (!rects.length) return { x: 50, y: 60 };
        let sx = 0, sy = 0;
        for (const r of rects) { sx += r.x + r.w / 2; sy += r.y + r.h / 2; }
        return { x: sx / rects.length, y: sy / rects.length };
    }, []);

    // ── LAYING A GUN ─────────────────────────────────────────────────────────────────────────────────────────
    // A tap anywhere on a hull. Gun ports win over the grid when the tap is close to one, because a cannon is a
    // small thing sitting on top of a very large hull and "I meant that gun" is unambiguous.
    const aimTap = useCallback((side, e) => {
        if (phase !== "aim" || busy || battle?.over) return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const u = (e.clientX - r.left) / r.width;
        const v = (e.clientY - r.top) / r.height;
        const f = side === "me" ? me : foe;
        const sys = battle?.sys?.[side];

        // A gun port under the tap?
        let zone = null, target = null;
        const ports = f?.ports || [];
        let best = 0.075;
        ports.forEach((p, i) => {
            const d = Math.hypot(p.x - u, p.y - v);
            const alive = (sys?.guns?.[i] ?? 1) > 0;
            if (d < best && (side === "foe" ? alive : true)) { best = d; zone = "guns"; target = i; }
        });
        if (!zone) zone = zoneNear(shipKey(f), u, v, { mirror: Boolean(f?.mirror) });
        if (!zone) return;

        if (side === "me") {
            // DAMAGE CONTROL. Only the parts that are actually damaged accept a crew, so tapping your own
            // undamaged hull does nothing rather than silently wasting a gun.
            const broken = zone === "hull" ? (battle?.leaks?.me || 0) > 0
                : zone === "sails" ? (sys?.sails ?? 0) < (battle?.caps?.sails ?? 4)
                : zone === "rudder" ? (sys?.rudder ?? 0) < (battle?.caps?.rudder ?? 3)
                : zone === "guns" ? (sys?.guns || []).some((h) => h <= 0)
                : false;
            if (!broken) {
                setHint(zone === "powder" ? "Your magazine is not something to shoot at." : "Nothing to mend there yet.");
                return;
            }
        }
        if (nextGun == null) { setHint("Every gun is laid. Fire when ready."); return; }

        const entry = { gun: nextGun, at: side === "me" ? "self" : "them", zone, target, ammo: side === "me" ? "round" : defaultAmmo };
        setAim((list) => [...list, entry]);
        setPreview({ side, zone });
        setHint(null);
        sfxAim();
        // The palette opens on the shot you just laid — one tap to aim, one more to load something special.
        if (side === "foe") setPicking(entry.gun);
    }, [phase, busy, battle, me, foe, nextGun, defaultAmmo]);

    const clearGun = useCallback((gun) => {
        setAim((list) => list.filter((a) => a.gun !== gun));
        setPicking((p) => (p === gun ? null : p));
        sfxAim(true);
    }, []);
    const loadGun = useCallback((gun, ammo) => {
        setAim((list) => list.map((a) => (a.gun === gun ? { ...a, ammo } : a)));
        setPicking(null);
        sfxAim();
    }, []);

    // Everything laid on one ship, grouped by the exact spot so seven guns on one hull are one pip saying 7.
    const marksFor = useCallback((side) => {
        const f = side === "me" ? me : foe;
        const want = side === "me" ? "self" : "them";
        const groups = new Map();
        for (const a of aim) {
            if (a.at !== want) continue;
            const k = `${a.zone}:${a.target ?? ""}`;
            const g = groups.get(k) || { k, zone: a.zone, target: a.target, n: 0, ammo: a.ammo, guns: [] };
            g.n += 1; g.guns.push(a.gun); g.ammo = a.ammo;
            groups.set(k, g);
        }
        return [...groups.values()].map((g) => {
            const p = markPos(f, g.zone, g.target);
            return { ...g, x: p.x, y: p.y, at: want, onClick: () => (g.n === 1 ? setPicking(g.guns[0]) : clearGun(g.guns[g.guns.length - 1])) };
        });
    }, [aim, me, foe, markPos, clearGun]);

    // Their aim on your ship, from the last volley they told us about.
    const incoming = useMemo(() => {
        if (phase !== "aim" || !battle?.theirAim?.length) return [];
        return battle.theirAim.filter((a) => a.at === "them").map((a) => markPos(me, a.zone, a.target));
    }, [phase, battle?.theirAim, me, markPos]);

    // Open the log with the ship you are up against, so round one is not a blank panel over an empty sea.
    useEffect(() => {
        if (!foe?.name) return;
        setLog((l) => (l.length ? l : [{
            k: "open", side: "foe", big: true,
            text: `${foe.name}${foe.cls ? ` — ${foe.cls}` : ""} · ${foe.guns} guns · aim where it hurts.`,
        }, ...(foe.flavor ? [{ k: "flavor", side: "foe", text: foe.flavor }] : [])]));
    }, [foe?.name, foe?.cls, foe?.guns, foe?.flavor]);

    // A fresh batch of events (the answer to a volley) → play it.
    useEffect(() => {
        if (!events.length) { setPhase((ph) => (ph === "intro" ? ph : "aim")); return; }
        setStep(0);
        setPhase("play");
    }, [events]);

    useEffect(() => {
        if (phase !== "intro") return undefined;
        const t = setTimeout(() => setPhase("aim"), 1600);
        return () => clearTimeout(t);
    }, [phase]);

    // ── PLAYING BACK ONE EXCHANGE ────────────────────────────────────────────────────────────────────────────
    // Every ball flies from the gun that fired it to the part of the ship it was aimed at, and lands when it
    // gets there. The stagger is per gun, so a seven-gun broadside arrives as seven separate events you can
    // count rather than one number that happened to be bigger.
    useEffect(() => {
        if (phase !== "play" || step < 0) return undefined;
        if (step >= events.length) {
            if (battle?.over) { setPhase(battle?.sunk ? "sinking" : "result"); return undefined; }
            // Shot clears with the exchange. Balls left on the stage sat there as little white dots on the
            // hulls while you laid the next volley.
            const t = setTimeout(() => { setPhase("aim"); setAim([]); setPicking(null); setPreview(null); setBalls([]); setPops([]); }, 300);
            return () => clearTimeout(t);
        }
        const ev = events[step];
        const line = logLine(ev, me, foe);
        if (line) setLog((l) => [...l.slice(-40), { ...line, k: `${battle?.round}-${step}` }]);
        const timers = [];

        if (ev.type === "volley") {
            const shots = ev.shots || [];
            const from = ev.side, to = from === "me" ? "foe" : "me";
            const fromBox = boxes?.[from], toF = to === "me" ? me : foe;
            setFiring({ side: from, guns: shots.map((s) => s.gun) });
            setPops([]);
            setShout(null);

            shots.forEach((s, i) => {
                const at = i * 110;
                timers.push(setTimeout(() => {
                    sfxGun(s.ammo);
                    const ports = (from === "me" ? me : foe)?.ports || [];
                    const p = ports[s.gun];
                    const muzzle = fromBox && p
                        ? { x: fromBox.x + p.x * fromBox.w, y: fromBox.y + p.y * fromBox.h }
                        : fromBox ? { x: fromBox.x + fromBox.w / 2, y: fromBox.y + fromBox.h * 0.55 } : null;
                    const land = pointOn(to, s.zone, s.target);
                    if (muzzle && land) {
                        // A MISS FALLS SHORT, into the sea between the ships — the shot has to go somewhere or
                        // accuracy is a stat with no picture attached to it.
                        const end = s.hit ? land : { x: muzzle.x + (land.x - muzzle.x) * 0.72, y: Math.max(land.y, (boxes?.h || 400) * 0.78) };
                        // KEYED, NOT APPENDED. An effect that runs twice — StrictMode in development, any
                        // re-render of the same exchange in the wild — pushed a second copy of the same ball
                        // and React complained about duplicate keys, which is the warning that precedes a shot
                        // being drawn twice or not at all.
                        const key = `${battle?.round}-${step}-${i}`;
                        setBalls((b) => [...b.slice(-14).filter((x) => x.k !== key), {
                            k: key, from: muzzle, to: end, hit: s.hit, ammo: s.ammo, rake: s.rake,
                        }]);
                    }
                }, at));
                timers.push(setTimeout(() => {
                    if (s.hit) {
                        setHitFx({ side: to, heavy: Boolean(s.rake || s.blast), k: `${battle?.round}-${step}-${i}` });
                        sfxHit(Boolean(s.rake || s.blast));
                        setShake({ k: `${step}-${i}`, big: Boolean(s.rake || s.blast) });
                        const pk = `${battle?.round}-${step}-${i}`;
                        setPops((list) => [...list.slice(-11).filter((x) => x.k !== pk), {
                            k: pk, side: ev.side, dmg: s.dmg, rake: s.rake, zone: s.zone, lane: (i % 4) - 1.5,
                        }]);
                    } else sfxSplash();
                }, at + 460));
            });
            const done = shots.length * 110 + 620;
            timers.push(setTimeout(() => { setMyHp(ev.hp.me); setFoeHp(ev.hp.foe); setFiring({ side: null, guns: [] }); setHitFx(null); setShake(null); }, done));
            timers.push(setTimeout(() => setStep((v) => v + 1), done + 180));
            return () => timers.forEach(clearTimeout);
        }

        if (ev.type === "blast") { sfxBlast(); setShake({ k: `b${step}`, big: true }); setShout({ k: `s${step}`, side: ev.victim === "me" ? "foe" : "me", text: "THE MAGAZINE!" }); }
        if (ev.type === "wreck") { sfxWreck(); setShout({ k: `s${step}`, side: ev.victim === "me" ? "foe" : "me",
            text: ev.sys === "sails" ? "Her canvas is gone!" : ev.sys === "rudder" ? "Rudder's away — she can't steer!" : "That gun's dismounted!" }); }
        if (ev.type === "leaksprung") {
            sfxLeak();
            setShout({ k: `s${step}`, side: ev.victim === "me" ? "foe" : "me",
                text: ev.victim === "foe" ? SHOUTS_HIT[Math.floor(Math.random() * SHOUTS_HIT.length)]
                    : SHOUTS_TAKEN[Math.floor(Math.random() * SHOUTS_TAKEN.length)] });
        }
        if (ev.type === "repair") {
            setShout({ k: `s${step}`, side: ev.side, text: ev.sys === "hull"
                ? (ev.sealed ? (ev.left ? "Plugged one — she's still coming in!" : "Holes plugged! She's tight again!") : "Pumps aren't holding!")
                : ev.sys === "sails" ? "Fresh canvas aloft!" : ev.sys === "rudder" ? "Spare rudder shipped!" : "Gun's back on its carriage!" });
        }
        if (ev.hp) { setMyHp(ev.hp.me); setFoeHp(ev.hp.foe); }
        timers.push(setTimeout(() => { setShake(null); setStep((v) => v + 1); }, 760));
        return () => timers.forEach(clearTimeout);
    }, [phase, step, events, battle, me, foe, boxes, pointOn]);

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
    useEffect(() => { if (!hint) return undefined; const t = setTimeout(() => setHint(null), 2200); return () => clearTimeout(t); }, [hint]);

    const fire = useCallback(() => {
        if (!aim.length || busy) return;
        setPicking(null);
        setPreview(null);
        setBalls([]);
        onVolley?.(aim);
    }, [aim, busy, onVolley]);

    const sinkingSide = phase === "sinking" || phase === "result" ? battle?.sunk : null;
    const win = Boolean(battle?.win);
    const lowAny = clampPct(myHp, battle?.myMax) <= 25 || clampPct(foeHp, battle?.foeMax) <= 25;
    const zoneNow = preview ? zoneById(preview.zone) : null;
    const pickingAt = picking != null ? aim.find((a) => a.gun === picking) : null;

    return (
        <div className="sbt-scene" role="dialog" aria-modal="true">
            <div className="sbt-sky" aria-hidden="true" />
            <div className="sbt-sea" aria-hidden="true" />
            <div className="sbt-motes" aria-hidden="true">
                {MOTES.map((m, i) => <i key={i} style={{ left: `${m.x}%`, animationDelay: `${m.d}s`, animationDuration: `${m.t}s`, "--mz": m.z }} />)}
            </div>

            <div className="sbt-hud">
                <Bar f={me} hp={myHp} max={battle?.myMax} side="me" burning={battle?.burning?.me}
                    sys={battle?.sys?.me} caps={battle?.caps} />
                <div className="sbt-round">
                    {/* THE ROUND YOU ARE IN, not the one you just fought. `round` counts exchanges RESOLVED, so
                        showing it raw meant that after your first volley the header still said "Round 1" while
                        you were laying guns for the second. */}
                    <b>Round {(battle?.round || 0) + (phase === "play" ? 0 : 1)}</b>
                    <em>{battle?.gauge === "me" ? "you fire first" : "they fire first"}</em>
                </div>
                <Bar f={foe} hp={foeHp} max={battle?.foeMax} side="foe" burning={battle?.burning?.foe}
                    sys={battle?.sys?.foe} caps={battle?.caps} />
            </div>

            {/* CHROME, out of the way. Music, a way out, and the transcript — pinned to the top corner rather
                than taking a row of their own, because the whole screen below is now the board you play on. */}
            <div className={`sbt-chrome${logOpen ? " is-open" : ""}`}>
                <SceneMusic vibe="seabattle" place="inline" />
                {onClose ? (
                    <button type="button" className="sbt-leave" onClick={onClose}
                        title={battle?.over ? "Close" : "Leave — this fight will be waiting for you"}>
                        {battle?.over ? "Close" : "Leave"}
                    </button>
                ) : null}
                <button type="button" className={`sbt-logtoggle${logOpen ? " is-open" : ""}${log.length ? "" : " is-idle"}`}
                    disabled={!log.length} onClick={() => setLogOpen((o) => !o)}>
                    {logOpen ? "Hide log" : `Log${log.length ? ` · ${log.length}` : ""}`}
                </button>
                {logOpen ? (
                    <div className="sbt-log is-open" ref={logRef}>
                        {log.map((l) => (
                            <p key={l.k} className={`sbt-logline is-${l.side}${l.big ? " is-big" : ""}`}>{l.text}</p>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className={`sbt-shakewrap${shake ? (shake.big ? " is-quake" : " is-shake") : ""}`}>
                <div className={`sbt-stage${lowAny ? " is-desperate" : ""}`} ref={stageRef}>
                    <Ship f={me} side="me" hullRef={meHullRef}
                        hurt={hitFx?.side === "me"} heavy={Boolean(hitFx?.side === "me" && hitFx.heavy)}
                        low={clampPct(myHp, battle?.myMax) <= 25}
                        sinking={sinkingSide === "me"} burning={(battle?.burning?.me || 0) > 0}
                        leaks={battle?.leaks?.me || 0} hpFrac={(myHp || 0) / Math.max(1, battle?.myMax || 1)}
                        sys={battle?.sys?.me} caps={battle?.caps}
                        marks={marksFor("me")} incoming={incoming}
                        preview={preview?.side === "me" ? preview.zone : null}
                        firingGuns={firing.side === "me" ? firing.guns : []}
                        onAim={phase === "aim" && !battle?.over ? (e) => aimTap("me", e) : null} />
                    <Ship f={foe} side="foe" hullRef={foeHullRef}
                        hurt={hitFx?.side === "foe"} heavy={Boolean(hitFx?.side === "foe" && hitFx.heavy)}
                        low={clampPct(foeHp, battle?.foeMax) <= 25}
                        sinking={sinkingSide === "foe"} burning={(battle?.burning?.foe || 0) > 0}
                        leaks={battle?.leaks?.foe || 0} hpFrac={(foeHp || 0) / Math.max(1, battle?.foeMax || 1)}
                        sys={battle?.sys?.foe} caps={battle?.caps}
                        marks={marksFor("foe")}
                        preview={preview?.side === "foe" ? preview.zone : null}
                        firingGuns={firing.side === "foe" ? firing.guns : []}
                        onAim={phase === "aim" && !battle?.over ? (e) => aimTap("foe", e) : null} />

                    {/* THE SHOT ITSELF, from the muzzle that fired it to the timber it was aimed at. */}
                    {balls.map((b) => (
                        <span key={b.k} className={`sbt-ball2 is-${b.ammo}${b.hit ? "" : " is-miss"}${b.rake ? " is-rake" : ""}`}
                            style={{ "--fx": `${b.from.x}px`, "--fy": `${b.from.y}px`, "--tx": `${b.to.x}px`, "--ty": `${b.to.y}px` }}>
                            <i />
                        </span>
                    ))}
                    {balls.filter((b) => !b.hit).map((b) => (
                        <span key={`sp${b.k}`} className="sbt-splash2" style={{ left: `${b.to.x}px`, top: `${b.to.y}px` }}>
                            <i /><b />
                            {SPRAY.map((d, k) => <u key={k} style={{ "--dx": d[0], "--dy": d[1] }} />)}
                        </span>
                    ))}

                    {shout ? (
                        <span key={shout.k} className={`sbt-shout ${shout.side === "me" ? "on-foe" : "on-me"}`}>{shout.text}</span>
                    ) : null}
                    {phase === "play" ? pops.map((pp) => (
                        <span key={pp.k} className={`sbt-pop ${pp.side === "me" ? "on-foe" : "on-me"}${pp.rake ? " is-rake" : ""}`}
                            style={{ "--lane": `${pp.lane * 26}px` }}>
                            −{pp.dmg}{pp.rake ? <b>RAKE</b> : null}
                        </span>
                    )) : null}
                </div>
            </div>

            {/* ── THE ONLY CONTROL ON THE SCREEN ──────────────────────────────────────────────────────────────
                No row of order cards under the ships any more. What is here is what you cannot get from tapping
                a hull: which part you last touched and what it does, the rack, and the commit. */}
            {!battle?.over ? (
                <div className={`sbt-aimbar${phase === "aim" ? "" : " is-waiting"}`}>
                    {zoneNow ? (
                        <div className="sbt-zoneread" style={{ "--tint": zoneNow.tint }}>
                            <Icon name={zoneNow.icon} className="sbt-zoneicon" />
                            <div>
                                <b>{zoneNow.name}</b>
                                <em>{zoneNow.blurb}</em>
                            </div>
                        </div>
                    ) : (
                        <div className="sbt-zoneread is-idle">
                            <Icon name="GiTargeting" className="sbt-zoneicon" />
                            <div>
                                <b>Lay your guns</b>
                                <em>Tap the enemy where you want her hit — or your own ship to send a crew to mend her.</em>
                            </div>
                        </div>
                    )}

                    <div className="sbt-gunrail">
                        {myGuns.map((hp, i) => {
                            const a = aim.find((x) => x.gun === i);
                            return (
                                <button key={i} type="button"
                                    className={`sbt-gunpip${hp <= 0 ? " is-dead" : ""}${a ? ` is-laid is-${a.ammo}` : ""}${a?.at === "self" ? " is-repair" : ""}`}
                                    disabled={hp <= 0 || !a}
                                    title={hp <= 0 ? "Dismounted" : a ? `Gun ${i + 1} — ${zoneById(a.zone).name}` : `Gun ${i + 1} — not laid`}
                                    onClick={() => a && clearGun(i)}>
                                    <Icon name="GiCannon" />
                                </button>
                            );
                        })}
                    </div>

                    <button type="button" className={`sbt-fire${aim.length ? " is-ready" : ""}`}
                        disabled={!aim.length || busy || phase !== "aim"} onClick={fire}>
                        <b>FIRE</b>
                        <em>{aim.length}/{gunsUp.length} laid</em>
                    </button>
                </div>
            ) : null}

            {/* THE RACK, on the shot you just laid. Tap a round to load it into that gun — this is the second
                half of "aim, then load", and it never covers the ships because it sits with the bar. */}
            {pickingAt ? (
                <div className="sbt-rack">
                    <span className="sbt-rack-for">Gun {pickingAt.gun + 1} → {zoneById(pickingAt.zone).name}</span>
                    <div className="sbt-rack-row">
                        {rack.map((a) => {
                            const spent = aim.filter((x) => x.ammo === a.id && x.gun !== pickingAt.gun).length;
                            const left = a.basic ? null : Math.max(0, (a.count || 0) - spent);
                            const out = !a.basic && left <= 0;
                            return (
                                <button key={a.id} type="button"
                                    className={`sbt-shotpick is-${a.id}${pickingAt.ammo === a.id ? " is-on" : ""}${out ? " is-out" : ""}`}
                                    disabled={out} onClick={() => loadGun(pickingAt.gun, a.id)}>
                                    <Icon name={a.icon} />
                                    <b>{a.name.replace(/ Sh(o|e)t| Shell/, "")}</b>
                                    <em>{a.basic ? "∞" : left}</em>
                                </button>
                            );
                        })}
                    </div>
                    <button type="button" className="sbt-rack-done" onClick={() => setPicking(null)}>Done</button>
                </div>
            ) : null}

            {hint ? <div className="sbt-hint">{hint}</div> : null}

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
