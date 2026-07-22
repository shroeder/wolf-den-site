"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MerchantScene from "@/components/MerchantScene";

// How long the tailwind gust lasts, in ms. ONE source of truth: the boat's `sailGust` CSS animation, the
// passing-traffic speed-up, and the FX overlay are all timed to this so the whole moment ends together.
const GUST_MS = 3000;

// Where the crew (hero + pet) plant their feet, per boat FORM (tier), as a `bottom` % of the hull art. Open
// boats (tier 1–2) have a low floor so the crew must sit LOW or they hover in the open hull; taller ships seat
// higher on their deck. Tiers not listed fall back to the default in CSS. Tune per boat as forms are seen.
const CREW_BOTTOM = { 1: 12, 2: 13 };

// Sailing: dispatch a ONE-WAY voyage to the island, then play the excavation dig minigame — a grid of dirt
// with an Augur "hot/cold" reading, a stamina budget, and a buried treasure-chest fragment to uncover. Win or
// fail, you land back at port and can set sail again. Server is authoritative for digs + the fragment reward.

// --- juice: tiny Web-Audio SFX (no asset files) --------------------------------------------------------
let _ac = null;
function audioCtx() {
    if (typeof window === "undefined") return null;
    try {
        if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
        if (_ac.state === "suspended") _ac.resume().catch(() => {});
        return _ac;
    } catch { return null; }
}
function tone(freq, start, dur, { type = "sine", gain = 0.15 } = {}) {
    const c = audioCtx(); if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
}
const sfx = {
    sail() {
        const c = audioCtx(); if (!c) return;
        const t0 = c.currentTime, osc = c.createOscillator(), g = c.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(200, t0); osc.frequency.exponentialRampToValueAtTime(560, t0 + 0.5);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.11, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        osc.connect(g); g.connect(c.destination); osc.start(t0); osc.stop(t0 + 0.66);
    },
    // The big cast-off moment: a low ship's horn, the rising whoosh, and two bright bell dings layered together.
    depart() {
        const c = audioCtx(); if (!c) return;
        const t0 = c.currentTime, horn = c.createOscillator(), hg = c.createGain();
        horn.type = "sawtooth";
        horn.frequency.setValueAtTime(120, t0); horn.frequency.exponentialRampToValueAtTime(84, t0 + 0.55);
        hg.gain.setValueAtTime(0.0001, t0); hg.gain.linearRampToValueAtTime(0.15, t0 + 0.06); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.72);
        horn.connect(hg); hg.connect(c.destination); horn.start(t0); horn.stop(t0 + 0.78);
        this.sail();
        tone(988, 0.14, 0.5, { type: "sine", gain: 0.12 });
        tone(1319, 0.28, 0.5, { type: "sine", gain: 0.11 });
    },
    // Catching a tailwind: a swelling wind gust that rises then falls off.
    gust() {
        const c = audioCtx(); if (!c) return;
        const t0 = c.currentTime, osc = c.createOscillator(), g = c.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, t0);
        osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.32);
        osc.frequency.exponentialRampToValueAtTime(280, t0 + 0.72);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.1, t0 + 0.09); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
        osc.connect(g); g.connect(c.destination); osc.start(t0); osc.stop(t0 + 0.85);
        tone(784, 0.06, 0.42, { type: "sine", gain: 0.08 });
    },
    arrive() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.55, { type: "sine", gain: 0.16 })); },
    dig() { tone(110, 0, 0.09, { type: "square", gain: 0.12 }); tone(240, 0.015, 0.06, { type: "sawtooth", gain: 0.06 }); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.5, { type: "triangle", gain: 0.16 })); },
    // Boat level-up: a bigger triumphant rising fanfare that ends on a held chord.
    levelUp() {
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.5, { type: "triangle", gain: 0.17 }));
        [784, 1047].forEach((f) => tone(f, 0.46, 0.7, { type: "sine", gain: 0.13 }));
    },
    fail() { tone(300, 0, 0.22, { type: "sawtooth", gain: 0.1 }); tone(170, 0.12, 0.4, { type: "sawtooth", gain: 0.1 }); },
    // Boat upgrade: four metallic hammer CLANGS (synced to the banging animation) capped with a bright ding.
    hammer() {
        [0, 0.5, 1.0, 1.5].forEach((t) => {
            tone(1500, t, 0.13, { type: "square", gain: 0.09 });
            tone(2200, t + 0.006, 0.09, { type: "square", gain: 0.05 });
            tone(3200, t + 0.01, 0.06, { type: "sawtooth", gain: 0.035 });
            tone(560, t, 0.08, { type: "triangle", gain: 0.06 });
        });
        [880, 1319].forEach((f) => tone(f, 1.7, 0.55, { type: "sine", gain: 0.13 }));
    },
};

function Confetti() {
    return <div className="sail-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>;
}

// Real painted art for a treasure-chest fragment (AI-gen, cel-shaded to match the boat/ocean) — replaces the
// flat 🧩 emoji everywhere. Same API at every call size.
function FragmentIcon({ size = 20, className = "", art = "/images/sailing/fragment-wooden.png" }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={`frag-icon ${className}`.trim()} src={art} alt=""
            width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} draggable={false} />
    );
}

// Tailwind gust FX: a screen flash + a stream of leaves/debris blowing across the scene left-to-right.
function WindGust() {
    return (
        <div className="sail-gustfx" aria-hidden="true">
            <span className="sail-flash" />
            {Array.from({ length: 18 }, (_, i) => (
                <span
                    key={i}
                    className="sail-leaf"
                    style={{
                        "--i": i,
                        top: `${4 + (i * 91) % 92}%`,
                        animationDelay: `${(i % 6) * 55}ms`,
                        fontSize: `${0.65 + ((i * 7) % 5) * 0.2}rem`,
                    }}
                >
                    {["🍃", "🍂", "🍃", "·"][i % 4]}
                </span>
            ))}
        </div>
    );
}

// A crisp ship's-wheel (helm) for the primary Set-sail CTA — reads far better than the flat ⛵ emoji.
function HelmIcon() {
    return (
        <svg className="sail-cta-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2.6" />
            <circle cx="12" cy="12" r="8.4" />
            <path d="M12 3.6v3.8M12 16.6v3.8M3.6 12h3.8M16.6 12h3.8M6.1 6.1l2.7 2.7M15.2 15.2l2.7 2.7M17.9 6.1l-2.7 2.7M8.8 15.2l-2.7 2.7" />
        </svg>
    );
}

function fmtLeft(ms) {
    if (ms <= 0) return "landing…";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function Stars({ level }) {
    const tier = Math.floor((level - 1) / 10) + 1;
    return <span className="sail-stars">{Array.from({ length: 5 }, (_, i) => <span key={i} className={i < tier ? "on" : "off"}>★</span>)}</span>;
}

export default function SailingClient({ initial, hero, pet }) {
    const [state, setState] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [forge, setForge] = useState(null); // the chest just forged from fragments
    const [levelUp, setLevelUp] = useState(null); // the new level, when an upgrade levels the boat up
    const [formUnlock, setFormUnlock] = useState(null); // the milestone form just unlocked (every 10 levels)
    const [inspectForm, setInspectForm] = useState(null); // a boat form being inspected (locked or not)
    const [selectedTool, setSelectedTool] = useState(null); // an area-clear dig tool armed to tap a tile
    const [celebrate, setCelebrate] = useState(null); // "arrive" while the Land-ho banner shows
    const [chunk, setChunk] = useState(null); // { r, c, k } — the tile currently spraying rock chunks
    const [windSaved, setWindSaved] = useState(false); // the tailwind-save perk just triggered
    const [gusting, setGusting] = useState(false);     // the tailwind gust is currently playing
    const [gustNonce, setGustNonce] = useState(0);     // bumps each catch so the FX overlay remounts + replays
    const [waveFx, setWaveFx] = useState(null);        // { xp, coins, minutes, k } — the "you waved!" reward toast
    const [ackingEnc, setAckingEnc] = useState(false); // dismissing an encounter recap (awaiting the ack round-trip)
    const [encReady, setEncReady] = useState(false);   // encounter recap accepts its dismiss click (anti-misclick delay)
    const [ambient, setAmbient] = useState([]); // other players' boats sailing past in the background
    const [now, setNow] = useState(Date.now);
    // The horizon backdrop is chosen server-side (in getSailingState) and delivered in `initial`, so it's
    // correct on the very first render — no flicker from a default to the picked one. Held stable for the
    // session (later state updates re-roll d.sky, but we keep this original).
    const [sky] = useState(() => initial?.sky || initial?.oceanBg || null);

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    const arrivedRef = useRef(false);
    const chunkId = useRef(0);
    const ambientId = useRef(0);
    const fleetIdx = useRef(0);        // round-robin cursor so consecutive ships are DIFFERENT members
    const boostRef = useRef(0);        // Date.now() until which traffic is sped up (after a tailwind)
    const gustTimer = useRef(null);    // safety timer that clears `gusting` if the animationend event is missed
    const halfwayRef = useRef(null);   // departedAt we've already done the one-shot midpoint refetch for

    // Silent state refresh (GET) — used for the one-shot midpoint refetch so a marine encounter pops live.
    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/marketplace/sailing", { cache: "no-store" });
            if (r.ok) { const d = await r.json().catch(() => null); if (d && !d.error) setState(d); }
        } catch { /* keep prior state */ }
    }, []);

    // Anti-misclick: after an encounter recap appears (and only when NOT digging), ignore its dismiss click for
    // a beat — players are often mid-tapping something else and would otherwise close it instantly.
    useEffect(() => {
        const active = Boolean(state.encounter) && state.status !== "digging";
        if (!active) { setEncReady(false); return undefined; }
        setEncReady(false);
        const t = setTimeout(() => setEncReady(true), 700);
        return () => clearTimeout(t);
    }, [state.encounter, state.status]);

    // Every so often, send another sailor's boat drifting across the horizon behind yours.
    useEffect(() => {
        let alive = true;
        let timer;
        const spawn = () => {
            if (!alive) return;
            const s = stateRef.current;
            const fleet = s?.fleet || [];
            const sailingNow = s?.status === "sailing" && s?.arrivesAt && Date.now() < s.arrivesAt;
            const boosting = sailingNow && Date.now() < boostRef.current;
            if (fleet.length) {
                // Cycle the fleet so you see DIFFERENT members in turn (not the same one at random).
                const pick = fleet[fleetIdx.current % fleet.length];
                fleetIdx.current += 1;
                const id = (ambientId.current += 1);
                // While YOU are sailing, the other ships all head the same way you do (right) and you overtake
                // them — so they drift right→left but stay facing right. Docked, they just pass by either way.
                const dir = sailingNow ? "left" : (Math.random() < 0.5 ? "left" : "right");
                // Slow crawl while sailing (distant ships shouldn't whip by); a tailwind briefly speeds them up.
                // Boosting ships whip across within the gust window so the speed-up ends with the animation, not after.
                const dur = boosting ? 2.8 + Math.random() * 1.4 : sailingNow ? 20 + Math.random() * 9 : 15 + Math.random() * 8;
                setAmbient((a) => [...a, {
                    id, art: pick.art, name: pick.name, rider: pick.rider, riderFlip: pick.riderFlip, pet: pick.pet, petFlip: pick.petFlip,
                    dir, faceLeft: dir === "left" && !sailingNow, top: 34 + Math.random() * 10, dur,
                }]);
                setTimeout(() => setAmbient((a) => a.filter((x) => x.id !== id)), dur * 1000 + 300);
            }
            // More frequent traffic while sailing, a flurry during a tailwind boost, sparse while docked.
            const gap = boosting ? 1.4 + Math.random() * 1.4 : sailingNow ? 4.5 + Math.random() * 3.5 : 13 + Math.random() * 10;
            timer = setTimeout(spawn, gap * 1000);
        };
        timer = setTimeout(spawn, 1800);
        return () => { alive = false; clearTimeout(timer); };
    }, []);

    // Clock + arrival detection: when the voyage timer crosses arrival, fire the chime + Land-ho celebration.
    useEffect(() => {
        const id = setInterval(() => {
            setNow(Date.now());
            const s = stateRef.current;
            if (s.status === "sailing" && s.arrivesAt && Date.now() >= s.arrivesAt && !arrivedRef.current) {
                arrivedRef.current = true;
                sfx.arrive();
                setCelebrate("arrive");
                setTimeout(() => setCelebrate((c) => (c === "arrive" ? null : c)), 2600);
            }
            // A voyage's encounter is scheduled at its ORIGINAL midpoint and resolves server-side on the next
            // state read. Do ONE silent refetch the moment we cross that midpoint so an encounter pops live even
            // while idle here (no continuous polling). departedAt + voyageTotalMs/2 = the fixed midpoint.
            if (s.status === "sailing" && s.departedAt && s.voyageTotalMs > 0 && halfwayRef.current !== s.departedAt
                && Date.now() >= s.departedAt + s.voyageTotalMs / 2) {
                halfwayRef.current = s.departedAt;
                load();
            }
        }, 1000);
        return () => clearInterval(id);
    }, [load]);

    const { arrivesAt } = state;
    let liveStatus = state.status;
    let progress = state.progress || 0;
    // Remaining-based: how close to arrival vs. the ORIGINAL trip, so a tailwind (which cuts the remaining
    // time) visibly jumps the boat forward instead of leaving it pinned at the left.
    if (state.status === "sailing" && arrivesAt && state.voyageTotalMs > 0) {
        if (now >= arrivesAt) liveStatus = "arrived";
        else progress = Math.max(0, Math.min(0.999, 1 - (arrivesAt - now) / state.voyageTotalMs));
    }

    // Kick off the tailwind gust. Restart-safe: if a gust is already playing (you caught another one), drop the
    // class for one paint then re-add it so the CSS animation replays from 0 instead of no-op'ing on the class it
    // already has. Cleanup is driven by the boat's `onAnimationEnd`; the timer here is only a missed-event backstop.
    const triggerGust = useCallback(() => {
        if (gustTimer.current) clearTimeout(gustTimer.current);
        setGustNonce((n) => n + 1);
        setGusting(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setGusting(true)));
        gustTimer.current = setTimeout(() => setGusting(false), GUST_MS + 150);
    }, []);

    const act = useCallback(async (action, extra = {}) => {
        setBusy(true);
        if (action === "start") {
            sfx.depart(); arrivedRef.current = false;
            setCelebrate("depart");
            setTimeout(() => setCelebrate((c) => (c === "depart" ? null : c)), 1900);
        }
        if (action === "wind" || action === "recharge_wind") {
            sfx.gust();
            triggerGust();
            // Speed the passing fleet up for exactly the gust so it feels like you surged ahead, then reverts.
            boostRef.current = Date.now() + GUST_MS;
        }
        if (action === "dig" || action === "begin_dig") sfx.dig();
        const prevLevel = stateRef.current?.level || 0;
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }),
            });
            const d = await r.json().catch(() => ({}));
            if (d && !d.error) {
                setState(d);
                const leveled = d.level > prevLevel;
                if (d.result) { d.result.won ? sfx.win() : sfx.fail(); setResult(d.result); }
                if (leveled) {
                    // Crossing a 10-level milestone unlocks a new FORM — a bigger, special celebration.
                    const crossed = (d.forms || []).find((f) => f.level > prevLevel && f.level <= d.level);
                    if (crossed) { sfx.levelUp(); setFormUnlock(crossed); } else { sfx.hammer(); setLevelUp(d.level); }
                }
                if (d.forged) { sfx.win(); setForge(d.forged); }
                if (d.windRefunded) { setWindSaved(true); setTimeout(() => setWindSaved(false), 2400); }
                if (d.waved) { sfx.gust(); const k = Date.now(); setWaveFx({ ...d.waved, k }); setTimeout(() => setWaveFx((w) => (w?.k === k ? null : w)), 2200); }
            }
        } finally { setBusy(false); }
    }, [triggerGust]);

    // Dig a tile: spray rock chunks from it instantly (feels tactile), then send the dig to the server.
    const digTile = useCallback((r, c) => {
        const k = (chunkId.current += 1);
        setChunk({ r, c, k });
        setTimeout(() => setChunk((cur) => (cur?.k === k ? null : cur)), 520);
        act("dig", { r, c });
    }, [act]);

    // Use the armed area-clear tool at a tile (its footprint anchors here), then disarm it.
    const runToolAt = useCallback((tool, r, c) => {
        const k = (chunkId.current += 1);
        setChunk({ r, c, k });
        setTimeout(() => setChunk((cur) => (cur?.k === k ? null : cur)), 520);
        setSelectedTool(null);
        act("use_tool", { tool: tool.id, r, c });
    }, [act]);

    const level = state.level;
    const dig = state.dig;
    const windCost = state.windRecharge?.cost ?? 0;
    const windTooPoor = windCost > 0 && state.gold < windCost;
    // The boat's current form name = the highest unlocked milestone, else the base Wood Boat.
    const curForm = (state.forms || []).filter((f) => f.unlocked).slice(-1)[0];
    const boatName = curForm ? curForm.name : "Wood Boat";
    // The four travel/loot upgrade levers, described with their per-level effect + current → next value.
    const upgrades = [
        { action: "upgrade_speed", icon: "💨", name: "Speed", data: state.speed,
            desc: <>Faster voyages — shaves <b>{state.speed.minPerLevel} min</b> off each trip, per level.</>,
            effLabel: "Trip time", now: fmtLeft(state.speed.voyageNow), next: fmtLeft(state.speed.voyageNext) },
        { action: "upgrade_fortune", icon: "🍀", name: "Fortune", data: state.fortune,
            desc: <>Draws trouble — <b>+1.5%</b> chance of a marine <b>encounter</b> at your voyage&apos;s midpoint, per level.</>,
            effLabel: "Encounter chance", now: `${state.fortune.encounterNow}%`, next: `${state.fortune.encounterNext}%` },
        { action: "upgrade_rarity", icon: "💎", name: "Rarity", data: state.rarity,
            desc: <>Better loot — a chance your forged chest is bumped up a tier.</>,
            effLabel: "Chest upgrade", now: `${state.rarity.pctNow}%`, next: `${state.rarity.pctNext}%` },
        { action: "upgrade_luck", icon: "🎯", name: "Luck", data: state.luck,
            desc: <>Strike sooner — fragments sit closer to the surface, found on your early digs.</>,
            effLabel: "Buried within", now: `${state.luck.depthNow} layer${state.luck.depthNow === 1 ? "" : "s"}`, next: `${state.luck.depthNext} layer${state.luck.depthNext === 1 ? "" : "s"}` },
    ];
    // Digging upgrade tracks (separate system) — gold-leveled; the tools unlock via excavation level.
    const pct = (v) => `${Math.round((v || 0) * 100)}%`;
    const dg = state.digUpgrades || {};
    const digTracks = [
        { track: "stamina", icon: "⛏️", name: "Stamina", data: dg.stamina, desc: <>More digs each trip — <b>+1</b> per level.</>, effLabel: "Digs / trip", now: dg.stamina?.digsNow, next: dg.stamina?.digsNext },
        { track: "pierce", icon: "🪨", name: "Pierce", data: dg.pierce, desc: <>Chance a dig breaks through <b>every layer</b> of a tile at once.</>, effLabel: "Pierce chance", now: pct(dg.pierce?.valueNow), next: pct(dg.pierce?.valueNext) },
        { track: "strike", icon: "✨", name: "Strike", data: dg.strike, desc: <>Chance a dig <b>strikes a lucky bonus</b> fragment.</>, effLabel: "Strike chance", now: pct(dg.strike?.valueNow), next: pct(dg.strike?.valueNext) },
        { track: "efficient", icon: "♻️", name: "Efficient", data: dg.efficient, desc: <>Chance a <b>tool doesn&apos;t spend</b> its stamina charge.</>, effLabel: "Free-use chance", now: pct(dg.efficient?.valueNow), next: pct(dg.efficient?.valueNext) },
        { track: "detonator", icon: "💥", name: "Detonator", data: dg.detonator, desc: <>Chance a dig <b>spawns an explosion</b> (clears a 3×3, one layer).</>, effLabel: "Explosion chance", now: pct(dg.detonator?.valueNow), next: pct(dg.detonator?.valueNext) },
    ];

    return (
        <div className="stack reveal sailing">
            <section className="card" style={{ overflow: "hidden" }}>
                <div className="sail-head">
                    <h1 style={{ margin: 0 }}>⛵ Sailing</h1>
                    <span className="sail-owner-pill">Owner preview</span>
                </div>

                {liveStatus === "digging" && dig ? (
                    /* ---------- Excavation dig minigame ---------- */
                    <div className="dig-wrap" style={{ backgroundImage: `url(${state.digBg})` }}>
                        <div className="dig-hud">
                            <span className="dig-frag"><FragmentIcon size={16} /> {dig.found}/{dig.buried} found</span>
                            <span className="dig-stam" title="Digs remaining">⛏️ {dig.stamina}/{dig.maxStamina} digs</span>
                        </div>
                        <div className="dig-stambar"><span style={{ width: `${Math.round((dig.stamina / dig.maxStamina) * 100)}%` }} /></div>
                        {/* Tool bar — armed tools clear an area when you tap a tile. */}
                        {(dig.tools || []).length ? (
                            <div className="dig-tools">
                                {dig.tools.map((t) => (
                                    <button key={t.id} type="button"
                                        className={`dig-tool-btn${selectedTool?.id === t.id ? " is-armed" : ""}`}
                                        disabled={busy || dig.stamina < 1}
                                        onClick={() => setSelectedTool(selectedTool?.id === t.id ? null : t)}
                                        title={`${t.name}: clears ${t.cols}×${t.rows}${t.layers > 1 ? `, ${t.layers} layers` : ""} for ${t.stamina} stamina`}>
                                        {t.emoji} <span className="dig-tool-cost">{t.stamina}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <div className="dig-instruct">{selectedTool
                            ? <>💥 <b>{selectedTool.name}</b> armed — tap a tile to clear a {selectedTool.cols}×{selectedTool.rows}{selectedTool.layers > 1 ? `, ${selectedTool.layers} layers` : ""} patch ({selectedTool.stamina} stamina). <button type="button" className="dig-tool-cancel" onClick={() => setSelectedTool(null)}>cancel</button></>
                            : <>👆 Tap the dirt to dig — clear a tile to the bottom to see what it hides</>}</div>
                        <div className="dig-grid" style={{ gridTemplateColumns: `repeat(${dig.cols}, 1fr)` }}>
                            {dig.tiles.flatMap((row, r) => row.map((t, c) => {
                                const bottomed = t.depth <= 0;
                                return (
                                    <button
                                        key={`${r}-${c}`}
                                        type="button"
                                        className={`dig-tile${t.dug ? " is-dug" : ""}${bottomed ? " is-bottom" : ""}${t.found ? " is-found" : ""}${selectedTool ? " is-toolarm" : ""}`}
                                        style={{ "--depth": t.depth, "--maxdepth": t.maxDepth || 3 }}
                                        disabled={busy || dig.status !== "active" || (!selectedTool && bottomed)}
                                        onClick={() => (selectedTool ? runToolAt(selectedTool, r, c) : digTile(r, c))}
                                        title={bottomed ? (t.found ? "A fragment!" : "Bare dirt — nothing here") : `${t.depth} layer${t.depth === 1 ? "" : "s"} of dirt — tap to dig`}
                                    >
                                        {t.found ? <span className="dig-found"><FragmentIcon size={30} /></span>
                                            : bottomed ? <span className="dig-hole" aria-hidden="true" />
                                                : <span className="dig-dirt" aria-hidden="true" />}
                                        {chunk && chunk.r === r && chunk.c === c ? (
                                            <span className="dig-chunks" key={chunk.k} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</span>
                                        ) : null}
                                    </button>
                                );
                            }))}
                        </div>
                        <p className="dig-tip"><b>{dig.buried} fragments</b> are buried under this dirt — clear a tile all the way down to find out what it hides. Shallower dirt costs fewer swings, so spend your <b>{dig.stamina} digs</b> wisely.</p>
                        {dig.status === "active" ? (
                            <button
                                className="btn-ghost sail-digbuy"
                                disabled={busy || ((state.digRefill?.cost ?? 0) > 0 && state.gold < (state.digRefill?.cost ?? 0))}
                                onClick={() => act("buy_digs")}
                            >
                                🪙 Buy {state.digRefill?.amount ?? 5} more digs{(state.digRefill?.cost ?? 0) > 0 ? ` · ${(state.digRefill?.cost ?? 0).toLocaleString()}` : " · free"}
                            </button>
                        ) : null}
                    </div>
                ) : (
                    /* ---------- The sea (idle / sailing / arrived) ---------- */
                    <>
                        <div className="sail-sea">
                            {/* Random horizon backdrop; scrolls right→left while you're underway. FOUR copies with
                                every other one mirrored (CSS) so the strip tiles SEAMLESSLY — the art isn't
                                edge-matched, but a mirrored copy's edge always equals its neighbor's, killing the seam. */}
                            <div className={`sail-sky-scroll${liveStatus === "sailing" ? " is-scrolling" : ""}`} aria-hidden="true">
                                {[0, 1, 2, 3].map((n) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img key={n} src={sky || state.oceanBg} alt="" />
                                ))}
                            </div>
                            {/* Other sailors drifting across the horizon behind your boat (each waveable while sailing). */}
                            <div className="sail-ambient">
                                {ambient.map((b) => (
                                    <span key={b.id} className={`sail-ambient-boat${b.dir === "left" ? " is-rev" : ""}${b.faceLeft ? " is-faceleft" : ""}`} style={{ top: `${b.top}%`, animationDuration: `${b.dur}s` }}>
                                        <span className="sail-ambient-hull">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={b.art} alt="" />
                                            {b.pet ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className="sail-ambient-pet" src={b.pet} alt="" style={b.petFlip ? { transform: "translateX(-50%) scaleX(-1)" } : undefined} />
                                            ) : null}
                                            {b.rider ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className="sail-ambient-rider" src={b.rider} alt="" style={b.riderFlip ? { transform: "translateX(-50%) scaleX(-1)" } : undefined} />
                                            ) : null}
                                        </span>
                                        {b.name ? <span className="sail-ambient-name">{b.name}</span> : null}
                                        {/* Wave to a real passing sailor — a few times a day, right above them. */}
                                        {liveStatus === "sailing" && b.name && (state.waves?.left || 0) > 0 ? (
                                            <button type="button" className="sail-wave-btn" disabled={busy}
                                                onClick={(e) => { e.stopPropagation(); act("wave"); }} aria-label={`Wave to ${b.name}`}>
                                                👋
                                            </button>
                                        ) : null}
                                    </span>
                                ))}
                            </div>
                            <div className={`sail-boat${liveStatus === "sailing" ? " is-underway" : ""}`}>
                                <div
                                    className={`sail-boat-inner${celebrate === "depart" ? " is-casting" : ""}${gusting ? " is-gusting" : ""}${liveStatus === "sailing" ? " is-sailing" : ""}`}
                                    onAnimationEnd={(e) => { if (e.animationName === "sailGust") setGusting(false); }}
                                >
                                    {liveStatus === "sailing" ? (
                                        <>
                                            <span className="sail-wind" aria-hidden="true"><i /><i /><i /></span>
                                            <span className="sail-mist" aria-hidden="true"><i /><i /><i /></span>
                                        </>
                                    ) : null}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className={`sail-boat-img boat-aura-${state.tier}`} src={state.boatArt} alt="Your boat" />
                                    <span className="sail-crew" style={CREW_BOTTOM[state.tier] ? { "--crew-bottom": `${CREW_BOTTOM[state.tier]}%` } : undefined}>
                                        {pet?.url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img className="sail-pet" src={pet.url} alt="" style={pet.flip ? { transform: "scaleX(-1)" } : undefined} />
                                        ) : null}
                                        {hero?.spriteUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img className="sail-hero" src={hero.spriteUrl} alt="" style={hero.spriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                                        ) : hero?.avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img className="sail-hero sail-hero-avatar" src={hero.avatarUrl} alt="" />
                                        ) : null}
                                    </span>
                                </div>
                            </div>
                            {/* "You waved!" reward pop, floating over the scene. */}
                            {waveFx ? (
                                <div className="sail-wavefx" key={waveFx.k}>👋 +{waveFx.xp} XP · +🪙 {waveFx.coins} · −{waveFx.minutes}m</div>
                            ) : null}
                            <div className="sail-status">
                                {liveStatus === "idle" && <span>⚓ Docked · ready to set sail</span>}
                                {liveStatus === "sailing" && <span>🧭 Sailing to the island · {fmtLeft(arrivesAt - now)}{(state.waves?.left || 0) > 0 ? <span className="muted"> · 👋 {state.waves.left} left</span> : null}</span>}
                                {liveStatus === "arrived" && <span>🏝️ Landed! Time to dig.</span>}
                            </div>

                            {/* Primary action docked to the bottom of the animation window so it reads as part of the scene.
                                Suppressed when the Gold Merchant is here — his own card carries the "dig" button. */}
                            {liveStatus === "arrived" && !state.merchant && (
                                <div className="sail-cta-dock">
                                    <button className="sail-cta sail-cta-dig" disabled={busy} onClick={() => act("begin_dig")}>
                                        <span className="sail-cta-ico">⛏️</span> {busy ? "Landing…" : "Dig for treasure"}
                                    </button>
                                </div>
                            )}

                            {celebrate === "arrive" ? (<><div className="sail-landho">🏝️ LAND HO!</div><Confetti /></>) : null}
                            {celebrate === "depart" ? (<><div className="sail-bonvoyage">⚓ BON VOYAGE!</div><Confetti /></>) : null}
                            {gusting ? <WindGust key={gustNonce} /> : null}
                        </div>
                        {/* Gold Merchant island event — the interstitial before the dig when he rolls in. */}
                        {liveStatus === "arrived" && state.merchant ? (
                            <MerchantScene
                                merchant={state.merchant}
                                gold={state.gold || 0}
                                floor={state.merchantGold?.floor ?? 20}
                                ceil={state.merchantGold?.ceil ?? 300}
                                busy={busy}
                                heroImg={hero?.spriteUrl || hero?.avatarUrl || null}
                                onPlay={(collected, perfect) => act("merchant_play", { collected, perfect })}
                                onBuy={(item) => act("merchant_buy", { item })}
                                onLeave={() => act("begin_dig")}
                            />
                        ) : null}
                        {/* Voyage progress — only while actually at sea; a little boat creeping from port (⚓) to the island (🏝️). */}
                        {liveStatus === "sailing" && (
                            <div className="sail-voyage">
                                <span className="sail-voyage-end" aria-hidden="true">⚓</span>
                                <div className="sail-voyage-track">
                                    <span className="sail-voyage-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                                    <span className="sail-voyage-boat" style={{ left: `${Math.round(progress * 100)}%` }} aria-hidden="true">⛵</span>
                                </div>
                                <span className="sail-voyage-end" aria-hidden="true">🏝️</span>
                            </div>
                        )}
                    </>
                )}

                {/* Embark: pick how long to be out — longer voyages roll better shard tiers. */}
                {liveStatus === "idle" && (
                    <div className="sail-embark">
                        <div className="sail-embark-title"><HelmIcon /> Choose your voyage <span className="muted">— longer trips bring better shards</span></div>
                        <div className="sail-embark-opts">
                            {(state.voyageOptions || []).map((o) => (
                                <button key={o.id} className="sail-embark-opt" disabled={busy} onClick={() => act("start", { duration: o.id })}>
                                    <span className="sail-embark-opt-name">{o.label}</span>
                                    <span className="sail-embark-opt-time">🧭 {fmtLeft(o.ms)}</span>
                                    <span className="sail-embark-opt-loot">up to <FragmentIcon size={15} art={`/images/sailing/fragment-${o.topTier}.png`} /></span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* At-sea + digging controls below the scene. The tailwind is the one real action here, so it's a primary CTA. */}
                {(liveStatus === "sailing" || liveStatus === "digging") && (
                    <div className="sail-actions">
                        {liveStatus === "sailing" && (
                            state.windAvailable
                                ? <button className="sail-cta sail-cta-wind" disabled={busy} onClick={() => act("wind")}>{busy ? "Catching the wind…" : "Catch a tailwind — arrive 1h sooner"}</button>
                                : <button className="sail-cta sail-cta-wind" disabled={busy || windTooPoor} onClick={() => act("recharge_wind")}>
                                    {busy ? "Catching the wind…" : windCost > 0 ? `Catch another tailwind — 🪙 ${windCost.toLocaleString()}` : "Catch another tailwind — free (testing)"}
                                </button>
                        )}
                        {liveStatus === "digging" && <button className="pill" disabled>⛏️ Digging · {dig?.stamina} digs left</button>}
                    </div>
                )}
                {windSaved ? <div className="sail-windsave">🍃 Favorable! Your tailwind wasn&apos;t used up.</div> : null}

                {/* Boat identity — level + form come from upgrades, not digging. */}
                <div className="sail-boatline">
                    <div><span className="sail-boatname">{boatName}</span> <Stars level={level} /><span className="muted" style={{ marginLeft: 8 }}>Lv {level} · Form {state.tier}/{state.boatTiers}</span></div>
                    <span className="muted sail-boatline-frag">
                        {(() => {
                            const held = (state.fragmentTiers || []).filter((f) => f.count > 0);
                            const chips = held.length ? held : [{ tier: "wooden", art: "/images/sailing/fragment-wooden.png", count: 0 }];
                            return chips.map((f) => (
                                <span key={f.tier} className="sail-frag-chip"><FragmentIcon size={14} art={f.art} /> {f.count}</span>
                            ));
                        })()}
                        <span className="sail-frag-gold">🪙 {state.gold.toLocaleString()}</span>
                    </span>
                </div>
            </section>

            {/* Your fragment hold — one row per shard tier, each forging its matching chest. */}
            <section className="card sail-hold">
                <div className="sail-hold-title">Your fragment hold</div>
                <div className="muted sail-hold-sub">Dig shards on the island. <b>{state.fragmentsPerChest || 10}</b> of a kind forge that chest — better shards come from longer voyages.</div>
                <div className="sail-hold-tiers">
                    {(state.fragmentTiers || []).map((f) => {
                        const per = f.perChest || 10;
                        const toward = f.count % per;
                        const ready = f.count >= per;
                        return (
                            <div className="sail-hold-tier" key={f.tier}>
                                <FragmentIcon size={38} art={f.art} />
                                <div className="sail-hold-tier-body">
                                    <div className="sail-hold-tier-top">
                                        <span className="sail-hold-tier-name" style={{ color: f.color }}>{f.name}</span>
                                        <span className="sail-hold-tier-count">×{f.count}</span>
                                    </div>
                                    <div className="sail-hold-bar"><span style={{ width: `${Math.round((toward / per) * 100)}%`, background: f.color }} /></div>
                                    <div className="muted sail-hold-note">{toward}/{per} toward a {f.chestLabel}{f.droppable ? "" : " · not found at sea yet"}</div>
                                </div>
                                {ready ? (
                                    <button className="sail-cta sail-forge-btn" disabled={busy} onClick={() => act("forge_chest", { tier: f.tier })}>🔨 {f.emoji}</button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Boat upgrades — 4 travel/loot levers. Buying any of them levels the boat; every 10 levels = new form. */}
            <section className="card">
                <h2 style={{ margin: "0 0 2px" }}>Upgrade your boat</h2>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Each upgrade levels your boat ⭐ — every 10 levels it takes a new form and unlocks a perk. (Digging doesn&apos;t level the boat.)</p>
                <div className="sail-upgrades">
                    {upgrades.map((u) => (
                        <div className="sail-upg" key={u.action}>
                            <div className="sail-upg-top"><span>{u.icon} {u.name}</span><span className="muted">Lv {u.data.level}/{u.data.max}</span></div>
                            <p className="muted sail-upg-desc">{u.desc}</p>
                            <div className="sail-upg-effect">
                                <span>{u.effLabel}</span>
                                <b>{u.now}{u.data.maxed ? "" : <> → <span className="sail-upg-next">{u.next}</span></>}</b>
                            </div>
                            {u.data.maxed ? <button className="pill" disabled>Maxed</button>
                                : <button className="btn-ghost" disabled={busy || state.gold < u.data.cost} onClick={() => act(u.action)}>🪙 {u.data.cost.toLocaleString()}</button>}
                        </div>
                    ))}
                </div>
            </section>

            {/* Boat forms — 8 milestones, each a new hull + a permanent perk unlocked every 10 levels. */}
            <section className="card sail-forms">
                <h2 style={{ margin: "0 0 2px" }}>Boat forms</h2>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Every 10 levels your boat takes a new form and unlocks a permanent perk. You&apos;re <b>Lv {level}</b> · Form <b>{state.tier}/{state.boatTiers}</b>.</p>
                <div className="sail-forms-list">
                    {(state.forms || []).map((f) => (
                        <button type="button" className={`sail-form${f.unlocked ? " is-unlocked" : ""}${f.current ? " is-current" : ""}`} key={f.level} onClick={() => setInspectForm(f)}>
                            <span className="sail-form-art">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f.art} alt="" className={`${f.unlocked ? "" : "is-locked"} boat-aura-${f.tier}`} />
                                {f.unlocked ? null : <span className="sail-form-lock">🔒</span>}
                            </span>
                            <div className="sail-form-body">
                                <div className="sail-form-name">{f.name} <span className="muted">· Lv {f.level}</span>{f.current ? <span className="sail-form-cur">current</span> : null}</div>
                                <div className="muted sail-form-perk">{f.perk}</div>
                            </div>
                            <span className="sail-form-chev" aria-hidden="true">›</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* Excavation — the digging upgrade system (separate from the boat). */}
            <section className="card">
                <h2 style={{ margin: "0 0 2px" }}>⛏️ Excavation</h2>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Your digging gear — level it with gold. Every trip raises your Excavation level, unlocking a new tool every {state.excavation?.perTool || 10} levels. You&apos;re Excavation <b>Lv {state.excavation?.level || 0}</b>{state.excavation?.nextTool ? <> · next tool ({state.excavation.nextTool.name}) at <b>Lv {state.excavation.nextTool.unlock}</b></> : ""}.</p>
                <div className="sail-upgrades">
                    {digTracks.map((u) => (
                        <div className="sail-upg" key={u.track}>
                            <div className="sail-upg-top"><span>{u.icon} {u.name}</span><span className="muted">Lv {u.data?.level ?? 0}/{u.data?.max ?? 0}</span></div>
                            <p className="muted sail-upg-desc">{u.desc}</p>
                            <div className="sail-upg-effect">
                                <span>{u.effLabel}</span>
                                <b>{u.now}{u.data?.maxed ? "" : <> → <span className="sail-upg-next">{u.next}</span></>}</b>
                            </div>
                            {u.data?.maxed ? <button className="pill" disabled>Maxed</button>
                                : <button className="btn-ghost" disabled={busy || state.gold < (u.data?.cost || 0)} onClick={() => act("upgrade_dig", { track: u.track })}>🪙 {(u.data?.cost || 0).toLocaleString()}</button>}
                        </div>
                    ))}
                </div>
                <div className="sail-tools-head">🧰 Tools <span className="muted">· unlock by digging</span></div>
                <div className="sail-tools-list">
                    {(state.excavation?.tools || []).map((t) => (
                        <div className={`sail-tool${t.unlocked ? " is-unlocked" : ""}`} key={t.id}>
                            <span className="sail-tool-emoji">{t.unlocked ? t.emoji : "🔒"}</span>
                            <div className="sail-tool-body">
                                <div className="sail-tool-name">{t.name} <span className="muted">· {t.stamina} stamina</span></div>
                                <div className="muted sail-tool-desc">Clears {t.cols}×{t.rows}{t.layers > 1 ? `, ${t.layers} layers` : ""}{t.unlocked ? "" : ` · unlock at Excavation Lv ${t.unlock}`}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Win / fail RECAP — you confirm before it returns you to port. */}
            {result ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap">
                        {result.won ? <Confetti /> : null}
                        <div className={`sail-recap-hero ${result.won ? "is-win" : "is-fail"}`}>
                            {result.won ? <span className="sail-recap-frag"><FragmentIcon size={70} art={(result.haul && result.haul[0]?.art) || "/images/sailing/fragment-wooden.png"} /></span> : <span className="sail-recap-rock">🪨</span>}
                        </div>
                        <h2 style={{ margin: "4px 0" }}>{result.won
                            ? (result.earned >= result.buried ? "Full haul!" : result.earned > 1 ? "Shards unearthed!" : "Shard unearthed!")
                            : "The dig came up empty"}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>{result.won
                            ? `You dug up ${result.earned} shard${result.earned === 1 ? "" : "s"}${result.bonus ? ` (incl. ${result.bonus} lucky strike${result.bonus === 1 ? "" : "s"})` : ""}.`
                            : "Nothing but bare rock this time. Sail out and try a new island."}</p>
                        <div className="sail-recap-rows">
                            {result.won && result.haul?.length ? result.haul.map((h) => (
                                <div className="sail-recap-row" key={h.tier}>
                                    <span><FragmentIcon size={16} art={h.art} /> {h.name} shard{h.n === 1 ? "" : "s"}</span>
                                    <b className="sail-recap-pos" style={{ color: h.color }}>+{h.n}</b>
                                </div>
                            )) : null}
                            <div className="sail-recap-row"><span>In your hold</span><b><FragmentIcon size={15} /> {state.fragments}</b></div>
                            <div className="sail-recap-row"><span>Voyages completed</span><b>{state.voyagesCompleted}</b></div>
                        </div>
                        <button className="sail-cta" onClick={() => setResult(null)}>⚓ Back to port</button>
                    </div>
                </div>
            ) : null}

            {/* Boat level-up — fires when you BUY an upgrade (the only way the boat levels). */}
            {levelUp ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap">
                        <Confetti />
                        {/* Your ACTUAL ship being hammered into shape — hammer bangs, sparks fly (see act()'s clang sfx). */}
                        <div className="sail-recap-hero is-win">
                            <span className="sail-upgrade-scene">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className={`sail-upgrade-boat boat-aura-${state.tier}`} src={state.boatArt} alt="" />
                                <span className="sail-upgrade-hammer" aria-hidden="true">🔨</span>
                                <span className="sail-upgrade-sparks" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                            </span>
                        </div>
                        <div className="sail-levelup-ribbon">🔨 Boat leveled up!</div>
                        <h2 style={{ margin: "8px 0 2px" }}>{boatName} — Lv {levelUp}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>Keep upgrading — every 10 levels she takes a new form.</p>
                        <button className="sail-cta" onClick={() => setLevelUp(null)}>⚓ Set sail</button>
                    </div>
                </div>
            ) : null}

            {/* NEW FORM — the "very special" unlock every 10 levels: a grand reveal of the actual new hull. */}
            {formUnlock ? (
                <div className="sail-reward-overlay sail-formreveal-overlay">
                    <div className="card sail-recap sail-formreveal">
                        <Confetti />
                        <div className="sail-formreveal-ribbon">✨ NEW BOAT FORM ✨</div>
                        <div className="sail-formreveal-stage">
                            <span className="sail-formreveal-rays" aria-hidden="true" />
                            <span className="sail-formreveal-burst" aria-hidden="true" />
                            <img src={formUnlock.art} alt={formUnlock.name} className={`sail-formreveal-boat boat-aura-${formUnlock.tier}`} />
                        </div>
                        <div className="sail-formreveal-tier">Form {formUnlock.tier} of {state.boatTiers} · reached at Lv {formUnlock.level}</div>
                        <h2 className="sail-formreveal-name">{formUnlock.name}</h2>
                        <div className="sail-form-perkbig">🎁 Perk unlocked: {formUnlock.perk}</div>
                        <button className="sail-cta sail-cta-dig" onClick={() => setFormUnlock(null)}>Set sail ⛵</button>
                    </div>
                </div>
            ) : null}

            {/* Inspect any boat form — locked or not — to see its hull + perk up close. */}
            {inspectForm ? (
                <div className="sail-reward-overlay" onClick={() => setInspectForm(null)}>
                    <div className="card sail-recap sail-inspect" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="sail-inspect-x" onClick={() => setInspectForm(null)} aria-label="Close">×</button>
                        <div className="sail-inspect-art">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={inspectForm.art} alt={inspectForm.name} className={`${inspectForm.unlocked ? "" : "is-locked"} boat-aura-${inspectForm.tier}`} />
                            {inspectForm.unlocked ? null : <span className="sail-inspect-lock">🔒</span>}
                        </div>
                        <h2 style={{ margin: "6px 0 2px" }}>{inspectForm.name}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>Form {inspectForm.tier} of {state.boatTiers} · unlocks at <b>Lv {inspectForm.level}</b></p>
                        <div className="sail-form-perkbig">🎁 {inspectForm.perk}</div>
                        <div className={`sail-inspect-status${inspectForm.unlocked ? " is-on" : ""}`}>{inspectForm.unlocked ? "✅ Unlocked" : `🔒 Reach Lv ${inspectForm.level} to unlock`}</div>
                        <button className="sail-cta" onClick={() => setInspectForm(null)}>Close</button>
                    </div>
                </div>
            ) : null}

            {/* Marine encounter recap — a foe met at the voyage's midpoint, resolved while you were away.
                Never over the dig (a race could otherwise pop it mid-excavation). */}
            {state.encounter && liveStatus !== "digging" ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap sail-encounter">
                        <Confetti />
                        <div className="sail-recap-hero is-win"><span className="sail-enc-foe">{state.encounter.emoji}</span></div>
                        <div className="sail-enc-ribbon">⚔️ Marine encounter!</div>
                        <h2 style={{ margin: "6px 0 2px" }}>You defeated {state.encounter.foe}!</h2>
                        <p className="muted" style={{ marginTop: 0 }}>You {state.encounter.loot}.</p>
                        <div className="sail-enc-rewards">
                            <span className="sail-enc-reward">✨ +{state.encounter.xp} XP</span>
                            <span className="sail-enc-reward">🪙 +{state.encounter.coins}</span>
                            {state.encounter.bonus ? <span className="sail-enc-reward is-bonus">{state.encounter.bonus.emoji} {state.encounter.bonus.label}</span> : null}
                        </div>
                        <button className="sail-cta" disabled={ackingEnc || !encReady} onClick={() => { setAckingEnc(true); Promise.resolve(act("ack_encounter")).finally(() => setAckingEnc(false)); }}>
                            {ackingEnc ? "…" : encReady ? "Onward! ⚓" : "…"}
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Chest forged from fragments. */}
            {forge ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap">
                        <Confetti />
                        <div className="sail-recap-hero is-win"><span className="sail-forge-chest">{forge.emoji}</span></div>
                        <h2 style={{ margin: "4px 0" }}>Chest forged!</h2>
                        <p className="muted" style={{ marginTop: 0 }}>You fused {state.fragmentsPerChest || 10} fragments into a <b>{forge.label}</b>. It&apos;s waiting in your stash.</p>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 4 }}>
                            <a className="sail-cta" href="/marketplace/inventory">🎒 Open it in your stash</a>
                            <button className="pill" onClick={() => setForge(null)}>Keep sailing</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
