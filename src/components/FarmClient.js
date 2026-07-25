"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import CoinCta from "@/components/CoinCta";
import PetVisitReport from "@/components/PetVisitReport";
import FarmRatingReport from "@/components/FarmRatingReport";
import { DecoLayer, DecoDock, DecoInspect, CustomDecoCreator } from "@/components/FarmDecorations";
import { collectibleById, petPassive, PET_STAT_META } from "@/lib/marketplace/collectibles";
import { petPerk, GOLD_PER_POINT, TICKETS_PER_FORTUNE_PER_DAY } from "@/lib/marketplace/pet-perks";

const statText = (stat) => {
    const m = PET_STAT_META[stat] || { label: stat, icon: "" };
    return `${m.icon} ${m.label}`.trim();
};
// Plain-language description of a pet's OWNED (just-by-having-it) bonus. Earner stats no longer read as a raw
// "+6 Gold Find" number — they explain the actual effect.
const ownedBonusText = (p) => {
    // Passive income: gold uses the shared GOLD_PER_POINT rate (pet-perks.js), XP is 1 per point/hr (Lv1
    // base rate; each pet's share scales up as it levels, and every owned pet stacks).
    if (p.stat === "gold_find") return `💰 +${Math.max(1, Math.round(p.value * GOLD_PER_POINT))} gold/hr passive income — more as it levels (all your pets stack).`;
    if (p.stat === "xp_gain") return `✨ +${p.value} XP/hr passive income — more as it levels (all your pets stack).`;
    if (p.stat === "fortune") return `🍀 +${p.value * TICKETS_PER_FORTUNE_PER_DAY} boss-raffle tickets per day — banked all week (all your pets stack).`;
    return `+${p.value} ${statText(p.stat)} — buffs your boss damage (stacks across your whole menagerie).`;
};

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
    night: ["#0c1830", "#152343", "#26365f"],
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
// Illustrated farm backdrops per time of day (generated via /api/admin/farm-bg). Mirror-tiled behind the pets;
// falls back to the CSS gradient scene above until these are filled in. Storm/overcast reuse the base image +
// the weather overlays on top.
const FARM_BG = {
    day: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838066440-671862.png",
    dusk: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838089019-734565.png",
    night: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838349373-318702.png",
    dawn: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838132569-798406.png",
    storm: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838156570-858112.png",
    snow: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838178566-149863.png",
};
// Storm/snow get their own painted scene when available; otherwise use the time-of-day image + weather overlays.
const pickFarmBg = (tod, condition) =>
    (condition === "storm" && FARM_BG.storm) || (condition === "snow" && FARM_BG.snow) || FARM_BG[tod] || FARM_BG.day || null;

export default function FarmClient({ initial, viewingAlias }) {
    const router = useRouter();
    const [farm, setFarm] = useState(initial);
    const pets = useMemo(() => farm.pets || [], [farm.pets]);
    // On your own farm the fenced garden sits in the front-left corner, so keep the pets penned to the RIGHT
    // of it — they get the whole rest of the pasture to roam but never wander onto the crops.
    const gardened = Boolean(initial.mine && initial.garden);
    const petMinX = gardened ? 44 : FARM_PAD; // left edge of the pets' roaming band
    // Each pet gets a "home" slot spread evenly across its band and wanders around it. Deterministic init so
    // server & client HTML match (no hydration mismatch); the scheduler takes over on mount.
    const petSlotX = useCallback((i, n) => (n <= 1 ? (gardened ? 72 : 50) : petMinX + (i / (n - 1)) * (100 - FARM_PAD - petMinX)), [gardened, petMinX]);
    const homeX = useCallback((i) => petSlotX(i, pets.length), [petSlotX, pets.length]);
    const [pos, setPos] = useState(() => pets.map((_, i) => ({
        x: pets.length <= 1 ? (gardened ? 72 : 50) : petMinX + (i / (pets.length - 1)) * (100 - FARM_PAD - petMinX),
        y: 80 + ((i * 7) % 12), // low on the grass
        flip: i % 2 === 1,
        dur: 2, // seconds for the current stroll (varies per move → different speeds)
        moving: false,
        hopMs: 420 + ((i * 53) % 220), // this pet's personal hop cadence (stable)
    })));
    const [floaters, setFloaters] = useState([]);
    const floatId = useRef(0);
    const [busy, setBusy] = useState(null);
    const [inspect, setInspect] = useState(null); // the pet whose detail card is open
    const [ownerMenu, setOwnerMenu] = useState(false); // farmer character tapped → connect menu
    const [crownOpen, setCrownOpen] = useState(false); // owner crown-calibrator tool
    const [customOpen, setCustomOpen] = useState(false); // custom-decoration creator
    const [pig, setPig] = useState(null); // "running" while the loot pig is on screen
    const [pigToast, setPigToast] = useState(false);
    const [pigResult, setPigResult] = useState(null); // the haul modal after he leaves

    // ── Garden (crops live IN the pasture) ── state is lifted up here so the growing plots render inside the
    // scrolling field, while a compact controls panel below shares the exact same live garden.
    const [garden, setGarden] = useState(initial.garden || null);
    const [gardenBusy, setGardenBusy] = useState(null);
    const [planting, setPlanting] = useState(null); // slot awaiting a seed choice → opens the picker modal
    const [inspectSlot, setInspectSlot] = useState(null); // a growing plot being inspected (crop details + fertilize)
    const [inspectDeco, setInspectDeco] = useState(null); // a placed decoration being inspected (details + pick up)
    const [harvestToast, setHarvestToast] = useState(null); // harvest / rain reward modal
    const rainedRef = useRef(false);

    // Wild Loot Pig: once/day, at a random moment after you land on YOUR farm, a crowned pig may rampage
    // through dropping gold. The payout is server-guarded once/day; this just decides the dramatic entrance.
    useEffect(() => {
        if (!initial.mine || !initial.pigAvailable) return undefined;
        const t = setTimeout(() => {
            if (Math.random() < 0.7) {
                setPig("running");
                setPigToast(true);
                SFX.oink();
                SFX.startPigMusic();
                setTimeout(() => setPigToast(false), 4200);
            }
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
        if (typeof document === "undefined" || !(inspect || pigResult || harvestToast || planting != null || inspectSlot != null || inspectDeco || crownOpen || customOpen)) return undefined;
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
    }, [inspect, pigResult, harvestToast, planting, inspectSlot, inspectDeco, crownOpen, customOpen]);
    // Real-world sky + weather. Starts as a plain daytime sky (matches SSR), then fills in from the device clock
    // and — if the visitor allows location — live conditions (rain / snow / fog + day-night) via Open-Meteo.
    const [weather, setWeather] = useState({ tod: "day", condition: "clear", isDay: true, located: false });
    const [wxOverride] = useState({ tod: null, condition: null }); // reserved (sky always follows real weather now)
    useEffect(() => {
        const t0 = setTimeout(() => setWeather((w) => ({ ...w, tod: hourToTod(new Date().getHours()) })), 0);
        if (typeof navigator === "undefined" || !navigator.geolocation) return () => clearTimeout(t0);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords || {};
                if (latitude == null) return;
                const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&current=weather_code,is_day&timezone=auto`)
                    .then((x) => (x.ok ? x.json() : null))
                    .catch(() => null);
                const cur = r?.current;
                if (!cur) return;
                const isDay = cur.is_day === 1;
                setWeather({ tod: hourToTod(new Date().getHours(), isDay), condition: wmoToCondition(cur.weather_code), isDay, located: true });
            },
            () => {},
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
            const nx = clamp(homeX(i) + rand(-5, 5), petMinX, 100 - FARM_PAD);
            const ny = 78 + rand(0, 14); // stay low on the grass
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
        return res ? res.json().catch(() => null) : null;
    }, []);

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

    // Owner debug: clear today's pig guard and force him to spawn now (repeatable testing).
    const spawnPigDebug = useCallback(async () => {
        if (pig) return;
        await post({ action: "pig_reset" });
        setFarm((f) => ({ ...f, pigAvailable: true }));
        setPig("running");
        setPigToast(true);
        SFX.oink();
        SFX.startPigMusic();
        setTimeout(() => setPigToast(false), 4200);
    }, [pig, post]);

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
        if (i >= 0) addFloater(i, r.petLevelUp ? "⬆️ LEVEL UP!" : r.forOther ? `+${r.playerXp} XP · +${r.goldGained}g 💛` : `+${r.petXpGain || ""} XP`, "#ffe27a");
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
    const harvestAt = useCallback(async (slot) => {
        const r = await gardenAct({ action: "harvest", slot }, `h-${slot}`);
        if (r?.ok) { setHarvestToast({ name: r.name, emoji: r.emoji, gold: r.gold, chest: r.chest, bonus: r.bonus, savedSeed: r.savedSeed, savedEmoji: r.savedEmoji }); SFX.coin(); }
    }, [gardenAct]);
    const fertilizeAt = useCallback((slot) => gardenAct({ action: "fertilizer_use", slot }, `f-${slot}`), [gardenAct]);
    const buyFert = useCallback(() => gardenAct({ action: "fertilizer_buy" }, "fbuy"), [gardenAct]);
    const buyUpgradeKey = useCallback((key) => gardenAct({ action: "farm_upgrade", key }, `u-${key}`), [gardenAct]);

    // Rate (like/love/admire) the farm you're visiting. Revising your rating is free; a brand-new rating spends
    // your one daily charge. Patches the summary in place with a juicy burst.
    const [rateBusy, setRateBusy] = useState(false);
    const [rateBurst, setRateBurst] = useState(null); // tier just applied → one-shot burst overlay
    const [rateNote, setRateNote] = useState(null); // e.g. "out of daily charges"
    const rateFarmAt = useCallback(async (tier) => {
        const R = farm.rating;
        if (!R?.canRate || rateBusy) return;
        if (R.myTier === tier) return; // tapping your current tier is a no-op
        setRateBusy(true);
        setRateNote(null);
        const r = await post({ action: "rate", tier, owner: farm.owner?.alias });
        setRateBusy(false);
        if (!r?.ok) {
            if (r?.error === "no_charge_left") setRateNote("You've used today's rating — but you can still change a rating you've already given, free.");
            return;
        }
        setRateBurst({ tier, id: Date.now() });
        setTimeout(() => setRateBurst((b) => (b && b.tier === tier ? null : b)), 950);
        SFX.coin();
        setFarm((f) => ({ ...f, rating: { ...f.rating, total: r.total, byTier: r.byTier, myTier: r.myTier, charge: r.charge } }));
    }, [farm.rating, farm.owner, rateBusy, post]);

    // Decorations — buy / place / drag-move / pick-up. Every action returns the fresh decoration state, which we
    // fold into both `decorations` (inventory) and `placements` (what renders in the scene).
    const [decoEditing, setDecoEditing] = useState(false);
    const [decoBusy, setDecoBusy] = useState(false);
    const decoAct = useCallback(async (body) => {
        setDecoBusy(true);
        const r = await post(body);
        setDecoBusy(false);
        if (r?.ok && r.owned) {
            setFarm((f) => ({
                ...f,
                placements: r.placements || f.placements,
                decorations: { owned: r.owned, placements: r.placements, buffs: r.buffs, buffMeta: r.buffMeta, keepout: r.keepout, catalog: r.catalog, placedTotal: r.placedTotal, placedCap: r.placedCap },
                wallet: f.wallet && r.gold != null ? { ...f.wallet, gold: r.gold } : f.wallet,
            }));
        }
        return r;
    }, [post]);
    const decoBuy = useCallback((decoId) => decoAct({ action: "deco_buy", decoId }), [decoAct]);
    const decoPlaceAt = useCallback((decoId, x, y) => decoAct({ action: "deco_place", decoId, x, y }), [decoAct]);
    const decoMove = useCallback((placementId, x, y) => decoAct({ action: "deco_move", placementId, x, y }), [decoAct]);
    const decoPickup = useCallback((placementId) => decoAct({ action: "deco_remove", placementId }), [decoAct]);
    const fieldRef = useRef(null);
    // Custom (player-made) decorations
    const customStart = useCallback(async (name, prompt) => {
        const r = await post({ action: "deco_custom_start", name, prompt });
        if (r?.ok) setFarm((f) => ({ ...f, decorations: { ...f.decorations, custom: { ...(f.decorations?.custom || {}), credits: r.credits, draft: r.draft } } }));
        return r;
    }, [post]);
    const customRefine = useCallback((id, prompt) => post({ action: "deco_custom_refine", id, prompt }), [post]);
    const customFinalize = useCallback(async (id, chosenUrl) => {
        const r = await post({ action: "deco_custom_finalize", id, chosenUrl });
        if (r?.ok && r.catalog) setFarm((f) => ({ ...f, placements: r.placements || f.placements, decorations: { owned: r.owned, placements: r.placements, buffs: r.buffs, buffMeta: r.buffMeta, keepout: r.keepout, catalog: r.catalog, custom: { ...(f.decorations?.custom || {}), draft: null }, placedTotal: r.placedTotal, placedCap: r.placedCap } }));
        return r;
    }, [post]);
    const customGrant = useCallback(async () => {
        const r = await post({ action: "deco_custom_grant" });
        if (r?.ok) setFarm((f) => ({ ...f, decorations: { ...f.decorations, custom: { ...(f.decorations?.custom || {}), credits: r.credits } } }));
        return r;
    }, [post]);
    // "Decorate" opens a bottom DOCK (farm scene stays visible; drag decorations up onto it) rather than a modal.
    const [decorating, setDecorating] = useState(false);
    const startDecorating = useCallback(() => {
        setDecorating(true);
        setDecoEditing(false); // start LOCKED — tap a piece to inspect; flip on "Move" to drag/reposition
        setTimeout(() => { try { fieldRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* noop */ } }, 60);
    }, []);
    const stopDecorating = useCallback(() => { setDecorating(false); setDecoEditing(false); }, []);
    const saveCrown = useCallback(async (cfg) => {
        const r = await post({ action: "crown_save", crown: cfg });
        if (r?.ok && r.crownCfg) setFarm((f) => ({ ...f, crownCfg: r.crownCfg }));
        return r;
    }, [post]);
    const gardenDebug = useCallback((action) => gardenAct({ action }, action), [gardenAct]);

    // Logging in during rain surges every growing crop closer to harvest (server-guarded once per plot per 6h).
    useEffect(() => {
        if (!farm.mine || !garden || rainedRef.current) return;
        const cond = wxOverride.condition || weather.condition;
        if (!["rain", "storm"].includes(cond)) return;
        rainedRef.current = true;
        post({ action: "rain" }).then((r) => { if (r?.ok && r.garden) { setGarden(r.garden); if (r.boosted) setHarvestToast({ rain: r.boosted }); } });
    }, [farm.mine, garden, weather.condition, wxOverride.condition, post]);

    // Wider pasture as you own more pets → they spread out evenly and the field scrolls sideways. ~36% of the
    // viewport per pet gives each one lots of elbow room.
    const fieldW = Math.max(150, pets.length * 36);
    // Effective sky = detected weather, unless the owner has forced a value via the debug controls.
    const wx = {
        tod: wxOverride.tod || weather.tod,
        condition: wxOverride.condition || weather.condition,
        located: wxOverride.tod || wxOverride.condition ? true : weather.located,
        forced: Boolean(wxOverride.tod || wxOverride.condition),
    };
    // Illustrated backdrop for the current time of day (falls back to the CSS gradient scene when not generated).
    const bgUrl = pickFarmBg(wx.tod, wx.condition);
    const bgCopies = Math.min(20, Math.max(6, Math.ceil(fieldW / 40)));

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
                @keyframes farmRain { to { transform: translateY(480px); } }
                @keyframes farmSnow { to { transform: translateY(470px) translateX(18px); } }
                @keyframes farmFog { from { transform: translateX(-5%) } to { transform: translateX(5%) } }
                @keyframes farmFlash { 0%,90%,100% { opacity: 0 } 91% { opacity: .55 } 93% { opacity: 0 } 95% { opacity: .38 } 96% { opacity: 0 } }
                @keyframes pigBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
                @keyframes crownJiggle { 0%,100% { transform: translateX(-50%) rotate(-11deg); } 50% { transform: translateX(-50%) rotate(11deg); } }
                @keyframes coinPop { 0% { opacity: 0; transform: translate(-50%, -22px) scale(.4) rotate(0deg); } 25% { opacity: 1; } 100% { opacity: 1; transform: translate(-50%, 0) scale(1) rotate(360deg); } }
                @keyframes pigPop { 0% { opacity: 0; transform: scale(.82); } 60% { transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
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
                .farm-bg-strip { position: absolute; inset: 0; z-index: 0; display: flex; width: max-content; }
                .farm-bg-strip img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
                .farm-bg-strip img:nth-child(even) { transform: scaleX(-1); }
                /* Juicy candy-gold button with a springy 3D press — for the friendly farm actions. */
                .farm-jbtn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 999px; font-weight: 800; font-size: 14px; cursor: pointer; border: 1px solid rgba(255,214,110,0.6); background: linear-gradient(180deg, #ffe488, #f3b23a); color: #3a2c08; box-shadow: 0 3px 0 #b57f22, 0 6px 14px rgba(0,0,0,0.35); transition: transform .12s cubic-bezier(.2,1.4,.4,1), box-shadow .12s ease, filter .12s ease; }
                .farm-jbtn:hover { filter: brightness(1.05); transform: translateY(-1px); box-shadow: 0 4px 0 #b57f22, 0 9px 18px rgba(0,0,0,0.42); }
                .farm-jbtn:active { transform: translateY(2px); box-shadow: 0 1px 0 #b57f22, 0 3px 8px rgba(0,0,0,0.35); }
                /* Floating in-scene decorate button — a gentle bob to invite the tap. */
                .farm-deco-fab { transition: transform .12s ease, filter .12s ease, box-shadow .12s ease; }
                @media (hover: hover) { .farm-deco-fab:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 7px 20px rgba(0,0,0,0.5); } }
                .farm-deco-fab:active { transform: translateY(1px) scale(0.97); }
                @media (prefers-reduced-motion: no-preference) { .farm-deco-fab { animation: farmBob 3.4s ease-in-out infinite; } }
                /* Visit-a-farm opener: an inviting, tappable bar (not a flat box). */
                .farm-visit { width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(255,214,110,0.3); background: linear-gradient(180deg, rgba(255,214,110,0.1), rgba(255,255,255,0.02)); color: inherit; cursor: pointer; text-align: left; transition: transform .12s ease, border-color .12s ease, background .12s ease; }
                .farm-visit:hover { transform: translateY(-1px); border-color: rgba(255,214,110,0.55); background: linear-gradient(180deg, rgba(255,214,110,0.16), rgba(255,255,255,0.03)); }
                .farm-visit:active { transform: translateY(1px); }
                .farm-visit .farm-visit-chev { transition: transform .2s ease; }
                /* Rarity-framed portrait tile so a pet sprite reads as an intentional framed portrait, not a raw square. */
                .farm-portrait { position: relative; display: inline-block; border-radius: 20px; overflow: hidden; }
                .farm-portrait::after { content: ""; position: absolute; inset: 0; border-radius: 20px; box-shadow: inset 0 0 0 2px var(--pring, rgba(255,255,255,0.15)), inset 0 -18px 30px rgba(0,0,0,0.35); pointer-events: none; }
            `}</style>

            {/* Welcome-back recaps: who petted your pets + who rated your farm (own farm only). */}
            {farm.mine ? <PetVisitReport /> : null}
            {farm.mine ? <FarmRatingReport /> : null}

            {!farm.mine ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0 }}>🏡 {farm.owner.name}&apos;s Farm</h2>
                    <button type="button" className="farm-jbtn" style={{ marginLeft: "auto" }} onClick={() => window.location.assign("/marketplace/farm")}>🏡 My farm</button>
                </div>
            ) : null}

            {farm.rating ? (
                <FarmRatingBar rating={farm.rating} ownerName={farm.owner.name} mine={farm.mine} busy={rateBusy} burst={rateBurst} note={rateNote} onRate={rateFarmAt} />
            ) : null}

            <FarmDirectory current={viewingAlias} />

            {/* The pasture — a seamless, weather-aware scene that scrolls sideways */}
            <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
                <div className="farm-scroll" style={{ width: "100%", overflowX: "auto", overflowY: "hidden" }}>
                    <div
                        ref={fieldRef}
                        style={{
                            position: "relative", width: `${fieldW}%`, minWidth: "100%", height: "min(52vh, 420px)",
                            background: fieldBackground(wx.tod, wx.condition),
                            boxShadow: "inset 0 -30px 60px rgba(0,0,0,0.12)", userSelect: "none", transition: "background 1.2s ease",
                        }}
                    >
                        {/* Illustrated backdrop, mirror-tiled to fill the scrollable width seamlessly */}
                        {bgUrl ? (
                            <div className="farm-bg-strip" aria-hidden="true">
                                {Array.from({ length: bgCopies }).map((_, k) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img key={k} src={bgUrl} alt="" />
                                ))}
                            </div>
                        ) : null}
                        {/* CSS-scene fallback (drifting clouds + fence) — only when no illustrated backdrop is set */}
                        {!bgUrl && ["clear", "cloudy"].includes(wx.condition) && wx.tod !== "night"
                            ? Array.from({ length: wx.condition === "cloudy" ? 7 : 4 }).map((_, k) => (
                                <div key={k} style={{ position: "absolute", top: `${8 + (k % 3) * 9}%`, left: `${(k * 23 + 6) % 96}%`, width: 78 + (k % 3) * 26, height: 22 + (k % 2) * 8, borderRadius: 22, background: wx.condition === "cloudy" ? "rgba(230,232,235,0.9)" : "rgba(255,255,255,0.82)", filter: "blur(1px)", animation: `farmCloud ${9 + (k % 4) * 2}s ease-in-out ${k * 0.6}s infinite alternate` }} />
                            ))
                            : null}
                        {!bgUrl ? (
                            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 40, opacity: 0.92 }}>
                                <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, #8a5c31 0 5px, transparent 5px 42px)" }} />
                                <div style={{ position: "absolute", left: 0, right: 0, top: 8, height: 6, background: "#b07a45" }} />
                                <div style={{ position: "absolute", left: 0, right: 0, top: 26, height: 6, background: "#b07a45" }} />
                            </div>
                        ) : null}

                        {/* Crops grow right on the grass (clustered on the LEFT of the field), part of the world —
                            they scroll with the pasture and the pets are penned to the right so they never trample them. */}
                        {farm.mine && garden ? (
                            <ScenePlots
                                garden={garden}
                                busy={gardenBusy}
                                onPlant={(slot) => setPlanting(slot)}
                                onHarvest={harvestAt}
                                onInspect={(slot) => setInspectSlot(slot)}
                            />
                        ) : null}

                        {/* Placed decorations — part of the world, scroll with the pasture. Draggable when you're
                            arranging your own farm; read-only when visiting. */}
                        <DecoLayer
                            placements={farm.placements || []}
                            editing={farm.mine && decoEditing}
                            fieldRef={fieldRef}
                            onMove={decoMove}
                            onInspect={(p) => { if (p) setInspectDeco({ ...p, placementId: p.id }); }}
                        />

                        {pets.length === 0 ? (
                            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#eef6e6", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
                                No pets yet — collect some and they&apos;ll roam here.
                            </div>
                        ) : null}

                        {pets.map((pet, i) => {
                            const p = pos[i] || { x: 50, y: 82, flip: false, dur: 2, moving: false, hopMs: 500 };
                            const canTap = farm.canPet && !pet.petted;
                            return (
                                <button
                                    key={pet.id}
                                    type="button"
                                    onClick={() => setInspect(pet)}
                                    title={`${pet.name} · Lv ${pet.level} · tap to inspect`}
                                    style={{
                                        position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -100%)",
                                        transition: `left ${p.dur}s linear, top ${p.dur}s linear`,
                                        background: "none", border: "none", padding: 0, cursor: "pointer", zIndex: Math.round(p.y),
                                        WebkitTapHighlightColor: "transparent", outline: "none", WebkitTouchCallout: "none",
                                    }}
                                >
                                    {/* fixed-size sprite stage: the shadow stays planted on the ground while the sprite hops above it */}
                                    <span style={{ position: "relative", display: "block", width: 58, height: 58, margin: "0 auto" }}>
                                        <span
                                            className={p.moving ? "farm-shadow-hop" : ""}
                                            style={{ position: "absolute", left: "50%", bottom: -2, width: 42, height: 9, transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0) 72%)", animationDuration: p.moving ? `${p.hopMs}ms` : undefined, zIndex: 0 }}
                                        />
                                        <span
                                            className={p.moving ? "farm-hop" : "farm-idle"}
                                            style={{ position: "absolute", inset: 0, display: "block", animationDuration: p.moving ? `${p.hopMs}ms` : undefined }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={pet.spriteUrl}
                                                alt={pet.name}
                                                width={58}
                                                height={58}
                                                draggable={false}
                                                style={{ width: 58, height: 58, objectFit: "contain", transform: (Boolean(p.flip) !== Boolean(pet.flip)) ? "scaleX(-1)" : "none", filter: canTap ? "drop-shadow(0 0 5px rgba(255,226,122,0.9))" : "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
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

                        {/* The farmer (farm owner) strolls their pasture — tap to connect */}
                        {farm.owner?.avatarUrl ? <OwnerWalker owner={farm.owner} mine={farm.mine} minX={petMinX} onTap={() => setOwnerMenu(true)} /> : null}

                        {/* Wild Loot Pig meanders here, inside the field, so he scrolls with the world */}
                        {pig === "running" ? <LootPig onFinish={onPigFinish} crown={farm.crownCfg} /> : null}

                        {/* XP / heart floaters */}
                        {floaters.map((f) => (
                            <span key={f.id} style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, transform: "translate(-50%, -120%)", fontWeight: 800, fontSize: 15, color: f.color || "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)", pointerEvents: "none", animation: "farmFloat 1.3s ease-out forwards", zIndex: 9999 }}>
                                {f.text}
                            </span>
                        ))}
                    </div>
                </div>
                {/* Weather effects over the visible pasture (rain / snow / fog / storm) */}
                <FarmWeather condition={wx.condition} />
                {/* Floating decorate button, right in the scene — the fast way in (own farm, when not already decorating) */}
                {farm.mine && farm.decorations && !decorating ? (
                    <button type="button" onClick={startDecorating} className="farm-deco-fab" aria-label="Decorate your farm" title="Decorate your farm"
                        style={{ position: "absolute", right: 10, bottom: 10, zIndex: 9998, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px 9px 12px", borderRadius: 999, border: "1px solid rgba(126,213,126,0.55)", background: "linear-gradient(180deg, rgba(28,44,26,0.96), rgba(18,30,16,0.96))", color: "#c8f0c8", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", WebkitTapHighlightColor: "transparent" }}>
                        <span style={{ fontSize: 17 }} aria-hidden="true">🪴</span>Decorate
                    </button>
                ) : null}
                {/* Live conditions label (unobtrusive, top-left) */}
                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 60, pointerEvents: "none", padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#f2f6ee", background: "rgba(18,26,14,0.5)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(2px)" }}
                    title={wx.located ? "Your real local weather + time of day" : "Your local time of day (allow location for live weather)"}>
                    {weatherLabel(wx)}
                </div>
            </div>

            {farm.mine && garden ? (
                <GardenPanel
                    garden={garden}
                    busy={gardenBusy}
                    onBuyFertilizer={buyFert}
                    onUpgrade={buyUpgradeKey}
                    onDebug={gardenDebug}
                    onSpawnPig={spawnPigDebug}
                    onCrown={() => setCrownOpen(true)}
                    pigBusy={Boolean(pig)}
                />
            ) : null}

            {/* Wild Loot Pig announce banner — rendered at the ROOT (outside the pasture's overflow:hidden scene) as a
                position:fixed, FLEX-centered overlay. Centering lives on the outer wrapper so the pill's own pigPop
                scale animation can never knock it off-center or clip it (the old bug). */}
            {pigToast ? (
                <div style={{ position: "fixed", top: 72, left: 0, right: 0, zIndex: 9998, display: "flex", justifyContent: "center", padding: "0 12px", pointerEvents: "none" }}>
                    <div style={{ maxWidth: "min(92vw, 440px)", textAlign: "center", padding: "9px 18px", borderRadius: 999, background: "rgba(20,16,6,0.96)", border: "1px solid #ffd75e", color: "#ffe27a", fontWeight: 800, fontSize: 14, lineHeight: 1.25, boxShadow: "0 10px 30px rgba(0,0,0,0.55)", animation: "pigPop .4s ease both" }}>
                        🐷👑 The Wild Loot Pig appeared!
                    </div>
                </div>
            ) : null}

            {/* Decorate DOCK: bottom tray you drag decorations out of, onto the (still-visible) farm scene. */}
            {decorating && farm.mine && farm.decorations ? (
                <DecoDock
                    deco={farm.decorations}
                    fieldRef={fieldRef}
                    busy={decoBusy}
                    editing={decoEditing}
                    onToggleMove={() => setDecoEditing((v) => !v)}
                    onPlaceAt={decoPlaceAt}
                    onInspect={(cat) => setInspectDeco(cat)}
                    onOpenCreator={() => setCustomOpen(true)}
                    onDone={stopDecorating}
                />
            ) : null}

            {inspectDeco ? (
                <DecoInspect
                    item={inspectDeco}
                    mine={farm.mine}
                    gold={farm.wallet?.gold || 0}
                    busy={decoBusy}
                    onBuy={decoBuy}
                    onPickup={decoPickup}
                    onClose={() => setInspectDeco(null)}
                />
            ) : null}

            {crownOpen && farm.mine ? (
                <CrownCalibrator initial={farm.crownCfg} onSave={saveCrown} onClose={() => setCrownOpen(false)} />
            ) : null}

            {customOpen && farm.mine && farm.decorations ? (
                <CustomDecoCreator
                    custom={farm.decorations.custom}
                    canGrant={farm.mine}
                    busy={decoBusy}
                    onStart={customStart}
                    onRefine={customRefine}
                    onFinalize={customFinalize}
                    onGrantSelf={customGrant}
                    onClose={() => setCustomOpen(false)}
                />
            ) : null}

            {planting != null && garden ? (
                <SeedPickerModal garden={garden} slot={planting} busy={gardenBusy} onPick={plantSeedAt} onClose={() => setPlanting(null)} />
            ) : null}

            {inspectSlot != null && garden ? (
                <PlotInspectModal
                    garden={garden}
                    slot={inspectSlot}
                    busy={gardenBusy}
                    onFertilize={fertilizeAt}
                    onBuyFertilizer={buyFert}
                    onHarvest={harvestAt}
                    onClose={() => setInspectSlot(null)}
                />
            ) : null}

            {harvestToast ? <HarvestToast toast={harvestToast} onClose={() => setHarvestToast(null)} /> : null}

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

// The Wild Loot Pig: a crowned pig that MEANDERS around the pasture (inside the scrolling field) dropping gold,
// then wanders off an edge. Cosmetic only — the haul is claimed server-side in onFinish.
// Owner tool: dial in the loot pig's crown (height / toward-head / size) on a live preview, both facings.
function CrownCalibrator({ initial, onSave, onClose }) {
    const [c, setC] = useState(initial || { top: 9, side: 8, size: 22 });
    const [saving, setSaving] = useState(false);
    const preview = (flip) => (
        <div style={{ textAlign: "center" }}>
            <div style={{ position: "relative", width: 96, height: 100, margin: "0 auto", display: "grid", placeItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)" }}>
                <div style={{ position: "relative", width: 68, height: 68 }}>
                    <span style={{ position: "absolute", left: flip ? `${50 + c.side}%` : `${50 - c.side}%`, top: c.top, fontSize: c.size, zIndex: 2, transformOrigin: "bottom center", transform: "translateX(-50%)", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }}>👑</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={PIG_SPRITE_URL} alt="pig" width={68} height={68} style={{ width: 68, height: 68, objectFit: "contain", transform: flip ? "scaleX(-1)" : "none" }} />
                </div>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>facing {flip ? "right" : "left"}</div>
        </div>
    );
    const slider = (label, key, min, max, step = 1) => (
        <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 700 }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}>{label}<span style={{ color: "#ffd75e" }}>{c[key]}</span></span>
            <input type="range" min={min} max={max} step={step} value={c[key]} onChange={(e) => setC((v) => ({ ...v, [key]: Number(e.target.value) }))} style={{ width: "100%", marginTop: 4, accentColor: "#ffd75e" }} />
        </label>
    );
    const doSave = async () => { setSaving(true); await onSave(c); setSaving(false); onClose(); };
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10055, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Crown calibrator" style={{ width: "100%", maxWidth: 340, borderRadius: 16, background: "var(--card-bg,#17181c)", border: "2px solid #ffd75e", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: 18 }}>
                <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 2 }}>👑 Crown calibrator</div>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: 12 }}>Position the loot pig&apos;s crown — it mirrors for both facings. Save to set it live.</p>
                <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>{preview(false)}{preview(true)}</div>
                {slider("Height (up ↔ down)", "top", -40, 50)}
                {slider("Toward the head", "side", -50, 50)}
                {slider("Size", "size", 14, 48)}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button type="button" onClick={() => setC({ top: 9, side: 8, size: 22 })} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Reset</button>
                    <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Close</button>
                    <button type="button" onClick={doSave} disabled={saving} style={{ flex: 1.4, padding: "10px 12px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#ffe488,#f3b23a)", color: "#3a2c08", fontWeight: 900, fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save crown"}</button>
                </div>
            </div>
        </div>
    );
}

function LootPig({ onFinish, crown }) {
    const cw = crown || { top: 9, side: 8, size: 22 };
    const [pos, setPos] = useState({ x: 4, y: 84, flip: false, dur: 1.6 });
    const [moving, setMoving] = useState(false); // true only while ambling between waypoints (gates the crown shake)
    const [coins, setCoins] = useState([]);
    const coinId = useRef(0);
    useEffect(() => {
        let alive = true;
        const timers = [];
        let step = 0;
        const MAX_STEPS = 7; // meander waypoints before he leaves
        const drop = (x, y) => { SFX.coin(); setCoins((c) => [...c, { id: ++coinId.current, x: x + rand(-3, 3), y: y + rand(-1, 5) }]); };
        // Mark moving for the duration of a glide, then still while he pauses before the next amble.
        const glide = (dur) => { setMoving(true); timers.push(setTimeout(() => { if (alive) setMoving(false); }, dur * 1000)); };
        const move = () => {
            if (!alive) return;
            step += 1;
            if (step > MAX_STEPS) {
                setPos((p) => { const exitX = Math.random() < 0.5 ? -12 : 112; return { x: exitX, y: 84, flip: exitX < p.x, dur: 2.4 }; });
                glide(2.4);
                timers.push(setTimeout(() => { if (alive) onFinish(); }, 2500));
                return;
            }
            const nx = rand(8, 90);
            const ny = 80 + rand(0, 10);
            const dur = rand(1.5, 2.7);
            setPos((p) => ({ x: nx, y: ny, flip: nx < p.x, dur }));
            glide(dur);
            drop(nx, ny);
            timers.push(setTimeout(move, dur * 1000 + rand(350, 1000))); // amble, then pause, then wander again
        };
        drop(4, 84);
        timers.push(setTimeout(move, 1500));
        return () => { alive = false; timers.forEach(clearTimeout); };
    }, [onFinish]);
    return (
        <>
            {coins.map((c) => (
                <span key={c.id} style={{ position: "absolute", left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%, -50%)", fontSize: 18, zIndex: 50, pointerEvents: "none", animation: "coinPop .5s ease-out both" }}>🪙</span>
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
function OwnerWalker({ owner, mine, minX = FARM_PAD, onTap }) {
    const [pos, setPos] = useState({ x: Math.max(20, minX + 8), y: 86, flip: false, dur: 3, moving: false });
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
    const flip = Boolean(pos.flip) !== Boolean(owner.avatarFlip);
    return (
        <button
            type="button"
            onClick={onTap}
            title={mine ? "You" : `Tap to connect with ${owner.name}`}
            style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -100%)", transition: `left ${pos.dur}s linear, top ${pos.dur}s linear`, background: "none", border: "none", padding: 0, cursor: "pointer", zIndex: Math.round(pos.y) + 1, WebkitTapHighlightColor: "transparent", outline: "none", WebkitTouchCallout: "none" }}
        >
            <span style={{ position: "relative", display: "block", width: 66, height: 66, margin: "0 auto" }}>
                <span className={pos.moving ? "farm-shadow-hop" : ""} style={{ position: "absolute", left: "50%", bottom: -2, width: 46, height: 10, transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0) 72%)", zIndex: 0, animationDuration: pos.moving ? "480ms" : undefined }} />
                <span className={pos.moving ? "farm-hop" : "farm-idle"} style={{ position: "absolute", inset: 0, display: "block", animationDuration: pos.moving ? "480ms" : undefined }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={owner.avatarUrl} alt={owner.name} width={66} height={66} style={{ width: 66, height: 66, objectFit: "contain", transform: flip ? "scaleX(-1)" : "none", filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.5))" }} />
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
                    {profileHref ? <a href={profileHref} className="farm-jbtn" style={{ justifyContent: "center", textDecoration: "none" }}>👤 View profile</a> : null}
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
function ScenePlots({ garden, busy, onPlant, onHarvest, onInspect }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
    const plots = garden.plots || [];
    const n = plots.length || 1;
    const totalSeeds = (garden.seedBag || []).reduce((s, x) => s + x.count, 0);
    return (
        <>
            {plots.map((p, i) => {
                // Cluster the plots CLOSE together on the left of the field; stagger the rows slightly so the
                // garden reads as a tight little tilled patch on the grass rather than a spread-out line.
                const span = Math.min(6 * (n - 1), 20); // tight cluster — ~6% between mounds, capped
                const left = n === 1 ? 18 : 15 + (i / (n - 1)) * span;
                const top = 84 + (i % 2) * 6; // 84–90% — sitting right on the grass, front of the pasture
                return (
                    <ScenePlot
                        key={p.slot} p={p} left={left} top={top} now={now} busy={busy}
                        totalSeeds={totalSeeds}
                        onPlant={onPlant} onHarvest={onHarvest} onInspect={onInspect}
                    />
                );
            })}
        </>
    );
}

function ScenePlot({ p, left, top, now, busy, totalSeeds, onPlant, onHarvest, onInspect }) {
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
    const tappable = empty ? canPlant : true; // growing/ready plots are always tappable
    const onClick = () => {
        if (busyHere) return;
        if (empty) { if (canPlant) onPlant(p.slot); return; }
        if (ready) onHarvest(p.slot);
        else onInspect(p.slot); // growing → open the inspect modal (don't silently fertilize)
    };
    const plantScale = ready ? 1 : 0.4 + 0.6 * progress; // grows from a seedling as it matures
    const title = empty ? (canPlant ? "Tap to plant a seed" : "Empty plot — find seeds across the games")
        : ready ? `${p.name} — tap to harvest` : `${p.name} · ${fmtGrow(secsLeft)} left · tap to inspect`;
    return (
        <button type="button" onClick={onClick} title={title}
            style={{ position: "absolute", left: `${left}%`, top: `${top}%`, transform: "translate(-50%, -100%)", width: 56, background: "none", border: "none", padding: 0, cursor: tappable ? "pointer" : "default", zIndex: Math.round(top) }}>
            {/* the plant / sprout rising from the mound */}
            <span style={{ display: "block", position: "relative", height: 44, width: "100%" }}>
                {ready ? <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 40, height: 40, borderRadius: "50%", border: "2px solid rgba(140,240,150,0.7)", animation: "farmReadyRing 1.6s ease-out infinite" }} /> : null}
                {!empty ? (
                    <span style={{ position: "absolute", left: "50%", bottom: 1, transform: `translateX(-50%) scale(${plantScale})`, transformOrigin: "bottom center", transition: "transform 1s linear" }}>
                        <span style={{ display: "block", fontSize: 28, lineHeight: 1, transformOrigin: "bottom center", filter: ready ? "drop-shadow(0 0 7px rgba(140,240,150,0.9))" : "drop-shadow(0 2px 2px rgba(0,0,0,0.45))", animation: ready ? "farmBob 2s ease-in-out infinite" : "farmSway 3.4s ease-in-out infinite" }}>{ready ? p.emoji : p.sprout}</span>
                    </span>
                ) : canPlant ? (
                    <span style={{ position: "absolute", left: "50%", bottom: 6, transform: "translateX(-50%)", fontSize: 19, color: "#ffe27a", fontWeight: 900, textShadow: "0 1px 3px rgba(0,0,0,0.85)", animation: "farmBob 2.4s ease-in-out infinite" }}>＋</span>
                ) : null}
            </span>
            {/* a soft ground shadow so the mound reads as sitting ON the grass */}
            <span aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: -3, transform: "translateX(-50%)", width: 46, height: 10, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0) 72%)", zIndex: 0 }} />
            {/* tilled soil mound on the grass */}
            <span style={{ position: "relative", display: "block", width: 44, height: 13, margin: "0 auto", borderRadius: "50%", background: p.fertilized ? "radial-gradient(ellipse at 50% 22%, #7a5430, #3c2712)" : "radial-gradient(ellipse at 50% 22%, #64431f, #33200d)", boxShadow: "inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -2px 5px rgba(0,0,0,0.6)", border: canPlant ? "1.5px dashed rgba(255,226,122,0.7)" : "1px solid rgba(0,0,0,0.4)" }} />
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
function PanelToggle({ title, open, onToggle, accent = "#e7dcc4", note = null }) {
    return (
        <button type="button" onClick={onToggle} aria-expanded={open} style={{ marginTop: 12, width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 0 0", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", color: "inherit", cursor: "pointer", textAlign: "left" }}>
            <strong style={{ fontSize: 13, color: accent }}>{title}</strong>
            {note ? <span className="muted" style={{ fontSize: 11 }}>{note}</span> : null}
            <span aria-hidden="true" style={{ marginLeft: "auto", color: "#ffd75e", fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
        </button>
    );
}

// Farm LIKES bar — positive-only, three ascending tiers. On another member's farm the tiers are big tappable
// buttons (your current pick glows); on your own farm it's a read-only tally of the love you've collected. New
// ratings cost your one daily charge; revising a rating you've already given is free.
const RATE_TIER_UI = [
    { tier: 1, key: "like", label: "Like", icon: "👍", color: "#7ec8ff" },
    { tier: 2, key: "love", label: "Love", icon: "❤️", color: "#ff6fae" },
    { tier: 3, key: "admire", label: "Admire", icon: "⭐", color: "#ffd75e" },
];
function FarmRatingBar({ rating, ownerName, mine, busy, burst, note, onRate }) {
    const { total = 0, byTier = { 1: 0, 2: 0, 3: 0 }, myTier = null, canRate = false, charge = null } = rating || {};
    const rated = Boolean(myTier);
    return (
        <section className="card" style={{ borderColor: "rgba(255,215,94,0.4)", background: "linear-gradient(180deg, rgba(255,215,94,0.09), transparent 42%)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 900, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                        {mine ? "🏡 Your farm's love" : `Rate ${ownerName}'s farm`}
                        {total > 0 ? <span style={{ padding: "1px 9px", borderRadius: 999, background: "rgba(255,215,94,0.16)", border: "1px solid rgba(255,215,94,0.5)", color: "#ffd75e", fontSize: 12, fontWeight: 800 }}>{total} total</span> : null}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                        {RATE_TIER_UI.map((t) => (
                            <span key={t.key} title={`${byTier[t.tier]} ${t.label}${byTier[t.tier] === 1 ? "" : "s"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 800, color: byTier[t.tier] ? t.color : "#7c8088" }}>
                                <span style={{ fontSize: 16 }}>{t.icon}</span>{byTier[t.tier]}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {mine ? (
                <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>Visit friends&apos; farms to like theirs — you both earn XP, and they&apos;ll see who rated their place. 💛</p>
            ) : canRate ? (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                        {RATE_TIER_UI.map((t) => {
                            const active = myTier === t.tier;
                            const bursting = burst && burst.tier === t.tier;
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => onRate(t.tier)}
                                    disabled={busy}
                                    aria-pressed={active}
                                    style={{
                                        position: "relative", overflow: "visible", padding: "12px 6px 10px", borderRadius: 14, cursor: busy ? "default" : "pointer",
                                        border: `2px solid ${active ? t.color : "rgba(255,255,255,0.14)"}`,
                                        background: active ? `radial-gradient(120% 100% at 50% 0%, ${t.color}33, ${t.color}12)` : "rgba(255,255,255,0.04)",
                                        color: "inherit", fontWeight: 800, transition: "transform .12s ease, border-color .15s ease, background .15s ease",
                                        boxShadow: active ? `0 0 0 3px ${t.color}22, 0 6px 18px ${t.color}22` : "none",
                                        transform: active ? "translateY(-1px)" : "none",
                                    }}
                                >
                                    <span style={{ display: "block", fontSize: 26, lineHeight: 1, animation: bursting ? "ratePulse .5s ease" : undefined }}>{t.icon}</span>
                                    <span style={{ display: "block", fontSize: 12.5, marginTop: 4, color: active ? t.color : "inherit" }}>{t.label}{active ? "d ✓" : ""}</span>
                                    {bursting ? <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "40%", fontSize: 30, pointerEvents: "none", animation: "rateBurstAnim .9s ease-out forwards" }}>{t.icon}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 8, textAlign: "center" }}>
                        {rated
                            ? "You've rated this farm — tap another tier to change it anytime, free. 💛"
                            : charge && charge.left > 0
                                ? `Pick a tier — you have ${charge.left} new rating${charge.left === 1 ? "" : "s"} today.`
                                : "You've used today's new rating."}
                    </div>
                    {note ? <div style={{ fontSize: 11.5, marginTop: 6, textAlign: "center", color: "#ffcf6a" }}>{note}</div> : null}
                </>
            ) : null}
        </section>
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

function GardenPanel({ garden, busy, onBuyFertilizer, onUpgrade, onDebug, onSpawnPig, onCrown, pigBusy }) {
    const [showDebug, setShowDebug] = useState(false);
    const [upgFlash, setUpgFlash] = useState(null); // key of the upgrade just bought → brief celebratory pop
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
                        <span key={s.id} title={s.loot || ""} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 999, border: `1px solid ${(RARITY_RING[s.rarity] || "rgba(255,255,255,0.18)")}66`, background: "rgba(255,255,255,0.05)", fontSize: 12, fontWeight: 700 }}>
                            <span style={{ fontSize: 15 }}>{s.emoji}</span>{s.name}<span className="muted" style={{ fontWeight: 400 }}>×{s.count}</span>
                        </span>
                    )) : <span className="muted" style={{ fontSize: 12 }}>none yet — find them across the games (boss, sailing, chests…).</span>}
                </div>
            </div>

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

            {/* Owner debug (collapsible) */}
            <PanelToggle title="🛠️ Debug · seeds & growth" open={showDebug} onToggle={() => setShowDebug((v) => !v)} accent="#ffd75e" note="owner-only" />
            {showDebug ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 7, marginTop: 8 }}>
                    {[["farm_debug_seeds", "🎒", "+2 of every seed"], ["farm_debug_grow", "⏩", "Grow all now"], ["farm_debug_fertilizer", "💧", "+5 fertilizer"]].map(([action, icon, label]) => (
                        <button key={action} type="button" onClick={() => onDebug(action)} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 10, border: "1px dashed rgba(255,215,94,0.45)", background: "rgba(255,215,94,0.07)", color: "#ffd75e", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                            <span style={{ fontSize: 16 }} aria-hidden="true">{icon}</span>{label}
                        </button>
                    ))}
                    {onSpawnPig ? (
                        <button type="button" onClick={onSpawnPig} disabled={pigBusy} title="Force-spawn the Loot Pig now" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 10, border: "1px dashed rgba(255,215,94,0.45)", background: "rgba(255,215,94,0.07)", color: "#ffd75e", fontSize: 12, fontWeight: 700, cursor: pigBusy ? "default" : "pointer", opacity: pigBusy ? 0.5 : 1, textAlign: "left" }}>
                            <span style={{ fontSize: 16 }} aria-hidden="true">🐷</span>Spawn Loot Pig
                        </button>
                    ) : null}
                    {onCrown ? (
                        <button type="button" onClick={onCrown} title="Position the loot pig's crown" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 10, border: "1px dashed rgba(255,215,94,0.45)", background: "rgba(255,215,94,0.07)", color: "#ffd75e", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                            <span style={{ fontSize: 16 }} aria-hidden="true">👑</span>Crown calibrator
                        </button>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}

// Centered "pick a seed" modal, opened by tapping an empty plot out in the field.
function SeedPickerModal({ garden, slot, busy, onPick, onClose }) {
    const bag = garden.seedBag || [];
    return (
        <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Plant a seed" style={{ width: "100%", maxWidth: 340, maxHeight: "85dvh", overflowY: "auto", borderRadius: 16, background: "var(--card-bg,#17181c)", border: "2px solid #ffd75e", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: 18, animation: "pigPop .35s cubic-bezier(.2,1.2,.3,1) both" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>🌱 Plant plot {slot + 1}</div>
                <div className="muted" style={{ fontSize: 12, margin: "2px 0 12px" }}>Rarer seeds take longer, sell for more, and roll better harvest loot. Here&apos;s what each one pays out:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {bag.length ? bag.map((s) => (
                        <button key={s.id} type="button" disabled={Boolean(busy)} onClick={() => onPick(slot, s.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${(RARITY_RING[s.rarity] || "rgba(255,255,255,0.18)")}66`, background: "rgba(255,255,255,0.05)", color: "inherit", cursor: "pointer", textAlign: "left" }}>
                            <span style={{ fontSize: 26 }}>{s.emoji}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 13.5, fontWeight: 800 }}>{s.name} <span className="muted" style={{ fontWeight: 400 }}>×{s.count}</span></span>
                                <span style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginTop: 4, fontSize: 11.5 }}>
                                    <span style={{ color: "#ffd75e", fontWeight: 700 }}>🪙 {s.sell.toLocaleString()} gold</span>
                                    <span style={{ color: "#8fd8ff", fontWeight: 700 }}>✨ {s.xp} XP</span>
                                    <span className="muted">⏳ {Math.round(s.growMin / 60)}h grow</span>
                                    {s.loot ? <span style={{ color: RARITY_RING[s.rarity] || "#cdd9c6", fontWeight: 700 }}>🎁 {s.loot}</span> : null}
                                </span>
                            </span>
                        </button>
                    )) : <div className="muted" style={{ fontSize: 12.5 }}>No seeds yet — find them across the games (boss, sailing, chests…).</div>}
                </div>
                <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 14, padding: 10, fontWeight: 800, background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, cursor: "pointer" }}>Cancel</button>
            </div>
        </div>
    );
}

// Tap a growing crop → this modal tells you what it is, when it's ready, and exactly what to expect at harvest
// (gold, XP, loot tier). From here you can spend fertilizer to speed it up, buy more fertilizer, or (once ripe)
// harvest — but a plain tap never silently burns fertilizer anymore.
function PlotInspectModal({ garden, slot, busy, onFertilize, onBuyFertilizer, onHarvest, onClose }) {
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
                    <div style={{ fontSize: 46, lineHeight: 1 }}>{ready ? p.emoji : p.sprout}</div>
                    <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>{p.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: ring, textTransform: "capitalize", marginTop: 2 }}>{p.rarity}{p.fertilized ? " · 💧 fertilized" : ""}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                        {ready ? "🌟 Ready to harvest!" : <>⏳ <strong style={{ color: "#f2f6ee" }}>{fmtGrow(secsLeft)}</strong> until ripe</>}
                    </div>
                </div>
                <div style={{ padding: "6px 16px 4px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#9aa0a6", margin: "6px 2px 8px" }}>Expected harvest</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <ExpectStat icon="🪙" value={(p.sell || 0).toLocaleString()} label="gold" accent="#ffd75e" />
                        <ExpectStat icon="✨" value={`+${(p.xp || 0).toLocaleString()}`} label="XP" accent="#8cd0ff" />
                    </div>
                    {p.loot ? (
                        <div style={{ marginTop: 8, padding: "9px 12px", borderRadius: 11, background: `${ring}1f`, border: `1px solid ${ring}80`, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                            <span style={{ fontSize: 16 }}>🎁</span><span>Chance at <strong style={{ color: ring }}>{p.loot}</strong> on harvest</span>
                        </div>
                    ) : null}
                </div>
                <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {ready ? (
                        <button type="button" onClick={() => { onHarvest(slot); onClose(); }} disabled={hBusy} style={{ width: "100%", padding: 12, fontWeight: 900, background: "linear-gradient(180deg,#43d98a,#2fae72)", color: "#06311f", border: "none", borderRadius: 11, cursor: hBusy ? "default" : "pointer", boxShadow: "0 3px 0 #1c7a4f", opacity: hBusy ? 0.6 : 1 }}>🧺 Harvest now</button>
                    ) : (
                        <>
                            <button type="button" onClick={() => onFertilize(slot)} disabled={!canFertilize || fBusy} title={p.fertilized ? "Already fertilized" : garden.fertilizer <= 0 ? "No fertilizer in stock" : ""} style={{ width: "100%", padding: 12, fontWeight: 900, background: canFertilize ? "linear-gradient(180deg,#8cc7ff,#4a93e0)" : "rgba(255,255,255,0.08)", color: canFertilize ? "#052540" : "inherit", border: "none", borderRadius: 11, cursor: canFertilize && !fBusy ? "pointer" : "default", boxShadow: canFertilize ? "0 3px 0 #2f6bb0" : "none", opacity: canFertilize && !fBusy ? 1 : 0.55 }}>
                                💧 {p.fertilized ? "Already fertilized" : "Fertilize · speed up growth"}
                                {!p.fertilized && garden.fertilizer > 0 ? <span style={{ fontWeight: 700, opacity: 0.8 }}> ({garden.fertilizer} left)</span> : null}
                            </button>
                            {!p.fertilized && garden.fertilizer <= 0 ? (
                                <button type="button" onClick={onBuyFertilizer} disabled={!canBuyFert || busy === "fbuy"} style={{ width: "100%", padding: 11, fontWeight: 900, background: canBuyFert ? "linear-gradient(180deg,#ffe488,#f3b23a)" : "rgba(255,255,255,0.08)", color: canBuyFert ? "#3a2c08" : "inherit", border: "none", borderRadius: 11, cursor: canBuyFert && busy !== "fbuy" ? "pointer" : "default", boxShadow: canBuyFert ? "0 3px 0 #b57f22" : "none", opacity: canBuyFert && busy !== "fbuy" ? 1 : 0.55 }}>🪙 Buy fertilizer · {garden.fertilizerPrice}g</button>
                            ) : null}
                        </>
                    )}
                    <button type="button" onClick={onClose} style={{ width: "100%", padding: 10, fontWeight: 800, background: "transparent", color: "inherit", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 11, cursor: "pointer" }}>Close</button>
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
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#ffd75e", marginTop: 6 }}>+{(toast.gold || 0).toLocaleString()} 🪙</div>
                        {toast.bonus ? <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: "rgba(140,200,255,0.12)", border: "1px solid rgba(140,200,255,0.45)", fontWeight: 800, fontSize: 13 }}>🎁 Harvest loot: {toast.bonus}</div> : null}
                        {toast.savedSeed ? <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: "rgba(120,220,120,0.12)", border: "1px solid rgba(120,220,120,0.45)", fontWeight: 700, fontSize: 13 }}>🌰 Seed saved! {toast.savedEmoji} back in your bag</div> : null}
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

                    {/* What it does */}
                    {perk ? (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>⭐ {perk.icon} {perk.name} <span className="muted" style={{ fontWeight: 400 }}>· equipped</span></div>
                            {perk.desc ? <div className="muted" style={{ fontSize: 12 }}>{perk.desc}</div> : null}
                        </div>
                    ) : null}
                    {passive ? (
                        <div style={{ marginBottom: 8, fontSize: 12 }}>
                            <span style={{ fontWeight: 700 }}>Owned bonus:</span> <span className="muted">{ownedBonusText(passive)}</span>
                        </div>
                    ) : null}

                    {/* Pet action (own farm only) — shared daily budget, rechargeable for gold */}
                    {canPet ? (
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
                    {canPet && treats.length ? (
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
                    {canPet && treatShop.length ? (
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
                <span className="muted" style={{ fontSize: 12 }}>Lv {m.level} · 🐾 {m.petCount} pet{m.petCount === 1 ? "" : "s"}</span>
            </span>
            {m.petSpriteUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.petSpriteUrl} alt="" width={38} height={38} style={{ width: 38, height: 38, objectFit: "contain", transform: m.petSpriteFlip ? "scaleX(-1)" : "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.4))" }} />
            ) : null}
            <span style={{ opacity: 0.45, fontSize: 20, fontWeight: 700 }}>›</span>
        </button>
    );
}
function FarmDirectory({ current }) {
    const [open, setOpen] = useState(false); // collapsed by default — opens only when the owner wants it
    const [q, setQ] = useState("");
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!open) return undefined; // don't fetch until the directory is opened
        let alive = true;
        const t = setTimeout(() => {
            if (alive) setLoading(true);
            fetch(`/api/marketplace/farm?list=1&q=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => { if (alive) { setMembers(d?.members || []); setLoading(false); } })
                .catch(() => { if (alive) setLoading(false); });
        }, q.trim() ? 250 : 0);
        return () => { alive = false; clearTimeout(t); };
    }, [q, open]);
    const visit = (alias) => window.location.assign(`/marketplace/farm?u=${encodeURIComponent(alias)}`);
    return (
        <section className="card" style={{ padding: open ? undefined : 0 }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className={open ? undefined : "farm-visit"}
                style={open ? { width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "0 0 10px", background: "none", border: "none", color: "inherit", cursor: "pointer", textAlign: "left" } : undefined}
            >
                <span style={{ display: "flex", color: "#ffd75e" }}><SearchIcon /></span>
                <strong style={{ fontSize: 16 }}>Visit a farm</strong>
                <span className="muted" style={{ fontSize: 11 }}>owner-only</span>
                <span aria-hidden="true" className="farm-visit-chev" style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", color: "#ffd75e", fontSize: 12, lineHeight: 1 }}>▾</span>
            </button>
            {open ? (
                <>
                    <div style={{ position: "relative", marginBottom: 10 }}>
                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5, display: "flex" }}><SearchIcon /></span>
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search members…"
                            style={{ width: "100%", padding: "10px 12px 10px 38px", borderRadius: 12, border: "1px solid rgba(128,128,128,0.35)", background: "rgba(255,255,255,0.04)", color: "inherit" }}
                        />
                    </div>
                    <div style={{ maxHeight: 360, overflowY: "auto", display: "grid", gap: 8, paddingRight: 2 }}>
                        {members.map((m) => <HeroCard key={m.id} m={m} onClick={() => visit(m.alias)} />)}
                        {loading && !members.length ? <div className="muted" style={{ padding: 12, textAlign: "center" }}>Loading farms…</div> : null}
                        {!loading && !members.length ? <div className="muted" style={{ padding: 12, textAlign: "center" }}>No farms found.</div> : null}
                    </div>
                    {current ? <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>Viewing @{current}&apos;s farm.</p> : null}
                </>
            ) : null}
        </section>
    );
}
