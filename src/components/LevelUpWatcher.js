"use client";

import { useEffect, useRef, useState } from "react";

const CONFETTI_COLORS = ["#ffd75e", "#c8a24a", "#7ee0d0", "#f39191", "#bda0f2", "#86c4ff", "#9de5a9"];
const PIECES = 46;

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
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            alive = false;
            document.removeEventListener("visibilitychange", onVisible);
        };
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

    return (
        <div className="levelup-overlay" role="status" aria-live="polite" onClick={dismiss}>
            <div className="levelup-confetti" aria-hidden="true">
                {Array.from({ length: PIECES }).map((_, i) => (
                    <span
                        key={i}
                        style={{
                            left: `${Math.random() * 100}%`,
                            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                            animationDelay: `${Math.random() * 0.6}s`,
                            animationDuration: `${2.2 + Math.random() * 1.4}s`,
                        }}
                    />
                ))}
            </div>
            <div className="levelup-card">
                <div className="levelup-emoji" aria-hidden="true">🎉</div>
                <div className="levelup-title">LEVEL UP!</div>
                <div className="levelup-badge">Level {level}</div>
                <div className="levelup-sub">Thanks for being part of The Wolf Den.</div>
            </div>
        </div>
    );
}
