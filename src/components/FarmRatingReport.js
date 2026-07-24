"use client";

import { useEffect, useState } from "react";

import { borderClass } from "@/lib/marketplace/borders.js";
import useScrollLock from "@/lib/useScrollLock";

// "N people rated your farm" welcome-back recap. Self-fetches once on mount; if anyone liked/loved/admired your
// farm since you last checked, it pops a celebratory modal with each rater and their tier. Fetching marks it
// seen. Mirrors the pet-visit report.
export default function FarmRatingReport() {
    const [report, setReport] = useState(null);
    const [open, setOpen] = useState(false);
    useScrollLock(open);
    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/farm-ratings", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.raters?.length) { setReport(d); setOpen(true); } })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    if (!open || !report) return null;
    const { byTier = { 1: 0, 2: 0, 3: 0 }, total = 0, newCount = 0 } = report;
    return (
        <div onClick={() => setOpen(false)} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
            <style>{"@keyframes frrPop{0%{opacity:0;transform:scale(.85)}60%{transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}@keyframes frrBurst{0%{transform:scale(.4);opacity:0}50%{opacity:1}100%{transform:scale(1);opacity:1}}"}</style>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Farm rating recap" style={{ width: "100%", maxWidth: 380, maxHeight: "88dvh", overflowY: "auto", overflowX: "hidden", borderRadius: 18, background: "var(--card-bg,#17181c)", border: "2px solid #ffd75e", boxShadow: "0 20px 60px rgba(0,0,0,0.55)", animation: "frrPop .45s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ padding: "22px 18px 10px", textAlign: "center", background: "radial-gradient(120% 90% at 50% 0%, rgba(255,215,94,0.28), transparent 70%)" }}>
                    <div style={{ fontSize: 46, lineHeight: 1, animation: "frrBurst .6s ease both" }}>🏡✨</div>
                    <div style={{ fontWeight: 900, fontSize: 21, marginTop: 6 }}>{newCount} {newCount === 1 ? "person" : "people"} rated your farm!</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Word&apos;s getting around about your place.</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12 }}>
                        <TierTally icon="👍" n={byTier[1]} label="Likes" color="#7ec8ff" />
                        <TierTally icon="❤️" n={byTier[2]} label="Loves" color="#ff6fae" />
                        <TierTally icon="⭐" n={byTier[3]} label="Admires" color="#ffd75e" />
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{total} rating{total === 1 ? "" : "s"} all-time · you earned XP from each new one</div>
                </div>
                <div style={{ padding: "8px 16px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.raters.map((r, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                            <span className={borderClass(r.border)} style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.08)", border: `2px solid ${r.tierColor}88`, display: "grid", placeItems: "center" }}>
                                {r.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={r.avatarUrl} alt="" width={42} height={42} style={{ width: "100%", height: "100%", objectFit: "cover", transform: r.avatarFlip ? "scaleX(-1)" : "none" }} />
                                ) : <span style={{ fontWeight: 800, fontSize: 16 }}>{(r.name || "?").slice(0, 1).toUpperCase()}</span>}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {r.name} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>Lv {r.level}</span>
                                </div>
                                <div style={{ fontSize: 12, color: r.tierColor, fontWeight: 700 }}>{r.tierIcon} {r.tierLabel}d your farm</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ padding: "4px 16px 18px" }}>
                    <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", padding: 12, fontWeight: 800, background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#3a2c08", border: "none", borderRadius: 10, cursor: "pointer" }}>Heck yeah!</button>
                </div>
            </div>
        </div>
    );
}

function TierTally({ icon, n, label, color }) {
    return (
        <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24 }}>{icon}</div>
            <div style={{ fontWeight: 900, fontSize: 18, color, fontVariantNumeric: "tabular-nums" }}>{n}</div>
            <div className="muted" style={{ fontSize: 10 }}>{label}</div>
        </div>
    );
}
