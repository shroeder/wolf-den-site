"use client";

import { useEffect, useState } from "react";

// A gentle first-visit "how it works" card so new players know what to do (sailing + farming adoption was low
// because the loop wasn't obvious). Shows once per browser, then collapses to a small "How it works" pill you
// can reopen anytime. Bump the `id` to re-show after a redesign.
export default function HowToPlay({ id, emoji = "❔", title = "this", tagline = "", steps = [], accent = "#4abd6a" }) {
    const key = `wolfden-howto-${id}`;
    const [open, setOpen] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let seen = false;
        try {
            seen = Boolean(localStorage.getItem(key));
        } catch {
            seen = false;
        }
        // Hydration-safe: server can't read localStorage, so we decide visibility on the client after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpen(!seen);
        setReady(true);
    }, [key]);

    const dismiss = () => {
        try {
            localStorage.setItem(key, "1");
        } catch {
            /* private mode — just close */
        }
        setOpen(false);
    };

    if (!ready) return null;

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                style={{
                    display: "inline-flex", alignItems: "center", gap: 6, margin: "0 0 10px", padding: "6px 12px",
                    borderRadius: 999, border: `1px solid ${accent}55`, background: `${accent}14`, color: accent,
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}
            >
                ❔ How {title} works
            </button>
        );
    }

    return (
        <div
            style={{
                position: "relative", margin: "0 0 14px", padding: "16px 16px 14px", borderRadius: 16,
                background: `linear-gradient(180deg, ${accent}1f, rgba(255,255,255,0.02))`,
                border: `1px solid ${accent}66`, boxShadow: `0 6px 22px ${accent}14`,
            }}
        >
            <button
                type="button" onClick={dismiss} aria-label="Dismiss"
                style={{ position: "absolute", top: 8, right: 10, width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.08)", color: "#cfe8d6", fontSize: 15, cursor: "pointer", lineHeight: 1 }}
            >×</button>
            <div style={{ fontWeight: 900, fontSize: "1.02rem", color: "#f2fff6" }}>{emoji} New to {title}? Here&apos;s how it works</div>
            {tagline ? <p style={{ margin: "3px 0 10px", fontSize: "0.88rem", color: "#c3d8ca" }}>{tagline}</p> : <div style={{ height: 8 }} />}
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {steps.map((s, i) => (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ flex: "0 0 auto", width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: accent, color: "#0f1a13", fontWeight: 900, fontSize: 12 }}>{i + 1}</span>
                        <span style={{ fontSize: "0.9rem", lineHeight: 1.4, color: "#dcecdf", paddingTop: 1 }}>{s}</span>
                    </li>
                ))}
            </ol>
            <button
                type="button" onClick={dismiss}
                style={{ marginTop: 14, width: "100%", padding: "11px 12px", borderRadius: 11, border: "none", fontWeight: 900, fontSize: "0.95rem", color: "#0f1a13", background: `linear-gradient(180deg, ${accent}, ${accent}cc)`, cursor: "pointer" }}
            >
                Got it — let&apos;s go
            </button>
        </div>
    );
}
