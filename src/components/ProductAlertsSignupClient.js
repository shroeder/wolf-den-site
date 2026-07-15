"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function ProductAlertsSignupClient() {
    const [categories, setCategories] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [account, setAccount] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [done, setDone] = useState(false);

    const searchParams = useSearchParams();
    const banner = useMemo(() => {
        if (searchParams.get("confirmed") === "1") {
            return "Your email is confirmed — new-arrival alerts are on.";
        }

        if (searchParams.get("confirmed") === "invalid") {
            return "That confirmation link is invalid or expired. Sign up again to retry.";
        }

        if (searchParams.get("unsubscribed") === "1") {
            return "You've been unsubscribed. You won't get any more new-arrival alerts.";
        }

        if (searchParams.get("unsubscribed") === "invalid") {
            return "That unsubscribe link is invalid — you may already be unsubscribed.";
        }

        return "";
    }, [searchParams]);

    useEffect(() => {
        let ignore = false;

        (async () => {
            try {
                const response = await fetch("/api/product-alerts/categories", { cache: "no-store" });
                const data = await response.json().catch(() => null);

                if (!ignore && response.ok && Array.isArray(data?.categories)) {
                    setCategories(data.categories);
                }
            } catch {
                // Non-fatal: the form simply shows no categories.
            }
        })();

        return () => {
            ignore = true;
        };
    }, []);

    // Account required — resolve the signed-in member.
    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const res = await fetch("/api/marketplace/auth/me", { cache: "no-store" });
                if (res.ok) {
                    const d = await res.json().catch(() => null);
                    const mail = d?.buyer?.email || d?.account?.email || "";
                    if (!ignore && mail) setAccount({ email: mail });
                }
            } catch {
                /* signed out */
            } finally {
                if (!ignore) setAuthChecked(true);
            }
        })();
        return () => {
            ignore = true;
        };
    }, []);

    function toggleCategory(id) {
        setSelected((prev) => {
            const next = new Set(prev);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    async function onSubmit(event) {
        event.preventDefault();
        setSubmitting(true);
        setMessage("");

        try {
            const response = await fetch("/api/product-alerts/subscribe", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ categoryIds: Array.from(selected) }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not turn on alerts.");
            }

            setDone(true);
            setMessage(data.message || "Alerts are on.");
        } catch (error) {
            setMessage(error?.message || "Could not sign you up.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>New-Arrival Alerts</h1>
                <p>
                    Pick the categories you care about and we&apos;ll email and notify you when new stock lands in the
                    shop — including restocks of items that sold out. Saved to your free Wolf Den account.
                </p>
                {banner ? <p className="statement-copy">{banner}</p> : null}
            </section>

            <section className="card">
                {done ? (
                    <p className="statement-copy">{message}</p>
                ) : (
                    <form className="contact-form" onSubmit={onSubmit}>
                        <fieldset className="pa-categories">
                            <legend>Which categories should we alert you about?</legend>
                            {categories.length === 0 ? (
                                <p className="muted">Loading categories…</p>
                            ) : (
                                <div className="pa-category-grid">
                                    {categories.map((category) => (
                                        <label key={category.id} className="pa-category-option">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(category.id)}
                                                onChange={() => toggleCategory(category.id)}
                                            />
                                            <span>{category.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </fieldset>

                        {account ? (
                            <button
                                className="button primary"
                                type="submit"
                                disabled={submitting || selected.size === 0}
                            >
                                {submitting ? "Turning on…" : "Turn on alerts"}
                            </button>
                        ) : authChecked ? (
                            <div>
                                <p className="muted" style={{ marginBottom: 8 }}>
                                    Create a free Wolf Den account to turn on alerts — it syncs with the app and your rewards.
                                </p>
                                <Link href="/marketplace/login?signup=1" className="btn-gold">Create your free account →</Link>
                            </div>
                        ) : null}

                        {account && selected.size === 0 ? (
                            <p className="muted">Pick at least one category to continue.</p>
                        ) : null}
                        {message ? <p className="statement-copy">{message}</p> : null}
                    </form>
                )}
            </section>

            <p className="muted pa-fineprint">
                Changed your mind? Every alert email has a one-click unsubscribe link. You can re-subscribe here
                anytime to update the categories you follow.
            </p>
        </div>
    );
}
