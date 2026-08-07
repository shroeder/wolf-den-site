"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import ChestIcon from "@/components/ChestIcon";
import CoinCta from "@/components/CoinCta";
import CollectionPanel from "@/components/CollectionPanel";
import MerchantScene from "@/components/MerchantScene";
import FishingScene from "@/components/FishingScene";
import ShipBattleScene from "@/components/ShipBattleScene";
import ShipYard from "@/components/ShipYard";
import HowToPlay from "@/components/HowToPlay";
import FeatureDailies from "@/components/FeatureDailies";
import useScrollLock from "@/lib/useScrollLock";

// How long the tailwind gust lasts, in ms. ONE source of truth: the boat's `sailGust` CSS animation, the
// passing-traffic speed-up, and the FX overlay are all timed to this so the whole moment ends together.
const GUST_MS = 3000;

// ── DECK: the ONE source of truth for where a figure's FEET rest on each boat FORM (tier), as a `bottom`
// % of the hull art. Because the big hero boat and the little background boats use the SAME art per form,
// this single map drives the main crew (hero + pet), the ambient rider, AND the ambient pet — so they can
// never drift apart again (the old three-separate-maps setup is what kept letting the background sailors
// float while the main crew looked fine). Open boats (tier 1–2) have a low floor so figures sit LOW; taller
// ships seat higher. These numbers were dialed in with the (now-removed) crew calibrator; retune by hand here
// if a new boat form is added.
const DECK = { 1: 26, 2: 24, 3: 27, 4: 17, 5: 31, 6: 33, 7: 30, 8: 31, 9: 30, 10: 34, 11: 26 };
// Scan HEAT word by level (3 hot … 0 cold) — how close the nearest treasure is.
const HEAT_WORD = { 3: "HOT", 2: "WARM", 1: "COOL", 0: "COLD" };
// The actions that open a fight. A refusal from any of these has to be SAID — a battle button that silently
// does nothing reads as a broken build, which is precisely how it read.
const BATTLE_ACTIONS = new Set(["fleet_battle", "raid"]);
// An uncovered chest cell shows ITS SLICE of the real chest sprite (positioned like a sprite-sheet), so the
// tiles assemble into one recognizable treasure chest as you dig it out.
function chestSlice(cp) {
    if (!cp) return undefined;
    return {
        backgroundImage: "url(/images/sailing/dig-chest.png)",
        backgroundSize: `${cp.W * 100}% ${cp.H * 100}%`,
        backgroundPosition: `${cp.W > 1 ? (cp.rc / (cp.W - 1)) * 100 : 50}% ${cp.H > 1 ? (cp.rr / (cp.H - 1)) * 100 : 50}%`,
    };
}
const deckPct = (tier) => DECK[tier] ?? 30; // shared fallback for an unseen form

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

// Tailwind gust FX: a screen flash, a burst of horizontal SPEED LINES ripping past (the main "we just surged"
// cue), and a few leaves/debris for texture — all streaming left-to-right across the scene.
function WindGust() {
    return (
        <div className="sail-gustfx" aria-hidden="true">
            <span className="sail-flash" />
            {Array.from({ length: 18 }, (_, i) => (
                <span
                    key={`s${i}`}
                    className="sail-speedline"
                    style={{
                        "--i": i,
                        top: `${3 + (i * 61) % 94}%`,
                        width: `${34 + ((i * 13) % 5) * 10}%`,
                        animationDelay: `${(i % 9) * 28}ms`,
                    }}
                />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
                <span
                    key={`l${i}`}
                    className="sail-leaf"
                    style={{
                        "--i": i,
                        top: `${8 + (i * 53) % 82}%`,
                        animationDelay: `${(i % 5) * 55}ms`,
                        fontSize: `${0.7 + ((i * 7) % 4) * 0.2}rem`,
                    }}
                >
                    {["🍃", "🍂", "·"][i % 3]}
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

export default function SailingClient({ initial, hero, pet, captain }) {
    const [state, setState] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [forge, setForge] = useState(null); // the chest just forged from fragments
    const [levelUp, setLevelUp] = useState(null); // the new level, when an upgrade levels the boat up
    const [formUnlock, setFormUnlock] = useState(null); // the milestone form just unlocked (every 10 levels)
    const [inspectForm, setInspectForm] = useState(null); // a boat form being inspected (locked or not)
    const [showForms, setShowForms] = useState(false);
    // Which STATION of the ship you're standing at. Everything below the scene used to be one continuous
    // scroll — boat upgrades, then excavation, then tools, then forms — so upgrading was a hunt through a
    // document, and the tools sat at the very bottom of the longest section where nobody found them.
    // Stations give the ship space: each is a short panel about one thing, and the same tab idiom the farm
    // already uses (Garden / Outside / Inside) so it needs no learning.
    // ?station=rail|dig|helm — so another screen can link straight to the thing it is talking about. The Rail
    // (fishing upgrades AND the cast recharge) lives in here as a tab, which means the Fishing page had no way
    // to point at it: it could only say "go to Sailing" and hope.
    const [station, setStation] = useState("helm"); // the boat-forms gallery is collapsed by default
    useEffect(() => {
        const want = new URLSearchParams(window.location.search).get("station");
        if (want && ["helm", "dig", "rail"].includes(want)) setStation(want);
    }, []);
    const [toolFx, setToolFx] = useState(null); // { emoji, name, k } — flashes when a dig tool procs
    const [procFx, setProcFx] = useState(null); // { emoji, left, top, k } — the burst on the triggering tile
    const [sensePing, setSensePing] = useState(null); // { r, c, k } — the tile currently rippling a scan pulse
    const [celebrate, setCelebrate] = useState(null); // "arrive" while the Land-ho banner shows
    const [chunk, setChunk] = useState(null); // { r, c, k } — the tile currently spraying rock chunks
    const [windSaved, setWindSaved] = useState(false); // the tailwind-save perk just triggered
    const [windMsg, setWindMsg] = useState(null);      // "arrived Xm sooner" / why a tailwind couldn't fire
    const [gusting, setGusting] = useState(false);     // the tailwind gust is currently playing
    const [gustNonce, setGustNonce] = useState(0);     // bumps each catch so the FX overlay remounts + replays
    const [bountyTick, setBountyTick] = useState(0);   // bumps after a voyage action → FeatureDailies re-fetches so a completed bounty flips to Claim live
    const [waveFx, setWaveFx] = useState(null);        // { xp, coins, minutes, k } — the "you waved!" reward toast
    const [ackingEnc, setAckingEnc] = useState(false); // dismissing an encounter recap (awaiting the ack round-trip)
    const [encReady, setEncReady] = useState(false);   // encounter recap accepts its dismiss click (anti-misclick delay)
    const [ambient, setAmbient] = useState([]); // other players' boats sailing past in the background
    const [now, setNow] = useState(Date.now);
    const [upgFlash, setUpgFlash] = useState(null); // key of the upgrade card just bought (brief level-up pop)
    // The horizon backdrop is chosen server-side (in getSailingState) and delivered in `initial`, so it's
    // correct on the very first render — no flicker from a default to the picked one. Held stable for the
    // session (later state updates re-roll d.sky, but we keep this original).
    const [sky, setSky] = useState(() => initial?.sky || initial?.oceanBg || null);
    const [geoPrompt, setGeoPrompt] = useState(false); // show the "match my real weather" location prompt
    const [fishOpen, setFishOpen] = useState(false);       // the fishing scene (cast → bite → reel) is open
    const [fishRecords, setFishRecords] = useState(null);  // Den-wide biggest-per-species board (lazy-loaded)
    const [battleTab, setBattleTab] = useState("fleet");   // which tab the one battle card is showing
    // The ship yard is a full-screen INTERFACE you open, not a card you get scrolled to. Both doors into it —
    // the Raid tile out at sea and the entry button at the helm — used to call scrollIntoView, so tapping
    // either one just moved the page and left you to find what had changed. See the entry button below.
    const [yardOpen, setYardOpen] = useState(false);
    const [raidTargets, setRaidTargets] = useState(null);  // null = loading, [] = none, [...] = pickable ships
    const [raidMine, setRaidMine] = useState(null);        // YOUR gun deck, so the picker reads as a matchup
    const [shipBattle, setShipBattle] = useState(null);    // the resolved SHIP battle → drives the ship-battle scene
    const [battleMsg, setBattleMsg] = useState(null);      // why a Battle tap did nothing — see act()'s error branch
    const [arriveModal, setArriveModal] = useState(false); // "you reached the island!" modal (once per voyage)
    // Lock the background from scrolling while a full-screen sailing modal is open (the battle, arrival, the
    // rail). The raid picker used to be one of these; it is a tab on the battle card now.
    useScrollLock(Boolean(shipBattle) || arriveModal || fishOpen || yardOpen);

    // Ask for location, fetch the real weather sky, and CACHE it for next load. We only swap the background LIVE
    // when the player explicitly hit "Enable" (applyLive) — never automatically, so the scene never changes out
    // from under anyone mid-session. On plain page loads the cached sky is applied before paint (below).
    // Fetch the sky. WITHOUT coords the server answers with the weather over the shop, which is the whole point:
    // only 3 of ~1000 visitors have ever granted location, so gating this call on permission meant the
    // real-weather system reached almost nobody and everyone else got a naive clock guess with no weather in it.
    // Location is now an upgrade (YOUR storm instead of the Den's), not the price of admission.
    const fetchAmbiance = useCallback(async (coords, applyLive) => {
        try {
            const qs = coords ? `?lat=${coords.latitude}&lon=${coords.longitude}` : "";
            const r = await fetch(`/api/marketplace/sailing/ambiance${qs}`, { cache: "no-store" });
            const d = r.ok ? await r.json().catch(() => null) : null;
            if (!d?.sky) return;
            try { localStorage.setItem("wolfden-sail-sky", JSON.stringify({ sky: d.sky, at: Date.now() })); } catch { /* ignore */ }
            try { document.cookie = `wolfden-sail-sky=${d.sky}; path=/; max-age=${45 * 60}; samesite=lax`; } catch { /* ignore */ } // so next refresh's SSR uses the real-weather sky
            if (applyLive) setSky(d.sky);
        } catch { /* keep the current sky */ }
    }, []);

    const requestAmbiance = useCallback((applyLive) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) { fetchAmbiance(null, applyLive); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                try { localStorage.setItem("wolfden-sail-geo", "1"); } catch { /* ignore */ }
                setGeoPrompt(false);
                fetchAmbiance(pos.coords, applyLive); // only swaps live on an explicit tap — a change they asked for
            },
            () => { if (applyLive) setGeoPrompt(false); fetchAmbiance(null, applyLive); }, // denied → the Den's sky
            { timeout: 8000, maximumAge: 30 * 60 * 1000 },
        );
    }, [fetchAmbiance]);

    // Decide the sky ONCE, before the browser paints, so it never visibly switches on you: use a fresh cached
    // real-weather sky if we have one, else the local time of day. Then quietly refresh the cache for next load
    // (no live change), or offer the location prompt.
    useLayoutEffect(() => {
        const h = new Date().getHours();
        const t = h < 5 ? "night" : h < 7 ? "sunrise" : h < 17 ? "clearday" : h < 19 ? "goldenhour" : h < 20 ? "sunset" : h < 21 ? "dusk" : "night";
        let chosen = `/images/sailing/sky-${t}.png`;
        try {
            const raw = localStorage.getItem("wolfden-sail-sky");
            if (raw) { const c = JSON.parse(raw); if (c?.sky && Date.now() - Number(c.at) < 45 * 60 * 1000) chosen = c.sky; }
        } catch { /* ignore */ }
        setSky(chosen);
        try { document.cookie = `wolfden-sail-sky=${chosen}; path=/; max-age=${45 * 60}; samesite=lax`; } catch { /* ignore */ }
        let pref = null;
        try { pref = localStorage.getItem("wolfden-sail-geo"); } catch { /* ignore */ }
        if (pref === "1") {
            requestAmbiance(false);   // they opted in — refresh their own sky for NEXT load, no live swap
        } else {
            // Everyone else — which is nearly everyone — gets the Den's real weather instead of a clock guess.
            // Applied live only when there was no fresh cached sky: "don't change it out from under them" was
            // about not overriding a sky they'd chosen, and on a cold load there is nothing to override.
            const hadCache = chosen !== `/images/sailing/sky-${t}.png`;
            fetchAmbiance(null, !hadCache);
            if (pref !== "no") setGeoPrompt(true);
        }
    }, [requestAmbiance, fetchAmbiance]);

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    const arrivedRef = useRef(false);
    const chunkId = useRef(0);
    const ambientId = useRef(0);
    const fleetIdx = useRef(0);        // round-robin cursor so consecutive ships are DIFFERENT members
    const boostRef = useRef(0);        // Date.now() until which traffic is sped up (after a tailwind)
    const gustTimer = useRef(null);    // safety timer that clears `gusting` if the animationend event is missed
    const windMsgTimer = useRef(null); // clears the tailwind feedback toast
    const halfwayRef = useRef(null);   // departedAt we've already done the one-shot midpoint refetch for
    const lastProcRef = useRef(null);  // last dig-tool that procced, to flash each new proc once
    const lastTapRef = useRef(null);   // the tile just tapped, so a proc bursts THERE and not in the abstract

    // Flash a flourish when a dig TOOL procs (board reports the last one that fired).
    useEffect(() => {
        const id = state.dig?.toolProc || null;
        if (!id || id === lastProcRef.current) { lastProcRef.current = id; return undefined; }
        lastProcRef.current = id;
        const tool = (state.digTools?.tools || []).find((x) => x.id === id);
        const k = (chunkId.current += 1);
        setToolFx({ emoji: tool?.emoji || "☄️", name: tool?.name || "Tool", k });
        // Burst on the tile that caused it. Percentages of the grid, so it lands correctly at any board size.
        const at = lastTapRef.current;
        if (at && state.dig?.rows && state.dig?.cols) {
            setProcFx({
                k,
                emoji: tool?.emoji || "☄️",
                left: ((at.c + 0.5) / state.dig.cols) * 100,
                top: ((at.r + 0.5) / state.dig.rows) * 100,
            });
            setTimeout(() => setProcFx((f) => (f?.k === k ? null : f)), 900);
        }
        const timer = setTimeout(() => setToolFx((f) => (f?.k === k ? null : f)), 1500);
        return () => clearTimeout(timer);
    }, [state.dig?.toolProc, state.digTools]);

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
                // Slower crawl while sailing so a passing sailor LINGERS long enough to tap the wave (was 20–29s).
                const dur = boosting ? 2.8 + Math.random() * 1.4 : sailingNow ? 30 + Math.random() * 12 : 15 + Math.random() * 8;
                setAmbient((a) => [...a, {
                    id, art: pick.art, name: pick.name, rider: pick.rider, riderFlip: pick.riderFlip, pet: pick.pet, petFlip: pick.petFlip,
                    tier: Number((pick.art.match(/boat-tier(\d+)/) || [])[1]) || 1, // deck height differs by boat form
                    dir, faceLeft: dir === "left" && !sailingNow, top: 46 + Math.random() * 8, dur, // seat the hull near the horizon waterline, not floating above it
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
            // A voyage's encounter fires at its PROGRESS midpoint (so a tailwind that jumps the boat forward
            // still triggers it) and resolves server-side on the next state read. Do ONE silent refetch the
            // moment progress crosses 50% — remaining ≤ half the planned trip — so it pops live even while idle.
            if (s.status === "sailing" && s.arrivesAt && s.voyageTotalMs > 0 && halfwayRef.current !== s.departedAt
                && Date.now() >= s.arrivesAt - s.voyageTotalMs / 2) {
                halfwayRef.current = s.departedAt;
                load();
            }
        }, 1000);
        return () => clearInterval(id);
    }, [load]);

    // Pop the "you reached the island!" modal once per voyage — whether the timer crossed live or the player
    // returned to find it already landed. Deduped by this voyage's departedAt so a refresh doesn't re-pop it.
    const arrivedNow = Boolean(state.arrivesAt && now >= state.arrivesAt && state.status !== "digging" && !state.dig);
    useEffect(() => {
        if (!arrivedNow || !state.departedAt) return;
        try {
            const k = "wolfden-sail-arrived";
            if (localStorage.getItem(k) === String(state.departedAt)) return;
            localStorage.setItem(k, String(state.departedAt));
        } catch { /* ignore */ }
        setArriveModal(true);
    }, [arrivedNow, state.departedAt]);

    const { arrivesAt } = state;
    let liveStatus = state.status;
    let progress = state.progress || 0;
    // Remaining-based: how close to arrival vs. the ORIGINAL trip, so a tailwind (which cuts the remaining
    // time) visibly jumps the boat forward instead of leaving it pinned at the left.
    if (state.status === "sailing" && arrivesAt && state.voyageTotalMs > 0) {
        if (now >= arrivesAt) liveStatus = "arrived";
        else progress = Math.max(0, Math.min(0.999, 1 - (arrivesAt - now) / state.voyageTotalMs));
    }

    // Weather MOOD from the rolled horizon art (sky-<type>.png) — drives cloud density, water chop, and rain.
    const skyType = ((sky || state.oceanBg || "").match(/sky-([a-z]+)\.png/) || [])[1] || "";
    const mood = skyType === "storm" ? "storm"
        : (skyType === "night" || skyType === "aurora") ? "night"
        : (skyType === "overcast" || skyType === "fog") ? "overcast"
        : "calm";

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
        const isWind = action === "wind" || action === "recharge_wind";
        if (action === "dig" || action === "begin_dig") sfx.dig();
        const prevLevel = stateRef.current?.level || 0;
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }),
            });
            // NULL, not {} — an unparseable body (a 502, a cold-start timeout, a dropped connection) used to
            // become an empty object, which sails past `d && !d.error` and replaced the whole sailing state
            // with {}. The next render then read state.speed.minPerLevel off undefined and took the page down.
            // Two members hit exactly that. A response we could not read is not a response.
            const d = r.ok ? await r.json().catch(() => null) : null;
            // Tailwind feedback: only celebrate (gust + sound) when the server confirms it actually shaved time.
            if (isWind) {
                if (d && !d.error && d.shavedMinutes) {
                    sfx.gust(); triggerGust(); boostRef.current = Date.now() + GUST_MS;
                    setWindMsg(`🍃 Tailwind! Arrived ${d.shavedMinutes >= 60 ? "an hour" : `${d.shavedMinutes}m`} sooner.`);
                } else {
                    setWindMsg(d?.error === "almost_there" ? "🛬 You're basically there — no time left to shave."
                        : d?.error === "not_enough_gold" ? "Not enough gold for another tailwind."
                        : d?.error === "already_used" ? "You've caught today's free tailwind — buy another below."
                        : "The wind didn't catch — try again.");
                }
                clearTimeout(windMsgTimer.current);
                windMsgTimer.current = setTimeout(() => setWindMsg(null), 2800);
            }
            // ── A BATTLE THAT REFUSES HAS TO SAY SO ──────────────────────────────────────────────────────
            // Every error from this endpoint used to fall straight through this function and out, so a Battle
            // tap that the server declined was indistinguishable from a dead button — which is exactly how it
            // looked when an abandoned fight left `battle_in_progress` on the row. The server resumes that case
            // now; everything else at least gets a reason.
            if (BATTLE_ACTIONS.has(action)) {
                setBattleMsg(!d ? "The sea didn't answer — try that again."
                    : d.error === "no_battles" || d.error === "no_raid" ? "No battles left today — they come back at midnight."
                    : d.error === "no_target" ? "Nobody worth taking on out there right now."
                    : d.error === "locked" ? "Sink the ship ahead of it first."
                    : d.error === "under_construction" ? "Ship battles are under construction."
                    : d.error ? "That fight couldn't start — try again."
                    : null);
            }
            if (d && !d.error) {
                // A `partial` response carries only what changed (mid-dig taps send just the board), so merge it
                // onto what we already have. Replacing wholesale would drop the fleet, the art maps and the
                // upgrade views and make the screen flicker on every tap.
                // Only ever REPLACE state with something that is actually a sailing state. `speed` is present
                // on every real payload from getSailingState, so it is the cheapest proof that what came back
                // is the whole thing and not a stub, an error shape or a truncated body. Anything else merges,
                // which at worst adds fields and can never subtract the ones the screen renders from.
                if (d.partial || d.speed === undefined) setState((prev) => ({ ...prev, ...d }));
                else setState(d);
                if (!String(action).startsWith("upgrade_")) setBountyTick((t) => t + 1); // any real voyage action can progress a bounty

                const leveled = d.level > prevLevel;
                if (d.result) { d.result.won ? sfx.win() : sfx.fail(); setResult(d.result); }
                if (leveled) {
                    // Crossing a 10-level milestone unlocks a new FORM — a bigger, special celebration.
                    const crossed = (d.forms || []).find((f) => f.level > prevLevel && f.level <= d.level);
                    if (crossed) { sfx.levelUp(); setFormUnlock(crossed); } else { sfx.hammer(); setLevelUp(d.level); }
                }
                if (d.forged) { sfx.hammer(); setForge(d.forged); } // metallic "ting" as the chest is forged
                if (d.windRefunded) { setWindSaved(true); setTimeout(() => setWindSaved(false), 2400); }
                if (d.waved) { sfx.gust(); const k = Date.now(); setWaveFx({ ...d.waved, k }); setTimeout(() => setWaveFx((w) => (w?.k === k ? null : w)), 2200); }
                // A resolved battle — fleet or rival — plays out in the ship-battle scene. Clearing the target
                // list means the raids tab re-scans the horizon next time rather than offering a stale ship.
                if (d.battle) { setRaidTargets(null); setShipBattle(d.battle); setBattleMsg(null); }
            }
            return d;
        } finally { setBusy(false); }
    }, [triggerGust]);

    // ── FISHING ── the scene owns the minigame; these just carry its two actions to the server and hand the reply
    // straight back, since the scene needs the server's verdict (species, size, records) to celebrate with.
    const fishCast = useCallback((extra) => act("fish_cast", extra), [act]);
    const fishLand = useCallback((extra) => act("fish_land", extra), [act]);
    // The record board is a READ, so it deliberately does NOT go through act() — act() calls setState(d) on any
    // non-error reply, and fish_records returns { ok, records } with no sailing state, which would wipe the screen.
    const loadFishRecords = useCallback(async () => {
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fish_records" }),
            });
            const d = await r.json().catch(() => ({}));
            if (d?.records) setFishRecords({ records: d.records, top: d.top || [] });
        } catch { /* the log still renders; the board just stays empty */ }
    }, []);

    // Dig a tile: spray rock chunks from it instantly (feels tactile), then send the dig to the server.
    const digTile = useCallback((r, c) => {
        const k = (chunkId.current += 1);
        setChunk({ r, c, k });
        setTimeout(() => setChunk((cur) => (cur?.k === k ? null : cur)), 520);
        lastTapRef.current = { r, c };
        act("dig", { r, c });
    }, [act]);

    // Scan a tile: fire a sonar ripple instantly (tactile), then ask the server for its heat.
    const senseTile = useCallback((r, c) => {
        const k = (chunkId.current += 1);
        setSensePing({ r, c, k });
        setTimeout(() => setSensePing((p) => (p?.k === k ? null : p)), 600);
        act("sense", { r, c });
    }, [act]);

    // Buy an upgrade with a satisfying card pop: flash the card, then run the action.
    const buyUpgrade = useCallback((flashKey, action, payload) => {
        setUpgFlash(flashKey);
        setTimeout(() => setUpgFlash((k) => (k === flashKey ? null : k)), 750);
        act(action, payload);
    }, [act]);

    // Open the raid picker and load the selectable targets (real passing members, best-gear-first).
    // Show the battle card on the RAIDS tab and load who is passing. There is no separate picker any more.
    const openRaid = useCallback(async () => {
        setBattleTab("raid");
        setYardOpen(true);
        setRaidTargets(null);
        try {
            const r = await fetch("/api/marketplace/sailing", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "raid_targets" }),
            });
            const d = await r.json().catch(() => ({}));
            setRaidTargets(Array.isArray(d.targets) ? d.targets : []);
            setRaidMine(d.me || null);
        } catch { setRaidTargets([]); }
    }, []);

    // Buy back today's raid (escalating cost) and jump straight into the target picker on success.
    const buyRaidReset = useCallback(async () => {
        const d = await act("raid_reset");
        if (d && !d.error) openRaid();
    }, [act, openRaid]);

    const level = state.level;
    const dig = state.dig;
    const windCost = state.windRecharge?.cost ?? 0;
    const windTooPoor = windCost > 0 && state.gold < windCost;
    const resetCost = state.raid?.reset?.cost ?? 0;
    const raidResetTooPoor = resetCost > 0 && state.gold < resetCost;
    // The boat's current form name = the highest unlocked milestone, else the base Wood Boat.
    const curForm = (state.forms || []).filter((f) => f.unlocked).slice(-1)[0];
    const boatName = curForm ? curForm.name : "Wood Boat";
    // The four travel/loot upgrade levers, described with their per-level effect + current → next value.
    const upgrades = [
        // Optional-chained throughout, like the dig tracks below already were. The guard above is the real
        // fix; this is so a half-loaded state degrades to a blank number instead of a white screen.
        { action: "upgrade_speed", icon: "💨", name: "Speed", data: state.speed,
            desc: <>Faster voyages — shaves <b>{state.speed?.minPerLevel ?? "—"} min</b> off each trip, per level.</>,
            effLabel: "Trip time", now: fmtLeft(state.speed?.voyageNow), next: fmtLeft(state.speed?.voyageNext) },
        { action: "upgrade_fortune", icon: "🍀", name: "Fortune", data: state.fortune,
            desc: <>Draws trouble — <b>+1.5%</b> chance of a marine <b>encounter</b> at your voyage&apos;s midpoint, per level.</>,
            effLabel: "Encounter chance", now: `${state.fortune?.encounterNow ?? 0}%`, next: `${state.fortune?.encounterNext ?? 0}%` },
        { action: "upgrade_rarity", icon: "💎", name: "Rarity", data: state.rarity,
            desc: <>Better loot — a chance your forged chest is bumped up a tier.</>,
            effLabel: "Chest upgrade", now: `${state.rarity?.pctNow ?? 0}%`, next: `${state.rarity?.pctNext ?? 0}%` },
        { action: "upgrade_luck", icon: "👋", name: "Luck", data: state.luck,
            desc: <>Friendlier seas — greet more passing sailors each day for extra XP, coins &amp; travel time saved.</>,
            effLabel: "Waves / day", now: `${state.luck?.wavesNow ?? 0}`, next: `${state.luck?.wavesNext ?? 0}` },
    ];
    // Digging upgrade tracks (separate system) — gold-leveled; the tools unlock via excavation level.
    const pct = (v) => `${Math.round((v || 0) * 100)}%`;
    const dg = state.digUpgrades || {};
    const digTracks = [
        { track: "stamina", icon: "⛏️", name: "Stamina", data: dg.stamina, desc: <>More digs each trip — <b>+1</b> per level.</>, effLabel: "Digs / trip", now: dg.stamina?.digsNow, next: dg.stamina?.digsNext },
        { track: "pierce", icon: "🪨", name: "Pierce", data: dg.pierce, desc: <>Chance a dig breaks through <b>every layer</b> of a tile at once.</>, effLabel: "Pierce chance", now: pct(dg.pierce?.valueNow), next: pct(dg.pierce?.valueNext) },
        { track: "strike", icon: "✨", name: "Strike", data: dg.strike, desc: <>Chance a dig <b>strikes a lucky bonus</b> fragment.</>, effLabel: "Strike chance", now: pct(dg.strike?.valueNow), next: pct(dg.strike?.valueNext) },
        { track: "efficient", icon: "🔧", name: "Tinker", data: dg.efficient, desc: <>Adds to <b>every tool&apos;s proc chance</b> while you dig.</>, effLabel: "Tool proc bonus", now: pct(dg.efficient?.valueNow), next: pct(dg.efficient?.valueNext) },
        { track: "detonator", icon: "💥", name: "Detonator", data: dg.detonator, desc: <>Chance a dig <b>spawns an explosion</b> (clears a 3×3, one layer).</>, effLabel: "Explosion chance", now: pct(dg.detonator?.valueNow), next: pct(dg.detonator?.valueNext) },
    ];

    return (
        <div className="stack reveal sailing">
            <section className="card" style={{ overflow: "hidden" }}>
                <div className="sail-head">
                    <h1 style={{ margin: 0 }}>⛵ Sailing</h1>
                </div>

                <HowToPlay
                    id="sailing"
                    emoji="⛵"
                    title="Sailing"
                    tagline="Send your ship on voyages to haul back treasure, then dig up the loot you find."
                    steps={[
                        "Tap Set sail to send your ship out — it voyages on its own while you're away.",
                        "Events pop up along the way: catch tailwinds and pick up chests & cargo.",
                        "When you land, dig up buried chests — follow the 🔥 HOT tiles to uncover them.",
                        "Spend your haul on hull upgrades to sail farther and dig deeper each run.",
                    ]}
                    accent="#54a0e0"
                />

                {/* Real-world ambiance opt-in: match the sky/weather/time to where the player actually is. */}
                {geoPrompt ? (
                    <div className="sail-geo-prompt">
                        <span className="sail-geo-ico" aria-hidden="true">🌤️</span>
                        <div className="sail-geo-body">
                            <b>Sail in your real weather</b>
                            <span>Turn on location and the sea matches your world — sunrise, sunset, night, storms & all.</span>
                        </div>
                        <div className="sail-geo-actions">
                            <button type="button" className="sail-geo-yes" onClick={() => requestAmbiance(true)}>Enable</button>
                            <button type="button" className="sail-geo-no" onClick={() => { setGeoPrompt(false); try { localStorage.setItem("wolfden-sail-geo", "no"); } catch { /* ignore */ } }}>Not now</button>
                        </div>
                    </div>
                ) : null}

                {liveStatus === "digging" && dig ? (
                    /* ---------- Excavation dig minigame ---------- */
                    <div className="dig-wrap" style={{ backgroundImage: `url(${state.digBg})` }}>
                        <div className="dig-hud">
                            <span className="dig-frag">🎁 {dig.found}/{dig.buried} chest</span>
                            {dig.tier ? <span className="dig-tier" title="Difficulty — climbs with your Excavation level">Depth {dig.tier}</span> : null}
                            <span className="dig-stam" title="Digs remaining">⛏️ {dig.stamina}/{dig.maxStamina}</span>
                        </div>
                        <div className="dig-stambar"><span style={{ width: `${Math.round((dig.stamina / Math.max(1, dig.maxStamina)) * 100)}%` }} /></div>
                        {/* Fully automatic: while you have scans left, a tap SCANS; once they're gone, a tap DIGS.
                            Nothing to select — tools fire on their own as random procs. */}
                        <div className="dig-instruct">{(dig.senses ?? 0) > 0
                            ? <>🔍 <b>Tap to scan</b> ({dig.senses} left) — feel how close the chest is (🔥 HOT → 🧊 COLD).</>
                            : <>⛏️ <b>Tap to dig it out.</b> Follow the heat — dig the HOT tiles to uncover the chest.</>}</div>
                        {toolFx ? <div className="dig-toolfx" key={toolFx.k}>{toolFx.emoji} <b>{toolFx.name}</b> triggered!</div> : null}
                        <div className="dig-gridwrap">
                        {procFx ? (
                            <div className="dig-procfx" key={procFx.k} style={{ left: `${procFx.left}%`, top: `${procFx.top}%` }} aria-hidden="true">
                                <span className="ring" />
                                <span className="ring two" />
                                <span className="ico">{procFx.emoji}</span>
                                {[[-30, -26], [28, -30], [-34, 16], [32, 20], [0, -42], [-6, 34]].map(([sx, sy], i) => (
                                    <span key={i} className="spark" style={{ "--sx": `${sx}px`, "--sy": `${sy}px`, animationDelay: `${i * 22}ms` }} />
                                ))}
                            </div>
                        ) : null}
                        <div className="dig-grid" style={{ gridTemplateColumns: `repeat(${dig.cols}, 1fr)` }}>
                            {dig.tiles.flatMap((row, r) => row.map((t, c) => {
                                const bottomed = t.depth <= 0;
                                const willScan = (dig.senses ?? 0) > 0 && !bottomed && t.sense == null; // auto-scan phase
                                const disabled = busy || dig.status !== "active" || bottomed;
                                return (
                                    <button
                                        key={`${r}-${c}`}
                                        type="button"
                                        className={`dig-tile${t.dug ? " is-dug" : ""}${bottomed ? " is-bottom" : ""}${t.found ? " is-found" : ""}${bottomed && t.item ? " is-item" : ""}${willScan ? " is-sensearm" : ""}${t.sense != null && !bottomed ? ` is-sensed heat-${t.sense}` : ""}`}
                                        style={{ "--depth": t.depth, "--maxdepth": t.maxDepth || 3 }}
                                        disabled={disabled}
                                        onClick={() => (willScan ? senseTile(r, c) : digTile(r, c))}
                                        title={bottomed ? (t.found ? "Part of the chest!" : t.item ? `Found: ${t.item.name}!` : "Empty — nothing here") : t.sense != null ? `Scan: ${HEAT_WORD[t.sense]} — the chest is ${t.sense >= 3 ? "right near here" : t.sense === 2 ? "close" : t.sense === 1 ? "a ways off" : "far away"}` : willScan ? "Tap to scan this spot" : `${t.depth} layer${t.depth === 1 ? "" : "s"} of dirt — tap to dig`}
                                    >
                                        {t.found ? <span className="dig-chestcell" aria-hidden="true" style={chestSlice(t.chestPos)}><span className="dig-chest-burst">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</span></span>
                                            : bottomed ? (t.item ? <span className="dig-item" title={t.item.name}>{t.item.emoji}</span> : <span className="dig-hole" aria-hidden="true" />)
                                                : <><span className="dig-dirt" aria-hidden="true" />{t.sense != null ? <span className="dig-heat" aria-hidden="true">{t.sense >= 3 ? "🔥" : t.sense === 2 ? "♨️" : t.sense === 1 ? "❄️" : "🧊"}<small>{HEAT_WORD[t.sense]}</small></span> : null}</>}
                                        {chunk && chunk.r === r && chunk.c === c ? (
                                            <span className="dig-chunks" key={chunk.k} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</span>
                                        ) : null}
                                        {sensePing && sensePing.r === r && sensePing.c === c ? (
                                            <span className="dig-ping" key={sensePing.k} aria-hidden="true"><i /><i /></span>
                                        ) : null}
                                    </button>
                                );
                            }))}
                        </div>
                        </div>
                        <p className="dig-tip">A <b>buried treasure chest</b> is down here. <b>🔍 Scan</b> to feel how close it is — 🔥 <b>HOT</b> = right nearby, 🧊 <b>COLD</b> = far — then <b>⛏️ dig</b> to uncover it. <b>Grab any items 🧪 you dig up</b> along the way too, before your digs run out.</p>
                        {dig.status === "active" && dig.chestDone && dig.itemsLeft > 0 ? (
                            <div className="dig-chestdone">🎉 <b>Chest secured!</b> {dig.itemsLeft} buried item{dig.itemsLeft === 1 ? "" : "s"} still down here — keep digging to grab {dig.itemsLeft === 1 ? "it" : "them"}, or finish up whenever you like.</div>
                        ) : null}
                        {dig.status === "active" && dig.chestDone ? (
                            <button className="sail-cta sail-cta-dig sail-digdone" disabled={busy} onClick={() => act("end_dig")}>✅ Finish digging</button>
                        ) : null}
                        {dig.status === "active" ? (
                            (state.digRefill?.cost ?? 0) > 0 && state.gold < (state.digRefill?.cost ?? 0) ? (
                                <CoinCta price={state.digRefill?.cost ?? 0} have={state.gold} label={`Get coins for ${state.digRefill?.amount ?? 5} more digs`} className="sail-digbuy-cta" />
                            ) : (
                                <button className="btn-ghost sail-digbuy" disabled={busy} onClick={() => act("buy_digs")}>
                                    🪙 Buy {state.digRefill?.amount ?? 5} more digs{(state.digRefill?.cost ?? 0) > 0 ? ` · ${(state.digRefill?.cost ?? 0).toLocaleString()}` : " · free"}
                                </button>
                            )
                        ) : null}
                    </div>
                ) : (
                    /* ---------- The sea (idle / sailing / arrived) ---------- */
                    <>
                        <div className={`sail-sea sail-mood-${mood}${gusting ? " is-gust" : ""}`}>
                            {/* Random horizon backdrop; scrolls right→left while you're underway. FOUR copies with
                                every other one mirrored (CSS) so the strip tiles SEAMLESSLY — the art isn't
                                edge-matched, but a mirrored copy's edge always equals its neighbor's, killing the seam. */}
                            {skyType === "night" ? (
                                // A pure-CSS moonless night sky (dark gradient + a starfield). Tiles seamlessly with
                                // no moon to mirror — the painted sky-night art put a moon on every mirrored copy.
                                <div className="sail-nightsky" aria-hidden="true" />
                            ) : (
                                <div className={`sail-sky-scroll${liveStatus === "sailing" ? " is-scrolling" : ""}`} aria-hidden="true">
                                    {[0, 1, 2, 3].map((n) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={n} src={sky || state.oceanBg} alt="" />
                                    ))}
                                </div>
                            )}
                            {/* Clouds drifting across the sky, independent of the horizon scroll (screen-blended so
                                they pick up the art's warmth — sunset vs night). */}
                            <div className={`sail-clouds${liveStatus === "sailing" ? " is-fast" : ""}`} aria-hidden="true"><i /><i /><i /></div>
                            {/* A soft light column reflecting on the water under the horizon (blends with the sky's colour). */}
                            <div className="sail-reflection" aria-hidden="true" />
                            {/* Sun/moon glints shimmering on the swell — subtle at anchor, quicker underway. */}
                            <div className={`sail-glints${liveStatus === "sailing" ? " is-fast" : ""}`} aria-hidden="true">
                                <i /><i /><i /><i /><i /><i />
                            </div>
                            {/* Foreground water streaks racing past — faster than the horizon, for parallax depth (underway only). */}
                            <div className={`sail-nearwater${liveStatus === "sailing" ? " is-scrolling" : ""}`} aria-hidden="true"><i /><i /><i /></div>
                            {/* A depth gradient so the near water reads darker/deeper than the horizon. */}
                            <div className="sail-depth" aria-hidden="true" />
                            {/* Wildlife — the odd gull gliding across the sky, and an occasional breaching fish. */}
                            <div className="sail-wildlife" aria-hidden="true">
                                <svg className="sail-gull g1" viewBox="0 0 40 14"><path d="M2 12 Q11 2 20 11 Q29 2 38 12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                <svg className="sail-gull g2" viewBox="0 0 40 14"><path d="M2 12 Q11 2 20 11 Q29 2 38 12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                <span className="sail-fish"><svg viewBox="0 0 28 16"><path d="M2 8 C7 1 18 1 22 8 C18 15 7 15 2 8 Z M22 8 L27 4 L27 12 Z" fill="currentColor" /></svg><span className="sail-fish-splash" /></span>
                            </div>
                            {/* Rain — only when the rolled horizon is a storm. */}
                            {mood === "storm" ? <div className="sail-rain" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div> : null}
                            {/* Other sailors drifting across the horizon behind your boat (each waveable while sailing). */}
                            <div className="sail-ambient">
                                {ambient.map((b) => {
                                    // Wave to a real passing sailor — the WHOLE boat is the tap target (with a big
                                    // invisible hit area via .is-waveable::after), not just the tiny 👋 badge, so a
                                    // small drifting boat is easy to tap.
                                    const waveable = liveStatus === "sailing" && Boolean(b.name) && (state.waves?.left || 0) > 0;
                                    return (
                                    <span key={b.id}
                                        className={`sail-ambient-boat${b.dir === "left" ? " is-rev" : ""}${b.faceLeft ? " is-faceleft" : ""}${waveable ? " is-waveable" : ""}`}
                                        style={{ top: `${b.top}%`, animationDuration: `${b.dur}s` }}
                                        {...(waveable ? { role: "button", tabIndex: 0, "aria-label": `Wave to ${b.name}`, onClick: (e) => { e.stopPropagation(); if (!busy) act("wave"); }, onKeyDown: (e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); act("wave"); } } } : {})}
                                    >
                                        <span className="sail-ambient-hull" style={{ "--rider-b": `${deckPct(b.tier)}%`, "--pet-b": `${deckPct(b.tier)}%` }}>
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
                                        {waveable ? <span className="sail-wave-btn" aria-hidden="true">👋 Wave</span> : null}
                                    </span>
                                    );
                                })}
                            </div>
                            <div className={`sail-boat${liveStatus === "sailing" ? " is-underway" : ""}`}>
                                <div
                                    className={`sail-boat-inner${celebrate === "depart" ? " is-casting" : ""}${gusting ? " is-gusting" : ""}${liveStatus === "sailing" ? " is-sailing" : ""}`}
                                    onAnimationEnd={(e) => { if (e.animationName === "sailGust") setGusting(false); }}
                                >
                                    {liveStatus === "sailing" ? (
                                        <>
                                            <span className="sail-wake" aria-hidden="true"><i /><i /><i /><i /></span>
                                            <span className="sail-bowwave" aria-hidden="true"><i /><i /></span>
                                            <span className="sail-wind" aria-hidden="true"><i /><i /><i /></span>
                                            <span className="sail-mist" aria-hidden="true"><i /><i /><i /></span>
                                        </>
                                    ) : null}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className={`sail-boat-img boat-aura-${state.tier}`} src={state.boatArt} alt="Your boat" />
                                    <span className="sail-crew" style={{ "--crew-bottom": `${deckPct(state.tier)}%` }}>
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
                            {celebrate === "arrive" ? (<><div className="sail-landho">🏝️ LAND HO!</div><Confetti /></>) : null}
                            {celebrate === "depart" ? (<><div className="sail-bonvoyage">⚓ BON VOYAGE!</div><Confetti /></>) : null}
                            {gusting ? <WindGust key={gustNonce} /> : null}
                        </div>
                        {/* BELOW the scene, not on top of it. It used to be absolutely positioned inside the
                            animation window "so it reads as part of the scene", but at full CTA size it covered
                            the ship — the thing the window exists to show. Suppressed when the Gold Merchant is
                            here; his own card carries the dig button. */}
                        {liveStatus === "arrived" && !state.merchant && (
                            <div className="sail-cta-dock">
                                <button className="sail-cta sail-cta-dig" disabled={busy} onClick={() => act("begin_dig")}>
                                    <span className="sail-cta-ico">⛏️</span> {busy ? "Landing…" : "Dig for treasure"}
                                </button>
                            </div>
                        )}
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
                        {/* SHIP BATTLES ARE UNDER CONSTRUCTION — the whole surface is hidden unless the server
                            says this account is on the dev allow-list (see raidsEnabled in sailing.js). */}
                        {state.combat ? (
                            <button className="sail-cta sail-cta-raid" disabled={busy}
                                onClick={() => { setBattleTab("fleet"); setYardOpen(true); }}>
                                ⚔️ Ship battles — {Math.max(0, (state.raid?.cap ?? 0) - (state.raid?.used ?? 0))} left today
                            </button>
                        ) : null}
                        {state.combat ? <p className="sail-raid-wip">🚧 Ship battles are under construction — dev only.</p> : null}
                    </div>
                )}

                {/* At-sea + digging controls, BELOW the scene.
                    These were three full-width gold CTAs at 1.24rem with 44px of side padding, all pulsing —
                    sized for a single hero action, but there are three of them, so they wrapped into a stack
                    tall enough to crowd the boat out of frame. And every one read as a sentence ("Catch a
                    tailwind — arrive 1h sooner"), so nothing was scannable.
                    Now: compact equal-weight tiles, each an ICON + a one-word VERB + the detail underneath.
                    Three fit on one line on a phone, and you can tell them apart at a glance. */}
                {(liveStatus === "sailing" || liveStatus === "digging" || (liveStatus === "arrived" && state.fishing?.available)) && (
                    <div className="sail-actions">
                        {liveStatus === "sailing" && (
                            state.windAvailable
                                ? <button className="sail-act is-wind" disabled={busy} onClick={() => act("wind")}>
                                    <span className="sail-act-ico" aria-hidden="true">🍃</span>
                                    <b>Tailwind</b><em>{busy ? "catching…" : "arrive 1h sooner"}</em>
                                </button>
                                : <button className="sail-act is-wind" disabled={busy || windTooPoor} onClick={() => act("recharge_wind")}>
                                    <span className="sail-act-ico" aria-hidden="true">🍃</span>
                                    <b>Tailwind</b><em>{busy ? "catching…" : windCost > 0 ? `🪙 ${windCost.toLocaleString()}` : "free"}</em>
                                </button>
                        )}
                        {/* Fishing — the reason a four-hour voyage isn't four hours of nothing. Also offered while
                            docked, since the server allows a line over the rail at anchor too. */}
                        {liveStatus !== "digging" && state.fishing?.available && (
                            <button className="sail-act is-fish" disabled={busy || !state.fishing.casts?.left} onClick={() => setFishOpen(true)}>
                                <span className="sail-act-ico" aria-hidden="true">🎣</span>
                                <b>Fish</b><em>{state.fishing.casts?.left ? `${state.fishing.casts.left} casts left` : "none left today"}</em>
                            </button>
                        )}
                        {/* The "buy a cast" control used to live here, a whole screen away from the fishing
                            scene where you actually run out. It's now the SAME button you cast with — see
                            FishingScene — so the offer appears exactly where the need does. */}
                        {liveStatus === "digging" && (
                            <button className="sail-act" disabled>
                                <span className="sail-act-ico" aria-hidden="true">⛏️</span>
                                <b>Digging</b><em>{dig?.stamina} digs left</em>
                            </button>
                        )}
                        {liveStatus === "sailing" && state.combat ? (
                            <button className="sail-act is-raid" disabled={busy} onClick={openRaid}>
                                <span className="sail-act-ico" aria-hidden="true">🏴‍☠️</span>
                                <b>Raid</b><em>a passing ship</em>
                            </button>
                        ) : null}
                    </div>
                )}
                {windSaved ? <div className="sail-windsave">🍃 Favorable! Your tailwind wasn&apos;t used up.</div> : null}
                {windMsg ? <div className="sail-windsave">{windMsg}</div> : null}

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

            <FeatureDailies feature="sailing" refreshKey={bountyTick} />

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
                                    <button className="sail-cta sail-forge-btn" disabled={busy} onClick={() => act("forge_chest", { tier: f.tier })}>🔨 {f.chestImage
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img className="sail-forge-btn-chest" src={f.chestImage} alt="" />
                                        : <ChestIcon tier={f.tier} size={22} />}</button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ── STATIONS ── the ship as a place you move around, not a page you scroll. */}
            <div className="sail-stations">
                {[["helm", "⚓", "Helm", "Boat upgrades"], ["dig", "⛏️", "Dig Site", "Tools & excavation"], ["rail", "🎣", "The Rail", "Fishing"]].map(([k, ico, label, sub]) => (
                    <button key={k} type="button" className={station === k ? "on" : ""} onClick={() => setStation(k)} title={sub}>
                        <span aria-hidden="true">{ico}</span>{label}
                    </button>
                ))}
            </div>

            {station === "helm" ? <>
            {/* SHIP BATTLES — the gun deck, the racks and the fleet ladder. Gated with raiding while the rework
                is under construction: the server sends `combat: null` to everyone off the dev allow-list. */}
            {/* The DOOR, not the room. The yard itself is a full-screen interface (below) — inline it was a
                tall four-tab card that the two entry points could only scrollIntoView, so tapping Raid read as
                "the page moved" rather than "something opened". */}
            {state.combat ? (
                <div className="card sail-yard-door">
                    <h3>⚔️ Ship battles</h3>
                    {/* A fight you walked away from. The sortie is spent and no other battle can start until it
                        ends, so it belongs out HERE, on the door, not behind it. */}
                    {state.combat.openBattle && !shipBattle ? (
                        <div className="sail-battle-resume">
                            <span>You left a fight unfinished against <b>{state.combat.openBattle.foe?.name || "a ship"}</b>.</span>
                            <button type="button" className="sby-engage" disabled={busy}
                                onClick={() => setShipBattle(state.combat.openBattle)}>Back on deck</button>
                        </div>
                    ) : null}
                    <p className="muted" style={{ margin: "2px 0 10px" }}>
                        Your guns, your hull, the shot in the racks and the fifteen ships of the pirate fleet — plus
                        any rival worth running down.
                    </p>
                    <button type="button" className="sail-cta sail-cta-raid" disabled={busy}
                        onClick={() => { setBattleTab("fleet"); setYardOpen(true); }}>
                        Open the ship yard — {Math.max(0, (state.raid?.cap ?? 0) - (state.raid?.used ?? 0))} battles left today
                    </button>
                </div>
            ) : null}

            {/* The sea's collection — the Corsair chase, on the screen its raids and affinity land on. Above
                the upgrade card rather than inside it: a card nested in a card reads as a rendering mistake. */}
            {state.collections?.length ? (
                <CollectionPanel sets={state.collections} feature="sea" title="Sea collections"
                    blurb="Find the pieces anywhere in the Den — the bonus is permanent and you never have to wear them." />
            ) : null}
            {/* Boat upgrades — SEA-themed (blue) so it's visually distinct from the earthy digging section below. */}
            <section className="card" style={{ borderColor: "rgba(96,170,255,0.45)", background: "linear-gradient(180deg, rgba(70,130,220,0.08), transparent 40%)" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(96,170,255,0.16)", border: "1px solid rgba(96,170,255,0.5)", color: "#9fd0ff", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>⛵ Sailing</div>
                <h2 className="sail-upg-h" style={{ margin: "0 0 2px" }}>Upgrade your boat</h2>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Each upgrade levels your boat ⭐ — every 10 levels it takes a new form and unlocks a perk. (Digging doesn&apos;t level the boat.)</p>
                <div className="sail-upgrades is-boat">
                    {upgrades.map((u) => (
                        <div className={`sail-upg${u.data.maxed ? " is-maxed" : ""}${upgFlash === u.action ? " is-bought" : ""}`} key={u.action}>
                            <div className="sail-upg-top">
                                <span className="sail-upg-title"><span className="sail-upg-ico">{u.icon}</span>{u.name}</span>
                                <span className="muted sail-upg-lv">Lv {u.data.level}/{u.data.max}</span>
                            </div>
                            <div className="sail-upg-bar" aria-hidden="true"><span style={{ width: `${u.data.max ? Math.min(100, (u.data.level / u.data.max) * 100) : 0}%` }} /></div>
                            <p className="muted sail-upg-desc">{u.desc}</p>
                            <div className="sail-upg-effect">
                                <span>{u.effLabel}</span>
                                <b>{u.now}{u.data.maxed ? "" : <> → <span className="sail-upg-next">{u.next}</span></>}</b>
                            </div>
                            {u.data.maxed ? <button className="pill" disabled>✓ Maxed</button>
                                : state.gold < u.data.cost ? <CoinCta price={u.data.cost} have={state.gold} className="sail-upg-cta" />
                                    : <button className="btn-ghost sail-upg-buy" disabled={busy} onClick={() => buyUpgrade(u.action, u.action)}>🪙 {u.data.cost.toLocaleString()}</button>}
                        </div>
                    ))}
                </div>
            </section>

            </> : null}

            {station === "dig" ? <>
            {/* Excavation — EARTH-themed (amber) so the digging system reads as clearly separate from sailing. */}
            <section className="card" style={{ borderColor: "rgba(214,158,80,0.5)", background: "linear-gradient(180deg, rgba(180,120,50,0.1), transparent 40%)" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(214,158,80,0.16)", border: "1px solid rgba(214,158,80,0.5)", color: "#e6b878", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>⛏️ Digging</div>
                <h2 className="sail-upg-h" style={{ margin: "0 0 2px" }}>⛏️ Excavation</h2>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Level these with gold — and every level also counts toward unlocking the tools above. You've invested <b>{state.digTools?.points ?? 0}</b> of {state.digTools?.pointsTotal ?? 30}{state.digTools?.nextUnlock ? <> · <b>{state.digTools.nextUnlock.toUnlock}</b> more unlocks <b>{state.digTools.nextUnlock.name}</b></> : <> · every tool unlocked</>}.</p>
{/* TOOLS FIRST. They were the last thing on the longest section of a long scroll, which is why they read
                    as an afterthought — they are the most interesting part of digging. */}
                <div className="sail-tools-head">🧰 Tools <span className="muted">· fire as random procs while you dig — invest to raise the chance</span></div>
                {/* Same card shape as the excavation tracks below: sprite, level pips, a now → next readout and
                    one buy button. These used to be a flat emoji row, which made the most interesting part of
                    digging read as a footnote next to the tracks it sits above. */}
                <div className="sail-upgrades is-tools">
                    {(state.digTools?.tools || []).map((t) => (
                        <div className={`sail-upg sail-tool${t.unlocked ? "" : " is-locked"}${t.maxed ? " is-maxed" : ""}${upgFlash === `tool:${t.id}` ? " is-bought" : ""}`} key={t.id}>
                            <div className="sail-tool-head">
                                <span className="sail-tool-art">
                                    {t.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={t.sprite} alt="" className="sail-tool-img" />
                                    ) : <span className="sail-tool-emoji">{t.emoji}</span>}
                                    {t.unlocked ? null : <span className="sail-tool-lock" aria-hidden="true">🔒</span>}
                                </span>
                                <div className="sail-tool-headtext">
                                    <span className="sail-upg-title">{t.name}</span>
                                    <span className="muted sail-upg-lv">{t.unlocked ? `Lv ${t.level}/${t.max}` : "Locked"}</span>
                                </div>
                            </div>
                            {/* Pips, not a bar — five discrete levels read better as five things you can fill. */}
                            <div className="sail-tool-pips" aria-hidden="true">
                                {Array.from({ length: t.max }).map((_, i) => (
                                    <span key={i} className={`sail-pip${t.unlocked && i < t.level ? " is-on" : ""}`} />
                                ))}
                            </div>
                            <p className="muted sail-upg-desc">
                                Blasts a {t.area} area{t.layers > 1 ? ` and ${t.layers} layers deep` : ""} in one hit — {t.tiles} tiles.
                            </p>
                            {t.unlocked ? (
                                <div className="sail-upg-effect">
                                    <span>Proc chance</span>
                                    <b>{(t.procNow * 100).toFixed(1)}%{t.maxed ? "" : <> → <span className="sail-upg-next">{(t.procNext * 100).toFixed(1)}%</span></>}</b>
                                </div>
                            ) : (
                                <div className="sail-tool-unlock">
                                    <div className="sail-tool-unlockbar" aria-hidden="true">
                                        <span style={{ width: `${Math.min(100, ((state.digTools?.points ?? 0) / t.unlockPoints) * 100)}%` }} />
                                    </div>
                                    <span className="muted">{state.digTools?.points ?? 0}/{t.unlockPoints} dig upgrades — {t.toUnlock} to go</span>
                                </div>
                            )}
                            {t.unlocked ? (
                                t.maxed ? <button className="pill" disabled>✓ Maxed</button>
                                    : state.gold < t.cost ? <CoinCta price={t.cost} have={state.gold} className="sail-upg-cta" />
                                        : <button className="btn-ghost sail-upg-buy" disabled={busy} onClick={() => buyUpgrade(`tool:${t.id}`, "upgrade_tool", { tool: t.id })}>🪙 {t.cost.toLocaleString()}</button>
                            ) : <button className="pill" disabled>🔒 Locked</button>}
                        </div>
                    ))}
                </div>
                <div className="sail-upgrades is-dig">
                    {digTracks.map((u) => (
                        <div className={`sail-upg${u.data?.maxed ? " is-maxed" : ""}${upgFlash === `dig:${u.track}` ? " is-bought" : ""}`} key={u.track}>
                            <div className="sail-upg-top">
                                <span className="sail-upg-title"><span className="sail-upg-ico">{u.icon}</span>{u.name}</span>
                                <span className="muted sail-upg-lv">Lv {u.data?.level ?? 0}/{u.data?.max ?? 0}</span>
                            </div>
                            <div className="sail-upg-bar" aria-hidden="true"><span style={{ width: `${u.data?.max ? Math.min(100, ((u.data?.level ?? 0) / u.data.max) * 100) : 0}%` }} /></div>
                            <p className="muted sail-upg-desc">{u.desc}</p>
                            <div className="sail-upg-effect">
                                <span>{u.effLabel}</span>
                                <b>{u.now}{u.data?.maxed ? "" : <> → <span className="sail-upg-next">{u.next}</span></>}</b>
                            </div>
                            {u.data?.maxed ? <button className="pill" disabled>✓ Maxed</button>
                                : state.gold < (u.data?.cost || 0) ? <CoinCta price={u.data?.cost || 0} have={state.gold} className="sail-upg-cta" />
                                    : <button className="btn-ghost sail-upg-buy" disabled={busy} onClick={() => buyUpgrade(`dig:${u.track}`, "upgrade_dig", { track: u.track })}>🪙 {(u.data?.cost || 0).toLocaleString()}</button>}
                        </div>
                    ))}
                </div>
            </section>

            </> : null}

            {/* THE RAIL — fishing's home on the ship. It had none: the only way in was a button that appears
                mid-voyage, and there was nowhere to put fishing progression at all. */}
            {station === "rail" && state.fishing ? (
                <section className="card" style={{ borderColor: "rgba(126,200,255,0.45)", background: "linear-gradient(180deg, rgba(70,170,220,0.08), transparent 40%)" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(126,200,255,0.16)", border: "1px solid rgba(126,200,255,0.5)", color: "#9fd0ff", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>🎣 Fishing</div>
                    <h2 className="sail-upg-h" style={{ margin: "0 0 2px" }}>The Rail</h2>
                    <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Drop a line over the side while you sail. Angling comes from gear and badges — it buys extra casts and tilts what bites.</p>
                    <div className="sail-railstats">
                        <div><b>{state.fishing.casts?.left ?? 0}<em>/{state.fishing.casts?.max ?? 0}</em></b><span>casts left</span></div>
                        <div><b>{state.fishing.speciesKnown ?? 0}<em>/{state.fishing.speciesTotal ?? 0}</em></b><span>species logged</span></div>
                        <div><b>{state.fishing.angling ?? 0}</b><span>angling</span></div>
                    </div>
                    {state.fishing.available ? (
                        (state.fishing.casts?.left ?? 0) > 0 ? (
                            <button className="sail-cta sail-cta-fish" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={() => setFishOpen(true)}>
                                🎣 Cast a line
                            </button>
                        ) : (
                            // "Out of casts today" used to be a dead button on a screen with nothing else to do.
                            // The recharge already existed — the fishing scene has offered it for ages — it was
                            // simply never surfaced HERE, which is the one place you land when you run dry.
                            <>
                                {state.fishing.recharge?.available ? (
                                    <button
                                        className="sail-cta sail-cta-fish" style={{ width: "100%", marginTop: 12 }}
                                        disabled={busy || (state.gold || 0) < (state.fishing.recharge.cost || 0)}
                                        onClick={() => act("fish_recharge")}
                                    >
                                        🎣 Recharge a cast · 🪙 {(state.fishing.recharge.cost || 0).toLocaleString()}
                                    </button>
                                ) : (
                                    <button className="sail-cta sail-cta-fish" style={{ width: "100%", marginTop: 12 }} disabled>
                                        🎣 Out of casts — more tomorrow
                                    </button>
                                )}
                                {state.fishing.recharge?.available && (state.gold || 0) < (state.fishing.recharge.cost || 0)
                                    ? <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.78rem", textAlign: "center" }}>You need 🪙 {((state.fishing.recharge.cost || 0) - (state.gold || 0)).toLocaleString()} more.</p>
                                    : null}
                            </>
                        )
                    ) : (
                        <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.82rem" }}>You can only fish once the boat is under way or moored at the island.</p>
                    )}
                    <a className="btn-ghost" href="/marketplace/fishing" style={{ display: "block", textAlign: "center", marginTop: 14, padding: "11px", textDecoration: "none" }}>📖 Fishing Log &amp; records</a>
                    {/* The fleet + excavation boards. Sits with the fishing log because both are the same kind
                        of thing: the standing you're playing against, readable while the boat is docked. */}
                    <a className="btn-ghost" href="/marketplace/sailing/boards" style={{ display: "block", textAlign: "center", marginTop: 8, padding: "11px", textDecoration: "none" }}>Fleet &amp; Excavation boards</a>

                    {/* THE RAIL'S TRACKS — fishing's first real progression. Each buys a different KIND of
                        fishing (more / rarer / more treasure / safer) so they don't collapse into one obvious
                        purchase order. Same cost curve and layout as the boat and excavation tracks. */}
                    <h2 className="sail-upg-h" style={{ margin: "16px 0 2px" }}>🎣 Rig your rod</h2>
                    <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Gold spent here stays with you — Angling from gear stacks on top.</p>
                    <div className="sail-upgrades is-boat">
                        {(state.fishing.tracks || []).map((u) => (
                            <div className="sail-upg" key={u.id}>
                                <div className="sail-upg-top">
                                    <span className="sail-upg-title"><span className="sail-upg-ico">{u.icon}</span>{u.name}</span>
                                    <span className="muted">Lv {u.level}/{u.max}</span>
                                </div>
                                <div className="sail-upg-bar" aria-hidden="true"><span style={{ width: `${u.max ? Math.min(100, (u.level / u.max) * 100) : 0}%` }} /></div>
                                <div className="sail-upg-effect">
                                    <span className="muted">{u.desc}</span>
                                    <b>{u.kind === "pct" ? `+${Math.round(u.valueNow * 100)}%` : `+${u.valueNow}`}
                                        {u.maxed ? "" : <> → <span className="sail-upg-next">{u.kind === "pct" ? `+${Math.round(u.valueNext * 100)}%` : `+${u.valueNext}`}</span></>}</b>
                                </div>
                                {u.maxed ? <button className="pill" disabled>✓ Max</button>
                                    : state.gold < u.cost ? <CoinCta price={u.cost} have={state.gold} className="sail-upg-cta" />
                                        : <button className="btn-ghost sail-upg-cta" disabled={busy} onClick={() => buyUpgrade(`fish:${u.id}`, "upgrade_fishing", { track: u.id })}>🪙 {u.cost.toLocaleString()}</button>}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {station === "helm" ? <>
            {/* Boat forms — collapsed by default, below the upgrades. 8 milestones, each a new hull + a perk. */}
            <section className="card sail-forms">
                <button type="button" onClick={() => setShowForms((v) => !v)} aria-expanded={showForms} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "inherit", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <h2 style={{ margin: 0 }}>Boat forms</h2>
                    <span className="muted" style={{ fontSize: "0.78rem" }}>Form {state.tier}/{state.boatTiers}</span>
                    <span aria-hidden="true" style={{ marginLeft: "auto", color: "#ffd75e", fontSize: 12, transform: showForms ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
                </button>
                {showForms ? (
                    <>
                        <p className="muted" style={{ margin: "6px 0 12px", fontSize: "0.8rem" }}>Every 10 levels your boat takes a new form and unlocks a permanent perk. You&apos;re <b>Lv {level}</b> · Form <b>{state.tier}/{state.boatTiers}</b>.</p>
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
                                    <span className="sail-form-chev" aria-hidden="true" style={{ color: "#ffd75e" }}>▸</span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : null}
            </section>
            </> : null}

            {/* Win / fail RECAP — you confirm before it returns you to port. */}
            {result ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap">
                        {result.won ? <Confetti /> : null}
                        {/* Everything except the CTA scrolls together — "Back to port" is the only way out of
                            this modal, so a long haul must never be able to push it off the bottom. */}
                        <div className="sail-recap-body">
                        <div className={`sail-recap-hero ${result.won ? "is-win" : "is-fail"}`}>
                            {result.won ? <span className="sail-recap-frag"><FragmentIcon size={70} art={(result.haul && result.haul[0]?.art) || "/images/sailing/fragment-wooden.png"} /></span> : <span className="sail-recap-rock">🪨</span>}
                        </div>
                        <h2 style={{ margin: "4px 0" }}>{result.won
                            ? (result.fullArtifact ? "Chest unearthed! 🎁" : "Chest partly uncovered")
                            : "The dig came up empty"}</h2>
                        <p className="muted" style={{ marginTop: 0 }}>{result.won
                            ? `You exposed ${result.uncovered}/${result.total} of the chest and hauled out ${result.earned} fragment${result.earned === 1 ? "" : "s"}${result.bonus ? ` (+${result.bonus} lucky strike${result.bonus === 1 ? "" : "s"})` : ""}${result.items?.length ? `, and dug up ${result.items.reduce((s, it) => s + it.n, 0)} item${result.items.reduce((s, it) => s + it.n, 0) === 1 ? "" : "s"}` : ""}.`
                            : "Nothing but bare rock this time. Sail out and try a new island."}</p>
                        {result.reveal ? (
                            <div className="sail-reveal">
                                <div className="sail-reveal-label">🗺️ Where the chest was buried:</div>
                                <div className="sail-reveal-grid" style={{ gridTemplateColumns: `repeat(${result.reveal.cols}, 1fr)`, maxWidth: `${result.reveal.cols * 26}px` }}>
                                    {Array.from({ length: result.reveal.rows * result.reveal.cols }, (_, i) => {
                                        const rr = Math.floor(i / result.reveal.cols), cc = i % result.reveal.cols;
                                        const inRelic = result.reveal.cells.some(([a, b]) => a === rr && b === cc);
                                        const got = inRelic && result.reveal.dugCells.some(([a, b]) => a === rr && b === cc);
                                        return <span key={i} className={`sail-reveal-cell${inRelic ? (got ? " is-got" : " is-missed") : ""}`} />;
                                    })}
                                </div>
                                <div className="sail-reveal-key"><span className="is-got" /> you dug · <span className="is-missed" /> you missed</div>
                            </div>
                        ) : null}
                        <div className="sail-recap-rows">
                            {result.won && result.haul?.length ? result.haul.map((h) => (
                                <div className="sail-recap-row" key={h.tier}>
                                    <span><FragmentIcon size={16} art={h.art} /> {h.name} shard{h.n === 1 ? "" : "s"}</span>
                                    <b className="sail-recap-pos" style={{ color: h.color }}>+{h.n}</b>
                                </div>
                            )) : null}
                            {result.items?.length ? result.items.map((it) => (
                                <div className="sail-recap-row" key={it.id}>
                                    <span><span style={{ fontSize: "1rem" }}>{it.emoji}</span> {it.name}</span>
                                    <b className="sail-recap-pos" style={{ color: "#7cffb2" }}>+{it.n}</b>
                                </div>
                            )) : null}
                            {result.relic ? (
                                <div className="sail-recap-row sail-recap-relic" title={result.relic.desc}>
                                    <span><span style={{ fontSize: "1rem" }}>{result.relic.emoji}</span> {result.relic.name} <span className="muted">· rare relic!</span></span>
                                    <b className="sail-recap-pos" style={{ color: "#ffd75e" }}>+1</b>
                                </div>
                            ) : null}
                            <div className="sail-recap-row"><span>In your hold</span><b><FragmentIcon size={15} /> {state.fragments}</b></div>
                            <div className="sail-recap-row"><span>Voyages completed</span><b>{state.voyagesCompleted}</b></div>
                        </div>
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
                        <div className="sail-recap-hero is-win">
                            {state.encounter.art ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={state.encounter.art} alt="" className="sail-enc-art" />
                            ) : <span className="sail-enc-foe">{state.encounter.emoji}</span>}
                        </div>
                        <div className="sail-enc-ribbon">⚔️ Marine encounter!</div>
                        <h2 style={{ margin: "6px 0 2px" }}>You defeated {state.encounter.foe}!</h2>
                        <p className="muted" style={{ marginTop: 0 }}>You {state.encounter.loot}.</p>
                        <div className="sail-enc-rewards">
                            <span className="sail-enc-reward">✨ +{state.encounter.xp} XP</span>
                            <span className="sail-enc-reward">🪙 +{state.encounter.coins}</span>
                            {state.encounter.bonus ? (
                                <span className="sail-enc-reward is-bonus">
                                    {state.encounter.bonus.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={state.encounter.bonus.image} alt="" style={{ width: 18, height: 18, objectFit: "contain", verticalAlign: "-3px" }} />
                                    ) : state.encounter.bonus.emoji} {state.encounter.bonus.label}
                                </span>
                            ) : null}
                        </div>
                        <button className="sail-cta" disabled={ackingEnc || !encReady} onClick={() => { setAckingEnc(true); Promise.resolve(act("ack_encounter")).finally(() => setAckingEnc(false)); }}>
                            {ackingEnc ? "…" : encReady ? "Onward! ⚓" : "…"}
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Chest forged from fragments — the real chest gets HAMMERED into shape (sparks fly), then revealed. */}
            {forge ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap">
                        <Confetti />
                        <div className={`sail-forge-scene rar-${forge.tier}`}>
                            {forge.image
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img className="sail-forge-chest" src={forge.image} alt={forge.label} width={130} height={130} style={{ objectFit: "contain" }} />
                                : <ChestIcon tier={forge.tier} className="sail-forge-chest" size={130} />}
                            <span className="sail-upgrade-hammer" aria-hidden="true">🔨</span>
                            <span className="sail-upgrade-sparks" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                        </div>
                        <h2 style={{ margin: "4px 0" }}>Chest forged!</h2>
                        <p className="muted" style={{ marginTop: 0 }}>You fused {state.fragmentsPerChest || 10} fragments into a <b>{forge.label}</b>. It&apos;s waiting in your stash.</p>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
                            <a className="sail-cta sail-cta-dig" href="/marketplace/inventory">Open it in your stash →</a>
                            <button className="pill" onClick={() => setForge(null)}>Keep sailing</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* FISHING — cast → bite → reel, plus the Log and the Den record board. The scene reports one number
                (reel quality); the server owns the species, the size and the payout. */}
            {fishOpen && state.fishing ? (
                <FishingScene
                    fishing={state.fishing}
                    sky={skyType || null}
                    records={fishRecords}
                    gold={state.gold || 0}
                    onCast={fishCast}
                    onLand={fishLand}
                    onRecharge={() => act("fish_recharge")}
                    onLoadRecords={loadFishRecords}
                    onClose={() => setFishOpen(false)}
                />
            ) : null}

            {/* Arrival — "you reached the island!" modal (pops once per voyage, live or on return) */}
            {arriveModal ? (
                <div className="sail-reward-overlay">
                    <div className="card sail-recap sail-arrive-modal">
                        <Confetti />
                        <div className="sail-arrive-emoji" aria-hidden="true">🏝️</div>
                        <h2 style={{ margin: "6px 0 2px" }}>Land ho — you&apos;ve reached the island!</h2>
                        <p className="muted" style={{ marginTop: 0 }}>
                            Your boat has landed{state.merchant ? " and a Gold Merchant is waiting on the beach" : ""}. Time to head ashore and dig for buried treasure.
                        </p>
                        <button className="sail-cta sail-cta-dig" onClick={() => setArriveModal(false)}>Go ashore →</button>
                    </div>
                </div>
            ) : null}

            {/* THE SHIP YARD — one interface, opened from either door, closed by one button. It hides while a
                battle is playing so the fight is never fought through a card. */}
            {yardOpen && state.combat && !shipBattle ? (
                <div className="sail-reward-overlay" role="dialog" aria-modal="true"
                    onClick={(e) => { if (e.target === e.currentTarget) setYardOpen(false); }}>
                    <div className="sail-yard-sheet">
                        <button type="button" className="sail-yard-close" onClick={() => setYardOpen(false)} aria-label="Close">✕</button>
                        {battleMsg ? <div className="sail-battle-msg">{battleMsg}</div> : null}
                        <ShipYard
                            combat={state.combat} raid={state.raid} gold={state.gold} busy={busy}
                            targets={raidTargets} targetsMine={raidMine}
                            tab={battleTab}
                            onTab={(t) => { setBattleTab(t); if (t === "raid" && raidTargets === null) openRaid(); }}
                            onAct={({ action, ...extra }) => act(action, extra)} />
                    </div>
                </div>
            ) : null}

            {/* RAID — the full-screen auto-battle show, then reward reveal. Closing a finished fight leaves
                `yardOpen` as it was, so a battle launched FROM the yard drops you back into it — the natural
                next question is "who next?" — while one resumed from the door returns you to the page. */}
            {shipBattle ? (
                <ShipBattleScene battle={shipBattle} busy={busy}
                    onOrder={async (order) => { const d = await act("battle_order", { order }); if (d?.battle) setShipBattle(d.battle); }}
                    onClose={() => setShipBattle(null)} />
            ) : null}

        </div>
    );
}
