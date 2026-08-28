"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaDharmachakra } from "react-icons/fa6";
import { nudgeFeed } from "@/lib/nudge-feed";
import Glyph from "@/components/Glyph";

// Live stat strip for the game hub: XP + progress to the next unlock, gold, and spin tokens. Best-effort —
// pulls from the same endpoints the reward nudge + spin wheel use, and self-hides gracefully when signed out.
export default function GameHubStats() {
    const [unlock, setUnlock] = useState(null);
    const [spin, setSpin] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            const [u, s] = await Promise.all([
                // next-unlock already came down with the root-layout watchers on this page load; RewardNudge
                // is reading the very same reply. See lib/nudge-feed.js.
                nudgeFeed().then((d) => d?.nextUnlock || null).catch(() => null),
                fetch("/api/marketplace/spin", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
            ]);
            if (!alive) return;
            setUnlock(u); setSpin(s);
        })();
        return () => { alive = false; };
    }, []);

    if (unlock && unlock.authed === false) {
        return <Link href="/marketplace/login?returnTo=/marketplace/play" className="btn-gold" style={{ marginTop: 10, display: "inline-block" }}>Sign in to play →</Link>;
    }
    if (!unlock) return null;

    return (
        <div className="game-hub-stats">
            <div className="game-hub-chips">
                <span className="game-hub-chip">⭐ {(unlock.xp || 0).toLocaleString()} XP</span>
                {spin?.signedIn && (spin.tokens || 0) > 0 ? <Link href="/marketplace/spin" className="game-hub-chip"><FaDharmachakra className="spin-ico" aria-hidden="true" /> {spin.tokens} spin{spin.tokens === 1 ? "" : "s"}</Link> : null}
                {spin?.freeAvailable ? <Link href="/marketplace/spin" className="game-hub-chip is-live"><FaDharmachakra className="spin-ico" aria-hidden="true" /> Free spin ready!</Link> : null}
            </div>
            {!unlock.maxed && unlock.label ? (
                <div className="game-hub-progress">
                    <div className="game-hub-bar"><span style={{ width: `${unlock.pct || 0}%` }} /></div>
                    <span className="muted">Next: <Glyph value={unlock.icon} /> {unlock.label} · {(unlock.xpToGo || 0).toLocaleString()} XP to go</span>
                </div>
            ) : null}
        </div>
    );
}
