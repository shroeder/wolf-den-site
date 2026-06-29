"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function StatusBadge({ status }) {
    return <span className={`mkt-status mkt-status-${status}`}>{status}</span>;
}

export default function MarketplaceAdminClient({ admin, applications, vendors }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");
    const [inviteLinks, setInviteLinks] = useState({}); // applicationId -> invite URL

    const pending = applications.filter((a) => a.status === "pending");
    const reviewed = applications.filter((a) => a.status !== "pending");

    async function act(key, url, options) {
        setBusyId(key);
        setError("");

        try {
            const response = await fetch(url, { method: "POST", ...options });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Action failed.");
            }

            return data;
        } catch (err) {
            setError(err?.message || "Action failed.");
            return null;
        } finally {
            setBusyId(null);
        }
    }

    async function approve(application) {
        const data = await act(`approve-${application.id}`, `/api/marketplace/admin/applications/${application.id}/approve`);
        if (data?.inviteUrl) {
            setInviteLinks((prev) => ({ ...prev, [application.id]: data.inviteUrl }));
        }
        router.refresh();
    }

    async function reject(application) {
        await act(`reject-${application.id}`, `/api/marketplace/admin/applications/${application.id}/reject`);
        router.refresh();
    }

    async function setVendorStatus(vendor, status) {
        await act(`vendor-${vendor.id}`, `/api/marketplace/admin/vendors/${vendor.id}/status`, {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status }),
        });
        router.refresh();
    }

    async function logout() {
        await fetch("/api/marketplace/admin/logout", { method: "POST" });
        router.refresh();
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <div className="mkt-admin-head">
                    <div>
                        <h1>Marketplace Admin</h1>
                        <p className="muted">Signed in as {admin.displayName}</p>
                    </div>
                    <button type="button" className="pill" onClick={logout}>
                        Sign out
                    </button>
                </div>
                {error ? <p className="muted">{error}</p> : null}
            </section>

            <section className="card">
                <h2>Pending applications{pending.length ? ` (${pending.length})` : ""}</h2>
                {pending.length === 0 ? (
                    <p className="muted">No applications waiting for review.</p>
                ) : (
                    <ul className="mkt-admin-list">
                        {pending.map((a) => (
                            <li key={a.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{a.businessName}</strong>
                                    <span className="mkt-offer-meta">
                                        {a.contactName ? `${a.contactName} · ` : ""}
                                        {a.email}
                                        {a.phone ? ` · ${a.phone}` : ""}
                                    </span>
                                    <span className="mkt-offer-meta">
                                        {a.locationLabel || a.region || "Location n/a"}
                                        {a.sells ? ` · ${a.sells}` : ""}
                                    </span>
                                    {a.links ? <span className="mkt-offer-meta">{a.links}</span> : null}
                                    {a.notes ? <span className="mkt-offer-meta">“{a.notes}”</span> : null}
                                    {inviteLinks[a.id] ? (
                                        <span className="mkt-invite-link">Invite link: {inviteLinks[a.id]}</span>
                                    ) : null}
                                </div>
                                <div className="mkt-admin-actions">
                                    <button
                                        type="button"
                                        className="button primary"
                                        disabled={busyId === `approve-${a.id}`}
                                        onClick={() => approve(a)}
                                    >
                                        {busyId === `approve-${a.id}` ? "Approving..." : "Approve"}
                                    </button>
                                    <button
                                        type="button"
                                        className="pill"
                                        disabled={busyId === `reject-${a.id}`}
                                        onClick={() => reject(a)}
                                    >
                                        Reject
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="card">
                <h2>Vendors{vendors.length ? ` (${vendors.length})` : ""}</h2>
                {vendors.length === 0 ? (
                    <p className="muted">No vendors yet. Approve an application to onboard one.</p>
                ) : (
                    <ul className="mkt-admin-list">
                        {vendors.map((v) => (
                            <li key={v.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>
                                        {v.displayName} <StatusBadge status={v.status} />
                                    </strong>
                                    <span className="mkt-offer-meta">
                                        {v.email} · {v.locationLabel || v.address?.region || "Location n/a"}
                                    </span>
                                    <span className="mkt-offer-meta">
                                        {v.activeListings} active listing{v.activeListings === 1 ? "" : "s"}
                                        {v.hasPassword ? "" : " · invite not yet accepted"}
                                    </span>
                                </div>
                                <div className="mkt-admin-actions">
                                    <Link href={`/marketplace/vendor/${v.id}`} className="pill">
                                        Inventory
                                    </Link>
                                    {v.status === "active" ? (
                                        <button
                                            type="button"
                                            className="pill"
                                            disabled={busyId === `vendor-${v.id}`}
                                            onClick={() => setVendorStatus(v, "suspended")}
                                        >
                                            Suspend
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="pill"
                                            disabled={busyId === `vendor-${v.id}`}
                                            onClick={() => setVendorStatus(v, "active")}
                                        >
                                            Reactivate
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="pill"
                                        disabled={busyId === `vendor-${v.id}`}
                                        onClick={() => setVendorStatus(v, "removed")}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
