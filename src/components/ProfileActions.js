"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Actions on someone's public profile: add friend, message (friends only), and propose a trade (soon).
// `relation` is one of self | none | outgoing | incoming | friends (or null when signed out).
export default function ProfileActions({ targetId, targetAlias = null, relation = null, signedIn = false }) {
    const router = useRouter();
    const [rel, setRel] = useState(relation);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    if (rel === "self") return null;

    if (!signedIn) {
        return (
            <div className="profile-actions">
                <a className="button primary" href="/marketplace/login">Sign in to connect</a>
            </div>
        );
    }

    async function addFriend() {
        setBusy(true); setMsg("");
        try {
            const r = await fetch("/api/marketplace/friends/request", {
                method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: targetId }),
            });
            if (r.ok) { setRel("outgoing"); setMsg("Friend request sent."); }
            else { const d = await r.json().catch(() => ({})); setMsg(d?.error || "Couldn't send request."); }
        } finally { setBusy(false); }
    }

    async function message() {
        setBusy(true); setMsg("");
        try {
            const r = await fetch("/api/marketplace/dm/start", {
                method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toUserId: targetId }),
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d?.threadId) router.push(`/marketplace/inbox?thread=${d.threadId}`);
            else setMsg(d?.error === "not_friends" ? "Add them as a friend first." : (d?.error || "Couldn't open chat."));
        } finally { setBusy(false); }
    }

    return (
        <div className="profile-actions">
            {rel === "none" ? <button type="button" className="button primary" onClick={addFriend} disabled={busy}>➕ Add friend</button> : null}
            {rel === "outgoing" ? <span className="pill">Friend request sent</span> : null}
            {rel === "incoming" ? <a className="button primary" href="/marketplace/friends">Respond to request</a> : null}
            {rel === "friends" ? <button type="button" className="button primary" onClick={message} disabled={busy}>✉️ Message</button> : null}
            {targetAlias ? <a className="button gold" href={`/marketplace/trade/new?to=${targetAlias}`}>🤝 Propose trade</a> : null}
            {msg ? <span className="muted" style={{ fontSize: "0.85rem" }}>{msg}</span> : null}
        </div>
    );
}
