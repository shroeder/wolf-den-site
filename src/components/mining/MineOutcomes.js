"use client";

import ItemArt from "@/components/ItemArt";
import { Img, KindIcon, money, PART_COLOR, PART_NAME, PART_SPRITE, RARITY_COLOR, RARITY_LABEL, statLine } from "@/components/mining/kit";

// ── OUTCOMES ─────────────────────────────────────────────────────────────────────────────────────────────────
// The two "here's what you got" moments that live outside a minigame: stopping the descent, and pouring a
// smelt. (Cracking a seam has its own reveal inside MiningMinigame — the rank, every draw and the rare tickets
// your timing earned — so there is deliberately no second modal for it here.)
// Both speak the same visual language as the chest opener — real sprite, rarity colour, the name in full.

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
                    {wrap.collapsed ? "The roof came in" : "You stopped in time"}
                </h3>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                    {wrap.collapsed
                        ? `Depth ${wrap.depth}. ${wrap.lost ? `You were carrying ${wrap.lost} thing${wrap.lost === 1 ? "" : "s"}. Not any more.` : "You were carrying nothing, at least."}`
                        : `${paid.length} thing${paid.length === 1 ? "" : "s"} out of the dark.`}
                </p>
                {!wrap.collapsed && paid.length ? (
                    <div className="mine-reveal-row">{paid.map((h, i) => <Haul key={i} h={h} />)}</div>
                ) : null}
                {/* WHAT THE ROOF TOOK. A collapse still leaves you rock to swing at, so the loss is not "nothing
                    at the face" — it's the DIFFERENCE between the vein you'd found and the Coal you crawled out
                    with. Showing both side by side is the only way that reads as a cost rather than a shrug. */}
                {wrap.collapsed && wrap.lostTier ? (
                    <div className="mine-lost" style={{ "--had": wrap.lostTier.color }}>
                        <span className="mine-lost-was">
                            <Img src={wrap.lostTier.art} className="mine-lost-art" fallback="" />
                            <em style={{ color: wrap.lostTier.color }}>{wrap.lostTier.name}</em>
                            <i>buried</i>
                        </span>
                        <span className="mine-lost-arrow" aria-hidden="true">&rarr;</span>
                        <span className="mine-lost-got">
                            <Img src={wrap.seam?.art} className="mine-lost-art" fallback="" />
                            <em style={{ color: wrap.seam?.color }}>{wrap.seam?.name}</em>
                            <i>all you got out with</i>
                        </span>
                    </div>
                ) : wrap.seam ? (
                    <div className="mine-rung-won is-flawless" style={{ marginTop: 12 }}>
                        <b>{wrap.seam.name} waiting at the face</b>
                        <em>{wrap.collapsed ? "Poor rock, but it's rock. Go swing at it." : "Go break it open."}</em>
                    </div>
                ) : null}
                {/* Either way there is now something at the face, so the button goes there. */}
                <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={onToFace}>
                    <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> To the rock face
                </button>
                {wrap.collapsed && tripsLeft > 0 ? (
                    <button type="button" className="mine-prospect is-ghost" style={{ marginTop: 8 }} onClick={onAgain}>
                        <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Or straight back down ({tripsLeft} left)
                    </button>
                ) : null}
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
                        {/* THE PART YOU JUST MADE, AS THE THING IT IS. This was a count and a name in plain
                            text — "2× Iron Filings" — while the painted sprite for that exact part sat in the
                            forge catalog, already generated. Every part tier has one; draw it. */}
                        <div className="mine-reveal-row">
                            {(smelting.result?.byTier || []).map((b) => (
                                <span key={b.partTier} className={`mine-reveal-spot${b.lifted ? " is-picked" : ""}`}>
                                    <Img src={PART_SPRITE[b.partTier]} className="mine-reveal-art" fallback="" />
                                    <b style={{ fontSize: 18 }}>{b.count}×</b>
                                    <em style={{ color: b.lifted ? "#7cffb2" : PART_COLOR[b.partTier] || "#cdd3d8" }}>{PART_NAME[b.partTier]}</em>
                                    {b.lifted ? <b style={{ fontSize: 9 }}>TIER UP</b> : null}
                                </span>
                            ))}
                        </div>
                        {(smelting.result?.bonus || []).length ? (
                            <div className="mine-rung-won is-flawless" style={{ marginTop: 12 }}>
                                <b>Out of the slag</b>
                                {/* Same story: the server hands back `art` for consumables and chests, and this
                                    used to .join(" · ") the names and throw the pictures away. */}
                                <div className="mine-slag-row">
                                    {smelting.result.bonus.map((x, i) => (
                                        <span key={`${x.kind}-${x.id || x.tier || i}`} className="mine-slag-item">
                                            <Img src={x.art} className="mine-reveal-art" fallback="" />
                                            <em>{x.name || (x.kind === "chest" ? `${x.tier} chest` : x.kind)}</em>
                                        </span>
                                    ))}
                                </div>
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
