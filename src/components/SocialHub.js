"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import MemberHeroCard from "@/components/MemberHeroCard";
import { borderClass } from "@/lib/marketplace/borders.js";

// ── STICK TO THE BOTTOM, BUT ONLY IF YOU WERE ALREADY THERE ──────────────────────────────────────────────────
// Both threads used to jump to the newest message every time `messages` changed, and messages change on a
// timer — every 12s for global, every 4s for a DM. So scrolling up to read anything older gave you a few
// seconds before the view yanked itself back down. Reported as "chat keeps snapping to the bottom so I can't
// scroll back", with a member having found the workaround of holding a finger down to block it.
//
// A chat should follow new messages while you are watching the newest ones, and hold still the moment you go
// looking for something. So: only scroll if the reader is already parked near the end.
const PINNED_SLACK_PX = 140;
function scrollToEndIfPinned(endRef, force = false) {
    const end = endRef.current;
    if (!end) return;
    // Find the actual scrolling ancestor rather than assuming which element it is — this hub renders the same
    // thread markup inside two different panels, and hard-coding a parent would silently fix one of them.
    let box = end.parentElement;
    while (box && box !== document.body) {
        const oy = getComputedStyle(box).overflowY;
        if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight + 4) break;
        box = box.parentElement;
    }
    if (!box || box === document.body) { end.scrollIntoView({ block: "end" }); return; }
    const gap = box.scrollHeight - box.scrollTop - box.clientHeight;
    if (force || gap <= PINNED_SLACK_PX) end.scrollIntoView({ block: "end" });
}

// Ever-present social hub: a floating launcher on EVERY page (signed-in members only) that opens a
// tabbed panel — Messages (unified inbox + inline chat), Friends (your friends + requests), and
// Discover (search members → hero cards → add). Couples people + messaging in one place.

function money(v) {
    return v != null ? `$${Number(v).toFixed(2)}` : null;
}

function notifSummary(unread, requests) {
    const parts = [];
    if (unread > 0) parts.push(`${unread} new message${unread === 1 ? "" : "s"}`);
    if (requests > 0) parts.push(`${requests} friend request${requests === 1 ? "" : "s"}`);
    return parts.join(" · ") || "You're all caught up";
}

// A single DM conversation, opened inline in the panel.
function Thread({ thread, onActivity }) {
    const [messages, setMessages] = useState(null);
    const [counterpart, setCounterpart] = useState(thread.name || "Conversation");
    const [cp, setCp] = useState(null);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    // The DM API has always returned these two; the UI just ignored them.
    const [online, setOnline] = useState(false);
    const [typing, setTyping] = useState(false);
    const typingSentRef = useRef(0);
    const endRef = useRef(null);
    // Whether we have already dropped this thread to its newest message once. A ref, not state: flipping it
    // must not itself cause a render, and it has to survive every poll.
    const didFirstScroll = useRef(false);

    const load = useCallback(async () => {
        const r = await fetch(`/api/marketplace/dm/${thread.id}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        const t = d?.thread;
        if (t) {
            setCounterpart(t.counterpart?.displayLabel || thread.name || "Conversation");
            setCp(t.counterpart || null);
            setMessages(Array.isArray(t.messages) ? t.messages : []);
            setOnline(Boolean(t.otherOnline));
            setTyping(Boolean(t.otherTyping));
            onActivity?.();
        } else {
            setMessages((m) => (m === null ? [] : m));
        }
    }, [thread.id, thread.name, onActivity]);

    useEffect(() => {
        (async () => { await load(); })();
        // 4s, not 15s: the server treats typing as live for 6s, so a 15s poll would nearly always miss it.
        // Paused while the tab is hidden — nobody is reading a typing indicator they can't see.
        const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
        return () => clearInterval(iv);
    }, [load]);

    // ONLY ON THE FIRST LOAD. Following new messages on every refresh was still the app deciding to move
    // your view — restricting it to "you were already at the bottom" made it defensible but not wanted, and
    // the honest answer to "is it really needed" is no. Opening on the newest message IS needed, or you land
    // at the top of history; after that the view is yours. A message arriving below the fold costs you a
    // thumb-flick, which is cheaper than ever being moved while reading.
    useEffect(() => {
        if (messages === null || didFirstScroll.current) return;
        didFirstScroll.current = true;
        scrollToEndIfPinned(endRef, true);
    }, [messages]);

    // Ping "I'm typing" as they compose, at most once every 3s (the server window is 6s, so this keeps it alive
    // without a request per keystroke).
    function onInput(v) {
        setInput(v);
        const now = Date.now();
        if (v.trim() && now - typingSentRef.current > 3000) {
            typingSentRef.current = now;
            fetch(`/api/marketplace/dm/${thread.id}/typing`, { method: "POST" }).catch(() => {});
        }
    }

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
            // Your OWN message always pulls you down, wherever you were reading — you just spoke.
            scrollToEndIfPinned(endRef, true);
        }
        setSending(false);
    }

    return (
        <div className="mkt-dock-thread">
            <div className="mkt-dock-head">
                <span className={`social-thread-av ${borderClass(cp?.border)}`.trim()}>
                    {cp?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cp.avatarUrl} alt="" />
                    ) : (
                        <span aria-hidden="true">{(counterpart || "?").slice(0, 1).toUpperCase()}</span>
                    )}
                </span>
                <span className="mkt-dock-titlewrap">
                    <strong className="mkt-dock-title">{counterpart}</strong>
                    <span className={`dm-presence${online ? " is-online" : ""}`}>
                        <span className="dm-dot" aria-hidden="true" />
                        {typing ? "typing…" : online ? "online" : "offline"}
                    </span>
                </span>
                <Link href={`/marketplace/dm/${thread.id}`} className="mkt-dock-full">Open ↗</Link>
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
            {typing ? (
                <div className="dm-typing" aria-live="polite">
                    <span /><span /><span /> {counterpart} is typing
                </div>
            ) : null}
            <form className="mkt-dock-composer" onSubmit={send}>
                <input value={input} onChange={(e) => onInput(e.target.value)} placeholder="Message…" />
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
    // Plaza chatter, kept apart from `unread` — see /api/marketplace/unread for why it isn't folded in.
    const [globalNew, setGlobalNew] = useState(0);
    const [requests, setRequests] = useState(0);
    const [bubble, setBubble] = useState(false);
    const prevTotalRef = useRef(-1);
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
            setRequests(d.requests || 0);
            setGlobalNew(d.global || 0);
            // Pop the notifications bubble on first load with pending items, and again whenever the
            // total grows (something new arrived) — so it grabs attention both on return and live.
            const total = (d.total || 0) + (d.requests || 0);
            if (total > 0 && (prevTotalRef.current === -1 || total > prevTotalRef.current)) setBubble(true);
            if (total === 0) setBubble(false);
            prevTotalRef.current = total;
        }
    }, []);

    useEffect(() => {
        refreshUnread();
        const iv = setInterval(() => { if (document.visibilityState === "visible") refreshUnread(); }, 30000);
        return () => clearInterval(iv);
    }, [refreshUnread]);

    // Lock the page behind the full-screen hub so nothing scrolls underneath.
    useEffect(() => {
        if (!open) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    // Browser / phone back button closes the hub (pushes a throwaway history entry while open).
    useEffect(() => {
        if (!open) return undefined;
        window.history.pushState({ socialHub: true }, "");
        const onPop = () => { setThread(null); setOpen(false); };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, [open]);

    // Any in-hub navigation (opening a profile, a product, or the full conversation) closes the hub so
    // it doesn't sit on top of the page you navigated to.
    const pathname = usePathname();
    const pathRef = useRef(pathname);
    useEffect(() => {
        if (pathname !== pathRef.current) {
            pathRef.current = pathname;
            setThread(null);
            setOpen(false);
        }
    }, [pathname]);

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

    const incomingCount = requests || friends?.incoming?.length || 0;
    const totalNotif = (unread || 0) + (requests || 0);
    const openTo = (t) => { setBubble(false); setTab(t); setThread(null); setOpen(true); };
    const closeHub = () => window.history.back();

    return (
        <>
            {bubble && !open && totalNotif > 0 ? (
                <div className="social-bubble" role="status">
                    <button type="button" className="social-bubble-main" onClick={() => openTo(unread > 0 ? "messages" : "friends")}>
                        <span className="social-bubble-icon" aria-hidden="true">🔔</span>
                        <span className="social-bubble-text">
                            <strong>{notifSummary(unread, requests)}</strong>
                            <span className="social-bubble-cta">Tap to view →</span>
                        </span>
                    </button>
                    <button type="button" className="social-bubble-x" onClick={() => setBubble(false)} aria-label="Dismiss">×</button>
                </div>
            ) : null}

            <button
                type="button"
                className="social-fab"
                onClick={() => { setBubble(false); setOpen(true); }}
                aria-label={totalNotif > 0 ? `Social, ${totalNotif} new` : "Social"}
            >
                {open ? (
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                )}
                {/* A number means someone is waiting on YOU (DMs, requests). If the only thing new is plaza
                    chatter, show a plain dot instead — enough to draw the eye without implying an obligation
                    or inflating the count that actually matters. */}
                {!open && totalNotif > 0 ? (
                    <span className="social-fab-badge">{totalNotif > 99 ? "99+" : totalNotif}</span>
                ) : !open && globalNew > 0 ? (
                    <span className="social-fab-dot" aria-label={`${globalNew} new chat message${globalNew === 1 ? "" : "s"}`} />
                ) : null}
            </button>

            {open ? (
                <div className="social-panel" role="dialog" aria-label="Social">
                    <div className="social-topbar">
                        {thread ? (
                            <button type="button" className="social-crumb" onClick={() => { setThread(null); refreshUnread(); loadInbox(); }}>‹ Messages</button>
                        ) : (
                            <span className="social-topbar-title">Social</span>
                        )}
                        <button type="button" className="social-exit" onClick={closeHub} aria-label="Close">Close ✕</button>
                    </div>
                    {thread ? (
                        <Thread thread={thread} onActivity={refreshUnread} />
                    ) : (
                        <>
                            <div className="social-tabs">
                                <button type="button" className={`social-tab${tab === "global" ? " is-active" : ""}`} onClick={() => setTab("global")}>
                                    🌐 Global{globalNew > 0 && tab !== "global" ? <span className="social-tab-badge is-chat">{globalNew > 99 ? "99+" : globalNew}</span> : null}
                                </button>
                                <button type="button" className={`social-tab${tab === "messages" ? " is-active" : ""}`} onClick={() => setTab("messages")}>
                                    Messages{unread > 0 ? <span className="social-tab-badge">{unread}</span> : null}
                                </button>
                                <button type="button" className={`social-tab${tab === "friends" ? " is-active" : ""}`} onClick={() => setTab("friends")}>
                                    Friends{incomingCount > 0 ? <span className="social-tab-badge">{incomingCount}</span> : null}
                                </button>
                                <button type="button" className={`social-tab${tab === "discover" ? " is-active" : ""}`} onClick={() => setTab("discover")}>
                                    Discover
                                </button>
                            </div>

                            <div className="social-body">
                                {tab === "global" ? (
                                    <GlobalChatTab open={open} onRead={() => setGlobalNew(0)} />
                                ) : tab === "messages" ? (
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

// Pretty relative timestamp for the global feed ("just now", "5m ago", "3h ago", then a date).
function relTime(iso) {
    const t = new Date(iso).getTime();
    if (!t) return "";
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 45) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A chat row's hero art (or its initial, when the member has no sprite yet). Shared so the sprite renders
// identically whether or not it's wrapped in a profile link.
function heroInner(m) {
    if (!m.sprite) return <span className="gchat-hero-fallback">{(m.name || "?").slice(0, 1).toUpperCase()}</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.sprite} alt="" style={{ transform: m.flip ? "scaleX(-1)" : "none" }} />;
}

// The Global tab — a first-class town/plaza chat. Same stream as the in-town chat: send here and it shows in
// the plaza (and vice versa). Every message shows the sender's HERO sprite (not their avatar icon), name, and
// a pretty timestamp. Polls while open.
function GlobalChatTab({ open, onRead }) {
    const [messages, setMessages] = useState(null);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const endRef = useRef(null);
    // Whether we have already dropped this thread to its newest message once. A ref, not state: flipping it
    // must not itself cause a render, and it has to survive every poll.
    const didFirstScroll = useRef(false);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/global-chat", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d?.messages) setMessages(d.messages);
        else setMessages((m) => (m === null ? [] : m));
        // That GET marked the feed read server-side; clear the local count now instead of waiting up to 30s
        // for the next unread poll to catch up.
        if (d?.authenticated) onRead?.();
    }, [onRead]);

    useEffect(() => {
        if (!open) return undefined;
        load();
        const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 12000);
        return () => clearInterval(iv);
    }, [open, load]);

    // ONLY ON THE FIRST LOAD. Following new messages on every refresh was still the app deciding to move
    // your view — restricting it to "you were already at the bottom" made it defensible but not wanted, and
    // the honest answer to "is it really needed" is no. Opening on the newest message IS needed, or you land
    // at the top of history; after that the view is yours. A message arriving below the fold costs you a
    // thumb-flick, which is cheaper than ever being moved while reading.
    useEffect(() => {
        if (messages === null || didFirstScroll.current) return;
        didFirstScroll.current = true;
        scrollToEndIfPinned(endRef, true);
    }, [messages]);

    async function send(e) {
        e.preventDefault();
        const body = input.trim();
        if (!body || sending) return;
        setSending(true);
        const r = await fetch("/api/marketplace/global-chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
        }).catch(() => null);
        if (r && r.ok) { setInput(""); await load(); scrollToEndIfPinned(endRef, true); }
        setSending(false);
    }

    return (
        <div className="social-global">
            <div className="social-global-feed">
                {messages === null ? (
                    <p className="muted social-empty">Loading the plaza…</p>
                ) : messages.length === 0 ? (
                    <p className="muted social-empty">No messages yet — say hello to the whole Den.</p>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} className={`gchat-row${m.mine ? " mine" : ""}`}>
                            {/* The hero sprite is a second, bigger tap target for the same profile the name
                                links to — tapping someone's hero to size them up is the instinct. */}
                            {m.alias ? (
                                <Link href={`/marketplace/u/${m.alias}`} className="gchat-hero is-link" title={`Inspect ${m.name}`} aria-label={`Inspect ${m.name}`}>
                                    {heroInner(m)}
                                </Link>
                            ) : (
                                <span className="gchat-hero" aria-hidden="true">{heroInner(m)}</span>
                            )}
                            <span className="gchat-main">
                                <span className="gchat-top">
                                    {m.alias ? (
                                        <Link href={`/marketplace/u/${m.alias}`} className="gchat-name">{m.name}</Link>
                                    ) : (
                                        <span className="gchat-name">{m.name}</span>
                                    )}
                                    <span className="gchat-time">{relTime(m.at)}</span>
                                </span>
                                <span className="gchat-body">{m.body}</span>
                            </span>
                        </div>
                    ))
                )}
                <div ref={endRef} />
            </div>
            <form className="social-global-composer" onSubmit={send}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Message the whole Den…"
                    maxLength={200}
                    autoCapitalize="sentences"
                />
                <button type="submit" className="btn-gold" disabled={sending || !input.trim()}>Send</button>
            </form>
        </div>
    );
}

function DiscoverTab({ q, setQ, results, busyId, onAdd, onMessage, onGotoFriends }) {
    // Discover is for meeting NEW people — hide anyone you're already friends with.
    const shown = (results || []).filter((m) => m.relation !== "friends");
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
            ) : shown.length === 0 ? (
                <p className="muted social-empty">{results.length ? "You're already friends with everyone here — search for someone new." : "No members match that search."}</p>
            ) : (
                shown.map((m) => (
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
