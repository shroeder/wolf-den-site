"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// A slim, site-wide "next unlock" strip for signed-in members — the always-on engagement carrot. Shows
// the next reward + a progress bar + XP to go, linking to the full rewards track. Renders nothing for
// signed-out visitors or maxed members.
const XP_KEY = "wolfden-last-xp";

export default function RewardNudge() {
    const [data, setData] = useState(null);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        let alive = true;
        let toastTimer = null;
        const load = async () => {
            const r = await fetch("/api/marketplace/next-unlock", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (!alive) return;
            setData(d);
            // XP-gain toast: compare this load's total XP to what we last saw on this device.
            if (d?.authed && typeof d.xp === "number") {
                const prev = Number(localStorage.getItem(XP_KEY));
                localStorage.setItem(XP_KEY, String(d.xp));
                if (Number.isFinite(prev) && d.xp > prev) {
                    const gained = d.xp - prev;
                    const msg = d.label ? `+${gained} XP · ${d.xpToGo.toLocaleString()} to ${d.label}` : `+${gained} XP earned!`;
                    setToast(msg);
                    toastTimer = setTimeout(() => alive && setToast(null), 5200);
                }
            }
        };
        load();
        const onXp = () => load();
        window.addEventListener("wolfden-xp-updated", onXp);
        return () => {
            alive = false;
            if (toastTimer) clearTimeout(toastTimer);
            window.removeEventListener("wolfden-xp-updated", onXp);
        };
    }, []);

    if (!data || !data.authed) return null;

    const hasProgress = !data.maxed && data.label;

    return (
        <>
            <div className="hud-strip">
                {/* Coins — the enticing currency chip (shimmering gold), tap the + to buy more store credit. */}
                {typeof data.gold === "number" ? (
                    <Link href="/marketplace/credit" className="coin-hud" aria-label={`${data.gold} coins — tap to get more`}>
                        <span className="coin-hud-icon" aria-hidden="true">🪙</span>
                        <span className="coin-hud-amt">{data.gold.toLocaleString()}</span>
                        <span className="coin-hud-plus" aria-hidden="true">+</span>
                    </Link>
                ) : null}
                {hasProgress ? (
                    <Link href="/marketplace/track" className="reward-nudge" aria-label={`Next unlock: ${data.label} at level ${data.unlockLevel} — see your rewards track`}>
                        <span className="reward-nudge-gift" aria-hidden="true">🎁</span>
                        <span className="reward-nudge-main">
                            <span className="reward-nudge-label">
                                Next: <span aria-hidden="true">{data.icon}</span> <strong>{data.label}</strong>
                            </span>
                            <span className="reward-nudge-bar"><span style={{ width: `${data.pct}%` }} /></span>
                        </span>
                        <span className="reward-nudge-togo">{data.xpToGo.toLocaleString()} XP →</span>
                    </Link>
                ) : null}
            </div>
            {toast ? <div className="xp-toast" role="status">🎉 {toast}</div> : null}
        </>
    );
}
