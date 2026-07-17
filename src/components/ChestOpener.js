"use client";

import { useCallback, useEffect, useState } from "react";

import { itemIcon } from "@/lib/marketplace/items.js";
import ChestIcon from "@/components/ChestIcon";

const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "LEGENDARY", mythic: "MYTHIC" };

// Loot-chest opener with a suspense reveal. Fetches the member's chests, opens one on tap (server rolls
// the loot), holds a beat of anticipation, then bursts the reward in with a rarity glow.
export default function ChestOpener({ onLoot }) {
    const [chests, setChests] = useState(null);
    const [modalTier, setModalTier] = useState(null);
    const [phase, setPhase] = useState("idle"); // shaking | revealed
    const [reveal, setReveal] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/chests", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setChests(d?.chests || []);
    }, []);
    useEffect(() => { load(); }, [load]);

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
        }, 1400);
    }

    function closeModal() { if (busy) return; setModalTier(null); setReveal(null); setPhase("idle"); }

    if (!chests) return null;
    const total = chests.reduce((s, c) => s + c.count, 0);

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

            {modalTier ? (
                <div className="chest-modal" onClick={phase === "revealed" ? closeModal : undefined}>
                    <div className="chest-modal-inner" onClick={(e) => e.stopPropagation()}>
                        {phase === "shaking" ? (
                            <div className="chest-shake" style={{ "--chest": (chests.find((c) => c.tier === modalTier) || {}).color }}>
                                {(chests.find((c) => c.tier === modalTier) || {}).image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="chest-img-big" src={chests.find((c) => c.tier === modalTier).image} alt="" />
                                ) : (
                                    <ChestIcon className="chest-img-big" tier={modalTier} />
                                )}
                                <p className="chest-opening">Opening…</p>
                            </div>
                        ) : reveal?.item ? (
                            <Reward item={reveal.item} />
                        ) : (
                            <div className={`chest-reward rar-${reveal?.rarity || "common"}`}>
                                <span className="chest-reward-glyph">🪙</span>
                                <div className="chest-reward-name">+{reveal?.gold} gold</div>
                                <div className="chest-reward-sub muted">You already own that gear — take the dust.</div>
                            </div>
                        )}
                        {phase === "revealed" ? (
                            <div className="chest-modal-actions">
                                {(chests.find((c) => c.tier === modalTier)?.count || 0) > 0 ? <button type="button" className="button gold" onClick={() => open(modalTier)}>Open another</button> : null}
                                <button type="button" className="pill" onClick={closeModal}>Done</button>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function Reward({ item }) {
    const Icon = itemIcon(item.icon);
    return (
        <div className={`chest-reward is-item rar-${item.rarity}`}>
            <div className="chest-burst" />
            <span className="chest-rarity-tag">{RARITY_LABEL[item.rarity] || item.rarity}</span>
            <span className="chest-reward-glyph"><Icon aria-hidden="true" /></span>
            <div className="chest-reward-name">{item.name}</div>
            <div className="chest-reward-sub muted">{item.slot.replace("_", " ")} · Lv {item.reqLevel} to equip</div>
        </div>
    );
}
