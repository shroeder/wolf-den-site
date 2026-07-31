"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Hoisted, always-available messaging. A floating launcher on every /marketplace page opens a dock
// with the unified inbox (friend DMs + vendor threads); friend DMs open and reply inline, vendor
// threads jump to their full view. Only shown to signed-in members.

function money(v) {
    return v != null ? `$${Number(v).toFixed(2)}` : null;
}

function DockThread({ thread, onBack, onActivity }) {
    const [messages, setMessages] = useState(null);
    const [counterpart, setCounterpart] = useState(thread.name || "Conversation");
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const endRef = useRef(null);

    async function load() {
        const r = await fetch(`/api/marketplace/dm/${thread.id}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        const t = d?.thread;
        if (t) {
            setCounterpart(t.counterpart?.displayLabel || thread.name || "Conversation");
            setMessages(Array.isArray(t.messages) ? t.messages : []);
            onActivity?.();
        } else if (messages === null) {
            setMessages([]);
        }
    }

    useEffect(() => {
        (async () => { await load(); })();
        const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread.id]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [messages]);

    async function send(e) {
        e.preventDefault();
        const body = input.trim();
        if (!body) return;
        setSending(true);
        const r = await fetch(`/api/marketplace/dm/${thread.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
        }).catch(() => null);
        if (r && r.ok) {
            setInput("");
            await load();
        }
        setSending(false);
    }

    return (
        <div className="mkt-dock-thread">
            <div className="mkt-dock-head">
                <button type="button" className="mkt-dock-back" onClick={onBack} aria-label="Back">‹</button>
                <strong className="mkt-dock-title">{counterpart}</strong>
            </div>
            <div className="mkt-dock-msgs">
                {messages === null ? (
                    <p className="muted mkt-dock-empty">Loading…</p>
                ) : messages.length === 0 ? (
                    <p className="muted mkt-dock-empty">No messages yet — say hello.</p>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} className={`mkt-dock-bubble${m.mine ? " mine" : ""}`}>
                            {m.product ? (
                                <span className="mkt-dock-product">
                                    {m.product.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.product.imageUrl} alt="" />
                                    ) : null}
                                    <span>
                                        <strong>{m.product.name}</strong>
                                        {money(m.product.price) ? <span className="muted"> · {money(m.product.price)}</span> : null}
                                    </span>
                                </span>
                            ) : null}
                            {m.body ? <span>{m.body}</span> : null}
                        </div>
                    ))
                )}
                <div ref={endRef} />
            </div>
            <form className="mkt-dock-composer" onSubmit={send}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message…" />
                <button type="submit" className="btn-gold" disabled={sending || !input.trim()}>Send</button>
            </form>
        </div>
    );
}

function DockList({ items, onOpenDm, onClose }) {
    return (
        <div className="mkt-dock-listwrap">
            <div className="mkt-dock-head">
                <strong className="mkt-dock-title">Messages</strong>
                <Link href="/marketplace/inbox" className="mkt-dock-full">Open inbox</Link>
                <button type="button" className="mkt-dock-close" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="mkt-dock-list">
                {items === null ? (
                    <p className="muted mkt-dock-empty">Loading…</p>
                ) : items.length === 0 ? (
                    <p className="muted mkt-dock-empty">No conversations yet. Add a friend to start messaging.</p>
                ) : (
                    items.map((it) =>
                        it.kind === "dm" ? (
                            <button type="button" key={`dm_${it.id}`} className="mkt-dock-row" onClick={() => onOpenDm(it.id, it.name)}>
                                <DockRowBody it={it} />
                            </button>
                        ) : (
                            <Link key={`v_${it.id}`} href={it.href || "/marketplace/inbox"} className="mkt-dock-row">
                                <DockRowBody it={it} />
                            </Link>
                        )
                    )
                )}
            </div>
        </div>
    );
}

function DockRowBody({ it }) {
    return (
        <>
            {it.unread ? <span className="mkt-dock-dot" aria-hidden="true" /> : <span className="mkt-dock-dot-spacer" aria-hidden="true" />}
            <span className="mkt-dock-rowmain">
                <span className="mkt-dock-rowtop">
                    <span className="mkt-dock-rowname">{it.name}</span>
                    {it.tag ? <span className="mkt-dock-tag">{it.tag}</span> : null}
                </span>
                {it.preview ? <span className="mkt-dock-preview">{it.preview}</span> : null}
            </span>
        </>
    );
}

export default function MarketplaceMessagingDock() {
    const pathname = usePathname();
    const [authed, setAuthed] = useState(false);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState(null);
    const [thread, setThread] = useState(null);

    async function refreshUnread() {
        const r = await fetch("/api/marketplace/unread", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) {
            setAuthed(Boolean(d.authenticated));
            setUnread(d.total || 0);
        }
    }

    useEffect(() => {
        let stop = false;
        const tick = async () => {
            if (stop) return;
            await refreshUnread();
        };
        tick();
        const iv = setInterval(() => { if (document.visibilityState === "visible") tick(); }, 30000);
        return () => {
            stop = true;
            clearInterval(iv);
        };
    }, []);

    async function loadInbox() {
        const r = await fetch("/api/marketplace/inbox", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setItems(d?.items || []);
    }

    useEffect(() => {
        if (open && !thread) {
            (async () => { await loadInbox(); })();
        }
    }, [open, thread]);

    if (!authed) return null;
    // Hide the floating launcher on the dedicated messaging pages (DM thread / inbox) — it's redundant there and
    // was overlapping the message composer's Send button.
    if (pathname && (pathname.startsWith("/marketplace/dm") || pathname.startsWith("/marketplace/inbox"))) return null;

    return (
        <>
            <button
                type="button"
                className="mkt-dock-btn"
                onClick={() => setOpen((o) => !o)}
                aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
            >
                <span aria-hidden="true">💬</span>
                {unread > 0 ? <span className="mkt-dock-badge">{unread > 99 ? "99+" : unread}</span> : null}
            </button>
            {open ? (
                <div className="mkt-dock-panel" role="dialog" aria-label="Messages">
                    {thread ? (
                        <DockThread
                            thread={thread}
                            onBack={() => {
                                setThread(null);
                                refreshUnread();
                            }}
                            onActivity={refreshUnread}
                        />
                    ) : (
                        <DockList items={items} onOpenDm={(id, name) => setThread({ id, name })} onClose={() => setOpen(false)} />
                    )}
                </div>
            ) : null}
        </>
    );
}
