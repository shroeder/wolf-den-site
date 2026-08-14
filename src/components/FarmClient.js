"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dispatchPetLevelUp } from "@/components/ConsumablesClient";
import { useRouter } from "next/navigation";

import CoinCta from "@/components/CoinCta";
import PetArt from "@/components/PetArt";
import PetVisitReport from "@/components/PetVisitReport";
import FarmRatingReport from "@/components/FarmRatingReport";
import HowToPlay from "@/components/HowToPlay";
import FeatureDailies from "@/components/FeatureDailies";
import CollectionPanel from "@/components/CollectionPanel";
import Leaderboard from "@/components/Leaderboard";
import { DecoLayer, DecoDock, DecoInspect, CustomDecoCreator } from "@/components/FarmDecorations";
import PettingStand from "@/components/PettingStand";
import PackageBanner from "@/components/PackageBanner";
import { STAND_DECO_ID } from "@/lib/marketplace/petting-stand-const";
import { CreationShareHub } from "@/components/CreationShare";
import { collectibleById, petPassive, PET_STAT_META } from "@/lib/marketplace/collectibles";
import { petPerk, GOLD_PER_POINT, TICKETS_PER_FORTUNE_PER_DAY } from "@/lib/marketplace/pet-perks";
import { SEED_PACKS } from "@/lib/marketplace/seed-packs";

// A pet's OWNED (just-by-having-it) passive bonus, split into { icon, name, desc } so the modal can lay it out
// as a clean labeled row instead of a run-on sentence. Earner stats explain the real income; combat stats show
// the buff. GOLD_PER_POINT / TICKETS rates come from pet-perks.js so the numbers never drift.
// Small numbers need a decimal or the growth is invisible: a common pet's passive is base 1 and levels at
// x1.25, so Math.round showed 1%, 1%, 2%, 2%, 2% — five levels rendering as two distinct values.
const fmtVal = (v) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

// A pet's OWNED (just-by-having-it) passive, at its CURRENT level, with what the next level brings.
//
// This used to be handed petPassive(def) — the BASE value by rarity — so a Lv 5 pet showed exactly the same
// number as a Lv 1 one. The scaling was real (petPassiveLevelMult) and completely invisible, which is why a
// levelled Barn Cat still read "+1% Pet Bond". It now shows the levelled value and what Lv+1 is worth, and
// says in plain terms what the stat actually does rather than naming it.
const ownedBonusParts = (p, level = 1, maxed = false) => {
    const mult = 1 + (Math.max(1, level) - 1) * 0.25;
    const nextMult = 1 + Math.max(1, level) * 0.25;
    const v = p.value * mult;
    const nv = p.value * nextMult;
    const growth = maxed ? "Max level." : `Lv ${level + 1} → ${fmtVal(nv)}${["seedLuck", "growSpeed", "petXp"].includes(p.stat) ? "%" : ""}.`;

    if (p.stat === "gold_find") return { icon: "💰", name: `+${Math.max(1, Math.round(v * GOLD_PER_POINT))} gold / hr`, desc: `Passive income, paid whether you play or not. ${growth} Every pet you own stacks.` };
    if (p.stat === "xp_gain") return { icon: "✨", name: `+${fmtVal(v)} XP / hr`, desc: `Passive income, paid whether you play or not. ${growth} Every pet you own stacks.` };
    if (p.stat === "fortune") return { icon: "🍀", name: `+${fmtVal(v * TICKETS_PER_FORTUNE_PER_DAY)} tickets / day`, desc: `Boss-raffle tickets, banked all week. ${growth} Every pet you own stacks.` };

    const m = PET_STAT_META[p.stat] || { label: p.stat, icon: "✨", desc: "Stacks across your whole menagerie" };
    const isFarm = ["seedLuck", "growSpeed", "petXp", "angling", "reelStrength"].includes(p.stat); // percentage stats — seafaring is a COUNT, so it takes no % suffix
    // Say what the number DOES, not just what it's called. "+2% Pet Bond" tells you nothing on its own.
    const plain = {
        petXp: `Every pet you tend earns ${fmtVal(v)}% more XP, so your whole menagerie levels faster.`,
        seedLuck: `${fmtVal(v)}% better odds of finding a seed from harvests, petting and the other games.`,
        growSpeed: `Crops finish ${fmtVal(v)}% sooner.`,
        angling: `${fmtVal(v)}% better odds a cast hooks a rarer fish than it should have.`,
        reelStrength: `Every fish you land measures ${fmtVal(v)}% longer.`,
        seafaring: `+${fmtVal(v)} extra digs on every voyage.`,
    }[p.stat] || m.desc;
    // The farm stats used to be read ONLY from the equipped pet, so this said "while equipped". They stack
    // across the whole menagerie now, and the line was quietly telling members the opposite.
    const scope = "Stacks across every pet you own.";
    return { icon: m.icon, name: `+${fmtVal(v)}${isFarm ? "%" : ""} ${m.label}`, desc: `${plain} ${growth} ${scope}` };
};

// One effect row in the pet modal: an icon tile + a tiny label, the effect name, and a muted one-line detail.
function FxRow({ label, icon, name, desc, accent }) {
    return (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 11px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ flex: "0 0 auto", width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", fontSize: 15, background: "rgba(255,255,255,0.06)" }}>{icon}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: accent }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25, marginTop: 1 }}>{name}</div>
                {desc ? <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 2 }}>{desc}</div> : null}
            </div>
        </div>
    );
}

// Owner-only Farm: your owned pets wander a little pasture. On your own farm you can pet each one once a day
// for a small XP bump; you can also look up another member and watch their pets roam (view-only).
const RARITY_RING = {
    common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b",
    mythic: "#ff5cc8", ascendant: "#ff7a3c", eternal: "#22e0c8",
};
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const FARM_PAD = 6; // % margin so pets (anchored by their center) never clip off the field edges
// Fixed ring of coins that burst outward behind the pig on the haul modal (deterministic → SSR-safe).
const PIG_BURST = Array.from({ length: 12 }, (_, i) => ({ a: i * 30, d: 74 + (i % 3) * 16, t: 0.7 + (i % 4) * 0.12 }));
// ── Procedural sound (Web Audio, no asset files → CSP-safe) ─────────────────────────────────────────────────
// A tiny synth: the Loot Pig event gets a squeal, a coin-jingle per drop, a bouncy chase loop while he rampages,
// and a victory fanfare on the haul. Browsers gate audio behind a user gesture, so the farm primes the context
// on first tap (see FarmClient) and every play is best-effort — silence, never an error, if it can't start.
let _ac = null;
function audioCtx() {
    if (typeof window === "undefined") return null;
    if (!_ac) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        try { _ac = new C(); } catch { return null; }
    }
    if (_ac.state === "suspended") _ac.resume().catch(() => {});
    return _ac;
}
function tone(freq, at, dur, type = "sine", peak = 0.14) {
    const a = audioCtx();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(a.destination);
    o.start(at);
    o.stop(at + dur + 0.03);
}
let _pigMusic = null;
const SFX = {
    prime() { audioCtx(); },
    coin() {
        const a = audioCtx();
        if (!a) return;
        const t = a.currentTime;
        tone(1180, t, 0.11, "square", 0.06);
        tone(1760, t + 0.045, 0.12, "square", 0.045);
    },
    oink() {
        const a = audioCtx();
        if (!a) return;
        const t = a.currentTime;
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(300, t);
        o.frequency.linearRampToValueAtTime(780, t + 0.09);
        o.frequency.linearRampToValueAtTime(210, t + 0.28);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(g).connect(a.destination);
        o.start(t);
        o.stop(t + 0.36);
    },
    fanfare() {
        const a = audioCtx();
        if (!a) return;
        const t = a.currentTime;
        [0, 4, 7, 12].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), t + i * 0.11, 0.34, "triangle", 0.13));
        tone(1046.5, t + 0.52, 0.55, "triangle", 0.1);
    },
    startPigMusic() {
        SFX.stopPigMusic();
        const a = audioCtx();
        if (!a) return;
        const bass = [130.81, 130.81, 196.0, 174.61]; // bouncy C–C–G–F chase motif
        let i = 0;
        const beat = () => {
            const c = audioCtx();
            if (!c) return;
            const t = c.currentTime;
            const f = bass[i % bass.length];
            tone(f, t, 0.15, "triangle", 0.05);
            tone(f * 2, t + 0.085, 0.09, "square", 0.028);
            i += 1;
        };
        beat();
        _pigMusic = setInterval(beat, 250);
    },
    stopPigMusic() {
        if (_pigMusic) { clearInterval(_pigMusic); _pigMusic = null; }
    },
};

// ── Real-world sky + weather ──────────────────────────────────────────────────────────────────────────────
const hourToTod = (h, isDay = true) => {
    if (!isDay) return "night";
    if (h >= 5 && h < 7) return "dawn";
    if (h >= 7 && h < 17) return "day";
    if (h >= 17 && h < 20) return "dusk";
    return "night";
};
// WMO weather codes (Open-Meteo) → a simple condition bucket.
const wmoToCondition = (code) => {
    if (code == null) return "clear";
    if ([45, 48].includes(code)) return "fog";
    if ([95, 96, 99].includes(code)) return "storm";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
    if ([1, 2, 3].includes(code)) return "cloudy";
    return "clear";
};
const SKY = {
    dawn: ["#f7b267", "#f9dcb0", "#bfe0ee"],
    day: ["#7ec2f0", "#a9d8f5", "#d7eefb"],
    dusk: ["#e08a54", "#c77b9e", "#5b6fa8"],
    night: ["#1a2c4a", "#243660", "#3a4f7d"],
};
const skyStops = (tod, condition) => {
    if (condition === "storm") return ["#3a4048", "#4a5058", "#727a84"];
    return SKY[tod] || SKY.day;
};
const grassStops = (tod) => (tod === "night" ? ["#3f6b3a", "#274c28"] : tod === "dusk" ? ["#6fa858", "#4d8c3c"] : ["#86ce69", "#63b048"]);
const CONDITION_META = { clear: ["☀️", "Clear"], cloudy: ["☁️", "Cloudy"], rain: ["🌧️", "Rain"], snow: ["❄️", "Snow"], fog: ["🌫️", "Fog"], storm: ["⛈️", "Storm"] };
const TOD_LABEL = { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" };
// A short label for the current sky: real weather when we have the visitor's location, else just time of day.
const weatherLabel = (w) => {
    const tod = TOD_LABEL[w.tod] || "Day";
    if (!w.located) return `${w.tod === "night" ? "🌙" : "🕐"} ${tod}`;
    const [emoji, label] = CONDITION_META[w.condition] || CONDITION_META.clear;
    return `${w.tod === "night" && w.condition === "clear" ? "🌙" : emoji} ${label} · ${tod}`;
};
// Full field background: sky (top) blending into grass at the horizon. Uniform across the width, so it tiles
// seamlessly no matter how far you scroll.
const fieldBackground = (tod, condition) => {
    const s = skyStops(tod, condition);
    const g = grassStops(tod);
    return `linear-gradient(180deg, ${s[0]} 0%, ${s[1]} 36%, ${s[2]} 50%, ${g[0]} 60%, ${g[1]} 100%)`;
};
// Illustrated weather/time backdrops for the OUTSIDE pasture (the originals — single images, shown as a cover).
const FARM_BG = {
    day: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838066440-671862.png",
    dusk: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838089019-734565.png",
    night: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838349373-318702.png",
    dawn: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838132569-798406.png",
    storm: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838156570-858112.png",
    snow: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838178566-149863.png",
};
const pickFarmBg = (tod, condition) =>
    (condition === "storm" && FARM_BG.storm) || (condition === "snow" && FARM_BG.snow) || FARM_BG[tod] || FARM_BG.day || null;
// Fixed straight-on backdrops for Inside (barn) and Garden — single images, shown as a cover (no wide scroll).
const VIEW_BG = {
    inside: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-views/barn-inside-flat-1785108049136.png",
    garden: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-views/garden-beds-flat-1785108098669.png",
};

export default function FarmClient({ initial, viewingAlias }) {
    const router = useRouter();
    const [farm, setFarm] = useState(initial);
    const pets = useMemo(() => farm.pets || [], [farm.pets]);
    // Live pet-charge nudge — recomputed from the budget left ∩ pets not yet petted, so the banner + tab badges
    // clear the instant you pet (the server's petNudge is only the starting value at load).
    const petsUnpetted = useMemo(() => pets.filter((p) => !p.petted).length, [pets]);
    const liveNudge = farm.mine ? Math.max(0, Math.min(farm.petting?.left ?? farm.petNudge ?? 0, petsUnpetted)) : 0;
    const todoCount = farm.mine ? (farm.rating?.charge?.left ?? 0) + (farm.petting?.others?.left ?? 0) : 0;
    // Pets roam the FULL width of the backdrop now that the garden is its own view (no crops to avoid) — evenly
    // spread from the left edge to the right so they're never bunched or missing from the left side.
    const petMinX = FARM_PAD; // left edge of the pets' roaming band
    // Each pet gets a "home" slot spread evenly across its band and wanders around it. Deterministic init so
    // server & client HTML match (no hydration mismatch); the scheduler takes over on mount.
    const petSlotX = useCallback((idx, count) => (count <= 1 ? 50 : petMinX + (idx / (count - 1)) * (100 - FARM_PAD - petMinX)), [petMinX]);
    // Each view (Outside/Inside) shows every OTHER pet, so spread by the pet's slot WITHIN its own view (even →
    // Outside, odd → Inside) — not the global index — so BOTH views fill the full width evenly and the first pet
    // in each always sits at the far-left edge (never bunched on the right).
    const viewSlotOf = useCallback((i, n) => ({ idx: Math.floor(i / 2), count: i % 2 === 0 ? Math.ceil(n / 2) : Math.floor(n / 2) }), []);
    const homeX = useCallback((i) => { const s = viewSlotOf(i, pets.length); return petSlotX(s.idx, s.count); }, [petSlotX, viewSlotOf, pets.length]);
    const [pos, setPos] = useState(() => pets.map((_, i) => {
        const s = viewSlotOf(i, pets.length);
        return {
            x: petSlotX(s.idx, s.count),
            y: 82 + ((i * 5) % 9), // grounded on the grass (spread is HORIZONTAL — see the wide field below)
            flip: i % 2 === 1,
            dur: 2, // seconds for the current stroll (varies per move → different speeds)
            moving: false,
            hopMs: 420 + ((i * 53) % 220), // this pet's personal hop cadence (stable)
        };
    }));
    const [floaters, setFloaters] = useState([]);
    const floatId = useRef(0);
    const [busy, setBusy] = useState(null);
    const [inspect, setInspect] = useState(null); // the pet whose detail card is open
    const [ownerMenu, setOwnerMenu] = useState(false); // farmer character tapped → connect menu
    const [customOpen, setCustomOpen] = useState(false); // custom-decoration creator
    const [pig, setPig] = useState(null); // "running" while the loot pig is on screen
    const [pigToast, setPigToast] = useState(false);
    const [pigResult, setPigResult] = useState(null); // the haul modal after he leaves

    // ── Garden (crops live IN the pasture) ── state is lifted up here so the growing plots render inside the
    // scrolling field, while a compact controls panel below shares the exact same live garden.
    const [garden, setGarden] = useState(initial.garden || null);
    // ── WHICH PANEL IS OPEN, AND WHAT THE CLOSED ONES ARE HIDING ────────────────────────────────────────────
    // Tabs only stop being a filing cabinet if the closed drawers can still shout. Today counts the daily
    // charges you have not spent (ratings + a neighbour's pettings); Garden counts crops standing ready. Both
    // are derived from live state, so a badge clears the moment you spend the thing rather than on next load.
    const [panel, setPanel] = useState("today"); // 'today' | 'garden' | 'standing' — own farm only
    const readyCrops = Number(garden?.readyCount) || 0;
    const [gardenBusy, setGardenBusy] = useState(null);
    const [bountyTick, setBountyTick] = useState(0); // bumps after a mission-progressing action → FeatureDailies re-fetches
    const [planting, setPlanting] = useState(null); // slot awaiting a seed choice → opens the picker modal
    const [upgradePlot, setUpgradePlot] = useState(null); // slot whose specialization tracks are open
    const [inspectSlot, setInspectSlot] = useState(null); // a growing plot being inspected (crop details + fertilize)
    const [inspectDeco, setInspectDeco] = useState(null); // a placed decoration being inspected (details + pick up)
    const [harvestToast, setHarvestToast] = useState(null); // harvest / rain reward modal
    const [encounter, setEncounter] = useState(null); // a creature raided a harvest → timing-meter fight
    const [recap, setRecap] = useState(null); // once-a-day "your pets earned X while you were away" recap
    const rainedRef = useRef(false);
    // Once-a-day passive-income recap — "while you were away, your pets earned…" (own farm only).
    const recapRef = useRef(false);
    useEffect(() => {
        if (!farm?.mine || recapRef.current) return;
        recapRef.current = true;
        fetch("/api/marketplace/pet-income/recap", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.show && (d.xp > 0 || d.gold > 0)) setRecap(d); }).catch(() => {});
    }, [farm?.mine]);

    // ── THE WILD LOOT PIG ────────────────────────────────────────────────────────────────────────────────
    // WHEN he turns up is decided on the server now (see pigHourFor in farm.js): a different hour every day,
    // per member, unknowable in advance. `pigAvailable` already means "unclaimed AND he has arrived", so this
    // only stages the entrance.
    //
    // The 70% coin flip that used to live here is GONE. It was a second layer of randomness on top of the
    // first, and once the arrival time is the surprise, a roll that sometimes eats him as well just reads as
    // the game being arbitrary — you cannot learn a rule that fails three visits in ten for no reason. If
    // he is on the farm, you see him.
    useEffect(() => {
        if (!initial.mine || !initial.pigAvailable) return undefined;
        const t = setTimeout(() => {
            setPig("running");
            setPigToast(true);
            SFX.oink();
            SFX.startPigMusic();
            setTimeout(() => setPigToast(false), 4200);
        }, 2500 + Math.random() * 5000);
        return () => clearTimeout(t);
    }, [initial.mine, initial.pigAvailable]);
    // Kill the pig chase-music if we unmount mid-rampage.
    useEffect(() => () => SFX.stopPigMusic(), []);
    // Prime the audio context on the visitor's first interaction (browsers gate Web Audio behind a gesture).
    useEffect(() => {
        const prime = () => SFX.prime();
        window.addEventListener("pointerdown", prime, { once: true });
        window.addEventListener("keydown", prime, { once: true });
        return () => { window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
    }, []);
    // Lock the page behind an open modal (pet detail or pig haul). `overflow:hidden` alone doesn't hold on
    // mobile — the background still scrolls under a fixed overlay — so we pin the body with position:fixed and
    // restore the exact scroll position on close.
    useEffect(() => {
        if (typeof document === "undefined" || !(inspect || pigResult || harvestToast || encounter || planting != null || upgradePlot != null || inspectSlot != null || inspectDeco || customOpen)) return undefined;
        const scrollY = window.scrollY;
        const body = document.body;
        const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
        body.style.position = "fixed";
        body.style.top = `-${scrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        return () => {
            body.style.position = prev.position;
            body.style.top = prev.top;
            body.style.left = prev.left;
            body.style.right = prev.right;
            body.style.width = prev.width;
            window.scrollTo(0, scrollY);
        };
    }, [inspect, pigResult, harvestToast, encounter, planting, upgradePlot, inspectSlot, inspectDeco, customOpen]);
    // Real-world sky + weather. Starts as a plain daytime sky (matches SSR), then fills in from the device clock
    // and — if the visitor allows location — live conditions (rain / snow / fog + day-night) via Open-Meteo.
    const [weather, setWeather] = useState({ tod: "day", condition: "clear", isDay: true, located: false });
    useEffect(() => {
        const t0 = setTimeout(() => setWeather((w) => ({ ...w, tod: hourToTod(new Date().getHours()) })), 0);

        // Only 3 of ~1000 visitors have ever granted location, so gating the weather call on permission left the
        // farm permanently sunny for essentially everyone. The Den's own coordinates are the fallback: real
        // weather for all, and granting location just upgrades it to YOUR weather.
        const DEN = { lat: 44.4383, lon: -93.5836 };
        const load = async ({ lat, lon }, located) => {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=weather_code,is_day&timezone=auto`)
                .then((x) => (x.ok ? x.json() : null))
                .catch(() => null);
            const cur = r?.current;
            if (!cur) return;
            const isDay = cur.is_day === 1;
            setWeather({ tod: hourToTod(new Date().getHours(), isDay), condition: wmoToCondition(cur.weather_code), isDay, located });
        };

        if (typeof navigator === "undefined" || !navigator.geolocation) { load(DEN, false); return () => clearTimeout(t0); }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords || {};
                if (latitude == null) { load(DEN, false); return; }
                load({ lat: latitude, lon: longitude }, true);
            },
            () => load(DEN, false), // denied or timed out → the weather over the shop
            { timeout: 8000, maximumAge: 1800000 }
        );
    }, []);

    // INDEPENDENT wander: every pet runs its OWN loop — random start delay, random stroll distance around its
    // home slot, random duration (speed), then a random pause before the next hop. So they never move/stop in
    // lockstep. While moving they bounce (hop); when idle they do a slow bob.
    useEffect(() => {
        if (!pets.length) return undefined;
        const timers = [];
        const push = (t) => timers.push(t);
        const step = (i) => {
            const nx = clamp(homeX(i) + rand(-7, 7), petMinX, 100 - FARM_PAD); // roam widely around its home column
            const ny = 80 + rand(0, 12); // stay grounded on the grass
            const dur = rand(1.3, 3.8); // different speeds each hop
            setPos((prev) => {
                if (!prev[i]) return prev;
                const next = prev.slice();
                next[i] = { ...prev[i], x: nx, y: ny, flip: nx < prev[i].x, dur, moving: true };
                return next;
            });
            push(setTimeout(() => {
                setPos((prev) => {
                    if (!prev[i]) return prev;
                    const next = prev.slice();
                    next[i] = { ...prev[i], moving: false };
                    return next;
                });
                push(setTimeout(() => step(i), rand(500, 3000))); // idle pause, then wander again
            }, dur * 1000));
        };
        pets.forEach((_, i) => push(setTimeout(() => step(i), rand(150, 1800)))); // staggered starts
        return () => timers.forEach(clearTimeout);
        // Keyed on count only — we deliberately DON'T restart the wander loops when `pets` identity changes
        // (e.g. after petting), which would reset every pet's position mid-stroll.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pets.length, homeX]);

    const addFloater = useCallback((i, text, color) => {
        const id = ++floatId.current;
        const at = pos[i] || { x: 50, y: 60 };
        setFloaters((f) => [...f, { id, x: at.x, y: at.y, text, color }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1300);
    }, [pos]);

    const post = useCallback(async (body) => {
        const res = await fetch("/api/marketplace/farm", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        const json = res ? await res.json().catch(() => null) : null;
        // Nudge the daily-bounty card to re-check after any mission-progressing action, so it flips to "Claim"
        // live instead of only after a page refresh.
        if (json?.ok && ["plant", "harvest", "pet", "fertilizer_use", "pack_open", "rain"].includes(body?.action)) setBountyTick((t) => t + 1);
        return json;
    }, []);

    // Live farm presence: keep-alive ping so the owner sees visitors (and a visitor sees themself here), refreshed
    // every 15s. Uses the friend's @handle when visiting so the ping lands on THEIR farm.
    useEffect(() => {
        let alive = true;
        const ping = async () => {
            const r = await post({ action: "farm_ping", owner: farm.mine ? undefined : farm.owner?.alias }).catch(() => null);
            if (alive && r?.ok && Array.isArray(r.visitors)) setFarm((f) => ({ ...f, visitors: r.visitors }));
        };
        // Presence keep-alive — paused while hidden, so a pocketed phone stops claiming to be on the farm.
        const t = setInterval(() => { if (document.visibilityState === "visible") ping(); }, 15000);
        return () => { alive = false; clearInterval(t); };
    }, [post, farm.mine, farm.owner?.alias]);

    const petIt = useCallback(async (pet) => {
        if (!farm.canPet || pet.petted || busy) return;
        const i = pets.findIndex((p) => p.id === pet.id);
        setBusy(pet.id);
        const r = await post({ action: "pet", petId: pet.id, owner: farm.mine ? undefined : farm.owner?.alias });
        setBusy(null);
        if (r?.petting) setFarm((f) => ({ ...f, petting: r.petting }));
        if (r?.ok) {
            const patch = { petted: true, level: r.level, xp: r.xp, into: r.into, span: r.span, maxed: r.maxed };
            setFarm((f) => ({ ...f, pets: f.pets.map((p) => (p.id === pet.id ? { ...p, ...patch } : p)), wallet: f.wallet ? { ...f.wallet, gold: f.wallet.gold + (r.goldGained || 0) } : f.wallet }));
            setInspect((cur) => (cur && cur.id === pet.id ? { ...cur, ...patch } : cur));
            if (i >= 0) addFloater(i, `+${r.xpGained} XP · +${r.goldGained}g`, "#ffe27a");
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } // update the nav farm badge
        } else if (r?.error === "already_petted") {
            setFarm((f) => ({ ...f, pets: f.pets.map((p) => (p.id === pet.id ? { ...p, petted: true } : p)) }));
            setInspect((cur) => (cur && cur.id === pet.id ? { ...cur, petted: true } : cur));
        }
    }, [farm.canPet, farm.mine, farm.owner, busy, addFloater, pets, post]);

    const rechargeBudget = useCallback(async () => {
        if (busy) return;
        setBusy("recharge");
        const r = await post({ action: "recharge" });
        setBusy(null);
        if (r?.petting) setFarm((f) => ({ ...f, petting: r.petting, wallet: r.wallet ? { ...f.wallet, ...r.wallet } : f.wallet }));
    }, [busy, post]);

    const buyTreatItem = useCallback(async (consumableId) => {
        if (busy) return;
        setBusy(consumableId);
        const r = await post({ action: "buy_treat", consumableId });
        setBusy(null);
        if (r?.ok) setFarm((f) => ({ ...f, treats: r.treats, treatShop: r.treatShop, wallet: r.wallet }));
    }, [busy, post]);

    // The pig ran off screen → claim the haul (server-guarded once/day) and show the juiced modal.
    const onPigFinish = useCallback(async () => {
        setPig(null);
        SFX.stopPigMusic();
        const r = await post({ action: "pig_claim" });
        if (r?.ok) {
            setPigResult(r);
            SFX.fanfare();
            setFarm((f) => ({ ...f, pigAvailable: false, wallet: f.wallet && r.goldAfter != null ? { ...f.wallet, gold: r.goldAfter } : f.wallet }));
        }
    }, [post]);

    // Feed a treat (consumable) to a specific pet.
    const feedTreat = useCallback(async (pet, consumableId) => {
        if (!farm.canPet || busy) return;
        const i = pets.findIndex((p) => p.id === pet.id);
        setBusy(consumableId);
        const r = await fetch("/api/marketplace/farm", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "use_item", petId: pet.id, consumableId, owner: farm.mine ? undefined : farm.owner?.alias }),
        }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        setBusy(null);
        if (!r?.ok) return;
        const patch = { level: r.level, xp: r.xp, into: r.into, span: r.span, maxed: r.maxed };
        setFarm((f) => ({
            ...f,
            pets: f.pets.map((p) => (p.id === pet.id ? { ...p, ...patch } : p)),
            treats: (f.treats || []).map((t) => (t.id === consumableId ? { ...t, count: t.count - 1 } : t)).filter((t) => t.count > 0),
            // Feeding a friend's pet pays the feeder a small generosity bonus.
            wallet: f.wallet && r.goldGained ? { ...f.wallet, gold: f.wallet.gold + r.goldGained } : f.wallet,
        }));
        setInspect((cur) => (cur && cur.id === pet.id ? { ...cur, ...patch } : cur));
        if (i >= 0) addFloater(i, r.petLevelUp ? "★ LEVEL UP!" : r.forOther ? `+${r.playerXp} XP · +${r.goldGained}g 💛` : `+${r.petXpGain || ""} XP`, "#ffe27a");
        if (r.petLevelUp) dispatchPetLevelUp(r.petLevelUp); // handed to the ONE global celebration modal
    }, [farm.canPet, farm.mine, farm.owner, busy, addFloater, pets]);

    // ── Garden actions ── every response returns the fresh garden so the in-scene plots + the controls panel
    // stay in lockstep. Only wired on your own farm.
    const gardenAct = useCallback(async (body, key) => {
        setGardenBusy(key);
        const r = await post(body);
        setGardenBusy(null);
        if (r?.garden) setGarden(r.garden);
        return r;
    }, [post]);
    const plantSeedAt = useCallback(async (slot, seedId) => { setPlanting(null); await gardenAct({ action: "plant", slot, seedId }, `p-${slot}`); }, [gardenAct]);
    const openPack = useCallback(async (packId) => {
        const r = await gardenAct({ action: "pack_open", packId }, `pk-${packId}`);
        if (r?.ok) SFX?.coin?.();
        return r;
    }, [gardenAct]);
    // Buy a seed pack right here (no shop trip) — spends gold, opens it, seeds land in the bag. Updates the wallet.
    const buySeedPack = useCallback(async (packId) => {
        const r = await gardenAct({ action: "seedpack_buy", packId }, `bp-${packId}`);
        if (r?.ok) { SFX?.coin?.(); if (r.gold != null) setFarm((f) => (f.wallet ? { ...f, wallet: { ...f.wallet, gold: r.gold } } : f)); }
        return r;
    }, [gardenAct]);
    const harvestAt = useCallback(async (slot) => {
        const r = await gardenAct({ action: "harvest", slot }, `h-${slot}`);
        if (r?.ok) {
            SFX.coin();
            const harvest = { name: r.name, emoji: r.emoji, gold: r.gold, doubled: r.doubled, xp: r.xp, petFed: r.petFed, newPet: r.newPet, chest: r.chest, bonus: r.bonus, savedSeed: r.savedSeed, savedEmoji: r.savedEmoji, foundSeed: r.foundSeed };
            // A creature raided this harvest → fight it (the reward toast comes after the fight). Otherwise the
            // normal harvest reward toast.
            if (r.encounter) setEncounter({ ...r.encounter, harvest });
            else setHarvestToast(harvest);
        }
    }, [gardenAct]);
    const fertilizeAt = useCallback((slot) => gardenAct({ action: "fertilizer_use", slot }, `f-${slot}`), [gardenAct]);
    const upgradePlotAt = useCallback((slot, key) => gardenAct({ action: "plot_upgrade", slot, key }, `pu-${slot}-${key}`), [gardenAct]);
    // Claim a harvest critter's gift (pure upside — server grants the pre-rolled XP + gold + loot). Updates wallet.
    const resolveEncounterAt = useCallback(async () => {
        const r = await gardenAct({ action: "encounter_resolve" }, "enc");
        if (r?.ok) { try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } if (r.goldAfter != null) setFarm((f) => (f.wallet ? { ...f, wallet: { ...f.wallet, gold: r.goldAfter } } : f)); }
        return r;
    }, [gardenAct]);
    const buyFert = useCallback(() => gardenAct({ action: "fertilizer_buy" }, "fbuy"), [gardenAct]);
    const buyUpgradeKey = useCallback((key) => gardenAct({ action: "farm_upgrade", key }, `u-${key}`), [gardenAct]);
    // Drag a plot to a new spot (own farm, in move mode) so you can arrange them without overlap. Optimistic.
    const movePlotTo = useCallback(async (slot, x, y) => {
        let prev = null;
        setGarden((g) => {
            if (!g?.plots) return g;
            const cur = g.plots.find((p) => p.slot === slot);
            prev = cur ? { x: cur.x, y: cur.y } : null;
            return { ...g, plots: g.plots.map((p) => (p.slot === slot ? { ...p, x, y } : p)) };
        });
        const r = await post({ action: "plot_move", slot, x, y });
        if (r?.garden) setGarden(r.garden);
        else if (prev) setGarden((g) => (g?.plots ? { ...g, plots: g.plots.map((p) => (p.slot === slot ? { ...p, x: prev.x, y: prev.y } : p)) } : g));
        return r;
    }, [post]);

    // FINDING SOMEBODY'S FARM. The visitors strip shows who came to see YOU; consolidating the page took away
    // the only route in the other direction, so there was no way to go and look at anyone else's. `?u=<alias>`
    // still worked — nothing led to it. The board was already here and already ranked; it just needed to be
    // searchable and its rows needed to go somewhere.
    const [farmQuery, setFarmQuery] = useState("");
    const [farmHits, setFarmHits] = useState(null);
    const [farmSeeking, setFarmSeeking] = useState(false);
    useEffect(() => {
        const q = farmQuery.trim();
        if (q.length < 2) { setFarmHits(null); return undefined; }
        let dead = false;
        setFarmSeeking(true);
        const t = setTimeout(() => {
            fetch(`/api/marketplace/farm-ratings?q=${encodeURIComponent(q)}`, { cache: "no-store" })
                .then((r) => r.json())
                .then((d) => { if (!dead) setFarmHits(Array.isArray(d?.farms) ? d.farms : []); })
                .catch(() => { if (!dead) setFarmHits([]); })
                .finally(() => { if (!dead) setFarmSeeking(false); });
        }, 220);
        return () => { dead = true; clearTimeout(t); };
    }, [farmQuery]);

    // Rate (like/love/admire) the farm you're visiting. Revising your rating is free; a brand-new rating spends
    // your one daily charge. Patches the summary in place with a juicy burst.
    const [rateBusy, setRateBusy] = useState(false);
    const [rateBurst, setRateBurst] = useState(null); // tier just applied → one-shot burst overlay
    const [rateNote, setRateNote] = useState(null); // e.g. "out of daily charges"
    const rateFarmAt = useCallback(async (tier) => {
        const R = farm.rating;
        if (!R?.canRate || rateBusy) return;
        // Rated them today = done with this farm until tomorrow, whichever tier is tapped. Ratings re-arm
        // daily, and "admire them again" is by definition tapping the same tier you last gave, so this must
        // key off the DAY and not off the tier — an earlier version keyed off the tier and swallowed exactly
        // that tap; the version after it let the other two tiers through and spent a charge per tap.
        if (R.ratedToday) return;
        if ((R.charge?.left ?? 0) <= 0) { setRateNote("You're out of ratings for today — come back tomorrow."); return; } // new, repeat OR change all need a charge
        setRateBusy(true);
        setRateNote(null);
        const r = await post({ action: "rate", tier, owner: farm.owner?.alias });
        setRateBusy(false);
        if (!r?.ok) {
            if (r?.error === "no_charge_left") setRateNote("You're out of ratings for today — come back tomorrow.");
            return;
        }
        setRateBurst({ tier, id: Date.now() });
        setTimeout(() => setRateBurst((b) => (b && b.tier === tier ? null : b)), 950);
        SFX.coin();
        setFarm((f) => ({ ...f, rating: { ...f.rating, total: r.total, byTier: r.byTier, myTier: r.myTier, charge: r.charge, ratedToday: true } }));
    }, [farm.rating, farm.owner, rateBusy, post]);

    // Decorations — buy / place / drag-move / pick-up. Every action returns the fresh decoration state, which we
    // fold into both `decorations` (inventory) and `placements` (what renders in the scene).
    const [decoEditing, setDecoEditing] = useState(false); // default LOCKED on arrival — tap the 🔒/🔓 toggle to rearrange
    const [view, setView] = useState("outside"); // farm view: 'garden' | 'outside' | 'inside' | 'art' (declared early — decoPlaceAt reads it)
    // How many creation gifts/requests are waiting on an answer — badges the Art tab. Its own tiny fetch so the
    // badge is there before you open the tab; the hub refetches it after every action via onChanged.
    const [artPending, setArtPending] = useState(0);
    const loadArtPending = useCallback(async () => {
        try {
            const r = await fetch("/api/marketplace/creations/share", { cache: "no-store" });
            const d = r.ok ? await r.json() : null;
            setArtPending((d?.incomingGifts?.length || 0) + (d?.incomingRequests?.length || 0));
        } catch { /* the tab still works, it just won't badge */ }
    }, []);
    useEffect(() => { loadArtPending(); }, [loadArtPending]);
    const [decoBusy, setDecoBusy] = useState(false);
    const decoAct = useCallback(async (body) => {
        setDecoBusy(true);
        const sx = scrollRef.current?.scrollLeft; // remember how far the pasture is scrolled…
        const r = await post(body);
        setDecoBusy(false);
        if (r?.ok && r.owned) {
            setFarm((f) => ({
                ...f,
                placements: r.placements || f.placements,
                decorations: { owned: r.owned, placements: r.placements, buffs: r.buffs, buffMeta: r.buffMeta, keepout: r.keepout, catalog: r.catalog, placedTotal: r.placedTotal, placedCap: r.placedCap },
                // Placing or picking up the stand changes whether its panel can open at all — without this the
                // client keeps the `placed` it was rendered with and the stand is untappable until a reload.
                stand: r.stand || f.stand,
                wallet: f.wallet && r.gold != null ? { ...f.wallet, gold: r.gold } : f.wallet,
            }));
            // …and restore it after the re-render, so a piece placed while scrolled right doesn't vanish off-screen.
            if (sx != null) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = sx; });
        }
        return r;
    }, [post]);
    const decoBuy = useCallback((decoId) => decoAct({ action: "deco_buy", decoId }), [decoAct]);

    // ── Custom farm background (3 creations; generate → LIVE preview on the scene → accept/discard) ──
    const [bgOpen, setBgOpen] = useState(false);
    const [bgBusy, setBgBusy] = useState(false);
    const bgAct = useCallback(async (body) => {
        setBgBusy(true);
        const r = await post(body);
        setBgBusy(false);
        // Reflect the equipped library background (activeUrl) + any live draft preview on the scene.
        if (r && ("library" in r || "draft" in r || "activeUrl" in r)) setFarm((f) => ({ ...f, customBg: r.activeUrl ?? null, customBgDraft: r.draft ?? null }));
        return r;
    }, [post]);
    const decoPlaceAt = useCallback((decoId, x, y) => decoAct({ action: "deco_place", decoId, x, y, view }), [decoAct, view]);
    const decoMove = useCallback(async (placementId, x, y) => {
        // Optimistically move it in local state so it stays put on drop (no snap-back); reconcile / revert on the response.
        let prev = null;
        setFarm((f) => {
            const p = (f.placements || []).find((q) => q.id === placementId);
            prev = p ? { x: p.x, y: p.y } : null;
            return { ...f, placements: (f.placements || []).map((q) => (q.id === placementId ? { ...q, x, y } : q)) };
        });
        const r = await decoAct({ action: "deco_move", placementId, x, y });
        if (!r?.ok && prev) setFarm((f) => ({ ...f, placements: (f.placements || []).map((q) => (q.id === placementId ? { ...q, x: prev.x, y: prev.y } : q)) }));
        return r;
    }, [decoAct]);
    const decoPickup = useCallback((placementId) => decoAct({ action: "deco_remove", placementId }), [decoAct]);
    // Resize / rotate / light / brightness a placed decoration — optimistic so the scene updates live under the
    // inspect modal. Light is resolved client-side for the instant preview; the server returns the canonical shape.
    const decoTransform = useCallback(async (placementId, { scale, rot, flip, brightness, light }) => {
        setFarm((f) => ({ ...f, placements: (f.placements || []).map((q) => {
            if (q.id !== placementId) return q;
            const next = { ...q };
            if (scale != null) next.scale = scale;
            if (rot != null) next.rot = rot;
            if (flip != null) next.flip = flip;
            if (brightness != null) next.brightness = brightness;
            if (light) {
                if (light.on != null) next.lightOn = light.on;
                if (light.color != null) next.lightColor = light.color;
                if (light.intensity != null) next.lightIntensity = light.intensity;
                if (light.radius != null) next.lightRadius = light.radius;
                const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(next.lightColor || "");
                next.light = next.lightOn ? { on: true, always: true, rgb: rgb ? `${parseInt(rgb[1], 16)},${parseInt(rgb[2], 16)},${parseInt(rgb[3], 16)}` : "255,210,122", radius: Number(next.lightRadius ?? 70), intensity: Number(next.lightIntensity ?? 0.7), flicker: q.light?.flicker || false } : (q.light?.always ? null : q.light);
            }
            return next;
        }) }));
        return decoAct({ action: "deco_transform", placementId, scale, rot, flip, brightness, light });
    }, [decoAct]);
    const setSpriteBright = useCallback(async (value) => {
        setFarm((f) => ({ ...f, spriteBrightness: value })); // optimistic
        return decoAct({ action: "sprite_brightness", value });
    }, [decoAct]);
    const fieldRef = useRef(null);
    const scrollRef = useRef(null); // the horizontal pasture scroller — preserved across deco re-renders so a placed piece doesn't scroll away
    // The three seated companions, resolved to the sprites the pasture already draws them with — so a level-six
    // enshrined pet sits on the cushion wearing the form it actually wears. Index matches the tier order, and a
    // gap stays a gap (an empty tier renders no animal rather than shuffling the next one up).
    const standPets = useMemo(() => {
        const slots = farm?.stand?.slots || [];
        if (!slots.length) return null;
        const byId = new Map((farm?.pets || []).map((p) => [p.id, p]));
        return slots.map((s) => (s.pet ? byId.get(s.pet.id) || null : null));
    }, [farm?.stand?.slots, farm?.pets]);
    // The Petting Stand's three tiers. The whole farm state comes back so the panel, the passive and the pet
    // list all refresh together — seating a pet changes what the tiers say AND what a petting is worth.
    const standSeat = useCallback(async (slot, petId) => {
        const r = await post({ action: "stand_seat", slot, petId });
        if (r?.ok) setFarm((f) => ({ ...f, stand: { placed: r.placed, slots: r.slots, petMult: r.petMult } }));
        return r;
    }, [post]);
    const standClear = useCallback(async (slot) => {
        const r = await post({ action: "stand_clear", slot });
        if (r?.ok) setFarm((f) => ({ ...f, stand: { placed: r.placed, slots: r.slots, petMult: r.petMult } }));
        return r;
    }, [post]);
    // Custom (player-made) decorations
    const customStart = useCallback(async (name, prompt) => {
        const r = await post({ action: "deco_custom_start", name, prompt });
        if (r?.ok) setFarm((f) => ({ ...f, decorations: { ...f.decorations, custom: { ...(f.decorations?.custom || {}), credits: r.credits, draft: r.draft } } }));
        return r;
    }, [post]);
    // The refreshed draft is folded back into farm state, not just returned: the dock reads it to decide whether
    // its button says "Make your own" or "Resume your creation", and a stale copy there is the difference between
    // a member seeing their work waiting and assuming their token is gone.
    const customRefine = useCallback(async (id, correction) => {
        const r = await post({ action: "deco_custom_refine", id, correction });
        if (r?.ok && r.draft) setFarm((f) => ({ ...f, decorations: { ...f.decorations, custom: { ...(f.decorations?.custom || {}), draft: r.draft } } }));
        return r;
    }, [post]);
    // Autosave of the half-typed tweak. Deliberately does NOT touch farm state or surface errors — it fires while
    // the member is mid-sentence, and the only thing worse than a lost note is a re-render that eats a keystroke.
    const customNote = useCallback((id, note) => { post({ action: "deco_custom_note", id, note }).catch(() => {}); }, [post]);
    const customSuggest = useCallback((name) => post({ action: "deco_custom_suggest", name }), [post]);
    const customFinalize = useCallback(async (id, chosenUrl) => {
        const r = await post({ action: "deco_custom_finalize", id, chosenUrl });
        if (r?.ok && r.catalog) setFarm((f) => ({ ...f, placements: r.placements || f.placements, decorations: { owned: r.owned, placements: r.placements, buffs: r.buffs, buffMeta: r.buffMeta, keepout: r.keepout, catalog: r.catalog, custom: { ...(f.decorations?.custom || {}), draft: null }, placedTotal: r.placedTotal, placedCap: r.placedCap } }));
        return r;
    }, [post]);
    // "Decorate" opens a bottom DOCK (farm scene stays visible; drag decorations up onto it) rather than a modal.
    const [decorating, setDecorating] = useState(false);
    const startDecorating = useCallback(() => {
        setDecorating(true);
        setDecoEditing(true); // default MOVABLE — drag placed pieces to reposition; the lock toggle (top-right) locks them
        setTimeout(() => { try { fieldRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* noop */ } }, 60);
    }, []);
    const stopDecorating = useCallback(() => { setDecorating(false); setDecoEditing(false); }, []);

    // Logging in during rain surges every growing crop closer to harvest (server-guarded once per plot per 6h).
    useEffect(() => {
        if (!farm.mine || !garden || rainedRef.current) return;
        if (!["rain", "storm"].includes(weather.condition)) return;
        rainedRef.current = true;
        post({ action: "rain" }).then((r) => { if (r?.ok && r.garden) { setGarden(r.garden); if (r.boosted) setHarvestToast({ rain: r.boosted }); } });
    }, [farm.mine, garden, weather.condition, post]);

    // ── Three farm views: 🌾 Garden (plant/harvest), 🏡 Outside (pasture + your custom bg), 🛖 Inside (barn).
    // Pets auto-split by index parity (even → Outside, odd → Inside); crops live in the Garden; a decoration
    // belongs to Outside OR Inside; each view's single backdrop scrolls sideways. (`view` state declared earlier.) ──
    const petView = (i) => (i % 2 === 0 ? "outside" : "inside");
    const viewPetCount = view === "garden" ? 0 : pets.filter((_, i) => petView(i) === view).length;
    const wx = { tod: weather.tod, condition: weather.condition, located: weather.located, forced: false };
    const visTod = wx.tod;
    // Backdrop per view (single images, shown as a cover): Inside = barn, Garden = soil beds, Outside = your custom
    // bg (or the live preview) or the weather/time scene. Custom backgrounds only apply Outside.
    const customBg = view === "outside" ? (farm.customBgDraft || farm.customBg) : null;
    const bgUrl = view === "inside" ? VIEW_BG.inside
        : view === "garden" ? VIEW_BG.garden
        : (customBg || pickFarmBg(visTod, wx.condition));
    const showWeather = view === "outside"; // weather effects only in the open pasture
    const canDecorate = view !== "garden"; // decorate Outside & Inside; the Garden is just for planting
    // Sprite brightness only — NO scene tint/overlay (overlays wash the whole scene out; time-of-day mood must be
    // baked into the artwork itself). A tiny brightness nudge on the SPRITES at dusk/dawn keeps them from glowing
    // like noon against a darker painted backdrop.
    const objFilter = view === "inside" ? "none" : (visTod === "dusk" ? "brightness(0.94)" : visTod === "dawn" ? "brightness(0.98)" : "none");
    // The barn's straw floor sits lower than the open grass, so drop sprites down onto it — otherwise the hero and
    // pets float against the back wall. (Feet are anchored by translate(-50%,-100%), so a bigger y = lower = on the floor.)
    const groundShift = view === "inside" ? 13 : 0; // barn straw floor sits lower; controls moved out of the way so we can drop the animals further
    const petGroundY = (y) => Math.min(97, y + groundShift);

    // Full screen is GONE. It was a CSS overlay pinned over the viewport and it had accumulated a special case
    // everywhere it touched — its own control row, its own backdrop path, its own height rule — for a view of the
    // same farm. The windowed scene is the farm now.
    const sceneWrapRef = useRef(null);

    const sceneHeight = "min(52vh, 420px)";

    // Scene control pills (Backdrop / Decorate), in a toolbar above the scene so they never cover the animals.
    const CTRL_PILL = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999, fontWeight: 800, fontSize: 12.5, cursor: "pointer", boxShadow: "0 3px 12px rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", WebkitTapHighlightColor: "transparent", whiteSpace: "nowrap" };
    const sceneControls = (
        <>
            {farm.mine && view === "outside" ? (
                <button type="button" onClick={() => setBgOpen(true)} title="Custom farm background" style={{ ...CTRL_PILL, border: "1px solid rgba(201,162,255,0.5)", background: "linear-gradient(180deg, rgba(44,34,64,0.96), rgba(28,22,42,0.96))", color: "#d9c9ff" }}>
                    <span style={{ fontSize: 15 }} aria-hidden="true">🎨</span>Backdrop
                </button>
            ) : null}
            {farm.mine && canDecorate && farm.decorations && !decorating ? (
                <button type="button" onClick={startDecorating} title="Decorate your farm" style={{ ...CTRL_PILL, border: "1px solid rgba(126,213,126,0.55)", background: "linear-gradient(180deg, rgba(28,44,26,0.96), rgba(18,30,16,0.96))", color: "#c8f0c8" }}>
                    <span style={{ fontSize: 16 }} aria-hidden="true">🪴</span>Decorate
                </button>
            ) : null}
        </>
    );

    // Click-and-drag to scroll the pasture sideways on desktop (mouse). Touch keeps native scroll; skipped while
    // decorating so it never fights piece-dragging.
    const dragScroll = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
    // Plain handlers (not hooks) — the DOM ref mutation for scrollLeft is fine here.
    const onScrollPointerDown = (e) => {
        if (e.pointerType !== "mouse" || decoEditing) return;
        dragScroll.current = { active: true, startX: e.clientX, startScroll: scrollRef.current?.scrollLeft || 0, moved: false };
    };
    const onScrollPointerMove = (e) => {
        const d = dragScroll.current;
        if (!d.active || !scrollRef.current) return;
        const dx = e.clientX - d.startX;
        if (Math.abs(dx) > 4) d.moved = true;
        if (d.moved) {
            e.preventDefault();
            const target = d.startScroll - dx;
            requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = target; });
        }
    };
    const onScrollPointerUp = () => { dragScroll.current.active = false; };

    return (
        <div className="stack reveal">
            <style>{`
                @keyframes farmBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
                @keyframes farmSway { 0%,100% { transform: rotate(-3.5deg) } 50% { transform: rotate(3.5deg) } }
                @keyframes farmSprout { 0% { transform: translateY(6px) scale(.2); opacity: 0 } 100% { transform: translateY(0) scale(1); opacity: 1 } }
                @keyframes farmReadyRing { 0% { transform: translate(-50%,-50%) scale(.7); opacity: .6 } 100% { transform: translate(-50%,-50%) scale(1.5); opacity: 0 } }
                @keyframes farmHop { 0% { transform: translateY(0) scaleY(1) } 25% { transform: translateY(-13px) scaleY(1.05) } 55% { transform: translateY(0) scaleY(0.92) } 70% { transform: translateY(-4px) } 100% { transform: translateY(0) scaleY(1) } }
                @keyframes farmFloat { 0% { opacity: 0; transform: translate(-50%, 0) scale(.8) } 15% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -46px) scale(1.1) } }
                @keyframes farmCloud { from { transform: translateX(0) } to { transform: translateX(40px) } }
                @keyframes farmShadow { 0%,100% { transform: translateX(-50%) scale(1); opacity: .34 } 30% { transform: translateX(-50%) scale(.66); opacity: .55 } }
                @keyframes decoGlow { 0%,100% { opacity: .75; transform: translate(-50%,-50%) scale(1) } 50% { opacity: 1; transform: translate(-50%,-50%) scale(1.06) } }
                @keyframes decoFlicker { 0%,100% { opacity: .78; transform: translate(-50%,-50%) scale(1) } 25% { opacity: 1; transform: translate(-50%,-50%) scale(1.08) } 40% { opacity: .7; transform: translate(-50%,-50%) scale(.98) } 65% { opacity: .95; transform: translate(-50%,-50%) scale(1.05) } 80% { opacity: .82; transform: translate(-50%,-50%) scale(1.01) } }
                @keyframes farmRain { to { transform: translateY(480px); } }
                @keyframes farmSnow { to { transform: translateY(470px) translateX(18px); } }
                @keyframes farmFog { from { transform: translateX(-5%) } to { transform: translateX(5%) } }
                @keyframes farmFlash { 0%,90%,100% { opacity: 0 } 91% { opacity: .55 } 93% { opacity: 0 } 95% { opacity: .38 } 96% { opacity: 0 } }
                @keyframes pigBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
                @keyframes crownJiggle { 0%,100% { transform: translateX(-50%) rotate(-11deg); } 50% { transform: translateX(-50%) rotate(11deg); } }
                @keyframes coinPop { 0% { opacity: 0; transform: translate(-50%, -22px) scale(.4) rotate(0deg); } 25% { opacity: 1; } 100% { opacity: 1; transform: translate(-50%, 0) scale(1) rotate(360deg); } }
                @keyframes pigPop { 0% { opacity: 0; transform: scale(.82); } 60% { transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
                @keyframes encShake { 0%,100% { transform: rotate(0) scale(1); } 20% { transform: rotate(-9deg) scale(1.08); } 45% { transform: rotate(8deg) scale(1.06); } 70% { transform: rotate(-5deg) scale(1.03); } }
                @keyframes encSpark { 0% { opacity: 0; transform: translateY(6px) scale(.4); } 25% { opacity: 1; transform: translateY(-6px) scale(1.2); } 100% { opacity: 0; transform: translateY(-30px) scale(.7); } }
                @keyframes farmConfetti { 0% { transform: translateY(-10px) rotate(0); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(88vh) rotate(560deg); opacity: .9; } }
                /* Juiced plot-detail buttons — pressable depth, hover lift, a sheen sweep on the primary actions. */
                .fm-btn { position: relative; overflow: hidden; width: 100%; border: none; border-radius: 12px; font-weight: 900; font-size: 14.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 13px; transition: transform .09s ease, box-shadow .09s ease, filter .12s ease; }
                .fm-btn:hover:not(:disabled) { filter: brightness(1.05); }
                .fm-btn:active:not(:disabled) { transform: translateY(2px); }
                .fm-btn:disabled { opacity: .5; cursor: default; box-shadow: none !important; filter: grayscale(.3); }
                .fm-btn-harvest { color: #06311f; background: linear-gradient(180deg,#5ff0a2,#2fae72); box-shadow: 0 4px 0 #1c7a4f; }
                .fm-btn-harvest:active:not(:disabled) { box-shadow: 0 2px 0 #1c7a4f; }
                .fm-btn-fert { color: #052540; background: linear-gradient(180deg,#8cc7ff,#4a93e0); box-shadow: 0 4px 0 #2f6bb0; }
                .fm-btn-fert:active:not(:disabled) { box-shadow: 0 2px 0 #2f6bb0; }
                .fm-btn-spec { color: #3a2705; background: linear-gradient(180deg,#ffe27a,#e0a12f); box-shadow: 0 4px 0 #a8791f; }
                .fm-btn-spec:active:not(:disabled) { box-shadow: 0 2px 0 #a8791f; }
                /* Specialize = a purpose-built "upgrade row" CTA: star medallion + two-line label + chevron. */
                .fm-btn-upgrade { justify-content: flex-start; gap: 11px; padding: 11px 13px; text-align: left; }
                .fm-up-star { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; background: rgba(58,39,5,0.16); font-size: 17px; flex: 0 0 auto; box-shadow: inset 0 0 0 1px rgba(58,39,5,0.18); }
                .fm-up-text { display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-width: 0; }
                .fm-up-title { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 900; line-height: 1.12; }
                .fm-up-lvl { font-size: 10.5px; font-weight: 900; letter-spacing: .02em; padding: 1px 7px; border-radius: 999px; background: rgba(58,39,5,0.2); }
                .fm-up-sub { font-size: 11px; font-weight: 700; opacity: 0.72; line-height: 1.15; }
                .fm-up-chev { font-size: 21px; font-weight: 900; opacity: 0.55; flex: 0 0 auto; line-height: 1; }
                .fm-btn-close { color: inherit; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.16); padding: 11px; font-size: 13px; }
                .fm-btn-close:hover { background: rgba(255,255,255,0.09); }
                .fm-sheen::after { content: ""; position: absolute; top: 0; left: -70%; width: 45%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); transform: skewX(-18deg); animation: fmSheen 3.6s ease-in-out infinite; pointer-events: none; }
                @keyframes fmSheen { 0%, 100% { left: -70%; } 55% { left: 150%; } }
                .farm-petnudge { margin: 6px 0 0; padding: 8px 14px; border-radius: 999px; text-align: center; font-size: 0.82rem; font-weight: 800; color: #ffe9c4; background: linear-gradient(180deg, rgba(80,52,24,0.9), rgba(52,32,14,0.9)); border: 1px solid rgba(255,190,120,0.5); box-shadow: 0 2px 10px rgba(0,0,0,0.4); animation: petNudgePulse 2s ease-in-out infinite; }
                .farm-petnudge b { color: #ffd75e; }
                @keyframes petNudgePulse { 0%,100% { box-shadow: 0 2px 10px rgba(0,0,0,0.4), 0 0 0 0 rgba(255,190,120,0.0); } 50% { box-shadow: 0 2px 10px rgba(0,0,0,0.4), 0 0 14px 2px rgba(255,190,120,0.4); } }
                .farm-visitor { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; z-index: 6; pointer-events: none; animation: farmBob 2.8s ease-in-out infinite; }
                .farm-visitor img { width: 60px; height: 60px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.55)); }
                .farm-visitor-fallback { font-size: 44px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
                .farm-visitor-name { font-size: 10px; font-weight: 800; color: #f2ead9; background: rgba(20,14,30,0.72); border-radius: 999px; padding: 1px 8px; margin-bottom: 2px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
                .farm-visitor.is-you .farm-visitor-name { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
                @keyframes rateBurstAnim { 0% { transform: translate(-50%,-50%) scale(.4); opacity: 0; } 25% { opacity: 1; } 55% { transform: translate(-50%,-60%) scale(1.7); opacity: 1; } 100% { transform: translate(-50%,-140%) scale(1.9); opacity: 0; } }
                @keyframes ratePulse { 0%,100% { transform: scale(1); } 45% { transform: scale(1.18); } }
                @keyframes rateStars { 0% { opacity: 0; transform: translateY(0) scale(.5); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(-26px) scale(1.1); } }
                @keyframes haulShake { 0%,100% { transform: translate(0,0) } 15% { transform: translate(-6px,2px) rotate(-1deg) } 30% { transform: translate(6px,-2px) rotate(1deg) } 45% { transform: translate(-5px,1px) } 60% { transform: translate(5px,-1px) } 75% { transform: translate(-3px,1px) } 90% { transform: translate(2px,0) } }
                @keyframes haulGlow { 0% { transform: scale(.4); opacity: .9 } 100% { transform: scale(2.4); opacity: 0 } }
                @keyframes haulSweep { 0% { transform: translateX(-160%) skewX(-18deg) } 100% { transform: translateX(260%) skewX(-18deg) } }
                @keyframes haulBurst { 0% { opacity: 1; transform: translate(-50%,-50%) rotate(var(--r)) translateY(0) scale(.5) } 70% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--r)) translateY(var(--d)) scale(1.15) } }
                @keyframes goldCount { 0% { transform: scale(.4); opacity: 0 } 55% { transform: scale(1.25) } 100% { transform: scale(1); opacity: 1 } }
                @keyframes overlayFade { from { opacity: 0 } to { opacity: 1 } }
                .farm-hop { animation-name: farmHop; animation-timing-function: ease-in-out; animation-iteration-count: infinite; transform-origin: bottom center; }
                .farm-idle { animation: farmBob 2.8s ease-in-out infinite; transform-origin: bottom center; }
                .farm-shadow-hop { animation-name: farmShadow; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
                .farm-scroll { scrollbar-width: thin; }
                /* Illustrated backdrop tiled with the mirror trick: [A A' A A'] — every other copy flipped, so
                   each junction's edges match and there's no seam even with non-tiling art (same as the sailing sky). */
                .farm-bg-strip { position: absolute; inset: 0; z-index: 0; display: flex; width: max-content; min-width: 100%; }
                .farm-bg-strip img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; pointer-events: none; user-select: none; }
                .farm-bg-strip img:nth-child(even) { transform: scaleX(-1); }
                /* IN-FLOW mirror strip — sets the field's scrollable width (3 copies, every other flipped → seamless). */
                .farm-bg-tiled { display: flex; height: 100%; width: max-content; user-select: none; }
                .farm-bg-tiled img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; pointer-events: none; user-select: none; }
                .farm-bg-tiled img:nth-child(even) { transform: scaleX(-1); }
                /* Juicy candy-gold button with a springy 3D press — for the friendly farm actions. */
                .farm-jbtn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 999px; font-weight: 800; font-size: 14px; cursor: pointer; border: 1px solid rgba(255,214,110,0.6); background: linear-gradient(180deg, #ffe488, #f3b23a); color: #3a2c08; box-shadow: 0 3px 0 #b57f22, 0 6px 14px rgba(0,0,0,0.35); transition: transform .12s cubic-bezier(.2,1.4,.4,1), box-shadow .12s ease, filter .12s ease; }
                .farm-jbtn:hover { filter: brightness(1.05); transform: translateY(-1px); box-shadow: 0 4px 0 #b57f22, 0 9px 18px rgba(0,0,0,0.42); }
                .farm-jbtn:active { transform: translateY(2px); box-shadow: 0 1px 0 #b57f22, 0 3px 8px rgba(0,0,0,0.35); }
                /* Floating in-scene decorate button — a gentle bob to invite the tap. */
                .farm-deco-fab { transition: transform .12s ease, filter .12s ease, box-shadow .12s ease; }
                @media (hover: hover) { .farm-deco-fab:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 7px 20px rgba(0,0,0,0.5); } }
                .farm-deco-fab:active { transform: translateY(1px) scale(0.97); }
                .farm-deco-fab { animation: farmBob 3.4s ease-in-out infinite; }
                /* Visit-a-farm opener: an inviting, tappable bar (not a flat box). */
                .farm-visit { width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(255,214,110,0.3); background: linear-gradient(180deg, rgba(255,214,110,0.1), rgba(255,255,255,0.02)); color: inherit; cursor: pointer; text-align: left; transition: transform .12s ease, border-color .12s ease, background .12s ease; }
                .farm-visit:hover { transform: translateY(-1px); border-color: rgba(255,214,110,0.55); background: linear-gradient(180deg, rgba(255,214,110,0.16), rgba(255,255,255,0.03)); }
                .farm-visit:active { transform: translateY(1px); }
                .farm-visit .farm-visit-chev { transition: transform .2s ease; }
                /* Rarity-framed portrait tile so a pet sprite reads as an intentional framed portrait, not a raw square. */
                .farm-portrait { position: relative; display: inline-block; border-radius: 20px; overflow: hidden; }
                .farm-portrait::after { content: ""; position: absolute; inset: 0; border-radius: 20px; box-shadow: inset 0 0 0 2px var(--pring, rgba(255,255,255,0.15)), inset 0 -18px 30px rgba(0,0,0,0.35); pointer-events: none; }
                .farm-rank { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(255,214,110,0.35); background: linear-gradient(180deg, rgba(255,214,110,0.14), rgba(255,255,255,0.02) 60%); }
                .farm-rank-crest { flex: none; width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; font-size: 15px; font-weight: 900; letter-spacing: -0.02em; color: #3a2c08; background: linear-gradient(180deg, #ffe488, #f3b23a); box-shadow: 0 3px 0 #b57f22, 0 0 14px rgba(255,214,110,0.5); }
                /* Silver and bronze for 2nd and 3rd — the same struck-metal ladder the shared board uses. */
                .farm-rank.rank-2 .farm-rank-crest { background: linear-gradient(180deg, #f4f7fa, #b9c4ce); box-shadow: 0 3px 0 #7c8894, 0 0 14px rgba(200,214,226,0.45); }
                .farm-rank.rank-3 .farm-rank-crest { background: linear-gradient(180deg, #f0c08a, #c47a3c); box-shadow: 0 3px 0 #82491d, 0 0 14px rgba(196,122,60,0.45); }
                .farm-rank.rank-n .farm-rank-crest { color: #cdd3d8; background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05)); box-shadow: 0 3px 0 rgba(0,0,0,0.35); }
                .farm-loveboard { margin: 0 0 10px; }
                .farm-loveboard-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 0 0 8px; }
                .farm-loveboard-head b { font-size: 15px; font-weight: 900; }
                .farm-loveboard-head span { font-size: 10.5px; color: #8a9099; }
                /* Unranked is a real state, not an error — nobody has visited yet. Read it as quiet, not broken. */
                .farm-rank.is-unranked { border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); }
                .farm-rank.is-unranked .farm-rank-crest { color: #9aa2ab; background: rgba(255,255,255,0.06); box-shadow: none; }
                /* Top of the board gets to glow. */
                .farm-rank.is-first { border-color: rgba(255,214,110,0.75); box-shadow: 0 0 26px rgba(255,196,60,0.28); }
                .farm-rank.is-first .farm-rank-crest { animation: farmRankShine 2.2s ease-in-out infinite; }
                @keyframes farmRankShine { 0%,100% { box-shadow: 0 3px 0 #b57f22, 0 0 14px rgba(255,214,110,0.5); } 50% { box-shadow: 0 3px 0 #b57f22, 0 0 26px rgba(255,214,110,0.95); } }
                .farm-rank-body { flex: 1; min-width: 0; }
                .farm-rank-top { display: flex; align-items: baseline; gap: 8px; }
                .farm-rank-label { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #cdb98a; }
                .farm-rank-name { font-size: 15px; font-weight: 900; color: #ffe488; }
                .farm-rank-bar { height: 6px; border-radius: 999px; background: rgba(0,0,0,0.28); overflow: hidden; margin: 5px 0 3px; }
                .farm-rank-bar > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #f3b23a, #ffe488); box-shadow: 0 0 8px rgba(255,214,110,0.6); transition: width .6s cubic-bezier(.3,1.2,.4,1); }
                .farm-rank-next { font-size: 10.5px; color: #b9a892; }
                .farm-viewtabs { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.08); }
                /* Four tabs on a phone: the label has to survive, so the row gets tighter and the badge stops
                   taking inline width — it used to push the text sideways and collide with the next tab's icon. */
                .farm-viewtabs button { position: relative; flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 9px 4px; border-radius: 10px; font-weight: 800; font-size: 12px; letter-spacing: -0.01em; cursor: pointer; border: none; background: transparent; color: #b7c2ad; transition: background .15s ease, color .15s ease, box-shadow .15s ease; white-space: nowrap; }
                .farm-viewtabs button > span[aria-hidden] { font-size: 15px; flex: 0 0 auto; }
                .farm-viewtabs button.on { background: linear-gradient(180deg, #7ed57e, #4bbf6a); color: #10240f; box-shadow: 0 2px 6px rgba(75,191,106,0.4), inset 0 1px 0 rgba(255,255,255,0.3); }
                @media (hover: hover) { .farm-viewtabs button:not(.on):hover { background: rgba(255,255,255,0.05); color: #e8f0e0; } }
                .farm-viewtabs button.has-attn:not(.on) { box-shadow: inset 0 0 0 1px rgba(224,67,63,0.55); }
                /* Absolutely positioned so a badge never widens the tab or shoves the label into its neighbour. */
                .farm-viewtabs .farm-tab-badge { position: absolute; top: 1px; right: 2px; font-size: 9px; font-weight: 900; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px; background: #e0433f; color: #fff; display: grid; place-items: center; box-shadow: 0 1px 4px rgba(0,0,0,0.45); animation: farmTabPulse 1.6s ease-in-out infinite; }
                @keyframes farmTabPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.14); } }
                /* THE SECOND TAB ROW. Same control, different job — the row above the scene picks WHICH
                   pasture you are looking at, this one picks which of the three panels below it you want. Gold
                   rather than green so two rows of tabs on one screen never read as one confused row, and it
                   matches the gold the neighbour card and the rank badge already use. */
                .farm-viewtabs.is-panel { background: rgba(0,0,0,0.34); border-color: rgba(255,215,94,0.18); }
                .farm-viewtabs.is-panel button.on { background: linear-gradient(180deg, #ffe488, #f3b23a); color: #3a2c08; box-shadow: 0 2px 6px rgba(243,178,58,0.4), inset 0 1px 0 rgba(255,255,255,0.35); }
                .farm-viewtabs.is-panel .farm-tab-badge { background: #f3b23a; color: #3a2c08; }
            `}</style>

            {farm.mine ? (
                <HowToPlay
                    id="farm"
                    emoji="🏡"
                    title="the Farm"
                    tagline="Your pet-XP engine — every harvest levels your companions and earns XP (loot &amp; gold along the way)."
                    steps={[
                        "Tap an empty plot to plant a seed — buy one right there if your bag's empty.",
                        "Crops grow over time. Spend fertilizer to speed one up.",
                        "Tap a ripe crop to harvest it — it feeds your equipped pet XP + earns you XP, with a bonus loot roll.",
                        "Pet your companions (❤️) for pet XP, and grab the Wild Loot Pig when he shows up.",
                    ]}
                    accent="#4abd6a"
                />
            ) : null}


            {/* Welcome-back recaps: who petted your pets + who rated your farm (own farm only). */}
            {farm.mine ? <PetVisitReport /> : null}
            {farm.mine ? <FarmRatingReport /> : null}

            {!farm.mine ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0 }}>🏡 {farm.owner.name}&apos;s Farm</h2>
                    <button type="button" className="farm-jbtn" style={{ marginLeft: "auto" }} onClick={() => window.location.assign("/marketplace/farm")}>🏡 My farm</button>
                </div>
            ) : null}

            {/* Four farm areas: Garden (crops) · Outside (pasture) · Inside (barn) · Art (your creations).
                Art is a real VIEW now, not a button that opened a sheet on top of the farm — a modal over a
                tab row reads as an interruption, while the other three swap the panel underneath. Same tab,
                same behaviour, no exception to learn. */}
            <div className="farm-viewtabs">
                {[["garden", "🌾", "Garden"], ["outside", "🏡", "Outside"], ["inside", "🛖", "Inside"], ["art", "🎨", "Art"]]
                    .filter(([v]) => farm.mine || (v !== "garden" && v !== "art")) // the Garden and your Art are yours alone
                    .map(([v, ico, label]) => {
                    // Garden tab badge = crops READY TO HARVEST. Pet-view tabs badge = pets you can still pet today.
                    const attn = v === "garden" && farm.mine ? (garden?.readyCount || 0) : 0;
                    const petAttn = v !== "garden" && farm.mine && liveNudge > 0 ? pets.filter((p, i) => petView(i) === v && !p.petted).length : 0;
                    const badge = v === "art" ? artPending : (attn || petAttn);
                    return (
                        <button key={v} type="button" className={`${view === v ? "on" : ""}${badge ? " has-attn" : ""}`} onClick={() => { setView(v); if (v === "garden") setDecoEditing(false); }}>
                            <span aria-hidden="true">{ico}</span>{label}
                            {v === "art" && artPending ? <span className="farm-tab-badge" title={`${artPending} waiting on you`}>{artPending}</span>
                                : attn ? <span className="farm-tab-badge" title={`${attn} to grab in the Garden`}>{attn}</span>
                                    : petAttn ? <span className="farm-tab-badge" title={`${petAttn} pet${petAttn === 1 ? "" : "s"} to pet — a free daily reward`}>{petAttn}</span> : null}
                        </button>
                    );
                })}
            </div>

            {farm.mine && liveNudge > 0 && view !== "garden" ? (
                <div className="farm-petnudge">🐾 <b>{liveNudge}</b> free {liveNudge === 1 ? "petting" : "pettings"} left today — tap your pets for XP &amp; gold!</div>
            ) : null}

            {/* ART — gifts waiting on you, people asking for your work, and the one-time share picker. */}
            {view === "art" ? (
                <section className="card" style={{ marginTop: 10 }}>
                    <h2 style={{ margin: "0 0 2px", fontSize: "1.1rem" }}>🎨 Your art</h2>
                    <p className="muted" style={{ margin: "0 0 4px", fontSize: "0.8rem" }}>Pass a creation to another member — each piece can be shared once.</p>
                    <CreationShareHub onChanged={loadArtPending} />
                </section>
            ) : null}

            {/* The scene — the backdrop is a single image shown at full height; the field is as wide as the image,
                so you can scroll sideways to see the WHOLE painting (it's wider than the viewport). */}
            {/* ── THE FARM ITSELF COMES FIRST ────────────────────────────────────────────────────────────────
                The rank badge, the bounty list, the love bar and the farm directory used to sit ABOVE the
                scene, which meant two full screens of reading before you could see your own farm. They are
                all status — things you check — while the scene is the thing you came to use. Status now sits
                underneath it, and folds away. */}
            {/* Windowed: the toolbar sits ABOVE the scene, directly under the view tabs — the tabs say WHICH
                pasture, these act ON it, so they belong together.
                It used to sit below, on the reasoning that controls over the pasture would cover the animals.
                But "not on top of" and "underneath" are different things: underneath put Backdrop, Decorate
                below a scene roughly a phone-screen tall, so you scrolled past the whole farm
                to reach the buttons that change how the farm looks. Above it, nothing is covered and nothing
                has to be hunted. */}
            {view !== "art" ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>{sceneControls}</div>
            ) : null}
            <div ref={sceneWrapRef} hidden={view === "art"} style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
                <div ref={scrollRef} className="farm-scroll" onPointerDown={onScrollPointerDown} onPointerMove={onScrollPointerMove} onPointerUp={onScrollPointerUp} onPointerLeave={onScrollPointerUp} style={{ width: "100%", overflowX: "auto", overflowY: "hidden", cursor: "grab" }}>
                    <div
                        ref={fieldRef}
                        style={{
                            // The field is as wide as the painting so you can scroll/pan sideways to see all of it —
                            // at whatever height the scene is.
                            // The Garden is now a WIDE scrolling field like Outside/Inside. It used to be pinned
                            // to the viewport, so eight beds shared one phone screen and had to be shrunk to
                            // fit — small and crowded, with the whole horizontal scroll going unused. At 190%
                            // the beds get roughly double the size and real space between them.
                            position: "relative", width: "max-content",
                            minWidth: view === "garden" ? "190%" : "100%", height: sceneHeight,
                            background: fieldBackground(visTod, wx.condition),
                            boxShadow: "inset 0 -30px 60px rgba(0,0,0,0.12)", userSelect: "none", transition: "background 1.2s ease",
                        }}
                    >
                        {/* Backdrop — full height, natural width (its width sets the scrollable field). */}
                        {bgUrl ? (
                            (view === "outside" || view === "inside") ? (
                                // Outside/Inside: repeat the backdrop 3× with the mirror trick [A A' A] so it scrolls as one
                                // seamless wide scene (Garden stays a single image because crops sit at fixed positions).
                                <div className="farm-bg-tiled" aria-hidden="true">
                                    {[0, 1, 2].map((k) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={k} src={bgUrl} alt="" draggable={false} />
                                    ))}
                                </div>
                            ) : (
                                // Garden: a fixed, NON-scrolling view (crops sit at fixed % positions). A single
                                // natural-width image left a gradient gap on the right of wide desktops, so repeat the
                                // beds across the FULL width with the mirror trick [A A' A …]. The strip is absolutely
                                // positioned, so it fills edge-to-edge without widening the field — crops stay aligned.
                                <div className="farm-bg-strip" aria-hidden="true">
                                    {[0, 1, 2, 3, 4, 5].map((k) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={k} src={bgUrl} alt="" draggable={false} />
                                    ))}
                                </div>
                            )
                        ) : null}
                        {/* Time-of-day mood over the default pasture (night/dusk/dawn); a custom bg keeps its own look. */}

                        {/* World OBJECTS layer — pets, crops, decorations, the farmer. The time-of-day tint is applied
                            to THIS layer only, so the illustrated backdrop keeps its own night/dusk mood while the
                            flat-lit sprites stop glowing like noon. */}
                        <div style={{ position: "absolute", inset: 0, filter: objFilter }}>
                        {/* Live VISITORS — real wolves currently viewing this farm. On your OWN farm you're the farmer
                            (don't also show yourself as a guest); when VISITING you appear so you see yourself here. */}
                        {(view === "outside" || view === "inside") ? (
                            // Visitors used to stand at 83-89%, BELOW the pets (~82%) and jammed against the bottom
                            // edge, so a visiting hero read as falling off the screen rather than standing in the
                            // pasture. Same band as the pets now (76-82%), sharing the grass.
                            (farm.visitors || []).filter((v) => (farm.mine ? !v.isYou : true)).map((vis, i) => (
                                <div key={vis.id} className={`farm-visitor${vis.isYou ? " is-you" : ""}`} style={{ left: `${14 + (i * 67) % 70}%`, top: `${petGroundY(76 + (i % 3) * 3)}%`, zIndex: Math.round(petGroundY(76 + (i % 3) * 3)), animationDelay: `${(i % 4) * 0.4}s` }}>
                                    <span className="farm-visitor-name">{vis.isYou ? "🐺 you" : vis.name}</span>
                                    {vis.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={vis.sprite} alt="" draggable={false} style={{ transform: vis.flip ? "scaleX(-1)" : "none" }} />
                                    ) : <span className="farm-visitor-fallback" aria-hidden="true">🐺</span>}
                                </div>
                            ))
                        ) : null}
                        {/* Crops live ONLY in the Garden view — a dedicated planting/harvesting space. */}
                        {view === "garden" && farm.mine && garden ? (
                            <ScenePlots
                                garden={garden}
                                busy={gardenBusy}
                                editing={farm.mine && decoEditing}
                                fieldRef={fieldRef}
                                onMovePlot={movePlotTo}
                                onPlant={(slot) => setPlanting(slot)}
                                onHarvest={harvestAt}
                                onInspect={(slot) => setInspectSlot(slot)}
                            />
                        ) : null}
                        {view === "garden" && farm.mine && !garden ? (
                            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#eef6e6", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>Loading your garden…</div>
                        ) : null}

                        {/* Placed decorations belong to a specific view (Outside or Inside) — not the Garden. */}
                        {canDecorate ? (
                            <DecoLayer
                                placements={(farm.placements || []).filter((p) => (p.view || "outside") === view)}
                                editing={farm.mine && decoEditing}
                                fieldRef={fieldRef}
                                tod={visTod}
                                spriteBrightness={farm.spriteBrightness ?? 1}
                                onMove={decoMove}
                                onInspect={(p) => { if (p) setInspectDeco({ ...p, placementId: p.id }); }}
                                standPets={standPets}
                            />
                        ) : null}

                        {view !== "garden" && viewPetCount === 0 ? (
                            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#eef6e6", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.4)", textAlign: "center", padding: 16 }}>
                                {pets.length === 0 ? "No pets yet — collect some and they'll roam here." : `No pets in the ${view === "inside" ? "barn" : "pasture"} right now — your pets are split between Outside & Inside.`}
                            </div>
                        ) : null}

                        {pets.map((pet, i) => {
                            if (view === "garden" || petView(i) !== view) return null; // pets live in Outside / Inside, split by index
                            const p = pos[i] || { x: 50, y: 82, flip: false, dur: 2, moving: false, hopMs: 500 };
                            const canTap = farm.canPet && !pet.petted && !pet.maxed;
                            return (
                                <button
                                    key={pet.id}
                                    type="button"
                                    onClick={() => setInspect(pet)}
                                    title={`${pet.name} · Lv ${pet.level} · tap to inspect`}
                                    style={{
                                        position: "absolute", left: `${p.x}%`, top: `${petGroundY(p.y)}%`, transform: "translate(-50%, -100%)",
                                        transition: `left ${p.dur}s linear, top ${p.dur}s linear`,
                                        background: "none", border: "none", padding: 0, cursor: "pointer", zIndex: Math.round(petGroundY(p.y)),
                                        WebkitTapHighlightColor: "transparent", outline: "none", WebkitTouchCallout: "none",
                                    }}
                                >
                                    {/* fixed-size sprite stage: the shadow stays planted on the ground while the sprite hops above it */}
                                    <span style={{ position: "relative", display: "block", width: 46, height: 46, margin: "0 auto" }}>
                                        <span
                                            className={p.moving ? "farm-shadow-hop" : ""}
                                            style={{ position: "absolute", left: "50%", bottom: -2, width: 34, height: 7, transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0) 72%)", animationDuration: p.moving ? `${p.hopMs}ms` : undefined, zIndex: 0 }}
                                        />
                                        <span
                                            className={p.moving ? "farm-hop" : "farm-idle"}
                                            style={{ position: "absolute", inset: 0, display: "block", animationDuration: p.moving ? `${p.hopMs}ms` : undefined }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={pet.spriteUrl}
                                                alt={pet.name}
                                                width={46}
                                                height={46}
                                                draggable={false}
                                                style={{ width: 46, height: 46, objectFit: "contain", transform: (Boolean(pet.flip) !== Boolean(p.flip)) ? "scaleX(-1)" : "none", filter: `${canTap ? "drop-shadow(0 0 5px rgba(255,226,122,0.9)) " : ""}brightness(${farm.spriteBrightness ?? 1})`, WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
                                            />
                                            {pet.petted ? <span style={{ position: "absolute", top: -4, right: 0, fontSize: 13 }}>❤️</span> : null}
                                        </span>
                                    </span>
                                    <span style={{ display: "flex", justifyContent: "center", marginTop: 3 }}>
                                        <span style={{ padding: "1px 7px", borderRadius: 9, background: "rgba(18,26,14,0.74)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 10, fontWeight: 700, color: "#f2f6ee", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }}>
                                            {pet.name} <span style={{ color: RARITY_RING[pet.rarity] || "#cdd9c6" }}>·L{pet.level}</span>
                                        </span>
                                    </span>
                                </button>
                            );
                        })}

                        {/* The farmer strolls the Outside & Inside (not the tidy Garden) — tap to connect */}
                        {view !== "garden" && farm.owner?.avatarUrl ? <OwnerWalker owner={farm.owner} mine={farm.mine} minX={petMinX} groundShift={groundShift} brightness={farm.spriteBrightness ?? 1} onTap={() => setOwnerMenu(true)} /> : null}

                        {/* Wild Loot Pig only shows up Outside in the open pasture */}
                        {view === "outside" && pig === "running" ? <LootPig onFinish={onPigFinish} crown={farm.crownCfg} /> : null}

                        </div>{/* /world-objects tint layer */}

                        {/* XP / heart floaters */}
                        {floaters.map((f) => (
                            <span key={f.id} style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, transform: "translate(-50%, -120%)", fontWeight: 800, fontSize: 15, color: f.color || "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)", pointerEvents: "none", animation: "farmFloat 1.3s ease-out forwards", zIndex: 9999 }}>
                                {f.text}
                            </span>
                        ))}
                    </div>
                </div>
                {/* Weather effects only in the open pasture (Outside) — not indoors or in the garden view */}
                {showWeather ? <FarmWeather condition={wx.condition} /> : null}
                {/* Persistent lock/move toggle — top-right of the scene. Governs dragging plots + decorations on
                    your own farm, so you can arrange them without overlap. Default is movable. */}
                {farm.mine && (garden || (farm.decorations && (((farm.placements?.length || 0) > 0) || decorating))) ? (
                    <button type="button" onClick={() => setDecoEditing((v) => !v)} aria-label={decoEditing ? "Lock farm layout" : "Unlock farm layout"} title={decoEditing ? "Layout unlocked — drag plots & decorations; tap to LOCK" : "Layout locked — tap to UNLOCK and rearrange plots & decorations"}
                        style={{ position: "absolute", top: 10, right: 10, zIndex: 9998, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, border: `1px solid ${decoEditing ? "rgba(143,199,255,0.6)" : "rgba(255,255,255,0.25)"}`, background: decoEditing ? "linear-gradient(180deg, rgba(30,52,74,0.96), rgba(18,32,46,0.96))" : "linear-gradient(180deg, rgba(40,40,44,0.96), rgba(24,24,28,0.96))", color: decoEditing ? "#bfe0ff" : "#d7d7db", fontWeight: 800, fontSize: 12.5, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", WebkitTapHighlightColor: "transparent" }}>
                        <span style={{ fontSize: 15 }} aria-hidden="true">{decoEditing ? "🔓" : "🔒"}</span>{decoEditing ? "Unlocked" : "Locked"}
                    </button>
                ) : null}
                {/* Live conditions label (unobtrusive, top-left) */}
                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 60, pointerEvents: "none", padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#f2f6ee", background: "rgba(18,26,14,0.5)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(2px)" }}
                    title={wx.located ? "Your real local weather + time of day" : "Your local time of day (allow location for live weather)"}>
                    {weatherLabel(wx)}
                </div>
            </div>

            {/* ── THE TWO THINGS YOU CAME TO DO ── the day's bounties and the rating, never behind a fold.
                Everything here used to live inside the collapsed "Farm status & bounties" summary, which meant
                the two ACTIONS on this screen — the quests you are working through, and liking the farm you
                are looking at — were a tap away and, folded shut by default, easy to never see at all. What
                stays folded is the stuff you CHECK rather than DO: where you place, and who else to visit. */}
            {/* ── EVERYTHING UNDER THE SCENE, IN THREE ─────────────────────────────────────────────────────
                The farm grew a card at a time and ended up as one column four screens long: neighbours, five
                bounties, your love, your rank, a search box, the garden, the seed bag, the seed packs, the
                fertilizer shop and the whole upgrade tree, every one of them expanded, every one of them
                between you and the next. Nothing here deserved deleting and nothing deserved folding — it is
                all real — so it is tabbed instead, the way the rest of the Den already handles this much
                depth (the mine, the arena, sailing).

                Three, because there are exactly three questions this half of the page answers:
                  TODAY     — what is there to do right now (neighbours, bounties)
                  GARDEN    — the plot work, the bag, the supplies, the upgrade tree
                  STANDING  — how the farm is doing, and how to go and find another one

                VISITING somebody skips the tabs entirely: their pets and the rating card, nothing else. Their
                garden is not yours to work and their rank is on their card already. */}
            {farm.mine ? (
                <div className="farm-viewtabs is-panel" style={{ margin: "12px 0 10px" }}>
                    {[["today", "📋", "Today", todoCount], ["garden", "🌱", "Garden", readyCrops], ["standing", "🏅", "Standing", 0]]
                        .filter(([key]) => key !== "garden" || garden)
                        .map(([key, ico, label, badge]) => (
                            <button key={key} type="button" className={panel === key ? "on" : undefined}
                                onClick={() => setPanel(key)} aria-pressed={panel === key}>
                                <span aria-hidden="true">{ico}</span>{label}
                                {/* A tab that hides something claimable has to say so, or tabbing IS hiding. */}
                                {badge > 0 ? <i className="farm-tab-badge">{badge}</i> : null}
                            </button>
                        ))}
                </div>
            ) : null}

            <div style={{ display: "grid", gap: 10, margin: farm.mine ? 0 : "12px 0" }}>
                {/* TODAY — the two things with a daily budget behind them. */}
                {farm.mine && panel === "today" ? (
                    <>
                        {/* BOUNTIES FIRST. The neighbour list is a full phone screen of other people's farms,
                            so the five things you can actually claim today sat below a fold on the tab whose
                            entire job is "what is there to do right now". Going to see somebody is the thing
                            you do AFTER you have looked at your own list, not before. */}
                        <FeatureDailies feature="farm" refreshKey={bountyTick} />
                        <NeighbourStrip
                            neighbours={farm.neighbours}
                            ratesLeft={farm.rating?.charge?.left ?? 0}
                            petsLeft={farm.petting?.others?.left ?? 0}
                        />
                    </>
                ) : null}

                {/* VISITING — their pets first (three charges and no other way to find it), then the rating. */}
                {!farm.mine && farm.canPet ? (
                    <VisitPets pets={pets} ownerName={farm.owner.name} petsLeft={farm.petting?.left ?? 0}
                        petXp={farm.petXp} petGold={farm.petGold} busyKey={busy} onPet={petIt} />
                ) : null}
                {!farm.mine && farm.rating ? (
                    <FarmRatingBar rating={farm.rating} ownerName={farm.owner.name} mine={farm.mine} busy={rateBusy} burst={rateBurst} note={rateNote} onRate={rateFarmAt} />
                ) : null}

                {/* GARDEN tab also carries the farm CHASES — the Harvester and Forager collections belong on
                    the screen their bonuses land on, not three taps away on the equipment page. */}
                {farm.mine && panel === "garden" && farm.collections?.length ? (
                    <CollectionPanel sets={farm.collections} feature="farm" title="Farm collections"
                        blurb="Find the pieces anywhere in the Den — the bonus is permanent and you never have to wear them." />
                ) : null}

                {/* STANDING — your love, where that places you, and the way to somebody else's farm. */}
                {farm.mine && panel === "standing" ? (
                    <>
                        {farm.rating ? (
                            <FarmRatingBar rating={farm.rating} ownerName={farm.owner.name} mine busy={rateBusy} burst={rateBurst} note={rateNote} onRate={rateFarmAt} />
                        ) : null}
                        {farm.rating ? <FarmRankBadge standings={farm.rating.standings} /> : null}
                        {/* HOW YOU COMPARE. A place with no other farms next to it is a fact, not a standing —
                            you cannot tell whether 1st is comfortable or one vote from being taken. */}
                        {farm.loveBoard?.top?.length ? (
                            <div className="farm-loveboard">
                                <div className="farm-loveboard-head">
                                    <b>Most-loved farms</b>
                                    <span>tier-weighted · like 1 · love 2 · admire 3</span>
                                </div>
                                {/* Tap any farm to go and see it. With enough players a top ten stops being a
                                    way to find anyone in particular, so this searches the WHOLE board and each
                                    result keeps its real standing rather than its position in the results. */}
                                <input className="farm-findfarm" value={farmQuery} autoComplete="off"
                                    onChange={(e) => setFarmQuery(e.target.value)}
                                    placeholder="Find a farm to visit…" aria-label="Search farms" />
                                {farmHits ? (
                                    farmHits.length ? (
                                        <Leaderboard
                                            rows={farmHits.map((r) => ({
                                                place: r.place ?? "–", who: r.who, avatar: r.avatar, you: r.you,
                                                value: r.place == null ? "—" : r.score.toLocaleString(),
                                                unit: r.place == null ? "not rated yet" : `love · ${r.votes} vote${r.votes === 1 ? "" : "s"}`,
                                                href: r.you || !r.alias ? null : `/marketplace/farm?u=${encodeURIComponent(r.alias)}`,
                                            }))}
                                            unitPlural="farms"
                                        />
                                    ) : <p className="lb-empty">{farmSeeking ? "Searching…" : "No farm by that name."}</p>
                                ) : (
                                <Leaderboard
                                    rows={farm.loveBoard.top.map((r) => ({
                                        place: r.place, who: r.who, avatar: r.avatar, you: r.you,
                                        value: r.score.toLocaleString(),
                                        unit: `love · ${r.votes} vote${r.votes === 1 ? "" : "s"}`,
                                        href: r.you || !r.alias ? null : `/marketplace/farm?u=${encodeURIComponent(r.alias)}`,
                                    }))}
                                    mine={farm.loveBoard.mine ? {
                                        place: farm.loveBoard.mine.place, who: farm.loveBoard.mine.who,
                                        avatar: farm.loveBoard.mine.avatar, you: true,
                                        value: farm.loveBoard.mine.score.toLocaleString(),
                                        unit: `love · ${farm.loveBoard.mine.votes} vote${farm.loveBoard.mine.votes === 1 ? "" : "s"}`,
                                        toNext: farm.rating?.standings?.toNext
                                            ? `${farm.rating.standings.toNext} more love to catch ${ordinal(farm.loveBoard.mine.place - 1)}`
                                            : null,
                                    } : null}
                                    total={farm.rating?.standings?.ranked || null}
                                    unitPlural="farms"
                                />
                                )}
                            </div>
                        ) : null}
                        {/* The old "Visit a farm" directory lived here, collapsed inside a second collapsed
                            block and labelled "owner-only" — a label that was not even true, since the list
                            endpoint has always been open to any signed-in member. Between the two lids and the
                            wrong label it read as a dev tool, which is why visiting somebody's farm looked like
                            it had been removed. The board above does the job in the open: ranked, searchable,
                            and every row opens that farm. */}
                    </>
                ) : null}
            </div>

            {bgOpen ? <FarmBgCreator bg={farm.customBg} draft={farm.customBgDraft} busy={bgBusy} onAct={bgAct} onClose={() => setBgOpen(false)} /> : null}

            {/* GARDEN — plots, bag, supplies and the upgrade tree, which is most of the page's length on its own. */}
            {farm.mine && garden && panel === "garden" ? (
                <GardenPanel
                    garden={garden}
                    busy={gardenBusy}
                    onBuyFertilizer={buyFert}
                    onUpgrade={buyUpgradeKey}
                    onOpenPack={openPack}
                />
            ) : null}

            {/* Wild Loot Pig announce banner — rendered at the ROOT (outside the pasture's overflow:hidden scene) as a
                position:fixed, FLEX-centered overlay. Centering lives on the outer wrapper so the pill's own pigPop
                scale animation can never knock it off-center or clip it (the old bug). */}
            {pig === "running" && view !== "outside" ? (
                // Pig's loose but you're not looking at the pasture — a persistent, TAPPABLE banner that takes you there.
                <div style={{ position: "fixed", top: 72, left: 0, right: 0, zIndex: 9998, display: "flex", justifyContent: "center", padding: "0 12px" }}>
                    <button type="button" onClick={() => { setView("outside"); setPigToast(false); }}
                        style={{ maxWidth: "min(94vw, 470px)", display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 999, background: "rgba(20,16,6,0.96)", border: "1px solid #ffd75e", color: "#ffe27a", fontWeight: 800, fontSize: 14, lineHeight: 1.2, boxShadow: "0 10px 30px rgba(0,0,0,0.55)", cursor: "pointer", animation: "pigPop .4s ease both", WebkitTapHighlightColor: "transparent" }}>
                        🐷👑 The Loot Pig&apos;s in the pasture!
                        <span style={{ padding: "4px 12px", borderRadius: 999, background: "#ffd75e", color: "#2a2410", fontWeight: 900, fontSize: 13, whiteSpace: "nowrap" }}>Go catch it →</span>
                    </button>
                </div>
            ) : pigToast ? (
                // You're already on the pasture — tell you what to do.
                <div style={{ position: "fixed", top: 72, left: 0, right: 0, zIndex: 9998, display: "flex", justifyContent: "center", padding: "0 12px", pointerEvents: "none" }}>
                    <div style={{ maxWidth: "min(92vw, 460px)", textAlign: "center", padding: "9px 18px", borderRadius: 999, background: "rgba(20,16,6,0.96)", border: "1px solid #ffd75e", color: "#ffe27a", fontWeight: 800, fontSize: 14, lineHeight: 1.25, boxShadow: "0 10px 30px rgba(0,0,0,0.55)", animation: "pigPop .4s ease both" }}>
                        🐷👑 The Loot Pig appeared — grab the coins he drops!
                    </div>
                </div>
            ) : null}


            {/* The package, advertised where somebody is already arranging their farm. Renders nothing at all
                when there is no visible offer — which is everybody, until one goes live. */}
            {farm.mine && farm.packageOffer ? <PackageBanner offer={farm.packageOffer} /> : null}

            {/* Decorate DOCK: bottom tray you drag decorations out of, onto the (still-visible) farm scene. */}
            {decorating && canDecorate && farm.mine && farm.decorations ? (
                <DecoDock
                    deco={farm.decorations}
                    fieldRef={fieldRef}
                    busy={decoBusy}
                    editing={decoEditing}
                    onPlaceAt={decoPlaceAt}
                    onInspect={(cat) => setInspectDeco(cat)}
                    onOpenCreator={() => setCustomOpen(true)}
                    onDone={stopDecorating}
                    spriteBrightness={farm.spriteBrightness ?? 1}
                    onSpriteBrightness={setSpriteBright}
                />
            ) : null}

            {/* THE STAND GETS ITS OWN PANEL, not the generic decoration inspector — it is the one decoration
                with state of its own to show (three tiers, three owner counts) and to change. Opened by the
                same tap that inspects any other placed piece, on your farm or anybody else's. */}
            {inspectDeco?.decoId === STAND_DECO_ID && farm.stand?.placed ? (
                <PettingStand
                    stand={farm.stand}
                    mine={farm.mine}
                    pets={farm.pets || []}
                    busy={decoBusy}
                    onSeat={standSeat}
                    onClear={standClear}
                    onClose={() => setInspectDeco(null)}
                />
            ) : inspectDeco ? (
                <DecoInspect
                    item={inspectDeco}
                    mine={farm.mine}
                    gold={farm.wallet?.gold || 0}
                    busy={decoBusy}
                    onBuy={decoBuy}
                    onPickup={decoPickup}
                    onTransform={decoTransform}
                    onClose={() => setInspectDeco(null)}
                />
            ) : null}


            {customOpen && farm.mine && farm.decorations ? (
                <CustomDecoCreator
                    custom={farm.decorations.custom}
                    busy={decoBusy}
                    onStart={customStart}
                    onRefine={customRefine}
                    onFinalize={customFinalize}
                    onSuggest={customSuggest}
                    onSaveNote={customNote}
                    onClose={() => setCustomOpen(false)}
                />
            ) : null}

            {planting != null && garden ? (
                <SeedPickerModal garden={garden} slot={planting} busy={gardenBusy} gold={farm.wallet?.gold || 0} onPick={plantSeedAt} onOpenPack={openPack} onBuyPack={buySeedPack} onSpecialize={() => { setUpgradePlot(planting); setPlanting(null); }} onClose={() => setPlanting(null)} />
            ) : null}

            {inspectSlot != null && garden ? (
                <PlotInspectModal
                    garden={garden}
                    slot={inspectSlot}
                    busy={gardenBusy}
                    onFertilize={fertilizeAt}
                    onBuyFertilizer={buyFert}
                    onHarvest={harvestAt}
                    onSpecialize={() => { setUpgradePlot(inspectSlot); setInspectSlot(null); }}
                    onClose={() => setInspectSlot(null)}
                />
            ) : null}

            {upgradePlot != null && garden ? (
                <PlotUpgradeModal garden={garden} slot={upgradePlot} busy={gardenBusy} gold={farm.wallet?.gold || 0} onUpgrade={upgradePlotAt} onClose={() => setUpgradePlot(null)} />
            ) : null}

            {harvestToast ? <HarvestToast toast={harvestToast} onClose={() => setHarvestToast(null)} /> : null}

            {encounter ? <EncounterModal encounter={encounter} onResolve={resolveEncounterAt} onClose={() => setEncounter(null)} /> : null}

            {recap ? <IncomeRecapModal recap={recap} onClose={() => setRecap(null)} /> : null}

            {inspect ? (
                <PetInspect
                    pet={inspect}
                    mine={farm.mine}
                    ownerName={farm.owner?.name}
                    canPet={farm.canPet}
                    petXp={farm.petXp}
                    petGold={farm.petGold}
                    petting={farm.petting}
                    wallet={farm.wallet}
                    treats={farm.treats || []}
                    treatShop={farm.treatShop || []}
                    busyKey={busy}
                    onPet={() => petIt(inspect)}
                    onRecharge={rechargeBudget}
                    onUseTreat={(cid) => feedTreat(inspect, cid)}
                    onBuyTreat={buyTreatItem}
                    onClose={() => setInspect(null)}
                />
            ) : null}

            {ownerMenu ? <OwnerMenu owner={farm.owner} mine={farm.mine} onClose={() => setOwnerMenu(false)} /> : null}

            {pigResult ? (
                <div onClick={() => setPigResult(null)} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "radial-gradient(120% 100% at 50% 40%, rgba(60,45,8,0.72), rgba(0,0,0,0.7))", display: "grid", placeItems: "center", padding: 16, animation: "overlayFade .25s ease both", overflow: "hidden" }}>
                    <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Loot pig haul" style={{ position: "relative", width: "100%", maxWidth: 340, maxHeight: "90dvh", overflowY: "auto", overflowX: "hidden", borderRadius: 18, border: "2px solid #ffd75e", background: "linear-gradient(180deg, #2a2410, #17181c)", boxShadow: "0 20px 70px rgba(0,0,0,0.6), 0 0 40px rgba(255,215,94,0.25)", animation: "pigPop .5s cubic-bezier(.2,1.2,.3,1) both, haulShake .6s ease .12s both", textAlign: "center" }}>
                        {/* shimmer sweep across the card */}
                        <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: "60%", height: "100%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)", animation: "haulSweep 1.1s ease .3s both", pointerEvents: "none", zIndex: 3 }} />
                        <div style={{ position: "relative", padding: "22px 18px 6px", background: "radial-gradient(120% 90% at 50% 0%, rgba(255,215,94,0.28), transparent 70%)" }}>
                            {/* radial glow pulse + coin burst behind the pig */}
                            <div aria-hidden="true" style={{ position: "absolute", top: 34, left: "50%", width: 90, height: 90, marginLeft: -45, marginTop: -45, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,215,94,0.6), transparent 60%)", animation: "haulGlow .8s ease-out both", pointerEvents: "none" }} />
                            {PIG_BURST.map((b, i) => (
                                <span key={i} aria-hidden="true" style={{ position: "absolute", top: 40, left: "50%", fontSize: 16, "--r": `${b.a}deg`, "--d": `${b.d}px`, animation: `haulBurst ${b.t}s ease-out ${0.05 * (i % 4)}s both`, pointerEvents: "none", zIndex: 2 }}>🪙</span>
                            ))}
                            <div style={{ position: "relative", fontSize: 52, lineHeight: 1, zIndex: 2, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }}>🐷👑</div>
                            <div style={{ position: "relative", fontSize: 20, fontWeight: 900, marginTop: 4, zIndex: 2 }}>The Wild Loot Pig!</div>
                            <div className="muted" style={{ position: "relative", fontSize: 13, zIndex: 2 }}>He rampaged through and left this behind:</div>
                        </div>
                        <div style={{ position: "relative", padding: "4px 18px 20px", zIndex: 2 }}>
                            <div style={{ display: "inline-block", fontSize: 40, fontWeight: 900, color: "#ffd75e", textShadow: "0 2px 12px rgba(255,215,94,0.55)", animation: "goldCount .5s cubic-bezier(.2,1.4,.3,1) .25s both" }}>+{(pigResult.gold || 0).toLocaleString()} 🪙</div>
                            {pigResult.item ? (
                                <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `2px solid ${RARITY_RING[pigResult.item.rarity] || "#9aa0a6"}`, background: "rgba(255,255,255,0.04)" }}>
                                    <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>✨ Rare drop{pigResult.item.isNew ? " · NEW" : ""}!</div>
                                    {pigResult.item.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={pigResult.item.image} alt={pigResult.item.name} width={68} height={68} style={{ width: 68, height: 68, objectFit: "contain" }} />
                                    ) : <div style={{ fontSize: 40 }}>🎁</div>}
                                    <div style={{ fontWeight: 800 }}>{pigResult.item.name}</div>
                                    <div style={{ fontSize: 12, color: RARITY_RING[pigResult.item.rarity] || "#9aa0a6", textTransform: "capitalize" }}>{pigResult.item.rarity}{pigResult.item.slot ? ` · ${String(pigResult.item.slot).replace("_", " ")}` : ""}</div>
                                </div>
                            ) : null}
                            <button type="button" onClick={() => setPigResult(null)} style={{ width: "100%", marginTop: 16, padding: "11px", fontWeight: 800, background: "#ffd75e", color: "#2a2410", border: "none", borderRadius: 10, cursor: "pointer" }}>Collect the loot!</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

// The Wild Loot Pig sprite (crown overlaid separately). Generated once via /api/admin/loot-pig-sprite.
const PIG_SPRITE_URL = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm/1784834882238-913206.png";

// The Wild Loot Pig: a crowned pig that MEANDERS around the pasture (inside the scrolling field) dropping
// COINS you TAP to grab. A HUD tells you what to do; the guaranteed daily haul is claimed server-side in
// onFinish when he wanders off. (Grabbing coins is the active bit — the reward is guaranteed either way.)
function LootPig({ onFinish, crown }) {
    const cw = crown || { top: 9, side: 8, size: 22 };
    const [pos, setPos] = useState({ x: 4, y: 84, flip: false, dur: 1.6 });
    const [moving, setMoving] = useState(false); // true only while ambling between waypoints (gates the crown shake)
    const [coins, setCoins] = useState([]);
    const [collected, setCollected] = useState(0);
    const coinId = useRef(0);
    const timers = useRef([]);
    useEffect(() => {
        let alive = true;
        const t = timers.current;
        let step = 0;
        const MAX_STEPS = 8; // meander waypoints before he leaves
        const drop = (x, y) => {
            SFX.coin();
            const id = ++coinId.current;
            setCoins((c) => [...c, { id, x: x + rand(-4, 4), y: y + rand(-1, 6) }]);
            t.push(setTimeout(() => { if (alive) setCoins((c) => c.filter((k) => k.id !== id)); }, 6500)); // coin lifespan → grab it before it's gone
        };
        const glide = (dur) => { setMoving(true); t.push(setTimeout(() => { if (alive) setMoving(false); }, dur * 1000)); };
        const move = () => {
            if (!alive) return;
            step += 1;
            if (step > MAX_STEPS) {
                setPos((p) => { const exitX = Math.random() < 0.5 ? -12 : 112; return { x: exitX, y: 84, flip: exitX < p.x, dur: 2.4 }; });
                glide(2.4);
                t.push(setTimeout(() => { if (alive) onFinish(); }, 2500));
                return;
            }
            const nx = rand(8, 90);
            const ny = 80 + rand(0, 10);
            const dur = rand(1.4, 2.4);
            setPos((p) => ({ x: nx, y: ny, flip: nx < p.x, dur }));
            glide(dur);
            drop(nx, ny);
            t.push(setTimeout(move, dur * 1000 + rand(300, 800))); // amble, then pause, then wander again
        };
        drop(6, 84);
        t.push(setTimeout(move, 1400));
        return () => { alive = false; t.forEach(clearTimeout); timers.current = []; };
    }, [onFinish]);
    const collect = (id) => { setCoins((c) => c.filter((k) => k.id !== id)); setCollected((n) => n + 1); SFX.coin(); };
    return (
        <>
            {/* what-to-do HUD */}
            <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 120, pointerEvents: "none", padding: "6px 14px", borderRadius: 999, background: "rgba(20,16,6,0.92)", border: "1px solid #ffd75e", color: "#ffe27a", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", boxShadow: "0 6px 20px rgba(0,0,0,0.5)" }}>
                🐷 Grab the coins! <span style={{ color: "#fff" }}>· {collected} grabbed</span>
            </div>
            {coins.map((c) => (
                <button key={c.id} type="button" onClick={() => collect(c.id)} aria-label="Grab coin"
                    style={{ position: "absolute", left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%, -50%)", zIndex: 110, background: "none", border: "none", padding: 8, margin: -8, cursor: "pointer", fontSize: 26, lineHeight: 1, WebkitTapHighlightColor: "transparent", animation: "coinPop .4s ease-out both", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.55))" }}>🪙</button>
            ))}
            <div style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -100%)", transition: `left ${pos.dur}s ease-in-out, top ${pos.dur}s ease-in-out`, zIndex: 96, pointerEvents: "none" }}>
                <div style={{ position: "relative", animation: moving ? "pigBob .55s ease-in-out infinite" : "none" }}>
                    {/* Crown rests ON the head: lowered onto the crown of the skull and nudged toward the facing
                        side (the head, away from the rump). Positioned via top/left — NOT transform — so
                        crownJiggle can't reset it. */}
                    <span style={{ position: "absolute", left: pos.flip ? `${50 + cw.side}%` : `${50 - cw.side}%`, top: cw.top, fontSize: cw.size, zIndex: 2, transformOrigin: "bottom center", transform: "translateX(-50%)", animation: moving ? "crownJiggle .34s ease-in-out infinite" : "none", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }}>👑</span>
                    {PIG_SPRITE_URL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={PIG_SPRITE_URL} alt="Wild Loot Pig" width={68} height={68} style={{ width: 68, height: 68, objectFit: "contain", transform: pos.flip ? "scaleX(-1)" : "none", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4))" }} />
                    ) : (
                        <span style={{ display: "block", fontSize: 58, lineHeight: 1, transform: pos.flip ? "scaleX(-1)" : "none", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4))" }}>🐷</span>
                    )}
                </div>
            </div>
        </>
    );
}

// The farm owner's avatar strolling their own pasture. Taps open a connect menu (profile / message / trade /
// add friend). On your OWN farm it's just you (tap → your profile).
function OwnerWalker({ owner, mine, minX = FARM_PAD, groundShift = 0, brightness = 1, onTap }) {
    const [pos, setPos] = useState({ x: Math.max(20, minX + 8), y: 86, flip: false, dur: 3, moving: false });
    const gy = Math.min(95, pos.y + groundShift); // drop onto the barn straw floor indoors (see groundShift)
    useEffect(() => {
        let alive = true;
        const timers = [];
        const glide = (dur) => { timers.push(setTimeout(() => { if (alive) setPos((p) => ({ ...p, moving: false })); }, dur * 1000)); };
        const step = () => {
            if (!alive) return;
            const nx = rand(minX, 94); // stay right of the garden plots (penned like the pets)
            const dur = rand(2.6, 4.2);
            setPos((p) => ({ x: nx, y: 82 + rand(0, 8), flip: nx < p.x, dur, moving: true }));
            glide(dur);
            timers.push(setTimeout(step, dur * 1000 + rand(1400, 3200))); // stroll, pause, stroll
        };
        timers.push(setTimeout(step, 900));
        return () => { alive = false; timers.forEach(clearTimeout); };
    }, [minX]);
    // The walker is the member's SIDE-facing hero sprite (avatar_sprite_url). Canonical art faces right; a
    // scaleX(-1) faces it left. owner.avatarFlip = "the art is backwards, mirror it" (the AI facing pass). To
    // face the way they walk, combine that base correction with travel direction: flip = avatarFlip XOR movingLeft.
    const flip = Boolean(owner.avatarFlip) !== Boolean(pos.flip);
    return (
        <button
            type="button"
            onClick={onTap}
            title={mine ? "You" : `Tap to connect with ${owner.name}`}
            style={{ position: "absolute", left: `${pos.x}%`, top: `${gy}%`, transform: "translate(-50%, -100%)", transition: `left ${pos.dur}s linear, top ${pos.dur}s linear`, background: "none", border: "none", padding: 0, cursor: "pointer", zIndex: Math.round(gy) + 1, WebkitTapHighlightColor: "transparent", outline: "none", WebkitTouchCallout: "none" }}
        >
            <span style={{ position: "relative", display: "block", width: 66, height: 66, margin: "0 auto" }}>
                <span className={pos.moving ? "farm-shadow-hop" : ""} style={{ position: "absolute", left: "50%", bottom: -2, width: 46, height: 10, transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0) 72%)", zIndex: 0, animationDuration: pos.moving ? "480ms" : undefined }} />
                <span className={pos.moving ? "farm-hop" : "farm-idle"} style={{ position: "absolute", inset: 0, display: "block", animationDuration: pos.moving ? "480ms" : undefined }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={owner.avatarUrl} alt={owner.name} width={66} height={66} style={{ width: 66, height: 66, objectFit: "contain", transform: flip ? "scaleX(-1)" : "none", filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.5)) brightness(${brightness})` }} />
                </span>
            </span>
            <span style={{ display: "flex", justifyContent: "center", marginTop: 3 }}>
                <span style={{ padding: "1px 8px", borderRadius: 9, background: "rgba(30,20,46,0.82)", border: "1px solid rgba(255,215,110,0.45)", fontSize: 10, fontWeight: 800, color: "#ffe9b0", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }}>
                    {mine ? "🧑‍🌾 You" : `👋 ${owner.name}`}
                </span>
            </span>
        </button>
    );
}

// Tap-the-farmer connect sheet: view profile, message, propose a trade, add friend.
function OwnerMenu({ owner, mine, onClose }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const menuBtn = { display: "flex", justifyContent: "center", alignItems: "center", gap: 6, width: "100%", padding: "11px 12px", fontWeight: 700, borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.05)", color: "inherit", cursor: "pointer" };
    async function addFriend() {
        setBusy(true); setMsg("");
        try {
            const r = await fetch("/api/marketplace/friends/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: owner.id }) });
            const d = await r.json().catch(() => ({}));
            setMsg(r.ok ? "Friend request sent! 🐺" : (d?.error || "Couldn't send request."));
        } finally { setBusy(false); }
    }
    async function message() {
        setBusy(true); setMsg("");
        try {
            const r = await fetch("/api/marketplace/dm/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toUserId: owner.id }) });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d?.threadId) window.location.assign(`/marketplace/dm/${d.threadId}`);
            else setMsg(d?.error || "Couldn't open chat.");
        } finally { setBusy(false); }
    }
    const profileHref = owner.alias ? `/marketplace/u/${encodeURIComponent(owner.alias)}` : null;
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Connect with ${owner.name}`} style={{ width: "100%", maxWidth: 320, borderRadius: 16, background: "var(--card-bg,#17181c)", border: "1px solid rgba(255,215,110,0.45)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, background: "radial-gradient(120% 90% at 50% 0%, rgba(255,215,110,0.16), transparent 70%)" }}>
                    {owner.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={owner.avatarUrl} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,215,110,0.6)" }} />
                    ) : null}
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{owner.name}</div>
                        {owner.alias ? <div className="muted" style={{ fontSize: 12 }}>@{owner.alias}</div> : null}
                    </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14 }}>
                    {profileHref ? <a href={profileHref} className="farm-jbtn" style={{ justifyContent: "center", textDecoration: "none", color: "#3a2c08" }}>👤 View profile</a> : null}
                    {!mine ? (
                        <>
                            <button type="button" onClick={message} disabled={busy} style={{ ...menuBtn, opacity: busy ? 0.6 : 1 }}>💬 Message</button>
                            {owner.alias ? <a href={`/marketplace/trade/new?to=${encodeURIComponent(owner.alias)}`} style={{ ...menuBtn, textDecoration: "none" }}>🤝 Propose trade</a> : null}
                            <button type="button" onClick={addFriend} disabled={busy} style={{ ...menuBtn, opacity: busy ? 0.6 : 1 }}>➕ Add friend</button>
                        </>
                    ) : null}
                    {msg ? <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>{msg}</div> : null}
                    <button type="button" onClick={onClose} style={{ ...menuBtn, background: "transparent", border: "none", opacity: 0.7 }}>Close</button>
                </div>
            </div>
        </div>
    );
}

// ── Garden: plant found seeds → crops grow in real time → harvest to sell for gold (+ rare chest). Rain &
// fertilizer speed growth; upgrades add plots/speed/luck/pet-cap/chest-odds. Owner-only debug tools included.
const fmtGrow = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
// ── The garden IN the scene ───────────────────────────────────────────────────────────────────────────────
// Crops are planted straight into the pasture GROUND — a little cluster of soil mounds on the grass at the
// LEFT of the (scrolling) field. They're part of the world, so they scroll with everything else; the pets are
// penned to the right, so they never trample the crops. Each plant sprouts from its mound and grows taller
// over real time, ripening (swap to the crop, glow + bob) when ready. Tap a plot to plant / fertilize / harvest.
function ScenePlots({ garden, busy, editing = false, fieldRef, onMovePlot, onPlant, onHarvest, onInspect }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
    const plots = garden.plots || [];
    const totalSeeds = (garden.seedBag || []).reduce((s, x) => s + x.count, 0);
    // Plots are NOT draggable. Their positions are fixed by the server (PLOT_SLOTS in farm-crops.js) — the
    // old free-drag defaulted every plot into a pile in the left fifth of the field and then couldn't reach the
    // right-hand side to fix it. A tap still plants / harvests / inspects; decorations remain free-placed.
    const [drag, setDrag] = useState(null); // retained: the render still reads it, always null now
    const gr = useRef({});
    // The bed sprite used to be a hard-coded 112px. Four of those across a row need 448px, and a phone field is
    // ~390px — so the front row overlapped itself no matter where the slots were placed. Size the bed off the
    // MEASURED field instead: a row of four is 4 × 20.5% = 82% of the width, leaving a real gap between beds at
    // every screen size. The 112 cap keeps them from ballooning on a wide desktop.
    const [fieldW, setFieldW] = useState(0);
    useEffect(() => {
        const el = fieldRef?.current;
        if (!el) return undefined;
        const read = () => setFieldW(el.getBoundingClientRect().width || 0);
        read();
        if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", read); return () => window.removeEventListener("resize", read); }
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, [fieldRef]);
    // Sized off the MEASURED field. The field is ~1.9x the viewport in the Garden now, so the multiplier
    // comes down and the cap goes up: beds land near double their old on-screen size with room between them.
    const bedW = Math.max(72, Math.min(190, (fieldW || 380) * 0.108));
    const suppressClickRef = useRef(false);
    const start = (e, p) => {
        return; // plots are fixed — see the note above
        // eslint-disable-next-line no-unreachable
        if (!editing) return;
        suppressClickRef.current = false;
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
        gr.current = { slot: p.slot, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, x: p.x, y: p.y, el: e.currentTarget };
    };
    const move = (e) => {
        const g = gr.current;
        if (g.slot == null || e.pointerId !== g.pointerId || !fieldRef?.current) return;
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 7) return;
        g.moved = true;
        e.preventDefault();
        const rect = fieldRef.current.getBoundingClientRect();
        g.x = Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100));
        g.y = Math.max(20, Math.min(96, ((e.clientY - rect.top) / rect.height) * 100));
        setDrag({ slot: g.slot, x: g.x, y: g.y });
    };
    const end = (e) => {
        const g = gr.current;
        if (g.slot == null || e.pointerId !== g.pointerId) return;
        try { g.el?.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
        if (g.moved) { suppressClickRef.current = true; onMovePlot?.(g.slot, g.x, g.y); }
        gr.current = {};
        setDrag(null);
    };
    return (
        <>
            {plots.map((p) => {
                const live = drag && drag.slot === p.slot ? drag : p;
                return (
                    <ScenePlot
                        key={p.slot} p={p} left={live.x} top={live.y} bedW={bedW} now={now} busy={busy} bedUrl={garden.bedUrl} bedTiers={garden.bedTiers} cropSprites={garden.cropSprites}
                        totalSeeds={totalSeeds} editing={editing} dragging={drag?.slot === p.slot} suppressClickRef={suppressClickRef}
                        onPointerDown={editing ? (e) => start(e, p) : undefined}
                        onPointerMove={editing ? move : undefined}
                        onPointerUp={editing ? end : undefined}
                        onPointerCancel={editing ? () => { gr.current = {}; setDrag(null); } : undefined}
                        onPlant={onPlant} onHarvest={onHarvest} onInspect={onInspect}
                    />
                );
            })}
        </>
    );
}

function ScenePlot({ p, left, top, bedW = 112, now, busy, bedUrl, bedTiers, cropSprites, totalSeeds, editing = false, dragging = false, suppressClickRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPlant, onHarvest, onInspect }) {
    const empty = p.empty;
    let progress = 1; let ready = false; let secsLeft = 0;
    if (!empty) {
        const start = new Date(p.plantedAt).getTime();
        const end = new Date(p.readyAt).getTime();
        secsLeft = Math.max(0, Math.round((end - now) / 1000));
        ready = secsLeft <= 0;
        progress = end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 1;
    }
    const busyHere = busy === `h-${p.slot}` || busy === `p-${p.slot}` || busy === `f-${p.slot}`;
    const canPlant = empty && totalSeeds > 0;
    const tappable = true; // empty plots ALWAYS open the seed picker (which offers seeds to plant, or a buy-a-pack shortcut when the bag's empty)
    const onClick = () => {
        if (suppressClickRef?.current) { suppressClickRef.current = false; return; } // that was a drag, not a tap
        if (busyHere) return;
        if (empty) { onPlant(p.slot); return; } // open the picker even with 0 seeds → it shows the "buy a seed pack" shortcut
        if (ready) onHarvest(p.slot);
        else onInspect(p.slot); // growing → open the inspect modal (don't silently fertilize)
    };
    // Real growth: the plant swaps through stages (tiny sprout → bigger sprout → the actual crop appearing and
    // swelling) AND scales up across the whole grow, so you can SEE it maturing over time.
    const plantScale = ready ? 1 : 0.26 + 0.74 * progress; // 26% → 100% (smooth growth within a stage)
    const growEmoji = ready || progress >= 0.6 ? p.emoji : p.sprout; // emoji fallback
    // Real 3-stage growth sprites (sprout → growing → ripe) so the plant looks like it's growing out of the bed.
    const stageKey = !p.empty ? ((ready || progress >= 0.72) ? `crop_${p.seedId}_ripe` : progress >= 0.33 ? `crop_${p.seedId}_grow` : "crop_sprout") : null;
    const plantSprite = stageKey ? cropSprites?.[stageKey] : null;
    // The bed visibly upgrades as you invest in the plot: dirt → wood frame → stone+glow → gilded.
    const spec = p.specLevel || 0;
    // The plot visibly RANKS UP every 5 specialization levels — a DISTINCT bed SPRITE per tier (t1..t5), with a
    // faint matching aura so the upgrade reads at a glance. Falls back to the base bed until a tier's art exists.
    const specTier = Math.min(5, Math.floor(spec / 5));
    const TIER_COL = ["", "#c0864a", "#c3cdd8", "#ffd75e", "#7fe0ff", "#c99bff"][specTier];
    const TIER_GLOW = ["", "rgba(192,134,74,0.85)", "rgba(195,205,216,0.85)", "rgba(255,215,94,0.95)", "rgba(127,224,255,0.95)", "rgba(201,155,255,0.95)"][specTier];
    const tierBed = (specTier && bedTiers?.[specTier]) || bedUrl; // upgraded bed art when available
    const frameBorder = specTier ? `2px solid ${TIER_COL}` : "1px solid rgba(20,12,4,0.6)";
    const frameGlow = specTier ? `, 0 0 ${5 + specTier * 2}px ${TIER_GLOW}` : "";
    // A soft aura on the ART bed that intensifies each tier (the distinct sprite carries the main upgrade look).
    const bedGlow = specTier ? ` drop-shadow(0 0 ${3 + specTier * 1.4}px ${TIER_GLOW})` : "";
    const title = editing ? `${p.name || "Plot"} — drag to move, tap to ${empty ? "plant" : ready ? "harvest" : "inspect"}`
        : empty ? (canPlant ? "Tap to plant a seed" : "Empty plot — tap to get seeds")
            : ready ? `${p.name} — tap to harvest` : `${p.name} · ${fmtGrow(secsLeft)} left · tap to inspect`;
    // Width comes from the measured field (see ScenePlots), times the slot's perspective scale — the back row is
    // drawn smaller because it's further away. The art bed carries ~18% transparent padding, so the CSS fallback
    // is rendered a bit narrower to end up the same visual size. Everything inside scales with it.
    const persp = p.s || 1;
    const W = Math.round(bedW * persp * (tierBed ? 1 : 0.7));
    const k = W / 112; // scale factor for the fixed inner sizes the layout was authored at
    return (
        <button type="button" onClick={onClick} title={title}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
            style={{ position: "absolute", left: `${left}%`, top: `${top}%`, transform: "translate(-50%, -100%)", width: W, background: "none", border: "none", padding: 0, cursor: editing ? "grab" : tappable ? "pointer" : "default", zIndex: dragging ? 9990 : Math.round(top), touchAction: editing ? "none" : "auto", transition: dragging ? "none" : "left .15s ease, top .15s ease", WebkitTapHighlightColor: "transparent", userSelect: "none", outline: "none" }}>
            {/* bed + plant, layered so the plant grows OUT of the soil */}
            <div style={{ position: "relative", width: W, margin: "0 auto" }}>
                {/* ready ring pulsing behind the crop */}
                {!empty && ready ? <span aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: "48%", transform: "translate(-50%,50%)", width: 54 * k, height: 54 * k, borderRadius: "50%", border: "2px solid rgba(140,240,150,0.7)", zIndex: 1, animation: "farmReadyRing 1.6s ease-out infinite" }} /> : null}
                {/* the crop — its BASE sits down in the soil (bottom ~46% up the bed), growing taller over time */}
                {!empty ? (
                    <span style={{ position: "absolute", left: "50%", bottom: "46%", transform: `translateX(-50%) scale(${plantScale})`, transformOrigin: "bottom center", transition: "transform 1.2s linear", zIndex: 2 }}>
                        {plantSprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={plantSprite} alt="" draggable={false} style={{ display: "block", width: 50 * k, height: "auto", transformOrigin: "bottom center", filter: ready ? "drop-shadow(0 0 8px rgba(140,240,150,0.9))" : "drop-shadow(0 3px 3px rgba(0,0,0,0.55))", animation: ready ? "farmBob 2s ease-in-out infinite" : "farmSway 3.4s ease-in-out infinite" }} />
                        ) : (
                            <span style={{ display: "block", fontSize: 42 * k, lineHeight: 1, transformOrigin: "bottom center", filter: ready ? "drop-shadow(0 0 8px rgba(140,240,150,0.9))" : "drop-shadow(0 3px 3px rgba(0,0,0,0.55))", animation: ready ? "farmBob 2s ease-in-out infinite" : "farmSway 3.4s ease-in-out infinite" }}>{growEmoji}</span>
                        )}
                    </span>
                ) : (
                    <span style={{ position: "absolute", left: "50%", bottom: "48%", transform: "translateX(-50%)", fontSize: Math.max(15, 24 * k), color: canPlant ? "#ffe27a" : "rgba(255,226,122,0.55)", fontWeight: 900, textShadow: "0 1px 3px rgba(0,0,0,0.85)", zIndex: 2, animation: "farmBob 2.4s ease-in-out infinite" }}>＋</span>
                )}
                {/* the raised bed — real AI art if we have it, else the CSS fallback */}
                {tierBed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tierBed} alt="" draggable={false} style={{ display: "block", width: W, height: "auto", filter: `drop-shadow(0 4px 5px rgba(0,0,0,0.45))${bedGlow}`, opacity: canPlant ? 1 : 1 }} />
                ) : (
                    <span style={{ position: "relative", display: "block", width: W, height: Math.round(26 * (W / 68)), margin: "0 auto", borderRadius: "7px / 9px",
                        background: p.fertilized
                            ? "repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 6px, rgba(0,0,0,0) 6px 12px), linear-gradient(180deg, #7a5430 0%, #3a2410 100%)"
                            : "repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 6px, rgba(0,0,0,0) 6px 12px), linear-gradient(180deg, #6b4a26 0%, #33200d 100%)",
                        boxShadow: `inset 0 2px 2px rgba(255,225,180,0.22), inset 0 -4px 7px rgba(0,0,0,0.62), 0 2px 3px rgba(0,0,0,0.4)${frameGlow}`,
                        border: canPlant ? "1.5px dashed rgba(255,226,122,0.75)" : frameBorder,
                        borderTop: specTier ? frameBorder : "2px solid rgba(120,86,48,0.75)" }} />
                )}
                {/* canPlant hint ring on the art bed */}
                {tierBed && canPlant ? <span aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: "20%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 800, color: "#2a1a06", background: "rgba(255,226,122,0.9)", borderRadius: 999, padding: "0 6px", zIndex: 3 }}>plant</span> : null}
                {/* The plot's upgrade is carried by its distinct tier SPRITE (tierBed) — no badge clutter. */}
            </div>
            {/* status chip */}
            <span style={{ display: "block", textAlign: "center", marginTop: 2 }}>
                {!empty ? (
                    ready
                        ? <span style={{ padding: "1px 7px", borderRadius: 8, background: "rgba(47,174,114,0.95)", border: "1px solid rgba(190,255,205,0.55)", fontSize: 9.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>{busyHere ? "…" : "🧺 Harvest"}</span>
                        : <span style={{ padding: "1px 6px", borderRadius: 8, background: "rgba(10,16,8,0.82)", border: "1px solid rgba(255,255,255,0.14)", fontSize: 9.5, fontWeight: 700, color: "#f2f6ee", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>⏳ {fmtGrow(secsLeft)}{p.fertilized ? " 💧" : ""}</span>
                ) : canPlant ? (
                    <span style={{ padding: "1px 6px", borderRadius: 8, background: "rgba(10,16,8,0.7)", border: "1px dashed rgba(255,226,122,0.55)", fontSize: 9.5, fontWeight: 700, color: "#ffe6a3", whiteSpace: "nowrap" }}>Plant</span>
                ) : null}
            </span>
        </button>
    );
}

// The controls panel below the pasture: the crops themselves live IN the scene (ScenePlots) — this is just the
// seed bag, fertilizer, upgrades & owner debug. Shares the same live `garden` passed down from FarmClient.
// A collapsible section header — themed gold triangle (never a light-blue arrow), rotates when open.

// Farm LIKES bar — positive-only, three ascending tiers. On another member's farm the tiers are big tappable
// buttons (your current pick glows); on your own farm it's a read-only tally of the love you've collected. New
// ratings cost your one daily charge; revising a rating you've already given is free.
const RATE_TIER_UI = [
    { tier: 1, key: "like", label: "Like", icon: "👍", color: "#7ec8ff" },
    { tier: 2, key: "love", label: "Love", icon: "❤️", color: "#ff6fae" },
    { tier: 3, key: "admire", label: "Admire", icon: "⭐", color: "#ffd75e" },
];
// Charge indicator: N dots, `left` of them lit green.
function ChargeDots({ left, allowance }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-flex", gap: 3 }}>
                {Array.from({ length: allowance }).map((_, i) => (
                    <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i < left ? "#8fe39a" : "rgba(255,255,255,0.16)", boxShadow: i < left ? "0 0 5px rgba(143,227,154,0.7)" : "none", transition: "background .2s" }} />
                ))}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: left > 0 ? "#a7e6a7" : "#ff9a9a" }}>{left > 0 ? `${left} left today` : "none left today"}</span>
        </span>
    );
}

// Farm-rating card: a polished, juicy way to Like / Love / Admire a friend's farm (or, on your own farm, a
// clean tally of the love you've received). Big tier buttons with an active glow + lift + burst; charge dots.
// ── FARM RANK — WHERE YOU PLACE ──────────────────────────────────────────────────────────────────────────────
// This was a ladder of fixed thresholds: 35 points is a "Thriving Farm", 60 a "Bountiful Estate". That is a
// solo progress bar wearing the word "rank" — it never told you how your farm compares to anyone else's, which
// is the only question a rank is ever asked, and with static thresholds the whole Den eventually shares the
// same title and the ladder stops meaning anything.
//
// It is a standings position now: 2nd of 40, computed in SQL over everyone's tier-weighted score. A number
// that only moves when other people's farms are loved more or less than yours.
const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
// A title for the TOP of the standings only — being 1st should be worth something to say out loud.
const placeTitle = (place, ranked) => {
    if (place === 1) return "Most-loved farm in the Den";
    if (place === 2) return "Runner-up";
    if (place === 3) return "Third on the board";
    if (ranked >= 10 && place <= Math.ceil(ranked * 0.1)) return "Top 10% of farms";
    if (ranked >= 4 && place <= Math.ceil(ranked / 2)) return "Upper half of the board";
    return "On the board";
};
function FarmRankBadge({ standings }) {
    const { place = null, ranked = 0, score = 0, toNext = null } = standings || {};
    if (!place) {
        return (
            <div className="farm-rank is-unranked">
                <div className="farm-rank-crest">—</div>
                <div className="farm-rank-body">
                    <div className="farm-rank-top">
                        <span className="farm-rank-label">Farm Rank</span>
                        <b className="farm-rank-name">Unranked</b>
                    </div>
                    <span className="farm-rank-next">No ratings yet — visit friends&rsquo; farms and they&rsquo;ll come back to yours.</span>
                </div>
            </div>
        );
    }
    // The bar shows how far up the board you are, not progress toward a threshold — full at 1st, empty at last.
    const pct = ranked > 1 ? Math.max(4, Math.round(((ranked - place) / (ranked - 1)) * 100)) : 100;
    return (
        <div className={`farm-rank${place === 1 ? " is-first" : ""} rank-${place <= 3 ? place : "n"}`}>
            {/* The place itself, struck into metal — a medal emoji is the phone's artwork, not the Den's. */}
            <div className="farm-rank-crest">{ordinal(place)}</div>
            <div className="farm-rank-body">
                <div className="farm-rank-top">
                    <span className="farm-rank-label">Farm Rank</span>
                    <b className="farm-rank-name">{placeTitle(place, ranked)}</b>
                </div>
                <div className="farm-rank-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
                <span className="farm-rank-next">
                    {ordinal(place)} of {ranked} farm{ranked === 1 ? "" : "s"} · {score} love
                    {toNext != null ? ` · ${toNext} more to catch ${ordinal(place - 1)}` : place === 1 ? " · nobody above you" : ""}
                </span>
            </div>
        </div>
    );
}
const bgErr = (e) => ({ no_credits: "You need 3 creations to generate a background.", describe_it: "Describe your background first.", gen_failed: "The art pipeline hiccuped — your creations were refunded. Try again.", no_draft: "Generate one first." }[e] || "Something went wrong — try again.");

// Custom farm-background LIBRARY — a bottom sheet so the scene stays visible for a LIVE preview. You keep every
// background you generate; tap one to equip it (or the Default tile to go back to the weather scenes), and delete
// any you don't want. Generating charges 3 creations up front (refunded only on genuine failure).
function FarmBgCreator({ draft, busy, onAct, onClose }) {
    const [desc, setDesc] = useState("");
    const [st, setSt] = useState({ library: [], activeId: null, credits: null, free: false });
    const [err, setErr] = useState(null);
    const [confirmId, setConfirmId] = useState(null); // a background pending delete-confirm
    const sync = (r) => { if (r && "library" in r) setSt({ library: r.library || [], activeId: r.activeId ?? null, credits: r.credits ?? null, free: Boolean(r.free) }); };
    useEffect(() => {
        let alive = true;
        onAct({ action: "farm_bg_state" }).then((r) => { if (alive) sync(r); });
        return () => { alive = false; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const generate = async () => { setErr(null); const r = await onAct({ action: "farm_bg_start", prompt: desc }); sync(r); if (!r?.ok) setErr(bgErr(r?.error)); };
    const accept = async () => { sync(await onAct({ action: "farm_bg_finalize" })); setDesc(""); };
    const discard = async () => { sync(await onAct({ action: "farm_bg_discard" })); };
    const equip = async (id) => { sync(await onAct({ action: "farm_bg_equip", id })); };
    const unequip = async () => { sync(await onAct({ action: "farm_bg_unequip" })); };
    const del = async (id) => { setConfirmId(null); sync(await onAct({ action: "farm_bg_delete", id })); };
    const { library, activeId, credits, free } = st;
    const low = !free && (credits ?? 0) < 3;
    const tile = { position: "relative", flex: "0 0 auto", width: 88, height: 58, borderRadius: 10, overflow: "hidden", cursor: "pointer", padding: 0, background: "rgba(0,0,0,0.35)" };
    return (
        <div role="dialog" aria-label="Custom farm backgrounds" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10050, background: "linear-gradient(180deg, rgba(30,24,44,0.98), rgba(18,14,28,0.99))", borderTop: "1px solid rgba(201,162,255,0.4)", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)", padding: "14px 16px calc(16px + env(safe-area-inset-bottom))", animation: "pigPop .3s ease both", maxHeight: "80dvh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 17 }} aria-hidden="true">🎨</span>
                <b style={{ fontSize: 15, color: "#e6d9ff" }}>My farm backgrounds</b>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: free ? "#8fe39a" : low ? "#9aa0a6" : "#c9a2ff" }}>{free ? "Owner · free" : `${credits ?? "…"} creation${credits === 1 ? "" : "s"}`}</span>
                <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#b9a2d6", fontSize: 22, lineHeight: 1, cursor: "pointer", padding: "0 2px" }}>×</button>
            </div>
            {draft ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12.5, color: "#cdbde8" }}>👀 It&apos;s live on your farm above — keep it?</div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" disabled={busy} onClick={accept} style={{ flex: 1, padding: 11, fontWeight: 900, borderRadius: 11, border: "none", cursor: "pointer", color: "#20122e", background: "linear-gradient(180deg,#d9b8ff,#b98cff)", boxShadow: "0 3px 0 #7a54b0", opacity: busy ? 0.6 : 1 }}>✓ Save &amp; use</button>
                        <button type="button" disabled={busy || low} onClick={generate} style={{ flex: "0 0 auto", padding: "11px 13px", fontWeight: 800, borderRadius: 11, border: "1px solid rgba(201,162,255,0.5)", background: "rgba(201,162,255,0.12)", color: "#d9c9ff", cursor: "pointer", opacity: busy || low ? 0.5 : 1 }}>🎲 Redo · 3</button>
                        <button type="button" disabled={busy} onClick={discard} style={{ flex: "0 0 auto", padding: "11px 13px", fontWeight: 800, borderRadius: 11, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#cfcfd6", cursor: "pointer" }}>Discard</button>
                    </div>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Library gallery — tap to equip; the Default tile goes back to the weather scenes. */}
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#b9a2d6", marginBottom: 5 }}>{library.length ? "Tap one to equip" : "You haven't made any yet — generate one below"}</div>
                        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                            {/* Default (weather scenes) */}
                            <button type="button" onClick={unequip} disabled={busy} title="Default weather scenes" style={{ ...tile, display: "grid", placeItems: "center", border: `2px solid ${activeId == null ? "#8fe39a" : "rgba(255,255,255,0.18)"}` }}>
                                <span style={{ fontSize: 20 }} aria-hidden="true">🌤️</span>
                                <span style={{ position: "absolute", bottom: 2, left: 0, right: 0, fontSize: 9, fontWeight: 800, color: "#cfe8cf", textAlign: "center" }}>Default</span>
                                {activeId == null ? <span style={{ position: "absolute", top: 2, left: 2, fontSize: 9, fontWeight: 900, color: "#0e2c14", background: "#8fe39a", borderRadius: 5, padding: "0 4px" }}>ON</span> : null}
                            </button>
                            {library.map((bg) => (
                                <div key={bg.id} style={{ position: "relative", flex: "0 0 auto" }}>
                                    <button type="button" onClick={() => equip(bg.id)} disabled={busy} title={bg.prompt || "Custom background"} style={{ ...tile, border: `2px solid ${bg.active ? "#8fe39a" : "rgba(201,162,255,0.4)"}` }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={bg.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        {bg.active ? <span style={{ position: "absolute", top: 2, left: 2, fontSize: 9, fontWeight: 900, color: "#0e2c14", background: "#8fe39a", borderRadius: 5, padding: "0 4px" }}>ON</span> : null}
                                    </button>
                                    {confirmId === bg.id ? (
                                        <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: "rgba(10,6,16,0.9)", display: "grid", gridTemplateRows: "1fr 1fr", gap: 2, padding: 3 }}>
                                            <button type="button" onClick={() => del(bg.id)} style={{ fontSize: 10, fontWeight: 900, color: "#fff", background: "#c0392b", border: "none", borderRadius: 6, cursor: "pointer" }}>Delete</button>
                                            <button type="button" onClick={() => setConfirmId(null)} style={{ fontSize: 10, fontWeight: 800, color: "#cfcfd6", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, cursor: "pointer" }}>Keep</button>
                                        </div>
                                    ) : (
                                        <button type="button" aria-label="Delete background" onClick={() => setConfirmId(bg.id)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "rgba(20,12,28,0.95)", border: "1px solid rgba(255,255,255,0.3)", color: "#ff9aa6", fontSize: 13, lineHeight: "18px", cursor: "pointer", padding: 0 }}>×</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Generate a new one */}
                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={300} placeholder="Describe a new backdrop — e.g. 'a misty mountain valley at golden hour with a winding river'" style={{ width: "100%", resize: "none", borderRadius: 11, border: "1px solid rgba(201,162,255,0.35)", background: "rgba(0,0,0,0.3)", color: "#efe7ff", padding: "9px 11px", fontSize: 13, fontFamily: "inherit" }} />
                    <button type="button" disabled={busy || low || desc.trim().length < 4} onClick={generate} style={{ width: "100%", padding: 12, fontWeight: 900, borderRadius: 11, border: "none", cursor: "pointer", color: "#20122e", background: "linear-gradient(180deg,#d9b8ff,#b98cff)", boxShadow: "0 3px 0 #7a54b0", opacity: busy || low || desc.trim().length < 4 ? 0.55 : 1 }}>{busy ? "Painting your world…" : free ? "Generate new (owner · free)" : "Generate new · 3 creations"}</button>
                    {low ? <a href="/marketplace/creations" style={{ fontSize: 12, fontWeight: 800, color: "#c9a2ff", textAlign: "center" }}>Get more creations →</a> : null}
                </div>
            )}
            {err ? <div style={{ marginTop: 8, fontSize: 12, color: "#ffb3bd", textAlign: "center" }}>{err}</div> : null}
        </div>
    );
}

function FarmRatingBar({ rating, ownerName, mine, busy, burst, note, onRate }) {
    const { byTier = { 1: 0, 2: 0, 3: 0 }, myTier = null, canRate = false, charge = null, ratedToday = false, supporters = 0, myVotes = 0 } = rating || {};
    const left = charge?.left ?? 0;
    const allowance = charge?.allowance ?? 3;
    const totalLove = (byTier[1] || 0) + (byTier[2] || 0) + (byTier[3] || 0);
    const card = { borderRadius: 16, padding: "13px 15px", border: "1px solid rgba(255,215,94,0.26)", background: "linear-gradient(155deg, rgba(255,215,94,0.11), rgba(255,111,174,0.06) 62%, rgba(255,255,255,0.02))", boxShadow: "0 6px 22px rgba(0,0,0,0.28)" };
    const tallyPills = (
        <div style={{ display: "flex", gap: 6 }}>
            {RATE_TIER_UI.map((t) => (
                <span key={t.key} title={`${byTier[t.tier] || 0} ${t.label}${byTier[t.tier] === 1 ? "" : "s"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: byTier[t.tier] ? t.color : "#8a9096", background: byTier[t.tier] ? `${t.color}1c` : "rgba(255,255,255,0.04)", border: `1px solid ${byTier[t.tier] ? `${t.color}55` : "rgba(255,255,255,0.08)"}` }}>
                    <span style={{ fontSize: 14 }}>{t.icon}</span>{byTier[t.tier] || 0}
                </span>
            ))}
        </div>
    );
    if (mine) {
        return (
            <div style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 15 }}>🏡 Your farm&apos;s love</div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{totalLove > 0 ? `${totalLove} vote${totalLove === 1 ? "" : "s"} from ${supporters} friend${supporters === 1 ? "" : "s"} 💛` : "No ratings yet — visit friends and they'll rate you back"}</div>
                    </div>
                    <div style={{ marginLeft: "auto" }}>{tallyPills}</div>
                </div>
            </div>
        );
    }
    if (!canRate) return null;
    return (
        <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900, fontSize: 15 }}>Rate {ownerName}&apos;s farm</span>
                {totalLove > 0 ? <span className="muted" style={{ fontSize: 11.5 }}>· {totalLove} vote{totalLove === 1 ? "" : "s"} so far</span> : null}
                {myVotes > 1 ? <span className="muted" style={{ fontSize: 11.5 }}>· you&rsquo;ve given {myVotes}</span> : null}
                {/* You can come back tomorrow — say so, rather than leaving three live-looking buttons that
                    would only spend a charge to change your mind. */}
                {ratedToday ? <span className="muted" style={{ fontSize: 11.5 }}>· rated today, again tomorrow</span> : null}
                <span style={{ marginLeft: "auto" }}><ChargeDots left={left} allowance={allowance} /></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {RATE_TIER_UI.map((t) => {
                    const active = myTier === t.tier;
                    // Already spent on this person today → nothing to do here until tomorrow. Otherwise your
                    // existing tier is tappable again: giving it a second time on a new day is the point.
                    // ONE FARM A DAY: rating anyone today closes all three buttons on them until tomorrow, not
                    // just the tier you picked. Leaving the other two live is how three charges ended up on one
                    // farm — each "change my mind" tap spent one and sent you nowhere.
                    const spentToday = ratedToday;
                    const disabled = busy || spentToday || left <= 0;
                    const bursting = burst && burst.tier === t.tier;
                    return (
                        <button key={t.key} type="button" onClick={() => onRate(t.tier)} disabled={disabled} aria-pressed={active}
                            title={spentToday ? (active ? `${t.label} — given today, come back tomorrow` : "You've already rated this farm today — come back tomorrow")
                                : left <= 0 ? "No ratings left today"
                                    : active ? `${t.label} again` : `${t.label} this farm`}
                            style={{ position: "relative", overflow: "visible", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "11px 6px 8px", borderRadius: 14, cursor: disabled ? "default" : "pointer", opacity: disabled && !active ? 0.45 : 1, WebkitTapHighlightColor: "transparent",
                                border: `1.5px solid ${active ? t.color : "rgba(255,255,255,0.12)"}`, color: "inherit",
                                background: active ? `radial-gradient(120% 100% at 50% 0%, ${t.color}30, ${t.color}0f)` : "rgba(255,255,255,0.03)",
                                boxShadow: active ? `0 0 0 3px ${t.color}22, 0 6px 16px ${t.color}22` : "none",
                                transform: active ? "translateY(-2px)" : "none", transition: "transform .14s cubic-bezier(.2,1.3,.4,1), border-color .15s ease, box-shadow .15s ease, background .15s ease" }}>
                            <span style={{ fontSize: 26, lineHeight: 1, animation: bursting ? "ratePulse .5s ease" : undefined, filter: active ? `drop-shadow(0 2px 7px ${t.color}99)` : "none" }}>{t.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: active ? t.color : "#cdd3d8" }}>{t.label}{active ? " ✓" : ""}</span>
                            {byTier[t.tier] ? <span style={{ fontSize: 10, fontWeight: 700, color: "#8a9096" }}>{byTier[t.tier]}</span> : null}
                            {bursting ? <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "18%", fontSize: 34, pointerEvents: "none", animation: "rateBurstAnim .9s ease-out forwards" }}>{t.icon}</span> : null}
                        </button>
                    );
                })}
            </div>
            {note ? <div style={{ fontSize: 11.5, marginTop: 9, textAlign: "center", color: "#ffcf6a", fontWeight: 600 }}>{note}</div> : null}
        </div>
    );
}

// A compact stat tile for the garden's status strip.
function GardenStat({ icon, value, label, accent = "#ffe27a" }) {
    return (
        <div style={{ flex: "1 1 0", minWidth: 84, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontSize: 18 }} aria-hidden="true">{icon}</span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                <span style={{ fontWeight: 900, fontSize: "1rem", color: accent, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                <span className="muted" style={{ fontSize: "0.68rem" }}>{label}</span>
            </span>
        </div>
    );
}

function GardenPanel({ garden, busy, onBuyFertilizer, onUpgrade, onOpenPack }) {
    const [seedInfo, setSeedInfo] = useState(null); // a seed tapped in the bag → detail modal
    const [upgFlash, setUpgFlash] = useState(null); // key of the upgrade just bought → brief celebratory pop
    const [packMsg, setPackMsg] = useState(null); // "seeds added" confirmation after opening a pack here
    const buyUpgrade = (key) => { setUpgFlash(key); setTimeout(() => setUpgFlash(null), 620); onUpgrade(key); };
    const g = garden;
    const totalSeeds = (g.seedBag || []).reduce((s, x) => s + x.count, 0);
    const canBuyFert = g.gold >= g.fertilizerPrice;
    return (
        <section className="card" style={{ borderColor: g.readyCount ? "rgba(120,220,120,0.5)" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>🌱 Your Garden</h2>
                {g.readyCount ? <span style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 999, background: "rgba(120,220,120,0.16)", border: "1px solid rgba(120,220,120,0.5)", color: "#8fe39a", fontWeight: 800, fontSize: 12, animation: "pigPop .4s ease both" }}>🧺 {g.readyCount} ready to harvest!</span> : null}
            </div>
            <p className="muted" style={{ margin: "4px 0 12px", fontSize: 12 }}>Tap a plot out in the field to plant &amp; harvest.</p>

            {/* At-a-glance status */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <GardenStat icon="🌿" value={`${g.plotCount}`} label="plots" accent="#8fe39a" />
                <GardenStat icon="🎒" value={`${totalSeeds}`} label="seeds" />
                <GardenStat icon="💧" value={`${g.fertilizer}`} label="fertilizer" accent="#9fd0ff" />
            </div>

            {/* Seed bag */}
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8fe39a", marginBottom: 8 }}>Seed bag</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {totalSeeds ? (g.seedBag || []).map((s) => (
                        <button key={s.id} type="button" onClick={() => setSeedInfo(s)} title={`${s.name} — tap for details`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 999, border: `1px solid ${(RARITY_RING[s.rarity] || "rgba(255,255,255,0.18)")}66`, background: "rgba(255,255,255,0.05)", color: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                            <span style={{ fontSize: 15 }}>{s.emoji}</span>{s.name}<span className="muted" style={{ fontWeight: 400 }}>×{s.count}</span>
                        </button>
                    )) : <span className="muted" style={{ fontSize: 12 }}>none yet — open a seed pack below, or earn seeds from harvests, petting &amp; the other games (boss, sailing, chests…).</span>}
                </div>
            </div>

            {/* Seed packs — open them right here anytime (even with every plot planted → seeds land in your bag). */}
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,215,94,0.05)", border: "1px solid rgba(255,215,94,0.22)" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#ffd75e", marginBottom: 8 }}>Seed packs</div>
                {packMsg ? <div style={{ fontSize: 12, color: "#8fe3a1", fontWeight: 700, marginBottom: 8 }}>✨ {packMsg}</div> : null}
                {(g.seedPacks || []).length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {(g.seedPacks || []).map((p) => {
                            const pBusy = busy === `pk-${p.id}`;
                            return (
                                <button key={p.id} type="button" disabled={Boolean(busy)} onClick={async () => { const r = await onOpenPack?.(p.id); if (r?.ok) setPackMsg(r.applied || "Seeds added to your bag!"); }}
                                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(255,215,94,0.4)", background: "rgba(255,215,94,0.06)", color: "inherit", cursor: pBusy ? "default" : "pointer", textAlign: "left", opacity: pBusy ? 0.6 : 1 }}>
                                    <span style={{ fontSize: 22 }}>{p.emoji}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{p.name} <span className="muted" style={{ fontWeight: 400 }}>×{p.count}</span></span>
                                        <span className="muted" style={{ fontSize: 11 }}>{p.desc}</span>
                                    </span>
                                    <span style={{ fontWeight: 800, fontSize: 12.5, color: "#ffd75e", whiteSpace: "nowrap" }}>{pBusy ? "…" : "Open"}</span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <span className="muted" style={{ fontSize: 12 }}>No seed packs — grab one in the <a href="/marketplace/store" style={{ color: "#ffd75e", fontWeight: 700 }}>Supplies shop</a>. Basic packs give everyday crops; crates &amp; vaults unlock rarer seeds.</span>
                )}
            </div>

            {/* Seed detail modal — tap a seed in the bag to see what it grows into. Portaled to <body> so a
                transformed/filtered ancestor can't trap the position:fixed and shove it to the page bottom. */}
            {seedInfo && typeof document !== "undefined" ? createPortal((
                <div onClick={() => setSeedInfo(null)} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10055, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${seedInfo.name} seed`} style={{ width: "100%", maxWidth: 300, borderRadius: 16, background: "var(--card-bg,#17181c)", border: `2px solid ${(RARITY_RING[seedInfo.rarity] || "#8fbf6a")}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", animation: "pigPop .35s ease both" }}>
                        <div style={{ padding: "18px 16px 10px", textAlign: "center", background: `radial-gradient(120% 90% at 50% 0%, ${(RARITY_RING[seedInfo.rarity] || "#8fbf6a")}33, transparent 70%)` }}>
                            <div style={{ fontSize: 48, lineHeight: 1 }}>{seedInfo.emoji}</div>
                            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>{seedInfo.name}</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: RARITY_RING[seedInfo.rarity] || "#8fbf6a", textTransform: "capitalize" }}>{seedInfo.rarity} seed · ×{seedInfo.count} in your bag</div>
                        </div>
                        <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
                            {[["⏳", "Grows in", fmtGrow((seedInfo.growMin || 0) * 60)], ["🪙", "Sells for", `${(seedInfo.sell || 0).toLocaleString()} gold`], ["✨", "Harvest XP", `+${seedInfo.xp || 0} XP`], ...(seedInfo.loot ? [["🎁", "Harvest loot", seedInfo.loot]] : [])].map(([ic, lab, val]) => (
                                <div key={lab} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                    <span style={{ fontSize: 16 }} aria-hidden="true">{ic}</span>
                                    <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>{lab}</span>
                                    <span style={{ fontWeight: 800, fontSize: 13 }}>{val}</span>
                                </div>
                            ))}
                            <div className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 2 }}>Tap an empty plot out in the field to plant it.</div>
                            <button type="button" onClick={() => setSeedInfo(null)} style={{ marginTop: 4, width: "100%", padding: 10, borderRadius: 11, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "inherit", fontWeight: 800, cursor: "pointer" }}>Close</button>
                        </div>
                    </div>
                </div>
            ), document.body) : null}

            {/* Fertilizer — juiced card */}
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 14, background: "linear-gradient(180deg, rgba(120,200,255,0.13), rgba(255,255,255,0.02))", border: "1px solid rgba(120,200,255,0.4)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 30, filter: "drop-shadow(0 2px 5px rgba(120,200,255,0.55))", animation: "farmBob 2.8s ease-in-out infinite" }} aria-hidden="true">💧</span>
                <span style={{ flex: 1, minWidth: 150 }}>
                    <span style={{ display: "block", fontWeight: 800, fontSize: 14 }}>Fertilizer <span style={{ color: "#9fd0ff" }}>· {g.fertilizer} in stock</span></span>
                    <span className="muted" style={{ fontSize: 11.5 }}>Tap a growing crop to spend one — instantly cuts <b style={{ color: "#cfe8ff" }}>40%</b> off its grow time.</span>
                </span>
                <button type="button" onClick={onBuyFertilizer} disabled={busy || !canBuyFert} style={{ padding: "9px 14px", borderRadius: 11, border: "none", background: canBuyFert ? "linear-gradient(180deg,#ffe488,#f3b23a)" : "rgba(255,255,255,0.1)", color: canBuyFert ? "#3a2c08" : "inherit", fontSize: 13, fontWeight: 900, cursor: canBuyFert ? "pointer" : "default", whiteSpace: "nowrap", opacity: canBuyFert ? 1 : 0.6, boxShadow: canBuyFert ? "0 3px 0 #b57f22" : "none" }}>🪙 Buy · {g.fertilizerPrice}g</button>
            </div>

            {/* Farm upgrades — styled exactly like the SHIP/DIG upgrades (effect line, coin CTA, buy-pop) so the
                whole game reads consistently. Earthy-green themed to match the pasture. */}
            <section style={{ marginTop: 16, borderRadius: 14, border: "1px solid rgba(120,200,120,0.4)", background: "linear-gradient(180deg, rgba(90,180,90,0.1), transparent 42%)", padding: "12px 12px 14px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(120,200,120,0.16)", border: "1px solid rgba(120,200,120,0.5)", color: "#9fe4a0", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>🌾 Farmstead</div>
                <h3 className="sail-upg-h" style={{ margin: "0 0 2px" }}>Upgrade your farm</h3>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.8rem" }}>Spend gold to grow faster, find more seeds, raise the petting cap, and pull better loot from every harvest.</p>
                <div className="sail-upgrades is-farm">
                    {g.upgrades.map((u) => {
                        const affordable = u.cost != null && g.gold >= u.cost;
                        return (
                            <div className={`sail-upg${u.cost == null ? " is-maxed" : ""}${upgFlash === u.key ? " is-bought" : ""}`} key={u.key}>
                                <div className="sail-upg-top">
                                    <span className="sail-upg-title"><span className="sail-upg-ico">{u.emoji}</span>{u.name}</span>
                                    <span className="muted sail-upg-lv">Lv {u.level}/{u.max}</span>
                                </div>
                                <div className="sail-upg-bar" aria-hidden="true"><span style={{ width: `${u.max ? Math.min(100, (u.level / u.max) * 100) : 0}%` }} /></div>
                                <p className="muted sail-upg-desc">{u.desc}</p>
                                {u.eff ? (
                                    <div className="sail-upg-effect">
                                        <span>{u.eff.label}</span>
                                        <b>{u.eff.now}{u.cost == null ? "" : <> → <span className="sail-upg-next">{u.eff.next}</span></>}</b>
                                    </div>
                                ) : null}
                                {u.cost == null ? <button className="pill" disabled>✓ Maxed</button>
                                    : !affordable ? <CoinCta price={u.cost} have={g.gold} className="sail-upg-cta" />
                                        : <button className="btn-ghost sail-upg-buy" disabled={busy} onClick={() => buyUpgrade(u.key)}>🪙 {u.cost.toLocaleString()}</button>}
                            </div>
                        );
                    })}
                </div>
            </section>
        </section>
    );
}

// Centered "pick a seed" modal, opened by tapping an empty plot out in the field.
function SeedPickerModal({ garden, slot, busy, gold = 0, onPick, onOpenPack, onBuyPack, onSpecialize, onClose }) {
    const plotSpec = (garden.plots || []).find((x) => x.slot === slot)?.specLevel || 0;
    const bag = garden.seedBag || [];
    const packs = garden.seedPacks || [];
    const [opened, setOpened] = useState(null);
    const [err, setErr] = useState(null);
    const open = async (packId) => { const r = await onOpenPack(packId); if (r?.ok) setOpened(r.applied || "Seeds added to your bag!"); };
    const buy = async (packId) => {
        setErr(null);
        const r = await onBuyPack?.(packId);
        if (r?.ok) setOpened(r.applied || "Seeds added to your bag!");
        else setErr(r?.error === "not_enough_gold" ? "Not enough gold for that pack." : "Couldn't buy that pack — try again.");
    };
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Plant a seed" style={{ width: "100%", maxWidth: 340, maxHeight: "85dvh", overflowY: "auto", borderRadius: 16, background: "var(--card-bg,#17181c)", border: "2px solid #ffd75e", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: 18, animation: "pigPop .35s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>🌱 Plant plot {slot + 1}</div>
                <div className="muted" style={{ fontSize: 12, margin: "2px 0 10px" }}>Rarer seeds take longer, feed your pet more XP, and roll better harvest loot. Here&apos;s what each one pays out:</div>
                {onSpecialize ? (
                    <button type="button" className="fm-btn fm-btn-spec fm-sheen fm-btn-upgrade" onClick={onSpecialize} style={{ marginBottom: 12 }}>
                        <span className="fm-up-star" aria-hidden="true">★</span>
                        <span className="fm-up-text">
                            <span className="fm-up-title">Specialize this plot{plotSpec ? <span className="fm-up-lvl">Lv {plotSpec}</span> : null}</span>
                            <span className="fm-up-sub">Invest gold to boost this bed&rsquo;s yield</span>
                        </span>
                        <span className="fm-up-chev" aria-hidden="true">›</span>
                    </button>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {bag.length ? bag.map((s) => (
                        <button key={s.id} type="button" disabled={Boolean(busy)} onClick={() => onPick(slot, s.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${(RARITY_RING[s.rarity] || "rgba(255,255,255,0.18)")}66`, background: "rgba(255,255,255,0.05)", color: "inherit", cursor: "pointer", textAlign: "left" }}>
                            <span style={{ fontSize: 26 }}>{s.emoji}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 13.5, fontWeight: 800 }}>{s.name} <span className="muted" style={{ fontWeight: 400 }}>×{s.count}</span></span>
                                <span style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginTop: 4, fontSize: 11.5 }}>
                                    <span style={{ color: "#8fe39a", fontWeight: 700 }}>✨ {s.xp} XP</span>
                                    <span style={{ color: "#c9b4ff", fontWeight: 700 }}>🐾 {s.xp} pet XP</span>
                                    {s.loot ? <span style={{ color: RARITY_RING[s.rarity] || "#cdd9c6", fontWeight: 700 }}>🎁 {s.loot}</span> : null}
                                    <span className="muted">⏳ {Math.round(s.growMin / 60)}h</span>
                                    <span className="muted">🪙 {s.sell.toLocaleString()} sold</span>
                                </span>
                            </span>
                        </button>
                    )) : <div className="muted" style={{ fontSize: 12.5 }}>No seeds in your bag yet — open a seed pack below (or earn seeds from harvests, tending pets, and the other games).</div>}
                </div>

                {opened ? <div style={{ fontSize: 12, color: "#8fe3a1", margin: "14px 0 0", fontWeight: 700 }}>✨ {opened}</div> : null}
                {/* Packs you already own — open one → seeds land in your bag → tap one above to plant. */}
                {packs.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
                        <span style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 2 }}>🎁 Open a seed pack you own</span>
                        {packs.map((p) => {
                            const pBusy = busy === `pk-${p.id}`;
                            return (
                                <button key={p.id} type="button" disabled={Boolean(busy)} onClick={() => open(p.id)}
                                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(255,215,94,0.4)", background: "rgba(255,215,94,0.06)", color: "inherit", cursor: "pointer", textAlign: "left" }}>
                                    <span style={{ fontSize: 22 }}>{p.emoji}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{p.name} <span className="muted" style={{ fontWeight: 400 }}>×{p.count}</span></span>
                                        <span className="muted" style={{ fontSize: 11 }}>{p.desc}</span>
                                    </span>
                                    <span style={{ fontWeight: 800, fontSize: 12.5, color: "#ffd75e", whiteSpace: "nowrap" }}>{pBusy ? "…" : "Open"}</span>
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                {/* Buy a seed pack right here — spends gold, opens it, seeds land in your bag. No shop trip. */}
                <div style={{ margin: "16px 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 13.5 }}>🛒 Buy a seed pack</span>
                    <span className="muted" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#ffd75e" }}>🪙 {gold.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {SEED_PACKS.map((p) => {
                        const bBusy = busy === `bp-${p.id}`;
                        const afford = gold >= p.price;
                        return (
                            <button key={p.id} type="button" disabled={Boolean(busy) || !afford} onClick={() => buy(p.id)}
                                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(255,215,94,0.4)", background: afford ? "rgba(255,215,94,0.08)" : "rgba(255,255,255,0.03)", color: "inherit", cursor: afford ? "pointer" : "default", textAlign: "left", opacity: !afford ? 0.6 : 1 }}>
                                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                                    <span className="muted" style={{ fontSize: 11 }}>{p.desc}</span>
                                </span>
                                <span style={{ fontWeight: 900, fontSize: 12.5, color: afford ? "#ffd75e" : "#9aa0a6", whiteSpace: "nowrap" }}>{bBusy ? "…" : `🪙 ${p.price.toLocaleString()}`}</span>
                            </button>
                        );
                    })}
                </div>
                {err ? <div style={{ fontSize: 12, color: "#ffb3bd", marginTop: 8, textAlign: "center" }}>{err}</div> : null}

                <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 14, padding: 10, fontWeight: 800, background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, cursor: "pointer" }}>Cancel</button>
            </div>
        </div>
    );
}

// Tap a growing crop → this modal tells you what it is, when it's ready, and exactly what to expect at harvest
// (gold, XP, loot tier). From here you can spend fertilizer to speed it up, buy more fertilizer, or (once ripe)
// harvest — but a plain tap never silently burns fertilizer anymore.
function PlotInspectModal({ garden, slot, busy, onFertilize, onBuyFertilizer, onHarvest, onSpecialize, onClose }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
    const p = (garden.plots || []).find((x) => x.slot === slot);
    // Plot was harvested/removed out from under us (e.g. a rain surge finished it) → nothing to inspect.
    useEffect(() => { if (!p || p.empty) onClose(); }, [p, onClose]);
    if (!p || p.empty) return null;

    const secsLeft = Math.max(0, Math.round((new Date(p.readyAt).getTime() - now) / 1000));
    const ready = secsLeft <= 0;
    const ring = RARITY_RING[p.rarity] || "#8fbf6a";
    const canFertilize = !ready && garden.fertilizer > 0 && !p.fertilized;
    const canBuyFert = garden.gold >= garden.fertilizerPrice;
    const fBusy = busy === `f-${slot}`;
    const hBusy = busy === `h-${slot}`;

    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${p.name} crop`} style={{ width: "100%", maxWidth: 320, borderRadius: 16, background: "var(--card-bg,#17181c)", border: `2px solid ${ring}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", animation: "pigPop .4s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ padding: "18px 18px 12px", textAlign: "center", background: `radial-gradient(120% 90% at 50% 0%, ${ring}33, transparent 70%)` }}>
                    {(() => {
                        const url = garden.cropSprites?.[ready ? `crop_${p.seedId}_ripe` : `crop_${p.seedId}_grow`] || garden.cropSprites?.crop_sprout;
                        return url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt="" draggable={false} style={{ width: 78, height: 78, objectFit: "contain", filter: "drop-shadow(0 4px 7px rgba(0,0,0,0.45))", animation: "farmBob 2.4s ease-in-out infinite" }} />
                        ) : <div style={{ fontSize: 46, lineHeight: 1 }}>{ready ? p.emoji : p.sprout}</div>;
                    })()}
                    <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>{p.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: ring, textTransform: "capitalize", marginTop: 2 }}>{p.rarity}{p.fertilized ? " · 💧 fertilized" : ""}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                        {ready ? "🌟 Ready to harvest!" : <>⏳ <strong style={{ color: "#f2f6ee" }}>{fmtGrow(secsLeft)}</strong> until ripe</>}
                    </div>
                </div>
                <div style={{ padding: "6px 16px 4px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#9aa0a6", margin: "6px 2px 8px" }}>Expected harvest</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <ExpectStat icon="✨" value={`+${(p.xp || 0).toLocaleString()}`} label="your XP" accent="#8fe39a" />
                        <ExpectStat icon="🐾" value={`+${(p.xp || 0).toLocaleString()}`} label="pet XP" accent="#c9b4ff" />
                    </div>
                    {p.loot ? (
                        <div style={{ marginTop: 8, padding: "9px 12px", borderRadius: 11, background: `${ring}1f`, border: `1px solid ${ring}80`, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                            <span style={{ fontSize: 16 }}>🎁</span><span>Chance at <strong style={{ color: ring }}>{p.loot}</strong> on harvest</span>
                        </div>
                    ) : null}
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 8, textAlign: "center" }}>🪙 sells for {(p.sell || 0).toLocaleString()} gold</div>
                </div>
                <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
                    {ready ? (
                        <button type="button" className="fm-btn fm-btn-harvest fm-sheen" onClick={() => { onHarvest(slot); onClose(); }} disabled={hBusy}>🧺 Harvest now</button>
                    ) : (
                        <>
                            <button type="button" className="fm-btn fm-btn-fert" onClick={() => onFertilize(slot)} disabled={!canFertilize || fBusy} title={p.fertilized ? "Already fertilized" : garden.fertilizer <= 0 ? "No fertilizer in stock" : ""}>
                                💧 {p.fertilized ? "Already fertilized" : "Fertilize · speed up growth"}
                                {!p.fertilized && garden.fertilizer > 0 ? <span style={{ fontWeight: 700, opacity: 0.82 }}>({garden.fertilizer} left)</span> : null}
                            </button>
                            {!p.fertilized && garden.fertilizer <= 0 ? (
                                <button type="button" className="fm-btn fm-btn-fert" onClick={onBuyFertilizer} disabled={!canBuyFert || busy === "fbuy"}>💧 Buy fertilizer <span style={{ opacity: 0.78, fontWeight: 700 }}>({garden.fertilizerPrice}g)</span></button>
                            ) : null}
                        </>
                    )}
                    {onSpecialize ? (
                        <button type="button" className="fm-btn fm-btn-spec fm-sheen fm-btn-upgrade" onClick={onSpecialize}>
                            <span className="fm-up-star" aria-hidden="true">★</span>
                            <span className="fm-up-text">
                                <span className="fm-up-title">Specialize this plot{p.specLevel ? <span className="fm-up-lvl">Lv {p.specLevel}</span> : null}</span>
                                <span className="fm-up-sub">Invest gold to boost this bed&rsquo;s yield</span>
                            </span>
                            <span className="fm-up-chev" aria-hidden="true">›</span>
                        </button>
                    ) : null}
                    <button type="button" className="fm-btn fm-btn-close" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

// One "expected harvest" stat tile (gold / XP) inside the plot inspect modal.
function ExpectStat({ icon, value, label, accent }) {
    return (
        <div style={{ padding: "10px 8px", borderRadius: 11, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
            <div style={{ fontSize: 18 }}>{icon}</div>
            <div style={{ fontWeight: 900, fontSize: 16, color: accent, marginTop: 2 }}>{value}</div>
            <div className="muted" style={{ fontSize: 11 }}>{label}</div>
        </div>
    );
}

// Per-plot specialization: invest gold into this plot's tracks to give it permanent passive attributes. You
// decide how each plot specializes — the levels persist across harvests.
const TRACK_ACCENT = { fertile: "#5fe39a", loam: "#ffd75e", nurture: "#c9b4ff", greenhouse: "#5fd6c8", ward: "#ff8f6a" };

function PlotUpgradeModal({ garden, slot, busy, gold = 0, onUpgrade, onClose }) {
    const plot = (garden.plots || []).find((x) => x.slot === slot);
    const tracks = plot?.tracks || [];
    const total = tracks.reduce((s, t) => s + t.level, 0);
    const maxTotal = tracks.reduce((s, t) => s + t.max, 0);
    const [justUp, setJustUp] = useState(null);
    const doUp = useCallback(async (key) => { const r = await onUpgrade(slot, key); if (r?.ok) { SFX?.coin?.(); setJustUp(key); setTimeout(() => setJustUp(null), 900); } }, [onUpgrade, slot]);
    const lead = tracks.filter((t) => t.level > 0).sort((a, b) => b.level - a.level)[0]; // the plot's "role" = most-invested track
    const roleName = lead ? `${lead.name} Bed` : "Unspecialized Bed";
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", padding: 14 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Specialize plot" style={{ width: "100%", maxWidth: 384, maxHeight: "90dvh", overflowY: "auto", overflowX: "hidden", borderRadius: 18, background: "var(--card-bg,#17181c)", border: "2px solid #b49aff", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", animation: "pigPop .35s cubic-bezier(.2,1.2,.3,1) both" }}>
                {/* hero header */}
                <div style={{ position: "relative", padding: "16px 18px 14px", background: "radial-gradient(130% 100% at 50% 0%, rgba(150,120,230,0.4), transparent 72%)" }}>
                    <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "inherit", fontSize: 22, cursor: "pointer", opacity: 0.7 }}>×</button>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#c9b4ff" }}>Plot {slot + 1} · Specialization</div>
                    <div style={{ fontWeight: 900, fontSize: 21, marginTop: 2, color: lead ? (TRACK_ACCENT[lead.key] || "#e8dcff") : "#e8dcff" }}>{roleName}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.4 }}>Pour gold in to give this plot permanent powers — you decide its role. Levels stay through every harvest.</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: "#e8dcff", background: "rgba(120,90,200,0.4)", border: "1px solid rgba(180,150,255,0.5)", borderRadius: 999, padding: "3px 11px" }}>⚙️ Power {total}/{maxTotal}</span>
                        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#ffd75e" }}>🪙 {gold.toLocaleString()}</span>
                    </div>
                </div>
                {/* tracks */}
                <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "4px 14px 16px" }}>
                    {tracks.map((t) => {
                        const accent = TRACK_ACCENT[t.key] || "#b49aff";
                        const afford = t.cost != null && gold >= t.cost;
                        const bKey = `pu-${slot}-${t.key}`;
                        const flash = justUp === t.key;
                        return (
                            <div key={t.key} style={{ padding: "11px 12px", borderRadius: 13, background: t.maxed ? `${accent}14` : "rgba(255,255,255,0.04)", border: `1px solid ${t.maxed ? `${accent}66` : "rgba(255,255,255,0.09)"}`, boxShadow: flash ? `0 0 0 2px ${accent}, 0 0 20px ${accent}99` : "none", transition: "box-shadow .3s ease" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ width: 36, height: 36, flex: "0 0 auto", display: "grid", placeItems: "center", fontSize: 20, borderRadius: 10, background: `${accent}22`, border: `1px solid ${accent}55` }}>{t.emoji}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: "block", fontWeight: 800, fontSize: 13.5 }}>{t.name}</span>
                                        <span className="muted" style={{ fontSize: 10.5, lineHeight: 1.3 }}>{t.desc}</span>
                                    </span>
                                    <span style={{ fontSize: 10.5, fontWeight: 900, color: t.maxed ? accent : "#cbb9e0", whiteSpace: "nowrap" }}>{t.maxed ? "MAX" : `Lv ${t.level}`}</span>
                                </div>
                                <div style={{ display: "flex", gap: 4, margin: "9px 0 8px" }}>
                                    {Array.from({ length: t.max }).map((_, i) => (
                                        <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < t.level ? accent : "rgba(255,255,255,0.12)", boxShadow: i < t.level ? `0 0 5px ${accent}77` : "none", transition: "background .35s ease, box-shadow .35s ease" }} />
                                    ))}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 700, color: accent }}>
                                        {t.now ? `+${t.now}${t.unit}` : "—"}{t.next != null ? ` → +${t.next}${t.unit}` : ""}
                                    </span>
                                    {t.maxed ? (
                                        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 900, color: accent }}>✓ MAXED</span>
                                    ) : (
                                        <button type="button" disabled={!afford || Boolean(busy)} onClick={() => doUp(t.key)} style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 10, border: "none", fontWeight: 900, fontSize: 12, cursor: afford && !busy ? "pointer" : "default", background: afford ? `linear-gradient(180deg, ${accent}, ${accent}bb)` : "rgba(255,255,255,0.08)", color: afford ? "#12100a" : "#9aa0a6", opacity: afford ? 1 : 0.55, boxShadow: afford ? `0 3px 0 ${accent}55` : "none" }}>
                                            {busy === bKey ? "…" : `🪙 ${t.cost.toLocaleString()}`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <button type="button" onClick={onClose} style={{ width: "calc(100% - 28px)", margin: "0 14px 16px", padding: 11, fontWeight: 800, background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 11, cursor: "pointer" }}>Done</button>
            </div>
        </div>
    );
}

// Harvest ENCOUNTER — a creature raided your harvest. Fight it with a timing meter: a marker sweeps a bar, tap
// to strike; land in the GREEN for a perfect hit (more perfects = bigger reward). Down its HP to win bonus loot.
// A friendly critter turns up at harvest with a GIFT — pure upside, no fight, no flee. You tap it a few times
// to shake the loot loose (juice only), then a confetti recap shows exactly what you got (XP + gold + a bonus).
const SHAKES_TO_POP = 3;
function EncounterModal({ encounter, onResolve, onClose }) {
    const [phase, setPhase] = useState("catch"); // catch | resolving | reward
    const [taps, setTaps] = useState(0);
    const [pops, setPops] = useState([]);        // floating sparkle bursts on each tap
    const [reward, setReward] = useState(null);
    const busyRef = useRef(false);
    const popId = useRef(0);

    const finish = useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setPhase("resolving");
        const r = await onResolve();
        // The reward is GRANTED at spawn and its exact value is on encounter.reward — so display that (the claim
        // call just clears the parked encounter and may come back without the numbers). Fall back to the response.
        setReward(encounter.reward ? { ...encounter.reward, ok: true } : (r?.ok && r.xp != null ? r : { error: true }));
        setPhase("reward");
    }, [onResolve, encounter.reward]);

    const shake = useCallback(() => {
        if (phase !== "catch") return;
        const n = taps + 1;
        setTaps(n);
        const id = (popId.current += 1);
        setPops((p) => [...p, { id, x: 30 + Math.random() * 40, e: ["✨", "💫", "⭐", "🌟"][id % 4] }]);
        setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 650);
        try { navigator?.vibrate?.(18); } catch { /* ok */ }
        if (n >= SHAKES_TO_POP) finish();
    }, [phase, taps, finish]);

    const gold = "#ffd75e";
    const spriteEl = encounter.sprite ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={encounter.sprite} alt={encounter.name} draggable={false} style={{ width: 128, height: 128, objectFit: "contain", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }} />
    ) : <span style={{ fontSize: 74, lineHeight: 1 }}>{encounter.emoji}</span>;

    return (
        <div onClick={phase === "reward" ? onClose : undefined} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10002, background: "radial-gradient(120% 120% at 50% 40%, rgba(30,40,20,0.66), rgba(4,6,2,0.86))", display: "grid", placeItems: "center", padding: 16, overflow: "hidden" }}>
            {phase === "reward" && !reward?.error ? (
                <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    {Array.from({ length: 22 }).map((_, i) => (
                        <span key={i} style={{ position: "absolute", top: -14, left: `${(i * 4.6) % 100}%`, width: 9, height: 14, borderRadius: 2, background: `hsl(${(i * 53) % 360},85%,58%)`, animation: `farmConfetti ${1.5 + (i % 5) * 0.2}s linear ${(i % 6) * 0.12}s infinite` }} />
                    ))}
                </div>
            ) : null}
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Harvest critter" style={{ position: "relative", width: "100%", maxWidth: 340, borderRadius: 18, background: "linear-gradient(180deg, rgba(30,34,24,0.98), rgba(16,18,12,0.99))", border: "2px solid #7cc36a", boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 50px -12px rgba(124,195,106,0.6)", padding: 22, textAlign: "center", animation: "pigPop .45s cubic-bezier(.2,1.3,.4,1) both" }}>
                {phase === "reward" ? (
                    <>
                        <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.08em", color: "#8fe39a" }}>🎁 CRITTER GIFT!</div>
                        <div style={{ margin: "6px 0 2px", animation: "farmBob 1.4s ease-in-out infinite" }}>{spriteEl}</div>
                        {reward && !reward.error ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                                    <span style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 900, fontSize: 15, color: "#2a1a06", background: "linear-gradient(180deg,#ffe488,#f3b23a)" }}>+{(reward.gold || 0).toLocaleString()} 🪙</span>
                                    <span style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 900, fontSize: 15, color: "#0a2e1c", background: "linear-gradient(180deg,#8fe39a,#3ec06a)" }}>+{(reward.xp || 0).toLocaleString()} ✨ XP</span>
                                </div>
                                {reward.loot ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,215,110,0.4)" }}>
                                        {reward.loot.sprite ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={reward.loot.sprite} alt="" draggable={false} style={{ width: 34, height: 34, objectFit: "contain" }} />
                                        ) : <span style={{ fontSize: 26 }}>{reward.loot.emoji}</span>}
                                        <span style={{ fontWeight: 800, fontSize: 13.5, textAlign: "left", flex: 1 }}>You also got <b style={{ color: gold }}>{reward.loot.label}</b>!</span>
                                    </div>
                                ) : null}
                            </div>
                        ) : <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>The critter already scurried off.</div>}
                        <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 16, padding: 12, fontWeight: 900, fontSize: 15, background: "linear-gradient(180deg,#8fe39a,#2fae72)", color: "#06311f", border: "none", borderRadius: 12, cursor: "pointer", boxShadow: "0 4px 0 #1f7d4f" }}>Collect! 🐺</button>
                    </>
                ) : (
                    <>
                        <div className="muted" style={{ fontSize: 11.5 }}>You harvested {encounter.harvest?.emoji} {encounter.harvest?.name} — and…</div>
                        <button type="button" onClick={shake} aria-label={`Shake the ${encounter.name}`} disabled={phase !== "catch"} style={{ position: "relative", display: "block", margin: "8px auto 2px", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                            <span key={taps} style={{ display: "inline-block", animation: "encShake .28s ease" }}>{spriteEl}</span>
                            {pops.map((p) => (
                                <span key={p.id} aria-hidden="true" style={{ position: "absolute", left: `${p.x}%`, top: "10%", fontSize: 24, pointerEvents: "none", animation: "encSpark .65s ease-out forwards" }}>{p.e}</span>
                            ))}
                        </button>
                        <div style={{ fontWeight: 900, fontSize: 17, marginTop: 2 }}>A {encounter.name} brought you a gift!</div>
                        <div className="muted" style={{ fontSize: 12, margin: "4px 0 12px" }}>Tap it to shake the loot loose!</div>
                        {/* shake progress */}
                        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 12 }}>
                            {Array.from({ length: SHAKES_TO_POP }).map((_, i) => (
                                <span key={i} style={{ width: 20, height: 10, borderRadius: 999, background: i < taps ? "linear-gradient(90deg,#ffd75e,#f3b23a)" : "rgba(255,255,255,0.14)", transition: "background .2s" }} />
                            ))}
                        </div>
                        <button type="button" onClick={shake} disabled={phase !== "catch"} style={{ width: "100%", padding: 14, fontWeight: 900, fontSize: 16, background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#2a1a06", border: "none", borderRadius: 12, cursor: "pointer", boxShadow: "0 4px 0 #b57f22" }}>🫳 Shake it out!</button>
                    </>
                )}
            </div>
        </div>
    );
}

// Once-a-day "while you were away" recap of the passive income your pets banked.
function IncomeRecapModal({ recap, onClose }) {
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Daily recap" style={{ width: "100%", maxWidth: 320, borderRadius: 18, overflow: "hidden", background: "var(--card-bg,#17181c)", border: "2px solid #8fe39a", boxShadow: "0 20px 60px rgba(0,0,0,0.55)", animation: "pigPop .42s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ padding: "18px 18px 12px", textAlign: "center", background: "radial-gradient(130% 100% at 50% 0%, rgba(67,217,138,0.35), transparent 72%)" }}>
                    <div style={{ fontSize: 42 }}>🐾💤</div>
                    <div style={{ fontWeight: 900, fontSize: 18, marginTop: 4 }}>Welcome back!</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>While you were away, your menagerie was hard at work.</div>
                </div>
                <div style={{ padding: "6px 16px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {recap.xp > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(143,227,154,0.1)", border: "1px solid rgba(143,227,154,0.35)" }}>
                            <span style={{ fontSize: 22 }}>✨</span><span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>Passive XP earned</span><span style={{ fontWeight: 900, color: "#8fe39a" }}>+{recap.xp.toLocaleString()}</span>
                        </div>
                    ) : null}
                    {recap.gold > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,215,94,0.1)", border: "1px solid rgba(255,215,94,0.35)" }}>
                            <span style={{ fontSize: 22 }}>🪙</span><span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>Passive gold earned</span><span style={{ fontWeight: 900, color: "#ffd75e" }}>+{recap.gold.toLocaleString()}</span>
                        </div>
                    ) : null}
                    {recap.raffleTickets > 0 ? (
                        <div className="muted" style={{ fontSize: 11.5, textAlign: "center", marginTop: 2 }}>🎟️ Your Fortune is also banking {recap.raffleTickets} boss-raffle ticket{recap.raffleTickets === 1 ? "" : "s"}/day.</div>
                    ) : null}
                </div>
                <div style={{ padding: "6px 16px 16px" }}>
                    <button type="button" onClick={onClose} style={{ width: "100%", padding: 12, fontWeight: 900, background: "linear-gradient(180deg,#43d98a,#2fae72)", color: "#06311f", border: "none", borderRadius: 12, cursor: "pointer", boxShadow: "0 3px 0 #1c7a4f" }}>Collect &amp; carry on</button>
                </div>
            </div>
        </div>
    );
}

// Harvest / rain-boost reward modal.
function HarvestToast({ toast, onClose }) {
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" style={{ width: "100%", maxWidth: 300, borderRadius: 16, background: "var(--card-bg,#17181c)", border: "2px solid #2fae72", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: 20, textAlign: "center", animation: "pigPop .4s cubic-bezier(.2,1.2,.3,1) both" }}>
                {toast.rain ? (
                    <>
                        <div style={{ fontSize: 44 }}>🌧️🌱</div>
                        <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6 }}>Rain boost!</div>
                        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>The rain surged {toast.rain} crop{toast.rain === 1 ? "" : "s"} closer to harvest.</div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: 46 }}>{toast.emoji}</div>
                        <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6 }}>Harvested {toast.name}!</div>
                        {/* Lead with the real payoff: XP + pet progress. Farming is an XP / pet engine — gold is a garnish. */}
                        {toast.xp ? <div style={{ fontSize: 24, fontWeight: 900, color: "#8fe39a", marginTop: 6 }}>✨ +{toast.xp} XP</div> : null}
                        {toast.petFed ? (
                            <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: toast.petFed.leveled ? "rgba(255,210,90,0.16)" : "rgba(180,150,255,0.12)", border: `1px solid ${toast.petFed.leveled ? "rgba(255,210,90,0.55)" : "rgba(180,150,255,0.4)"}`, fontWeight: 800, fontSize: 13 }}>
                                {toast.petFed.leveled ? `★ ${toast.petFed.emoji} ${toast.petFed.name} reached Lv ${toast.petFed.level}!` : `${toast.petFed.emoji} ${toast.petFed.name} +${toast.petFed.xp} pet XP`}
                            </div>
                        ) : null}
                        {toast.bonus ? <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: "rgba(140,200,255,0.12)", border: "1px solid rgba(140,200,255,0.45)", fontWeight: 800, fontSize: 13 }}>🎁 Harvest loot: {toast.bonus}</div> : null}
                        {toast.newPet ? <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: "rgba(255,210,90,0.16)", border: "1px solid rgba(255,210,90,0.55)", fontWeight: 800, fontSize: 13 }}>🎉 New farm pet unlocked: {toast.newPet.name}!</div> : null}
                        {toast.savedSeed ? <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: "rgba(120,220,120,0.12)", border: "1px solid rgba(120,220,120,0.45)", fontWeight: 700, fontSize: 13 }}>🌰 Seed saved! {toast.savedEmoji} back in your bag</div> : null}
                        {toast.foundSeed ? <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: "rgba(143,227,154,0.12)", border: "1px solid rgba(143,227,154,0.45)", fontWeight: 700, fontSize: 13 }}>🌱 Found a {toast.foundSeed.emoji} {toast.foundSeed.name} seed in the harvest!</div> : null}
                        {/* Gold demoted to a quiet garnish line. */}
                        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{toast.doubled ? "×2 " : ""}+{(toast.gold || 0).toLocaleString()} 🪙 sold</div>
                    </>
                )}
                <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 16, padding: 11, fontWeight: 800, background: "#2fae72", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>Nice!</button>
            </div>
        </div>
    );
}

// Detail card for a single pet: big sprite, rarity/level, XP progress, what it does, and — on your own farm —
// the once-a-day "pet for XP" action.
function PetInspect({ pet, mine = true, ownerName, canPet, petXp, petGold, petting, wallet, treats = [], treatShop = [], busyKey, onPet, onRecharge, onUseTreat, onBuyTreat, onClose }) {
    const busy = Boolean(busyKey);
    const def = collectibleById(pet.id);
    const perk = def ? petPerk(def) : null; // active (equipped) signature
    const passive = def ? petPassive(def) : null; // owned bonus
    const ring = RARITY_RING[pet.rarity] || "#9aa0a6";
    const pct = pet.maxed || !pet.span ? 100 : Math.round((Math.min(pet.into, pet.span) / pet.span) * 100);
    return (
        <div
            onClick={onClose}
            role="presentation"
            style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={`${pet.name} details`}
                style={{ width: "100%", maxWidth: 360, maxHeight: "90dvh", overflowY: "auto", overflowX: "hidden", borderRadius: 16, background: "var(--card-bg, #17181c)", border: `2px solid ${ring}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
            >
                <div style={{ position: "relative", padding: "18px 16px 10px", textAlign: "center", background: `radial-gradient(120% 90% at 50% 0%, ${ring}22 0%, transparent 70%)` }}>
                    <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: "inherit", fontSize: 20, cursor: "pointer", opacity: 0.7 }}>×</button>
                    {pet.spriteUrl ? (
                        <span className="farm-portrait" style={{ "--pring": `${ring}88`, width: 148, height: 148, background: `radial-gradient(80% 80% at 50% 35%, ${ring}18, rgba(0,0,0,0.25))` }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pet.spriteUrl} alt={pet.name} width={148} height={148} style={{ width: 148, height: 148, objectFit: "cover", display: "block" }} />
                        </span>
                    ) : null}
                    <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{pet.name}</div>
                    <div style={{ marginTop: 2, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: ring, fontWeight: 700, textTransform: "capitalize", fontSize: 13 }}>{pet.rarity}</span>
                        <span style={{ color: "#ffd75e", letterSpacing: 1 }}>
                            {"★".repeat(pet.level)}<span style={{ opacity: 0.3 }}>{"★".repeat(Math.max(0, 5 - pet.level))}</span>
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>Lv {pet.level}{pet.maxed ? " · MAX" : ""}</span>
                    </div>
                </div>

                <div style={{ padding: "8px 16px 16px" }}>
                    {/* XP bar */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ height: 8, borderRadius: 6, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: pet.maxed ? "#ffd75e" : ring, transition: "width .4s ease" }} />
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 3, textAlign: "right" }}>
                            {pet.maxed ? "Max level reached" : `${Math.min(pet.into, pet.span)} / ${pet.span} XP to Lv ${pet.level + 1}`}
                        </div>
                    </div>

                    {/* What it does — two clean, parallel effect rows (equipped power + owned bonus) */}
                    {(perk || passive) ? (
                        <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                            {perk ? <FxRow label="Equipped power" icon={perk.icon} name={perk.name} desc={perk.desc} accent={ring} /> : null}
                            {passive ? (() => { const ob = ownedBonusParts(passive, pet.level || 1, pet.maxed); return <FxRow label="Owned bonus" icon={ob.icon} name={ob.name} desc={ob.desc} accent="#9aa0a6" />; })() : null}
                        </div>
                    ) : null}

                    {/* Pet action (own farm only) — shared daily budget, rechargeable for gold.
                        A Lv5 pet is skipped entirely: petting it spent one of your daily charges to teach it
                        nothing, and the treats below would have been destroyed for the same nothing. */}
                    {canPet && pet.maxed ? (
                        <div style={{ marginTop: 8, textAlign: "center", padding: "10px 8px", borderRadius: 10,
                            background: "rgba(255,215,94,0.08)", border: "1px solid rgba(255,215,94,0.35)", color: "#ffd75e", fontWeight: 700 }}>
                            Max level — save your pettings and treats for another pet
                        </div>
                    ) : null}
                    {canPet && !pet.maxed ? (
                        <div style={{ marginTop: 4 }}>
                            {pet.petted ? (
                                <div style={{ textAlign: "center", padding: "8px 0 2px", color: "#ff9ec2", fontWeight: 600 }}>{mine ? "❤️ Petted today — come back tomorrow" : "❤️ You petted this pet — spread the love!"}</div>
                            ) : petting && petting.left <= 0 ? (
                                <div>
                                    {/* LOCKED — deliberately reads as "you can't pet" so a stray tap is never mistaken for a free
                                        petting. The recharge below is styled as an obvious GOLD purchase, not the pink Pet button. */}
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.22)", color: "#c7ccd1", fontWeight: 800, fontSize: 13 }}>
                                        🔒 Out of {mine ? "free pettings" : "visits"} today
                                    </div>
                                    {wallet && wallet.gold >= petting.rechargeCost ? (
                                        <button type="button" onClick={onRecharge} disabled={busy} style={{ width: "100%", marginTop: 8, padding: "11px 12px", fontWeight: 900, background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#3a2c08", border: "none", borderRadius: 10, cursor: busy ? "default" : "pointer", boxShadow: "0 3px 0 #b57f22", opacity: busy ? 0.7 : 1 }}>
                                            {busyKey === "recharge" ? "Recharging…" : `🪙 Buy ${petting.rechargeAmount} more pettings · ${petting.rechargeCost.toLocaleString()}g`}
                                        </button>
                                    ) : (
                                        <div style={{ marginTop: 8 }}>
                                            <CoinCta price={petting.rechargeCost} have={wallet?.gold || 0} label={`coins for ${petting.rechargeAmount} more`} />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <button type="button" onClick={onPet} disabled={busy} style={{ width: "100%", padding: "10px 12px", fontWeight: 700, background: "#e0559a", color: "#fff", border: "none", borderRadius: 10, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
                                        {busyKey === pet.id ? "Petting…" : mine ? `❤️ Pet ${pet.name} (+${petXp} XP, +${petGold}g)` : `❤️ Pet ${pet.name} — +${petXp} XP for them, +${petGold}g for you`}
                                    </button>
                                    {petting ? <div className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>{petting.left} of {petting.allowance} pettings {mine ? "for your own pets" : "for visiting others' pets"} today</div> : null}
                                </>
                            )}
                        </div>
                    ) : null}

                    {/* Feed a treat you own */}
                    {canPet && !pet.maxed && treats.length ? (
                        <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{mine ? "🍖 Feed a treat" : `🍖 Feed a treat 💛 — a gift to ${ownerName || "them"} (earns you a little too)`}</div>
                            {pet.maxed ? (
                                <div className="muted" style={{ fontSize: 12 }}>{pet.name} is max level — treats won&apos;t add more.</div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {treats.map((t) => (
                                        <button key={t.id} type="button" onClick={() => onUseTreat(t.id)} disabled={busy} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, color: "inherit", cursor: busy ? "default" : "pointer", opacity: busy && busyKey !== t.id ? 0.5 : 1 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600 }}>{t.emoji} {t.name} <span className="muted" style={{ fontWeight: 400 }}>· {t.xp === "level" ? "instant level" : `+${t.xp} XP`}</span></span>
                                            <span className="muted" style={{ fontSize: 12 }}>{busyKey === t.id ? "feeding…" : `×${t.count}`}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {/* Buy treats + store-credit CTA (own farm) */}
                    {canPet && !pet.maxed && treatShop.length ? (
                        <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>🛒 Buy treats</span>
                                <span className="muted" style={{ fontSize: 12 }}>{(wallet?.gold ?? 0).toLocaleString()}g</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {treatShop.map((t) => {
                                    const afford = (wallet?.gold ?? 0) >= t.price;
                                    return (
                                        <button key={t.id} type="button" onClick={() => afford && onBuyTreat(t.id)} disabled={busy || !afford} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "inherit", cursor: busy || !afford ? "default" : "pointer", opacity: !afford ? 0.55 : busy && busyKey !== t.id ? 0.5 : 1 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600 }}>{t.emoji} {t.name} <span className="muted" style={{ fontWeight: 400 }}>· +{t.xp} XP</span></span>
                                            <span style={{ fontSize: 12, color: afford ? "#ffd75e" : "#9aa0a6" }}>{busyKey === t.id ? "buying…" : `${t.price.toLocaleString()}g`}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <a href="/marketplace/credit" style={{ display: "block", textAlign: "center", marginTop: 8, fontSize: 12, fontWeight: 700, color: "#ffd75e" }}>Low on gold? Get store credit &amp; coins →</a>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

// Weather effects layered over the VISIBLE pasture (doesn't scroll with the field). Rain/snow are cheap,
// index-positioned particles (deterministic → no hydration mismatch); fog + storm add drifting haze + flashes.
function FarmWeather({ condition }) {
    const rain = condition === "rain" || condition === "storm";
    const snow = condition === "snow";
    const fog = condition === "fog";
    const haze = condition === "cloudy" || condition === "storm" || fog;
    if (!rain && !snow && !fog && !haze) return null;
    const drops = rain ? 60 : snow ? 55 : 0;
    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: 16, zIndex: 40 }}>
            {haze ? <div style={{ position: "absolute", inset: 0, background: fog ? "rgba(206,210,214,0.42)" : "rgba(84,94,104,0.16)" }} /> : null}
            {Array.from({ length: drops }).map((_, i) => {
                const left = (i * 37) % 100;
                if (rain) {
                    const dur = 0.5 + ((i * 13) % 5) / 10;
                    return <span key={i} style={{ position: "absolute", left: `${left}%`, top: -30, width: 2, height: 15, borderRadius: 2, background: "linear-gradient(rgba(180,198,226,0), rgba(180,198,226,0.85))", animation: `farmRain ${dur}s linear ${((i * 7) % 10) / 10}s infinite` }} />;
                }
                const dur = 3 + ((i * 13) % 4);
                return <span key={i} style={{ position: "absolute", left: `${left}%`, top: -20, width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.92)", boxShadow: "0 0 3px rgba(255,255,255,0.5)", animation: `farmSnow ${dur}s linear ${((i * 9) % 20) / 10}s infinite` }} />;
            })}
            {fog ? [0, 1, 2].map((k) => <div key={k} style={{ position: "absolute", left: "-10%", right: "-10%", top: `${18 + k * 24}%`, height: 80, background: "rgba(224,228,232,0.55)", filter: "blur(16px)", animation: `farmFog ${8 + k * 3}s ease-in-out ${k}s infinite alternate` }} />) : null}
            {condition === "storm" ? <div style={{ position: "absolute", inset: 0, background: "#eaf0ff", animation: "farmFlash 9s linear infinite" }} /> : null}
        </div>
    );
}

// Owner tool: a scrollable directory of member HERO CARDS (avatar + featured pet + level + pet count) to walk
// over and visit their farm. Clean search (no emoji), avatars instead of verbose @handles.
const SearchIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M20.5 20.5l-4-4" />
    </svg>
);
// ── NEIGHBOURS ───────────────────────────────────────────────────────────────────────────────────────────────
// The farm's two social loops — rate someone's farm, pet someone's pets — pay both sides and were effectively
// hidden: the rating sat behind a collapsed summary on a farm you had to already be standing on, and the only
// way to find a farm to stand on was a directory collapsed inside that same collapsed summary. Two things you
// are given three of every single day, and nothing on the screen you open first said either of them existed.
//
// This is the fix, and it is the first thing under the pasture: what you have left today, and WHO to spend it
// on — un-rated farms first, with a tick on the ones already done. The whole point is that it answers "who
// haven't I visited yet" without a search box, a tap, or knowing anyone's @name.
function NeighbourStrip({ neighbours, ratesLeft, petsLeft }) {
    // ── AND ANYONE ELSE ── the eight faces answer "who owes me a visit", which is the right question most
    // days and the wrong one the day you want to go and look at a particular person's farm. There WAS a way:
    // a search box, inside the collapsed rating summary, under the standings. Nobody found it. It is here now,
    // beside the faces, because this is the card that is about going somewhere.
    // ── A DIRECTORY, NOT A LOOKUP ────────────────────────────────────────────────────────────────────────
    // This was a search box: type two letters, wait for a request, get up to twelve matches. Which means you
    // could only visit somebody whose NAME YOU ALREADY KNEW — and the whole point of visiting is finding a
    // farm you have not seen. A directory you cannot browse is a phone book with no pages.
    //
    // Everybody is fetched ONCE, on open, and the box filters what is already on screen. No debounce, no
    // request per keystroke, and no empty state while you wait: the cards are there before you type and they
    // narrow as you do.
    const [q, setQ] = useState("");
    const [all, setAll] = useState(null);
    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/farm?list=1", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive) setAll(Array.isArray(d?.members) ? d.members : []); })
            .catch(() => { if (alive) setAll([]); });
        return () => { alive = false; };
    }, []);
    // The neighbours strip stays FIRST and keeps its "came by" marks — those are the visits that pay you back,
    // and burying them in an alphabetical wall would lose the one thing worth acting on.
    const roster = useMemo(() => {
        const owedIds = new Set((neighbours || []).map((n) => n.id));
        const rest = (all || []).filter((m) => !owedIds.has(m.id));
        return [...(neighbours || []), ...rest];
    }, [all, neighbours]);
    const term = q.trim().toLowerCase().replace(/^@/, "");
    const shown = term
        ? roster.filter((m) => `${m.name || ""} ${m.alias || ""}`.toLowerCase().includes(term))
        : roster;
    if (!neighbours?.length) return null;
    const togo = neighbours.filter((n) => !n.ratedToday);
    const spent = ratesLeft <= 0 && petsLeft <= 0;
    // Who came to YOU and has not been paid back yet. This is the line worth leading with when it applies —
    // "someone was here" is a far better reason to tap than "here are some farms".
    const owed = neighbours.filter((n) => n.cameBy && !n.ratedToday);
    return (
        <section className="card farm-neigh">
            <div className="farm-neigh-head">
                <strong>Visit the neighbours</strong>
                {spent ? (
                    <span className="farm-neigh-done">All spent today — nice one</span>
                ) : (
                    <span className="farm-neigh-left">
                        {ratesLeft > 0 ? <b>{ratesLeft} rating{ratesLeft === 1 ? "" : "s"}</b> : <s>ratings</s>}
                        <em>·</em>
                        {petsLeft > 0 ? <b>{petsLeft} petting{petsLeft === 1 ? "" : "s"}</b> : <s>pettings</s>}
                        <em>left</em>
                    </span>
                )}
            </div>
            <p className="farm-neigh-sub">
                {!togo.length
                    ? "You have been round everyone today. They re-arm at midnight."
                    : owed.length
                        ? <><b style={{ color: "#ffd75e" }}>{owed.length === 1 ? `${owed[0].name} came by` : `${owed.length} of these came by`}</b> in the last few days — pay it back.</>
                        : "Their pets gain the XP and their farm gains the vote — and both pay you back."}
            </p>
            {/* FILTERS what is already here rather than fetching what you typed. */}
            <label className="farm-find">
                <SearchIcon />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder={all ? `Filter ${roster.length} farms` : "Loading farms…"}
                    aria-label="Filter farms" />
            </label>

            {/* ── EVERY FARM, AS A CARD ────────────────────────────────────────────────────────────────────
                A wrapping grid, not a horizontal strip: a strip shows four and hides the rest behind a
                sideways scroll nobody performs, which is how a directory of ninety-five people read as a
                directory of four. The ones who came by keep their gold mark and stay at the front. */}
            {shown.length ? (
                <div className="farm-neigh-grid">
                    {shown.map((n) => {
                        const avatar = n.spriteUrl || n.avatarUrl;
                        return (
                            <a key={n.id}
                                className={`farm-neigh-chip${n.ratedToday ? " is-done" : ""}${n.cameBy && !n.ratedToday ? " is-owed" : ""}`}
                                href={`/marketplace/farm?u=${encodeURIComponent(n.alias)}`}
                                title={n.ratedToday ? `${n.name} — rated today` : n.cameBy ? `${n.name} visited you recently` : `Visit ${n.name}'s farm`}>
                                <span className="farm-neigh-face">
                                    {avatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={avatar} alt="" style={{ transform: n.spriteFlip ? "scaleX(-1)" : "none" }} />
                                    ) : <span aria-hidden="true">🐾</span>}
                                </span>
                                <b>{n.name}</b>
                                <em>{n.ratedToday ? "rated today" : n.cameBy ? "came by" : n.decoCount ? `${n.decoCount} placed` : "say hi"}</em>
                            </a>
                        );
                    })}
                </div>
            ) : (
                <p className="farm-neigh-sub">
                    {all === null ? "Loading farms…" : term ? "Nobody by that name." : "No farms to visit yet."}
                </p>
            )}
        </section>
    );
}

// ── VISITING SOMEBODY ────────────────────────────────────────────────────────────────────────────────────────
// The other half of the same problem. You land on a friend's farm holding three pettings you probably do not
// know you have, and the only way to spend one is to notice a small animal somewhere in the pasture art, tap
// it, and find the button inside the panel that opens. Nothing counted them, nothing named them, and a pet
// standing behind the barn was a petting nobody ever gave.
//
// Their whole menagerie, as buttons, at the top of the screen. Tap a face, that pet gains the XP and you get
// paid — no hunting in the scene, and the number you have left is the loudest thing on the card.
function VisitPets({ pets = [], ownerName, petsLeft = 0, petXp = 30, petGold = 8, busyKey, onPet }) {
    if (!pets.length) return null;
    const spent = petsLeft <= 0;
    return (
        <section className="card farm-neigh is-visit">
            <div className="farm-neigh-head">
                <strong>Say hello to {ownerName}&rsquo;s companions</strong>
                {spent
                    ? <span className="farm-neigh-done is-out">None left today</span>
                    : <span className="farm-neigh-left"><b>{petsLeft}</b><em>petting{petsLeft === 1 ? "" : "s"} left</em></span>}
            </div>
            <p className="farm-neigh-sub">
                {spent
                    ? "Your three re-arm at midnight — the ratings are separate, so you may still have one of those."
                    : <>+{petXp} pet XP for theirs, +{petGold} gold and XP for you. Costs them nothing.</>}
            </p>
            <div className="farm-neigh-row">
                {pets.map((p) => (
                    <button key={p.id} type="button"
                        className={`farm-neigh-chip is-pet${p.maxed ? " is-done" : ""}`}
                        disabled={p.maxed || spent || Boolean(busyKey)}
                        onClick={() => onPet(p)}
                        title={p.maxed ? `${p.name} is fully grown` : `Pet ${p.name}`}>
                        <span className="farm-neigh-face">
                            {p.spriteUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.spriteUrl} alt="" style={{ transform: p.flip ? "scaleX(-1)" : "none" }} />
                            ) : <span aria-hidden="true">🐾</span>}
                        </span>
                        <b>{p.name}</b>
                        <em>{p.maxed ? "fully grown" : busyKey === p.id ? "…" : `Lv${p.level} · pet`}</em>
                    </button>
                ))}
            </div>
        </section>
    );
}

function HeroCard({ m, onClick }) {
    const avatar = m.spriteUrl || m.avatarUrl;
    return (
        <button
            type="button"
            onClick={onClick}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "8px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(100deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))", color: "inherit", cursor: "pointer", textAlign: "left" }}
        >
            <span style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,215,94,0.55)", display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.35)" }}>
                {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: "cover", transform: m.spriteFlip ? "scaleX(-1)" : "none" }} />
                ) : <span style={{ fontSize: 20 }}>🐾</span>}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>🎨 {m.decoCount} decoration{m.decoCount === 1 ? "" : "s"} · ⭐ {m.ratingCount} rating{m.ratingCount === 1 ? "" : "s"}</span>
            </span>
            <span style={{ opacity: 0.45, fontSize: 20, fontWeight: 700 }}>›</span>
        </button>
    );
}
