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
            <ItemArt id={i.id} icon={i.icon} className="equip-card-glyph" elements={i.elements} />
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
                                <div className="muted" style={{ fontSize: "0.8rem", textTransform: "capitalize" }}>{detail.rarity}{detail.slot ? ` · ${detail.slot.replace("_", " ")}` : ""}{detail.equipped ? " · Equipped ✓" : ""}</div>
                                {detail.element ? <div style={{ marginTop: 3 }}><span className="equip-el" style={{ color: detail.element.color }}>{detail.element.emoji} {detail.element.label}</span></div> : null}
                            </div>
                        </div>
                        <p style={{ margin: "12px 0 0", fontWeight: 700 }}>{detail.statsText || "No combat stats"}</p>
                        {detail.reqLevel ? <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.8rem" }}>Requires level {detail.reqLevel}</p> : null}
                        {detail.signature ? <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#ffd75e" }}>★ {detail.signature.label} — {detail.signature.desc}</p> : null}

                        {/* THE REAL-WORLD HALF. A charged piece is redeemable at the counter, which is the most
                            interesting thing an item can possibly say, and it was nowhere on this sheet. */}
                        {detail.perk ? (
                            <div className="ig-perk">
                                <span className="ig-perk-kick">Redeem in store</span>
                                <b>{detail.perk.label}</b>
                                <em>
                                    {detail.perk.charges ? `${detail.perk.charges} charge${detail.perk.charges === 1 ? "" : "s"}` : null}
                                    {detail.perk.charges && detail.perk.cooldownDays ? " · " : null}
                                    {detail.perk.cooldownDays ? `${detail.perk.cooldownDays}-day cooldown` : null}
                                </em>
                            </div>
                        ) : null}

                        {/* WHAT SET IS IT IN — and how far along they are, which is the question you were
                            actually asking when you tapped the piece. */}
                        {detail.set ? (
                            <div className="ig-set">
                                <div className="ig-set-top">
                                    <b>{detail.set.name}</b>
                                    <span className={detail.set.have >= detail.set.total ? "is-full" : ""}>
                                        {detail.set.have} of {detail.set.total}
                                    </span>
                                </div>
                                <div className="ig-set-pieces">
                                    {detail.set.pieces.map((pc) => (
                                        <span key={pc.id} className={`ig-piece${pc.has ? " has" : ""}${pc.id === detail.id ? " is-this" : ""}`}>
                                            {pc.name}
                                        </span>
                                    ))}
                                </div>
                                {detail.set.bonuses.map((b) => (
                                    <p key={b.need} className={`ig-bonus${detail.set.have >= b.need ? " is-on" : ""}`}>
                                        <b>{b.need} pieces</b> {b.text}
                                    </p>
                                ))}
                                {detail.set.capstone ? (
                                    <p className={`ig-bonus is-cap${detail.set.have >= detail.set.total ? " is-on" : ""}`}>{detail.set.capstone}</p>
                                ) : null}
                            </div>
                        ) : null}

                        {detail.flavor ? <p className="muted" style={{ margin: "8px 0 0", fontStyle: "italic" }}>“{detail.flavor}”</p> : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                            {canTrade && targetAlias && !detail.equipped ? (
                                <Link href={`/marketplace/trade/new?to=${encodeURIComponent(targetAlias)}&want=${encodeURIComponent(detail.id)}`} className="btn-gold">🤝 Propose a trade</Link>
                            ) : null}
                            <button type="button" className="pill" onClick={() => setDetail(null)}>Close</button>
                        </div>
                    </div>
                </div>
            ), document.body) : null}

            <style jsx global>{`
                .ig-perk { margin-top: 10px; padding: 9px 11px; border-radius: 11px; display: grid; gap: 1px;
                    background: rgba(255,215,94,0.09); border: 1px solid rgba(255,215,94,0.4); }
                .ig-perk-kick { font-size: 9px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; color: #ffd75e; }
                .ig-perk b { font-size: 0.95rem; color: #fff; }
                .ig-perk em { font-style: normal; font-size: 0.72rem; color: #a9b0b8; }

                .ig-set { margin-top: 10px; padding: 9px 11px; border-radius: 11px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); }
                .ig-set-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
                .ig-set-top b { font-size: 0.95rem; color: #fff; }
                .ig-set-top span { font-size: 0.78rem; color: #a9b0b8; font-weight: 800; }
                .ig-set-top span.is-full { color: #8bf0b4; }
                .ig-set-pieces { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
                .ig-piece { font-size: 0.66rem; padding: 2px 7px; border-radius: 999px; color: #7f8790;
                    border: 1px solid rgba(255,255,255,0.12); text-decoration: line-through; }
                .ig-piece.has { color: #e7dcc4; border-color: rgba(255,255,255,0.3); text-decoration: none; }
                .ig-piece.is-this { color: #241500; background: linear-gradient(180deg, #ffe08a, #ffb020);
                    border-color: transparent; font-weight: 800; }
                .ig-bonus { margin: 6px 0 0; font-size: 0.75rem; color: #7f8790; }
                .ig-bonus b { color: #9aa2ab; }
                .ig-bonus.is-on { color: #8bf0b4; }
                .ig-bonus.is-on b { color: #8bf0b4; }
                .ig-bonus.is-cap { font-style: italic; }

                .pg-sets { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; }
                .pg-sets-head { font-size: 9.5px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: #7f8790; }
                .pg-set { font-size: 0.72rem; padding: 3px 9px; border-radius: 999px; color: #cbd3dc;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); }
                .pg-set b { color: #fff; }
                .pg-set.is-full { color: #8bf0b4; border-color: rgba(139,240,180,0.5); background: rgba(139,240,180,0.1); }
                .pg-set.is-full b { color: #8bf0b4; }
            `}</style>
        </>
    );
}
