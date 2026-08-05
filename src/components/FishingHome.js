"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FishingLog } from "@/components/FishingScene";

// The dedicated fishing screen. Everything the log used to hide behind a modal, behind a button that only
// appeared while a voyage was in flight: your collection, the Den's biggest catches, and the per-species
// record board — readable any time, from a real URL.
export default function FishingHome({ fishing, gold = 0, status = null }) {
    const [records, setRecords] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const router = useRouter();

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
    const recharge = fishing?.recharge || null;
    const canAfford = recharge && gold >= (recharge.cost || 0);
    const atSea = status && status !== "docked";

    // Buying a cast is a real action and it already existed on the server — it was simply unreachable from
    // here, so running out of casts on this screen was the end of the road.
    const buyCast = useCallback(async () => {
        if (busy || !recharge?.available || !canAfford) return;
        setBusy(true); setErr(null);
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "fish_recharge" }),
            });
            const d = await r.json().catch(() => ({}));
            if (d?.error) setErr("That didn't go through. Try again.");
            else router.refresh();
        } catch { setErr("That didn't go through. Try again."); }
        finally { setBusy(false); }
    }, [busy, recharge, canAfford, router]);

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

            {/* ── THE WAY OUT ────────────────────────────────────────────────────────────────────────────
                This screen used to have exactly ONE outbound link, and when your casts were gone it read
                "Out of casts · more tomorrow" in a quiet pill that looks like a disabled status rather than
                a link. So the page was a dead end at precisely the moment you most wanted somewhere to go —
                with no sign that upgrades and a gold recharge both existed one tap away, on a tab of another
                screen. Both are offered here now. */}
            {casts.left > 0 ? (
                <a className="fishhome-go" href="/marketplace/sailing?station=rail">
                    🎣 Head to the rail <em>· {casts.left} {casts.left === 1 ? "cast" : "casts"} ready</em>
                </a>
            ) : recharge?.available ? (
                <button type="button" className={`fishhome-go${canAfford ? "" : " is-quiet"}`}
                    disabled={busy || !canAfford} onClick={buyCast}>
                    {busy ? <>Buying…</> : <>🎣 Buy another cast <em>· 🪙 {(recharge.cost || 0).toLocaleString()}</em></>}
                </button>
            ) : (
                <span className="fishhome-go is-quiet">🎣 Out of casts <em>· more tomorrow</em></span>
            )}

            {err ? <p className="fishhome-err">{err}</p> : null}
            {recharge?.available && !canAfford ? (
                <p className="fishhome-note">You need 🪙 {((recharge.cost || 0) - gold).toLocaleString()} more for another cast.</p>
            ) : null}
            {recharge && !recharge.available && casts.left === 0 && recharge.bought >= recharge.maxPerDay ? (
                <p className="fishhome-note">You&rsquo;ve bought all {recharge.maxPerDay} extra casts today.</p>
            ) : null}

            {/* Where everything else actually lives. */}
            <div className="fishhome-nav">
                <a href="/marketplace/sailing?station=rail">
                    <b>🎣 The Rail</b>
                    <em>Line, lure &amp; luck upgrades</em>
                </a>
                <a href="/marketplace/sailing">
                    <b>⛵ Sailing</b>
                    <em>{atSea ? "Your boat is out" : "Set sail, dig & raid"}</em>
                </a>
            </div>

            <FishingLog log={fishing?.log} known={known} total={total} records={records} onClose={null} />
        </div>
    );
}
