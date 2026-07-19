"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BOUNTY_TYPES } from "@/lib/marketplace/bounty-types";

function expiresIn(iso) {
    if (!iso) return "";
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "expiring";
    const days = Math.floor(ms / 86400000);
    if (days >= 1) return `${days}d left`;
    return `${Math.max(1, Math.floor(ms / 3600000))}h left`;
}

// The bounty board — filterable list of open community bounties, with a prominent "post" action.
export default function BountyBoardClient() {
    const [bounties, setBounties] = useState(null);
    const [type, setType] = useState("");
    const [gold, setGold] = useState(null);

    useEffect(() => {
        let alive = true;
        setBounties(null);
        const qs = type ? `?type=${encodeURIComponent(type)}` : "";
        fetch(`/api/marketplace/bounties${qs}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!alive || !d) return;
                setBounties(d.bounties || []);
                setGold(d.gold);
            })
            .catch(() => alive && setBounties([]));
        return () => {
            alive = false;
        };
    }, [type]);

    return (
        <div className="stack reveal">
            <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 220 }}>
                        <h1 style={{ margin: 0 }}>🎯 Bounty Board</h1>
                        <p className="muted" style={{ margin: "4px 0 0" }}>
                            Post a request, attach your gold, and let the pack help — learning a game, a card hunt, a trade, and more. Fulfilled in the real world on the honor system.
                        </p>
                    </div>
                    <Link href="/marketplace/bounties/new" className="btn-gold">+ Post a bounty</Link>
                </div>
                {gold != null ? <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>🪙 You have {gold.toLocaleString()} gold to put on bounties.</p> : null}
            </section>

            <div className="bounty-filters">
                <button type="button" className={`pill${type === "" ? " is-active" : ""}`} onClick={() => setType("")}>All</button>
                {BOUNTY_TYPES.map((t) => (
                    <button type="button" key={t.id} className={`pill${type === t.id ? " is-active" : ""}`} onClick={() => setType(t.id)}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {bounties === null ? (
                <section className="card"><p className="muted" style={{ margin: 0 }}>Loading bounties…</p></section>
            ) : bounties.length === 0 ? (
                <section className="card">
                    <p className="muted" style={{ margin: 0 }}>
                        No open bounties{type ? " in this category" : ""} yet. <Link href="/marketplace/bounties/new">Post the first one →</Link>
                    </p>
                </section>
            ) : (
                <div className="bounty-grid">
                    {bounties.map((b) => (
                        <Link key={b.id} href={`/marketplace/bounties/${b.id}`} className="card bounty-card">
                            <div className="bounty-card-top">
                                <span className="bounty-type">{b.typeIcon} {b.typeLabel}</span>
                                <span className={`bounty-mode bounty-mode-${b.mode}`}>{b.mode === "group" ? "👥 Group" : "🙋 Solo"}</span>
                            </div>
                            <div className="bounty-card-title">{b.title}</div>
                            {b.images?.length ? <img src={b.images[0]} alt="" className="bounty-card-img" /> : null}
                            {b.description ? <div className="bounty-card-desc muted">{b.description}</div> : null}
                            <div className="bounty-card-foot">
                                <span className="bounty-reward">🪙 {b.reward.toLocaleString()}</span>
                                <span className="muted">{b.claimCount} on it · {expiresIn(b.expiresAt)}</span>
                            </div>
                            <div className="bounty-card-creator muted">
                                by {b.creator.alias ? `@${b.creator.alias}` : b.creator.name}
                                {b.viewerClaimed ? " · you're on this" : ""}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
