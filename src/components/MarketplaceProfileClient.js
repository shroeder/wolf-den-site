"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import UserBadges from "@/components/UserBadges";
import UserLevel from "@/components/UserLevel";

export default function MarketplaceProfileClient() {
    const [loading, setLoading] = useState(true);
    const [signedIn, setSignedIn] = useState(false);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");
    const [alias, setAlias] = useState("");
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [badges, setBadges] = useState([]);
    const [level, setLevel] = useState(null);
    const [savedAlias, setSavedAlias] = useState("");
    const [aliasState, setAliasState] = useState({ checking: false, ok: null, reason: null });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const fileRef = useRef(null);

    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/auth/me", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!alive) return;
                const b = d?.buyer || null;
                if (b) {
                    setSignedIn(true);
                    setFirstName(b.firstName || "");
                    setLastName(b.lastName || "");
                    setPhone(b.phone || "");
                    setAlias(b.alias || "");
                    setSavedAlias(b.alias || "");
                    setAvatarUrl(b.avatarUrl || null);
                    setBadges(b.badges || []);
                    setLevel(b.level || null);
                }
                setLoading(false);
            })
            .catch(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, []);

    // Live handle availability (debounced). Skip when unchanged from the saved value.
    useEffect(() => {
        const a = alias.trim().toLowerCase();
        if (!a || a === savedAlias.toLowerCase()) {
            setAliasState({ checking: false, ok: null, reason: null });
            return;
        }
        setAliasState({ checking: true, ok: null, reason: null });
        const t = setTimeout(async () => {
            try {
                const r = await fetch(`/api/marketplace/profile/alias-available?alias=${encodeURIComponent(a)}`, { cache: "no-store" });
                const d = await r.json().catch(() => null);
                setAliasState({ checking: false, ok: Boolean(d?.available), reason: d?.reason || null });
            } catch {
                setAliasState({ checking: false, ok: null, reason: null });
            }
        }, 350);
        return () => clearTimeout(t);
    }, [alias, savedAlias]);

    async function uploadAvatar(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("file", file);
            const r = await fetch("/api/marketplace/profile/avatar", { method: "POST", body: form });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Upload failed.");
            setAvatarUrl(d?.profile?.avatarUrl || null);
            setSuccess("Avatar updated.");
        } catch (err) {
            setError(err?.message || "Upload failed.");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    async function save(event) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const r = await fetch("/api/marketplace/profile", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ firstName, lastName, phone: phone.trim() || null, alias: alias.trim() || null }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not save.");
            const p = d.profile;
            setSavedAlias(p?.alias || "");
            setBadges(p?.badges || []);
            setSuccess("Profile saved.");
        } catch (err) {
            setError(err?.message || "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <p className="muted">Loading…</p>;

    if (!signedIn) {
        return (
            <div>
                <h1>Your profile</h1>
                <p className="statement-copy">
                    <Link href="/marketplace/login">Sign in</Link> to set up your profile — name, handle, avatar, and badges.
                </p>
            </div>
        );
    }

    const initial = (firstName || alias || "?").slice(0, 1).toUpperCase();
    const aliasChanged = alias.trim().toLowerCase() !== savedAlias.toLowerCase();

    return (
        <div>
            <h1>Your profile</h1>

            <div className="user-profile-head" style={{ marginBottom: "1.2rem" }}>
                <div className="user-avatar user-avatar-lg">
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="Your avatar" />
                    ) : (
                        <span aria-hidden="true">{initial}</span>
                    )}
                </div>
                <div className="user-profile-meta">
                    <UserBadges badges={badges} />
                    <UserLevel level={level} />
                    <div className="btn-row" style={{ marginTop: "0.5rem" }}>
                        <button type="button" className="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
                            {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
                        </button>
                        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadAvatar} />
                    </div>
                </div>
            </div>

            <form className="contact-form" onSubmit={save}>
                <label htmlFor="pf-first">First name</label>
                <input id="pf-first" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" />

                <label htmlFor="pf-last">Last name</label>
                <input id="pf-last" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" />

                <label htmlFor="pf-phone">Phone</label>
                <input
                    id="pf-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                />
                <p className="muted" style={{ fontSize: "0.8rem" }}>Add your phone so we can find you at the register and credit in-store purchases.</p>

                <label htmlFor="pf-alias">Handle</label>
                <input
                    id="pf-alias"
                    type="text"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="yourhandle"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                />
                {aliasChanged && aliasState.checking ? <p className="muted" style={{ fontSize: "0.8rem" }}>Checking…</p> : null}
                {aliasChanged && aliasState.ok === true ? <p className="muted" style={{ fontSize: "0.8rem", color: "#9de5a9" }}>@{alias.trim().toLowerCase()} is available.</p> : null}
                {aliasChanged && aliasState.ok === false ? <p className="muted" style={{ fontSize: "0.8rem", color: "#f69393" }}>{aliasState.reason}</p> : null}
                {!aliasChanged && savedAlias ? <p className="muted" style={{ fontSize: "0.8rem" }}>Your profile: <Link href={`/marketplace/u/${savedAlias}`}>/marketplace/u/{savedAlias}</Link></p> : null}

                <button className="button primary" type="submit" disabled={saving || (aliasChanged && alias.trim() && aliasState.ok === false)}>
                    {saving ? "Saving…" : "Save profile"}
                </button>
                {error ? <p className="shop-payment-error">{error}</p> : null}
                {success ? <p className="shop-payment-success">{success}</p> : null}
            </form>
        </div>
    );
}
