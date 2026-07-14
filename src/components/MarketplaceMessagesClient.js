"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Buyer-side web messages inbox + thread view (mirrors the vendor portal MessagesPanel, role=buyer).
export default function MarketplaceMessagesClient({ buyerName = null }) {
    const [threads, setThreads] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [convo, setConvo] = useState(null);
    const [reply, setReply] = useState("");
    const [busy, setBusy] = useState(false);

    // Pull both buyer- and vendor-side conversations and merge them, so a vendor account sees its
    // seller threads here too (mirrors the app's Messages tab).
    async function fetchBothRoles() {
        const byId = new Map();
        for (const role of ["buyer", "vendor"]) {
            try {
                const res = await fetch(`/api/marketplace/threads?role=${role}`, { cache: "no-store" });
                if (!res.ok) continue;
                const d = await res.json();
                (Array.isArray(d.threads) ? d.threads : []).forEach((t) => byId.set(t.id, t));
            } catch {
                /* skip this role */
            }
        }
        return [...byId.values()].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
    }
    async function loadThreads() {
        setThreads(await fetchBothRoles());
    }
    useEffect(() => {
        let active = true;
        fetchBothRoles().then((list) => { if (active) setThreads(list); });
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Deep link from the new-message email (?thread=…) opens that conversation straight away.
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("thread");
        if (t) openThread(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function openThread(id) {
        setOpenId(id);
        setConvo(null);
        try {
            const res = await fetch(`/api/marketplace/threads/${id}`, { cache: "no-store" });
            setConvo(await res.json());
        } catch {
            setConvo({ messages: [] });
        }
        loadThreads();
    }

    async function send() {
        if (!reply.trim()) return;
        setBusy(true);
        try {
            await fetch(`/api/marketplace/threads/${openId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: reply.trim() }),
            });
            setReply("");
            await openThread(openId);
        } finally {
            setBusy(false);
        }
    }

    async function signOut() {
        await fetch("/api/marketplace/auth/logout", { method: "POST" }).catch(() => {});
        window.location.reload();
    }

    return (
        <div className="stack reveal">
            <section className="card">
                <div className="mkt-admin-head">
                    <div>
                        <h1>Messages</h1>
                        <p className="muted">Your conversations with vendors{buyerName ? ` · ${buyerName}` : ""}.</p>
                    </div>
                    <div className="btn-row">
                        <Link className="pill" href="/marketplace/profile">Your profile</Link>
                        <button type="button" className="pill" onClick={signOut}>Sign out</button>
                    </div>
                </div>

                {threads == null ? (
                    <p className="muted">Loading…</p>
                ) : openId == null ? (
                    threads.length === 0 ? (
                        <p className="muted">No messages yet. Message a vendor from a listing in the app, or a vendor may reach out about your buy orders.</p>
                    ) : (
                        <ul className="mkt-admin-list">
                            {threads.map((t) => (
                                <li key={t.id} className="mkt-admin-row">
                                    <div className="mkt-admin-info">
                                        <strong>{t.counterpartName}{t.unread ? " ●" : ""}</strong>
                                        <span className="mkt-offer-meta">
                                            {t.subject ? `Re: ${t.subject} · ` : ""}
                                            {t.lastPreview || ""}
                                        </span>
                                    </div>
                                    <button type="button" className="pill" onClick={() => openThread(t.id)}>Open</button>
                                </li>
                            ))}
                        </ul>
                    )
                ) : (
                    <div className="stack" style={{ gap: 10 }}>
                        <button type="button" className="pill" style={{ alignSelf: "flex-start" }} onClick={() => { setOpenId(null); setConvo(null); }}>
                            ← All messages
                        </button>
                        {convo == null ? (
                            <p className="muted">Loading…</p>
                        ) : (
                            <>
                                <strong>{convo.thread?.counterpartName || "Conversation"}</strong>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto", padding: "4px 0" }}>
                                    {(convo.messages || []).map((m) => (
                                        <div
                                            key={m.id}
                                            style={{
                                                alignSelf: m.mine ? "flex-end" : "flex-start",
                                                background: m.mine ? "#D4AF37" : "#2a2a2a",
                                                color: m.mine ? "#111" : "#eee",
                                                padding: "8px 12px",
                                                borderRadius: 12,
                                                maxWidth: "80%",
                                            }}
                                        >
                                            {m.body}
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && !busy) send(); }} />
                                    <button type="button" className="pill" disabled={busy} onClick={send}>{busy ? "…" : "Send"}</button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
