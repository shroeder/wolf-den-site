"use client";

import { useEffect, useState } from "react";

import { borderClass } from "@/lib/marketplace/borders.js";
import useScrollLock from "@/lib/useScrollLock";

const RARITY_COL = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8", ascendant: "#ff7a3c", eternal: "#22e0c8" };

// "Who petted your pets while you were away" welcome-back recap. Self-fetches once on mount; if anyone petted
// your pets since you last checked, it pops a modal showing each visitor, which of your pets they petted, and the
// XP each one earned. Mirrors the raid-defense report (heart-themed instead of shield). Fetching marks it seen.
export default function PetVisitReport() {
    const [report, setReport] = useState(null);
    const [open, setOpen] = useState(false);
    useScrollLock(open);
    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/pet-visits", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.visits?.length) { setReport(d); setOpen(true); } })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    if (!open || !report) return null;
    return (
        <div onClick={() => setOpen(false)} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <style>{"@keyframes pvrPop{0%{opacity:0;transform:scale(.85)}60%{transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}"}</style>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pet visit recap" style={{ width: "100%", maxWidth: 380, maxHeight: "88dvh", overflowY: "auto", overflowX: "hidden", borderRadius: 18, background: "var(--card-bg,#17181c)", border: "2px solid #e0559a", boxShadow: "0 20px 60px rgba(0,0,0,0.55)", animation: "pvrPop .45s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ padding: "22px 18px 8px", textAlign: "center", background: "radial-gradient(120% 90% at 50% 0%, rgba(224,85,154,0.26), transparent 70%)" }}>
                    <div style={{ fontSize: 46, lineHeight: 1 }}>❤️🐾</div>
                    <div style={{ fontWeight: 900, fontSize: 20, marginTop: 6 }}>Your pets got some love!</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                        {report.petterCount} {report.petterCount === 1 ? "friend" : "friends"} petted your pets {report.totalVisits}× while you were away.
                    </div>
                    <div style={{ fontSize: 25, fontWeight: 900, color: "#ff9ec2", marginTop: 8, textShadow: "0 2px 12px rgba(224,85,154,0.4)" }}>+{report.totalXp.toLocaleString()} ✨ pet XP</div>
                    <div className="muted" style={{ fontSize: 11 }}>already added to your pets</div>
                </div>
                <div style={{ padding: "10px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {report.visits.map((v, i) => (
                        <div key={i} style={{ padding: "10px 10px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span className={borderClass(v.petter.border)} style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.08)", border: "2px solid rgba(224,85,154,0.55)", display: "grid", placeItems: "center" }}>
                                    {v.petter.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={v.petter.avatarUrl} alt="" width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover", transform: v.petter.avatarFlip ? "scaleX(-1)" : "none" }} />
                                    ) : <span style={{ fontWeight: 800, fontSize: 17 }}>{(v.petter.name || "?").slice(0, 1).toUpperCase()}</span>}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {v.petter.name} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>Lv {v.petter.level}</span>
                                    </div>
                                    <div className="muted" style={{ fontSize: 12 }}>petted {v.pets.length} of your pets · {v.count}×</div>
                                </div>
                                <div style={{ fontWeight: 800, color: "#ff9ec2", fontSize: 14, whiteSpace: "nowrap" }}>+{v.xp.toLocaleString()} ✨</div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                {v.pets.map((p) => (
                                    <span key={p.petId} title={`${p.name} · +${p.xp} XP`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px 3px 3px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: `1px solid ${(RARITY_COL[p.rarity] || "#9aa0a6")}66`, fontSize: 11.5, fontWeight: 700 }}>
                                        <span style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", background: "rgba(0,0,0,0.25)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                                            {p.spriteUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={p.spriteUrl} alt="" width={24} height={24} style={{ width: "100%", height: "100%", objectFit: "contain", transform: p.spriteFlip ? "scaleX(-1)" : "none" }} />
                                            ) : "🐾"}
                                        </span>
                                        {p.name}{p.count > 1 ? <span className="muted" style={{ fontWeight: 400 }}>×{p.count}</span> : null}
                                        <span style={{ color: "#ff9ec2" }}>+{p.xp}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ padding: "4px 16px 18px" }}>
                    <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", padding: 12, fontWeight: 800, background: "#e0559a", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>Aw, thanks!</button>
                </div>
            </div>
        </div>
    );
}
