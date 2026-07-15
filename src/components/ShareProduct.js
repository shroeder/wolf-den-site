"use client";

import { useState } from "react";

// Share a product: externally (native share sheet / copy link) or straight into a friend's DM (drops a
// rich product card into the chat). Friends list loads on first open.
export default function ShareProduct({ catalogProductId, name }) {
    const [open, setOpen] = useState(false);
    const [friends, setFriends] = useState(null);
    const [status, setStatus] = useState("");
    const [sentTo, setSentTo] = useState({});

    function productUrl() {
        return typeof window !== "undefined" ? `${window.location.origin}/marketplace/product/${catalogProductId}` : "";
    }

    async function toggle() {
        const next = !open;
        setOpen(next);
        setStatus("");
        if (next && friends === null) {
            const r = await fetch("/api/marketplace/friends", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            setFriends(d?.friends || (r && r.status === 401 ? "signedout" : []));
        }
    }

    async function shareExternal() {
        const url = productUrl();
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({ title: name, url });
            } catch {
                /* user cancelled */
            }
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            setStatus("Link copied!");
        } catch {
            setStatus(url);
        }
    }

    async function sendTo(userId) {
        setStatus("Sending…");
        const s = await fetch("/api/marketplace/dm/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toUserId: userId }),
        }).catch(() => null);
        const sd = s && s.ok ? await s.json().catch(() => null) : null;
        if (!sd?.threadId) return setStatus("Couldn't start the chat.");
        const p = await fetch(`/api/marketplace/dm/${sd.threadId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ catalogProductId, body: `Check this out: ${name}` }),
        }).catch(() => null);
        if (p && p.ok) {
            setSentTo((prev) => ({ ...prev, [userId]: true }));
            setStatus("Sent! ✓");
        } else {
            setStatus("Couldn't send.");
        }
    }

    const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

    return (
        <div className="share-product">
            <button type="button" className="button" onClick={toggle} aria-expanded={open}>
                Share
            </button>
            {open ? (
                <div className="share-panel">
                    <button type="button" className="button" onClick={shareExternal}>
                        {canNativeShare ? "Share…" : "Copy link"}
                    </button>
                    <div className="share-friends">
                        <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 4 }}>Send to a friend</div>
                        {friends === null ? (
                            <div className="muted">Loading…</div>
                        ) : friends === "signedout" ? (
                            <div className="muted">
                                <a href="/marketplace/login?signup=1">Sign in</a> to share with friends.
                            </div>
                        ) : friends.length === 0 ? (
                            <div className="muted">
                                <a href="/marketplace/friends">Add friends</a> to share directly.
                            </div>
                        ) : (
                            <div className="share-friend-list">
                                {friends.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        className="share-friend"
                                        disabled={sentTo[f.id]}
                                        onClick={() => sendTo(f.id)}
                                    >
                                        {sentTo[f.id] ? "✓ " : ""}@{f.alias || f.displayLabel}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {status ? <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>{status}</div> : null}
                </div>
            ) : null}
        </div>
    );
}
