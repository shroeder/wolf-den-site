"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function Avatar({ user, size = 56 }) {
    return (
        <span className="mkt-member-avatar" style={{ width: size, height: size }} aria-hidden="true">
            {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" />
            ) : (
                <span>{(user.displayLabel || "?").slice(0, 1).toUpperCase()}</span>
            )}
        </span>
    );
}

function MemberTile({ user, children }) {
    const inner = (
        <>
            <Avatar user={user} />
            <span className="mkt-member-name">{user.displayLabel}</span>
            <span className="mkt-member-sub">
                {user.alias ? `@${user.alias}` : "member"} · Lv {user.level}
            </span>
        </>
    );
    return (
        <div className="mkt-member-tile">
            {user.alias ? (
                <Link href={`/marketplace/u/${user.alias}`} className="mkt-member-head">{inner}</Link>
            ) : (
                <span className="mkt-member-head">{inner}</span>
            )}
            <div className="mkt-member-actions">{children}</div>
        </div>
    );
}

export default function MarketplaceFriendsClient() {
    const router = useRouter();
    const [friends, setFriends] = useState([]);
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [members, setMembers] = useState(null);
    const [query, setQuery] = useState("");
    const [busyId, setBusyId] = useState(null);
    const seq = useRef(0);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/friends", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) {
            setFriends(d.friends || []);
            setIncoming(d.incoming || []);
            setOutgoing(d.outgoing || []);
        }
    }, []);

    const loadMembers = useCallback(async (q) => {
        const mine = ++seq.current;
        const r = await fetch(`/api/marketplace/members?q=${encodeURIComponent(q || "")}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (mine === seq.current) setMembers(d?.members || []);
    }, []);

    useEffect(() => {
        (async () => { await load(); })();
    }, [load]);

    // Debounced directory filter.
    useEffect(() => {
        const t = setTimeout(() => loadMembers(query.trim()), query.trim() ? 250 : 0);
        return () => clearTimeout(t);
    }, [query, loadMembers]);

    async function refreshAll() {
        await Promise.all([load(), loadMembers(query.trim())]);
    }

    async function addFriend(userId) {
        setBusyId(userId);
        await fetch("/api/marketplace/friends/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
        }).catch(() => null);
        await refreshAll();
        setBusyId(null);
    }

    async function respond(requestId, action, keyId) {
        setBusyId(keyId);
        await fetch("/api/marketplace/friends/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, requestId }),
        }).catch(() => null);
        await refreshAll();
        setBusyId(null);
    }

    async function removeFriend(userId) {
        setBusyId(userId);
        await fetch("/api/marketplace/friends/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", userId }),
        }).catch(() => null);
        await refreshAll();
        setBusyId(null);
    }

    async function message(userId) {
        setBusyId(userId);
        const r = await fetch("/api/marketplace/dm/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toUserId: userId }),
        }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setBusyId(null);
        if (d?.threadId) router.push(`/marketplace/dm/${d.threadId}`);
    }

    function relationAction(u) {
        if (u.relation === "friends") {
            return <button className="btn-gold" disabled={busyId === u.id} onClick={() => message(u.id)}>Message</button>;
        }
        if (u.relation === "outgoing") return <button className="button" disabled>Requested</button>;
        if (u.relation === "incoming") return <button className="btn-gold" disabled={busyId === u.id} onClick={() => addFriend(u.id)}>Accept</button>;
        return <button className="button primary" disabled={busyId === u.id} onClick={() => addFriend(u.id)}>Add friend</button>;
    }

    return (
        <div className="stack reveal">
            <section className="card mkt-social-hero">
                <h1>Community</h1>
                <p className="muted">Find players, add friends, and message them directly. Your @handle is your public identity.</p>
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter members by @handle or name…"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="mkt-member-filter"
                />
            </section>

            {incoming.length > 0 ? (
                <section className="card">
                    <h2 className="mkt-social-h2">Friend requests <span className="mkt-count-pill">{incoming.length}</span></h2>
                    <div className="mkt-member-grid">
                        {incoming.map((u) => (
                            <MemberTile key={u.requestId} user={u}>
                                <button className="btn-gold" disabled={busyId === u.requestId} onClick={() => respond(u.requestId, "accept", u.requestId)}>Accept</button>
                                <button className="button" disabled={busyId === u.requestId} onClick={() => respond(u.requestId, "decline", u.requestId)}>Decline</button>
                            </MemberTile>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="card">
                <h2 className="mkt-social-h2">Your friends <span className="mkt-count-pill">{friends.length}</span></h2>
                {friends.length === 0 ? (
                    <p className="muted">No friends yet — add people from the directory below.</p>
                ) : (
                    <div className="mkt-member-grid">
                        {friends.map((u) => (
                            <MemberTile key={u.id} user={u}>
                                <button className="btn-gold" disabled={busyId === u.id} onClick={() => message(u.id)}>Message</button>
                                <button className="button" disabled={busyId === u.id} onClick={() => removeFriend(u.id)}>Remove</button>
                            </MemberTile>
                        ))}
                    </div>
                )}
            </section>

            <section className="card">
                <h2 className="mkt-social-h2">{query.trim() ? "Search results" : "Discover members"}</h2>
                {members === null ? (
                    <p className="muted">Loading members…</p>
                ) : members.length === 0 ? (
                    <p className="muted">{query.trim() ? "No members match that." : "No members yet."}</p>
                ) : (
                    <div className="mkt-member-grid">
                        {members.map((u) => (
                            <MemberTile key={u.id} user={u}>{relationAction(u)}</MemberTile>
                        ))}
                    </div>
                )}
            </section>

            {outgoing.length > 0 ? (
                <section className="card">
                    <h2 className="mkt-social-h2">Sent requests <span className="mkt-count-pill">{outgoing.length}</span></h2>
                    <div className="mkt-member-grid">
                        {outgoing.map((u) => (
                            <MemberTile key={u.requestId} user={u}>
                                <button className="button" disabled={busyId === u.id} onClick={() => removeFriend(u.id)}>Cancel</button>
                            </MemberTile>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
