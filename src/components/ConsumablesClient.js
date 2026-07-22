"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import CoinCta from "@/components/CoinCta";
import ConsumableArt from "@/components/ConsumableArt";
import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";

const KIND_LABEL = { potion: "Potion", scroll: "Scroll", stone: "Magic Stone", relic: "Relic" };

// Consumables: buy one-shot boosts with gold and use them yourself (no admin needed). Potions/stones buff
// the boss fight, scrolls give XP, and two ultra-rare relics recharge / reset the cooldown on charged gear.
export default function ConsumablesClient() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState("");
    const [msg, setMsg] = useState(null);
    const [picking, setPicking] = useState(null); // a stash item awaiting a charged-gear target
    const [petCele, setPetCele] = useState(null); // { petId, petName, level, rarity, maxed } — level-up dopamine
    const [open, setOpen] = useState(false); // collapsed by default so it doesn't push the page down
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/marketplace/consumables", { cache: "no-store" });
            if (res.ok) setState(await res.json());
        } catch {
            /* keep prior state */
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    async function post(body, key) {
        setBusy(key);
        setMsg(null);
        try {
            const res = await fetch("/api/marketplace/consumables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                if (data.petLevelUp) {
                    // Big celebration instead of a tiny text line.
                    setPetCele(data.petLevelUp);
                    setMsg(null);
                } else if (body.action === "use") {
                    setMsg({ ok: true, text: `${data.emoji || "✨"} ${data.applied}` });
                }
                if (data.stash) setState(data.stash);
            } else {
                const errs = {
                    not_enough_gold: "Not enough gold.", none_owned: "You don't have any of those.",
                    already_full: "That item's charges are already full.", not_on_cooldown: "That item isn't on cooldown.",
                    bad_target: "Pick a charged item.", target_not_owned: "You don't own that item.",
                    no_pet_equipped: "Equip a pet first — treats feed your active pet.",
                };
                setMsg({ ok: false, text: errs[data.error] || "Couldn't do that right now." });
            }
        } catch {
            setMsg({ ok: false, text: "Couldn't do that right now." });
        } finally {
            setBusy("");
        }
    }

    function useItem(item) {
        if (busy) return;
        if (item.target) { setPicking(item); return; } // needs a charged-gear target
        post({ id: item.id, action: "use" }, `use:${item.id}`);
    }

    async function applyToTarget(targetId) {
        const item = picking;
        setPicking(null);
        await post({ id: item.id, action: "use", targetItemId: targetId }, `use:${item.id}`);
    }

    if (!state) return null;
    const stash = state.stash || [];
    const active = state.active || [];
    // Eligible charged targets for the relic being used (recharge = not-full; cooldown = on cooldown).
    const targets = (state.chargedItems || []).filter((c) => (picking?.target === "recharge" ? !c.full : picking?.target === "cooldown" ? c.onCooldown : false));

    return (
        <section className="card">
            <button type="button" className="collapse-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <span>🧪 Consumables{stash.length ? <span className="collapse-count">{stash.length} in stash</span> : null}</span>
                <span className="collapse-chevron">{open ? "▾" : "▸"}</span>
            </button>
            {!open ? null : (<>
            <p className="muted" style={{ marginTop: 8 }}>One-shot boosts you use yourself. Potions &amp; stones buff the boss fight; scrolls give XP; relics restore charged gear.</p>

            {active.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {active.map((b, i) => (
                        <span key={i} style={{ fontWeight: 800, fontSize: "0.85rem", color: "#37e0a1", background: "rgba(55,224,161,0.12)", border: "1px solid rgba(55,224,161,0.4)", borderRadius: 999, padding: "4px 12px" }}>⏳ {b.label} active</span>
                    ))}
                </div>
            ) : null}

            {msg ? <p style={{ marginTop: 0, color: msg.ok ? "var(--accent, #37e0a1)" : "#e0776a", fontWeight: 700 }}>{msg.text}</p> : null}

            {stash.length ? (
                <>
                    <h3 style={{ margin: "6px 0" }}>Your stash</h3>
                    <div className="badge-board" style={{ marginBottom: 14 }}>
                        {stash.map((i) => (
                            <div key={i.id} className={`badge-tile is-earned${i.kind === "relic" ? " rar-eternal" : ""}`}>
                                <ConsumableArt id={i.id} emoji={i.emoji} className="badge-tile-icon" />
                                <span className="badge-tile-label">{i.name} ×{i.count}</span>
                                <span className="badge-tile-desc muted">{i.desc}</span>
                                <button type="button" className="btn btn-small" disabled={busy === `use:${i.id}`} onClick={() => useItem(i)} style={{ marginTop: 6 }}>
                                    {busy === `use:${i.id}` ? "Using…" : "Use"}
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            ) : null}

            {picking ? (
                <div style={{ border: "1px solid rgba(255,215,94,0.4)", borderRadius: 12, padding: 12, marginBottom: 14, background: "rgba(255,215,94,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <strong>{picking.emoji} {picking.name} — pick a charged item</strong>
                        <button type="button" className="pill" onClick={() => setPicking(null)}>Cancel</button>
                    </div>
                    {targets.length ? (
                        <div className="badge-board">
                            {targets.map((t) => {
                                return (
                                    <div key={t.id} className={`badge-tile rar-${t.rarity}`}>
                                        <ItemArt id={t.id} icon={t.icon} className="badge-tile-icon" />
                                        <span className="badge-tile-label">{t.name}</span>
                                        <span className="badge-tile-desc muted">{t.chargesLeft}/{t.maxCharges} charges{t.onCooldown ? " · on cooldown" : ""}</span>
                                        <button type="button" className="btn btn-small" disabled={!!busy} onClick={() => applyToTarget(t.id)} style={{ marginTop: 6 }}>Use on this</button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="muted" style={{ margin: 0 }}>{picking.target === "recharge" ? "No charged items need recharging right now." : "None of your charged items are on cooldown right now."}</p>
                    )}
                </div>
            ) : null}

            <h3 style={{ margin: "6px 0" }}>🪙 Shop</h3>
            {state.coupon ? (
                <div className="shop-coupon">🏷️ {state.coupon.pct}% off coupon active — auto-applies to your next buy ≤ 🪙 {state.coupon.max.toLocaleString()} (one use)</div>
            ) : null}
            <div className="badge-board">
                {(state.shop || []).map((i) => (
                    <div key={i.id} className="badge-tile">
                        <ConsumableArt id={i.id} emoji={i.emoji} className="badge-tile-icon" />
                        <span className="badge-tile-label">{i.name}</span>
                        <span className="badge-tile-desc muted">{KIND_LABEL[i.kind] || ""} · {i.desc}</span>
                        {i.canAfford ? (
                            <button type="button" className="btn btn-small" disabled={busy === `buy:${i.id}`} onClick={() => post({ id: i.id, action: "buy" }, `buy:${i.id}`)} style={{ marginTop: 6 }}>
                                {busy === `buy:${i.id}` ? "Buying…" : `Buy · 🪙 ${i.price.toLocaleString()}`}
                            </button>
                        ) : (
                            // Unaffordable → a real CTA to buy coins, not a muted disabled-looking label.
                            <span style={{ marginTop: 6, display: "inline-block" }}><CoinCta price={i.price} /></span>
                        )}
                    </div>
                ))}
            </div>
            <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 0 }}>⚗️ Relics (Elixir of Renewal, Sands of Time) can&apos;t be bought — they only drop from the rarest chests.</p>
            </>)}
            {mounted && petCele ? createPortal((
                <div className="petfeed-cele" onClick={() => setPetCele(null)}>
                    <div className="petfeed-flash" />
                    <div className={`petfeed-card rar-${petCele.rarity}`} onClick={(e) => e.stopPropagation()}>
                        <div className="petfeed-burst" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>
                        <span className="petfeed-art"><PetArt id={petCele.petId} /></span>
                        <div className="petfeed-tag">⬆️ Level up!</div>
                        <div className="petfeed-title">{petCele.petName} reached Lv {petCele.level}</div>
                        <div className="petfeed-stars">{"★".repeat(petCele.level)}<span style={{ opacity: 0.3 }}>{"★".repeat(Math.max(0, 5 - petCele.level))}</span></div>
                        {petCele.maxed ? <div className="petfeed-max">MAX LEVEL! 🏆</div> : null}
                        <button type="button" className="button gold" onClick={() => setPetCele(null)}>Awesome!</button>
                    </div>
                </div>
            ), document.body) : null}
        </section>
    );
}
