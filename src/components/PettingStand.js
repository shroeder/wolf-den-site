"use client";

import { useState } from "react";
import { GiPawPrint } from "react-icons/gi";

// ── THE PETTING STAND PANEL ──────────────────────────────────────────────────────────────────────────────────
// Opens when the placed stand is tapped, on your own farm and on anybody else's.
//
// A PANEL RATHER THAN PETS DRAWN ON THE SPRITE. The obvious build is to position three pets on the three tiers
// of the artwork — and it falls apart the moment somebody uses the tools every decoration already has: the
// stand can be scaled 0.4x to 2.5x, rotated a full circle and mirrored, so any fixed offsets onto the cushions
// would be right on exactly one farm. The panel is also what makes the owner counts legible, which is half the
// point of the thing.
//
// The same component serves the owner and a visitor. A visitor sees who is on display and how rare each one is
// — that is the advertisement the stand exists to be — and the owner additionally gets the seat controls.
export default function PettingStand({ stand, mine, pets = [], busy, onSeat, onClear, onClose }) {
    const [picking, setPicking] = useState(null); // the slot index being filled, or null

    const slots = stand?.slots || [];
    const seated = new Set(slots.map((s) => s.pet?.id).filter(Boolean));
    // Sprites come off the farm's own pet list rather than a guessed path: `pets` is the FARM OWNER's pets on
    // any farm (yours or one you are visiting), already resolved to the right level and enshrined form by
    // pickPetSpriteForLevel. Reconstructing a URL here would render a level-1 base for a level-six pet.
    const spriteOf = (petId) => pets.find((p) => p.id === petId)?.spriteUrl || null;
    // Only pets not already on a tier can be seated — the server enforces this too (one animal, one tier), but
    // offering a choice that will be refused is worse than not offering it.
    const available = pets.filter((p) => !seated.has(p.id));

    const seat = (petId) => { onSeat?.(picking, petId); setPicking(null); };

    return (
        <div className="ps-wrap" onClick={onClose} role="presentation">
            <div className="ps-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="The Petting Stand">
                <div className="ps-head">
                    <b><GiPawPrint aria-hidden="true" /> The Petting Stand</b>
                    <button type="button" className="ps-x" onClick={onClose} aria-label="Close">×</button>
                </div>
                <p className="ps-sub">
                    {mine
                        ? "Three companions on display. They earn passively while they stand here, and anyone who pets them — you included — gives them double."
                        : "On display. Petting one of these gives it double the usual — and they are the ones this wolf wants fussed over."}
                </p>

                <div className="ps-scroll">
                {picking != null ? (
                    <div className="ps-pick">
                        <div className="ps-pick-head">
                            <b>Choose a companion</b>
                            <button type="button" className="ps-ghost" onClick={() => setPicking(null)}>Cancel</button>
                        </div>
                        {available.length ? (
                            <div className="ps-pick-grid">
                                {available.map((p) => (
                                    <button type="button" key={p.id} className="ps-pick-one" disabled={busy} onClick={() => seat(p.id)}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={p.spriteUrl || ""} className="ps-pick-art" alt="" draggable="false" />
                                        <em>{p.name}</em>
                                        <i>Lv {p.level}</i>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="ps-empty">Every companion you own is already on the stand.</p>
                        )}
                    </div>
                ) : (
                    <div className="ps-tiers">
                        {slots.map((s) => (
                            <div key={s.slot} className={`ps-tier${s.pet ? " is-full" : ""}`}>
                                {s.pet ? (
                                    <>
                                        <span className="ps-tier-art">{/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={spriteOf(s.pet.id) || ""} className="ps-art" alt="" draggable="false" /></span>
                                        <span className="ps-tier-body">
                                            <b style={{ color: RAR[s.pet.rarity] || "#e8dcc2" }}>{s.pet.name}</b>
                                            <em>Lv {s.pet.level}</em>
                                            {/* The rarity fact the Den has never been able to state. "1 member"
                                                is the interesting case and it is worded as such rather than as
                                                a bare number nobody can scale. */}
                                            <i className="ps-owners">
                                                {s.pet.owners <= 1
                                                    ? "the only one in the Den"
                                                    : `${s.pet.owners} members have this one`}
                                            </i>
                                        </span>
                                        {mine ? (
                                            <button type="button" className="ps-ghost ps-take" disabled={busy} onClick={() => onClear?.(s.slot)}>Take down</button>
                                        ) : null}
                                    </>
                                ) : (
                                    <button type="button" className="ps-add" disabled={!mine || busy} onClick={() => mine && setPicking(s.slot)}>
                                        {mine ? "+ Put a companion here" : "An empty tier"}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                </div>

                <div className="ps-foot">
                    <span className="ps-mult">×{stand?.petMult || 2} petting XP</span>
                    <span className="muted">and passive XP as if equipped</span>
                </div>

                <style jsx>{`
                    /* ps- prefixed throughout, keyframes included — two @keyframes sharing a name across
                       styled-jsx blocks silently break both. */
                    .ps-wrap { position: fixed; inset: 0; z-index: 10060; background: rgba(0,0,0,0.62);
                        display: grid; place-items: center; padding: 16px; }
                    .ps-card { width: 100%; max-width: 420px; max-height: min(88dvh, 720px); padding: 16px;
                        border-radius: 18px;
                        /* NEUTRAL, NOT PURPLE. The first ground was a saturated aubergine and every pet sprite
                           on it looked tinted — the panel was competing with the artwork it exists to show. */
                        background: linear-gradient(180deg, #1b1d24, #121317);
                        border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 24px 60px rgba(0,0,0,0.65);
                        animation: psUp .24s cubic-bezier(.2,1,.3,1) both;
                        /* ── THE SCROLL FIX ────────────────────────────────────────────────────────────
                           overflow-y on the CARD scrolled the header and the action out of reach on a short
                           phone, and on iOS a scrollable element inside a fixed overlay drags the page behind
                           it. The card is a column now: the head and the footer are fixed, and only the middle
                           scrolls, with momentum and overscroll containment so the pull stops here. */
                        display: flex; flex-direction: column; overflow: hidden; }
                    .ps-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto;
                        -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
                    @keyframes psUp { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
                    .ps-head { display: flex; align-items: center; gap: 8px; }
                    .ps-head b { font-size: 1.02rem; }
                    .ps-x { margin-left: auto; background: none; border: none; color: inherit; font-size: 20px;
                        cursor: pointer; opacity: .7; }
                    .ps-sub { margin: 6px 0 12px; font-size: .8rem; color: #cbbcda; line-height: 1.45; }
                    .ps-tiers { display: grid; gap: 9px; }
                    .ps-tier { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 13px;
                        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10); min-height: 62px; }
                    .ps-tier.is-full { background: rgba(255,215,110,0.07); border-color: rgba(255,215,110,0.28); }
                    .ps-tier-art { flex: 0 0 auto; width: 46px; height: 46px; display: grid; place-items: center; }
                    .ps-art { width: 46px; height: 46px; object-fit: contain; }
                    .ps-tier-body { display: grid; gap: 1px; min-width: 0; }
                    .ps-tier-body b { font-size: .9rem; }
                    .ps-tier-body em { font-size: .72rem; color: #b9a8c9; font-style: normal; }
                    .ps-owners { font-size: .72rem; color: #ffd75e; font-style: normal; }
                    .ps-head svg { vertical-align: -2px; margin-right: 2px; }
                    .ps-take { margin-left: auto; }
                    .ps-add { width: 100%; padding: 12px; border-radius: 12px; cursor: pointer;
                        background: rgba(255,255,255,0.05); border: 1px dashed rgba(255,255,255,0.28);
                        color: #cdd3d8; font-weight: 800; font-size: .84rem; transition: background .12s ease; }
                    .ps-add:hover:not(:disabled) { background: rgba(255,255,255,0.09); }
                    .ps-add:disabled { opacity: .55; cursor: default; }
                    .ps-ghost { padding: 6px 11px; border-radius: 9px; cursor: pointer; font-weight: 800; font-size: .76rem;
                        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #e8dcc2; }
                    .ps-pick-head { display: flex; align-items: center; margin-bottom: 8px; }
                    .ps-pick-head b { font-size: .9rem; }
                    .ps-pick-head .ps-ghost { margin-left: auto; }
                    .ps-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px;
                        max-height: 46dvh; overflow-y: auto; }
                    .ps-pick-one { display: grid; gap: 2px; justify-items: center; padding: 8px 4px; border-radius: 11px;
                        cursor: pointer; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
                        color: #e8dcc2; }
                    .ps-pick-art { width: 42px; height: 42px; object-fit: contain; }
                    .ps-pick-one em { font-size: .68rem; font-style: normal; text-align: center; line-height: 1.15; }
                    .ps-pick-one i { font-size: .64rem; color: #b9a8c9; font-style: normal; }
                    .ps-empty { font-size: .8rem; color: #b9a8c9; text-align: center; padding: 14px 0; }
                    .ps-foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.1); font-size: .74rem; }
                    .ps-mult { font-weight: 900; color: #8fe39a; }
                `}</style>
            </div>
        </div>
    );
}

const RAR = { common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ff5cc8" };
