"use client";

import DepthsPanel from "@/components/mining/DepthsPanel";
import DescendTab from "@/components/mining/DescendTab";
import FaceTab from "@/components/mining/FaceTab";
import HeatGame from "@/components/mining/HeatGame";
import { SmeltModal, WrapModal } from "@/components/mining/MineOutcomes";
import SmeltTab from "@/components/mining/SmeltTab";
import { Img } from "@/components/mining/kit";
import { useMine } from "@/components/mining/useMine";
import MiningMinigame from "@/components/MiningMinigame";

// ── THE MINE (owner-gated) ───────────────────────────────────────────────────────────────────────────────────
// Three tabs, three different hands. DESCEND is push-your-luck: go deeper for better cards against worse odds,
// and climb out before the roof does. MINE is the timing bar — a fixed number of swings on the seam you carried
// up, ranked at the end. SMELT is the furnace, where you let the heat rise and pick your moment to pour.
//
// This file is the shell: the header, the tabs, and the modals that can open over any of them. Every server
// call lives in useMine, and each tab renders from props — so "what happens when you climb out" has exactly one
// answer instead of one per screen.

export default function MiningClient({ initial }) {
    const m = useMine(initial);
    const { state: s, node, msg, busy, tab, setTab, tripsLeft } = m;

    // Nothing to swing at, not down the tunnel, and trips to spend — i.e. the player CAN act but has no seam.
    // This is the "why can't I mine?" state, and it's what the nudge keys off.
    // hitsLeft, not pct — "is there a seam with swings on it" is the actual question, and reading it off a
    // percentage is how a spent seam ended up looking like a live one.
    const needsTrip = !s.run && !(node && node.pct > 0) && tripsLeft > 0;

    // A badge is a claim that something here is worth a look, so it must never render a 0 — "Descend (0)" on a
    // run you just started reads as an error, not as information. Depth only counts once you have actually
    // taken a step; before that the useful number is the trips you still have. Either way, zero means no badge.
    const descendBadge = (s.run ? s.run.depth : 0) || tripsLeft || 0;

    return (
        <section className="card mine-wrap">
            <div className="mine-top">
                <span className="mine-title"><Img src="/images/mining/pick-iron.png" className="mine-title-ico" fallback="" /> The Mine</span>
                <span className="mine-sub">owner preview · {tripsLeft}/{s.trips?.max ?? 3} trips today</span>
                {needsTrip && tab === "mine" ? (
                    <button type="button" className="mine-nudge" onClick={() => m.backToTunnel(true)}>
                        No seam yet — head down &rarr;
                    </button>
                ) : null}
            </div>

            {/* Three tabs — the same shape fishing and the forge use. */}
            <div className="mine-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "descend"} className={tab === "descend" ? "is-on" : ""} onClick={() => setTab("descend")}>
                    <Img src={s.lantern?.sprite} className="mine-tab-ico" fallback="" /> <span>Descend</span>
                    {/* How deep you are if you're down there, otherwise the trips you have left. */}
                    {descendBadge ? <span className="mine-tab-badge">{descendBadge}</span> : null}
                </button>
                <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-on" : ""} onClick={() => setTab("mine")}>
                    <Img src={s.pick?.sprite} className="mine-tab-ico" fallback="" /> <span>Mine</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === "smelt"} className={tab === "smelt" ? "is-on" : ""} onClick={() => setTab("smelt")}>
                    <Img src={s.furnace?.sprite} className="mine-tab-ico" fallback="" /> <span>Smelt</span>
                    {/* PARTS you can make, not ore you happen to own. A badge is a claim that something here
                        is worth doing; "2" over a tab that then says "Not enough" is a lie with a red circle
                        around it. Same mistake the Descend badge made when it rendered a 0. */}
                    {s.partsReady ? <span className="mine-tab-badge">{s.partsReady}</span> : null}
                </button>
            </div>

            {/* Sits under the tabs, not inside one: the affinity feeds all three verbs. */}
            <DepthsPanel depths={s.depths} />

            {tab === "descend" ? (
                <DescendTab
                    s={s} msg={msg} busy={busy} card={m.card}
                    startTrip={m.startTrip} buyTrip={m.buyTrip} goDeeper={m.goDeeper} surface={m.surface} upgrade={m.upgrade}
                />
            ) : tab === "mine" ? (
                <FaceTab
                    s={s} node={node} msg={msg} busy={busy} floats={m.floats} shake={m.shake}
                    tripsLeft={tripsLeft} backToTunnel={m.backToTunnel}
                    onBreak={m.openBreak} upgrade={m.upgrade}
                />
            ) : (
                <SmeltTab
                    s={s} msg={msg} busy={busy} smelting={m.smelting}
                    onSmelt={m.smelt} upgrade={m.upgrade}
                />
            )}

            {/* THE SWING — its own modal, its own juice. */}
            {m.breakNode ? (
                <MiningMinigame
                    node={m.breakNode}
                    pick={s.pick}
                    onSwing={m.onSwing}
                    // The minigame's own reveal IS the payoff screen — rank, every draw, the rare tickets your
                    // timing put in the bag. A second modal used to open on top of it built for the retired
                    // ore-ladder result, so it rendered "Ore +undefined · Gold +undefined" over the good one.
                    // Closing drops you at the tunnel, where the next seam comes from.
                    onDone={() => { m.closeBreak(); m.backToTunnel(false); }}
                />
            ) : null}

            {/* A collapse leaves a seam at the face too now, so both endings walk to the same room. */}
            {m.wrap ? (
                <WrapModal
                    wrap={m.wrap} tripsLeft={tripsLeft} maxTrips={s.trips?.max ?? 3}
                    onClose={() => { m.setWrap(null); setTab("mine"); }}
                    onToFace={() => { m.setWrap(null); setTab("mine"); }}
                    onAgain={() => { m.setWrap(null); if (tripsLeft > 0) m.startTrip(); }}
                />
            ) : null}

            {/* THE POUR — the heat climbs, you decide when to tip the crucible. */}
            {m.forge ? (
                <HeatGame stack={m.forge.stack} furnace={s.furnace} batches={m.forge.batches || 1}
                    onPour={(dists) => m.pour(dists, m.forge.stack, m.forge.batches || 1)} />
            ) : null}

            {m.smelting ? <SmeltModal smelting={m.smelting} onClose={() => m.setSmelting(null)} /> : null}

            <style jsx global>{`
                .mine-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
                .mine-title { font-size: 1.15rem; font-weight: 900; color: #ffe28a; }
                .mine-sub { font-size: 0.78rem; color: #9aa2ab; }

                .mine-face { position: relative; width: 100%; aspect-ratio: 3 / 2; border-radius: 16px; overflow: hidden;
                    border: 1px solid rgba(255,215,94,0.22); display: grid; place-items: center; }
                .mine-face-bg { position: absolute; inset: 0; background: #150f0a center/cover no-repeat url("/images/mining/cave-bg.png"); }
                .mine-face-bg::after { content: ""; position: absolute; inset: 0; background: radial-gradient(60% 55% at 50% 45%, transparent, rgba(0,0,0,0.62)); }
                .mine-rock { position: relative; width: 42%; max-width: 190px; aspect-ratio: 1; display: grid; place-items: center;
                    filter: drop-shadow(0 0 26px var(--ore)); }
                .mine-rock-img { width: 100%; height: 100%; object-fit: contain; }
                @keyframes mineHit { 0% { transform: none; } 40% { transform: translate(-3px, 2px) scale(0.97); } 100% { transform: none; } }
                .mine-seam-head { position: absolute; top: 10px; left: 0; right: 0; text-align: center; font-size: 0.92rem; text-shadow: 0 2px 6px #000; }
                .mine-seam-head .muted { display: block; font-size: 11px; }
                .mine-hpbar { position: absolute; left: 12%; right: 12%; bottom: 30px; height: 8px; border-radius: 999px; background: rgba(0,0,0,0.65); overflow: hidden; }
                .mine-hpbar > span { display: block; height: 100%; transition: width .2s ease; }
                .mine-hpnum { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-size: 11.5px; color: #cdd3d8; text-shadow: 0 2px 6px #000; }
                .mine-float { position: absolute; left: 50%; top: 38%; transform: translate(-50%,-50%); font-weight: 900; pointer-events: none;
                    animation: mineFloat .9s ease-out forwards; color: #ffe28a; text-shadow: 0 2px 8px #000; }
                .mine-float.is-pixel { color: #ffd75e; font-size: 1.7rem; } .mine-float.is-perfect { color: #8fe3ff; font-size: 1.45rem; }
                .mine-float.is-great { color: #8fe39a; font-size: 1.25rem; } .mine-float.is-miss { color: #9aa2ab; font-size: 1rem; }
                @keyframes mineFloat { to { transform: translate(-50%,-190%); opacity: 0; } }
                .mine-empty { position: relative; text-align: center; padding: 18px; }
                .mine-empty-pick { width: 88px; height: 88px; object-fit: contain; opacity: 0.9; }
                .mine-empty p { margin: 8px 0 2px; font-weight: 700; color: #e7dcc8; text-shadow: 0 2px 6px #000; }
                .mine-empty .muted { font-size: 12px; text-shadow: 0 2px 6px #000; }
                .mine-msg { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); background: rgba(0,0,0,0.78); color: #ffcf6a;
                    font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px; }

                .mine-prospect { width: 100%; margin-top: 12px; padding: 14px; border-radius: 13px; border: none; font-weight: 900; font-size: 1.06rem;
                    color: #2a1400; cursor: pointer; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
                .mine-prospect:disabled { filter: saturate(0.7) brightness(0.9); cursor: default; }
                .mine-prospect.is-ghost { margin-top: 8px; padding: 9px; font-size: 0.84rem; font-weight: 700; color: #cdb894;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); box-shadow: none; }

                .mine-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
                /* min-width:0 is load-bearing. Flex items default to min-width:auto, so these buttons refused to
                   shrink below their own content (icon + label + badge) and the third one ran off the card.
                   The badge is positioned OUT of the flow for the same reason — it must never add width. */
                .mine-tabs button { position: relative; flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center;
                    justify-content: center; gap: 6px; padding: 10px 8px; border-radius: 12px; font-weight: 800;
                    font-size: 0.92rem; cursor: pointer; color: #cdd3d8; overflow: hidden;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .mine-tabs button > span:not(.mine-tab-badge) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .mine-tabs button.is-on { color: #2a1400; background: linear-gradient(180deg, #ffe08a, #ffb020); border-color: transparent; box-shadow: 0 3px 0 #b47a12; }
                .mine-tab-ico { width: 22px; height: 22px; object-fit: contain; flex: 0 0 auto; }
                .mine-tab-badge { position: absolute; top: 3px; right: 4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 999px;
                    background: #e0483d; color: #fff; font-size: 10px; font-weight: 900; display: grid; place-items: center;
                    box-shadow: 0 0 0 2px rgba(20,14,8,0.85); }
                .mine-pickart.is-lantern { background: radial-gradient(circle at 50% 35%, rgba(111,208,255,0.2), rgba(111,208,255,0.04)); border-color: rgba(111,208,255,0.4); }
                .mine-pickart.is-furnace { background: radial-gradient(circle at 50% 35%, rgba(255,120,32,0.24), rgba(255,120,32,0.05)); border-color: rgba(255,120,32,0.4); }
                .mine-face.is-descend, .mine-face.is-smelt { aspect-ratio: 3 / 2; }
                .mine-face-bg.is-descend { background-image: url("/images/mining/survey-bg.png"); }
                .mine-face-bg.is-smelt { background-image: url("/images/mining/smelt-bg.png"); }
                /* Survey marks — chalk rings on the wall, coloured once you've sounded them. */
                .mine-mark { position: absolute; transform: translate(-50%,-50%); width: 54px; height: 54px; padding: 0; cursor: pointer;
                    border-radius: 50%; display: grid; place-items: center;
                    border: 2px dashed rgba(255,255,255,0.45); background: rgba(0,0,0,0.42); color: #e7dcc8;
                    transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
                @media (hover: hover) { .mine-mark:hover { transform: translate(-50%,-50%) scale(1.08); } }
                .mine-mark.is-read { border-style: solid; border-color: var(--sig, #ffd75e); background: rgba(0,0,0,0.55);
                    box-shadow: 0 0 16px -2px var(--sig, #ffd75e); }
                .mine-mark.is-sel { box-shadow: 0 0 0 3px var(--sig, #ffd75e), 0 0 22px -2px var(--sig, #ffd75e); }
                /* THE TEST-STRIKE. The mark kicks, a shockwave rings out, and the reading lands after it —
                   the same "something happened" beat the Kitchen's minigame gives a cook. */
                .mine-mark.is-sounding { animation: mineKnock .28s ease-out 2; border-color: #ffe28a; }
                .mine-mark.is-sounding::after { content: ""; position: absolute; inset: -6px; border-radius: 50%;
                    border: 2px solid rgba(255,226,138,0.85); animation: mineEcho .62s ease-out forwards; pointer-events: none; }
                @keyframes mineKnock { 0% { transform: translate(-50%,-50%) scale(1); } 45% { transform: translate(-50%,-50%) scale(0.9); } 100% { transform: translate(-50%,-50%) scale(1); } }
                @keyframes mineEcho { from { transform: scale(0.7); opacity: 0.95; } to { transform: scale(2.6); opacity: 0; } }
                .mine-pips-strike { display: inline-flex; gap: 3px; }
                .mine-pips-strike i { font-style: normal; font-size: 13px; opacity: 0.22; filter: grayscale(1); }
                .mine-pips-strike i.on { opacity: 1; filter: none; }
                .mine-hud { display: flex; align-items: center; justify-content: center; gap: 8px; }
                .mine-manifest { margin-bottom: 10px; padding: 10px 12px; border-radius: 12px;
                    background: rgba(255,215,94,0.07); border: 1px solid rgba(255,215,94,0.28); }
                .mine-manifest-lab { display: block; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.06em;
                    text-transform: uppercase; color: #ffd75e; margin-bottom: 7px; }
                .mine-manifest-list { display: flex; gap: 7px; flex-wrap: wrap; }
                .mine-manifest-item { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px;
                    background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); font-size: 12px; }
                .mine-manifest-ore { width: 20px; height: 20px; object-fit: contain; }
                .mine-manifest-item em { font-style: normal; color: #cdd3d8; font-weight: 800; }
                .mine-manifest-item.is-unknown { border-color: rgba(255,215,94,0.65); background: rgba(255,215,94,0.14); animation: mineBurn 1.6s ease-in-out infinite alternate; }
                .mine-manifest-q { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%;
                    background: rgba(255,215,94,0.25); color: #ffe28a; font-weight: 900; font-size: 12px; }
                .mine-motherlode-tag { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 2;
                    padding: 4px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 900; color: #2a1400;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 0 18px rgba(255,190,60,0.7); }
                .mine-face.is-motherlode { border-color: rgba(255,215,94,0.7); box-shadow: inset 0 0 60px -10px rgba(255,180,40,0.5); }
                .mine-streak { color: #ffb020; font-weight: 800; }
                .mine-manifest-note { display: block; margin-top: 7px; font-size: 11px; color: #9aa2ab; }
                .mine-legend { display: flex; gap: 6px; margin-top: 10px; }
                .mine-legend-item { flex: 1; display: flex; flex-direction: column; gap: 1px; padding: 7px 8px; border-radius: 10px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); min-width: 0; }
                .mine-legend-item i { width: 100%; height: 3px; border-radius: 999px; }
                .mine-legend-item b { font-size: 11.5px; margin-top: 3px; }
                .mine-legend-item em { font-size: 10.5px; font-style: normal; color: #9aa2ab; }
                .mine-reveal-row { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
                .mine-reveal-spot { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 6px; border-radius: 10px;
                    background: rgba(255,255,255,0.04); border: 1px solid transparent; min-width: 58px; }
                .mine-reveal-spot.is-picked { border-color: #ffd75e; background: rgba(255,215,94,0.14); }
                .mine-reveal-ore { width: 32px; height: 32px; object-fit: contain; }
                /* Forge parts + slag bonuses draw their real sprite now, so the reveal spot needs the same
                   art slot the ore already had. */
                .mine-reveal-art { width: 38px; height: 38px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
                .mine-slag-row { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
                .mine-slag-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
                .mine-part-ico { width: 15px; height: 15px; object-fit: contain; vertical-align: -3px; margin-right: 3px; }
                /* ── SMELT REVEAL JUICE ────────────────────────────────────────────────────────────────
                   Everything the pour earned, dealt out rather than printed. */
                .mine-reveal-spot.is-dealt, .mine-slag-item.is-dealt { animation: mineDeal .42s cubic-bezier(.2,1.5,.35,1) both; }
                @keyframes mineDeal { 0% { opacity: 0; transform: translateY(14px) scale(.72); } 100% { opacity: 1; transform: none; } }
                .mine-modal-card.is-hot { border-color: rgba(255,215,94,0.75); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 60px rgba(255,180,50,0.35); }
                .mine-slag-embers { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; overflow: hidden; z-index: 4; }
                .mine-slag-embers span { position: absolute; width: 6px; height: 6px; border-radius: 50%;
                    animation: mineEmberOut 1.35s cubic-bezier(.14,.7,.28,1) both; }
                @keyframes mineEmberOut { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); }
                    100% { opacity: 0; transform: rotate(var(--a)) translateY(-150px) scale(.25); } }
                /* The five pours, graded. A run carried by one great pour should not look like five mediocre ones. */
                .mine-pours { display: flex; justify-content: center; gap: 6px; margin: 10px 0 2px; }
                .mine-pour { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 46px; }
                .mine-pour i { display: block; width: 100%; height: 5px; border-radius: 999px; background: #4a4a4a; }
                .mine-pour em { font-size: 8px; font-style: normal; font-weight: 800; letter-spacing: .03em; color: #8a8f96; }
                .mine-pour.is-pixel i { background: #ff9ec4; box-shadow: 0 0 9px #ff9ec4; } .mine-pour.is-pixel em { color: #ff9ec4; }
                .mine-pour.is-perfect i { background: #ffd75e; box-shadow: 0 0 7px #ffd75e; } .mine-pour.is-perfect em { color: #ffd75e; }
                .mine-pour.is-great i { background: #7ec8ff; } .mine-pour.is-great em { color: #7ec8ff; }
                .mine-pour.is-good i { background: #9aa0a6; }
                .mine-pour.is-miss i { background: #ff8f9a; } .mine-pour.is-miss em { color: #ff8f9a; }
                .mine-extra-note { margin: 8px 0 0; font-size: 11.5px; font-weight: 800; color: #7cffb2; }
                .mine-reveal-spot em { font-size: 10.5px; font-style: normal; }
                .mine-reveal-spot b { font-size: 9.5px; color: #ffd75e; text-transform: uppercase; letter-spacing: 0.04em; }
                .mine-nudge { flex-basis: 100%; margin-top: 6px; padding: 8px 12px; border-radius: 10px; cursor: pointer;
                    font-size: 12.5px; font-weight: 800; text-align: left; color: #ffe28a;
                    background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.45); }
                .mine-empty .mine-prospect { width: auto; padding: 11px 20px; margin-top: 12px; }
                .mine-depth { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 2;
                    font-size: 11px; font-weight: 900; letter-spacing: .12em; color: #ffe28a; text-shadow: 0 2px 6px #000; }
                .mine-card { position: relative; z-index: 2; width: 78%; max-width: 300px; text-align: center; padding: 14px;
                    border-radius: 14px; background: rgba(8,5,3,0.82); border: 1px solid rgba(255,215,94,0.4);
                    animation: minePop .3s cubic-bezier(.2,1.3,.4,1) both; }
                .mine-card.is-idle { border-style: dashed; border-color: rgba(255,255,255,0.16); background: rgba(8,5,3,0.5); }
                @keyframes minePop { from { opacity: 0; transform: translateY(10px) scale(.94); } to { opacity: 1; transform: none; } }
                .mine-card-lab { display: block; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #9aa2ab; margin-bottom: 5px; }
                .mine-card b { display: block; font-size: 1.02rem; }
                .mine-card em { display: block; font-style: normal; font-size: 11.5px; color: #b9a98f; margin-top: 3px; }
                .mine-card-art { width: 54px; height: 54px; object-fit: contain; margin: 0 auto 4px; display: block; }
                .mine-haul { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 10px; padding: 9px 11px;
                    border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); min-height: 46px; }
                .mine-haul-chip { display: inline-flex; align-items: center; gap: 3px; padding: 3px 7px; border-radius: 999px;
                    background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; }
                .mine-haul-art { width: 20px; height: 20px; object-fit: contain; }
                .mine-haul-chip em { font-style: normal; color: #cdd3d8; font-weight: 800; }
                .mine-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
                .mine-choice .mine-prospect { margin-top: 0; }
                .mine-choice .mine-prospect em { display: block; font-style: normal; font-size: 10.5px; font-weight: 700; opacity: .8; }
                .mine-prospect.is-big { padding: 16px; font-size: 1.1rem; }
                .mine-prospect.is-big em { display: block; font-style: normal; font-size: 11px; font-weight: 700; opacity: .78; margin-top: 2px; }
                .mine-reveal-spot.is-item { flex-basis: 100%; border-color: var(--rar); background: color-mix(in srgb, var(--rar) 12%, rgba(0,0,0,0.25));
                    box-shadow: 0 0 24px -6px var(--rar); padding: 11px; }
                .mine-item-art { width: 66px; height: 66px; display: grid; place-items: center; }
                .mine-item-art .item-art-img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 10px var(--rar)); }
                .mine-item-art svg { width: 48px; height: 48px; color: var(--rar); }
                .mine-item-tag { font-style: normal; font-size: 9px; font-weight: 900; letter-spacing: .1em; color: var(--rar); }
                .mine-item-stats { font-style: normal; font-size: 10.5px; color: #e7dcc8; }
                .mine-upg-ico { width: 22px; height: 22px; object-fit: contain; }
                .mine-btn-ico { width: 22px; height: 22px; object-fit: contain; vertical-align: -5px; margin-right: 5px; }
                .mine-title-ico { width: 24px; height: 24px; object-fit: contain; vertical-align: -4px; margin-right: 4px; }
                .mine-reveal-spot em { line-height: 1.25; }
                .mine-face-cta { position: relative; text-align: center; padding: 16px; }
                .mine-face-cta p { margin: 8px 0 12px; font-weight: 700; color: #e7dcc8; text-shadow: 0 2px 6px #000; }
                .mine-face-cta .mine-prospect { margin-top: 0; width: auto; padding: 12px 22px; }
                .mine-mark-q { font-size: 22px; font-weight: 900; opacity: 0.8; }
                .mine-mark-ore { width: 34px; height: 34px; object-fit: contain; }
                .mine-mark-n { position: absolute; right: -3px; bottom: -3px; width: 18px; height: 18px; border-radius: 50%;
                    display: grid; place-items: center; font-size: 10px; font-weight: 900; color: #2a1400; background: #ffd75e; }
                .mine-hud { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-size: 12px;
                    color: #e7dcc8; text-shadow: 0 2px 6px #000; }
                .mine-hud b { color: #ffe28a; }
                .mine-readout { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; border-radius: 12px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .mine-readout-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-readout-body em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                /* The furnace, standing in its room. */
                .mine-forge { position: relative; width: 46%; max-width: 210px; aspect-ratio: 1; display: grid; place-items: center; }
                .mine-forge-img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 30px rgba(255,140,40,0.65)); }
                .mine-forge-glow { position: absolute; width: 70%; height: 70%; border-radius: 50%; pointer-events: none;
                    background: radial-gradient(circle, rgba(255,150,40,0.5), transparent 65%); animation: mineBurn 2.2s ease-in-out infinite alternate; }
                .mine-descend { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,215,94,0.28); }
                .mine-survey-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
                .mine-survey-head b { font-size: 1rem; color: #ffe28a; }
                .mine-survey-head .muted { margin-left: auto; font-size: 11.5px; }
                .mine-survey-intro { margin: 0 0 10px; font-size: 12.5px; color: #cdd3d8; line-height: 1.5; }
                .mine-spots { display: grid; gap: 7px; }
                .mine-spot { display: flex; align-items: center; gap: 10px; padding: 8px 9px; border-radius: 10px;
                    background: rgba(255,255,255,0.04); border: 1px solid transparent; }
                .mine-spot.is-read { border-color: var(--sig); background: color-mix(in srgb, var(--sig) 12%, transparent); }
                .mine-spot-n { width: 24px; height: 24px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
                    background: rgba(255,255,255,0.1); font-size: 11px; font-weight: 900; }
                .mine-spot-read { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-spot-read b { font-size: 0.86rem; }
                .mine-spot-read em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-spot-acts { display: flex; gap: 6px; flex: 0 0 auto; }
                .mine-spot-probe, .mine-spot-dig { padding: 6px 10px; border-radius: 9px; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
                .mine-spot-probe { border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: #cdd3d8; }
                .mine-spot-dig { border: none; color: #2a1400; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 2px 0 #b47a12; }
                .mine-spot-probe:disabled, .mine-spot-dig:disabled { opacity: 0.4; cursor: default; }
                .mine-panel { margin-top: 14px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-panel-head { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #ffd75e; margin-bottom: 9px; }
                .mine-pickhead { display: flex; align-items: center; gap: 12px; padding-bottom: 11px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); }
                .mine-pickart { width: 66px; height: 66px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 14px;
                    background: radial-gradient(circle at 50% 35%, rgba(255,215,94,0.20), rgba(255,215,94,0.04)); border: 1px solid rgba(255,215,94,0.28); }
                .mine-pickart-img { width: 82%; height: 82%; object-fit: contain; }
                .mine-pickbody { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
                .mine-pickbody b { font-size: 1.02rem; color: #ffe28a; }
                .mine-pickbody em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                .mine-pickbar { display: block; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.09); overflow: hidden; margin-top: 3px; }
                .mine-pickbar > span { display: block; height: 100%; background: linear-gradient(90deg, #ffb020, #ffe08a); }
                .mine-track { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,0.06); }
                .mine-track-ico { font-size: 22px; }
                .mine-track-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
                .mine-track-body em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                .mine-pips { display: flex; gap: 3px; margin-top: 3px; }
                .mine-pips i { width: 11px; height: 5px; border-radius: 2px; background: rgba(255,255,255,0.13); }
                .mine-pips i.on { background: linear-gradient(90deg, #ffb020, #ffe08a); }
                .mine-buy { padding: 8px 14px; border-radius: 10px; border: none; font-weight: 900; cursor: pointer; color: #2a1400;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 2px 0 #b47a12; }
                .mine-buy:disabled { filter: grayscale(0.7) brightness(0.8); cursor: default; }

                .mine-stash-rows { display: grid; gap: 7px; }
                .mine-stash-row { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; background: rgba(255,255,255,0.04); }
                .mine-stash-img { width: 34px; height: 34px; object-fit: contain; flex: 0 0 auto; }
                .mine-stash-name { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-stash-name em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-stash-qty { font-variant-numeric: tabular-nums; }
                .mine-smelt { padding: 7px 12px; border-radius: 9px; border: 1px solid rgba(255,120,32,0.55); background: rgba(255,120,32,0.16);
                    color: #ffcf9a; font-weight: 800; font-size: 12px; cursor: pointer; white-space: nowrap; }
                .mine-smelt:disabled { opacity: 0.32; cursor: default; }
                /* One-and-ten, stacked on a phone so neither gets clipped and the row keeps its shape. */
                .mine-smelt-btns { display: grid; gap: 5px; flex: 0 0 auto; }
                /* The bulk button is the same button, quieter — the single smelt stays the one that pulses. */
                .mine-smelt.is-bulk { padding: 6px 12px; font-size: 11.5px; border-color: rgba(255,120,32,0.32);
                    background: rgba(255,120,32,0.08); color: #e8b98f; }
                .mine-ladder { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-ladder-intro { margin: 0 0 10px; font-size: 12.5px; color: #cdd3d8; line-height: 1.5; }
                .mine-rung { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; margin-bottom: 6px;
                    background: rgba(255,255,255,0.04); border: 1px solid transparent; }
                .mine-rung.is-here { border-color: rgba(255,215,94,0.6); background: rgba(255,215,94,0.1); }
                .mine-rung-n { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
                    background: rgba(255,255,255,0.1); font-size: 11px; font-weight: 900; }
                .mine-rung.is-flawless .mine-rung-n { background: #ffd75e; color: #2a1400; }
                .mine-rung.is-clean .mine-rung-n { background: #8fe3ff; color: #10222a; }
                .mine-rung.is-solid .mine-rung-n { background: #8fe39a; color: #12261a; }
                .mine-rung-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-rung-copy b { font-size: 0.9rem; }
                .mine-rung-copy em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-rung-pay { display: flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
                .mine-rung-ore { width: 24px; height: 24px; object-fit: contain; }
                /* THE BAG PANEL — one row per rank: what it's called, what it takes, what it buys. */
                /* WHAT THE ROOF TOOK — the vein you'd found against the Coal you crawled out with. */
                .mine-lost { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px;
                    margin-top: 12px; padding: 11px 10px; border-radius: 12px;
                    background: rgba(255,143,154,0.07); border: 1px solid rgba(255,143,154,0.32); }
                .mine-lost-was, .mine-lost-got { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
                .mine-lost-was { opacity: .5; }
                .mine-lost-was .mine-lost-art { filter: grayscale(0.7); }
                .mine-lost-art { width: 34px; height: 34px; object-fit: contain; }
                .mine-lost em { font-style: normal; font-size: 11.5px; font-weight: 800; line-height: 1.15; text-align: center; }
                .mine-lost i { font-style: normal; font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: #8b8f96; }
                .mine-lost-arrow { color: #ff8f9a; font-size: 17px; }
                .mine-rank-row { display: grid; grid-template-columns: 1fr auto 52px; align-items: center; gap: 10px;
                    padding: 8px 10px; border-radius: 10px; margin-top: 6px;
                    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-rank-name { display: flex; flex-direction: column; min-width: 0; }
                .mine-rank-name b { color: var(--rk); font-size: 13px; letter-spacing: .04em; }
                .mine-rank-name em { font-style: normal; font-size: 10.5px; color: #8b8f96; }
                .mine-rank-draws { font-size: 11px; color: #b9a98f; white-space: nowrap; }
                .mine-rank-bonus { font-size: 11.5px; font-weight: 800; color: var(--rk); text-align: right; }
                .mine-rank-draws b { color: #f2e6e6; font-size: 15px; }
                .mine-rank-rich { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
                .mine-rank-rich > span { display: block; height: 100%; border-radius: 999px;
                    background: linear-gradient(90deg, var(--rk), #fff8); }
                /* What CAN come out — shown as real sprites, never named. The tease is the point. */
                /* THE SMELT ROW. It read as a settings list; it is the payoff screen for everything you dug. */
                .mine-smeltable { margin-left: 8px; padding: 2px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 900;
                    letter-spacing: .05em; text-transform: uppercase; color: #2a1400;
                    background: linear-gradient(180deg, #ffd97a, #f0b93f); box-shadow: 0 0 14px -3px #f0b93f; }
                .mine-stash-row { transition: border-color .15s ease, background .15s ease; }
                .mine-stash-row:has(.mine-smelt.is-ready) { border-color: rgba(255,160,70,0.45); background: rgba(255,140,50,0.06); }
                .mine-smelt.is-ready { animation: mineSmeltReady 2.4s ease-in-out infinite; }
                @keyframes mineSmeltReady { 0%,100% { box-shadow: 0 0 0 rgba(255,150,60,0); } 50% { box-shadow: 0 0 16px -2px rgba(255,150,60,0.75); } }
                .mine-smelt b { font-size: 1.02em; }
                /* The paid-trip CTA — warm, not the usual gold, so it reads as a purchase. */
                .mine-prospect.is-buy { background: linear-gradient(180deg, #ffb45e, #e8892c); color: #2a1400;
                    box-shadow: 0 4px 16px rgba(232,137,44,0.35); }
                .mine-prospect.is-buy:disabled { filter: grayscale(.5) brightness(.85); }
                /* The smelt minigame's bar, steps, key and juice now live INSIDE HeatGame.js, in its own
                   <style> block, the way CookingMinigame carries its own. They were duplicated here and
                   the two copies had already drifted — different band colours, a marker with different
                   glow, an .is-hit shake nothing sets any more, and .is-hot/.is-burnt step classes from
                   band names that stopped existing. Whichever cascaded last won, which is not a thing
                   worth leaving to chance. One copy, next to the markup that uses it. */
                .mine-bag-how { margin: 12px 0 0; font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
                .mine-bag-how b { color: #ffd75e; }
                .mine-bag-kinds { display: flex; align-items: center; gap: 7px; margin-top: 11px;
                    padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); }
                .mine-bag-kinds .muted { font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; margin-right: 2px; }
                .mine-bag-ico { width: 24px; height: 24px; object-fit: contain; }
                .mine-ladder-foot { margin: 8px 0 0; font-size: 11.5px; color: #9aa2ab; }
                .mine-rung-won { margin: 0 0 10px; padding: 8px; border-radius: 10px; background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.4); }
                .mine-rung-won b { display: block; color: #ffe28a; }
                .mine-rung-won em { font-size: 11px; font-style: normal; color: #cdb894; }
                .mine-hint { font-size: 12px; color: #9aa2ab; margin: 10px 0 0; }

                .mine-modal { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto;
                    background: rgba(6,4,10,0.82); padding: max(16px, env(safe-area-inset-top)) 18px max(16px, env(safe-area-inset-bottom)); }
                .mine-modal > * { margin: auto; }
                /* position/overflow are for the pour's ember burst, which is absolutely placed inside it. */
                .mine-modal-card { position: relative; overflow: hidden; width: 100%; max-width: 340px; text-align: center; padding: 22px; border-radius: 18px;
                    background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.5); }
                .mine-modal-img { width: 96px; height: 96px; object-fit: contain; }
                .mine-modal-card h3 { margin: 8px 0 10px; }
                .mine-modal-rows { display: flex; justify-content: center; gap: 16px; }
                .mine-modal-rows span { display: flex; flex-direction: column; font-size: 11px; color: #9aa2ab; }
                .mine-modal-rows b { font-size: 1.08rem; color: #ffe28a; }

                /* The smelt: ore slides into the furnace mouth, the furnace flares, the parts are announced. */
                .mine-bag-how { margin: 12px 0 0; font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
                .mine-bag-how b { color: #ffd75e; }
                .mine-bag-kinds { display: flex; align-items: center; gap: 7px; margin-top: 11px;
                    padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); }
                .mine-bag-kinds .muted { font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; margin-right: 2px; }
                .mine-bag-ico { width: 24px; height: 24px; object-fit: contain; }
                .mine-ladder-foot { margin: 8px 0 0; font-size: 11.5px; color: #9aa2ab; }
                .mine-rung-won { margin: 0 0 10px; padding: 8px; border-radius: 10px; background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.4); }
                .mine-rung-won b { display: block; color: #ffe28a; }
                .mine-rung-won em { font-size: 11px; font-style: normal; color: #cdb894; }
                .mine-hint { font-size: 12px; color: #9aa2ab; margin: 10px 0 0; }

                .mine-modal { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto;
                    background: rgba(6,4,10,0.82); padding: max(16px, env(safe-area-inset-top)) 18px max(16px, env(safe-area-inset-bottom)); }
                .mine-modal > * { margin: auto; }
                .mine-modal-card { width: 100%; max-width: 340px; text-align: center; padding: 22px; border-radius: 18px;
                    background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.5); }
                .mine-modal-img { width: 96px; height: 96px; object-fit: contain; }
                .mine-modal-card h3 { margin: 8px 0 10px; }
                .mine-modal-rows { display: flex; justify-content: center; gap: 16px; }
                .mine-modal-rows span { display: flex; flex-direction: column; font-size: 11px; color: #9aa2ab; }
                .mine-modal-rows b { font-size: 1.08rem; color: #ffe28a; }

                /* The smelt: ore slides into the furnace mouth, the furnace flares, the parts are announced. */
                .mine-band { padding: 7px 10px; border-radius: 10px; font-weight: 900; font-size: 0.9rem; margin-bottom: 8px; }
                .mine-band em { display: block; font-style: normal; font-weight: 600; font-size: 11px; opacity: .85; }
                /* Band keys are pixel/perfect/great/good/miss — the shared timing bands. The old
                   hot/warm/cold/burnt classes stopped matching anything when the smelt moved onto them, so
                   every verdict except PERFECT rendered as unstyled text on no background. Same palette as
                   the kitchen and the anvil, so a FLAWLESS reads the same colour everywhere in the game. */
                .mine-band.is-pixel { color: #ff9ec4; background: rgba(255,158,196,0.16); box-shadow: 0 0 22px rgba(255,158,196,0.28); }
                .mine-band.is-perfect { color: #ffd75e; background: rgba(255,215,94,0.15); }
                .mine-band.is-great { color: #7ec8ff; background: rgba(126,200,255,0.14); }
                .mine-band.is-good { color: #cdd3d8; background: rgba(255,255,255,0.06); }
                .mine-band.is-miss { color: #ff8f9a; background: rgba(255,143,154,0.14); }
                .mine-smelt-stage { position: relative; height: 140px; display: grid; place-items: center; }
                .mine-smelt-furnace { width: 120px; height: 120px; object-fit: contain; }
                .mine-smelt-ore { position: absolute; width: 48px; height: 48px; object-fit: contain; left: 50%; top: 0;
                    transform: translate(-50%, 0); transition: transform .45s cubic-bezier(.4,0,.7,1), opacity .25s ease; }
                .mine-smelt-stage.is-burn .mine-smelt-ore, .mine-smelt-stage.is-done .mine-smelt-ore { transform: translate(-50%, 62px) scale(0.55); opacity: 0; }
                .mine-smelt-glow { position: absolute; width: 120px; height: 120px; border-radius: 50%; pointer-events: none; opacity: 0;
                    background: radial-gradient(circle, rgba(255,150,40,0.85), transparent 65%); transition: opacity .3s ease; }
                .mine-smelt-stage.is-burn .mine-smelt-glow { opacity: 1; animation: mineBurn .5s ease-in-out infinite alternate; }
                .mine-smelt-stage.is-done .mine-smelt-glow { opacity: 0.45; }
                @keyframes mineBurn { from { transform: scale(0.9); } to { transform: scale(1.15); } }
            `}</style>
        </section>
    );
}
