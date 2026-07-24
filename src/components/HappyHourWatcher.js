"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// Site-wide "Happy Hour is LIVE!" announcement. The moment an event is active, EVERY signed-in member gets a
// juicy gold modal explaining the ×N XP/gold surge + a recap of who chipped in to summon it. Shows once per
// event per device (keyed by event id), so it greets you when it starts but doesn't nag on every page.
const SEEN_KEY = "wolfden-hh-seen";

export default function HappyHourWatcher() {
    const [ev, setEv] = useState(null);
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    useScrollLock(open);
    useEffect(() => setMounted(true), []);

    useEffect(() => {
        let alive = true;
        const check = async () => {
            const r = await fetch("/api/marketplace/happy-hour", { cache: "no-store" }).catch(() => null);
            const d = r?.ok ? await r.json().catch(() => null) : null;
            if (!alive || !d?.active || !d.id) return;
            let seen = null;
            try { seen = localStorage.getItem(SEEN_KEY); } catch { /* private mode */ }
            if (seen === String(d.id)) return; // already celebrated this exact event here
            setEv(d); setOpen(true);
            try { localStorage.setItem(SEEN_KEY, String(d.id)); } catch { /* ignore */ }
        };
        check();
        // Catch the moment a rally donation tips it live (the donate flow fires hud-refresh).
        const onRefresh = () => check();
        window.addEventListener("wolfden-hud-refresh", onRefresh);
        return () => { alive = false; window.removeEventListener("wolfden-hud-refresh", onRefresh); };
    }, []);

    if (!mounted || !open || !ev) return null;
    const mins = Math.max(1, Math.round((ev.endsInSecs || 0) / 60));
    const donors = ev.donors || [];
    return createPortal((
        <div onClick={() => setOpen(false)} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10004, background: "radial-gradient(120% 100% at 50% 30%, rgba(60,45,8,0.78), rgba(0,0,0,0.72))", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Happy Hour is live" style={{ width: "100%", maxWidth: 360, maxHeight: "88dvh", overflowY: "auto", borderRadius: 20, border: "2px solid #ffd75e", background: "linear-gradient(180deg, #2a2410, #17181c)", boxShadow: "0 20px 70px rgba(0,0,0,0.6), 0 0 46px rgba(255,215,94,0.28)", animation: "pigPop .5s cubic-bezier(.2,1.2,.3,1) both", textAlign: "center" }}>
                <div style={{ padding: "22px 20px 6px", background: "radial-gradient(120% 90% at 50% 0%, rgba(255,215,94,0.3), transparent 70%)" }}>
                    <div style={{ fontSize: 48, lineHeight: 1 }}>⏰🎉</div>
                    <div style={{ fontWeight: 900, fontSize: 22, marginTop: 6, color: "#ffe9a8" }}>HAPPY HOUR!</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: "#ffd75e", textShadow: "0 2px 12px rgba(255,215,94,0.5)", marginTop: 2 }}>×{ev.multiplier} XP &amp; gold</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>
                        For the next <strong style={{ color: "#ffe9a8" }}>{mins} min</strong>, <strong>every</strong> XP and gold reward across the whole game is multiplied — boss strikes, spins, harvests, sailing, everything. Just play and cash in!
                    </div>
                </div>
                {donors.length ? (
                    <div style={{ padding: "6px 18px 4px", textAlign: "left" }}>
                        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, margin: "6px 0 6px" }}>🪙 Summoned by the pack</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {donors.map((d, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                    <span style={{ fontSize: 12, opacity: 0.7, width: 16 }}>{i + 1}.</span>
                                    <span style={{ flex: 1, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
                                    <span style={{ fontWeight: 800, color: "#ffd75e", fontSize: 13, whiteSpace: "nowrap" }}>+{d.gold.toLocaleString()} 🪙</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
                <div style={{ padding: "10px 18px 20px" }}>
                    <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", padding: 13, fontWeight: 900, background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#3a2c08", border: "none", borderRadius: 12, cursor: "pointer", boxShadow: "0 3px 0 #b57f22" }}>Let&apos;s go! 🚀</button>
                </div>
            </div>
        </div>
    ), document.body);
}
