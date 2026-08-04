"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ── ONE LINE, ON THE HOME SCREEN ─────────────────────────────────────────────────────────────────────────────
// What to do next, and a link that goes there. It replaced a fifteen-row checklist that sat on the play page
// until you finished it and then vanished — fifteen rows of systems you have never heard of IS the overwhelm,
// and a guide that disappears is a game that stops explaining itself forever. When there is nothing open left
// it points at the guide instead of going away.
//
// EVERY RULE HERE IS GLOBAL, ON PURPOSE. The whole card is a <Link>, and styled-jsx does not add its
// `jsx-<hash>` scope class to a custom component — only to DOM elements. The first cut of this used a scoped
// `.gs { display: grid; padding; border; background; }` on that <Link>, so the card had NO box: it rendered as
// "NEXT · THE TOWNTake a town quest+200" jammed into one line of bare text, while the <span> children inside it
// stayed perfectly styled. The `gs-` prefix is unique to this component, so going global costs nothing.
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
    const pct = g.totals?.steps ? Math.round((g.totals.doneSteps / g.totals.steps) * 100) : 0;

    return (
        <Link className="gs" href={step ? step.href : "/marketplace/guide"} style={{ "--tint": g.current?.tint || "#ffd75e" }}>
            {g.current?.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gs-emblem" src={g.current.icon} alt="" draggable="false" />
            ) : <span className="gs-emblem" />}

            <span className="gs-body">
                <span className="gs-kicker">{step ? `Next · ${g.current.name}` : "The Pathfinder"}</span>
                <b className="gs-label">{step ? step.label : "You know the place"}</b>
                <span className="gs-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
            </span>

            <span className="gs-right">
                {step ? <span className="gs-pay">+{Number(step.gold).toLocaleString()}</span> : null}
                <span className="gs-chev" aria-hidden="true" />
            </span>

            <style jsx global>{`
                .gs { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; align-items: center; gap: 12px;
                    padding: 12px 14px; margin-bottom: 12px; border-radius: 15px; text-decoration: none;
                    background: linear-gradient(148deg, color-mix(in srgb, var(--tint) 24%, transparent), rgba(255,255,255,0.03) 62%), rgba(12,10,16,0.6);
                    border: 1px solid color-mix(in srgb, var(--tint) 45%, transparent);
                    box-shadow: 0 10px 26px -16px var(--tint); transition: transform .13s ease; }
                .gs:active { transform: scale(0.988); }
                .gs-emblem { width: 46px; height: 46px; object-fit: contain; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.55)); }
                .gs-body { min-width: 0; }
                .gs-kicker { display: block; font-size: 9.5px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase;
                    color: color-mix(in srgb, var(--tint) 80%, white); }
                .gs-label { display: block; margin-top: 2px; font-size: 0.98rem; font-weight: 900; color: #fff; line-height: 1.25;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .gs-bar { display: block; height: 3px; margin-top: 7px; border-radius: 2px; background: rgba(255,255,255,0.12); overflow: hidden; }
                .gs-bar > i { display: block; height: 100%; border-radius: 2px; background: color-mix(in srgb, var(--tint) 85%, white);
                    transition: width .6s cubic-bezier(.2,.8,.3,1); }
                .gs-right { display: flex; align-items: center; gap: 9px; }
                .gs-pay { font-size: 12px; font-weight: 900; color: #ffd75e; white-space: nowrap; }
                /* Drawn, not typed — a > glyph renders differently on every platform and an arrow emoji is out. */
                .gs-chev { width: 8px; height: 8px; border-top: 2px solid rgba(255,255,255,0.75);
                    border-right: 2px solid rgba(255,255,255,0.75); transform: rotate(45deg); }
            `}</style>
        </Link>
    );
}
