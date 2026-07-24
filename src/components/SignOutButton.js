"use client";

import { useState } from "react";

// Sign out of the marketplace account: revoke the session server-side, then hard-navigate home so every
// server component re-reads the now-empty cookie.
export default function SignOutButton() {
    const [busy, setBusy] = useState(false);
    async function signOut() {
        setBusy(true);
        await fetch("/api/marketplace/auth/logout", { method: "POST" }).catch(() => {});
        window.location.assign("/marketplace");
    }
    return (
        <button
            type="button"
            onClick={signOut}
            disabled={busy}
            style={{ width: "100%", padding: "12px", fontWeight: 700, borderRadius: 10, border: "1px solid rgba(224,85,85,0.5)", background: "rgba(224,85,85,0.1)", color: "#ff8b8b", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
        >
            {busy ? "Signing out…" : "🚪 Sign out"}
        </button>
    );
}
