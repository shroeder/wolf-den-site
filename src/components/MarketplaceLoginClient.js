"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Marketplace BUYER login for the web — the SAME mkt_buyer account the app uses (sets a web cookie).
// Separate from the flag-gated /shop account system.
export default function MarketplaceLoginClient({ redirectTo = "/marketplace/messages" }) {
    const router = useRouter();
    const [mode, setMode] = useState("login"); // login | register | verify
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);

    async function post(url, body) {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await res.json().catch(() => ({}));
        return { ok: res.ok, d };
    }

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            if (mode === "login") {
                const { ok, d } = await post("/api/marketplace/auth/login", { email, password });
                if (d.needsVerification) {
                    setMode("verify");
                    setInfo("We emailed you a code to verify your account.");
                } else if (ok && d.ok) {
                    router.push(redirectTo);
                    router.refresh();
                } else {
                    setError(d.error || "Sign in failed.");
                }
            } else if (mode === "register") {
                const { ok, d } = await post("/api/marketplace/auth/register", { email, password, displayName });
                if (ok) {
                    setMode("verify");
                    setInfo("We emailed you a 6-digit code.");
                } else {
                    setError(d.error || "Sign up failed.");
                }
            } else {
                const { ok, d } = await post("/api/marketplace/auth/verify", { email, code });
                if (ok && d.ok) {
                    router.push(redirectTo);
                    router.refresh();
                } else {
                    setError(d.error || "Invalid or expired code.");
                }
            }
        } finally {
            setBusy(false);
        }
    }

    const linkStyle = { background: "none", border: "none", color: "#D4AF37", cursor: "pointer", padding: 0, textDecoration: "underline" };

    return (
        <div className="stack reveal">
            <section className="card" style={{ maxWidth: 440, margin: "0 auto" }}>
                <h1>{mode === "register" ? "Create your account" : mode === "verify" ? "Verify your email" : "Sign in"}</h1>
                <p className="muted">The same account you use in the Wolf Den Marketplace app — for buy orders and messages.</p>
                <form onSubmit={submit} className="stack" style={{ gap: 10, marginTop: 14 }}>
                    {mode === "verify" ? (
                        <input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
                    ) : (
                        <>
                            {mode === "register" ? (
                                <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                            ) : null}
                            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </>
                    )}
                    {error ? <p style={{ color: "#e66" }}>{error}</p> : null}
                    {info ? <p className="muted">{info}</p> : null}
                    <button type="submit" className="pill" disabled={busy}>
                        {busy ? "…" : mode === "register" ? "Create account" : mode === "verify" ? "Verify" : "Sign in"}
                    </button>
                </form>
                <div style={{ marginTop: 12 }}>
                    {mode === "login" ? (
                        <button type="button" style={linkStyle} onClick={() => { setMode("register"); setError(null); }}>New here? Create an account</button>
                    ) : (
                        <button type="button" style={linkStyle} onClick={() => { setMode("login"); setError(null); }}>Have an account? Sign in</button>
                    )}
                </div>
            </section>
        </div>
    );
}
