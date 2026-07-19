"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Rarity glow colors (match the chest reveal), so a mythic gift pops harder than a common one.
const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0" };

// Pops up gifts an admin sent (item / chest / gold) the next time the member opens the site. Reliable and
// permission-free — the reward is recorded server-side, so this never depends on browser push being on.
// Reuses the level-up overlay styling. Shows one at a time, marks each seen so it never replays.
export default function GiftWatcher() {
    const [queue, setQueue] = useState([]);
    const current = queue[0] || null;
    const activeRef = useRef(false);

    useEffect(() => {
        let alive = true;

        async function check() {
            if (activeRef.current) return; // already showing a batch
            try {
                const r = await fetch("/api/marketplace/gifts", { cache: "no-store" });
                if (!r.ok || !alive) return;
                const d = await r.json();
                if (!alive || !d?.gifts?.length) return;
                activeRef.current = true;
                setQueue(d.gifts);
            } catch {
                // best-effort
            }
        }

        check();
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            alive = false;
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    function dismiss() {
        const g = queue[0];
        if (g) {
            fetch("/api/marketplace/gifts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ids: [g.id] }),
            }).catch(() => {});
        }
        setQueue((q) => {
            const next = q.slice(1);
            if (!next.length) activeRef.current = false; // ready to catch a future gift
            return next;
        });
    }

    if (!current) return null;
    const glow = RARITY_COLOR[current.rarity] || "#ffd75e";

    return (
        <div className="levelup-overlay" role="status" aria-live="polite" onClick={dismiss}>
            <div className="levelup-card" style={{ boxShadow: `0 0 60px -10px ${glow}`, borderColor: glow }} onClick={(e) => e.stopPropagation()}>
                <div className="levelup-emoji" aria-hidden="true">{current.icon || "🎁"}</div>
                <div className="levelup-title">{current.title}</div>
                <div className="levelup-sub">{current.body}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                    <Link href={current.url || "/marketplace/inventory"} className="button gold" onClick={dismiss}>Open it →</Link>
                    <button type="button" className="pill" onClick={dismiss}>Later</button>
                </div>
            </div>
        </div>
    );
}
