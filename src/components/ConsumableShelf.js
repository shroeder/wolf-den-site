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
// ── `reloadOnUse` IS GONE, AND IT WAS NEVER NEEDED ───────────────────────────────────────────────────────────
// It existed so a SERVER component could mount this without passing a function prop (not serialisable). Only
// one host ever set it — the farm — and FarmClient has been a client component the whole time, so it could
// always have been told directly. What the flag actually did was `window.location.reload()`, which threw the
// page away: Luke, using fertilizer, "it redirects me out of the garden." Which panel was open is component
// state, so the reload dropped him back on Today.
//
// A host that owns the thing being changed passes `onUsed` and refreshes itself. A host that cannot be told
// has no business mounting a control that changes what it is showing, so there is no boolean escape hatch any
// more — the next person to need one should lift the shelf into a client component instead.
export default function ConsumableShelf({ feature, title = "In your pack", onUsed = null }) {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(null);
    const [msg, setMsg] = useState(null);

    const load = useCallback(async () => {
        const r = await fetch(`/api/marketplace/consumables?feature=${encodeURIComponent(feature)}`, { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d && !d.error) setData(d);
    }, [feature]);

    useEffect(() => { load(); }, [load]);

    // ── SPENDING THE STACK IN ONE REQUEST ── (named spendStack, not useStack: in a component file a
    // `useX` is a hook, and the lint rule is right to say so.) ────────────────────────────────────────────────────────────────
    // Eleven vials was eleven taps and eleven invocations. The loop lives on the server now (see
    // useConsumableBulk), which keeps the behaviour identical to tapping eleven times — the same path runs
    // eleven times, it just runs there. Only offered where the SERVER said the item is bulk-usable.
    const spendStack = useCallback(async (id) => {
        setBusy(id);
        setMsg(null);
        const r = await fetch("/api/marketplace/consumables", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, action: "use_stack" }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(null);
        if (d?.ok) {
            setMsg({ ok: true, text: d.applied || "Used." });
            await load();
            onUsed?.();
        } else {
            setMsg({ ok: false, text: d?.error === "not_bulkable" ? "That one is used one at a time." : "Could not use those." });
        }
    }, [load, onUsed]);

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
        } else {
            setMsg({ ok: false, text: d?.error === "none_owned" ? "You don't have one of those."
                : d?.error === "strikes_capped" ? "You already hold the most bonus strikes a day can (8)."
                    : "Couldn't use that." });
        }
    }, [load, onUsed]);

    // ── AND SPENDING ONE THAT IS ALREADY ON YOU ──────────────────────────────────────────────────────────
    // Same shape as `use`, different verb: an active pill names an EFFECT rather than an item. Only pills the
    // server marked with an action get a button, so this is never reachable for a pill that has none.
    const spendActive = useCallback(async (a) => {
        setBusy(a.kind);
        setMsg(null);
        const r = await fetch("/api/marketplace/consumables", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "active", effect: a.action }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(null);
        if (d?.ok) {
            setMsg({ ok: true, text: d.applied || "Done." });
            await load();
            // ⚠️ THIS is the path fertilizer takes — an ACTIVE pill, not a stash item — and it reloaded the
            // page too. Fixing only `use` above would have left the exact button Luke reported still doing it.
            onUsed?.(a.kind, d);
        } else {
            setMsg({ ok: false, text: d?.error === "nothing_growing"
                ? "Nothing is growing that could use it."
                : d?.error === "no_fertilizer" ? "None left in the shed." : "Couldn't use that." });
        }
    }, [load, onUsed]);

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
                        <span key={a.kind + a.label} className="cshelf-on"><i aria-hidden="true" />{a.label}
                            {/* Most of these are read-outs — a boost with an hour left, a lure banked against
                                the next dig — and they fire on their own, so a button would be a lie. The one
                                that is a STOCK rather than a countdown gets one. */}
                            {a.action ? (
                                <button type="button" className="cshelf-on-go" disabled={busy === a.kind} onClick={() => spendActive(a)}>
                                    {busy === a.kind ? "…" : (a.cta || "Use")}
                                </button>
                            ) : null}
                        </span>
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
                                <span className="cshelf-acts">
                                    <button type="button" className="cshelf-use" disabled={busy === c.id} onClick={() => use(c.id)}>
                                        {busy === c.id ? "…" : "Use"}
                                    </button>
                                    {/* Only when the server says so, and only when there is a stack to spend —
                                        "Use all" on a single item is the "Use" button with a longer name. */}
                                    {c.bulk && c.count > 1 ? (
                                        <button type="button" className="cshelf-use is-all" disabled={busy === c.id} onClick={() => spendStack(c.id)}>
                                            {busy === c.id ? "…" : `All ${c.count}`}
                                        </button>
                                    ) : null}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            {msg ? <p className={msg.ok ? "cshelf-ok" : "cshelf-err"}>{msg.text}</p> : null}
        </section>
    );
}
