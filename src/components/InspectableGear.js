"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import ItemArt from "@/components/ItemArt";

// Client shell for a member's public gear: renders the equipped + inventory chips and, on tap, an inspect
// sheet with the item's stats, signature, elemental affinity and flavor (read-only). Tradeable items get a
// "propose a trade" button. Data is prepared server-side by <PublicGear>.
export default function InspectableGear({ equipped = [], inventory = [], canTrade = false, targetAlias = null }) {
    const [detail, setDetail] = useState(null);
    // Portal the inspect sheet to <body> so a transformed/animated ancestor (e.g. .reveal) can't capture its
    // position: fixed and push it off-screen.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const chip = (i) => (
        <button
            type="button"
            key={`${i.id}${i.equipped ? "-eq" : ""}`}
            className={`equip-card rar-${i.rarity}${i.equipped ? " is-equipped" : ""} is-clickable`}
            onClick={() => setDetail(i)}
        >
            <ItemArt id={i.id} icon={i.icon} className="equip-card-glyph" />
            <span className="equip-card-name">{i.name}</span>
        </button>
    );

    return (
        <>
            {equipped.length ? (
                <>
                    <p className="muted" style={{ margin: "0 0 6px" }}>Equipped · tap to inspect</p>
                    <div className="equip-bag-grid">{equipped.map(chip)}</div>
                </>
            ) : null}
            {inventory.length ? (
                <>
                    <p className="muted" style={{ margin: "12px 0 6px" }}>Inventory ({inventory.length}) · tap to inspect{canTrade ? " or trade for" : ""}</p>
                    <div className="equip-bag-grid">{inventory.map(chip)}</div>
                </>
            ) : null}

            {mounted && detail ? createPortal((
                <div className="equip-sheet-overlay" onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.72)", padding: "0 0 env(safe-area-inset-bottom)" }}>
                    <div className={`card equip-sheet rar-${detail.rarity}`} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <ItemArt id={detail.id} icon={detail.icon} className="equip-card-glyph" />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{detail.name}</div>
                                <div className="muted" style={{ fontSize: "0.8rem", textTransform: "capitalize" }}>{detail.rarity} · {detail.slot.replace("_", " ")}{detail.equipped ? " · Equipped ✓" : ""}</div>
                                {detail.element ? <div style={{ marginTop: 3 }}><span className="equip-el" style={{ color: detail.element.color }}>{detail.element.emoji} {detail.element.label}</span></div> : null}
                            </div>
                        </div>
                        <p style={{ margin: "12px 0 0", fontWeight: 700 }}>{detail.statsText || "No combat stats"}</p>
                        {detail.signature ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#ffd75e" }}>★ {detail.signature.label} — {detail.signature.desc}</p> : null}
                        {detail.flavor ? <p className="muted" style={{ margin: "6px 0 0", fontStyle: "italic" }}>“{detail.flavor}”</p> : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                            {canTrade && targetAlias && !detail.equipped ? (
                                <Link href={`/marketplace/trade/new?to=${encodeURIComponent(targetAlias)}&want=${encodeURIComponent(detail.id)}`} className="btn-gold">🤝 Propose a trade</Link>
                            ) : null}
                            <button type="button" className="pill" onClick={() => setDetail(null)}>Close</button>
                        </div>
                    </div>
                </div>
            ), document.body) : null}
        </>
    );
}
