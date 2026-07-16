"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function MarketplaceResetClient() {
    const token = useSearchParams().get("token") || "";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [status, setStatus] = useState("idle"); // idle | submitting | done
    const [error, setError] = useState("");

    // Fetch the account email so we can put it in a username field — this is what lets the browser's
    // password manager save the new password against the right account (instead of a blank username).
    useEffect(() => {
        if (!token) return;
        fetch(`/api/marketplace/auth/reset?token=${encodeURIComponent(token)}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => { if (d?.email) setEmail(d.email); })
            .catch(() => {});
    }, [token]);

    async function submit(e) {
        e.preventDefault();
        setError("");
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            setError("Passwords don't match.");
            return;
        }
        setStatus("submitting");
        try {
            const res = await fetch("/api/marketplace/auth/reset", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "Could not reset password.");
            setStatus("done");
        } catch (err) {
            setError(err?.message || "Could not reset password.");
            setStatus("idle");
        }
    }

    if (!token) {
        return (
            <section className="card">
                <h1>Reset password</h1>
                <p className="muted">This reset link is missing or expired.</p>
                <p>
                    <Link href="/marketplace/login" className="pill">
                        Back to sign in
                    </Link>{" "}
                    — use &ldquo;Forgot password?&rdquo; there to get a fresh link.
                </p>
            </section>
        );
    }

    if (status === "done") {
        return (
            <section className="card">
                <h1>Password updated</h1>
                <p>You can now sign in with your new password.</p>
                <p>
                    <Link href="/marketplace/login" className="button primary">
                        Sign in
                    </Link>
                </p>
            </section>
        );
    }

    return (
        <section className="card">
            <h1>Set a new password</h1>
            <form onSubmit={submit} className="contact-form">
                {/* Email as the username field so the browser saves the new password against this account. */}
                {email ? <label htmlFor="reset-email">Account</label> : null}
                <input
                    id="reset-email"
                    type="email"
                    name="username"
                    autoComplete="username"
                    value={email}
                    readOnly
                    style={email ? undefined : { display: "none" }}
                    aria-hidden={email ? undefined : true}
                    tabIndex={email ? undefined : -1}
                />
                <label htmlFor="pw">New password</label>
                <input id="pw" type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <label htmlFor="pw2">Confirm password</label>
                <input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {error ? <p className="muted">{error}</p> : null}
                <button type="submit" className="button primary" disabled={status === "submitting" || !password || !confirm}>
                    {status === "submitting" ? "Saving…" : "Update password"}
                </button>
            </form>
        </section>
    );
}
