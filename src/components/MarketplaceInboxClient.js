"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function Avatar({ item }) {
    return (
        <span className="friend-avatar" aria-hidden="true">
            {item.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.avatarUrl} alt="" />
            ) : (
                <span>{(item.name || "?").slice(0, 1).toUpperCase()}</span>
            )}
        </span>
    );
}

export default function MarketplaceInboxClient() {
    const [items, setItems] = useState(null);

    useEffect(() => {
        fetch("/api/marketplace/inbox", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setItems(d?.items || []))
            .catch(() => setItems([]));
    }, []);

    if (items === null) return <p className="muted">Loading…</p>;
    if (items.length === 0) {
        return (
            <p className="muted">
                No conversations yet. <Link href="/marketplace/friends">Add friends</Link> to start chatting, or contact a vendor from a product page.
            </p>
        );
    }

    return (
        <ul className="friend-list">
            {items.map((it) => (
                <li key={`${it.kind}-${it.id}`}>
                    <Link href={it.href} className={`inbox-row${it.unread ? " unread" : ""}`}>
                        <Avatar item={it} />
                        <span className="inbox-body">
                            <span className="inbox-top">
                                <strong>{it.name}</strong>
                                <span className={`inbox-tag inbox-tag-${it.kind}`}>{it.tag}</span>
                            </span>
                            <span className="muted inbox-preview">{it.preview || "…"}</span>
                        </span>
                        {it.unread ? <span className="inbox-dot" aria-label="unread" /> : null}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
