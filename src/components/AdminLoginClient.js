"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginClient({ noAccessName }) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const response = await fetch("/api/marketplace/admin/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                const map = {
                    invalid_credentials: "Incorrect email or password.",
                    too_many_attempts: "Too many attempts. Try again in a few minutes.",
                    missing_credentials: "Enter your email and password.",
                };
                throw new Error(map[data?.error] || "Login failed.");
            }

            router.refresh();
        } catch (err) {
            setError(err?.message || "Login failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Marketplace Admin</h1>
                <p>Sign in with your Wolf Den owner account — the same email and password as the phone app.</p>
            </section>

            {noAccessName ? (
                <section className="card">
                    <p className="muted">
                        You&apos;re signed in as <strong>{noAccessName}</strong>, but this account doesn&apos;t have
                        marketplace access. Sign in with an account that has the <code>marketplace.manage</code> permission.
                    </p>
                </section>
            ) : null}

            <section className="card">
                <form className="contact-form" onSubmit={submit}>
                    <label htmlFor="admin-email">Email</label>
                    <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <label htmlFor="admin-password">Password</label>
                    <input
                        id="admin-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button className="button primary" type="submit" disabled={submitting}>
                        {submitting ? "Signing in..." : "Sign in"}
                    </button>
                    {error ? <p className="muted">{error}</p> : null}
                </form>
            </section>
        </div>
    );
}
