"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import ConsumableArt from "@/components/ConsumableArt";
import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";
import { GiCutDiamond } from "react-icons/gi";
import ChestIcon from "@/components/ChestIcon";
// The Den's audio engine. It lives in the arena folder because that is where it was built, but it is one
// AudioContext, one master bus and one stored mute for the whole site — a second engine here would be the
// exact leak its header warns about. It also means the mute you set in the arena is honoured here.
import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio";

const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "LEGENDARY", mythic: "MYTHIC", ascendant: "ASCENDANT", eternal: "ETERNAL" };
const STAT_SHORT = { might: "Might", crit_chance: "Crit", crit_power: "Crit Dmg", ferocity: "Ferocity", fortune: "Fortune", extra_strike: "Extra Strike" };
const statLine = (stats = {}) => Object.entries(stats).map(([k, v]) => `+${v} ${STAT_SHORT[k] || k}`).join(" · ");
const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const PARTICLE_COUNT = { common: 16, rare: 22, epic: 28, legendary: 36, mythic: 46, ascendant: 58, eternal: 72 };
const BIG_RARITIES = new Set(["epic", "legendary", "mythic", "ascendant", "eternal"]);

function rarityOf(reveal) {
    if (reveal?.consumable) return reveal.consumable.kind === "relic" ? "eternal" : "legendary";
    if (reveal?.pet) return reveal.pet.rarity || "rare";
    if (reveal?.recipe) return "epic";
    // Tier 1-5 maps onto the rarity ladder so a Flawless gem gets a Flawless-sized celebration.
    if (reveal?.gem) return ["common", "rare", "epic", "legendary", "mythic"][Math.max(0, Math.min(4, (Number(reveal.gem.tier) || 1) - 1))];
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
        // ── THE SOUND OF IT ── this was silent from end to end: a second and a half of a chest visibly shaking
        // with nothing coming out of the speaker, then a full-screen LEGENDARY with no payoff at all. Opening a
        // chest is the most celebratory thing in the game and it was the quietest.
        //
        // The tap is the gesture that unlocks audio — browsers will not start a context without one — so the
        // whole reveal is audible off this single call.
        unlock();
        Sfx.chestRattle(1.4);
        Haptic.chestShake();
        const pending = fetch("/api/marketplace/chests", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier }),
        }).then((r) => r.json().catch(() => ({ error: "failed" })));
        // Hold the anticipation, then reveal.
        setTimeout(async () => {
            const d = await pending;
            if (d?.error) { setModalTier(null); setBusy(false); return; }
            setReveal(d); setChests(d.chests || []); setPhase("revealed"); setBusy(false);
            // Scaled by what actually came out, on the same rarity scale the particles and the colours use —
            // hearing "that was a big one" before you have read a word is the whole point.
            const r = rarityOf(d);
            Sfx.chestOpen(r);
            Haptic.chestOpen(r);
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
                    {/* Said "earned every time you level up", which was the OTHER half of the chest leak: the
                        Rewards Track promises a Gold Chest every tenth level and this line promised one every
                        level. Fixing the grant alone would have left this copy lying in the opposite
                        direction. Chests come from most of the game, so say that rather than name one source. */}
                    <p className="muted" style={{ marginTop: 0 }}>A Gold Chest every 10th level — plus whatever the boss, the delves, the sea and your dailies turn up. Tap to open.</p>
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

// A gem's painted sprite, falling back to the cut-diamond glyph exactly as the Jewelcutter's own GemArt does.
function GemReveal({ gem }) {
    const [broken, setBroken] = useState(false);
    if (!gem?.art || broken) return <GiCutDiamond className="chest-reward-glyph" aria-hidden="true" />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="chest-reward-glyph" src={gem.art} alt="" draggable="false" onError={() => setBroken(true)} />;
}

// The full-screen celebration: flash → light rays + particle burst → the reward slams in.
function RewardReveal({ reveal, onClose, onAgain }) {
    const rarity = rarityOf(reveal);
    const color = RARITY_COLOR[rarity] || RARITY_COLOR.common;
    const big = BIG_RARITIES.has(rarity);
    const isItem = Boolean(reveal?.item);
    const isConsumable = Boolean(reveal?.consumable);
    const isPet = Boolean(reveal?.pet);
    // A recipe is one of the things a chest can CONTAIN now, so it gets a reveal like everything else rather
    // than riding along as a side field on whatever the chest actually gave you.
    const isRecipe = Boolean(reveal?.recipe);
    // A GEM IS A THING A CHEST CAN CONTAIN, and nothing here knew that. openChest() has returned {gem} since
    // chests became the Jewelcutter's supply line, but this component branched on item/consumable/pet/recipe
    // and nothing else — so a gem fell through to the final `else`, which is the DUST branch. Four members
    // were handed a real gem and told "You already own that gear — take the dust!" over a "+undefined gold".
    // The gem was always granted; only the telling of it was broken.
    const isGem = Boolean(reveal?.gem);

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
                    <span className="chest-rarity-tag">{isRecipe ? "RECIPE" : isConsumable ? (reveal.consumable.kind === "relic" ? "RELIC" : "CONSUMABLE") : isPet ? "🐾 PET" : (RARITY_LABEL[rarity] || rarity)}</span>
                    {isRecipe ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/cooking/dish.png" alt="" className="chest-reward-glyph" draggable="false" />
                            <div className="chest-reward-name">{reveal.recipe.name}</div>
                            <div className="chest-reward-sub muted">A new recipe for the Kitchen&rsquo;s book.</div>
                        </>
                    ) : isPet ? (
                        <>
                            <PetArt id={reveal.pet.id} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.pet.name}</div>
                            <div className="chest-reward-sub muted">New pet companion!{reveal.pet.hint ? ` ${reveal.pet.hint}` : ""}</div>
                        </>
                    ) : isItem ? (
                        <>
                            <ItemArt id={reveal.item.id} icon={reveal.item.icon} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.item.name}</div>
                            {/* A chest can hand out a collection TROPHY as well as gear, and a trophy has no
                                slot and no combat stats — it pays for being owned. */}
                            <div className="chest-reward-sub muted">
                                {reveal.item.slot ? `${reveal.item.slot.replace("_", " ")} · ${statLine(reveal.item.stats)}` : "Collection piece"}
                            </div>
                            {reveal.item.signature ? <div className="chest-reward-sig">★ {reveal.item.signature.label} — {reveal.item.signature.desc}</div> : null}
                            {reveal.item.chargeReward ? <div className="chest-reward-sig" style={{ color: "#ffd75e" }}>🎁 Real-world reward: {reveal.item.chargeReward}</div> : null}
                        </>
                    ) : isGem ? (
                        <>
                            <GemReveal gem={reveal.gem} />
                            <div className="chest-reward-name">{reveal.gem.name}</div>
                            <div className="chest-reward-sub muted">{statLine(reveal.gem.stats)} &middot; socket it at the Jewelcutter</div>
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
