"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export default function MarketplaceDmClient({ threadId }) {
    const [thread, setThread] = useState(null);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const endRef = useRef(null);

    const load = useCallback(async () => {
        const r = await fetch(`/api/marketplace/dm/${threadId}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d?.thread) setThread(d.thread);
    }, [threadId]);

    useEffect(() => {
        load();
        const t = setInterval(load, 15000); // light polling for new messages
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [thread?.messages?.length]);

    async function send(e) {
        e.preventDefault();
        const body = text.trim();
        if (!body || sending) return;
        setSending(true);
        setText("");
        await fetch(`/api/marketplace/dm/${threadId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
        }).catch(() => null);
        await load();
        setSending(false);
    }

    if (!thread) return <section className="card"><p className="muted">Loading…</p></section>;
    const c = thread.counterpart;

    return (
        <>
            <section className="card dm-header">
                <Link href="/marketplace/inbox" className="muted">← Inbox</Link>
                {c ? (
                    <Link href={c.alias ? `/marketplace/u/${c.alias}` : "#"} className="dm-peer">
                        <span className="friend-avatar" aria-hidden="true">
                            {c.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.avatarUrl} alt="" />
                            ) : (
                                <span>{(c.displayLabel || "?").slice(0, 1).toUpperCase()}</span>
                            )}
                        </span>
                        <span>
                            <strong>{c.displayLabel}</strong>
                            {c.alias ? <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>@{c.alias}</span> : null}
                        </span>
                    </Link>
                ) : null}
            </section>

            <section className="card dm-thread">
                <div className="dm-messages">
                    {thread.messages.map((m) => (
                        <div key={m.id} className={`dm-msg${m.mine ? " mine" : ""}`}>
                            {m.product ? (
                                <Link href={`/marketplace/product/${m.product.id}`} className="dm-product-card">
                                    {m.product.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.product.imageUrl} alt="" />
                                    ) : null}
                                    <span className="dm-product-info">
                                        <strong>{m.product.name}</strong>
                                        <span className="muted">
                                            {m.product.setName || ""}
                                            {m.product.price != null ? ` · from $${m.product.price.toFixed(2)}` : ""}
                                        </span>
                                    </span>
                                </Link>
                            ) : m.catalogProductId ? (
                                <Link href={`/marketplace/product/${m.catalogProductId}`} className="dm-product-chip">🃏 View shared card →</Link>
                            ) : null}
                            {m.body ? <div className="dm-bubble">{m.body}</div> : null}
                        </div>
                    ))}
                    <div ref={endRef} />
                </div>
                <form onSubmit={send} className="dm-composer">
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" autoComplete="off" />
                    <button className="button primary" disabled={sending || !text.trim()}>Send</button>
                </form>
            </section>
        </>
    );
}
