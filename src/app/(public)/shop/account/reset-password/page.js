"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function ShopResetPasswordPageContent() {
    const searchParams = useSearchParams();
    const token = useMemo(() => String(searchParams?.get("token") || "").trim(), [searchParams]);
    const initialEmail = useMemo(() => String(searchParams?.get("email") || "").trim(), [searchParams]);

    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    const hasToken = Boolean(token);

    const handleRequestReset = async (event) => {
        event.preventDefault();
        if (!email.trim()) {
            setError("Enter your email address.");
            return;
        }

        setBusy(true);
        setStatus("");
        setError("");

        try {
            const response = await fetch("/api/shop/auth/password-reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "request", email }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || "Could not request reset link.");
            }
            setStatus(payload?.message || "If an account exists, a reset link has been sent.");
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not request reset link.");
        } finally {
            setBusy(false);
        }
    };

    const handleConfirmReset = async (event) => {
        event.preventDefault();
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setBusy(true);
        setStatus("");
        setError("");

        try {
            const response = await fetch("/api/shop/auth/password-reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "confirm", token, password, email }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || "Could not reset password.");
            }

            // Full navigation so the new session cookie the API just set takes effect immediately — the
            // header and My Orders render as signed-in without the user having to manually refresh.
            setStatus("Password reset complete. Signing you in…");
            window.location.assign("/shop/orders");
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not reset password.");
            setBusy(false);
        }
    };

    return (
        <section className="card cart-page-shell">
            <h1>Reset password</h1>

            {hasToken ? (
                // Confirm step. The token rides along in a hidden field — never shown — so browsers don't
                // mistake it for the username. The email is the username so the saved credential is
                // email + new password.
                <form className="stack" onSubmit={handleConfirmReset}>
                    <p className="secondary">Choose a new password for your account.</p>
                    <input type="hidden" name="token" value={token} readOnly />
                    <label className="cart-field cart-field-full">
                        <span>Email</span>
                        <input
                            type="email"
                            name="username"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="username"
                            readOnly={Boolean(initialEmail)}
                            placeholder="you@example.com"
                        />
                    </label>
                    <label className="cart-field cart-field-full">
                        <span>New password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                        />
                    </label>
                    <label className="cart-field cart-field-full">
                        <span>Confirm new password</span>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                        />
                    </label>
                    <button type="submit" className="button primary" disabled={busy}>
                        {busy ? "Resetting..." : "Set new password & sign in"}
                    </button>
                </form>
            ) : (
                <form className="stack" onSubmit={handleRequestReset}>
                    <p className="secondary">Enter your email and we&apos;ll send you a reset link.</p>
                    <label className="cart-field cart-field-full">
                        <span>Email address</span>
                        <input
                            type="email"
                            name="username"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="username"
                        />
                    </label>
                    <button type="submit" className="button primary" disabled={busy}>
                        {busy ? "Sending..." : "Email me a reset link"}
                    </button>
                </form>
            )}

            {status ? <p className="shop-payment-success">{status}</p> : null}
            {error ? <p className="shop-payment-error">{error}</p> : null}
        </section>
    );
}

export default function ShopResetPasswordPage() {
    return (
        <Suspense fallback={<section className="card cart-page-shell"><h1>Reset password</h1><p className="secondary">Loading...</p></section>}>
            <ShopResetPasswordPageContent />
        </Suspense>
    );
}
