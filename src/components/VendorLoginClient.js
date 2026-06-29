"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function VendorLoginClient() {
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
            const response = await fetch("/api/marketplace/vendor/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Login failed.");
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
                <h1>Vendor Portal</h1>
                <p>Sign in to manage your marketplace inventory.</p>
            </section>

            <section className="card">
                <form className="contact-form" onSubmit={submit}>
                    <label htmlFor="v-email">Email</label>
                    <input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <label htmlFor="v-password">Password</label>
                    <input id="v-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <button className="button primary" type="submit" disabled={submitting}>
                        {submitting ? "Signing in..." : "Sign in"}
                    </button>
                    {error ? <p className="muted">{error}</p> : null}
                </form>
                <p className="muted">
                    Not a vendor yet? <Link href="/marketplace/apply">Apply to sell →</Link>
                </p>
            </section>
        </div>
    );
}
