"use client";

import { useCallback, useEffect, useState } from "react";

// ── HOW YOUR HERO STANDS ────────────────────────────────────────────────────────────────────────────────────
// Luke: "Poses would be manageable from the equipment screen and equipable... Purchasable from where we
// manage equipment."
//
// ⚠️ ONE SHELF, NOT A WARDROBE AND A SHOP. Earned and bought poses are one thing to a player — a pose you
// have or do not — and splitting them into two lists would ask them to learn which half a pose lives in
// before they can look for it. The row says which it is; the screen does not.
//
// ⚠️ FETCHED WHEN OPENED, NOT WITH THE PAGE. The equipment screen is one of the busiest on the site and
// most visits here are about gear. Three queries for a panel nobody opened is the family-A waste CLAUDE.md
// opens with.
//
// ⚠️ AND IT DRAWS NOTHING. Equipping a pose marks the hero stale and the existing sprite cron redraws it
// once, later. A screen that generated art on tap would bill for every indecisive click, and the member
// would sit watching a spinner for twenty seconds to find out they preferred the other one.

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function PosePicker() {
    const [open, setOpen] = useState(false);
    const [shelf, setShelf] = useState(null);
    const [busy, setBusy] = useState("");
    const [note, setNote] = useState(null);

    const load = useCallback(async () => {
        const d = await fetch("/api/marketplace/poses", { cache: "no-store" })
            .then((r) => r.json()).catch(() => null);
        if (d && !d.error) setShelf(d);
    }, []);

    useEffect(() => { if (open && !shelf) load(); }, [open, shelf, load]);

    const act = async (action, pose) => {
        setBusy(pose);
        setNote(null);
        const d = await fetch("/api/marketplace/poses", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, pose }),
        }).then((r) => r.json()).catch(() => null);
        setBusy("");
        if (!d) { setNote("That did not go through."); return; }
        // The reply carries the whole shelf, so the balance and the owned set move together with what is worn.
        if (d.poses) setShelf(d);
        if (d.ok === false) {
            setNote(d.error === "not_enough_credit" ? "Not enough store credit for that one."
                : d.error === "already_owned" ? "You already have that one."
                    : d.error === "not_owned" ? "That one is not yours yet."
                        : "That did not go through.");
            return;
        }
        // ⚠️ SAYS WHAT HAPPENS NEXT, BECAUSE NOTHING VISIBLE DOES. The sprite does not change on this screen
        // — the redraw is a cron away — so a silent success reads as a button that did nothing.
        setNote(action === "buy"
            ? "Bought and equipped. Your hero is redrawn in the next pass."
            : "Equipped. Your hero is redrawn in the next pass.");
    };

    return (
        <section className="card pose-card">
            <button type="button" className="pose-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                <span>
                    <b>Pose</b>
                    <i>{shelf ? (shelf.poses.find((p) => p.worn)?.name || "At the Ready") : "how your hero stands"}</i>
                </span>
                <em aria-hidden="true">{open ? "–" : "+"}</em>
            </button>

            {open ? (
                <>
                    {!shelf ? <p className="muted pose-wait">Reading your shelf…</p> : (
                        <>
                            <p className="pose-credit">Store credit <b>{usd(shelf.balanceCents)}</b></p>
                            <ul className="pose-list">
                                {shelf.poses.map((p) => (
                                    <li key={p.id} className={`pose-row${p.worn ? " is-worn" : ""}${p.owned ? "" : " is-locked"}`}>
                                        <div className="pose-name">
                                            <b>{p.name}</b>
                                            {/* The row says which half it came from, so the shelf does not have to. */}
                                            {p.source === "shop" ? <em className="pose-tag is-shop">Epic</em> : null}
                                            {p.worn ? <em className="pose-tag is-worn">Worn</em> : null}
                                        </div>

                                        {/* ⚠️ A LOCKED ROW SHOWS THE NUMBER, NOT JUST THE LOCK. "Win 25 arena
                                            bouts" with 18 under it is a thing to go and do; without the count
                                            it is a wall, and a wall on a cosmetic screen reads as a tease. */}
                                        {!p.owned && p.need ? (
                                            <p className="pose-how">{p.how} · <b>{p.have}/{p.need}</b></p>
                                        ) : !p.owned ? null : p.how ? <p className="pose-how">{p.how}</p> : null}

                                        {p.worn ? <span className="pose-btn is-flat">Worn</span>
                                            : p.owned ? (
                                                <button type="button" className="pose-btn" disabled={busy === p.id}
                                                    onClick={() => act("equip", p.id)}>
                                                    {busy === p.id ? "…" : "Wear it"}
                                                </button>
                                            ) : p.source === "shop" ? (
                                                <button type="button" className="pose-btn is-buy"
                                                    disabled={busy === p.id || !p.affordable}
                                                    title={p.affordable ? `Buy ${p.name}` : "Not enough store credit"}
                                                    onClick={() => act("buy", p.id)}>
                                                    {busy === p.id ? "…" : usd(p.cents)}
                                                </button>
                                            ) : <span className="pose-btn is-flat">Locked</span>}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {note ? <p className="pose-note">{note}</p> : null}
                </>
            ) : null}

            <style jsx>{`
                .pose-card { padding: 0; overflow: hidden; }
                .pose-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px 16px;
                    background: none; border: 0; color: inherit; font: inherit; cursor: pointer; text-align: left; }
                .pose-head span { flex: 1; min-width: 0; display: grid; gap: 2px; }
                .pose-head b { font-size: 1rem; font-weight: 800; }
                .pose-head i { font-style: normal; font-size: 0.82rem; color: #9aa08f; }
                .pose-head em { font-style: normal; font-size: 1.3rem; color: #9aa08f; line-height: 1; }
                .pose-wait, .pose-note { margin: 0; padding: 0 16px 14px; font-size: 0.86rem; }
                .pose-note { color: #ffd166; }
                .pose-credit { margin: 0; padding: 0 16px 10px; font-size: 0.82rem; color: #9aa08f; }
                .pose-credit b { color: #e7dece; }
                .pose-list { list-style: none; margin: 0; padding: 0 16px 16px; display: grid; gap: 7px; }
                /* Name and reason share a column so the button keeps one edge down the whole list — a column
                   of buttons at different x positions is the staircase the Grove bench had. */
                .pose-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
                    gap: 4px 10px; padding: 10px 12px; border-radius: 10px;
                    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); }
                .pose-row.is-worn { border-color: rgba(255,209,102,0.5); background: rgba(255,209,102,0.08); }
                .pose-row.is-locked { opacity: 0.75; }
                .pose-name { display: flex; align-items: center; gap: 7px; min-width: 0; }
                .pose-name b { font-size: 0.9rem; font-weight: 700; }
                .pose-tag { font-style: normal; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.08em;
                    text-transform: uppercase; padding: 2px 6px; border-radius: 999px; }
                .pose-tag.is-shop { color: #2a1f05; background: #ffc861; }
                .pose-tag.is-worn { color: #cfe3c6; background: rgba(143,211,106,0.2); }
                .pose-how { grid-column: 1; margin: 0; font-size: 0.74rem; color: #9aa08f; }
                .pose-how b { color: #e7dece; font-variant-numeric: tabular-nums; }
                .pose-btn { grid-column: 2; grid-row: 1 / span 2; min-width: 86px; padding: 9px 14px;
                    border-radius: 999px; font: inherit; font-size: 0.82rem; font-weight: 800; cursor: pointer;
                    color: #1a1a12; background: linear-gradient(180deg, #ffd166, #e0a83c); border: 0; }
                .pose-btn.is-buy { color: #2a1f05; background: linear-gradient(180deg, #ffc861, #c89a3a); }
                .pose-btn.is-flat { color: #9aa08f; background: rgba(255,255,255,0.06); cursor: default;
                    display: grid; place-items: center; }
                .pose-btn:disabled { opacity: 0.5; cursor: default; }
            `}</style>
        </section>
    );
}
