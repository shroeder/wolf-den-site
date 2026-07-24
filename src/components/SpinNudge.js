"use client";

import { useEffect, useState } from "react";

// Welcome-back reminder on the game hub: if you have any spins waiting (today's free spin or bought/earned
// tokens), a dismissible banner nudges you to use them. Shows once per browser session, so it greets you when
// you come back but doesn't nag on every navigation. The free spin resets daily, so it returns each day.
export default function SpinNudge() {
    const [spins, setSpins] = useState(0);
    const [show, setShow] = useState(false);
    useEffect(() => {
        let alive = true;
        if (typeof window !== "undefined" && window.sessionStorage?.getItem("wd-spin-nudge") === "1") return () => { alive = false; };
        fetch("/api/marketplace/spin", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!alive || !d?.signedIn) return;
                const n = (d.freeAvailable ? 1 : 0) + (d.tokens || 0);
                if (n > 0) { setSpins(n); setShow(true); }
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    function dismiss() {
        setShow(false);
        if (typeof window !== "undefined") window.sessionStorage?.setItem("wd-spin-nudge", "1");
    }
    if (!show) return null;
    return (
        <a href="/marketplace/spin" onClick={dismiss} className="card" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit", borderColor: "rgba(255,215,94,0.5)", background: "linear-gradient(180deg, rgba(255,215,94,0.1), rgba(255,255,255,0.02))" }}>
            <span style={{ fontSize: 30 }} aria-hidden="true">🎡</span>
            <span style={{ flex: 1 }}>
                <strong>You have {spins} free spin{spins === 1 ? "" : "s"} waiting!</strong>
                <span className="muted" style={{ display: "block", fontSize: "0.9rem" }}>Spin the wheel for gold, XP, chests… and the jackpot.</span>
            </span>
            <span className="btn-gold" style={{ whiteSpace: "nowrap" }}>Spin now →</span>
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismiss(); }} aria-label="Dismiss" style={{ background: "none", border: "none", color: "inherit", fontSize: 18, cursor: "pointer", opacity: 0.6, padding: "0 4px" }}>×</button>
        </a>
    );
}
