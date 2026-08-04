"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ── ONE LINE, ON THE HOME SCREEN ─────────────────────────────────────────────────────────────────────────────
// This replaced a fifteen-row checklist that sat on the play page until you finished it. Fifteen rows of systems
// you have never heard of IS the overwhelm — and a list that disappears the moment it's complete is a game that
// stops explaining itself forever.
//
// So: one line. What to do next, and a link that goes there. When there is nothing open left to do it points at
// the guide instead of vanishing, because "you're on your own now" is the thing we were trying to avoid.
export default function GuideStrip() {
    const [g, setG] = useState(null);

    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/guide", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive) setG(d); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    if (!g?.signedIn) return null;
    const step = g.current?.step || null;

    return (
        <Link className="gs" href={step ? step.href : "/marketplace/guide"} style={{ "--tint": g.current?.tint || "#ffd75e" }}>
            <span className="gs-kicker">{step ? `Next · ${g.current.name}` : "The Pathfinder"}</span>
            <b className="gs-label">{step ? step.label : "You know the place — have a wander"}</b>
            {step ? <span className="gs-pay">+{Number(step.gold).toLocaleString()}</span> : null}
            <span className="gs-chev" aria-hidden="true" />

            <style jsx>{`
                .gs { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px;
                    padding: 11px 14px; border-radius: 13px; text-decoration: none; margin-bottom: 12px;
                    background: linear-gradient(150deg, color-mix(in srgb, var(--tint) 18%, transparent), rgba(255,255,255,0.03));
                    border: 1px solid color-mix(in srgb, var(--tint) 40%, transparent); }
                .gs-kicker { grid-column: 1 / -1; font-size: 9.5px; font-weight: 900; letter-spacing: .12em;
                    text-transform: uppercase; color: color-mix(in srgb, var(--tint) 75%, white); }
                .gs-label { font-size: 0.95rem; font-weight: 900; color: #fff; min-width: 0; }
                .gs-pay { font-size: 12px; font-weight: 900; color: #ffd75e; white-space: nowrap; }
                /* A chevron drawn in CSS — a > glyph renders differently on every platform and an emoji arrow is
                   against the house rules. */
                .gs-chev { width: 8px; height: 8px; border-top: 2px solid #fff; border-right: 2px solid #fff;
                    transform: rotate(45deg); opacity: 0.65; }
            `}</style>
        </Link>
    );
}
