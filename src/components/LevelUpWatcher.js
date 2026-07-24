"use client";

import { useEffect, useRef, useState } from "react";

const CONFETTI_COLORS = ["#ffd75e", "#c8a24a", "#7ee0d0", "#f39191", "#bda0f2", "#86c4ff", "#9de5a9"];
// Milestones (every 5th level) get a fuller, prismatic burst.
const PRISMATIC_COLORS = ["#ff4d4d", "#ff9f1c", "#ffd75e", "#4ade80", "#38bdf8", "#818cf8", "#c084fc", "#f472b6"];
const isMilestoneLevel = (level) => level % 5 === 0;

// A short, self-contained "level up" chime via Web Audio (no asset, CSP-safe). A rising arpeggio;
// milestones get a longer, more triumphant run. Silently no-ops if the browser blocks audio.
function playLevelUpSound(milestone) {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        if (ctx.resume) ctx.resume().catch(() => {});
        const notes = milestone
            ? [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5 E5 G5 C6 E6
            : [523.25, 659.25, 783.99]; // C5 E5 G5
        notes.forEach((freq, i) => {
            const t = ctx.currentTime + i * 0.12;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.42);
        });
        setTimeout(() => ctx.close().catch(() => {}), notes.length * 120 + 700);
    } catch {
        // audio blocked — no problem
    }
}

// Watches for a server-tracked, un-celebrated level-up and plays a one-time celebration. The server
// marks the level acknowledged the moment we show it, so it fires exactly once per level on any device.
export default function LevelUpWatcher() {
    const [level, setLevel] = useState(null);
    const activeRef = useRef(false);

    useEffect(() => {
        let alive = true;

        async function check() {
            if (activeRef.current) return; // one celebration at a time
            try {
                const r = await fetch("/api/marketplace/level-up", { cache: "no-store" });
                if (!r.ok || !alive) return;
                const d = await r.json();
                if (!alive || !d?.pending || !d.level) return;
                activeRef.current = true;
                setLevel(d.level);
                playLevelUpSound(isMilestoneLevel(d.level));
                // Acknowledge immediately so it never replays, even if they close the tab mid-animation.
                fetch("/api/marketplace/level-up", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ level: d.level }),
                }).catch(() => {});
            } catch {
                // best-effort
            }
        }

        check();
        const onVisible = () => {
            if (document.visibilityState === "visible") check();
        };
        // Fire the celebration the moment an action awards XP (no refresh needed). XP-earning actions
        // dispatch `wolfden-xp-updated`; we re-check a few times so a slightly-slow server write still
        // celebrates immediately (in-session) instead of only when you navigate away and back. `check`
        // guards with activeRef, so the repeats are harmless once one fires.
        const xpTimers = [];
        const onXp = () => { [400, 1200, 2600, 4500].forEach((ms) => xpTimers.push(setTimeout(check, ms))); };
        // Safety net so leveling from ANY source still celebrates within ~30s even if it didn't emit the event.
        const poll = setInterval(() => { if (document.visibilityState === "visible") check(); }, 30000);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("wolfden-xp-updated", onXp);
        return () => {
            alive = false;
            clearInterval(poll);
            xpTimers.forEach(clearTimeout);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("wolfden-xp-updated", onXp);
        };
    }, []);

    // On-demand preview: fires the exact same celebration (no server call, nothing acknowledged) so a
    // member can see what leveling looks like. Dispatched by the rewards hub's "Preview" buttons.
    useEffect(() => {
        const onPreview = (e) => {
            if (activeRef.current) return;
            const lvl = Math.max(2, Math.floor(Number(e?.detail?.level) || 2));
            activeRef.current = true;
            setLevel(lvl);
            playLevelUpSound(isMilestoneLevel(lvl));
        };
        window.addEventListener("wolfden-levelup-preview", onPreview);
        return () => window.removeEventListener("wolfden-levelup-preview", onPreview);
    }, []);

    useEffect(() => {
        if (level == null) return;
        const t = setTimeout(() => {
            setLevel(null);
            activeRef.current = false;
        }, 5200);
        return () => clearTimeout(t);
    }, [level]);

    if (level == null) return null;

    const dismiss = () => {
        setLevel(null);
        activeRef.current = false;
    };

    const milestone = isMilestoneLevel(level);
    const pieces = milestone ? 84 : 46;
    const palette = milestone ? PRISMATIC_COLORS : CONFETTI_COLORS;

    return (
        <div className="levelup-overlay" role="status" aria-live="polite" onClick={dismiss}>
            <div className={`levelup-confetti${milestone ? " is-milestone" : ""}`} aria-hidden="true">
                {Array.from({ length: pieces }).map((_, i) => (
                    <span
                        key={i}
                        style={{
                            left: `${Math.random() * 100}%`,
                            background: palette[i % palette.length],
                            animationDelay: `${Math.random() * (milestone ? 0.9 : 0.6)}s`,
                            animationDuration: `${2.2 + Math.random() * (milestone ? 1.8 : 1.4)}s`,
                        }}
                    />
                ))}
            </div>
            <div className={`levelup-card${milestone ? " is-milestone" : ""}`}>
                {milestone ? <div className="levelup-ribbon">★ MILESTONE ★</div> : null}
                <div className="levelup-emoji" aria-hidden="true">{milestone ? "🏆" : "🎉"}</div>
                <div className="levelup-title">{milestone ? "MILESTONE!" : "LEVEL UP!"}</div>
                <div className="levelup-badge">Level {level}</div>
                <div className="levelup-sub">
                    {milestone ? "You're a bona fide Wolf Den regular. 🐺" : "Thanks for being part of The Wolf Den."}
                </div>
            </div>
        </div>
    );
}
