"use client";

import { useEffect, useState } from "react";

// One-time feature-launch announcement, shown once per browser to signed-in members. To announce a NEW
// feature later, change SEEN_KEY (a new key re-shows it to everyone) and update the copy below.
const SEEN_KEY = "wolfden-feature-farm-launch-2026-07";

export default function FeatureModal() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        let alive = true;
        let timer = null;
        (async () => {
            try {
                if (localStorage.getItem(SEEN_KEY)) return; // already dismissed this announcement
            } catch {
                return;
            }
            // Only signed-in members get the in-game announcement.
            const r = await fetch("/api/marketplace/auth/me", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (!alive || !d?.buyer) return;
            timer = setTimeout(() => alive && setShow(true), 1100); // let the page settle first
        })();
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
    }, []);

    const dismiss = () => {
        try {
            localStorage.setItem(SEEN_KEY, "1");
        } catch {
            /* private mode — just close */
        }
        setShow(false);
    };

    if (!show) return null;

    return (
        <div
            role="dialog"
            aria-label="New feature: The Farm"
            onClick={dismiss}
            style={{
                position: "fixed", inset: 0, zIndex: 10060, display: "grid", placeItems: "center", padding: 18,
                background: "rgba(4,8,6,0.72)", backdropFilter: "blur(3px)", animation: "featModalIn .28s ease both",
            }}
        >
            <style>{`
                @keyframes featModalIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes featCardIn { from { opacity: 0; transform: translateY(14px) scale(.96) } to { opacity: 1; transform: none } }
                @keyframes featGlow { 0%,100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(74,189,106,.5)) } 50% { transform: scale(1.06); filter: drop-shadow(0 0 22px rgba(74,189,106,.8)) } }
            `}</style>
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxWidth: 380, borderRadius: 20, overflow: "hidden", position: "relative",
                    background: "linear-gradient(180deg,#16241a,#0f1a13)", border: "1px solid rgba(74,189,106,0.5)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6), 0 0 40px rgba(74,189,106,0.15)",
                    animation: "featCardIn .4s cubic-bezier(.2,.9,.3,1.2) both",
                }}
            >
                <button
                    type="button" onClick={dismiss} aria-label="Close"
                    style={{ position: "absolute", top: 10, right: 12, zIndex: 2, width: 30, height: 30, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.08)", color: "#cfe8d6", fontSize: 17, cursor: "pointer", lineHeight: 1 }}
                >×</button>

                {/* Header band */}
                <div style={{ padding: "26px 20px 16px", textAlign: "center", background: "radial-gradient(120% 90% at 50% 0%, rgba(74,189,106,0.22), transparent 70%)" }}>
                    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", color: "#0f1a13", background: "linear-gradient(180deg,#7ee29a,#4abd6a)", padding: "4px 12px", borderRadius: 999, textTransform: "uppercase" }}>✨ New</span>
                    <div style={{ fontSize: 58, lineHeight: 1, margin: "12px 0 6px", animation: "featGlow 2.4s ease-in-out infinite" }}>🏡</div>
                    <h2 style={{ margin: "4px 0 0", fontSize: "1.5rem", fontWeight: 900, color: "#eafff0" }}>The Farm is Open!</h2>
                </div>

                {/* Body */}
                <div style={{ padding: "6px 22px 8px" }}>
                    <p style={{ margin: "0 0 14px", fontSize: "0.96rem", lineHeight: 1.5, color: "#c3d8ca", textAlign: "center" }}>
                        Your pets now roam a farm of your very own. Plant &amp; grow crops, deck it out with decorations,
                        pet your companions for XP, and watch for the Wild Loot Pig. Seeds drop from everything you do —
                        go make it yours.
                    </p>
                    <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 7 }}>
                        {[["🌱", "Plant & harvest crops"], ["🐾", "Pet your companions for XP"], ["🪴", "Decorate your pasture"], ["🐷", "Catch the Wild Loot Pig"]].map(([e, t]) => (
                            <li key={t} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", color: "#d7ead0", fontWeight: 600 }}>
                                <span style={{ fontSize: 18 }} aria-hidden="true">{e}</span>
                                <span>{t}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Actions */}
                <div style={{ padding: "0 22px 22px", display: "grid", gap: 8 }}>
                    <a
                        href="/marketplace/farm" onClick={dismiss}
                        style={{ display: "block", textAlign: "center", padding: "13px 16px", borderRadius: 12, fontWeight: 900, fontSize: "1rem", color: "#0f1a13", background: "linear-gradient(180deg,#7ee29a,#4abd6a)", textDecoration: "none", boxShadow: "0 4px 0 #2f8f52" }}
                    >
                        🏡 Visit your farm
                    </a>
                    <button type="button" onClick={dismiss} style={{ padding: "9px", borderRadius: 12, border: "none", background: "transparent", color: "#9bb3a2", fontWeight: 700, fontSize: "0.86rem", cursor: "pointer" }}>
                        Maybe later
                    </button>
                </div>
            </div>
        </div>
    );
}
