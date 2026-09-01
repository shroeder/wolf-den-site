"use client";

import { useEffect, useRef, useState } from "react";

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
                /* Named as a DISCOVERY, and the thing you actually take is the ore. "Silver Lode" on its own
                   read like an item you'd pocketed, which is not a thing you can do with a vein. */
                <><Img src={card.art} className="mine-card-art" fallback="" />
                    <b style={{ color: card.color }}>{card.oreName} ×{card.n}</b>
                    <em>You strike {card.name} — the rock you&rsquo;ll work gets better.</em></>
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

export default function DescendTab({ s, msg, busy, card, startTrip, buyTrip, goDeeper, surface, upgrade }) {
    const run = s.run;
    const tripsLeft = s.trips?.left ?? 0;
    const recharge = s.trips?.recharge;

    // ── A TAP THAT WAS MEANT FOR THE BUTTON THAT WAS THERE A MOMENT AGO ──────────────────────────────────
    // Kaishiern: "I accidentally closed one of my mine runs before digging at all. Can we get a button to
    // confirm when we want to stop and dig? Preferable in a spot we can't accidentally/mindlessly click lol"
    // GrayKitsune: "I started and stopped a mine in the same double tap on my screen."
    //
    // Two reports, one cause, and it is not a mis-aimed thumb. Starting a trip REPLACES the big start button
    // with this two-button row, and "Stop & dig" lands in roughly the same place — so the second tap of a
    // double-tap goes to a control that did not exist when the first one was sent. Same for a step down: the
    // row re-renders under a finger that is already on its way back.
    //
    // So STOP is dead for a moment whenever the row appears or the depth changes. 450ms is longer than a
    // double-tap (~300ms) and shorter than a deliberate second tap, so it costs a real decision nothing.
    //
    // Only Stop. Deeper stays live, because nobody has ever lost a run by descending one step more than they
    // meant to — the stray tap always lands on the button that ENDS things, and arming both would tax the one
    // action people deliberately repeat fast.
    const [armed, setArmed] = useState(false);
    const depth = run?.depth ?? null;
    useEffect(() => {
        if (depth == null) return undefined;
        setArmed(false);
        const t = setTimeout(() => setArmed(true), 450);
        return () => clearTimeout(t);
    }, [depth]);

    // ── AND THE CASE THAT ACTUALLY COST SOMETHING ────────────────────────────────────────────────────────
    // Stopping is the NORMAL move — "stopping IS the digging" — so a confirm on every stop would tax the one
    // thing everybody does every run. What Kaishiern lost was a run with nothing in the bag yet, which is the
    // only stop that is never what you meant. That one asks; every other stop is still one tap.
    const emptyBag = !(run?.haul?.length);
    const [confirmStop, setConfirmStop] = useState(false);
    const stopRef = useRef(null);
    stopRef.current = surface;
    const onStop = () => {
        if (emptyBag && !confirmStop) { setConfirmStop(true); return; }
        setConfirmStop(false);
        stopRef.current?.();
    };
    useEffect(() => { setConfirmStop(false); }, [depth]);

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
                        <p>{tripsLeft > 0 ? "The tunnel mouth." : "That's your three for today."}</p>
                        <span className="muted">{tripsLeft > 0
                            ? "Go as deep as you dare. Everything you find is only yours once you stop and dig."
                            : recharge?.available
                                ? "The foreman will look the other way — for a price."
                                : "Three free descents a day, and you've bought all you can. Back tomorrow."}</span>
                    </div>
                )}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {/* The CTA lives OUTSIDE the pane — inside it, a fixed aspect-ratio box with overflow hidden was
                clipping the only button on the screen. */}
            {!run ? (
                tripsLeft > 0 ? (
                    <button type="button" className="mine-prospect is-big" onClick={startTrip} disabled={busy}>
                        <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head down the tunnel
                        <em>{tripsLeft} of {s.trips.max} trips left today</em>
                    </button>
                ) : recharge?.available ? (
                    /* Out of trips with gold in your pocket was a dead end and a disabled button. The price
                       doubles each time, so the first is an easy yes and the third is a real decision. */
                    <button type="button" className="mine-prospect is-big is-buy" onClick={buyTrip} disabled={busy || (s.gold ?? 0) < recharge.cost}>
                        <Img src="/images/ui/coin.png" className="mine-btn-ico" fallback="" />
                        {(s.gold ?? 0) < recharge.cost ? `Need ${money(recharge.cost)} gold` : `Buy another trip · ${money(recharge.cost)}`}
                        <em>{recharge.boughtLeft} more available today</em>
                    </button>
                ) : (
                    <button type="button" className="mine-prospect is-big" disabled>That&rsquo;s every trip today</button>
                )
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
                        <button type="button" className={`mine-prospect is-ghost${confirmStop ? " is-confirm" : ""}`}
                            onClick={onStop} disabled={busy || !armed}>
                            <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" />
                            {confirmStop ? "Stop anyway?" : "Stop & dig"}
                            <em>{confirmStop ? "nothing in the bag" : run.haul.length ? `keep ${run.haul.length}` : "empty bag"}</em>
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
