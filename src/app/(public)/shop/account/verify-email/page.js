"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function ShopVerifyEmailPageContent() {
    const searchParams = useSearchParams();
    const initialToken = useMemo(() => String(searchParams?.get("token") || "").trim(), [searchParams]);

    const [token, setToken] = useState(initialToken);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    const handleVerify = async () => {
        if (!String(token || "").trim()) {
            setError("Paste your verification token or use the full email link.");
            return;
        }

        setBusy(true);
        setStatus("");
        setError("");

        try {
            const response = await fetch("/api/shop/auth/verify-email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mode: "confirm",
                    token,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || "Could not verify email.");
            }

            setStatus("Email verified. You are now signed in and can continue checkout.");
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "Could not verify email.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="card cart-page-shell">
            <h1>Verify your email</h1>
            <p className="secondary">Use the link from your inbox to verify your shop account.</p>

            <label className="cart-field cart-field-full">
                <span>Verification token</span>
                <input
                    type="text"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    autoComplete="off"
                />
            </label>

            <button type="button" className="button primary" onClick={handleVerify} disabled={busy}>
                {busy ? "Verifying..." : "Verify email"}
            </button>

            {status ? <p className="shop-payment-success">{status}</p> : null}
            {error ? <p className="shop-payment-error">{error}</p> : null}

            <p className="secondary">
                Need a new verification email? Go back to <Link href="/cart">cart sign-in</Link> and sign in once to resend.
            </p>
        </section>
    );
}

export default function ShopVerifyEmailPage() {
    return (
        <Suspense fallback={<section className="card cart-page-shell"><h1>Verify your email</h1><p className="secondary">Loading...</p></section>}>
            <ShopVerifyEmailPageContent />
        </Suspense>
    );
}
