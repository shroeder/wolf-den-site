"use client";

import { useCallback, useEffect, useState } from "react";

const KEY_STORE = "wolfden-admin-key";

// Admin control panel for the weekly boss: paste your admin key once, create a draft, generate AI art
// (retry until you like it), then release it (which blasts notifications everywhere). Not linked publicly.
export default function AdminBossPanel() {
    const [key, setKey] = useState("");
    const [bosses, setBosses] = useState([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    const [form, setForm] = useState({ name: "", description: "", maxHp: 10000, rewardsText: "", ticketDivisor: 100 });
    const [prompts, setPrompts] = useState({});
    const [days, setDays] = useState(7);

    useEffect(() => { setKey(localStorage.getItem(KEY_STORE) || ""); }, []);

    const api = useCallback(async (method, body) => {
        const r = await fetch("/api/admin/boss", {
            method,
            headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
        return d;
    }, [key]);

    const load = useCallback(async () => {
        try { const d = await api("GET"); setBosses(d.bosses || []); setErr(""); } catch (e) { setErr(e.message); }
    }, [api]);

    useEffect(() => { if (key) load(); }, [key, load]);

    async function act(fn, okMsg) {
        setBusy(true); setMsg(""); setErr("");
        try { await fn(); setMsg(okMsg); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }

    return (
        <div className="stack">
            <section className="card">
                <h2 style={{ marginTop: 0 }}>Admin key</h2>
                <label className="cart-field cart-field-full">
                    <span>Bearer admin key</span>
                    <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="paste your admin API key" autoComplete="off" />
                </label>
                <button type="button" className="button primary" onClick={() => { localStorage.setItem(KEY_STORE, key); setMsg("Key saved."); load(); }}>Save key</button>
                {msg ? <p className="shop-payment-success" style={{ marginTop: 8 }}>{msg}</p> : null}
                {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>New boss (draft)</h2>
                <div className="account-hub-fields">
                    <label className="cart-field cart-field-full"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Frostfang the Ancient" /></label>
                    <label className="cart-field cart-field-full"><span>Art description (the AI prompt)</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="a huge frost-covered dragon with glowing blue eyes, icy spikes…" /></label>
                    <label className="cart-field"><span>Max HP</span><input type="number" value={form.maxHp} onChange={(e) => setForm({ ...form, maxHp: e.target.value })} /></label>
                    <label className="cart-field"><span>Tickets = dmg ÷</span><input type="number" value={form.ticketDivisor} onChange={(e) => setForm({ ...form, ticketDivisor: e.target.value })} /></label>
                    <label className="cart-field cart-field-full"><span>Rewards (announced)</span><input value={form.rewardsText} onChange={(e) => setForm({ ...form, rewardsText: e.target.value })} placeholder="Booster box + $50 store credit raffle" /></label>
                </div>
                <button type="button" className="button primary" disabled={busy} onClick={() => act(async () => { await api("POST", { action: "create", ...form }); setForm({ name: "", description: "", maxHp: 10000, rewardsText: "", ticketDivisor: 100 }); }, "Draft created.")}>Create draft</button>
            </section>

            {bosses.map((b) => (
                <section key={b.id} className="card">
                    <h2 style={{ marginTop: 0 }}>{b.name} <span className={`boss-status boss-status-${b.status}`}>{b.status}</span></h2>
                    <p className="muted" style={{ marginTop: 0 }}>HP {Number(b.hp).toLocaleString()} / {Number(b.max_hp).toLocaleString()} · {b.fighters} fighters · {Number(b.total_dmg).toLocaleString()} dmg · tickets = dmg ÷ {b.ticket_divisor}</p>
                    {b.rewards_text ? <p className="muted" style={{ marginTop: 0 }}>🎁 {b.rewards_text}</p> : null}
                    {b.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.image_url} alt={b.name} style={{ width: 200, height: 200, objectFit: "contain" }} />
                    ) : null}

                    {b.status === "draft" ? (
                        <>
                            <label className="cart-field cart-field-full" style={{ marginTop: 8 }}>
                                <span>Art prompt (retry as needed)</span>
                                <input value={prompts[b.id] ?? b.description ?? ""} onChange={(e) => setPrompts({ ...prompts, [b.id]: e.target.value })} placeholder="describe the boss…" />
                            </label>
                            <div className="account-hub-actions">
                                <button type="button" className="button" disabled={busy} onClick={() => act(() => api("POST", { action: "art", bossId: b.id, prompt: prompts[b.id] ?? b.description }), "Art generated.")}>{b.image_url ? "🎨 Regenerate art" : "🎨 Generate art"}</button>
                                <label className="cart-field" style={{ maxWidth: 110 }}><span>Live for (days)</span><input type="number" value={days} onChange={(e) => setDays(e.target.value)} /></label>
                                <button type="button" className="btn-gold" disabled={busy} onClick={() => { if (confirm(`Release "${b.name}"? This notifies EVERYONE (Discord, web + phone push).`)) act(() => api("POST", { action: "release", bossId: b.id, days }), "Released + notifications sent!"); }}>🚀 Release + notify</button>
                            </div>
                        </>
                    ) : b.status === "live" ? (
                        <button type="button" className="button" disabled={busy} onClick={() => { if (confirm("End this boss now?")) act(() => api("POST", { action: "end", bossId: b.id }), "Ended."); }}>End boss</button>
                    ) : null}
                </section>
            ))}
        </div>
    );
}
