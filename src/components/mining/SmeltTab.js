"use client";

import { Img, PART_NAME, PART_SPRITE, ToolPanel } from "@/components/mining/kit";
import { SMELT_MAX_BATCHES } from "@/lib/marketplace/smelt-heat.js";

// ── THE SMELTERY ─────────────────────────────────────────────────────────────────────────────────────────────
// Your actual furnace, standing in the room, upgrading its sprite as you build it out. Ore of a tier melts
// into that tier's forge part — the smelt itself is a minigame, played in HeatGame.

export default function SmeltTab({ s, msg, busy, smelting, onSmelt, upgrade }) {
    return (
        <>
            <div className="mine-face is-smelt">
                <div className="mine-face-bg is-smelt" aria-hidden="true" />
                <div className="mine-forge">
                    <Img src={s.furnace?.sprite} className="mine-forge-img" fallback="" />
                    <span className="mine-forge-glow" aria-hidden="true" />
                </div>
                <div className="mine-hud">
                    <b>{s.furnace?.name}</b>{s.oreTotal ? <> · {s.oreTotal} ore waiting</> : <> · nothing to melt</>}
                </div>
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {/* THE STASH FIRST. Smelting is what you came to this tab to DO — it sat under four upgrade cards,
                so the actual verb was below the fold and the shop was above it. */}
            <div className="mine-panel">
                <div className="mine-panel-head">
                    Ore in your pack
                    {s.partsReady ? <span className="mine-smeltable">{s.partsReady} parts ready</span> : <span className="muted"> · not enough of any one ore yet</span>}
                </div>
                {(s.ore || []).length ? (
                    <div className="mine-stash-rows">
                        {s.ore.map((o) => (
                            <div className="mine-stash-row" key={o.tier}>
                                <Img src={o.art} className="mine-stash-img" fallback="" />
                                <span className="mine-stash-name">
                                    <b style={{ color: o.color }}>{o.name}</b>
                                    {/* Show the part you'd be making, not just its name — the ore beside it
                                        has had a sprite all along. */}
                                    <em>{o.smeltCost} ore &rarr; 1 <Img src={PART_SPRITE[o.partTier]} className="mine-part-ico" fallback="" />{PART_NAME[o.partTier]}</em>
                                </span>
                                <b className="mine-stash-qty">×{o.qty}</b>
                                {/* The button said "Smelt 8" and got clipped on a phone. It now says what it
                                    MAKES — that is the number worth reading — and wraps to its own line rather
                                    than fighting the name for width.

                                    THE BULK BUTTON. A full pack is dozens of batches, and at one pour each
                                    that is the same five-phase minigame thirty-six times over — the pour is the
                                    good part, the thirty-six taps around it are not. The second button covers
                                    up to ten batches with a single pour, and it never offers more than the ore
                                    in the pack can pay for, so what it says is what you get. */}
                                <span className="mine-smelt-btns">
                                    <button type="button" className={`mine-smelt${o.canSmelt ? " is-ready" : ""}`} disabled={!o.canSmelt || Boolean(smelting)} onClick={() => onSmelt(o.tier, 1)}>
                                        <Img src="/images/mining/track-crucible.png" className="mine-btn-ico" fallback="" />
                                        {o.canSmelt ? <>Smelt <b>1</b></> : "Not enough"}
                                    </button>
                                    {(() => {
                                        const most = Math.min(SMELT_MAX_BATCHES, Math.floor((o.qty || 0) / (o.smeltCost || 1)));
                                        if (!o.canSmelt || most < 2) return null;
                                        return (
                                            <button type="button" className="mine-smelt is-bulk" disabled={Boolean(smelting)} onClick={() => onSmelt(o.tier, most)}
                                                title={`One pour, ${most} batches — ${most * o.smeltCost} ${o.name}`}>
                                                Smelt <b>{most}</b>
                                            </button>
                                        );
                                    })()}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing yet — crack a seam on the Mine tab and it lands here.</p>}
            </div>


            <ToolPanel
                tool={s.furnace} levels={s.smeltLevels} tracks={s.smeltTracks}
                gold={s.gold} busy={busy} onBuy={upgrade}
                artClass="is-furnace" trackClass="is-forge"
                maxedNote="Fully built — every smelting upgrade bought."
            />

            <p className="mine-hint">Ore of a tier melts into that tier&rsquo;s forge part. The Crucible lowers what each part costs you, the Bellows sometimes throws in an extra, and Flux sometimes lifts one a whole tier.</p>
        </>
    );
}
