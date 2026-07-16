"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AvatarStack from "@/components/AvatarStack";
import WebPushToggle from "@/components/WebPushToggle";

// Signed-in account hub: profile + @handle editing (marketplace profile, bridged to the shop login),
// orders, password, sign out, and alert management. Shown on /shop/account when signed in.
export default function ShopAccountHub({ customerEmail, onSignOut, signingOut }) {
    const [profile, setProfile] = useState(null);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [alias, setAlias] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

    useEffect(() => {
        let alive = true;
        (async () => {
            const r = await fetch("/api/marketplace/profile", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            const p = d?.profile;
            if (alive && p) {
                setProfile(p);
                setFirstName(p.firstName || "");
                setLastName(p.lastName || "");
                setAlias(p.alias || "");
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    async function saveProfile() {
        setSaving(true);
        setMsg("");
        setErr("");
        try {
            const r = await fetch("/api/marketplace/profile", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ firstName, lastName, alias }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not save.");
            setProfile(d.profile);
            setMsg("Saved.");
        } catch (e) {
            setErr(e?.message || "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    const avatarUrl = profile?.avatarUrl || null;
    const initials = (profile?.displayLabel || alias || customerEmail || "?").trim().slice(0, 1).toUpperCase();

    return (
        <div className="account-hub">
            <section className="card account-hub-card">
                <h2>Profile</h2>
                <div className="account-hub-identity">
                    <Link href="/marketplace/profile/avatar" className="account-hub-avatar-link" title="Edit your avatar" aria-label="Edit your avatar">
                        <AvatarStack avatarUrl={avatarUrl} initial={initials} size={64} border={profile?.border} cosmetics={profile?.avatarCosmetics} />
                    </Link>
                    <div className="account-hub-identity-body">
                        <p className="account-hub-name">{profile?.displayLabel || "Your profile"}</p>
                        <Link href="/marketplace/profile/avatar" className="button primary account-hub-edit-avatar">✏️ Edit avatar</Link>
                    </div>
                </div>
                <div className="account-hub-fields">
                    <label className="cart-field">
                        <span>First name</span>
                        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </label>
                    <label className="cart-field">
                        <span>Last name</span>
                        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </label>
                    <label className="cart-field cart-field-full">
                        <span>Public handle (@)</span>
                        <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="yourhandle" autoCapitalize="none" autoCorrect="off" />
                    </label>
                </div>
                <p className="secondary account-hub-hint">Your handle is your public identity on the leaderboard and community. Your name stays private.</p>
                <button type="button" className="button primary" onClick={saveProfile} disabled={saving}>
                    {saving ? "Saving…" : "Save profile"}
                </button>
                {msg ? <p className="shop-payment-success">{msg}</p> : null}
                {err ? <p className="shop-payment-error">{err}</p> : null}
            </section>

            <section className="card account-hub-card">
                <h2>Account</h2>
                <p className="secondary">Signed in as <strong>{customerEmail}</strong>.</p>
                <div className="account-hub-actions">
                    <Link href="/shop/orders" className="button primary">📦 My Orders</Link>
                    <Link href="/shop/account/reset-password" className="button">Change password</Link>
                    <button type="button" className="button" onClick={onSignOut} disabled={signingOut}>
                        {signingOut ? "Signing out…" : "Sign out"}
                    </button>
                </div>
            </section>

            <section className="card account-hub-card">
                <h2>Alerts &amp; notifications</h2>
                <p className="secondary">Manage what you get notified about. Everything is tied to this account.</p>
                <WebPushToggle />
                <div className="account-hub-links">
                    <Link href="/looking-for" className="account-hub-tile">
                        <strong>Looking For</strong>
                        <span className="secondary">Cards you want — restock alerts</span>
                    </Link>
                    <Link href="/marketplace/wants" className="account-hub-tile">
                        <strong>Want list</strong>
                        <span className="secondary">Notify me when a vendor lists it</span>
                    </Link>
                </div>
                <p className="secondary account-hub-hint">Per-feature email preferences are coming here soon.</p>
            </section>
        </div>
    );
}
