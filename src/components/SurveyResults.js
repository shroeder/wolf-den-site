"use client";

// ── SURVEY READ-OUT ──────────────────────────────────────────────────────────────────────────────────────────
// Two numbers per system — how many called it their favourite, how many their least — drawn as a DIVERGING bar
// off a shared centre line. That shape is the whole point: a system with 6 loves and 5 dislikes and a system
// nobody mentioned both score about zero net, and only the diverging bars tell you which is which. One is
// divisive and worth a decision; the other is invisible and worth a different one.
//
// Sorted by net, so the top of the list is what to build on and the bottom is what to fix or cut.

const fmtDate = (d) => {
    try {
        return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }).format(new Date(d));
    } catch { return ""; }
};

export default function SurveyResults({ data, round = 1, rounds = 1 }) {
    const { responses = 0, systems = [], wishes = [], responsesList = [] } = data || {};
    // Round 1's answers are kept so the rounds can be read against each other; without a way to switch, that
    // is a promise the screen does not deliver on.
    const roundLinks = rounds > 1 ? Array.from({ length: rounds }, (_, i) => i + 1) : [];
    // System key → its display label, so the per-person table reads "The Kitchen" rather than "kitchen".
    const labelOf = Object.fromEntries(systems.map((s2) => [s2.key, s2.label]));
    // Both halves scale off the single largest count on either side, so the two wings stay comparable.
    const peak = Math.max(1, ...systems.map((s) => Math.max(s.favorite, s.least)));
    const answered = systems.reduce((n, s) => n + s.favorite + s.least, 0);

    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>Survey results</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    {responses === 0
                        ? "Nobody has answered yet. The modal shows once per member, after they've dismissed the newest launch card."
                        : `${responses} member${responses === 1 ? "" : "s"} answered · ${answered} pick${answered === 1 ? "" : "s"} cast.`}
                </p>
            </section>

            {roundLinks.length ? (
                <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.78rem" }}>
                    {roundLinks.map((r) => (
                        <a key={r} href={`?round=${r}`}
                            style={{ marginRight: 10, fontWeight: r === round ? 900 : 600,
                                textDecoration: r === round ? "none" : "underline" }}>
                            Round {r}{r === rounds ? " (current)" : ""}
                        </a>
                    ))}
                </p>
            ) : null}
            {responses > 0 ? (
                <section className="card">
                    <div className="svr-legend">
                        <span><i className="svr-dot is-fav" /> favourite</span>
                        <span><i className="svr-dot is-least" /> least favourite</span>
                        <span className="muted">sorted by net</span>
                    </div>
                    <div className="svr-rows">
                        {systems.map((s) => (
                            <div key={s.key} className="svr-row">
                                <span className="svr-name">{s.label}</span>
                                <span className="svr-bars">
                                    <span className="svr-side is-l">
                                        {s.least ? <span className="svr-bar is-least" style={{ width: `${(s.least / peak) * 100}%` }}>{s.least}</span> : null}
                                    </span>
                                    <i className="svr-axis" aria-hidden="true" />
                                    <span className="svr-side is-r">
                                        {s.favorite ? <span className="svr-bar is-fav" style={{ width: `${(s.favorite / peak) * 100}%` }}>{s.favorite}</span> : null}
                                    </span>
                                </span>
                                <span className={`svr-net${s.net > 0 ? " is-pos" : s.net < 0 ? " is-neg" : ""}`}>
                                    {s.net > 0 ? `+${s.net}` : s.net || "—"}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {wishes.length ? (
                <section className="card">
                    <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>What people asked for</h2>
                    <div className="svr-wishes">
                        {wishes.map((w, i) => (
                            <div key={i} className="svr-wish">
                                <p>{w.wish}</p>
                                <span className="muted">
                                    — <b>{w.name}</b>
                                    {w.favorite ? ` · likes ${labelOf[w.favorite] || w.favorite}` : ""}
                                    {w.least ? ` · least ${labelOf[w.least] || w.least}` : ""}
                                    {w.at ? ` · ${fmtDate(w.at)}` : ""}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {responsesList.length ? (
                <section className="card">
                    <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Every response</h2>
                    <p className="muted" style={{ marginTop: 0, fontSize: "0.78rem" }}>
                        Newest first. A tally is only useful if you can trace it back to people — two votes
                        against a system launched this morning mean something different from two against one
                        that has been live for months.
                    </p>
                    <div className="svr-table">
                        <div className="svr-th">
                            <span>Member</span><span>Favourite</span><span>Least</span>
                        </div>
                        {responsesList.map((r, i) => (
                            <div key={i} className="svr-tr">
                                <span className="svr-who">{r.name}</span>
                                <span className="svr-pick is-fav" data-l="Favourite:">{r.favorite ? (labelOf[r.favorite] || r.favorite) : <em>skipped</em>}</span>
                                <span className="svr-pick is-least" data-l="Least:">{r.least ? (labelOf[r.least] || r.least) : <em>skipped</em>}</span>
                                {r.wish ? <p className="svr-tr-wish">{r.wish}</p> : null}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <style jsx>{`
                .svr-legend { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; font-size: 0.76rem; font-weight: 800; color: #9aa2ab; }
                .svr-dot { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
                .svr-dot.is-fav { background: #4ad07f; }
                .svr-dot.is-least { background: #ff6f7d; }
                .svr-rows { display: grid; gap: 6px; }
                .svr-row { display: grid; grid-template-columns: 118px 1fr 42px; align-items: center; gap: 10px; }
                .svr-name { font-size: 0.82rem; font-weight: 800; }
                .svr-bars { display: grid; grid-template-columns: 1fr 2px 1fr; align-items: center; height: 22px; }
                .svr-side { display: flex; align-items: center; height: 100%; }
                .svr-side.is-l { justify-content: flex-end; }
                .svr-axis { display: block; width: 2px; height: 100%; background: rgba(255,255,255,0.16); }
                .svr-bar { display: flex; align-items: center; height: 100%; min-width: 20px; font-size: 0.7rem; font-weight: 900; color: #10160f; }
                .svr-bar.is-fav { justify-content: flex-start; padding-left: 6px; border-radius: 0 5px 5px 0; background: linear-gradient(90deg, #4ad07f, #7ce8a4); }
                .svr-bar.is-least { justify-content: flex-end; padding-right: 6px; border-radius: 5px 0 0 5px; background: linear-gradient(270deg, #ff6f7d, #ffa0a8); }
                .svr-net { text-align: right; font-size: 0.8rem; font-weight: 900; color: #7a828c; font-variant-numeric: tabular-nums; }
                .svr-net.is-pos { color: #4ad07f; }
                .svr-net.is-neg { color: #ff6f7d; }
                .svr-wishes { display: grid; gap: 9px; }
                .svr-wish { padding: 10px 12px; border-radius: 11px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); }
                .svr-wish p { margin: 0 0 4px; font-size: 0.86rem; line-height: 1.45; }
                .svr-wish span { font-size: 0.72rem; }
                .svr-table { display: grid; gap: 5px; }
                .svr-th, .svr-tr { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 8px; align-items: baseline; }
                .svr-th { padding: 0 10px 4px; font-size: 0.68rem; font-weight: 900; letter-spacing: .07em;
                    text-transform: uppercase; color: #7a828c; }
                .svr-tr { padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,0.035);
                    border: 1px solid rgba(255,255,255,0.07); }
                .svr-who { font-size: 0.83rem; font-weight: 800; }
                .svr-pick { font-size: 0.8rem; font-weight: 700; }
                .svr-pick.is-fav { color: #4ad07f; }
                .svr-pick.is-least { color: #ff6f7d; }
                .svr-pick em { font-style: normal; font-weight: 600; color: #6b727a; }
                /* The wish spans the full row underneath the picks — in full, never clipped. */
                .svr-tr-wish { grid-column: 1 / -1; margin: 6px 0 0; padding-top: 6px; font-size: 0.81rem; line-height: 1.5;
                    color: #cdd3d8; border-top: 1px solid rgba(255,255,255,0.08); white-space: pre-wrap; overflow-wrap: anywhere; }
                @media (max-width: 520px) {
                    .svr-row { grid-template-columns: 92px 1fr 36px; gap: 7px; } .svr-name { font-size: 0.75rem; }
                    .svr-th { display: none; }
                    .svr-tr { grid-template-columns: 1fr; gap: 2px; }
                    .svr-pick::before { content: attr(data-l); color: #7a828c; font-weight: 700; margin-right: 5px; }
                }
            `}</style>
        </div>
    );
}
