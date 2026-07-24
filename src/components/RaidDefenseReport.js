"use client";

import { useEffect, useState } from "react";

import useScrollLock from "@/lib/useScrollLock";

const RARITY_COL = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8", ascendant: "#ff7a3c", eternal: "#22e0c8" };

// "You got raided (and won)" welcome-back report. Self-fetches once on mount; if any raids were repelled since
// you last checked, it pops a modal with each attacker's hero card, how many times you beat them, and the gold
// (already credited to your wallet at raid time — this just tells you who and how much).
export default function RaidDefenseReport({ owner = false }) {
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
    // Owner-only: open the modal on demand with sample data (the report otherwise only appears after a real raid).
    function preview() {
        fetch("/api/marketplace/raid-defense?preview=1", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.defenses?.length) { setReport(d); setOpen(true); } })
            .catch(() => {});
    }
    if (!open || !report) {
        return owner ? (
            <button type="button" onClick={preview} style={{ alignSelf: "flex-start", padding: "5px 10px", borderRadius: 8, border: "1px dashed rgba(91,141,214,0.6)", background: "rgba(91,141,214,0.1)", color: "#8fb4ee", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🧪 Preview raid-defense report</button>
        ) : null;
    }
    return (
        <div onClick={() => setOpen(false)} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <style>{"@keyframes rdrPop{0%{opacity:0;transform:scale(.85)}60%{transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}"}</style>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Raid defense report" style={{ width: "100%", maxWidth: 380, maxHeight: "88dvh", overflowY: "auto", overflowX: "hidden", borderRadius: 18, background: "var(--card-bg,#17181c)", border: "2px solid #5b8dd6", boxShadow: "0 20px 60px rgba(0,0,0,0.55)", animation: "rdrPop .45s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ padding: "22px 18px 8px", textAlign: "center", background: "radial-gradient(120% 90% at 50% 0%, rgba(91,141,214,0.24), transparent 70%)" }}>
                    <div style={{ fontSize: 46, lineHeight: 1 }}>🛡️</div>
                    <div style={{ fontWeight: 900, fontSize: 20, marginTop: 6 }}>You repelled {report.totalWins} raid{report.totalWins === 1 ? "" : "s"}!</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>While you were away, raiders hit your ship — and lost.</div>
                    <div style={{ fontSize: 27, fontWeight: 900, color: "#ffd75e", marginTop: 8, textShadow: "0 2px 12px rgba(255,215,94,0.4)" }}>+{report.totalGold.toLocaleString()} 🪙</div>
                    <div className="muted" style={{ fontSize: 11 }}>already added to your wallet</div>
                </div>
                <div style={{ padding: "10px 16px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.defenses.map((d, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
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
                            </div>
                            <div style={{ fontWeight: 800, color: "#ffd75e", fontSize: 15, whiteSpace: "nowrap" }}>+{d.gold.toLocaleString()}g</div>
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
