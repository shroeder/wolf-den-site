"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// A slim, site-wide "next unlock" strip for signed-in members — the always-on engagement carrot. Shows
// the next reward + a progress bar + XP to go, linking to the full rewards track. Renders nothing for
// signed-out visitors or maxed members.
export default function RewardNudge() {
    const [data, setData] = useState(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            const r = await fetch("/api/marketplace/next-unlock", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (alive) setData(d);
        };
        load();
        // Refresh when XP might have changed (a level-up celebration fires this event).
        const onXp = () => load();
        window.addEventListener("wolfden-xp-updated", onXp);
        return () => {
            alive = false;
            window.removeEventListener("wolfden-xp-updated", onXp);
        };
    }, []);

    if (!data || !data.authed || data.maxed || !data.label) return null;

    return (
        <Link href="/marketplace/track" className="reward-nudge" aria-label={`Next unlock: ${data.label} at level ${data.unlockLevel}`}>
            <span className="reward-nudge-gift" aria-hidden="true">🎁</span>
            <span className="reward-nudge-main">
                <span className="reward-nudge-label">
                    Next: <span aria-hidden="true">{data.icon}</span> <strong>{data.label}</strong>
                </span>
                <span className="reward-nudge-bar"><span style={{ width: `${data.pct}%` }} /></span>
            </span>
            <span className="reward-nudge-togo">{data.xpToGo.toLocaleString()} XP →</span>
        </Link>
    );
}
