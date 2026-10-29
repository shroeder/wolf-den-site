"use client";

import { useState } from "react";

// ── THE QUEST HELPER ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we'll need a quest helper that we can, that they can pull up at their leisure."
//
// ⚠️ ITS REAL JOB IS SAYING WHERE. Three quest-givers are hidden across twelve zones per map, deliberately in
// positions a player cannot pattern-match — which is a good surprise the first time and a search every time
// after. Without a panel that names the zone, "come back to them" means walking twelve rooms hoping. Every
// other thing on this screen is secondary to the zone number.
//
// ⚠️ AND IT SHOWS FINISHED CHAINS RATHER THAN HIDING THEM. A chain you completed is a thing you want to see
// you completed; dropping it off the list the moment it pays makes the panel feel like it is forgetting.

const KIND_WORD = {
    cull: "Defeat", hunt: "Hunt", harvest: "Gather", forge: "Craft",
    delve: "Reach", survive: "Clear", ticket: "Reach wave",
};

function Bar({ have, need }) {
    const pct = need > 0 ? Math.min(100, Math.round((100 * have) / need)) : 0;
    return (
        <span className="gq-bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
        </span>
    );
}

function Row({ q, onClaim, busy }) {
    const a = q.active;
    const finished = !a;
    return (
        <li className={`gq-row${finished ? " is-done" : ""}${a?.ready ? " is-ready" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="gq-face" src={`/images/grove/npc-${q.npc}.webp`} alt="" draggable={false} />
            <span className="gq-body">
                <b className="gq-who">{q.name}</b>
                <span className="gq-where">Zone {q.zone} · {q.done}/{q.steps} done</span>
                {finished ? (
                    <span className="gq-fin">Nothing more to ask.</span>
                ) : (
                    <>
                        <span className="gq-task">{a.title}</span>
                        <span className="gq-ask">
                            {KIND_WORD[a.kind] || "Do"} {a.need > 1 ? a.need : ""}
                            {a.foe ? ` · ${a.foe.replace(/_/g, " ")}` : ""}
                            {a.part ? ` · ${a.part.replace(/_/g, " ")}` : ""}
                            {a.zone ? ` · zone ${a.zone}` : ""}
                        </span>
                        <Bar have={a.progress} need={a.need} />
                        <span className="gq-num">{a.progress}/{a.need}</span>
                    </>
                )}
            </span>
            {a?.ready ? (
                <button type="button" className="gq-claim" disabled={busy} onClick={() => onClaim(a.id)}>
                    Claim
                </button>
            ) : null}
        </li>
    );
}

export default function GroveQuests({ quests = [], coliseum = null, onChanged, onEnter, busy: running = false }) {
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);

    // Only maps you have actually been to. A panel listing seven maps of strangers to someone standing in
    // map one is a wall of things they cannot do yet.
    const seen = quests.filter((q) => q.done > 0 || q.active);
    const byMap = seen.reduce((acc, q) => { (acc[q.map] ||= []).push(q); return acc; }, {});

    async function claimDaily(map) {
        setBusy(true);
        try {
            // ⚠️ THE QUESTS ROUTE, AND ONLY IT. The first cut of this also posted
            // {action:"start"} to the coliseum route — which SPENDS A KEY AND BEGINS A RUN before
            // handing the daily over. Taking your free key would have consumed it and dropped you into
            // an arena you did not ask for. The daily is a quest-giver handing something over; it is
            // idempotent against the shop's own date and belongs nowhere near the run endpoint.
            const q = await fetch("/api/marketplace/grove/quests", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ daily: true, map }),
            }).then((x) => x.json()).catch(() => null);
            setNote(q?.ok ? "The marshal hands you a key." : "You already took today's key.");
            if (q?.ok) onChanged?.();
        } finally { setBusy(false); }
    }

    async function claim(stepId) {
        setBusy(true);
        try {
            const r = await fetch("/api/marketplace/grove/quests", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ stepId }),
            });
            const j = await r.json();
            setNote(j?.ok ? `${j.npc}: ${j.step?.title} — paid.` : (j?.error || "Could not claim that."));
            if (j?.ok) onChanged?.();
        } catch {
            setNote("Could not claim that.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="gq">
            {coliseum?.marshal ? (
                <div className="gq-col">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="gq-face" src={`/images/grove/npc-${coliseum.marshal.id}.webp`} alt="" draggable={false} />
                    <span className="gq-body">
                        <b className="gq-who">{coliseum.marshal.name}</b>
                        <span className="gq-where">Coliseum · zone {coliseum.zone}</span>
                        <span className="gq-ask">
                            {coliseum.keys} key{coliseum.keys === 1 ? "" : "s"}
                            {coliseum.bestWave ? ` · best wave ${coliseum.bestWave}` : ""}
                        </span>
                    </span>
                    {/* ── ⚠️ THE ONLY WAY INTO A RUN, SO IT SAYS WHY IT CANNOT BE TAPPED ────────────
                        A disabled button with no reason is a broken button. The daily is the answer to
                        "no keys" and it is one tap away, so the two live together. */}
                    <span className="gq-colacts">
                        {coliseum.dailyReady ? (
                            <button type="button" className="gq-claim" disabled={running}
                                onClick={() => claimDaily(coliseum.map)}>Take key</button>
                        ) : null}
                        <button type="button" className="gq-claim" disabled={running || coliseum.keys < 1}
                            onClick={() => onEnter?.(coliseum.map)}>
                            {coliseum.keys < 1 ? "No key" : "Enter"}
                        </button>
                    </span>
                </div>
            ) : null}

            {note ? <p className="gq-note">{note}</p> : null}

            {Object.keys(byMap).length === 0 ? (
                <p className="gq-empty">Nobody has asked you for anything yet. Walk the zones and see who is standing about.</p>
            ) : (
                Object.entries(byMap).sort((a, b) => Number(a[0]) - Number(b[0])).map(([map, list]) => (
                    <section key={map} className="gq-map">
                        <h4>Map {map}</h4>
                        <ul className="gq-list">
                            {list.map((q) => <Row key={q.npc} q={q} onClaim={claim} busy={busy} />)}
                        </ul>
                    </section>
                ))
            )}
        </div>
    );
}
