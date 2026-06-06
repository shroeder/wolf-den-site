"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const PAYMENT_TOGGLE_STORAGE_KEY = "wolfden-payments-test-enabled";

function isLocalPaymentsEnabled() {
    try {
        return window.localStorage.getItem(PAYMENT_TOGGLE_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export default function ShopAccountPage() {
    const [localToggleEnabled, setLocalToggleEnabled] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }

        return isLocalPaymentsEnabled();
    });
    const [busy, setBusy] = useState(false);
    const [customer, setCustomer] = useState(null);
    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [trustDevice, setTrustDevice] = useState(true);
    const [twoFactorPending, setTwoFactorPending] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");

    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

    useEffect(() => {
        const onStorage = () => {
            setLocalToggleEnabled(isLocalPaymentsEnabled());
        };

        window.addEventListener("storage", onStorage);

        return () => window.removeEventListener("storage", onStorage);
    }, []);

    useEffect(() => {
        if (!paymentsEnabled || !localToggleEnabled) {
            return;
        }

        const loadSession = async () => {
            setBusy(true);
            setError("");

            try {
                const response = await fetch("/api/shop/auth", { cache: "no-store" });
                const payload = await response.json().catch(() => null);

                if (!response.ok || !payload) {
                    throw new Error("Could not load account status.");
                }

                setCustomer(payload.authenticated ? payload.customer : null);
                setTwoFactorPending(payload?.twoFactorPending === true);
            } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "Could not load account status.");
                setCustomer(null);
                setTwoFactorPending(false);
            } finally {
                setBusy(false);
            }
        };

        loadSession();
    }, [paymentsEnabled, localToggleEnabled]);

    const handleAuthSubmit = async () => {
        if (!String(email || "").trim() || !String(password || "").trim()) {
            setError("Enter email and password.");
            return;
        }

        setBusy(true);
        setError("");
        setStatus("");

        try {
            const response = await fetch("/api/shop/auth", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mode,
                    email,
                    password,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || "Could not sign in.");
            }

            if (payload?.requiresEmailVerification) {
                setCustomer(null);
                setPassword("");
                setStatus(payload?.message || "Account created. Check email to verify.");
                return;
            }

            if (payload?.requiresTwoFactor) {
                setCustomer(null);
                setTwoFactorPending(true);
                setPassword("");
                setStatus(payload?.message || "Check your email for a sign-in code.");
                return;
            }

            setCustomer(payload.customer || null);
            setTwoFactorPending(false);
            setPassword("");
            setStatus(mode === "register" ? "Account ready." : "Signed in successfully.");
            window.dispatchEvent(new CustomEvent("wolfden-shop-cart-updated"));
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not sign in.");
        } finally {
            setBusy(false);
        }
    };

    const handleLogout = async () => {
        setBusy(true);
        setError("");
        setStatus("");

        try {
            await fetch("/api/shop/auth", {
                method: "DELETE",
            });

            setCustomer(null);
            setTwoFactorPending(false);
            setStatus("Signed out.");
            window.dispatchEvent(new CustomEvent("wolfden-shop-cart-updated"));
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not sign out.");
        } finally {
            setBusy(false);
        }
    };

    const handleTwoFactorSubmit = async () => {
        if (!/^\d{6}$/.test(String(twoFactorCode || "").trim())) {
            setError("Enter the 6-digit sign-in code.");
            return;
        }

        setBusy(true);
        setError("");
        setStatus("");

        try {
            const response = await fetch("/api/shop/auth/2fa", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    code: twoFactorCode,
                    trustDevice,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || "Could not verify sign-in code.");
            }

            setCustomer(payload.customer || null);
            setTwoFactorPending(false);
            setTwoFactorCode("");
            setStatus("Signed in successfully.");
            window.dispatchEvent(new CustomEvent("wolfden-shop-cart-updated"));
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not verify sign-in code.");
        } finally {
            setBusy(false);
        }
    };

    if (!paymentsEnabled) {
        return (
            <section className="card cart-page-shell">
                <h1>Account</h1>
                <p className="secondary">Online shop account tools are currently unavailable.</p>
            </section>
        );
    }

    if (!localToggleEnabled) {
        return (
            <section className="card cart-page-shell">
                <h1>Account</h1>
                <p className="secondary">Shop account features are hidden by local test flag.</p>
            </section>
        );
    }

    return (
        <section className="cart-page-shell">
            <article className="card cart-hero-card">
                <h1>My Account</h1>
                <p className="secondary">Sign in or create an account to keep your cart and shipping profile linked across sessions.</p>
            </article>

            <article className="card cart-checkout-card">
                {customer ? (
                    <div className="cart-account-panel">
                        <p className="cart-fulfillment-label">Signed in</p>
                        <p className="secondary">You are signed in as <strong>{customer.email}</strong>.</p>
                        <div className="cart-account-row">
                            <button type="button" className="button" onClick={handleLogout} disabled={busy}>
                                {busy ? "Signing out..." : "Sign out"}
                            </button>
                            <Link href="/cart" className="button primary">Back to checkout</Link>
                        </div>
                    </div>
                ) : twoFactorPending ? (
                    <div className="cart-account-panel">
                        <p className="cart-fulfillment-label">Two-factor verification</p>
                        <p className="secondary">Enter the 6-digit code sent to your email.</p>
                        <label className="cart-field cart-field-full">
                            <span>Sign-in code</span>
                            <input
                                type="text"
                                value={twoFactorCode}
                                onChange={(event) => setTwoFactorCode(event.target.value)}
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                maxLength={6}
                            />
                        </label>
                        <label className="cart-save-profile-toggle">
                            <input
                                type="checkbox"
                                checked={trustDevice}
                                onChange={(event) => setTrustDevice(event.target.checked)}
                            />
                            <span>Trust this device for 30 days</span>
                        </label>
                        <button type="button" className="button primary" onClick={handleTwoFactorSubmit} disabled={busy}>
                            {busy ? "Verifying..." : "Verify code"}
                        </button>
                    </div>
                ) : (
                    <div className="cart-account-panel">
                        <p className="cart-fulfillment-label">Sign in</p>
                        <a href="/api/shop/auth/oauth/google/start" className="button" aria-label="Continue with Google">Continue with Google</a>
                        <p className="secondary">Or sign in with email and password:</p>
                        <div className="cart-account-mode-toggle" role="tablist" aria-label="Choose sign in or create account">
                            <button
                                type="button"
                                className={mode === "login" ? "cart-fulfillment-mode cart-fulfillment-mode-active" : "cart-fulfillment-mode"}
                                onClick={() => setMode("login")}
                                disabled={busy}
                            >
                                Sign in
                            </button>
                            <button
                                type="button"
                                className={mode === "register" ? "cart-fulfillment-mode cart-fulfillment-mode-active" : "cart-fulfillment-mode"}
                                onClick={() => setMode("register")}
                                disabled={busy}
                            >
                                Create account
                            </button>
                        </div>
                        <label className="cart-field cart-field-full">
                            <span>Email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoComplete="email"
                            />
                        </label>
                        <label className="cart-field cart-field-full">
                            <span>Password</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete={mode === "register" ? "new-password" : "current-password"}
                            />
                        </label>
                        <button type="button" className="button primary" onClick={handleAuthSubmit} disabled={busy}>
                            {busy ? "Working..." : mode === "register" ? "Create account" : "Sign in"}
                        </button>
                        <p className="secondary">Forgot your password? <Link href="/shop/account/reset-password">Reset it here</Link>.</p>
                    </div>
                )}

                {status ? <p className="shop-payment-success">{status}</p> : null}
                {error ? <p className="shop-payment-error">{error}</p> : null}
            </article>
        </section>
    );
}
