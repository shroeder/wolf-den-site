"use client";

import PetStoneShelf from "@/components/PetStoneShelf";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    GiAngryEyes, GiFlame, GiDroplets, GiHearts, GiCrackedShield, GiCrossedSwords, GiExitDoor, GiFastForwardButton, GiIciclesAura, GiRingingBell, GiSpikedHalo, GiTerror, GiTombstone, GiChainedHeart, GiKnapsack, GiPadlock, GiReturnArrow, GiScrollUnfurled, GiShield, GiSoundOff, GiSoundOn, GiSpellBook, GiSwordWound,
} from "react-icons/gi";

import useScrollLock from "@/lib/useScrollLock";
import SkillFx from "@/components/arena/SkillFx";
import ArenaFx from "@/components/arena/ArenaFx";
import { classById } from "@/lib/marketplace/arena-classes.js";
import ArenaUpgrades from "@/components/arena/ArenaUpgrades";
import RecipeShelf from "@/components/RecipeShelf";
import SkillTree from "@/components/arena/SkillTree";
import {
    duck, Haptic, isMuted, setIntensity, setMuted, Sfx, startMusic, stopMusic, unlock,
} from "@/components/arena/arena-audio.js";
import { BATTLE_ITEMS, BIND_CUT, BLEED_PER_TURN, DOOM_MULT, DREAD_CUT, REND_PER_TURN, SNARE_ACC, SUNDER_CUT } from "@/lib/marketplace/arena-kit.js";

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

// The currency's face. It had none — "1,014 laurels" was a word, so the one thing you earn every single bout
// looked like a number the screen was telling you rather than a thing you hold.
const LAUREL = "/images/arena/armoury/laurel.png";
const money = (n) => Number(n || 0).toLocaleString();

// The server's deliberate NOs, said in words. Anything not in here is an actual fault and keeps the generic
// "try again" — the distinction matters, because a rule and a bug want opposite things from the player.
const REFUSALS = {
    locked: "The Road is walked in order — beat the rung you are standing on first.",
    no_fights: "You are out of arena fights for today. They come back at 5am — the Road does not use them.",
    no_target: "Nobody your size is free right now. Try the Road, or pick someone from the standings.",
    cooling: "That one needs a moment before it can be used again.",
    no_event: "That fight is over — the plaza has moved on.",
    already_beaten: "You have already put that one down. A rung only pays once.",
    bout_in_progress: "You are already in a fight. Finish it, then pick the next one.",
    // The two halves of the brace budget. The button is disabled and titled before you can reach either of
    // these, so they are the belt to that brace — but a refusal with no words on it is what turns a rule
    // into a bug report, and that is precisely how the stall was reported.
    brace_cooling: "You braced last beat. Not twice in a row — swing, drink, or cast.",
    // Kept for any bout still in flight that was opened under the old six-a-bout rule.
    no_braces: "You are out of braces for this bout.",
    recently_fought: "You just fought them. Five more bouts before a rematch.",
};

// How long their move sits on screen before the block ring starts. Long enough to actually read a name.
// 1100 -> 850. This and RESULT_MS are the two fixed waits in every single exchange, and at 1100 + 1500 they
// were 2.6 seconds of enforced holding per beat — over a ten-beat bout, twenty-six seconds in which the fight
// is showing you things you have already read. Trimmed rather than removed: the reason they exist (one thing
// said at a time, a move you can actually name before you answer it) is still right, and cutting them to
// nothing brings back the overlap they were introduced to fix.
const TELEGRAPH_MS = 850;

// How long a cast holds the screen before the blow lands. The declaration, the spotlight and the effect all
// play inside this window.
//
// 1250 -> 700. A cinematic you have seen four hundred times is not a cinematic, it is a wait, and a skill is
// pressed several times a bout. The declaration and the spotlight both still play — they were never 1250ms of
// content, they were ~400ms of content in a 1250ms hold.
const CAST_MS = 700;

// ── ANTICIPATION ─────────────────────────────────────────────────────────────────────────────────────────────
// Every command now has a WIND-UP: the fighter commits, draws back, and only then does the server resolve it.
// Before this, a plain Attack posted the instant you tapped and the reply repainted the bar — so the single
// most-pressed button in the game had no animation at all. You did not see a swing, you saw a number change.
//
// Anticipation is not decoration. It is the half of a hit that tells you a hit is coming, and without it the
// impact has nothing to land against. Lengths are per command: a swing is quick, a skill earns its cinematic.
//
// HALVED, because anticipation stops being anticipation once you know exactly what is coming. 420ms is a
// generous draw-back the first ten times and a toll every time after; 220 still reads as a swing — the arWind
// keyframe plays over whatever it is given — and it is now short enough that the server's reply almost always
// lands inside it, which is what makes the whole exchange feel immediate rather than merely faster.
//
// Guard drops least: it is the one command with no follow-through to watch, so it was already near the floor.
// How the transcript is paced on screen. PLAY_SCALE turns fight-seconds into milliseconds; the clamps keep a
// very slow or very fast pair watchable either way, and PLAY_OPEN_MS is the beat before the first blow so the
// two fighters are on screen before anything happens to them.
// SLOWED DELIBERATELY. A fast pair traded blows at the 260ms floor — four swings a second, which is quicker
// than the eye can attach a number to a body, and the whole exchange was over before a thumb had left the
// glass. Luke: "attacks are too quick... translate down attack speed a bit." The floor is what actually
// governs a fast fight, so that is what moved most.
const PLAY_SCALE = 1000;
const PLAY_MIN_MS = 430;
const PLAY_MAX_MS = 1100;
const PLAY_OPEN_MS = 700;

// How long a resolved beat owns the screen before anything else is allowed to start. This is what stops your
// own result and their incoming telegraph from being on screen at the same time — which they were, in the same
// hundred pixels, on every single exchange.
//
// 900 -> 1500. The window has to outlast the thing it is protecting, and it did not: the damage number now
// holds for about a second before it drifts, so at 900 their telegraph arrived while your own hit was still
// mid-air. A beat you cannot read is not faster, it is just gone.
// 1500 -> 1050. Still comfortably longer than the ~900 that was measured as too short (their telegraph used
// to arrive while your own hit was still mid-air), and it is now the hit-stop and the damage float that carry
// the moment rather than a hold.
const RESULT_MS = 1050;

// The freeze on contact. Every fighting game made since Street Fighter II holds both fighters still for a few
// frames at the moment of impact; it is most of why a hit reads as a hit rather than a position change.
// A touch longer than the classic 6-8 frames, because this fight is watched rather than played frame by
// frame — the freeze is the cue to LOOK, not a combo window.
const HITSTOP_MS = 170;
// ── HOW LONG A COUNTER WAITS ─────────────────────────────────────────────────────────────────────────────────
// Long enough that their blow has landed and the recoil has been SEEN, short enough that it still reads as an
// answer to it rather than a second unrelated event. Roughly the length of the recoil animation (.36s) plus a
// held breath.
const COUNTER_BEAT_MS = 420;
// ── HOW LONG EACH PART OF A BEAT OWNS THE SCREEN ─────────────────────────────────────────────────────────────
// One table, so pacing is a decision rather than nine hardcoded delays scattered through a builder. A blow is
// the loudest thing and gets the longest hold; a block or a drink is a punctuation mark.
const EVENT_MS = { hit: 300, crit: 380, counter: 380, riposte: 300, thorn: 260, bleed: 260, burn: 260, drink: 200, block: 180, ward: 180, miss: 240, default: 240 };
// After the first two events the rest compress, so a busy exchange stays readable without the fight dragging:
// eight events at full length would be 2.2s a beat and 16s a fight.
const SQUEEZE = 0.62;
const BEAT_BUDGET_MS = 1200;
// ── A COUNTER DRAWS BACK BEFORE IT LANDS ─────────────────────────────────────────────────────────────────────
// The recoil reads instantly because it is a red flash AND a shove; the lunge was only a shove, so a counter
// looked soft next to the blow it answers. A blow needs an anticipation to hit against — the same reason every
// command you press has a wind-up. Short: this is a punish, not a cast.
const COUNTER_WIND_MS = 150;
// Which events make somebody flinch — the ones that move a health bar.
const DAMAGE_KINDS = new Set(["hit", "crit", "counter", "riposte", "thorn", "bleed", "burn"]);
// The engine's vocabulary against the pop stylesheet's.
const POP_KIND = { hit: "dmg", crit: "crit", counter: "counter", riposte: "thorn", thorn: "thorn", bleed: "bleed", burn: "burn", drink: "heal", block: "block", ward: "ward", miss: "miss" };

const ELEMENT_COLOR = {
    fire: "#ff6b3c", water: "#4aa3ff", earth: "#6ad07a", storm: "#ffd75e", light: "#fff0a8", shadow: "#b061ff",
};

// The sound of a cast, by archetype — so a spell and a hammer-blow are told apart with your eyes shut.
// The synthesis itself lives in arena-audio.js; this is only the mapping from a move to its voice.
function castSound(kind, element) {
    switch (kind) {
        // The two new voices. Freeze is the loudest thing in the kit on purpose — it costs somebody a turn.
        case "freeze": return Sfx.freeze();
        case "disarm": return Sfx.disarm();
        case "rend": return Sfx.burn();
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
            {/* A support skill costs no beat, and that is the single most useful thing to know while choosing
                one — so it is a chip on the card rather than a sentence in the description, and it is read off
                the ability itself: tree skills carry no `effect` object to hang a tag on. */}
            {e.tags?.length || ab.free ? (
                <span className="sk-tags">
                    {ab.free ? <i className="sk-tag is-free">Keeps your turn</i> : null}
                    {(e.tags || []).filter((t) => t.t !== "Keeps your turn").map((t) => <i key={t.t} className={`sk-tag is-${t.k}`}>{t.t}</i>)}
                </span>
            ) : null}
            <span className="sk-foot">{ab.from} · cools {ab.cooldown || 0} turns</span>
        </span>
    );
}

// ── THE BAR ──────────────────────────────────────────────────────────────────────────────────────────────────
// A fighter's name, affinity and health, in a band that NEVER moves. This used to be stacked on top of the
// hero inside the stage — which meant the camera push-in during a cast scaled and slid it too, so on every
// single skill the two name plates drifted across each other and printed one name on top of the other. A HUD
// that reads the state of the fight cannot be part of the shot.

// ── WHAT IS ON EACH FIGHTER, AND WHAT IT IS DOING ────────────────────────────────────────────────────────────
// Every lingering effect in the ring, described from the ENGINE'S OWN CONSTANTS rather than retyped — a number
// in prose is a number that goes stale the first time somebody retunes it.
//
// Luke: "if im taking dot damage whether it be burn bleed or otherwise there should be an icon for each dot
// type active like a debuff icon ... so I can see what debuffs are on me and inspect them as well as see how
// many turns until they expire and be able to click them for more details. both on me and on the enemy."
const pct = (n) => `${Number((n * 100).toFixed(1))}%`;
const STATUS_KINDS = {
    // The old icon was a marshmallow on a stick; at 12px it read as a slice of toast.
    burn:    { Icon: GiFlame,          label: "Burning",        tone: "fire",
               what: () => `Takes ${pct(REND_PER_TURN)} of max health at the end of every turn. Stacks.` },
    sunder:  { Icon: GiCrackedShield, label: "Guard stripped", tone: "bad",
               what: () => `${pct(SUNDER_CUT)} of their damage reduction is gone while it lasts.` },
    dread:   { Icon: GiTerror,        label: "Dread",          tone: "bad",
               what: () => `Your damage is cut by ${pct(DREAD_CUT)}.` },
    snare:   { Icon: GiChainedHeart,  label: "Chained",        tone: "bad",
               what: () => `${pct(SNARE_ACC)} off your accuracy — you will miss more.` },
    bound:   { Icon: GiTombstone,     label: "Gravebound",     tone: "bad",
               what: () => `Your Guard banks only ${pct(BIND_CUT)} of what it should.` },
    branded: { Icon: GiSpikedHalo,    label: "Branded",        tone: "mark",
               what: () => "Every blow they land on you is a guaranteed crit." },
    doom:    { Icon: GiRingingBell,   label: "The Bell",       tone: "doom",
               what: () => `When it finishes counting down they hit for ${DOOM_MULT}x.` },
    frenzy:  { Icon: GiAngryEyes,     label: "Their frenzy",   tone: "bad",
               what: () => "They are swinging faster than they should." },
    // ── THE TWO NEW ONES ── a lost turn and a lost guard are the biggest things that can happen to you in
    // a bout, so neither is allowed to be only a line in the log. Same chip, same inspect, same countdown
    // as every other effect — that is the whole point of this registry existing.
    // A WOUND, NOT A FIRE. `rend` means to tear and it used to announce itself as burning — an NPC's
    // "Ragged Cut" told you that you were on fire. Its own track, its own colour, and it says the one thing
    // that makes it different from a burn.
    bleed:   { Icon: GiDroplets,      label: "Bleeding",       tone: "blood",
               what: () => `Takes ${pct(BLEED_PER_TURN)} of max health every turn, and it goes STRAIGHT to health — a guard does not stop it. Stacks.` },
    frozen:  { Icon: GiIciclesAura,       label: "Frozen",         tone: "ice",
               what: () => "Solid. The next turn is lost — the beat passes without an action." },
    noguard: { Icon: GiCrackedShield, label: "Guard shattered", tone: "ice",
               what: () => "No guard can be raised at all while this lasts." },
};

// The effects riding a given fighter, in the order they matter. `you` reads the ones the OPPONENT has put on
// you; `them` reads the ones you have put on them.
function statusesFor(bout, side) {
    if (!bout) return [];
    const out = [];
    const add = (kind, turns, extra) => { if (turns > 0 || turns === true) out.push({ kind, turns: turns === true ? null : turns, ...extra }); };
    if (side === "them") {
        if (bout.bleed?.turns > 0) add("burn", bout.bleed.turns, { dmg: bout.bleed.dmg, stacks: bout.bleed.stacks });
        if (bout.gash?.turns > 0) add("bleed", bout.gash.turns, { dmg: bout.gash.dmg, stacks: bout.gash.stacks });
        add("sunder", Number(bout.sunder) || 0);
        add("frozen", Number(bout.foeFrozen) || 0);
        add("noguard", Number(bout.foeNoGuard) || 0);
        return out;
    }
    if (bout.foeBleed?.turns > 0) add("burn", bout.foeBleed.turns, { dmg: bout.foeBleed.dmg, stacks: bout.foeBleed.stacks });
    if (bout.foeGash?.turns > 0) add("bleed", bout.foeGash.turns, { dmg: bout.foeGash.dmg, stacks: bout.foeGash.stacks });
    add("sunder", Number(bout.foeSunder) || 0);
    add("frozen", Number(bout.frozen) || 0);
    add("noguard", Number(bout.noGuard) || 0);
    add("dread", Number(bout.dread) || 0);
    add("snare", Number(bout.snare) || 0);
    add("bound", Number(bout.bound) || 0);
    if (bout.branded) add("branded", true);
    if (bout.doomReady) add("doom", true); else add("doom", Number(bout.doom) || 0);
    add("frenzy", Number(bout.foeFrenzy) || 0);
    return out;
}

// One chip per effect: its icon, and the turns it has left. Tapping one opens what it actually does.
function StatusRow({ list, side, onPick }) {
    if (!list.length) return null;
    return (
        <span className={`ar-status is-${side}`}>
            {list.map((s) => {
                const def = STATUS_KINDS[s.kind];
                if (!def) return null;
                const { Icon } = def;
                return (
                    <button type="button" key={s.kind} className={`ar-stat is-${def.tone}`} onClick={() => onPick(s)}
                        aria-label={`${def.label}${s.turns ? `, ${s.turns} turns left` : ""} — tap for detail`}>
                        <Icon aria-hidden="true" />
                        {s.turns ? <b>{s.turns}</b> : null}
                    </button>
                );
            })}
        </span>
    );
}

function FighterBar({ f, hp, maxHp, element, foe = false, active = false, shield = 0, burn = null, bleed = null }) {
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
    // Bouts saved before classId was published carry none, and an NPC has no class at all — both simply
    // render no emblem rather than a broken image.
    const cls = f?.classId ? classById(f.classId) : null;
    const shieldPct = maxHp ? Math.min(1, shield / maxHp) * 100 : 0;

    return (
        <div className={`ar-bar${foe ? " is-foe" : ""}${active ? " is-active" : ""}${danger ? " is-danger" : ""}`
            + `${healing ? " is-healing" : ""}${burn?.turns > 0 ? " is-burning" : ""}${bleed?.turns > 0 ? " is-bleeding" : ""}`}>
            <span className="ar-namerow">
                {/* ── WHO YOU ARE SWINGING AT ─────────────────────────────────────────────────────────────
                    The row named them and stated their element, and said nothing about the one fact that
                    actually changes how the fight goes. A Warden and a Reaver play completely differently and
                    were indistinguishable here. The emblem is the class's own art, tinted by its own colour,
                    and it carries a title so it can be identified rather than merely recognised. */}
                {cls?.emblem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ar-cls" src={cls.emblem} alt="" title={cls.name} draggable="false"
                        style={{ "--cls": cls.color || "#9aa0a6" }} />
                ) : null}
                <b className="ar-fname">{f?.name}</b>
                {element ? (
                    <i className="ar-el-chip" style={{ "--el": ELEMENT_COLOR[element] || "#9aa0a6" }}>{element}</i>
                ) : null}
            </span>
            <span className="ar-hp">
                <u className="ar-hp-ghost" style={{ width: `${Math.max(ghost, frac) * 100}%` }} />
                <i style={{ width: `${frac * 100}%` }} />
                {/* A ward sits ON the bar as the slab of blue it will eat before your health does. It was a
                    chip of text elsewhere on screen, which is not where you are looking when a blow lands. */}
                {shieldPct > 0 ? <s className="ar-hp-shield" style={{ left: `${frac * 100}%`, width: `${shieldPct}%` }} /> : null}
            </span>
            <em className="ar-hpnum">
                {Math.max(0, hp)}<span>/{maxHp}</span>
                {shield > 0 ? <u>+{shield}</u> : null}
            </em>
            {/* ── WHAT IS EATING THIS BAR ──────────────────────────────────────────────────────────────────
                The burn chip's styles have been in this file all along with NOTHING rendering them, and the
                `burning` flag that lights the bar was never passed by either call site — so the whole
                treatment was dead CSS. Both tracks now show the same three facts on the fighter itself: what
                it costs a turn, how many turns are left, and the stack count when it is actually stacked. */}
            {burn?.turns > 0 ? (
                <em className="ar-burn" title={`Burning: ${burn.dmg} a turn for ${burn.turns} more`}>
                    <GiFlame aria-hidden="true" /><b>{burn.dmg}</b>
                    <u>{burn.turns}t</u>
                    {burn.stacks > 1 ? <s>x{burn.stacks}</s> : null}
                </em>
            ) : null}
            {bleed?.turns > 0 ? (
                <em className="ar-bleed" title={`Bleeding: ${bleed.dmg} a turn for ${bleed.turns} more — straight to health, a guard does not stop it`}>
                    <GiDroplets aria-hidden="true" /><b>{bleed.dmg}</b>
                    <u>{bleed.turns}t</u>
                    {bleed.stacks > 1 ? <s>x{bleed.stacks}</s> : null}
                </em>
            ) : null}
            <span className="ar-stats">
                <i title="Damage on a plain swing"><b>{Math.round(f?.damage || 0)}</b> dmg</i>
                <i title="Chance to crit, and what a crit multiplies by">
                    <b>{Math.round((f?.critChance || 0) * 100)}%</b> crit &times;{(f?.critMult || 2.5).toFixed(1)}
                </i>
                {/* BOTH sides, or the promise above is only half kept. An NPC's mitigation is `armour`, a
                    member's is `block` — two names for the same thing, and only theirs was ever printed. That
                    is the whole reason armour reads as a stat the enemy gets and you do not: a member turns
                    aside 34% before Footwork, usually MORE than the 6-26% an NPC carries, and nothing on your
                    half of the screen has ever said so. Summed, because a member defender has both. */}
                {/* One name, both sides. NPCs read 0 here — their toughness is health now, which the bar
                    already tells you about. */}
                {(f?.dr || 0) > 0 ? (
                    <i title="Share of every incoming blow that never lands"><b>{Math.round(f.dr * 100)}%</b> reduction</i>
                ) : null}
                {(f?.accuracy ?? 1) < 1 ? (
                    <i title="Chance a plain swing connects"><b>{Math.round((f.accuracy ?? 1) * 100)}%</b> acc</i>
                ) : null}
                {/* SPEED, ON BOTH SIDES. It decides exactly one thing — who takes the first beat — and the
                    bout said "you open" for a single beat without ever showing the number that caused it, so
                    the only honest answer to "how is speed determined" lived in the source. Printing both
                    makes the comparison the mechanic actually performs visible at a glance, and puts the
                    number next to the gear decision that moves it. SoullessShiitake asked, 2026-08-16. */}
                {/* ── TWO DECIMALS, BECAUSE THE WHOLE RANGE IS INSIDE ONE ─────────────────────────────────
                    Speed is ATTACKS PER SECOND and the live board runs 0.87 to 2.33, so rounding put eight of
                    the ten members on "1" — a 62% difference between the slowest and the fastest, shown as the
                    same number. Luke: "fights show 1 speed but i suspect this isnt accurate". It was not.

                    The tooltip was stale as well: it recited `10 + 0.3 per level + 0.5 per point of Ferocity`,
                    a formula arena-kit.js retired when auto-attack made speed the clock rather than a
                    tiebreak. It is the weapon's base attack speed plus ferocity now. */}
                {(f?.speed || 0) > 0 ? (
                    <i title="Attacks per second — how often you swing, and the faster fighter takes the first beat (a tie goes to the challenger). Your weapon's attack speed, plus 1 for every 500 Ferocity."><b>{f.speed.toFixed(2)}</b> speed</i>
                ) : null}
            </span>
        </div>
    );
}

// ── THE BODY ─────────────────────────────────────────────────────────────────────────────────────────────────
// The fighter itself, standing on the sand. Nothing here reads state — it only acts.
// `mirrored` and `foe` are SEPARATE, and conflating them is what broke the stage flip. One is a drawing
// question — which way is this sprite facing — and the other is a game question — which of these two is the
// opponent. They used to be the same class, which was fine while the enemy was always the flipped one. After
// the flip to the Final Fantasy arrangement (party right, enemy left) it meant `is-foe` marked YOU, so the
// cast spotlight dimmed the wrong fighter and every mirrored keyframe fired on the wrong body.
function FighterBody({ f, mirrored, foe = false, hurt, lunge, down, wind = 0, brace = false, dim = false,
    stunned = false, hasted = false, bleeding = false, bled = false }) {
    const cls = `ar-fighter${mirrored ? " is-mirror" : ""}${foe ? " is-foe" : ""}`
        + `${hurt ? " is-hurt" : ""}${lunge ? " is-lunge" : ""}`
        + `${down ? " is-down" : ""}${wind > 0 ? " is-wind" : ""}${brace ? " is-brace" : ""}${dim ? " is-dim" : ""}`
        + `${stunned ? " is-stunned" : ""}${hasted ? " is-hasted" : ""}${bleeding ? " is-bleeding" : ""}`;
    return (
        <div className={cls} style={wind > 0 ? { "--wind": `${wind}ms` } : undefined}>
            {/* The contact shadow is what puts a fighter ON the ground rather than in front of a wall. */}
            <span className="ar-shadow" aria-hidden="true" />
            {/* ── HASTE ── the glow goes BEHIND the body (z-index below .ar-hero) so it reads as light coming
                off them rather than a film over the sprite, and the motes drift up out of the same place. */}
            {hasted ? (
                <span className="ar-haste" aria-hidden="true">
                    <span className="ar-haste-glow" />
                    {Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} className="ar-haste-mote" style={{ "--i": i }} />
                    ))}
                </span>
            ) : null}
            {f?.sprite ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ar-hero" src={f.sprite} alt="" draggable="false" />
            ) : <span className="ar-hero ar-noface" aria-hidden="true" />}
            {/* ── STUN ── the swirl sits ABOVE the head and the word sits above that. Both are on top of the
                sprite, because the point of the state is that you can see at a glance this fighter is not
                going to act. */}
            {stunned ? (
                <span className="ar-stun" aria-hidden="true">
                    <span className="ar-stun-swirl">
                        <i /><i /><i />
                    </span>
                    <b className="ar-stun-word">STUNNED!</b>
                </span>
            ) : null}
            {hasted ? <b className="ar-haste-word" aria-hidden="true">HASTE!</b> : null}
            {/* ── BLEEDING ── the drops fall while the wound is open; the word only fires on the blow that
                opened it, so a three-tick bleed does not shout at you three times. */}
            {bleeding ? (
                <span className="ar-bleed" aria-hidden="true">
                    <span className="ar-bleed-glow" />
                    {Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} className="ar-bleed-drop" style={{ "--i": i }} />
                    ))}
                </span>
            ) : null}
            {bled ? <b className="ar-bleed-word" aria-hidden="true">BLEED!</b> : null}
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
// ── WHAT JUST HAPPENED ───────────────────────────────────────────────────────────────────────────────────────
// The end of a bout is the payoff for ten rounds of decisions, and it was a line of text and a button — this
// component gated on `recap.rank`, a field the move to Victory Points deleted, so every fight since has fallen
// through to the bare stub. Nothing about the fight itself has EVER been reported: you were told you won and
// nothing about how.
//
// Three things, in the order you care about them:
//   THE POINTS   — the number that moved your standing, counting up, plus where it left you.
//   THE FEATS    — named things you did, which is the only place performance is ever acknowledged.
//   THE FIGHT    — damage dealt and taken, your biggest blow, crits, what your guard actually stopped.
// Nothing in here may throw: a crash while this is mounted leaves a scroll-locked overlay with no way off it.
function Recap({ bout, busy, onClose }) {
    const r = bout?.recap || null;
    useScrollLock(true);
    const won = Boolean(bout?.won);
    const tint = won ? "#ffd75e" : "#ff6f7d";

    // ── THE POINTS, COUNTING UP ── a number that lands already-final is just a receipt.
    const gain = Number(r?.vpGain) || 0;
    const [shown, setShown] = useState(0);
    useEffect(() => {
        if (!gain) return undefined;
        const step = Math.max(1, Math.round(gain / 18));
        const t = setInterval(() => setShown((n) => (n + step >= gain ? gain : n + step)), 45);
        return () => clearInterval(t);
    }, [gain]);
    useEffect(() => { if (gain && shown === gain) Sfx.tick(4); }, [shown, gain]);

    // ── THE FIGHT, READ OFF THE LOG ── these are facts about what you just did, and none of them have ever
    // been shown anywhere. The log is the only record and it scrolls away under the deck.
    const tally = (() => {
        const log = bout?.log || [];
        let dealt = 0, taken = 0, blocked = 0, crits = 0, healed = 0;
        let best = { n: 0, name: null };
        for (const l of log) {
            const mine = l.who === "you";
            if (mine && l.damage > 0) {
                dealt += l.damage;
                if (l.damage > best.n) best = { n: l.damage, name: l.ability || (l.grade === "burn" ? "Burn" : "Strike") };
            }
            if (!mine && l.damage > 0) taken += l.damage;
            blocked += (l.blocked || 0) + (l.soaked || 0);
            if (mine && l.crit) crits += 1;
            healed += l.healed || 0;
        }
        return { dealt, taken, blocked, crits, healed, best };
    })();

    // The escape hatch above, held back so it cannot be the thing you tap on the way past.
    const [hatch, setHatch] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setHatch(true), 7000);
        return () => clearTimeout(t);
    }, []);

    const feats = Array.isArray(r?.feats) ? r.feats : [];
    // ── A RAID IS PAID BY THE RAID, AND MUST BE REPORTED BY IT TOO ───────────────────────────────────────
    // A town bout earns no VP, no laurels, no streak and no feats — its spoils are xp/coin/loot from
    // duelRaidEnemy, hung on `recap.raid`. This screen only ever knew how to read the Arena's economy, so it
    // rendered "+0 Victory Points", an empty reward list and "Streak 0" over a fight that had in fact just
    // paid out. Members read that, correctly, as having been given nothing.
    const raid = r?.town ? (r.raid || null) : null;
    // ── AND A THING OFF THE LINE IS PAID BY FISHING ──────────────────────────────────────────────────────
    // Identical in shape to the raid case above and here for identical reasons: payFishingMonster hangs the
    // spoils on `recap.haul`, and this screen only knew how to read the Arena's own economy. A Kraken paid
    // gold, XP and a chest, and the recap said "+0 Victory Points · Streak 0" over it.
    const haul = r?.fishing ? (r.haul || null) : null;
    const reward = raid ? raid.reward : haul || r?.reward || bout?.reward || null;
    const loot = raid ? (raid.loot || [])
        : haul?.chest ? [{ kind: "chest", label: `${haul.chest[0].toUpperCase()}${haul.chest.slice(1)} Chest`, rarity: "off the line" }]
            : [];

    return (
        <Portal>
        {/* The backdrop and the corner button live OUTSIDE the card on purpose, so they survive anything
            going wrong inside it. This screen has twice been a dark sheet with nothing to press. */}
        <div className="ar-recap" role="dialog" aria-modal="true"
            style={{
                "--tint": tint,
                position: "fixed", inset: 0, zIndex: 10100,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 18, overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}>
            {/* ── THE HATCH IS NOT A SKIP BUTTON ──────────────────────────────────────────────────────────
                A corner "Close" sitting above the card, plus a backdrop that dismissed on any tap, meant the
                recap could be gone before it had been read — Luke: "the button before it lets me skip the
                modal which I dont like". The backdrop no longer dismisses at all, and the corner button is
                held back for a few seconds so the card's own control is the way out of a normal fight.
                It still ARRIVES, because the reason it exists has not gone away: this screen has twice been a
                dark sheet with nothing to press, and a member stuck on one needs something more than advice. */}
            {hatch ? (
                <button type="button" className="ar-recap-x" onClick={(e) => { e.stopPropagation(); onClose(); }}
                    aria-label={raid ? "Back to the plaza" : r?.fishing ? "Back to the water" : "Back to the ladder"}>Close</button>
            ) : null}
            <div className="ar-recap-card" onClick={(e) => e.stopPropagation()}>
                <div className="ar-rays" aria-hidden="true">
                    {Array.from({ length: won ? 24 : 12 }).map((_, i) => (
                        <span key={i} style={{ "--a": `${i * (360 / (won ? 24 : 12))}deg`, animationDelay: `${(i % 6) * 0.05}s` }} />
                    ))}
                </div>

                {/* ── FIRST IN THE DEN ────────────────────────────────────────────────────────────────────
                    A world-first on the Long Road was announced to global chat and to nobody else, so the one
                    member who had actually earned it saw exactly what everybody standing outside the plaza saw:
                    nothing. This is the moment it belongs to. Above the Victory kicker on purpose — it is the
                    bigger fact, and a hundred-rung ladder only hands it out a hundred times ever. */}
                {r?.roadFirst ? (
                    <div className="ar-first">
                        <span className="ar-first-kick">First in the Den</span>
                        <b>{r.roadFirst.opensHouse
                            ? `You broke open ${r.roadFirst.house}`
                            : `Rung ${r.roadFirst.rung} — nobody has stood further`}</b>
                        <em>{r.roadFirst.opensHouse
                            ? "A stretch of the Road nobody had touched is open behind you. The Den has been told."
                            : "You are the first member of the Den ever to take it. The plaza has been told."}</em>
                    </div>
                ) : null}

                <span className="ar-recap-kick">{won ? "Victory" : "Defeated"}</span>
                <b className="ar-recap-title">
                    {won ? `You beat ${bout?.foe?.name || "them"}` : `${bout?.foe?.name || "They"} put you down`}
                </b>
                <p className="ar-recap-sub">
                    {r?.rounds || bout?.beat || 0} round{(r?.rounds || 0) === 1 ? "" : "s"}
                    {raid ? " in the plaza" : " in the ring"}
                    {r?.npcTier ? ` · Gauntlet tier ${r.npcTier}` : ""}
                    {raid?.gradeLabel ? ` · ${raid.gradeLabel}` : ""}
                </p>

                {/* THE SPOILS — a raid's headline is what it dropped, not a standing it does not move. */}
                {raid ? (
                    <div className="ar-vp">
                        <span className="ar-vp-num">{reward?.coin ? `+${money(reward.coin)}` : "—"}</span>
                        <span className="ar-vp-lab">{reward?.coin ? "Gold" : "No spoils this time"}</span>
                    </div>
                ) : haul || r?.fishing ? (
                    /* A hooked monster pays no Victory Points either — the headline is what it was carrying. */
                    <div className="ar-vp">
                        <span className="ar-vp-num">{haul?.gold ? `+${money(haul.gold)}` : "—"}</span>
                        <span className="ar-vp-lab">{haul?.gold ? "Gold" : "It slipped the line"}</span>
                    </div>
                ) : (
                    /* THE POINTS. */
                    <div className="ar-vp">
                        <span className="ar-vp-num">+{money(shown)}</span>
                        <span className="ar-vp-lab">Victory Points</span>

                    </div>
                )}

                {/* Where the wave stands, because "is this thing nearly dead" is the question you tap for, and
                    because more than one member did not realise a raid HAS more than one fight in it. */}
                {raid?.cleared ? (
                    <div className="ar-unlock">The wave is cleared — the plaza is yours</div>
                ) : raid?.wave ? (
                    <div className="ar-unlock">Wave {raid.wave} still standing</div>
                ) : null}

                {loot.length ? (
                    <div className="ar-feats">
                        {loot.map((l, i) => (
                            <span key={`${l.kind}-${l.itemId || l.tier || i}`} className="ar-feat" style={{ "--el": "#8fd6a2" }}>
                                <b>{l.label || l.kind}</b>
                                {/* A chest was captioned "off the raid" unconditionally, so the one a hooked
                                    monster pays — which arrives here carrying its own caption — was labelled
                                    as coming from a plaza raid it had nothing to do with. The row's own
                                    caption wins; the raid's chests carry none and read as they always did. */}
                                <em>{l.rarity || (l.kind === "chest" ? "off the raid" : "salvage")}</em>
                            </span>
                        ))}
                    </div>
                ) : null}

                {/* Paid nothing BECAUSE YOU ARE CAPPED is a different sentence from paid nothing, and only one
                    of them is a bug. Saying so is the whole reason duelRaidEnemy returns the flag. */}
                {raid?.capped ? (
                    <p className="ar-recap-sub">The raid&apos;s spoils are done for today — the fight still counts.</p>
                ) : null}

                {r?.npcUnlocked ? (
                    <div className="ar-unlock">Tier {r.npcTier + 1} unlocked</div>
                ) : null}

                {/* THE FEATS — the only place the game ever says HOW you fought. */}
                {feats.length ? (
                    <div className="ar-feats">
                        {feats.map((f) => (
                            <span key={f.id} className="ar-feat" style={{ "--el": f.color || "#ffd75e" }}>
                                <b>{f.name}</b>
                                <em>{f.blurb}</em>
                                <u>+{f.laurels}<i>laurels</i></u>
                            </span>
                        ))}
                    </div>
                ) : null}

                {/* THE FIGHT. */}
                <div className="ar-tally">
                    <span><i>Damage dealt</i><b>{money(tally.dealt)}</b></span>
                    <span><i>Damage taken</i><b>{money(tally.taken)}</b></span>
                    {tally.best.n > 0 ? <span><i>Biggest blow</i><b>{tally.best.name} · {money(tally.best.n)}</b></span> : null}
                    {tally.blocked > 0 ? <span><i>Turned aside</i><b>{money(tally.blocked)}</b></span> : null}
                    {tally.crits > 0 ? <span><i>Criticals</i><b>{tally.crits}</b></span> : null}
                    {tally.healed > 0 ? <span><i>Health recovered</i><b>{money(tally.healed)}</b></span> : null}
                </div>

                <div className="ar-recap-rows">
                    {reward?.laurels ? <span><i>Laurels</i><b>+{money(reward.laurels)}</b></span> : null}
                    {reward?.gold ? <span><i>Gold</i><b>+{money(reward.gold)}</b></span> : null}
                    {reward?.coin ? <span><i>Gold</i><b>+{money(reward.coin)}</b></span> : null}
                    {reward?.xp ? <span><i>XP</i><b>+{money(reward.xp)}</b></span> : null}
                    {/* ── THE XP THAT BUYS SKILL POINTS ───────────────────────────────────────────────────
                        Every bout pays arena XP — the currency behind your class level and every point in the
                        tree — and this card has never once said so. It is the ONLY payout a loss makes, which
                        is why a defeat read as having earned nothing at all: the row for it did not exist.
                        Luke, on the defeat card: "failure modal doesnt show exp". */}
                    {reward?.arenaXp ? <span><i>Arena XP</i><b>+{money(reward.arenaXp)}</b></span> : null}
                    {/* No streak line on a raid: the Arena's streak is not touched by a plaza fight, so printing
                        "Streak 0" under one was the screen reporting a number that does not apply as a loss. */}
                    {raid || haul ? null : (
                        <span><i>Streak</i><b>{r?.streak || 0}{(r?.streak || 0) > 0 && r.streak >= (r.bestStreak || 0) ? " · best" : ""}</b></span>
                    )}
                </div>

                <div className="ar-recap-foot">
                    <button type="button" className="ar-btn ar-recap-go" disabled={busy} onClick={onClose}>
                        {raid ? "Back to the plaza" : r?.fishing ? "Back to the water"
                            : won ? "Next fight" : "Back to the ladder"}
                    </button>
                </div>
            </div>
        </div>
        </Portal>
    );
}

/**
 * The Arena page — and, in `boutOnly` mode, the fight screen ON ITS OWN, mounted over another page.
 *
 * The plaza needs the fight, not the Arena. It used to get there by navigating to /marketplace/arena, on the
 * reasoning that one bout UI is better than two — which was right about the UI and wrong about the address.
 * A raid is a thing you do IN the town; sending someone to another page to do it lost them the plaza, lost
 * them the wave, and left them somewhere with no way back.
 *
 * `boutOnly` renders nothing at all unless a bout is live, so the town can mount this permanently and have it
 * appear only for the fight. The fight is already `position: fixed; inset: 0` (see .ar.ar-fight), so it
 * covers whatever hosts it without that host having to arrange anything.
 *
 * `onLeave` replaces the walk back: the host closes the overlay and refreshes its own state. Without it this
 * falls back to navigating, which still matters for a raid bout opened before any of this shipped and found
 * in progress on the Arena page.
 */
export default function ArenaClient({ initial, boutOnly = false, onLeave = null }) {
    const [st, setSt] = useState(initial);
    const [busy, setBusy] = useState(false);
    // ── WHO TOOK IT, AND HOW HARD ── two different questions, and they used to share one number.
    // `shake` was 1 for "you landed a normal hit", 2 for "you landed a crit" AND for "you took a normal hit",
    // 3 for "you took a heavy one" — so the fighters, which read it as `hurt={shake >= 2}` for you and
    // `lunge={shake >= 2}` for them, played the exchange BACKWARDS on every critical you landed: your own
    // hero snapped back and flashed red while the enemy lunged into you. Landing your best hit of the fight
    // looked like taking one. Two pieces of state, because they are two facts.
    const [shake, setShake] = useState(0);          // 0 = still, 1 = a hit, 2 = a heavy one. Intensity only.
    const [hitSide, setHitSide] = useState(null);   // "you" | "them" — who is on the receiving end of it.
    const [blockReady, setBlockReady] = useState(false);  // the telegraph has played; the block ring may start
    const [pop, setPop] = useState(null);         // floating damage number off the last landed blow
    const [beatQueue, setBeatQueue] = useState(null);  // the beat's events, played one at a time
    const [counterWind, setCounterWind] = useState(null); // "left" | "right" — who is drawing back to strike
    const [fx, setFx] = useState(null);           // the particle burst for the beat that just resolved
    const [castDone, setCastDone] = useState(true); // the cast cinematic has finished; the blow may land
    // `pending` and `menu` are gone with the deck — there is no command to commit to and no submenu.
    const [clash, setClash] = useState(null);
    // The counter's sentence, held back until the counter actually plays — see the .ar-beat line.
    const [counterHeld, setCounterHeld] = useState(false);
    const [err, setErr] = useState(null);
    const [stop, setStop] = useState(false);      // hit-stop: the whole stage freezes for a moment on contact
    const [reading, setReading] = useState(false);// their move is named on screen and you are reading it
    const [muteOn, setMuteOn] = useState(false);
    // The ladder screen carries three jobs now — who to fight, how you fight, and what you have trained. One
    // scroll for all three was already long before the tree existed.
    const [tab, setTab] = useState("fight");
    // Which stretch of the Road is unfolded. NULL rather than a key, deliberately: the ladder arrives with the
    // state, so seeding a house here would seed it from data that has not landed yet and leave the wrong one
    // open forever (a `defaultOpen` prop only ever seeds useState once, on mount). Null means "wherever I am",
    // resolved at render off the live data; the empty string means "I folded them all up".
    const [openHouse, setOpenHouse] = useState(null);
    const [boardAll, setBoardAll] = useState(false);
    const [upgFlash, setUpgFlash] = useState(null);
    const prev = useRef({ hp: null, foeHp: null, round: null });
    // How much of the log has already been turned into floating numbers. Without this the screen only ever
    // showed the LAST line of an exchange — see the effect that reads it.
    const lastLogSeen = useRef(0);
    const [statusPick, setStatusPick] = useState(null);   // the effect whose detail card is open
    // Which of THEIR skills is being read. Their abilities come out of the same builder yours do, so the card
    // is the same card — see SkillFace.
    const [foePick, setFoePick] = useState(null);
    const resultAtRef = useRef(0);
    const setResultAt = (v) => { resultAtRef.current = v; };
    const logEnd = useRef(null);
    const ringRef = useRef(null);
    // The blow-by-blow, off by default — see the drawer note down in the render.
    const [logOpen, setLogOpen] = useState(false);
    // What came out of the last crate, and which one is mid-open — the lid has to shake before it answers.
    const [opening, setOpening] = useState(null);
    const [opened, setOpened] = useState(null);
    // False while the crate is still shaking, true once it has burst. Reset every time a new crate opens.
    const [crateBurst, setCrateBurst] = useState(false);
    // Stepped out of a fight that is still standing. Purely local: the bout is server-side and nothing about
    // walking away touches it, which is the whole reason this can exist at all.
    const [stepped, setStepped] = useState(false);
    // The refusal banner, so a NO can be scrolled to the person who caused it rather than painted off-screen.
    const errRef = useRef(null);
    // Two-tap confirm on the forfeit. It costs a loss, so it must not be reachable by a mis-tap.
    const [giveUp, setGiveUp] = useState(false);
    // ── THE END OF A FIGHT NEEDS A BEAT ──────────────────────────────────────────────────────────────────
    // The recap was rendered on `bout.over` directly, which meant it covered the screen on the same frame the
    // last blow landed. Everything built for that moment played underneath it and was never seen: the loser's
    // .6s fall to the sand, the verdict called across the ring, the victory sting. You won, and what you got
    // was a modal appearing over a fight you did not watch end.
    const [recapReady, setRecapReady] = useState(false);
    // The spell layer, driven imperatively. React state is the wrong tool for "play this burst now" — by the
    // time a re-render lands, the moment has gone.
    const fxRef = useRef(null);
    // Shake is applied to the PANEL so the fighters, the bars and the deck all move together. Shaking only
    // the canvas moves the magic and leaves the world still, which reads as a rendering fault.
    const shakeRef = useRef(null);
    const onShake = useCallback((x, y) => {
        const el = shakeRef.current;
        if (el) el.style.transform = x || y ? `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)` : "";
    }, []);

    // The stored mute preference, read after mount so the server and client markup agree.
    useEffect(() => { setMuteOn(isMuted()); }, []);


    // ── A BEAT, SPLIT IN TWO ─────────────────────────────────────────────────────────────────────────────
    // `act` fetches and applies in one breath, which is right for every action EXCEPT the one you press
    // hundreds of times. A beat needs the two halves apart so the fetch can overlap the wind-up animation
    // instead of queueing behind it (see the wind-up effect). `busy` is still raised for the whole flight, so
    // the buttons lock exactly as before and a double-tap cannot send two beats.
    // The in-flight guard is a REF, not the `busy` state, and both callbacks take no dependencies. If they
    // sendBeat / applyBeat are gone with the deck: there is no beat to send.
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
                // A REFUSAL IS NOT A FAILURE. "Try again" is the wrong thing to say to somebody the server
                // deliberately turned away — the road being walked in order is a rule, not a glitch, and
                // telling them to retry sends them tapping at a button that will never open.
                setErr(REFUSALS[r?.error]
                    || (r?.error ? `That didn't go through (${r.error}). Try again.` : "That didn't go through. Try again."));
                // ── AND TELL US WHICH REFUSAL IT WAS ─────────────────────────────────────────────────────
                // Luke: "the find a fight button is messed up, I keep clicking and nothing happens, it's super
                // transient." A refused tap has always looked identical to a dead button, and it leaves no
                // trace anywhere — the server records the state it returned, not that it turned somebody away,
                // so there is nothing to read afterwards and no way to tell a refusal from a dropped request.
                // `recovered` keeps it out of the admin push: this is a breadcrumb, not an alarm.
                try {
                    fetch("/api/client-error", {
                        method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
                        body: JSON.stringify({
                            path: `/marketplace/arena#${action}`, recovered: true,
                            message: `arena refused "${action}": ${r?.error || (r === null ? "no response (network)" : "no error field")}`,
                            ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
                        }),
                    }).catch(() => {});
                } catch { /* reporting a refusal must never become the second failure */ }
            }
            // The rank-up used to be its own overlay on a timer, stacked behind the result card. It lives
            // INSIDE the recap now — one modal, not two in sequence — so all that is left is the sting.
            /* The rank-up fanfare went with the rungs — there is no rung to climb. */
        } finally { setBusy(false); }
    }, [busy]);

    // A refusal you cannot see is a dead button. Whatever screen you are on and however far you have scrolled,
    // the sentence explaining the NO comes to you.
    useEffect(() => {
        if (!err || !errRef.current) return;
        try { errRef.current.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* older webviews */ }
    }, [err]);

    const raw = st?.bout || null;

    // ── PLAYBACK ─────────────────────────────────────────────────────────────────────────────────────────
    // A bout arrives already resolved: every crit, stun, block and counter was rolled server-side the moment
    // it started, and `log` is the transcript. Nothing here re-rolls anything — it steps through that list and
    // rebuilds the position as it goes, so what you watch is exactly what was scored.
    //
    // The log's `t` is in fight-seconds (1/speed), which is the RHYTHM: a fast fighter's blows genuinely come
    // closer together and that is worth keeping. It is scaled to real time and each gap clamped, so a fight
    // between two slow fighters does not become a slideshow and two fast ones do not blur into one frame.
    // The engine's transcript speaks in `me`/`foe` and carries no prose. The screen has always read
    // `you`/`them` with a sentence, a grade and a damage number — the floaters, the shake, the impact sounds
    // and the callout all key off those. So the entries are translated ONCE here rather than teaching six
    // render sites a second vocabulary.
    const logAll = useMemo(() => {
        const src = Array.isArray(raw?.log) ? raw.log : [];
        const foeName = raw?.foe?.name || "They";
        return src.map((e) => {
            const mine = e.who === "me";
            const who = mine ? "you" : "them";
            const n = Number(e.dmg) || 0;
            if (e.bleedTick) {
                return { ...e, who, damage: n, grade: "bleed",
                    text: mine ? `You bleed — ${n.toLocaleString()}.` : `${foeName} bleeds — ${n.toLocaleString()}.` };
            }
            if (e.stunnedSkip) {
                return { ...e, who, damage: 0, grade: "stun",
                    text: mine ? "You are stunned — the swing is lost." : `${foeName} is stunned and cannot swing.` };
            }
            const hits = Number(e.hits) || 1;
            const verb = hits > 1 ? `strikes ${hits} times` : "strikes";
            const head = mine ? (hits > 1 ? `You strike ${hits} times` : "You strike") : `${foeName} ${verb}`;
            const bits = [];
            if (e.crit) bits.push("critical");
            if (e.blocked) bits.push(e.blocked > 1 ? `${e.blocked} blocked` : "blocked");
            if (e.stunned) bits.push("stunned");
            if (e.hasted) bits.push("hasted");
            const tail = bits.length ? ` (${bits.join(", ")})` : "";
            return { ...e, who, damage: n, grade: e.crit ? "crit" : (e.blocked ? "block" : "hit"),
                text: `${head} — ${n.toLocaleString()}${tail}` };
        });
    }, [raw?.log, raw?.foe?.name]);
    const [shown, setShown] = useState(0);
    const boutKey = `${raw?.foe?.id || ""}:${logAll.length}`;
    const lastKey = useRef(null);
    useEffect(() => {
        if (lastKey.current === boutKey) return;
        lastKey.current = boutKey;
        setShown(0);   // a new fight always plays from the first blow
    }, [boutKey]);

    useEffect(() => {
        if (!logAll.length || shown >= logAll.length) return undefined;
        const here = logAll[shown];
        const prevT = shown > 0 ? logAll[shown - 1].t : 0;
        const gap = Math.max(0, (Number(here.t) || 0) - prevT);
        const ms = Math.max(PLAY_MIN_MS, Math.min(PLAY_MAX_MS, gap * PLAY_SCALE));
        const id = setTimeout(() => setShown((n) => n + 1), shown === 0 ? PLAY_OPEN_MS : ms);
        return () => clearTimeout(id);
    }, [logAll, shown]);

    // The position after the blows played so far. Recomputed rather than accumulated, so a scrub or a replay
    // can land anywhere without the health bars drifting out of step with the transcript.
    const played = useMemo(() => {
        if (!raw) return null;
        if (!logAll.length) return raw;
        let hp = raw.maxHp || 0;
        let foeHp = raw.foeMaxHp || 0;
        for (let i = 0; i < shown; i += 1) {
            const e = logAll[i];
            if (!e || !e.dmg) continue;
            // `who` is already translated to you/them by logAll above — testing for "me" here meant NOTHING
            // ever matched and every blow in the fight, both sides, came off the player's bar. The verdict
            // then announced a victory over a fighter at full health while your own bar read zero.
            //
            // And a BLEED TICK damages the fighter it is named for, not their opponent: it is their own wound
            // opening on their own swing, which is the one entry in the log that does not cross the ring.
            if (e.bleedTick) { if (e.who === "you") hp -= e.dmg; else foeHp -= e.dmg; continue; }
            if (e.who === "you") foeHp -= e.dmg; else hp -= e.dmg;
        }
        const done = shown >= logAll.length;
        const cur = logAll[Math.max(0, shown - 1)] || null;
        return {
            ...raw,
            hp: Math.max(0, hp),
            foeHp: Math.max(0, foeHp),
            // The verdict, the recap and every "it is finished" branch wait for the last blow to land.
            over: done && raw.over,
            log: logAll.slice(0, shown),
            // The round counter counts what has PLAYED, not what the whole transcript came to — it read
            // "Round 17" on the first blow of a seventeen-swing fight.
            beat: shown,
            stunned: Boolean(cur?.who === "foe" && cur?.stunned) || Boolean(cur?.who === "me" && cur?.stunnedSkip),
            hasted: Boolean(cur?.who === "me" && cur?.hasted),
            foeStunned: Boolean(cur?.who === "me" && cur?.stunned) || Boolean(cur?.who === "foe" && cur?.stunnedSkip),
            foeHasted: Boolean(cur?.who === "foe" && cur?.hasted),
            // The engine stamps the ticks still owed on every entry, so "is this fighter bleeding right now"
            // is read rather than reconstructed. The WORD fires only on the blow that opened the wound.
            bleeding: (cur?.meBleed || 0) > 0,
            foeBleeding: (cur?.foeBleed || 0) > 0,
            bled: Boolean(cur?.who === "foe" && cur?.bled),
            foeBled: Boolean(cur?.who === "me" && cur?.bled),
        };
    }, [raw, logAll, shown]);

    const bout = played;

    // ── LEAVING A FINISHED FIGHT, FROM WHEREVER YOU CAME IN ──────────────────────────────────────────────
    // One handler because there are TWO ways off this screen — the recap's button and the bare verdict
    // fallback that exists for when the recap does not render — and a raid fight has to return to the plaza
    // from both. Fixing only the pretty one leaves the stranding in place for exactly the case the fallback
    // was built for.
    //
    // Dismissed first and awaited: navigating straight off the tap unloads the page with the dismiss in
    // flight, and the finished bout stays in the row for the next visit to open on.
    const leaveBout = useCallback(async () => {
        // ── HOSTED FIGHTS HAND THEMSELVES BACK ───────────────────────────────────────────────────────────
        // Two pages mount this renderer over themselves: the plaza for a raid, and the deck for something you
        // hooked. Only the plaza was recognised here, so a finished monster fight ran `dismiss` and then took
        // the `!toTown` early return — the bout was cleared on the server and the overlay stayed on screen
        // with nothing left to fight. The rule is the same for both: if another page is hosting us, give the
        // fight back to it rather than navigating.
        const toTown = Boolean(bout?.town || bout?.recap?.town);
        const toDeck = Boolean(bout?.fishing || bout?.recap?.fishing);
        const hosted = toTown || toDeck;
        // ── LEAVE A FIGHT WHERE YOU STARTED IT ───────────────────────────────────────────────────────────
        // A raid already hands you back to the plaza; a rung dropped you on the Fight tab, which is not
        // where you were. Walking the Road is a sequence — beat one, look at the next — and the tab you
        // wanted is always the one you came from, so finishing a rung meant a tap back to The Road every
        // single time. Read off the foe rather than a flag we would have to remember to set.
        const toRoad = Boolean(bout?.foe?.ladder);
        await act("dismiss");
        if (toRoad) setTab("road");
        if (!hosted) return;
        // Hosted by the plaza: hand it back rather than going anywhere. Only a raid bout that somehow ends up
        // on the Arena page — one opened before this shipped, and found in progress — still has to walk.
        // Hand the finished bout back with it. The plaza needs the recap to know what that fight paid and
        // how many foes this member has now felled — it has no other way to find out, since the kill is
        // booked inside the arena engine.
        if (onLeave) onLeave(bout);
        else window.location.href = toDeck ? "/marketplace/sailing" : "/marketplace/town";
    }, [act, bout, onLeave, setTab]);

    // Nothing underneath a full-screen fight should move when you swipe — but ONLY while that fight is on
    // screen. The condition has to match the one that renders it (`bout && !stepped`, further down) or you get
    // the state this was in: step out of a bout to look at your card or spend a skill point, and the fight
    // unmounts while the lock stays on, leaving the whole Arena page frozen with no way to scroll it. The bout
    // is still open in that state by design — that is what the "Back to the fight" banner is for — so `bout`
    // alone was never the right test.
    useScrollLock(Boolean(bout) && !stepped);

    // Fall (.6s), then the flourish, then the card at 1.9s. Long enough to watch them go down and hear it
    // land; short enough that nobody taps the screen wondering whether it is stuck.
    useEffect(() => {
        if (!bout?.over) { setRecapReady(false); return undefined; }
        const won = Boolean(bout.won);
        // The sting goes with the FALL, not with the card — the sound is the thing that says it is over.
        const sting = setTimeout(() => { if (won) Sfx.victory(); else Sfx.lose?.(); }, 420);
        // A burst of light off the sand where the loser landed, on the canvas that already draws the spells.
        const burst = setTimeout(() => {
            fxRef.current?.play({ kind: won ? "surge" : "hurt", element: won ? "light" : "shadow",
                side: won ? "them" : "you", big: 1.4 });
        }, 520);
        const card = setTimeout(() => setRecapReady(true), 1900);
        return () => { clearTimeout(sting); clearTimeout(burst); clearTimeout(card); };
    }, [bout?.over, bout?.won]);

    // ── FIT THE FIGHT ON THE PHONE ───────────────────────────────────────────────────────────────────────
    // The ring was sized `min(74vh, 640px)`, which is a fraction of the WHOLE viewport — and this page puts
    // an announcement banner, the site nav and a tab strip above it, about 226px of chrome. Measured on real
    // device sizes with that chrome present, the command deck fell BELOW THE FOLD on every phone smaller than
    // a Pixel 7: iPhone SE by 52px, small Android by 33px, iPhone 14 by 6px. You had to scroll down, mid-bout,
    // to reach Attack. Most people play on a phone, so that is most people.
    //
    // So it is measured rather than assumed: scroll the ring up to where it will actually sit, then size it to
    // whatever is left below that. Re-run on resize and orientation change, because both move the answer.
// ── THE FIGHT IS A SCENE, NOT A PANEL ────────────────────────────────────────────────────────────────────
    // There used to be forty lines here that measured the sticky nav, scrolled the ring under it and sized the
    // ring to whatever was left. It fit exactly once — the instant the bout opened. A phone browser then moves
    // the goalposts constantly: the address bar collapses on the first swipe, the visual viewport changes with
    // no resize event, and any scroll at all slides the HP bars off the top while the height stays put. You
    // ended up with the bars OR the command deck, never both, and scrolled between them all fight.
    //
    // A fight is fixed to the viewport now, the way a ship battle is: nothing to scroll, nothing to measure,
    // and the sprites simply get the space that is left after the bars and the deck have taken theirs.


    // ── THE MUSIC ── it runs for exactly as long as a bout does, and its INTENSITY is your health. Losing is
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
        // Full health is a calm 0.3; on your last legs it is 1.
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
        // ── THE FREEZE STING ── fires on the beat the freeze LANDS and again on the beat it is paid, because
        // those are two separate events for whoever it happened to: the moment it hits, and the moment their
        // turn evaporates. Played outside the damage branches below — a freeze can land on a blow that also
        // dealt damage, and chaining it after `else if` would have silenced it exactly then.
        if (isNew && typeof last.text === "string") {
            if (/FROZEN|frozen solid|THE COLD TAKES YOU/i.test(last.text)) {
                Sfx.freeze();
                Haptic.crit();
                duck(0.5, 0.35);
            } else if (last.ability === "Shattered") {
                Sfx.disarm();
                Haptic.cast();
            }
        }

        if (p.hp != null && bout.hp < p.hp) {
            // YOU TOOK IT. Weight is the fraction of your whole bar this blow cost, which is what decides how
            // hard everything hits: the shake, the buzz, and how low and long the sound is.
            const w = Math.min(1, (p.hp - bout.hp) / Math.max(1, bout.maxHp * 0.22));
            setHitSide("you");
            setShake(w > 0.7 ? 2 : 1);
            setStop(true);
            Sfx.hurt(w);
            Haptic.hurt(w);
            duck(0.35, 0.2);
        }
        // ⚠️ NOT `else if`. Both bars can move in one exchange — you land a blow and their swing, their
        // riposte or a burn takes some of yours back. Chained, the blow you LANDED was silently dropped
        // whenever anything hit you in the same beat: no shake, no impact sound, nothing.
        if (p.foeHp != null && bout.foeHp < p.foeHp) {
            // YOU LANDED IT.
            const w = Math.min(1, (p.foeHp - bout.foeHp) / Math.max(1, bout.foeMaxHp * 0.22));
            setHitSide("them");
            setShake(crit || w > 0.7 ? 2 : 1);
            setStop(true);
            if (crit) { Sfx.crit(w); Haptic.crit(); duck(0.5, 0.3); }
            else { Sfx.impact(w); Haptic.hit(w); }
        } else if (isNew && last.grade === "ward") { Sfx.ward(); Haptic.cast(); }
        else if (isNew && last.grade === "guard") { Sfx.guard(); Haptic.cast(); }
        else if (isNew && last.grade === "item") { (last.item === "poultice" ? Sfx.heal : Sfx.refresh)(); Haptic.cast(); }
        else if (isNew && last.grade === "burn") { Sfx.burn(); }
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
        const t = setTimeout(() => { setShake(0); setHitSide(null); }, 360);
        const t2 = setTimeout(() => setClash(null), RESULT_MS - 80);
        const t3 = setTimeout(() => setStop(false), HITSTOP_MS);

        // (The counter's bespoke choreography lived here. It was the first event to get its own moment, and
        // the queue below generalises exactly that — so keeping it meant two players firing one blow: two
        // sounds, two shakes. One player owns the beat now.)
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
    // The wind-up effect is gone: it existed to play a chosen command and then send the beat.

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
    // The block window is gone with the brace.

    // THE CAST'S OWN EFFECT — fired while the camera is on whoever is casting, before the blow. Pure
    // spectacle (the damage still resolves later, off the server), so it is keyed to the declaration rather
    // than to a log entry. The SOUND is not fired here: it belongs to the start of the wind-up, where the
    // gesture begins, and playing it in both places double-struck every cast.
    // Nothing casts any more, so nothing tracks a cast.

    // Particles fire off the RESOLVED beat, same as the damage number — so an effect can never play for a
    // hit the server did not deal.
    useEffect(() => {
        const l = bout?.log?.length ? bout.log[bout.log.length - 1] : null;
        if (!l) return undefined;
        const mineNow = l.who === "you";
        // Look the move up on WHOEVER THREW IT. This used to read `mineNow && bout.me.abilities...`, which
        // short-circuits to false on their beat — so every enemy spell, bleed and flurry played the same
        // generic impact, and half the fight had no visual identity at all.
        const caster = mineNow ? bout.me?.abilities : bout.foe?.abilities;
        const thrown = l.ability ? (caster || []).find((a) => a.name === l.ability)?.kind : null;
        // A FREEZE IS ITS OWN PICTURE, and it has to be looked up before the grade is, because the log line
        // that lands one is an ordinary skill line — the freeze rides in its `extra`. Without this the most
        // expensive event in the game plays the same generic impact as any other spell.
        const froze = typeof l.text === "string" && /FROZEN|frozen solid|THE COLD TAKES YOU/i.test(l.text);
        const kind = froze ? "freeze"
            : l.ability === "Shattered" ? "disarm"
            : l.grade === "burn" ? "rend"
            : l.grade === "ward" ? (l.kind === "riposte" ? "riposte" : "ward")
                : l.grade === "guard" ? "ward"
                    : l.grade === "item" ? "heal"
                        : thrown || "strike";
        // Who it HAPPENED TO. A ward, a surge and a drink are things you do to yourself; a blow and the burn
        // it left behind land on the other one.
        const onSelf = ["ward", "heal", "surge", "guard"].includes(kind);
        // ── AND IT HAPPENS TO WHOEVER DID IT ─────────────────────────────────────────────────────────────
        // `onSelf` pinned the effect to "you" — YOUR side of the sand — whoever had acted. So the opponent
        // drinking a potion put the green bloom over your hero, and so did their ward, their surge and their
        // guard. The self-actions are exactly the ones where the actor IS the target, which is the one case
        // the old expression got backwards.
        //
        // The burn clause was wrong the same way. A burn logs `who` as the fighter who APPLIED it, so
        // `|| l.grade === "burn"` forced every tick onto the foe — including the burn ticking on YOU, whose
        // flames played over the enemy who lit them. With `who` meaning the actor in both cases, burns need
        // no special case at all: they land on the other one, like any other blow.
        const target = onSelf ? (mineNow ? "you" : "them") : (mineNow ? "them" : "you");
        // Scale the spectacle by how much of the target's bar it actually took, so a graze and a
        // fight-ender are not the same picture.
        const pool = target === "you" ? bout.maxHp : bout.foeMaxHp;
        const element = mineNow ? bout.me?.element : bout.foe?.element;

        // ── A FLURRY FIRES THREE TIMES ───────────────────────────────────────────────────────────────────
        // The effect used to play once per ACTION, so Rampage — three blows, the entire identity of the move
        // — produced one burst scaled by the combined damage, which is indistinguishable from a single big
        // hit. The particle system was built precisely so a skill could feel like what it is; playing it once
        // threw that away for the one skill that needed it most.
        //
        // Each landed blow gets its own burst, staggered to match the damage numbers so the sound, the float
        // and the flash are one event repeated rather than three things happening at slightly wrong times.
        // A missed blow gets nothing — the absence IS the feedback.
        const each = Array.isArray(l.each) ? l.each : null;
        const timers = [];
        if (each && each.length > 1) {
            each.forEach((n, i) => {
                if (!(n > 0)) return;
                const p = 0.5 + Math.min(1.2, n / Math.max(1, pool * 0.2));
                timers.push(setTimeout(() => {
                    fxRef.current?.play({ kind, element, side: target, power: p, crit: Boolean(l.crit) });
                }, i * 170));
            });
        } else {
            const power = 0.6 + Math.min(1.6, (l.damage || 0) / Math.max(1, pool * 0.2));
            fxRef.current?.play({ kind, element: froze ? "ice" : element, side: target, power, crit: Boolean(l.crit) });
        }
        return () => timers.forEach(clearTimeout);
    }, [bout?.log?.length]);

    // ── THE NUMBERS ── off the blow that actually landed, on the fighter that took it. A blocked or healed
    // amount is a number too: "you turned aside 9" was buried in grey log text under the buttons, so the one
    // thing your defensive choices actually bought you was the one thing never shown on the field.
    useEffect(() => {
        // ── EVERY LINE THAT ARRIVED, NOT JUST THE LAST ONE ──────────────────────────────────────────────
        // This read bout.log[length - 1] and nothing else. One exchange writes SEVERAL lines — your swing,
        // their swing, a riposte, a burn ticking — so whichever landed last was the only one that ever put a
        // number on screen. While a burn was on you that was the burn, every single beat: you would hit them,
        // watch their bar drop, and see no number, no shake and hear no impact.
        // Luke: "I hit him and it doesnt show the hit on him like no damage numbers at all and I burn and
        // take damage."
        const len = bout?.log?.length || 0;
        if (!len) return undefined;
        const from = Math.min(lastLogSeen.current || 0, len);
        const fresh = len > from ? bout.log.slice(from) : [bout.log[len - 1]];
        lastLogSeen.current = len;
        const pops = [];
        fresh.forEach((l, li) => {
            const sub = [];
            const target = l.who === "you" ? "right" : "left";
            // ── ONE NUMBER PER BLOW ──────────────────────────────────────────────────────────────────────────
            // A three-hit flurry used to arrive as a single accumulated number, so the one thing that makes it a
            // flurry — that it is THREE — was invisible, and Rampage looked exactly like a big swing with a
            // different sprite. `each` is the per-blow breakdown from the engine; every entry gets its own float,
            // staggered so they read as a sequence rather than a pile, and a missed blow says MISS in its place.
            const each = Array.isArray(l.each) ? l.each : null;
            if (each && each.length > 1) {
                each.forEach((n, i) => {
                    sub.push({
                        side: target,
                        n: n > 0 ? n : null,
                        text: n > 0 ? null : "MISS",
                        kind: n > 0 ? (l.crit ? "crit" : "dmg") : "miss",
                        at: i * 170,
                    });
                });
            } else if (l.damage > 0) {
                // ── A TICK IS NOT A SWING ────────────────────────────────────────────────────────────
                // A burn eating 14 looked exactly like a hit landing 14, so the one number you had no
                // control over read as the one you did. It floats with its own mark instead.
                // Luke: "if we take fire damage the text should have a burn icon next to it, same a bleed
                // that would be a blood droplet icon".
                const dot = l.kind === "bleed" ? "bleed" : (l.kind === "rend" || l.grade === "burn" ? "burn" : null);
                // You are on the LEFT, so a blow YOU land floats over the right-hand opponent.
                sub.push({ side: target, n: l.damage, kind: dot || (l.crit ? "crit" : "dmg"), dot });
            } else if (l.grade === "miss") {
                sub.push({ side: target, n: null, text: "MISS", kind: "miss" });
            }
            // The burn's own number waits a beat behind whatever swing preceded it, for the same reason.
            if (l.grade === "burn") for (const p of sub) if (p.at == null) p.at = 260;
            // ── AND THEY BELONG TO WHOEVER EARNED THEM ──────────────────────────────────────────────────────
            // All three of these were pinned to "left", which is YOU. Damage was already handled correctly, so a
            // blow you took floated over you and a blow you landed floated over them — but a heal, a block and a
            // ward always floated over you no matter who did it. So the opponent drinking a poultice put a big
            // green +N over YOUR hero, and the opponent bracing looked like you had been handed a shield. The
            // engine was right about all of it; only the side was wrong.
            const mine = l.who === "you";
            const ownSide = mine ? "left" : "right";
            if (l.blocked > 0) sub.push({ side: ownSide, n: l.blocked, kind: "block", at: 120 });
            // ── A CONSEQUENCE ARRIVES AFTER ITS CAUSE ────────────────────────────────────────────────────
            // Luke: "he attacks, he misses, the burn damage ticks on him, which heals me... but because it all
            // happens at the same time, none of that is clear." Every number used to land on the same frame,
            // so a three-part sentence — swing, then burn, then drink — read as one shapeless flash.
            // A damage-over-time tick is a SEPARATE beat of the story from the blow it follows, and the heal it
            // feeds is a third. Staggered far enough apart to be read in order rather than seen at once.
            const isDot = l.grade === "burn";
            if (l.healed > 0) sub.push({ side: ownSide, n: l.healed, kind: "heal", at: isDot ? 520 : 300 });
            // Lifesteal off thorns and ripostes lands on THEIR log line (it happens during their swing), so it
            // floats over whoever drank it rather than over the fighter whose line it is written on.
            // ALWAYS YOURS. `stolen` is only ever written on the opponent's swing line (it is your lifesteal off
            // thorns and ripostes, which happen during their beat), so keying it to whose line it is put your own
            // drink over THEIR head every single time — the exact mistake the comment above it warns against.
            if (l.stolen > 0) sub.push({ side: "left", n: l.stolen, kind: "heal", at: 240 });
            if (l.soaked > 0) sub.push({ side: ownSide, n: l.soaked, kind: "ward", at: 60 });
            // A BRACE IS A SHIELD NOW, on both sides of the ring, so it floats the same green number your own
            // Guard does — `soaked`, handled one line up. `bracedPct` is gone with the flat reduction it named.
            // A DEFENDER'S THORNS COME OFF YOU. It is their number, but it lands on your health, so it floats over
            // you — the same rule as any other blow: the pop goes where the damage went.
            if (l.theirThorns > 0) sub.push({ side: "left", n: l.theirThorns, kind: "thorn", at: 220 });
            // What their banked guard ate — over THEM, because it is their shield doing it.
            if (l.theirSoak > 0) sub.push({ side: "right", n: l.theirSoak, kind: "ward", at: 40 });
            // ── WHAT YOU SENT BACK ── over THEM, because it is damage you dealt. A shield build's whole offence
            // is thorns and riposte, and neither has ever put a number on the screen: the bar moved and nothing
            // said why. Staggered after the incoming hit so the two do not land on the same frame.
            if (l.thorned > 0) sub.push({ side: "right", n: l.thorned, kind: "thorn", at: 200 });
            // ── AND WHAT THEY SENT BACK ── their riposte lands on YOU, so it floats over you. Same rule again:
            // the pop goes where the damage went, not to whoever owns the move.
            if (l.takenBack > 0) sub.push({ side: "left", n: l.takenBack, kind: "thorn", at: 280 });
            if (l.riposted > 0) sub.push({ side: "right", n: l.riposted, kind: "thorn", at: 280 });
            // ── RETALIATION ── its own kind, not thorn pink: it is a swing somebody threw, and it lands on the
            // counter's own beat (COUNTER_BEAT_MS) so the number arrives with the lunge rather than during the
            // blow it is answering. A crit counter pops bigger, exactly as a crit swing does.
            if (l.countered > 0) sub.push({ side: "right", n: l.countered, kind: l.counterCrit ? "counter-crit" : "counter", at: 430 });
            if (l.theirCounter > 0) sub.push({ side: "left", n: l.theirCounter, kind: l.theirCounterCrit ? "counter-crit" : "counter", at: 430 });
            // Their counter's Lifedrink — over them, because they are the ones who drank it.
            if (l.theirHealed > 0) sub.push({ side: "right", n: l.theirHealed, kind: "heal", at: 520 });
            // Each line's numbers come after the previous line's, so an exchange reads as a sequence.
            for (const item of sub) pops.push({ ...item, at: (item.at || 0) + li * 150 });
        });

        // ── THE QUEUE, WHEN THE ENGINE PUBLISHED ONE ────────────────────────────────────────────────────
        // Everything above is the OLD path and it stays for one reason only: bouts are persisted mid-fight,
        // so a bout opened before this shipped has log lines with no `events` on them. Those still animate
        // the way they always did. Anything resolved since plays as a sequence instead.
        const queue = [];
        for (const l of fresh) {
            for (const e of l.events || []) {
                // The engine says WHICH FIGHTER it landed on; the ring only knows left and right.
                queue.push({ ...e, side: e.side === "you" ? "left" : "right" });
            }
        }
        if (queue.length) {
            // Held only while a counter is actually coming — otherwise the beat's sentence would wait for a
            // moment that never arrives.
            setCounterHeld(queue.some((e) => e.kind === "counter"));
            setBeatQueue({ id: bout.log.length, events: queue });
            return undefined;
        }
        if (!pops.length) return undefined;
        setPop({ id: bout.log.length, items: pops });
        // Outlives the animation (2.1s, crit 2.4s) rather than cutting it off — unmounting at 1000ms is what
        // made even the old, faster float disappear mid-air.
        const t = setTimeout(() => setPop(null), 2500);
        return () => clearTimeout(t);
    }, [bout?.log?.length]);

    // ── PLAYING A BEAT, ONE THING AT A TIME ─────────────────────────────────────────────────────────────────
    // The fix for "everything post attack happens all at once". Each event gets its own moment: its number,
    // its sound, its shake, and the right fighter recoiling or lunging. Nothing shares a frame with its own
    // cause any more.
    //
    // PACING IS ONE TABLE. A plain exchange — one blow, no riders — is a single event and therefore exactly
    // as quick as it ever was. A busy one compresses rather than dragging: after the first two events every
    // following one is scaled by SQUEEZE, and the whole beat is capped at BEAT_BUDGET_MS. Change those two
    // numbers to make the ring slower and more cinematic or faster and tighter; nothing else needs touching.
    useEffect(() => {
        if (!beatQueue?.events?.length) return undefined;
        const evs = beatQueue.events;
        const timers = [];
        let clock = 0;
        evs.forEach((e, i) => {
            const base = EVENT_MS[e.kind] ?? EVENT_MS.default;
            const dur = i < 2 ? base : Math.max(90, Math.round(base * SQUEEZE));
            const at = Math.min(clock, BEAT_BUDGET_MS);
            clock += dur;
            // The draw-back happens BEFORE the blow it belongs to, and the swing is heard at the start of it —
            // the same rule the command wind-up follows. The counter's own moment shifts back by that much so
            // the anticipation does not eat the event in front of it.
            const wind = e.kind === "counter" ? COUNTER_WIND_MS : 0;
            if (wind) {
                clock += wind;
                timers.push(setTimeout(() => { setCounterWind(e.side); Sfx.whoosh(); }, at));
                timers.push(setTimeout(() => setCounterWind(null), at + wind + 40));
            }
            timers.push(setTimeout(() => {
                setPop({ id: `${beatQueue.id}-${i}`, items: [{ side: e.side, n: e.n, kind: POP_KIND[e.kind] || e.kind, text: e.kind === "miss" ? "MISS" : null, crit: e.crit }] });
                // The ring itself answers, every time — this is the half that was only ever played once per
                // beat, which is why ten numbers flew while the fighters stood still.
                const hurtSide = e.side === "left" ? "you" : "them";
                if (DAMAGE_KINDS.has(e.kind)) {
                    setHitSide(hurtSide);
                    setShake(e.crit || e.kind === "counter" ? 2 : 1);
                    setStop(true);
                    // ── COUNTER IS CHECKED BEFORE CRIT, AND THAT ORDER IS THE WHOLE POINT ────────────
                    // It was the other way around, so a CRITICAL counter — the loudest thing the mechanic
                    // does — fell into the generic crit branch and lost both its banner and its voice. The
                    // frames showed TIDECALL still on screen while the counter landed. A kind is more
                    // specific than a modifier; the specific case has to be asked first.
                    if (e.kind === "counter") {
                        // The one event that is a MOVE somebody threw rather than a consequence, so it is
                        // named across the middle the way a move is.
                        setClash({ grade: "counter", move: e.crit ? "RETALIATION!" : "Retaliation", mine: e.side === "right", crit: Boolean(e.crit) });
                        setCounterHeld(false);
                        Sfx.counter(e.crit ? 0.9 : 0.55, 0.07);
                        if (e.crit) { Haptic.crit(); duck(0.5, 0.3); } else { Haptic.hit(0.7); duck(0.35, 0.22); }
                    }
                    else if (e.crit) { Sfx.crit(0.8); Haptic.crit(); duck(0.5, 0.3); }
                    else if (e.kind === "thorn" || e.kind === "riposte") { Sfx.impact(0.45); Haptic.hit(0.5); }
                    else if (e.kind === "bleed" || e.kind === "burn") { Sfx.burn(); }
                    else { Sfx.impact(0.5); Haptic.hit(0.6); }
                } else if (e.kind === "drink") { Sfx.heal?.(); Haptic.cast(); }
                else if (e.kind === "block" || e.kind === "ward") { Sfx.block(0.4); }
                else if (e.kind === "miss") { Sfx.block(0.3); }
            }, at + wind));
            timers.push(setTimeout(() => { setShake(0); setHitSide(null); setStop(false); }, at + wind + Math.min(dur, 340)));
        });
        timers.push(setTimeout(() => setPop(null), Math.min(clock, BEAT_BUDGET_MS) + 1400));
        return () => { for (const t of timers) clearTimeout(t); };
    }, [beatQueue]);

    // The shake runs for a beat and then bursts on its own; a tap skips it. Keyed on the crate so a second
    // purchase replays it rather than showing the prize immediately.
    useEffect(() => {
        if (!opened) { setCrateBurst(false); return undefined; }
        setCrateBurst(false);
        const t = setTimeout(() => setCrateBurst(true), 1250);
        return () => clearTimeout(t);
    }, [opened]);

    if (!st?.unlocked) return null;

    // ── THE BOUT ──
    // Turn-based, and it looks it. A beat begins with a DECISION off a command deck — attack, skill, guard,
    // item — and only the commands that need execution raise the ring. Everything the fight needs now lives
    // inside the panel: both fighters, both health bars, cooldowns, the last beat and the deck itself. It used to
    // be a picture on top with the controls stacked underneath it like a form, which is why it read as a page
    // rather than a fight.
    // Hosted over another page: the fight, or nothing. Placed AFTER every hook above so the hook order is the
    // same on both sides of this branch — returning early from among them is how a component that renders
    // fine on its own page crashes the moment something else mounts it.
    // `|| stepped` is the belt to the exit door's braces: hosted mode has no Arena page to fall through to, so
    // any state that is not "a live fight" must render nothing rather than dropping the whole Arena over the
    // street.
    if (boutOnly && (!bout || stepped)) return null;

    if (bout && !stepped) {
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
        // Nothing casts, so nothing is mid-cast. Kept as a constant because the ring's class list and a
        // few CSS hooks still read it, and threading `false` through every one of them is a bigger edit than
        // the mechanic deserves.
        const casting = null;
        // Their cast gets the same treatment — the telegraph window IS their cinematic, so a skill coming at
        // you is as legible as one you throw.
        const foeCasting = reading && bout.incoming?.isAbility ? bout.incoming : null;
        const last = bout.log?.length ? bout.log[bout.log.length - 1] : null;
        const haveItems = BATTLE_ITEMS.some((i) => (bout.items?.[i.id] || 0) > 0);
        // WHAT THE BRACE IS ACTUALLY WORTH, ON THE BUTTON. Guard is no longer a flat share every fighter
        // gets — it is your class base scaled by your Fortune — so "Guard" alone stopped being enough to
        // decide with. The number is the one the engine banks; see guardSoakFrom.
        const braceFor = Math.round((bout.maxHp || 0) * (bout.me?.guard || 0));
        // Older bouts, opened before the budget shipped, publish neither field. They get the full allowance
        // rather than a disabled button — a rule cannot be applied retroactively to a fight already running.
        // ── BRACES ARE NOT RATIONED ANY MORE ─────────────────────────────────────────────────────────
        // publicBout sends null now, which means unlimited. It used to send a remaining count and null was
        // an old bout with no counter, so the fallback was 6 — leave that in place and every button would
        // sit there promising "6 left" forever, which is a number that never moves and never was true.
        const braceRationed = bout.braces != null;
        const bracesLeft = braceRationed ? (Number(bout.braces) || 0) : Infinity;
        // ── SHATTERED COUNTS AS "CANNOT GUARD" ───────────────────────────────────────────────────────────
        // It did not, so the button stayed lit while the server refused every press with guard_shattered.
        // Sunflower Jinxx, in global chat: "I think the guard is glitched when fighting the runecallers... I
        // could do everything except guard" — then had to be told by another member that it was a skill being
        // used on her. A rule nobody can see is indistinguishable from a bug.
        const guardLocked = Number(bout.noGuard || 0) > 0;
        const canBrace = bracesLeft > 0 && bout.braceReady !== false && !guardLocked;
        const wards = abilities.filter((a) => a.defensive);
        return (
            <section className="card ar ar-fight">
                <div ref={ringRef}
                    className={`ar-ring${shake ? ` is-shake-${shake}` : ""}${bigHit ? (critTheirs ? " is-crit is-crit-theirs" : " is-crit") : ""}`
                    + `${stop ? " is-stop" : ""}`
                    + `${casting ? " is-casting is-on-you" : ""}${foeCasting ? " is-casting is-on-them" : ""}`}>
                    {/* The engine writes this node's transform; the panel follows it. */}
                    <span ref={shakeRef} className="ar-quake" aria-hidden="true" />
                    {/* ── WHERE THIS FIGHT IS HAPPENING ───────────────────────────────────────────────
                        One hardcoded colosseum served every bout, including the ones you start by hauling a
                        thing out of the sea on a rope. You reeled a Young Kraken over the rail and then both
                        of you were standing on sand under strung pennants. The fight is on the boat; the
                        backdrop is the only part of the ring that has to know it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ar-ring-bg"
                        src={bout.fishing ? "/images/arena/deck-bg.webp" : "/images/arena/arena-bg.webp"}
                        alt="" draggable="false" />
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

                    {/* Everything that used to sit in paragraphs under the panel, now a strip across the top.
                        THREE COLUMNS, not one centred flex row. The tags used to be loose children of that
                        row while .ar-tools floated over the top-right corner on position:absolute, so a long
                        clash line — "Their Storm smothers your Shadow · -25% why?" — ran straight underneath
                        three opaque buttons and lost its last third. A column cannot be overlapped by a
                        sibling column: the tools take their width OUT of the row instead of hovering above
                        it, and the tags wrap inside what is left. */}
                    <div className="ar-hud">
                        <span className="ar-round">Round {bout.beat}</span>

                        <span className="ar-hud-tags">
                            {/* THE PIT CLOSES. An escalation nobody is told about is the hidden roll all over
                                again, so it says so the round it starts and keeps saying how much. */}
                            {bout.fever > 1 ? (
                                <span className="ar-tag is-fever">
                                    The pit closes · +{Math.round((bout.fever - 1) * 100)}% both ways
                                </span>
                            ) : null}
                            {bout.underdog > 1 ? (
                                <span className="ar-tag is-under">Outgunned · +{Math.round((bout.underdog - 1) * 100)}% swing</span>
                            ) : null}
                            {/* Who opened, and why. Speed comes off Ferocity, which until now did nothing in here.
                                It now shows the two numbers it compared: "you're faster" is an assertion, and
                                18 vs 15 is the reason — and on a TIE it says so outright, because "you open"
                                while both bars read the same number looks like a bug rather than the rule. */}
                            {bout.beat <= 1 && bout.opener ? (
                                <span className={`ar-tag ${bout.opener === "you" ? "is-good" : "is-bad"}`}>
                                    {/* COMPARED AT FULL PRECISION, which is what the engine compares. Rounding
                                        first meant 0.87 against 1.41 announced "Speed tied 1 — the challenger
                                        opens" over a fighter swinging 62% faster: the screen inventing a rule
                                        to explain a number it had itself rounded away. */}
                                    {(bout.me?.speed || 0) === (bout.foe?.speed || 0)
                                        ? `Speed tied ${(bout.me?.speed || 0).toFixed(2)} — the challenger opens`
                                        : `${bout.opener === "you" ? "You're faster" : `${bout.foe.name} is faster`} · speed ${(bout.me?.speed || 0).toFixed(2)} v ${(bout.foe?.speed || 0).toFixed(2)} — ${bout.opener === "you" ? "you" : "they"} open`}
                                </span>
                            ) : null}
                        </span>

                        {/* ── THE TOOLS ── mute, leave and the log. A ROW, because .ar-mute was once absolutely
                            positioned: a second and third button using that class landed on the exact same
                            34px square as the first, and only the last one drawn could be tapped. */}
                        <div className="ar-tools">
                            {/* A fight with music needs a way to turn the music off, on the fight screen,
                                without hunting for it. The choice is remembered across bouts. */}
                            <button type="button" className={`ar-mute${muteOn ? " is-off" : ""}`}
                                aria-label={muteOn ? "Turn sound on" : "Turn sound off"}
                                aria-pressed={muteOn}
                                onClick={() => { const n = !muteOn; setMuteOn(n); setMuted(n); if (!n) { unlock(); Sfx.ui(); } }}>
                                {muteOn ? <GiSoundOff aria-hidden="true" /> : <GiSoundOn aria-hidden="true" />}
                            </button>
                            {/* ── LEAVE ── the bout is a row in the database, not a thing held open by this
                                screen, so stepping out costs nothing: no forfeit, no round conceded, the
                                opponent is not waiting. Same deal a ship battle already offers. */}
                            {/* Hosted over the plaza there is no Arena page to step out ONTO — stepping out
                                hands the screen back to the street instead, with the bout left open exactly as
                                it is. Tapping any raider re-enters it (see TownClient's engage). Without this
                                the fight unmounted and the whole Arena page rendered over the town. */}
                            <button type="button" className="ar-mute ar-leave" aria-label="Step out of the fight"
                                onClick={() => {
                                    Sfx.ui();
                                    if (boutOnly) { if (onLeave) onLeave(); return; }
                                    setStepped(true);
                                }}>
                                <GiExitDoor aria-hidden="true" />
                            </button>
                            <button type="button" className={`ar-mute ar-logbtn${logOpen ? "" : " is-off"}`}
                                aria-label={logOpen ? "Hide the blow-by-blow" : "Show the blow-by-blow"}
                                aria-pressed={logOpen}
                                onClick={() => setLogOpen((v) => !v)}>
                                <GiScrollUnfurled aria-hidden="true" />
                            </button>
                            {/* ── STRAIGHT TO THE VERDICT ─────────────────────────────────────────────────
                                A bout is resolved on the server the moment it starts; what plays out here is
                                a RECORDING of a fight already decided. Watching it is the good part the first
                                few times and a toll every time after — and with bouts now running to a couple
                                of minutes, ten fights a day is an hour of watching with no way out but
                                leaving. This jumps to the last blow. It cannot change an outcome, because
                                the outcome was never in this component. */}
                            {shown < logAll.length ? (
                                <button type="button" className="ar-mute ar-skip" aria-label="Skip to the result"
                                    onClick={() => { Sfx.ui(); setShown(logAll.length); }}>
                                    <GiFastForwardButton aria-hidden="true" />
                                </button>
                            ) : null}
                            {/* ── GIVE UP, FROM INSIDE THE FIGHT ──────────────────────────────────────────
                                The forfeit already existed and lived on the Arena landing screen, under the
                                Resume button. From IN a bout there was no route to it at all: you had to know
                                to step out first and then find a deliberately small link. Luke: "we need a way
                                to forfeit a match" — there was one, and it was unreachable from the only place
                                you would ever want it.
                                Same two-tap confirm and the same `giveUp` state as the landing-screen copy, so
                                there is ONE forfeit with one guard rather than a second one that could drift.
                                It costs the loss, deliberately: a free exit from a bad matchup is a re-roll. */}
                            <button type="button" className={`ar-mute ar-giveup${giveUp ? " is-armed" : ""}`}
                                disabled={busy}
                                aria-label={giveUp ? "Tap again to take the loss" : "Give up this fight"}
                                title={giveUp ? "Tap again to take the loss" : "Give up this fight"}
                                onClick={() => {
                                    Sfx.ui();
                                    if (!giveUp) { setGiveUp(true); setTimeout(() => setGiveUp(false), 4000); return; }
                                    setGiveUp(false); setStepped(false); act("forfeit");
                                }}>
                                <GiTombstone aria-hidden="true" />
                            </button>
                        </div>
                    </div>

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
                        <span className="ar-barcol">
                            <FighterBar f={{ ...st.me, ...(bout.me || {}) }} hp={bout.hp} maxHp={bout.maxHp} element={bout.me?.element || null}
                                active={yourTurn} shield={bout.shield || 0}
                                burn={bout.foeBleed || null} bleed={bout.foeGash || null} />
                            <StatusRow list={statusesFor(bout, "you")} side="you" onPick={(s) => setStatusPick({ kind: s.kind, side: "you" })} />
                        </span>
                        <span className={`ar-turnmark${yourTurn ? " is-you" : " is-them"}`}>
                            {bout.over ? "—" : yourTurn ? "Your turn" : "Their turn"}
                        </span>
                        <span className="ar-barcol is-foe">
                            <FighterBar f={bout.foe} hp={bout.foeHp} maxHp={bout.foeMaxHp} element={bout.foe?.element || null}
                                foe active={!yourTurn && !bout.over} shield={bout.foeShield || 0}
                                burn={bout.bleed || null} bleed={bout.gash || null} />
                            <StatusRow list={statusesFor(bout, "them")} side="them" onPick={(s) => setStatusPick({ kind: s.kind, side: "them" })} />
                        </span>
                    </div>

                    {/* ── TAP ONE, LEARN WHAT IT IS DOING ────────────────────────────────────────────────
                        The chip says WHICH and HOW LONG; this says what it costs you, in the engine's own
                        numbers. */}
                    {/* ── IT READS THE LIVE EFFECT, NOT A SNAPSHOT OF ONE ──────────────────────────────
                        `statusPick` used to hold the whole effect object as it was at the instant you tapped
                        it, so the card froze: it kept last fight's "60 a turn, stacked 3x, 3 turns left" while
                        the log underneath said 10/turn, and it survived into the next bout entirely. Luke:
                        "there is no way to close this info modal and it persists between fights."
                        Now it remembers only WHICH effect and on WHOM, and re-reads the numbers from the bout
                        every render — so it counts down as the effect does, and when the effect ends there is
                        nothing to look up and the card closes itself. */}
                    {(() => {
                        if (!statusPick) return null;
                        const def = STATUS_KINDS[statusPick.kind];
                        if (!def) return null;
                        const live = statusesFor(bout, statusPick.side).find((x) => x.kind === statusPick.kind);
                        if (!live) return null;
                        return (
                            <div className="ar-statcard" role="dialog" aria-label={def.label}
                                onClick={() => setStatusPick(null)}>
                                <b className={`is-${def.tone}`}>
                                    {def.label}
                                    {live.turns ? <u>{live.turns} {live.turns === 1 ? "turn" : "turns"} left</u> : null}
                                    {/* A VISIBLE WAY OUT. The whole card has always been tappable and nothing
                                        said so, which on a phone is indistinguishable from being stuck. */}
                                    <span className="ar-statcard-x" aria-hidden="true">×</span>
                                </b>
                                <p>{def.what()}</p>
                                {live.dmg ? (
                                    <p className="ar-statcard-now">Right now: <b>{live.dmg}</b> a turn
                                        {live.stacks > 1 ? <> · stacked <b>{live.stacks}x</b></> : null}</p>
                                ) : null}
                                <p className="ar-statcard-tap">Tap to close</p>
                            </div>
                        );
                    })()}

                    {/* The old `ar-hexes` strip lived here: a second, separate list of the effects on you,
                        drawn as words, while burns and sunders had no chip at all and the opponent's had
                        nowhere to live. It is folded into StatusRow above — one renderer, both fighters. */}
                    <div className="ar-floor">
                        {/* YOUR HERO IS ALWAYS ON THE LEFT. Sprites are drawn facing right, so you need no
                            flip and the opponent gets `mirrored` to turn and face you. `mirrored` and `foe`
                            are separate flags — one is which way a drawing points, the other is which
                            fighter is the opponent — so the arrangement is stated rather than implied by
                            DOM order, which is what made the last flip go wrong. */}
                        {/* Whoever took the blow recoils; the other one lunged to deliver it. Driven by
                            `hitSide`, never by the intensity — see the note on the state itself. */}
                        <FighterBody f={st.me} hurt={hitSide === "you"} lunge={hitSide === "them"}
                            down={bout.over && !bout.won}
                            wind={counterWind === "left" ? COUNTER_WIND_MS : 0}
                            brace={false}
                            stunned={Boolean(bout.stunned)} hasted={Boolean(bout.hasted)}
                            bleeding={Boolean(bout.bleeding)} bled={Boolean(bout.bled)} />
                        <FighterBody f={bout.foe} foe mirrored hurt={hitSide === "them"} lunge={hitSide === "you"}
                            down={bout.over && bout.won}
                            wind={counterWind === "right" ? COUNTER_WIND_MS : (!bout.over && bout.turn === "them" && reading ? TELEGRAPH_MS : 0)}
                            brace={false}
                            stunned={Boolean(bout.foeStunned)} hasted={Boolean(bout.foeHasted)}
                            bleeding={Boolean(bout.foeBleeding)} bled={Boolean(bout.foeBled)} />
                        {/* THE WARNING. Their whole move, named, before a ring appears. */}
                        {reading ? (
                            <div className="ar-incoming" aria-live="polite">
                                {bout.incoming?.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="ar-incoming-art" src={bout.incoming.sprite} alt="" draggable="false" />
                                ) : null}
                                {/* One line, not three, and the MOVE rather than the mover: their name is on
                                    the health bar six pixels above this and on the cast card when they cast,
                                    while "Tidecall" is the part you are deciding against. Fitting both meant
                                    ellipsising the half that matters. */}
                                <span className="ar-incoming-body">
                                    <em>Incoming</em>
                                    <b>{bout.incoming?.name || "a heavy swing"}</b>
                                </span>
                            </div>
                        ) : null}

                        {/* ── THE NUMBERS STACK, THEY DO NOT SHARE A SPOT ── each of these used to be absolutely
                            positioned on its own, which is fine for one and a pile-up for two: guard a blow and
                            the damage and the blocked amount were printed on top of each other. One COLUMN per
                            side now, bottom-up, so a beat that produces four numbers produces four rows. */}
                        {pop ? ["left", "right"].map((side) => {
                            const items = pop.items.filter((it) => it.side === side);
                            if (!items.length) return null;
                            return (
                                <span key={`${pop.id}-${side}`} className={`ar-pops is-${side}`} aria-hidden="true">
                                    {items.map((it, i) => (
                                        <span key={`${it.kind}-${i}`}
                                            className={`ar-pop is-${it.side} is-${it.kind}`}
                                            style={it.at ? { animationDelay: `${it.at}ms` } : undefined}>
                                            {/* A damage-over-time tick wears its own mark, so it can never be
                                                mistaken for a blow somebody chose to throw. */}
                                            {it.dot && STATUS_KINDS[it.dot] ? (() => {
                                                const { Icon } = STATUS_KINDS[it.dot];
                                                return <Icon className="ar-pop-dot" aria-hidden="true" />;
                                            })() : null}
                                            {it.text
                                                ? it.text
                                                : <>
                                                    {/* Luke: "when anyone heals, there should be a green heart, and
                                                        then green text that floats above them just like we do other
                                                        text in the arena." The colour was already green; without a
                                                        mark beside it a +14 is just a number in a fight full of them. */}
                                                    {it.kind === "heal" ? <GiHearts className="ar-pop-dot" aria-hidden="true" /> : null}
                                                    {it.kind === "heal" ? "+" : it.kind === "block" || it.kind === "ward" || it.kind === "brace" ? "" : "−"}
                                                    {it.n}{it.kind === "brace" ? "%" : ""}
                                                </>}
                                            {it.kind === "block" ? <u>blocked</u>
                                                : it.kind === "ward" ? <u>soaked</u>
                                                    : it.kind === "brace" ? <u>braced</u> : null}
                                        </span>
                                    ))}
                                </span>
                            );
                        }) : null}

                        {/* The burst itself, keyed on the beat so every cast replays from scratch. */}
                    </div>

                    {/* ── THE SPELL LAYER ── full-screen additive canvas, FF6-style: the sprites stay put and
                        the SCREEN does the work. */}
                    <ArenaFx ref={fxRef} onShake={onShake} />


                    {/* The quick-cast rail is gone with the deck: nothing is cast, so nothing is ready. */}

                    {/* The moment it ends, called across the ring rather than dumped on a new screen. */}
                    {bout.over ? (
                        <div className={`ar-verdict ${bout.won ? "is-win" : "is-loss"}`}>
                            {/* Rays behind the word on a win — the one moment in the fight that is allowed to
                                be loud. They turn slowly, so the frame is still moving while you read it. */}
                            {bout.won ? <span className="ar-cele" aria-hidden="true" /> : null}
                            <b>{bout.won ? "Victory" : "You fall"}</b>
                            {bout.won && bout.foe?.name ? <em className="ar-verdict-sub">{bout.foe.name} is down</em> : null}
                            {/* Present whether or not the recap modal renders. A finished fight must always
                                have a visible way out somewhere on the screen — and it has to lead back to the
                                room you came from, which for a raider is the plaza. */}
                            <button type="button" className="ar-btn is-sm" disabled={busy}
                                onClick={leaveBout}>
                                {bout.fishing ? "Back to the water" : bout.town ? "Back to the plaza" : "Back to the ladder"}
                            </button>
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

                    {/* ── DON'T SPOIL THE ANSWER ──────────────────────────────────────────────────────────
                        Filmed frame by frame, the counter's whole 420ms pause was being given away here: the
                        instant their blow landed, this line already read "…42 lands. YOU STRIKE BACK —
                        CRITICAL — for 32", half a second before the retaliation played. The sentence is one
                        string from the server, so the counter clause is held back and appended when the
                        counter actually fires. */}
                    {last && !bout.over
                        ? <p className="ar-beat">{counterHeld && last.counterText ? last.text : `${last.text}${last.counterText ? ` ${last.counterText}` : ""}`}</p>
                        : null}

                    {/* ── THE COMMAND DECK IS GONE ────────────────────────────────────────────────────
                        Attack, Skill, Guard and Item, the ward panel, the skill list and the item pouch — all
                        of it removed. Combat is passive: the bout is resolved the moment it starts and this
                        screen plays back the log. There is nothing here to press. */}
                </div>

                {/* THE WAY OUT. This render was dropped in the rock-paper-scissors rewrite, and nothing caught
                    it: the component still existed, the dismiss action still existed, clearBout still existed —
                    only the one line that mounts it was gone. So every bout since then ended on a dead screen
                    with no button, and the only escape was reloading the page. */}
                {/* ── AND THE WAY BACK ─────────────────────────────────────────────────────────────────────
                    A raid fight is fought HERE — the town sends you to /marketplace/arena?from=town rather
                    than embedding a second copy of this screen — but nothing ever read that `from`, so the
                    fight ended and left you standing in the Arena with the plaza still under attack and no
                    route back to it. Several members reported exactly that, and one of them concluded a raid
                    was a single fight because the Arena is where it dropped them.

                    Off the bout's own `town` flag rather than the query string: the flag is true for the
                    fight that IS a raid, which survives a reload, a re-entry and a link with no `?from` on
                    it. A hard nav, because the town page loads its own state and must not inherit this one's. */}
                {bout.over && recapReady ? <Recap bout={bout} busy={busy} onClose={leaveBout} /> : null}

                {err ? <p className="ar-err">{err}</p> : null}
                {/* THE LOG IS A DRAWER. It was 150px of grey text under the fight, which on a phone is 150px
                    of the reason you had to scroll. The beat you just played is already printed on the field
                    (.ar-beat); the history is for when you want it. */}
                {logOpen && bout.log?.length ? (
                    <div className="ar-log">
                        {bout.log.slice(-8).map((l, i, arr) => {
                            // Same hold as the on-field line: with the log open, the newest entry would
                            // otherwise announce the counter before it lands.
                            const held = counterHeld && i === arr.length - 1 && l.counterText;
                            return (
                                <div key={i} className="ar-line">
                                    <b>{l.beat}</b> {held ? l.text : `${l.text}${l.counterText ? ` ${l.counterText}` : ""}`}
                                </div>
                            );
                        })}
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

            {/* ── YOUR CARD ── this used to be a rung ("Cub · #41 of 84") and a named band, both of them
                proxies for "how strong am I" from back when strength was a derived number you could not see.
                It is the four real stats now: the same four the fight multiplies, the same four printed on
                whoever you are about to fight. Comparing two cards IS the ladder. */}
            <div className="ar-badge" style={{ "--rank": "#ffd75e" }}>
                <div className="ar-badge-body">
                    <span className="ar-badge-kick">The Arena</span>
                    <b className="ar-rankname">Your card</b>
                    <span className="ar-mycard">
                        <i><b>{Math.round(st.me?.damage || 0)}</b> damage</i>
                        <i><b>{Math.round((st.me?.critChance || 0) * 100)}%</b> crit &times;{(st.me?.critMult || 2.5).toFixed(1)}</i>
                        <i><b>{Math.round(st.me?.health || 0)}</b> health</i>
                    </span>
                    {/* Says WHAT the allowance covers, because it no longer covers everything: the Road is
                        free, and a bare "0 of 12 left today" sitting directly above a Road tab reads as the
                        whole screen being shut for the night. */}
                    <span className="ar-tonext-label">
                        {st.fightsLeft} of {st.fightsPerDay} arena challenges left today
                        {st.fightsLeft <= 0 ? " — the Road is still open" : ""}
                    </span>
                    {/* Two numbers with no explanation anywhere is how you get asked "what are laurels".
                        One line each, on the screen that shows them. */}
                    <span className="ar-currency">
                        <i title="Rank. Won by beating people — more for harder opponents. Never spent.">
                            <b>{money(st.vp)}</b> VP<em>rank · never spent</em>
                        </i>
                        <i title="The arena's own currency. Won by winning bouts, and spent in the Armoury.">
                            <b>{money(st.laurels)}</b>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={LAUREL} alt="" className="ar-laurel" draggable="false" /> Laurels
                            <em>spend in the Armoury</em>
                        </i>
                    </span>
                </div>
            </div>

            {/* ── THREE JOBS, THREE TABS ── who to fight, how you fight, what you have trained. This screen
                carried all of it in one scroll and it was already long before the tree existed. */}
            {/* ── A REFUSAL HAS TO LAND SOMEWHERE ──────────────────────────────────────────────────────
                This banner existed, and it was rendered ONLY inside the in-bout branch — which returns
                early, so it was unreachable from the three screens that actually ask the server for
                something. Every deliberate NO on the Road tab therefore set an error message into state and
                painted it nowhere: you tapped Fight, the server said "no fights left", and the button did
                nothing at all. The three carefully-worded REFUSALS above had never once been seen.
                Above the tabs, so it sits with the thing you just pressed rather than at the end of a
                hundred-rung list. */}
            {/* ── AND IT HAS TO BE SEEN, NOT JUST RENDERED ────────────────────────────────────────────────
                Fixing "the refusal lands nowhere" by moving this above the tabs fixed half of it: the banner
                sits at the TOP of the screen, and Find a fight is at the bottom of a long one. On a phone you
                tap, the server says no, the sentence appears somewhere you are not looking, and the button has
                once again done nothing. Bring the message to whoever pressed the button. */}
            {err ? <p className="ar-err" ref={errRef}>{err}</p> : null}

            <div className="ar-tabs" role="tablist">
                {[["fight", "Fight"], ["road", st.ladder ? `The Road · ${st.ladder.beaten}/${st.ladder.size}` : "The Road"], ["tree", st.progress?.points?.available ? `Skills · ${st.progress.points.available}` : "Skills"], ["train", "Training"], ["armoury", "Armoury"]].map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k}
                        className={`ar-tab${tab === k ? " is-on" : ""}${k === "tree" && st.progress?.points?.available ? " has-dot" : ""}`}
                        onClick={() => { Sfx.ui(); setTab(k); }}>{label}</button>
                ))}
            </div>

            {tab === "tree" ? (
                <SkillTree progress={st.progress} gold={st.gold || 0} busy={busy}
                    onAct={(action, extra) => act(action, extra)} />
            ) : null}

            {tab === "train" ? (
                <ArenaUpgrades upgrades={st.upgrades || []} gold={st.gold || 0} busy={busy} flash={upgFlash}
                    onBuy={(id) => { setUpgFlash(id); setTimeout(() => setUpgFlash(null), 700); act("arena_upgrade", { track: id }); }} />
            ) : null}

            {/* ── THE ARMOURY ── three crates, and what comes out is rolled. A price list is arithmetic you
                do once and repeat forever; this is a decision about how much you are willing to stake. Every
                possible outcome is printed under the crate, because a box that will not say what is in it is
                a slot machine and this game does not have those. */}
            {tab === "armoury" ? (
                <section className="card">
                    <div className="ar-arm-head">
                        <b>The Armoury</b>
                        <span className="ar-arm-purse">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={LAUREL} alt="" className="ar-laurel" draggable="false" />
                            {money(st.laurels)}
                        </span>
                    </div>
                    <p className="ar-arm-sub">
                        Laurels come off every bout, win or lose, and off the feats inside them. This is the only
                        thing that takes them.
                    </p>
                    <PetStoneShelf shop={st.stoneShop} currency="laurels" purse={st.laurels} busy={busy}
                        onBuy={(id) => { Sfx.ui(); act("buy_stone", { stone: id }); }} />
                    <div className="ar-crates">
                        {(st.armoury || []).map((c) => {
                            const poor = (st.laurels || 0) < c.cost;
                            const total = (c.table || []).reduce((n, r) => n + r.w, 0) || 1;
                            return (
                                <div key={c.id} className={`ar-crate${poor ? " is-poor" : ""}${opening === c.id ? " is-opening" : ""}`}>
                                    <div className="ar-crate-top">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img className="ar-crate-art" src={c.art} alt="" draggable="false" />
                                        <div className="ar-crate-words">
                                            <b>{c.name}</b>
                                            <p>{c.blurb}</p>
                                        </div>
                                    </div>
                                    <details className="ar-crate-odds">
                                        <summary>What is in it</summary>
                                        <ul>
                                            {/* KEYED ON THE INDEX, not the label. The War Chest lists "A Polished
                                                Jewel" TWICE at different odds (a jewel row and its rarer
                                                sibling), so keying on the label gave React two children with
                                                the same key — which it is free to duplicate or drop. It was
                                                warning about exactly this in the console. */}
                                            {(c.table || []).map((r, ri) => (
                                                <li key={`${c.id}-${ri}-${r.label}`}>
                                                    {r.art ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img className="ar-crate-row-art" src={r.art} alt="" draggable="false" />
                                                    ) : null}
                                                    <i>{r.label}</i>
                                                    <em>{Math.round((r.w / total) * 100)}%</em>
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                    <button type="button" className="ar-crate-buy" disabled={busy || poor || Boolean(opening)}
                                        onClick={async () => {
                                            unlock(); Sfx.ui(); Haptic.tap();
                                            setOpening(c.id);
                                            const r = await act("buy_armoury", { id: c.id });
                                            // The lid shakes before it answers — the roll is already decided
                                            // server-side, this beat is so the answer lands rather than appears.
                                            setTimeout(() => {
                                                setOpening(null);
                                                if (r?.opened) {
                                                    setOpened(r.opened);
                                                    Sfx.chestOpen?.("gold"); Haptic.chestOpen?.("gold");
                                                }
                                            }, 900);
                                        }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={LAUREL} alt="" className="ar-laurel" draggable="false" />
                                        {opening === c.id ? "Prising it open…" : money(c.cost)}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    {/* A PAGE FROM THE RECIPE BOOK, for laurels. The twin of the Quartermaster's, at the same
                        odds and the matching price — so neither counter is the obviously correct one to walk
                        up to, which is the whole point of selling it in both. What you get is a roll, weighted
                        hard toward the everyday recipes, and it opens the ordinary recipe-found card. */}
                    {st.recipeShop ? <RecipeShelf shop={st.recipeShop} busy={busy}
                        canAfford={(st.laurels || 0) >= st.recipeShop.price}
                        price={st.recipeShop.price}
                        onBuy={() => { Sfx.ui(); act("buy_recipe"); }} /> : null}
                    <PurserPanel st={st} busy={busy} act={act} />
                </section>
            ) : null}

            {/* What the crate held. Same shape as every other reveal in the game: the thing, named, at size. */}
            {/* ── THE OPENING ─────────────────────────────────────────────────────────────────────────────
                It used to cut straight to the answer: the prize card appeared the instant the request came
                back, so a twelve-thousand-laurel press and a twelve-hundred one felt identical and neither
                felt like anything. There is a beat now — the crate itself, shaking, for a moment — and THEN
                it bursts. The wait is the whole product; the prize was already decided on the server before
                the modal opened, so nothing here can change what you got.
                Tapping skips it, because the second time you have seen it you want your prize. */}
            {opened ? (
                <div className={`ar-open-scrim${crateBurst ? " is-burst" : ""}`} role="dialog" aria-modal="true"
                    onClick={() => (crateBurst ? setOpened(null) : setCrateBurst(true))}
                    style={{ "--c": opened.color || "#ffd75e" }}>
                    <span className="ar-open-rays" aria-hidden="true" />
                    {crateBurst ? (
                        <div className="ar-open-card" onClick={(e) => e.stopPropagation()}>
                            <div className="ar-open-kick">{opened.crate?.name}</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="ar-open-art" src={opened.art || opened.crate?.art} alt="" draggable="false" />
                            <b className="ar-open-name">{opened.label}</b>
                            <button type="button" className="ar-btn ar-open-go" onClick={() => setOpened(null)}>Take it</button>
                        </div>
                    ) : (
                        <div className="ar-crate-wait" onClick={(e) => e.stopPropagation()}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="ar-crate-shake" src={opened.crate?.art} alt="" draggable="false" />
                            <span className="ar-crate-hint">opening…</span>
                        </div>
                    )}
                </div>
            ) : null}

{tab === "road" ? (() => {
            // ── THE ROAD IS A ROAD NOW, NOT A LIST ────────────────────────────────────────────────────────
            // It shipped as a hundred identical grey text tiles under ten text headings, and every fight
            // underneath it is different: ten places, ten looks, a champion every tenth, a chest on every one
            // of those, and a curve that runs from a tavern brawler to something that is not sport. None of
            // that reached the eye, so the screen read as homework.
            //
            // Three things carry it: the FACES (a house plate on every rung, a champion portrait on the
            // tenth), the NEXT FIGHT (the lowest one still standing, pulled out and made the loudest thing on
            // the screen), and PROGRESS THAT MOVES (a house meter, ten pips across the top, and a stamp on
            // everything you have put down). Nothing is locked — it never was — this only says where you are.
            const foesAll = st.ladder?.foes || [];
            const houses = st.ladder?.houses || [];
            // Off the SERVER's `next`, not recomputed here. It is the rung the server will actually accept, and
            // the screen having its own opinion about which one that is would be the same rule written twice.
            const next = foesAll.find((f) => f.rung === st.ladder?.next) || null;
            const beaten = st.ladder?.beaten || 0;
            const size = st.ladder?.size || 100;
            const pct = size ? Math.round((beaten / size) * 100) : 0;
            // The next unbeaten CHEST, because "what am I working toward" is the question a ladder has to
            // answer at a glance and a laurel count does not answer it.
            const nextChest = foesAll.find((f) => !f.beaten && f.reward?.chest) || null;
            // Which house is open. `openHouse` is null until you tap one, so the screen opens on the house
            // you are actually standing in and a cleared house stays folded away.
            const openKey = openHouse ?? next?.house ?? houses[0]?.key;
            return (
            <section className="card ar-road">
                {/* ── CLOSED, AND SAID OUT LOUD ────────────────────────────────────────────────────────────
                    Read off the server's own flag, so this notice and the refusal can never disagree. Said
                    HERE, at the top of the Road, because the alternative is somebody tapping a rung and
                    getting an error — which reads as broken rather than deliberate. It leads with the thing
                    people will actually worry about: their rungs are safe. */}
                {st.ladder?.closed ? (
                    <div className="ar-road-closed" role="status">
                        <b>The Road is closed for now</b>
                        <em>{st.ladder.closedNote}</em>
                    </div>
                ) : null}
                {/* ── THE BANNER ── one number, the ten houses as pips, and the thing you are climbing for. */}
                <div className="ar-road-hero">
                    <div className="ar-road-hero-top">
                        <div>
                            <b>The Long Road</b>
                            <em>A hundred fighters, each of them once. Nothing here comes back.</em>
                        </div>
                        <span className="ar-road-score">{beaten}<i>/{size}</i></span>
                    </div>
                    <div className="ar-road-meter" role="img" aria-label={`${beaten} of ${size} beaten`}>
                        <span style={{ width: `${pct}%` }} />
                    </div>
                    <div className="ar-road-pips">
                        {houses.map((h) => {
                            const hf = foesAll.filter((f) => f.rung >= h.from && f.rung <= h.to);
                            const d = hf.filter((f) => f.beaten).length;
                            return (
                                <button type="button" key={h.key} style={{ "--h": h.tint }}
                                    className={`ar-pip${d === hf.length && hf.length ? " is-clear" : ""}${d ? " is-part" : ""}${openKey === h.key ? " is-open" : ""}`}
                                    onClick={() => { Sfx.ui(); setOpenHouse(h.key); }}
                                    title={`${h.name} — ${d}/${hf.length}`}>
                                    <i style={{ height: `${hf.length ? (d / hf.length) * 100 : 0}%` }} />
                                </button>
                            );
                        })}
                    </div>
                    {nextChest ? (
                        <div className="ar-road-goal">
                            Next chest at <b>#{nextChest.rung}</b> — {nextChest.name},
                            {" "}{"aeiou".includes(nextChest.reward.chest[0]) ? "an" : "a"}
                            {" "}<b>{nextChest.reward.chest}</b> chest.
                        </div>
                    ) : null}
                </div>

                {/* ── THE NEXT ONE STILL STANDING ── the single loudest thing on the screen, because the whole
                    job of this page is to get one more fight started. */}
                {next ? (
                    <button type="button" className="ar-next" style={{ "--h": next.color }}
                        disabled={busy}
                        onClick={() => { Sfx.ui(); act("start", { target: next.id }); }}>
                        <span className="ar-next-tag">next on the road</span>
                        <span className="ar-next-body">
                            {/* A missing rung sprite falls back to its house plate rather than to a gap —
                                a hundred files is a hundred chances for one to be absent. */}
                            <img className="ar-next-art" src={next.sprite} alt="" draggable="false"
                                onError={(e) => {
                                    if (next.spriteFallback && e.currentTarget.src !== next.spriteFallback) e.currentTarget.src = next.spriteFallback;
                                    else e.currentTarget.style.visibility = "hidden";
                                }} />
                            <span className="ar-next-who">
                                <b>{next.name}</b>
                                <em>#{next.rung} · {next.className ? `${next.className} ` : ""}{next.archetypeName} · {next.power.toLocaleString()} power</em>
                                <i>{next.tell}</i>
                                {/* WHAT IT CARRIES. The shape and the mood do not say whether it drinks what
                                    it lands or answers every blow, and a bout is over in seconds — before it
                                    is the only place a member gets to decide anything. */}
                                {next.tells?.length ? (
                                    <span className="ar-next-tells">
                                        {next.tells.map((t) => <b key={t.key}>{t.text}</b>)}
                                    </span>
                                ) : null}
                            </span>
                        </span>
                        <span className="ar-next-prize">{next.reward?.label}</span>
                        <span className="ar-next-go">Fight</span>
                    </button>
                ) : (
                    <div className="ar-next is-done"><b>The road is walked.</b> All hundred, every one of them once.</div>
                )}

                {/* ── TEN HOUSES, ONE OPEN ── a hundred tiles at once is the scroll Luke called out on the
                    laptop. Folded, the whole road fits on one screen and you open the stretch you are on. */}
                {houses.map((h) => {
                    const foes = foesAll.filter((f) => f.rung >= h.from && f.rung <= h.to);
                    const done = foes.filter((f) => f.beaten).length;
                    const clear = done === foes.length && foes.length > 0;
                    const open = openKey === h.key;
                    const champ = foes.find((f) => f.champion);
                    return (
                        <div key={h.key} className={`ar-house${clear ? " is-clear" : ""}${open ? " is-open" : ""}`}
                            style={{ "--h": h.tint }}>
                            <button type="button" className="ar-house-head"
                                onClick={() => { Sfx.ui(); setOpenHouse(open ? "" : h.key); }}
                                aria-expanded={open}>
                                {champ?.sprite ? (
                                    <img className="ar-house-art" src={champ.sprite} alt="" draggable="false"
                                        onError={(e) => {
                                            if (champ.spriteFallback && e.currentTarget.src !== champ.spriteFallback) e.currentTarget.src = champ.spriteFallback;
                                            else e.currentTarget.style.display = "none";
                                        }} />
                                ) : null}
                                <span className="ar-house-who">
                                    <b>{h.name}</b>
                                    <em>{h.blurb}</em>
                                    <span className="ar-house-bar"><i style={{ width: `${(done / (foes.length || 1)) * 100}%` }} /></span>
                                </span>
                                <span className="ar-house-count">
                                    {/* ONE grid cell, not two. A bare text node beside the <i> made them two
                                        items in the grid, so "5" and "/10" stacked on separate lines. */}
                                    <span>{clear ? <b className="ar-house-clear">cleared</b> : <>{done}<i>/{foes.length}</i></>}</span>
                                    <em>{h.from}–{h.to}</em>
                                </span>
                            </button>
                            {open ? (
                                <div className="ar-rungs">
                                    {foes.map((f) => (
                                        <button type="button" key={f.rung}
                                            className={`ar-rung${f.beaten ? " is-done" : ""}${f.champion ? " is-champ" : ""}${next?.rung === f.rung ? " is-next" : ""}${f.locked ? " is-locked" : ""}`}
                                            disabled={busy || f.beaten || f.locked}
                                            onClick={() => { Sfx.ui(); act("start", { target: f.id }); }}
                                            title={f.beaten ? `${f.name} — already beaten`
                                                : f.locked ? `${f.name} — locked. The Road is walked in order; rung ${st.ladder?.next} is next.`
                                                : `${f.name} · ${f.archetypeName} — ${f.tell}`}>
                                            <span className="ar-rung-n">{f.rung}</span>
                                            <img className="ar-rung-art" src={f.sprite} alt="" draggable="false"
                                                onError={(e) => {
                                                    if (f.spriteFallback && e.currentTarget.src !== f.spriteFallback) e.currentTarget.src = f.spriteFallback;
                                                    else e.currentTarget.style.visibility = "hidden";
                                                }} />
                                            <span className="ar-rung-who">
                                                <b>{f.name}</b>
                                                <em>{f.archetypeName} · {f.power.toLocaleString()}</em>
                                            </span>
                                            <span className="ar-rung-prize">
                                                {f.beaten ? "beaten" : <>{f.reward.laurels.toLocaleString()}<i> laurels</i></>}
                                            </span>
                                            {f.reward?.chest && !f.beaten
                                                ? <span className="ar-rung-chest">{f.reward.chest} chest</span> : null}
                                            {/* The prize stays legible on a locked rung — what is up the road is the
                                                reason to walk it. Only the way in is closed. */}
                                            {f.locked ? <span className="ar-rung-lock" aria-hidden="true"><GiPadlock /></span> : null}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </section>
            );
        })() : null}

{tab === "fight" ? (<>
            {/* ── ONE LINE FOR WHAT YOU FIGHT WITH ── the kit used to be four full cards at the top of this
                tab. It is now the Skills tab's entire subject, so repeating it here was a screen of scrolling
                spent restating the tab next door. A strip of the sprites, and a way through to them. */}
            <button type="button" className="ar-kitline" onClick={() => { Sfx.ui(); setTab("tree"); }}>
                <span className="ar-kitline-arts">
                    {(st.me?.abilities || []).slice(0, 5).map((ab) => (
                        ab.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={ab.id} src={ab.sprite} alt="" draggable="false" />
                        ) : null
                    ))}
                </span>
                <span className="ar-kitline-txt">
                    <b>{st.progress?.cls?.name || "No discipline yet"}</b>
                    <em>
                        {(st.me?.abilities || []).length} skill{(st.me?.abilities || []).length === 1 ? "" : "s"}
                        {st.me?.element ? ` · ${st.me.element}` : ""}
                        {st.progress?.points?.available ? ` · ${st.progress.points.available} point to spend` : ""}
                    </em>
                </span>
                <span className="ar-kitline-go" aria-hidden="true">›</span>
            </button>

            {/* A fight you stepped out of is still standing, and it owns your next tap: you cannot start
                another while one is open, so the way back in has to be the loudest thing on the screen. */}
            {bout && !bout.over ? (
                <button type="button" className="ar-find is-resume" disabled={busy}
                    onClick={() => { unlock(); Sfx.ui(); setStepped(false); }}>
                    <GiCrossedSwords aria-hidden="true" />
                    <span>
                        <b>Back to the fight</b>
                        <em>{bout.foe?.name || "Your opponent"} is still standing — round {bout.beat}</em>
                    </span>
                </button>
            ) : null}
            {/* ── AND THE DOOR, IF THE FIGHT WILL NOT END ─────────────────────────────────────────────────
                Deliberately small, deliberately under the resume button, and deliberately two taps. An open
                bout blocks every other fight you might start, so before this existed a bout that could not
                be finished cost you the Arena AND the plaza raid for as long as it lasted — which for one
                member was a full day. It takes the loss, because a free exit from a bad matchup is a re-roll.
                The stalls it was built for are fixed; this is for the next one nobody has found yet. */}
            {bout && !bout.over ? (
                <button type="button" className="ar-forfeit" disabled={busy}
                    onClick={() => {
                        Sfx.ui();
                        if (!giveUp) { setGiveUp(true); setTimeout(() => setGiveUp(false), 4000); return; }
                        setGiveUp(false); setStepped(false); act("forfeit");
                    }}>
                    {giveUp ? "Tap again to take the loss" : "Give up this fight"}
                </button>
            ) : null}

            {/* ── ONE BUTTON ── it was two stacked lists of eighty rows behind a switch, and picking off them
                is not a decision anybody has the information to make: a name, a level and a health number do
                not tell you whether you can take somebody. The sea answers this with one button and so does
                this now — the server matches you against someone your own size, member or Gauntlet, aimed a
                shade in your favour. The Gauntlet's tiers are still there to be climbed; you just meet them
                when you are the right size for them.

                The lists themselves are not missed: the standings below are who is who, and the recap after a
                bout is where an opponent actually becomes a name you remember. */}
            {/* An open bout is refused by the server every single time (`bout_in_progress`), so offering the
                press is offering a round trip that cannot succeed. The way back in is the button above. */}
            <button type="button" className="ar-find" disabled={busy || st.fightsLeft <= 0 || Boolean(bout && !bout.over)}
                onClick={() => { unlock(); Sfx.ui(); setStepped(false); act("start", { target: "auto" }); }}>
                {/* A PAINTED SPRITE, not a glyph. Line art on a solid gold plate is the one combination that
                    reads as a placeholder — the sea's equivalent button has had painted art since it shipped.
                    This is the Reaver tree's own Cleave sprite: steel and flame, already drawn in the house
                    style, already in the arena's art folder. No new art needed for a button. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ar-find-ico" src="/images/arena/node/rv_strike.webp" alt="" draggable="false" />
                <span>
                    {/* THE COUNT GOES ON THE BUTTON. It was already on Your card, at the top of the screen —
                        which is above the fold on a phone by the time you have scrolled to the thing you press,
                        so the one place the allowance matters was the one place it was not written. Luke, who
                        wrote it: "where do I see my use count and remaining for find a fight?" */}
                    {/* A PRESS HAS TO SHOW. The button looked identical mid-flight, so a slow round trip was
                        indistinguishable from a tap that never registered — and the honest answer to "did it
                        take my tap" is to say so on the button itself. */}
                    <b>{busy ? "Looking for an opponent…"
                        : bout && !bout.over ? "Finish the fight you are in"
                            : st.fightsLeft > 0 ? `Find a fight · ${st.fightsLeft} of ${st.fightsPerDay} left` : "No fights left today"}</b>
                    <em>{busy ? "Matching you against someone your own size"
                        : bout && !bout.over ? `${bout.foe?.name || "Your opponent"} is still standing — one fight at a time`
                            : st.fightsLeft > 0
                                ? "Someone your own size — a member of the Den, or the Gauntlet"
                                : "They come back at 5am — the Road does not use them"}</em>
                </span>
            </button>

            {/* The standings are context, not the job. Three rows, and the rest on request. */}
            {st.board?.length ? (
                <div className="ar-board">
                    <span className="ar-up-head">Who else fights</span>
                    {(boardAll ? st.board : st.board.slice(0, 3)).map((r) => (
                        <div key={r.id} className={`ar-up-row${r.you ? " is-you" : ""}`}>
                            {/* No rung. What a member brings is their card, the same as everybody else's. */}
                            <span className="ar-up-name">{r.name}{r.you ? " · you" : ""}</span>
                            <span className="ar-up-card">{Math.round(r.damage || 0)} dmg · {Math.round(r.health || 0)} hp</span>
                            <span className="ar-up-lvl">{money(r.vp)} VP</span>
                        </div>
                    ))}
                    {st.board.length > 3 ? (
                        <button type="button" className="ar-more" onClick={() => setBoardAll((v) => !v)}>
                            {boardAll ? "Show less" : `Show all ${st.board.length}`}
                        </button>
                    ) : null}
                </div>
            ) : null}
            </>) : null}
            <Styles />
        </section>
    );
}

// ── WHAT HAPPENED WHILE YOU WERE AWAY ────────────────────────────────────────────────────────────────────────
// You get fought while you are asleep. Without this a member simply finds their place changed and no
// explanation anywhere in the game — so this is shown once, on the visit after it happened, and dismissing it
// stamps last_seen_at.
// ── WHILE YOU WERE AWAY ──────────────────────────────────────────────────────────────────────────────────────
// This was built on the ladder and outlived it. Every row said somebody "took your spot" — there are no spots
// any more — and printed `#{myPos}` off a `defender_pos` column that stopped meaning anything when the rungs
// were deleted, so it rendered a bare hash. Three fights from one person printed the same sentence three
// times.
//
// It says the two things that are actually true now: how your build did against each person who came at you,
// and what turning them away paid you. A defender is asleep for all of this, so the report IS the feature —
// it is the only moment the game gets to tell you your loadout was working without you.
// ── THE PURSER'S EXCHANGE ────────────────────────────────────────────────────────────────────────────────────
// Drawn only for the member wearing the piece — st.purser is null for everyone else, which is why this is a
// bare early return rather than a disabled panel. A shop you can never use is worse than no shop.
//
// It lives in the Armoury tab because that is the one screen where a laurel is already a number you are
// deciding what to do with. The doubloon side is deliberately shown at the same size: the whole point of the
// power is that the two purses are one purse now.
export function PurserPanel({ st, busy, act }) {
    const [from, setFrom] = useState("doubloons");
    const [amount, setAmount] = useState("");
    if (!st?.purser) return null;
    const held = from === "doubloons" ? st.purser.doubloons : st.laurels;
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    const ok = n > 0 && n <= Math.min(held, st.purser.max);
    return (
        <div className="ar-purser">
            <b>The Purser&apos;s Exchange</b>
            <p className="ar-arm-sub">
                One for one, either way. You hold {money(st.purser.doubloons)} doubloons and {money(st.laurels)} laurels.
                Gold stays out of it.
            </p>
            <div className="ar-purser-row">
                <button type="button" className={`btn-ghost${from === "doubloons" ? " is-active" : ""}`} onClick={() => setFrom("doubloons")}>Doubloons → laurels</button>
                <button type="button" className={`btn-ghost${from === "laurels" ? " is-active" : ""}`} onClick={() => setFrom("laurels")}>Laurels → doubloons</button>
            </div>
            <div className="ar-purser-row">
                <input className="ar-purser-in" inputMode="numeric" value={amount} placeholder={`up to ${money(Math.min(held, st.purser.max))}`}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
                <button type="button" className="btn-gold" disabled={!ok || busy}
                    onClick={async () => { await act("purser", { from, amount: n }); setAmount(""); }}>
                    {busy ? "…" : "Exchange"}
                </button>
            </div>
        </div>
    );
}

function AwayReport({ rows, onClose }) {
    useScrollLock(true);
    const earned = rows.reduce((n, r) => n + (r.laurels || 0), 0);
    const held = rows.reduce((n, r) => n + (r.held || 0), 0);
    const bouts = rows.reduce((n, r) => n + (r.bouts || 0), 0);
    return (
        <Portal>
            <div className="ar-away" role="dialog" aria-modal="true">
                <div className="ar-away-card">
                    <span className="ar-recap-kick">While you were away</span>
                    <b className="ar-recap-title">
                        {bouts} bout{bouts === 1 ? "" : "s"}{held ? ` · you held ${held}` : ""}
                    </b>
                    {/* The payout, up top, because it is the part that is new and the part nobody expects. */}
                    {earned > 0 ? (
                        <div className="ar-away-earned">
                            <img src={LAUREL} alt="" className="ar-laurel" draggable="false" />
                            <b>+{money(earned)}</b> laurels — your build fought for you
                        </div>
                    ) : null}
                    <div className="ar-away-list">
                        {rows.map((r, i) => (
                            <div key={i} className={`ar-away-row ${r.held > r.lost ? "is-win" : "is-loss"}`}>
                                <div className="ar-portrait is-tiny">
                                    {r.them.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={r.them.sprite} alt="" draggable="false" />
                                    ) : <span className="ar-noface" aria-hidden="true" />}
                                </div>
                                <span className="ar-away-text">
                                    <b>{r.them.name}</b>
                                    <em>
                                        {r.bouts > 1 ? `${r.bouts} times · ` : ""}
                                        {r.held && r.lost ? `you turned them away ${r.held}, they won ${r.lost}`
                                            : r.held ? (r.held > 1 ? `turned away ${r.held} times` : "came at you and lost")
                                            : (r.lost > 1 ? `beat you ${r.lost} times` : "beat you")}
                                    </em>
                                </span>
                                {r.laurels > 0 ? <span className="ar-away-pos">+{r.laurels}</span> : null}
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
            /* VP and Laurels, each said in three words. */
            /* Two chips SIDE BY SIDE. As a wrapping flex row the second one dropped to its own line on every
               phone, which cost the header a whole band of height for two short numbers. */
            .ar-currency { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
            .ar-currency i { font-style: normal; display: grid; padding: 4px 9px; border-radius: 9px;
                background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.12); }
            .ar-currency b { font-size: 12px; color: #ffd75e; font-variant-numeric: tabular-nums; }
            .ar-currency em { font-style: normal; font-size: 8.5px; letter-spacing: .06em;
                text-transform: uppercase; color: #7f8790; }
            .ar-tonext-label b { color: color-mix(in srgb, var(--rank) 70%, white); }

            /* ── the buttons ── */
            /* Their own, not .dlv-btn: that class lives inside DelveClient's scoped <style jsx>, so borrowing
               it here produced a bare browser-default button in the middle of the screen. */
            /* The skip sits with the other in-fight controls and is deliberately quiet — it is an exit from
               the spectacle, not a feature of it. */
            .ar-skip { color: #cdd5df; }
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
            .ar-mycard { display: flex; gap: 10px; flex-wrap: wrap; margin: 3px 0 1px; font-size: 10px;
                font-weight: 800; color: rgba(255,224,176,.78); }
            .ar-mycard i { font-style: normal; white-space: nowrap; }
            .ar-mycard b { color: #ffe9c2; font-weight: 900; font-size: 12px; }
            .ar-up-card { font-size: 9.5px; font-weight: 800; color: rgba(255,224,176,.6); white-space: nowrap; }
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
            /* ── THE FIGHT OWNS THE SCREEN ── fixed to the viewport, like a ship battle. It used to be a card
               in the page whose height was measured once, which meant one swipe (or a phone browser hiding its
               own address bar) slid the HP bars off the top while the command deck stayed pinned to the
               bottom — the bars or the buttons, never both, for the whole fight.
               100svh is the SMALL viewport: the one that is still there when the browser chrome comes back. */
            .ar.ar-fight { position: fixed; inset: 0; height: 100svh; z-index: 4000;
                margin: 0; padding: 0; border: 0; border-radius: 0; max-width: none;
                display: flex; flex-direction: column; overflow: hidden;
                background: #0b0910; }
            .ar-ring { position: relative; border-radius: 16px; overflow: hidden;
                height: min(74vh, 640px); min-height: 420px;
                display: flex; flex-direction: column;
                background: linear-gradient(180deg, #150f0c 0%, #1e1410 52%, #33210f 100%);
                border: 1px solid rgba(255,190,110,0.3); }
            /* Inside the scene the ring takes whatever the bars and the deck have not: the sprites are
               object-fit:contain, so they simply draw smaller on a short screen instead of pushing anything
               off it. min-height:0 is what lets a flex child actually shrink. */
            .ar-fight .ar-ring { flex: 1 1 auto; height: auto; min-height: 0;
                border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
            /* Shake is one decaying impulse per hit from the canvas engine, scaled by damage — a graze and a
               fight-ender no longer shake identically. .ar-quake is the node whose transform it writes. */
            .ar-quake { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
            @keyframes arShake { 0%,100% { transform: translate(0,0) } 28% { transform: translate(-6px,3px) } 62% { transform: translate(6px,-3px) } }
            /* ── FRAMING ── the background is an arena whose lit sand oval sits in the bottom third of the
               image. Centred, that oval landed off the bottom of a portrait panel and both fighters ended up
               standing against the STANDS — which is why they read as cut-outs pasted on a wall. Biasing the
               crop downward puts the sand under their feet, where a fight happens. */
            /* The panel is PORTRAIT and the painting is landscape, so object-fit: cover crops a narrow vertical
               slice — and the centre slice of this particular arena is its darkest part, which is how the
               stage ended up looking like a black rectangle with two men in it. Biased left and scaled up so
               the lit sand sits under their feet and the arches read above them. */
            /* THE PAINTING IS THE ONLY THING TELLING YOU WHERE YOU ARE, and it was being thrown away twice
               over: a 1.25 zoom anchored at 38% cropped past the lit sand into the shadowed left arches, and
               the vignette below then took another 50% off what survived. Measured on a 375px phone, the ring
               averaged RGB 44,37,28 — a fight happening in a nearly black box. Pulled back to 1.12 and
               re-aimed at the middle, where the warm pool of light actually is, and lifted a touch. */
            .ar-ring-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                object-position: 46% 100%; transform: scale(1.12); transform-origin: 50% 100%;
                filter: brightness(1.2) saturate(1.06); }
            /* Two washes, not one: a vignette that pushes the eye to the middle, and a warm floor glow that
               makes the sand read as lit ground rather than more brown. Kept LIGHT — the first cut of this
               stacked a scrim, a bottom gradient and a crop that between them turned a rather good painting
               of an arena into a black rectangle. The background is the only thing telling you where you are. */
            /* THE BOTTOM HAS TO GO DARK, and the vignette alone never did it: a radial darkens the CORNERS and
               leaves the middle of the bottom edge — which is exactly where the lit sand is, where the beat
               line sits, and where the command deck starts. The result was a bright band with white text on
               it, unreadable, right under two dark fighters. The linear below is the fix: the painting stays
               lit where the fighters stand and falls away into the deck, so the text has something to sit on
               and the ring ends rather than being cut off. */
            .ar-ring-scrim { position: absolute; inset: 0;
                background:
                    radial-gradient(58% 26% at 50% 72%, rgba(255,186,92,0.2), transparent 72%),
                    radial-gradient(95% 80% at 50% 50%, transparent, rgba(10,6,4,0.3)),
                    linear-gradient(180deg, transparent 52%, rgba(8,5,4,0.42) 74%, rgba(6,4,3,0.86) 90%, rgba(5,3,3,0.94) 100%); }
            /* ── LANDSCAPE PHONE ── a short, wide viewport leaves ~250px for the whole ring, so every band
               that is merely nice-to-have gives its pixels back to the stage. The fighters and the deck are
               what you cannot do without. */
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
            /* auto | 1fr | auto — the round on the left, the tags in whatever is left in the middle, the
               tools on the right. minmax(0,1fr) is load-bearing: a plain 1fr refuses to shrink below its
               content, which would push the tools back off the edge on a narrow phone. */
            .ar-hud { position: relative; z-index: 5; flex: 0 0 auto; padding: 8px 8px 0; display: grid;
                grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 6px;
                pointer-events: none; }
            .ar-hud-tags { display: flex; align-items: center; justify-content: center; gap: 6px;
                flex-wrap: wrap; min-width: 0; }
            .ar-round { font-size: 10px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase;
                color: #ffe0b0; text-shadow: 0 2px 8px #000; }
            /* The affinity read and the underdog bonus used to be paragraphs UNDER the panel, where they were
               page copy rather than fight state. Same words, on the field, where they apply. */
            .ar-tag { font-size: 9.5px; font-weight: 900; padding: 2px 8px; border-radius: 999px;
                background: rgba(8,6,10,0.66); border: 1px solid rgba(255,255,255,0.16); backdrop-filter: blur(2px); }
            .ar-tag.is-good { color: #8bf0b4; border-color: rgba(139,240,180,.45); }
            .ar-tag.is-bad { color: #ff9f9f; border-color: rgba(255,159,159,.45); }
            .ar-tag.is-fever { color: #ff8a4c; border-color: rgba(255,138,76,.6);
                animation: arFever 1.1s ease-in-out infinite; }
            @keyframes arFever { 0%, 100% { opacity: .82; } 50% { opacity: 1; } }
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
            /* The hex row sits above the fighters and out of the way of the damage floats. Small, dense and
               colour-coded by whether it is on you (red), a mark (amber) or on them (green — their frenzy is
               the one that is also YOUR window). */
            .ar-barcol { display: grid; gap: 3px; min-width: 0; }
            .ar-status { display: flex; flex-wrap: wrap; gap: 3px; }
            .ar-status.is-them { justify-content: flex-end; }
            .ar-stat { display: inline-flex; align-items: center; gap: 2px; padding: 1px 5px; border-radius: 999px;
                font-size: 10px; font-weight: 900; line-height: 1.5; cursor: pointer; font-variant-numeric: tabular-nums;
                background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #dfe6ee; }
            .ar-stat svg { font-size: 12px; }
            .ar-stat.is-fire { color: #ffb066; border-color: rgba(255,138,42,0.55); background: rgba(255,110,30,0.14);
                animation: arBurnPulse 1.15s ease-in-out infinite; }
            .ar-stat.is-bad { color: #ff9f9f; border-color: rgba(255,120,120,0.45); background: rgba(255,90,90,0.12); }
            .ar-stat.is-mark { color: #ffd75e; border-color: rgba(255,215,94,0.5); background: rgba(255,215,94,0.12); }
            .ar-stat.is-doom { color: #fff; border-color: rgba(255,80,80,0.7); background: rgba(200,30,30,0.28);
                animation: arBurnPulse .8s ease-in-out infinite; }
            /* ICE. Deliberately the coldest thing on the screen — the burn pulses warm and fast, this one
               breathes slowly, so which of the two is on you is readable at a glance without reading a word. */
            .ar-theirchip.is-open { border-color: var(--el, #ffd75e); box-shadow: 0 0 0 2px rgba(255,215,94,0.35); }
            /* FIXED, not absolute. The strip lives in a flex row with no positioned ancestor nearby, so an
               absolute card resolved against something far up the tree and rendered off-screen — present in
               the DOM, invisible on the screen, which is the worst of both. Anchored to the viewport just
               above the command bar it lands in the same place every time. */
            .ar-theircard { position: fixed; right: 10px; bottom: 96px; z-index: 30; width: min(260px, 82vw);
                display: block; padding: 9px 11px; border-radius: 12px; cursor: pointer; text-align: left;
                background: linear-gradient(180deg, rgba(26,28,34,0.98), rgba(16,17,21,0.98));
                border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
            .ar-theircard-tap { display: block; margin-top: 6px; font-style: normal; font-size: 10px;
                letter-spacing: .06em; text-transform: uppercase; color: #7f8790; }
            .ar-stat.is-blood { color: #ff8f8f; border-color: rgba(220,70,70,0.6); background: rgba(190,40,40,0.16); }
            .ar-stat.is-ice { color: #a8e4ff; border-color: rgba(120,205,255,0.6); background: rgba(90,180,255,0.15);
                animation: arFrostPulse 1.9s ease-in-out infinite; }
            @keyframes arFrostPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(140,215,255,0); }
                50% { box-shadow: 0 0 9px 1px rgba(140,215,255,0.45); }
            }
            .ar-statcard { position: relative; z-index: 7; margin: 6px 0 0; padding: 9px 11px; border-radius: 12px; cursor: pointer;
                background: linear-gradient(180deg, rgba(26,28,34,0.98), rgba(16,17,21,0.98));
                border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 10px 26px rgba(0,0,0,0.5); }
            .ar-statcard b { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
            .ar-statcard b u { text-decoration: none; margin-left: auto; font-size: 10px; font-weight: 800; color: #b9c2cc; }
            .ar-statcard p { margin: 4px 0 0; font-size: 11.5px; line-height: 1.45; color: #c8d0d9; }
            .ar-statcard-now b { display: inline; color: #ffb066; }
            /* The only header control that costs you anything, so armed it stops looking like its neighbours. */
            .ar-giveup.is-armed { color: #fff; border-color: rgba(255,90,90,0.85); background: rgba(200,30,30,0.34);
                animation: arBurnPulse .8s ease-in-out infinite; }
            .ar-statcard-x { margin-left: 8px; font-size: 15px; line-height: 1; color: #b9c2cc; flex: none; }
            .ar-statcard-tap { margin-top: 6px !important; font-size: 10px !important; letter-spacing: .06em;
                text-transform: uppercase; color: #7f8790 !important; }
            .ar-cmd-sub.is-off { color: #ff9f9f; font-size: 10.5px; letter-spacing: .02em; }
            .ar-hexes { position: relative; z-index: 6; display: flex; flex-wrap: wrap; gap: 4px;
                justify-content: center; padding: 2px 8px 0; }
            .ar-hexes i { font-style: normal; font-size: 10px; font-weight: 900; letter-spacing: .05em;
                text-transform: uppercase; padding: 2px 7px; border-radius: 999px;
                border: 1px solid currentColor; background: rgba(6,4,10,0.55); }
            .ar-hexes i b { margin-left: 4px; font-weight: 900; opacity: .85; }
            .ar-hexes .is-bad { color: #ff8ba0; }
            .ar-hexes .is-mark { color: #ffd75e; }
            .ar-hexes .is-bell { color: #ff6f3d; animation: arBell 1s ease-in-out infinite alternate; }
            .ar-hexes .is-frenzy { color: #8bf0b4; }
            @keyframes arBell { from { opacity: .55 } to { opacity: 1 } }
            .ar-floor { position: relative; z-index: 2; flex: 1 1 auto; min-height: 0;
                transition: transform .45s cubic-bezier(.2,.9,.3,1); }
            /* Sized so the two of them meet near the middle without occluding each other, and so the lit sand
               still reads underneath. Wider than this and they crowd; narrower and they are back to being two
               small figures with an empty arena between them. */
            /* ── OFF THE VERY BOTTOM EDGE ────────────────────────────────────────────────────────────────
               bottom:0 stood them on the frame's edge, so on a tall ring the pair sat in the last tenth of
               the screen under a great empty arena, with the caption bar cropping their feet. Lifted clear of
               it; the ring's own floor gradient (::before, 26%) is what they now stand on. */
            .ar-fighter { position: absolute; bottom: 13%; width: 54%; height: 87%; }
            /* ── BLEEDING ────────────────────────────────────────────────────────────────────────────────
               A red wash under the body and drops running DOWN out of it — the opposite direction to haste's
               motes, so the two states never read as the same effect in a different colour. */
            .ar-bleed { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
            .ar-bleed-glow { position: absolute; left: 50%; bottom: 2%; width: 74%; height: 56%;
                transform: translateX(-50%); border-radius: 50%;
                background: radial-gradient(ellipse at center, rgba(224,60,60,.5), rgba(190,30,30,.16) 55%, transparent 74%);
                animation: arBleedPulse 1.35s ease-in-out infinite; }
            @keyframes arBleedPulse { 0%, 100% { opacity: .5; transform: translateX(-50%) scale(.95) }
                50% { opacity: .9; transform: translateX(-50%) scale(1.05) } }
            .ar-bleed-drop { position: absolute; top: 34%; left: calc(30% + (var(--i) * 8%));
                width: 4px; height: 7px; border-radius: 0 0 50% 50%;
                background: linear-gradient(#ff6b6b, #b41818);
                box-shadow: 0 0 6px rgba(224,60,60,.85);
                animation: arBleedFall 1.15s linear infinite; animation-delay: calc(var(--i) * -0.19s); }
            @keyframes arBleedFall { 0% { opacity: 0; transform: translateY(-6px) scaleY(.7) }
                20% { opacity: 1 } 100% { opacity: 0; transform: translateY(54px) scaleY(1.2) } }
            .ar-bleed-word { position: absolute; left: 50%; bottom: 84%; transform: translateX(-50%); z-index: 8;
                font-size: .84rem; font-weight: 900; letter-spacing: .1em; color: #ff7b7b; white-space: nowrap;
                text-shadow: 0 2px 8px #000, 0 0 18px rgba(224,60,60,.95);
                animation: arBleedWord .5s cubic-bezier(.2,1.5,.3,1) both; }
            @keyframes arBleedWord { 0% { opacity: 0; transform: translateX(-50%) scale(.6) }
                60% { opacity: 1; transform: translateX(-50%) scale(1.12) } 100% { opacity: 1; transform: translateX(-50%) scale(1) } }
            /* The body itself runs red while the wound is open. */
            .ar-fighter.is-bleeding .ar-hero { filter: drop-shadow(0 0 9px rgba(224,60,60,.7)) saturate(1.1); }

            /* ── STUNNED ─────────────────────────────────────────────────────────────────────────────────
               Three stars on a ring above the head, the ring turning, each star bobbing on its own offset so
               it reads as a wobble rather than a rigid spin. The word sits above them and pulses, because the
               fighter is going to stand there for a whole swing and the screen has to say why. */
            .ar-stun { position: absolute; left: 50%; bottom: 86%; transform: translateX(-50%);
                z-index: 7; display: grid; justify-items: center; gap: 2px; pointer-events: none; }
            .ar-stun-swirl { position: relative; width: 46px; height: 18px; animation: arStunSpin 1.15s linear infinite; }
            .ar-stun-swirl i { position: absolute; top: 50%; left: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px;
                border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff7c2, #ffd75e 55%, rgba(255,190,60,0) 72%);
                box-shadow: 0 0 10px rgba(255,214,94,.95); }
            .ar-stun-swirl i:nth-child(1) { transform: rotate(0deg) translateX(21px); }
            .ar-stun-swirl i:nth-child(2) { transform: rotate(120deg) translateX(21px); }
            .ar-stun-swirl i:nth-child(3) { transform: rotate(240deg) translateX(21px); }
            @keyframes arStunSpin { to { transform: rotate(360deg); } }
            .ar-stun-word { font-size: .84rem; font-weight: 900; letter-spacing: .1em; color: #ffe27a;
                text-shadow: 0 2px 8px #000, 0 0 16px rgba(255,214,94,.9);
                animation: arStunPulse .78s ease-in-out infinite; }
            @keyframes arStunPulse { 0%, 100% { opacity: .72; transform: scale(.97) } 50% { opacity: 1; transform: scale(1.06) } }
            /* A stunned body sags and stops moving — the sprite itself says it too, not just the badge. */
            .ar-fighter.is-stunned .ar-hero { filter: saturate(.55) brightness(.85); animation: arStunSway 1.5s ease-in-out infinite; }
            @keyframes arStunSway { 0%, 100% { transform: rotate(-2.5deg) } 50% { transform: rotate(2.5deg) } }

            /* ── HASTED ──────────────────────────────────────────────────────────────────────────────────
               A green wash BEHIND the fighter and motes lifting off them. Both sit under the sprite in the
               stack so the character stays the brightest thing on their own tile. */
            .ar-haste { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
            .ar-haste-glow { position: absolute; left: 50%; bottom: 4%; width: 78%; height: 62%;
                transform: translateX(-50%); border-radius: 50%;
                background: radial-gradient(ellipse at center, rgba(96,240,150,.55), rgba(60,220,130,.16) 55%, transparent 74%);
                animation: arHasteBreath 1.1s ease-in-out infinite; }
            @keyframes arHasteBreath { 0%, 100% { opacity: .55; transform: translateX(-50%) scale(.94) }
                50% { opacity: .95; transform: translateX(-50%) scale(1.06) } }
            .ar-haste-mote { position: absolute; bottom: 12%; left: calc(28% + (var(--i) * 7%));
                width: 5px; height: 5px; border-radius: 50%;
                background: radial-gradient(circle, #b8ffd2, #4fe08a 60%, rgba(79,224,138,0) 75%);
                box-shadow: 0 0 8px rgba(96,240,150,.9);
                animation: arHasteRise 1.25s linear infinite; animation-delay: calc(var(--i) * -0.17s); }
            @keyframes arHasteRise { 0% { opacity: 0; transform: translateY(0) scale(.7) }
                18% { opacity: 1 } 100% { opacity: 0; transform: translateY(-78px) scale(1.1) } }
            .ar-haste-word { position: absolute; left: 50%; bottom: 88%; transform: translateX(-50%); z-index: 7;
                font-size: .84rem; font-weight: 900; letter-spacing: .1em; color: #8bf0b4; white-space: nowrap;
                text-shadow: 0 2px 8px #000, 0 0 18px rgba(96,240,150,.95);
                animation: arHasteWord .82s ease-in-out infinite; }
            @keyframes arHasteWord { 0%, 100% { opacity: .78; transform: translateX(-50%) translateY(0) }
                50% { opacity: 1; transform: translateX(-50%) translateY(-3px) } }
            /* A hasted fighter visibly runs hot: the sprite itself picks up the tint. */
            .ar-fighter.is-hasted .ar-hero { filter: drop-shadow(0 0 10px rgba(96,240,150,.75)); }

            /* SAME SAND, SAME SIZE. The enemy used to be drawn smaller and standing further up the field —
               two deliberate cues for depth, and they worked: they made the opponent read as scenery. A duel
               is two people at arm's length, and the person trying to kill you should not look like he is
               standing at the back of the room. Both fighters share a baseline and a scale now; the frame
               only has to say "these two, facing each other", and the arena painting behind them is doing
               all the depth this scene needs. */
            /* FLUSH TO THE EDGE, NOT PAST IT. Both of these used to sit at -3%, which on a 375px phone is a
               297px ring and 8px of fighter hanging outside a box that clips its overflow — measured, not
               guessed: the foe's own bounding box ran to 304. The enemy is mirrored, so the 8px came off the
               FRONT of them: axe, leading shoulder, the side you are looking at. The 3% bought about five
               pixels of size and cost the part of the sprite that matters. */
            .ar-floor > .ar-fighter:not(.is-foe) { left: 0; z-index: 3; width: 52%; bottom: 0; }
            /* 47% -> 50% pays back what the sprite reframe cost. The NPC art now carries a 7% margin inside
               its own canvas so nothing is flush to a clipping edge, which also made every opponent render
               about that much smaller; three points of box width puts the enemy back to the size they read at
               before, without going anywhere near the frame. */
            .ar-floor > .ar-fighter.is-foe { right: 0; z-index: 2; width: 52%; bottom: 0; }
            /* ── SPOTLIGHT ── the floor pushes in on the caster and everything else dims out of the way. */
/* The camera pushes toward whoever is casting and everything else falls away. */
            .ar-ring.is-on-you .ar-floor { transform: scale(1.18) translateX(9%); }
            .ar-ring.is-on-them .ar-floor { transform: scale(1.18) translateX(-9%); }
            .ar-ring.is-on-you .ar-ring-scrim { background: radial-gradient(44% 38% at 24% 58%, transparent, rgba(6,4,10,0.88)); }
            .ar-ring.is-on-them .ar-ring-scrim { background: radial-gradient(44% 38% at 76% 58%, transparent, rgba(6,4,10,0.88)); }
            /* In the full-screen scene the ring is portrait, so a spotlight measured as a percentage of it
               collapsed to a small disc with a black field around it. Sized off the WIDTH and aimed at the
               floor, where the fighters actually stand. */
            .ar-fight .ar-ring.is-on-you .ar-ring-scrim { background: radial-gradient(78% 30% at 26% 76%, transparent, rgba(6,4,10,0.86)); }
            .ar-fight .ar-ring.is-on-them .ar-ring-scrim { background: radial-gradient(78% 30% at 74% 76%, transparent, rgba(6,4,10,0.86)); }
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
            /* THE BURN. Ember on the fighter that is burning: what it costs a turn, how many turns are left,
               and a stack count only when it is actually stacked. */
            .ar-burn { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 999px;
                margin-left: 5px; vertical-align: middle;
                font-size: 10.5px; font-weight: 900; font-style: normal; letter-spacing: .2px; color: #ffd0a0;
                background: linear-gradient(180deg, rgba(255,138,42,0.30), rgba(255,86,20,0.16));
                border: 1px solid rgba(255,138,42,0.55); box-shadow: 0 0 10px rgba(255,110,30,0.35);
                animation: arBurnPulse 1.15s ease-in-out infinite; }
            .ar-burn svg { font-size: 12px; color: #ff8a2a; }
            .ar-burn b { color: #ffb066; }
            .ar-burn u { text-decoration: none; padding-left: 4px; margin-left: 1px; color: #ffe3c4;
                border-left: 1px solid rgba(255,138,42,0.45); }
            .ar-burn s { text-decoration: none; color: #ffb066; opacity: .75; }
            @keyframes arBurnPulse {
                0%, 100% { box-shadow: 0 0 8px rgba(255,110,30,0.28); }
                50% { box-shadow: 0 0 16px rgba(255,110,30,0.6); } }
            /* THE BLEED, the same three facts in its own colour. Blood reads red and goes STRAIGHT to health,
               so its bar treatment is a hard pulse rather than the burn's warm glow — the two must never be
               mistaken for each other at a glance mid-fight. */
            .ar-bleed { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 999px;
                margin-left: 5px; vertical-align: middle;
                font-size: 10.5px; font-weight: 900; font-style: normal; letter-spacing: .2px; color: #ffc9c9;
                background: linear-gradient(180deg, rgba(220,60,60,0.30), rgba(150,20,20,0.16));
                border: 1px solid rgba(230,70,70,0.55); box-shadow: 0 0 10px rgba(220,50,50,0.35);
                animation: arBleedPulse 1.15s ease-in-out infinite; }
            .ar-bleed svg { font-size: 12px; color: #ff5f5f; }
            .ar-bleed b { color: #ff8f8f; }
            .ar-bleed u { text-decoration: none; padding-left: 4px; margin-left: 1px; color: #ffe0e0;
                border-left: 1px solid rgba(230,70,70,0.45); }
            .ar-bleed s { text-decoration: none; color: #ff8f8f; opacity: .75; }
            @keyframes arBleedPulse {
                0%, 100% { box-shadow: 0 0 8px rgba(220,50,50,0.28); }
                50% { box-shadow: 0 0 16px rgba(220,50,50,0.6); } }
            .ar-bar.is-bleeding .ar-hp { box-shadow: inset 0 0 12px rgba(220,50,50,0.55); }
            .ar-bar.is-bleeding .ar-hp > i { animation: arBleedBar 1.15s ease-in-out infinite; }
            @keyframes arBleedBar {
                0%, 100% { filter: none; }
                50% { filter: brightness(1.2) saturate(1.5) drop-shadow(0 0 6px rgba(230,60,60,0.75)); } }
            /* …and the bar it is eating, so the tick has a visible cause and not just a number. */
            .ar-bar.is-burning .ar-hp { box-shadow: inset 0 0 12px rgba(255,110,30,0.55); }
            .ar-bar.is-burning .ar-hp > i { animation: arBurnBar 1.15s ease-in-out infinite; }
            @keyframes arBurnBar {
                0%, 100% { filter: none; }
                50% { filter: brightness(1.25) saturate(1.3) drop-shadow(0 0 6px rgba(255,120,40,0.75)); } }
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
            /* ── THE MIRROR IS A PROPERTY OF THE FIGHTER, NOT OF ONE ANIMATION ───────────────────────────
               It used to live INSIDE the keyframes — every mirrored variant opened with scaleX(-1), and the
               foe's rest pose was whatever arBreatheFoe happened to be holding. That works right up until an
               animation runs that has no mirrored variant, and then the enemy turns round and fights with his
               back to you for as long as it lasts. arStunSway is exactly that: no Foe version, no scaleX,
               so a stunned foe faced away for the whole stun. Luke: "they are still facing the wrong way" —
               and the sprite was fine, the ring simply stopped mirroring him.
               scale is its own property, not part of transform, so a transform animation cannot overwrite
               it. Every keyframe below now carries only its motion, and the flip is held here where no
               animation can reach it. Translations still read mirrored because scale is applied before the
               transform, exactly as it was when the two were in the same declaration. */
            .ar-fighter.is-mirror .ar-hero { scale: -1 1; }
            .ar-fighter.is-mirror .ar-hero { animation: arBreatheFoe 2.8s ease-in-out infinite alternate; }
            @keyframes arBreatheFoe { from { transform: translateY(0) } to { transform: translateY(-5px) } }
            /* ── THE TELEGRAPH ── the acting fighter draws back for exactly as long as the ring takes to close,
               so the wind-up and the countdown are the same event. There was nothing tying the circle to the
               fight before this: the ring closed on its own while both fighters stood there breathing, so the
               timing had no visible cause. Now you can watch the fighter instead and still hit the beat. */
            .ar-fighter.is-wind .ar-hero { animation: arWind var(--wind, 1.4s) cubic-bezier(.35,0,.65,1) both; }
            @keyframes arWind {
                0% { transform: translateX(0) rotate(0deg); filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)); }
                100% { transform: translateX(-18px) rotate(-9deg) scale(1.06);
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 20px rgba(255,215,94,0.9)); } }
            .ar-fighter.is-mirror.is-wind .ar-hero { animation: arWindFoe var(--wind, 1.4s) cubic-bezier(.35,0,.65,1) both; }
            @keyframes arWindFoe {
                0% { transform: translateX(0) rotate(0deg); filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)); }
                100% { transform: translateX(-18px) rotate(-9deg) scale(1.06);
                    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 20px rgba(111,208,255,0.9)); } }
            /* Whoever is being aimed at hunches — it reads as "this is coming at me" without pulling focus. */
            .ar-fighter.is-brace .ar-hero { animation: arBrace .45s ease-out both; }
            @keyframes arBrace { to { transform: translateY(4px) scale(.96) } }
            .ar-fighter.is-mirror.is-brace .ar-hero { animation: arBraceFoe .45s ease-out both; }
            /* THE "from" IS NOT OPTIONAL ON A MIRRORED KEYFRAME, and leaving it out is what made the enemy
               spin. A to-only keyframe starts from the element's UNDERLYING transform — which is none,
               scaleX(+1), not the mirrored breathing pose — so the browser spent .45s interpolating the foe
               from +1 through 0 to -1: the sprite squashed to nothing and turned itself inside out. It fired
               on is-brace, which is the beat where the enemy hunches because YOU are winding up, so it read as
               the enemy doing a 360 before every attack you made. Measured: scaleX went 1 -> .64 -> .32 -> 0. */
            @keyframes arBraceFoe { from { transform: translateY(0) scale(1) }
                to { transform: translateY(4px) scale(.96) } }
            /* ── CONTACT ── landing a blow drives you INTO them and back; taking one rocks you away from it.
               The old version nudged 14px and returned, which at this size was barely perceptible — the whole
               of "you hit them" was a number changing. A step-in with a scale-up sells the weight.

               "both" IS LOAD-BEARING ON EVERY ONE OF THESE, and it is not about the fill looking nicer.
               A mirrored animation with no fill mode reverts to the element's unanimated transform the
               instant it finishes: the enemy stepped back to centre, held it until the class came off, then
               snapped when breathing resumed. (The MIRROR no longer rides in these keyframes — see the
               scale rule on .ar-fighter.is-mirror .ar-hero — but the fill mode is still load-bearing for
               the motion itself.) */
            .ar-fighter.is-lunge .ar-hero { animation: arLunge .34s cubic-bezier(.2,.9,.3,1) both; }
            @keyframes arLunge {
                0% { transform: translateX(0) scale(1) }
                28% { transform: translateX(34px) scale(1.06) }
                100% { transform: translateX(0) scale(1) } }
            .ar-fighter.is-mirror.is-lunge .ar-hero { animation: arLungeFoe .34s cubic-bezier(.2,.9,.3,1) both; }
            @keyframes arLungeFoe {
                0% { transform: translateX(0) scale(1) }
                28% { transform: translateX(34px) scale(1.06) }
                100% { transform: translateX(0) scale(1) } }
            /* Taking one: knocked back, tipped, and washed red. */
            .ar-fighter.is-hurt .ar-hero { animation: arRecoil .36s cubic-bezier(.2,.9,.3,1) both;
                filter: drop-shadow(0 10px 16px rgba(0,0,0,0.7)) drop-shadow(0 0 18px #ff4d5e) brightness(1.6); }
            @keyframes arRecoil {
                0% { transform: translateX(0) rotate(0deg) }
                22% { transform: translateX(-22px) rotate(-5deg) }
                100% { transform: translateX(0) rotate(0deg) } }
            .ar-fighter.is-mirror.is-hurt .ar-hero { animation: arRecoilFoe .36s cubic-bezier(.2,.9,.3,1) both; }
            @keyframes arRecoilFoe {
                0% { transform: translateX(0) rotate(0deg) }
                22% { transform: translateX(-22px) rotate(-5deg) }
                100% { transform: translateX(0) rotate(0deg) } }
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
            /* The chip must not be inside the ellipsis, or a long name eats the affinity — which is the one
               thing on the plate you need before choosing a move. */
            /* Sized to the cap height of the name beside it, so the row reads as one line rather than an
               icon with text after it. The class colour is a soft glow, not a border — a hard ring here
               competes with the element chip two millimetres away. */
            .ar-cls { width: 17px; height: 17px; flex: none; object-fit: contain; border-radius: 4px;
                filter: drop-shadow(0 0 4px color-mix(in srgb, var(--cls, #9aa0a6) 65%, transparent)); }
            .ar-namerow { display: flex; align-items: center; gap: 5px; min-width: 0; }
            /* The burn chip must never cost the fighter their name — it shrinks to nothing before the chip
               does, and the chip is fixed. Without this the foe's name was squeezed clean out of the row. */
            .ar-fname { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-bar.is-foe .ar-namerow { justify-content: flex-end; }
            .ar-fname { font-size: 12px; font-weight: 900; color: #fff; text-shadow: 0 2px 7px #000;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
            .ar-el-chip { flex: 0 0 auto; }
            .ar-hp { position: relative; display: block; height: 11px; margin: 4px 0 2px; border-radius: 999px;
                overflow: hidden; background: rgba(0,0,0,0.68); border: 1px solid rgba(0,0,0,0.55);
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.7); }
            .ar-hp > i { display: block; height: 100%; background: linear-gradient(90deg, #4ad07f, #7ce8a4);
                transition: width .35s cubic-bezier(.2,.8,.3,1); }
            .ar-bar.is-foe .ar-hp > i { background: linear-gradient(90deg, #ff6f7d, #ffb0b8); }
            /* The ward, sitting on the bar as the slab it will eat before your health does. */
            .ar-hp-shield { position: absolute; top: 0; bottom: 0; z-index: 3; text-decoration: none;
                background: repeating-linear-gradient(115deg, rgba(111,208,255,.95) 0 4px, rgba(111,208,255,.6) 4px 8px);
                transition: left .35s ease, width .35s ease; }
            /* ── THE DANGER BAND ── under a third and the bar goes red and breathes. You feel the fight
               turning before you have read a number, which is the whole job of a health bar. */
            .ar-bar.is-danger .ar-hp > i { background: linear-gradient(90deg, #ff3b4e, #ff8f9a);
                animation: arDanger .7s ease-in-out infinite alternate; }
            @keyframes arDanger { from { filter: brightness(1) } to { filter: brightness(1.55) } }
            .ar-bar.is-danger .ar-hp { box-shadow: inset 0 1px 3px rgba(0,0,0,.7), 0 0 14px -2px rgba(255,60,80,.9); }
            /* A heal flashes the bar so it reads as health coming back rather than a number being different. */
            .ar-bar.is-healing .ar-hp > i { animation: arHealFlash .6s ease-out; }
            @keyframes arHealFlash { 0% { filter: brightness(2.4) saturate(.4) } 100% { filter: none } }
            .ar-mycard { display: flex; gap: 10px; flex-wrap: wrap; margin: 3px 0 1px; font-size: 10px;
                font-weight: 800; color: rgba(255,224,176,.78); }
            .ar-mycard i { font-style: normal; white-space: nowrap; }
            .ar-mycard b { color: #ffe9c2; font-weight: 900; font-size: 12px; }
            .ar-up-card { font-size: 9.5px; font-weight: 800; color: rgba(255,224,176,.6); white-space: nowrap; }
            .ar-stats { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 2px; font-style: normal;
                font-size: 8.5px; font-weight: 800; letter-spacing: .02em; color: rgba(255,224,176,.72); }
            .ar-bar.is-foe .ar-stats { justify-content: flex-end; }
            .ar-stats i { font-style: normal; white-space: nowrap; }
            .ar-stats b { color: #ffe9c2; font-weight: 900; }
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
            /* ── RETALIATION ── the callout for a blow you did not spend a turn on. Struck steel: it snaps in
               from the side you answered from rather than dropping in like a move you chose, and it is the one
               banner that leans. A crit counter gets the full flawless-sized kick. */
            .ar-grade.is-counter .ar-move { color: #ffe9a8; letter-spacing: .12em;
                text-shadow: 0 2px 10px #000, 0 0 26px rgba(255,190,80,.95);
                animation: arCounter .42s cubic-bezier(.2,1.5,.3,1) both; }
            .ar-grade.is-counter.is-theirs .ar-move { color: #ffc9c9;
                text-shadow: 0 2px 10px #000, 0 0 26px rgba(255,110,110,.9); animation-name: arCounterFoe; }
            .ar-grade.is-counter.is-crit .ar-move { font-size: 1.5rem; color: #fff6cc;
                text-shadow: 0 3px 14px #000, 0 0 30px #fff0a8, 0 0 60px rgba(255,190,60,1); }
            @keyframes arCounter { 0% { opacity: 0; transform: translateX(-38px) skewX(-14deg) scale(.8) }
                55% { opacity: 1; transform: translateX(4px) skewX(3deg) scale(1.08) }
                100% { opacity: 1; transform: none } }
            @keyframes arCounterFoe { 0% { opacity: 0; transform: translateX(38px) skewX(14deg) scale(.8) }
                55% { opacity: 1; transform: translateX(-4px) skewX(-3deg) scale(1.08) }
                100% { opacity: 1; transform: none } }
            @keyframes arGrade { 0% { opacity: 0; transform: scale(1.7) } 30% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(.95) translateY(-18px) } }
            .ar-clash-spark { position: absolute; width: 78px; height: 78px; border-radius: 50%;
                background: radial-gradient(circle, rgba(255,240,190,0.95), rgba(255,180,60,0.35) 45%, transparent 70%);
                animation: arSpark .5s ease-out .3s both; }
            @keyframes arSpark { 0% { opacity: 0; transform: scale(.3) } 40% { opacity: 1; transform: scale(1.15) } 100% { opacity: 0; transform: scale(1.5) } }

            /* A felled fighter drops to the sand and greys out — you SEE the blow land instead of being
               teleported to a summary. */
            .ar-fighter.is-down .ar-hero { animation: arDown .6s cubic-bezier(.4,0,.6,1) both; }
            @keyframes arDown { to { transform: translateY(16px) rotate(-16deg); opacity: .45; filter: grayscale(1) brightness(.6); } }
            .ar-fighter.is-mirror.is-down .ar-hero { animation: arDownFoe .6s cubic-bezier(.4,0,.6,1) both; }
            /* Same trap as arBraceFoe: without a from, going down flipped the loser through zero first. */
            @keyframes arDownFoe { from { transform: translateY(0) rotate(0deg); opacity: 1; }
                to { transform: translateY(16px) rotate(16deg); opacity: .45; filter: grayscale(1) brightness(.6); } }
            /* The celebration behind the word. Deliberately BEHIND: the sprite going down on the sand is the
               thing to look at, and this frames it rather than covering it. */
            .ar-cele { position: absolute; inset: -30%; z-index: -1; pointer-events: none;
                background: conic-gradient(from 0deg, transparent 0 9deg, rgba(255,225,140,0.16) 9deg 14deg, transparent 14deg 24deg);
                animation: arCeleSpin 9s linear infinite, arCeleIn .5s ease-out both; }
            @keyframes arCeleSpin { to { transform: rotate(360deg) } }
            @keyframes arCeleIn { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: scale(1) } }
            .ar-verdict-sub { display: block; margin-top: 4px; font-style: normal; font-size: 0.86rem;
                font-weight: 800; color: #ffe9b8; text-shadow: 0 2px 10px #000; }
            .ar-verdict { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
                align-content: center; gap: 12px; pointer-events: none; }
            .ar-verdict .ar-btn { pointer-events: auto; }
            .ar-verdict b { font-size: 2.1rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase;
                animation: arVerdict .55s cubic-bezier(.2,1.5,.35,1) .25s both; }
            .ar-verdict.is-win b { color: #ffe28a; text-shadow: 0 3px 18px #000, 0 0 40px rgba(255,190,60,.9); }
            .ar-verdict.is-loss b { color: #ffb0b8; text-shadow: 0 3px 18px #000, 0 0 40px rgba(255,80,100,.8); }
            @keyframes arVerdict { from { opacity: 0; transform: scale(1.7) } to { opacity: 1; transform: scale(1) } }

            /* The blow-by-blow sits ON the sand, so it needs its own floor rather than a text-shadow doing all
               the work — over the lit patch it was cream text on orange. */
            .ar-beat { position: relative; z-index: 5; flex: 0 0 auto; padding: 7px 10px 8px; margin: 0;
                font-size: 12px; line-height: 1.4; color: #efe6d6; text-align: center;
                background: linear-gradient(180deg, rgba(6,4,3,0.55), rgba(6,4,3,0.8));
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
            /* ── A WORLD FIRST ON THE LONG ROAD ───────────────────────────────────────────────────────
               Rare by construction: a hundred rungs, each claimable once by one person, ever. So it gets the
               loudest treatment on the recap and sits ABOVE the Victory line — winning the fight is the small
               half of it. Keyframes are ar-prefixed: two @keyframes sharing a name across styled-jsx blocks
               silently break both, and this file has several. */
            .ar-first { position: relative; overflow: hidden; margin: 0 0 12px; padding: 13px 14px;
                border-radius: 15px; text-align: center;
                background: radial-gradient(120% 140% at 50% 0%, rgba(255,215,94,0.30), rgba(255,215,94,0.06) 65%);
                border: 1px solid rgba(255,215,94,0.62);
                box-shadow: 0 0 0 1px rgba(255,215,94,0.20), 0 10px 30px rgba(255,180,40,0.22);
                animation: arFirstIn .5s cubic-bezier(.2,1,.3,1) both; }
            .ar-first::after { content: ""; position: absolute; inset: 0; pointer-events: none;
                background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.34) 50%, transparent 65%);
                transform: translateX(-120%); animation: arFirstSheen 2.4s ease-in-out .35s infinite; }
            @keyframes arFirstIn { from { transform: scale(.94); opacity: 0; } to { transform: none; opacity: 1; } }
            @keyframes arFirstSheen { 0% { transform: translateX(-120%); } 55%,100% { transform: translateX(120%); } }
            .ar-first-kick { display: block; font-size: 10px; font-weight: 900; letter-spacing: .16em;
                text-transform: uppercase; color: #ffd75e; }
            .ar-first b { display: block; margin-top: 3px; font-size: 1.12rem; line-height: 1.2; color: #fff4dc; }
            .ar-first em { display: block; margin-top: 4px; font-style: normal; font-size: .76rem;
                line-height: 1.4; color: #e2d3b0; }
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

            /* ── THE POINTS ── the number the whole bout was for. */
            .ar-vp { position: relative; display: grid; justify-items: center; gap: 1px; margin: 2px 0 14px; }
            .ar-vp-num { font-size: 2.6rem; font-weight: 900; line-height: 1; letter-spacing: -0.02em;
                color: color-mix(in srgb, var(--tint) 78%, white); font-variant-numeric: tabular-nums;
                text-shadow: 0 0 30px color-mix(in srgb, var(--tint) 60%, transparent); }
            .ar-vp-lab { font-size: 9.5px; font-weight: 900; letter-spacing: .22em; text-transform: uppercase;
                color: #8a7fae; }
            .ar-vp-rank { font-style: normal; margin-top: 4px; font-size: 12px; color: #c9d2db; }
            .ar-unlock { position: relative; margin: 0 0 13px; padding: 7px 12px; border-radius: 10px;
                font-size: 12px; font-weight: 900; color: #8bf0b4;
                background: rgba(139,240,180,0.12); border: 1px solid rgba(139,240,180,0.45); }

            /* ── THE FEATS ── named, so they are worth telling somebody about. */
            .ar-feats { position: relative; display: grid; gap: 6px; margin-bottom: 13px; }
            .ar-feat { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 10px;
                text-align: left; padding: 8px 11px; border-radius: 11px;
                background: linear-gradient(100deg, color-mix(in srgb, var(--el) 20%, transparent), rgba(255,255,255,0.03) 70%);
                border: 1px solid color-mix(in srgb, var(--el) 50%, transparent);
                animation: arCardIn .4s cubic-bezier(.2,1.5,.35,1) both; }
            .ar-feat b { font-size: 13px; color: var(--el); }
            .ar-feat em { grid-column: 1; font-style: normal; font-size: 10.5px; line-height: 1.3; color: #9aa2ab; }
            .ar-feat u { grid-row: 1 / span 2; grid-column: 2; text-decoration: none; text-align: right;
                font-size: 14px; font-weight: 900; color: var(--el); }
            .ar-feat u i { display: block; font-style: normal; font-size: 8px; letter-spacing: .12em;
                text-transform: uppercase; opacity: .7; }

            /* ── THE FIGHT ── what actually happened, which has never been reported anywhere. */
            .ar-tally { position: relative; display: grid; gap: 3px; margin-bottom: 13px; padding: 9px 11px;
                border-radius: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); }
            .ar-tally > span { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
                font-size: 11.5px; }
            .ar-tally i { font-style: normal; color: #8a939d; }
            .ar-tally b { color: #e9eef3; font-variant-numeric: tabular-nums; text-align: right; }

            .ar-recap-rows { position: relative; display: grid; gap: 5px; margin-bottom: 15px; }
            .ar-recap-rows > span { display: flex; align-items: center; justify-content: space-between;
                padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.05); font-size: 0.85rem; }
            .ar-recap-rows i { font-style: normal; color: #a99fc4; }
            .ar-recap-rows b { color: #ffd75e; font-variant-numeric: tabular-nums; text-transform: capitalize; }
            .ar-recap-none b { color: #a99fc4; }
            /* STICKY. The recap grew a feats block and a fight tally, and on a 667px phone the card now
               scrolls — which put "Next fight", the only thing you actually want to press, below the fold
               inside the modal. Pinned to the bottom of the scroll box so it is always reachable, with a
               solid backing so the content does not read through it. */
            .ar-recap-go { position: sticky; bottom: -1px; width: 100%; z-index: 3; }
            .ar-recap-card { padding-bottom: 0; }
            .ar-recap-foot { position: sticky; bottom: -1px; z-index: 3; padding: 10px 0 14px;
                background: linear-gradient(180deg, transparent, #14101a 34%, #14101a); }

            .ar-err { margin: 10px 0 0; padding: 9px 12px; border-radius: 10px; text-align: center;
                font-size: 12px; font-weight: 800; color: #ffd0a0;
                background: rgba(255,160,80,0.12); border: 1px solid rgba(255,160,80,0.4); }
            /* 31px measured on an iPhone SE. This is the button the entire ladder exists to make you press. */
            .ar-btn.is-sm { padding: 11px 16px; font-size: 0.8rem; min-height: 40px; }
            /* ── THE KIT, IN ONE ROW ── sprites, discipline, and the way through to the tab that owns them. */
            .ar-kitline { display: flex; align-items: center; gap: 11px; width: 100%; margin: 0 0 10px;
                padding: 9px 12px; border-radius: 13px; cursor: pointer; text-align: left;
                background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); }
            .ar-kitline-arts { display: flex; flex: 0 0 auto; }
            .ar-kitline-arts img { width: 30px; height: 30px; object-fit: contain; border-radius: 8px;
                background: rgba(0,0,0,0.34); border: 1px solid rgba(255,255,255,0.1); margin-right: -8px; }
            .ar-kitline-txt { flex: 1; min-width: 0; }
            .ar-kitline-txt b { display: block; font-size: 12.5px; font-weight: 900; color: #e9eef3; }
            .ar-kitline-txt em { display: block; font-style: normal; font-size: 10.5px; color: #8a939d;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-kitline-go { flex: 0 0 auto; font-size: 20px; line-height: 1; color: #6f7883; }


            /* ── ONE LIST, TWO SOURCES ── */
            .ar-who { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 10px; }
            .ar-who-btn { padding: 8px 6px; border-radius: 11px; cursor: pointer; font-size: 12px; font-weight: 900;
                color: #9aa2ab; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.11); }
            .ar-who-btn em { display: block; font-style: normal; font-size: 9.5px; font-weight: 700; opacity: .8; }
            .ar-who-btn.is-on { color: #12101a; background: linear-gradient(180deg,#ffb0b8,#ff6f7d); border-color: transparent; }

            .ar-more { width: 100%; margin-top: 6px; padding: 8px; border-radius: 10px; cursor: pointer;
                font-size: 11px; font-weight: 800; color: #9aa2ab;
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.11); }

            .ar-targets { display: grid; gap: 7px; margin-bottom: 16px; }
            .ar-target { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
                padding: 9px 11px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,111,125,0.28); }
            .ar-target-pos { font-size: 12px; font-weight: 900; color: #ffb0b8; font-variant-numeric: tabular-nums; }
            .ar-target-body { min-width: 0; }
            .ar-target-body b { display: block; font-size: 13px; color: #e9eef3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            /* Was clipped to a single nowrap line, which on a 375px phone ate the win-loss record entirely —
               "Lv 34 · 241 health · 4…". It wraps now; two short lines beat one truncated one. */
            .ar-target-body em { display: block; font-style: normal; font-size: 10.5px; line-height: 1.35;
                color: #8a939d; }
            .ar-target-go { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
            .ar-none { font-size: 12.5px; color: #8a939d; }
            .ar-up-row.is-you { border: 1px solid rgba(255,215,94,0.45); background: rgba(255,215,94,0.08); }

            /* ── TABS ── */
            /* FOUR now that the Armoury is a tab. The count was hardcoded at three, so the fourth wrapped onto
               a line of its own and the strip stopped reading as one control. */
            .ar-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 0 0 16px; }
            .ar-tab { position: relative; padding: 10px 4px; border-radius: 12px; cursor: pointer;
                font-size: 11.5px; font-weight: 900; letter-spacing: .01em; color: #9aa2ab;
                background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); }
            .ar-tab.is-on { color: #12101a; background: linear-gradient(180deg,#ffdf86,#e8ab24);
                border-color: rgba(255,240,200,.5); }
            /* An unspent point should be visible from the tab, not only once you are inside. */
            .ar-tab.has-dot:not(.is-on) { color: #ffd75e; border-color: rgba(255,215,94,.5); }

            /* THE GAUNTLET — visually its own ladder, tinted by band so a Titan does not read like a
               Straw Dummy in a list. */
            .ar-gaunt .ar-target { border-color: color-mix(in srgb, var(--el) 45%, transparent);
                background: linear-gradient(100deg, color-mix(in srgb, var(--el) 12%, transparent), rgba(255,255,255,0.03) 60%); }
            .ar-gaunt .ar-target.is-beaten { opacity: .62; }
            .ar-gaunt .ar-target-pos { color: var(--el); font-size: 11px; }
            .ar-gaunt .ar-portrait { border-color: color-mix(in srgb, var(--el) 50%, transparent); }
            .ar-beat-tick { font-style: normal; color: #8bf0b4; }
            /* A full-body NPC in a 30px circle is a dark smudge, and the band art is the whole point of the
               Gauntlet reading as a ladder of increasingly alarming things. */
            .ar-portrait.is-npc { width: 52px; height: 52px; flex: 0 0 auto; border-radius: 12px;
                border: 1px solid color-mix(in srgb, var(--el) 50%, transparent);
                background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--el) 22%, transparent), rgba(8,6,12,0.9)); }
            .ar-portrait.is-npc img { width: 100%; height: 100%; object-fit: contain; object-position: bottom; }

            .ar-away { position: fixed; inset: 0; z-index: 10100; display: grid; place-items: center; padding: 18px;
                background: rgba(6,4,10,0.86); backdrop-filter: blur(4px); overflow-y: auto; }
            .ar-away-card { width: min(390px, 100%); max-height: 92dvh; overflow-y: auto; padding: 22px 20px 18px;
                border-radius: 20px; text-align: center; background: linear-gradient(180deg, #221a26, #120e15);
                border: 2px solid #6f5a9c; box-shadow: 0 24px 70px rgba(0,0,0,0.8);
                animation: arCardIn .4s cubic-bezier(.2,1.5,.35,1) both; }
            .ar-away-earned { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 2px 0 10px;
                padding: 7px 10px; border-radius: 10px; font-size: .8rem; color: #ffe9c2;
                background: rgba(255,215,94,.1); border: 1px solid rgba(255,215,94,.35); }
            .ar-away-earned b { color: #ffd75e; }
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
            .ar-cmd { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
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
            /* The one command whose value is a number you can build up. All four buttons stretch to the
               tallest, so this line does not make the deck ragged. */
            .ar-cmd-sub { font-style: normal; font-size: 9.5px; font-weight: 900; letter-spacing: .06em;
                color: var(--cmd, #6fd0ff); opacity: .9; }
            /* How many braces are left, as a corner pip rather than a second line — the deck is four buttons
               on a phone and none of them has room for another row of text. */
            .ar-cmd-pips { position: absolute; top: 3px; right: 5px; font-style: normal; font-size: 9px;
                font-weight: 900; line-height: 1; padding: 2px 4px; border-radius: 999px;
                color: #06121a; background: var(--cmd, #6fd0ff); opacity: .85; }

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
            /* HIGH ENOUGH TO NOT BE ON THEM. At top:34% of the floor the enemy's declaration landed across
               their own chest and shoulders — the sprite you are trying to read the wind-up off. It sits in
               the wall band now, the same empty strip the incoming warning uses. */
            .ar-declare { position: absolute; left: 50%; top: 13%; transform: translate(-50%, -50%); z-index: 23;
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
            .sk-name { font-size: 13px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            /* The whole effect as one sentence — used on the ladder, where a headline plus a sub plus three
               tags was three things to read and none of them fit. */
            .sk-line { font-size: 11.5px; line-height: 1.4; color: #c9d2db; }
            .sk-line b { color: #ffd75e; font-weight: 900; }
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
            /* A free skill is a different CLASS of move, not a better one — filled rather than outlined, so it
               reads as a property of the card at a glance instead of one more tag to compare. */
            .sk-tag.is-free { color: #08131f; background: #6fd0ff; border-color: #6fd0ff; }
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
            /* ABOVE THE FIGHTERS, NOT ON THEM. This sat at top:46% of the floor — dead centre, which is where
               the two people fighting are. It announced their move by covering the man about to make it and
               the man about to take it, at exactly the moment you are trying to read both. It hangs over the
               arena wall now: same card, same timing, in the empty band the painting already gives us. */
            /* A STRIP IN THE ONLY CLEAR BAND. Measured on a 375px phone: the health bars end at y159 and the
               sand starts below them, and the fighters' ART begins about 120px lower still — the top of the
               floor is empty arena wall, because a sprite is bottom-aligned inside a full-height box. That
               band is the only part of this screen that is neither a fighter nor a number, so the warning
               lives there: pinned 8px inside the top of the floor, one line, 34px tall.
               It used to sit at 46% of the floor — dead centre, covering the man about to swing and the man
               about to be hit, at the exact moment you are trying to read both. */
            .ar-incoming { position: absolute; left: 50%; top: 8px; transform: translateX(-50%);
                z-index: 19; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 7px;
                border-radius: 999px; background: rgba(8,10,18,0.9); border: 1px solid rgba(111,208,255,0.55);
                box-shadow: 0 0 26px -6px rgba(111,208,255,0.6); backdrop-filter: blur(3px);
                animation: arIncoming .32s cubic-bezier(.2,1.4,.35,1) both; pointer-events: none; max-width: 94%; }
            @keyframes arIncoming { from { opacity: 0; transform: translateX(-50%) scale(.82) }
                to { opacity: 1; transform: translateX(-50%) scale(1) } }
            .ar-incoming-art { flex: 0 0 auto; width: 22px; height: 22px; object-fit: contain;
                filter: drop-shadow(0 2px 5px rgba(0,0,0,0.7)); }
            .ar-incoming-body { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
            .ar-incoming-body em { flex: 0 0 auto; font-style: normal; font-size: 9.5px; letter-spacing: .08em;
                text-transform: uppercase; color: #6fd0ff; }
            .ar-incoming-body b { font-size: 13px; color: #fff; line-height: 1.1; overflow: hidden;
                text-overflow: ellipsis; white-space: nowrap; }

            /* ── THE NUMBERS ── the payoff, over the fighter it happened to.
               These used to sit at top:34% of a floor box that is most of the panel tall, while the fighters
               stand at its BOTTOM — so every damage number floated in empty sky near the HP bars, a couple of
               hundred pixels from the thing it described. They are anchored to the fighters now. */
            /* ── HOW LONG A NUMBER LIVES ── it used to be up and gone inside a second, most of which was spent
               moving: the readable part of the old curve was about a quarter of a second, in the middle of a
               hit-stop, a shake, a flash and a floating move name. You could not tell a 20 from a 70, and a
               blocked amount you had actively spent a turn earning went past before your eye reached it.
               Twice as long now, and the extra time is all HOLD — it rises, stops where you can read it, and
               only then drifts off. Slower, not laggier: the beat behind it is unchanged. */
            /* The COLUMN is the positioned thing. column-reverse so the first number sits lowest and each
               extra one stacks above it — damage at the bottom, then what you blocked, healed and soaked. */
            .ar-pop.is-burn { color: #ffa04a; text-shadow: 0 0 12px rgba(255,120,30,.75); }
            /* ── AND THE BLEED, WHICH HAD NONE ────────────────────────────────────────────────────────────
               The tick was already tagged kind:"bleed" by the engine and already carried its droplet, but
               there was no rule for is-bleed — so it floated in the same grey as an ordinary hit while the
               burn beside it glowed. The one number you cannot control looked like the ones you can.
               Its own red, its own glow, and a heavier pulse than the burn: blood goes straight to health. */
            .ar-pop.is-bleed { color: #ff6b6b; text-shadow: 0 0 12px rgba(220,40,40,.8);
                animation-name: arPopBleed; }
            @keyframes arPopBleed {
                0% { opacity: 0; transform: translateY(6px) scale(.85); }
                18% { opacity: 1; transform: translateY(0) scale(1.18); }
                34% { transform: translateY(-3px) scale(1); }
                100% { opacity: 0; transform: translateY(-30px) scale(1); } }
            /* The droplet and the flame both read as a mark, not decoration — big enough to see at a glance. */
            .ar-pop.is-bleed .ar-pop-dot { color: #ff5f5f; filter: drop-shadow(0 0 5px rgba(220,40,40,.9)); }
            .ar-pop.is-burn .ar-pop-dot { color: #ff8a2a; filter: drop-shadow(0 0 5px rgba(255,120,30,.9)); }
            .ar-pop-dot { font-size: .8em; margin-right: .12em; vertical-align: -.06em; }
            .ar-pop.is-thorn { color: #ff9f9f; text-shadow: 0 0 10px rgba(255,120,120,.65); }
            /* ── A COUNTER IS NOT A THORN ── steel, not a scratch: cold white-hot rather than the pale pink a
               passive tick wears, and a crit counter is bigger again. It shares the thorn's shape so an
               exchange still reads as one family of "damage that came back". */
            .ar-pop.is-counter { color: #ffe9a8; text-shadow: 0 0 12px rgba(255,190,80,.85), 0 2px 6px #000; }
            .ar-pop.is-counter-crit { color: #fff6cc; font-size: 2.5rem; letter-spacing: .02em;
                text-shadow: 0 0 20px rgba(255,205,90,1), 0 0 42px rgba(255,150,40,.8), 0 3px 8px #000; }
            .ar-pops { position: absolute; bottom: 34%; z-index: 21; display: flex; flex-direction: column-reverse;
                align-items: center; gap: 6px; pointer-events: none; }
            .ar-pops.is-right { right: 18%; }
            .ar-pops.is-left { left: 18%; }
            .ar-pop { font-size: 1.9rem; font-weight: 900; line-height: 1.05;
                letter-spacing: -0.02em; pointer-events: none; text-shadow: 0 3px 12px #000, 0 1px 0 rgba(0,0,0,.9);
                font-variant-numeric: tabular-nums;
                animation: arPop .95s cubic-bezier(.2,1,.3,1) both; }
            .ar-pop.is-dmg { color: #ffd75e; }
            /* A miss is a real outcome and has to read as one — small, grey and unmistakably not a number,
               so a flurry that lands two of three shows two golds and a grey MISS rather than one figure
               that quietly happens to be smaller. */
            .ar-pop.is-miss { font-size: 1.15rem; color: #9aa0a6; letter-spacing: .06em;
                text-shadow: 0 2px 8px #000; }
            .ar-pop.is-left.is-dmg { color: #ff8f9a; }
            /* A crit is the biggest number in the game and it should look like it. */
            .ar-pop.is-crit { font-size: 2.9rem; color: #fff6cc;
                text-shadow: 0 3px 12px #000, 0 0 26px #ffe28a, 0 0 60px rgba(255,190,60,.95);
                animation: arPopCrit 1.15s cubic-bezier(.2,1.1,.3,1) both; }
            /* The half of the exchange your defensive choices actually bought you. Cooler and offset so it is
               never mistaken for damage you took — but no longer TINY. At 1rem next to a 1.9rem hit it read as
               a footnote, which is the wrong way round: the block is the thing you chose. */
            .ar-pop.is-block, .ar-pop.is-ward { font-size: 1.35rem; color: #9fdcff;
                text-shadow: 0 3px 12px #000, 0 0 18px rgba(159,220,255,.55); }
            .ar-pop.is-heal { font-size: 1.5rem; color: #8bf0b4; text-shadow: 0 3px 12px #000, 0 0 22px rgba(139,240,180,.7); }
            .ar-pop u { display: block; text-decoration: none; font-size: 8.5px; font-weight: 900;
                letter-spacing: .14em; text-transform: uppercase; opacity: .8; }
            /* Punch in, HOLD, then drift. The hold is the whole point — 12% to 62% of the run is the number
               sitting still at full opacity, which is roughly a second of actually being readable against the
               quarter-second it had before. */
            @keyframes arPop { from { opacity: 0; transform: translateY(14px) scale(.7) }
                12% { opacity: 1; transform: translateY(-8px) scale(1.14) }
                20% { transform: translateY(-8px) scale(1) }
                62% { opacity: 1; transform: translateY(-14px) scale(1) }
                to { opacity: 0; transform: translateY(-62px) scale(.96) } }
            @keyframes arPopCrit { from { opacity: 0; transform: translateY(10px) scale(.4) rotate(-8deg) }
                9% { opacity: 1; transform: translateY(-12px) scale(1.4) rotate(2deg) }
                16% { transform: translateY(-12px) scale(1.1) rotate(0deg) }
                22% { transform: translateY(-12px) scale(1.18) }
                28% { transform: translateY(-12px) scale(1.1) }
                66% { opacity: 1; transform: translateY(-18px) scale(1.1) }
                to { opacity: 0; transform: translateY(-74px) scale(1) } }

            /* ── HIT-STOP ── both fighters hold still for a few frames at the moment of contact. It is most of
               why a blow reads as a blow rather than a position change, and it costs one class. */
            .ar-ring.is-stop .ar-floor { transform: scale(1.03); }
            .ar-ring.is-stop .ar-hero { animation-play-state: paused !important; }

            /* A crit takes the whole pane for a moment. */
            .ar-ring.is-crit::after { content: ""; position: absolute; inset: 0; z-index: 18; pointer-events: none;
                background: radial-gradient(70% 60% at 72% 58%, rgba(255,231,150,0.62), transparent 72%);
                animation: arCrit .5s ease-out both; }
            /* ── THE FRAME ITSELF TAKES THE HIT ── the flash was a soft wash inside the ring, which on a full
               screen is a glow somewhere off to one side. A crit now blows the whole scene out for two frames
               and slams a hot rim around it, so the hardest blow in the game is the one thing on the screen
               that touches every edge. Four frames, then gone — anything longer reads as a bug. */
            .ar-fight.ar::before { content: ""; position: absolute; inset: 0; z-index: 40; pointer-events: none;
                opacity: 0; }
            .ar-fight.ar:has(.ar-ring.is-crit)::before { animation: arCritFrame .34s ease-out both;
                background: radial-gradient(120% 90% at 50% 55%, rgba(255,240,190,0.4), transparent 70%);
                box-shadow: inset 0 0 0 3px rgba(255,226,138,0.9), inset 0 0 70px rgba(255,200,80,0.55); }
            .ar-fight.ar:has(.ar-ring.is-crit-theirs)::before {
                background: radial-gradient(120% 90% at 50% 55%, rgba(255,190,200,0.36), transparent 70%);
                box-shadow: inset 0 0 0 3px rgba(255,120,140,0.9), inset 0 0 70px rgba(255,70,95,0.5); }
            @keyframes arCritFrame { 0% { opacity: 0 } 12% { opacity: 1 } 40% { opacity: .55 } 100% { opacity: 0 } }
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
            .ar-tools { position: relative; z-index: 26; display: flex; gap: 6px; pointer-events: auto; }
            .ar-mute { position: relative; width: 34px; height: 34px;
                padding: 0; appearance: none; -webkit-appearance: none; border-radius: 9px; cursor: pointer;
                display: grid; place-items: center; pointer-events: auto;
                color: #ffe0b0; background: rgba(8,6,10,0.62); border: 1px solid rgba(255,255,255,0.18); }
            .ar-mute :global(svg) { width: 16px; height: 16px; }
            .ar-mute.is-off { color: #7f8790; }
            .ar-mute::after { content: ""; position: absolute; inset: -6px; }

            .ar-focus { position: relative; z-index: 15; flex: 0 0 auto; padding: 5px 10px;
                display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; pointer-events: none;
                background: linear-gradient(180deg, transparent, rgba(6,4,8,0.72) 45%);
                overflow-x: auto; scrollbar-width: none; }
            .ar-focus::-webkit-scrollbar { display: none; }
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
            .ar-theirchip { position: relative; }
            .ar-theirchip.is-cooling img { filter: grayscale(1) brightness(.55); }
            .ar-theircd { position: absolute; inset: 0; display: grid; place-items: center; font-size: 12px;
                font-weight: 900; color: #fff; text-shadow: 0 1px 4px #000, 0 0 8px rgba(0,0,0,.9);
                font-variant-numeric: tabular-nums; }
            /* ── THEY HAVE TO BE TAPPABLE ─────────────────────────────────────────────────────────────────
               This rail lives inside .ar-hud, which is pointer-events:none so the fight can be seen through
               it. Only .ar-tag was ever exempted, so their skill chips rendered perfectly, carried a real
               onClick, highlighted an is-open state — and could not be tapped at all. Mid-fight you could see
               three squares under them and pressing any of them did nothing, which is exactly what it looked
               like: a dead handler. The card that opens needs it too, or it cannot be tapped closed. */
            /* A SHATTERED GUARD LOOKS SHATTERED. Greyed-out reads as "not right now"; this is a thing an
               opponent DID to you and it should read as damage, so the button carries the cold of the skill
               that broke it and its own label says how long. */
            .ar-cmd.is-shattered { border-color: rgba(150,205,255,0.5); background: rgba(60,110,150,0.16); }
            .ar-cmd.is-shattered :global(svg) { color: #9fd4ff; opacity: .75; }
            .ar-cmd-sub.is-shattered { color: #9fd4ff; opacity: 1; }
            .ar-theirs { margin-left: auto; display: flex; align-items: center; gap: 4px; flex: 0 0 auto;
                padding-left: 6px; pointer-events: auto; }
            /* A finger, not a mouse: the chip art is small, so the touch target is grown past it rather than
               the art being blown up. */
            .ar-theirchip { position: relative; }
            .ar-theirchip::after { content: ""; position: absolute; inset: -6px; }
            .ar-theircard { pointer-events: auto; }
            .ar-theirs-lab { font-style: normal; font-size: 8px; font-weight: 900; letter-spacing: .14em;
                text-transform: uppercase; color: #7f8790; margin-right: 1px; }
            .ar-theirchip { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center;
                background: rgba(0,0,0,0.45); border: 1px solid color-mix(in srgb, var(--el) 45%, transparent); }
            .ar-theirchip img { width: 15px; height: 15px; object-fit: contain; opacity: .85; }

            /* ONE COLUMN until there is genuinely room for two. The old minmax(140px, 1fr) put two cards side
               by side on a 375px phone, which is where every wrap in that screenshot came from: a two-word
               skill name broke over two lines, the effect broke over four, and the piece it came from was cut
               to "Ring of Titans · cool…". A skill card has to be readable in about a second. */
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

            /* ── FIND A FIGHT ── the one button that replaced two lists. Sized like the thing it is: the
               reason you opened the screen. */
            /* ── THE ARMOURY ── crates rather than a price list, so the art carries the tier and the odds sit
               under the lid for anyone who wants them. */
            .ar-laurel { width: 17px; height: 17px; object-fit: contain; vertical-align: -3px; }
            .ar-crates { display: grid; gap: 10px; }
            .ar-crate { display: flex; flex-direction: column; gap: 9px; padding: 12px; border-radius: 15px;
                background: rgba(255,255,255,0.035); border: 1px solid rgba(255,215,94,0.22); }
            .ar-crate.is-poor { opacity: .58; }
            .ar-crate-top { display: flex; align-items: center; gap: 12px; }
            .ar-crate-art { width: 68px; height: 68px; flex: none; object-fit: contain;
                filter: drop-shadow(0 5px 12px rgba(0,0,0,0.55)); }
            .ar-crate.is-opening .ar-crate-art { animation: arCrateShake .3s ease-in-out infinite; }
            @keyframes arCrateShake {
                0%,100% { transform: translateX(0) rotate(-2deg) }
                50% { transform: translateX(3px) rotate(2deg) } }
            .ar-crate-words { min-width: 0; }
            .ar-crate-words b { display: block; font-family: var(--font-display); font-size: 1rem; color: #ffe0a8; }
            .ar-crate-words p { margin: 2px 0 0; font-size: 0.76rem; line-height: 1.4; color: #9aa2ab; }
            /* Every outcome, with its odds. A box that will not say what is in it is a slot machine. */
            .ar-crate-odds summary { cursor: pointer; font-size: 0.72rem; font-weight: 800; color: #8f98a3; }
            .ar-crate-odds ul { list-style: none; margin: 7px 0 0; padding: 0; display: grid; gap: 3px; }
            .ar-crate-odds li { display: flex; gap: 8px; font-size: 0.72rem; color: #cbd2da;
                padding: 3px 8px; border-radius: 7px; background: rgba(0,0,0,0.25); }
            .ar-crate-odds i { font-style: normal; flex: 1; }
            .ar-crate-odds em { font-style: normal; color: #8f8875; }
            .ar-crate-buy { display: flex; align-items: center; justify-content: center; gap: 7px;
                padding: 12px; border-radius: 12px; cursor: pointer; font-family: var(--font-display);
                font-weight: 900; font-size: 0.95rem; color: #22180a;
                border: 1px solid rgba(255,236,170,0.85);
                background: linear-gradient(180deg, #f6c34a, #d99a1e 52%, #a86f10); }
            .ar-crate-buy:disabled { cursor: default; filter: grayscale(0.7) brightness(0.7); }

            /* The reveal. Same shape as every other one in the game: the thing, named, at size. */
            .ar-open-scrim { position: fixed; inset: 0; height: 100svh; z-index: 10094; display: grid;
                place-items: center; padding: 18px; background: rgba(4,3,8,0.86);
                backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: arOpenIn .2s ease both; }
            @keyframes arOpenIn { from { opacity: 0 } to { opacity: 1 } }
            .ar-open-rays { position: absolute; inset: -25%; pointer-events: none;
                background: conic-gradient(from 0deg, transparent 0 11deg,
                    color-mix(in srgb, var(--c) 24%, transparent) 11deg 16deg, transparent 16deg 28deg);
                animation: arOpenSpin 20s linear infinite; }
            @keyframes arOpenSpin { to { transform: rotate(360deg) } }
            .ar-open-card { position: relative; width: min(320px, 100%); text-align: center; padding: 22px 18px 18px;
                border-radius: 20px; border: 2px solid color-mix(in srgb, var(--c) 70%, transparent);
                background: linear-gradient(180deg, #1e1a12, #12100c);
                box-shadow: 0 0 60px color-mix(in srgb, var(--c) 32%, transparent), 0 20px 60px rgba(0,0,0,0.7);
                animation: arOpenPop .4s cubic-bezier(.2,1.25,.35,1) both; }
            @keyframes arOpenPop { from { opacity: 0; transform: scale(.88) translateY(12px) } to { opacity: 1; transform: none } }
            .ar-open-kick { font-size: 0.62rem; font-weight: 900; letter-spacing: .2em; text-transform: uppercase;
                color: var(--c); }
            .ar-open-art { width: 128px; height: 128px; object-fit: contain; margin: 10px 0 6px;
                filter: drop-shadow(0 8px 18px rgba(0,0,0,0.6));
                animation: arOpenFloat 2.8s ease-in-out infinite; }
            @keyframes arOpenFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
            .ar-open-name { display: block; font-family: var(--font-display); font-size: 1.2rem; color: #f7efe0; }
            .ar-open-go { width: 100%; margin-top: 14px; }
            .ar-arm-head { display: flex; align-items: baseline; gap: 8px; }
            .ar-arm-head b { font-family: var(--font-display); font-size: 1.05rem; color: #e8dcc6; }
            .ar-arm-purse { margin-left: auto; font-family: var(--font-display); font-weight: 900;
                font-size: 0.9rem; color: #ffd75e; }
            .ar-arm-sub { margin: 4px 0 12px; font-size: 0.78rem; line-height: 1.45; color: #9aa2ab; }
            .ar-arm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 8px; }
            .ar-arm { display: flex; flex-direction: column; gap: 4px; padding: 11px; border-radius: 13px;
                background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); }
            .ar-arm.is-poor { opacity: .55; }
            .ar-arm b { font-family: var(--font-display); font-size: 0.86rem; color: #e8dcc6; }
            .ar-arm p { margin: 0; font-size: 0.72rem; line-height: 1.4; color: #9aa2ab; }
            .ar-arm em { font-style: normal; font-size: 0.68rem; color: #8f8875; }
            .ar-arm .ar-btn { margin-top: auto; }
            .ar-find { display: flex; align-items: center; gap: 12px; width: 100%; margin: 14px 0 4px;
                padding: 15px 17px; border-radius: 15px; cursor: pointer; text-align: left;
                color: #22180a; border: 1px solid rgba(255,236,170,0.85);
                background: linear-gradient(180deg, #f6c34a, #d99a1e 52%, #a86f10);
                box-shadow: 0 6px 20px rgba(180,120,20,0.38); }
            .ar-find:disabled { cursor: default; filter: grayscale(0.7) brightness(0.66); box-shadow: none; }
            .ar-forfeit { display: block; margin: 6px auto 0; padding: 5px 12px; border-radius: 999px;
                font-size: 11px; font-weight: 800; letter-spacing: .04em; cursor: pointer;
                color: rgba(255,190,190,0.75); background: rgba(255,90,90,0.09);
                border: 1px solid rgba(255,90,90,0.28); }
            .ar-forfeit:disabled { opacity: .4; cursor: default; }

            /* The way back into a fight you stepped out of — cooler than "find a fight" so the two never read
               as the same button, and it sits above it. */
            .ar-find.is-resume { color: #f4ecff;
                border-color: rgba(185,140,255,0.8);
                background: linear-gradient(180deg, #6b4bb8, #4a3080 55%, #33215c);
                box-shadow: 0 6px 20px rgba(120,70,220,0.34); }
            .ar-leave svg { width: 15px; height: 15px; }
            .ar-find svg { width: 30px; height: 30px; flex: none; }
            .ar-find-ico { width: 40px; height: 40px; flex: none; object-fit: contain;
                filter: drop-shadow(0 2px 3px rgba(60,36,0,0.5)); }
            .ar-find b { display: block; font-family: var(--font-display); font-weight: 900; font-size: 1.06rem; }
            .ar-find em { display: block; font-style: normal; font-size: 0.78rem; opacity: .82; margin-top: 2px; }
            .ar-log { margin-top: 13px; max-height: 150px; overflow-y: auto; display: grid; gap: 4px;
                padding: 9px 11px; border-radius: 11px; background: rgba(0,0,0,0.28); }
            /* The drawer: it takes its space from the ring rather than from the page, and never more than a
               third of the screen. */
            .ar-fight .ar-log { flex: none; margin: 0; max-height: 30svh; border-radius: 0;
                background: rgba(0,0,0,0.55); }
            /* TWO FIGHTERS ON A PHONE CAN ONLY BE SO WIDE, and a contained sprite is only ever as tall as it
               is wide — so a taller ring does not make them bigger, it just opens a hole above their heads.
               Cap the floor and push it DOWN: the fighters sit near the deck where the action is, and the
               space that is left lands above them, which is exactly where the incoming-move banner, the
               damage numbers and the spell layer all draw anyway. */
            .ar-fight .ar-floor { flex: 0 1 auto; height: min(100%, 34svh); margin-top: auto; }
            .ar-logbtn svg { width: 15px; height: 15px; }
            .ar-line { font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
            .ar-line b { color: #6f6486; margin-right: 5px; }
            /* ── LANDSCAPE PHONE ── LAST IN THE FILE ON PURPOSE. A media query adds no specificity, so
               when this block sat higher up than the base .ar-deck / .ar-floor rules it was trying to
               override, it lost every tie and did nothing at all: the stage still measured 16px. */
            @media (orientation: landscape) and (max-height: 480px) {
                /* A 390px-tall viewport has ~240px of ring once the site chrome is above it, and every band
                   wanted its share — which left .ar-floor flexed down to SIXTEEN PIXELS and a stage with no
                   visible fighters at all. So the stage is budgeted FIRST (min-height, non-shrinking) and
                   everything else is cut to fit around it.
                   Budget: hud 18 + bars 30 + floor 96 + rail 26 + deck 58 = 228 of 240. */
                .ar-floor { flex: 1 0 auto; min-height: 96px; }
                .ar-hud { padding: 2px 6px 0; gap: 4px; min-height: 0; }
                /* The round number goes, and so does its COLUMN — a leftover auto track would keep the tags
                   off-centre by the width of a word that is no longer drawn. */
                .ar-round { display: none; }
                .ar-hud { grid-template-columns: minmax(0, 1fr) auto; }
                .ar-hud .ar-tag { font-size: 8.5px; min-height: 20px; padding: 3px 7px; }
                .ar-hud .ar-tag.is-under { display: none; }
                .ar-tools { gap: 4px; }
                .ar-mute { width: 26px; height: 26px; }
                .ar-bars { padding: 1px 8px 0; gap: 6px; }
                .ar-fname { font-size: 10px; }
                .ar-hp { height: 8px; margin: 2px 0 1px; }
                .ar-mycard { display: flex; gap: 10px; flex-wrap: wrap; margin: 3px 0 1px; font-size: 10px;
                font-weight: 800; color: rgba(255,224,176,.78); }
            .ar-mycard i { font-style: normal; white-space: nowrap; }
            .ar-mycard b { color: #ffe9c2; font-weight: 900; font-size: 12px; }
            .ar-up-card { font-size: 9.5px; font-weight: 800; color: rgba(255,224,176,.6); white-space: nowrap; }
            .ar-stats { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 2px; font-style: normal;
                font-size: 8.5px; font-weight: 800; letter-spacing: .02em; color: rgba(255,224,176,.72); }
            .ar-bar.is-foe .ar-stats { justify-content: flex-end; }
            .ar-stats i { font-style: normal; white-space: nowrap; }
            .ar-stats b { color: #ffe9c2; font-weight: 900; }
            .ar-hpnum { font-size: 8.5px; }
                .ar-turnmark { font-size: 7.5px; padding: 2px 6px; }
                .ar-focus { padding: 1px 8px 0; gap: 5px; }
                .ar-cdchip { width: 26px; height: 26px; }
                .ar-cdchip img { width: 17px; height: 17px; }
                .ar-theirs { display: none; }        /* their kit rail — readable, not actionable */
                .ar-deck { min-height: 54px; padding: 3px 6px max(3px, env(safe-area-inset-bottom)); }
                .ar-cmd { padding: 4px 3px; font-size: 9.5px; gap: 1px; }
                .ar-cmd :global(svg) { width: 14px; height: 14px; }
                .ar-beat { display: none; }          /* the log line; the log itself is still below the ring */
                .ar-dust { display: none; }
                /* The fighters get the reclaimed height — same size, same baseline as portrait. */
                .ar-floor > .ar-fighter:first-of-type { left: 3%; width: 42%; }
                .ar-floor > .ar-fighter.is-foe { right: 3%; width: 42%; bottom: 0; }
            }

        `}</style>
    );
}
