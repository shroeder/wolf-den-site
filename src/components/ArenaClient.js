"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    GiCrossedSwords, GiKnapsack, GiReturnArrow, GiShield, GiSoundOff, GiSoundOn, GiSpellBook, GiSwordWound,
} from "react-icons/gi";

import useScrollLock from "@/lib/useScrollLock";
import SkillFx from "@/components/arena/SkillFx";
import {
    duck, Haptic, isMuted, setIntensity, setMuted, Sfx, startMusic, stopMusic, unlock,
} from "@/components/arena/arena-audio.js";
import { BATTLE_ITEMS, BEATS } from "@/lib/marketplace/arena-kit.js";

// Render an overlay into <body>. `position: fixed` is measured against the nearest ancestor with a transform,
// filter or animation — and the arena page sits inside `.reveal`, whose children get a fade-in-up ANIMATION.
// So a "full-screen" recap was being measured against the card it lives in: it laid out inline, scrolled with
// the page, and got cut off at the bottom. Same trap SpinWheel and MiningLaunch already portal around.
function Portal({ children }) {
    const [el] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
    useEffect(() => {
        if (!el) return undefined;
        document.body.appendChild(el);
        return () => { document.body.removeChild(el); };
    }, [el]);
    if (!el) return null;
    return createPortal(children, el);
}

// ── THE ARENA ────────────────────────────────────────────────────────────────────────────────────────────────
// Two screens. The LADDER — who is next, who is above them, and what beating them is worth — and the BOUT,
// which is two fighters facing each other and three buttons.
//
// The bout is stance-versus-stance, so every round is a read rather than a tap. The opponent's tell is printed
// on their card and is derived from their real build, so it is information, not flavour.
//
// Raw <img> everywhere: styled-jsx will not scope a rule aimed at a custom component (see check:styled-jsx).

const money = (n) => Number(n || 0).toLocaleString();

// How long their move sits on screen before the block ring starts. Long enough to actually read a name.
const TELEGRAPH_MS = 1100;

// How long a cast holds the screen before the blow lands. The declaration, the spotlight and the effect all
// play inside this window.
const CAST_MS = 1250;

// ── ANTICIPATION ─────────────────────────────────────────────────────────────────────────────────────────────
// Every command now has a WIND-UP: the fighter commits, draws back, and only then does the server resolve it.
// Before this, a plain Attack posted the instant you tapped and the reply repainted the bar — so the single
// most-pressed button in the game had no animation at all. You did not see a swing, you saw a number change.
//
// Anticipation is not decoration. It is the half of a hit that tells you a hit is coming, and without it the
// impact has nothing to land against. Lengths are per command: a swing is quick, a skill earns its cinematic.
const WINDUP = { attack: 420, skill: CAST_MS, guard: 300, item: 420 };

// How long a resolved beat owns the screen before anything else is allowed to start. This is what stops your
// own result and their incoming telegraph from being on screen at the same time — which they were, in the same
// hundred pixels, on every single exchange.
const RESULT_MS = 900;

// The freeze on contact. Every fighting game made since Street Fighter II holds both fighters still for a few
// frames at the moment of impact; it is most of why a hit reads as a hit rather than a position change.
const HITSTOP_MS = 110;

const ELEMENT_COLOR = {
    fire: "#ff6b3c", water: "#4aa3ff", earth: "#6ad07a", storm: "#ffd75e", light: "#fff0a8", shadow: "#b061ff",
};

// The sound of a cast, by archetype — so a spell and a hammer-blow are told apart with your eyes shut.
// The synthesis itself lives in arena-audio.js; this is only the mapping from a move to its voice.
function castSound(kind, element) {
    switch (kind) {
        case "spell": return Sfx.spell(element);
        case "execute": return Sfx.execute();
        case "gamble": return Sfx.gamble();
        case "surge": return Sfx.surge();
        case "ward": return Sfx.ward();
        default: return Sfx.strike();
    }
}

// One ability, said in as few words as possible: the number that matters, big, then the exceptions as chips.
// Four cards of near-identical paragraph — three of them opening with the same twenty words — is not something
// anybody reads in the middle of a fight.
function SkillFace({ ab, left = 0 }) {
    // A bout freezes its abilities into bout_json at the start, so a fight already running when the effect
    // format changed carries the OLD shape — and the card rendered its headline as nothing at all. Never let
    // this be blank: fall back through a string effect to the flavour blurb.
    const raw = ab.effect;
    const e = raw && typeof raw === "object" ? raw
        : { head: typeof raw === "string" && raw ? raw : (ab.blurb || "Damage"), sub: "", tags: [] };
    return (
        <span className="sk">
            <span className="sk-top">
                <b className="sk-name">{ab.name}</b>
                <span className={`sk-cd${left ? "" : " is-ready"}`}>{left ? `Ready in ${left}` : "Ready"}</span>
            </span>
            <span className="sk-head">
                <strong>{e.head}</strong>
                {e.sub ? <em>{e.sub}</em> : null}
            </span>
            {e.tags?.length ? (
                <span className="sk-tags">
                    {e.tags.map((t) => <i key={t.t} className={`sk-tag is-${t.k}`}>{t.t}</i>)}
                </span>
            ) : null}
            <span className="sk-foot">{ab.from} · cools {ab.cooldown || 0} turns</span>
        </span>
    );
}

// ── THE BAR ──────────────────────────────────────────────────────────────────────────────────────────────────
// A fighter's name, affinity and vigour, in a band that NEVER moves. This used to be stacked on top of the
// hero inside the stage — which meant the camera push-in during a cast scaled and slid it too, so on every
// single skill the two name plates drifted across each other and printed one name on top of the other. A HUD
// that reads the state of the fight cannot be part of the shot.
function FighterBar({ f, hp, maxHp, element, foe = false, active = false, shield = 0 }) {
    const frac = maxHp ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    // ── CHIP DAMAGE ── the trailing bar every fighting game uses: the hit registers instantly on the front
    // bar, and a paler bar behind it holds the old value for a beat before sliding down to meet it. That gap
    // IS the feedback — a bar that just jumps tells you the number changed but never how much it cost.
    const [ghost, setGhost] = useState(frac);
    // A HEAL should read as a heal, not as the bar quietly being longer than it was.
    const [healing, setHealing] = useState(false);
    const prevFrac = useRef(frac);
    useEffect(() => {
        if (frac > prevFrac.current) {
            setHealing(true);
            const h = setTimeout(() => setHealing(false), 620);
            prevFrac.current = frac;
            setGhost(frac);
            return () => clearTimeout(h);
        }
        prevFrac.current = frac;
        if (frac >= ghost) { setGhost(frac); return undefined; }
        const t = setTimeout(() => setGhost(frac), 360);
        return () => clearTimeout(t);
    }, [frac, ghost]);

    // Under a quarter is the danger band: the bar goes red and breathes, so you feel the fight turning before
    // you have read a number. It is also the threshold Execute fires under, so the two agree.
    const danger = frac > 0 && frac <= 0.35;
    const shieldPct = maxHp ? Math.min(1, shield / maxHp) * 100 : 0;

    return (
        <div className={`ar-bar${foe ? " is-foe" : ""}${active ? " is-active" : ""}${danger ? " is-danger" : ""}`
            + `${healing ? " is-healing" : ""}`}>
            <b className="ar-fname">
                {f?.name}
                {element ? (
                    <i className="ar-el-chip" style={{ "--el": ELEMENT_COLOR[element] || "#9aa0a6" }}>{element}</i>
                ) : null}
            </b>
            <span className="ar-hp">
                <u className="ar-hp-ghost" style={{ width: `${Math.max(ghost, frac) * 100}%` }} />
                <i style={{ width: `${frac * 100}%` }} />
                {/* A ward sits ON the bar as the slab of blue it will eat before your vigour does. It was a
                    chip of text elsewhere on screen, which is not where you are looking when a blow lands. */}
                {shieldPct > 0 ? <s className="ar-hp-shield" style={{ left: `${frac * 100}%`, width: `${shieldPct}%` }} /> : null}
            </span>
            <em className="ar-hpnum">
                {Math.max(0, hp)}<span>/{maxHp}</span>
                {shield > 0 ? <u>+{shield}</u> : null}
            </em>
        </div>
    );
}

// ── THE BODY ─────────────────────────────────────────────────────────────────────────────────────────────────
// The fighter itself, standing on the sand. Nothing here reads state — it only acts.
function FighterBody({ f, mirrored, hurt, lunge, down, wind = 0, brace = false, dim = false }) {
    const cls = `ar-fighter${mirrored ? " is-foe" : ""}${hurt ? " is-hurt" : ""}${lunge ? " is-lunge" : ""}`
        + `${down ? " is-down" : ""}${wind > 0 ? " is-wind" : ""}${brace ? " is-brace" : ""}${dim ? " is-dim" : ""}`;
    return (
        <div className={cls} style={wind > 0 ? { "--wind": `${wind}ms` } : undefined}>
            {/* The contact shadow is what puts a fighter ON the ground rather than in front of a wall. */}
            <span className="ar-shadow" aria-hidden="true" />
            {f?.sprite ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ar-hero" src={f.sprite} alt="" draggable="false" />
            ) : <span className="ar-hero ar-noface" aria-hidden="true" />}
        </div>
    );
}

// ── WHAT JUST CHANGED ────────────────────────────────────────────────────────────────────────────────────────
// A results modal, always, win or lose. The old card said "You beat Miles, +74 gold" and stopped — but your
// rung moved, your rank bar moved, your streak moved and the next opponent got harder. Winning therefore read
// like sliding backwards, which is the exact opposite of what a ladder is for. This recaps every one of those,
// and the rung counts UP in front of you rather than being a number you are expected to have memorised.
// Nothing in here may throw. A crash while this is mounted leaves the portaled overlay on screen with the
// body scroll-locked underneath it and no button anywhere — which is exactly the dark screen you get stuck on.
function Recap({ bout, busy, onClose }) {
    const r = bout?.recap && bout.recap.rank ? bout.recap : null;
    useScrollLock(true);   // the page behind must not scroll out from under the modal
    const up = r?.rankUp || null;
    const tint = up ? up.color : r?.rank?.color || (bout.won ? "#ffd75e" : "#ff6f7d");
    // Counts DOWN, because a better place is a smaller number.
    const [shown, setShown] = useState(r ? r.posFrom : 0);
    useEffect(() => {
        if (!r || shown <= r.posTo) return undefined;
        const t = setTimeout(() => setShown((n) => n - 1), 380);
        return () => clearTimeout(t);
    }, [r, shown]);

    // A bout finished before the recap existed still has to be dismissable.
    if (!r) {
        return (
            <div className={`ar-result ${bout.won ? "is-win" : "is-loss"}`}>
                <b>{bout.won ? `You beat ${bout.foe.name}` : `${bout.foe.name} put you down`}</b>
                <button type="button" className="ar-btn" disabled={busy} onClick={onClose}>Back to the ladder</button>
            </div>
        );
    }
    const pct = r.rank.span ? Math.min(100, (r.rank.into / r.rank.span) * 100) : 0;

    return (
        <Portal>
        {/* Tapping the backdrop leaves. Twice now this screen has ended up as a dark sheet with the card
            missing or off-view and LITERALLY nothing to press — the failure mode of a modal whose only exit
            lives inside the thing that failed. The backdrop and the corner button are outside the card on
            purpose, so they survive anything going wrong inside it. */}
        {/* ── POSITIONED INLINE, ON PURPOSE ──────────────────────────────────────────────────────────────
            This overlay has landed halfway down the document with no way to reach it more than once. Every
            time, the cause was the LAYOUT arriving from a class — a stylesheet that hadn't applied to a node
            portaled into <body>, or a rule edited out from under it. An overlay whose entire job is "cover the
            viewport" should not be able to fail at that because a class didn't land, so the six properties
            that make it a modal are inline and the class is left holding only decoration.
            Belt and braces: useScrollLock pins the body while this is open, so if it were ever laid out in the
            document flow again it would be unreachable — inline styles make that impossible rather than
            unlikely. */}
        <div className="ar-recap" role="dialog" aria-modal="true"
            style={{
                "--tint": tint,
                position: "fixed", inset: 0, zIndex: 10100,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 18, overflowY: "auto",
            }}
            onClick={() => { if (!busy) onClose(); }}>
            <button type="button" className="ar-recap-x" onClick={(e) => { e.stopPropagation(); onClose(); }}
                aria-label="Back to the ladder">Close</button>
            <div className="ar-recap-card" onClick={(e) => e.stopPropagation()}>
                <div className="ar-rays" aria-hidden="true">
                    {Array.from({ length: up ? 24 : 14 }).map((_, i) => (
                        <span key={i} style={{ "--a": `${i * (360 / (up ? 24 : 14))}deg`, animationDelay: `${(i % 6) * 0.05}s` }} />
                    ))}
                </div>

                <span className="ar-recap-kick">{bout.won ? "Victory" : "Defeated"}</span>
                <b className="ar-recap-title">{bout.won ? `You beat ${r.foe.name}` : `${r.foe.name} put you down`}</b>
                <p className="ar-recap-sub">{r.rounds} round{r.rounds === 1 ? "" : "s"} in the ring</p>

                {/* THE CLIMB — the number that was missing. */}
                <div className="ar-climb">
                    <span className="ar-climb-lab">Place</span>
                    <span className="ar-climb-num">
                        <i className="was">#{r.posFrom}</i>
                        {r.posTo !== r.posFrom ? <i className="arrow" aria-hidden="true" /> : null}
                        {r.posTo !== r.posFrom ? <i className="now">#{shown}</i> : null}
                    </span>
                    <span className="ar-climb-of">of {r.size}</span>
                </div>

                {up ? (
                    <div className="ar-recap-rankup">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={up.icon} alt="" draggable="false" />
                        <div>
                            <span>Rank up</span>
                            <b>{up.to}</b>
                            <em>You were {up.from}.</em>
                        </div>
                    </div>
                ) : (
                    <div className="ar-recap-rank">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.rank.icon} alt="" draggable="false" />
                        <div>
                            <b>{r.rank.name}</b>
                            <span className="ar-recap-bar"><i style={{ width: `${pct}%` }} /></span>
                            <em>{r.rank.next ? `${Math.max(0, r.rank.span - r.rank.into)} more to ${r.rank.next}` : "Top of the pack."}</em>
                        </div>
                    </div>
                )}

                <div className="ar-recap-rows">
                    {r.reward ? (
                        <>
                            <span><i>Gold</i><b>+{money(r.reward.gold)}</b></span>
                            <span><i>XP</i><b>+{money(r.reward.xp)}</b></span>
                            {r.reward.chest ? <span><i>Chest</i><b>{r.reward.chest}</b></span> : null}
                        </>
                    ) : <span className="ar-recap-none"><i>No purse</i><b>the rung holds</b></span>}
                    <span><i>Streak</i><b>{r.streak}{r.streak > 0 && r.streak >= r.bestStreak ? " · best" : ""}</b></span>
                    <span><i>Still above you</i><b>{Math.max(0, r.posTo - 1)}</b></span>
                </div>

                <button type="button" className="ar-btn ar-recap-go" disabled={busy} onClick={onClose}>
                    {bout.won ? "Next fighter" : "Back to the ladder"}
                </button>
            </div>
        </div>
        </Portal>
    );
}

export default function ArenaClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [shake, setShake] = useState(0);
    const [blockReady, setBlockReady] = useState(false);  // the telegraph has played; the block ring may start
    const [pop, setPop] = useState(null);         // floating damage number off the last landed blow
    const [wheel, setWheel] = useState(false);    // the element-wheel explainer
    const [fx, setFx] = useState(null);           // the particle burst for the beat that just resolved
    const [castDone, setCastDone] = useState(true); // the cast cinematic has finished; the blow may land
    const [menu, setMenu] = useState(null);       // which submenu is open: skill | item
    const [pending, setPending] = useState(null); // the command you committed to, mid wind-up
    const [clash, setClash] = useState(null);
    const [err, setErr] = useState(null);
    const [stop, setStop] = useState(false);      // hit-stop: the whole stage freezes for a moment on contact
    const [reading, setReading] = useState(false);// their move is named on screen and you are reading it
    const [muteOn, setMuteOn] = useState(false);
    const prev = useRef({ hp: null, foeHp: null, round: null });
    const resultAtRef = useRef(0);
    const setResultAt = (v) => { resultAtRef.current = v; };
    const logEnd = useRef(null);
    const ringRef = useRef(null);
    const [ringH, setRingH] = useState(null);

    // The stored mute preference, read after mount so the server and client markup agree.
    useEffect(() => { setMuteOn(isMuted()); }, []);


    // Every action goes through here, and it now says so when one fails. A tap that silently does nothing is
    // the worst outcome available: somebody sat on a finished bout tapping "Back to the ladder" with no
    // message, no spinner and no way out.
    const act = useCallback(async (action, extra = {}) => {
        if (busy) return;
        // Leaving a finished bout happens IMMEDIATELY, before the network is involved. The result is already
        // banked server-side, so there is no version of this where the player should wait — or, as happened,
        // sit on a dark overlay with nothing to press.
        if (action === "dismiss") setSt((p) => (p ? { ...p, bout: null } : p));
        setBusy(true); setErr(null);
        try {
            const r = await fetch("/api/marketplace/arena", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action, ...extra }),
            }).then((x) => x.json()).catch(() => null);

            if (r?.unlocked && action !== "dismiss") setSt(r);
            else if (action === "dismiss") {
                // LAST RESORT, and the important one. The bout is finished either way — the win is already
                // banked server-side — so if the request fails there is no reason to hold somebody hostage on
                // the result screen. Drop it locally and let the next read reconcile.
                setSt((prev) => (prev ? { ...prev, bout: null } : prev));
            } else {
                setErr(r?.error ? `That didn't go through (${r.error}). Try again.` : "That didn't go through. Try again.");
            }
            // The rank-up used to be its own overlay on a timer, stacked behind the result card. It lives
            // INSIDE the recap now — one modal, not two in sequence — so all that is left is the sting.
            if (r?.finished?.rankUp) setTimeout(() => Sfx.rankUp(), 1500);
        } finally { setBusy(false); }
    }, [busy]);

    const bout = st?.bout || null;

    // ── FIT THE FIGHT ON THE PHONE ───────────────────────────────────────────────────────────────────────
    // The ring was sized `min(74vh, 640px)`, which is a fraction of the WHOLE viewport — and this page puts
    // an announcement banner, the site nav and a tab strip above it, about 226px of chrome. Measured on real
    // device sizes with that chrome present, the command deck fell BELOW THE FOLD on every phone smaller than
    // a Pixel 7: iPhone SE by 52px, small Android by 33px, iPhone 14 by 6px. You had to scroll down, mid-bout,
    // to reach Attack. Most people play on a phone, so that is most people.
    //
    // So it is measured rather than assumed: scroll the ring up to where it will actually sit, then size it to
    // whatever is left below that. Re-run on resize and orientation change, because both move the answer.
    useEffect(() => {
        if (!bout) { setRingH(null); return undefined; }
        let raf = 0;
        // The site's nav is STICKY, so scrolling the ring to y=0 parks its first row underneath it — which
        // clipped "Round 4" and the affinity banner clean off the top. Measure whatever is pinned up there
        // rather than hard-coding a number, because the banner above the nav comes and goes.
        const stickyBottom = () => {
            let worst = 0;
            for (const el of document.body.querySelectorAll("header, nav, [class*='sticky'], [class*='Sticky']")) {
                const pos = getComputedStyle(el).position;
                if (pos !== "fixed" && pos !== "sticky") continue;
                const r = el.getBoundingClientRect();
                if (r.top <= 4 && r.height > 0 && r.bottom > worst) worst = r.bottom;
            }
            return worst;
        };
        const fit = () => {
            const el = ringRef.current;
            if (!el) return;
            const top = el.getBoundingClientRect().top;
            // 10px of breathing room so the deck is never flush against the bottom edge (or a home indicator).
            const avail = window.innerHeight - Math.max(top, 0) - 10;
            // Cap at the desktop size, floor low enough that a LANDSCAPE phone still fits — a 340px minimum
            // was a guess, and on 844x390 with a 132px sticky nav there are only 248px to be had, so the
            // "minimum" was itself pushing the deck off the bottom by 81px.
            setRingH(Math.round(Math.max(240, Math.min(640, avail))));
        };
        // Put the fight on screen first, THEN measure — otherwise we size against wherever the page happened
        // to be scrolled and get a different (wrong) answer every time.
        const place = () => {
            const el = ringRef.current;
            if (!el) return;
            const pad = stickyBottom();
            const y = window.scrollY + el.getBoundingClientRect().top - pad - 6;
            window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
        };
        place();
        raf = requestAnimationFrame(() => requestAnimationFrame(() => { place(); fit(); }));
        const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("orientationchange", onResize);
        };
    }, [Boolean(bout)]);

    // ── THE MUSIC ── it runs for exactly as long as a bout does, and its INTENSITY is your vigour. Losing is
    // audible before it is legible: the hats come in, then the tremolo strings, while you are still reading
    // the bar. Stopping on unmount matters as much as starting — a battle theme that follows you back to the
    // ladder is the single most irritating bug a game can ship.
    useEffect(() => {
        if (!bout || bout.over) { stopMusic(); return undefined; }
        startMusic();
        return () => stopMusic();
    }, [Boolean(bout), bout?.over]);
    useEffect(() => {
        if (!bout || !bout.maxHp) return;
        // Full vigour is a calm 0.3; on your last legs it is 1.
        setIntensity(0.3 + (1 - Math.max(0, Math.min(1, bout.hp / bout.maxHp))) * 0.7);
    }, [bout?.hp, bout?.maxHp, bout]);

    // Juice is derived by DIFFING the server's reply, never fired from the click — so a number can never float
    // for a hit the server did not deal.
    useEffect(() => {
        if (!bout) { prev.current = { hp: null, foeHp: null, round: null }; return undefined; }
        const p = prev.current;
        const last = bout.log?.length ? bout.log[bout.log.length - 1] : null;
        const isNew = last && bout.log.length !== p.round;
        const crit = Boolean(last?.crit);

        if (p.hp != null && bout.hp < p.hp) {
            // YOU TOOK IT. Weight is the fraction of your whole bar this blow cost, which is what decides how
            // hard everything hits: the shake, the buzz, and how low and long the sound is.
            const w = Math.min(1, (p.hp - bout.hp) / Math.max(1, bout.maxHp * 0.22));
            setShake(2 + (w > 0.7 ? 1 : 0));
            setStop(true);
            Sfx.hurt(w);
            Haptic.hurt(w);
            duck(0.35, 0.2);
        } else if (p.foeHp != null && bout.foeHp < p.foeHp) {
            // YOU LANDED IT.
            const w = Math.min(1, (p.foeHp - bout.foeHp) / Math.max(1, bout.foeMaxHp * 0.22));
            setShake(1 + (crit || w > 0.7 ? 1 : 0));
            setStop(true);
            if (crit) { Sfx.crit(w); Haptic.crit(); duck(0.5, 0.3); }
            else { Sfx.impact(w); Haptic.hit(w); }
        } else if (isNew && last.grade === "ward") { Sfx.ward(); Haptic.cast(); }
        else if (isNew && last.grade === "guard") { Sfx.guard(); Haptic.cast(); }
        else if (isNew && last.grade === "item") { (last.item === "poultice" ? Sfx.heal : Sfx.refresh)(); Haptic.cast(); }
        else if (isNew && last.damage === 0) { Sfx.block(0.4); }

        // SHOW the exchange. The MOVE, named, across the middle. The damage number is NOT repeated here — it
        // has its own floater over the fighter that took it, and printing both put two numbers on top of each
        // other a few pixels apart, which read as a rendering fault rather than emphasis.
        if (isNew) {
            setClash({
                grade: crit ? "crit" : last.grade,
                move: last.ability || (last.who === "you" ? "Strike" : `${bout.foe.name}'s swing`),
                mine: last.who === "you",
                crit,
            });
            setResultAt(Date.now());
        }
        prev.current = { hp: bout.hp, foeHp: bout.foeHp, round: bout.log?.length || 0 };
        const t = setTimeout(() => setShake(0), 360);
        const t2 = setTimeout(() => setClash(null), RESULT_MS - 80);
        const t3 = setTimeout(() => setStop(false), HITSTOP_MS);
        return () => { clearTimeout(t); clearTimeout(t2); clearTimeout(t3); };
    }, [bout]);

    // The end of a bout is its loudest moment, and it was a three-note blip.
    useEffect(() => {
        if (!bout?.over) return undefined;
        Sfx.ko();
        Haptic.ko();
        const t = setTimeout(() => {
            if (bout.won) { Sfx.victory(); Haptic.win(); } else { Sfx.defeat(); Haptic.lose(); }
        }, 700);
        return () => clearTimeout(t);
    }, [bout?.over, bout?.won]);
    // scrollIntoView walks UP the tree and scrolls whatever ancestor it must — including the window, which
    // is why tapping a command yanked the page down and left half the fight off screen. Scroll the log's own
    // box and nothing else. Same trap the dungeon log hit.
    useEffect(() => {
        const box = logEnd.current?.parentElement;
        if (box) box.scrollTop = box.scrollHeight;
    }, [bout?.log?.length]);

    // ── ONE OWNER FOR YOUR WHOLE BEAT ────────────────────────────────────────────────────────────────────
    // Committing a command starts a WIND-UP, and the blow lands when it finishes. Every command goes through
    // here, not just skills: the two effects this replaces sent a skill down a 1250ms cinematic and every
    // other command straight to the network on the same tick, which is why Attack — the button you press more
    // than all the others combined — had no animation whatsoever.
    useEffect(() => {
        if (!pending || !bout || bout.over || bout.turn !== "you") { setCastDone(true); return undefined; }
        const p2 = pending;
        const ms = WINDUP[p2.command] ?? 380;
        setCastDone(p2.command !== "skill");

        // The swing itself is heard at the start of the wind-up, not at the end — the sound of something being
        // drawn back is the cue that a blow is coming.
        if (p2.command === "skill") {
            const ab = (bout.me?.abilities || []).find((a) => a.id === p2.ability);
            castSound(ab?.kind, ab?.element);
        } else if (p2.command === "attack") Sfx.whoosh();
        Haptic.cast();

        const t = setTimeout(() => {
            setCastDone(true);
            setPending(null); setMenu(null);
            act("beat", { command: p2.command, ability: p2.ability || null, item: p2.item || null });
        }, ms);
        return () => clearTimeout(t);
    }, [pending, bout?.turn, bout?.beat, bout?.over]);

    // ── THEIR BEAT, IN THREE PARTS ───────────────────────────────────────────────────────────────────────
    // result → telegraph → blow. The middle step used to begin the instant your own swing resolved, so their
    // warning card and your result banner were on screen together, overlapping, every exchange. Holding the
    // result for RESULT_MS first is the whole fix: one thing is being said at a time.
    useEffect(() => {
        if (!bout || bout.over || bout.turn !== "them") { setBlockReady(true); setReading(false); return undefined; }
        setBlockReady(false);
        setReading(false);
        const t1 = setTimeout(() => {
            setReading(true);
            Sfx.warn();
            Haptic.warn();
        }, RESULT_MS);
        const t2 = setTimeout(() => setBlockReady(true), RESULT_MS + TELEGRAPH_MS);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [bout?.beat, bout?.turn, bout?.over]);

    // Their blow lands once you have had the telegraph to read.
    useEffect(() => {
        if (!bout || bout.over || bout.turn !== "them" || !blockReady || busy) return undefined;
        const t = setTimeout(() => act("beat", { command: "block" }), 140);
        return () => clearTimeout(t);
    }, [bout?.turn, bout?.beat, bout?.over, blockReady, busy, act]);

    // THE CAST'S OWN EFFECT — fired while the camera is on whoever is casting, before the blow. Pure
    // spectacle (the damage still resolves later, off the server), so it is keyed to the declaration rather
    // than to a log entry. The SOUND is not fired here: it belongs to the start of the wind-up, where the
    // gesture begins, and playing it in both places double-struck every cast.
    useEffect(() => {
        const mineCast = bout?.turn === "you" && pending?.command === "skill" && !castDone
            ? (bout.me?.abilities || []).find((a) => a.id === pending.ability) : null;
        const theirCast = bout?.turn === "them" && reading && bout?.incoming?.isAbility ? bout.incoming : null;
        const c = mineCast || theirCast;
        if (!c) return undefined;
        if (theirCast) castSound(c.kind, c.element);
        setFx({ key: `cast-${bout.beat}-${c.name}`, kind: c.kind || "strike", element: c.element,
            side: mineCast ? "left" : "right", crit: false, charge: true });
        const t = setTimeout(() => setFx(null), 900);
        return () => clearTimeout(t);
    }, [pending?.ability, pending?.command, castDone, reading, bout?.turn, bout?.beat]);

    // Particles fire off the RESOLVED beat, same as the damage number — so an effect can never play for a
    // hit the server did not deal.
    useEffect(() => {
        const l = bout?.log?.length ? bout.log[bout.log.length - 1] : null;
        if (!l) return undefined;
        const mineNow = l.who === "you";
        const kind = l.grade === "ward" ? "ward"
            : l.grade === "guard" ? "ward"
                : l.grade === "item" ? "heal"
                    : (mineNow && bout.me?.abilities?.find((a) => a.name === l.ability)?.kind) || "strike";
        setFx({
            key: bout.log.length,
            kind,
            element: mineNow ? bout.me?.element : bout.foe?.element,
            // The burst goes on whoever it HAPPENED TO. A ward, a guard and a poultice are all things you do
            // to yourself; a blow lands on the other one.
            side: ["ward", "heal"].includes(kind) || !mineNow ? "left" : "right",
            crit: Boolean(l.crit),
        });
        const t = setTimeout(() => setFx(null), 900);
        return () => clearTimeout(t);
    }, [bout?.log?.length]);

    // ── THE NUMBERS ── off the blow that actually landed, on the fighter that took it. A blocked or healed
    // amount is a number too: "you turned aside 9" was buried in grey log text under the buttons, so the one
    // thing your defensive choices actually bought you was the one thing never shown on the field.
    useEffect(() => {
        const l = bout?.log?.length ? bout.log[bout.log.length - 1] : null;
        if (!l) return undefined;
        const pops = [];
        if (l.damage > 0) {
            pops.push({ side: l.who === "you" ? "right" : "left", n: l.damage, kind: l.crit ? "crit" : "dmg" });
        }
        if (l.blocked > 0) pops.push({ side: "left", n: l.blocked, kind: "block", at: 120 });
        if (l.healed > 0) pops.push({ side: "left", n: l.healed, kind: "heal" });
        if (l.soaked > 0) pops.push({ side: "left", n: l.soaked, kind: "ward", at: 60 });
        if (!pops.length) return undefined;
        setPop({ id: bout.log.length, items: pops });
        const t = setTimeout(() => setPop(null), 1000);
        return () => clearTimeout(t);
    }, [bout?.log?.length]);

    if (!st?.unlocked) return null;

    // ── THE BOUT ──
    // Turn-based, and it looks it. A beat begins with a DECISION off a command deck — attack, skill, guard,
    // item — and only the commands that need execution raise the ring. Everything the fight needs now lives
    // inside the panel: both fighters, both vigour bars, cooldowns, the last beat and the deck itself. It used to
    // be a picture on top with the controls stacked underneath it like a form, which is why it read as a page
    // rather than a fight.
    if (bout) {
        const yourTurn = !bout.over && bout.turn === "you";
        // A CRIT takes the whole pane for a moment. This used to test for grade "flawless"/"perfect" — timing
        // grades that stopped existing when the ring was removed — so the screen flash, the oversized number
        // and the bigger particle burst were all unreachable code. Crits are rolled on the server now and the
        // blow itself says whether it was one.
        const lastLog = bout.log?.length ? bout.log[bout.log.length - 1] : null;
        const bigHit = Boolean(lastLog?.crit) && lastLog.damage > 0;
        // A crit of THEIRS flashes on your side of the ring and in their colour, or the biggest hit you have
        // ever taken would be celebrated in gold over the fighter who dealt it.
        const critTheirs = bigHit && lastLog.who === "them";
        // The move you just committed to, declared and lit BEFORE the ring — a skill announcing itself after
        // it has already resolved is a receipt, not a moment.
        const abilities = bout.me?.abilities || [];
        const casting = yourTurn && pending?.command === "skill" && !castDone
            ? (abilities.find((a) => a.id === pending.ability) || null)
            : null;
        // Their cast gets the same treatment — the telegraph window IS their cinematic, so a skill coming at
        // you is as legible as one you throw.
        const foeCasting = reading && bout.incoming?.isAbility ? bout.incoming : null;
        const last = bout.log?.length ? bout.log[bout.log.length - 1] : null;
        const haveItems = BATTLE_ITEMS.some((i) => (bout.items?.[i.id] || 0) > 0);
        const wards = abilities.filter((a) => a.defensive);
        return (
            <section className="card ar">
                <div ref={ringRef}
                    style={ringH ? { height: `${ringH}px`, minHeight: 0 } : undefined}
                    className={`ar-ring${shake ? ` is-shake-${shake}` : ""}${bigHit ? (critTheirs ? " is-crit is-crit-theirs" : " is-crit") : ""}`
                    + `${stop ? " is-stop" : ""}`
                    + `${casting ? " is-casting is-on-you" : ""}${foeCasting ? " is-casting is-on-them" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ar-ring-bg" src="/images/arena/arena-bg.webp" alt="" draggable="false" />
                    <span className="ar-ring-scrim" aria-hidden="true" />
                    {/* ── AMBIENT ── dust turning in the light over the sand. A turn-based fight spends most of
                        its life waiting for you to decide, and with nothing moving at all the ring read as a
                        screenshot rather than a place — filmed, it was eleven straight frames of two people
                        standing perfectly still. Nine spans on long staggered loops fix that for nothing. */}
                    <span className="ar-dust" aria-hidden="true">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <i key={i} style={{
                                left: `${8 + i * 10.5}%`,
                                "--dy": `${-70 - (i % 4) * 30}px`,
                                "--dx": `${(i % 3) * 14 - 14}px`,
                                animationDuration: `${7 + (i % 5) * 2.4}s`,
                                animationDelay: `${-(i * 1.7)}s`,
                                opacity: 0.18 + (i % 3) * 0.12,
                            }} />
                        ))}
                    </span>

                    {/* Everything that used to sit in paragraphs under the panel, now a strip across the top. */}
                    <div className="ar-hud">
                        <span className="ar-round">Round {bout.beat}</span>
                        {/* A fight with music needs a way to turn the music off, on the fight screen, without
                            hunting for it. The choice is remembered across bouts. */}
                        <button type="button" className={`ar-mute${muteOn ? " is-off" : ""}`}
                            aria-label={muteOn ? "Turn sound on" : "Turn sound off"}
                            aria-pressed={muteOn}
                            onClick={() => { const n = !muteOn; setMuteOn(n); setMuted(n); if (!n) { unlock(); Sfx.ui(); } }}>
                            {muteOn ? <GiSoundOff aria-hidden="true" /> : <GiSoundOn aria-hidden="true" />}
                        </button>
                        {bout.clash?.note ? (
                            <button type="button" className={`ar-tag ${bout.clash.mult > 1 ? "is-good" : "is-bad"}`}
                                onClick={() => setWheel((w) => !w)}>
                                {bout.clash.note} · {bout.clash.mult > 1 ? "+" : "\u2212"}{Math.round(Math.abs(bout.clash.mult - 1) * 100)}% <u>why?</u>
                            </button>
                        ) : null}
                        {bout.underdog > 1 ? (
                            <span className="ar-tag is-under">Outgunned · +{Math.round((bout.underdog - 1) * 100)}% swing</span>
                        ) : null}
                        {/* Who opened, and why. Speed comes off Ferocity, which until now did nothing in here. */}
                        {bout.beat <= 1 && bout.opener ? (
                            <span className={`ar-tag ${bout.opener === "you" ? "is-good" : "is-bad"}`}>
                                {bout.opener === "you" ? "You're faster — you open" : `${bout.foe.name} is faster — they open`}
                            </span>
                        ) : null}
                    </div>

                    {wheel ? (
                        <div className="ar-wheel" role="dialog" aria-label="Element wheel">
                            <b>Every element beats two others</b>
                            <div className="ar-wheel-rows">
                                {Object.entries(BEATS).map(([el, beats]) => (
                                    <span key={el} className={`ar-wheel-row${el === bout.me?.element ? " is-you" : ""}${el === bout.foe?.element ? " is-foe" : ""}`}>
                                        <i style={{ "--el": ELEMENT_COLOR[el] || "#9aa0a6" }}>{el}</i>
                                        <em>beats</em>
                                        {beats.map((b2) => <i key={b2} style={{ "--el": ELEMENT_COLOR[b2] || "#9aa0a6" }}>{b2}</i>)}
                                    </span>
                                ))}
                            </div>
                            <em className="ar-wheel-foot">
                                Answering their affinity is worth {Math.round(0.25 * 100)}% either way. Your element is
                                whatever most of your gear carries — re-attune a piece at the Forge to change it.
                            </em>
                            <button type="button" className="ar-back" onClick={() => setWheel(false)}>Close</button>
                        </div>
                    ) : null}

                    {/* THE DECLARATION. Name, art and element, centre screen, at the moment of the cast. */}
                    {casting || foeCasting ? (() => {
                        const c = casting || foeCasting;
                        return (
                            <div className={`ar-declare${foeCasting ? " is-theirs" : ""}`}
                                style={{ "--el": ELEMENT_COLOR[c.element] || (foeCasting ? "#6fd0ff" : "#ffd75e") }}>
                                {c.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={c.sprite} alt="" draggable="false" />
                                ) : null}
                                <b>{c.name}</b>
                                <em>{foeCasting ? bout.foe.name : c.from}</em>
                            </div>
                        );
                    })() : null}

                    {/* ── THE BARS ── outside the stage, so the camera never touches them. */}
                    <div className="ar-bars">
                        <FighterBar f={st.me} hp={bout.hp} maxHp={bout.maxHp} element={bout.me?.element || null}
                            active={yourTurn} shield={bout.shield || 0} />
                        <span className={`ar-turnmark${yourTurn ? " is-you" : " is-them"}`}>
                            {bout.over ? "—" : yourTurn ? "Your turn" : "Their turn"}
                        </span>
                        <FighterBar f={bout.foe} hp={bout.foeHp} maxHp={bout.foeMaxHp} element={bout.foe?.element || null}
                            foe active={!yourTurn && !bout.over} />
                    </div>

                    <div className="ar-floor">
                        <FighterBody f={st.me} hurt={shake >= 2} lunge={shake === 1}
                            down={bout.over && !bout.won}
                            wind={yourTurn && pending ? (WINDUP[pending.command] ?? 380) : 0}
                            brace={!bout.over && bout.turn === "them" && blockReady} />
                        <FighterBody f={bout.foe} mirrored hurt={shake === 1} lunge={shake >= 2}
                            down={bout.over && bout.won}
                            wind={!bout.over && bout.turn === "them" && reading ? TELEGRAPH_MS : 0}
                            brace={yourTurn && Boolean(pending)} />
                        {/* THE WARNING. Their whole move, named, before a ring appears. */}
                        {reading ? (
                            <div className="ar-incoming" aria-live="polite">
                                {bout.incoming?.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="ar-incoming-art" src={bout.incoming.sprite} alt="" draggable="false" />
                                ) : null}
                                <span className="ar-incoming-body">
                                    <em>{bout.foe.name} is coming with</em>
                                    <b>{bout.incoming?.name || "a heavy swing"}</b>
                                </span>
                            </div>
                        ) : null}

                        {pop ? pop.items.map((it, i) => (
                            <span key={`${pop.id}-${it.kind}-${i}`}
                                className={`ar-pop is-${it.side} is-${it.kind}`}
                                style={it.at ? { animationDelay: `${it.at}ms` } : undefined}
                                aria-hidden="true">
                                {it.kind === "heal" ? "+" : it.kind === "block" || it.kind === "ward" ? "" : "−"}
                                {it.n}
                                {it.kind === "block" ? <u>blocked</u> : it.kind === "ward" ? <u>soaked</u> : null}
                            </span>
                        )) : null}

                        {/* The burst itself, keyed on the beat so every cast replays from scratch. */}
                        {fx ? (
                            <SkillFx key={fx.key} kind={fx.kind} element={fx.element} side={fx.side} crit={fx.crit} />
                        ) : null}
                    </div>

                    {/* WHAT'S READY. Cooldowns, guard and surge live ON the field — combat state, not page
                        furniture. Focus was a single pool that made every skill interchangeable and could lock
                        you out of your own gear after one bad round; each skill keeps its own clock now. */}
                    {!bout.over ? (
                        <div className="ar-focus">
                            {/* QUICK CAST. The rail already showed what was ready; making it tappable turns
                                three taps (Skill, scroll, pick) into one for a move you already know. On their
                                beat a ward here braces instead — the same shortcut for the defensive half. */}
                            {(bout.me?.abilities || []).map((ab) => {
                                const left = bout.cd?.[ab.id] || 0;
                                const canCast = !left && !busy && !bout.over
                                    && (yourTurn ? !pending : (bout.turn === "them" && ab.defensive && reading));
                                const fire = () => {
                                    if (!canCast) return;
                                    setMenu(null);
                                    if (yourTurn) setPending({ command: "skill", ability: ab.id, label: ab.name, short: ab.name });
                                    else act("beat", { command: "defend", ability: ab.id });
                                };
                                return (
                                    <button key={ab.id} type="button"
                                        className={`ar-cdchip${left ? "" : " is-ready"}${canCast ? " is-live" : ""}`}
                                        style={{ "--el": ELEMENT_COLOR[ab.element] || "#9aa0a6" }}
                                        disabled={!canCast}
                                        title={left ? `${ab.name} — ready in ${left}` : ab.name}
                                        aria-label={left ? `${ab.name}, ready in ${left} turns` : `Cast ${ab.name}`}
                                        onClick={fire}>
                                        {ab.sprite ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={ab.sprite} alt="" draggable="false" />
                                        ) : null}
                                        {left ? <i>{left}</i> : null}
                                    </button>
                                );
                            })}
                            {bout.surge > 0 ? <span className="ar-buff is-surge">Sharpened &times;{bout.surge}</span> : null}

                            {/* ── WHAT THEY ARE CARRYING ──────────────────────────────────────────────────
                                You could see your own four moves and nothing at all of theirs, so every blow
                                that was not a plain swing arrived as a surprise. In a fight against another
                                member the two sides should be readable to the same standard.
                                These are deliberately NOT shown as cooldowns. A defender is asleep; the server
                                picks their move at random from this list rather than running a rotation, so
                                there is no cooldown to show and inventing one would be a lie you could plan
                                around. What is true is the SET — this is what can come at you. */}
                            {bout.foe?.abilities?.length ? (
                                <span className="ar-theirs">
                                    <i className="ar-theirs-lab">Theirs</i>
                                    {bout.foe.abilities.map((ab) => (
                                        <span key={ab.id} className="ar-theirchip"
                                            style={{ "--el": ELEMENT_COLOR[ab.element] || "#9aa0a6" }}
                                            title={`${ab.name} — ${ab.from}`}>
                                            {ab.sprite ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={ab.sprite} alt="" draggable="false" />
                                            ) : null}
                                        </span>
                                    ))}
                                </span>
                            ) : null}
                        </div>
                    ) : null}

                    {/* The moment it ends, called across the ring rather than dumped on a new screen. */}
                    {bout.over ? (
                        <div className={`ar-verdict ${bout.won ? "is-win" : "is-loss"}`}>
                            <b>{bout.won ? "Down" : "You fall"}</b>
                            {/* Present whether or not the recap modal renders. A finished fight must always
                                have a visible way back to the ladder somewhere on the screen. */}
                            <button type="button" className="ar-btn is-sm" disabled={busy}
                                onClick={() => act("dismiss")}>Back to the ladder</button>
                        </div>
                    ) : null}

                    {/* The MOVE that just landed, named across the ring. The damage is deliberately NOT
                        repeated here — it floats over the fighter that took it, and printing it in both places
                        put two copies of the same number a few pixels apart, which read as a rendering fault. */}
                    {clash ? (
                        <div className={`ar-grade is-${clash.grade}${clash.mine ? "" : " is-theirs"}${clash.crit ? " is-crit" : ""}`}
                            aria-hidden="true">
                            {clash.crit ? <b className="ar-critword">Critical</b> : null}
                            <em className="ar-move">{clash.move}</em>
                        </div>
                    ) : null}

                    {last && !bout.over ? <p className="ar-beat">{last.text}</p> : null}

                    {/* ── THE COMMAND DECK ── four commands, two of which raise the ring and two of which spend
                        the turn outright. That is the decision: swing at them, or fix yourself and let them hit
                        you once. A menu of four ways to attack would not be a decision at all. */}
                    {!bout.over ? (
                        <div className="ar-deck">
                            {bout.turn === "them" ? (
                                <>
                                    <p className="ar-prompt is-def">
                                        {reading ? <><b>{bout.incoming?.name || "a heavy swing"}</b> — incoming</> : <>You brace&hellip;</>}
                                    </p>
                                    {/* Wards are playable HERE, against the blow you can see coming — and they
                                        don't cost you the beat, you still block afterwards. */}
                                    {reading && wards.length ? (
                                        <div className="ar-wards">
                                            {wards.map((w) => {
                                                const wl = bout.cd?.[w.id] || 0;
                                                return (
                                                    <button key={w.id} type="button"
                                                        className={`ar-ward${wl ? " is-poor" : ""}`}
                                                        disabled={Boolean(wl) || busy}
                                                        onClick={() => act("beat", { command: "defend", ability: w.id })}>
                                                        <GiShield aria-hidden="true" />
                                                        <span>{w.name}</span>
                                                        <u>{wl ? `Ready in ${wl}` : "Brace"}</u>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </>
                            ) : pending ? (
                                <p className="ar-prompt is-atk">{pending.label}&hellip;</p>
                            ) : menu === "skill" ? (
                                <div className="ar-sub">
                                    {abilities.map((ab) => {
                                        const left = bout.cd?.[ab.id] || 0;
                                        const afford = left === 0;
                                        return (
                                            <button key={ab.id} type="button"
                                                className={`ar-pick${afford ? "" : " is-poor"}`}
                                                style={{ "--el": ELEMENT_COLOR[ab.element] || "#9aa0a6" }}
                                                disabled={!afford || busy}
                                                onClick={() => setPending({ command: "skill", ability: ab.id, label: ab.name, short: ab.name })}>
                                                {ab.sprite ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img className="ar-pick-art" src={ab.sprite} alt="" draggable="false" />
                                                ) : <span className="ar-pick-art ar-pick-none"><GiSwordWound /></span>}
                                                <SkillFace ab={ab} left={left} />
                                            </button>
                                        );
                                    })}
                                    <button type="button" className="ar-back" onClick={() => setMenu(null)}>
                                        <GiReturnArrow /> Back
                                    </button>
                                </div>
                            ) : menu === "item" ? (
                                <div className="ar-sub">
                                    {BATTLE_ITEMS.map((it) => {
                                        const left = bout.items?.[it.id] || 0;
                                        return (
                                            <button key={it.id} type="button" className={`ar-pick${left ? "" : " is-poor"}`}
                                                style={{ "--el": "#8bf0b4" }} disabled={!left || busy}
                                                onClick={() => { unlock(); setMenu(null); setPending({ command: "item", item: it.id, label: it.name }); }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img className="ar-pick-art" src={it.sprite} alt="" draggable="false" />
                                                <span className="ar-pick-body">
                                                    <b>{it.name}</b>
                                                    <em>{it.blurb}</em>
                                                    <i>Spends your turn</i>
                                                </span>
                                                <u className="ar-pick-cost">&times;{left}</u>
                                            </button>
                                        );
                                    })}
                                    <button type="button" className="ar-back" onClick={() => setMenu(null)}>
                                        <GiReturnArrow /> Back
                                    </button>
                                </div>
                            ) : (
                                <div className="ar-cmds">
                                    <button type="button" className="ar-cmd is-atk" disabled={busy}
                                        onClick={() => { unlock(); Sfx.ui(); Haptic.tap(); setPending({ command: "attack", label: "Attack", short: "Strike" }); }}>
                                        <GiCrossedSwords aria-hidden="true" /><span>Attack</span>
                                    </button>
                                    <button type="button" className="ar-cmd is-skill" disabled={busy || !abilities.length}
                                        onClick={() => { unlock(); Sfx.ui(); setMenu("skill"); }}>
                                        <GiSpellBook aria-hidden="true" /><span>Skill</span>
                                    </button>
                                    <button type="button" className="ar-cmd is-guard" disabled={busy}
                                        onClick={() => { unlock(); Sfx.ui(); Haptic.tap(); setPending({ command: "guard", label: "Guard" }); }}>
                                        <GiShield aria-hidden="true" /><span>Guard</span>
                                    </button>
                                    <button type="button" className="ar-cmd is-item" disabled={busy || !haveItems}
                                        onClick={() => { unlock(); Sfx.ui(); setMenu("item"); }}>
                                        <GiKnapsack aria-hidden="true" /><span>Item</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {/* THE WAY OUT. This render was dropped in the rock-paper-scissors rewrite, and nothing caught
                    it: the component still existed, the dismiss action still existed, clearBout still existed —
                    only the one line that mounts it was gone. So every bout since then ended on a dead screen
                    with no button, and the only escape was reloading the page. */}
                {bout.over ? <Recap bout={bout} busy={busy} onClose={() => act("dismiss")} /> : null}

                {err ? <p className="ar-err">{err}</p> : null}
                {bout.log?.length ? (
                    <div className="ar-log">
                        {bout.log.slice(-8).map((l, i) => (
                            <div key={i} className="ar-line"><b>{l.beat}</b> {l.text}</div>
                        ))}
                        <div ref={logEnd} />
                    </div>
                ) : null}
                <Styles />
            </section>
        );
    }

    // ── THE LADDER ──
    return (
        <section className="card ar">
            {/* what happened while you were asleep */}
            {st.away?.length ? (
                <AwayReport rows={st.away} onClose={() => act("seen")} />
            ) : null}

            <div className="ar-badge" style={{ "--rank": st.rank?.color || "#9aa0a6" }}>
                {st.rank?.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ar-insignia" src={st.rank.icon} alt="" draggable="false" />
                ) : null}
                <div className="ar-badge-body">
                    <span className="ar-badge-kick">The Arena</span>
                    <b className="ar-rankname">{st.rank?.name}</b>
                    <span className="ar-standing">
                        <b>#{st.position}</b> of {st.size} · best <b>#{st.stats.best}</b>
                    </span>
                    <span className="ar-tonext-label">
                        {st.fightsLeft} of {st.fightsPerDay} challenges left today
                    </span>
                </div>
            </div>

            {/* WHAT YOU FIGHT WITH — read straight off your gear, so the Forge and the ring are the same
                conversation. Every ability names the piece it came from. */}
            <div className="ar-mykit">
                <span className="ar-up-head">
                    Your kit{st.me?.element ? <em className="ar-el" style={{ "--el": ELEMENT_COLOR[st.me.element] }}>{st.me.element}</em> : null}
                </span>
                <div className="ar-kit">
                    {(st.me?.abilities || []).map((ab) => (
                        <div key={ab.id} className="ar-ability is-static" style={{ "--el": ELEMENT_COLOR[ab.element] || "#9aa0a6" }}>
                            <span className="ar-ability-head">
                                {ab.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="ar-ability-art" src={ab.sprite} alt="" draggable="false" />
                                ) : null}
                                <SkillFace ab={ab} />
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* the podium — the reason to hold a spot overnight */}
            <div className="ar-podium">
                <span className="ar-podium-lab">Top three at the end of the day take a chest</span>
                <div className="ar-podium-row">
                    {st.podium?.map((p) => (
                        <span key={p.place} className={`ar-podium-slot is-${p.chest}`}>
                            <i>#{p.place}</i>{p.chest}
                        </span>
                    ))}
                </div>
            </div>

            {/* WHO YOU CAN TAKE A SPOT FROM */}
            <div className="ar-targets">
                <span className="ar-up-head">Challenge for a spot</span>
                {st.targets?.length ? st.targets.map((o) => (
                    <div key={o.id} className="ar-target">
                        <span className="ar-target-pos">#{o.position}</span>
                        <div className="ar-portrait is-tiny">
                            {o.sprite ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={o.sprite} alt="" draggable="false" style={{ transform: "scaleX(-1)" }} />
                            ) : <span className="ar-noface" aria-hidden="true" />}
                        </div>
                        <div className="ar-target-body">
                            <b>{o.name}</b>
                            {/* This said "Lv 34 · 241 vigour · {o.tell}" — and `tell` is never set by the
                                server, on this row or anywhere else, so every opponent on the ladder rendered
                                with a trailing separator and nothing after it. Their record is real, free
                                (standings already selects it) and the thing you actually want to know about
                                somebody before you spend one of ten daily challenges on them. */}
                            <em>Lv {o.level} · {o.vigour} vigour · {o.wins ?? 0}W&ndash;{o.losses ?? 0}L</em>
                        </div>
                        <div className="ar-target-go">
                            <span className="ar-prize">+{money(o.reward.gold)}</span>
                            <button type="button" className="ar-btn is-sm" disabled={busy || st.fightsLeft <= 0}
                                onClick={() => act("start", { target: o.id })}>
                                {st.fightsLeft <= 0 ? "Spent" : "Challenge"}
                            </button>
                        </div>
                    </div>
                )) : (
                    <p className="ar-none">Nobody above you within reach. You are at the top of the Den.</p>
                )}
            </div>

            {st.board?.length ? (
                <div className="ar-board">
                    <span className="ar-up-head">The top of the Den</span>
                    {st.board.map((r) => (
                        <div key={r.position} className={`ar-up-row${r.you ? " is-you" : ""}`}>
                            <span className="ar-up-rung">#{r.position}</span>
                            <span className="ar-up-name">{r.name}{r.you ? " · you" : ""}</span>
                            <span className="ar-up-lvl">Lv {r.level}</span>
                        </div>
                    ))}
                </div>
            ) : null}
            <Styles />
        </section>
    );
}

// ── WHAT HAPPENED WHILE YOU WERE AWAY ────────────────────────────────────────────────────────────────────────
// You get fought while you are asleep. Without this a member simply finds their place changed and no
// explanation anywhere in the game — so this is shown once, on the visit after it happened, and dismissing it
// stamps last_seen_at.
function AwayReport({ rows, onClose }) {
    useScrollLock(true);
    return (
        <Portal>
            <div className="ar-away" role="dialog" aria-modal="true">
                <div className="ar-away-card">
                    <span className="ar-recap-kick">While you were away</span>
                    <b className="ar-recap-title">{rows.length} bout{rows.length === 1 ? "" : "s"}</b>
                    <div className="ar-away-list">
                        {rows.map((r, i) => (
                            <div key={i} className={`ar-away-row ${r.won ? "is-win" : "is-loss"}`}>
                                <div className="ar-portrait is-tiny">
                                    {r.them.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={r.them.sprite} alt="" draggable="false" />
                                    ) : <span className="ar-noface" aria-hidden="true" />}
                                </div>
                                <span className="ar-away-text">
                                    <b>{r.them.name}</b>
                                    <em>{r.defending
                                        ? (r.won ? "challenged you and lost" : "took your spot")
                                        : (r.won ? "you took their spot" : "you challenged and lost")}</em>
                                </span>
                                <span className="ar-away-pos">#{r.myPos}</span>
                            </div>
                        ))}
                    </div>
                    <button type="button" className="ar-btn ar-recap-go" onClick={onClose}>Got it</button>
                </div>
            </div>
        </Portal>
    );
}

function Styles() {
    return (
        <style jsx global>{`
            /* ── the rank badge ── */
            .ar-badge { display: flex; align-items: center; gap: 15px; padding: 15px 16px; border-radius: 17px;
                background: linear-gradient(145deg, color-mix(in srgb, var(--rank) 24%, transparent), rgba(255,255,255,0.02) 66%), rgba(10,8,14,0.5);
                border: 1px solid color-mix(in srgb, var(--rank) 50%, transparent);
                box-shadow: 0 14px 34px -20px var(--rank); margin-bottom: 20px; }
            .ar-insignia { flex: 0 0 auto; width: 78px; height: 78px; object-fit: contain;
                filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--rank) 60%, transparent));
                animation: arBadgeIn .5s cubic-bezier(.2,1.4,.35,1) both; }
            @keyframes arBadgeIn { from { opacity: 0; transform: scale(.7) rotate(-8deg) } to { opacity: 1; transform: none } }
            .ar-badge-body { min-width: 0; flex: 1; }
            .ar-badge-kick { font-size: 9.5px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; color: #8a939d; }
            .ar-rankname { display: block; margin: 1px 0 3px; font-size: 1.5rem; font-weight: 900; line-height: 1.05;
                color: color-mix(in srgb, var(--rank) 72%, white); text-shadow: 0 0 26px color-mix(in srgb, var(--rank) 55%, transparent); }
            .ar-standing { display: block; font-size: 12px; color: #a4adb7; }
            .ar-standing b { color: #fff; font-variant-numeric: tabular-nums; }
            .ar-tonext { display: block; height: 6px; margin: 9px 0 5px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,0.45); }
            .ar-tonext > i { display: block; height: 100%; border-radius: 999px; background: var(--rank);
                box-shadow: 0 0 12px -2px var(--rank); transition: width .7s cubic-bezier(.2,.8,.3,1); }
            .ar-tonext-label { display: block; font-size: 11px; color: #8a939d; }
            .ar-tonext-label b { color: color-mix(in srgb, var(--rank) 70%, white); }

            /* ── the buttons ── */
            /* Their own, not .dlv-btn: that class lives inside DelveClient's scoped <style jsx>, so borrowing
               it here produced a bare browser-default button in the middle of the screen. */
            .ar-btn { padding: 12px 22px; border-radius: 12px; border: none; cursor: pointer;
                font-size: 0.95rem; font-weight: 900; color: #2a0d10;
                background: linear-gradient(180deg, #ffc4ca, #ff6f7d);
                box-shadow: 0 4px 0 #b3414f, 0 10px 26px -10px rgba(255,111,125,0.95);
                transition: transform .12s ease; }
            .ar-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #b3414f; }
            .ar-btn:disabled { opacity: .5; box-shadow: none; }

            /* ── rank-up ── */
            .ar-rankup { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 20px;
                background: rgba(6,4,10,0.88); backdrop-filter: blur(4px); }
            .ar-rankup-card { position: relative; overflow: hidden; width: min(360px, 100%); padding: 26px 22px 20px;
                border-radius: 22px; text-align: center; background: linear-gradient(180deg, #221a26, #120e15);
                border: 2px solid var(--rank); box-shadow: 0 24px 70px rgba(0,0,0,0.8), 0 0 70px -10px var(--rank);
                animation: arCardIn .45s cubic-bezier(.2,1.5,.35,1) both; }
            /* ── NAME THIS ONE THING ONLY ────────────────────────────────────────────────────────────────
               This was called arPop, and so was the DAMAGE NUMBER's keyframe 460 lines further down.
               @keyframes are global by name and the last definition wins outright, so every card here was
               silently animating on the damage number's curve — which ends at opacity 0, 46px in the air.
               With fill-mode "both" they held that final frame, so the victory recap, the rank-up and the
               away report were invisible: a dark backdrop with nothing on it.
               That is the "dark sheet with the card missing and LITERALLY nothing to press" this file has
               apologised for twice. The Close button and the inline position:fixed were both added as
               workarounds for it. This is the cause. */
            @keyframes arCardIn { from { opacity: 0; transform: scale(.82) translateY(16px) } to { opacity: 1; transform: none } }
            .ar-rays { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
            .ar-rays span { position: absolute; width: 3px; height: 52px; border-radius: 2px; transform-origin: 50% 0;
                background: linear-gradient(var(--rank), transparent); animation: arRay 1.5s cubic-bezier(.15,.7,.3,1) both; }
            @keyframes arRay { from { opacity: 1; transform: rotate(var(--a)) translateY(0) scaleY(.4) }
                to { opacity: 0; transform: rotate(var(--a)) translateY(-190px) scaleY(1) } }
            .ar-rankup-art { position: relative; width: 116px; height: 116px; object-fit: contain;
                filter: drop-shadow(0 6px 20px color-mix(in srgb, var(--rank) 70%, transparent));
                animation: arRise .7s cubic-bezier(.2,1.35,.35,1) both; }
            @keyframes arRise { from { opacity: 0; transform: scale(.4) translateY(26px) rotate(-12deg) } to { opacity: 1; transform: none } }
            .ar-rankup-kick { display: block; margin-top: 8px; font-size: 10px; font-weight: 900; letter-spacing: .22em;
                text-transform: uppercase; color: #8a939d; }
            .ar-rankup-name { display: block; margin: 2px 0 6px; font-size: 2rem; font-weight: 900; line-height: 1.05;
                color: color-mix(in srgb, var(--rank) 74%, white); text-shadow: 0 0 34px color-mix(in srgb, var(--rank) 60%, transparent); }
            .ar-rankup-from { margin: 0 0 16px; font-size: 12.5px; color: #a99fc4; }
            .ar-stats { display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0 14px; font-size: 11.5px; color: #8a939d; }
            .ar-stats b { color: #ffd75e; font-variant-numeric: tabular-nums; }

            .ar-portrait { width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
                background: radial-gradient(circle at 38% 30%, rgba(255,255,255,0.12), rgba(8,6,12,0.92));
                border: 2px solid rgba(255,255,255,0.14); }
            .ar-portrait.is-big { width: 84px; height: 84px; flex: 0 0 auto; }
            .ar-portrait.is-tiny { width: 30px; height: 30px; border-width: 1px; flex: 0 0 auto; }
            .ar-portrait img { width: 100%; height: 100%; object-fit: contain; }
            .ar-noface { width: 60%; height: 60%; border-radius: 50%; background: rgba(255,255,255,0.1); }

            .ar-next { padding: 14px; border-radius: 15px; background: linear-gradient(150deg, rgba(255,111,125,0.16), rgba(255,255,255,0.02) 66%);
                border: 1px solid rgba(255,111,125,0.42); }
            .ar-next-kicker { font-size: 9.5px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; color: #ffb0b8; }
            .ar-next-row { display: flex; align-items: center; gap: 13px; margin-top: 8px; }
            .ar-next-body b { display: block; font-size: 1.05rem; font-weight: 900; color: #fff; }
            .ar-next-meta { display: block; margin-top: 2px; font-size: 11.5px; color: #9aa2ab; }
            .ar-next-tell { display: block; margin-top: 5px; font-size: 12px; font-style: italic; color: #ffd0a0; }
            .ar-next-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 13px; }
            .ar-prize { font-size: 12px; font-weight: 900; color: #ffd75e; }
            .ar-cleared { padding: 16px; border-radius: 15px; text-align: center; background: rgba(255,215,94,0.09); border: 1px solid rgba(255,215,94,0.4); }
            .ar-cleared b { color: #ffe28a; }
            .ar-cleared p { margin: 6px 0 0; font-size: 12.5px; color: #c2cad3; }

            .ar-up, .ar-board { margin-top: 16px; display: grid; gap: 5px; }
            .ar-up-head { font-size: 10px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; color: #7f8790; }
            .ar-up-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,0.035); }
            .ar-up-rung { min-width: 22px; font-size: 11px; font-weight: 900; color: #6f7883; font-variant-numeric: tabular-nums; }
            .ar-up-name { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 800; color: #d6dde4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-up-lvl { font-size: 11px; color: #8a939d; white-space: nowrap; }

            /* ── the ring ── */
            /* The gradient is a FALLBACK, not decoration: until the background image lands the stage is
               otherwise pure black, which is what the first frames of every filmed bout looked like. A warm
               dark floor means a slow load degrades to "dim arena" rather than "broken". */
            .ar-ring { position: relative; border-radius: 16px; overflow: hidden;
                height: min(74vh, 640px); min-height: 420px;
                display: flex; flex-direction: column;
                background: linear-gradient(180deg, #150f0c 0%, #1e1410 52%, #33210f 100%);
                border: 1px solid rgba(255,190,110,0.3); }
            .ar-ring.is-shake-1 { animation: arShake .2s ease-out; }
            .ar-ring.is-shake-2 { animation: arShake .3s ease-out; }
            @keyframes arShake { 0%,100% { transform: translate(0,0) } 28% { transform: translate(-6px,3px) } 62% { transform: translate(6px,-3px) } }
            /* ── FRAMING ── the background is an arena whose lit sand oval sits in the bottom third of the
               image. Centred, that oval landed off the bottom of a portrait panel and both fighters ended up
               standing against the STANDS — which is why they read as cut-outs pasted on a wall. Biasing the
               crop downward puts the sand under their feet, where a fight happens. */
            /* The panel is PORTRAIT and the painting is landscape, so object-fit: cover crops a narrow vertical
               slice — and the centre slice of this particular arena is its darkest part, which is how the
               stage ended up looking like a black rectangle with two men in it. Biased left and scaled up so
               the lit sand sits under their feet and the arches read above them. */
            .ar-ring-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                object-position: 38% 100%; transform: scale(1.25); transform-origin: 50% 100%; }
            /* Two washes, not one: a vignette that pushes the eye to the middle, and a warm floor glow that
               makes the sand read as lit ground rather than more brown. Kept LIGHT — the first cut of this
               stacked a scrim, a bottom gradient and a crop that between them turned a rather good painting
               of an arena into a black rectangle. The background is the only thing telling you where you are. */
            .ar-ring-scrim { position: absolute; inset: 0;
                background:
                    radial-gradient(58% 30% at 50% 84%, rgba(255,186,92,0.18), transparent 72%),
                    radial-gradient(95% 80% at 50% 56%, transparent, rgba(10,6,4,0.5)); }
            /* ── LANDSCAPE PHONE ── a short, wide viewport leaves ~250px for the whole ring, so every band
               that is merely nice-to-have gives its pixels back to the stage. The fighters and the deck are
               what you cannot do without. */
            @media (orientation: landscape) and (max-height: 480px) {
                .ar-hud { padding: 4px 8px 0; gap: 4px; }
                .ar-hud .ar-tag, .ar-round { font-size: 9px; }
                .ar-bars { padding: 2px 10px 0; }
                .ar-hpnum { font-size: 9px; }
                .ar-focus { padding: 2px 10px 0; gap: 6px; }
                .ar-cdchip { width: 32px; height: 32px; }
                .ar-cdchip img { width: 21px; height: 21px; }
                .ar-deck { min-height: 66px; padding: 4px 8px max(4px, env(safe-area-inset-bottom)); }
                .ar-cmd { padding: 6px 4px; font-size: 10px; }
                .ar-cmd :global(svg) { width: 16px; height: 16px; }
                .ar-beat { display: none; }   /* the log line under the deck; the log itself is still below */
                .ar-dust { display: none; }
            }

            /* ── DUST ── the only thing on screen while a turn-based fight waits for you. */
            .ar-dust { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
            .ar-dust i { position: absolute; bottom: 16%; width: 3px; height: 3px; border-radius: 50%;
                background: #ffe0b0; filter: blur(.4px);
                animation-name: arDust; animation-timing-function: linear; animation-iteration-count: infinite; }
            @keyframes arDust {
                0% { transform: translate(0, 0) scale(.6); opacity: 0 }
                18% { opacity: 1 }
                80% { opacity: .5 }
                100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0 } }

            /* Just enough of a floor band for the deck to sit against. */
            .ar-ring::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 26%;
                z-index: 1; pointer-events: none;
                background: linear-gradient(180deg, transparent, rgba(8,5,4,0.42) 70%, rgba(6,4,3,0.62)); }
            .ar-hud { position: relative; z-index: 5; flex: 0 0 auto; padding: 8px 8px 0; display: flex;
                align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; pointer-events: none; }
            .ar-round { font-size: 10px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase;
                color: #ffe0b0; text-shadow: 0 2px 8px #000; }
            /* The affinity read and the underdog bonus used to be paragraphs UNDER the panel, where they were
               page copy rather than fight state. Same words, on the field, where they apply. */
            .ar-tag { font-size: 9.5px; font-weight: 900; padding: 2px 8px; border-radius: 999px;
                background: rgba(8,6,10,0.66); border: 1px solid rgba(255,255,255,0.16); backdrop-filter: blur(2px); }
            .ar-tag.is-good { color: #8bf0b4; border-color: rgba(139,240,180,.45); }
            .ar-tag.is-bad { color: #ff9f9f; border-color: rgba(255,159,159,.45); }
            .ar-tag.is-under { color: #ffd75e; border-color: rgba(255,215,94,.5); }
            .ar-hud .ar-tag { pointer-events: auto; cursor: pointer; min-height: 28px; padding: 6px 10px;
                display: inline-flex; align-items: center; }
            .ar-hud .ar-tag::after { content: ""; position: absolute; inset: -7px; }
            .ar-hud .ar-tag { position: relative; }
            .ar-tag u { text-decoration: none; opacity: .65; }
            .ar-el-chip { font-style: normal; margin-left: 6px; padding: 1px 6px; border-radius: 999px;
                font-size: 8.5px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
                color: var(--el); border: 1px solid color-mix(in srgb, var(--el) 55%, transparent); }

            /* ── THE RULE ── one tap off the banner that announces the result. */
            .ar-wheel { position: absolute; inset: 8px 8px auto; z-index: 24; padding: 12px 13px; border-radius: 14px;
                background: rgba(8,6,10,0.95); border: 1px solid rgba(255,190,110,0.4);
                box-shadow: 0 20px 50px -18px #000; display: grid; gap: 8px; }
            .ar-wheel > b { font-size: 12px; color: #fff; }
            .ar-wheel-rows { display: grid; gap: 4px; }
            .ar-wheel-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
            .ar-wheel-row i { font-style: normal; font-size: 9.5px; font-weight: 900; text-transform: uppercase;
                letter-spacing: .06em; color: var(--el); padding: 1px 7px; border-radius: 999px;
                border: 1px solid color-mix(in srgb, var(--el) 45%, transparent); }
            .ar-wheel-row em { font-style: normal; font-size: 9.5px; color: #7f8790; }
            .ar-wheel-row.is-you > i:first-child { box-shadow: 0 0 0 1px #fff inset; }
            .ar-wheel-row.is-foe > i:first-child { box-shadow: 0 0 0 1px #ff9f9f inset; }
            .ar-wheel-foot { font-style: normal; font-size: 10.5px; line-height: 1.45; color: #9aa2ab; }
            /* Both fighters stand on the same line of sand, facing each other. */
            /* Takes every pixel the other bands don't want. min-height:0 is load-bearing — without it a flex item
               refuses to shrink below its content and the deck gets pushed off the bottom. */
            /* ── STAGING, WITH DEPTH ─────────────────────────────────────────────────────────────────────
               Two equal columns is the obvious layout and it is the wrong one. A member sprite is SQUARE, so
               object-fit: contain in a half-width column draws it at half the panel wide and half the panel
               TALL — on a phone that is a 145px character marooned in a 349px stage, which is exactly why the
               ring read as mostly empty arena wall.
               So the fighters are placed rather than gridded: each is wider than half, they overlap slightly
               in the middle, and the opponent sits a little smaller and a little further up the sand. That
               reads as distance rather than as a mistake, and it buys both of them about 45% more size. */
            .ar-floor { position: relative; z-index: 2; flex: 1 1 auto; min-height: 0;
                transition: transform .45s cubic-bezier(.2,.9,.3,1); }
            /* Sized so the two of them meet near the middle without occluding each other, and so the lit sand
               still reads underneath. Wider than this and they crowd; narrower and they are back to being two
               small figures with an empty arena between them. */
            .ar-fighter { position: absolute; bottom: 0; width: 54%; height: 100%; }
            .ar-floor > .ar-fighter:first-of-type { left: -3%; z-index: 3; }
            /* Smaller AND standing further up the sand — the two cues together read as distance. Equal size on
               the same baseline just reads as two of the same thing. */
            .ar-floor > .ar-fighter.is-foe { right: -3%; z-index: 2; width: 47%; bottom: 8%; }
            .ar-floor > .ar-fighter.is-foe .ar-shadow { width: min(70%, 120px); height: 13px; }
            /* ── SPOTLIGHT ── the floor pushes in on the caster and everything else dims out of the way. */
/* The camera pushes toward whoever is casting and everything else falls away. */
            .ar-ring.is-on-you .ar-floor { transform: scale(1.18) translateX(9%); }
            .ar-ring.is-on-them .ar-floor { transform: scale(1.18) translateX(-9%); }
            .ar-ring.is-on-you .ar-ring-scrim { background: radial-gradient(44% 38% at 24% 58%, transparent, rgba(6,4,10,0.88)); }
            .ar-ring.is-on-them .ar-ring-scrim { background: radial-gradient(44% 38% at 76% 58%, transparent, rgba(6,4,10,0.88)); }
            .ar-ring.is-on-you .ar-fighter.is-foe { opacity: .28; filter: saturate(.35); }
            .ar-ring.is-on-them .ar-fighter:not(.is-foe) { opacity: .28; filter: saturate(.35); }
            /* The one casting stands up out of the frame a little. */
            .ar-ring.is-on-you .ar-fighter:not(.is-foe) .ar-hero,
            .ar-ring.is-on-them .ar-fighter.is-foe .ar-hero { filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 26px var(--el, rgba(255,215,94,0.8))); }
            .ar-ring-scrim { transition: background .35s ease; }
            .ar-fighter { transition: opacity .35s ease, filter .35s ease; }
            .ar-fighter { display: flex; flex-direction: column;
                align-items: center; justify-content: flex-end; min-height: 0; }
            .ar-fighter.is-dim { opacity: .3; filter: saturate(.4); }
            /* ── THE CONTACT SHADOW ── the one thing that puts a fighter ON the sand. Without it both heroes
               float in front of the background wall, which is exactly how the ring read: two cut-outs pasted
               onto a photograph rather than two people standing in a place. */
            .ar-shadow { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
                width: min(74%, 150px); height: 16px; border-radius: 50%; pointer-events: none;
                background: radial-gradient(ellipse at center, rgba(0,0,0,0.62), transparent 70%);
                animation: arShadowBreathe 2.8s ease-in-out infinite alternate; }
            @keyframes arShadowBreathe { from { opacity: .95; transform: translateX(-50%) scale(1) }
                to { opacity: .72; transform: translateX(-50%) scale(.9) } }
            /* The old value, holding for a beat before it slides down to meet the new one. */
            .ar-hp-ghost { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit;
                background: rgba(255,120,140,0.55); transition: width .38s cubic-bezier(.4,0,.2,1); }
            .ar-hp > i { position: relative; z-index: 2; }
            /* BIGGER, AND LOWER. These were capped at 210px inside a stage most of the panel tall, so both
               fighters sat as small figures floating in the middle of an empty wall with a vast dead band
               above and below them. A fight should fill its frame. */
            .ar-hero { width: 100%; height: 100%; min-height: 0; object-fit: contain;
                object-position: bottom center;
                filter: drop-shadow(0 10px 16px rgba(0,0,0,0.7));
                animation: arBreathe 2.8s ease-in-out infinite alternate; }
            @keyframes arBreathe { from { transform: translateY(0) } to { transform: translateY(-5px) } }
            .ar-fighter.is-foe .ar-hero { animation: arBreatheFoe 2.8s ease-in-out infinite alternate; }
            @keyframes arBreatheFoe { from { transform: scaleX(-1) translateY(0) } to { transform: scaleX(-1) translateY(-5px) } }
            /* ── THE TELEGRAPH ── the acting fighter draws back for exactly as long as the ring takes to close,
               so the wind-up and the countdown are the same event. There was nothing tying the circle to the
               fight before this: the ring closed on its own while both fighters stood there breathing, so the
               timing had no visible cause. Now you can watch the fighter instead and still hit the beat. */
            .ar-fighter.is-wind .ar-hero { animation: arWind var(--wind, 1.4s) cubic-bezier(.35,0,.65,1) both; }
            @keyframes arWind {
                0% { transform: translateX(0) rotate(0deg); filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)); }
                100% { transform: translateX(-18px) rotate(-9deg) scale(1.06);
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 20px rgba(255,215,94,0.9)); } }
            .ar-fighter.is-foe.is-wind .ar-hero { animation: arWindFoe var(--wind, 1.4s) cubic-bezier(.35,0,.65,1) both; }
            @keyframes arWindFoe {
                0% { transform: scaleX(-1) translateX(0) rotate(0deg); filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)); }
                100% { transform: scaleX(-1) translateX(-18px) rotate(-9deg) scale(1.06);
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 20px rgba(111,208,255,0.9)); } }
            /* Whoever is being aimed at hunches — it reads as "this is coming at me" without pulling focus. */
            .ar-fighter.is-brace .ar-hero { animation: arBrace .45s ease-out both; }
            @keyframes arBrace { to { transform: translateY(4px) scale(.96) } }
            .ar-fighter.is-foe.is-brace .ar-hero { animation: arBraceFoe .45s ease-out both; }
            @keyframes arBraceFoe { to { transform: scaleX(-1) translateY(4px) scale(.96) } }
            /* ── CONTACT ── landing a blow drives you INTO them and back; taking one rocks you away from it.
               The old version nudged 14px and returned, which at this size was barely perceptible — the whole
               of "you hit them" was a number changing. A step-in with a scale-up sells the weight. */
            .ar-fighter.is-lunge .ar-hero { animation: arLunge .34s cubic-bezier(.2,.9,.3,1); }
            @keyframes arLunge {
                0% { transform: translateX(0) scale(1) }
                28% { transform: translateX(34px) scale(1.06) }
                100% { transform: translateX(0) scale(1) } }
            .ar-fighter.is-foe.is-lunge .ar-hero { animation: arLungeFoe .34s cubic-bezier(.2,.9,.3,1); }
            @keyframes arLungeFoe {
                0% { transform: scaleX(-1) translateX(0) scale(1) }
                28% { transform: scaleX(-1) translateX(34px) scale(1.06) }
                100% { transform: scaleX(-1) translateX(0) scale(1) } }
            /* Taking one: knocked back, tipped, and washed red. */
            .ar-fighter.is-hurt .ar-hero { animation: arRecoil .36s cubic-bezier(.2,.9,.3,1);
                filter: drop-shadow(0 10px 16px rgba(0,0,0,0.7)) drop-shadow(0 0 18px #ff4d5e) brightness(1.6); }
            @keyframes arRecoil {
                0% { transform: translateX(0) rotate(0deg) }
                22% { transform: translateX(-22px) rotate(-5deg) }
                100% { transform: translateX(0) rotate(0deg) } }
            .ar-fighter.is-foe.is-hurt .ar-hero { animation: arRecoilFoe .36s cubic-bezier(.2,.9,.3,1); }
            @keyframes arRecoilFoe {
                0% { transform: scaleX(-1) translateX(0) rotate(0deg) }
                22% { transform: scaleX(-1) translateX(-22px) rotate(-5deg) }
                100% { transform: scaleX(-1) translateX(0) rotate(0deg) } }
            /* Shared with the ladder's 30px portraits, so it stays proportional; only the RING placeholder
               gets a fixed size. Sizing this in px broke the little rows above the fold. */
            .ar-noface { width: 60%; height: 60%; border-radius: 50%; background: rgba(255,255,255,0.12); }
            .ar-hero.ar-noface { width: 96px; height: 96px; }

            /* ── THE BAR BAND ── fixed at the top of the ring, never scaled, never slid. */
            .ar-bars { position: relative; z-index: 6; flex: 0 0 auto; display: grid;
                grid-template-columns: 1fr auto 1fr; align-items: start; gap: 8px; padding: 4px 10px 2px; }
            .ar-bar { min-width: 0; transition: opacity .3s ease; opacity: .62; }
            .ar-bar.is-active { opacity: 1; }
            .ar-bar.is-foe { text-align: right; }
            .ar-fname { display: block; font-size: 12px; font-weight: 900; color: #fff; text-shadow: 0 2px 7px #000;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-hp { position: relative; display: block; height: 11px; margin: 4px 0 2px; border-radius: 999px;
                overflow: hidden; background: rgba(0,0,0,0.68); border: 1px solid rgba(0,0,0,0.55);
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.7); }
            .ar-hp > i { display: block; height: 100%; background: linear-gradient(90deg, #4ad07f, #7ce8a4);
                transition: width .35s cubic-bezier(.2,.8,.3,1); }
            .ar-bar.is-foe .ar-hp > i { background: linear-gradient(90deg, #ff6f7d, #ffb0b8); }
            /* The ward, sitting on the bar as the slab it will eat before your vigour does. */
            .ar-hp-shield { position: absolute; top: 0; bottom: 0; z-index: 3; text-decoration: none;
                background: repeating-linear-gradient(115deg, rgba(111,208,255,.95) 0 4px, rgba(111,208,255,.6) 4px 8px);
                transition: left .35s ease, width .35s ease; }
            /* ── THE DANGER BAND ── under a third and the bar goes red and breathes. You feel the fight
               turning before you have read a number, which is the whole job of a health bar. */
            .ar-bar.is-danger .ar-hp > i { background: linear-gradient(90deg, #ff3b4e, #ff8f9a);
                animation: arDanger .7s ease-in-out infinite alternate; }
            @keyframes arDanger { from { filter: brightness(1) } to { filter: brightness(1.55) } }
            .ar-bar.is-danger .ar-hp { box-shadow: inset 0 1px 3px rgba(0,0,0,.7), 0 0 14px -2px rgba(255,60,80,.9); }
            /* A heal flashes the bar so it reads as vigour coming back rather than a number being different. */
            .ar-bar.is-healing .ar-hp > i { animation: arHealFlash .6s ease-out; }
            @keyframes arHealFlash { 0% { filter: brightness(2.4) saturate(.4) } 100% { filter: none } }
            .ar-hpnum { display: block; font-size: 10px; font-style: normal; color: #e8dcc8;
                text-shadow: 0 1px 4px #000; font-variant-numeric: tabular-nums; font-weight: 800; }
            .ar-hpnum span { opacity: .55; font-weight: 600; }
            .ar-hpnum u { text-decoration: none; margin-left: 5px; color: #6fd0ff; }
            /* Whose beat it is, said plainly, between the two bars. */
            .ar-turnmark { align-self: center; font-size: 8.5px; font-weight: 900; letter-spacing: .12em;
                text-transform: uppercase; white-space: nowrap; padding: 3px 8px; border-radius: 999px;
                background: rgba(8,6,10,0.7); border: 1px solid rgba(255,255,255,0.16); }
            .ar-turnmark.is-you { color: #ffd75e; border-color: rgba(255,215,94,.55); }
            .ar-turnmark.is-them { color: #6fd0ff; border-color: rgba(111,208,255,.5); }

            /* THE CLASH — the two stances that just met, thrown at each other with a spark between them. */
            .ar-clash { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; pointer-events: none; }
            .ar-grade { position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; align-content: center;
                gap: 2px; pointer-events: none; }
            /* The move, named, across the middle — announced before the grade lands under it. */
            .ar-move { font-style: normal; font-size: 1rem; font-weight: 900; letter-spacing: .06em;
                text-transform: uppercase; color: #fff; text-shadow: 0 2px 10px #000, 0 0 22px rgba(255,215,94,.8);
                animation: arMove .45s cubic-bezier(.2,1.4,.35,1) both; text-align: center; padding: 0 8%; }
            .ar-grade.is-theirs .ar-move { color: #cfe8ff; text-shadow: 0 2px 10px #000, 0 0 22px rgba(111,208,255,.8); }
            @keyframes arMove { from { opacity: 0; transform: translateY(-10px) scale(.9) }
                to { opacity: 1; transform: none } }
            .ar-grade span { font-size: 1.6rem; font-weight: 900; letter-spacing: .1em;
                animation: arGrade .85s cubic-bezier(.2,1.4,.35,1) both; text-shadow: 0 3px 14px #000; }
            /* The best grade in the game gets the biggest moment — bigger, whiter, and it lands with a kick. */
            .ar-grade.is-flawless span { color: #fff6cc; font-size: 2.1rem; letter-spacing: .14em;
                text-shadow: 0 3px 14px #000, 0 0 26px #fff0a8, 0 0 54px rgba(255,200,70,.95);
                animation: arFlawless .5s cubic-bezier(.2,1.5,.35,1) both; }
            @keyframes arFlawless { from { transform: scale(.55) rotate(-4deg); opacity: 0 }
                60% { transform: scale(1.12) rotate(1deg); opacity: 1 } to { transform: none; opacity: 1 } }
            .ar-grade.is-perfect span { color: #ffe28a; text-shadow: 0 3px 14px #000, 0 0 32px rgba(255,200,70,.95); }
            .ar-grade.is-great span { color: #8bf0b4; }
            .ar-grade.is-good span { color: #cbd3dc; }
            .ar-grade.is-miss span { color: #ff8f9a; }
            @keyframes arGrade { 0% { opacity: 0; transform: scale(1.7) } 30% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(.95) translateY(-18px) } }
            .ar-clash-spark { position: absolute; width: 78px; height: 78px; border-radius: 50%;
                background: radial-gradient(circle, rgba(255,240,190,0.95), rgba(255,180,60,0.35) 45%, transparent 70%);
                animation: arSpark .5s ease-out .3s both; }
            @keyframes arSpark { 0% { opacity: 0; transform: scale(.3) } 40% { opacity: 1; transform: scale(1.15) } 100% { opacity: 0; transform: scale(1.5) } }

            /* A felled fighter drops to the sand and greys out — you SEE the blow land instead of being
               teleported to a summary. */
            .ar-fighter.is-down .ar-hero { animation: arDown .6s cubic-bezier(.4,0,.6,1) both; }
            @keyframes arDown { to { transform: translateY(16px) rotate(-16deg); opacity: .45; filter: grayscale(1) brightness(.6); } }
            .ar-fighter.is-foe.is-down .ar-hero { animation: arDownFoe .6s cubic-bezier(.4,0,.6,1) both; }
            @keyframes arDownFoe { to { transform: scaleX(-1) translateY(16px) rotate(16deg); opacity: .45; filter: grayscale(1) brightness(.6); } }
            .ar-verdict { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
                align-content: center; gap: 12px; pointer-events: none; }
            .ar-verdict .ar-btn { pointer-events: auto; }
            .ar-verdict b { font-size: 2.1rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase;
                animation: arVerdict .55s cubic-bezier(.2,1.5,.35,1) .25s both; }
            .ar-verdict.is-win b { color: #ffe28a; text-shadow: 0 3px 18px #000, 0 0 40px rgba(255,190,60,.9); }
            .ar-verdict.is-loss b { color: #ffb0b8; text-shadow: 0 3px 18px #000, 0 0 40px rgba(255,80,100,.8); }
            @keyframes arVerdict { from { opacity: 0; transform: scale(1.7) } to { opacity: 1; transform: scale(1) } }

            .ar-beat { position: relative; z-index: 5; flex: 0 0 auto; padding: 5px 10px 0; margin: 0;
                font-size: 12px; line-height: 1.4; color: #e4d9c6; text-align: center;
                text-shadow: 0 2px 8px #000; pointer-events: none; }

            .ar-tell { margin: 10px 0 12px; font-size: 12px; color: #cbb; text-align: center; }
            .ar-tell b { color: #ffd0a0; }

            .ar-stances { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .ar-stance img { width: 34px; height: 34px; object-fit: contain; margin: 0 auto 4px; display: block; }
            .ar-stance { padding: 11px 8px 12px; border-radius: 13px; cursor: pointer; text-align: center;
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.13); }
            .ar-stance:disabled { opacity: .55; }
            .ar-stance b { display: block; font-size: 0.9rem; font-weight: 900; color: #fff; }
            .ar-stance em { display: block; margin-top: 3px; font-style: normal; font-size: 10px; line-height: 1.35; color: #8f98a3; }
            .ar-stance.is-strike { border-color: rgba(255,111,125,0.5); }
            .ar-stance.is-guard { border-color: rgba(111,208,255,0.5); }
            .ar-stance.is-feint { border-color: rgba(185,140,255,0.5); }

            .ar-result { position: relative; overflow: hidden; margin-top: 10px; padding: 15px; border-radius: 14px; text-align: center; }
            /* --rank is what .ar-rays colours itself from; the rays are shared with the rank-up card, which
               sets it per band. On a plain win there is no band, so it needs a default or the rays render
               transparent. */
            .ar-result.is-win { --rank: #ffd75e; background: rgba(255,215,94,0.1); border: 1px solid rgba(255,215,94,0.45); }
            .ar-result.is-loss { background: rgba(255,111,125,0.09); border: 1px solid rgba(255,111,125,0.4); }
            .ar-result b { font-size: 1.05rem; color: #fff; }
            .ar-result p { margin: 6px 0 12px; font-size: 12.5px; color: #cbd3dc; }

            /* ── the recap ── */
            .ar-recap { position: fixed; inset: 0; z-index: 10100; display: flex; align-items: center;
                justify-content: center; padding: 18px; background: rgba(6,4,10,0.86); backdrop-filter: blur(4px);
                overflow-y: auto; }
            /* Outside the card, so it is still there if the card is not. */
            .ar-recap-x { position: fixed; top: calc(env(safe-area-inset-top) + 12px); right: 12px; z-index: 2;
                padding: 8px 15px; border-radius: 999px; cursor: pointer; font-size: 12px; font-weight: 900;
                color: #f3e8d6; background: rgba(20,16,26,0.9); border: 1px solid rgba(255,255,255,0.28); }
            .ar-recap-card { position: relative; overflow: hidden; width: min(390px, 100%); max-height: 92dvh; overflow-y: auto; padding: 24px 22px 18px;
                border-radius: 22px; text-align: center; background: linear-gradient(180deg, #221a26, #120e15);
                border: 2px solid var(--tint); box-shadow: 0 24px 70px rgba(0,0,0,0.8), 0 0 66px -12px var(--tint);
                animation: arCardIn .42s cubic-bezier(.2,1.5,.35,1) both; }
            .ar-recap-kick { position: relative; font-size: 10px; font-weight: 900; letter-spacing: .22em;
                text-transform: uppercase; color: color-mix(in srgb, var(--tint) 80%, white); }
            .ar-recap-title { position: relative; display: block; margin: 4px 0 2px; font-size: 1.25rem; font-weight: 900; color: #fff; }
            .ar-recap-sub { position: relative; margin: 0 0 14px; font-size: 11.5px; color: #9a8fb5; }

            .ar-climb { position: relative; display: flex; align-items: center; justify-content: center; gap: 9px; margin-bottom: 14px; }
            .ar-climb-lab, .ar-climb-of { font-size: 10.5px; font-weight: 900; letter-spacing: .1em;
                text-transform: uppercase; color: #8a7fae; }
            .ar-climb-num { display: inline-flex; align-items: center; gap: 8px; }
            .ar-climb-num i { font-style: normal; font-size: 1.7rem; font-weight: 900; font-variant-numeric: tabular-nums; }
            .ar-climb-num .was { color: #6f6486; }
            .ar-climb-num .now { color: color-mix(in srgb, var(--tint) 75%, white);
                text-shadow: 0 0 26px color-mix(in srgb, var(--tint) 60%, transparent);
                animation: arTick .4s cubic-bezier(.2,1.6,.35,1); }
            @keyframes arTick { from { transform: scale(1.55); opacity: .4 } to { transform: scale(1); opacity: 1 } }
            .ar-climb-num .arrow { width: 9px; height: 9px; border-top: 2.5px solid var(--tint);
                border-right: 2.5px solid var(--tint); transform: rotate(45deg); }

            .ar-recap-rank, .ar-recap-rankup { position: relative; display: flex; align-items: center; gap: 13px;
                text-align: left; padding: 11px 13px; border-radius: 14px; margin-bottom: 13px;
                background: rgba(255,255,255,0.05); border: 1px solid color-mix(in srgb, var(--tint) 42%, transparent); }
            .ar-recap-rank img { width: 50px; height: 50px; object-fit: contain; flex: 0 0 auto; }
            .ar-recap-rankup { background: linear-gradient(140deg, color-mix(in srgb, var(--tint) 26%, transparent), rgba(255,255,255,0.02) 68%); }
            .ar-recap-rankup img { width: 62px; height: 62px; object-fit: contain; flex: 0 0 auto;
                filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--tint) 70%, transparent));
                animation: arRise .7s cubic-bezier(.2,1.35,.35,1) both; }
            .ar-recap-rankup span { display: block; font-size: 9.5px; font-weight: 900; letter-spacing: .18em;
                text-transform: uppercase; color: #8a7fae; }
            .ar-recap-rankup b { display: block; font-size: 1.35rem; font-weight: 900; line-height: 1.1;
                color: color-mix(in srgb, var(--tint) 76%, white); }
            .ar-recap-rankup em { font-style: normal; font-size: 11px; color: #9a8fb5; }
            .ar-recap-rank b { display: block; font-size: 1rem; font-weight: 900; color: color-mix(in srgb, var(--tint) 70%, white); }
            .ar-recap-rank em { font-style: normal; font-size: 11px; color: #9a8fb5; }
            .ar-recap-bar { display: block; height: 5px; margin: 6px 0 4px; border-radius: 999px; overflow: hidden;
                background: rgba(0,0,0,0.5); }
            .ar-recap-bar > i { display: block; height: 100%; background: var(--tint); transition: width .8s cubic-bezier(.2,.8,.3,1); }

            .ar-recap-rows { position: relative; display: grid; gap: 5px; margin-bottom: 15px; }
            .ar-recap-rows > span { display: flex; align-items: center; justify-content: space-between;
                padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.05); font-size: 0.85rem; }
            .ar-recap-rows i { font-style: normal; color: #a99fc4; }
            .ar-recap-rows b { color: #ffd75e; font-variant-numeric: tabular-nums; text-transform: capitalize; }
            .ar-recap-none b { color: #a99fc4; }
            .ar-recap-go { position: relative; width: 100%; }

            .ar-err { margin: 10px 0 0; padding: 9px 12px; border-radius: 10px; text-align: center;
                font-size: 12px; font-weight: 800; color: #ffd0a0;
                background: rgba(255,160,80,0.12); border: 1px solid rgba(255,160,80,0.4); }
            /* 31px measured on an iPhone SE. This is the button the entire ladder exists to make you press. */
            .ar-btn.is-sm { padding: 11px 16px; font-size: 0.8rem; min-height: 40px; }
            .ar-podium { margin: 12px 0 14px; padding: 11px 13px; border-radius: 13px;
                background: rgba(255,215,94,0.07); border: 1px solid rgba(255,215,94,0.3); }
            .ar-podium-lab { font-size: 10px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #cdb894; }
            .ar-podium-row { display: flex; gap: 7px; margin-top: 7px; }
            .ar-podium-slot { flex: 1; text-align: center; padding: 7px 4px; border-radius: 9px; font-size: 11px;
                font-weight: 900; text-transform: capitalize; background: rgba(0,0,0,0.3); border: 1px solid; }
            .ar-podium-slot i { display: block; font-style: normal; font-size: 13px; }
            .ar-podium-slot.is-gold { color: #ffd75e; border-color: rgba(255,215,94,0.55); }
            .ar-podium-slot.is-iron { color: #cfd6dd; border-color: rgba(207,214,221,0.45); }
            .ar-podium-slot.is-wooden { color: #c39b6a; border-color: rgba(195,155,106,0.45); }

            .ar-targets { display: grid; gap: 7px; margin-bottom: 16px; }
            .ar-target { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
                padding: 9px 11px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,111,125,0.28); }
            .ar-target-pos { font-size: 12px; font-weight: 900; color: #ffb0b8; font-variant-numeric: tabular-nums; }
            .ar-target-body { min-width: 0; }
            .ar-target-body b { display: block; font-size: 13px; color: #e9eef3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            /* Was clipped to a single nowrap line, which on a 375px phone ate the win-loss record entirely —
               "Lv 34 · 241 vigour · 4…". It wraps now; two short lines beat one truncated one. */
            .ar-target-body em { display: block; font-style: normal; font-size: 10.5px; line-height: 1.35;
                color: #8a939d; }
            .ar-target-go { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
            .ar-none { font-size: 12.5px; color: #8a939d; }
            .ar-up-row.is-you { border: 1px solid rgba(255,215,94,0.45); background: rgba(255,215,94,0.08); }

            .ar-away { position: fixed; inset: 0; z-index: 10100; display: grid; place-items: center; padding: 18px;
                background: rgba(6,4,10,0.86); backdrop-filter: blur(4px); overflow-y: auto; }
            .ar-away-card { width: min(390px, 100%); max-height: 92dvh; overflow-y: auto; padding: 22px 20px 18px;
                border-radius: 20px; text-align: center; background: linear-gradient(180deg, #221a26, #120e15);
                border: 2px solid #6f5a9c; box-shadow: 0 24px 70px rgba(0,0,0,0.8);
                animation: arCardIn .4s cubic-bezier(.2,1.5,.35,1) both; }
            .ar-away-list { display: grid; gap: 6px; margin: 13px 0 15px; }
            .ar-away-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
                padding: 8px 11px; border-radius: 11px; text-align: left; background: rgba(255,255,255,0.05);
                border-left: 3px solid transparent; }
            .ar-away-row.is-win { border-left-color: #7ce8a4; }
            .ar-away-row.is-loss { border-left-color: #ff6f7d; }
            .ar-away-text b { display: block; font-size: 12.5px; color: #e9eef3; }
            .ar-away-text em { font-style: normal; font-size: 11px; color: #9a8fb5; }
            .ar-away-pos { font-size: 12px; font-weight: 900; color: #cdb894; font-variant-numeric: tabular-nums; }

            .ar-clash { margin: 8px 0 0; font-size: 12.5px; font-weight: 800; text-align: center; }
            .ar-clash.is-good { color: #8bf0b4; }
            .ar-clash.is-bad { color: #ff9f9f; }
            .ar-underdog { margin: 5px 0 0; font-size: 12px; font-weight: 900; text-align: center; color: #ffd75e;
                letter-spacing: .02em; text-shadow: 0 0 14px rgba(255,215,94,0.35); }

            /* ── THE COMMAND DECK ───────────────────────────────────────────────────────────────────────────
               Four commands across the bottom of the panel, JRPG-style. Two of them raise the timing ring and
               two spend the turn outright, which is what makes it a decision rather than four ways to attack. */
            /* A FIXED FLOOR FOR THE DECK. Its contents swap between four command buttons, a one-line prompt
               and a submenu — and because the panel is a flex column, every swap resized the fighters' half
               and the whole scene jumped. The deck now reserves its own height and the stage never moves. */
            .ar-deck { position: relative; z-index: 8; flex: 0 0 auto; min-height: 86px;
                padding-bottom: max(8px, env(safe-area-inset-bottom));
                display: flex; flex-direction: column; justify-content: center; padding: 8px;
                background: linear-gradient(180deg, transparent, rgba(6,4,8,0.82) 38%, rgba(6,4,8,0.95));
                border-top: 1px solid rgba(255,190,110,0.16); }
            .ar-cmds { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
            .ar-cmd { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
                padding: 9px 4px; border-radius: 11px; cursor: pointer; font-size: 11px; font-weight: 900;
                letter-spacing: .04em; color: #f3e8d6; background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.16); transition: transform .1s ease, background .1s ease; }
            .ar-cmd :global(svg) { width: 20px; height: 20px; color: var(--cmd, #ffd75e); }
            .ar-cmd:active { transform: translateY(1px); }
            .ar-cmd:disabled { opacity: .35; cursor: default; }
            /* hover ONLY where a pointer can actually hover. On touch, :hover latches after a tap and the
               command keeps looking armed long after the beat resolved. */
            @media (hover: hover) {
                .ar-cmd:not(:disabled):hover { background: color-mix(in srgb, var(--cmd) 20%, transparent);
                    border-color: color-mix(in srgb, var(--cmd) 55%, transparent); }
            }
            .ar-cmd.is-atk { --cmd: #ffd75e; }
            .ar-cmd.is-skill { --cmd: #b061ff; }
            .ar-cmd.is-guard { --cmd: #6fd0ff; }
            .ar-cmd.is-item { --cmd: #8bf0b4; }

            /* A submenu replaces the deck in place — you are still looking at the fight, not a new screen. */
            .ar-sub { display: grid; gap: 5px; max-height: min(46vh, 300px); overflow-y: auto; }
            .ar-pick { display: flex; align-items: center; gap: 9px; text-align: left; width: 100%;
                padding: 6px 9px 6px 6px; border-radius: 11px; cursor: pointer;
                background: rgba(255,255,255,0.05); border: 1px solid color-mix(in srgb, var(--el) 45%, transparent); }
            .ar-pick:disabled, .ar-pick.is-poor { opacity: .38; cursor: default; }
            @media (hover: hover) {
                .ar-pick:not(:disabled):hover { background: color-mix(in srgb, var(--el) 16%, transparent); }
            }
            /* Every ability wears the art of the gear it came from — the same argument as printing the item's
               name on it. An ability you cannot trace to a thing you own is magic. */
            .ar-pick-art { flex: 0 0 auto; width: 40px; height: 40px; object-fit: contain;
                filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6)); }
            .ar-pick-none { display: grid; place-items: center; color: var(--el); }
            .ar-pick-none :global(svg) { width: 24px; height: 24px; }
            .ar-pick-body { min-width: 0; flex: 1; display: grid; }
            .ar-pick-body b { font-size: 12.5px; color: #fff; }
            .ar-pick-body em { font-style: normal; font-size: 10.5px; line-height: 1.35; color: #b6bec7; }
            .ar-pick-body i { font-style: normal; font-size: 9.5px; color: #7f8790;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-pick-cost { flex: 0 0 auto; text-decoration: none; font-size: 12px; font-weight: 900; color: var(--el); }
            .ar-back { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px;
                border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 900; color: #cbd3dc;
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); }
            .ar-back :global(svg) { width: 14px; height: 14px; }

            .ar-prompt { margin: 0; padding: 10px 6px; text-align: center; font-size: 12.5px; font-weight: 800;
                letter-spacing: .02em; }
            .ar-prompt b { font-weight: 900; }
            .ar-prompt.is-atk { color: #ffd75e; }
            .ar-prompt.is-def { color: #6fd0ff; }

            /* ── THE DECLARATION ── */
            .ar-declare { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%); z-index: 23;
                display: grid; justify-items: center; gap: 2px; pointer-events: none; text-align: center;
                animation: arDeclare .4s cubic-bezier(.2,1.5,.35,1) both; }
            .ar-declare img { width: 46px; height: 46px; object-fit: contain;
                filter: drop-shadow(0 0 18px var(--el)) drop-shadow(0 4px 10px rgba(0,0,0,0.8)); }
            .ar-declare b { font-size: 1.4rem; font-weight: 900; letter-spacing: .03em; color: #fff;
                text-shadow: 0 2px 12px #000, 0 0 26px var(--el); }
            .ar-declare em { font-style: normal; font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
                color: var(--el); text-shadow: 0 2px 8px #000; }
            /* Theirs sits on their side of the ring, so you never mistake an incoming move for one of yours. */
            .ar-declare.is-theirs { left: auto; right: 6%; transform: translate(0, -50%); }
            @keyframes arDeclareTheirs { from { opacity: 0; transform: translate(0, -50%) scale(.7) }
                to { opacity: 1; transform: translate(0, -50%) scale(1) } }
            .ar-declare.is-theirs { animation-name: arDeclareTheirs; }
            @keyframes arDeclare { from { opacity: 0; transform: translate(-50%, -50%) scale(.7) }
                to { opacity: 1; transform: translate(-50%, -50%) scale(1) } }

            /* ── A SKILL, SAID SHORT ── */
            .sk { display: grid; gap: 3px; min-width: 0; flex: 1; text-align: left; }
            .sk-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
            .sk-name { font-size: 13px; color: #fff; }
            .sk-cd { font-size: 9.5px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; color: #7f8790; }
            .sk-cd.is-ready { color: #8bf0b4; }
            .sk-head { display: flex; align-items: baseline; gap: 6px; }
            .sk-head strong { font-size: 19px; font-weight: 900; letter-spacing: -0.02em; color: #ffd75e;
                text-shadow: 0 0 16px rgba(255,215,94,0.35); }
            /* A fallback sentence is prose, not a number — don't blow it up to headline size. */
            .sk-head strong:not(:only-child), .sk-head strong { line-height: 1.15; }
            .sk-head:has(strong:only-child) strong { font-size: 12px; font-weight: 700; color: #b6bec7;
                text-shadow: none; }
            .sk-head em { font-style: normal; font-size: 10.5px; color: #9aa2ab; }
            .sk-tags { display: flex; flex-wrap: wrap; gap: 4px; }
            .sk-tag { font-style: normal; font-size: 9.5px; font-weight: 800; padding: 1px 7px; border-radius: 999px;
                border: 1px solid currentColor; }
            .sk-tag.is-good { color: #8bf0b4; }
            .sk-tag.is-bad { color: #ff9f9f; }
            .sk-tag.is-el { color: #b061ff; }
            .sk-foot { font-size: 9px; color: #6f767e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            /* ── BRACE ── defensive skills, offered while you read their move. */
            .ar-wards { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 2px 4px; }
            .ar-ward { display: flex; align-items: center; gap: 6px; padding: 7px 11px; border-radius: 10px;
                cursor: pointer; font-size: 11.5px; font-weight: 800; color: #cfe8ff;
                background: rgba(111,208,255,0.1); border: 1px solid rgba(111,208,255,0.45); }
            .ar-ward :global(svg) { width: 15px; height: 15px; }
            .ar-ward u { text-decoration: none; font-size: 9.5px; font-weight: 900; color: #6fd0ff; }
            .ar-ward.is-poor { opacity: .4; cursor: default; }

            /* ── THE WARNING ── deliberately not shaped like the ring. Defending has to look like a different
               job than attacking, or it reads as another turn of your own. */
            .ar-incoming { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 19;
                display: flex; align-items: center; gap: 11px; padding: 10px 15px 10px 11px; border-radius: 14px;
                background: rgba(8,10,18,0.86); border: 1px solid rgba(111,208,255,0.55);
                box-shadow: 0 0 34px -6px rgba(111,208,255,0.6); backdrop-filter: blur(3px);
                animation: arIncoming .32s cubic-bezier(.2,1.4,.35,1) both; pointer-events: none; max-width: 90%; }
            @keyframes arIncoming { from { opacity: 0; transform: translate(-50%, -50%) scale(.82) }
                to { opacity: 1; transform: translate(-50%, -50%) scale(1) } }
            .ar-incoming-art { flex: 0 0 auto; width: 38px; height: 38px; object-fit: contain;
                filter: drop-shadow(0 3px 7px rgba(0,0,0,0.7)); }
            .ar-incoming-body { display: grid; min-width: 0; }
            .ar-incoming-body em { font-style: normal; font-size: 10px; letter-spacing: .1em;
                text-transform: uppercase; color: #6fd0ff; }
            .ar-incoming-body b { font-size: 15px; color: #fff; line-height: 1.15; }

            /* ── THE NUMBERS ── the payoff, over the fighter it happened to.
               These used to sit at top:34% of a floor box that is most of the panel tall, while the fighters
               stand at its BOTTOM — so every damage number floated in empty sky near the HP bars, a couple of
               hundred pixels from the thing it described. They are anchored to the fighters now. */
            .ar-pop { position: absolute; bottom: 34%; z-index: 21; font-size: 1.7rem; font-weight: 900;
                letter-spacing: -0.02em; pointer-events: none; text-shadow: 0 3px 12px #000, 0 1px 0 rgba(0,0,0,.9);
                font-variant-numeric: tabular-nums;
                animation: arPop 1s cubic-bezier(.2,1,.3,1) both; }
            .ar-pop.is-right { right: 18%; }
            .ar-pop.is-left { left: 18%; }
            .ar-pop.is-dmg { color: #ffd75e; }
            .ar-pop.is-left.is-dmg { color: #ff8f9a; }
            /* A crit is the biggest number in the game and it should look like it. */
            .ar-pop.is-crit { font-size: 2.7rem; color: #fff6cc;
                text-shadow: 0 3px 12px #000, 0 0 26px #ffe28a, 0 0 60px rgba(255,190,60,.95);
                animation: arPopCrit 1.15s cubic-bezier(.2,1.1,.3,1) both; }
            /* The half of the exchange your defensive choices actually bought you. Smaller, cooler, offset —
               it must never be mistaken for damage you took. */
            .ar-pop.is-block, .ar-pop.is-ward { font-size: 1rem; color: #9fdcff; bottom: 46%; }
            .ar-pop.is-heal { font-size: 1.5rem; color: #8bf0b4; text-shadow: 0 3px 12px #000, 0 0 22px rgba(139,240,180,.7); }
            .ar-pop u { display: block; text-decoration: none; font-size: 8.5px; font-weight: 900;
                letter-spacing: .14em; text-transform: uppercase; opacity: .8; }
            @keyframes arPop { from { opacity: 0; transform: translateY(14px) scale(.7) }
                25% { opacity: 1; transform: translateY(-6px) scale(1.12) }
                to { opacity: 0; transform: translateY(-52px) scale(1) } }
            @keyframes arPopCrit { from { opacity: 0; transform: translateY(10px) scale(.4) rotate(-8deg) }
                18% { opacity: 1; transform: translateY(-10px) scale(1.35) rotate(2deg) }
                34% { transform: translateY(-10px) scale(1.08) rotate(0deg) }
                to { opacity: 0; transform: translateY(-64px) scale(1) } }

            /* ── HIT-STOP ── both fighters hold still for a few frames at the moment of contact. It is most of
               why a blow reads as a blow rather than a position change, and it costs one class. */
            .ar-ring.is-stop .ar-floor { transform: scale(1.03); }
            .ar-ring.is-stop .ar-hero { animation-play-state: paused !important; }

            /* A crit takes the whole pane for a moment. */
            .ar-ring.is-crit::after { content: ""; position: absolute; inset: 0; z-index: 18; pointer-events: none;
                background: radial-gradient(70% 60% at 72% 58%, rgba(255,231,150,0.62), transparent 72%);
                animation: arCrit .5s ease-out both; }
            @keyframes arCrit { from { opacity: 1 } 30% { opacity: .8 } to { opacity: 0 } }
            /* Theirs: your side of the ring, and red. */
            .ar-ring.is-crit-theirs::after {
                background: radial-gradient(70% 60% at 28% 58%, rgba(255,90,110,0.6), transparent 72%); }
            .ar-grade.is-theirs.is-crit .ar-critword, .ar-grade.is-theirs.is-crit .ar-move { color: #ffd0d6;
                text-shadow: 0 2px 10px #000, 0 0 26px rgba(255,80,100,.95); }
            .ar-critword { display: block; font-size: 11px; font-weight: 900; letter-spacing: .3em;
                text-transform: uppercase; color: #fff6cc;
                text-shadow: 0 2px 10px #000, 0 0 24px rgba(255,200,70,.95);
                animation: arCritWord .5s cubic-bezier(.2,1.6,.35,1) both; }
            @keyframes arCritWord { from { opacity: 0; transform: scale(.4) } to { opacity: 1; transform: none } }
            .ar-grade.is-crit .ar-move { font-size: 1.25rem; color: #fff6cc;
                text-shadow: 0 2px 10px #000, 0 0 30px rgba(255,200,70,.9); }

            /* ── THE MUTE ── a fight with music needs an off switch on the fight screen. */
            /* ── TOUCH TARGETS ── measured at 28x28, well under the 44px every mobile guideline asks for.
               The box stays small so it does not shout on a crowded HUD; the HIT AREA is grown past it with a
               transparent ::after, which is the standard way to have both. */
            .ar-mute { position: absolute; top: 7px; right: 8px; z-index: 26; width: 34px; height: 34px;
                padding: 0; appearance: none; -webkit-appearance: none; border-radius: 9px; cursor: pointer;
                display: grid; place-items: center; pointer-events: auto;
                color: #ffe0b0; background: rgba(8,6,10,0.62); border: 1px solid rgba(255,255,255,0.18); }
            .ar-mute :global(svg) { width: 16px; height: 16px; }
            .ar-mute.is-off { color: #7f8790; }
            .ar-mute::after { content: ""; position: absolute; inset: -6px; }

            .ar-focus { position: relative; z-index: 5; flex: 0 0 auto; padding: 6px 10px 0;
                display: flex; align-items: center; gap: 9px; flex-wrap: wrap; pointer-events: none; }
            .ar-focus .ar-cdchip { pointer-events: auto; }
            /* padding:0 and appearance:none are load-bearing. These were <span>s; making them buttons handed
               them the UA default padding of 1px 6px, which ate 12 of the 30px and shoved every sprite off
               centre inside its own box. */
            .ar-cdchip { position: relative; width: 38px; height: 38px; padding: 0; appearance: none;
                -webkit-appearance: none; border-radius: 9px; display: grid; place-items: center;
                background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.14); }
            .ar-cdchip img { width: 26px; height: 26px; object-fit: contain; opacity: .34; filter: grayscale(1); }
            .ar-cdchip::after { content: ""; position: absolute; inset: -4px; }
            .ar-cdchip.is-ready { border-color: color-mix(in srgb, var(--el) 65%, transparent);
                box-shadow: 0 0 12px -3px var(--el); }
            .ar-cdchip.is-ready img { opacity: 1; filter: none; }
            .ar-cdchip i { position: absolute; font-style: normal; font-size: 13px; font-weight: 900; color: #fff;
                text-shadow: 0 2px 6px #000; }
            /* Castable RIGHT NOW reads differently from merely off-cooldown — it is a button, so it should
               look like one on the beat you can actually press it. */
            .ar-cdchip.is-live { cursor: pointer; animation: arChipLive 1.6s ease-in-out infinite; }
            .ar-cdchip.is-live:active { transform: scale(.92); }
            @keyframes arChipLive {
                0%, 100% { box-shadow: 0 0 12px -3px var(--el); }
                50% { box-shadow: 0 0 20px -1px var(--el); } }
            .ar-cdchip:disabled { cursor: default; }
            .ar-buff { font-size: 10px; font-weight: 900; padding: 2px 8px; border-radius: 999px; }
            .ar-buff.is-ward { color: #6fd0ff; border: 1px solid rgba(111,208,255,.5); }
            .ar-buff.is-surge { color: #ffd75e; border: 1px solid rgba(255,215,94,.5); }

            /* ── THEIR KIT ── same rail, their side, smaller. Readable, not actionable. */
            .ar-theirs { margin-left: auto; display: flex; align-items: center; gap: 4px; }
            .ar-theirs-lab { font-style: normal; font-size: 8px; font-weight: 900; letter-spacing: .14em;
                text-transform: uppercase; color: #7f8790; margin-right: 1px; }
            .ar-theirchip { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center;
                background: rgba(0,0,0,0.45); border: 1px solid color-mix(in srgb, var(--el) 45%, transparent); }
            .ar-theirchip img { width: 15px; height: 15px; object-fit: contain; opacity: .85; }

            .ar-kit { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 9px; }
            .ar-ability { text-align: left; padding: 11px 13px; border-radius: 12px; cursor: pointer;
                background: rgba(255,255,255,0.04); border: 1px solid color-mix(in srgb, var(--el) 45%, transparent); }
            .ar-ability.is-armed { background: color-mix(in srgb, var(--el) 22%, transparent);
                border-color: var(--el); box-shadow: 0 0 18px -4px var(--el); }
            .ar-ability.is-poor { opacity: .4; cursor: default; }
            .ar-ability b { display: block; font-size: 12.5px; color: #fff; }
            .ar-ability-head { display: flex; align-items: center; gap: 7px; }
            .ar-ability-art { flex: 0 0 auto; width: 26px; height: 26px; object-fit: contain;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
            .ar-ability em { display: block; font-style: normal; font-size: 10.5px; line-height: 1.35; color: #9aa2ab; margin-top: 2px; }
            .ar-ability-flavour { font-style: italic !important; color: #7f8790 !important; }
            .ar-ability-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 9.5px; }
            /* The item it came from is ALWAYS shown — an ability you can't trace to a piece of gear is magic,
               and you cannot build toward magic. */
            .ar-ability-foot i { font-style: normal; color: #7f8790; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-ability-foot u { text-decoration: none; font-weight: 900; color: var(--el); white-space: nowrap; }
            .ar-turn { margin: 10px 0 0; font-size: 12px; text-align: center; color: #cbd3dc; }

            .ar-ability.is-static { cursor: default; }
            .ar-mykit { margin-bottom: 22px; display: grid; gap: 11px; }
            .ar-el { font-style: normal; margin-left: 8px; padding: 1px 8px; border-radius: 999px; font-size: 9.5px;
                color: var(--el); border: 1px solid color-mix(in srgb, var(--el) 55%, transparent); text-transform: capitalize; }

            .ar-log { margin-top: 13px; max-height: 150px; overflow-y: auto; display: grid; gap: 4px;
                padding: 9px 11px; border-radius: 11px; background: rgba(0,0,0,0.28); }
            .ar-line { font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
            .ar-line b { color: #6f6486; margin-right: 5px; }
        `}</style>
    );
}
