"use client";

import { useCallback, useEffect, useState } from "react";

// Daily quests card — 3 rotating bounties with progress bars + claim buttons. Renders nothing until the
// member is signed in and has quests (the API assigns them on first fetch).
export default function QuestsClient() {
    const [quests, setQuests] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/quests", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setQuests(d.quests || []);
    }, []);
    useEffect(() => { load(); }, [load]);

    async function claim(key) {
        if (busy) return;
        setBusy(true);
        const r = await fetch("/api/marketplace/quests", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }),
        }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d?.ok) await load();
        setBusy(false);
    }

    if (!quests || !quests.length) return null;
    const allClaimed = quests.every((q) => q.claimed);
    const readyCount = quests.filter((q) => q.done && !q.claimed).length;

    return (
        <section className="card quests-card">
            <h3 style={{ marginTop: 0 }}>📜 Daily Quests {readyCount ? <span className="quests-ready-badge">{readyCount}</span> : null}</h3>
            <div className="quests-list">
                {quests.map((q) => {
                    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                    return (
                        <div key={q.key} className={`quest${q.claimed ? " is-claimed" : ""}${q.done && !q.claimed ? " is-ready" : ""}`}>
                            <div className="quest-main">
                                <div className="quest-label">{q.label}</div>
                                <div className="quest-reward">🪙 {q.rewardGold.toLocaleString()}{q.rewardChest ? ` · ${q.rewardChest.emoji} ${q.rewardChest.label}` : ""}</div>
                                <div className="quest-bar"><span style={{ width: `${pct}%` }} /></div>
                                <div className="quest-prog">{Math.min(q.progress, q.target).toLocaleString()} / {q.target.toLocaleString()}</div>
                            </div>
                            {q.claimed ? (
                                <span className="quest-check" aria-label="Claimed">✓</span>
                            ) : q.done ? (
                                <button type="button" className="button gold quest-claim" onClick={() => claim(q.key)} disabled={busy}>Claim</button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {allClaimed ? <p className="muted" style={{ margin: "8px 0 0" }}>All done — fresh quests tomorrow! 🌙</p> : null}
        </section>
    );
}
