"use client";

import { Img, money, PART_NAME, ToolPanel } from "@/components/mining/kit";

// ── THE FACE ─────────────────────────────────────────────────────────────────────────────────────────────────
// The seam you carried up, and the swings you get on it. The LADDER is shown before you swing — straight from
// the Kitchen: the reward isn't the surprise, how well you dig is.

function NoSeam({ s, tripsLeft, backToTunnel }) {
    // The one place a miner gets stuck: they came to swing, there's nothing to swing at, and nothing here used
    // to explain that a seam comes from the tunnel. So say what's missing, say where it comes from, and put
    // the door right here.
    return (
        <div className="mine-empty">
            <Img src={s.lantern?.sprite} className="mine-empty-pick" fallback="" />
            {s.run ? (
                <>
                    <p>You&rsquo;re still down the tunnel.</p>
                    <span className="muted">Climb out and the seam you found comes back here with you.</span>
                    <button type="button" className="mine-prospect" onClick={() => backToTunnel(false)}>
                        <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Back to the tunnel
                    </button>
                </>
            ) : tripsLeft <= 0 ? (
                <>
                    <p>No trips left today.</p>
                    <span className="muted">Three descents a day. They come back tomorrow.</span>
                </>
            ) : (
                <>
                    <p>Nothing to swing at yet.</p>
                    <span className="muted">Seams come from the tunnel: descend, climb out, and whatever you found is waiting here.</span>
                    <button type="button" className="mine-prospect" onClick={() => backToTunnel(true)}>
                        <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head down the tunnel
                    </button>
                </>
            )}
        </div>
    );
}

export default function FaceTab({ s, node, msg, busy, floats, shake, tripsLeft, backToTunnel, onBreak, upgrade }) {
    const live = Boolean(node && node.pct > 0);
    const lvls = s.stats?.upgradeLevels ?? 0;

    return (
        <>
            <div className={`mine-face${node ? "" : " is-empty"}`} key={node?.id || "none"}>
                <div className="mine-face-bg" aria-hidden="true" />
                {node ? (
                    <>
                        <div className="mine-rock" style={{ "--ore": node.color, animation: shake ? "mineHit .18s ease" : undefined }} key={shake}>
                            <Img src={node.art} className="mine-rock-img" fallback="" />
                        </div>
                        <div className="mine-seam-head">
                            <b style={{ color: node.color }}>{node.name}</b>
                            <span className="muted">smelts to {PART_NAME[node.partTier]}</span>
                        </div>
                        <div className="mine-hpbar"><span style={{ width: `${node.pct}%`, background: node.color }} /></div>
                        <div className="mine-hpnum">{node.pct}% left{node.mySwings ? ` · ${node.mySwings} swing${node.mySwings === 1 ? "" : "s"} in` : ""}</div>
                        {floats.map((f) => <span key={f.id} className={`mine-float is-${f.grade}`}>{f.dmg}</span>)}
                    </>
                ) : <NoSeam s={s} tripsLeft={tripsLeft} backToTunnel={backToTunnel} />}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {live ? (
                <>
                    <div className="mine-ladder">
                        <p className="mine-ladder-intro">
                            <b>How well you swing decides what comes out.</b> Your average timing across this seam picks the rung.
                            {node.quality != null ? <> Right now you&rsquo;re digging at <b>{node.quality}%</b>.</> : null}
                        </p>
                        {[...(node.ladder || [])].reverse().map((r) => (
                            <div key={r.rung} className={`mine-rung is-${r.key}${node.currentRung === r.rung ? " is-here" : ""}`}>
                                <span className="mine-rung-n">{r.rung}</span>
                                <span className="mine-rung-copy"><b>{r.label}</b><em>{r.blurb}</em></span>
                                <span className="mine-rung-pay">
                                    <Img src={node.art} className="mine-rung-ore" fallback="" />
                                    <b>×{r.ore}</b>
                                </span>
                            </div>
                        ))}
                        <p className="mine-ladder-foot">Plus <b>{money(node.gold)}</b> gold and <b>{money(node.xp)}</b> XP on the crack, whatever the rung.</p>
                    </div>

                    <button type="button" className="mine-prospect" onClick={onBreak} disabled={busy}>
                        <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> Break the seam
                    </button>
                </>
            ) : null}

            <ToolPanel
                tool={s.pick} levels={lvls} tracks={s.tracks}
                gold={s.gold} busy={busy} onBuy={upgrade}
                trackClass="is-dig"
                maxedNote="Fully forged — every upgrade bought."
            />

            <p className="mine-hint">Find a seam, then time the marker to the middle — same bands as the anvil and the golem. Clean hits chain for more damage.</p>
        </>
    );
}
