"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import PetArt from "@/components/PetArt";

// Read-only, inspectable pets for a member's public profile: each owned companion shows its LEVEL and its
// accurate level-appropriate battle sprite, the equipped one is flagged, and tapping a pet opens an inspect
// sheet (portaled to <body> so a transformed ancestor can't push its fixed positioning off-screen).
const RAR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };

export default function PublicPets({ pets = [] }) {
    const [detail, setDetail] = useState(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!pets.length) return <p className="muted" style={{ margin: 0 }}>No pets unlocked yet.</p>;
    const featured = pets.find((p) => p.featured);

    const art = (p, big = false) =>
        p.spriteUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.spriteUrl} alt="" style={p.spriteFlip ? { transform: "scaleX(-1)" } : undefined} width={big ? 140 : undefined} height={big ? 140 : undefined} />
        ) : (
            <PetArt id={p.id} />
        );

    return (
        <>
            <p className="muted" style={{ marginTop: 0 }}>
                {pets.length} unlocked{featured ? <> · <strong style={{ color: "#ffd75e" }}>⭐ Equipped: {featured.name}</strong></> : ""} · tap to inspect
            </p>
            <div className="petcard-grid">
                {pets.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        className={`petcard${p.featured ? " is-equipped" : ""}`}
                        onClick={() => setDetail(p)}
                        style={{ "--rar": RAR[p.rarity] || "#9aa7b5" }}
                        title={`${p.name} · Lv ${p.level}`}
                    >
                        <span className="petcard-art">
                            {art(p)}
                            {p.featured ? <span className="petcard-eq" title="Equipped companion">★</span> : null}
                        </span>
                        <span className="petcard-name">{p.name}</span>
                        <span className="petcard-lv">Lv {p.level}</span>
                    </button>
                ))}
            </div>

            {mounted && detail ? createPortal((
                <div className="equip-sheet-overlay" onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.72)", padding: "0 0 env(safe-area-inset-bottom)" }}>
                    <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, margin: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, textAlign: "center" }}>
                        <span className="petcard-hero" style={{ "--rar": RAR[detail.rarity] || "#9aa7b5" }}>{art(detail, true)}</span>
                        <div style={{ fontWeight: 800, fontSize: "1.15rem", color: RAR[detail.rarity] || "#fff" }}>{detail.name}</div>
                        <div className="muted" style={{ fontSize: "0.8rem", textTransform: "capitalize" }}>
                            Lv {detail.level} · {detail.rarity}{detail.source ? ` · ${detail.source}` : ""}{detail.featured ? " · equipped ✓" : ""}
                        </div>
                        {detail.activeDesc ? <p style={{ margin: "10px 0 0", fontWeight: 700, color: "#ffd75e" }}>⚔️ {detail.activeDesc}</p> : null}
                        {detail.passiveDesc ? <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "#e8ddc8" }}>✨ {detail.passiveDesc}</p> : null}
                        {detail.hint ? <p className="muted" style={{ margin: "8px 0 0", fontStyle: "italic" }}>“{detail.hint}”</p> : null}
                        <button type="button" className="pill" style={{ marginTop: 14 }} onClick={() => setDetail(null)}>Close</button>
                    </div>
                </div>
            ), document.body) : null}
        </>
    );
}
