"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import AvatarStack from "@/components/AvatarStack";
import { useVisiblePoll } from "@/lib/use-visible-poll.js";

const REACTIONS = ["❤️", "👍", "😂", "🔥", "😮", "😢"];

function timeLabel(iso) {
    try {
        return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
        return "";
    }
}

function dayLabel(iso) {
    const d = new Date(iso);
    const now = new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function sameDay(a, b) {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export default function MarketplaceDmClient({ threadId }) {
    const [thread, setThread] = useState(null);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [pickerFor, setPickerFor] = useState(null);
    const endRef = useRef(null);
    const messagesRef = useRef(null);
    const lastTypingRef = useRef(0);

    // Size the message list to fill exactly from its top down to the composer, so ONLY the list scrolls (no
    // nested page-vs-list double scroll). Recomputes on resize + when the on-screen keyboard opens (visualViewport).
    useEffect(() => {
        const fit = () => {
            const el = messagesRef.current;
            if (!el) return;
            const top = el.getBoundingClientRect().top;
            const vh = window.visualViewport?.height || window.innerHeight;
            const composer = el.parentElement?.querySelector(".dm-composer")?.offsetHeight || 58;
            el.style.height = `${Math.max(160, Math.round(vh - top - composer - 14))}px`;
        };
        fit();
        const t = setTimeout(fit, 120); // after fonts/layout settle
        window.addEventListener("resize", fit);
        window.visualViewport?.addEventListener("resize", fit);
        return () => { clearTimeout(t); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
    }, [thread?.counterpart?.displayLabel]);

    const load = useCallback(async () => {
        const r = await fetch(`/api/marketplace/dm/${threadId}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d?.thread) setThread(d.thread);
    }, [threadId]);

    // 3s keeps typing indicators and read receipts feeling live — but only while the thread is on screen.
    // Backgrounded, this was the most expensive poll in the app at 1,200 requests an hour per open tab.
    useVisiblePoll(load, 3000);

    // Only auto-scroll when a genuinely NEW message arrives — NOT on typing-indicator changes or 3s polls
    // (those were yanking the view down while you were mid-typing). `nearest` avoids jumping if it's in view.
    const prevMsgCount = useRef(0);
    useEffect(() => {
        const count = thread?.messages?.length || 0;
        // Scroll the LIST (not the page) to the bottom on a new message or when the thread first loads.
        if (count > prevMsgCount.current) {
            const el = messagesRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: prevMsgCount.current === 0 ? "auto" : "smooth" });
        }
        prevMsgCount.current = count;
    }, [thread?.messages?.length]);

    function pingTyping() {
        const now = Date.now();
        if (now - lastTypingRef.current < 2500) return;
        lastTypingRef.current = now;
        fetch(`/api/marketplace/dm/${threadId}/typing`, { method: "POST" }).catch(() => {});
    }

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

    async function react(messageId, emoji) {
        setPickerFor(null);
        await fetch(`/api/marketplace/dm/${threadId}/react`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId, emoji }),
        }).catch(() => null);
        await load();
    }

    if (!thread) return <section className="card"><p className="muted">Loading…</p></section>;
    const c = thread.counterpart;
    const messages = thread.messages || [];
    const lastMine = [...messages].reverse().find((m) => m.mine);
    const seen = lastMine && thread.otherLastReadAt && new Date(thread.otherLastReadAt) >= new Date(lastMine.createdAt);

    return (
        <div className="dm-screen reveal">
            <section className="card dm-topbar">
                <Link href="/marketplace/inbox" className="dm-back" aria-label="Back to inbox">‹</Link>
                {c ? (
                    <Link href={c.vendorId ? `/marketplace/vendor/${c.vendorId}` : c.alias ? `/marketplace/u/${c.alias}` : "#"} className="dm-peer">
                        <AvatarStack
                            className="dm-peer-av"
                            avatarUrl={c.avatarUrl}
                            initial={(c.displayLabel || "?").slice(0, 1).toUpperCase()}
                            size={44}
                            border={c.border || "none"}
                            cosmetics={c.avatarCosmetics}
                        />
                        <span className="dm-peer-meta">
                            <strong>{c.displayLabel}</strong>
                            <span className="dm-peer-status muted">
                                {c.isShop ? "🏪 Shop" : thread.otherTyping ? "typing…" : thread.otherOnline ? <><span className="dm-online-dot" /> Online</> : c.alias ? `@${c.alias}` : "Offline"}
                            </span>
                        </span>
                    </Link>
                ) : null}
            </section>

            <section className="card dm-thread">
                <div className="dm-messages" ref={messagesRef} onClick={() => setPickerFor(null)}>
                    {messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
                        const grouped = prev && prev.mine === m.mine && sameDay(prev.createdAt, m.createdAt) && new Date(m.createdAt) - new Date(prev.createdAt) < 4 * 60 * 1000 && !showDay;
                        return (
                            <div key={m.id}>
                                {showDay ? <div className="dm-day"><span>{dayLabel(m.createdAt)}</span></div> : null}
                                <div className={`dm-row${m.mine ? " mine" : ""}${grouped ? " grouped" : ""}`}>
                                    <div className="dm-bubble-wrap">
                                        {m.product ? (
                                            <Link href={`/marketplace/product/${m.product.id}`} className="dm-product-card">
                                                {m.product.imageUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={m.product.imageUrl} alt="" />
                                                ) : null}
                                                <span className="dm-product-info">
                                                    <strong>{m.product.name}</strong>
                                                    <span className="muted">{m.product.setName || ""}{m.product.price != null ? ` · from $${m.product.price.toFixed(2)}` : ""}</span>
                                                </span>
                                            </Link>
                                        ) : m.catalogProductId ? (
                                            <Link href={`/marketplace/product/${m.catalogProductId}`} className="dm-product-chip">🃏 View shared card →</Link>
                                        ) : null}
                                        {m.body ? (
                                            <button
                                                type="button"
                                                className="dm-bubble"
                                                onClick={(e) => { e.stopPropagation(); setPickerFor(pickerFor === m.id ? null : m.id); }}
                                                title="Tap to react"
                                            >
                                                {m.body}
                                            </button>
                                        ) : null}
                                        {pickerFor === m.id ? (
                                            <div className="dm-react-picker" onClick={(e) => e.stopPropagation()}>
                                                {REACTIONS.map((emoji) => (
                                                    <button type="button" key={emoji} onClick={() => react(m.id, emoji)}>{emoji}</button>
                                                ))}
                                            </div>
                                        ) : null}
                                        {m.reactions?.length ? (
                                            <div className="dm-reactions">
                                                {m.reactions.map((r) => (
                                                    <button type="button" key={r.emoji} className={`dm-reaction${r.mine ? " mine" : ""}`} onClick={(e) => { e.stopPropagation(); react(m.id, r.emoji); }}>
                                                        {r.emoji} {r.count > 1 ? r.count : ""}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                        <span className="dm-time">{timeLabel(m.createdAt)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {thread.otherTyping ? (
                        <div className="dm-row">
                            <div className="dm-bubble dm-typing"><span></span><span></span><span></span></div>
                        </div>
                    ) : null}
                    {seen ? <div className="dm-seen muted">Seen</div> : null}
                    <div ref={endRef} />
                </div>
                <form onSubmit={send} className="dm-composer">
                    <input
                        value={text}
                        onChange={(e) => { setText(e.target.value); pingTyping(); }}
                        placeholder="Message…"
                        autoComplete="off"
                    />
                    <button className="dm-send" disabled={sending || !text.trim()} aria-label="Send">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 20.5v-6l8-2.5-8-2.5v-6l19 8.5z" /></svg>
                    </button>
                </form>
            </section>
        </div>
    );
}
