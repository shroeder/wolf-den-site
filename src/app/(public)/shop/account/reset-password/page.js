"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ShopResetPasswordPage() {
    const searchParams = useSearchParams();
    const initialToken = useMemo(() => String(searchParams?.get("token") || "").trim(), [searchParams]);

    const [token, setToken] = useState(initialToken);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    const hasToken = Boolean(String(token || "").trim());

    const handleRequestReset = async () => {
        if (!String(email || "").trim()) {
            setError("Enter your email address.");
            return;
        }

        setBusy(true);
        setStatus("");
        setError("");

        try {
            const response = await fetch("/api/shop/auth/password-reset", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mode: "request",
                    email,
                }),
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

    const handleConfirmReset = async () => {
        if (!hasToken) {
            setError("Missing reset token.");
            return;
        }

        if (String(password || "").length < 8) {
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
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mode: "confirm",
                    token,
                    password,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || "Could not reset password.");
            }

            setStatus("Password reset complete. You are now signed in.");
            setPassword("");
            setConfirmPassword("");
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not reset password.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="card cart-page-shell">
            <h1>Reset password</h1>
            <p className="secondary">Use your reset link or request a new one.</p>

            <label className="cart-field cart-field-full">
                <span>Reset token (from email link)</span>
                <input
                    type="text"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    autoComplete="off"
                />
            </label>

            {hasToken ? (
                <>
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
                    <button type="button" className="button primary" onClick={handleConfirmReset} disabled={busy}>
                        {busy ? "Resetting..." : "Set new password"}
                    </button>
                </>
            ) : (
                <>
                    <label className="cart-field cart-field-full">
                        <span>Email address</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                        />
                    </label>
                    <button type="button" className="button primary" onClick={handleRequestReset} disabled={busy}>
                        {busy ? "Sending..." : "Email me a reset link"}
                    </button>
                </>
            )}

            {status ? <p className="shop-payment-success">{status}</p> : null}
            {error ? <p className="shop-payment-error">{error}</p> : null}
        </section>
    );
}
