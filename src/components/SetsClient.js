"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import ItemArt from "@/components/ItemArt";
import useScrollLock from "@/lib/useScrollLock";
import { describeSea, describeFarm, describeStats } from "@/lib/marketplace/items.js";

const RARITY = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ff9a3c", mythic: "#ff5a7a", ascendant: "#5ad0ff", eternal: "#ffd75e" };
// Null-safe: the sailing/farm/wheel sets' tiers grant affinity (no combat stats), so `stats` can be null — guard it
// (an unguarded Object.entries(null) here 500'd the whole /marketplace/sets page).
const statText = (stats) => describeStats(stats);
// Wheelwarden set bonus: a % chance per spin to trigger a Lucky Spin (charge burst + bonus gold).
// No Lucky Charge line any more — the pity bar it fed was removed from the wheel entirely (see spin.js).
const describeWheel = (w) => [w.luck ? `${w.luck}% Lucky Spin chance` : "", w.goldPct ? `+${w.goldPct}% spin gold` : ""].filter(Boolean).join(" · ");
const tierText = (t) => [statText(t.stats), t.sea ? describeSea(t.sea) : "", t.farm ? describeFarm(t.farm) : "", t.wheel ? describeWheel(t.wheel) : ""].filter(Boolean).join(" · ") || "—";

// The gear-sets overview: each set as a card with its pieces shown as tappable ART tiles (equipped / owned /
// locked), the tiered bonuses, and the full-set capstone. Tapping a piece inspects what it does.
export default function SetsClient({ sets, exhibit = null, canLoan = false }) {
    const [inspect, setInspect] = useState(null);
    const [loan, setLoan] = useState(exhibit);
    const [busy, setBusy] = useState(false);

    // THE LOANED EXHIBIT — name one piece you do not own and it counts as owned everywhere a set is read.
    // Only ever offered on a piece that is genuinely missing, and tapping the piece already on loan returns
    // it, so the same button is both verbs. A reload comes back off the server, not off this state.
    async function borrow(id) {
        setBusy(true);
        const next = loan === id ? "" : id;
        const r = await fetch("/api/marketplace/sets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "loan", pieceId: next }) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (d?.ok) { setLoan(d.exhibit || null); setInspect(null); if (typeof window !== "undefined") window.location.reload(); }
    }
    useScrollLock(Boolean(inspect)); // lock bg scroll behind the piece-inspect modal

    return (
        <>
            {sets.map((s) => {
                const complete = s.equipped >= s.total;
                return (
                    <section key={s.id} className={`card set-card${complete ? " set-complete" : ""}`}>
                        <div className="set-card-head">
                            <h2 style={{ margin: 0 }}>{s.name}{complete ? " ✨" : ""}</h2>
                            <span className="set-count">{s.equipped}/{s.total} equipped{s.owned > s.equipped ? ` · ${s.owned}/${s.total} owned` : ""}</span>
                        </div>
                        {/* Progress toward the full set */}
                        <div className="set-progress"><span style={{ width: `${Math.round((s.equipped / s.total) * 100)}%` }} /></div>
                        <div className="set-grid">
                            {s.pieces.map((p) => (
                                <button
                                    type="button"
                                    key={p.id}
                                    className={`set-tile rar-${p.rarity} ${p.equipped ? "is-equipped" : p.owned ? "is-owned" : "is-missing"}`}
                                    style={{ borderColor: RARITY[p.rarity] || "#3a3f47" }}
                                    onClick={() => setInspect(p)}
                                    title="Tap to inspect"
                                >
                                    <ItemArt id={p.id} icon={p.icon} className="set-tile-art" />
                                    <span className="set-tile-name" style={{ color: p.equipped ? RARITY[p.rarity] : undefined }}>{p.name}</span>
                                    <span className="set-tile-state">{p.equipped ? "✅ equipped" : p.owned ? "• owned" : "🔒 locked"}</span>
                                </button>
                            ))}
                        </div>
                        <div className="set-tiers">
                            {s.tiers.map((t) => (
                                <div key={t.need} className={`set-tier${t.active ? " active" : ""}`}>
                                    <strong>{t.need}-piece:</strong> {tierText(t)}
                                </div>
                            ))}
                            {s.capstone ? (
                                <div className={`set-tier set-capstone${s.capstone.active ? " active" : ""}`}>
                                    <strong>★ Full set:</strong> {s.capstone.desc.replace(/^Full set: /, "")}
                                </div>
                            ) : null}
                        </div>
                    </section>
                );
            })}

            {inspect ? createPortal((
                <div className="equip-sheet-overlay" onClick={() => setInspect(null)} style={{ position: "fixed", inset: 0, zIndex: 1250, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.78)", padding: 20 }}>
                    <div className={`card rar-${inspect.rarity}`} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, margin: 0, textAlign: "center", borderColor: RARITY[inspect.rarity] || "#3a3f47", borderWidth: 2 }}>
                        <ItemArt id={inspect.id} icon={inspect.icon} className="set-tile-art" />
                        <div style={{ fontWeight: 900, fontSize: "1.15rem", color: RARITY[inspect.rarity] || "#fff" }}>{inspect.name}</div>
                        <div className="muted" style={{ fontSize: "0.75rem", textTransform: "capitalize", fontWeight: 700 }}>{inspect.rarity}{inspect.slot ? ` · ${inspect.slot.replace(/_/g, " ")}` : ""}</div>
                        <p style={{ margin: "10px 0 0", fontWeight: 700 }}>{inspect.statsText || "No combat stats"}</p>
                        {inspect.signature ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#ffd75e" }}>★ {inspect.signature}</p> : null}
                        {inspect.flavor ? <p className="muted" style={{ margin: "8px 0 0", fontStyle: "italic", fontSize: "0.82rem" }}>“{inspect.flavor}”</p> : null}
                        <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.8rem" }}>{inspect.equipped ? "✅ Equipped" : loan === inspect.id ? "On loan — counts as owned" : inspect.owned ? "In your bag" : "🔒 Not yet yours"}</p>
                        {/* The borrow takes the gold, and Close steps down to a plain button when it is there.
                            Shipped the other way round: the dismissal was the loudest thing on a card whose
                            whole point was the one action underneath it. */}
                        {canLoan && !inspect.equipped && (loan === inspect.id || !inspect.owned) ? (
                            <button type="button" className="button gold" style={{ marginTop: 10 }} disabled={busy} onClick={() => borrow(inspect.id)}>
                                {busy ? "…" : loan === inspect.id ? "Return it to the cabinet" : "Borrow this one"}
                            </button>
                        ) : null}
                        <button type="button" className={`button${canLoan && !inspect.equipped && (loan === inspect.id || !inspect.owned) ? "" : " gold"}`} style={{ marginTop: 12 }} onClick={() => setInspect(null)}>Close</button>
                    </div>
                </div>
            ), document.body) : null}
        </>
    );
}
