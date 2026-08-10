"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as Gi from "react-icons/gi";
import SceneMusic from "@/components/SceneMusic";
import { ZONES, zoneById, zoneBox, zoneRects, zoneKeyFromArt } from "@/lib/marketplace/ship-zones.js";
import { hitChance, evasionOf, ammoById, expectedDamage } from "@/lib/marketplace/ship-battle.js";

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
// A gun going off. The shape of the crack follows the AMMUNITION, so a volley of chain sounds different from a
// volley of shells — which is the only way the rack choice is audible.
const AMMO_VOICE = {
    round: { top: 1500, low: 120, bottom: 38, gain: 0.22, dur: 0.34, wave: "sine" },
    chain: { top: 2400, low: 260, bottom: 110, gain: 0.17, dur: 0.3, wave: "triangle" },
    grape: { top: 3000, low: 180, bottom: 70, gain: 0.15, dur: 0.24, wave: "sawtooth" },
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
// Choosing a target. Tiny and dry — it fires on every tap and anything with a tail would grate.
function sfxPick() {
    const a = ac(); if (!a) return;
    try {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(720, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(980, a.currentTime + 0.06);
        g.gain.setValueAtTime(0.05, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.09);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.1);
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
// Timber giving way — canvas coming down, a gun going over the side. Wooden and final.
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
// THE RECKONING. Not another cannon — a low bell tolling under a rising swell, so the moment eight misses
// finally pay reads as an event and not as one more broadside. Built from the same oscillators as everything
// else here (no audio files anywhere in this scene).
function sfxReckoning() {
    const a = ac(); if (!a) return;
    try {
        const t = a.currentTime;
        // The toll: two struck bells a fifth apart, ringing long.
        for (const [f, d] of [[196, 0], [293.66, 0.06]]) {
            const o = a.createOscillator(), g = a.createGain();
            o.type = "triangle"; o.frequency.setValueAtTime(f, t + d);
            g.gain.setValueAtTime(0.0001, t + d);
            g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.5);
            o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + 1.6);
        }
        // The swell under it, rising rather than falling — this is a wind-up, not an impact.
        const o2 = a.createOscillator(), g2 = a.createGain();
        o2.type = "sawtooth";
        o2.frequency.setValueAtTime(48, t); o2.frequency.exponentialRampToValueAtTime(150, t + 0.75);
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.22, t + 0.5);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        o2.connect(g2); g2.connect(a.destination); o2.start(t); o2.stop(t + 1.05);
        // Spray off the top of it.
        noise(a, { dur: 0.9, type: "highpass", freq: 900, q: 0.7, gain: 0.16, sweepTo: 3200 });
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

// ── THE SHIP BATTLE ──────────────────────────────────────────────────────────────────────────────────────────
// You pick a PART of the ship in front of you and your whole broadside goes there. Three targets, marked on her
// hull with the odds of hitting each: her sails, her timber, or one particular cannon. Pick a round if you are
// carrying anything but solid shot, then fire.
//
// The design went through a per-GUN version first — one crew laid at a time, plus crews you could send below to
// pump and repair — and it was bookkeeping rather than aiming. Your cannons are on YOUR ship; the decision is
// where they point.
//
// What is on screen and why:
//   • both ships, with their captain and pet on deck — you are fighting a person, not a stat block
//   • a MARKER on every part you can hit, carrying its own hit chance, so the trade needs no manual
//   • one line under it saying what that part DOES when you break it
//   • the whole volley flying to the exact place you sent it, splashing short when it misses
//   • damage you can see on the hull: shredded canvas, a cannon lying dismounted
//
// Styling lives in globals.css — this file has several components, and a scoped <style jsx> block only reaches
// the one that owns it.

const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCannon;
    return <C className={className} aria-hidden="true" />;
};
const clampPct = (v, max) => Math.max(0, Math.min(100, Math.round((v / Math.max(1, max)) * 100)));

// THE PART, AS AN OBJECT. Each thing you can shoot at is labelled with a painted sprite rather than a glyph —
// a sail, a plank, a cannon. Two were already on disk; the canvas was drawn for this.
const PART_ART = {
    sails: "/images/sailing/part-sails.png",
    hull: "/images/sailing/tracks/hull.png",
    guns: "/images/sailing/deck-cannon.png",
};
const shipKey = (f) => zoneKeyFromArt(f?.art, f?.level);

// How wide one cannon can be drawn without touching its neighbour. Measured off the real gap between the two
// closest ports rather than assumed from the count, so a hand-placed battery with uneven spacing still fits.
function gunWidthPct(ports) {
    if (ports.length < 2) return 30;
    let gap = Infinity;
    for (let i = 1; i < ports.length; i += 1) gap = Math.min(gap, Math.abs(ports[i].x - ports[i - 1].x));
    return Math.max(6, Math.min(16, gap * 100 * 0.92));
}

// ── WHAT EACH PART HAS LEFT ──────────────────────────────────────────────────────────────────────────────────
// This has now been a bar, then a pill, then a row of sprites, and the sprites were the wrong answer for a
// reason worth writing down: a sail drawn at fourteen pixels is a cream rectangle. Six cream rectangles in a
// row is not "four sheets of canvas left", it is a row of blank cards — the sprite carried no meaning at that
// size, and two courses of little brown boards just rebuilt the bar the sprites were supposed to replace.
//
// A COUNT AND THE NAME OF THE PART. "4 HULL" needs no legend, survives any size, and the colour does the work
// the art was failing to do: green while it is whole, amber once it is bitten into, red when it is gone. It is
// one vocabulary for "how much of this part is there", whoever it belongs to.
const conditionTone = (left, max) => {
    if (left <= 0) return "is-dead";
    return left >= max ? "is-full" : "is-hurt";
};

function PartChip({ zone, left, max, label = null }) {
    const cap = Math.max(1, Math.round(max || 1));
    const n = Math.max(0, Math.min(cap, Math.round(left ?? cap)));
    return (
        <span className={`sbt-cond is-${zone} ${conditionTone(n, cap)}`} title={`${n} of ${cap} left`}>
            {/* A GUN MARKER COUNTS HITS, NOT GUNS. Every other chip reads "<how many of this part is left>"
                — 10 HULL, 6 SAILS, 2 CANNON — so "4 GUN" on a single cannon read as four cannons when it
                meant this one cannon can take four more balls. The label has to say what is being counted. */}
            <b>{n}</b><em>{label || (zone === "sails" ? "sails" : zone === "guns" ? (n === 1 ? "hit" : "hits") : "hull")}</em>
        </span>
    );
}

// ── ONE SHIP ─────────────────────────────────────────────────────────────────────────────────────────────────
function Ship({ f, side, hurt, heavy, low, sinking, hp = null, hpMax = null, sys, caps, targets = null,
                onPick = null, onUnpick = null, firing = false, hullRef = null }) {
    const ports = f?.ports || [];
    const key = shipKey(f);
    const mirror = Boolean(f?.mirror);
    const gunHp = sys?.guns || [];

    // Torn canvas, clipped to the real shape of the sails. The sprite cannot be repainted, but it can be
    // DARKENED exactly where the damage is — which is why the measured cells earn their keep twice.
    const sailFrac = caps?.sails ? Math.max(0, Math.min(1, (sys?.sails ?? caps.sails) / caps.sails)) : 1;
    const torn = useMemo(
        () => (key && sailFrac < 1 ? zoneRects(key, "sails", { mirror }) : []),
        [key, mirror, sailFrac],
    );

    return (
        <div className={`sbt-ship sbt-ship-${side}${hurt ? " is-hurt" : ""}${low ? " is-low" : ""}${sinking ? " is-sinking" : ""}${firing ? " is-firing" : ""}`}
            style={{ "--deck": `${f?.deck ?? 30}%` }}>
            <div className="sbt-hull" ref={hullRef}>
                {f?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.art} alt="" className={`sbt-boat${mirror ? " is-mirror" : ""}`} draggable="false" />
                ) : <span className="sbt-boat-fallback" aria-hidden="true" />}

                {torn.length ? (
                    <span className="sbt-dmg is-sails" aria-hidden="true" style={{ "--torn": 1 - sailFrac }}>
                        {torn.map((r, i) => (
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

                {/* THE GUNS. A dismounted one stays on the deck, dark and canted over — "that gun is gone" has to
                    be visible on the ship, or shooting at a gun deck is a stat nobody can see working. */}
                {ports.length ? (
                    <span className="sbt-guns" aria-hidden="true" style={{ "--gw": `${gunWidthPct(ports)}%` }}>
                        {ports.map((g, i) => {
                            const dead = gunHp.length ? (gunHp[i] ?? 0) <= 0 : false;
                            const hurtGun = gunHp.length ? (gunHp[i] ?? 0) === 1 : false;
                            return (
                                <span key={i} className={`sbt-gun${firing ? " is-firing" : ""}${dead ? " is-dead" : ""}${hurtGun ? " is-damaged" : ""}`}
                                    style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%`, animationDelay: `${i * 80}ms` }}>
                                    <i className="sbt-gun-barrel" />
                                    {firing ? <i className="sbt-gun-flash" style={{ animationDelay: `${i * 80}ms` }} /> : null}
                                    {firing ? <i className="sbt-gun-smoke" style={{ animationDelay: `${i * 80}ms` }} /> : null}
                                </span>
                            );
                        })}
                    </span>
                ) : null}

            </div>

            {/* ── THE TARGETS ──────────────────────────────────────────────────────────────────────────
                One marker per part, each carrying its own odds. Clean shapes around the part rather than
                the measured cells themselves: a player is choosing between three things, not painting a
                mask, and a jagged stencil over a painting looked like a bug.

                OUTSIDE the hull, deliberately. Inside it they inherited the swell — the whole ship bobs and
                rolls a degree either way — so every target was a moving one, which is merely annoying for a
                sail and genuinely difficult for a single cannon. The markers hold still; the ship does not. */}
            {/* WHERE HER GUNS ARE POINTED, on your ship, before you commit. You used to send your whole
                broadside blind and find out afterwards — she was a dice roll rather than an opponent.
                Marks are placed on the part with the count of barrels bearing on it, because "three on
                your canvas" is the decision; which of her guns it is does not matter. */}
            {/* WHAT EACH PART HAS LEFT, ON THE PART. Outside .sbt-hull on purpose, for the same reason the
                target markers are: inside it they inherit the swell, and a count you have to read off a
                thing rocking a degree either way is a count you squint at. */}
            {hpMax ? (
                <span className="sbt-parthits" aria-hidden="true">
                    {(() => {
                        const hb = zoneBox(key, "hull", { mirror });
                        if (!hb) return null;
                        // ONE PLACARD PER SHIP, AT THE WATERLINE. Canvas first, then timber. It rides on the
                        // hull rather than over the mastheads because the "last exchange" recap owns the top
                        // of the stage for the whole aim phase — anything up there is behind a panel exactly
                        // when you are choosing a target.
                        return (
                            <span className="sbt-placard"
                                /* Clamped so a hull whose centre sits near the edge of its own box cannot
                                   push the row off the side of the stage. */
                                style={{ left: `${Math.min(76, Math.max(24, hb.cx))}%`, top: `${hb.y + hb.h}%` }}>
                                {caps?.sails ? (
                                    <PartChip zone="sails" left={sys?.sails ?? caps.sails} max={caps.sails} />
                                ) : null}
                                <PartChip zone="hull" left={hp} max={hpMax} />
                                {/* HOW MANY BARRELS SHE STILL HAS. A dismounted gun is the most consequential
                                    damage in the fight — it is a shot she never fires again — and it was the
                                    one part with no number anywhere, readable only by noticing a cannon on
                                    the deck had gone dark. */}
                                {gunHp.length ? (
                                    <PartChip zone="guns" left={gunHp.filter((h) => h > 0).length}
                                        max={gunHp.length} label="cannon" />
                                ) : null}
                            </span>
                        );
                    })()}
                </span>
            ) : null}
            {targets ? (
                <span className="sbt-targets">
                    {targets.map((t) => (
                        <div key={t.key} role="button" tabIndex={t.dead ? -1 : 0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(t); } }}
                            /* A gun out at the bow or the stern hangs its plaque off the side of the stage —
                               "4 HITS" arrived as "4 HI". Guns in the outer fifth open their plaque inward. */
                            className={`sbt-target is-${t.zone}${t.laid ? " is-on" : ""}${t.kind === "gun" ? " is-gun" : ""}${t.dead ? " is-dead" : ""}${t.kind === "gun" && t.hpPct < 100 ? " is-hurt" : ""}${t.kind === "gun" && t.x >= 78 ? " is-edge-r" : ""}${t.kind === "gun" && t.x <= 22 ? " is-edge-l" : ""}`}
                            style={t.box
                                ? { left: `${t.box.x}%`, top: `${t.box.y}%`, width: `${t.box.w}%`, height: `${t.box.h}%`, "--tint": t.tint }
                                : { left: `${t.x}%`, top: `${t.y}%`, "--tint": t.tint }}
                            aria-disabled={t.dead || undefined}
                            onClick={(e) => { e.stopPropagation(); if (!t.dead) onPick?.(t); }}
                            title={`${t.name} — ${Math.round(t.chance * 100)}% to hit`}>
                            {/* THE AREA IS THE TARGET. The outline was doing the work and the icon on top of it
                                was just repeating what the shape already said — and six cannon icons in a row
                                on a gun deck bled into one another until you could not tell which barrel you
                                were aiming at. What is left is the region, what it has left, and the number
                                that matters. */}
                            <span className="sbt-target-skin" aria-hidden="true" />
                            {/* AN EMPTY PLAQUE IS AN EMPTY BAR. A zone marker's plaque holds one thing — the
                                count of barrels you have laid on it — so before you lay any it rendered as a
                                filled rounded pill with nothing inside, parked across her rigging and her
                                hull. That is what read as two unfilled health bars. It exists when it has
                                something to say. */}
                            {t.kind === "gun" || t.laid ? (
                            <span className="sbt-plaque">
                                <span className="sbt-plaque-body">
                                    {/* WHAT IT HAS LEFT. Every piece has hit points and none of them were on
                                        screen — you were aiming at a part with no idea whether one more ball
                                        would take it off her. On a cannon this IS the label: a bar and a
                                        percentage, small enough that six of them read as six. */}
                                    {/* A gun's condition, in the iron holding it to the deck — four plates,
                                        one a hit. The sails and the hull carry their own strips on the ship
                                        itself, so a zone marker adds nothing but the count of barrels you
                                        have committed to it. */}
                                    {t.kind === "gun" ? (
                                        <PartChip zone="guns" left={t.hp} max={t.hpMax} />
                                    ) : null}
                                    {t.laid ? <b>×{t.laid}</b> : null}
                                </span>
                                {/* THE UNDO, ON THE THING YOU AIMED. Tapping the part adds a barrel, so it
                                    cannot also remove one — and the rail alone was never guessed. */}
                                {t.laid ? (
                                    <button type="button" className="sbt-plaque-minus" aria-label={`Take a gun off ${t.name}`}
                                        onClick={(e) => { e.stopPropagation(); onUnpick?.(t); }}>−</button>
                                ) : null}
                            </span>
                            ) : null}
                        </div>
                    ))}
                </span>
            ) : null}
            {sinking ? <span className="sbt-foam" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span> : null}
        </div>
    );
}

// ── THE PANELS ───────────────────────────────────────────────────────────────────────────────────────────────
// Hull, canvas and guns per ship. The two systems are pips rather than numbers: the question they answer is
// "has she anything left to shoot off", which is a shape.
function Bar({ f, hp, max, side, sys, caps }) {
    const pct = clampPct(hp, max);
    // Read off the SAME function the engine rolls against, so the panel cannot promise a dodge the fight does
    // not honour.
    const dodgePct = Math.round(evasionOf(sys?.sails ?? caps?.sails ?? 0) * 100);
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
            {/* NO CONDITION UP HERE — IT LIVES ON THE SHIP. This card used to carry the whole ship's state a
                second time: a hull bar reading "294 / 341", six canvas pips and a "2/2" gun count, all of it
                describing parts that are drawn, in full, twenty pixels below. Two places to look for one
                fact, and the abstract one on top. What a card is FOR is the things that have no picture — who
                she is, and the two percentages that quietly decide every exchange. Damage is read off the
                timber. */}
            <div className="sbt-sys">
                {/* DODGE — THE REASON TO SHOOT CANVAS. Sails do the least damage in the game by a wide margin,
                    and the payoff for taking them is that this number falls and every shot after it lands more
                    often. That payoff was completely invisible: you spent your worst damage on faith. Now it
                    is a number on her card that drops as her canvas goes, which is the argument for aiming
                    there, made without making it.

                    DRAWN, AND NAMED. These were two react-icons glyphs and two bare percentages — line art in
                    a game built entirely out of painted sprites, and nothing anywhere saying which percentage
                    was which. The sprites come from the badge-power family so they match the rest of the app,
                    and each carries the one word that says what it is. */}
                <span className={`sbt-syschip is-dodge${dodgePct <= 5 ? " is-out" : ""}`} title="How often a ball misses her — canvas keeps her dodging">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/bonus/tailwind.png" alt="" className="sbt-sysart" draggable="false" />
                    <span className="sbt-syslabel">Dodge</span>
                    <em>{dodgePct}%</em>
                </span>
                {/* ARMOUR IS GONE. It was a percentage on a card that quietly turned aside balls you had
                    already earned — a hit that did nothing. A ball that lands is a plank now, so there is
                    nothing here to show. */}
            </div>
        </div>
    );
}

// A line of the log for one event.
function logLine(ev, me, foe) {
    const nameOf = (who) => (who === "me" ? (me?.name || "You") : (foe?.name || "They"));
    if (ev.type === "wreck") {
        const what = ev.sys === "sails" ? "canvas is in rags" : "cannon is dismounted";
        return { side: ev.victim === "me" ? "foe" : "me", big: true, text: `${nameOf(ev.victim)}'s ${what}` };
    }
    if (ev.type !== "volley") return null;
    const shots = ev.shots || [];
    const hits = shots.filter((s) => s.hit).length;
    // A split broadside has no single "where", so the line lists what it was aimed at.
    const tally = {};
    for (const sh of shots) tally[sh.zone] = (tally[sh.zone] || 0) + 1;
    const where = Object.entries(tally).map(([z, n]) => `${n}×${zoneById(z).name.toLowerCase()}`).join(", ");
    return {
        side: ev.side,
        text: `${nameOf(ev.side)} fire ${shots.length} gun${shots.length === 1 ? "" : "s"} — ${where} — ${hits} on target for ${ev.dmg}`,
        big: shots.some((s) => s.rake),
    };
}

export default function ShipBattleScene({ battle, busy, onVolley, onReckoning, onClose }) {
    const me = battle?.me || {};
    const foe = battle?.foe || {};
    const events = useMemo(() => battle?.events || [], [battle?.events]);

    // WHAT SHE IS ABOUT TO DO. Her orders are rolled when the round opens and sent with the battle, so this
    // is the volley that will actually land — not a prediction. Grouped by part, because "three barrels on
    // your canvas" is the decision; which specific gun is hers is not.
     // HER INTENT IS NO LONGER SHOWN. Her orders are still rolled when the round OPENS rather than when it
    // resolves — that part matters and stays, because it means the volley you are aiming into is already
    // decided and cannot be re-rolled against you after you commit. What is gone is DRAWING it on your ship.
    //
    // Three or four red marks sat on the parts they were aimed at, and the one on the hull read "2 HULL"
    // directly above a condition chip reading "7 HULL" — the same words in the same order meaning opposite
    // things, one a stock and one a threat. It also told you the answer before you had made the decision.
    // Knowing exactly what she will do every round is not the interesting version of this fight.

    // WHAT JUST HAPPENED, held still so you can read it.
    //
    // The fight resolves in about a second and a half and then asks you to make your next decision. Every
    // piece of feedback up to now lived inside that second — a number over the hull, a splash, a shout — so
    // if you blinked, or looked at your own ship while hers was being hit, the exchange was simply gone. The
    // log had it, as one summarised line, behind a button nobody opens mid-fight.
    //
    // This is the same information as a standing scoreboard: what you sent, what landed, what it cost, and
    // the same for what came back. It sits in the empty water above the ships during the aim phase, which is
    // exactly when you are deciding and exactly when that water was doing nothing.
    const exchange = useMemo(() => {
        if (!events.length) return null;
        const side = (who) => {
            const vol = events.filter((e) => e.type === "volley" && e.side === who);
            if (!vol.length) return null;
            const shots = vol.flatMap((v) => v.shots || []);
            if (!shots.length) return null;
            const hits = shots.filter((sh) => sh.hit);
            const wrecks = events.filter((e) => e.type === "wreck" && e.victim === (who === "me" ? "foe" : "me"));
            // What the misses were WORTH taking — the average odds of the shots that did not land. A volley
            // of 80% shots that all missed is luck; a volley of 30% shots that missed is a lesson.
            const missed = shots.filter((sh) => !sh.hit && sh.chance != null);
            const avgMiss = missed.length ? Math.round((missed.reduce((n, sh) => n + sh.chance, 0) / missed.length) * 100) : null;
            const byZone = {};
            for (const sh of hits) byZone[sh.zone] = (byZone[sh.zone] || 0) + (sh.dmg || 0);
            return {
                guns: shots.length,
                hits: hits.length,
                dmg: vol.reduce((n, v) => n + (v.dmg || 0), 0),
                rakes: hits.filter((sh) => sh.rake).length,
                avgMiss,
                byZone,
                wrecks: wrecks.map((w) => (w.sys === "sails" ? "canvas shredded" : "gun dismounted")),
            };
        };
        const mine = side("me");
        const theirs = side("foe");
        return mine || theirs ? { mine, theirs } : null;
    }, [events]);

    const [phase, setPhase] = useState(battle?.round ? "aim" : "intro"); // intro → aim → play → sinking → result
    const [step, setStep] = useState(-1);
    const [myHp, setMyHp] = useState(battle?.myHp ?? battle?.myMax ?? 100);
    const [foeHp, setFoeHp] = useState(battle?.foeHp ?? battle?.foeMax ?? 100);
    const [shake, setShake] = useState(null);
    const [log, setLog] = useState([]);
    const [ready, setReady] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    // THE RECAP SHOWS ITSELF, THEN LEAVES. It was a permanent card taking a third of the stage for the whole
    // aim phase — sitting over both ships while you were trying to choose a target on one of them. It is the
    // answer to "what just happened", which is a question you have for about three seconds. It plays, it
    // goes, and the chrome keeps a Recap button so it is never lost.
    const [recapOpen, setRecapOpen] = useState(false);
    // The gold flash + shout when the Reckoning is spent.
    const [reckCry, setReckCry] = useState(null);
    const [pops, setPops] = useState([]);
    // Where each ball came down, keyed by shot. A ref, not state: it is written while the volley is playing
    // and read 460ms later by the same sequence — putting it in state would re-render the scene mid-flight
    // for a value nothing is allowed to draw yet.
    const landings = useRef({});
    const [shout, setShout] = useState(null);
    const [balls, setBalls] = useState([]);
    const [hitFx, setHitFx] = useState(null);
    const [firingSide, setFiringSide] = useState(null);
    const logRef = useRef(null);

    // ── AIM ──────────────────────────────────────────────────────────────────────────────────────────────────
    // One target for the whole broadside, and one round loaded behind it.
    // ONE ORDER PER GUN, in the order you gave them. Guns you do not lay follow the FIRST target you picked
    // (the server does the same), so pointing the whole broadside somewhere is still a single tap and splitting
    // it is opt-in — one extra tap per gun you want doing something else.
    const [aim, setAim] = useState([]);             // [{ gun, zone, target, ammo }]
    // The round the CURRENTLY PICKED target would draw from a bare barrel. Only used to preview odds and
    // damage before you lay a gun; the server decides per barrel when the volley resolves.
    const ammo = "round";

    const stageRef = useRef(null);
    const meHullRef = useRef(null);
    const foeHullRef = useRef(null);
    const [boxes, setBoxes] = useState(null);
    // Pulled out as primitives: the animation effect below keys off these, not off the `battle` object, whose
    // identity changes on every render of the parent.
    const battleRound = battle?.round;
    const battleOver = Boolean(battle?.over);
    const battleSunk = battle?.sunk || null;

    const foeSys = battle?.sys?.foe;
    const caps = battle?.caps;
    // The picker only exists if there is something to pick. A row of four rounds where three say "0" is a shop
    // window in the middle of a fight.

    // ── WHAT YOU CAN SHOOT AT ────────────────────────────────────────────────────────────────────────────────
    // Sails, hull, and one marker per cannon still mounted, each with the REAL chance of hitting it — computed
    // with the same functions the server rolls against, so the number on the marker is the number in the dice.
    const targets = useMemo(() => {
        const key = shipKey(foe);
        if (!key || !battle) return [];
        const mirror = Boolean(foe?.mirror);
        const evasion = evasionOf(foeSys?.sails ?? caps?.sails ?? 4);
        const att = { accuracy: battle.myAccuracy ?? 0.7, dmgMult: battle.stats?.me?.dmgMult ?? 1 };
        const def = battle.stats?.foe || { dmgTaken: 1 };
        const shot = ammoById(ammo);
        const out = [];
        // THE RIGGING IS NOT THE SAILS. zoneBox returns the extent of every lit pixel in the zone, and a topmast
        // pennant or a bowsprit line stretches that far past the ship — so the canvas region came out as a
        // rectangle wider than the hull and, once the ships were scaled up, ran clean off the side of the
        // screen. Clamped to the timber underneath it, which is the shape a player reads as "her sails".
        const hullBox = zoneBox(key, "hull", { mirror });
        for (const id of ["sails", "hull"]) {
            let box = zoneBox(key, id, { mirror });
            if (!box) continue;
            if (id === "sails" && hullBox) {
                const x = Math.max(box.x, hullBox.x), right = Math.min(box.x + box.w, hullBox.x + hullBox.w);
                if (right > x) box = { ...box, x, w: right - x, cx: x + (right - x) / 2 };
            }
            // Canvas in rags STAYS on the board, greyed and crossed — the ship should not quietly lose a part
            // between rounds. It just cannot be aimed at any more.
            const dead = id === "sails" && (foeSys?.sails ?? 1) <= 0;
            const hpPct = id === "sails"
                ? clampPct(foeSys?.sails ?? 0, caps?.sails || 6)
                : clampPct(battle.foeHp ?? 0, battle.foeMax || 1);
            out.push({
                key: id, kind: "zone", zone: id, target: null, dead,
                name: ZONES[id].name, icon: ZONES[id].icon, tint: ZONES[id].tint, effect: ZONES[id].effect,
                x: box.cx, y: box.cy, box, hpPct,
                chance: hitChance(att, ZONES[id], shot, evasion),
                dmg: expectedDamage(att, def, ZONES[id], shot),
            });
        }
        const ports = foe?.ports || [];
        ports.forEach((p, i) => {
            const hp = foeSys?.guns?.[i] ?? caps?.gun ?? 4;
            // A DISMOUNTED GUN STAYS ON THE BOARD, crossed out. Removing it made the deck quietly change shape
            // between rounds; leaving it there is how you see what you have already done to her.
            out.push({
                key: `gun${i}`, kind: "gun", zone: "guns", target: i, dead: hp <= 0,
                name: `${ZONES.guns.name} ${i + 1}`, icon: ZONES.guns.icon, tint: ZONES.guns.tint, effect: ZONES.guns.effect,
                x: p.x * 100, y: p.y * 100, box: null,
                hpPct: clampPct(hp, caps?.gun || 4), hp, hpMax: caps?.gun || 4,
                chance: hitChance(att, ZONES.guns, shot, evasion),
                dmg: expectedDamage(att, def, ZONES.guns, shot),
            });
        });
        return out;
    }, [foe, battle, foeSys, caps, ammo]);

    const myGuns = battle?.sys?.me?.guns || [];
    const liveGuns = useMemo(() => myGuns.map((hp, i) => (hp > 0 ? i : -1)).filter((i) => i >= 0), [myGuns]);
    const nextGun = useMemo(() => liveGuns.find((g) => !aim.some((a) => a.gun === g)), [liveGuns, aim]);
    // The last order you gave is what the read-out talks about.
    const picked = useMemo(() => {
        const last = aim[aim.length - 1];
        return last ? targets.find((t) => t.zone === last.zone && (t.target ?? null) === (last.target ?? null)) || null : null;
    }, [aim, targets]);

    /** How many guns are on this marker. Every one of them was put there by hand — nothing follows anything. */
    const gunsAt = useCallback((zone, target) => (
        aim.filter((a) => a.zone === zone && (a.target ?? null) === (target ?? null)).length
    ), [aim]);
    const allLaid = liveGuns.length > 0 && aim.length >= liveGuns.length;
    // A VOLLEY COSTS NOTHING NOW. It used to bill you per exotic round; ammunition is unlocked on the barrel
    // rather than bought by the shot, so there is no bill to show.
    const leftToLay = Math.max(0, liveGuns.length - aim.length);

    // Keep the orders honest when the board changes under them — a cannon you laid a gun on can be wreckage by
    // the time you look again, and an order against something that no longer exists must not survive.
    useEffect(() => {
        setAim((list) => {
            const ok = list.filter((a) => targets.some((t) => t.zone === a.zone && (t.target ?? null) === (a.target ?? null)));
            return ok.length === list.length ? list : ok;
        });
    }, [targets]);

    // Every marker, plus the number of guns that will fire at it — followers included. Computed here rather
    // than in Ship so the ring, the chip and the read-out all agree on one count.
    const markers = useMemo(() => targets.map((t) => ({ ...t, laid: gunsAt(t.zone, t.target) })), [targets, gunsAt]);

    // Where each hull sits on the stage, in pixels — needed to fly a ball from a muzzle to a cannon.
    // ALSO KEPT IN A REF. `setBoxes` mints a new object every time it runs, and the volley animation used to
    // list `boxes` as a dependency — so a re-measure DURING an exchange tore the effect down, cleared its
    // pending timers and scheduled the whole step again from the top. The shots you had just watched fired a
    // second time. The remeasure is on a 400ms timer after every round (the boat art loads after first paint)
    // and on every window resize, which on a phone includes the URL bar sliding away, so this fired
    // constantly. Reading geometry off a ref keeps it out of the dependency list — and reading it inside each
    // shot's own timeout means a ball uses the freshest measurement rather than one captured up front.
    const boxesRef = useRef(null);
    const measure = useCallback(() => {
        const stage = stageRef.current, a = meHullRef.current, b = foeHullRef.current;
        if (!stage || !a || !b) return;
        const s = stage.getBoundingClientRect();
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
        const next = { me: box(a), foe: box(b), w: s.width, h: s.height };
        boxesRef.current = next;
        setBoxes(next);
    }, []);
    useLayoutEffect(() => {
        measure();
        if (typeof window === "undefined") return undefined;
        window.addEventListener("resize", measure);
        const t = setTimeout(measure, 400);   // the boat art loads after first paint
        return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
    }, [measure, battle?.round]);

    // A point on a ship in stage pixels: the middle of a zone, or one particular gun port.
    const pointOn = useCallback((sideKey, zone, target) => {
        const box = (boxesRef.current || boxes)?.[sideKey];
        const f = sideKey === "me" ? me : foe;
        if (!box) return null;
        if (zone === "guns") {
            const p = (f?.ports || [])[target] ?? (f?.ports || [])[0];
            if (p) return { x: box.x + p.x * box.w, y: box.y + p.y * box.h };
        }
        const b = zoneBox(shipKey(f), zone, { mirror: Boolean(f?.mirror) });
        if (!b) return { x: box.x + box.w / 2, y: box.y + box.h * 0.6 };
        return { x: box.x + (b.cx / 100) * box.w, y: box.y + (b.cy / 100) * box.h };
    }, [me, foe]);

    // TAP ADDS A BARREL. Concentrating the broadside is the whole point of splitting it — four guns into one
    // hull is a decision, and for a while tapping twice removed the first instead of adding a second, which
    // made stacking impossible. Tap adds; the small − on the count takes one back.
    const pick = useCallback((t) => {
        if (phase !== "aim" || busy || battle?.over || t.dead) return;
        if (nextGun == null) return;   // every gun is already laid
        setAim((list) => [...list, { gun: nextGun, zone: t.zone, target: t.target, ammo }]);
        sfxPick();
    }, [phase, busy, battle?.over, nextGun, ammo]);

    /** Take ONE barrel back off a part — the last one laid there, so a stack unwinds a gun at a time. */
    const unpick = useCallback((t) => {
        setAim((list) => {
            const onIt = list.filter((a) => a.zone === t.zone && (a.target ?? null) === (t.target ?? null));
            if (!onIt.length) return list;
            const lastGun = onIt[onIt.length - 1].gun;
            return list.filter((a) => a.gun !== lastGun);
        });
        sfxPick();
    }, []);

    /** Take a gun back off its target. The gun rail is the undo. */
    const clearGun = useCallback((gun) => {
        setAim((list) => list.filter((a) => a.gun !== gun));
        sfxPick();
    }, []);

    // Open the log with the ship you are up against, so round one is not a blank panel over an empty sea.
    useEffect(() => {
        if (!foe?.name) return;
        setLog((l) => (l.length ? l : [{
            k: "open", side: "foe", big: true,
            text: `${foe.name}${foe.cls ? ` — ${foe.cls}` : ""} · ${foe.guns} guns.`,
        }, ...(foe.flavor ? [{ k: "flavor", side: "foe", text: foe.flavor }] : [])]));
    }, [foe?.name, foe?.cls, foe?.guns, foe?.flavor]);

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
    // Every ball flies from the gun that fired it to the part of the ship it was sent to, and lands when it
    // arrives. The stagger is per gun, so a seven-gun broadside arrives as seven events you can count.
    useEffect(() => {
        if (phase !== "play" || step < 0) return undefined;
        if (step >= events.length) {
            if (battleOver) { setPhase(battleSunk ? "sinking" : "result"); return undefined; }
            const t = setTimeout(() => { setPhase("aim"); setAim([]); setBalls([]); setPops([]); }, 300);
            return () => clearTimeout(t);
        }
        const ev = events[step];
        const line = logLine(ev, me, foe);
        // KEYED, not appended — an effect that runs twice (StrictMode in development, any re-render of the same
        // exchange) was adding the same line a second time under the same key.
        if (line) {
            const lk = `${battleRound}-${step}`;
            setLog((l) => [...l.slice(-40).filter((x) => x.k !== lk), { ...line, k: lk }]);
        }
        const timers = [];

        if (ev.type === "volley") {
            const shots = ev.shots || [];
            // The occasion. One beat of gold over the whole scene and her name called, then the volley plays
            // through the ordinary machinery.
            if (ev.reckoning) {
                sfxReckoning();
                setReckCry({ k: `rk${step}`, text: battle?.reck?.name || "Reckoning" });
                timers.push(setTimeout(() => setReckCry(null), 1600));
            }
            const from = ev.side, to = from === "me" ? "foe" : "me";
            const fromBox = boxesRef.current?.[from];
            setFiringSide(from);
            setPops([]);
            setShout(null);

            shots.forEach((s, i) => {
                const at = i * 100;
                timers.push(setTimeout(() => {
                    sfxGun(s.ammo);
                    const ports = (from === "me" ? me : foe)?.ports || [];
                    const p = ports[s.gun];
                    const live = boxesRef.current?.[from] || fromBox;
                    const muzzle = live && p
                        ? { x: live.x + p.x * live.w, y: live.y + p.y * live.h }
                        : live ? { x: live.x + live.w / 2, y: live.y + live.h * 0.55 } : null;
                    const land = pointOn(to, s.zone, s.target);
                    if (muzzle && land) {
                        const end = s.hit ? land : { x: muzzle.x + (land.x - muzzle.x) * 0.72, y: Math.max(land.y, (boxesRef.current?.h || 400) * 0.78) };
                        const key = `${battleRound}-${step}-${i}`;
                        setBalls((b) => [...b.slice(-14).filter((x) => x.k !== key), {
                            k: key, from: muzzle, to: end, hit: s.hit, ammo: s.ammo, rake: s.rake,
                        }]);
                        // Where the ball ENDED — the outcome gets drawn there rather than in a corner, so the
                        // number and the hole are the same event. Kept on the ball so both stay in step.
                        landings.current[key] = end;
                    }
                }, at));
                timers.push(setTimeout(() => {
                    const pk = `${battleRound}-${step}-${i}`;
                    const at2 = landings.current[pk] || null;
                    if (s.hit) {
                        setHitFx({ side: to, heavy: Boolean(s.rake) });
                        sfxHit(Boolean(s.rake));
                        setShake({ k: `${step}-${i}`, big: Boolean(s.rake) });
                        setPops((list) => [...list.slice(-11).filter((x) => x.k !== pk), {
                            k: pk, side: ev.side, dmg: s.dmg, rake: s.rake, lane: (i % 4) - 1.5, at: at2, zone: s.zone,
                            // What the ball actually DID, for a shot that does no hull damage by design.
                            wrecked: s.wrecked || null,
                        }]);
                    } else {
                        sfxSplash();
                        // A MISS USED TO BE SILENT — a splash sound and a ball that fell short, with nothing
                        // to read. Now it says so, and says what the shot's odds WERE, because that is the
                        // difference between "unlucky" and "you should not have taken that shot". It is the
                        // one number that teaches you to aim.
                        setPops((list) => [...list.slice(-11).filter((x) => x.k !== pk), {
                            k: pk, side: ev.side, miss: true, chance: s.chance, lane: (i % 4) - 1.5, at: at2, zone: s.zone,
                        }]);
                    }
                }, at + 460));
            });
            const done = shots.length * 100 + 620;
            timers.push(setTimeout(() => { setMyHp(ev.hp.me); setFoeHp(ev.hp.foe); setFiringSide(null); setHitFx(null); setShake(null); }, done));
            timers.push(setTimeout(() => setStep((v) => v + 1), done + 180));
            return () => timers.forEach(clearTimeout);
        }

        if (ev.type === "wreck") {
            sfxWreck();
            setShout({ k: `s${step}`, side: ev.victim === "me" ? "foe" : "me",
                text: ev.sys === "sails" ? "Her canvas is gone!" : "That gun's dismounted!" });
        }
        if (ev.hp) { setMyHp(ev.hp.me); setFoeHp(ev.hp.foe); }
        timers.push(setTimeout(() => { setShake(null); setStep((v) => v + 1); }, 760));
        return () => timers.forEach(clearTimeout);
        // DEPENDENCIES ARE THE STEP, NOT THE SCENE. `battle` and `boxes` are fresh objects on every render and
        // every remeasure; listing them made this effect re-run — and therefore re-fire — in the middle of an
        // exchange. Only the things that genuinely identify WHICH step is playing belong here.
    }, [phase, step, events, battleRound, battleOver, battleSunk, me, foe, pointOn]);

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

    const fire = useCallback(() => {
        if (!allLaid || busy) return;
        setBalls([]);
        onVolley?.(aim);
    }, [aim, allLaid, busy, onVolley]);

    // ── THE RECKONING ────────────────────────────────────────────────────────────────────────────────────
    // Every ball of yours that goes wide winds this up. Full, it stops being a meter and becomes the button.
    const reck = battle?.reck || null;
    const reckN = Math.max(0, Math.min(reck?.at || 8, reck?.n || 0));
    const reckAt = reck?.at || 8;
    const reckReady = reckN >= reckAt;
    const reckFire = useCallback(() => {
        if (!reckReady || busy || phase !== "aim") return;
        setBalls([]);
        onReckoning?.();
    }, [reckReady, busy, phase, onReckoning]);

    const sinkingSide = phase === "sinking" || phase === "result" ? battle?.sunk : null;
    const win = Boolean(battle?.win);
    // A new exchange raises the recap; four and a half seconds later it lowers itself. Keyed on the round so
    // re-rendering for any other reason cannot restart the timer, and so the Recap button's manual open is
    // not yanked shut underneath the player.
    const recapRound = exchange ? battle?.round : null;
    useEffect(() => {
        if (recapRound == null || phase !== "aim") return undefined;
        setRecapOpen(true);
        const t = setTimeout(() => setRecapOpen(false), 4500);
        return () => clearTimeout(t);
    }, [recapRound, phase]);

    const lowAny = clampPct(myHp, battle?.myMax) <= 25 || clampPct(foeHp, battle?.foeMax) <= 25;

    return (
        <div className="sbt-scene" role="dialog" aria-modal="true">
            {/* THE SEA IS PAINTED, NOT PLOTTED. This was two CSS gradients with a hairline horizon and
                repeating-linear-gradient "swell" — flat blue bands that read as a loading screen, and the one
                surface on screen that is supposed to sell "you are out on the water in the middle of a
                fight". The game already owned this canvas: the same storm-lit ocean the raid screens use,
                painted in the house palette, warm break in the cloud over a cold green sea. */}
            <div className="sbt-sky" aria-hidden="true" />
            <div className="sbt-sea" aria-hidden="true" />
            <div className="sbt-seaveil" aria-hidden="true" />
            <div className="sbt-motes" aria-hidden="true">
                {MOTES.map((m, i) => <i key={i} style={{ left: `${m.x}%`, animationDelay: `${m.d}s`, animationDuration: `${m.t}s`, "--mz": m.z }} />)}
            </div>

            <div className="sbt-hud">
                <Bar f={me} hp={myHp} max={battle?.myMax} side="me" sys={battle?.sys?.me} caps={caps} />
                <div className="sbt-round">
                    {/* The round you are IN, not the one you just fought — `round` counts exchanges resolved. */}
                    <b>Round {(battle?.round || 0) + (phase === "play" ? 0 : 1)}</b>
                    {/* The initiative line is gone. You always fire first now, so it said the same three
                        words every round of every battle — and a label that never changes is not information,
                        it is furniture. What it used to be for (warning you the order had flipped) no longer
                        happens. A fight already in progress from before the change keeps its saved order, so
                        that one case still says so. */}
                    {/* Nothing here any more: you fire first in every fight, including one already in
                        progress, so there is no order left to announce. */}
                </div>
                <Bar f={foe} hp={foeHp} max={battle?.foeMax} side="foe" sys={foeSys} caps={caps} />
            </div>

            <div className={`sbt-chrome${logOpen ? " is-open" : ""}`}>
                <SceneMusic vibe="seabattle" place="inline" />
                {onClose ? (
                    <button type="button" className="sbt-leave" onClick={onClose}
                        title={battle?.over ? "Close" : "Leave — this fight will be waiting for you"}>
                        {battle?.over ? "Close" : "Leave"}
                    </button>
                ) : null}
                {/* THE WAY BACK. The recap dismisses itself, so there has to be one. Only appears once there
                    is an exchange to show, and only while it is down. */}
                {exchange && !recapOpen && phase === "aim" && !battle?.over ? (
                    <button type="button" className="sbt-recall" onClick={() => setRecapOpen(true)}>Recap</button>
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
                    {/* ONE LINE A SIDE. It was two stacked cards of five lines each: a tally, a damage
                        figure, a per-zone breakdown, a miss count and a wreck notice, times two — a debug
                        dump with a border, parked over both ships. Everything here is already somewhere
                        else: the hit odds are on the target, the damage is on the read-out, and the full
                        blow-by-blow is in the Log. What a recap owes you is the headline. */}
                    {phase === "aim" && exchange && recapOpen ? (
                        <div className="sbt-recap" onClick={() => setRecapOpen(false)}>
                            {[["You", exchange.mine, "is-mine"], ["Them", exchange.theirs, "is-theirs"]].map(([label, x, cls]) => (
                                <div key={label} className={`sbt-recap-line ${cls}`}>
                                    <b>{label}</b>
                                    <span className="sbt-recap-dmg">{x ? x.dmg : "–"}</span>
                                    <span className="sbt-recap-where">
                                        {!x ? "held fire"
                                            : Object.keys(x.byZone).length
                                                ? Object.entries(x.byZone).map(([z]) => zoneById(z).name.toLowerCase()).join(" · ")
                                                : "no damage"}
                                    </span>
                                    <span className="sbt-recap-tally">{x ? `${x.hits}/${x.guns}` : ""}</span>
                                    <span className="sbt-recap-wreck">{x?.wrecks?.length ? x.wrecks[0] : ""}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <Ship f={me} side="me" hullRef={meHullRef}
                        hurt={hitFx?.side === "me"} heavy={Boolean(hitFx?.side === "me" && hitFx.heavy)}
                        low={clampPct(myHp, battle?.myMax) <= 25}
                        sinking={sinkingSide === "me"}
                        hp={myHp} hpMax={battle?.myMax}
                        sys={battle?.sys?.me} caps={caps} firing={firingSide === "me"} />
                    <Ship f={foe} side="foe" hullRef={foeHullRef}
                        hurt={hitFx?.side === "foe"} heavy={Boolean(hitFx?.side === "foe" && hitFx.heavy)}
                        low={clampPct(foeHp, battle?.foeMax) <= 25}
                        sinking={sinkingSide === "foe"}
                        hp={foeHp} hpMax={battle?.foeMax}
                        sys={foeSys} caps={caps} firing={firingSide === "foe"}
                        targets={phase === "aim" && !battle?.over ? markers : null}
                        onPick={pick} onUnpick={unpick} />

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

                    {reckCry ? (
                        <>
                            <span key={`f${reckCry.k}`} className="sbt-reckflash" aria-hidden="true" />
                            <span key={reckCry.k} className="sbt-reckcry">{reckCry.text}</span>
                        </>
                    ) : null}
                    {shout ? (
                        <span key={shout.k} className={`sbt-shout ${shout.side === "me" ? "on-foe" : "on-me"}`}>{shout.text}</span>
                    ) : null}
                    {phase === "play" ? pops.map((pp) => (
                        <span key={pp.k}
                            className={`sbt-pop${pp.at ? " is-at" : pp.side === "me" ? " on-foe" : " on-me"}${pp.rake ? " is-rake" : ""}${pp.miss ? " is-miss" : ""}`}
                            style={pp.at
                                ? { left: pp.at.x, top: pp.at.y, "--lane": `${pp.lane * 22}px` }
                                : { "--lane": `${pp.lane * 26}px` }}>
                            {/* A SHOT INTO CANVAS OR A GUN DECK TAKES NO PLANKS — that is the whole point of
                                aiming there — so it used to pop "−0", which reads as a shot that did
                                nothing. It says what it cut instead. */}
                            {pp.miss
                                ? <>MISS{pp.chance != null ? <b>{Math.round(pp.chance * 100)}% shot</b> : null}</>
                                : pp.dmg > 0
                                    ? <>−{pp.dmg}{pp.rake ? <b>RAKE</b> : null}</>
                                    : pp.wrecked === "sails" ? <>CANVAS<b>cut</b></>
                                    : pp.wrecked === "guns" ? <>GUN<b>hit</b></>
                                    : <>GLANCE</>}
                        </span>
                    )) : null}
                </div>
            </div>

            {/* ── THE ONLY CONTROL ON THE SCREEN ──────────────────────────────────────────────────────────────
                What you picked and what it does, the rack if you are carrying anything special, and FIRE. */}
            {!battle?.over ? (
                <div className={`sbt-aimbar${phase === "aim" ? "" : " is-waiting"}`}>
                    <div className={`sbt-zoneread${picked ? "" : " is-idle"}`} style={{ "--tint": picked?.tint || "#9fb6cc" }}>
                        {picked
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img className="sbt-zoneart" src={PART_ART[picked.zone]} alt="" draggable="false" />
                            : <Icon name="GiTargeting" className="sbt-zoneicon" />}
                        <div>
                            <b>{picked ? picked.name : "Pick your target"}</b>
                            <em>{allLaid ? picked?.effect || "Every gun is laid."
                                : picked ? `${picked.effect}  ·  ${leftToLay} gun${leftToLay === 1 ? "" : "s"} still to lay`
                                : "Tap a part of her ship — one gun each tap."}</em>
                        </div>
                        {/* TWO NUMBERS, BOTH LIVE. The odds moved with the ammunition already; the damage
                            never did, so half of every ammunition decision was invisible. Switching to
                            explosive drops the percentage and lifts the damage in the same glance, which is
                            the whole trade, shown rather than described. */}
                        {picked ? (
                            <span className="sbt-read-nums">
                                <span className="sbt-odds">{Math.round(picked.chance * 100)}%</span>
                                <span className="sbt-expect">~{picked.dmg}<i>dmg</i></span>
                            </span>
                        ) : null}
                    </div>

                    {/* NO RACK. Ammunition is not a purchase or a quantity any more: a barrel's MARK decides
                        what it can load and the part you aim at decides which of those it loads, so the rack
                        of counts and the picker beside it were a control for a decision nobody was making.
                        What each gun will fire shows on the read-out and on its pip. */}

                    {/* THE GUN RAIL. One pip per barrel, in the colour of the round it carries, so a split
                        broadside is visible before it goes off — and tapping a pip takes that gun back. */}
                    <div className="sbt-gunrail">
                        {liveGuns.map((g) => {
                            const a = aim.find((x) => x.gun === g);
                            const at = a ? targets.find((t) => t.zone === a.zone && (t.target ?? null) === (a.target ?? null)) : null;
                            return (
                                <button key={g} type="button"
                                    className={`sbt-gunpip${a ? ` is-laid is-${a.ammo}` : ""}`}
                                    disabled={!a || phase !== "aim"} onClick={() => clearGun(g)}
                                    title={a ? `Gun ${g + 1} — ${at?.name || a.zone}` : `Gun ${g + 1} — not laid yet`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/images/sailing/deck-cannon.png" alt="" draggable="false" />
                                    {/* WHERE THIS BARREL IS POINTED. Splitting the broadside is the whole point
                                        of the feature and the rail was six identical icons — the assignment
                                        existed, on a `title` tooltip, which is nothing at all on a phone. The
                                        part's own sprite under each pip means you read your plan off the rail
                                        instead of remembering what you tapped. */}
                                    {a ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img className="sbt-gunpip-at" src={PART_ART[a.zone]} alt=""
                                            style={{ "--tint": at?.tint || "#ffd28a" }} draggable="false" />
                                    ) : null}
                                    {a && a.zone === "guns" && a.target != null ? (
                                        <span className="sbt-gunpip-n">{a.target + 1}</span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>

                    {/* THE RECKONING. A tally of every ball of yours that has gone wide, and when it is full
                        it stops being a meter and becomes the button — the bar IS the button, so there is
                        nothing to learn about where the skill lives. Spending it fires one unanswered volley
                        at parts of her ship chosen at random, canvas, timber or a barrel.

                        Built out of MISSES on purpose: a bad run is the least interesting thing that can
                        happen in a fight, and this makes the worst stretch of a battle pay for the best
                        moment in it. */}
                    {reck ? (
                        <button type="button"
                            className={`sbt-reck${reckReady ? " is-ready" : ""}`}
                            disabled={!reckReady || busy || phase !== "aim"}
                            onClick={reckFire}
                            title={reckReady
                                ? `${reck.name} — one free volley, every ball lands, targets chosen at random`
                                : `${reckAt - reckN} more ${reckAt - reckN === 1 ? "miss" : "misses"}`}>
                            <i className="sbt-reck-shine" aria-hidden="true" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="sbt-reck-art" src="/images/sailing/gun/reckoning.png" alt="" draggable="false" />
                            <b className="sbt-reck-name">{reck.name}</b>
                            {/* CHARGES, NOT A BAR. Empty, a bar is an empty rounded rectangle with grey text
                                floating in it — it read as a broken input rather than something filling up.
                                Four notches say how many misses it takes before you have looked at it once,
                                and each one lights the moment a ball goes wide. */}
                            {/* THE CHARGES ARE THE COUNT, so there is no number beside them — art, name,
                                notches and a tally all in one 191px column overflowed it and clipped the
                                last charge off the edge. Full, the notches have nothing left to say and are
                                replaced by the thing to do. */}
                            {reckReady ? (
                                <em className="sbt-reck-cta">Unleash</em>
                            ) : (
                                <span className="sbt-reck-pips" aria-hidden="true">
                                    {Array.from({ length: reckAt }).map((_, i) => (
                                        <i key={i} className={i < reckN ? "is-lit" : ""} style={{ "--i": i }} />
                                    ))}
                                </span>
                            )}
                        </button>
                    ) : null}

                    {/* EVERY GUN, THEN FIRE. Nothing follows anything, so a barrel with no order would simply
                        not go off — better to wait for it than to waste it silently. */}
                    <button type="button" className={`sbt-fire${allLaid ? " is-ready" : ""}`}
                        disabled={!allLaid || busy || phase !== "aim"} onClick={fire}>
                        <b>{allLaid ? "FIRE" : `${aim.length}/${liveGuns.length}`}</b>
                        <em>{allLaid
                            ? `${liveGuns.length} gun${liveGuns.length === 1 ? "" : "s"}`
                            : `lay ${leftToLay} more`}</em>
                    </button>
                </div>
            ) : null}

            {/* THE ONE-TIME EXPLANATION IS GONE. It appeared on the first fight, before the player had any
                context to attach it to, and never again — so the round they actually wondered what canvas was
                for was a round it could not help them. It had also gone stale: "Every gun you own fires at it"
                stopped being true the day the broadside could be split.
                What replaced it is the screen itself. The read-out names the part and what it does, and now
                carries the odds AND the damage, both of which move when the ammunition changes. Her card shows
                the dodge that canvas is protecting and the plate a ball has to get through. The rail shows
                where every barrel is pointed. Nothing needs to be read once and remembered. */}
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
                            {battle?.sunk
                                ? (win
                                    ? <>{foe.name} went down by the bow after {battle?.round} round{battle?.round === 1 ? "" : "s"}.</>
                                    : <>{foe.name} put you under after {battle?.round} round{battle?.round === 1 ? "" : "s"}.</>)
                                : <>Not a gun left standing on either deck after {battle?.round} round{battle?.round === 1 ? "" : "s"} — {win ? "you were the healthier ship" : `${foe.name} was the healthier ship`}.</>}
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
                        <button className="sail-cta" disabled={!ready} onClick={onClose}>{ready ? "Back to the helm" : "…"}</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
