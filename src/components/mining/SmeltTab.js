"use client";

import { Img, PART_NAME, ToolPanel } from "@/components/mining/kit";

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

            <ToolPanel
                tool={s.furnace} levels={s.smeltLevels} tracks={s.smeltTracks}
                gold={s.gold} busy={busy} onBuy={upgrade}
                artClass="is-furnace" trackClass="is-forge"
                maxedNote="Fully built — every smelting upgrade bought."
            />

            <div className="mine-panel">
                <div className="mine-panel-head">Ore in your pack <span className="muted">· smelts into forge parts</span></div>
                {(s.ore || []).length ? (
                    <div className="mine-stash-rows">
                        {s.ore.map((o) => (
                            <div className="mine-stash-row" key={o.tier}>
                                <Img src={o.art} className="mine-stash-img" fallback="" />
                                <span className="mine-stash-name">
                                    <b style={{ color: o.color }}>{o.name}</b>
                                    <em>{o.smeltCost} ore → 1 {PART_NAME[o.partTier]}</em>
                                </span>
                                <b className="mine-stash-qty">×{o.qty}</b>
                                <button type="button" className="mine-smelt" disabled={!o.canSmelt || Boolean(smelting)} onClick={() => onSmelt(o.tier)}>
                                    <Img src="/images/mining/track-crucible.png" className="mine-btn-ico" fallback="" /> Smelt {o.canSmelt || ""}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing yet — crack a seam on the Mine tab and it lands here.</p>}
            </div>

            <p className="mine-hint">Ore of a tier melts into that tier&rsquo;s forge part. The Crucible lowers what each part costs you, the Bellows sometimes throws in an extra, and Flux sometimes lifts one a whole tier.</p>
        </>
    );
}
