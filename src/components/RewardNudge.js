"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { nudgeFeed } from "@/lib/nudge-feed";
import Coin from "@/components/Coin";
import Glyph from "@/components/Glyph";

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
            // Shared with the other three root-layout watchers — one request between them. See lib/nudge-feed.js.
            const d = (await nudgeFeed())?.nextUnlock || null;
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
        const onRefresh = () => load();
        // Refresh when the tab regains focus (covers actions taken on another tab / after being away).
        const onFocus = () => { if (document.visibilityState !== "hidden") load(); };
        window.addEventListener("wolfden-xp-updated", onXp);
        window.addEventListener("wolfden-hud-refresh", onRefresh);
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onFocus);

        // CENTRAL catch-all: any successful mutating (non-GET) call to a marketplace API means gold / XP /
        // badges may have changed — so refresh the HUD (and tell the nav) without every component having to
        // remember to. Debounced so a burst of actions triggers one reload. GETs are ignored (so the reload's
        // own next-unlock fetch can't loop).
        let refreshTimer = null;
        const scheduleRefresh = () => {
            if (refreshTimer) return;
            // Dispatch the event; our own onRefresh listener (and the nav's) reload from there — single path.
            refreshTimer = setTimeout(() => { refreshTimer = null; if (alive) window.dispatchEvent(new Event("wolfden-hud-refresh")); }, 350);
        };
        const origFetch = window.fetch;
        const patchedFetch = function (input, init) {
            const p = origFetch.apply(this, arguments);
            try {
                const url = typeof input === "string" ? input : (input && input.url) || "";
                const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
                if (method !== "GET" && /\/api\/marketplace\//.test(url)) {
                    p.then((res) => { if (res && res.ok) scheduleRefresh(); }).catch(() => {});
                }
            } catch { /* never let the interceptor break a fetch */ }
            return p;
        };
        window.fetch = patchedFetch;

        return () => {
            alive = false;
            if (toastTimer) clearTimeout(toastTimer);
            if (refreshTimer) clearTimeout(refreshTimer);
            if (window.fetch === patchedFetch) window.fetch = origFetch; // restore only if still ours
            window.removeEventListener("wolfden-xp-updated", onXp);
            window.removeEventListener("wolfden-hud-refresh", onRefresh);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, []);

    if (!data || !data.authed) return null;

    const hasProgress = !data.maxed && data.label;

    return (
        <>
            <div className="hud-strip">
                {/* Coins — the enticing currency chip (shimmering gold), tap the + to buy more store credit. */}
                {typeof data.gold === "number" ? (
                    <Link href="/marketplace/credit" className={`coin-hud${data.gold < 300 ? " is-low" : ""}`} aria-label={`${data.gold} coins — tap to get more`}>
                        <span className="coin-hud-icon" aria-hidden="true"><Coin size={15} /></span>
                        <span className="coin-hud-amt">{data.gold.toLocaleString()}</span>
                        <span className="coin-hud-plus" aria-hidden="true">+</span>
                    </Link>
                ) : null}
                {hasProgress ? (
                    <Link href="/marketplace/track" className="reward-nudge" aria-label={`Level ${data.level} — ${data.xpToGo} XP to your next unlock, ${data.label}`}>
                        {data.level ? <span className="reward-nudge-lv">Lv {data.level}</span> : null}
                        <span className="reward-nudge-bar" title={`Next: ${data.label}`}><span style={{ width: `${data.pct}%` }} /></span>
                        <span className="reward-nudge-togo">{data.icon ? <span className="reward-nudge-next" aria-hidden="true"><Glyph value={data.icon} /></span> : null}{data.xpToGo.toLocaleString()} XP →</span>
                    </Link>
                ) : null}
            </div>
            {toast ? <div className="xp-toast" role="status">🎉 {toast}</div> : null}
        </>
    );
}
