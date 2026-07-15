"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import MemberHeroCard from "@/components/MemberHeroCard";

// Ever-present social hub: a floating launcher on EVERY page (signed-in members only) that opens a
// tabbed panel — Messages (unified inbox + inline chat), Friends (your friends + requests), and
// Discover (search members → hero cards → add). Couples people + messaging in one place.

function money(v) {
    return v != null ? `$${Number(v).toFixed(2)}` : null;
}

// A single DM conversation, opened inline in the panel.
function Thread({ thread, onBack, onActivity }) {
    const [messages, setMessages] = useState(null);
    const [counterpart, setCounterpart] = useState(thread.name || "Conversation");
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const endRef = useRef(null);

    const load = useCallback(async () => {
        const r = await fetch(`/api/marketplace/dm/${thread.id}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        const t = d?.thread;
        if (t) {
            setCounterpart(t.counterpart?.displayLabel || thread.name || "Conversation");
            setMessages(Array.isArray(t.messages) ? t.messages : []);
            onActivity?.();
        } else {
            setMessages((m) => (m === null ? [] : m));
        }
    }, [thread.id, thread.name, onActivity]);

    useEffect(() => {
        (async () => { await load(); })();
        const iv = setInterval(() => { load(); }, 15000);
        return () => clearInterval(iv);
    }, [load]);

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

// The friend-action button shown on each hero card, by relationship.
function ActionButton({ member, busy, onAdd, onMessage, onRespond }) {
    const rel = member.relation;
    if (rel === "friends") return <button type="button" className="social-mini-btn" onClick={() => onMessage(member)}>Message</button>;
    if (rel === "outgoing") return <span className="social-mini-tag">Requested</span>;
    if (rel === "incoming") return <button type="button" className="social-mini-btn" onClick={onRespond}>Respond</button>;
    return <button type="button" className="social-mini-btn is-primary" disabled={busy} onClick={() => onAdd(member)}>+ Add</button>;
}

export default function SocialHub() {
    const [authed, setAuthed] = useState(false);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState("messages");
    const [thread, setThread] = useState(null);

    const [inbox, setInbox] = useState(null);
    const [friends, setFriends] = useState(null); // { friends, incoming, outgoing }
    const [discoverQ, setDiscoverQ] = useState("");
    const [discover, setDiscover] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const refreshUnread = useCallback(async () => {
        const r = await fetch("/api/marketplace/unread", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) {
            setAuthed(Boolean(d.authenticated));
            setUnread(d.total || 0);
        }
    }, []);

    useEffect(() => {
        refreshUnread();
        const iv = setInterval(refreshUnread, 30000);
        return () => clearInterval(iv);
    }, [refreshUnread]);

    const loadInbox = useCallback(async () => {
        const r = await fetch("/api/marketplace/inbox", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setInbox(d?.items || []);
    }, []);

    const loadFriends = useCallback(async () => {
        const r = await fetch("/api/marketplace/friends", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setFriends(d || { friends: [], incoming: [], outgoing: [] });
    }, []);

    // Load the active tab's data when the panel opens or the tab changes (and no thread is open).
    useEffect(() => {
        if (!open || thread) return;
        if (tab === "messages") loadInbox();
        else if (tab === "friends") loadFriends();
    }, [open, tab, thread, loadInbox, loadFriends]);

    // Debounced member search for Discover.
    useEffect(() => {
        if (!open || tab !== "discover") return undefined;
        const q = discoverQ.trim();
        const t = setTimeout(async () => {
            const r = await fetch(`/api/marketplace/members?q=${encodeURIComponent(q)}`, { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            setDiscover(d?.members || []);
        }, 250);
        return () => clearTimeout(t);
    }, [discoverQ, open, tab]);

    const openDm = useCallback(async (member) => {
        setBusyId(member.id);
        const r = await fetch("/api/marketplace/dm/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ toUserId: member.id }),
        }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setBusyId(null);
        if (d?.threadId) setThread({ id: d.threadId, name: member.displayLabel });
    }, []);

    const addFriend = useCallback(async (member) => {
        setBusyId(member.id);
        const r = await fetch("/api/marketplace/friends/request", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: member.id }),
        }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setBusyId(null);
        const newRel = d?.status === "friends" ? "friends" : "outgoing";
        setDiscover((list) => (list ? list.map((m) => (m.id === member.id ? { ...m, relation: newRel } : m)) : list));
    }, []);

    const respondRequest = useCallback(async (requestId, accept) => {
        await fetch("/api/marketplace/friends/respond", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: accept ? "accept" : "decline", requestId }),
        }).catch(() => null);
        loadFriends();
    }, [loadFriends]);

    if (!authed) return null;

    const incomingCount = friends?.incoming?.length || 0;

    return (
        <>
            <button
                type="button"
                className="social-fab"
                onClick={() => setOpen((o) => !o)}
                aria-label={unread > 0 ? `Social, ${unread} unread` : "Social"}
            >
                <span aria-hidden="true">{open ? "×" : "👥"}</span>
                {!open && unread > 0 ? <span className="social-fab-badge">{unread > 99 ? "99+" : unread}</span> : null}
            </button>

            {open ? (
                <div className="social-panel" role="dialog" aria-label="Social">
                    {thread ? (
                        <Thread thread={thread} onBack={() => { setThread(null); refreshUnread(); loadInbox(); }} onActivity={refreshUnread} />
                    ) : (
                        <>
                            <div className="social-tabs">
                                <button type="button" className={`social-tab${tab === "messages" ? " is-active" : ""}`} onClick={() => setTab("messages")}>
                                    Messages{unread > 0 ? <span className="social-tab-badge">{unread}</span> : null}
                                </button>
                                <button type="button" className={`social-tab${tab === "friends" ? " is-active" : ""}`} onClick={() => setTab("friends")}>
                                    Friends{incomingCount > 0 ? <span className="social-tab-badge">{incomingCount}</span> : null}
                                </button>
                                <button type="button" className={`social-tab${tab === "discover" ? " is-active" : ""}`} onClick={() => setTab("discover")}>
                                    Discover
                                </button>
                                <button type="button" className="social-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
                            </div>

                            <div className="social-body">
                                {tab === "messages" ? (
                                    <MessagesTab inbox={inbox} onOpenDm={(id, name) => setThread({ id, name })} />
                                ) : tab === "friends" ? (
                                    <FriendsTab
                                        data={friends}
                                        busyId={busyId}
                                        onMessage={openDm}
                                        onRespond={respondRequest}
                                    />
                                ) : (
                                    <DiscoverTab
                                        q={discoverQ}
                                        setQ={setDiscoverQ}
                                        results={discover}
                                        busyId={busyId}
                                        onAdd={addFriend}
                                        onMessage={openDm}
                                        onGotoFriends={() => setTab("friends")}
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>
            ) : null}
        </>
    );
}

function MessagesTab({ inbox, onOpenDm }) {
    return (
        <div className="social-list">
            <div className="social-list-top">
                <Link href="/marketplace/inbox" className="social-list-full">Open full inbox →</Link>
            </div>
            {inbox === null ? (
                <p className="muted social-empty">Loading…</p>
            ) : inbox.length === 0 ? (
                <p className="muted social-empty">No conversations yet. Find friends in Discover to start messaging.</p>
            ) : (
                inbox.map((it) =>
                    it.kind === "dm" ? (
                        <button type="button" key={`dm_${it.id}`} className="social-msg-row" onClick={() => onOpenDm(it.id, it.name)}>
                            <MsgRow it={it} />
                        </button>
                    ) : (
                        <Link key={`v_${it.id}`} href={it.href || "/marketplace/inbox"} className="social-msg-row">
                            <MsgRow it={it} />
                        </Link>
                    )
                )
            )}
        </div>
    );
}

function MsgRow({ it }) {
    return (
        <>
            {it.unread ? <span className="social-dot" aria-hidden="true" /> : <span className="social-dot-spacer" aria-hidden="true" />}
            <span className="social-msg-main">
                <span className="social-msg-top">
                    <span className="social-msg-name">{it.name}</span>
                    {it.tag ? <span className="social-msg-tag">{it.tag}</span> : null}
                </span>
                {it.preview ? <span className="social-msg-preview">{it.preview}</span> : null}
            </span>
        </>
    );
}

function FriendsTab({ data, busyId, onMessage, onRespond }) {
    if (data === null) return <p className="muted social-empty">Loading…</p>;
    const { friends = [], incoming = [] } = data;
    return (
        <div className="social-people">
            {incoming.length > 0 ? (
                <>
                    <div className="social-section-label">Friend requests</div>
                    {incoming.map((m) => (
                        <MemberHeroCard
                            key={m.requestId}
                            member={m}
                            href={m.alias ? `/marketplace/u/${m.alias}` : null}
                            action={
                                <span className="social-req-actions">
                                    <button type="button" className="social-mini-btn is-primary" onClick={() => onRespond(m.requestId, true)}>Accept</button>
                                    <button type="button" className="social-mini-btn" onClick={() => onRespond(m.requestId, false)}>Decline</button>
                                </span>
                            }
                        />
                    ))}
                </>
            ) : null}
            <div className="social-section-label">Your friends{friends.length ? ` (${friends.length})` : ""}</div>
            {friends.length === 0 ? (
                <p className="muted social-empty">No friends yet — head to Discover and add some.</p>
            ) : (
                friends.map((m) => (
                    <MemberHeroCard
                        key={m.id}
                        member={m}
                        href={m.alias ? `/marketplace/u/${m.alias}` : null}
                        action={<button type="button" className="social-mini-btn" disabled={busyId === m.id} onClick={() => onMessage(m)}>Message</button>}
                    />
                ))
            )}
        </div>
    );
}

function DiscoverTab({ q, setQ, results, busyId, onAdd, onMessage, onGotoFriends }) {
    return (
        <div className="social-people">
            <input
                className="social-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search @handle or name…"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
            />
            {results === null ? (
                <p className="muted social-empty">Find people by @handle or display name.</p>
            ) : results.length === 0 ? (
                <p className="muted social-empty">No members match that search.</p>
            ) : (
                results.map((m) => (
                    <MemberHeroCard
                        key={m.id}
                        member={m}
                        href={m.alias ? `/marketplace/u/${m.alias}` : null}
                        action={<ActionButton member={m} busy={busyId === m.id} onAdd={onAdd} onMessage={onMessage} onRespond={onGotoFriends} />}
                    />
                ))
            )}
        </div>
    );
}
