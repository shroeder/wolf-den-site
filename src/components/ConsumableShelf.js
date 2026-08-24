"use client";

import { useCallback, useEffect, useState } from "react";

import ConsumableArt from "@/components/ConsumableArt";

// ── WHAT YOU ARE CARRYING THAT HELPS *HERE* ──────────────────────────────────────────────────────────────────
// Kaishiern: "And a button to use consumables on tier respective screens. With an icon to say if they have been
// used already/ are active."
//
// Everything a member owns lives on one stash screen inside the store, and every one of those things is spent
// somewhere else — a Tailwind Charm only matters while you are looking at a voyage, a Harvest Charm while you
// are looking at crops. So "do I have anything that helps here" meant: leave the screen, go to the store, read
// a list of forty, come back and hope you picked the right one.
//
// This is that list, filtered to one screen, mounted ON the screen. Which consumable belongs where is derived
// from the effect it has rather than from a hand-kept list of ids — see featureOf() in consumables.js.
//
// IT RENDERS NOTHING WHEN THERE IS NOTHING. A panel that says "you have none" on every feature page is a row
// of dead furniture on six screens, and the member it is for is the one who DOES have something.
// `reloadOnUse` rather than a second callback, because SERVER components mount this too (the farm page does)
// and a function prop cannot cross that boundary — it is not serialisable, and the whole subtree silently
// fails to render. A boolean can. Client hosts that own the thing being changed pass `onUsed` instead and
// refresh themselves.
export default function ConsumableShelf({ feature, title = "In your pack", onUsed = null, reloadOnUse = false }) {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(null);
    const [msg, setMsg] = useState(null);

    const load = useCallback(async () => {
        const r = await fetch(`/api/marketplace/consumables?feature=${encodeURIComponent(feature)}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d && !d.error) setData(d);
    }, [feature]);

    useEffect(() => { load(); }, [load]);

    const use = useCallback(async (id) => {
        setBusy(id);
        setMsg(null);
        const r = await fetch("/api/marketplace/consumables", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, action: "use" }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(null);
        // The server's own sentence, not one written twice. useConsumable already returns what it did —
        // "A strong gust fills your sails — 2 hours shaved off the voyage!" — and that is a better line than
        // anything this component could compose from an id.
        if (d?.ok) {
            setMsg({ ok: true, text: d.applied || d.message || "Used." });
            await load();
            // The host page owns the thing that just changed — the voyage clock, the crop timers, the strike
            // count. It has to be told, or the shelf reports a change the screen behind it does not show.
            onUsed?.(id, d);
            // A hard reload for a host that cannot be told — see reloadOnUse. Left until after the message
            // has been set and the shelf reloaded, so a failed reload still leaves the screen correct.
            if (reloadOnUse) window.location.reload();
        } else {
            setMsg({ ok: false, text: d?.error === "none_owned" ? "You don't have one of those." : "Couldn't use that." });
        }
    }, [load, onUsed, reloadOnUse]);

    if (!data) return null;
    const { stash = [], active = [] } = data;
    if (!stash.length && !active.length) return null;

    return (
        <section className="card cshelf">
            <div className="cshelf-head">
                <b>{title}</b>
                {/* The way out, for the member who has none of something and wants one. Deliberately quiet:
                    this panel exists to spend what you have, not to sell you more. */}
                <a className="cshelf-more" href="/marketplace/store">Store ›</a>
            </div>

            {/* ── WHAT IS ALREADY RUNNING ─────────────────────────────────────────────────────────────────
                The other half of the ask. Read from wherever each effect actually lives (a boost row, a flag
                on your voyage, a count on your farm), so this can never claim something is on when it is not. */}
            {active.length ? (
                <div className="cshelf-active">
                    {active.map((a) => (
                        <span key={a.kind + a.label} className="cshelf-on"><i aria-hidden="true" />{a.label}</span>
                    ))}
                </div>
            ) : null}

            {stash.length ? (
                <div className="cshelf-grid">
                    {stash.map((c) => (
                        <div key={c.id} className="cshelf-item">
                            <span className="cshelf-art">
                                <ConsumableArt id={c.id} emoji={c.emoji} className="cshelf-img" />
                                {/* How many you hold. On the art rather than in the text, so the count is
                                    readable without reading the row. */}
                                {c.count > 1 ? <b className="cshelf-n">{c.count}</b> : null}
                            </span>
                            <span className="cshelf-body">
                                <b>{c.name}</b>
                                <em>{c.desc}</em>
                            </span>
            {/* A consumable with a `target` needs you to pick WHAT it lands on, and that picker lives on
                                another screen — so this sends you there rather than offering a tap that cannot
                                finish. Same two destinations the store's own stash uses (see ConsumablesClient):
                                a forge scroll wants the Attune tab, a charged-gear relic wants the stash's
                                picker. */}
                            {c.target === "forge" ? (
                                <a className="cshelf-go" href="/marketplace/blacksmith?tab=attune">Forge ›</a>
                            ) : c.target ? (
                                <a className="cshelf-go" href="/marketplace/store">Pick ›</a>
                            ) : (
                                <button type="button" className="cshelf-use" disabled={busy === c.id} onClick={() => use(c.id)}>
                                    {busy === c.id ? "…" : "Use"}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            {msg ? <p className={msg.ok ? "cshelf-ok" : "cshelf-err"}>{msg.text}</p> : null}
        </section>
    );
}
