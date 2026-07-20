"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Shows the boss-defeat celebration to EVERY member who fought — not just whoever landed the final blow.
// Polls a lightweight endpoint on mount + tab-focus; when a boss the member fought was recently slain (and
// they haven't celebrated it yet), it pops a confetti + bouncing-heroes overlay, then acknowledges so it
// never replays. Mounted site-wide in the public layout.
export default function BossCelebrationWatcher() {
    const [data, setData] = useState(null);
    const activeRef = useRef(false);

    const check = useCallback(async () => {
        if (activeRef.current) return;
        const r = await fetch("/api/marketplace/boss-celebrate", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (!d?.pending || !d.boss?.id) return;
        activeRef.current = true;
        setData(d);
        // Acknowledge immediately so it fires exactly once, even if they close the tab mid-animation.
        fetch("/api/marketplace/boss-celebrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bossId: d.boss.id }) }).catch(() => {});
    }, []);

    useEffect(() => {
        check();
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [check]);

    if (!data) return null;
    const { boss, winner, mine, heroes = [], recapUrl } = data;
    const close = () => setData(null);

    return (
        <div className="boss2-victory-overlay" onClick={close}>
            <div className="boss2-vic-confetti" aria-hidden="true">
                {Array.from({ length: 72 }).map((_, i) => (
                    <span key={i} style={{ left: `${(i * 89) % 100}%`, animationDelay: `${(i % 12) * 0.08}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c"][i % 5] }} />
                ))}
            </div>
            <div className="boss2-victory" onClick={(e) => e.stopPropagation()}>
                <div className="boss2-victory-x">🏆</div>
                <h3>☠️ {boss.name} slain!</h3>
                <p className="muted">The whole pack brought it down!</p>
                {heroes.some((h) => h.url) ? (
                    <div className="boss2-vic-heroes">
                        {heroes.filter((h) => h.url).slice(0, 10).map((h, i) => (
                            <span key={i} className="boss2-vic-hero" style={{ animationDelay: `${(i % 5) * 0.12}s` }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={h.url} alt="" style={h.flip ? { transform: "scaleX(-1)" } : undefined} />
                            </span>
                        ))}
                    </div>
                ) : null}
                {winner ? <p style={{ margin: "6px 0", fontWeight: 700 }}>🎟️ {winner.you ? "🎉 You won the raffle!" : `Raffle winner: ${winner.name}`}{winner.prize ? ` — ${winner.prize}` : ""}</p> : null}
                {mine ? <p className="boss2-vic-reward">Your battle: #{mine.rank} · {mine.dmg.toLocaleString()} dmg · 🎟️ {mine.tickets} · you earned a spin token + loot!</p> : null}
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    <Link href={recapUrl} className="btn-gold" onClick={close}>📊 Final stats</Link>
                    <button type="button" className="pill" onClick={close}>Sweet!</button>
                </div>
            </div>
        </div>
    );
}
