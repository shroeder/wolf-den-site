"use client";

import { useEffect, useState } from "react";

import useScrollLock from "@/lib/useScrollLock";

const RARITY_COL = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8", ascendant: "#ff7a3c", eternal: "#22e0c8" };

// One chip a line of the hand. Kept as data rather than a chain of ternaries in the markup so the headline
// and the per-raider rows draw the same reward the same way.
const SPOIL = {
    doubloons: { label: (n) => `${n.toLocaleString()} doubloons`, icon: "🪙", col: "#ffd75e" },
    gold: { label: (n) => `${n.toLocaleString()} gold`, icon: "💰", col: "#ffd75e" },
    xp: { label: (n) => `${n.toLocaleString()} XP`, icon: "✨", col: "#8fd0ff" },
    parts: { label: (n, sp) => `${n} forge part${n === 1 ? "" : "s"}${sp.tier ? ` · tier ${sp.tier}` : ""}`, icon: "⚙️", col: "#c8d6bd" },
};
function spoilChip(sp, i) {
    if (sp.kind === "loot") return <Chip key={i} icon="🗡️" col={RARITY_COL[sp.rarity] || "#cdd9c6"} text={sp.name} />;
    if (sp.kind === "seed") return <Chip key={i} icon={sp.emoji || "🌱"} col="#9ede7a" text={sp.name || "a seed"} />;
    if (sp.kind === "chest") return <Chip key={i} icon="🧰" col="#ffcf87" text={`${sp.tier} chest`} />;
    const d = SPOIL[sp.kind];
    if (!d) return null;
    return <Chip key={i} icon={d.icon} col={d.col} text={d.label(sp.n, sp)} />;
}
function Chip({ icon, col, text }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            fontSize: 12.5, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>
            <span aria-hidden="true">{icon}</span>{text}
        </span>
    );
}

// "You got raided (and won)" welcome-back report. Self-fetches once on mount; if any raids were repelled since
// you last checked, it pops a modal with each attacker's hero card, how many times you beat them, and what
// driving them off paid (already credited at raid time — this just tells you who and how much).
//
// ⚠️ IT USED TO RENDER THE `gold` COLUMN, WHICH THE INSERT HARDCODED TO 0. The headline read "+0" with a coin
// beside it and every raider's row read "+0g", while the doubloons that were actually paid sat in a column
// nothing on this screen looked at. A reward reported as nothing is worse than no reward: it tells the member
// the system is broken AND that defending is pointless, in one line, and it had been doing so since the
// defence payout was added. The screen now draws the whole hand the repel paid.
export default function RaidDefenseReport() {
    const [report, setReport] = useState(null);
    const [open, setOpen] = useState(false);
    useScrollLock(open); // lock the background from scrolling while the report is up
    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/raid-defense", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.defenses?.length) { setReport(d); setOpen(true); } })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    if (!open || !report) return null;
    return (
        <div onClick={() => setOpen(false)} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <style>{"@keyframes rdrPop{0%{opacity:0;transform:scale(.85)}60%{transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}"}</style>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Raid defense report" style={{ width: "100%", maxWidth: 380, maxHeight: "88dvh", overflowY: "auto", overflowX: "hidden", borderRadius: 18, background: "var(--card-bg,#17181c)", border: "2px solid #5b8dd6", boxShadow: "0 20px 60px rgba(0,0,0,0.55)", animation: "rdrPop .45s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ padding: "22px 18px 8px", textAlign: "center", background: "radial-gradient(120% 90% at 50% 0%, rgba(91,141,214,0.24), transparent 70%)" }}>
                    <div style={{ fontSize: 46, lineHeight: 1 }}>🛡️</div>
                    <div style={{ fontWeight: 900, fontSize: 20, marginTop: 6 }}>You repelled {report.totalWins} raid{report.totalWins === 1 ? "" : "s"}!</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>While you were away, raiders hit your ship — and lost.</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 10 }}>
                        {(report.total || []).map(spoilChip)}
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 7 }}>already added to your account</div>
                </div>
                <div style={{ padding: "10px 16px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.defenses.map((d, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                            <span style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.08)", border: "2px solid rgba(91,141,214,0.55)", display: "grid", placeItems: "center" }}>
                                {d.attacker.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={d.attacker.avatarUrl} alt="" width={48} height={48} style={{ width: "100%", height: "100%", objectFit: "cover", transform: d.attacker.avatarFlip ? "scaleX(-1)" : "none" }} />
                                ) : <span style={{ fontWeight: 800, fontSize: 18 }}>{(d.attacker.name || "?").slice(0, 1).toUpperCase()}</span>}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {d.attacker.name} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>Lv {d.attacker.level}</span>
                                </div>
                                <div className="muted" style={{ fontSize: 12 }}>Defeated {d.count}×</div>
                                {d.gear.length ? (
                                    <div style={{ fontSize: 11, marginTop: 2 }}>🎁 took {d.gear.map((g) => <span key={g.name} style={{ color: RARITY_COL[g.rarity] || "#cdd9c6" }}>{g.name}</span>).reduce((acc, el, idx) => (idx ? [...acc, ", ", el] : [el]), [])}</div>
                                ) : null}
                                {d.spoils?.length ? (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>{d.spoils.map(spoilChip)}</div>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ padding: "4px 16px 18px" }}>
                    <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", padding: 12, fontWeight: 800, background: "#5b8dd6", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>Nice!</button>
                </div>
            </div>
        </div>
    );
}
