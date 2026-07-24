"use client";

import { useState } from "react";

// Share card for a logged-in member: their invite link (/marketplace/play?ref=<handle>) with copy + native
// share. When someone joins through it and verifies their email, BOTH sides earn bonus gold + a chest.
export default function ReferralInvite({ alias, referrerGold = 500, joinerGold = 250 }) {
    // Built once on the client (window is defined by the time this client component renders).
    const [link] = useState(() => (typeof window !== "undefined" && alias ? `${window.location.origin}/marketplace/play?ref=${encodeURIComponent(alias)}` : ""));
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            setCopied(false);
        }
    }
    async function share() {
        if (navigator.share) {
            try { await navigator.share({ title: "Den Quest", text: "Come play Den Quest with me — we both get a bonus!", url: link }); } catch { /* cancelled */ }
        } else {
            copy();
        }
    }

    if (!alias) return null;
    return (
        <section className="card" style={{ borderColor: "rgba(255,215,94,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 26 }} aria-hidden="true">🎁</span>
                <h2 style={{ margin: 0 }}>Invite friends — you both win</h2>
            </div>
            <p className="muted" style={{ margin: "0 0 12px" }}>
                Share your link. When a friend signs up and verifies their email, <strong>you</strong> get{" "}
                <strong>{referrerGold} gold + an Iron Chest</strong> and <strong>they</strong> start with{" "}
                <strong>{joinerGold} gold + a Wooden Chest</strong>.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                    aria-label="Your invite link"
                    style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "inherit", fontSize: "0.9rem" }}
                />
                <button type="button" onClick={copy} className="btn-gold" style={{ whiteSpace: "nowrap" }}>
                    {copied ? "Copied ✓" : "Copy link"}
                </button>
                <button type="button" onClick={share} style={{ whiteSpace: "nowrap", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 600 }}>
                    Share
                </button>
            </div>
        </section>
    );
}
