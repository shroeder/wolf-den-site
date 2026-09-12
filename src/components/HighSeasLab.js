"use client";

// ── THE HIGH SEAS · LAB ──────────────────────────────────────────────────────────────────────────────────────
// The new sailing loop, playable, so it can be argued with before any of it is built for real. Owner-gated,
// no database, no doubloons: a run lives in this component and dies with the tab. See highseas.js for the
// rules and for why the numbers are borrowed from the shipped battle engine rather than invented.
//
// Four screens, which are the four beats of the loop:
//   SEA        a sail on the horizon — the only thing you do is decide to look
//   GLASS      the telescope. What you can see depends on how close you dare get.
//   FIGHT      one volley a round, at one part of her, with one kind of shot
//   PRIZE      she went down, or she is yours
//
// ⚠️ PREFIX IS `seax-`. `hs-` already has twenty rules in globals.css, and a prefix collision is how the
// Forest shipped a screen where every rule silently belonged to fishing. Checked before a line was written.

import { useCallback, useMemo, useState } from "react";
import { GiSpyglass, GiCannon, GiSailboat, GiPirateFlag, GiWaveCrest } from "react-icons/gi";

import {
    RANGES, ZONES, boardable, openFight, rangeAt, sees, spoils, spot, volley, waterline,
} from "@/lib/marketplace/highseas.js";

// ⚠️ NO AMMUNITION PICKER. There was one — round, chain, grape, with their own art — and Luke killed it:
// "just unneeded complexity." He is right, and it took the accidental-sinking failure state with it. Where
// you aim is the only decision, so you cannot hole her unless you point at her hull on purpose.
const ZONE_ART = { hull: "/images/sailing/ammo/round.png", sails: "/images/sailing/ammo/chain.png", guns: "/images/sailing/ammo/grape.png" };

export default function HighSeasLab() {
    const [seed, setSeed] = useState(41);
    const [leg, setLeg] = useState(0);          // which sail of this voyage
    const [screen, setScreen] = useState("sea"); // sea | glass | fight | prize
    const [range, setRange] = useState(0);
    const [fight, setFight] = useState(null);
    const [zone, setZone] = useState("sails");
    const [note, setNote] = useState("");

    const ship = useMemo(() => spot(seed, leg), [seed, leg]);

    const nextSail = useCallback(() => {
        setLeg((n) => n + 1); setScreen("sea"); setRange(0); setFight(null); setNote(""); setZone("sails");
    }, []);

    const closer = useCallback(() => {
        const at = Math.min(RANGES.length - 1, range + 1);
        setRange(at);
        // She gets a look at you too. In the real thing this is her speed against yours.
        if (Math.random() < rangeAt(at).flee * 0.5) setNote("She has seen you — she is making sail.");
    }, [range]);

    const fire = useCallback(() => {
        setFight((f) => {
            const next = volley(f, { zone });
            if (next.over) setTimeout(() => setScreen("prize"), 420);
            return next;
        });
    }, [zone]);

    // ── SEA ──────────────────────────────────────────────────────────────────────────────────────────
    if (screen === "sea") {
        return (
            <Frame seed={seed} setSeed={setSeed} leg={leg}>
                <div className="seax-sea">
                    <span className="seax-horizon" aria-hidden="true" />
                    <GiWaveCrest className="seax-wave" aria-hidden="true" />
                    <b>A sail, off the larboard bow.</b>
                    <p>Hull down and too far to make out. The lookout is waiting on you.</p>
                    <button type="button" className="seax-go" onClick={() => setScreen("glass")}>
                        <GiSpyglass aria-hidden="true" /> Take the glass
                    </button>
                </div>
                <Style />
            </Frame>
        );
    }

    // ── THE TELESCOPE ────────────────────────────────────────────────────────────────────────────────
    if (screen === "glass") {
        const r = rangeAt(range);
        return (
            <Frame seed={seed} setSeed={setSeed} leg={leg}>
                <div className="seax-glass">
                    {/* The circle IS the screen — everything outside it is the tube. */}
                    <div className="seax-lens">
                        <div className="seax-lens-in">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ship.art} alt="" className="seax-ship" draggable="false" />
                            <span className="seax-lens-blur" aria-hidden="true" />
                        </div>
                        <span className="seax-cross" aria-hidden="true" />
                    </div>
                    <em className="seax-range">{r.label}</em>
                </div>

                <dl className="seax-read">
                    <Row label="Shape" value={sees(range, "kind") ? ship.label : "three masts, square rigged"} />
                    <Row label="Waterline" value={waterline(ship)} />
                    <Row label="Colours" value={sees(range, "name") ? ship.name : "—"} dim={!sees(range, "name")} />
                    {/* The two things the whole decision weighs against each other, side by side. */}
                    <Row label="Her hold" value={sees(range, "hold") ? `${ship.hold} crates · ${ship.cargo}` : "—"} dim={!sees(range, "hold")} good />
                    <Row label="Quarterdeck" value={sees(range, "captain") ? `${ship.captain} · infamy ${ship.infamy}` : "—"} dim={!sees(range, "captain")} good />
                </dl>

                {note ? <p className="seax-note">{note}</p> : null}

                <div className="seax-acts">
                    {range < RANGES.length - 1 ? (
                        <button type="button" className="seax-btn" onClick={closer}>Closer look</button>
                    ) : null}
                    <button type="button" className="seax-btn seax-ghost" onClick={nextSail}>Let her pass</button>
                    <button type="button" className="seax-btn seax-go" onClick={() => { setFight(openFight(ship)); setScreen("fight"); }}>
                        <GiCannon aria-hidden="true" /> Run her down
                    </button>
                </div>
                <Style />
            </Frame>
        );
    }

    // ── THE FIGHT ────────────────────────────────────────────────────────────────────────────────────
    if (screen === "fight" && fight) {
        const gunsLeft = fight.foe.guns.filter((g) => g > 0).length;
        const canBoard = boardable(fight);
        return (
            <Frame seed={seed} setSeed={setSeed} leg={leg}>
                <div className="seax-fight">
                    <div className="seax-target">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ship.art} alt="" className="seax-ship sm" draggable="false" />
                        <b>{ship.name}</b>
                    </div>
                    <Bar label="Hull" now={fight.foe.planks} max={ship.planks} tone="#ff9aa6" hint="she sinks" />
                    <Bar label="Rigging" now={fight.foe.sails} max={ship.sails} tone="#9fd8ff" hint="she runs" />
                    <Bar label="Gun deck" now={gunsLeft} max={ship.guns.length} tone="#ffd75e" hint="she shoots" />
                    <div className="seax-mine">
                        <span>Your hull</span>
                        <b style={{ color: fight.me.planks <= 4 ? "#ff9aa6" : "#cdd9c6" }}>{fight.me.planks}</b>
                    </div>
                </div>

                {/* WHERE YOU AIM IS THE WHOLE DECISION — the only control in the fight. */}
                <div className="seax-pick">
                    <span className="seax-pick-h">Lay the broadside at</span>
                    <div className="seax-row">
                        {ZONES.map((z) => (
                            <button key={z.id} type="button" className={`seax-chip${zone === z.id ? " on" : ""}${z.id === "hull" ? " is-kill" : ""}`}
                                onClick={() => setZone(z.id)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ZONE_ART[z.id]} alt="" draggable="false" />
                                <b>{z.label}</b>
                                <i>{z.blurb}</i>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="seax-acts">
                    <button type="button" className="seax-btn seax-go" onClick={fire} disabled={Boolean(fight.over)}>Fire</button>
                    {canBoard ? <button type="button" className="seax-btn seax-board" onClick={() => setScreen("prize")}>Board her</button> : null}
                </div>

                <ul className="seax-log">
                    {[...fight.log].slice(-5).reverse().map((l, i) => (
                        <li key={i} className={l.side === "foe" ? "is-foe" : undefined}>{l.text}</li>
                    ))}
                </ul>
                <Style />
            </Frame>
        );
    }

    // ── THE PRIZE ────────────────────────────────────────────────────────────────────────────────────
    const outcome = fight?.over === "lost" ? "lost" : fight?.over === "sunk" ? "sunk" : "boarded";
    const won = outcome !== "lost";
    const s = won ? spoils(ship, outcome) : null;
    return (
        <Frame seed={seed} setSeed={setSeed} leg={leg}>
            <div className={`seax-prize${outcome === "boarded" ? " is-board" : ""}`}>
                {outcome === "boarded" ? <GiPirateFlag className="seax-mark" aria-hidden="true" />
                    : outcome === "sunk" ? <GiSailboat className="seax-mark" aria-hidden="true" />
                        : <GiWaveCrest className="seax-mark" aria-hidden="true" />}
                <b>{won ? s.headline : "You break off"}</b>
                <p>{won ? s.blurb : "Too much water coming in. You put the helm over and let her go."}</p>
                {won ? (
                    <ul>{s.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                ) : null}
                <button type="button" className="seax-btn seax-go" onClick={nextSail}>Sail on</button>
            </div>
            <Style />
        </Frame>
    );
}

/* ── Small pieces. All of these are plain DOM so styled-jsx can reach them; a capitalised child would
   render completely unstyled, which is the trap in [[styled-jsx-landmines]]. ───────────────────────────── */
function Frame({ seed, setSeed, leg, children }) {
    return (
        <div className="seax">
            <div className="seax-top">
                <b>The High Seas</b>
                <span className="seax-lab">lab · nothing here is saved</span>
                <label className="seax-seed">
                    seed
                    <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
                </label>
                <span className="seax-leg">sail {leg + 1}</span>
            </div>
            {children}
        </div>
    );
}

function Row({ label, value, dim, good }) {
    return (
        <div className={`seax-drow${dim ? " is-dim" : ""}${good ? " is-good" : ""}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

function Bar({ label, now, max, tone, hint }) {
    const pct = Math.max(0, Math.min(100, (now / Math.max(1, max)) * 100));
    return (
        <div className="seax-bar" style={{ "--tone": tone }}>
            <span className="seax-bar-h"><b>{label}</b><i>{now} / {max} · {hint}</i></span>
            <span className="seax-bar-t"><span style={{ width: `${pct}%` }} /></span>
        </div>
    );
}

function Style() {
    return (
        <style jsx global>{`
            .seax { max-width: 460px; margin: 0 auto; color: #eae3d6; }
            .seax-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
            .seax-top b { font-size: 1.05rem; color: #ffd75e; }
            .seax-lab { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #8a9384;
                border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 2px 7px; }
            .seax-seed { margin-left: auto; font-size: 11px; color: #8a9384; display: flex; align-items: center; gap: 5px; }
            .seax-seed input { width: 64px; padding: 3px 6px; border-radius: 7px; background: rgba(255,255,255,.06);
                border: 1px solid rgba(255,255,255,.16); color: #eae3d6; font-size: 12px; }
            .seax-leg { font-size: 11px; color: #8a9384; }

            .seax-sea { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
                padding: 34px 16px 26px; border-radius: 16px; text-align: center; overflow: hidden;
                background: linear-gradient(180deg, #16283a, #0d1a26); border: 1px solid rgba(159,216,255,.18); }
            .seax-horizon { position: absolute; left: 0; right: 0; top: 46%; height: 1px; background: rgba(159,216,255,.35); }
            .seax-sea svg { width: 40px; height: 40px; color: #9fd8ff; opacity: .85; }
            .seax-sea b { position: relative; font-size: 1.1rem; color: #f2ead9; }
            .seax-sea p { position: relative; margin: 0; font-size: 13px; color: #9bb0c2; }

            .seax-glass { display: flex; flex-direction: column; align-items: center; gap: 6px; }
            .seax-lens { position: relative; width: 240px; height: 240px; border-radius: 50%; overflow: hidden;
                background: radial-gradient(circle at 50% 40%, #24405c, #0a1420 72%);
                border: 3px solid #6b5836; box-shadow: 0 0 0 7px #2a2118, 0 10px 26px rgba(0,0,0,.6); }
            .seax-lens-in { position: absolute; inset: 0; display: grid; place-items: center; }
            .seax-lens-blur { position: absolute; inset: 0; pointer-events: none;
                background: radial-gradient(circle, rgba(0,0,0,0) 52%, rgba(4,10,16,.92) 82%); }
            .seax-cross { position: absolute; left: 50%; top: 50%; width: 74%; height: 1px; margin-left: -37%;
                background: rgba(255,255,255,.18); }
            .seax-cross::after { content: ""; position: absolute; left: 50%; top: -60px; width: 1px; height: 120px;
                background: rgba(255,255,255,.18); }
            .seax-ship { width: 150px; height: 150px; object-fit: contain;
                filter: drop-shadow(0 6px 10px rgba(0,0,0,.6)); animation: seaxBob 4.2s ease-in-out infinite; }
            .seax-ship.sm { width: 92px; height: 92px; }
            @keyframes seaxBob { 0%,100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-7px) rotate(1.5deg); } }
            .seax-range { font-style: normal; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #9fd8ff; }

            .seax-read { margin: 10px 0 0; display: flex; flex-direction: column; gap: 4px; }
            .seax-drow { display: flex; justify-content: space-between; gap: 12px; padding: 7px 10px;
                border-radius: 9px; background: rgba(255,255,255,.04); font-size: 13px; }
            .seax-drow dt { color: #8a9384; margin: 0; }
            .seax-drow dd { margin: 0; text-align: right; color: #f2ead9; }
            .seax-drow.is-good { background: rgba(255,215,94,.08); border: 1px solid rgba(255,215,94,.22); }
            .seax-drow.is-good dd { color: #ffd75e; font-weight: 700; }
            .seax-drow.is-dim dd { color: #5f6a72; }
            .seax-note { margin: 8px 0 0; font-size: 12.5px; color: #ffb1c4; text-align: center; }

            .seax-acts { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
            .seax-btn { flex: 1 1 auto; padding: 11px 12px; border-radius: 11px; font-weight: 800; font-size: 14px;
                cursor: pointer; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #eae3d6; }
            .seax-btn:disabled { opacity: .45; cursor: default; }
            .seax-go, .seax-btn.seax-go { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                border: none; color: #2a1f07; background: linear-gradient(180deg, #ffe488, #f3b23a); box-shadow: 0 3px 0 #b07d1e; }
            .seax-go svg { width: 18px; height: 18px; }
            .seax-board { border: none; color: #0f1f14; background: linear-gradient(180deg, #a8e6b5, #5fbf7a); box-shadow: 0 3px 0 #3d8253; }
            .seax-ghost { color: #9bb0c2; }

            .seax-fight { display: flex; flex-direction: column; gap: 7px; padding: 12px; border-radius: 14px;
                background: linear-gradient(180deg, rgba(22,40,58,.85), rgba(13,26,38,.85)); border: 1px solid rgba(159,216,255,.16); }
            .seax-target { display: flex; align-items: center; gap: 10px; }
            .seax-target b { font-size: 1rem; color: #f2ead9; }
            .seax-bar { display: flex; flex-direction: column; gap: 3px; }
            .seax-bar-h { display: flex; justify-content: space-between; align-items: baseline; }
            .seax-bar-h b { font-size: 12px; color: var(--tone); }
            .seax-bar-h i { font-style: normal; font-size: 10.5px; color: #8a9384; }
            .seax-bar-t { display: block; height: 7px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
            .seax-bar-t span { display: block; height: 100%; border-radius: 4px; background: var(--tone);
                transition: width .35s cubic-bezier(.2,.9,.3,1); }
            .seax-mine { display: flex; justify-content: space-between; margin-top: 4px; padding-top: 7px;
                border-top: 1px solid rgba(255,255,255,.1); font-size: 13px; color: #8a9384; }

            .seax-pick { margin-top: 12px; }
            .seax-pick-h { display: block; margin: 8px 0 5px; font-size: 10.5px; letter-spacing: .14em;
                text-transform: uppercase; color: #8a9384; }
            .seax-row { display: flex; gap: 7px; }
            .seax-chip { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
                padding: 8px 5px; border-radius: 11px; cursor: pointer; text-align: center;
                border: 2px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); color: #eae3d6; }
            .seax-chip.on { border-color: #ffd75e; background: rgba(255,215,94,.12); }
            .seax-chip img { width: 30px; height: 30px; object-fit: contain; }
            .seax-chip b { font-size: 11.5px; }
            .seax-chip i { font-style: normal; font-size: 9.5px; line-height: 1.25; color: #8a9384; }
            .seax-chip.sm { padding: 7px 5px; }

            .seax-log { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
            .seax-log li { font-size: 12px; color: #cdd9c6; padding: 6px 9px; border-radius: 8px;
                background: rgba(255,255,255,.04); animation: seaxIn .3s ease-out both; }
            .seax-log li.is-foe { color: #ffb1c4; background: rgba(255,120,140,.08); }
            @keyframes seaxIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }

            .seax-prize { display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center;
                padding: 26px 16px; border-radius: 16px;
                background: linear-gradient(180deg, rgba(40,30,18,.9), rgba(18,14,10,.9)); border: 1px solid rgba(255,215,94,.25); }
            .seax-prize.is-board { border-color: rgba(95,191,122,.4); background: linear-gradient(180deg, rgba(20,44,30,.9), rgba(10,20,14,.9)); }
            .seax-mark { width: 42px; height: 42px; color: #ffd75e; }
            .seax-prize.is-board .seax-mark { color: #8fe0a6; }
            .seax-prize b { font-size: 1.25rem; color: #f6efdf; }
            .seax-prize p { margin: 0; font-size: 13px; color: #a99c88; }
            .seax-prize ul { list-style: none; margin: 6px 0 4px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
            .seax-prize li { font-size: 13px; font-weight: 700; color: #ffd75e;
                background: rgba(255,215,94,.1); border-radius: 8px; padding: 6px 12px; }
            .seax-prize.is-board li { color: #a8e6b5; background: rgba(95,191,122,.12); }

            @media (max-width: 380px) {
                .seax-lens { width: 200px; height: 200px; }
                .seax-ship { width: 124px; height: 124px; }
            }
        `}</style>
    );
}
