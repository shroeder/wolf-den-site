"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── FISHING ──────────────────────────────────────────────────────────────────────────────────────────────────
// Three beats, about fifteen seconds:
//
//   CAST   tap once. The server has already decided what's down there.
//   BITE   the line twitches at a moment you can't predict. Tap again.
//   REEL   the fish swims up and down on its own. HOLD to raise YOUR BAR, release and it falls. Keep the fish
//          inside the bar. Time-in-bar IS the score, and the score decides how BIG the fish is.
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
const BAND_H = 0.26;             // height of the safe band, as a fraction of the rod
const GRAVITY = 0.62;            // the fish sinking, per second²
const REEL_PULL = 1.35;          // upward acceleration while you're holding
const DAMPING = 0.86;            // velocity bleed so it feels weighty rather than twitchy
const DART_EVERY_MS = 900;       // the fish makes a run for it this often
const REEL_WARMUP_MS = 700;      // grace before scoring starts — see the note at the scoring site

// ── LINE TENSION ─────────────────────────────────────────────────────────────────────────────────────────────
// The second axis, and the thing that turns this from motor control into a decision you keep making.
//
// Before this, "hold" was free: the optimal play was to hold whenever the fish was below the band and release
// whenever it was above, forever, with no cost either way. One input, one rule, learned in three casts.
//
// Now holding builds TENSION. Let it redline and the line doesn't snap — nothing is punished here, that rule
// stands — but it goes SLACK for a moment: your pull cuts out and the fish sinks while you recover. So the
// question stops being "up or down" and becomes "can I afford to keep pulling", which is a different question
// every second because it depends on how much rope you've already spent.
//
// A fish that FIGHTS (see FIGHT below) loads tension faster, so the heavy ones genuinely feel heavy.
const TENSION_RISE = 0.62;       // per second while holding, × the fish's fight
const TENSION_FALL = 0.85;       // per second while you're not
const SLACK_MS = 850;            // how long the line stays useless after a redline

// How hard a thing fights, by how rare it is. The client is told a FIGHT PROFILE, never the species — knowing
// a Kraken is on the line before it surfaces would give the reveal away — but it can feel the difference,
// which is the point: a monster should fight like one.
const FIGHT = {
    common: { pull: 0.85, dart: 1.0, tension: 0.75 },
    rare: { pull: 1.0, dart: 1.15, tension: 0.95 },
    epic: { pull: 1.2, dart: 1.4, tension: 1.2 },
    legendary: { pull: 1.4, dart: 1.7, tension: 1.45 },
    mythic: { pull: 1.7, dart: 2.1, tension: 1.75 },
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

// ── THE REEL STRUGGLE ────────────────────────────────────────────────────────────────────────────────────────
function ReelStruggle({ onDone, sfx, fight = "common" }) {
    const F = FIGHT[fight] || FIGHT.common;
    const [tick, setTick] = useState(0);          // repaint pulse
    const holdRef = useRef(false);
    const posRef = useRef(0.5);                   // THE FISH, 0 (bottom) .. 1 (top). Swims itself.
    const velRef = useRef(0);
    const bandRef = useRef(0.5);                  // YOUR BAR (centre). Hold to raise, release to fall.
    const barVelRef = useRef(0);
    const inRef = useRef(0);                      // frames inside the band
    const totalRef = useRef(0);
    const startRef = useRef(0);
    const lastDartRef = useRef(0);
    const doneRef = useRef(false);
    const clickRef = useRef(0);
    const tensionRef = useRef(0);                 // 0..1 — redlines at 1 and goes slack
    const slackUntilRef = useRef(0);
    const snapRef = useRef(0);                    // repaint key for the slack flash

    useEffect(() => {
        let raf = 0;
        let prev = 0;
        const step = (ts) => {
            if (!startRef.current) { startRef.current = ts; prev = ts; }
            const dt = Math.min(0.05, (ts - prev) / 1000);
            prev = ts;
            const elapsed = ts - startRef.current;

            // THE FISH swims on its own. It wanders toward a target it keeps re-picking, with panicked darts
            // on top — nothing you do moves it. A fish that swims reads as a fish; when the player drove this
            // marker instead, people watched the zone drift past and concluded nothing responded to them.
            const t = elapsed / 1000;
            if (elapsed - lastDartRef.current > DART_EVERY_MS / F.dart) {
                lastDartRef.current = elapsed;
                velRef.current += (Math.random() - 0.5) * 1.5 * F.dart;   // a run, either way
            }
            // A slow wander underneath the darts, so it drifts with intent instead of jittering in place.
            velRef.current += Math.sin(t * 0.9 + 0.7) * 0.55 * dt * F.dart;
            velRef.current *= Math.pow(DAMPING, dt * 60);
            posRef.current += velRef.current * dt;
            if (posRef.current <= 0.04) { posRef.current = 0.04; velRef.current = Math.abs(velRef.current) * 0.5; }
            if (posRef.current >= 0.96) { posRef.current = 0.96; velRef.current = -Math.abs(velRef.current) * 0.5; }

            // TENSION. Holding loads the line; letting go bleeds it off. Redline and the line goes slack for a
            // moment — your bar stops rising and falls — so "keep holding" is a real decision rather than the
            // obvious answer. Nothing is lost, which keeps the no-punishment rule intact.
            const slack = ts < slackUntilRef.current;
            const pulling = holdRef.current && !slack;
            if (pulling) tensionRef.current += TENSION_RISE * F.tension * dt;
            else tensionRef.current -= TENSION_FALL * dt;
            tensionRef.current = Math.max(0, Math.min(1, tensionRef.current));
            if (tensionRef.current >= 1 && !slack) {
                slackUntilRef.current = ts + SLACK_MS;
                tensionRef.current = 0;
                snapRef.current += 1;
                sfx.gone();
                try { navigator.vibrate?.([40, 30, 40]); } catch { /* no haptics here */ }
            }

            // THE BAR is yours: hold to raise it, release and it falls. This is the only thing your thumb
            // touches, and chasing a fish with a capture zone is an idiom players already know.
            barVelRef.current += (pulling ? REEL_PULL : 0) * dt;
            barVelRef.current -= GRAVITY * dt;
            barVelRef.current *= Math.pow(DAMPING, dt * 60);
            bandRef.current += barVelRef.current * dt;
            const half = BAND_H / 2;
            if (bandRef.current <= half) { bandRef.current = half; barVelRef.current = 0; }
            if (bandRef.current >= 1 - half) { bandRef.current = 1 - half; barVelRef.current = 0; }

            // Credit, banked per frame: is the FISH inside YOUR BAR right now.
            // WARM-UP: the first moments are spent finding the fish, and because the score is an average over
            // the WHOLE run, fumbling them used to cap your result permanently with no way to see it happen.
            const scoring = elapsed >= REEL_WARMUP_MS;
            const lo = bandRef.current - half, hi = bandRef.current + half;
            const inside = posRef.current >= lo && posRef.current <= hi;
            if (scoring) {
                totalRef.current += 1;
                if (inside) inRef.current += 1;
            }
            // Reel clicks while you're holding and on target — the audio feedback that tells you it's working.
            if (inside && holdRef.current && ts - clickRef.current > 110) { clickRef.current = ts; sfx.click(); }

            setTick((n) => (n + 1) % 100000);

            if (elapsed >= REEL_MS) {
                if (!doneRef.current) {
                    doneRef.current = true;
                    onDone(scoreOf(inRef.current, totalRef.current));
                }
                return;
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [onDone, sfx]);

    // Capture the pointer on press. The rod is 88px wide and onPointerLeave released the hold, so a thumb
    // drifting a few pixels sideways mid-reel silently let go — you'd be holding and the line would sink for
    // no visible reason. With capture the element keeps receiving events until the finger actually lifts.
    const down = useCallback((e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not supported — leave/up still work */ }
        holdRef.current = true;
    }, []);
    const up = useCallback((e) => {
        e.preventDefault();
        try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
        holdRef.current = false;
    }, []);

    const elapsed = startRef.current ? Math.min(REEL_MS, performance.now() - startRef.current) : 0;
    const left = Math.max(0, 1 - elapsed / REEL_MS);
    const pos = posRef.current, band = bandRef.current;
    const inside = pos >= band - BAND_H / 2 && pos <= band + BAND_H / 2;
    const tension = tensionRef.current;
    const slack = typeof performance !== "undefined" && performance.now() < slackUntilRef.current;
    // Same function the server gets. The bar is a real preview now, not a different number.
    const scoreNow = scoreOf(inRef.current, totalRef.current);
    const warming = elapsed < REEL_WARMUP_MS;

    return (
        <div className="fish-reel" data-tick={tick}>
            <div className="fish-reel-head">
                <strong>REEL IT IN!</strong>
                {/* Two things move on this rod and nothing used to say how they related — players read the fish
                    marker as the fish swimming on its own and tried to chase it, when in fact the marker is
                    THEIR line (hold = up, release = down) and the green band is what drifts. Say so outright. */}
                <span className="muted">HOLD to raise your bar · let go to drop it · keep the fish inside it</span>
            </div>
            <div
                className={`fish-rod${inside ? " is-on" : ""}`}
                onPointerDown={down} onPointerUp={up} onPointerCancel={up}
                role="presentation"
            >
                <div className="fish-band" style={{ bottom: `${(band - BAND_H / 2) * 100}%`, height: `${BAND_H * 100}%` }}>
                    <span className="fish-band-label">YOUR BAR</span>
                </div>
                {/* THE FISH — it swims on its own now, which is what everyone expects a fish to do. Your
                    thumb drives the BAR above; nothing you press moves this. */}
                <div className={`fish-catch${inside ? " is-caught" : ""}`} style={{ bottom: `${pos * 100}%` }}>
                    <span className="fish-catch-hook" aria-hidden="true">🐟</span>
                </div>
                <div className="fish-rod-hint">
                    {warming ? "get ready…" : slack ? "LINE SLACK — ease off!" : inside ? "REELING" : "hold!"}
                </div>
            </div>
            {/* TENSION — the cost of holding. Turns red as it approaches the redline; going slack flashes it. */}
            <div className="fish-strain-row">
                <span className="fish-strain-label">LINE</span>
                <div className={`fish-strain is-tension${slack ? " is-slack" : ""}${tension > 0.75 ? " is-hot" : ""}`}>
                    <div className="fish-tension-fill" style={{ width: `${tension * 100}%` }} />
                </div>
                <span className="fish-strain-pct" style={{ color: slack ? "#e05b6a" : tension > 0.75 ? "#ffb84d" : "#8b93a0" }}>
                    {slack ? "SLACK" : `${Math.round(tension * 100)}%`}
                </span>
            </div>

            {/* Labelled SIZE, because that is literally what it buys: the score decides how big the fish is.
                An unlabelled bar creeping up from zero read as a progress bar you were failing. */}
            <div className="fish-strain-row">
                <span className="fish-strain-label">SIZE</span>
                <div className="fish-strain">
                    <div className="fish-strain-fill" style={{ width: `${scoreNow * 100}%` }} />
                </div>
                <span className="fish-strain-pct">{Math.round(scoreNow * 100)}%</span>
            </div>
            <div className="fish-timer"><div className="fish-timer-fill" style={{ width: `${left * 100}%` }} /></div>
            <button type="button" className="fish-hold-btn" onPointerDown={down} onPointerUp={up} onPointerCancel={up}>
                HOLD TO REEL
            </button>
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
    const top = records?.top || [];
    return (
        <div className="fish-log">
            <div className="fish-log-tabs">
                <button type="button" className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>📖 My Log</button>
                <button type="button" className={tab === "top" ? "on" : ""} onClick={() => setTab("top")}>🏆 Top Catches</button>
                <button type="button" className={tab === "rec" ? "on" : ""} onClick={() => setTab("rec")}>🥇 Records</button>
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
                    {/* Scored against each species' own maximum, so this isn't just a list of whales — and so a
                        perfect Sardine on your first day can genuinely sit at the top of the Den. */}
                    <p className="fish-log-progress">Best catches in the Den — how close each came to the biggest that species gets</p>
                    <div className="fish-log-grid">
                        {top.map((r, i) => (
                            <div key={`${r.species}-${r.alias}-${r.lb}-${i}`} className="fish-log-row">
                                <span className="fish-top-rank">{i + 1}</span>
                                <FishArt id={r.species} emoji={r.emoji} size={34} className="fish-log-art" />
                                <span className="fish-log-name">
                                    {r.name}
                                    <em>{r.who ? `@${r.alias}` : "—"}</em>
                                </span>
                                <span className="fish-log-best">
                                    <strong>{weightLabel(r.lb)}</strong>
                                    <em>{r.pct}% of max</em>
                                </span>
                            </div>
                        ))}
                        {!top.length ? <p className="muted" style={{ padding: 12 }}>No catches yet. The top of the board is wide open.</p> : null}
                    </div>
                </>
            ) : (
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
            )}
            {/* No close button on the dedicated page — there's nothing to close, it IS the screen. */}
            {onClose ? <button type="button" className="fish-close" onClick={onClose}>Back to the rail</button> : null}
        </div>
    );
}

// ── THE SCENE ────────────────────────────────────────────────────────────────────────────────────────────────
// `fishing` is the server's fishing view. `onCast`/`onLand` post to the sailing endpoint and resolve with the
// server's reply; the parent owns the state refresh.
export default function FishingScene({ fishing, sky, records, onCast, onLand, onLoadRecords, onClose }) {
    const sfx = useSfx();
    const [phase, setPhase] = useState("idle");   // idle | waiting | bite | reel | result | gone | log
    const [fight, setFight] = useState("common"); // the fight profile of what is on the line (rarity only)
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const biteTimer = useRef(null);
    const graceTimer = useRef(null);
    const castRef = useRef(null);

    const casts = fishing?.casts || { left: 0, max: 0, used: 0 };

    const clearTimers = useCallback(() => {
        if (biteTimer.current) { clearTimeout(biteTimer.current); biteTimer.current = null; }
        if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
    }, []);
    useEffect(() => clearTimers, [clearTimers]);

    // Report a miss so the server refunds the cast, then show the "it got away" beat.
    const reportMiss = useCallback(async () => {
        clearTimers();
        setPhase("gone");
        sfx.gone();
        await onLand({ quality: 0, missed: true, sky }).catch(() => {});
    }, [clearTimers, onLand, sfx, sky]);

    const cast = useCallback(async () => {
        if (busy) return;
        setBusy(true); setErr(null); setResult(null);
        const res = await onCast({ sky }).catch(() => null);
        setBusy(false);
        if (!res?.ok) {
            setErr(res?.error === "out_of_casts" ? "You're out of casts for today — they refill tomorrow."
                : res?.error === "already_cast" ? "Your line is already in the water."
                : res?.error === "not_at_sea" ? "You can only fish while you're at sea or docked."
                : "The line wouldn't go out. Try again.");
            return;
        }
        // Remember the line WE just put out, so the resume-a-cast effect below doesn't also arm a bite timer for
        // it. Two timers would fire two bite phases and leak a grace timer that could report a miss after the
        // fish was already landed.
        castRef.current = Number(res.cast?.biteAt) || 0;
        // How hard this one fights. Rarity only — never the species, which stays hidden until it surfaces.
        setFight(res.cast?.fight || "common");
        setPhase("waiting");
        sfx.plop();
        const wait = Math.max(200, Number(res.cast?.biteAt || 0) - Date.now());
        biteTimer.current = setTimeout(() => {
            setPhase("bite");
            sfx.bite();
            // The bite is the one moment that demands a reaction — make it felt, not just heard.
            try { navigator.vibrate?.([0, 45, 35, 45]); } catch { /* no haptics here */ }
            // A long, generous tap window — and missing it costs nothing but the wait.
            graceTimer.current = setTimeout(reportMiss, BITE_HOLD_MS);
        }, wait);
    }, [busy, onCast, reportMiss, sfx, sky]);

    // Tap on the bite → straight into the struggle.
    const strike = useCallback(() => {
        if (phase !== "bite") return;
        clearTimers();
        setPhase("reel");
    }, [phase, clearTimers]);

    const finishReel = useCallback(async (quality) => {
        setBusy(true);
        try {
            const big = ["legendary", "mythic"].includes(fight);
            navigator.vibrate?.(big ? [30, 50, 30, 50, 90] : [25, 40, 60]);
        } catch { /* no haptics here */ }
        const res = await onLand({ quality, sky }).catch(() => null);
        setBusy(false);
        if (res?.ok && res.landed) {
            // `catchResult`, NOT `res`. fishLand returns the catch spread UNDER the whole sailing state, and
            // that state carries `gold` = the member's total balance — so `res.gold` is your wallet, not the
            // payout. A 12-gold Tiger Prawn proudly reported "+1879 🪙". XP looked fine only because the
            // sailing state has no `xp` key to overwrite. catchResult is the untouched landFish result.
            setResult(res.catchResult || res);
            setPhase("result");
            sfx.land();
        } else if (res?.ok) {
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
                        <div className="fish-idle-art">🎣</div>
                        <p className="fish-copy">
                            Drop a line over the rail. When it twitches, <strong>tap</strong> — then <strong>hold to reel</strong> and
                            keep the fish in the green. A good reel lands a bigger fish.
                        </p>
                        {err ? <p className="fish-err">{err}</p> : null}
                        <div className="fish-actions">
                            <button type="button" className="fish-cta" disabled={busy || casts.left <= 0} onClick={cast}>
                                {casts.left <= 0 ? "Out of casts today" : busy ? "Casting…" : "Cast the line 🎣"}
                            </button>
                            <button type="button" className="fish-ghost" onClick={openLog}>
                                📖 Log · {fishing?.speciesKnown || 0}/{fishing?.speciesTotal || 0}
                            </button>
                        </div>
                        {fishing?.totalCaught ? <p className="muted fish-tally">{fishing.totalCaught} fish landed all-time</p> : null}
                    </div>
                ) : phase === "waiting" ? (
                    <div className="fish-stage">
                        <div className="fish-line-art"><span className="fish-bob">🔴</span></div>
                        <p className="fish-copy fish-wait">Waiting for a bite<span className="fish-dots">…</span></p>
                        <p className="muted">Keep your eyes on the float.</p>
                    </div>
                ) : phase === "bite" ? (
                    <button type="button" className="fish-bite" onClick={strike}>
                        <span className="fish-bite-flash">!</span>
                        <strong>TAP!</strong>
                        <em>something&apos;s on the line</em>
                    </button>
                ) : phase === "reel" ? (
                    <ReelStruggle onDone={finishReel} sfx={sfx} fight={fight} />
                ) : phase === "gone" ? (
                    <div className="fish-stage">
                        <div className="fish-idle-art">💨</div>
                        <p className="fish-copy">It stole your bait and slipped away.</p>
                        <p className="muted">Your cast came back — no harm done.</p>
                        <div className="fish-actions">
                            <button type="button" className="fish-cta" onClick={() => { setPhase("idle"); setResult(null); }}>Try again 🎣</button>
                        </div>
                    </div>
                ) : result?.treasure ? (
                    // One cast in five surfaces treasure instead of a fish — its own moment, not a footnote.
                    <div className="fish-stage fish-result">
                        <div className="fish-banner is-new">🧭 TREASURE!</div>
                        <div className="fish-reveal" style={{ fontSize: 96 }} aria-hidden="true">{result.prize?.emoji || "🧰"}</div>
                        <div className="fish-name" style={{ color: RARITY_COLOR[result.tier] || "#cfd8e3" }}>{result.prize?.label || "Something"}</div>
                        <div className="fish-rarity" style={{ color: RARITY_COLOR[result.tier] || "#cfd8e3" }}>{RARITY_LABEL[result.tier] || "Common"}</div>
                        <p className="fish-copy">You hauled it up off the sea floor — no fish this time.</p>
                        <div className="fish-actions">
                            <button type="button" className="fish-cta" disabled={casts.left <= 0} onClick={() => { setResult(null); setPhase("idle"); }}>
                                {casts.left <= 0 ? "That's your last cast today" : "Cast again 🎣"}
                            </button>
                            <button type="button" className="fish-ghost" onClick={openLog}>📖 Log</button>
                        </div>
                    </div>
                ) : result ? (
                    <div className="fish-stage fish-result">
                        {result.denRecord ? <div className="fish-banner is-den">🥇 BIGGEST IN THE DEN!</div>
                            : result.firstEver ? <div className="fish-banner is-new">✨ NEW SPECIES!</div>
                                : result.personalBest ? <div className="fish-banner">📈 PERSONAL BEST!</div> : null}
                        <div className="fish-reveal"><FishArt id={result.fish.id} emoji={result.fish.emoji} size={140} /></div>
                        <div className="fish-name" style={{ color: RARITY_COLOR[result.fish.rarity] }}>{result.fish.name}</div>
                        <div className="fish-rarity" style={{ color: RARITY_COLOR[result.fish.rarity] }}>{RARITY_LABEL[result.fish.rarity]}</div>
                        <div className="fish-size">{weightLabel(result.fish.lb)}</div>
                        <div className="fish-pct">
                            <div className="fish-pct-bar"><div className="fish-pct-fill" style={{ width: `${result.pct}%`, background: RARITY_COLOR[result.fish.rarity] }} /></div>
                            <span>{result.pct}% of the biggest this species gets</span>
                        </div>
                        {/* Weight against the two numbers that actually mean something: what YOU'VE landed
                            before, and what the species can reach. Without these a weight is just a number. */}
                        <div className="fish-compare">
                            <div className={`fish-compare-cell${result.personalBest ? " is-beat" : ""}`}>
                                <em>your best</em>
                                <b>{result.personalBest && result.previousBest ? weightLabel(result.previousBest) : weightLabel(result.previousBest || result.fish.lb)}</b>
                                {result.personalBest ? <span className="fish-compare-tag">BEATEN</span> : null}
                            </div>
                            <div className="fish-compare-cell">
                                <em>species max</em>
                                <b>{weightLabel(result.fish.range?.[1])}</b>
                            </div>
                        </div>
                        <div className="fish-spoils">
                            <span className="fish-chip gold">+{result.gold} 🪙</span>
                            <span className="fish-chip xp">+{result.xp} ✨ XP</span>
                            {(result.extras || []).map((e, i) => <span key={i} className="fish-chip extra">{e.emoji} {e.label}</span>)}
                        </div>
                        <div className="fish-actions">
                            <button type="button" className="fish-cta" disabled={casts.left <= 0} onClick={() => { setResult(null); setPhase("idle"); }}>
                                {casts.left <= 0 ? "That's your last cast today" : "Cast again 🎣"}
                            </button>
                            <button type="button" className="fish-ghost" onClick={openLog}>📖 Log</button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(body, document.body);
}
