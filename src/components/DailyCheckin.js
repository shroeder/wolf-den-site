"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// The once-a-day check-in modal: a login-streak reward to claim + a "while you were away" summary. Mounted
// globally (marketplace layout); it self-suppresses if there's nothing to show or already claimed today.
export default function DailyCheckin() {
    const [state, setState] = useState(null);
    const [open, setOpen] = useState(false);
    const [claimed, setClaimed] = useState(null);
    const [busy, setBusy] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        let alive = true;
        (async () => {
            const r = await fetch("/api/marketplace/checkin", { cache: "no-store" }).catch(() => null);
            const d = r?.ok ? await r.json().catch(() => null) : null;
            if (alive && d?.signedIn && d.show) { setState(d); setOpen(true); }
        })();
        return () => { alive = false; };
    }, []);

    async function claim() {
        setBusy(true);
        const r = await fetch("/api/marketplace/checkin", { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (d?.ok) setClaimed(d);
        else setOpen(false);
    }

    if (!mounted || !open || !state) return null;
    const s = state.summary || {};
    const streak = claimed ? claimed.streak : state.nextStreak;
    const reward = claimed ? claimed.reward : state.reward;

    return createPortal(
        <div className="checkin-overlay" onClick={() => setOpen(false)}>
            <div className={`checkin-modal${claimed?.jackpot ? " is-jackpot" : ""}`} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="checkin-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
                <div className="checkin-flame">🔥</div>
                <div className="checkin-streak">Day {streak}</div>
                <div className="checkin-dots">
                    {Array.from({ length: 7 }, (_, i) => {
                        const dayNum = i + 1;
                        const cyclePos = ((streak - 1) % 7) + 1;
                        const on = dayNum <= cyclePos;
                        return <span key={i} className={`checkin-dot${on ? " on" : ""}${dayNum === 7 ? " big" : ""}`}>{dayNum === 7 ? "★" : "●"}</span>;
                    })}
                </div>

                {claimed ? (
                    <>
                        <h2 className="checkin-title">{reward.emoji} +{reward.label}!</h2>
                        {claimed.logins?.length ? (
                            <div className="checkin-summary">
                                <div className="checkin-loot-head">Your gear also triggered:</div>
                                {claimed.logins.map((l, idx) => <div key={idx} className="checkin-row">{l.emoji} {l.text}</div>)}
                            </div>
                        ) : null}
                        <p className="checkin-sub">{claimed.jackpot ? "🎉 Weekly jackpot! Keep the streak alive." : "See you tomorrow to keep the streak going."}</p>
                        <button type="button" className="btn-gold" onClick={() => setOpen(false)}>Sweet!</button>
                    </>
                ) : (
                    <>
                        <h2 className="checkin-title">Welcome back!</h2>
                        <p className="checkin-sub">Today&apos;s streak reward: <strong>{reward.emoji} {reward.label}</strong></p>
                        <div className="checkin-summary">
                            {s.pet ? <div className="checkin-row">🐾 <strong>{s.pet.name}</strong> is Lv {s.pet.level}{s.pet.maxed ? " (MAX)" : ""}</div> : null}
                            {s.bossName && s.packDamage24h > 0 ? <div className="checkin-row">⚔️ The pack hit <strong>{s.bossName}</strong> for {s.packDamage24h.toLocaleString()} in the last day</div> : null}
                            {s.questsReady > 0 ? <div className="checkin-row">📜 {s.questsReady} quest{s.questsReady > 1 ? "s" : ""} ready to claim</div> : null}
                        </div>
                        <button type="button" className="btn-gold" onClick={claim} disabled={busy}>{busy ? "…" : `Claim Day ${streak}`}</button>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}
