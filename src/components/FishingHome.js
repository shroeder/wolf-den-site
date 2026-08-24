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
            {/* The rod is the RAIL's sprite and the coin is the game's own, for the same reason as the nav
                below: an OS emoji renders differently on every device and is the one thing on the screen we
                did not draw. */}
            {/* eslint-disable @next/next/no-img-element */}
            {casts.left > 0 ? (
                <a className="fishhome-go" href="/marketplace/sailing?station=rail">
                    <img className="fishhome-go-ico" src="/images/sailing/tracks/st_rail.png" alt="" draggable="false" />
                    Head to the rail <em>· {casts.left} {casts.left === 1 ? "cast" : "casts"} ready</em>
                </a>
            ) : recharge?.available ? (
                <button type="button" className={`fishhome-go${canAfford ? "" : " is-quiet"}`}
                    disabled={busy || !canAfford} onClick={buyCast}>
                    {busy ? <>Buying…</> : <>
                        <img className="fishhome-go-ico" src="/images/sailing/tracks/st_rail.png" alt="" draggable="false" />
                        Buy another cast <em>· <img className="fishhome-go-coin" src="/images/ui/coin.png" alt="gold" draggable="false" /> {(recharge.cost || 0).toLocaleString()}</em>
                    </>}
                </button>
            ) : (
                <span className="fishhome-go is-quiet">
                    <img className="fishhome-go-ico" src="/images/sailing/tracks/st_rail.png" alt="" draggable="false" />
                    Out of casts <em>· more tomorrow</em>
                </span>
            )}
            {/* eslint-enable @next/next/no-img-element */}

            {err ? <p className="fishhome-err">{err}</p> : null}
            {recharge?.available && !canAfford ? (
                <p className="fishhome-note">You need 🪙 {((recharge.cost || 0) - gold).toLocaleString()} more for another cast.</p>
            ) : null}
            {recharge && !recharge.available && casts.left === 0 && recharge.bought >= recharge.maxPerDay ? (
                <p className="fishhome-note">You&rsquo;ve bought all {recharge.maxPerDay} extra casts today.</p>
            ) : null}

            {/* Where everything else actually lives.

                THE QUARTERMASTER IS LISTED HERE because this is where people came looking for it. Kaishiern,
                asked whether he knew about it: "I don't see one for fishing specifically." He was right — the
                only door was a tab inside the ship-battle modal, on the sailing page, behind the button that
                spends a battle. It is a station now and this is the sign pointing at it.

                Painted, not typed: the three glyphs here were OS emoji, which is somebody else's art in the
                middle of a screen made of ours. Each one is now the same sprite as the thing it leads to. */}
            <div className="fishhome-nav">
                {/* eslint-disable @next/next/no-img-element */}
                <a href="/marketplace/sailing?station=rail">
                    <b><img src="/images/sailing/tracks/st_rail.png" alt="" draggable="false" /> The Rail</b>
                    <em>Line, lure &amp; luck upgrades</em>
                </a>
                <a href="/marketplace/sailing?station=shop">
                    <b><img src="/images/sailing/tracks/st_shop.png" alt="" draggable="false" /> Quartermaster</b>
                    <em>Spend your doubloons</em>
                </a>
                <a href="/marketplace/sailing">
                    <b><img src="/images/sailing/tracks/st_helm.png" alt="" draggable="false" /> Sailing</b>
                    <em>{atSea ? "Your boat is out" : "Set sail, dig & raid"}</em>
                </a>
                {/* eslint-enable @next/next/no-img-element */}
            </div>

            <FishingLog log={fishing?.log} known={known} total={total} records={records} onClose={null} />
        </div>
    );
}
