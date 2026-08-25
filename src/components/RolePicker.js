"use client";

import { useCallback, useEffect, useState } from "react";

// ── WHICH ONE YOU WEAR ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "I'd like the ability to set my role in my profile — for example if I'm staff or an owner, I'd love to
// set that role so it shows up next to my name in chat, each role has its own colour."
//
// The list is the SERVER'S. This component asks what you have earned and shows exactly that; it has no idea
// what an owner is, cannot construct a role, and sends back only a key it was handed. That matters because a
// chip that says Staff is a claim about the shop, and a claim about the shop must not be assertable from a
// phone. See roles.js — the PUT re-derives the list and refuses anything not on it.
export default function RolePicker() {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(null);

    // Fetched with a dead flag rather than by calling a shared loader straight out of the effect: this
    // component unmounts the moment the profile section is collapsed, and a setState landing after that is
    // the usual source of the "cascading render" warning the lint gate raises here.
    const load = useCallback(async (alive = { v: true }) => {
        const r = await fetch("/api/marketplace/roles", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (alive.v) setData(d?.ok ? d : { roles: [] });
    }, []);
    useEffect(() => {
        const alive = { v: true };
        load(alive);
        return () => { alive.v = false; };
    }, [load]);

    const choose = async (key) => {
        if (busy) return;
        setBusy(key);
        const r = await fetch("/api/marketplace/roles", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ role: key }),
        }).catch(() => null);
        if (r && r.ok) await load();
        setBusy(null);
    };

    if (!data) return <p className="muted">Loading your standing…</p>;
    const roles = data.roles || [];
    if (!roles.length) return null;

    const spent = Number(data.spentCents || 0);
    const need = Number(data.vipCents || 100000);
    const hasVip = roles.some((r) => r.key === "vip");
    const pct = Math.max(0, Math.min(100, (spent / need) * 100));

    return (
        <div className="rolepick">
            <p className="rolepick-say">
                This shows next to your name in chat. You can wear any one you have earned.
            </p>
            <div className="rolepick-row">
                {roles.map((r) => (
                    <button key={r.key} type="button" disabled={busy === r.key}
                        className={`rolepick-chip${data.chosen?.key === r.key ? " is-on" : ""}${r.glow ? " is-earned" : ""}`}
                        style={{ "--role": r.tone }}
                        onClick={() => choose(r.key)}>
                        {r.name}
                        {r.rank ? <i>level {data.level}</i> : null}
                    </button>
                ))}
            </div>

            {/* ── AND WHAT THE NEXT ONE COSTS ──────────────────────────────────────────────────────────────
                Only for people who have not got it. A threshold nobody can see is a threshold nobody chases,
                and the number is not a secret — it is a thousand dollars across the counter and online
                together. Shown as progress rather than as a locked row, because a locked row with no number
                on it tells you only that you are missing something. */}
            {!hasVip ? (
                <div className="rolepick-next">
                    <span><b>VIP</b> at ${(need / 100).toLocaleString()} spent, in the shop or online</span>
                    <span className="rolepick-bar"><i style={{ width: `${pct}%` }} /></span>
                    <span className="rolepick-far">${(spent / 100).toLocaleString()} so far</span>
                </div>
            ) : null}
        </div>
    );
}
