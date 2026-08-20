"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import PetArt from "@/components/PetArt";
import { collectibleById, petActive, petActiveLevelMult, petPassive, petPassiveLevelMult, PET_STAT_META } from "@/lib/marketplace/collectibles.js";

// ── GLOBAL pet watcher: A PET ARRIVED, A PET LEVELLED ────────────────────────────────────────────────────
// Mounted once in the marketplace layout so both moments are celebrated ANYWHERE in the app — not just on
// the pets page. Two celebrations, one watcher, because they come off the SAME poll: a second component
// would double every request to an endpoint that syncs pet state on each call.
//
// GETTING a pet used to be announced only by the pets page, on the next visit — the server flags what was
// granted since you last opened it and PetsClient popped the card on arrival. So the moment a pet dropped
// (a harvest, a chest, a gift) nothing happened, and the celebration turned up later, detached from the
// thing that caused it. Luke: "id like to see it no matter where I am and when I get it." Pets gain XP from your actions (boss strikes, farm petting, treats) and a slow trickle; every
// such action fires `wolfden-hud-refresh`, which we listen for. We compare each pet's level to what this browser
// last saw (localStorage) and, on a gain, play a juiced Pokémon-style evolution reveal: the OLD-level sprite
// flashes to a silhouette and transforms into the NEW-level sprite.
const SEEN_KEY = "wd_pet_levels_seen";
// The collection as this browser last saw it. A pet in the server's list that is NOT in here is one that
// arrived since — which is the honest definition of "new to you", and it does not care WHERE you were when
// it landed. Deliberately not the server's `newPets`: that clears the moment the pets page is opened, so it
// answers "new since you last looked at the pets screen" rather than "new since you last saw it announced".
const OWNED_KEY = "wd_pets_owned_seen";
const RARITY_COLOR = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const rc = (r) => RARITY_COLOR[r] || "#ffd75e";

let ac = null;
function chime() {
    try {
        const Ctx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!Ctx) return;
        ac = ac || new Ctx();
        const now = ac.currentTime;
        // Rising arpeggio + a sparkle on top — a proper "evolution" flourish.
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
            const osc = ac.createOscillator(), gain = ac.createGain();
            osc.type = "triangle"; osc.frequency.value = freq;
            const t = now + i * 0.11;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.24, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            osc.connect(gain).connect(ac.destination); osc.start(t); osc.stop(t + 0.32);
        });
    } catch { /* audio may be blocked until a gesture — fine */ }
}

export default function PetAlerts() {
    const [queue, setQueue] = useState([]);       // pending level-ups (one shown at a time)
    const [arrived, setArrived] = useState([]);   // pets that have just joined the collection
    const [mounted, setMounted] = useState(false);
    const inFlight = useRef(false);
    const lastCheck = useRef(0);

    useEffect(() => { setMounted(true); }, []);

    const check = useCallback(async () => {
        if (inFlight.current) return;
        const nowMs = Date.now();
        if (nowMs - lastCheck.current < 3500) return; // rate-limit so event bursts don't hammer the pets endpoint
        lastCheck.current = nowMs;
        inFlight.current = true;
        try {
            const r = await fetch("/api/marketplace/pets?peek=1", { cache: "no-store" }).catch(() => null);
            const d = r?.ok ? await r.json().catch(() => null) : null;
            if (!d?.petLevels || !d.signedIn) return;
            let seen = {};
            try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { seen = {}; }
            const firstEver = Object.keys(seen).length === 0; // brand-new browser: record, don't celebrate
            const now = {};
            const gains = [];
            for (const [pid, info] of Object.entries(d.petLevels)) {
                now[pid] = info.level;
                const prev = Number.isFinite(seen[pid]) ? seen[pid] : info.level;
                if (!firstEver && info.level > prev) {
                    const pet = collectibleById(pid);
                    if (pet) {
                        const sprites = d.petSprites?.[pid] || {};
                        gains.push({
                            key: `${pid}:${info.level}:${nowMs}`,
                            pet, from: prev, to: info.level,
                            oldArt: sprites[prev] || null, newArt: sprites[info.level] || null,
                            value: info.value, stat: info.stat,
                        });
                    }
                }
            }
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(now)); } catch { /* ignore */ }

            // ── AND WHETHER THE COLLECTION ITSELF GREW ───────────────────────────────────────────────────
            // Same poll, same baseline-in-localStorage trick as the levels above. No baseline yet means a
            // browser that has never looked: record what is owned and celebrate nothing, or signing in on a
            // new phone would replay a hundred pets you have had for months.
            // A response WITHOUT the list is not a member who owns nothing — it is a response that did not
            // answer the question. Writing [] as the baseline off one of those would make every pet look new
            // on the next poll and fire a parade of cards for animals owned for months, so an absent list is
            // skipped entirely rather than believed.
            if (Array.isArray(d.ownedIds)) {
                const owned = d.ownedIds.map(String);
                let hadOwned = null;
                try { const raw = localStorage.getItem(OWNED_KEY); hadOwned = raw ? JSON.parse(raw) : null; } catch { hadOwned = null; }
                if (Array.isArray(hadOwned)) {
                    const had = new Set(hadOwned);
                    const fresh = owned.filter((id) => !had.has(id)).map((id) => collectibleById(id)).filter(Boolean);
                    // Two or three at once is a good day. Ten is a baseline that has drifted, and the right
                    // answer to a desync is to resync quietly, not to hold a ceremony for each one.
                    if (fresh.length && fresh.length <= 6) {
                        setArrived((q) => [...q, ...fresh.filter((x) => !q.some((y) => y.id === x.id))]);
                        chime();
                    }
                }
                try { localStorage.setItem(OWNED_KEY, JSON.stringify(owned)); } catch { /* ignore */ }
            }

            if (gains.length) {
                gains.sort((a, b) => b.to - a.to);
                setQueue((q) => [...q, ...gains]);
                chime();
            }
        } finally {
            inFlight.current = false;
        }
    }, []);

    // A DIRECT hand-off from whatever caused the level-up (feeding a treat, working the farm). Those screens
    // used to pop their own celebration, so a single level-up produced two modals back to back. They now fire
    // this event and the one modal below handles it — immediately, with no wait for the poll.
    useEffect(() => {
        const onDirect = (e) => {
            const d = e?.detail;
            if (!d?.petId) return;
            const pet = collectibleById(d.petId);
            if (!pet) return;
            setQueue((q) => {
                // The poller may also spot this level a moment later; don't celebrate the same one twice.
                const key = `${d.petId}:${d.level}`;
                if (q.some((x) => x.key.startsWith(key))) return q;
                return [...q, {
                    key: `${key}:${Date.now()}`,
                    pet, from: Math.max(0, Number(d.level) - 1), to: Number(d.level),
                    oldArt: d.oldArt || null,
                    newArt: d.spriteUrl ? { url: d.spriteUrl, flip: d.spriteFlip } : null,
                    value: d.value, stat: d.stat,
                }];
            });
            // Keep the poller's baseline in step, or it will re-detect this level and queue it again.
            try {
                const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
                seen[d.petId] = Number(d.level);
                localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
            } catch { /* ignore */ }
            chime();
        };
        window.addEventListener("wolfden-pet-levelup", onDirect);
        return () => window.removeEventListener("wolfden-pet-levelup", onDirect);
    }, []);

    // The same hand-off for a pet ARRIVING, so a screen that grants one (accepting a gift, a harvest) gets
    // the card instantly instead of on the next poll — and stamps the baseline, so the poll that follows does
    // not celebrate it a second time.
    useEffect(() => {
        const onNew = (e) => {
            const pet = collectibleById(e?.detail?.petId);
            if (!pet) return;
            setArrived((q) => (q.some((x) => x.id === pet.id) ? q : [...q, pet]));
            try {
                const raw = localStorage.getItem(OWNED_KEY);
                const list = raw ? JSON.parse(raw) : [];
                if (Array.isArray(list) && !list.includes(pet.id)) localStorage.setItem(OWNED_KEY, JSON.stringify([...list, pet.id]));
            } catch { /* ignore */ }
            chime();
        };
        window.addEventListener("wolfden-pet-new", onNew);
        return () => window.removeEventListener("wolfden-pet-new", onNew);
    }, []);

    // Check on mount (catches trickle level-ups), whenever an action awards XP (pets earn a 12% share, so this
    // is the moment a pet may tick over a level), on tab focus, and a slow safety poll.
    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        check();
        const trigger = () => { setTimeout(check, 1200); }; // let the server settle the XP share first
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        window.addEventListener("wolfden-xp-updated", trigger);
        window.addEventListener("wolfden-hud-refresh", trigger);
        document.addEventListener("visibilitychange", onVisible);
        const poll = setInterval(() => { if (document.visibilityState === "visible") check(); }, 45000);
        return () => {
            window.removeEventListener("wolfden-xp-updated", trigger);
            window.removeEventListener("wolfden-hud-refresh", trigger);
            document.removeEventListener("visibilitychange", onVisible);
            clearInterval(poll);
        };
    }, [check]);

    const current = queue[0] || null;
    const dismiss = () => setQueue((q) => q.slice(1));
    if (!mounted) return null;

    // ── A PET ARRIVED ────────────────────────────────────────────────────────────────────────────────────
    // Shown ahead of any level-up in the queue: you got the pet before it grew, so that is the order the two
    // cards should arrive in. Same markup the pets page used, so there is one look for this moment and it is
    // still the one members already know.
    const joined = arrived[0] || null;
    if (joined) {
        const shed = () => setArrived((q) => q.slice(1));
        return createPortal(
            <div className="petx-overlay petx-celebrate" onClick={shed} role="dialog" aria-modal="true" aria-label={`New pet: ${joined.name}`}>
                <div className={`petx-cele rarity-${joined.rarity}`} onClick={(e) => e.stopPropagation()}>
                    <div className="petx-confetti" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ "--i": i }}>{["✨", "🎉", "⭐", "🌟"][i % 4]}</span>)}</div>
                    <div className="petx-hero petx-hero-big">
                        <span className="petx-hero-glow" />
                        <span className="petx-hero-icon" style={{ color: joined.color }}><PetArt id={joined.id} /></span>
                    </div>
                    <div className="petx-cele-tag">New pet!</div>
                    <h2 className="petx-title">{joined.name}</h2>
                    <p className="petx-sub">{joined.rarity} companion added to your collection.</p>
                    <a className="btn-gold" href={`/marketplace/pets?pet=${encodeURIComponent(joined.id)}`}>See {joined.name}</a>
                    <button type="button" className="petx-cele-later" onClick={shed}>Later</button>
                </div>
            </div>,
            document.body
        );
    }

    if (!current) return null;

    const accent = rc(current.pet.rarity);
    const evolves = current.oldArt?.url && current.newArt?.url && current.oldArt.url !== current.newArt.url;
    // WHAT THE LEVEL ACTUALLY BOUGHT. A pet carries two stats — an always-on PASSIVE for owning it and an
    // ACTIVE that only counts while it's your companion — and both scale, at different rates. The modal used
    // to state one number with nothing to compare it to, which is the least interesting true thing it could
    // say. Both are pure client-safe functions, so this needs nothing from the server.
    const meta = (k) => PET_STAT_META[k] || {};
    const gains = (() => {
        const p = current.pet ? petPassive(current.pet) : null;
        const a = current.pet ? petActive(current.pet) : null;
        const line = (kind, stat, base, mult) => {
            const from = Math.round(base * mult(current.from));
            const to = Math.round(base * mult(current.to));
            return { kind, stat, from, to, up: to - from, label: meta(stat).label || stat, icon: meta(stat).icon || "", desc: meta(stat).desc || "" };
        };
        const out = [];
        if (p) out.push(line("Passive", p.stat, p.value, petPassiveLevelMult));
        // Listed even when both stats share a key: they scale at different rates (passive ×0.25/level, active
        // ×0.5), so "the same stat" still moves by different amounts on the two lines.
        if (a) out.push(line("Active", a.stat, a.value, petActiveLevelMult));
        return out;
    })();
    // SIX, NOT FIVE. This said `>= 5` and stamped "MAX LEVEL" on the celebration for reaching level five —
    // which is now the moment a pet is HALFWAY through its last stretch, not the end of it. Luke's exact worry
    // when he asked for level six: "I don't wanna give people the misconception that they're done leveling."
    // The one screen that shouts at you about levelling was still saying they were.
    const maxed = current.to >= 6;
    // And at five it should say the opposite — loudly, because this is the only moment we have somebody's
    // attention on the subject.
    const atFive = current.to === 5;
    // The pets page opens a sheet from `?pet=`; `enshrine=1` tells it to scroll to the stone panel once there.
    const enshrineHref = `/marketplace/pets?pet=${encodeURIComponent(current.pet.id)}&enshrine=1`;

    return createPortal(
        <div className="plu-scrim" onClick={dismiss} role="dialog" aria-modal="true" aria-label={`${current.pet.name} leveled up`}>
            <style>{PLU_CSS}</style>
            <div className="plu-card" style={{ "--acc": accent }} onClick={(e) => e.stopPropagation()}>
                <div className="plu-confetti" aria-hidden="true">
                    {Array.from({ length: 42 }).map((_, i) => (
                        <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${1.5 + (i % 10) * 0.04}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c", accent][i % 6] }} />
                    ))}
                </div>

                <div className={`plu-stage${evolves ? " is-evo" : " is-simple"}`}>
                    <div className="plu-rays" aria-hidden="true" />
                    <div className="plu-halo" aria-hidden="true" />
                    {evolves ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="plu-sprite plu-old" src={current.oldArt.url} alt="" style={current.oldArt.flip ? { transform: "scaleX(-1)" } : undefined} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="plu-sprite plu-new" src={current.newArt.url} alt={current.pet.name} style={current.newArt.flip ? { transform: "scaleX(-1)" } : undefined} />
                        </>
                    ) : current.newArt?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="plu-sprite plu-new" src={current.newArt.url} alt={current.pet.name} style={current.newArt.flip ? { transform: "scaleX(-1)" } : undefined} />
                    ) : (
                        <span className="plu-sprite plu-new plu-emoji" style={{ color: current.pet.color }}>🐾</span>
                    )}
                    <span className="plu-flash" aria-hidden="true" />
                </div>

                <div className="plu-banner">{evolves ? "EVOLVED!" : "LEVEL UP!"}</div>
                <h2 className="plu-title">{current.pet.name} reached Lv {current.to}</h2>
                <div className="plu-stars" aria-label={`Level ${current.to} of 6`}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} className={i < current.to ? "on" : "off"} style={i < current.to ? { animationDelay: `${2 + i * 0.12}s` } : undefined}>★</span>
                    ))}
                </div>
                {/* ── THE ROAD IS NOT OVER AT FIVE ── the one moment we have somebody's attention on the
                    subject of levelling, so it is the moment to say there is another rung. Without this the
                    screen that shouts "LEVEL UP" hardest is the same screen that used to imply five was the
                    end, which is precisely the misconception level six was built to avoid. */}
                {atFive ? (
                    <p className="plu-sixth">
                        One more to go. At <b>Lv 6</b> you can ENSHRINE {current.pet.name} — its ability becomes
                        permanent, working whether it is equipped or not.
                        {" "}<a className="plu-go is-quiet" href={enshrineHref}>See what a stone would do →</a>
                    </p>
                ) : null}
                {/* ── A DOOR, NOT JUST AN ANNOUNCEMENT ── this card told you the pet could be enshrined and then
                    left you to go find where that happens: back out, open Pets, find this pet, scroll its
                    sheet. The one moment the member is looking straight at the thing is the moment to hand
                    them the way in. `?enshrine=1` scrolls the panel into view on arrival. */}
                {maxed ? (
                    <p className="plu-sixth">
                        The top. {current.pet.name} can be <b>enshrined</b> now — spend a stone and its ability
                        is yours whether it is out or not.
                        <a className="plu-go" href={enshrineHref}>Enshrine {current.pet.name} →</a>
                    </p>
                ) : null}
                {/* BEFORE → AFTER, for both stats. The whole point of a level is the number moving. */}
                {gains.length ? (
                    <div className="plu-gains">
                        {gains.map((g) => (
                            <div className={`plu-gain is-${g.kind.toLowerCase()}`} key={g.kind}>
                                <span className="plu-gain-kind">{g.kind}</span>
                                <span className="plu-gain-stat">{g.icon} {g.label}</span>
                                <span className="plu-gain-nums">
                                    <b className="was">+{g.from}</b>
                                    <i aria-hidden="true">›</i>
                                    <b className="now">+{g.to}</b>
                                    {g.up > 0 ? <em>+{g.up}</em> : null}
                                </span>
                            </div>
                        ))}
                        <p className="plu-gains-note">
                            {gains.length > 1
                                ? "Passive counts while you simply own it. Active only counts while it's your companion."
                                : "Counts while it's your companion."}
                            {maxed ? " · MAX LEVEL" : ""}
                        </p>
                    </div>
                ) : null}
                <div className="plu-hint" aria-hidden="true">{queue.length > 1 ? `tap for the next one · ${queue.length - 1} more` : "tap anywhere to close"}</div>
            </div>
        </div>,
        document.body
    );
}

const PLU_CSS = `
.plu-sixth { margin: 8px 0 0; padding: 8px 10px; border-radius: 10px; font-size: .78rem; line-height: 1.45;
    color: #ffe9c2; background: rgba(255,224,138,.10); border: 1px solid rgba(255,224,138,.34); }
.plu-sixth b { color: #ffe08a; }
/* Colour is stated on the anchor itself: the global link rule wins over an inherited one and would paint this
   button's label the site link blue on a gold ground. */
.plu-go { display: block; margin: 9px auto 1px; width: fit-content; padding: 9px 16px; border-radius: 999px;
    font-size: .8rem; font-weight: 900; letter-spacing: .01em; text-decoration: none;
    color: #2a1a00; background: linear-gradient(180deg, #ffe08a, #f0b73c);
    border: 1px solid rgba(255,240,190,.5); box-shadow: 0 6px 18px rgba(240,183,60,.28); }
.plu-go:hover, .plu-go:focus-visible { color: #2a1a00; filter: brightness(1.07); }
.plu-go.is-quiet { display: inline; margin: 0; padding: 0; background: none; border: 0; box-shadow: none;
    font-size: inherit; font-weight: 800; color: #ffe08a; text-decoration: underline; text-underline-offset: 2px; }
.plu-go.is-quiet:hover, .plu-go.is-quiet:focus-visible { color: #fff3cf; }

/* WHAT THE LEVEL BOUGHT — one row per stat, before › after. */
.plu-gains { margin-top: 14px; display: grid; gap: 7px; text-align: left; }
.plu-gain { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 9px;
    padding: 9px 11px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); }
.plu-gain.is-active { border-color: color-mix(in srgb, var(--acc) 45%, transparent); background: color-mix(in srgb, var(--acc) 10%, rgba(255,255,255,0.04)); }
.plu-gain-kind { font-size: 9.5px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase; color: #9aa2ab;
    padding: 3px 7px; border-radius: 999px; background: rgba(0,0,0,0.4); }
.plu-gain.is-active .plu-gain-kind { color: #2a1400; background: var(--acc); }
.plu-gain-stat { font-size: 12.5px; font-weight: 700; color: #e7dcc8; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plu-gain-nums { display: inline-flex; align-items: baseline; gap: 5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.plu-gain-nums .was { font-size: 12.5px; color: #7f8791; text-decoration: line-through; }
.plu-gain-nums i { font-style: normal; color: #7f8791; }
.plu-gain-nums .now { font-size: 15px; color: #fff; }
.plu-gain-nums em { font-style: normal; font-size: 11px; font-weight: 900; color: #7cffb2; }
.plu-gains-note { margin: 4px 2px 0; font-size: 10.5px; line-height: 1.45; color: #8b93a0; text-align: center; }

.plu-scrim { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 18px;
    background: radial-gradient(120% 90% at 50% 30%, color-mix(in srgb, var(--acc, #ffd75e) 12%, rgba(6,4,12,0.82)), rgba(6,4,12,0.9) 70%);
    backdrop-filter: blur(5px); animation: pluFade .3s ease both; }
@keyframes pluFade { from { opacity: 0; } to { opacity: 1; } }
.plu-card { --acc: #ffd75e; position: relative; width: 100%; max-width: 380px; text-align: center; padding: 26px 22px 20px; border-radius: 24px; overflow: hidden;
    background: linear-gradient(180deg, #211634, #120c22 70%, #0d0819);
    border: 1px solid color-mix(in srgb, var(--acc) 55%, transparent);
    box-shadow: 0 30px 80px rgba(0,0,0,0.72), 0 0 60px color-mix(in srgb, var(--acc) 30%, transparent);
    animation: pluPop .45s cubic-bezier(.2,1.35,.35,1) both; }
@keyframes pluPop { from { opacity: 0; transform: translateY(16px) scale(.9); } to { opacity: 1; transform: none; } }

.plu-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.plu-confetti span { position: absolute; top: -14px; width: 8px; height: 13px; border-radius: 2px; opacity: 0; animation: pluConfetti 1.6s ease-in forwards; }
@keyframes pluConfetti { 0% { transform: translateY(0) rotate(0); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(560px) rotate(700deg); opacity: 0; } }

/* ── the sprite transform stage ── */
.plu-stage { position: relative; width: 176px; height: 176px; margin: 4px auto 6px; display: grid; place-items: center; }
.plu-halo { position: absolute; width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--acc) 55%, transparent), transparent 62%); filter: blur(6px); opacity: 0; animation: pluHalo 1.4s ease-in-out 1.3s infinite; }
@keyframes pluHalo { 0%,100% { opacity: .5; transform: scale(.9); } 50% { opacity: .95; transform: scale(1.12); } }
.plu-rays { position: absolute; width: 300px; height: 300px; border-radius: 50%; opacity: 0;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--acc) 60%, transparent) 0deg 7deg, transparent 7deg 20deg);
    -webkit-mask: radial-gradient(circle, transparent 60px, #000 66px, transparent 150px); mask: radial-gradient(circle, transparent 60px, #000 66px, transparent 150px);
    animation: pluRaysIn .6s ease 1.5s forwards, pluRaysSpin 10s linear 1.5s infinite; }
@keyframes pluRaysIn { to { opacity: .6; } }
@keyframes pluRaysSpin { to { transform: rotate(360deg); } }
.plu-sprite { position: absolute; width: 132px; height: 132px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6)); }
.plu-emoji { font-size: 96px; display: grid; place-items: center; }
/* Old form: bobs, shakes, then flashes to a white silhouette and vanishes. */
.is-evo .plu-old { animation: pluOld 1.7s ease forwards; }
@keyframes pluOld {
    0% { opacity: 1; transform: scale(1); filter: none; }
    35% { transform: scale(1) translateX(0); }
    42% { transform: scale(1.02) translateX(-4px); } 48% { transform: translateX(4px); } 54% { transform: translateX(-3px); } 59% { transform: translateX(0); }
    62% { filter: brightness(0) invert(1); transform: scale(1.04); }
    74% { filter: brightness(0) invert(1); opacity: 1; transform: scale(.9); }
    82% { opacity: 0; transform: scale(.7); }
    100% { opacity: 0; }
}
/* New form: bursts in as a white silhouette, then colors resolve with a pop. */
.is-evo .plu-new { opacity: 0; animation: pluNew 1.2s cubic-bezier(.2,1.3,.35,1) 1.15s forwards; }
@keyframes pluNew {
    0% { opacity: 0; transform: scale(.5); filter: brightness(0) invert(1); }
    18% { opacity: 1; transform: scale(1.05); filter: brightness(0) invert(1); }
    46% { filter: brightness(0) invert(1); }
    70% { filter: none; transform: scale(1.12); }
    100% { opacity: 1; transform: scale(1); filter: none; }
}
/* Simple level-up (no distinct sprite): a confident pop + glow. */
.is-simple .plu-new { animation: pluSimple .7s cubic-bezier(.2,1.4,.35,1) both, pluBob 2.4s ease-in-out .7s infinite; }
@keyframes pluSimple { from { opacity: 0; transform: scale(.5) rotate(-12deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes pluBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.plu-flash { position: absolute; width: 240px; height: 240px; border-radius: 50%; background: radial-gradient(circle, #fff, transparent 60%); opacity: 0; animation: pluFlash .5s ease 1.05s; }
.is-simple .plu-flash { animation: pluFlash .5s ease .1s; }
@keyframes pluFlash { 0% { opacity: 0; transform: scale(.4); } 45% { opacity: .95; } 100% { opacity: 0; transform: scale(1.3); } }

.plu-banner { font-size: 1.05rem; font-weight: 900; letter-spacing: 0.08em; color: var(--acc); text-shadow: 0 0 16px color-mix(in srgb, var(--acc) 60%, transparent); opacity: 0; animation: pluRise .5s ease 1.9s both; }
.plu-title { margin: 4px 0 0; font-size: 1.35rem; font-weight: 900; color: #f4ecff; opacity: 0; animation: pluRise .5s ease 2.05s both; text-wrap: balance; }
.plu-stars { display: inline-flex; gap: 3px; margin-top: 8px; font-size: 1.35rem; line-height: 1; }
.plu-stars .off { color: rgba(255,255,255,0.16); }
.plu-stars .on { color: var(--acc); text-shadow: 0 0 12px color-mix(in srgb, var(--acc) 70%, transparent); transform: scale(0); animation: pluStar .4s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes pluStar { from { transform: scale(0) rotate(-40deg); } to { transform: scale(1) rotate(0); } }
.plu-sub { margin: 9px 4px 0; font-size: 0.9rem; color: #d7ccec; opacity: 0; animation: pluRise .5s ease 2.35s both; }
.plu-sub b { color: #fff; }
@keyframes pluRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.plu-hint { margin-top: 16px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.03em; text-transform: lowercase;
    color: rgba(255,255,255,0.42); animation: pluFade .4s ease 2.4s both; }
.plu-btn { margin-top: 16px; width: 100%; padding: 13px 16px; border-radius: 13px; border: none; font-weight: 900; font-size: 1rem; cursor: pointer;
    color: #24123a; background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 90%, #fff), var(--acc));
    box-shadow: 0 4px 0 color-mix(in srgb, var(--acc) 55%, #000), 0 10px 24px color-mix(in srgb, var(--acc) 35%, transparent);
    opacity: 0; animation: pluRise .5s ease 2.5s both; }
.plu-btn:active { transform: translateY(2px); }
`;
