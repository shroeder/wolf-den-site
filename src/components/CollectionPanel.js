"use client";

import { GiWheat, GiMiningHelmet, GiPirateFlag, GiCartwheel } from "react-icons/gi";

import ItemArt from "@/components/ItemArt";

// The panel's own themed glyph per feature — an emoji here is the operating system's artwork, not the Den's.
const PANEL_ICONS = { farm: GiWheat, depths: GiMiningHelmet, sea: GiPirateFlag, wheel: GiCartwheel };

// ── A COLLECTION, SHOWN THE WAY THE FORGE SHOWS ITS PARTS ────────────────────────────────────────────────────
// Every feature with a set gets the same permanent panel on its own screen: all the pieces laid out, what each
// individual one gives you, which you have found, and the tiers and capstone they add up to.
//
// Why permanent rather than "shown once you own one": the chase is the point. A locked slot that names the
// thing you have not found yet is the reason to keep digging — an empty screen that only fills in after you
// get lucky tells nobody there was anything to look for. It is also the honest place for the numbers: these
// bonuses apply to THIS feature, so they belong on this feature's screen rather than three taps away on the
// equipment page, which is where they used to live and where nobody farming ever looked.
//
// Collections are not worn (see sets.js): owning the piece is what counts, which is why a slot here says
// "found" and never "equipped".
export default function CollectionPanel({ sets = [], title = "Collections", blurb = null, feature = null }) {
    if (!sets.length) return null;
    const Icon = PANEL_ICONS[feature] || null;
    return (
        <section className="card coll">
            <div className="coll-head">
                <strong>{Icon ? <Icon className="coll-head-icon" aria-hidden="true" /> : null}{title}</strong>
                <span className="coll-sub">{blurb || "Find the pieces — the bonus is permanent, no need to wear them."}</span>
            </div>

            {sets.map((set) => {
                const have = set.have ?? set.owned ?? 0;
                const complete = have >= set.total;
                return (
                    <div key={set.id} className={`coll-set${complete ? " is-complete" : ""}`}>
                        <div className="coll-set-head">
                            <b>{set.name}</b>
                            <span className={complete ? "coll-count is-done" : "coll-count"}>{have}/{set.total} found</span>
                        </div>
                        <div className="coll-bar"><i style={{ width: `${Math.round((have / Math.max(1, set.total)) * 100)}%` }} /></div>

                        {/* THE SLOTS. A found piece shows its own bonus; an unfound one still shows its NAME,
                            because "Deep Seed Pouch, not found yet" is a target and a blank square is not. */}
                        <div className="coll-pieces">
                            {set.pieces.map((p) => (
                                <div key={p.id} className={`coll-piece${p.owned ? " is-found" : ""}`} title={p.owned ? p.name : `${p.name} — not found yet`}>
                                    <ItemArt id={p.id} icon={p.icon} className="coll-piece-art" />
                                    <b>{p.name}</b>
                                    <em>{p.owned ? (p.utilText || p.statsText || "found") : "not found yet"}</em>
                                    {p.owned ? <i className="coll-tick" aria-hidden="true">✓</i> : null}
                                </div>
                            ))}
                        </div>

                        {/* What the pieces add up to. Live tiers lit, the rest stated so the next one is a goal. */}
                        <div className="coll-tiers">
                            {set.tiers.map((t, i) => (
                                <span key={i} className={t.active ? "is-on" : undefined}>
                                    {t.active ? "✓" : "○"} {t.need} pieces — {t.text || tierText(t)}
                                </span>
                            ))}
                            {set.capstone ? (
                                <span className={`coll-cap${set.capstone.active ? " is-on" : ""}`}>
                                    {set.capstone.active ? "★" : "☆"} All {set.total} — {set.capstone.desc.replace(/^[^:]+:\s*/, "")}
                                </span>
                            ) : null}
                        </div>

                        {/* WHAT THE NUMBERS MEAN. "+12% Lucky Spin" is jargon until this line is on the same
                            screen — a player should never have to guess what an effect they're chasing does. */}
                        {set.legend?.length ? (
                            <dl className="coll-legend">
                                {set.legend.map((l) => (
                                    <div key={l.label}>
                                        <dt>{l.label}</dt>
                                        <dd>{l.desc}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : null}
                    </div>
                );
            })}
        </section>
    );
}

// A tier's bonus as text. The server hands back whichever of these blocks the set uses; a collection never
// carries combat stats, but the reader is written to say something sensible if one ever does.
function tierText(t) {
    const parts = [];
    for (const [k, v] of Object.entries(t.farm || {})) parts.push(`+${v}% ${label(k)}`);
    for (const [k, v] of Object.entries(t.depth || {})) parts.push(`+${v} ${label(k)}`);
    for (const [k, v] of Object.entries(t.sea || {})) parts.push(`+${v} ${label(k)}`);
    for (const [k, v] of Object.entries(t.wheel || {})) parts.push(`+${v}% ${label(k)}`);
    for (const [k, v] of Object.entries(t.stats || {})) parts.push(`+${v} ${label(k)}`);
    return parts.join(" · ") || "—";
}
const label = (k) => k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
