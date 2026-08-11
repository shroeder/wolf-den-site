"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import PetArt from "@/components/PetArt";

// Read-only, inspectable pets for a member's public profile: each owned companion shows its LEVEL and its
// accurate level-appropriate battle sprite, the equipped one is flagged, and tapping a pet opens an inspect
// sheet (portaled to <body> so a transformed ancestor can't push its fixed positioning off-screen).
const RAR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };

export default function PublicPets({ pets = [], canTrade = false, targetAlias = null }) {
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
                <div className="equip-sheet-overlay petsheet-overlay" onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.72)", padding: "0 0 env(safe-area-inset-bottom)" }}>
                    <div className="card petsheet" onClick={(e) => e.stopPropagation()} style={{ "--rar": RAR[detail.rarity] || "#9aa7b5" }}>
                        {detail.featured ? <div className="petsheet-eq">⭐ Equipped companion</div> : null}
                        <span className="petcard-hero petsheet-hero">{art(detail, true)}</span>
                        <div className="petsheet-name">{detail.name}</div>
                        <div className="petsheet-tags">
                            <span className="petsheet-rar">{detail.rarity}</span>
                            {detail.source ? <span className="petsheet-src">{detail.source}</span> : null}
                        </div>
                        <div className="petsheet-lvl">
                            <div className="petsheet-lvl-top"><span>Level {detail.level}{detail.maxed ? " · MAX" : " / 6"}</span>{!detail.maxed && detail.span ? <span className="muted">{detail.into}/{detail.span} XP</span> : null}</div>
                            {/* ENSHRINED, on somebody else's profile. The permanent form and what it means,
                                because this is the one thing in the pets system that takes six weeks and a
                                chase item, and it was visible only to its owner. */}
                            {detail.stone ? (
                                <div className={`petsheet-enshrined is-${detail.stone}`}>
                                    ✦ Enshrined with the {detail.stone === "dark" ? "Darkstone" : "Lightstone"} — its ability is permanent
                                </div>
                            ) : null}
                            <div className="petsheet-bar"><span style={{ width: `${detail.maxed ? 100 : detail.span ? Math.round((detail.into / detail.span) * 100) : 0}%` }} /></div>
                        </div>
                        {detail.activeDesc ? <p className="petsheet-active">⚔️ {detail.activeDesc}</p> : null}
                        {detail.passiveDesc ? <p className="petsheet-passive">✨ {detail.passiveDesc}</p> : null}
                        {(detail.specialDesc || []).map((s, i) => <p key={i} className="petsheet-special">{s}</p>)}
                        {detail.hint ? <p className="muted petsheet-hint">“{detail.hint}”</p> : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center", flexWrap: "wrap" }}>
                            {canTrade && targetAlias && detail.tradeable ? (
                                <Link href={`/marketplace/trade/new?to=${encodeURIComponent(targetAlias)}&wantPet=${encodeURIComponent(detail.id)}`} className="btn-gold">🤝 Trade for this pet</Link>
                            ) : null}
                            <button type="button" className="pill" onClick={() => setDetail(null)}>Close</button>
                        </div>
                    </div>
                </div>
            ), document.body) : null}
        </>
    );
}
