"use client";

import { useEffect, useState } from "react";

function fmtLeft(secs) {
    if (secs <= 0) return "0m";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Global banner shown while a Happy Hour is live: the multiplier and a countdown. With no event live it shows
// the RALLY meter instead — donate gold, fill the bar, summon a x2 for the whole server. Self-hides otherwise.
export default function HappyHour({ compact = false }) {
    const [st, setSt] = useState(null);
    const [secs, setSecs] = useState(0);
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    async function load() {
        const r = await fetch("/api/marketplace/happy-hour", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d) { setSt(d); if (d.active) setSecs(d.endsInSecs || 0); }
    }
    useEffect(() => {
        load();
        const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000); // reflect the pool as others donate
        return () => clearInterval(t);
    }, []);
    useEffect(() => {
        const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, []);

    async function donate(quick) {
        const amt = quick || Number(amount) || 0;
        if (amt <= 0) return;
        setBusy(true); setMsg(null);
        const r = await fetch("/api/marketplace/happy-hour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: amt }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (d?.ok) {
            setSt(d); setAmount("");
            if (d.triggered) setMsg({ ok: true, text: "🎉 You summoned Happy Hour!" });
            else if (d.rewards?.length) setMsg({ ok: true, text: `Donation reward: ${d.rewards.join(", ")}!` });
            // A live event has nothing left to raise, so this went into the NEXT rally. Say so — "donated!" with
            // no visible meter movement reads as the gold having vanished.
            else if (d.active) setMsg({ ok: true, text: `Donated ${amt.toLocaleString()} toward the next Happy Hour!` });
            else setMsg({ ok: true, text: `Donated ${amt.toLocaleString()} to the rally!` });
            if (d.active) setSecs(d.endsInSecs || secs);
        } else setMsg({ ok: false, text: d?.error === "not_enough_gold" ? "Not enough gold." : "Couldn't donate." });
    }

    if (!st) return null;
    const gold = st.gold || 0;
    const donateRow = (
        <div className="hh-donate-row">
            <button type="button" className="hh-quick" onClick={() => donate(500)} disabled={busy || gold < 500}>+500</button>
            <button type="button" className="hh-quick" onClick={() => donate(2000)} disabled={busy || gold < 2000}>+2k</button>
            <input className="hh-input" inputMode="numeric" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
            <button type="button" className="hh-give" onClick={() => donate()} disabled={busy || !Number(amount)}>Donate</button>
        </div>
    );

    // No live event → the RALLY meter: donate to summon a Happy Hour.
    if (!st.active) {
        const r = st.rally || { pool: 0, trigger: 15000, remaining: 15000 };
        const rpct = Math.min(100, Math.round((r.pool / r.trigger) * 100));
        return (
            <section className={`card hh-card hh-rally${compact ? " hh-compact" : ""}`}>
                <div className="hh-head">
                    <div className="hh-title">🐺 Rally the pack</div>
                    <span className="hh-timer">Summons Happy Hour</span>
                </div>
                <div className="hh-meter"><span style={{ width: `${rpct}%` }} /></div>
                <div className="hh-meter-label">🪙 {r.pool.toLocaleString()} / {r.trigger.toLocaleString()} — donate {r.remaining.toLocaleString()} more to <strong>trigger a Happy Hour</strong></div>
                <div className="hh-donate">
                    {compact ? null : <span className="muted" style={{ fontSize: "0.78rem" }}>Chip in gold to summon a ×XP &amp; gold event for everyone:</span>}
                    {donateRow}
                    {msg ? <span className={msg.ok ? "hh-ok" : "hh-err"}>{msg.text}</span> : null}
                </div>
            </section>
        );
    }

    // Happy Hour is LIVE — no more donating (it's already summoned); show the effect + timer in gold instead.
    return (
        <section className={`card hh-card hh-live${compact ? " hh-compact" : ""}`} style={{ borderColor: "rgba(255,215,94,0.6)", boxShadow: "0 0 22px -6px rgba(255,215,94,0.45)" }}>
            <div className="hh-head">
                <div className="hh-title">⏰ Happy Hour <span className="hh-mult">×{st.multiplier} XP &amp; gold</span></div>
                <span className="hh-timer">{fmtLeft(secs)} left</span>
            </div>
            <div style={{ marginTop: 8, padding: "11px 13px", borderRadius: 12, background: "linear-gradient(180deg, rgba(255,215,94,0.18), rgba(255,255,255,0.02))", border: "1px solid rgba(255,215,94,0.5)" }}>
                <div style={{ fontWeight: 800, color: "#ffe9a8" }}>🎉 It&apos;s LIVE for the whole pack!</div>
                <div style={{ fontSize: "0.84rem", marginTop: 4, color: "#e9dcb8", lineHeight: 1.45 }}>
                    Every <strong style={{ color: "#ffd75e" }}>XP</strong> and <strong style={{ color: "#ffd75e" }}>gold</strong> reward across the whole game is <strong style={{ color: "#ffd75e" }}>×{st.multiplier}</strong> right now — boss strikes, spins, harvests, sailing, everything. Just play and rack it up before the timer runs out.
                    {st.pool ? <span className="muted"> The pack donated 🪙 {st.pool.toLocaleString()} to summon it.</span> : null}
                </div>
            </div>
            {msg ? <span className={msg.ok ? "hh-ok" : "hh-err"} style={{ display: "block", marginTop: 6 }}>{msg.text}</span> : null}
        </section>
    );
}
