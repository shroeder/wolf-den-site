"use client";

import { useEffect, useRef, useState } from "react";

// Level badge + progress-to-next-level bar. `level` is the object from levelForXp():
// { level, totalXp, xpToNext, progress }. On mount the bar sweeps from 0 → target and the XP number
// counts up, so progress feels *earned* rather than just appearing. Honors reduced-motion.
export default function UserLevel({ level, animate = true }) {
    const pct = level ? Math.round(Math.min(1, Math.max(0, level.progress || 0)) * 100) : 0;
    const total = level ? Math.max(0, Math.round(level.totalXp || 0)) : 0;

    const [fill, setFill] = useState(animate ? 0 : pct);
    const [shownXp, setShownXp] = useState(animate ? 0 : total);
    const rafRef = useRef(0);

    useEffect(() => {
        if (!level) return undefined;
        const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!animate || reduce) {
            // Defer into a frame so we don't setState synchronously in the effect body.
            const id = requestAnimationFrame(() => {
                setFill(pct);
                setShownXp(total);
            });
            return () => cancelAnimationFrame(id);
        }
        // Let the bar paint at 0 first, then transition to target (CSS handles the sweep).
        const kick = requestAnimationFrame(() => setFill(pct));
        // Count the XP number up in parallel over ~900ms with an ease-out.
        const start = performance.now();
        const dur = 900;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            setShownXp(Math.round(total * eased));
            if (t < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(kick);
            cancelAnimationFrame(rafRef.current);
        };
        // Re-run if the level object identity changes (e.g. after earning XP).
    }, [level, animate, pct, total]);

    if (!level) return null;

    return (
        <div className="user-level">
            <div className="user-level-row">
                <span className="user-level-badge">Lv {level.level}</span>
                <span className="user-level-xp muted">
                    {shownXp.toLocaleString()} XP{level.xpToNext > 0 ? ` · ${level.xpToNext.toLocaleString()} to next` : ""}
                </span>
            </div>
            <div className="user-level-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${fill}%` }}>
                    <i className="user-level-shine" aria-hidden="true" />
                </span>
            </div>
        </div>
    );
}
