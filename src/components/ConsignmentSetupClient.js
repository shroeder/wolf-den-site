"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SetupPortalClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [tokenStatus, setTokenStatus] = useState(token ? "checking" : "missing");
    const [tokenStatusError, setTokenStatusError] = useState("");

    useEffect(() => {
        let isCancelled = false;

        if (!token) {
            return () => {
                isCancelled = true;
            };
        }

        async function checkTokenStatus() {
            try {
                const response = await fetch(`/api/consignment/setup?token=${encodeURIComponent(token)}`, {
                    method: "GET",
                    cache: "no-store",
                });
                const data = await response.json().catch(() => ({}));

                if (isCancelled) {
                    return;
                }

                if (response.ok && data?.status === "already_setup" && data?.slug) {
                    router.replace(`/consign/${data.slug}`);
                    return;
                }

                if (response.ok) {
                    setTokenStatus("ready");
                    return;
                }

                setTokenStatusError(data?.error || "Setup link is no longer valid.");
                setTokenStatus("invalid");
            } catch {
                if (!isCancelled) {
                    setTokenStatus("ready");
                }
            }
        }

        checkTokenStatus();

        return () => {
            isCancelled = true;
        };
    }, [token, router]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");

        if (!token) {
            setError("Setup token is missing. Please check your email link.");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch("/api/consignment/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Setup failed. Please try again.");
                return;
            }

            if (data?.alreadySetup && data?.slug) {
                router.push(`/consign/${data.slug}`);
                return;
            }

            setSuccess(true);
            setPassword("");
            setConfirmPassword("");

            setTimeout(() => {
                router.push(`/consign/${data.slug}`);
            }, 1500);
        } catch {
            setError("Unable to set up portal right now.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!token) {
        return (
            <div className="consignment-portal stack compact">
                <section className="card consignment-auth">
                    <h2>Invalid Setup Link</h2>
                    <p className="secondary">The setup link is missing or invalid. Please check your email for the correct link.</p>
                </section>
            </div>
        );
    }

    if (tokenStatus === "checking") {
        return (
            <div className="consignment-portal stack compact">
                <section className="card consignment-auth">
                    <h2>Checking Setup Link</h2>
                    <p className="secondary">One moment while we verify your setup link...</p>
                </section>
            </div>
        );
    }

    if (tokenStatus === "invalid") {
        return (
            <div className="consignment-portal stack compact">
                <section className="card consignment-auth">
                    <h2>Invalid Setup Link</h2>
                    <p className="secondary">{tokenStatusError}</p>
                </section>
            </div>
        );
    }

    if (success) {
        return (
            <div className="consignment-portal stack compact">
                <section className="card consignment-auth">
                    <h2>✓ Portal Ready</h2>
                    <p className="secondary">Your password has been set. Redirecting to your dashboard...</p>
                </section>
            </div>
        );
    }

    return (
        <div className="consignment-portal stack compact">
            <section className="consignment-hero card reveal">
                <p className="eyebrow">Portal Setup</p>
                <h1>Set Your Password</h1>
                <p className="lead consignment-lead">
                    Create a secure password to access your consignment portal.
                </p>
            </section>

            <section className="card consignment-auth">
                <h2>Create Password</h2>
                <p className="secondary">Your password must be at least 8 characters long.</p>
                <form className="consignment-auth-form" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="setup-password">Password</label>
                        <input
                            id="setup-password"
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="setup-confirm-password">Confirm Password</label>
                        <input
                            id="setup-confirm-password"
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button className="button primary" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Setting up..." : "Set Password & Continue"}
                    </button>
                </form>
                {error ? <p className="consignment-error">{error}</p> : null}
            </section>
        </div>
    );
}
