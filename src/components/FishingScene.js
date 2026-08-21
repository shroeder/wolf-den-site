"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ItemArt from "@/components/ItemArt";
import FishingWater from "@/components/FishingWater";
import { haulScale } from "@/lib/marketplace/fishing-scale.js";
import { createPortal } from "react-dom";

// ── FISHING ──────────────────────────────────────────────────────────────────────────────────────────────────
// Three beats, about fifteen seconds:
//
//   CAST   tap once. The server has already decided what's down there.
//   BITE   the line twitches at a moment you can't predict. Tap again.
//   REEL   the fish swims up and down on its own. HOLD to raise YOUR BAR, release and it falls. Keep the fish
//          inside the bar. Time-in-bar is your reel score — shown live, but it does NOT decide the size.
//          Size is luck; a good reel only floors the bad end of it (see weightFor in fishing.js).
//
// The roles were the other way round at first — you drove a hook and the zone drifted — and it read as broken:
// "the green bar just goes up and down without any input from me". A fish that swims itself is what everyone
// expects a fish to do, and chasing it with a capture bar is an idiom players already know.
//
// The reel is deliberately NOT the forge's timing bar — this one is continuous and forgiving. Every frame the
// fish is inside the bar is credit banked, so a shaky reel lands a smaller fish rather than nothing. The only
// way to lose the fish is to never tap the bite at all, and that refunds the cast server-side.
//
// The server owns everything that matters: species, the luck half of the size, and the payout. This component
// reports one number — quality, 0..1 — exactly like the forge's enhance minigame and the merchant's coin game.

const REEL_MS = 6500;            // how long the struggle lasts
const BAND_H = 0.26;             // height of your bar, as a fraction of the tank — the FLOOR; see bandFor
const REEL_WARMUP_MS = 700;      // grace before scoring starts — see the note at the scoring site
const DART_EVERY_MS = 900;       // the fish makes a run for it this often

// ── YOUR TACKLE, IN YOUR HANDS ───────────────────────────────────────────────────────────────────────────────
// The Rail sells four upgrade tracks and not one of them could be felt. Line buys casts, Lure and Net move
// odds you never see rolled, and Gaff sets a floor under the size — all of them numbers on an upgrade card
// that change a result somewhere off screen. You could max the lot and the fight in your hands was identical
// to a brand-new angler's.
//
// Gaff is the one that belongs in the fight: it is the hook you land it with, and its existing job is already
// "land it cleanly and the fish is never a small one". So it widens YOUR BAR. A new angler works a 26% band;
// a maxed Gaff works 40%. Same fish, same darting, but you are better equipped to hold it — and the upgrade
// is felt on the very next cast instead of being taken on trust.
const BAND_PER_GAFF = 0.56;      // gaff's value runs 0..0.25, so this adds up to +0.14 on top of BAND_H
const bandFor = (gaff = 0) => BAND_H + Math.max(0, Math.min(0.25, Number(gaff) || 0)) * BAND_PER_GAFF;

// ── THE PERFECT CORE ─────────────────────────────────────────────────────────────────────────────────────────
// Sitting anywhere in the bar used to bank full credit, which meant the score topped out the moment you were
// competent and there was nothing left to get better at. The middle of the bar is now worth close to double
// what its edges are, so a good reel and a GREAT one are different things.
//
// This does lower the ceiling on ordinary play — holding the fish loosely inside the band now banks 0.55 a
// frame rather than 1.0 — and that is the point: 100% has to be hard to be worth printing. The two other
// changes push the other way (Gaff widens the whole bar, better bait calms the fish), so an invested angler
// playing well lands in much the same place they always did.
const CORE_SHARE = 0.42;         // the core is this fraction of the bar's height, centred
const BAND_CREDIT = 0.55;        // banked per frame inside the bar but outside the core
const CORE_CREDIT = 1.0;         // and inside the core

// ── IT RUNS ──────────────────────────────────────────────────────────────────────────────────────────────────
// Six seconds of the same steady darting is one texture held for the whole fight, and every fish felt like
// every other fish with the dial turned up. Now it bolts: a hard sustained surge for one end of the water,
// then it tires and gives you a moment of easy line. Rarity sets how many runs you have to survive, so a
// sardine is a drift with one lunge in it and a mythic is three, back to back to back.
const RUN_MS = 900;              // how long a bolt lasts
const TIRE_MS = 700;             // and the breather immediately after it
const RUN_PUSH = 2.4;            // sustained acceleration toward the end it is making for
const RUN_DART = 1.8;            // and how much harder it thrashes while running
const TIRE_DAMPING = 0.70;       // it settles fast when it is blown — this is your window
const RUNS = { common: 1, rare: 1, epic: 2, legendary: 2, mythic: 3 };

// ── WHAT IS ON THE HOOK CHANGES THE FIGHT ────────────────────────────────────────────────────────────────────
// Bait moved odds and nothing else: you picked it in a menu, a rarer fish became likelier somewhere in the
// server's roll, and the pick had no consequence you could feel. It does now — and it pulls AGAINST the thing
// it buys. Crude bait gets worried at, so the fish is frantic on the end of it; proper bait is taken properly,
// the hook sets deep, and the thing fights hard but honestly.
//
// So a mythic bait attracts something far rarer (a harder fight) and then partly pays for the trouble it
// caused (a calmer one). Net: good bait buys you access to fish you could not otherwise hold, rather than
// simply handing you a harder fight and calling it a reward.
const BAIT_HOLD = { common: 1.0, rare: 0.94, epic: 0.88, legendary: 0.82, mythic: 0.76 };
const holdFor = (rarity) => BAIT_HOLD[rarity] || 1.0;

// ── YOUR BAR ─────────────────────────────────────────────────────────────────────────────────────────────────
// These were inherited from the old marker physics and were catastrophically wrong once the bar became the
// thing you drive. At pull 1.35 / gravity 0.62 / damping 0.86 the bar settled at 0.075 units per second, so
// crossing the tank took 9.9 SECONDS — in a reel that lasts 6.5. A fish at the far end was not hard to reach,
// it was unreachable, and holding felt like pressing a button attached to nothing.
//
// Now the bar crosses in a bit under a second, and drops in about one and a half. Responsive enough that the
// chase is a chase; heavy enough that it still coasts and you have to lead the fish rather than snap to it.
const BAR_PULL = 7.0;            // upward acceleration while you hold
const BAR_GRAVITY = 2.6;         // and what takes it back down when you let go
const BAR_DAMPING = 0.92;        // light — the bar should answer the thumb, not wade through treacle
const FISH_DAMPING = 0.86;       // heavier, so the fish's darts settle instead of pinballing

// LINE TENSION IS GONE. It was meant to make holding a decision, but with a bar this sluggish you had to hold
// constantly just to make headway — and holding constantly redlined the line in 2.2 seconds. So the mechanic
// that was supposed to add a choice instead guaranteed a failure you couldn't avoid, on top of a chase you
// couldn't win. Luke played it and said so. The depth now comes from the fish itself: what it does is visible,
// which the tension gauge never was.

// How hard a thing fights, by how rare it is. The client is told a FIGHT PROFILE, never the species — knowing
// a Kraken is on the line before it surfaces would give the reveal away — but it can feel the difference,
// which is the point: a monster should fight like one.
const FIGHT = {
    common: { dart: 0.85 },
    rare: { dart: 1.0 },
    epic: { dart: 1.25 },
    legendary: { dart: 1.5 },
    mythic: { dart: 1.85 },
};

// THE score, in one place. It used to be computed only at the end (as sqrt of time-in-band) while the on-screen
// strain bar drew the RAW fraction — so the single piece of live feedback disagreed with the result it was
// supposedly previewing: reel at 0.45 and the bar read 45% while you were actually banking 67%. The curve is
// still applied (raw time-in-band sits near 0.45 even when you're playing well, because the band moves), but
// the bar and the submitted score now come from this same function.
const scoreOf = (inFrames, total) => Math.max(0, Math.min(1, Math.sqrt(total ? inFrames / total : 0)));
const BITE_HOLD_MS = 2600;       // how long the bite stays tappable once it starts

const RARITY_COLOR = {
    common: "#cfd8e3", rare: "#7ec8ff", epic: "#c9a2ff", legendary: "#ffd75e", mythic: "#ff9ec4",
};
const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic" };

// A weight in pounds, written the way an angler would say it — ounces for the tiddlers, whole pounds once
// it's a real fish, and no decimals at all on the monsters where a tenth of a pound is noise.
function weightLabel(lb) {
    const n = Number(lb) || 0;
    if (!n) return "—";
    if (n < 1) return `${Math.round(n * 16)} oz`;
    if (n < 10) return `${n.toFixed(1)} lb`;
    return `${Math.round(n).toLocaleString()} lb`;
}

// The species sprite, with the old emoji as the fallback until its PNG is in place.
function FishArt({ id, emoji, size = 44, className = "" }) {
    const [failed, setFailed] = useState(false);
    if (!id || failed) return <span className={className} style={{ fontSize: size * 0.8 }} aria-hidden="true">{emoji}</span>;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            className={className} src={`/images/fish/${id}.png`} alt="" aria-hidden="true"
            width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }}
            onError={() => setFailed(true)}
        />
    );
}

// ── SOUND ── best-effort Web Audio, no asset files. Silent if the browser blocks it.
function useSfx() {
    const ctxRef = useRef(null);
    const ac = () => {
        if (typeof window === "undefined") return null;
        if (!ctxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try { ctxRef.current = new AC(); } catch { return null; }
        }
        if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
        return ctxRef.current;
    };
    const tone = useCallback((freq, dur = 0.12, type = "sine", vol = 0.12) => {
        const ctx = ac(); if (!ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    }, []);
    return useMemo(() => ({
        plop: () => tone(320, 0.16, "sine", 0.1),
        bite: () => { tone(880, 0.08, "square", 0.13); setTimeout(() => tone(1180, 0.1, "square", 0.11), 70); },
        click: () => tone(140 + Math.random() * 40, 0.03, "square", 0.05),
        land: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.12), i * 90)); },
        gone: () => { tone(300, 0.18, "sawtooth", 0.08); setTimeout(() => tone(190, 0.26, "sawtooth", 0.07), 130); },
    }), [tone]);
}

// -- THE REEL, BACK FROM THE DEAD ----------------------------------------------------------------------------
// This is the hold-to-reel minigame, restored. It was cut when fishing was rebuilt around the watchable scene
// and replaced with a single tap that reported a FIXED quality of 0.78 -- a graded reel nobody played, so the
// grade was a polite fiction. The scene was the right call and it stays; the tap was one beat too few.
//
// What it is: the FISH swims itself, up and down the water, and nothing you press moves it. YOUR BAR is the
// only thing your thumb touches -- hold to raise it, release and it falls. Credit banks every frame the fish
// is inside your bar, and that fraction (curved, see scoreOf) is the quality the server receives.
//
// KEPT FROM THE OLD ONE, deliberately:
//   - No line tension. It was a second axis that turned holding into a guaranteed snap, so the mechanic meant
//     to add a choice removed the only one you had. Luke played it and said so. Depth comes from the fish.
//   - Pointer CAPTURE on the press. The rod is narrow and onPointerLeave used to release the hold, so a thumb
//     drifting sideways silently let go mid-reel and the line sank for no visible reason.
//   - The warm-up. The score is an average over the WHOLE run, so the moments spent finding the fish used to
//     cap your result permanently before you had seen where it was.
// CHANGED, because the scene exists now: it draws over the water instead of replacing it, so the boat still
// rocks and the hero still stands on the deck while you fight the thing.
export function ReelStruggle({ onDone, sfx, fight = "common", gaff = 0, baitRarity = null }) {
    const F = FIGHT[fight] || FIGHT.common;
    // Your tackle and your bait, resolved once — both are fixed for the length of the fight.
    const BAND = bandFor(gaff);
    const HOLD = holdFor(baitRarity);
    const runCount = RUNS[fight] || 1;
    const [tick, setTick] = useState(0);          // repaint pulse
    const holdRef = useRef(false);
    const posRef = useRef(0.5);                   // THE FISH, 0 (bottom) .. 1 (top). Swims itself.
    const velRef = useRef(0);
    const bandRef = useRef(0.5);                  // YOUR BAR (centre). Hold to raise, release to fall.
    const barVelRef = useRef(0);
    const bankRef = useRef(0);                    // credit banked (core is worth more than the band)
    const totalRef = useRef(0);                   // and the most that could have been banked
    const startRef = useRef(0);
    const lastDartRef = useRef(0);
    const doneRef = useRef(false);
    const clickRef = useRef(0);
    const runDirRef = useRef(1);                  // which way it bolted, held for the length of the run
    const runSeenRef = useRef(-1);                // so a run only announces itself once
    const [mood, setMood] = useState("hold");     // hold | run | tired — drives the copy and the glow

    // WHEN IT RUNS. Spread evenly across the scoring part of the fight, so the last one never lands so late
    // that it cannot be recovered from. Recomputed only when the fish's rarity changes.
    const runs = useMemo(() => {
        const first = REEL_WARMUP_MS + 500;
        const last = REEL_MS - (RUN_MS + TIRE_MS) - 250;
        const span = Math.max(0, last - first);
        return Array.from({ length: runCount }, (_, k) => first + (runCount === 1 ? span / 2 : (span / (runCount - 1)) * k));
    }, [runCount]);

    useEffect(() => {
        let raf = 0;
        let prev = 0;
        const step = (ts) => {
            if (!startRef.current) { startRef.current = ts; prev = ts; }
            const dt = Math.min(0.05, (ts - prev) / 1000);
            prev = ts;
            const elapsed = ts - startRef.current;

            // ── WHAT THE FISH IS DOING RIGHT NOW ──────────────────────────────────────────────────────
            // Three states. Between runs it drifts and darts as it always did; during a run it surges for
            // one end and thrashes; straight after, it is blown and settles — which is the moment to get it
            // back in the core.
            let phase = "hold";
            let runIdx = -1;
            for (let k = 0; k < runs.length; k += 1) {
                const t0 = runs[k];
                if (elapsed >= t0 && elapsed < t0 + RUN_MS) { phase = "run"; runIdx = k; break; }
                if (elapsed >= t0 + RUN_MS && elapsed < t0 + RUN_MS + TIRE_MS) { phase = "tired"; runIdx = k; break; }
            }
            // A fresh run picks its direction once, and announces itself once.
            if (phase === "run" && runSeenRef.current !== runIdx) {
                runSeenRef.current = runIdx;
                // It bolts AWAY from where your bar is — a run you could ignore is not a run.
                runDirRef.current = bandRef.current > 0.5 ? -1 : 1;
                sfx.bite();
                try { navigator.vibrate?.(35); } catch { /* no haptics here */ }
            }

            const t = elapsed / 1000;
            const frenzy = (phase === "run" ? RUN_DART : 1) * HOLD;
            if (phase !== "tired" && elapsed - lastDartRef.current > DART_EVERY_MS / (F.dart * (phase === "run" ? 1.6 : 1))) {
                lastDartRef.current = elapsed;
                velRef.current += (Math.random() - 0.5) * 1.1 * F.dart * frenzy;
            }
            if (phase === "run") velRef.current += runDirRef.current * RUN_PUSH * dt * F.dart * HOLD;
            velRef.current += Math.sin(t * 0.9 + 0.7) * 0.5 * dt * F.dart * HOLD;
            velRef.current *= Math.pow(phase === "tired" ? TIRE_DAMPING : FISH_DAMPING, dt * 60);
            posRef.current += velRef.current * dt;
            if (posRef.current <= 0.05) { posRef.current = 0.05; velRef.current = Math.abs(velRef.current) * 0.5; }
            if (posRef.current >= 0.95) { posRef.current = 0.95; velRef.current = -Math.abs(velRef.current) * 0.5; }

            // YOUR BAR: hold to raise, release and it falls. The only thing your thumb touches.
            barVelRef.current += (holdRef.current ? BAR_PULL : 0) * dt;
            barVelRef.current -= BAR_GRAVITY * dt;
            barVelRef.current *= Math.pow(BAR_DAMPING, dt * 60);
            bandRef.current += barVelRef.current * dt;
            const half = BAND / 2;
            if (bandRef.current <= half) { bandRef.current = half; barVelRef.current = 0; }
            if (bandRef.current >= 1 - half) { bandRef.current = 1 - half; barVelRef.current = 0; }

            // ── CREDIT, BANKED PER FRAME ──────────────────────────────────────────────────────────────
            // Inside the bar pays; inside the CORE pays nearly double. The warm-up still applies: the score
            // averages the whole run, so the moments spent finding the fish used to cap the result before
            // you had seen where it was.
            const scoring = elapsed >= REEL_WARMUP_MS;
            const inside = Math.abs(posRef.current - bandRef.current) <= half;
            const inCore = Math.abs(posRef.current - bandRef.current) <= (BAND * CORE_SHARE) / 2;
            if (scoring) {
                totalRef.current += CORE_CREDIT;
                if (inCore) bankRef.current += CORE_CREDIT;
                else if (inside) bankRef.current += BAND_CREDIT;
            }
            // Reel clicks while you are holding and on target — the feedback that says it is working. Tighter
            // and brighter in the core, so the best place to be is audible without having to look at it.
            if (inside && holdRef.current && ts - clickRef.current > (inCore ? 80 : 130)) { clickRef.current = ts; sfx.click(); }

            setMood(phase);
            setTick((n) => (n + 1) % 100000);

            if (elapsed >= REEL_MS) {
                if (!doneRef.current) {
                    doneRef.current = true;
                    onDone(scoreOf(bankRef.current, totalRef.current));
                }
                return;
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [onDone, sfx, F.dart, BAND, HOLD, runs]);

    // Capture the pointer on press — see the note above the component. stopPropagation because the water
    // frame underneath carries its own pointer handler for the strike tap.
    const down = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not supported — up still works */ }
        holdRef.current = true;
    }, []);
    const up = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
        holdRef.current = false;
    }, []);

    const elapsed = startRef.current ? Math.min(REEL_MS, performance.now() - startRef.current) : 0;
    const left = Math.max(0, 1 - elapsed / REEL_MS);
    const pos = posRef.current, band = bandRef.current;
    const half = BAND / 2;
    const inside = Math.abs(pos - band) <= half;
    const inCore = Math.abs(pos - band) <= (BAND * CORE_SHARE) / 2;
    const scoreNow = scoreOf(bankRef.current, totalRef.current);
    const warming = elapsed < REEL_WARMUP_MS;
    const title = warming ? "GET READY…"
        : mood === "run" ? "IT'S RUNNING!"
        : mood === "tired" ? "IT'S TIRING — NOW!"
        : inCore ? "PERFECT" : inside ? "ON IT" : "KEEP IT IN THE BAR";

    return (
        <div className={`fwreel${inside ? " is-on" : ""}${inCore ? " is-core" : ""}`} data-mood={mood} data-tick={tick}>
            {/* The rod gauge, against the right edge — it leaves the boat, the hero and the water visible,
                which is the whole reason the reel lives in the frame instead of over it. */}
            {/* ── THE ROD IS A GAUGE, NOT A BUTTON ────────────────────────────────────────────────────────
                It took the press itself, which put a thumb over the one thing the mechanic asks you to
                watch. Luke: "you need to be able to fight the fish by clicking the button, and the button
                can't be the reel, otherwise you can't see what you're doing." So the rod is inert now and
                the hold lives on its own control, bottom-left, where a hand rests anyway. */}
            <div className="fwreel-rod" role="presentation">
                <div className="fwreel-band" style={{ bottom: `${(band - half) * 100}%`, height: `${BAND * 100}%` }}>
                    {/* THE CORE. Drawn as a child of the bar so it tracks it for free and scales with Gaff. */}
                    <div className="fwreel-core" style={{ height: `${CORE_SHARE * 100}%` }} />
                </div>
                {/* THE FISH. It swims itself; your thumb drives the BAR. It was a glowing ball, which is
                    what you draw when you are drawing a position rather than a fish — this is the sprite
                    the old reel had. One species for every fight, deliberately: what is on the line is not
                    revealed until the haul, and a sprite that changed with the tier would give it away. */}
                <div className={`fwreel-fish${inCore ? " is-core" : inside ? " is-caught" : ""}`} style={{ bottom: `${pos * 100}%` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/fish/fish_mackerel.png" alt="" draggable="false" aria-hidden="true" />
                </div>
            </div>
            <div className="fwreel-side">
                <strong className="fwreel-title">{title}</strong>
                <button type="button" className="fwreel-hold"
                    onPointerDown={down} onPointerUp={up} onPointerCancel={up}>
                    HOLD TO REEL
                </button>
                {/* Live, and the same number the server receives. What is hidden is the RELATIONSHIP: a good
                    reel floors the bad end of the size roll rather than setting the size, so this reads as
                    "how am I handling it" and never spoils the reveal. */}
                <div className="fwreel-meter">
                    <div className="fwreel-meter-fill" style={{ width: `${scoreNow * 100}%` }} />
                </div>
                <span className="fwreel-pct">{Math.round(scoreNow * 100)}%</span>
            </div>
            <div className="fwreel-timer"><div className="fwreel-timer-fill" style={{ width: `${left * 100}%` }} /></div>
        </div>
    );
}


// ── THE LOG ──────────────────────────────────────────────────────────────────────────────────────────────────
// Exported so the dedicated /marketplace/fishing page renders the SAME boards. It used to be reachable only
// through this modal — which is only offered while a voyage is in flight — so your own log was invisible
// whenever your boat was docked.
export function FishingLog({ log, known, total, records, onClose }) {
    const [tab, setTab] = useState("log");
    // `records` arrives as { records, top } — the per-species board and the ranked leaderboard.
    const perSpecies = records?.records || [];

    // MY BESTS. This tab used to be "Top Catches": the Den's heaviest catches ranked overall, sitting beside
    // "Species Records", the Den's heaviest catch PER SPECIES. Two boards of other people's big fish, and from
    // the player's chair they read as the same board twice. Species Records is the one worth keeping — it is
    // per species and it shows which records are unclaimed, so it tells you what to go and chase.
    //
    // What was missing was your own trophy wall. My Collection has your best weight in it, but it is a
    // checklist of all 40-odd species in fixed order, mostly question marks — you cannot see your best catches
    // in it, only look them up one at a time. This ranks what you have actually landed, heaviest first, next
    // to the Den record for that species so the gap (or the crown) is right there.
    //
    // Built from data already on the client — `log` carries your best per species and `perSpecies` carries the
    // Den record for it — so this needed no new endpoint.
    const bestOf = new Map(perSpecies.map((r) => [r.id, r.record || 0]));
    const mine = (log || [])
        .filter((f) => f.caught && f.best > 0)
        .map((f) => ({ ...f, denRecord: bestOf.get(f.id) || 0 }))
        .sort((a, b) => b.best - a.best);
    return (
        <div className="fish-log">
            <div className="fish-log-tabs">
                <button type="button" className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>📖 My Collection</button>
                <button type="button" className={tab === "top" ? "on" : ""} onClick={() => setTab("top")}>🥇 My Bests</button>
                <button type="button" className={tab === "rec" ? "on" : ""} onClick={() => setTab("rec")}>🏆 Den Records</button>
            </div>
            {tab === "log" ? (
                <>
                    <p className="fish-log-progress">{known} of {total} species logged</p>
                    <div className="fish-log-grid">
                        {(log || []).map((f) => (
                            <div key={f.id} className={`fish-log-row${f.caught ? "" : " is-unknown"}`}>
                                {f.caught ? <FishArt id={f.id} emoji={f.emoji} size={34} className="fish-log-art" /> : <span className="fish-log-emoji" style={{ color: RARITY_COLOR[f.rarity] }}>❓</span>}
                                <span className="fish-log-name">
                                    {f.caught ? f.name : "???"}
                                    <em style={{ color: RARITY_COLOR[f.rarity] }}>{RARITY_LABEL[f.rarity]}</em>
                                </span>
                                <span className="fish-log-best">
                                    {f.caught ? (
                                        <>
                                            <strong>{weightLabel(f.best)}</strong>
                                            <em>×{f.caught}</em>
                                        </>
                                    ) : <em>{f.odds >= 1 ? `${f.odds}% chance` : `1 in ${Math.round(100 / f.odds)}`}</em>}
                                </span>
                                
                            </div>
                        ))}
                    </div>
                </>
            ) : tab === "top" ? (
                <>
                    <p className="fish-log-progress">Your heaviest of every species you&apos;ve landed</p>
                    <div className="fish-log-grid">
                        {mine.map((f, i) => {
                            // Your best matching the Den record for that species means the record is yours.
                            const holder = f.denRecord > 0 && f.best >= f.denRecord;
                            return (
                                <div key={f.id} className="fish-log-row">
                                    <span className="fish-top-rank">{i + 1}</span>
                                    <FishArt id={f.id} emoji={f.emoji} size={34} className="fish-log-art" />
                                    <span className="fish-log-name">
                                        {f.name}
                                        <em style={{ color: RARITY_COLOR[f.rarity] }}>{RARITY_LABEL[f.rarity]} · caught ×{f.caught}</em>
                                    </span>
                                    <span className="fish-log-best">
                                        <strong>{weightLabel(f.best)}</strong>
                                        {holder
                                            ? <em className="fish-over">🏆 Den record</em>
                                            : f.denRecord > 0 ? <em>best {weightLabel(f.denRecord)}</em> : null}
                                    </span>
                                </div>
                            );
                        })}
                        {!mine.length ? <p className="muted" style={{ padding: 12 }}>Nothing landed yet — your first catch starts this board.</p> : null}
                    </div>
                </>
            ) : (
                <>
                <p className="fish-log-progress">The Den&apos;s heaviest of each species — unclaimed ones are yours for the taking</p>
                <div className="fish-log-grid">
                    {perSpecies.map((r) => (
                        <div key={r.id} className={`fish-log-row${r.record ? "" : " is-unknown"}`}>
                            <FishArt id={r.id} emoji={r.emoji} size={34} className="fish-log-art" />
                            <span className="fish-log-name">{r.name}<em>{r.who ? `@${r.alias}` : "unclaimed"}</em></span>
                            <span className="fish-log-best">
                                {r.record ? <strong>{weightLabel(r.record)}</strong> : <em>be the first</em>}
                            </span>
                        </div>
                    ))}
                    {!perSpecies.length ? <p className="muted" style={{ padding: 12 }}>Nobody has landed anything yet. The board is yours for the taking.</p> : null}
                </div>
                </>
            )}
            {/* No close button on the dedicated page — there's nothing to close, it IS the screen. */}
            {onClose ? <button type="button" className="fish-close" onClick={onClose}>Back to the rail</button> : null}
        </div>
    );
}

// ── THE SCENE ────────────────────────────────────────────────────────────────────────────────────────────────
// `fishing` is the server's fishing view. `onCast`/`onLand` post to the sailing endpoint and resolve with the
// server's reply; the parent owns the state refresh.
// RARITY_COLOR already lives at the top of this file — the fish log uses it.
// Shared, so a stat added to STAT_META shows up here without anyone remembering to come back.
import { describeStats } from "@/lib/marketplace/items.js";
const statLine = (stats) => describeStats(stats);


// ── THE BAIT STEP, WHEREVER YOU ARE ──────────────────────────────────────────────────────────────────────────
// Its own component because it is needed in two places now: before the first cast, and on the recap after a
// catch. It used to live inline in the idle screen only, which is what forced "cast again" to bounce you out
// of the recap and onto another screen to choose — a modal that said Cast again, opening a modal that said
// Cast the line. Choosing bait and throwing again both belong on the card you are already looking at.
//
// It owns its own scroll state. Sitting in the parent, the measurement was shared between the two mount
// points and the fade told the recap about the idle screen's list.
function BaitPicker({ baits, cookable = [], busy, onCast, onMakeBait }) {
    const listRef = useRef(null);
    const [more, setMore] = useState(false);
    const measure = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    }, []);
    useEffect(() => { measure(); }, [baits.length, measure]);
    return (
        <div className="fish-bait" role="dialog" aria-label="Choose a bait">
            <p className="fish-bait-head">
                What are you putting on the hook?
                {baits.length > 1 ? <span className="fish-bait-count">{baits.length} to choose from</span> : null}
            </p>
            <div className="fish-bait-scroll" data-more={more ? "1" : undefined}>
                <div className="fish-bait-list" ref={listRef} onScroll={measure}>
                    {baits.map((b) => (
                        <button key={b.id} type="button" className={`fish-bait-row is-${b.rarity}`}
                            disabled={busy} onClick={() => onCast(b.id)}>
                            {b.sprite
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={b.sprite} alt="" className="fish-bait-art" draggable="false" />
                                : <span className="fish-bait-art" aria-hidden="true">🪱</span>}
                            <span className="fish-bait-name">
                                <b>{b.name}</b>
                                <em>{b.blurb}</em>
                            </span>
                            <span className="fish-bait-num">
                                <b>+{b.tilt.toFixed(1)}</b>
                                <em>rarity · {b.qty} left</em>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
            {/* ── MAKE IT HERE ────────────────────────────────────────────────────────────────────────────
                An empty bait box and a pantry full of what bait is made of meant a trip to the Kitchen and
                back, and by then you have lost the thread of what you came to do. These are only the recipes
                you KNOW and can afford right now, with the number your shelf could actually pay for — so the
                button never promises bait it cannot make. */}
            {cookable.some((c) => c.max > 0) ? (
                <div className="fish-make">
                    <p className="fish-make-head">Out of what you want? Make it here.</p>
                    {cookable.filter((c) => c.max > 0).map((c) => (
                        <button key={c.id} type="button" className="fish-make-row" disabled={busy}
                            onClick={() => onMakeBait?.(c.id)}>
                            {c.makes.sprite
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={c.makes.sprite} alt="" className="fish-make-art" draggable="false" />
                                : <span className="fish-make-art" aria-hidden="true">🪱</span>}
                            <span className="fish-make-name"><b>{c.makes.name}</b><em>{c.name}</em></span>
                            <span className="fish-make-num">enough for {c.max}</span>
                        </button>
                    ))}
                </div>
            ) : null}
            <button type="button" className="fish-ghost" disabled={busy} onClick={() => onCast(null)}>
                Skip baiting — cast the bare hook
            </button>
        </div>
    );
}

// The rise animation's length (see .fw-haul / @keyframes fwRise). One number, so the hand-off to a fight and
// the picture clearing the water cannot drift apart.
// The haul entries that get a CARD rather than a chip — the ones worth looking up for. `gear` is in the set so
// it is kept OUT of the chip row, but it is drawn by its own richer card further down (rarity frame, slot and
// stat line), so the generic prize card skips it rather than drawing it twice.
const BIG_HAUL = new Set(["gear", "chest", "recipe", "pet"]);
const PRIZE_LABEL = { chest: "Dragged off the bottom", recipe: "A sealed bottle", pet: "It followed you home" };

const HAUL_MS = 1150;
// How long the water hints before the float goes down. Long enough to look up, short enough that it is a
// tell rather than a countdown.
const TELL_MS = 1400;



export default function FishingScene({ fishing, sky, boat = null, deck = 30, hero = null, records, gold = 0, onCast, onLand, onRecharge, onLoadRecords, onClose, onMonster = null, onRefresh = null }) {
    const sfx = useSfx();
    const [phase, setPhase] = useState("idle");   // idle | waiting | bite | reel | result | gone | log
    const [fight, setFight] = useState("common"); // the fight profile of what is on the line (rarity only)
    const [baitRarity, setBaitRarity] = useState(null); // and what is holding it there
    const [result, setResult] = useState(null);
    // What is currently breaking the surface, for FishingWater to draw. Set the moment the land call answers,
    // so the rise animation is already showing the real thing rather than a silhouette.
    const [haul, setHaul] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const biteTimer = useRef(null);
    const graceTimer = useRef(null);
    const tellTimer = useRef(null);
    const castRef = useRef(null);

    const casts = fishing?.casts || { left: 0, max: 0, used: 0 };

    const clearTimers = useCallback(() => {
        if (biteTimer.current) { clearTimeout(biteTimer.current); biteTimer.current = null; }
        if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
        // The tell rides with the other two — a leaked one would drop the scene back to "something's
        // circling" after the fish was already on the deck.
        if (tellTimer.current) { clearTimeout(tellTimer.current); tellTimer.current = null; }
    }, []);
    useEffect(() => clearTimers, [clearTimers]);

    // Report a miss so the server refunds the cast, then show the "it got away" beat.
    const reportMiss = useCallback(async () => {
        clearTimers();
        setPhase("gone");
        sfx.gone();
        await onLand({ quality: 0, missed: true, sky }).catch(() => {});
    }, [clearTimers, onLand, sfx, sky]);

    // The recharge offer, if the day's free casts are spent and another can still be bought.
    const rc = fishing?.recharge || {};
    const buyable = Boolean(rc.available);
    const canAfford = Number(gold || 0) >= Number(rc.cost || 0);
    const buyCast = useCallback(async () => {
        if (busy || !canAfford) return;
        setBusy(true);
        try { await onRecharge?.(); } finally { setBusy(false); }
    }, [busy, canAfford, onRecharge]);

    // ── BAIT FIRST, THEN THE WATER ───────────────────────────────────────────────────────────────────────
    // Luke: "when you decide you wanna fish, you first select a bait if you have one, or you say skip
    // baiting, and then it goes on to the actual fishing minigame."
    //
    // The picker is a STEP, not a setting — it opens on the tap that would have cast, and closes into the
    // cast. Nothing is remembered between casts: a bait is SPENT, so a silent default would burn your best
    // one on a cast you never thought about.
    const [picking, setPicking] = useState(false);
    const baits = Array.isArray(fishing?.baits) ? fishing.baits : [];
    // GAFF, which now widens your bar in the fight. `valueNow` is the resolved fraction (0..0.25), so the
    // cap is honoured for free and the component never has to know the track's levelling maths.
    const gaffValue = (Array.isArray(fishing?.tracks) ? fishing.tracks : [])
        .find((t) => t.id === "gaff")?.valueNow || 0;
    // What the pantry could turn into bait right now — see cookableNow. Empty for anybody who knows no bait
    // recipes, which removes the whole block rather than showing an empty one.
    const baitCookable = Array.isArray(fishing?.baitCookable) ? fishing.baitCookable : [];
    const [making, setMaking] = useState(false);
    // Cooked through the KITCHEN's own endpoint, not a second copy of cooking here: quality 1 because a bait
    // has no reward ladder to roll and is one press in the Kitchen too. onLoot refreshes the shelf, so the
    // new bait appears in the list above without a reload.
    const makeBait = useCallback(async (recipeId) => {
        if (making) return;
        setMaking(true);
        try {
            const r = await fetch("/api/marketplace/cooking", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "cook", recipe: recipeId, quality: 1, chain: 0 }),
            }).catch(() => null);
            if (r?.ok) { await onRefresh?.(); window.dispatchEvent(new Event("wolfden-hud-refresh")); }
        } finally { setMaking(false); }
    }, [making, onRefresh]);

    // ── THE LIST HAS TO LOOK UNFINISHED WHEN IT IS ───────────────────────────────────────────────────────
    // The box holds about five rows and there are twenty baits in the game. The cut falls neatly BETWEEN
    // rows, so a full box looks like a complete list of five — and the only thing saying otherwise is a
    // hairline scrollbar that a phone hides entirely until you are already scrolling. You cannot pick the
    // bait you cannot see.
    //
    // So the wrapper carries `data-more`, and the fade below it only exists while there is something under
    // the fold. Measured rather than assumed (`baits.length > 5` would be a magic number that has to be kept
    // in step with a max-height in a different file), and re-measured on scroll so it clears at the bottom.

    const cast = useCallback(async (bait = null) => {
        if (busy) return;
        setPicking(false);
        setBusy(true); setErr(null); setResult(null); setHaul(null);
        const res = await onCast({ sky, bait }).catch(() => null);
        setBusy(false);
        if (!res?.ok) {
            // Back to idle on a refusal. `cast` can now be pressed FROM the recap, and the recap draws itself
            // from `result` — which this call has already cleared, so leaving the phase alone would render a
            // catch card with no catch in it.
            setPhase("idle");
            setErr(res?.error === "out_of_casts" ? "You're out of casts for today — they refill tomorrow."
                : res?.error === "already_cast" ? "Your line is already in the water."
                : res?.error === "not_at_sea" ? "You can't fish while you're ashore digging."
                : "The line wouldn't go out. Try again.");
            return;
        }
        // Remember the line WE just put out, so the resume-a-cast effect below doesn't also arm a bite timer for
        // it. Two timers would fire two bite phases and leak a grace timer that could report a miss after the
        // fish was already landed.
        castRef.current = Number(res.cast?.biteAt) || 0;
        // How hard this one fights. Rarity only — never the species, which stays hidden until it surfaces.
        setFight(res.cast?.fight || "common");
        // WHAT WENT ON THE HOOK. startCast reports the bait it actually spent, and its rarity decides how
        // cleanly the fish is held — see BAIT_HOLD. A bare hook is `null`, which reads as crude.
        setBaitRarity(res.bait?.rarity || null);
        setPhase("waiting");
        sfx.plop();
        const wait = Math.max(200, Number(res.cast?.biteAt || 0) - Date.now());
        // The water says so first. TELL_MS before the bite a shadow crosses under the float and the float
        // nudges — cosmetic only, the bite window and the tap are unchanged, but it turns "wait, then react to
        // a colour" into something you can actually watch for. Clamped so a very short wait still gets one.
        tellTimer.current = setTimeout(() => setPhase("tell"), Math.max(120, wait - TELL_MS));
        biteTimer.current = setTimeout(() => {
            setPhase("bite");
            sfx.bite();
            // The bite is the one moment that demands a reaction — make it felt, not just heard.
            try { navigator.vibrate?.([0, 45, 35, 45]); } catch { /* no haptics here */ }
            // A long, generous tap window — and missing it costs nothing but the wait.
            graceTimer.current = setTimeout(reportMiss, BITE_HOLD_MS);
        }, wait);
    }, [busy, onCast, reportMiss, sfx, sky]);

    // ── "CAST AGAIN" HAS TO CAST ─────────────────────────────────────────────────────────────────────────
    // It did not. Every exit from a catch — landed a fish, hauled treasure, or it got away — ran
    // `setPhase("idle")` and stopped there, which drops you on the idle screen with the line still in the
    // boat. The button said "Cast again", so you pressed it, nothing went in the water, and you pressed Cast
    // the line underneath it. Two taps for one cast, every single time, on the loop people repeat most.
    //
    // It casts now, and it makes the same decision the idle button makes: with bait in the pantry it opens the
    // picker (a bait is spent, so it must never be chosen for you), and with an empty pantry it just throws.
    const castAgain = useCallback(() => {
        // With bait, the picker opens ON the recap — you are already looking at the card, and the bait choice
        // and the throw both belong here. Without any, there is nothing to choose, so it just throws.
        // `cast` clears the recap and moves the scene on by itself, so nothing needs resetting first.
        if (baits.length) { setPicking(true); return; }
        cast(null);
    }, [baits.length, cast]);

    // ── THE TAP HOOKS IT. THEN YOU FIGHT IT. ─────────────────────────────────────────────────────────────
    // WAS: the tap went straight to the haul and reported a FIXED quality of 0.78. The server has always read
    // that number — it floors the size roll and can bump a treasure tier — so with the reel gone we were
    // sending a grade for a performance that never happened. Every cast was landed exactly as well as every
    // other one, which is the definition of a stat that should not exist.
    //
    // Now the tap does what a tap should: it sets the hook. The reel decides how well you bring it in, and the
    // number that reaches the server is one you earned. `fight` is already on hand from the cast, so a mythic
    // thrashes and a sardine drifts without the client ever being told what species is down there.
    const strike = useCallback(() => {
        if (phase !== "bite") return;
        clearTimers();
        sfx.bite();
        setPhase("reel");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, clearTimers, sfx]);

    // The reel ran out. Whatever you managed is the quality, and from here the haul is exactly what it was.
    // `finishReel` is a const declared BELOW this one, so it must not appear in the dep array: the array is
    // evaluated at render, and reading it there is a temporal-dead-zone crash. Calling it from inside the body
    // is fine — by then it exists. This is why `strike` above carries the same disable.
    const reelDone = useCallback((score) => {
        setPhase("hauling");
        finishReel(score);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const finishReel = useCallback(async (quality) => {
        setBusy(true);
        try {
            const big = ["legendary", "mythic"].includes(fight);
            navigator.vibrate?.(big ? [30, 50, 30, 50, 90] : [25, 40, 60]);
        } catch { /* no haptics here */ }
        const res = await onLand({ quality, sky }).catch(() => null);
        setBusy(false);
        // ── SOMETHING CAME UP FIGHTING ───────────────────────────────────────────────────────────────
        // It surfaces like anything else — you watch it clear the water and see WHAT it is — and only then
        // does the fight open. Handing straight to the bout would cover the one frame the whole rework is
        // for. HAUL_MS matches the rise keyframe in globals.css.
        if (res?.ok && res.monster) {
            setHaul({ art: res.monster.art, name: res.monster.name, kind: "monster", tier: res.monster.tier,
                scale: haulScale({ kind: "monster", tier: res.monster.tier }) });
            sfx.bite();
            // ── AND THEN THE SCENE HAS TO LET GO OF IT ───────────────────────────────────────────────
            // This handed off to the fight and returned, leaving the scene parked on `hauling` forever. The
            // fish path below moves itself on (`setPhase("result")`); this one never moved at all. Nothing
            // was visibly wrong while the fight covered it — but a fight ENDS, the overlay closes, and what
            // was underneath the whole time is a frozen "Hauling it in…" with the monster still up and no
            // way forward but the X. aannw hit it the moment she came back from a battle.
            //
            // The cast is finished at this point either way, so the scene goes back to the water. Coming out
            // of the fight lands on the cast screen with the right number of casts left, which is where you
            // were going anyway.
            setTimeout(async () => {
                const opened = await onMonster?.(res.monster);
                setHaul(null);
                setPhase("idle");
                // A refusal is not silence. If the fight could not be opened the cast is still spent, and
                // saying so is the difference between a bug and a bad roll.
                if (opened === false) setErr("It shook the hook before you could get it aboard — that cast is spent.");
            }, HAUL_MS);
            return;
        }
        if (res?.ok && res.landed) {
            // ── EVERYTHING SURFACES, INCLUDING THE TREASURE ──────────────────────────────────────────
            // A chest used to skip the water entirely and appear on a card, which made the one haul with the
            // best art in it the only one you never watched come up. Both paths feed the same rise now: a
            // treasure haul draws its prize's own sprite (`prize.spriteUrl`, already on every treasure the
            // table can produce) and a fish draws its species plate, which is resolved from the id here the
            // same way the reveal card resolves it.
            const landedNow = res.catchResult || res;
            const h = landedNow.treasure
                ? { art: landedNow.prize?.spriteUrl || "/images/sailing/dig-chest.png", name: landedNow.prize?.label || "Treasure", kind: "treasure" }
                : { art: landedNow.fish?.id ? `/images/fish/${landedNow.fish.id}.png` : null, name: landedNow.fish?.name || null, kind: "fish", lb: landedNow.fish?.lb };
            setHaul({ ...h, scale: haulScale(h) });
            // `catchResult`, NOT `res`. fishLand returns the catch spread UNDER the whole sailing state, and
            // that state carries `gold` = the member's total balance — so `res.gold` is your wallet, not the
            // payout. A 12-gold Tiger Prawn proudly reported "+1879 🪙". XP looked fine only because the
            // sailing state has no `xp` key to overwrite. catchResult is the untouched landFish result.
            const landed = res.catchResult || res;
            setResult(landed);
            // Let it finish clearing the water before the card covers it — the surfacing IS the reward beat.
            setTimeout(() => setPhase("result"), HAUL_MS);
            // A bigger fish gets a bigger noise — the flat four-note arpeggio played identically for a
            // sardine and a kraken, which flattened the one moment worth celebrating.
            const grand = landed.denRecord || landed.firstEver
                || ["legendary", "mythic"].includes(landed.fish?.rarity || landed.tier);
            sfx.land();
            if (grand) { setTimeout(() => sfx.land(), 300); setTimeout(() => sfx.bite(), 620); }
        } else if (res?.ok) {
            setHaul(null);
            setPhase("gone");
            sfx.gone();
        } else {
            setErr("Something went wrong bringing it in.");
            setPhase("idle");
        }
    }, [onLand, sfx, sky]);

    const openLog = useCallback(() => { setPhase("log"); if (onLoadRecords) onLoadRecords(); }, [onLoadRecords]);

    // If the page reloaded with a line still in the water, pick it up where it left off rather than stranding it.
    useEffect(() => {
        const hooked = fishing?.hooked;
        if (!hooked || phase !== "idle") return;
        if (Number(hooked.biteAt) === castRef.current) return; // this is the line we just cast — already armed
        clearTimers();
        const untilBite = Number(hooked.biteAt) - Date.now();
        if (untilBite > 0) {
            setPhase("waiting");
            tellTimer.current = setTimeout(() => setPhase("tell"), Math.max(120, untilBite - TELL_MS));
            biteTimer.current = setTimeout(() => { setPhase("bite"); sfx.bite(); graceTimer.current = setTimeout(reportMiss, BITE_HOLD_MS); }, untilBite);
        } else if (Date.now() - Number(hooked.biteAt) < Number(hooked.graceMs || 12000)) {
            setPhase("bite");
            graceTimer.current = setTimeout(reportMiss, BITE_HOLD_MS);
        } else {
            reportMiss();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fishing?.hooked]);

    const body = (
        <div className="fish-wrap" role="dialog" aria-modal="true" aria-label="Fishing">
            <div className="fish-sea" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => <span key={i} className="fish-ripple" style={{ left: `${8 + i * 13}%`, animationDelay: `${i * 0.7}s` }} />)}
            </div>
            <div className="fish-card">
                <div className="fish-head">
                    <strong>🎣 Fishing</strong>
                    <span className="fish-casts">{casts.left}/{casts.max} casts left today</span>
                    <button type="button" className="fish-x" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {phase === "log" ? (
                    <FishingLog log={fishing?.log} known={fishing?.speciesKnown || 0} total={fishing?.speciesTotal || 0} records={records} onClose={() => setPhase("idle")} />
                ) : phase === "idle" ? (
                    <div className="fish-stage">
                        {/* ── THE BOAT IS ON SCREEN BEFORE YOU CAST ───────────────────────────────────────
                            This was a 🎣 emoji the size of a thumbnail. The scene it replaces is the whole
                            point of the feature and it was being hidden until after you pressed the button —
                            so the screen you decide to fish FROM was the least interesting one in the loop.
                            Same component, at rest: your hull, your hero, no line in the water yet. */}
                        <FishingWater phase="idle" sky={sky} boat={boat} deck={deck} hero={hero} haul={null} />
                        {/* WAS: "tap — then hold to reel and keep the fish in the green. A good reel lands a
                            bigger fish." Every word of that described the reel minigame, which is deleted.
                            Stale copy for a mechanic that no longer exists is the exact thing the Trade-Wind
                            Schooner was reported for. */}
                        <p className="fish-copy">
                            Drop a line over the rail and watch the float. Something will circle it, then take
                            it under — <strong>tap</strong> the moment it does. Whatever is on the end comes up
                            beside the boat, and not all of it is a fish.
                        </p>
                        {/* ── THE BAIT STEP ── every row states what it buys, and the number comes off the
                            bait itself, so the picker cannot advertise a boost the cast does not apply. */}
                        {picking ? <BaitPicker baits={baits} cookable={baitCookable} busy={busy} onCast={cast} onMakeBait={makeBait} /> : null}
                        {err ? <p className="fish-err">{err}</p> : null}
                        <div className="fish-actions">
                            {/* ONE button. Running out of casts doesn't hand you a dead control and hide the
                                way forward somewhere else on another screen — the same button you've been
                                tapping simply changes what it offers, the way the raid and tailwind buttons do.
                                Only when there's genuinely nothing left to offer does it disable. */}
                            {/* ── WHY THERE IS NO BAIT PICKER ─────────────────────────────────────────────
                                With an empty bait box the picker simply does not appear, so the step is
                                invisible and there is nothing anywhere saying it exists or where bait comes
                                from. Luke hit exactly this on his own feature: "there was no bait select, is
                                this because I have no bait?" One line, only when the box is empty. */}
                            {!baits.length && casts.left > 0 ? (
                                <p className="fish-nobait">
                                    No bait in the pantry — you can still cast a bare hook. Bait is <b>cooked</b>:
                                    the Kitchen has four you already know how to make, and each one tilts the water
                                    toward something rarer.
                                </p>
                            ) : null}
                            {casts.left > 0 || !buyable ? (
                                <button type="button" className="fish-cta" disabled={busy || casts.left <= 0}
                                    onClick={() => (baits.length ? setPicking(true) : cast(null))}>
                                    {casts.left <= 0 ? "Out of casts today" : busy ? "Casting…" : baits.length ? "Bait up 🎣" : "Cast the line 🎣"}
                                </button>
                            ) : (
                                <button type="button" className="fish-cta is-buy" disabled={busy || !canAfford} onClick={buyCast}>
                                    {busy ? "…" : <>Buy another cast 🎣 <span className="fish-cta-cost">🪙 {rc.cost.toLocaleString()}{canAfford ? "" : " · not enough"}</span></>}
                                </button>
                            )}
                            <button type="button" className="fish-ghost" onClick={openLog}>
                                📖 Log · {fishing?.speciesKnown || 0}/{fishing?.speciesTotal || 0}
                            </button>
                        </div>
                        {fishing?.totalCaught ? <p className="muted fish-tally">{fishing.totalCaught} fish landed all-time</p> : null}
                    </div>
                ) : phase === "waiting" || phase === "tell" || phase === "bite" || phase === "reel" || phase === "hauling" ? (
                    /* ── ONE SCENE, START TO FINISH ──────────────────────────────────────────────────────
                       Was: a text line saying "waiting for a bite", then a TAP button, then a hold-to-reel
                       bar on a black panel that replaced everything.
                       Now the whole cast happens in one frame you watch: your boat, your hero on the deck, a
                       bobber that dips, the reel fought against the water it is happening in, and whatever is
                       on the end rising out of it. The reel came back INSIDE this, not on top of it — the
                       scene is the part that works. */
                    <FishingWater
                        phase={phase}
                        sky={sky}
                        boat={boat}
                        deck={deck}
                        hero={hero}
                        haul={haul}
                        busy={busy}
                        onStrike={phase === "bite" ? strike : undefined}
                    >
                        {phase === "reel" ? <ReelStruggle onDone={reelDone} sfx={sfx} fight={fight} gaff={gaffValue} baitRarity={baitRarity} /> : null}
                    </FishingWater>
                ) : phase === "gone" ? (
                    <div className="fish-stage">
                        {/* The miss gets the water too — an empty float back on the surface says "it got away"
                            in the same language the rest of the loop is written in. It was a 💨 emoji. */}
                        <FishingWater phase="idle" sky={sky} boat={boat} deck={deck} hero={hero} haul={null} />
                        <p className="fish-copy">It stole your bait and slipped away.</p>
                        <p className="muted">Your cast came back — no harm done.</p>
                        <div className="fish-actions">
                            <button type="button" className="fish-cta" onClick={castAgain}>Try again 🎣</button>
                        </div>
                    </div>
                ) : result?.treasure ? (
                    // One cast in five surfaces treasure instead of a fish — its own moment, not a footnote.
                    <div className="fish-stage fish-result">
                        <div className="fish-banner is-new">🧭 TREASURE!</div>
                        <div className={`fish-reveal is-pop rarity-${result.tier || "common"}`}>
                            <span className="fish-rays" aria-hidden="true" />
                            <span className="fish-burst" aria-hidden="true" />
                            {["legendary", "mythic"].includes(result.tier) ? (
                                <span className="fish-sparks" aria-hidden="true">
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <i key={i} style={{ "--a": `${i * 36}deg`, "--d": `${0.05 + (i % 5) * 0.045}s` }} />
                                    ))}
                                </span>
                            ) : null}
                            {/* The real art when we have it. This is the payoff moment of the feature, and a treasure haul used to
                                land here as a bare emoji while a fish got its illustrated sprite — so half the reward
                                table looked like a placeholder. Fragments keep the emoji: they're a currency, not a thing. */}
                            {result.prize?.spriteUrl ? (
                                <span className="fish-reveal-wrap">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="fish-reveal-art" src={result.prize.spriteUrl} alt={result.prize.label || ""} />
                                    {result.prize.n > 1 ? <span className="fish-reveal-count">×{result.prize.n}</span> : null}
                                </span>
                            ) : (
                                // 🧰 used to be the fallback here, and when a haul paid nothing it rendered a
                                // toolbox labelled "Something". Members asked each other for days what the
                                // "tool box looking things" were — they were our placeholder for empty. A
                                // treasure chest is what an unknown haul should look like.
                                <span className="fish-reveal-art" style={{ fontSize: 96 }} aria-hidden="true">{result.prize?.emoji || "🗝️"}</span>
                            )}
                        </div>
                        {/* Coloured by the PRIZE too. Tinting the name with the cast's rarity is the same claim
                            the label made, only quieter — a Growth Tonic printed in mythic pink still says
                            mythic. Neutral when the prize has no rarity of its own. */}
                        <div className="fish-name" style={{ color: RARITY_COLOR[result.prize?.rarity] || "#cfd8e3" }}>{result.prize?.label || "Something"}</div>
                        {/* THE PRIZE'S RARITY, NOT THE CAST'S. This printed RARITY_LABEL[result.tier] — how good
                            the CAST was — directly under the prize's name, which reads as a claim about the
                            prize. A mythic cast paying a 600-gold Growth Tonic announced "Growth Tonic /
                            MYTHIC". GrayKitsune: "How is Growth Tonic a Mythic?" Gear and pets carry a real
                            rarity and it is shown; a consumable, a recipe, doubloons and fragments do not have
                            one, so nothing is claimed about them. */}
                        {result.prize?.rarity ? (
                            <div className="fish-rarity" style={{ color: RARITY_COLOR[result.prize.rarity] || "#cfd8e3" }}>{RARITY_LABEL[result.prize.rarity] || "Common"}</div>
                        ) : null}
                        <p className="fish-copy">You hauled it up off the sea floor — no fish this time.</p>
                        {/* Fishing pays into four other screens. Saying which one turns a reward the member
                            can't find into one they can go and use. */}
                        {result.prize?.where ? <p className="fish-where">📍 {result.prize.where}</p> : null}
                        {/* THE NEXT CAST HAPPENS HERE. Pressing "cast again" used to close this card and open
                            another one that also said cast — a modal advertising a throw, opening a modal
                            advertising a throw. With bait in the pantry the picker opens right on the recap
                            instead, so choosing what goes on the hook and throwing it are one screen and one
                            decision, on the card you are already reading. */}
                        {picking ? <BaitPicker baits={baits} cookable={baitCookable} busy={busy} onCast={cast} onMakeBait={makeBait} /> : null}
                        <div className="fish-actions">
                            {picking ? null : (
                            <button
                                type="button"
                                className={`fish-cta${casts.left <= 0 && buyable ? " is-buy" : ""}`}
                                disabled={busy || (casts.left <= 0 && !(buyable && canAfford))}
                                onClick={async () => {
                                    // Out of casts: buy one right here rather than sending them back to find a
                                    // different button. Then actually cast, which is what the button says.
                                    if (casts.left <= 0 && buyable) { await buyCast(); setResult(null); setPhase("idle"); return; }
                                    castAgain();
                                }}
                            >
                                {casts.left > 0 ? (baits.length ? "Cast again 🎣 · pick a bait" : "Cast again 🎣")
                                    : buyable ? `Buy another cast 🎣 · 🪙 ${rc.cost.toLocaleString()}${canAfford ? "" : " · not enough"}`
                                    : "That's your last cast today"}
                            </button>
                            )}
                            <button type="button" className="fish-ghost" onClick={openLog}>📖 Fishing Log</button>
                        </div>
                    </div>
                ) : result ? (
                    <div className="fish-stage fish-result">
                        {result.denRecord ? <div className="fish-banner is-den">🥇 BIGGEST IN THE DEN!</div>
                            : result.firstEver ? <div className="fish-banner is-new">✨ NEW SPECIES!</div>
                                : result.personalBest ? <div className="fish-banner">📈 PERSONAL BEST!</div> : null}
                        {/* THE REVEAL. The sprite used to just appear — the biggest moment in the feature
                            arriving with no ceremony at all. Rays, a burst ring and sparks, all tinted to the
                            rarity, so a mythic feels different from a sardine without reading a word. */}
                        <div className={`fish-reveal is-pop rarity-${result.fish.rarity}`}>
                            <span className="fish-rays" aria-hidden="true" />
                            <span className="fish-burst" aria-hidden="true" />
                            {["legendary", "mythic"].includes(result.fish.rarity) || result.denRecord || result.firstEver ? (
                                <span className="fish-sparks" aria-hidden="true">
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <i key={i} style={{ "--a": `${i * 36}deg`, "--d": `${0.05 + (i % 5) * 0.045}s` }} />
                                    ))}
                                </span>
                            ) : null}
                            <FishArt id={result.fish.id} emoji={result.fish.emoji} size={140} className="fish-reveal-art" />
                        </div>
                        <div className="fish-name" style={{ color: RARITY_COLOR[result.fish.rarity] }}>{result.fish.name}</div>
                        <div className="fish-rarity" style={{ color: RARITY_COLOR[result.fish.rarity] }}>{RARITY_LABEL[result.fish.rarity]}</div>
                        <div className="fish-size">{weightLabel(result.fish.lb)}</div>
                        {/* No "% of max" and no "species max". There is no maximum any more (weightFor rolls
                            an open-ended trophy tail), and a percentage-toward-a-ceiling reads as "nearly
                            done — no point trying again", which is the opposite of what a record board is for.
                            The comparisons that survive are the two that can always be beaten. */}
                        {result.beatsRange ? <div className="fish-trophy-flag">🏆 BIGGER THAN ANY ON RECORD FOR ITS KIND</div> : null}
                        <div className="fish-compare">
                            <div className={`fish-compare-cell${result.personalBest ? " is-beat" : ""}`}>
                                <em>your best</em>
                                <b>{weightLabel(result.personalBest ? result.fish.lb : (result.previousBest || result.fish.lb))}</b>
                                {result.personalBest ? <span className="fish-compare-tag">BEATEN</span> : null}
                            </div>
                            <div className={`fish-compare-cell${result.denRecord ? " is-beat" : ""}`}>
                                <em>den record</em>
                                <b>{weightLabel(result.denRecord ? result.fish.lb : (result.denBest || result.fish.lb))}</b>
                                {result.denRecord ? <span className="fish-compare-tag">YOURS</span> : null}
                            </div>
                        </div>
                        <div className="fish-spoils">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <span className="fish-chip gold"><img src="/images/ui/coin.png" alt="" className="fish-chip-ico" />+{result.gold}</span>
                            <span className="fish-chip xp">+{result.xp} XP</span>
                            {/* Chips are for the SMALL stuff — coin, xp, a handful of doubloons, a supply.
                                Anything worth a reaction is pulled out into a card below. */}
                            {(result.extras || []).filter((e) => !BIG_HAUL.has(e.kind)).map((e, i) => (
                                <span key={i} className="fish-chip extra">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {e.spriteUrl ? <img src={e.spriteUrl} alt="" className="fish-chip-ico" /> : null}
                                    {e.label}
                                </span>
                            ))}
                        </div>

                        {/* ── THE THINGS WORTH A REACTION ──────────────────────────────────────────────────
                            A chest, a recipe or a pet came up as a text pill the same size as "+15 gold" —
                            the three outcomes anybody would actually tell somebody about, rendered as a
                            footnote next to the coin. Gear already had a real card; these get the same. */}
                        {(result.extras || []).filter((e) => BIG_HAUL.has(e.kind) && e.kind !== "gear").map((e, i) => (
                            <div key={`p${i}`} className={`fish-prize is-${e.kind}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {e.spriteUrl ? <img src={e.spriteUrl} alt="" className="fish-prize-art" />
                                    : <span className="fish-prize-art" aria-hidden="true">{e.emoji || "🎁"}</span>}
                                <span className="fish-prize-copy">
                                    <em>{PRIZE_LABEL[e.kind] || "Hauled up"}</em>
                                    <b>{e.label}</b>
                                    {e.where ? <span>{e.where}</span> : null}
                                </span>
                            </div>
                        ))}

                        {/* GEAR, IN FULL. A piece of gear off the sea floor was a purple text pill the same size
                            as "+5 gold" — the one thing in the haul you might actually equip, rendered as a
                            footnote. Same treatment as a chest opening or a seam: real art, rarity frame, slot
                            and the stat line. */}
                        {(result.extras || []).filter((e) => e.kind === "gear").map((e, i) => (
                            <div key={`g${i}`} className="fish-gear" style={{ "--rar": RARITY_COLOR[e.rarity] || "#cdd3d8" }}>
                                <span className="fish-gear-lab">Off the sea floor</span>
                                <ItemArt id={e.id} icon={e.icon} className="fish-gear-art" alt="" />
                                <i className="fish-gear-tag">{(e.rarity || "").toUpperCase()}</i>
                                <b className="fish-gear-name" style={{ color: RARITY_COLOR[e.rarity] || "#e7dcc8" }}>{e.label}</b>
                                {e.slot ? <i className="fish-gear-slot">{String(e.slot).replace("_", " ")}</i> : null}
                                {e.stats ? <i className="fish-gear-stats">{statLine(e.stats)}</i> : null}
                            </div>
                        ))}
                        {/* THE NEXT CAST HAPPENS HERE. Pressing "cast again" used to close this card and open
                            another one that also said cast — a modal advertising a throw, opening a modal
                            advertising a throw. With bait in the pantry the picker opens right on the recap
                            instead, so choosing what goes on the hook and throwing it are one screen and one
                            decision, on the card you are already reading. */}
                        {picking ? <BaitPicker baits={baits} cookable={baitCookable} busy={busy} onCast={cast} onMakeBait={makeBait} /> : null}
                        <div className="fish-actions">
                            {picking ? null : (
                            <button
                                type="button"
                                className={`fish-cta${casts.left <= 0 && buyable ? " is-buy" : ""}`}
                                disabled={busy || (casts.left <= 0 && !(buyable && canAfford))}
                                onClick={async () => {
                                    // Out of casts: buy one right here rather than sending them back to find a
                                    // different button. Then actually cast, which is what the button says.
                                    if (casts.left <= 0 && buyable) { await buyCast(); setResult(null); setPhase("idle"); return; }
                                    castAgain();
                                }}
                            >
                                {casts.left > 0 ? (baits.length ? "Cast again 🎣 · pick a bait" : "Cast again 🎣")
                                    : buyable ? `Buy another cast 🎣 · 🪙 ${rc.cost.toLocaleString()}${canAfford ? "" : " · not enough"}`
                                    : "That's your last cast today"}
                            </button>
                            )}
                            <button type="button" className="fish-ghost" onClick={openLog}>📖 Fishing Log</button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(body, document.body);
}
