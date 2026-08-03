"use client";

import { Img, KIND_ART, money, PART_NAME, ToolPanel } from "@/components/mining/kit";

// ── THE FACE ─────────────────────────────────────────────────────────────────────────────────────────────────
// The seam you carried up, and the fixed number of swings you get on it. What you're shown before you swing is
// what your RANK buys — more pulls from the bag, and a better bag — never what comes out of it.

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
                    <span className="muted">Stop and dig, and the seam you found is waiting right here.</span>
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
                    <span className="muted">Seams come from the tunnel: go down, stop when you like, and what you found is waiting here.</span>
                    <button type="button" className="mine-prospect" onClick={() => backToTunnel(true)}>
                        <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head down the tunnel
                    </button>
                </>
            )}
        </div>
    );
}

export default function FaceTab({ s, node, msg, busy, floats, shake, tripsLeft, backToTunnel, onBreak, upgrade }) {
    const live = Boolean(node && node.hitsLeft > 0);
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
                        {/* The hand, not the rock. This bar tracked HP, which is why a seam could read
                            "100% left" and then be gone one swing later — a good hit killed a Coal seam
                            outright. A seam is N swings now and the bar says exactly that. */}
                        <div className="mine-hpbar"><span style={{ width: `${node.pct}%`, background: node.color }} /></div>
                        {/* "8 of 8 swings left" on an untouched seam is a riddle — it reads as a fraction when
                            nothing has happened yet. Say what the hand IS before you start, and count down
                            once you're in it. */}
                        <div className="mine-hpnum">
                            {node.mySwings
                                ? <><b>{node.hitsLeft}</b> swing{node.hitsLeft === 1 ? "" : "s"} left of {node.maxHits}</>
                                : <>A hand of <b>{node.maxHits}</b> swings</>}
                        </div>
                        {floats.map((f) => <span key={f.id} className={`mine-float is-${f.grade}`}>{f.dmg}</span>)}
                    </>
                ) : <NoSeam s={s} tripsLeft={tripsLeft} backToTunnel={backToTunnel} />}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {live ? (
                <>
                    {/* THE BAG — what your swinging actually buys. The old panel here listed a fixed ore payout
                        per rung, which the seam stopped paying long ago; it now says the true thing, which is
                        that you are buying PULLS and better odds, and deliberately never says what comes out. */}
                    <div className="mine-ladder">
                        <p className="mine-ladder-intro">
                            <b>Every seam pays out of a bag.</b> How well you swing decides how many times you
                            pull from it — and how much good stuff is in it to pull.
                        </p>
                        {(node.ranks || []).map((r) => (
                            <div key={r.key} className="mine-rank-row" style={{ "--rk": r.color }}>
                                <span className="mine-rank-name"><b>{r.label}</b><em>{r.from}%+</em></span>
                                <span className="mine-rank-draws"><b>{r.draws}</b> pulls</span>
                                <span className="mine-rank-rich" aria-hidden="true"><span style={{ width: `${Math.round(r.rich * 100)}%` }} /></span>
                            </div>
                        ))}
                        <div className="mine-bag-kinds">
                            <span className="muted">In the bag</span>
                            <Img src={node.art} className="mine-bag-ico" fallback="" />
                            <Img src={KIND_ART.chest} className="mine-bag-ico" fallback="" />
                            <Img src={KIND_ART.gear} className="mine-bag-ico" fallback="" />
                            <Img src={KIND_ART.consumable} className="mine-bag-ico" fallback="" />
                            <Img src={KIND_ART.gold} className="mine-bag-ico" fallback="" />
                        </div>
                        <p className="mine-ladder-foot">
                            Never the same twice. Plus <b>{money(node.gold)}</b> gold and <b>{money(node.xp)}</b> XP on the crack.
                            {node.haulExtra ? <> Your pack adds <b>+{node.haulExtra}%</b> on top.</> : null}
                        </p>
                    </div>

                    <button type="button" className="mine-prospect" onClick={onBreak} disabled={busy}>
                        <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" />
                        {node.mySwings ? "Back to the rock" : "Break the seam"}
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
