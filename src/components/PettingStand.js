"use client";

import { useState } from "react";
import { GiPawPrint, GiResize } from "react-icons/gi";

// ── THE PETTING STAND PANEL ──────────────────────────────────────────────────────────────────────────────────
// Opens when the placed stand is tapped, from the scene-control pill, and on anybody else's farm.
//
// A PANEL RATHER THAN PETS DRAWN ON THE SPRITE. The obvious build is to position three pets on the three tiers
// of the artwork — and it falls apart the moment somebody uses the tools every decoration already has: the
// stand can be scaled 0.4x to 2.5x, rotated a full circle and mirrored, so any fixed offsets onto the cushions
// would be right on exactly one farm. The panel is also what makes the owner counts legible, which is half the
// point of the thing.
//
// The same component serves the owner and a visitor. A visitor sees who is on display and how rare each one is
// — that is the advertisement the stand exists to be — and the owner additionally gets the seat controls.

// Bottom cushion is the widest, top the narrowest (see `tiers` in decorations.js). Naming them beats "slot 2":
// the tier is a thing you can SEE on the artwork, so you can pick a companion to suit it.
const TIER_NAME = ["Top", "Middle", "Bottom"];

export default function PettingStand({ stand, mine, pets = [], busy, onSeat, onClear, onClose, onAdjust }) {
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
    const filled = slots.filter((s) => s.pet).length;

    const seat = (petId) => { onSeat?.(picking, petId); setPicking(null); };

    return (
        <div className="ps-wrap" onClick={onClose} role="presentation">
            <div className="ps-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="The Petting Stand">
                <div className="ps-head">
                    <span className="ps-crest" aria-hidden="true"><GiPawPrint /></span>
                    <span className="ps-titles">
                        <b>The Petting Stand</b>
                        <i>{mine ? `${filled} of 3 cushions filled` : "On display"}</i>
                    </span>
                    <button type="button" className="ps-x" onClick={onClose} aria-label="Close">×</button>
                </div>

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
                                    <span className="ps-rank">{TIER_NAME[s.slot] || s.slot + 1}</span>
                                    <span className="ps-tier-art">
                                        {s.pet ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={spriteOf(s.pet.id) || ""} className="ps-art" alt="" draggable="false" />
                                        ) : <span className="ps-vacant" aria-hidden="true"><GiPawPrint /></span>}
                                    </span>
                                    {s.pet ? (
                                        <span className="ps-tier-body">
                                            <b style={{ color: RAR[s.pet.rarity] || "#f0e4c8" }}>{s.pet.name}</b>
                                            <span className="ps-meta">
                                                <em>Lv {s.pet.level}</em>
                                                {/* The rarity fact the Den has never been able to state. "1 member"
                                                    is the interesting case and it is worded as such rather than as
                                                    a bare number nobody can scale. */}
                                                <i className="ps-owners">
                                                    {s.pet.owners <= 1 ? "only one in the Den" : `${s.pet.owners} own this`}
                                                </i>
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="ps-tier-body">
                                            <b className="ps-vacant-t">Empty cushion</b>
                                            <em>{mine ? "Tap Add to choose one" : "Nothing on display"}</em>
                                        </span>
                                    )}
                                    {mine ? (
                                        s.pet
                                            ? <button type="button" className="ps-ghost ps-act" disabled={busy} onClick={() => onClear?.(s.slot)}>Remove</button>
                                            : <button type="button" className="ps-add ps-act" disabled={busy} onClick={() => setPicking(s.slot)}>Add</button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="ps-foot">
                    <span className="ps-chip ps-chip-x">×{stand?.petMult || 2} petting XP</span>
                    <span className="ps-chip">Earns as if equipped</span>
                    {/* ── THE WAY BACK TO THE ORDINARY TOOLS ───────────────────────────────────────────────
                        This panel REPLACES the decoration inspector for the stand, which quietly took away
                        resize, rotate, flip, brightness and pick-up — every other decoration has them and this
                        one silently did not. Luke: "I cant resize the decoration because it has its own modal."
                        Rather than restate those controls here (a second copy of one shape is exactly how the
                        stand's size bug happened), this hands over to the real inspector. */}
                    {mine && onAdjust ? (
                        <button type="button" className="ps-ghost ps-adjust" onClick={onAdjust}>
                            <GiResize aria-hidden="true" />Size &amp; position
                        </button>
                    ) : null}
                </div>
            </div>

            {/* ⚠️ MUST STAY A DIRECT CHILD OF THE ROOT ELEMENT.
                styled-jsx only stamps its jsx-hash scoping class onto the JSX subtree that CONTAINS the style
                tag. This lived inside .ps-card once, so .ps-wrap never got the class and the compiled rule
                (.ps-wrap.jsx-hash) matched nothing — no position:fixed, no inset, no z-index. The panel rendered
                as a plain block a thousand pixels down the page while the scroll lock pinned the body, which
                reads exactly like "no modal opened and the page won't scroll". It was reported four times. */}
            <style jsx>{`
                .ps-wrap { position: fixed; inset: 0; z-index: 10060; background: rgba(6,4,2,0.68);
                    display: grid; place-items: center; padding: 16px; }
                .ps-card { width: 100%; max-width: 420px; max-height: min(88dvh, 720px); padding: 15px 15px 13px;
                    border-radius: 18px; color: #f0e4c8;
                    /* GOLD AND WARM, NOT PURPLE. An earlier pass was a saturated aubergine and every pet sprite
                       on it looked tinted — the panel was competing with the artwork it exists to show. */
                    background: linear-gradient(180deg, #241d10, #16130d 62%, #121016);
                    border: 1px solid rgba(255,215,110,0.34);
                    box-shadow: 0 24px 64px rgba(0,0,0,0.66), inset 0 1px 0 rgba(255,225,150,0.10);
                    animation: psUp .24s cubic-bezier(.2,1,.3,1) both;
                    /* The card is a column: head and footer are pinned and only the middle scrolls, with
                       overscroll containment so the pull stops here instead of dragging the page behind it. */
                    display: flex; flex-direction: column; overflow: hidden; }
                .ps-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0 -4px; padding: 2px 4px;
                    -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
                @keyframes psUp { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }

                .ps-head { display: flex; align-items: center; gap: 10px; padding-bottom: 11px; margin-bottom: 11px;
                    border-bottom: 1px solid rgba(255,215,110,0.16); }
                .ps-crest { flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px;
                    border-radius: 11px; font-size: 18px; color: #1b1508;
                    background: linear-gradient(160deg, #ffe08a, #e0a63c);
                    box-shadow: 0 2px 8px rgba(224,166,60,0.35); }
                .ps-titles { display: grid; gap: 1px; min-width: 0; }
                .ps-titles b { font-size: 1.02rem; letter-spacing: .2px; }
                .ps-titles i { font-size: .72rem; font-style: normal; color: #c0ab84; }
                .ps-x { margin-left: auto; background: none; border: none; color: #c0ab84; font-size: 22px;
                    line-height: 1; cursor: pointer; padding: 0 2px; }
                .ps-x:hover { color: #f0e4c8; }

                .ps-tiers { display: grid; gap: 8px; }
                .ps-tier { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border-radius: 13px;
                    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.09); min-height: 64px; }
                .ps-tier.is-full { background: linear-gradient(180deg, rgba(255,215,110,0.10), rgba(255,215,110,0.04));
                    border-color: rgba(255,215,110,0.32); }
                .ps-rank { flex: 0 0 auto; width: 44px; font-size: .61rem; font-weight: 900; letter-spacing: .8px;
                    text-transform: uppercase; color: #9d8a63; }
                .ps-tier-art { flex: 0 0 auto; width: 44px; height: 44px; display: grid; place-items: center; }
                .ps-art { width: 44px; height: 44px; object-fit: contain; }
                .ps-vacant { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
                    font-size: 15px; color: rgba(255,215,110,0.32); border: 1px dashed rgba(255,215,110,0.26); }
                .ps-tier-body { display: grid; gap: 2px; min-width: 0; flex: 1 1 auto; }
                .ps-tier-body b { font-size: .89rem; }
                .ps-tier-body em { font-size: .7rem; color: #9d8a63; font-style: normal; }
                .ps-vacant-t { color: #8e7f63; font-weight: 700; }
                .ps-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
                .ps-owners { font-size: .67rem; font-style: normal; color: #ffd75e;
                    background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.22);
                    border-radius: 999px; padding: 1px 7px; }

                .ps-act { flex: 0 0 auto; margin-left: auto; }
                .ps-add { padding: 7px 15px; border-radius: 999px; cursor: pointer; font-weight: 900; font-size: .76rem;
                    color: #1b1508; border: none; background: linear-gradient(180deg, #ffe08a, #e0a63c);
                    box-shadow: 0 2px 9px rgba(224,166,60,0.3); transition: filter .12s ease, transform .09s ease; }
                .ps-add:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); }
                .ps-add:disabled { opacity: .5; cursor: default; }
                .ps-ghost { padding: 7px 12px; border-radius: 999px; cursor: pointer; font-weight: 800; font-size: .73rem;
                    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #e8dcc2;
                    display: inline-flex; align-items: center; gap: 5px; }
                .ps-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.11); }
                .ps-ghost:disabled { opacity: .5; cursor: default; }

                .ps-pick-head { display: flex; align-items: center; margin-bottom: 9px; }
                .ps-pick-head b { font-size: .9rem; }
                .ps-pick-head .ps-ghost { margin-left: auto; }
                .ps-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
                .ps-pick-one { display: grid; gap: 2px; justify-items: center; padding: 9px 4px; border-radius: 12px;
                    cursor: pointer; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.13);
                    color: #f0e4c8; transition: border-color .12s ease, background .12s ease; }
                .ps-pick-one:hover:not(:disabled) { border-color: rgba(255,215,110,0.5); background: rgba(255,215,110,0.09); }
                .ps-pick-art { width: 42px; height: 42px; object-fit: contain; }
                .ps-pick-one em { font-size: .68rem; font-style: normal; text-align: center; line-height: 1.15; }
                .ps-pick-one i { font-size: .63rem; color: #9d8a63; font-style: normal; }
                .ps-empty { font-size: .8rem; color: #9d8a63; text-align: center; padding: 16px 0; }

                .ps-foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 11px;
                    padding-top: 10px; border-top: 1px solid rgba(255,215,110,0.16); }
                .ps-chip { font-size: .67rem; font-weight: 800; color: #c0ab84; border-radius: 999px;
                    padding: 3px 9px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
                .ps-chip-x { color: #8fe39a; border-color: rgba(143,227,154,0.28); background: rgba(143,227,154,0.10); }
                .ps-adjust { margin-left: auto; }
            `}</style>
        </div>
    );
}

const RAR = { common: "#c8c8c8", rare: "#6bb6e8", epic: "#c084fc", legendary: "#f5a623", mythic: "#ff7ad4" };
