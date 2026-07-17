"use client";

import { useCallback, useEffect, useState } from "react";

import { GAMES } from "@/lib/marketplace/games.js";

const KEY_STORE = "wolfden-admin-key";
const labelFor = (id) => GAMES.find((g) => g.id === id)?.label || id;

// Admin roster of who plays what — paste your admin key once, then filter to a game (default Magic) to see
// the contactable list and copy their emails for FNM reminders. Not linked publicly.
export default function AdminPlayersPanel() {
    const [key, setKey] = useState("");
    const [game, setGame] = useState("magic");
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => { setKey(localStorage.getItem(KEY_STORE) || ""); }, []);

    const load = useCallback(async (g) => {
        if (!key) return;
        setBusy(true);
        setErr("");
        try {
            const r = await fetch(`/api/admin/game-interests${g ? `?game=${encodeURIComponent(g)}` : ""}`, {
                headers: { Authorization: `Bearer ${key}` },
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
            setData(d);
        } catch (e) {
            setErr(e.message);
        } finally {
            setBusy(false);
        }
    }, [key]);

    useEffect(() => { if (key) load(game); }, [key, game, load]);

    const emails = (data?.members || []).map((m) => m.email).filter(Boolean);

    async function copyEmails() {
        try {
            await navigator.clipboard.writeText(emails.join(", "));
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            setErr("Couldn't copy — select the emails manually.");
        }
    }

    return (
        <div className="stack">
            <section className="card">
                <h2 style={{ marginTop: 0 }}>Admin key</h2>
                <label className="cart-field cart-field-full">
                    <span>Bearer admin key</span>
                    <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="paste your admin API key" autoComplete="off" />
                </label>
                <button type="button" className="button primary" onClick={() => { localStorage.setItem(KEY_STORE, key); load(game); }}>Save key</button>
                {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Who plays what</h2>
                {data ? (
                    <p className="muted" style={{ marginTop: 0 }}>{data.answered} member{data.answered === 1 ? "" : "s"} have told us their games.</p>
                ) : null}
                <div className="game-chips">
                    {GAMES.map((g) => {
                        const on = game === g.id;
                        const n = data?.counts?.[g.id] || 0;
                        return (
                            <button type="button" key={g.id} onClick={() => setGame(g.id)} className={`game-chip${on ? " is-on" : ""}`} aria-pressed={on}>
                                <span aria-hidden="true">{g.emoji}</span> {g.label} · {n}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                    <strong>{data?.members?.length || 0}</strong>
                    <span className="muted">{labelFor(game)} player{(data?.members?.length || 0) === 1 ? "" : "s"}</span>
                    {emails.length ? (
                        <button type="button" className="pill" onClick={copyEmails}>{copied ? "✓ Copied" : `Copy ${emails.length} emails`}</button>
                    ) : null}
                    {emails.length ? (
                        <a className="pill" href={`mailto:?bcc=${encodeURIComponent(emails.join(","))}`}>Email them (BCC)</a>
                    ) : null}
                </div>

                {busy && !data ? <p className="muted">Loading…</p> : null}
                {data && !data.members.length ? <p className="muted">No {labelFor(game)} players yet.</p> : null}

                {data?.members?.length ? (
                    <div style={{ overflowX: "auto" }}>
                        <table className="admin-roster">
                            <thead>
                                <tr><th>Name</th><th>Handle</th><th>Email</th><th>Plays</th></tr>
                            </thead>
                            <tbody>
                                {data.members.map((m) => (
                                    <tr key={m.id}>
                                        <td>{m.name}</td>
                                        <td>{m.alias ? `@${m.alias}` : "—"}</td>
                                        <td>{m.email || "—"}</td>
                                        <td className="muted">{m.interests.map(labelFor).join(", ")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
