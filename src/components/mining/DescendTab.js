"use client";

import ItemArt from "@/components/ItemArt";
import { Img, KIND_ART, money, ToolPanel } from "@/components/mining/kit";

// ── DESCEND ──────────────────────────────────────────────────────────────────────────────────────────────────
// Push-your-luck. Every step down turns up a card and raises the odds the roof comes in. Stop and the bag is
// yours along with the seam you found; push one step too far and the bag is gone and the seam with it — you
// crawl out with the poorest rock in the mine instead. You always get to swing at something.

function TunnelCard({ card }) {
    if (!card) return <div className="mine-card is-idle"><em>The tunnel goes on.</em></div>;
    return (
        <div className="mine-card" key={card.k}>
            <span className="mine-card-lab">{card.label}</span>
            {card.kind === "encounter" ? (
                <><b style={{ color: "#ff9a8a" }}>{card.title}</b><em>{card.body}</em></>
            ) : card.kind === "nothing" ? (
                <><b className="muted">Nothing</b><em>Just rock.</em></>
            ) : card.kind === "gold" ? (
                <><b style={{ color: "#ffd75e" }}>{money(card.n)} gold</b><em>Into the bag.</em></>
            ) : card.kind === "ore" ? (
                <><Img src={card.art} className="mine-card-art" fallback="" /><b style={{ color: card.color }}>{card.name} ×{card.n}</b></>
            ) : card.kind === "seam" ? (
                <><Img src={card.art} className="mine-card-art" fallback="" /><b style={{ color: card.color }}>{card.name}</b><em>The seam you&rsquo;ll work gets better.</em></>
            ) : card.kind === "gear" ? (
                <><b style={{ color: "#b061ff" }}>Something buried</b><em>You won&rsquo;t know what until you&rsquo;re out.</em></>
            ) : card.kind === "chest" ? (
                <><b style={{ color: "#ffd75e" }}>A strongbox</b><em>Sealed. Carry it up.</em></>
            ) : (
                <><b>An old cache</b><em>Supplies, by the feel of it.</em></>
            )}
        </div>
    );
}

export default function DescendTab({ s, msg, busy, card, startTrip, goDeeper, surface, upgrade }) {
    const run = s.run;
    const tripsLeft = s.trips?.left ?? 0;

    return (
        <>
            <div className="mine-face is-descend">
                <div className="mine-face-bg is-descend" aria-hidden="true" />
                {run ? (
                    <>
                        <div className="mine-depth">DEPTH {run.depth}</div>
                        <TunnelCard card={card} />
                        <div className="mine-hud">
                            carrying <b>{run.haul.length}</b> · next step{" "}
                            <b style={{ color: run.risk >= 35 ? "#ff8f9a" : run.risk >= 18 ? "#ffcf6a" : "#8fe39a" }}>{run.risk}%</b> collapse
                        </div>
                    </>
                ) : (
                    <div className="mine-face-cta">
                        <Img src={s.lantern?.sprite} className="mine-empty-pick" fallback="" />
                        <p>{tripsLeft > 0 ? "The tunnel mouth." : "No trips left today."}</p>
                        <span className="muted">{tripsLeft > 0
                            ? "Go as deep as you dare. Everything you find is only yours once you climb out."
                            : "Three descents a day. Back tomorrow."}</span>
                    </div>
                )}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {/* The CTA lives OUTSIDE the pane — inside it, a fixed aspect-ratio box with overflow hidden was
                clipping the only button on the screen. */}
            {!run ? (
                <button type="button" className="mine-prospect is-big" onClick={startTrip} disabled={busy || tripsLeft <= 0}>
                    {tripsLeft > 0
                        ? <><Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head down the tunnel <em>{tripsLeft} of {s.trips.max} trips left today</em></>
                        : "No trips left today"}
                </button>
            ) : (
                <>
                    <div className="mine-haul">
                        {run.haul.length ? run.haul.map((h, i) => (
                            <span key={i} className="mine-haul-chip" title={h.name || h.kind}>
                                {h.kind === "gear" && h.id
                                    ? <ItemArt id={h.id} icon={h.icon} className="mine-haul-art" alt="" />
                                    : <Img src={h.art || KIND_ART[h.kind] || KIND_ART.gold} className="mine-haul-art" fallback="" />}
                                {h.n ? <em>×{h.n}</em> : null}
                            </span>
                        )) : <span className="muted" style={{ fontSize: 12 }}>Bag empty. Everything is still down here.</span>}
                    </div>
                    {/* The two choices, named for what they DO. "Climb out" read as quitting — as though you
                        were walking away from the mine — when it is actually the only way to reach the rock
                        face and swing at the seam you just found. Stopping IS the digging. The icons follow:
                        the lantern goes further into the dark, the pick is what you stop to use. */}
                    <div className="mine-choice">
                        <button type="button" className="mine-prospect" onClick={goDeeper} disabled={busy}>
                            <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Deeper <em>{run.risk}% risk</em>
                        </button>
                        <button type="button" className="mine-prospect is-ghost" onClick={surface} disabled={busy}>
                            <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> Stop &amp; dig
                            <em>{run.haul.length ? `keep ${run.haul.length}` : "empty bag"}</em>
                        </button>
                    </div>
                    <p className="mine-hint">Deeper rock hides better things — and the roof gets worse. Stop and the bag is yours to keep and the seam is yours to dig. Push too far and the bag is gone and the vein with it — you&rsquo;ll still have rock to swing at, just the worst there is.</p>
                </>
            )}

            <ToolPanel
                tool={s.lantern} levels={s.surveyLevels} tracks={s.surveyTracks}
                gold={s.gold} busy={busy} onBuy={upgrade}
                artClass="is-lantern" trackClass="is-boat"
                maxedNote="Fully lit — every descent upgrade bought."
            />
        </>
    );
}
