"use client";

import { useCallback, useEffect, useState } from "react";

// ── THE MUSTER ───────────────────────────────────────────────────────────────────────────────────────────────
// A raid is fought by tapping foes on the Town page. That page is the only client that draws them, which is
// the real reason you have to be stood in the plaza — the server never checked. So the power that says "you
// may fight from anywhere" is this: a small horn that rides every page, wakes up when a raid is running, and
// lets the holder swing at the same foes through the same endpoints.
//
// DELIBERATELY NOT A SECOND TOWN. No walking, no chat, no roster, no art — those are what the plaza is FOR,
// and reproducing them here would make the Town page pointless rather than making the raid portable. What you
// get is the fight and nothing else, which is exactly what the card promises.
//
// It polls slowly while closed (a raid is a rare thing and most polls find nothing) and quickly while open.
const IDLE_MS = 45000;
const OPEN_MS = 4000;

export default function MusterHorn() {
    const [state, setState] = useState(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(null);
    const [flash, setFlash] = useState(null);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/muster", { cache: "no-store" }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setState(d?.live ? d : null);
        if (!d?.live) setOpen(false);
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, open ? OPEN_MS : IDLE_MS);
        return () => clearInterval(t);
    }, [load, open]);

    // One tap, one swing — the same two calls the plaza makes, in the same order. `dist: 0` is a dead-centre
    // swing: there is no timing bar out here, and grading a bar the member cannot see would be a hidden tax on
    // fighting away from the square.
    async function swing(enemyId) {
        if (!state?.event) return;
        setBusy(enemyId || "boss");
        const body = state.event.boss
            ? { action: "boss_strike", eventId: state.event.id, dist: 0 }
            : { action: "duel", eventId: state.event.id, enemyId, dist: 0 };
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(null);
        if (d?.reward) setFlash(`+${d.reward.xp || 0} XP · +${d.reward.coin || 0} gold`);
        else if (d?.error) setFlash(d.error === "taken" ? "Somebody else has that one." : "Not this time.");
        else setFlash("Swing landed.");
        setTimeout(() => setFlash(null), 2600);
        await load();
    }

    if (!state?.event) return null;
    const ev = state.event;

    return (
        <div className={`muster${open ? " is-open" : ""}`}>
            {open ? (
                <div className="muster-panel">
                    <div className="muster-head">
                        <span className="muster-name">{ev.emoji} {ev.name}</span>
                        <button type="button" className="muster-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
                    </div>
                    <p className="muster-sub">
                        Answering the horn from wherever you are.
                        {state.wave ? ` Wave ${state.wave}.` : ""}
                        {ev.myDamage ? ` Your damage: ${ev.myDamage.toLocaleString()}.` : ""}
                    </p>
                    {ev.boss ? (
                        <button type="button" className="btn-gold muster-strike" onClick={() => swing(null)} disabled={busy === "boss"}>
                            {busy === "boss" ? "…" : `Strike · ${ev.hpPct}% left`}
                        </button>
                    ) : state.enemies.length ? (
                        <div className="muster-foes">
                            {state.enemies.map((e) => (
                                <button key={e.id} type="button" className={`muster-foe${e.mine ? " is-mine" : ""}`} onClick={() => swing(e.id)} disabled={busy === e.id}>
                                    <span className="muster-foe-name">{e.emoji} {e.label}</span>
                                    <span className="muster-foe-hp"><i style={{ width: `${e.hpPct}%` }} /></span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="muster-sub">The wave is clear — the next one is forming.</p>
                    )}
                    {flash ? <p className="muster-flash">{flash}</p> : null}
                    <a className="muster-link" href="/marketplace/town">Go to the plaza</a>
                </div>
            ) : (
                <button type="button" className="muster-horn" onClick={() => setOpen(true)}>
                    <span className="muster-horn-dot" />
                    {ev.emoji} {ev.name} — answer the horn
                </button>
            )}
        </div>
    );
}
