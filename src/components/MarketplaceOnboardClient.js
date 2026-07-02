"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MarketplaceOnboardClient({ token, vendor }) {
    const router = useRouter();
    const [displayName, setDisplayName] = useState(vendor.displayName || "");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [address, setAddress] = useState({
        line1: vendor.address?.line1 || "",
        city: vendor.address?.city || "",
        region: vendor.address?.region || "",
        postalCode: vendor.address?.postalCode || "",
        locationLabel: vendor.locationLabel || "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    function updateAddress(field) {
        return (event) => setAddress((prev) => ({ ...prev, [field]: event.target.value }));
    }

    async function submit(event) {
        event.preventDefault();
        setError("");

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            setError("Passwords don't match.");
            return;
        }

        setSubmitting(true);

        try {
            const response = await fetch("/api/marketplace/onboard", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, password, displayName, address }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not finish setup.");
            }

            router.push("/marketplace/portal");
        } catch (err) {
            setError(err?.message || "Could not finish setup.");
            setSubmitting(false);
        }
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Set up your storefront</h1>
                <p>
                    Welcome, {vendor.displayName || vendor.email}. Choose a password and confirm your location, then
                    you can start listing inventory.
                </p>
            </section>

            <section className="card">
                <form className="contact-form mkt-apply-form" onSubmit={submit}>
                    <label htmlFor="ob-name">Storefront name</label>
                    <input id="ob-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />

                    <label htmlFor="ob-password">Password</label>
                    <input id="ob-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

                    <label htmlFor="ob-confirm">Confirm password</label>
                    <input id="ob-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />

                    <label htmlFor="ob-line1">Street address</label>
                    <input id="ob-line1" type="text" value={address.line1} onChange={updateAddress("line1")} />
                    <p className="muted">
                        Kept private — used only to place an approximate (~1 mile) pin on the map. Buyers never see
                        your exact address; they only see your display location below.
                    </p>

                    <label htmlFor="ob-city">City</label>
                    <input id="ob-city" type="text" value={address.city} onChange={updateAddress("city")} />

                    <label htmlFor="ob-region">State</label>
                    <input id="ob-region" type="text" value={address.region} onChange={updateAddress("region")} />

                    <label htmlFor="ob-zip">ZIP</label>
                    <input id="ob-zip" type="text" value={address.postalCode} onChange={updateAddress("postalCode")} />

                    <label htmlFor="ob-label">Display location (shown to buyers)</label>
                    <input id="ob-label" type="text" value={address.locationLabel} onChange={updateAddress("locationLabel")} placeholder="e.g. Sacramento, CA" />

                    <button className="button primary" type="submit" disabled={submitting}>
                        {submitting ? "Setting up..." : "Finish setup"}
                    </button>
                    {error ? <p className="muted">{error}</p> : null}
                </form>
            </section>
        </div>
    );
}
