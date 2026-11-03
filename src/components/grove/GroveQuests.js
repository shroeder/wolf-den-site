"use client";

import { useState } from "react";

// ── THE QUEST LOG ────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I cant see this guy's quest, lets build a quest log that is a first class feature, and it is
// separated by region and zone, shows the quest npc, and lets you turn it in remotely. As well as lays out
// where to go and what you need to do and how far along you are."
//
// What stood here was a tracker: a flat list under "Map 1", one line of grey text reading
// "Defeat 12 · Mothlight · zone 4", and no way to act on any of it. It answered WHERE and nothing else, which
// was the job it was given when the hand-in moved out into the world. The job is bigger now.
//
// Five things, in the order a player asks them:
//
//   WHO      the giver's own face and name, because that is how you remember a quest
//   WHAT     a sentence — "Defeat 12 Mothlight" — not a row of ids separated by dots
//   WHERE    the region by NAME, and the actual zones that creature lives in, as buttons you can press
//   HOW FAR  a bar, the count, and which link of the chain this is
//   AND DO IT  hand it in from here
//
// ⚠️ REMOTE HAND-IN IS A REVERSAL, AND IT IS DELIBERATE. In August the claim button was taken OFF this panel
// on the grounds that "Needs to feel like an mmo where you turn in next to them, not a panel ui form game" —
// finishing a chain from a menu made the person standing in zone 9 decoration. Luke has now asked for it back
// by name. Both things are true, so the compromise is in the WEIGHT: handing in next to them is still the
// path with the writing on it — the payoff lines, QUEST RECEIVED, the send-off, all of which only happen in
// the world — and this is the shortcut for when you are nine zones away and just want the gold. The button
// here says "Hand in from here" rather than "Claim", and the row still tells you where they are standing.
//
// ⚠️ GROUPED BY REGION, THEN ORDERED BY ZONE. "Map 3" is not a place anybody has been to; the strip, the
// atlas and the giver all call it Bogwater. mapName comes down on the board for exactly this.

const KIND_WORD = {
    cull: "Defeat", hunt: "Hunt", harvest: "Gather", forge: "Craft",
    delve: "Reach", survive: "Clear", ticket: "Reach wave",
};

/** The ask as a sentence. "Defeat 12 Mothlight", not "Defeat 12 · mothlight · zone 4". */
function askLine(a) {
    const verb = KIND_WORD[a.kind] || "Do";
    const what = a.foeLabel || a.partLabel || null;
    if (a.kind === "delve") return `Reach zone ${a.zone}`;
    if (a.kind === "survive") return `Clear zone ${a.zone} without leaving`;
    if (a.kind === "ticket") return `Reach wave ${a.wave} in the Coliseum`;
    const n = a.need > 1 ? ` ${a.need}` : "";
    return what ? `${verb}${n} ${what}` : `${verb}${n}`;
}

function Bar({ have, need, done }) {
    const pct = need > 0 ? Math.min(100, Math.round((100 * have) / need)) : 0;
    return (
        <span className={`gql-bar${done ? " is-done" : ""}`} aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
        </span>
    );
}

function Row({ q, onHandIn, onGo, busy }) {
    const a = q.active;
    const finished = !a;
    const state = finished ? "done" : a.ready ? "ready" : a.started ? "active" : "offered";

    return (
        <li className={`gql-row is-${state}`}>
            <div className="gql-who">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="gql-face" src={`/images/grove/npc-${q.npc}.webp`} alt="" draggable={false} />
                <span className="gql-id">
                    <b>{q.name}</b>
                    <span className="gql-role">{q.role}</span>
                    {/* ⚠️ WHERE THEY STAND, ALWAYS — including on a step you can hand in from here. The
                        shortcut must not make the person disappear from the screen. */}
                    <span className="gql-stands">
                        Stands in {q.zoneName ? `${q.zoneName} · ` : ""}zone {q.zone}
                    </span>
                </span>
                <span className={`gql-chip is-${state}`}>
                    {finished ? "Complete" : a.ready ? "Ready" : a.started ? `Step ${q.step} of ${q.steps}` : "Offered"}
                </span>
            </div>

            {finished ? (
                <p className="gql-fin">Nothing more to ask — all {q.steps} done.</p>
            ) : (
                <div className="gql-job">
                    <b className="gql-task">{a.title}</b>
                    <span className="gql-ask">{askLine(a)}</span>

                    {/* ── WHERE TO GO ──────────────────────────────────────────────────────────────
                        ⚠️ THE ZONES, AS BUTTONS. A cull step names a creature and nothing about which of
                        twelve rooms it lives in, so this panel used to be able to say "zone 4" for the
                        two kinds that carry one and nothing at all for the rest. whereFor resolves it
                        off the map's own zone list, server-side, and each one walks you there. */}
                    {a.started && a.where?.length ? (
                        <span className="gql-where">
                            <span className="gql-where-lab">Go to</span>
                            {a.where.slice(0, 4).map((z) => (
                                <button key={z.n} type="button" className="gql-go" disabled={busy}
                                    onClick={() => onGo?.(z.n)}>
                                    {z.name} <i>zone {z.n}</i>
                                </button>
                            ))}
                        </span>
                    ) : null}
                    {a.started && !a.where?.length && a.partLabel ? (
                        <span className="gql-where">
                            <span className="gql-where-lab">Go to</span>
                            <span className="gql-anywhere">{a.partLabel} comes off what you kill in {q.mapName}</span>
                        </span>
                    ) : null}

                    {/* ⚠️ NO BAR ON AN UNTAKEN STEP. Same rule as the card in the world and the pip over
                        his head: a 0/12 under a job nobody has agreed to reads as progress already lost. */}
                    {a.started ? (
                        <span className="gql-prog">
                            <Bar have={a.progress} need={a.need} done={a.ready} />
                            <span className="gql-num">{a.progress}/{a.need}</span>
                        </span>
                    ) : (
                        <span className="gql-untaken">Walk to them to take it on.</span>
                    )}

                    {a.reward ? (
                        <span className="gql-pay">
                            Pays
                            {a.reward.gold ? ` ${a.reward.gold} gold` : ""}
                            {a.reward.xp ? `${a.reward.gold ? " ·" : ""} ${a.reward.xp} xp` : ""}
                            {a.reward.chest ? " · a chest" : ""}
                            {a.reward.token ? " · a Coliseum token" : ""}
                        </span>
                    ) : null}

                    {a.ready ? (
                        <span className="gql-acts">
                            <button type="button" className="gql-handin" disabled={busy}
                                onClick={() => onHandIn?.(a.id)}>
                                Hand in from here
                            </button>
                            <button type="button" className="gql-goto" disabled={busy}
                                onClick={() => onGo?.(q.zone)}>
                                Or go and see them
                            </button>
                        </span>
                    ) : null}
                </div>
            )}
        </li>
    );
}

export default function GroveQuests({
    quests = [], coliseum = null, onChanged, onEnter, onGo, onHandIn, busy: running = false,
}) {
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);

    // Only regions you have actually been to. A log listing seven regions of strangers to someone standing
    // in the first one is a wall of things they cannot do yet.
    const seen = quests.filter((q) => q.done > 0 || q.active);
    const byMap = seen.reduce((acc, q) => { (acc[q.map] ||= []).push(q); return acc; }, {});

    // ⚠️ THE OPEN ONES FIRST, WITHIN A REGION. Ready to hand in, then in progress, then offered, then the
    // finished chains — which stay on the list, because a chain you completed is a thing you want to see you
    // completed. Zone order inside each band, so two live quests read left-to-right along the map.
    const rank = (q) => (!q.active ? 3 : q.active.ready ? 0 : q.active.started ? 1 : 2);
    for (const list of Object.values(byMap)) {
        list.sort((a, b) => rank(a) - rank(b) || a.zone - b.zone);
    }

    const live = seen.filter((q) => q.active?.started);
    const ready = seen.filter((q) => q.active?.ready);

    async function handIn(stepId) {
        setBusy(true);
        try {
            const r = await onHandIn?.(stepId);
            if (r?.ok) {
                setNote(r.token ? "Handed in — and a Coliseum token with the rest." : "Handed in.");
            } else {
                setNote(r?.error === "not_finished" ? "That one is not finished yet." : "They cannot take that right now.");
            }
        } finally { setBusy(false); }
    }

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

    const blocked = busy || running;

    return (
        <div className="gql">
            {/* ── WHAT IS OUTSTANDING, IN ONE LINE ────────────────────────────────────────────────
                The thing a log is opened to find out, before any of the detail under it. */}
            {seen.length ? (
                <p className="gql-top">
                    {ready.length ? <b>{ready.length} ready to hand in</b> : null}
                    {ready.length && live.length ? " · " : null}
                    {live.length ? `${live.length} in progress` : null}
                    {!ready.length && !live.length ? "Nothing on the go." : null}
                </p>
            ) : null}

            {coliseum?.marshal ? (
                <div className="gql-col">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="gql-face" src={`/images/grove/npc-${coliseum.marshal.id}.webp`} alt="" draggable={false} />
                    <span className="gql-id">
                        <b>{coliseum.marshal.name}</b>
                        <span className="gql-role">Coliseum · zone {coliseum.zone}</span>
                        <span className="gql-stands">
                            {coliseum.keys} key{coliseum.keys === 1 ? "" : "s"}
                            {coliseum.bestWave ? ` · best wave ${coliseum.bestWave}` : ""}
                        </span>
                    </span>
                    {/* ── ⚠️ THE ONLY WAY INTO A RUN, SO IT SAYS WHY IT CANNOT BE TAPPED ────────────
                        A disabled button with no reason is a broken button. The daily is the answer to
                        "no keys" and it is one tap away, so the two live together. */}
                    <span className="gql-acts">
                        {coliseum.dailyReady ? (
                            <button type="button" className="gql-handin" disabled={blocked}
                                onClick={() => claimDaily(coliseum.map)}>Take key</button>
                        ) : null}
                        <button type="button" className="gql-goto" disabled={blocked || coliseum.keys < 1}
                            onClick={() => onEnter?.(coliseum.map)}>
                            {coliseum.keys < 1 ? "No key" : "Enter"}
                        </button>
                    </span>
                </div>
            ) : null}

            {note ? <p className="gql-note" onClick={() => setNote(null)}>{note}</p> : null}

            {Object.keys(byMap).length === 0 ? (
                <p className="gql-empty">
                    Nobody has asked you for anything yet. Walk the zones and see who is standing about —
                    three people are hiding in every region.
                </p>
            ) : (
                Object.entries(byMap).sort((a, b) => Number(a[0]) - Number(b[0])).map(([map, list]) => (
                    <section key={map} className="gql-region">
                        <h4 className="gql-region-head">
                            <b>{list[0]?.mapName || `Map ${map}`}</b>
                            <i>{list.filter((q) => q.active).length} open · {list.length} {list.length === 1 ? "person" : "people"}</i>
                        </h4>
                        <ul className="gql-list">
                            {list.map((q) => (
                                <Row key={q.npc} q={q} busy={blocked}
                                    onGo={onGo} onHandIn={handIn} />
                            ))}
                        </ul>
                    </section>
                ))
            )}
        </div>
    );
}
