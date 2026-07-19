"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

// Marketplace BUYER login for the web — the SAME mkt_buyer account the app uses (sets a web cookie).
// Separate from the flag-gated /shop account system.
export default function MarketplaceLoginClient({ redirectTo = "/marketplace/profile" }) {
    const searchParams = useSearchParams();
    // Hard navigation (not router.push) after auth so EVERY server component + the header re-reads the new
    // session cookie immediately — otherwise you look logged-out until a manual refresh.
    const goAfterAuth = () => window.location.assign(redirectTo);
    // Land straight on the sign-up form when linked from a "create account" CTA (?signup=1).
    const [mode, setMode] = useState(searchParams?.get("signup") ? "register" : "login"); // login | register | verify | forgot
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
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
        // Read the ACTUAL field values from the form, not just React state. Browser autofill can populate
        // the DOM without firing React's onChange, which would otherwise submit a blank email/password and
        // cause a bogus "invalid credentials" / no-email-sent. DOM value wins; state is the fallback.
        const els = e.currentTarget.elements;
        const emailVal = String(els.username?.value ?? email ?? "").trim();
        const passVal = String(els.password?.value ?? password ?? "");
        const codeVal = String(els.code?.value ?? code ?? "").trim();
        const nameVal = String(els.fullname?.value ?? displayName ?? "").trim();
        const firstVal = String(els.firstname?.value ?? firstName ?? "").trim();
        const lastVal = String(els.lastname?.value ?? lastName ?? "").trim();
        // Keep state in sync so the follow-up verify step (and the UI) use the same values.
        if (emailVal !== email) setEmail(emailVal);
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            if (mode === "login") {
                const { ok, d } = await post("/api/marketplace/auth/login", { email: emailVal, password: passVal });
                if (d.needsVerification) {
                    setMode("verify");
                    setInfo("We emailed you a code to verify your account.");
                } else if (ok && d.ok) {
                    goAfterAuth();
                } else {
                    setError(d.error || "Sign in failed.");
                }
            } else if (mode === "register") {
                if (!firstVal || !lastVal) { setError("Enter your first and last name."); setBusy(false); return; }
                const { ok, d } = await post("/api/marketplace/auth/register", { email: emailVal, password: passVal, displayName: nameVal, firstName: firstVal, lastName: lastVal });
                if (ok) {
                    setMode("verify");
                    setInfo("We emailed you a 6-digit code.");
                } else {
                    setError(d.error || "Sign up failed.");
                }
            } else if (mode === "forgot") {
                // Always shows the same confirmation (never reveals whether the email is registered).
                await post("/api/marketplace/auth/forgot", { email: emailVal });
                setInfo("If that email has an account, we've sent a password reset link. Check your inbox.");
            } else {
                const { ok, d } = await post("/api/marketplace/auth/verify", { email: emailVal, code: codeVal });
                if (ok && d.ok) {
                    goAfterAuth();
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
                <h1>{mode === "register" ? "Create your account" : mode === "verify" ? "Verify your email" : mode === "forgot" ? "Reset your password" : "Sign in"}</h1>
                <p className="muted">
                    {mode === "forgot"
                        ? "Enter your account email and we'll send you a link to set a new password."
                        : "The same account you use in the Wolf Den Marketplace app — for buy orders and messages."}
                </p>
                <form onSubmit={submit} className="stack" style={{ gap: 10, marginTop: 14 }}>
                    {mode === "verify" ? (
                        <input name="code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" />
                    ) : mode === "forgot" ? (
                        <input type="email" name="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                    ) : (
                        <>
                            {mode === "register" ? (
                                <>
                                    <div style={{ display: "flex", gap: 10 }}>
                                        <input name="firstname" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required style={{ flex: 1 }} />
                                        <input name="lastname" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required style={{ flex: 1 }} />
                                    </div>
                                    <input name="fullname" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
                                </>
                            ) : null}
                            <input type="email" name="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                            <input type="password" name="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required />
                        </>
                    )}
                    {error ? <p style={{ color: "#e66" }}>{error}</p> : null}
                    {info ? <p className="muted">{info}</p> : null}
                    <button type="submit" className="button primary" style={{ width: "100%" }} disabled={busy}>
                        {busy ? "…" : mode === "register" ? "Create account" : mode === "verify" ? "Verify" : mode === "forgot" ? "Send reset link" : "Sign in"}
                    </button>
                </form>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                    {mode === "login" ? (
                        <>
                            <button type="button" style={linkStyle} onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}>Forgot password?</button>
                            <button type="button" style={linkStyle} onClick={() => { setMode("register"); setError(null); setInfo(null); }}>New here? Create an account</button>
                        </>
                    ) : (
                        <button type="button" style={linkStyle} onClick={() => { setMode("login"); setError(null); setInfo(null); }}>
                            {mode === "forgot" ? "← Back to sign in" : "Have an account? Sign in"}
                        </button>
                    )}
                </div>
            </section>
        </div>
    );
}
