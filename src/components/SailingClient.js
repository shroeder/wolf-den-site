"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The Sailing stage: your boat sails out to the island and back over real-world hours, then you collect the
// haul. Voyage progress is derived from the departed/returns timestamps so the bar/boat move smoothly without
// hammering the server — we only re-fetch on actions. Upgrade Speed (shorter trips) and Luck (richer hauls).

function fmtLeft(ms) {
    if (ms <= 0) return "arriving…";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m left`;
    if (m > 0) return `${m}m ${sec}s left`;
    return `${sec}s left`;
}

function Stars({ level }) {
    // Compact star rating: 1 star per boat "tier" (every 10 levels), so it grows as the hull upgrades.
    const tier = Math.floor((level - 1) / 10) + 1;
    return (
        <span className="sail-stars" aria-label={`Tier ${tier}`}>
            {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < tier ? "on" : "off"}>★</span>
            ))}
        </span>
    );
}

export default function SailingClient({ initial, hero, pet, captain }) {
    const [state, setState] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [reward, setReward] = useState(null);
    const [now, setNow] = useState(Date.now); // lazy init (a fn ref, so it's not an impure call during render)
    const arrivedRef = useRef(false);

    // Live clock: tick every second so the countdown + boat position update. When the boat crosses into
    // "arrived", refetch once to sync the authoritative state (and enable Collect).
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const refetch = useCallback(async () => {
        const r = await fetch("/api/marketplace/sailing", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setState(d);
    }, []);

    // Derive live status from timestamps (authoritative server state only changes on actions).
    const { departedAt, returnsAt } = state;
    let status = "idle";
    let progress = 0;
    if (departedAt && returnsAt) {
        if (now >= returnsAt) { status = "arrived"; progress = 1; }
        else { status = "sailing"; progress = Math.max(0, Math.min(0.999, (now - departedAt) / (returnsAt - departedAt))); }
    }
    useEffect(() => {
        if (status === "arrived" && !arrivedRef.current) { arrivedRef.current = true; refetch(); }
        if (status !== "arrived") arrivedRef.current = false;
    }, [status, refetch]);

    const act = useCallback(async (action) => {
        setBusy(true);
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
            });
            const d = await r.json().catch(() => ({}));
            if (d && !d.error) {
                setState(d);
                if (action === "collect" && d.haul) setReward({ ...d.haul, leveledTo: d.leveledTo || null });
            }
        } finally {
            setBusy(false);
        }
    }, []);

    // Boat position along the sea: out (0→0.5) sails right toward the island, back (0.5→1) returns left home.
    const outbound = progress <= 0.5;
    const leg = outbound ? progress / 0.5 : (1 - progress) / 0.5; // 0 at home, 1 at island
    const xPct = 7 + leg * 70;
    const sailingBack = status === "sailing" && !outbound;
    const boatFlip = sailingBack; // face the way we're travelling (art faces right by default)

    const level = state.level;
    const xpPct = Math.min(100, Math.round((state.xpInto / Math.max(1, state.xpSpan)) * 100));

    return (
        <div className="stack reveal sailing">
            <section className="card" style={{ overflow: "hidden" }}>
                <div className="sail-head">
                    <h1 style={{ margin: 0 }}>⛵ Sailing</h1>
                    <span className="sail-owner-pill">Owner preview</span>
                </div>

                {/* The sea stage */}
                <div className="sail-sea" style={{ backgroundImage: `url(${state.oceanBg})` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="sail-island" src={state.islandArt} alt="" />

                    <div className={`sail-boat${status === "sailing" ? " is-sailing" : ""}`} style={{ left: `${xPct}%` }}>
                        <div className="sail-boat-inner" style={boatFlip ? { transform: "scaleX(-1)" } : undefined}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="sail-boat-img" src={state.boatArt} alt="Your boat" />
                            {/* Crew riding the deck — your hero + equipped pet, composited from their own sprites. */}
                            <span className="sail-crew">
                                {pet?.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="sail-pet" src={pet.url} alt="" style={pet.flip ? { transform: "scaleX(-1)" } : undefined} />
                                ) : null}
                                {hero?.spriteUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="sail-hero" src={hero.spriteUrl} alt="" style={hero.spriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                                ) : hero?.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="sail-hero sail-hero-avatar" src={hero.avatarUrl} alt="" />
                                ) : null}
                            </span>
                        </div>
                    </div>

                    <div className="sail-status">
                        {status === "idle" && <span>⚓ Docked · ready to set sail</span>}
                        {status === "sailing" && <span>{outbound ? "🧭 Sailing to the island" : "🏝️ Homeward bound"} · {fmtLeft(returnsAt - now)}</span>}
                        {status === "arrived" && <span>🏴‍☠️ Back at port with a full hold!</span>}
                    </div>
                </div>

                {/* Boat identity + XP */}
                <div className="sail-boatline">
                    <div>
                        <span className="sail-boatname">Wood Boat</span> <Stars level={level} />
                        <span className="muted" style={{ marginLeft: 8 }}>Lv {level}{level >= state.maxLevel ? " · MAX" : ""}</span>
                    </div>
                    <span className="muted">🧭 {state.voyagesCompleted} voyages · 🪙 {state.gold.toLocaleString()}</span>
                </div>
                <div className="sail-xpbar"><span style={{ width: `${xpPct}%` }} /></div>

                {/* Primary action */}
                <div className="sail-actions">
                    {status === "idle" && (
                        <button className="btn-gold" disabled={busy} onClick={() => act("start")}>
                            {busy ? "Casting off…" : `⛵ Set sail · ${(state.voyageMs / 3600000).toFixed(1)}h round trip`}
                        </button>
                    )}
                    {status === "sailing" && (
                        <button className="pill" disabled>⏳ At sea · {fmtLeft(returnsAt - now)}</button>
                    )}
                    {status === "arrived" && (
                        <button className="btn-gold" disabled={busy} onClick={() => act("collect")}>
                            {busy ? "Hauling in…" : "🏴‍☠️ Collect your haul"}
                        </button>
                    )}
                </div>
            </section>

            {/* Upgrades */}
            <section className="card">
                <h2 style={{ marginTop: 0 }}>Upgrade your boat</h2>
                <div className="sail-upgrades">
                    <div className="sail-upg">
                        <div className="sail-upg-top"><span>💨 Speed</span><span className="muted">Lv {state.speed.level}/{state.speed.max}</span></div>
                        <p className="muted sail-upg-desc">Shorter voyages — get your haul home faster.</p>
                        {state.speed.maxed
                            ? <button className="pill" disabled>Maxed</button>
                            : <button className="btn-ghost" disabled={busy || state.gold < state.speed.cost} onClick={() => act("upgrade_speed")}>🪙 {state.speed.cost.toLocaleString()}</button>}
                    </div>
                    <div className="sail-upg">
                        <div className="sail-upg-top"><span>🍀 Luck</span><span className="muted">Lv {state.luck.level}/{state.luck.max}</span></div>
                        <p className="muted sail-upg-desc">Richer hauls and better jackpot odds.</p>
                        {state.luck.maxed
                            ? <button className="pill" disabled>Maxed</button>
                            : <button className="btn-ghost" disabled={busy || state.gold < state.luck.cost} onClick={() => act("upgrade_luck")}>🪙 {state.luck.cost.toLocaleString()}</button>}
                    </div>
                </div>
                <p className="muted" style={{ marginBottom: 0, fontSize: "0.82rem" }}>Every 10 boat levels, {captain}&apos;s hull upgrades to a bigger ship. (More hulls coming soon.)</p>
            </section>

            {reward ? (
                <div className="sail-reward-overlay" onClick={() => setReward(null)}>
                    <div className="card sail-reward" onClick={(e) => e.stopPropagation()}>
                        <div className="sail-reward-emoji">{reward.jackpot ? "💎" : "🏴‍☠️"}</div>
                        <h2 style={{ margin: "6px 0" }}>{reward.jackpot ? "Jackpot haul!" : "Treasure recovered!"}</h2>
                        <p className="sail-reward-gold">🪙 +{reward.gold.toLocaleString()} gold</p>
                        {reward.leveledTo ? <p className="sail-reward-lvl">⬆️ Boat reached Lv {reward.leveledTo}!</p> : null}
                        <button className="btn-gold" onClick={() => setReward(null)}>Nice</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
