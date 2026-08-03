"use client";

import ItemArt from "@/components/ItemArt";
import { Img, KindIcon, money, PART_NAME, RARITY_COLOR, RARITY_LABEL, statLine } from "@/components/mining/kit";

// ── OUTCOMES ─────────────────────────────────────────────────────────────────────────────────────────────────
// The three "here's what you got" moments: climbing out of the tunnel, cracking a seam, and pouring a smelt.
// All three speak the same visual language as the chest opener — real sprite, rarity colour, the name in full.

// A single thing you carried out. Gear gets the full treatment: its own art, its rarity frame, its stat line.
function Haul({ h }) {
    const gear = h.kind === "gear";
    const rar = gear ? RARITY_COLOR[h.rarity] || "#cdd3d8" : h.color || "#cdd3d8";
    return (
        <span className={`mine-reveal-spot${gear ? " is-item" : ""}`} style={gear ? { "--rar": rar } : undefined}>
            {gear && h.id
                ? <ItemArt id={h.id} icon={h.icon} className="mine-item-art" alt="" />
                : h.art
                    ? <Img src={h.art} className="mine-reveal-ore" fallback="" />
                    : <KindIcon kind={h.kind} art={h.art} className="mine-reveal-ore" />}
            {/* FULL name. Truncating to the first word turned "Fanged Helm" into "Fanged" and "War Cape" into
                "War", which mean nothing. */}
            <em style={{ color: rar }}>{h.kind === "gold" ? `${money(h.n)} gold` : h.name || h.kind}</em>
            {gear ? (
                <>
                    <i className="mine-item-tag">{RARITY_LABEL[h.rarity] || h.rarity}</i>
                    {h.stats ? <i className="mine-item-stats">{statLine(h.stats)}</i> : null}
                </>
            ) : null}
        </span>
    );
}

// HOW THE DESCENT ENDED — everything you carried out, or everything the roof took.
export function WrapModal({ wrap, tripsLeft, maxTrips, onClose, onToFace, onAgain }) {
    const paid = wrap.paid || [];
    return (
        <div className="mine-modal" role="presentation" onClick={onClose}>
            <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: wrap.collapsed ? "#ff8f9a" : "#ffd75e" }}>
                    {wrap.collapsed ? "The roof came in" : "You climbed out"}
                </h3>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                    {wrap.collapsed
                        ? `Depth ${wrap.depth}. ${wrap.lost ? `You were carrying ${wrap.lost} thing${wrap.lost === 1 ? "" : "s"}. Not any more.` : "You were carrying nothing, at least."}`
                        : `${paid.length} thing${paid.length === 1 ? "" : "s"} out of the dark.`}
                </p>
                {!wrap.collapsed && paid.length ? (
                    <div className="mine-reveal-row">{paid.map((h, i) => <Haul key={i} h={h} />)}</div>
                ) : null}
                {wrap.seam ? (
                    <div className="mine-rung-won is-flawless" style={{ marginTop: 12 }}>
                        <b>{wrap.seam.name} waiting at the face</b>
                        <em>{wrap.collapsed ? "You got out with the seam, at least." : "Go break it open."}</em>
                    </div>
                ) : null}
                {/* A collapse ends with nothing at the face, so the way out is another trip — not a walk to an
                    empty room. */}
                {wrap.collapsed ? (
                    <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={onAgain}>
                        {tripsLeft > 0
                            ? <><Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head back down ({tripsLeft} left)</>
                            : <>Out of trips today</>}
                    </button>
                ) : (
                    <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={onToFace}>
                        <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> To the rock face
                    </button>
                )}
            </div>
        </div>
    );
}

// THE SEAM CRACKED — the rung you earned and what it paid.
export function CrackModal({ crack, tripsLeft, onClose, onAnother }) {
    return (
        <div className="mine-modal" role="presentation" onClick={onClose}>
            <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                <Img src={crack.art} className="mine-modal-img" fallback="" />
                <h3 style={{ color: crack.color }}>{crack.name} cracked!</h3>
                {crack.rungLabel ? (
                    <div className={`mine-rung-won is-${crack.rungKey}`}>
                        <b>{crack.rungLabel}</b>
                        <em>{crack.rungBlurb} · {crack.quality}% average over {crack.swings} swing{crack.swings === 1 ? "" : "s"}</em>
                    </div>
                ) : null}
                <div className="mine-modal-rows">
                    <span>Ore<b>+{crack.ore}</b></span>
                    <span>Gold<b>+{money(crack.gold)}</b></span>
                    <span>XP<b>+{money(crack.xp)}</b></span>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Smelts into {PART_NAME[crack.partTier]}.</p>
                {/* Seams come from the tunnel now, so the next one is another descent. This button used to call
                    a prospect() that no longer existed and threw on every press. */}
                <button type="button" className="mine-buy" style={{ marginTop: 12 }} onClick={onAnother}>
                    {tripsLeft > 0
                        ? <><Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Back down for another ({tripsLeft} left)</>
                        : "No trips left today"}
                </button>
            </div>
        </div>
    );
}

// THE POUR PLAYED BACK — ore into the furnace, parts out of it.
export function SmeltModal({ smelting, onClose }) {
    const done = smelting.stage === "done";
    return (
        <div className="mine-modal" role="presentation" onClick={() => done && onClose()}>
            <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className={`mine-smelt-stage is-${smelting.stage}`}>
                    <Img src={smelting.oreArt} className="mine-smelt-ore" fallback="" />
                    <Img src="/images/mining/furnace.png" className="mine-smelt-furnace" fallback="" />
                    <span className="mine-smelt-glow" aria-hidden="true" />
                </div>
                {done ? (
                    <>
                        <div className={`mine-band is-${smelting.result?.band || "warm"}`}>
                            {smelting.result?.bandLabel || "Poured"} <em>{smelting.result?.bandBlurb || ""}</em>
                        </div>
                        <h3 style={{ color: "#ffd08a" }}>{smelting.result?.parts ?? smelting.parts} parts</h3>
                        <div className="mine-reveal-row">
                            {(smelting.result?.byTier || []).map((b) => (
                                <span key={b.partTier} className={`mine-reveal-spot${b.lifted ? " is-picked" : ""}`}>
                                    <b style={{ fontSize: 18 }}>{b.count}×</b>
                                    <em style={{ color: b.lifted ? "#7cffb2" : "#cdd3d8" }}>{PART_NAME[b.partTier]}</em>
                                    {b.lifted ? <b style={{ fontSize: 9 }}>TIER UP</b> : null}
                                </span>
                            ))}
                        </div>
                        {(smelting.result?.bonus || []).length ? (
                            <div className="mine-rung-won is-flawless" style={{ marginTop: 12 }}>
                                <b>Out of the slag</b>
                                <em>{smelting.result.bonus.map((x) => x.name || (x.kind === "chest" ? `${x.tier} chest` : x.kind)).join(" · ")}</em>
                            </div>
                        ) : null}
                        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
                            {smelting.ore} {smelting.oreName} went in. The parts are waiting in the Forge.
                        </p>
                        <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={onClose}>Back to the rock</button>
                    </>
                ) : (
                    <h3 style={{ color: "#ffd08a" }}>{smelting.stage === "load" ? "Into the furnace…" : "Smelting…"}</h3>
                )}
            </div>
        </div>
    );
}
