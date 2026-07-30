"use client";

import { useCallback, useEffect, useState } from "react";

import { FishingLog } from "@/components/FishingScene";

// The dedicated fishing screen. Everything the log used to hide behind a modal, behind a button that only
// appeared while a voyage was in flight: your collection, the Den's biggest catches, and the per-species
// record board — readable any time, from a real URL.
export default function FishingHome({ fishing }) {
    const [records, setRecords] = useState(null);

    // Boards are a read, so they don't go through the sailing mutator — the same reason SailingClient fetches
    // them separately (act() would setState the whole sailing screen off a reply that carries no sailing state).
    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fish_records" }),
            });
            const d = await r.json().catch(() => ({}));
            if (d?.records) setRecords({ records: d.records, top: d.top || [] });
        } catch { /* the log still renders; the boards just stay empty */ }
    }, []);
    useEffect(() => { load(); }, [load]);

    const known = fishing?.speciesKnown || 0;
    const total = fishing?.speciesTotal || 0;
    const caught = fishing?.totalCaught || 0;
    const casts = fishing?.casts || { left: 0, max: 0 };
    const pct = total ? Math.round((known / total) * 100) : 0;

    return (
        <div className="fishhome">
            <div className="fishhome-head">
                <h1>🎣 Fishing</h1>
                <p>Every species in the sea, your personal bests, and who holds the Den record.</p>
            </div>

            <div className="fishhome-stats">
                <div className="fishhome-stat">
                    <b>{known}<em>/{total}</em></b>
                    <span>species logged</span>
                </div>
                <div className="fishhome-stat">
                    <b>{caught.toLocaleString()}</b>
                    <span>fish landed</span>
                </div>
                <div className="fishhome-stat">
                    <b>{casts.left}<em>/{casts.max}</em></b>
                    <span>casts left today</span>
                </div>
            </div>

            <div className="fishhome-progress" aria-label={`${pct}% of species logged`}>
                <span style={{ width: `${pct}%` }} />
            </div>

            {/* Casting still happens at the rail — this screen is the collection, not a second way to fish. */}
            <a className="fishhome-go" href="/marketplace/sailing">
                {fishing?.available ? "🎣 Go fish — your line's ready" : "⛵ Set sail to fish"}
            </a>

            <FishingLog log={fishing?.log} known={known} total={total} records={records} onClose={null} />
        </div>
    );
}
