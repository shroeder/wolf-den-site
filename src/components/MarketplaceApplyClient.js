"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const EMPTY = {
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    locationLabel: "",
    sells: "",
    links: "",
    notes: "",
    logoUrl: "",
};

export default function MarketplaceApplyClient() {
    const [form, setForm] = useState(EMPTY);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);
    const [vendor, setVendor] = useState(null);
    const [logoUploading, setLogoUploading] = useState(false);

    async function uploadLogo(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        setLogoUploading(true);
        setError("");
        try {
            const body = new FormData();
            body.append("file", file);
            const response = await fetch("/api/marketplace/apply/logo", { method: "POST", body });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || "Logo upload failed.");
            }
            setForm((prev) => ({ ...prev, logoUrl: data.url }));
        } catch (err) {
            setError(err?.message || "Logo upload failed.");
        } finally {
            setLogoUploading(false);
        }
    }

    // If they're already a signed-in vendor, send them to their portal instead of the apply form.
    useEffect(() => {
        let ignore = false;

        (async () => {
            try {
                const response = await fetch("/api/marketplace/vendor/me", { cache: "no-store" });
                const data = await response.json().catch(() => null);
                if (!ignore && response.ok && data?.vendor) {
                    setVendor(data.vendor);
                }
            } catch {
                /* not signed in — show the form */
            }
        })();

        return () => {
            ignore = true;
        };
    }, []);

    function update(field) {
        return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
    }

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const response = await fetch("/api/marketplace/apply", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not submit your application.");
            }

            setDone(true);
        } catch (err) {
            setError(err?.message || "Could not submit your application.");
        } finally {
            setSubmitting(false);
        }
    }

    if (done) {
        return (
            <div className="stack reveal">
                <section className="card hero-accent">
                    <h1>Application received</h1>
                    <p>
                        Thanks for applying to the Wolf Den Marketplace. We&apos;ll review your business and email you
                        if it&apos;s a fit — keep an eye on your inbox for an invite link to set up your storefront.
                    </p>
                    <p>
                        <Link href="/marketplace" className="pill">
                            Back to the marketplace
                        </Link>
                    </p>
                </section>
            </div>
        );
    }

    if (vendor) {
        return (
            <div className="stack reveal">
                <section className="card hero-accent">
                    <h1>Welcome back</h1>
                    <p>
                        You&apos;re signed in as <strong>{vendor.displayName}</strong>. Head to your portal to manage
                        your listings.
                    </p>
                    <p className="mkt-hero-links">
                        <Link href="/marketplace/portal" className="button primary">
                            Go to my portal →
                        </Link>
                    </p>
                </section>
            </div>
        );
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Become a Vendor</h1>
                <p>
                    Sell your sealed product and singles to buyers across the marketplace. Vendors are hand-vetted —
                    tell us about your business and we&apos;ll reach out if it&apos;s a fit.
                </p>
                <p className="mkt-hero-links">
                    <Link href="/marketplace/portal" className="pill">
                        Already a vendor? Sign in
                    </Link>
                </p>
            </section>

            <section className="card">
                <form className="contact-form mkt-apply-form" onSubmit={submit}>
                    <label htmlFor="ap-business">Business name *</label>
                    <input id="ap-business" type="text" value={form.businessName} onChange={update("businessName")} required />

                    <label htmlFor="ap-logo">Logo (optional)</label>
                    {form.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form.logoUrl} alt="Logo preview" className="mkt-logo-preview" />
                    ) : null}
                    <input
                        id="ap-logo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={uploadLogo}
                        disabled={logoUploading}
                    />
                    <p className="muted">{logoUploading ? "Uploading logo…" : "PNG, JPG, or WEBP, under 2 MB."}</p>

                    <label htmlFor="ap-contact">Your name</label>
                    <input id="ap-contact" type="text" value={form.contactName} onChange={update("contactName")} />

                    <label htmlFor="ap-email">Email *</label>
                    <input id="ap-email" type="email" value={form.email} onChange={update("email")} placeholder="you@example.com" required />

                    <label htmlFor="ap-phone">Phone</label>
                    <input id="ap-phone" type="tel" value={form.phone} onChange={update("phone")} />

                    <label htmlFor="ap-location">Location (city, state)</label>
                    <input id="ap-location" type="text" value={form.locationLabel} onChange={update("locationLabel")} placeholder="e.g. Sacramento, CA" />

                    <label htmlFor="ap-sells">What do you sell?</label>
                    <textarea id="ap-sells" rows={3} value={form.sells} onChange={update("sells")} placeholder="Sealed Pokemon, MTG singles, etc." />

                    <label htmlFor="ap-links">Links (Facebook, store, etc.)</label>
                    <input id="ap-links" type="text" value={form.links} onChange={update("links")} />

                    <label htmlFor="ap-notes">Anything else?</label>
                    <textarea id="ap-notes" rows={3} value={form.notes} onChange={update("notes")} />

                    <button className="button primary" type="submit" disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit application"}
                    </button>
                    {error ? <p className="muted">{error}</p> : null}
                </form>
            </section>
        </div>
    );
}
