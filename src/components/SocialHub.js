"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import MemberHeroCard from "@/components/MemberHeroCard";

// The broadcast half of the hub. One list, read by the section split, the top-tab badge and the room strip —
// so a new channel is added HERE and in channelsFor on the server, and nothing else has to be remembered.
const ROOM_TABS = ["global", "announce", "bugs", "vip", "staff"];
import { borderClass } from "@/lib/marketplace/borders.js";
import NoticeBody from "@/components/NoticeBody";

// ── STICK TO THE BOTTOM, BUT ONLY IF YOU WERE ALREADY THERE ──────────────────────────────────────────────────
// Both threads used to jump to the newest message every time `messages` changed, and messages change on a
// timer — every 12s for global, every 4s for a DM. So scrolling up to read anything older gave you a few
// seconds before the view yanked itself back down. Reported as "chat keeps snapping to the bottom so I can't
// scroll back", with a member having found the workaround of holding a finger down to block it.
//
// A chat should follow new messages while you are watching the newest ones, and hold still the moment you go
// looking for something. So: only scroll if the reader is already parked near the end.
const PINNED_SLACK_PX = 140;
// Where the fold state lives. One key for every room: the rail is the same furniture in all four.
const RAIL_KEY = "wd.social.rail";
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
    // ── AND IF THERE IS NO SCROLL BOX, DO NOTHING ────────────────────────────────────────────────────
    // This used to fall through to `end.scrollIntoView()`, which scrolls EVERY scrollable ancestor — up to
    // and including the document. Wherever this thread is rendered outside its own scroll box, that turned a
    // routine poll into the page yanking itself to the bottom on a timer. The VIP lounge embedded the feed
    // and was unusable for exactly this reason. A feed with no box of its own has nothing it is entitled to
    // scroll, and the honest answer is to leave the page where the reader put it.
    if (!box || box === document.body) return;
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
        // chrome-fanout: on-demand - runs when a thread is opened, not on page load
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
    // Unread per ROOM, keyed by channel. The server sends it that way because which rooms exist for a
    // member is its fact, not the client's — and a badge for a room you are not in would leak that the
    // room is there at all.
    const [roomNew, setRoomNew] = useState({});
    // Which rooms exist for this member. Seeded with the one everybody has and replaced by the server's
    // answer on the first chat load — never computed here, because a client that decides its own membership
    // is a client that can decide it differently.
    const [channels, setChannels] = useState(["global"]);
    const [requests, setRequests] = useState(0);
    // Mark everything read. Declared up here with the other state because there is an early return further
    // down and a hook after it is a hook that does not always run.
    const [clearing, setClearing] = useState(false);
    const [bubble, setBubble] = useState(false);
    const prevTotalRef = useRef(-1);
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState("messages");
    // The last room and the last people-tab you were on, so the top-level switch returns you where you were
    // rather than resetting to the first of each.
    const lastRoom = useRef("global");
    const lastPeople = useRef("messages");
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
            setRoomNew(d.rooms || {});
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

    // ── ONE TAP CLEARS THE LOT ───────────────────────────────────────────────────────────────────────────
    // The counts are zeroed here rather than waited for: the poll is on a thirty-second timer, and a badge
    // that survives the tap which dismissed it reads as a button that did not work. `requests` is left alone
    // — the server does not clear it and neither should the screen. See dismissAllUnread for why.
    const dismissAll = useCallback(async () => {
        if (clearing) return;
        setClearing(true);
        const r = await fetch("/api/marketplace/unread", { method: "POST" }).catch(() => null);
        if (r?.ok) { setUnread(0); setGlobalNew(0); setRoomNew({}); setBubble(false); }
        setClearing(false);
        refreshUnread();
    }, [clearing, refreshUnread]);

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
        // chrome-fanout: on-demand — runs when the dock is opened, not on page load
        const r = await fetch("/api/marketplace/inbox", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setInbox(d?.items || []);
    }, []);

    const loadFriends = useCallback(async () => {
        // chrome-fanout: on-demand — runs when the dock is opened, not on page load
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
            // chrome-fanout: on-demand - runs as somebody types in Discover
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

    // ── THE BUTTON HAS TO BE WHERE THE PERSON CAN SEE IT ─────────────────────────────────────────────────
    // Luke, from an iPad: "the chat button is bleeding off the bottom and right side, it's cut off."
    //
    // It is 20px from the corner and there is no transformed ancestor trapping it — checked at iPad size, the
    // button lands exactly where it should. The catch is WHICH viewport it is 20px from. `position: fixed`
    // anchors to the LAYOUT viewport, and on iOS the layout viewport is not what you are looking at: pinch a
    // page and the visual viewport shrinks inside it, and a browser bar drawn over the bottom takes a strip of
    // it. Either way the corner the button is pinned to is off the side of the screen, and the button goes
    // with it. Chrome's device emulation keeps the two viewports identical, which is why every screenshot of
    // this looked fine.
    //
    // So the difference between the two is measured and handed to CSS. Both are 0 when nothing is zoomed and
    // nothing overlays, so a desktop and an Android phone get the same layout they had.
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return undefined;
        let frame = 0;
        const apply = () => {
            frame = 0;
            const el = document.documentElement;
            const right = Math.max(0, Math.round(el.clientWidth - (vv.width + vv.offsetLeft)));
            const bottom = Math.max(0, Math.round(el.clientHeight - (vv.height + vv.offsetTop)));
            el.style.setProperty("--vv-inset-right", `${right}px`);
            el.style.setProperty("--vv-inset-bottom", `${bottom}px`);
        };
        // Coalesced to one write a frame: iOS fires these continuously through a pinch.
        const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
        apply();
        vv.addEventListener("resize", schedule);
        vv.addEventListener("scroll", schedule);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            vv.removeEventListener("resize", schedule);
            vv.removeEventListener("scroll", schedule);
        };
    }, []);

    if (!authed) return null;

    const incomingCount = requests || friends?.incoming?.length || 0;
    // ── WHICH HALF OF THE HUB YOU ARE IN ─────────────────────────────────────────────────────────────────
    // Derived from `tab`, never stored: a second piece of state that has to agree with the first is a second
    // piece of state that eventually will not, and the failure looks like the wrong row being highlighted.
    const section = ROOM_TABS.includes(tab) ? "rooms" : "people";
    // Where each half was left, so switching back does not dump you at the top of it. Refs rather than state
    // — nothing renders off them, they only decide where the next tap lands.
    if (section === "rooms") lastRoom.current = tab; else lastPeople.current = tab;
    // The top tabs carry the SUM of what is under them, or a room filling up behind a collapsed half would
    // have nothing anywhere on the screen to say so — which is the whole reason the per-room badges exist.
    const roomsBadge = ROOM_TABS.reduce((n, k) => n + (tab === k ? 0 : roomNew[k] || 0), 0);
    const peopleBadge = (unread || 0) + (incomingCount || 0);
    const totalNotif = (unread || 0) + (requests || 0);
    const openTo = (t) => { setBubble(false); setTab(t); setThread(null); setOpen(true); };
    // A room's badge, hidden while you are in it — a count of what you are currently reading is noise.
    const room = (k) => {
        const n = roomNew[k] || 0;
        if (!n || tab === k) return null;
        return n > 99 ? "99+" : n;
    };
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
                        {/* ── ONE TAP CLEARS THE LOT ──────────────────────────────────────────────
                            Luke: "can we add a dismissal feature in the social to dismiss all unread, make
                            it clean." Four things feed that badge and every one of them wanted VISITING to
                            clear it — open each thread, open each room. After a weekend the only way to get
                            the dot off the button was to walk the whole hub.

                            It appears only when there is something to clear, so it is never a control that
                            does nothing, and it is deliberately quiet next to Close: this is the thing you
                            reach for occasionally, not the thing you reach for on the way out. Friend
                            requests survive it on purpose — see dismissAllUnread. */}
                        {!thread && (unread > 0 || globalNew > 0) ? (
                            <button type="button" className="social-clear" onClick={dismissAll} disabled={clearing}
                                aria-label="Mark everything read">{clearing ? "Clearing…" : "Mark all read"}</button>
                        ) : null}
                        <button type="button" className="social-exit" onClick={closeHub} aria-label="Close">Close ✕</button>
                    </div>
                    {thread ? (
                        <Thread thread={thread} onActivity={refreshUnread} />
                    ) : (
                        <>
                            {/* ── TWO KINDS OF THING, TWO LEVELS ──────────────────────────────────────
                                Luke: "the channels are becoming untenable."

                                He was right, and the reason is that one row was carrying two different kinds
                                of destination. ROOMS are broadcast — the plaza, the noticeboard, the bug room,
                                the two private ones — and PEOPLE is one-to-one: your inbox, your friends, and
                                the search that finds more of them. You never switch between a room and your
                                inbox for the same reason, and yet they were competing for the same eight slots
                                on a 375px screen. Every new room made every other destination smaller.

                                So the top row is those two, and the row under it is whichever set you are in.
                                A ninth channel now adds a pill to a strip of five instead of a tab to a row of
                                eight — which is the part that was actually breaking.

                                `tab` is unchanged and still the single source of truth; only the chrome moved.
                                The section is DERIVED from it rather than stored beside it, because two pieces
                                of state that must agree are two pieces of state that will not. */}
                            <div className="social-top">
                                {[["rooms", "Rooms", "social-global", roomsBadge],
                                  ["people", "People", "social-messages", peopleBadge]].map(([key, label, icon, badge]) => (
                                    <button key={key} type="button"
                                        className={`social-top-tab${section === key ? " is-active" : ""}`}
                                        onClick={() => setTab(key === "rooms" ? lastRoom.current : lastPeople.current)}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`/images/nav/${icon}.png`} alt="" width={20} height={20} draggable="false" />
                                        <i>{label}</i>
                                        {badge ? <span className="social-tab-badge is-chat">{badge > 99 ? "99+" : badge}</span> : null}
                                    </button>
                                ))}
                            </div>

                            {/* ── AND THE SET YOU ARE IN ───────────────────────────────────────────────
                                The two private rooms are rendered only for members who are in them, which the
                                SERVER decides and sends back with the feed. That is a courtesy, not the lock:
                                the feed itself refuses a room you are not in, so a hidden pill is not what is
                                keeping anybody out.

                                Badges on every one of them. Luke: "ensure badges work for each tab." Only
                                Global, Messages and Friends ever had one, so a room could fill up with nothing
                                to say so — and a room you have to remember to check is a room nobody checks. */}
                            <div className="social-tabs">
                                {(section === "rooms" ? [
                                    ["global", "Global", "social-global", room("global")],
                                    ["announce", "News", "social-news", room("announce")],
                                    ["bugs", "Bugs", "social-bugs", room("bugs")],
                                    ...(channels.includes("vip") ? [["vip", "VIP", "social-vip", room("vip")]] : []),
                                    ...(channels.includes("staff") ? [["staff", "Staff", "social-staff", room("staff")]] : []),
                                ] : [
                                    ["messages", "Messages", "social-messages", unread > 0 ? unread : null],
                                    ["friends", "Friends", "social-friends", incomingCount > 0 ? incomingCount : null],
                                    ["discover", "Discover", "social-discover", null],
                                ]).map(([key, label, icon, badge]) => (
                                    <button key={key} type="button" title={label} aria-label={label}
                                        className={`social-tab${tab === key ? " is-active" : ""}`}
                                        onClick={() => setTab(key)}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`/images/nav/${icon}.png`} alt="" width={22} height={22} draggable="false" />
                                        <i>{label}</i>
                                        {badge ? <span className={`social-tab-badge${key === "global" ? " is-chat" : ""}`}>{badge}</span> : null}
                                    </button>
                                ))}
                            </div>

                            <div className="social-body">
                                {section === "rooms" ? (
                                    // One component, keyed by room — remounting on a change is what makes a
                                    // room open on its own newest message rather than inheriting the last
                                    // room's feed for a frame.
                                    <GlobalChatTab key={tab} open={open} channel={tab}
                                        onChannels={setChannels}
                                        onRead={() => {
                                            // The GET marked THIS room read server-side; clear its badge now
                                            // rather than waiting up to 30s for the next unread poll, and
                                            // take it off the bubble's total at the same time.
                                            setRoomNew((r) => {
                                                const had = r[tab] || 0;
                                                if (!had) return r;
                                                setGlobalNew((g) => Math.max(0, g - had));
                                                return { ...r, [tab]: 0 };
                                            });
                                        }} />
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

// ── SEARCHING YOUR OWN FRIENDS ───────────────────────────────────────────────────────────────────────────────
// There was no search on this tab at all. The only one in the hub is on Discover, and Discover exists to meet
// people you do NOT know — it filters out everyone you are already friends with, so typing a friend's name
// into the one visible search box returns "you're already friends with everyone here". SoullessShiitake
// reported it as the friends search not working, which is exactly what it looks like from outside.
//
// This filters the list you already have, in the browser. No request, no endpoint: the friends list is
// on screen, and the only thing missing was a way to narrow it. Matches display name or @handle.
function FriendsTab({ data, busyId, onMessage, onRespond }) {
    const [q, setQ] = useState("");
    if (data === null) return <p className="muted social-empty">Loading…</p>;
    const { friends = [], incoming = [] } = data;
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    const shownFriends = needle
        ? friends.filter((m) => `${m.name || ""} ${m.alias || ""}`.toLowerCase().includes(needle))
        : friends;
    return (
        <div className="social-people">
            {friends.length > 5 ? (
                <input
                    className="social-search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filter your friends…"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                />
            ) : null}
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
            ) : shownFriends.length === 0 ? (
                <p className="muted social-empty">No friend matches &ldquo;{q.trim()}&rdquo;. To add somebody new, try Discover.</p>
            ) : (
                shownFriends.map((m) => (
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
// ── ONE CHAT, THREE ROOMS ────────────────────────────────────────────────────────────────────────────────────
// Luke: "two new channels, one for VIPs and one for staff and owners. These only show up as tabs in social if
// you are in that group... the chats are exclusive so non-members can't see into them, and once you join that
// chat you are only able to see messages from after your join date."
//
// The same component for all three, because they ARE the same thing — a feed, a composer, and a name on each
// line. What differs is which channel it asks for, and every part of the answer to that lives on the server:
// which rooms exist for you, what is in them, and how far back you may see. The tab not rendering is a
// courtesy, not the lock.
// EXPORTED, because the VIP lounge shows the vip channel inside the room it belongs to. Pointing the lounge
// at its own new chat would have split the VIP conversation across two places and left neither worth reading,
// and copying this component would have meant two composers, two poll loops and two ideas about the join
// window. One chat, rendered wherever the room is.
// One name in the rail. Sprite, name, and the badge under it — a role if they wear one, otherwise the XP
// rank, because almost nobody sets a role and a blank column beside every name is worse than no column.
// ── ONE MEMBER, IN AS LITTLE ROOM AS THAT TAKES ──────────────────────────────────────────────────────────────
// Luke: "the list of members should be way more concise, you shouldn't take up so much room."
//
// Each row was a 26px portrait over a name over a role CHIP — three stacked things, about 52px of height
// each, in a 76px column. The chip was the expensive one: a second line of text, in a pill, repeating
// something the portrait could carry on its own.
//
// So the role is the RING now. Same colour, same source (chipFor decides it, here as everywhere), drawn as
// the border of the portrait instead of as a label under it. The row is a portrait and a name, and it costs
// a little over half what it did.
function RailMember({ m }) {
    return (
        <li className={`social-rail-m${m.online ? " is-on" : ""}`} title={m.role ? `${m.name} — ${m.role.name}` : m.name}>
            <span className="social-rail-av" style={m.role?.tone ? { "--role": m.role.tone } : undefined}>
                {m.sprite
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={m.sprite} alt="" draggable="false"
                        style={m.flip ? { transform: "scaleX(-1)" } : undefined} />
                    : <i aria-hidden="true" />}
                {/* The dot is on the AVATAR rather than beside the name: it is a property of the person,
                    and putting it on the portrait keeps the text column a clean two lines. */}
                {m.online ? <b className="social-rail-dot" aria-label="online" /> : null}
            </span>
            <span className="social-rail-who">
                <b>{m.name}</b>
            </span>
        </li>
    );
}

export function GlobalChatTab({ open, onRead, channel = "global", onChannels }) {
    const [messages, setMessages] = useState(null);
    const [roster, setRoster] = useState([]);
    // ── AND THE ROSTER FOLDS AWAY ────────────────────────────────────────────────────────────────────────
    // Luke: "make it so chat can collapse the user list."
    //
    // The rail costs 76px of a 375px screen, which is the right trade while you are working out who to talk
    // to and the wrong one while you are reading a long message. Remembered in localStorage rather than reset
    // per visit: whether you want the room listed is a preference about how you read chat, not a thing about
    // this particular room, so being asked again every time you open the hub would be the app forgetting
    // something you already told it.
    const [railOpen, setRailOpen] = useState(true);
    useEffect(() => {
        try { setRailOpen(window.localStorage.getItem(RAIL_KEY) !== "0"); } catch { /* private mode */ }
    }, []);
    const foldRail = useCallback((next) => {
        setRailOpen(next);
        try { window.localStorage.setItem(RAIL_KEY, next ? "1" : "0"); } catch { /* private mode */ }
    }, []);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [note, setNote] = useState("");   // why the last message was refused
    const endRef = useRef(null);
    // Whether we have already dropped this thread to its newest message once. A ref, not state: flipping it
    // must not itself cause a render, and it has to survive every poll.
    const didFirstScroll = useRef(false);

    // ── A SILENT ROOM DOES NOT NEED ASKING EVERY TWELVE SECONDS ──────────────────────────────────────────────
    // /api/marketplace/global-chat was the highest-volume route on the site: 6.1K calls in six hours, which is
    // this 12s poll running in every open panel whether or not a word had been said. It stays at 12s while
    // people are talking and stretches to 24s, then 36s, through silence — and snaps back to 12s on the very
    // first message that arrives, or the moment this member sends one.
    const quiet = useRef(0);        // consecutive polls that brought nothing new
    const lastSeenId = useRef(null);
    const tick = useRef(0);

    const load = useCallback(async () => {
        // chrome-fanout: on-demand - runs when the plaza tab is opened
        const r = await fetch(`/api/marketplace/global-chat?channel=${encodeURIComponent(channel)}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d?.messages) setMessages(d.messages);
        else setMessages((m) => (m === null ? [] : m));
        // Did anything actually happen? The backoff below reads this — a room nobody is talking in does not
        // need asking five times a minute, and the plaza is the busiest route on the site precisely because
        // it was asked that often whether or not there was anything to say.
        // A SIGNATURE, not just the last id: if the id ever stopped coming down, an id-only check would read
        // "nothing new" forever and quietly put a busy room on the slowest cadence. Count plus last-message
        // still changes when somebody speaks, whatever fields the row happens to carry.
        const list = Array.isArray(d?.messages) ? d.messages : [];
        const last = list[list.length - 1];
        const sig = `${list.length}:${last?.id ?? last?.created_at ?? last?.body ?? ""}`;
        if (sig !== lastSeenId.current) { lastSeenId.current = sig; quiet.current = 0; }
        else quiet.current += 1;
        // Rides in with the feed rather than taking its own endpoint — see the note on the route.
        if (Array.isArray(d?.roster)) setRoster(d.roster);
        // The rooms this member can see come back with the feed rather than from a second endpoint — the hub
        // needs them to decide which tabs exist, and they are already computed to answer this request.
        if (d?.channels) onChannels?.(d.channels);
        // ── READING A ROOM CLEARS THAT ROOM, NOT JUST THE PLAZA ──────────────────────────────────────
        // This was gated on `channel === "global"`, and the server never has been: the GET stamps
        // markChannelSeen for whichever room was asked for. So News, VIP and Staff were marked read in the
        // database and left badged on screen — and because a badge is hidden while you STAND in its tab, it
        // looked cleared until you switched away, at which point it came back. The only thing that ever
        // took it off was "Mark all read", which is exactly what Luke described.
        //
        // Now every room clears its own count the moment its feed lands, which is the rule the plaza already
        // had. The 30s unread poll would have corrected it eventually; a badge that outlives the thing it is
        // counting for half a minute is still a badge that lies.
        if (d?.authenticated) onRead?.();
    }, [onRead, channel, onChannels]);

    useEffect(() => {
        if (!open) return undefined;
        load();
        const iv = setInterval(() => {
            if (document.visibilityState !== "visible") return;
            tick.current += 1;
            // Skip ticks rather than re-arming a timer, so the visibility gate stays where check:polls can see it.
            const every = quiet.current >= 25 ? 3 : quiet.current >= 5 ? 2 : 1;
            if (tick.current % every !== 0) return;
            load();
        }, 12000);
        return () => clearInterval(iv);
    }, [open, load]);

    // NO EFFECT RESETTING THE FEED ON A ROOM CHANGE. The hub mounts this with `key={tab}`, so switching
    // rooms unmounts and remounts it — the latch and the message list start fresh on their own. The effect
    // that used to do it by hand was a synchronous setState in an effect, which is a cascading render for a
    // state React was about to throw away anyway.

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
        setNote("");
        setSending(true);
        const r = await fetch("/api/marketplace/global-chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body, channel }),
        }).catch(() => null);
        if (r && r.ok) {
            // Sending is talking: the room is live again, so drop straight back to the 12s cadence rather than
            // leaving the person who just spoke waiting 36s to see a reply.
            quiet.current = 0; tick.current = 0;
            setInput(""); setNote(""); await load(); scrollToEndIfPinned(endRef, true);
        } else {
            // ── A REFUSED MESSAGE HAS TO SAY SO ──────────────────────────────────────────────────────────
            // This branch did nothing at all: the text stayed in the box, nothing moved, and the only reading
            // available was that the button was broken. Now the guards actually refuse things, silence is not
            // an option.
            const d = r ? await r.json().catch(() => null) : null;
            setNote(d?.error === "duplicate_chat" ? "You just said that — try something new."
                : d?.error === "too_fast" ? "Easy — give the Den a second to keep up."
                : "That didn't send. Try again.");
        }
        setSending(false);
    }

    // ONLINE FIRST, and counted so the heading can say how many rather than making it a thing you count.
    // The server already sorted them; this only needs the split for the two sub-headings.
    const here = roster.filter((m) => m.online);
    const away = roster.filter((m) => !m.online);

    // `has-rail` is what turns this into two columns, so it is conditional on there BEING a rail — an empty
    // roster with the class on would reserve the column and leave the conversation talking to a 76px strip of
    // nothing. It was unconditional while the phone layout ignored the grid; now that the grid is the layout
    // at every width, it has to mean what it says.
    return (
        <div className={`social-global${roster.length && railOpen ? " has-rail" : ""}`}>
            {note ? <p className="social-note" role="status">{note}</p> : null}
            {/* ── AND YOU CAN ALWAYS GET IT BACK ──────────────────────────────────────────────────
                Luke: "I collapse the user list and I can't get it back, also collapsing it it's like the
                smallest button on the page."

                Both halves of that were the same mistake: the control was an 18px glyph tucked into the
                corner of a heading, and the way BACK was conditional on `roster.length`. So a fold that
                landed while the roster happened to be empty — a quiet room, a slow first poll, a room you
                had only just opened — left no way back at all, and the preference is remembered, so it
                stayed gone on every future visit too.

                The restore bar is now unconditional. It renders whenever the rail is folded, whatever the
                roster says, because a control that puts something away must always be able to fetch it. And
                both controls are full-width bars rather than glyphs. */}
            {!railOpen ? (
                <button type="button" className="social-rail-show" onClick={() => foldRail(true)}>
                    <span className="social-rail-chev" aria-hidden="true">‹</span>
                    {roster.length ? <><b>{here.length}</b> here</> : "Who is in this room"}
                </button>
            ) : null}
            {roster.length && railOpen ? (
                <aside className="social-rail" aria-label="Who is in this room">
                    {/* The whole heading is the fold. It was already a full-width row carrying two words, so
                        making it the control costs nothing and gives it a 26px target instead of an 18px one. */}
                    <button type="button" className="social-rail-h" onClick={() => foldRail(false)}
                        aria-label="Hide who is in this room">
                        <b>{here.length}</b> here <i aria-hidden="true">›</i>
                    </button>
                    <ul className="social-rail-list">
                        {here.map((m) => <RailMember key={m.id} m={m} />)}
                        {away.length ? (
                            <li className="social-rail-split" aria-hidden="true">
                                <span>Also in this room</span>
                            </li>
                        ) : null}
                        {away.map((m) => <RailMember key={m.id} m={m} />)}
                    </ul>
                </aside>
            ) : null}
            <div className="social-global-feed">
                {messages === null ? (
                    <p className="muted social-empty">Loading the plaza…</p>
                ) : messages.length === 0 ? (
                    <p className="muted social-empty">{channel === "global"
                        ? "No messages yet — say hello to the whole Den."
                        : "Nothing here yet. You see what is said from the day you joined this room onward."}</p>
                ) : (
                    /* ── RUNS BY THE SAME PERSON READ AS ONE ─────────────────────────────────────────
                        GrayKitsune: "is there a way we can merge chat so the 'just now xxx' doesn't show if
                        the message is from the same user as the previous message? Like how discord works."

                        Yes, and he had just written four in a row to prove the point — four heroes, four
                        names, four timestamps, all identical, for four short lines. The repetition was
                        carrying no information and taking most of the width.

                        A message joins the one above it when it is the SAME PERSON and within five minutes.
                        Time matters as much as identity: two lines from the same member an hour apart are
                        two moments, and merging them would quietly claim they were one. Announcements never
                        join, because each one is its own event. */
                    messages.map((m, i) => {
                        const prev = i > 0 ? messages[i - 1] : null;
                        const cont = Boolean(prev) && !m.notice && !prev.notice
                            && prev.name === m.name && prev.role?.name === m.role?.name
                            && (new Date(m.at) - new Date(prev.at)) < 5 * 60 * 1000;
                        return (
                        <div key={m.id} className={`gchat-row${m.mine ? " mine" : ""}${cont ? " is-cont" : ""}`}>
                            {/* The hero sprite is a second, bigger tap target for the same profile the name
                                links to — tapping someone's hero to size them up is the instinct. */}
                            {cont ? <span className="gchat-hero is-cont" aria-hidden="true" /> : m.alias ? (
                                <Link href={`/marketplace/u/${m.alias}`} className="gchat-hero is-link" title={`Inspect ${m.name}`} aria-label={`Inspect ${m.name}`}>
                                    {heroInner(m)}
                                </Link>
                            ) : (
                                <span className="gchat-hero" aria-hidden="true">{heroInner(m)}</span>
                            )}
                            <span className="gchat-main">
                                {cont ? null : (
                                <span className="gchat-top">
                                    {m.alias ? (
                                        <Link href={`/marketplace/u/${m.alias}`} className="gchat-name">{m.name}</Link>
                                    ) : (
                                        <span className="gchat-name">{m.name}</span>
                                    )}
                                    {/* ── THE ROLE CHIP ──────────────────────────────────────────────
                                        Luke: "it shows up next to my name in chat, each role has its own
                                        colour." Resolved server-side against what the member can actually
                                        prove — see chipFor — so this only ever draws it. */}
                                    {m.role ? (
                                        <span className={`gchat-role${m.role.glow ? " is-earned" : ""}`}
                                            style={{ "--role": m.role.tone }}>{m.role.name}</span>
                                    ) : null}
                                    <span className="gchat-time">{relTime(m.at)}</span>
                                </span>
                                )}
                                {/* An Arbiter announcement gets structure and opens collapsed. Same
                                    component the plaza uses — see NoticeBody on why it is shared. */}
                                {m.notice
                                    ? <NoticeBody body={m.body} className="gchat-body" />
                                    : <span className="gchat-body" title={relTime(m.at)}>{m.body}</span>}
                            </span>
                        </div>
                        );
                    })
                )}
                <div ref={endRef} />
            </div>

            {/* ── WHO IS IN HERE ───────────────────────────────────────────────────
                Luke: "who's in the channel and who's online that's in that channel, on the right in a bar,
                with their avatar sprite, name, and role."

                Two groups under one heading rather than two lists: everybody in the rail is in the room, and
                the only thing that separates them is whether they are here right now. A second boxed list
                would imply they were two different kinds of membership.

                ON A PHONE IT GOES UNDER THE FEED, not beside it. A 150px rail beside a chat column on a
                375px screen leaves 200px for the conversation, which is the wrong thing to sacrifice. */}
            <form className="social-global-composer" onSubmit={send}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={channel === "vip" ? "Message the VIP room…"
                        : channel === "staff" ? "Message the back room…"
                        // A bug report needs the screen, what you did and what happened instead — asking for
                        // those three here costs nothing and saves the follow-up question every time.
                        : channel === "bugs" ? "What screen, what you did, what happened…"
                        : "Message the whole Den…"}
                    maxLength={channel === "bugs" ? 400 : 200}
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
                <p className="muted social-empty">{results.length ? "You're already friends with everyone that matches — Discover only shows people you haven't added. Use the Friends tab to find one you already have." : "No members match that search."}</p>
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
