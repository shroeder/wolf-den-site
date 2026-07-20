"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import ConsumableArt from "@/components/ConsumableArt";
import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";
import ChestIcon from "@/components/ChestIcon";

const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "LEGENDARY", mythic: "MYTHIC", ascendant: "ASCENDANT", eternal: "ETERNAL" };
const STAT_SHORT = { might: "Might", crit_chance: "Crit", crit_power: "Crit Dmg", ferocity: "Ferocity", fortune: "Fortune", extra_strike: "Extra Strike" };
const statLine = (stats = {}) => Object.entries(stats).map(([k, v]) => `+${v} ${STAT_SHORT[k] || k}`).join(" · ");
const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const PARTICLE_COUNT = { common: 16, rare: 22, epic: 28, legendary: 36, mythic: 46, ascendant: 58, eternal: 72 };
const BIG_RARITIES = new Set(["epic", "legendary", "mythic", "ascendant", "eternal"]);

function rarityOf(reveal) {
    if (reveal?.consumable) return reveal.consumable.kind === "relic" ? "eternal" : "legendary";
    if (reveal?.pet) return reveal.pet.rarity || "rare";
    return reveal?.item?.rarity || reveal?.rarity || "common";
}

// Loot-chest opener with a suspense reveal. Fetches the member's chests, opens one on tap (server rolls
// the loot), holds a beat of anticipation, then bursts the reward in with a full-screen celebration.
export default function ChestOpener({ onLoot }) {
    const [chests, setChests] = useState(null);
    const [modalTier, setModalTier] = useState(null);
    const [phase, setPhase] = useState("idle"); // shaking | revealed
    const [reveal, setReveal] = useState(null);
    const [busy, setBusy] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/chests", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setChests(d?.chests || []);
    }, []);
    useEffect(() => { load(); }, [load]);

    // Lock body scroll while the celebration is up.
    useEffect(() => {
        if (!modalTier) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [modalTier]);

    function open(tier) {
        if (busy) return;
        setBusy(true); setModalTier(tier); setPhase("shaking"); setReveal(null);
        const pending = fetch("/api/marketplace/chests", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier }),
        }).then((r) => r.json().catch(() => ({ error: "failed" })));
        // Hold the anticipation, then reveal.
        setTimeout(async () => {
            const d = await pending;
            if (d?.error) { setModalTier(null); setBusy(false); return; }
            setReveal(d); setChests(d.chests || []); setPhase("revealed"); setBusy(false);
            onLoot?.();
        }, 1500);
    }

    function closeModal() { if (busy) return; setModalTier(null); setReveal(null); setPhase("idle"); }

    if (!chests) return null;
    const total = chests.reduce((s, c) => s + c.count, 0);
    const activeChest = chests.find((c) => c.tier === modalTier) || null;
    const remaining = activeChest?.count || 0;

    const modal = modalTier ? (
        <div className="chest-modal" onClick={phase === "revealed" ? closeModal : undefined}>
            {phase === "shaking" ? (
                <div className="chest-stage">
                    <div className="chest-glowpad" style={{ "--chest": activeChest?.color }} />
                    <div className="chest-shake">
                        {activeChest?.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="chest-img-big" src={activeChest.image} alt="" />
                        ) : (
                            <ChestIcon className="chest-img-big" tier={modalTier} />
                        )}
                    </div>
                    <p className="chest-opening">Opening…</p>
                </div>
            ) : (
                <RewardReveal reveal={reveal} onClose={closeModal} onAgain={remaining > 0 ? () => open(modalTier) : null} />
            )}
        </div>
    ) : null;

    return (
        <section className="card chest-card">
            <h2 style={{ marginTop: 0 }}>🎁 Loot chests {total ? <span className="chest-total">{total}</span> : null}</h2>
            {total ? (
                <>
                    <p className="muted" style={{ marginTop: 0 }}>Earned every time you level up. Tap to open — you never know what&apos;s inside.</p>
                    <div className="chest-grid">
                        {chests.map((c) => (
                            <button type="button" key={c.tier} className="chest-tile" style={{ "--chest": c.color }} onClick={() => open(c.tier)} disabled={busy}>
                                {c.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="chest-img" src={c.image} alt="" />
                                ) : (
                                    <ChestIcon className="chest-img" tier={c.tier} />
                                )}
                                <span className="chest-name">{c.label}</span>
                                <span className="chest-count">×{c.count}</span>
                            </button>
                        ))}
                    </div>
                </>
            ) : <p className="muted" style={{ margin: 0 }}>No chests right now — level up to earn one.</p>}

            {mounted && modal ? createPortal(modal, document.body) : null}
        </section>
    );
}

// The full-screen celebration: flash → light rays + particle burst → the reward slams in.
function RewardReveal({ reveal, onClose, onAgain }) {
    const rarity = rarityOf(reveal);
    const color = RARITY_COLOR[rarity] || RARITY_COLOR.common;
    const big = BIG_RARITIES.has(rarity);
    const isItem = Boolean(reveal?.item);
    const isConsumable = Boolean(reveal?.consumable);
    const isPet = Boolean(reveal?.pet);

    const particles = useMemo(() => {
        const n = PARTICLE_COUNT[rarity] || 16;
        const cols = [color, "#ffd75e", "#ffffff"];
        return Array.from({ length: n }, (_, i) => {
            const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.6;
            const dist = 110 + Math.random() * 150;
            return {
                tx: `${Math.cos(ang) * dist}px`,
                ty: `${Math.sin(ang) * dist - 15}px`,
                rot: `${Math.random() * 720 - 360}deg`,
                delay: `${Math.random() * 0.12}s`,
                c: cols[i % cols.length],
                sz: `${6 + Math.random() * 9}px`,
                round: i % 2 === 0,
            };
        });
    }, [rarity, color]);

    return (
        <div className="chest-stage" onClick={(e) => e.stopPropagation()}>
            <div className="chest-flash" style={{ "--rar": color }} />
            <div className={`chest-reward-wrap${big ? " slam" : ""}`}>
                <div className="chest-rays" style={{ "--rar": color }} />
                <div className="chest-particles" aria-hidden="true">
                    {particles.map((p, i) => (
                        <span
                            key={i}
                            className={`chest-particle${p.round ? " round" : ""}`}
                            style={{ "--tx": p.tx, "--ty": p.ty, "--rot": p.rot, "--pc": p.c, "--sz": p.sz, animationDelay: p.delay }}
                        />
                    ))}
                </div>
                <div className={`chest-reward rar-${rarity}`} style={{ "--rar": color }}>
                    <span className="chest-rarity-tag">{isConsumable ? (reveal.consumable.kind === "relic" ? "RELIC" : "CONSUMABLE") : isPet ? "🐾 PET" : (RARITY_LABEL[rarity] || rarity)}</span>
                    {isPet ? (
                        <>
                            <PetArt id={reveal.pet.id} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.pet.name}</div>
                            <div className="chest-reward-sub muted">New pet companion!{reveal.pet.hint ? ` ${reveal.pet.hint}` : ""}</div>
                        </>
                    ) : isItem ? (
                        <>
                            <ItemArt id={reveal.item.id} icon={reveal.item.icon} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.item.name}</div>
                            <div className="chest-reward-sub muted">{reveal.item.slot.replace("_", " ")} · {statLine(reveal.item.stats)}</div>
                            {reveal.item.signature ? <div className="chest-reward-sig">★ {reveal.item.signature.label} — {reveal.item.signature.desc}</div> : null}
                            {reveal.item.chargeReward ? <div className="chest-reward-sig" style={{ color: "#ffd75e" }}>🎁 Real-world reward: {reveal.item.chargeReward}</div> : null}
                        </>
                    ) : isConsumable ? (
                        <>
                            <ConsumableArt id={reveal.consumable.id} emoji={reveal.consumable.emoji} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.consumable.name}</div>
                            <div className="chest-reward-sub muted">{reveal.consumable.desc}</div>
                        </>
                    ) : (
                        <>
                            <span className="chest-reward-glyph">💰</span>
                            <div className="chest-reward-name">+{reveal?.gold} gold</div>
                            <div className="chest-reward-sub muted">You already own that gear — take the dust!</div>
                        </>
                    )}
                </div>
                {reveal?.badgeDrop ? (
                    <div className="chest-badge-drop" role="status">
                        <span className="chest-badge-drop-icon" aria-hidden="true">{reveal.badgeDrop.icon || "🏅"}</span>
                        <span className="chest-badge-drop-text">
                            <strong>Rare badge drop!</strong>
                            <span>{reveal.badgeDrop.label}</span>
                        </span>
                    </div>
                ) : null}
            </div>
            <div className="chest-modal-actions">
                {onAgain ? <button type="button" className="button gold" onClick={onAgain}>Open another</button> : null}
                <button type="button" className="pill" onClick={onClose}>Done</button>
            </div>
        </div>
    );
}
