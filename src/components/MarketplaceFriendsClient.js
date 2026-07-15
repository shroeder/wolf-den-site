"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

function Avatar({ user }) {
    return (
        <span className="friend-avatar" aria-hidden="true">
            {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" />
            ) : (
                <span>{(user.displayLabel || "?").slice(0, 1).toUpperCase()}</span>
            )}
        </span>
    );
}

function UserRow({ user, children }) {
    return (
        <li className="friend-row">
            <Avatar user={user} />
            <span className="friend-id">
                {user.alias ? (
                    <Link href={`/marketplace/u/${user.alias}`}>{user.displayLabel}</Link>
                ) : (
                    <span>{user.displayLabel}</span>
                )}
                <span className="muted friend-handle">{user.alias ? `@${user.alias}` : ""} · Lv {user.level}</span>
            </span>
            <span className="friend-actions">{children}</span>
        </li>
    );
}

export default function MarketplaceFriendsClient() {
    const [friends, setFriends] = useState([]);
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const searchSeq = useRef(0);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/friends", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) {
            setFriends(d.friends || []);
            setIncoming(d.incoming || []);
            setOutgoing(d.outgoing || []);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Debounced search.
    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const seq = ++searchSeq.current;
        const t = setTimeout(async () => {
            const r = await fetch(`/api/marketplace/users/search?q=${encodeURIComponent(q)}`, { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (seq === searchSeq.current) {
                setResults(d?.results || []);
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    async function refreshAll() {
        await Promise.all([load(), refreshSearch()]);
    }

    async function refreshSearch() {
        const q = query.trim();
        if (q.length < 2) return;
        const r = await fetch(`/api/marketplace/users/search?q=${encodeURIComponent(q)}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setResults(d.results || []);
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

    async function respond(requestId, action, userId) {
        setBusyId(userId || requestId);
        await fetch("/api/marketplace/friends/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, requestId }),
        }).catch(() => null);
        await refreshAll();
        setBusyId(null);
    }

    async function remove(userId) {
        setBusyId(userId);
        await fetch("/api/marketplace/friends/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", userId }),
        }).catch(() => null);
        await refreshAll();
        setBusyId(null);
    }

    function relationButton(u) {
        if (u.relation === "friends") return <span className="muted" style={{ fontSize: "0.85rem" }}>✓ Friends</span>;
        if (u.relation === "outgoing") return <button className="button" disabled onClick={() => {}}>Requested</button>;
        if (u.relation === "incoming") return <button className="button primary" disabled={busyId === u.id} onClick={() => addFriend(u.id)}>Accept</button>;
        return <button className="button primary" disabled={busyId === u.id} onClick={() => addFriend(u.id)}>Add</button>;
    }

    return (
        <>
            <section className="card">
                <h1>Friends</h1>
                <label htmlFor="friend-search" className="muted" style={{ fontSize: "0.9rem" }}>Find people by @handle or name</label>
                <input
                    id="friend-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search members…"
                    autoCapitalize="none"
                    autoCorrect="off"
                    style={{ marginTop: 6 }}
                />
                {query.trim().length >= 2 ? (
                    <ul className="friend-list" style={{ marginTop: 10 }}>
                        {searching && results.length === 0 ? <li className="muted">Searching…</li> : null}
                        {!searching && results.length === 0 ? <li className="muted">No members found.</li> : null}
                        {results.map((u) => (
                            <UserRow key={u.id} user={u}>{relationButton(u)}</UserRow>
                        ))}
                    </ul>
                ) : null}
            </section>

            {incoming.length > 0 ? (
                <section className="card">
                    <h2>Requests</h2>
                    <ul className="friend-list">
                        {incoming.map((u) => (
                            <UserRow key={u.requestId} user={u}>
                                <button className="button primary" disabled={busyId === u.requestId} onClick={() => respond(u.requestId, "accept", u.requestId)}>Accept</button>
                                <button className="button" disabled={busyId === u.requestId} onClick={() => respond(u.requestId, "decline", u.requestId)}>Decline</button>
                            </UserRow>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section className="card">
                <h2>Your friends ({friends.length})</h2>
                {friends.length === 0 ? (
                    <p className="muted">No friends yet — search above to add some.</p>
                ) : (
                    <ul className="friend-list">
                        {friends.map((u) => (
                            <UserRow key={u.id} user={u}>
                                <Link className="button" href={`/marketplace/u/${u.alias}`}>Profile</Link>
                                <button className="button" disabled={busyId === u.id} onClick={() => remove(u.id)}>Remove</button>
                            </UserRow>
                        ))}
                    </ul>
                )}
            </section>

            {outgoing.length > 0 ? (
                <section className="card">
                    <h2>Sent requests</h2>
                    <ul className="friend-list">
                        {outgoing.map((u) => (
                            <UserRow key={u.requestId} user={u}>
                                <button className="button" disabled={busyId === u.id} onClick={() => remove(u.id)}>Cancel</button>
                            </UserRow>
                        ))}
                    </ul>
                </section>
            ) : null}
        </>
    );
}
