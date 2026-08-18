"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ItemArt from "@/components/ItemArt";
import FishingWater from "@/components/FishingWater";
import { createPortal } from "react-dom";

// ── FISHING ──────────────────────────────────────────────────────────────────────────────────────────────────
// Three beats, about fifteen seconds:
//
//   CAST   tap once. The server has already decided what's down there.
//   BITE   the line twitches at a moment you can't predict. Tap again.
//   REEL   the fish swims up and down on its own. HOLD to raise YOUR BAR, release and it falls. Keep the fish
//          inside the bar. Time-in-bar is your reel score — shown live, but it does NOT decide the size.
//          Size is luck; a good reel only floors the bad end of it (see weightFor in fishing.js).
//
// The roles were the other way round at first — you drove a hook and the zone drifted — and it read as broken:
// "the green bar just goes up and down without any input from me". A fish that swims itself is what everyone
// expects a fish to do, and chasing it with a capture bar is an idiom players already know.
//
// The reel is deliberately NOT the forge's timing bar — this one is continuous and forgiving. Every frame the
// fish is inside the bar is credit banked, so a shaky reel lands a smaller fish rather than nothing. The only
// way to lose the fish is to never tap the bite at all, and that refunds the cast server-side.
//
// The server owns everything that matters: species, the luck half of the size, and the payout. This component
// reports one number — quality, 0..1 — exactly like the forge's enhance minigame and the merchant's coin game.

const REEL_MS = 6500;            // how long the struggle lasts
const BAND_H = 0.26;             // height of your bar, as a fraction of the tank
const REEL_WARMUP_MS = 700;      // grace before scoring starts — see the note at the scoring site
const DART_EVERY_MS = 900;       // the fish makes a run for it this often

// ── YOUR BAR ─────────────────────────────────────────────────────────────────────────────────────────────────
// These were inherited from the old marker physics and were catastrophically wrong once the bar became the
// thing you drive. At pull 1.35 / gravity 0.62 / damping 0.86 the bar settled at 0.075 units per second, so
// crossing the tank took 9.9 SECONDS — in a reel that lasts 6.5. A fish at the far end was not hard to reach,
// it was unreachable, and holding felt like pressing a button attached to nothing.
//
// Now the bar crosses in a bit under a second, and drops in about one and a half. Responsive enough that the
// chase is a chase; heavy enough that it still coasts and you have to lead the fish rather than snap to it.
const BAR_PULL = 7.0;            // upward acceleration while you hold
const BAR_GRAVITY = 2.6;         // and what takes it back down when you let go
const BAR_DAMPING = 0.92;        // light — the bar should answer the thumb, not wade through treacle
const FISH_DAMPING = 0.86;       // heavier, so the fish's darts settle instead of pinballing

// LINE TENSION IS GONE. It was meant to make holding a decision, but with a bar this sluggish you had to hold
// constantly just to make headway — and holding constantly redlined the line in 2.2 seconds. So the mechanic
// that was supposed to add a choice instead guaranteed a failure you couldn't avoid, on top of a chase you
// couldn't win. Luke played it and said so. The depth now comes from the fish itself: what it does is visible,
// which the tension gauge never was.

// How hard a thing fights, by how rare it is. The client is told a FIGHT PROFILE, never the species — knowing
// a Kraken is on the line before it surfaces would give the reveal away — but it can feel the difference,
// which is the point: a monster should fight like one.
const FIGHT = {
    common: { dart: 0.85 },
    rare: { dart: 1.0 },
    epic: { dart: 1.25 },
    legendary: { dart: 1.5 },
    mythic: { dart: 1.85 },
};

// THE score, in one place. It used to be computed only at the end (as sqrt of time-in-band) while the on-screen
// strain bar drew the RAW fraction — so the single piece of live feedback disagreed with the result it was
// supposedly previewing: reel at 0.45 and the bar read 45% while you were actually banking 67%. The curve is
// still applied (raw time-in-band sits near 0.45 even when you're playing well, because the band moves), but
// the bar and the submitted score now come from this same function.
const scoreOf = (inFrames, total) => Math.max(0, Math.min(1, Math.sqrt(total ? inFrames / total : 0)));
const BITE_HOLD_MS = 2600;       // how long the bite stays tappable once it starts

const RARITY_COLOR = {
    common: "#cfd8e3", rare: "#7ec8ff", epic: "#c9a2ff", legendary: "#ffd75e", mythic: "#ff9ec4",
};
const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic" };

// A weight in pounds, written the way an angler would say it — ounces for the tiddlers, whole pounds once
// it's a real fish, and no decimals at all on the monsters where a tenth of a pound is noise.
function weightLabel(lb) {
    const n = Number(lb) || 0;
    if (!n) return "—";
    if (n < 1) return `${Math.round(n * 16)} oz`;
    if (n < 10) return `${n.toFixed(1)} lb`;
    return `${Math.round(n).toLocaleString()} lb`;
}

// The species sprite, with the old emoji as the fallback until its PNG is in place.
function FishArt({ id, emoji, size = 44, className = "" }) {
    const [failed, setFailed] = useState(false);
    if (!id || failed) return <span className={className} style={{ fontSize: size * 0.8 }} aria-hidden="true">{emoji}</span>;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            className={className} src={`/images/fish/${id}.png`} alt="" aria-hidden="true"
            width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }}
            onError={() => setFailed(true)}
        />
    );
}

// ── SOUND ── best-effort Web Audio, no asset files. Silent if the browser blocks it.
function useSfx() {
    const ctxRef = useRef(null);
    const ac = () => {
        if (typeof window === "undefined") return null;
        if (!ctxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try { ctxRef.current = new AC(); } catch { return null; }
        }
        if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
        return ctxRef.current;
    };
    const tone = useCallback((freq, dur = 0.12, type = "sine", vol = 0.12) => {
        const ctx = ac(); if (!ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    }, []);
    return useMemo(() => ({
        plop: () => tone(320, 0.16, "sine", 0.1),
        bite: () => { tone(880, 0.08, "square", 0.13); setTimeout(() => tone(1180, 0.1, "square", 0.11), 70); },
        click: () => tone(140 + Math.random() * 40, 0.03, "square", 0.05),
        land: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.12), i * 90)); },
        gone: () => { tone(300, 0.18, "sawtooth", 0.08); setTimeout(() => tone(190, 0.26, "sawtooth", 0.07), 130); },
    }), [tone]);
}


// ── THE LOG ──────────────────────────────────────────────────────────────────────────────────────────────────
// Exported so the dedicated /marketplace/fishing page renders the SAME boards. It used to be reachable only
// through this modal — which is only offered while a voyage is in flight — so your own log was invisible
// whenever your boat was docked.
export function FishingLog({ log, known, total, records, onClose }) {
    const [tab, setTab] = useState("log");
    // `records` arrives as { records, top } — the per-species board and the ranked leaderboard.
    const perSpecies = records?.records || [];

    // MY BESTS. This tab used to be "Top Catches": the Den's heaviest catches ranked overall, sitting beside
    // "Species Records", the Den's heaviest catch PER SPECIES. Two boards of other people's big fish, and from
    // the player's chair they read as the same board twice. Species Records is the one worth keeping — it is
    // per species and it shows which records are unclaimed, so it tells you what to go and chase.
    //
    // What was missing was your own trophy wall. My Collection has your best weight in it, but it is a
    // checklist of all 40-odd species in fixed order, mostly question marks — you cannot see your best catches
    // in it, only look them up one at a time. This ranks what you have actually landed, heaviest first, next
    // to the Den record for that species so the gap (or the crown) is right there.
    //
    // Built from data already on the client — `log` carries your best per species and `perSpecies` carries the
    // Den record for it — so this needed no new endpoint.
    const bestOf = new Map(perSpecies.map((r) => [r.id, r.record || 0]));
    const mine = (log || [])
        .filter((f) => f.caught && f.best > 0)
        .map((f) => ({ ...f, denRecord: bestOf.get(f.id) || 0 }))
        .sort((a, b) => b.best - a.best);
    return (
        <div className="fish-log">
            <div className="fish-log-tabs">
                <button type="button" className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>📖 My Collection</button>
                <button type="button" className={tab === "top" ? "on" : ""} onClick={() => setTab("top")}>🥇 My Bests</button>
                <button type="button" className={tab === "rec" ? "on" : ""} onClick={() => setTab("rec")}>🏆 Den Records</button>
            </div>
            {tab === "log" ? (
                <>
                    <p className="fish-log-progress">{known} of {total} species logged</p>
                    <div className="fish-log-grid">
                        {(log || []).map((f) => (
                            <div key={f.id} className={`fish-log-row${f.caught ? "" : " is-unknown"}`}>
                                {f.caught ? <FishArt id={f.id} emoji={f.emoji} size={34} className="fish-log-art" /> : <span className="fish-log-emoji" style={{ color: RARITY_COLOR[f.rarity] }}>❓</span>}
                                <span className="fish-log-name">
                                    {f.caught ? f.name : "???"}
                                    <em style={{ color: RARITY_COLOR[f.rarity] }}>{RARITY_LABEL[f.rarity]}</em>
                                </span>
                                <span className="fish-log-best">
                                    {f.caught ? (
                                        <>
                                            <strong>{weightLabel(f.best)}</strong>
                                            <em>×{f.caught}</em>
                                        </>
                                    ) : <em>{f.odds >= 1 ? `${f.odds}% chance` : `1 in ${Math.round(100 / f.odds)}`}</em>}
                                </span>
                                
                            </div>
                        ))}
                    </div>
                </>
            ) : tab === "top" ? (
                <>
                    <p className="fish-log-progress">Your heaviest of every species you&apos;ve landed</p>
                    <div className="fish-log-grid">
                        {mine.map((f, i) => {
                            // Your best matching the Den record for that species means the record is yours.
                            const holder = f.denRecord > 0 && f.best >= f.denRecord;
                            return (
                                <div key={f.id} className="fish-log-row">
                                    <span className="fish-top-rank">{i + 1}</span>
                                    <FishArt id={f.id} emoji={f.emoji} size={34} className="fish-log-art" />
                                    <span className="fish-log-name">
                                        {f.name}
                                        <em style={{ color: RARITY_COLOR[f.rarity] }}>{RARITY_LABEL[f.rarity]} · caught ×{f.caught}</em>
                                    </span>
                                    <span className="fish-log-best">
                                        <strong>{weightLabel(f.best)}</strong>
                                        {holder
                                            ? <em className="fish-over">🏆 Den record</em>
                                            : f.denRecord > 0 ? <em>best {weightLabel(f.denRecord)}</em> : null}
                                    </span>
                                </div>
                            );
                        })}
                        {!mine.length ? <p className="muted" style={{ padding: 12 }}>Nothing landed yet — your first catch starts this board.</p> : null}
                    </div>
                </>
            ) : (
                <>
                <p className="fish-log-progress">The Den&apos;s heaviest of each species — unclaimed ones are yours for the taking</p>
                <div className="fish-log-grid">
                    {perSpecies.map((r) => (
                        <div key={r.id} className={`fish-log-row${r.record ? "" : " is-unknown"}`}>
                            <FishArt id={r.id} emoji={r.emoji} size={34} className="fish-log-art" />
                            <span className="fish-log-name">{r.name}<em>{r.who ? `@${r.alias}` : "unclaimed"}</em></span>
                            <span className="fish-log-best">
                                {r.record ? <strong>{weightLabel(r.record)}</strong> : <em>be the first</em>}
                            </span>
                        </div>
                    ))}
                    {!perSpecies.length ? <p className="muted" style={{ padding: 12 }}>Nobody has landed anything yet. The board is yours for the taking.</p> : null}
                </div>
                </>
            )}
            {/* No close button on the dedicated page — there's nothing to close, it IS the screen. */}
            {onClose ? <button type="button" className="fish-close" onClick={onClose}>Back to the rail</button> : null}
        </div>
    );
}

// ── THE SCENE ────────────────────────────────────────────────────────────────────────────────────────────────
// `fishing` is the server's fishing view. `onCast`/`onLand` post to the sailing endpoint and resolve with the
// server's reply; the parent owns the state refresh.
// RARITY_COLOR already lives at the top of this file — the fish log uses it.
const STAT_SHORT = { might: "Might", crit_chance: "Crit", crit_power: "Crit Dmg", ferocity: "Ferocity", fortune: "Fortune", extra_strike: "Extra Strike" };
const statLine = (stats) => Object.entries(stats || {}).map(([k, v]) => `+${v} ${STAT_SHORT[k] || k}`).join(" · ");

// The rise animation's length (see .fw-haul / @keyframes fwRise). One number, so the hand-off to a fight and
// the picture clearing the water cannot drift apart.
const HAUL_MS = 1150;
// How long the water hints before the float goes down. Long enough to look up, short enough that it is a
// tell rather than a countdown.
const TELL_MS = 1400;

export default function FishingScene({ fishing, sky, boat = null, hero = null, records, gold = 0, onCast, onLand, onRecharge, onLoadRecords, onClose, onMonster = null }) {
    const sfx = useSfx();
    const [phase, setPhase] = useState("idle");   // idle | waiting | bite | reel | result | gone | log
    const [fight, setFight] = useState("common"); // the fight profile of what is on the line (rarity only)
    const [result, setResult] = useState(null);
    // What is currently breaking the surface, for FishingWater to draw. Set the moment the land call answers,
    // so the rise animation is already showing the real thing rather than a silhouette.
    const [haul, setHaul] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const biteTimer = useRef(null);
    const graceTimer = useRef(null);
    const tellTimer = useRef(null);
    const castRef = useRef(null);

    const casts = fishing?.casts || { left: 0, max: 0, used: 0 };

    const clearTimers = useCallback(() => {
        if (biteTimer.current) { clearTimeout(biteTimer.current); biteTimer.current = null; }
        if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
        // The tell rides with the other two — a leaked one would drop the scene back to "something's
        // circling" after the fish was already on the deck.
        if (tellTimer.current) { clearTimeout(tellTimer.current); tellTimer.current = null; }
    }, []);
    useEffect(() => clearTimers, [clearTimers]);

    // Report a miss so the server refunds the cast, then show the "it got away" beat.
    const reportMiss = useCallback(async () => {
        clearTimers();
        setPhase("gone");
        sfx.gone();
        await onLand({ quality: 0, missed: true, sky }).catch(() => {});
    }, [clearTimers, onLand, sfx, sky]);

    // The recharge offer, if the day's free casts are spent and another can still be bought.
    const rc = fishing?.recharge || {};
    const buyable = Boolean(rc.available);
    const canAfford = Number(gold || 0) >= Number(rc.cost || 0);
    const buyCast = useCallback(async () => {
        if (busy || !canAfford) return;
        setBusy(true);
        try { await onRecharge?.(); } finally { setBusy(false); }
    }, [busy, canAfford, onRecharge]);

    // ── BAIT FIRST, THEN THE WATER ───────────────────────────────────────────────────────────────────────
    // Luke: "when you decide you wanna fish, you first select a bait if you have one, or you say skip
    // baiting, and then it goes on to the actual fishing minigame."
    //
    // The picker is a STEP, not a setting — it opens on the tap that would have cast, and closes into the
    // cast. Nothing is remembered between casts: a bait is SPENT, so a silent default would burn your best
    // one on a cast you never thought about.
    const [picking, setPicking] = useState(false);
    const baits = Array.isArray(fishing?.baits) ? fishing.baits : [];

    // ── THE LIST HAS TO LOOK UNFINISHED WHEN IT IS ───────────────────────────────────────────────────────
    // The box holds about five rows and there are twenty baits in the game. The cut falls neatly BETWEEN
    // rows, so a full box looks like a complete list of five — and the only thing saying otherwise is a
    // hairline scrollbar that a phone hides entirely until you are already scrolling. You cannot pick the
    // bait you cannot see.
    //
    // So the wrapper carries `data-more`, and the fade below it only exists while there is something under
    // the fold. Measured rather than assumed (`baits.length > 5` would be a magic number that has to be kept
    // in step with a max-height in a different file), and re-measured on scroll so it clears at the bottom.
    const listRef = useRef(null);
    const [more, setMore] = useState(false);
    const measure = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    }, []);
    useEffect(() => { if (picking) measure(); }, [picking, baits.length, measure]);

    const cast = useCallback(async (bait = null) => {
        if (busy) return;
        setPicking(false);
        setBusy(true); setErr(null); setResult(null); setHaul(null);
        const res = await onCast({ sky, bait }).catch(() => null);
        setBusy(false);
        if (!res?.ok) {
            setErr(res?.error === "out_of_casts" ? "You're out of casts for today — they refill tomorrow."
                : res?.error === "already_cast" ? "Your line is already in the water."
                : res?.error === "not_at_sea" ? "You can't fish while you're ashore digging."
                : "The line wouldn't go out. Try again.");
            return;
        }
        // Remember the line WE just put out, so the resume-a-cast effect below doesn't also arm a bite timer for
        // it. Two timers would fire two bite phases and leak a grace timer that could report a miss after the
        // fish was already landed.
        castRef.current = Number(res.cast?.biteAt) || 0;
        // How hard this one fights. Rarity only — never the species, which stays hidden until it surfaces.
        setFight(res.cast?.fight || "common");
        setPhase("waiting");
        sfx.plop();
        const wait = Math.max(200, Number(res.cast?.biteAt || 0) - Date.now());
        // The water says so first. TELL_MS before the bite a shadow crosses under the float and the float
        // nudges — cosmetic only, the bite window and the tap are unchanged, but it turns "wait, then react to
        // a colour" into something you can actually watch for. Clamped so a very short wait still gets one.
        tellTimer.current = setTimeout(() => setPhase("tell"), Math.max(120, wait - TELL_MS));
        biteTimer.current = setTimeout(() => {
            setPhase("bite");
            sfx.bite();
            // The bite is the one moment that demands a reaction — make it felt, not just heard.
            try { navigator.vibrate?.([0, 45, 35, 45]); } catch { /* no haptics here */ }
            // A long, generous tap window — and missing it costs nothing but the wait.
            graceTimer.current = setTimeout(reportMiss, BITE_HOLD_MS);
        }, wait);
    }, [busy, onCast, reportMiss, sfx, sky]);

    // ── THE TAP, AND THEN YOU WATCH ──────────────────────────────────────────────────────────────────────
    // The struggle bar is gone. Tapping the bite hooks it and the haul begins immediately — the land call goes
    // out while the rise animation plays, so the thing clearing the water and the answer arriving are the same
    // beat rather than a loading gap between two screens.
    //
    // QUALITY IS FIXED AT A CLEAN REEL. The server still reads it (it stretches the measurement and can bump a
    // treasure tier), so it cannot simply be dropped — and grading a timing bar nobody is playing would be a
    // lie. 0.78 is "reeled it in properly", which is what one well-timed tap deserves. Luke: "it's really easy
    // and I don't mind it being easy at all — I don't like that it's not very immersive."
    const strike = useCallback(() => {
        if (phase !== "bite") return;
        clearTimers();
        setPhase("hauling");
        finishReel(0.78);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, clearTimers]);

    const finishReel = useCallback(async (quality) => {
        setBusy(true);
        try {
            const big = ["legendary", "mythic"].includes(fight);
            navigator.vibrate?.(big ? [30, 50, 30, 50, 90] : [25, 40, 60]);
        } catch { /* no haptics here */ }
        const res = await onLand({ quality, sky }).catch(() => null);
        setBusy(false);
        // ── SOMETHING CAME UP FIGHTING ───────────────────────────────────────────────────────────────
        // It surfaces like anything else — you watch it clear the water and see WHAT it is — and only then
        // does the fight open. Handing straight to the bout would cover the one frame the whole rework is
        // for. HAUL_MS matches the rise keyframe in globals.css.
        if (res?.ok && res.monster) {
            setHaul({ art: res.monster.art, name: res.monster.name, kind: "monster" });
            sfx.bite();
            setTimeout(() => onMonster?.(res.monster), HAUL_MS);
            return;
        }
        if (res?.ok && res.landed) {
            // ── EVERYTHING SURFACES, INCLUDING THE TREASURE ──────────────────────────────────────────
            // A chest used to skip the water entirely and appear on a card, which made the one haul with the
            // best art in it the only one you never watched come up. Both paths feed the same rise now: a
            // treasure haul draws its prize's own sprite (`prize.spriteUrl`, already on every treasure the
            // table can produce) and a fish draws its species plate, which is resolved from the id here the
            // same way the reveal card resolves it.
            const landedNow = res.catchResult || res;
            setHaul(landedNow.treasure
                ? { art: landedNow.prize?.spriteUrl || "/images/sailing/dig-chest.png", name: landedNow.prize?.label || "Treasure", kind: "treasure" }
                : { art: landedNow.fish?.id ? `/images/fish/${landedNow.fish.id}.png` : null, name: landedNow.fish?.name || null, kind: "fish" });
            // `catchResult`, NOT `res`. fishLand returns the catch spread UNDER the whole sailing state, and
            // that state carries `gold` = the member's total balance — so `res.gold` is your wallet, not the
            // payout. A 12-gold Tiger Prawn proudly reported "+1879 🪙". XP looked fine only because the
            // sailing state has no `xp` key to overwrite. catchResult is the untouched landFish result.
            const landed = res.catchResult || res;
            setResult(landed);
            // Let it finish clearing the water before the card covers it — the surfacing IS the reward beat.
            setTimeout(() => setPhase("result"), HAUL_MS);
            // A bigger fish gets a bigger noise — the flat four-note arpeggio played identically for a
            // sardine and a kraken, which flattened the one moment worth celebrating.
            const grand = landed.denRecord || landed.firstEver
                || ["legendary", "mythic"].includes(landed.fish?.rarity || landed.tier);
            sfx.land();
            if (grand) { setTimeout(() => sfx.land(), 300); setTimeout(() => sfx.bite(), 620); }
        } else if (res?.ok) {
            setHaul(null);
            setPhase("gone");
            sfx.gone();
        } else {
            setErr("Something went wrong bringing it in.");
            setPhase("idle");
        }
    }, [onLand, sfx, sky]);

    const openLog = useCallback(() => { setPhase("log"); if (onLoadRecords) onLoadRecords(); }, [onLoadRecords]);

    // If the page reloaded with a line still in the water, pick it up where it left off rather than stranding it.
    useEffect(() => {
        const hooked = fishing?.hooked;
        if (!hooked || phase !== "idle") return;
        if (Number(hooked.biteAt) === castRef.current) return; // this is the line we just cast — already armed
        clearTimers();
        const untilBite = Number(hooked.biteAt) - Date.now();
        if (untilBite > 0) {
            setPhase("waiting");
            tellTimer.current = setTimeout(() => setPhase("tell"), Math.max(120, untilBite - TELL_MS));
            biteTimer.current = setTimeout(() => { setPhase("bite"); sfx.bite(); graceTimer.current = setTimeout(reportMiss, BITE_HOLD_MS); }, untilBite);
        } else if (Date.now() - Number(hooked.biteAt) < Number(hooked.graceMs || 12000)) {
            setPhase("bite");
            graceTimer.current = setTimeout(reportMiss, BITE_HOLD_MS);
        } else {
            reportMiss();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fishing?.hooked]);

    const body = (
        <div className="fish-wrap" role="dialog" aria-modal="true" aria-label="Fishing">
            <div className="fish-sea" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => <span key={i} className="fish-ripple" style={{ left: `${8 + i * 13}%`, animationDelay: `${i * 0.7}s` }} />)}
            </div>
            <div className="fish-card">
                <div className="fish-head">
                    <strong>🎣 Fishing</strong>
                    <span className="fish-casts">{casts.left}/{casts.max} casts left today</span>
                    <button type="button" className="fish-x" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {phase === "log" ? (
                    <FishingLog log={fishing?.log} known={fishing?.speciesKnown || 0} total={fishing?.speciesTotal || 0} records={records} onClose={() => setPhase("idle")} />
                ) : phase === "idle" ? (
                    <div className="fish-stage">
                        <div className="fish-idle-art">🎣</div>
                        <p className="fish-copy">
                            Drop a line over the rail. When it twitches, <strong>tap</strong> — then <strong>hold to reel</strong> and
                            keep the fish in the green. A good reel lands a bigger fish.
                        </p>
                        {/* ── THE BAIT STEP ── every row states what it buys, and the number comes off the
                            bait itself, so the picker cannot advertise a boost the cast does not apply. */}
                        {picking ? (
                            <div className="fish-bait" role="dialog" aria-label="Choose a bait">
                                <p className="fish-bait-head">
                                    What are you putting on the hook?
                                    {baits.length > 1 ? <span className="fish-bait-count">{baits.length} to choose from</span> : null}
                                </p>
                                <div className="fish-bait-scroll" data-more={more ? "1" : undefined}>
                                <div className="fish-bait-list" ref={listRef} onScroll={measure}>
                                    {baits.map((b) => (
                                        <button key={b.id} type="button" className={`fish-bait-row is-${b.rarity}`}
                                            disabled={busy} onClick={() => cast(b.id)}>
                                            {b.sprite
                                                // eslint-disable-next-line @next/next/no-img-element
                                                ? <img src={b.sprite} alt="" className="fish-bait-art" draggable="false" />
                                                : <span className="fish-bait-art" aria-hidden="true">🪱</span>}
                                            <span className="fish-bait-name">
                                                <b>{b.name}</b>
                                                <em>{b.blurb}</em>
                                            </span>
                                            <span className="fish-bait-num">
                                                <b>+{b.tilt.toFixed(1)}</b>
                                                <em>rarity · {b.qty} left</em>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                </div>
                                <button type="button" className="fish-ghost" disabled={busy} onClick={() => cast(null)}>
                                    Skip baiting — cast the bare hook
                                </button>
                            </div>
                        ) : null}
                        {err ? <p className="fish-err">{err}</p> : null}
                        <div className="fish-actions">
                            {/* ONE button. Running out of casts doesn't hand you a dead control and hide the
                                way forward somewhere else on another screen — the same button you've been
                                tapping simply changes what it offers, the way the raid and tailwind buttons do.
                                Only when there's genuinely nothing left to offer does it disable. */}
                            {casts.left > 0 || !buyable ? (
                                <button type="button" className="fish-cta" disabled={busy || casts.left <= 0}
                                    onClick={() => (baits.length ? setPicking(true) : cast(null))}>
                                    {casts.left <= 0 ? "Out of casts today" : busy ? "Casting…" : baits.length ? "Bait up 🎣" : "Cast the line 🎣"}
                                </button>
                            ) : (
                                <button type="button" className="fish-cta is-buy" disabled={busy || !canAfford} onClick={buyCast}>
                                    {busy ? "…" : <>Buy another cast 🎣 <span className="fish-cta-cost">🪙 {rc.cost.toLocaleString()}{canAfford ? "" : " · not enough"}</span></>}
                                </button>
                            )}
                            <button type="button" className="fish-ghost" onClick={openLog}>
                                📖 Log · {fishing?.speciesKnown || 0}/{fishing?.speciesTotal || 0}
                            </button>
                        </div>
                        {fishing?.totalCaught ? <p className="muted fish-tally">{fishing.totalCaught} fish landed all-time</p> : null}
                    </div>
                ) : phase === "waiting" || phase === "tell" || phase === "bite" || phase === "hauling" ? (
                    /* ── THE WHOLE MINIGAME, REPLACED ────────────────────────────────────────────────────
                       Was: a text line saying "waiting for a bite", then a TAP button, then a hold-to-reel
                       bar with a moving green zone. Three screens of instruction for an action Luke was
                       happy to have be easy — and none of them showed you anything.
                       Now it is one scene you watch: your boat, your hero on the deck, a bobber that dips,
                       and whatever is on the end rising through the water. One tap, same as before. */
                    <FishingWater
                        phase={phase}
                        sky={sky}
                        boat={boat}
                        hero={hero}
                        haul={haul}
                        busy={busy}
                        onStrike={phase === "bite" ? strike : undefined}
                    />
                ) : phase === "gone" ? (
                    <div className="fish-stage">
                        <div className="fish-idle-art">💨</div>
                        <p className="fish-copy">It stole your bait and slipped away.</p>
                        <p className="muted">Your cast came back — no harm done.</p>
                        <div className="fish-actions">
                            <button type="button" className="fish-cta" onClick={() => { setPhase("idle"); setResult(null); }}>Try again 🎣</button>
                        </div>
                    </div>
                ) : result?.treasure ? (
                    // One cast in five surfaces treasure instead of a fish — its own moment, not a footnote.
                    <div className="fish-stage fish-result">
                        <div className="fish-banner is-new">🧭 TREASURE!</div>
                        <div className={`fish-reveal is-pop rarity-${result.tier || "common"}`}>
                            <span className="fish-rays" aria-hidden="true" />
                            <span className="fish-burst" aria-hidden="true" />
                            {["legendary", "mythic"].includes(result.tier) ? (
                                <span className="fish-sparks" aria-hidden="true">
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <i key={i} style={{ "--a": `${i * 36}deg`, "--d": `${0.05 + (i % 5) * 0.045}s` }} />
                                    ))}
                                </span>
                            ) : null}
                            {/* The real art when we have it. This is the payoff moment of the feature, and a treasure haul used to
                                land here as a bare emoji while a fish got its illustrated sprite — so half the reward
                                table looked like a placeholder. Fragments keep the emoji: they're a currency, not a thing. */}
                            {result.prize?.spriteUrl ? (
                                <span className="fish-reveal-wrap">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="fish-reveal-art" src={result.prize.spriteUrl} alt={result.prize.label || ""} />
                                    {result.prize.n > 1 ? <span className="fish-reveal-count">×{result.prize.n}</span> : null}
                                </span>
                            ) : (
                                // 🧰 used to be the fallback here, and when a haul paid nothing it rendered a
                                // toolbox labelled "Something". Members asked each other for days what the
                                // "tool box looking things" were — they were our placeholder for empty. A
                                // treasure chest is what an unknown haul should look like.
                                <span className="fish-reveal-art" style={{ fontSize: 96 }} aria-hidden="true">{result.prize?.emoji || "🗝️"}</span>
                            )}
                        </div>
                        <div className="fish-name" style={{ color: RARITY_COLOR[result.tier] || "#cfd8e3" }}>{result.prize?.label || "Something"}</div>
                        <div className="fish-rarity" style={{ color: RARITY_COLOR[result.tier] || "#cfd8e3" }}>{RARITY_LABEL[result.tier] || "Common"}</div>
                        <p className="fish-copy">You hauled it up off the sea floor — no fish this time.</p>
                        {/* Fishing pays into four other screens. Saying which one turns a reward the member
                            can't find into one they can go and use. */}
                        {result.prize?.where ? <p className="fish-where">📍 {result.prize.where}</p> : null}
                        <div className="fish-actions">
                            <button
                                type="button"
                                className={`fish-cta${casts.left <= 0 && buyable ? " is-buy" : ""}`}
                                disabled={busy || (casts.left <= 0 && !(buyable && canAfford))}
                                onClick={async () => {
                                    // Out of casts: buy one right here rather than sending them back to find a
                                    // different button. Either way we land on idle, ready to cast.
                                    if (casts.left <= 0 && buyable) await buyCast();
                                    setResult(null); setPhase("idle");
                                }}
                            >
                                {casts.left > 0 ? "Cast again 🎣"
                                    : buyable ? `Buy another cast 🎣 · 🪙 ${rc.cost.toLocaleString()}${canAfford ? "" : " · not enough"}`
                                    : "That's your last cast today"}
                            </button>
                            <button type="button" className="fish-ghost" onClick={openLog}>📖 Fishing Log</button>
                        </div>
                    </div>
                ) : result ? (
                    <div className="fish-stage fish-result">
                        {result.denRecord ? <div className="fish-banner is-den">🥇 BIGGEST IN THE DEN!</div>
                            : result.firstEver ? <div className="fish-banner is-new">✨ NEW SPECIES!</div>
                                : result.personalBest ? <div className="fish-banner">📈 PERSONAL BEST!</div> : null}
                        {/* THE REVEAL. The sprite used to just appear — the biggest moment in the feature
                            arriving with no ceremony at all. Rays, a burst ring and sparks, all tinted to the
                            rarity, so a mythic feels different from a sardine without reading a word. */}
                        <div className={`fish-reveal is-pop rarity-${result.fish.rarity}`}>
                            <span className="fish-rays" aria-hidden="true" />
                            <span className="fish-burst" aria-hidden="true" />
                            {["legendary", "mythic"].includes(result.fish.rarity) || result.denRecord || result.firstEver ? (
                                <span className="fish-sparks" aria-hidden="true">
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <i key={i} style={{ "--a": `${i * 36}deg`, "--d": `${0.05 + (i % 5) * 0.045}s` }} />
                                    ))}
                                </span>
                            ) : null}
                            <FishArt id={result.fish.id} emoji={result.fish.emoji} size={140} className="fish-reveal-art" />
                        </div>
                        <div className="fish-name" style={{ color: RARITY_COLOR[result.fish.rarity] }}>{result.fish.name}</div>
                        <div className="fish-rarity" style={{ color: RARITY_COLOR[result.fish.rarity] }}>{RARITY_LABEL[result.fish.rarity]}</div>
                        <div className="fish-size">{weightLabel(result.fish.lb)}</div>
                        {/* No "% of max" and no "species max". There is no maximum any more (weightFor rolls
                            an open-ended trophy tail), and a percentage-toward-a-ceiling reads as "nearly
                            done — no point trying again", which is the opposite of what a record board is for.
                            The comparisons that survive are the two that can always be beaten. */}
                        {result.beatsRange ? <div className="fish-trophy-flag">🏆 BIGGER THAN ANY ON RECORD FOR ITS KIND</div> : null}
                        <div className="fish-compare">
                            <div className={`fish-compare-cell${result.personalBest ? " is-beat" : ""}`}>
                                <em>your best</em>
                                <b>{weightLabel(result.personalBest ? result.fish.lb : (result.previousBest || result.fish.lb))}</b>
                                {result.personalBest ? <span className="fish-compare-tag">BEATEN</span> : null}
                            </div>
                            <div className={`fish-compare-cell${result.denRecord ? " is-beat" : ""}`}>
                                <em>den record</em>
                                <b>{weightLabel(result.denRecord ? result.fish.lb : (result.denBest || result.fish.lb))}</b>
                                {result.denRecord ? <span className="fish-compare-tag">YOURS</span> : null}
                            </div>
                        </div>
                        <div className="fish-spoils">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <span className="fish-chip gold"><img src="/images/ui/coin.png" alt="" className="fish-chip-ico" />+{result.gold}</span>
                            <span className="fish-chip xp">+{result.xp} XP</span>
                            {/* Everything that ISN'T gear stays a chip. Gear gets its own card below. */}
                            {(result.extras || []).filter((e) => e.kind !== "gear").map((e, i) => (
                                <span key={i} className="fish-chip extra">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {e.spriteUrl ? <img src={e.spriteUrl} alt="" className="fish-chip-ico" /> : null}
                                    {e.label}
                                </span>
                            ))}
                        </div>

                        {/* GEAR, IN FULL. A piece of gear off the sea floor was a purple text pill the same size
                            as "+5 gold" — the one thing in the haul you might actually equip, rendered as a
                            footnote. Same treatment as a chest opening or a seam: real art, rarity frame, slot
                            and the stat line. */}
                        {(result.extras || []).filter((e) => e.kind === "gear").map((e, i) => (
                            <div key={`g${i}`} className="fish-gear" style={{ "--rar": RARITY_COLOR[e.rarity] || "#cdd3d8" }}>
                                <span className="fish-gear-lab">Off the sea floor</span>
                                <ItemArt id={e.id} icon={e.icon} className="fish-gear-art" alt="" />
                                <i className="fish-gear-tag">{(e.rarity || "").toUpperCase()}</i>
                                <b className="fish-gear-name" style={{ color: RARITY_COLOR[e.rarity] || "#e7dcc8" }}>{e.label}</b>
                                {e.slot ? <i className="fish-gear-slot">{String(e.slot).replace("_", " ")}</i> : null}
                                {e.stats ? <i className="fish-gear-stats">{statLine(e.stats)}</i> : null}
                            </div>
                        ))}
                        <div className="fish-actions">
                            <button
                                type="button"
                                className={`fish-cta${casts.left <= 0 && buyable ? " is-buy" : ""}`}
                                disabled={busy || (casts.left <= 0 && !(buyable && canAfford))}
                                onClick={async () => {
                                    // Out of casts: buy one right here rather than sending them back to find a
                                    // different button. Either way we land on idle, ready to cast.
                                    if (casts.left <= 0 && buyable) await buyCast();
                                    setResult(null); setPhase("idle");
                                }}
                            >
                                {casts.left > 0 ? "Cast again 🎣"
                                    : buyable ? `Buy another cast 🎣 · 🪙 ${rc.cost.toLocaleString()}${canAfford ? "" : " · not enough"}`
                                    : "That's your last cast today"}
                            </button>
                            <button type="button" className="fish-ghost" onClick={openLog}>📖 Fishing Log</button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(body, document.body);
}
