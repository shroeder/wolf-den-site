"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import CoinCta from "@/components/CoinCta";
import ConsumableArt from "@/components/ConsumableArt";
import ItemArt from "@/components/ItemArt";
import useScrollLock from "@/lib/useScrollLock";
import Coin from "@/components/Coin";

const KIND_LABEL = { potion: "Potion", scroll: "Scroll", stone: "Magic Stone", relic: "Relic", farm: "Farm Supply", sail: "Voyage Gear", treat: "Pet Treat", dish: "Dish" };

// Consumables: buy one-shot boosts with gold and use them yourself (no admin needed). Potions/stones buff
// the boss fight, scrolls give XP, and two ultra-rare relics recharge / reset the cooldown on charged gear.
export default function ConsumablesClient() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState("");
    const [msg, setMsg] = useState(null);
    const [picking, setPicking] = useState(null); // a stash item awaiting a charged-gear target
    // Only the target-picker locks scroll now — the level-up modal moved out to the global <PetLevelUp>,
    // and this still referenced its deleted state, which threw a ReferenceError on every render.
    useScrollLock(Boolean(picking));
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
                    dispatchPetLevelUp(data.petLevelUp);
                    setMsg(null);
                } else if (body.action === "use") {
                    setMsg({ ok: true, text: `${data.emoji || "✨"} ${data.applied}` });
                }
                if (data.stash) setState(data.stash);
            } else {
                const errs = {
                    not_enough_gold: "Not enough gold.", none_owned: "You don't have any of those.",
                    // Refused rather than swallowed — see the cap guard in consumables.js. It names the
                    // number so the answer is "come back tomorrow", not "that did nothing".
                    strikes_capped: "You're already carrying the most bonus strikes a day can hold (8). Save it for tomorrow.",
                    already_full: "That item's charges are already full.", not_on_cooldown: "That item isn't on cooldown.",
                    bad_target: "Pick a charged item.", target_not_owned: "You don't own that item.",
                    no_pet_equipped: "Equip a pet first — treats feed your active pet.",
                    no_growing_crop: "No crop is growing right now — plant something first.",
                    not_sailing: "You're not on a voyage right now.",
                    no_raid_used: "You haven't used a daily raid to restore.",
                };
                setMsg({ ok: false, text: errs[data.error] || "Couldn't do that right now." });
            }
        } catch {
            setMsg({ ok: false, text: "Couldn't do that right now." });
        } finally {
            setBusy("");
        }
    }

    // NOT a hook — it drinks the potion. Named useX it tripped react-hooks/rules-of-hooks, which treats any
    // useX as a hook, and it misleads a reader for the same reason.
    function consumeItem(item) {
        if (busy) return;
        // FORGE SCROLLS ARE SPENT AT THE FORGE, not from the stash. They carry `target: "forge"`, which fell
        // into the charged-gear picker below — and that picker filters for recharge/cooldown targets, so a
        // forge target matched nothing and the scroll opened an EMPTY dialog. The server has always answered
        // "use_at_forge"; there was simply no route to the forge. Send them there, on the Attune tab, which is
        // the interface this scroll wants: every piece you own, pick one, pick an element.
        if (item.target === "forge") { window.location.href = "/marketplace/blacksmith?tab=attune"; return; }
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
            {/* HOW THEY COMBINE. A member asked whether hoarding these wastes them — she had four damage
                potions and no way to tell whether a second one doubled her damage again or just overwrote the
                first. This paragraph has been wrong twice since: it promised that two x2 bottles made x4,
                which the engine never did (memberDamageMult takes the STRONGEST, not the product), and then
                it stayed wrong after the strongest-wins rule shipped. Both times a member found it before we
                did, and the second time it cost Nicholas twenty-five bottles to "use all" for the effect of
                one. Damage boosts of the SAME strength now extend each other's clock, a stronger one still
                wins outright, and strikes still ADD (a SUM over the boost rows, capped at MAX_POTION_STRIKES). */}
            <p className="muted" style={{ marginTop: 6, fontSize: "0.82rem" }}>
                <strong>How they stack.</strong> Two damage boosts of the <strong>same strength</strong> add
                their time together — a second 12-hour ×2 gives you twenty-four hours of ×2, not ×4. A
                <strong> stronger</strong> one takes over while it lasts, so a ×3 beats a ×2 and the ×2 waits
                its turn. Extra strikes <strong>add up</strong>. Nothing is wasted by using them early.
            </p>

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
                                {/* WHAT A SECOND ONE DOES, ON THE THING ITSELF. This lived only in a paragraph
                                    at the top of the shelf, which was wrong for months while every card stayed
                                    silent — and that is what cost a member twenty-five bottles to a "use all"
                                    on an effect that could not stack. Shown only when you hold more than one,
                                    because that is the only moment the question exists. */}
                                {i.count > 1 && i.stackNote ? (
                                    <span className="cons-stack muted">{i.stackNote}</span>
                                ) : null}
                                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "center", flexWrap: "wrap" }}>
                                    <button type="button" className="btn btn-small" disabled={busy === `use:${i.id}`} onClick={() => consumeItem(i)}>
                                        {busy === `use:${i.id}` ? "Using…" : "Use"}
                                    </button>
                                    {/* PET FOOD IN A STACK GETS ONE TAP FOR THE LOT. A cook can hold dozens of
                                        plates worth ten XP each, and feeding them one button-press at a time is
                                        the thing that would put people off cooking. Goes to the equipped pet
                                        (the stash has no pet picker), stops the moment it is full, and spends
                                        the cheapest food first — the good treats stay in the bag. */}
                                    {i.count > 1 && i.feedable ? (
                                        <button type="button" className="con-use-all" disabled={busy === `all:${i.id}`}
                                            title={`Feed all ${i.count} to your equipped pet — stops when it is full`}
                                            onClick={() => post({ id: i.id, action: "use_all" }, `all:${i.id}`)}>
                                            {busy === `all:${i.id}` ? "Feeding…" : `Use all ${i.count}`}
                                        </button>
                                    ) : null}
                                    {/* AND THE SAME FOR ORDINARY CONSUMABLES. Pet food had a one-tap stack and
                                        nothing else did, so eleven vials was eleven taps and eleven requests.
                                        `bulk` comes from the server's own allow-list (canBulkUse) — the ones
                                        that need a target or that a stack would WASTE never offer this. */}
                                    {i.count > 1 && !i.feedable && i.bulk ? (
                                        <button type="button" className="con-use-all" disabled={busy === `all:${i.id}`}
                                            title={`Use all ${i.count} in one go`}
                                            onClick={() => post({ id: i.id, action: "use_stack" }, `all:${i.id}`)}>
                                            {busy === `all:${i.id}` ? "Using…" : `Use all ${i.count}`}
                                        </button>
                                    ) : null}
                                </div>
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

            <h3 style={{ margin: "6px 0" }}><Coin /> Shop</h3>
            {state.coupon ? (
                <div className="shop-coupon">🏷️ {state.coupon.pct}% off the in-game <Coin /> gold shop — auto-applies to your next gold buy ≤ <Coin /> {state.coupon.max.toLocaleString()} (one use). Not a real-store discount.</div>
            ) : null}
            <div className="badge-board">
                {(state.shop || []).map((i) => (
                    <div key={i.id} className="badge-tile">
                        <ConsumableArt id={i.id} emoji={i.emoji} className="badge-tile-icon" />
                        <span className="badge-tile-label">{i.name}</span>
                        <span className="badge-tile-desc muted">{KIND_LABEL[i.kind] || ""} · {i.desc}</span>
                        {i.canAfford ? (
                            <button type="button" className="btn btn-small" disabled={busy === `buy:${i.id}`} onClick={() => post({ id: i.id, action: "buy" }, `buy:${i.id}`)} style={{ marginTop: 6 }}>
                                {busy === `buy:${i.id}` ? "Buying…" : (
                                    <>Buy · <Coin /> {i.discounted ? <><span style={{ textDecoration: "line-through", opacity: 0.6, fontWeight: 700 }}>{i.price.toLocaleString()}</span> {i.effectivePrice.toLocaleString()}</> : i.price.toLocaleString()}</>
                                )}
                            </button>
                        ) : (
                            // Unaffordable → a real CTA to buy coins, not a muted disabled-looking label.
                            <span style={{ marginTop: 6, display: "inline-block" }}><CoinCta price={i.effectivePrice ?? i.price} /></span>
                        )}
                    </div>
                ))}
            </div>
            <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 0 }}>⚗️ Rare relics can&apos;t be bought — they only drop from the rarest chests.</p>
            </>)}
        </section>
    );
}

// Hand a pet level-up to the ONE global celebration modal (<PetLevelUp>, mounted in the layout) rather than
// rendering a second card here. Feeding a treat used to pop a local celebration AND trip the global watcher,
// so a single level-up produced two modals back to back.
export function dispatchPetLevelUp(info) {
    if (!info?.petId) return;
    try { window.dispatchEvent(new CustomEvent("wolfden-pet-levelup", { detail: info })); } catch { /* SSR */ }
}
