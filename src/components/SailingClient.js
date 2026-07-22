"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
};

function Confetti() {
    return <div className="sail-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>;
}

// Real painted art for a treasure-chest fragment (AI-gen, cel-shaded to match the boat/ocean) — replaces the
// flat 🧩 emoji everywhere. Same API at every call size.
function FragmentIcon({ size = 20, className = "" }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={`frag-icon ${className}`.trim()} src="/images/sailing/fragment.png" alt=""
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
    const [celebrate, setCelebrate] = useState(null); // "arrive" while the Land-ho banner shows
    const [chunk, setChunk] = useState(null); // { r, c, k } — the tile currently spraying rock chunks
    const [windSaved, setWindSaved] = useState(false); // the tailwind-save perk just triggered
    const [ambient, setAmbient] = useState([]); // other players' boats sailing past in the background
    const [now, setNow] = useState(Date.now);

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    const arrivedRef = useRef(false);
    const chunkId = useRef(0);
    const ambientId = useRef(0);

    // Every so often, send another sailor's boat drifting across the horizon behind yours.
    useEffect(() => {
        let alive = true;
        let timer;
        const spawn = () => {
            if (!alive) return;
            const fleet = stateRef.current?.fleet || [];
            if (fleet.length) {
                const pick = fleet[Math.floor(Math.random() * fleet.length)];
                const id = (ambientId.current += 1);
                const dur = 12 + Math.random() * 7;
                setAmbient((a) => [...a, { id, art: pick.art, name: pick.name, flip: Math.random() < 0.5, top: 6 + Math.random() * 32, dur }]);
                setTimeout(() => setAmbient((a) => a.filter((x) => x.id !== id)), dur * 1000 + 300);
            }
            timer = setTimeout(spawn, (13 + Math.random() * 11) * 1000);
        };
        timer = setTimeout(spawn, 2500);
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
        }, 1000);
        return () => clearInterval(id);
    }, []);

    const { departedAt, arrivesAt } = state;
    let liveStatus = state.status;
    let progress = state.progress || 0;
    if (state.status === "sailing" && departedAt && arrivesAt) {
        if (now >= arrivesAt) liveStatus = "arrived";
        else progress = Math.max(0, Math.min(0.999, (now - departedAt) / (arrivesAt - departedAt)));
    }

    const act = useCallback(async (action, extra = {}) => {
        setBusy(true);
        if (action === "start") {
            sfx.depart(); arrivedRef.current = false;
            setCelebrate("depart");
            setTimeout(() => setCelebrate((c) => (c === "depart" ? null : c)), 1900);
        }
        if (action === "wind" || action === "recharge_wind") {
            sfx.gust();
            setCelebrate("gust");
            setTimeout(() => setCelebrate((c) => (c === "gust" ? null : c)), 2400);
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
                    sfx.levelUp();
                    // Crossing a 10-level milestone unlocks a new FORM — a bigger, special celebration.
                    const crossed = (d.forms || []).find((f) => f.level > prevLevel && f.level <= d.level);
                    if (crossed) setFormUnlock(crossed); else setLevelUp(d.level);
                }
                if (d.forged) { sfx.win(); setForge(d.forged); }
                if (d.windRefunded) { setWindSaved(true); setTimeout(() => setWindSaved(false), 2400); }
            }
        } finally { setBusy(false); }
    }, []);

    // Dig a tile: spray rock chunks from it instantly (feels tactile), then send the dig to the server.
    const digTile = useCallback((r, c) => {
        const k = (chunkId.current += 1);
        setChunk({ r, c, k });
        setTimeout(() => setChunk((cur) => (cur?.k === k ? null : cur)), 520);
        act("dig", { r, c });
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
            desc: <>Richer islands — <b>+1</b> fragment buried to dig up each trip, per level.</>,
            effLabel: "Fragments buried", now: state.fortune.buriedNow, next: state.fortune.buriedNext },
        { action: "upgrade_rarity", icon: "💎", name: "Rarity", data: state.rarity,
            desc: <>Better loot — a chance your forged chest is bumped up a tier.</>,
            effLabel: "Chest upgrade", now: `${state.rarity.pctNow}%`, next: `${state.rarity.pctNext}%` },
        { action: "upgrade_luck", icon: "🎯", name: "Luck", data: state.luck,
            desc: <>Strike sooner — fragments sit closer to the surface, found on your early digs.</>,
            effLabel: "Buried within", now: `${state.luck.depthNow} layer${state.luck.depthNow === 1 ? "" : "s"}`, next: `${state.luck.depthNext} layer${state.luck.depthNext === 1 ? "" : "s"}` },
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
                        <div className="dig-instruct">👆 Tap the dirt to dig — clear a tile to the bottom to see what it hides</div>
                        <div className="dig-grid" style={{ gridTemplateColumns: `repeat(${dig.cols}, 1fr)` }}>
                            {dig.tiles.flatMap((row, r) => row.map((t, c) => {
                                const bottomed = t.depth <= 0;
                                return (
                                    <button
                                        key={`${r}-${c}`}
                                        type="button"
                                        className={`dig-tile${t.dug ? " is-dug" : ""}${bottomed ? " is-bottom" : ""}${t.found ? " is-found" : ""}`}
                                        style={{ "--depth": t.depth, "--maxdepth": t.maxDepth || 3 }}
                                        disabled={busy || dig.status !== "active" || bottomed}
                                        onClick={() => digTile(r, c)}
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
                        <div className="sail-sea" style={{ backgroundImage: `url(${state.oceanBg})` }}>
                            {/* Other sailors drifting across the horizon behind your boat. */}
                            <div className="sail-ambient" aria-hidden="true">
                                {ambient.map((b) => (
                                    <span key={b.id} className={`sail-ambient-boat${b.flip ? " is-flip" : ""}`} style={{ top: `${b.top}%`, animationDuration: `${b.dur}s` }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={b.art} alt="" />
                                        {b.name ? <span className="sail-ambient-name">{b.name}</span> : null}
                                    </span>
                                ))}
                            </div>
                            <div className="sail-boat">
                                <div className={`sail-boat-inner${celebrate === "depart" ? " is-casting" : ""}${celebrate === "gust" ? " is-gusting" : ""}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="sail-boat-img" src={state.boatArt} alt="Your boat" />
                                    <span className="sail-crew">
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
                            <div className="sail-status">
                                {liveStatus === "idle" && <span>⚓ Docked · ready to set sail</span>}
                                {liveStatus === "sailing" && <span>🧭 Sailing to the island · {fmtLeft(arrivesAt - now)}</span>}
                                {liveStatus === "arrived" && <span>🏝️ Landed! Time to dig.</span>}
                            </div>

                            {/* Primary action docked to the bottom of the animation window so it reads as part of the scene. */}
                            {liveStatus === "idle" && (
                                <div className="sail-cta-dock">
                                    <button className="sail-cta" disabled={busy} onClick={() => act("start")}>
                                        <HelmIcon /> {busy ? "Casting off…" : "Set sail"}
                                    </button>
                                </div>
                            )}
                            {liveStatus === "arrived" && (
                                <div className="sail-cta-dock">
                                    <button className="sail-cta sail-cta-dig" disabled={busy} onClick={() => act("begin_dig")}>
                                        <span className="sail-cta-ico">⛏️</span> {busy ? "Landing…" : "Dig for treasure"}
                                    </button>
                                </div>
                            )}

                            {celebrate === "arrive" ? (<><div className="sail-landho">🏝️ LAND HO!</div><Confetti /></>) : null}
                            {celebrate === "depart" ? (<><div className="sail-bonvoyage">⚓ BON VOYAGE!</div><Confetti /></>) : null}
                            {celebrate === "gust" ? <WindGust /> : null}
                        </div>
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
                    <span className="muted sail-boatline-frag"><FragmentIcon size={14} /> {state.fragments} · 🪙 {state.gold.toLocaleString()}</span>
                </div>
            </section>

            {/* Your fragment hold — sits right under the animation window: count + forge. */}
            <section className="card sail-hold">
                <div className="sail-hold-head">
                    <FragmentIcon size={32} className="sail-hold-icon" />
                    <div className="sail-hold-body">
                        <div className="sail-hold-count">{state.fragments} treasure-chest fragment{state.fragments === 1 ? "" : "s"}</div>
                        <div className="muted sail-hold-sub">Dig them up on the island. Every {state.fragmentsPerChest || 10} forms a treasure chest.</div>
                    </div>
                </div>
                <div className="sail-hold-bar"><span style={{ width: `${Math.round(((state.fragments % (state.fragmentsPerChest || 10)) / (state.fragmentsPerChest || 10)) * 100)}%` }} /></div>
                <div className="muted sail-hold-note">{state.fragments % (state.fragmentsPerChest || 10)}/{state.fragmentsPerChest || 10} toward your next chest</div>
                {state.fragments >= (state.fragmentsPerChest || 10) ? (
                    <button className="sail-cta sail-forge-btn" disabled={busy} onClick={() => act("forge_chest")}>
                        🔨 Forge {state.chestReward?.emoji || "🎁"} {state.chestReward?.label || "a chest"} — {state.fragmentsPerChest || 10} fragments
                    </button>
                ) : null}
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
                                <img src={f.art} alt="" className={f.unlocked ? "" : "is-locked"} />
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

            {/* Win / fail RECAP — you confirm before it returns you to port. */}
            {result ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap">
                        {result.won ? <Confetti /> : null}
                        <div className={`sail-recap-hero ${result.won ? "is-win" : "is-fail"}`}>
                            {result.won ? <span className="sail-recap-frag"><FragmentIcon size={70} /></span> : <span className="sail-recap-rock">🪨</span>}
                        </div>
                        <h2 style={{ margin: "4px 0" }}>{result.won
                            ? (result.earned >= result.buried ? "Full haul!" : result.earned > 1 ? "Fragments unearthed!" : "Fragment unearthed!")
                            : "The dig came up empty"}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>{result.won
                            ? `You dug up ${result.earned} of ${result.buried} buried fragment${result.buried === 1 ? "" : "s"}.`
                            : "Nothing but bare rock this time. Sail out and try a new island."}</p>
                        <div className="sail-recap-rows">
                            <div className="sail-recap-row"><span>Fragments this dig</span><b className="sail-recap-pos"><FragmentIcon size={15} /> +{result.earned}</b></div>
                            <div className="sail-recap-row"><span>In your hold</span><b><FragmentIcon size={15} /> {result.fragments}</b></div>
                            <div className="sail-recap-row"><span>Voyages completed</span><b>{state.voyagesCompleted}</b></div>
                        </div>
                        <div className="sail-recap-chest">
                            <div className="sail-hold-bar"><span style={{ width: `${Math.round(((result.fragments % 10) / 10) * 100)}%` }} /></div>
                            <div className="muted sail-hold-note">{result.fragments % 10}/10 toward a treasure chest</div>
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
                        <div className="sail-recap-hero is-win"><span className="sail-levelup-badge">⛵</span></div>
                        <div className="sail-levelup-ribbon">⬆️ Boat leveled up!</div>
                        <h2 style={{ margin: "8px 0 2px" }}>{boatName} — Lv {levelUp}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>Keep upgrading — every 10 levels she takes a new form.</p>
                        <button className="sail-cta" onClick={() => setLevelUp(null)}>⭐ Nice</button>
                    </div>
                </div>
            ) : null}

            {/* NEW FORM — the "very special" unlock every 10 levels: new hull + a permanent perk. */}
            {formUnlock ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap sail-formcard">
                        <Confetti />
                        <div className="sail-recap-hero is-win"><span className="sail-form-hero">⛵</span></div>
                        <div className="sail-levelup-ribbon">✨ NEW BOAT FORM ✨</div>
                        <h2 style={{ margin: "8px 0 2px" }}>{formUnlock.name}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>Form {formUnlock.tier} of {state.boatTiers} — reached at Lv {formUnlock.level}.</p>
                        <div className="sail-form-perkbig">🎁 Perk unlocked: {formUnlock.perk}</div>
                        <button className="sail-cta" onClick={() => setFormUnlock(null)}>Set sail ⛵</button>
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
                            <img src={inspectForm.art} alt={inspectForm.name} className={inspectForm.unlocked ? "" : "is-locked"} />
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
