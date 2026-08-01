"use client";

import { useState } from "react";

// Another member's recipe book. Same question the Kitchen answers about you — what have you found, what's still
// out there — asked about someone else, because seeing a fuller book than yours is what sends you looking for
// the one you're missing.
//
// Found recipes show their art and how many times they've been cooked. Missing ones are named but greyed: you
// learn what exists to chase without being handed the tier's reward ladder, which is the Kitchen's job.
export default function PublicRecipeBook({ book, displayLabel }) {
    const [openTier, setOpenTier] = useState(null);
    if (!book?.tiers?.length) return null;
    const pct = book.total ? Math.round((book.known / book.total) * 100) : 0;

    return (
        <div className="prb">
            <div className="prb-top">
                <div className="prb-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
                <b>{book.known}/{book.total}</b>
                <span className="muted">· {book.cooked.toLocaleString()} dishes cooked</span>
            </div>

            {book.tiers.map((t) => {
                const open = openTier === t.tier;
                return (
                    <div key={t.tier} className="prb-tier">
                        <button type="button" className="prb-head" onClick={() => setOpenTier(open ? null : t.tier)} style={{ "--tc": t.color }}>
                            <span className="prb-name">{t.name}</span>
                            <span className="prb-mini" aria-hidden="true">
                                {/* One pip per recipe: the shape of someone's collection at a glance, before any tapping. */}
                                {t.recipes.map((r) => <i key={r.id} className={r.has ? "is-on" : ""} />)}
                            </span>
                            <span className="prb-count">{t.have}/{t.total}</span>
                        </button>
                        {open ? (
                            <div className="prb-list">
                                {t.recipes.map((r) => (
                                    <div key={r.id} className={`prb-row${r.has ? "" : " is-missing"}`}>
                                        {r.has && r.sprite
                                            ? <img src={r.sprite} alt="" className="prb-art" />
                                            : <span className="prb-art prb-art-none" aria-hidden="true">{r.has ? "🍽️" : "·"}</span>}
                                        <span className="prb-rn">{r.name}</span>
                                        {r.has
                                            ? <span className="prb-times">{r.timesCooked > 0 ? `×${r.timesCooked}` : "not cooked yet"}</span>
                                            : <span className="prb-times">—</span>}
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                );
            })}
            <p className="muted prb-foot">Tap a tier to see what {displayLabel} has found.</p>

            <style>{`
                .prb-top { display: flex; align-items: center; gap: 9px; font-size: 0.85rem; margin-bottom: 12px; }
                .prb-track { flex: 1 1 auto; height: 7px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
                .prb-track > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg,#ffd75e,#ffb347); }
                .prb-tier { border-top: 1px solid rgba(255,255,255,0.07); }
                .prb-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 2px; background: none;
                    border: none; cursor: pointer; color: inherit; text-align: left; }
                .prb-name { font-weight: 900; font-size: 0.9rem; color: var(--tc, #f2ead9); min-width: 82px; }
                .prb-mini { display: flex; gap: 3px; flex: 1 1 auto; flex-wrap: wrap; }
                .prb-mini i { width: 7px; height: 7px; border-radius: 2px; background: rgba(255,255,255,0.13); }
                .prb-mini i.is-on { background: var(--tc, #ffd75e); box-shadow: 0 0 5px var(--tc, #ffd75e); }
                .prb-count { font-size: 0.8rem; font-weight: 800; color: #b9a892; white-space: nowrap; }
                .prb-list { padding: 2px 0 10px; }
                .prb-row { display: flex; align-items: center; gap: 10px; padding: 5px 4px; }
                .prb-row.is-missing { opacity: 0.42; }
                .prb-art { width: 30px; height: 30px; object-fit: contain; flex: none; }
                .prb-art-none { display: grid; place-items: center; font-size: 15px; color: #6e6558; }
                .prb-rn { flex: 1 1 auto; font-size: 0.87rem; min-width: 0; }
                .prb-times { font-size: 0.76rem; color: #9c8f7a; white-space: nowrap; }
                .prb-foot { font-size: 0.78rem; margin: 8px 0 0; }
            `}</style>
        </div>
    );
}
