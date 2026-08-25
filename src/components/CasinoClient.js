"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import FeatureDailies from "@/components/FeatureDailies";
import VipLounge from "@/components/casino/VipLounge.js";
import SceneMusic from "@/components/SceneMusic";
import { GiSpeaker, GiSpeakerOff } from "react-icons/gi";
import { Haptic, Sfx, unlock, isMuted, setMuted } from "@/components/arena/arena-audio.js";
import Burst from "@/components/casino/Burst";
import { Cas } from "@/components/casino/casino-audio.js";
import Slot5 from "@/components/casino/Slot5.js";
import Paytable from "@/components/casino/Paytable.js";
import ChipStore from "@/components/casino/ChipStore.js";
import { LINES as SLOT5_LINES, SLOTS5 } from "@/lib/marketplace/casino-slot5.js";

// ── THE FLOOR ────────────────────────────────────────────────────────────────────────────────────────────────
// A room laid out like the tavern: you walk left and right along it, the other people in it are really there,
// and the things you walk up to are MACHINES rather than people. Luke's brief, and the reason it is a room at
// all rather than a menu of games — a casino you scroll is a list; a casino you walk into is a place.
//
// WHAT IS HERE AND WHAT IS NOT. One machine works end to end: the slot. The other cabinets are drawn, named
// and dark, because a floor with one machine and no sign of the rest reads as finished when it is not — and
// because the shape of the room is the thing worth agreeing on before four more games are written into it.
//
// The art is CSS. Every cabinet on this floor is a gradient and a border, deliberately: art costs money to
// generate and this is a layout to be argued with first. When the floor plan is right, the cabinets get
// painted.
// Nine cabinets now, re-spaced to fit. The five slots run first because they are the machines people walk in
// for, then the two shared draws, then the games you sit down to.
// -- THE SOUND SWITCH THE CASINO NEVER HAD ---------------------------------------------------------------------
// Luke: "there is still no sound effects for the slots spinning or stopping or winning or losing."
//
// The sounds were all there and all being called -- traced on the live site with trusted taps: the context
// comes up running, the oscillators start, the reels clunk. What was NOT there was any way to find out that
// they had been turned OFF, or to turn them back on.
//
// Casino sound effects run on the arena's audio module, and so does the arena's MUTE: one flag in
// localStorage under `wolfden.arena.muted`, set by a button that only exists inside a fight. Press mute once
// during a bout -- weeks ago, on another screen, for an unrelated reason -- and every sound this room makes is
// silenced forever, with nothing anywhere in the casino to show it or undo it. The music kept playing through
// all of it, because SceneMusic builds its own context with its own separate mute, which is exactly the
// symptom: a floor with music and no machines.
//
// So the room gets its own switch. It is the arena's flag, not a second one -- two mutes that disagree is a
// worse bug than no mute at all -- it is just finally reachable from the room it silences.
// ── ONE SWITCH FOR THE WHOLE ROOM ────────────────────────────────────────────────────────────────────────────
// Luke: "just make it one mute button instead of two, and only show it when you are on the casino floor, not
// when you are inside a casino feature screen."
//
// It was two, and two was wrong for a reason worth writing down: they were two buttons for ONE question. The
// music and the machines are not separate decisions a person wants to make — "is this room making noise" is
// the whole of it — and offering both invites the state nobody wants, half muted, which then reads as the
// sound being broken. Worse, they were two REMEMBERED states in two different localStorage keys, so they
// could disagree across sessions and neither button would say so.
//
// So there is one flag now, the arena's, because the machines already ran on it and it is the one that could
// be silently stuck (see the note that put a sound control in this room at all). SceneMusic is handed it and
// draws nothing; this button is the only control, and it turns the room on and off.
function SoundToggle({ off, onToggle }) {
    return (
        <button type="button" data-sfx-toggle onClick={onToggle}
            aria-label={off ? "Turn sound on" : "Turn sound off"}
            title={off ? "Sound is off" : "Sound is on"}
            className={`cas-sfxbtn${off ? " is-off" : ""}`}>
            {off ? <GiSpeakerOff aria-hidden="true" /> : <GiSpeaker aria-hidden="true" />}
        </button>
    );
}

// ── AND THE ROOM GREW A BAY AT THE NEAR END ─────────────────────────────────────────
// Luke: "extend the background a little bit and add a VIP only section."
//
// The nine machines used to run 8 to 96 at a spacing of 11, which left four points of floor at either end —
// nowhere near enough for a doorway you can stand in front of. So the world got wider (see .cas-world) and the
// row was re-spaced to 20..92 at a spacing of 9, which is the SAME PHYSICAL DISTANCE apart in a bigger room.
// That is the part worth being careful about: shrinking the gap in percent while growing the room in pixels
// leaves the walk between two cabinets exactly as long as it was, and REACH moved from 6 to 5 to hold the same
// ratio against it. Nothing about how the floor feels to cross has changed.
//
// What the arithmetic bought is everything below 14, which is now the VIP bay.
const MACHINES = [
    { id: "slot", x: 20, label: "The Hunt", kind: "Slots", live: true },
    { id: "slot2", x: 29, label: "The Harvest", kind: "Slots", live: true },
    { id: "slot3", x: 38, label: "The Deep", kind: "Slots", live: true },
    { id: "slot4", x: 47, label: "The Menagerie", kind: "Slots", live: true },
    { id: "slot5", x: 56, label: "The Vault", kind: "Slots", live: true },
    { id: "keno", x: 65, label: "Keno", kind: "Keno", live: true },
    { id: "bingo", x: 74, label: "The Hall", kind: "Bingo", live: true },
    { id: "blackjack", x: 83, label: "The Table", kind: "Blackjack", live: true },
    // ── THE COUNTER ──────────────────────────────────────────────────────────────────────────────────
    // At the far end, past every machine, which is where a cashier's window belongs: you walk the whole
    // floor to reach it and you pass everything you could have been playing on the way back. It is the only
    // thing in the room that is not a game, and the only place chips are worth anything.
    { id: "store", x: 92, label: "The Counter", kind: "Chips", live: true },
];

// Where the rope is: on the wall's SECOND arch, which lands at 11.8% of the world once both the world and
// the wall tile are sized off --room (see .cas-world). Not a free choice — it is where an arch actually is.
const VIP_X = 11.8;

// How close you have to stand for a machine to be usable. Wide enough that walking to something feels like
// arriving rather than threading a needle.
// How close you have to stand for a machine to be usable, as a share of the floor. It was 9 against a
// spacing of 11, which meant there was almost nowhere on the whole floor you were NOT at a cabinet — every
// machine's reach very nearly touched its neighbour's, so spacing them out would have bought nothing. At 6
// there is real room between them to stand in, which is the point of a room.
// Was 6 against a spacing of 11. The row is spaced 9 now (see MACHINES), so 5 holds the same ratio and the
// same feeling of there being real room between the cabinets to stand in.
const REACH = 5;

// ── HOW FAST YOU WALK ────────────────────────────────────────────────────────────────────────────────────────
// Percent of the floor per second, and the interval it is applied on. Not a frame loop: the room re-renders
// nine cabinets, nine props and six lamps, and doing that sixty times a second to move one sprite is a lot of
// work for a walk. Sixteen steps a second with the hero CSS-transitioned between them is indistinguishable and
// costs a quarter as much.
const WALK_TICK_MS = 62;
const WALK_PER_SEC = 26;

// How far behind the card before it each card lands, and the interval the deal's sounds are fired on. One
// number, because the two drifting apart is the whole way this reads as broken.
const DEAL_MS = 145;

// ── WHAT ELSE IS IN THE ROOM ────────────────────────────────────────────────────────────────────────────
// Nine cabinets in a row is a shop display. What makes it a FLOOR is the stuff between them that nobody can
// play — a palm in a brass urn, a rope you are not meant to cross, a stool somebody left out. They sit in the
// gaps between machines (the cabinets are 11 apart, so these go on the midpoints) and at the door.
//
// All of it is inert: no handler, no focus, aria-hidden. A decoration you can tap is a machine that does
// nothing, which is worse than no decoration at all.
//
// `back` stands a prop against the wall instead of out on the carpet — smaller, dimmer and higher up, so the
// same three pictures read as a room with depth rather than a row of stickers on one line.
// On the midpoints of the machine spacing, which is now 9 rather than 11 — so these moved with it. The rope
// that used to stand at 2.5 is gone: the VIP door brings its own, and a second velvet rope four points away
// from it would read as two halves of one barrier.
const DECOR = [
    { id: "plant", x: 15.5, back: true },
    { id: "stool", x: 24.5 },
    { id: "plant", x: 33.5 },
    { id: "rope", x: 42.5, back: true },
    { id: "stool", x: 51.5 },
    { id: "plant", x: 60.5, back: true },
    { id: "stool", x: 69.5 },
    { id: "plant", x: 78.5 },
    { id: "stool", x: 87.5, back: true },
];

// ── THE LIGHTING ────────────────────────────────────────────────────────────────────────────────────────
// Chandeliers, hung at a wider spacing than anything on the floor so the two rhythms do not line up and turn
// the room into wallpaper. Each one is a sprite plus a cone of light thrown down onto the carpet — the cone
// is what actually does the work, because a lamp that does not light anything is just a picture of a lamp.
// Hung against the machines rather than with them, so the two rhythms never line up — a light directly over
// every cabinet turns the room into wallpaper. Re-spaced with the row; the first one now lights the VIP bay.
const LAMPS = [8, 24, 40, 56, 72, 88];

// ── EACH CABINET BURNS A DIFFERENT COLOUR ────────────────────────────────────────────────────────────────────
// Nine games sharing one gold accent is nine games that look like one game with the middle swapped out. Each
// machine now drives a single `--acc` custom property, and everything on its screen that used to be hard-coded
// gold reads from it: the reel frame, the win flash, the meters, the pot, the chosen bet, the result line.
//
// The colours are taken from the CABINET SPRITE, not picked freely — you walk up to a machine and then sit at
// it, and the screen agreeing with the object you just looked at is the whole reason to do this. The Deep is
// drawn in cold violet and blue, so its screen is; The Menagerie is russet and green.
const ACCENT = {
    slot: "#ffb648",        // The Hunt — brass, well used
    slot2: "#ffd489",       // The Harvest — honey and copper
    slot3: "#6fd8ff",       // The Deep — cold water
    slot4: "#7fe0a0",       // The Menagerie — the green of its reels
    slot5: "#cdd9ff",       // The Vault — blued steel
    keno: "#67e3d0",        // the lamps on the ticket board
    bingo: "#ff9ec0",       // the caller's baize is green, so the card is not
    blackjack: "#6fd39a",   // felt
};

// Which cabinets are slot machines. Three of them now, and they are not one machine in three paint jobs —
// see SLOT_MACHINES in casino.js. The client does not decide anything about them: it sends which cabinet
// you are standing at and draws whatever came back.
const SLOTS = new Set(["slot", "slot2", "slot3", "slot4", "slot5"]);


// ── THE SYMBOLS ARE DRAWN NOW ────────────────────────────────────────────────────────────────────────────────
// Every reel symbol was a Unicode glyph in a coloured box — a triangle standing in for a wolf. The art is per
// CABINET, not shared: Wolf's Luck burns brass, Den Fortune is honey-coloured, Moonrise is cold silver. Same
// symbol IDs on every machine, so the paytables and both gates never notice; different pictures.
// The Den's own sprites first — pets, fish, foes, dishes — falling back to the generic set drawn for the
// casino if a theme has no picture for a symbol. See SLOT_THEMES in casino.js.
const reelArt = (art, machineId, sym) =>
    art?.[machineId]?.[sym] || `/images/casino/reels/${machineId}-${sym}.webp`;

// Kept only for the tone behind a symbol while its image loads, and for the glow colour on a win.
const SYMBOL_TONE = {
    wolf: "#ffd75e", chest: "#ff9f43", laurel: "#8bf0b4",
    doubloon: "#ffe9b8", bone: "#cbd3dc", moon: "#9fc6dd", star: "#d9c2ff",
};

// ── ONE REEL ─────────────────────────────────────────────────────────────────────────────────────────────────
// A real reel is a STRIP that scrolls and decelerates onto its result, not a box whose contents get swapped.
// The difference is the whole feeling of the machine: swapping is a slideshow, and a strip that slows down is
// a thing coming to rest, which is what you are actually waiting for.
//
// The strip is built once per pull: a run of random symbols with the RESULT on the end. Spinning translates it
// upward on a loop; landing transitions to the last cell with a decelerating curve and a small overshoot, so
// it settles rather than stops dead.
//
// EACH REEL STOPS ON ITS OWN CLOCK, and the third stops latest by a wide margin — that pause, with two symbols
// already matching, is the entire drama of a slot machine and it cannot exist if all three land together.
// -- ONE CLOCK FOR THE REELS ----------------------------------------------------------------------------------
// Luke: "the reel stop sounds dont match the reels stopping."
//
// They did not, by 620ms, and the reason is the oldest one there is: the picture and the sound each kept their
// own copy of the timing. The reels were released on [0, 220, 560] inside the Reel component and the clunks
// were played on [640, 860, 1200] inside the pull handler -- two arrays, in two files' worth of code, that
// nobody could see at the same time. Measured on the live site by sampling each strip's real transform every
// animation frame against a timestamp on every oscillator the sound kit starts:
//
//     reel      came to rest        clunk fired      drift
//       0            631 ms            1259 ms      +628 ms
//       1            848 ms            1481 ms      +633 ms
//       2           1198 ms            1816 ms      +618 ms
//
// So the numbers live here, once, and both halves read them. A clunk is the reel HITTING its stop, which is
// the end of the settle, not the beginning of it.
const REEL_STOP_AT = [0, 220, 560];   // when each reel is released, after the spin ends
const REEL_SETTLE_MS = 340;           // and how long it then takes to decelerate onto its symbol
const REEL_LANDS_AT = REEL_STOP_AT.map((t) => t + REEL_SETTLE_MS);

function Reel({ art, machineId, symbols, result, spinning, index, won }) {
    // ── THE STRIP MUST NOT RESHUFFLE UNDER A LANDED REEL ─────────────────────────────────────────────────
    // `symbols` arrives as a fresh array on every parent render — it is built with .map() up in the panel —
    // so keying the memo on the array itself means a new identity every time anything re-renders, and the
    // countdown ticks once a second. On film the reels landed correctly and then quietly changed symbol
    // three more times while the result text underneath stayed put.
    //
    // Keyed on the CONTENTS instead. The strip is then rebuilt exactly when it should be: a new result, or a
    // new spin.
    const symbolKey = symbols.join(",");
    const strip = useMemo(() => {
        const pool = symbols.length ? symbols : ["wolf"];
        const run = Array.from({ length: 14 }, () => pool[Math.floor(Math.random() * pool.length)]);
        return [...run, result || pool[0]];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbolKey, result, spinning]);

    // ── EACH REEL KEEPS ITS OWN CLOCK ────────────────────────────────────────────────────────────────────
    // The first version staggered where each strip STOPPED but took the blur off all three at the same
    // instant, because one `spinning` flag drove all of them. On film that reads as "the reels stopped, then
    // adjusted themselves" — every symbol goes sharp together and the machine has already told you the answer
    // before the third reel has finished moving.
    //
    // So a reel holds its own spin until its own moment. The third waits nearly three quarters of a second
    // after the first, and that gap — two symbols matching, one still going — is the near-miss, which is the
    // only reason anybody watches a slot machine at all.
    const stopAt = REEL_STOP_AT[index] || 0;
    const [held, setHeld] = useState(false);
    useEffect(() => {
        if (spinning) { setHeld(true); return undefined; }
        const t = setTimeout(() => setHeld(false), stopAt);
        return () => clearTimeout(t);
    }, [spinning, stopAt]);

    const running = spinning || held;
    const landed = !running && result;

    // ── HOW BIG A CELL IS, IS A CSS QUESTION ─────────────────────────────────────────────────────────────
    // The cell height was a JS constant, so the reels were 84px whether they were tucked in a panel on the
    // floor or filling a phone in full screen — which is how a full-screen slot ended up with three small
    // reels and a quarter of a screen of nothing. The strip travels in MULTIPLES OF `--cell` instead of in
    // computed pixels, so the whole thing scales from one CSS clamp and the landing maths cannot drift out
    // of step with the drawing.
    const steps = strip.length - 1;

    return (
        <span className={`cas-reel${running ? " is-spin" : ""}${landed ? " is-stop" : ""}${won ? " is-won" : ""}`}
            style={{ "--tone": SYMBOL_TONE[result] || "#cbd3dc" }}>
            <span className="cas-strip"
                style={landed
                    ? { transform: `translateY(calc(var(--cell) * ${-steps}))`, "--settle": `${REEL_SETTLE_MS}ms` }
                    : { transform: "translateY(0)" }}>
                {strip.map((sym, i) => (
                    <span className="cas-cell" key={i}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={reelArt(art, machineId, sym)} alt="" draggable="false" />
                    </span>
                ))}
            </span>
        </span>
    );
}

// How fast the keno hopper empties. Slower than bingo's forty because there are only ten of them and each
// one matters four times as much — a ten-ball draw that is over in a second is a number appearing, not a draw.
const KENO_BALL_MS = 230;

const money = (n) => Math.round(Number(n) || 0).toLocaleString();

// ── QUICK PICK ─────────────────────────────────────────────────────────────────
// Every keno lounge on earth has this button, and the reason is not laziness — it is that picking five
// numbers by hand before EVERY ticket is friction on the one action the game is made of, and friction on the
// repeat is what stops somebody buying a second one. The picks are still validated server-side; this only
// fills the form.
const KENO_PICKS = 5;
function quickPick(pool = 40) {
    const bag = Array.from({ length: pool }, (_, i) => i + 1);
    for (let i = 0; i < KENO_PICKS; i += 1) {
        const j = i + Math.floor(Math.random() * (bag.length - i));
        [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag.slice(0, KENO_PICKS).sort((a, b) => a - b);
}

// Every way a hand can end, said the way somebody would say it out loud. "dealer_bust" is a state name, not
// a sentence, and a table that reports state names is a table that reads like a debug log.
const OUTCOME = {
    blackjack: "Blackjack.",
    win: "You take it.",
    dealer_bust: "Dealer busts.",
    push: "Push — your stake comes back.",
    lose: "The house takes it.",
    bust: "Bust.",
    dealer_blackjack: "Dealer had blackjack.",
};

// The same outcomes again, short — these label ONE hand of a split, where the full sentence would not fit
// and would read oddly twice over ("The house takes it. The house takes it.").
const OUTCOME_SHORT = {
    blackjack: "blackjack",
    win: "won",
    dealer_bust: "won",
    push: "push",
    lose: "lost",
    bust: "bust",
    dealer_blackjack: "lost",
};

// ── THE SHARED-ROUND RAIL IS GONE ───────────────────────────────────────────────────
// `Round` lived here — the countdown, the player count and what you had riding — along with `secsLeft`, the
// clock it ran on. Both are DELETED rather than left unmounted, because a component nothing renders is the
// thing that makes the next person believe the feature still exists. Keno and bingo resolve in one answer
// now; there is no window to count down and nobody else's tickets to name. See casino.js and bingo-kit.js.

// A card, drawn in CSS like every other thing on this floor. Red suits red, black suits pale — the one piece
// of card design that is not decoration, because it is how you read a hand at a glance.
const SUIT_ART = { s: { glyph: "♠", red: false }, h: { glyph: "♥", red: true }, d: { glyph: "♦", red: true }, c: { glyph: "♣", red: false } };
// ── ONE CARD ─────────────────────────────────────────────────────────────────────────────────────────────────
// `delay` staggers it behind the cards dealt before it, so a hand ARRIVES rather than appearing. Only cards
// that are new this render carry one — React keys the rest by their own value, so they stay mounted and never
// re-animate, which is what stops the whole table re-dealing itself every time you hit.
//
// `flip` is the hole card turning over, and it is the only moment at this table worth animating properly:
// everything else is you deciding, this is the table answering. It comes in edge-on and rotates to face up,
// which needs no second face and no backface-visibility — a card seen from its own edge is invisible.
function Card({ card, delay = 0, flip = false, dead = false }) {
    const rank = String(card).slice(0, -1);
    const suit = SUIT_ART[String(card).slice(-1)] || SUIT_ART.s;
    // A rank in the corner and a pip in the middle was a token, not a card. Real indices in BOTH corners
    // (the lower one rotated, the way a card is readable from either side of a table) and a pip big enough
    // to be the thing you actually read the hand from. A court card gets a heavier centre so a face is
    // distinguishable from a number at a glance, which is most of what reading a hand is.
    const court = rank === "J" || rank === "Q" || rank === "K";
    return (
        <span className={`cas-card${suit.red ? " is-red" : ""}${flip ? " is-turn" : ""}${dead ? " is-dead" : ""}${court ? " is-court" : ""}${rank === "A" ? " is-ace" : ""}`}
            style={delay ? { "--d": `${delay}ms` } : undefined}>
            <span className="cas-ix"><b>{rank}</b><i>{suit.glyph}</i></span>
            <span className="cas-pip">{suit.glyph}</span>
            <span className="cas-ix is-br"><b>{rank}</b><i>{suit.glyph}</i></span>
        </span>
    );
}

export default function CasinoClient({ initial }) {
    const [st, setSt] = useState(initial);
    // ── WALKING IN FACING SOMETHING ──────────────────────────────────────────────────────────────────────
    // `?at=blackjack` starts you at that cabinet instead of at the door. The floor is six machines wide and
    // getting to the far end is thirteen taps, which is fine when you are wandering and tedious when you came
    // back for one thing. It also makes a machine linkable — from a bounty card, a badge, a message.
    // Unknown or missing name just starts you at the door, so a bad link is a walk rather than an error.
    // Reading ?at= in the INITIALISER is a server/client branch: the server has no window and renders you at
    // the door, the client renders you at the machine, and React reports a hydration mismatch it explicitly
    // says it will not patch up. Every deep link into the casino — from a bounty card, a badge, a message —
    // logged an error. Starting at the door on both sides and walking to the machine in an effect is the same
    // result one frame later, with the two renders agreeing.
    // Where you come in. Was 14, which was the empty end of the floor before the VIP bay existed — and is now
    // inside the rope's reach (11.8 + REACH), so walking into the casino stood you at a door most people
    // cannot open. 17 clears it and lands you at The Hunt, which is the first cabinet and a better thing to
    // arrive facing.
    const [x, setX] = useState(17);
    const [facing, setFacing] = useState(1);
    const [at, setAt] = useState(null);          // the machine you are standing at
    const [bet, setBet] = useState(100);
    const [spin, setSpin] = useState(null);      // the last pull, for the reels and the callout
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const xRef = useRef(x);
    // ── THE CAMERA ───────────────────────────────────────────────────────────────────────────────────────
    // The floor is WIDER than the screen and scrolls with you. Six cabinets already crowd a phone; fitting
    // the whole room into one viewport stops working the moment there are more, and a casino you can see all
    // of at once is a menu with a carpet. The room is the window, `.cas-world` is the floor, and the window
    // follows you.
    const roomRef = useRef(null);
    // Reels mid-spin: the symbols cycling before they land. Null when the machine is at rest.
    const [spinning, setSpinning] = useState(false);
    const [landed, setLanded] = useState(0);     // how many reels have stopped, 0..3
    const [flash, setFlash] = useState(null);    // "win" | "big" — the celebration, cleared on a timer
    // ── THE TEASE ────────────────────────────────────────────────────────────────────────────────────────
    // True for the third of a second when two reels match and the last one is still running. It is the whole
    // reason anybody watches a slot machine, and until now it was happening with nothing on screen or in the
    // speakers acknowledging it: the frame pulses and a note climbs for exactly as long as the gap lasts.
    const [tease, setTease] = useState(false);
    // ── THE TABLE DEALS, IT DOES NOT APPEAR ──────────────────────────────────────────────────────────────
    // A blackjack hand arrived fully formed: four cards mounted on the same frame, one animation between
    // them, no sound, and the hole card was a purple swatch that swapped itself for a real one. The result
    // was correct and there was nothing to watch.
    // `bjFrom` is the index the cards dealt THIS beat start at — everything before it is already on the felt
    // and must not re-animate. `bjFlip` is the hole card turning, which is the only moment at this table
    // worth animating properly.
    const [bjFrom, setBjFrom] = useState(0);
    const [bjFlip, setBjFlip] = useState(false);
    // True once every card of this beat is on the felt. The totals wait for it — see the seat header.
    const [bjSettled, setBjSettled] = useState(true);
    const bjSeen = useRef(0);
    const bjHidden = useRef(false);
    // What just came out of the machine — coins, shards, the pot. `id` only exists so a second burst REMOUNTS
    // the component: a burst seeds its scatter once, on mount, so replaying one means giving it a new key.
    const [burst, setBurst] = useState(null);
    const burstId = useRef(0);
    const throwBurst = useCallback((kind, tone) => {
        burstId.current += 1;
        setBurst({ id: burstId.current, kind, tone });
    }, []);
    const timers = useRef([]);
    // The ticket: five numbers of forty, and the last draw.
    const [ticket, setTicket] = useState([]);
    const [keno, setKeno] = useState(null);
    // How many of the ten have come out of the hopper. The result is banked the moment the request answers
    // — this is only the ceremony over it, exactly as the bingo draw is.
    const [kenoOut, setKenoOut] = useState(0);
    // The last thing that was not gold. Cleared at the start of every play so it can never look like the
    // machine just paid out twice.
    const [prize, setPrize] = useState(null);
    // What the pets did on this play, and the pet itself if one turned up. Separate from `prize` because a
    // pet arriving is a different size of moment than a chest and must not quietly replace one.
    const [note, setNote] = useState(null);
    const [wonPet, setWonPet] = useState(null);
    // The one machine with a hand in progress. It comes down from the server on load, so closing the tab
    // mid-hand is not a way to lose a stake — nor a way to walk out of one.
    const [hand, setHand] = useState(initial?.blackjack?.hand || null);
    // The hall. `card` is the whole answer the moment it arrives; `called` is how far the ceremony has got
    // through the forty balls, which is the only thing the animation actually advances.
    const [card, setCard] = useState(null);
    // The lounge, once you are in it. Null means you are on the floor — the two are one screen or the other,
    // never both, because they are two rooms and you are only ever standing in one.
    const [vip, setVip] = useState(null);
    // ── THE DRAGON'S PASS, AS IT HAPPENS ────────────────────────────────────────────────────────────────
    // `dragon` is the flight currently on screen (or null); `lit` is how many of its squares have caught so
    // far, so the fire spreads along the path a square at a time rather than the whole line igniting at
    // once. Two pieces of state rather than one because the sprite has to be flying BEFORE anything burns —
    // the travel is the anticipation, and a dragon that arrives already having done it is a status effect.
    const [dragon, setDragon] = useState(null);
    const [dragonLit, setDragonLit] = useState(0);
    const [called, setCalled] = useState(0);
    // What each cabinet remembers about you — the tray filling, the multiplier climbing, free pulls banked.
    // Seeded from the server and replaced by every pull's answer, never incremented locally: a meter the
    // client keeps its own count of is a meter that disagrees with the one that pays.
    const [meters, setMeters] = useState(initial?.meters || {});
    // The floor's shared jackpot. Comes down with every state read and every pull, so it climbs on its own
    // while you watch it.
    const [pot, setPot] = useState(initial?.pot?.amount || 0);
    // ── SITTING DOWN ─────────────────────────────────────────────────────────────────────────────────────
    // The room is the lobby; a machine is a place you SIT AT. Walking the floor and then scrolling to a panel
    // underneath it is two different things fighting for one screen — on a phone the reels and the button
    // could not both be visible, which is the one thing a slot machine has to manage.
    const [seated, setSeated] = useState(false);
    // The paytable, for the cabinets that do not draw their own. Held here rather than inside the reels
    // because it is a property of the MACHINE, not of a spin.
    const [pays, setPays] = useState(false);
    // The room's one sound flag. Read after mount, never during render — it lives in localStorage and the
    // server has no idea what it says, so touching it while rendering is a hydration mismatch.
    const [soundOff, setSoundOff] = useState(false);
    useEffect(() => { setSoundOff(isMuted()); }, []);
    const toggleSound = useCallback(() => {
        setSoundOff((was) => {
            const next = !was;
            setMuted(next);
            // A confirming click, but only on the way ON — a sound to tell you the sound is off is a joke
            // that lands once.
            if (!next) { unlock(); Cas.coin(2); }
            return next;
        });
    }, []);
    const [fx, setFx] = useState(null);      // what the features did on the last pull

    // ── WALKING ──────────────────────────────────────────────────────────────────────────────────────────────
    // Your position is local and immediate — the walk must never wait on a round trip — and pushed to the
    // server on a timer so the other people in the room see you move. The same shape the tavern uses.
    useEffect(() => { xRef.current = x; }, [x]);
    useEffect(() => {
        const id = setInterval(() => {
            fetch("/api/marketplace/casino", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "move", x: xRef.current, y: 72, facing }),
            }).catch(() => {});
        }, 2500);
        return () => clearInterval(id);
    }, [facing]);

    // Who else is on the floor. Polled rather than pushed, because a casino is not a fight — a few seconds of
    // staleness in where somebody is standing costs nothing.

    // The per-second countdown tick lived here. It existed only to repaint the shared-round rail, and there
    // are no shared rounds — an interval firing once a second forever to update nothing is the kind of thing
    // that survives a feature by years because it costs nothing visible.

    // ── THE CAMERA IS YOURS ──────────────────────────────────────────────────────────────────────────────
    // Luke: "remove the camera snap on tap."
    //
    // This used to re-centre on the hero every time `x` changed — which, since walking moves him sixteen
    // times a second, meant the view was dragged along behind him for the whole walk and any framing you
    // had set by dragging the floor was thrown away the moment you tapped it. Two controls fighting over
    // one thing: you aim the camera, and then the game aims it somewhere else.
    //
    // It only runs ONCE now, to put you on screen when the room opens. After that the floor stays exactly
    // where you left it and the hero walks around inside the frame you chose. Nothing is ever lost by this:
    // a tap can only target a spot you can SEE, so walking always ends inside the current view.
    //
    // Merged with the deep link because they are the same job — decide where the camera starts — and as two
    // effects they both ran on mount and the second one's `setX` landed after the first had already framed
    // the wrong place.
    useEffect(() => {
        const want = new URLSearchParams(window.location.search).get("at");
        // Arriving from a link puts you AT the machine rather than walking you the length of the floor to
        // it: a link is a door, not a stroll.
        const m = MACHINES.find((mm) => mm.id === want);
        if (m) setX(m.x);
        const el = roomRef.current;
        if (!el) return;
        const startX = m ? m.x : xRef.current;
        el.scrollTo({ left: (el.scrollWidth * startX) / 100 - el.clientWidth / 2, behavior: "auto" });
    }, []);

    // ── WALKING, WITHOUT STEPS ───────────────────────────────────────────────────────────────────────────
    // Luke: "let me freely move." Every tap of an arrow moved you exactly 6% of the floor and no other amount
    // was reachable, so the room had nine cabinets and about fifteen places you were allowed to stand. You
    // could not walk up to something and stop next to it.
    //
    // `goal` is where you are heading, or null when you are still. Everything that moves you sets a goal and
    // the loop below does the walking, which means holding an arrow, tapping a spot on the floor and arriving
    // from a deep link are all the same one mechanism rather than three.
    const [goal, setGoal] = useState(null);

    useEffect(() => {
        if (goal == null) return undefined;
        const id = setInterval(() => {
            setX((p) => {
                const step = (WALK_PER_SEC * WALK_TICK_MS) / 1000;
                const d = goal - p;
                if (Math.abs(d) <= step) { setGoal(null); return goal; }
                return p + Math.sign(d) * step;
            });
        }, WALK_TICK_MS);
        return () => clearInterval(id);
    }, [goal]);

    // A footfall roughly every other tick while you are moving — a step per frame of a walk cycle would be a
    // machine gun, and silence would be a hero on a conveyor belt.
    useEffect(() => {
        if (goal == null) return undefined;
        const id = setInterval(() => Sfx.step(0.3 + Math.random() * 0.35), WALK_TICK_MS * 4);
        return () => clearInterval(id);
    }, [goal]);

    // ── DRAG THE FLOOR ───────────────────────────────────────────────────────────────────────────────────
    // On a phone the native scroll does all of this already, so the only thing that runs there is the
    // movement bookkeeping. On DESKTOP a native horizontal scroller does not respond to a click-drag at
    // all, so a mouse pointer drives `scrollLeft` by hand.
    //
    // CAPTURE IS TAKEN ONLY ONCE THE GESTURE IS A PAN, NEVER ON POINTERDOWN. Town's camera carries the
    // scar: capturing on pointerdown retargets the pointerup, and a mouse click is dispatched to the
    // common ancestor of down and up — so every button in the scene stopped receiving clicks on desktop,
    // while touch was unaffected, which is why it hid for so long.
    //
    // The useful side effect of capturing late: on a real drag the click lands on the ROOM rather than on
    // whichever cabinet the press started on, so dragging across a machine cannot open it.
    const pan = useRef({ down: false, moved: false, startX: 0, lastX: 0, mouse: false, cap: null });

    const panDown = useCallback((e) => {
        pan.current = { down: true, moved: false, startX: e.clientX, startY: e.clientY, lastX: e.clientX,
            mouse: e.pointerType === "mouse", cap: null };
    }, []);
    const panMove = useCallback((e) => {
        const d = pan.current;
        if (!d.down) return;
        // Mostly-horizontal, or a vertical page scroll that happens to start on the floor counts as a pan
        // and eats the tap that follows it. `startY` has to actually be recorded for this test to mean
        // anything — without it the vertical term is always zero and every gesture reads as a drag.
        if (!d.moved && Math.abs(e.clientX - d.startX) > 4
            && Math.abs(e.clientX - d.startX) > Math.abs(e.clientY - d.startY) * 0.8) {
            d.moved = true;
            if (d.mouse) { try { e.currentTarget.setPointerCapture(e.pointerId); d.cap = e.pointerId; } catch { /* ok */ } }
        }
        if (!d.moved) return;
        if (d.mouse) e.currentTarget.scrollLeft -= e.clientX - d.lastX;
        d.lastX = e.clientX;
    }, []);
    const panUp = useCallback((e) => {
        const d = pan.current;
        d.down = false;
        if (d.cap != null) { try { e.currentTarget.releasePointerCapture(d.cap); } catch { /* ok */ } d.cap = null; }
    }, []);
    // True once, if the gesture that just finished was a drag. Read by everything clickable on the floor,
    // because a swipe that ends over a cabinet must not also open it.
    const draggedJustNow = useCallback(() => {
        if (!pan.current.moved) return false;
        pan.current.moved = false;
        return true;
    }, []);

    const walkTo = useCallback((to) => {
        unlock();
        setErr(null);
        // Read the position from the ref, not from inside a setX updater — an updater can be called twice
        // and setting other state from within one is a side effect in a place React is allowed to repeat.
        setFacing(to < xRef.current ? -1 : 1);
        setGoal(Math.max(4, Math.min(96, to)));
    }, []);


    // Escape stands you up. A full-screen layer with no keyboard way out is a trap on desktop.
    useEffect(() => {
        if (!seated) return undefined;
        const onKey = (e) => { if (e.key === "Escape") setSeated(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [seated]);

    // ── WHAT ELSE IS ON THE SCREEN ───────────────────────────────────────────────────────────────────────
    // The social bubble is fixed to the bottom-right of every page in the Den, which is exactly where the
    // pull button ends up on a machine — it sat ON the button, and a chat window opening because somebody
    // reached for Pull is the sort of thing that gets blamed on the machine. The page behind is also frozen
    // so a full-screen game does not scroll the room underneath it.
    useEffect(() => {
        if (!seated) return undefined;
        document.body.classList.add("cas-seated");
        return () => document.body.classList.remove("cas-seated");
    }, [seated]);

    // -- THE FIRST TOUCH, WHATEVER IT WAS ----------------------------------------------------------------
    // A browser will not start audio until a real gesture, and `unlock()` was only wired to the handful of
    // handlers that make a sound themselves -- walking, pulling, dealing. Anything that fired before one of
    // those was dropped on the floor: `tone()` opens with `if (!ctx) return`, so a sound requested before the
    // context exists is not queued, delayed or logged, it simply never happened. The cabinet's signature on
    // sitting down was exactly that sound, and so was the arrival chime if you reached a machine by dragging.
    //
    // One listener, on the first pointerdown anywhere in the room, in the capture phase so nothing can stop it
    // first. After that the context is up and every later sound has somewhere to land.
    useEffect(() => {
        const go = () => unlock();
        window.addEventListener("pointerdown", go, { once: true, capture: true });
        return () => window.removeEventListener("pointerdown", go, { capture: true });
    }, []);

    // -- AND THE MACHINE'S OWN VOICE ---------------------------------------------------------------------
    // Every sound the cabinet makes from here -- the handle, the reels, the coins, the fanfare, the sigh
    // after a near miss -- is drawn from this machine's scale and register rather than from one shared set.
    // See VOICES in casino-audio.js for what a voice actually changes.
    //
    // The signature plays on arrival: three notes off the cabinet's own scale, which is the machine saying
    // which one it is before you have pulled anything. Standing up puts the kit back on the neutral voice so
    // the floor's own sounds do not keep the last cabinet's key.
    // A paytable belongs to the machine that opened it. Left standing, it would still be over the screen
    // after you stood up and walked to a different cabinet, describing the one you left.
    useEffect(() => { setPays(false); }, [at?.id, seated]);

    useEffect(() => {
        if (!seated || !at) return undefined;
        Cas.at(at.id).signature();
        return () => { Cas.at("slot"); };
    }, [seated, at]);

    // What you are standing in front of. Recomputed from position rather than remembered, so walking away
    // closes the machine without anything having to tell it to.
    useEffect(() => {
        const near = MACHINES.find((m) => Math.abs(m.x - x) <= REACH);
        // Coming into reach of a machine says so — once, on the step that arrives, and never again while you
        // stand at the same one. A chime on every step would be the room nagging.
        setAt((prev) => {
            if (near && prev?.id !== near.id) Sfx.arrive();
            return near || null;
        });
        if (!near) setSeated(false);   // walked away from the machine you were sat at
    }, [x]);

    // ── ONE PULL, AS AN EVENT ────────────────────────────────────────────────────────────────────────────
    // The server answers in a few milliseconds and that is exactly the problem: an instant result is a number
    // appearing, not a spin. The reels cycle while the request is in flight and then land LEFT TO RIGHT with
    // a thunk each, which is the whole drama of a slot machine — the third reel is where the tension lives,
    // and it cannot exist if all three resolve on the same frame.
    //
    // The outcome is never in doubt by then: the server decided it before the first reel stopped. The
    // ceremony is presentation over a result already banked, which is the honest version of this — nothing
    // here can change what was rolled.
    // ── WHAT THE PETS DID ────────────────────────────────────────────────────────────────────────────────
    // Every machine ends here, which is the point: a prize, a free play, a refund and a pet arriving are the
    // same four things wherever you were standing, and a floor where the slot celebrates differently from the
    // wheel is a floor that has to be learned twice. (The wheel is gone; the shape it set is not.)
    //
    // It also fixes something the slot had on its own: `pull` cleared the prize banner and never set it, so
    // the slot's chests were rolled by the server, banked, and never shown.
    const absorb = useCallback((r) => {
        if (r.prize) { setPrize(r.prize); Sfx.gemSet?.(); Haptic.crit(); }
        // The quiet ones. Said plainly and briefly — the pet paying for a pull is a nice thing to notice, not
        // an event to stop the room for.
        if (r.onHouse) setNote({ kind: "house", text: "On the house — your stake came back." });
        else if (r.refund > 0) setNote({ kind: "refund", text: `The Croupier's Cat pushes ${money(r.refund)} back.` });
        else setNote(null);
        // The loud one. A casino pet is a 1-in-hundreds-to-thousands event and the rarest is 1 in 5,556, so
        // it gets the room: its own banner, held until you walk away or play again, and the perk strip
        // updates underneath it so the thing it BOUGHT you is visible in the same breath.
        if (r.pet) {
            setWonPet(r.pet);
            Sfx.crit(1); Haptic.crit();
            setSt((prev) => ({
                ...prev,
                perks: { ...(prev?.perks || {}), pets: [...(prev?.perks?.pets || []), { id: r.pet.id, name: r.pet.name }] },
            }));
        }
    }, []);

    // ── THE FIVE-REEL MACHINE'S OWN SPIN ────────────────────────────────────────────────────────────────
    // Its own action rather than a flag on `pull`: a different engine, a different currency and a different
    // response shape. Two games behind one verb is how a payout path gets confused about which table it is
    // paying from. Returns the raw response to the component, which does all the revealing.
    const spin5 = useCallback(async (offerId, force) => {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "spin5", bet, machine: at?.id, offer: offerId, force: force || undefined }),
        }).then((x) => x.json()).catch(() => null);
        if (!r?.ok) {
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet."
                : r?.error === "closed" ? "This machine is not open yet."
                : "That didn't go through.");
            return r || { ok: false };
        }
        // Gold AND chips both moved, and the purse at the top of the screen shows both.
        setSt((p) => (p ? { ...p, gold: r.gold, chips: r.chips } : p));
        return r;
    }, [bet, at]);

    // The shelf, and buying off it. Both go straight through to the server: the price is read from the
    // catalog there and `item` is only a key, so nothing this screen sends can change what anything costs.
    const shelf = useCallback(async () => {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "chip_shelf" }),
        }).then((x) => x.json()).catch(() => null);
        return r?.ok ? r : { items: [] };
    }, []);

    const buyChip = useCallback(async (item) => {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "chip_buy", item }),
        }).then((x) => x.json()).catch(() => null);
        if (r?.ok) setSt((p) => (p ? { ...p, chips: r.balance } : p));
        return r || { ok: false };
    }, []);

    const pull = useCallback(async () => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setLanded(0); setPrize(null); setNote(null); setWonPet(null); setFx(null);
        setTease(false); setBurst(null);
        // A handle, not a click: a spring, a body, and the reels coming up to speed underneath. It runs for
        // about as long as the request does, so a machine never sits silent waiting for the network.
        Cas.pull();

        // The reels spin themselves — see the Reel component. All this has to do is say when, which means a
        // slow network simply spins for longer instead of freezing on the previous result.
        setSpinning(true);

        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "spin", bet, machine: at.id }),
        }).then((x2) => x2.json()).catch(() => null);

        if (!r?.ok) {
            setSpinning(false); setBusy(false);
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet." : "That didn't go through.");
            return;
        }

        // A minimum spin, so a fast answer still feels like a machine rather than a calculator.
        const MIN_SPIN = 420;
        timers.current.push(setTimeout(() => {
            setSpinning(false);
            setSpin(r);
            setSt((p) => ({ ...p, gold: r.gold }));

            // One clunk per reel as it settles, on the same clock the strips use, PITCHED UP each time —
            // rising pitch reads as rising tension with no explanation needed, and the third reel is where
            // the tension is meant to be. The third is late on purpose: that pause, with two symbols already
            // matching, is the near-miss.
            // Derived from the reels' own clock -- see REEL_STOP_AT. This used to be a second hand-written
            // array and it had drifted 620ms out of step with the picture.
            const REEL_AT = REEL_LANDS_AT;
            [0, 1, 2].forEach((i) => {
                timers.current.push(setTimeout(() => {
                    setLanded(i + 1);
                    Cas.reelStop(i, i === 2 ? 0.85 : 0.45);
                    Haptic.hit(i === 2 ? 0.55 : 0.35);

                    // Two matching, one still running. The riser is handed the EXACT gap that is left, so it
                    // stops climbing at the same instant the reel stops — a riser that finishes early tells
                    // you the answer before the machine does, which is worse than no riser at all.
                    if (i === 1 && r.reels[0] === r.reels[1]) {
                        setTease(true);
                        Cas.anticipate(REEL_AT[2] - REEL_AT[1]);
                        Haptic.hit(0.2);
                    }
                    if (i === 2) {
                        setTease(false);
                        // It climbed and came to nothing. Short and quiet: an almost is not a loss to be
                        // rubbed in, it is the thing that makes you pull again.
                        if (r.reels[0] === r.reels[1] && r.reels[1] !== r.reels[2]) Cas.nearMiss();
                    }
                }, REEL_AT[i]));
            });

            timers.current.push(setTimeout(() => {
                setBusy(false);
                absorb(r);
                if (r.meter) setMeters((p) => ({ ...p, [r.machine]: r.meter }));
                if (r.pot) setPot(r.pot.amount);
                setFx({ nudged: r.nudged, awarded: r.awarded, tipped: r.tipped, struck: r.struck, free: r.free,
                    fed: r.fed, burst: r.burst, potWon: r.potWon });
                const three = r.reels[0] === r.reels[1] && r.reels[1] === r.reels[2];
                const acc = ACCENT[r.machine] || "#ffd75e";

                // ── WHAT THE MACHINE SOUNDS LIKE WHEN IT PAYS ────────────────────────────────────────
                // The cascade is scaled by the MULTIPLIER, not by the gold, because gold depends on what
                // you staked and a 2x should sound like a 2x whether you bet 25 or 2,500.
                if (r.won > 0) {
                    setFlash(three ? "big" : "win");
                    const size = Math.min(1, Math.log10(Math.max(1, r.mult || 1)) / 2.4);
                    if (three) { Cas.jackpot(); Haptic.crit(); throwBurst("hoard", acc); }
                    else { Cas.coins(0.2 + size * 0.6); Haptic.hit(0.6); throwBurst("coin", acc); }
                    timers.current.push(setTimeout(() => setFlash(null), three ? 2200 : 1200));
                } else if (!r.nudged && !r.awarded && !r.fed?.length) {
                    // Most pulls lose. This is barely audible on purpose — a machine that makes a noise
                    // about every dead pull is exhausting by the tenth.
                    Cas.dud();
                }

                // ── AND WHAT EACH FEATURE SOUNDS LIKE ────────────────────────────────────────────────
                // Staggered rather than fired together: three features can land on one pull, and three
                // celebrations on the same frame is a single noise nobody can pick apart.
                if (r.struck > 1) Cas.multUp(r.struck);
                if (r.nudged) timers.current.push(setTimeout(() => Cas.nudge(), 60));
                (r.fed || []).forEach((id, k) => {
                    const tier = (st?.banks || []).findIndex((b) => b.id === id);
                    const held = r.meter?.banks?.[id];
                    const holds = (st?.banks || []).find((b) => b.id === id)?.holds || 1;
                    timers.current.push(setTimeout(
                        () => Cas.bankFeed(Math.max(0, tier), (held?.coins || 0) / holds), 140 + k * 95));
                });
                if (r.burst?.length) {
                    const tier = (st?.banks || []).findIndex((b) => b.id === r.burst[0].id);
                    timers.current.push(setTimeout(() => {
                        Cas.bankBurst(Math.max(0, tier));
                        throwBurst("shard", (st?.banks || [])[Math.max(0, tier)]?.tone || acc);
                    }, 300));
                }
                if (r.awarded) timers.current.push(setTimeout(() => Cas.freePulls(r.awarded.pulls), 360));
                // The Pot last and loudest. It is the only sound in the building built on stacked thirds,
                // so when it plays nothing else in the room sounds like it.
                if (r.potWon) {
                    timers.current.push(setTimeout(() => { Cas.pot(); throwBurst("hoard", "#ffd75e"); }, 440));
                }
            }, 1320));
        }, MIN_SPIN));
    }, [bet, busy, absorb, at, st]);

    // ── THE WHEEL AND THE TICKET ─────────────────────────────────────────────────────────────────────────
    // Both are ONE ROLL, so they share a shape: take the bet, show the result, celebrate if it paid. The slot
    // gets its own function because its ceremony is three separate landings; these two resolve at once and
    // pretending otherwise would be theatre with nothing behind it.
    const play = useCallback(async (body, onResult) => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setPrize(null); setNote(null); setWonPet(null);
        setBurst(null); setKenoOut(0);
        // Chips going down on the felt, not a UI blip.
        Cas.chips();
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((x2) => x2.json()).catch(() => null);
        if (!r?.ok) {
            setBusy(false);
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet."
                : r?.error === "bad_ticket" ? "Pick five numbers first."
                    : "That didn't go through.");
            return;
        }
        // Held for keno until the last ball is out — see below. Everything else resolves in one beat.
        if (body.action !== "keno") setBusy(false);
        onResult(r);
        // Gold went out, chips came back — both live in the purse at the top of the screen, and showing
        // only one of them is how a currency conversion becomes invisible to the person it happened to.
        setSt((p) => ({ ...p, gold: r.gold, chips: r.chips ?? p?.chips }));

        // ── THE HOPPER, ONE BALL AT A TIME ────────────────────────────────────────
        // The ticket used to be placed into a shared round and answered 45 seconds later with a sentence.
        // It resolves instantly now (see the note in casino.js), so the ten balls are a ceremony over a
        // result that is already banked — the same shape as the bingo draw, and the same reason: the DRAW
        // is the game. A keno ticket that prints its answer in one line has no game in it at all.
        //
        // The celebration waits for the last ball. Firing it on the response would be the machine telling
        // you that you won before it had shown you why.
        if (body.action === "keno" && Array.isArray(r.drawn)) {
            setKenoOut(0);
            const acc2 = ACCENT.keno;
            r.drawn.forEach((n, i) => timers.current.push(setTimeout(() => {
                setKenoOut(i + 1);
                // Pitched off the ball's own number, so a draw is a little melody rather than the same pop
                // ten times — and one of YOURS lands harder, because that is the whole feedback loop.
                Cas.ball(n);
                if ((r.picks || []).includes(n)) { Cas.daub(); Haptic.hit(0.35); }
            }, i * KENO_BALL_MS)));
            timers.current.push(setTimeout(() => {
                setBusy(false);
                absorb(r);
                if (r.won > 0) {
                    const big = r.won >= r.bet * 10;
                    setFlash(big ? "big" : "win");
                    if (big) { Cas.jackpot(); Haptic.crit(); throwBurst("hoard", acc2); }
                    else { Cas.coins(0.35); Haptic.hit(0.6); throwBurst("coin", acc2); }
                    timers.current.push(setTimeout(() => setFlash(null), big ? 2200 : 1200));
                } else Cas.lose();
            }, r.drawn.length * KENO_BALL_MS + 320));
            return;
        }

        absorb(r);
        const acc = ACCENT.keno;
        if (r.won > 0) {
            // A payout worth more than ten times the stake is the moment worth shaking the room for.
            const big = r.won >= r.bet * 10;
            setFlash(big ? "big" : "win");
            if (big) { Cas.jackpot(); Haptic.crit(); throwBurst("hoard", acc); }
            else { Cas.coins(0.35); Haptic.hit(0.6); throwBurst("coin", acc); }
            timers.current.push(setTimeout(() => setFlash(null), big ? 2200 : 1200));
        } else {
            Cas.lose();
        }
    }, [busy, absorb, throwBurst]);

    // ── THE TABLE ────────────────────────────────────────────────────────────────────────────────────────
    // Four verbs against one endpoint. The client sends no state at all — not which hand, not what is in it —
    // because everything about a hand of blackjack that could be worth lying about lives in a row on the
    // server. All this function decides is which word to send.
    const table = useCallback(async (action, body = {}) => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null);
        if (action === "bj_deal") { setPrize(null); setNote(null); setWonPet(null); setBurst(null); }
        // Chips down, then the shoe. The cards themselves are voiced by the reveal effect, on the same clock
        // the animation uses — firing one here as well would sound a card that is not on the felt yet.
        if (action === "bj_deal") { Cas.chips(); timers.current.push(setTimeout(() => Cas.shoe(), 140)); }
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, ...body }),
        }).then((x2) => x2.json()).catch(() => null);
        setBusy(false);
        if (!r?.ok) {
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet."
                : r?.error === "cannot_double" ? "You can only double on your first two cards."
                    : r?.error === "no_hand" ? "That hand is already finished."
                        : "That didn't go through.");
            return;
        }
        setHand(r.hand || null);
        if (r.gold != null) setSt((p) => ({ ...p, gold: r.gold }));
        // A card landing is a small sound; the hand ENDING is the moment. Splitting them is what keeps a hit
        // from feeling like a result.
        // A card landing is a small sound; the hand ENDING is the moment. The deal already played its own
        // sound above, so an open hand needs nothing more.
        if (r.hand && r.hand.open) { Haptic.hit(0.35); return; }
        absorb(r);
        const beat = r.hand?.outcome;
        const acc = ACCENT.blackjack;
        // The table's own sound, not the machines' fanfare — a blackjack is certain rather than suspenseful,
        // and it should not borrow the noise a 700x pull makes.
        if (beat === "blackjack") { setFlash("big"); Cas.blackjack(); Haptic.crit(); throwBurst("hoard", acc); }
        else if (r.won > 0) { setFlash("win"); Cas.coins(0.4); Haptic.hit(0.6); throwBurst("coin", acc); }
        else if (beat === "push") { Cas.push(); }
        else if (beat === "bust") { Cas.bust(); Haptic.hit(0.4); }
        else { Cas.lose(); Haptic.hit(0.25); }
        if (r.won > 0 || beat === "blackjack") {
            timers.current.push(setTimeout(() => setFlash(null), beat === "blackjack" ? 2200 : 1200));
        }
    }, [busy, absorb, throwBurst]);

    // ── THE HALL ────────────────────────────────────────────────────────────────────────────────────────
    // One request buys the card, deals it and scores it. What happens next on screen is a ceremony over a
    // result already banked — the balls come out one at a time and the card daubs itself as they land,
    // because the whole appeal of bingo is watching your own card fill in, and a grid that arrives already
    // completed is a receipt.
    //
    // Nothing here can change the outcome, which is why the reveal is allowed to be pure presentation.
    const BALL_MS = 85;
    useEffect(() => {
        const id = setInterval(async () => {
            const r = await fetch("/api/marketplace/casino").then((x2) => x2.json()).catch(() => null);
            // The rounds ride along on the poll that was already running for the other people in the room.
            // A shared game needs no channel of its own: the draw is something the floor learns
            // the next time it looks, which is at most six seconds and usually less.
            // The poll is still here for the OTHER PEOPLE in the room — that is real shared state and it is
            // the only thing on this floor that ever was. What rode along on it was the shared-round
            // settlement for keno, and there are no shared rounds any more: a ticket resolves in the answer
            // to the request that bought it, so there is nothing that can settle while you were away.
            if (r?.open) {
                // `vip` rides along so the silhouettes behind the rope move as people come and go — and so
                // the door notices the moment somebody's standing changes. Forgetting it here is half of why
                // the rope told the owner "members only": the API had the answer and nothing merged it.
                setSt((p) => ({
                    ...p, others: r.others, gold: r.gold, chips: r.chips ?? p?.chips, vip: r.vip ?? p?.vip,
                }));
                if (r.pot) setPot(r.pot.amount);
            }
        }, 6000);
        return () => clearInterval(id);
    }, []);

    const buyCard = useCallback(async (force) => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setPrize(null); setNote(null); setWonPet(null);
        setCard(null); setCalled(0); setBurst(null); setDragon(null); setDragonLit(0);
        Cas.chips();
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "bingo", bet, force: force || undefined }),
        }).then((x2) => x2.json()).catch(() => null);
        if (!r?.ok) {
            setBusy(false);
            setErr(r?.error === "no_gold" ? "Not enough gold for that card." : "That didn't go through.");
            return;
        }
        setCard(r);
        // Gold went out, chips came back. Both are in the purse at the top of the screen, and showing only
        // one of them is how a currency conversion becomes invisible to the person it happened to.
        setSt((p) => ({ ...p, gold: r.gold, chips: r.chips }));

        // Ball by ball. The last five are slowed down: by then you can see what you need, and the pause is
        // where the game actually lives.
        (r.drawn || []).forEach((_, i) => {
            const late = i >= (r.drawn.length - 5);
            const at = i * BALL_MS + (late ? (i - (r.drawn.length - 5)) * 220 : 0);
            timers.current.push(setTimeout(() => {
                setCalled(i + 1);
                // Each ball is pitched off its own NUMBER, so a draw is a different little melody every
                // round rather than the same pop forty times. The last five are already slowed down; they
                // also land harder, because by then you can see what you need.
                Cas.ball(r.drawn[i] || i);
                if ((r.card || []).flat?.().includes?.(r.drawn[i])) Cas.daub();
                if (late) Haptic.hit(0.2);
            }, at));
        });
        const balls = (r.drawn?.length || 0) * BALL_MS + 5 * 220 + 260;

        // ── AND THEN THE DRAGON ──────────────────────────────────────────────────────────────────────
        // AFTER the draw, never during it, and the ordering is the whole feature. By the last ball the card
        // has settled and you can see exactly what you are one square short of — which is the only moment at
        // which a thing that hands you free squares means anything. A dragon that flew over a blank card
        // would be a bonus arriving before there was anything for it to be a bonus TO.
        //
        // Three beats: it flies (the travel is the anticipation), the squares catch one after another along
        // its path (so the fire spreads rather than appearing), and only then do the lines resolve.
        const flight = r.dragon;
        const DRAGON_FLY = 1250;      // the pass itself
        const BURN_STEP = 190;        // one square catching
        const burnCount = flight?.burnt?.length || 0;
        const dragonMs = flight ? DRAGON_FLY + burnCount * BURN_STEP + 420 : 0;
        if (flight) {
            timers.current.push(setTimeout(() => {
                setDragon(flight);
                Cas.jackpot(); Haptic.crit();
            }, balls));
            // Each square catches on its own beat, with its own daub, so the count is something you hear as
            // well as see. A pass that burns nothing still flies — and it still says so, which is the
            // honest version: the dragon came and the squares were already yours.
            flight.burnt.forEach((_, k) => timers.current.push(setTimeout(() => {
                setDragonLit(k + 1);
                Cas.daub(); Haptic.hit(0.3);
            }, balls + DRAGON_FLY + k * BURN_STEP)));
        }

        const total = balls + dragonMs;
        timers.current.push(setTimeout(() => {
            setBusy(false);
            absorb(r);
            if (r.won > 0) {
                const big = r.mult >= 8;
                setFlash(big ? "big" : "win");
                // One chime per line, spaced out. A card can complete six lines in a round and six
                // fanfares would be absurd — the fanfare is reserved for the ones that actually pay big.
                (r.lines || []).forEach((_, k) => timers.current.push(setTimeout(() => Cas.line(k + 1), k * 160)));
                if (big) { timers.current.push(setTimeout(() => Cas.jackpot(), 220)); Haptic.crit(); throwBurst("hoard", ACCENT.bingo); }
                else { timers.current.push(setTimeout(() => Cas.coins(0.35), 220)); Haptic.hit(0.6); throwBurst("coin", ACCENT.bingo); }
                timers.current.push(setTimeout(() => setFlash(null), big ? 2200 : 1200));
            } else Cas.lose();
        }, total));
    }, [bet, busy, absorb, throwBurst]);

    // ── EVERY CARD ON THE FELT, IN DEALING ORDER ─────────────────────────────────────────────────────────
    // One flat index across the dealer and every hand, so a card knows how far behind the one before it it
    // should land without any part of the layout having to count for itself. A split just adds more cards to
    // the end of the same list.
    const bjView = useMemo(() => {
        if (!hand) return null;
        const dealer = hand.dealer || [];
        const hands = hand.hands || [];
        let i = 0;
        const dealerAt = dealer.map(() => i++);
        const holeAt = hand.dealerHidden ? i++ : -1;
        const handsAt = hands.map((h) => (h.cards || []).map(() => i++));
        return { total: i, dealerAt, holeAt, handsAt };
    }, [hand]);

    // Three of whatever this cabinet actually rolls, taken from the middle of its own symbol list so the
    // idle machine is neither promising a jackpot nor showing three blanks.
    const idleReels = useMemo(() => {
        const syms = (st?.slots?.[at?.id]?.symbols || []).map((x) => x.id);
        if (syms.length < 3) return ["moon", "bone", "doubloon"];
        const mid = Math.floor(syms.length / 2);
        return [syms[mid], syms[syms.length - 1], syms[Math.max(0, mid - 1)]];
    }, [st, at]);

    // ── ONE SOUND PER CARD, ON THE SAME CLOCK THE CSS USES ───────────────────────────────────────────────
    // The stagger lives in CSS (a per-card animation-delay) and the sounds live here, both driven off the
    // same DEAL_MS, because a card that lands silently and a sound with no card are the two ways this goes
    // wrong. Anything already on the felt is skipped: React keys each card by its own value, so those stay
    // mounted and never re-animate, and re-playing their sounds would deal the whole table again every time
    // you hit.
    useEffect(() => {
        if (at?.id !== "blackjack") return undefined;
        if (!hand || !bjView) { bjSeen.current = 0; bjHidden.current = false; setBjFrom(0); setBjFlip(false); return undefined; }
        const total = bjView.total;
        // A new hand has FEWER cards than the one it replaced (or the same), and everything on it is new.
        // A hit only ever grows the count, and only the tail of it is new.
        const fresh = total <= bjSeen.current;
        const from = fresh ? 0 : bjSeen.current;
        setBjFrom(from);
        // ── THE TABLE DOES NOT SAY THE TOTAL BEFORE THE CARDS LAND ───────────────────────────────────
        // It printed "YOU · 16 SOFT" while the second card was still in the air, which is the same flaw the
        // slot had when it announced "Nothing. Again?" with two reels still turning: the answer arrives
        // before the thing that produces it, and the deal becomes decoration over a number you already read.
        // The count is NOT recomputed here from the visible cards — that would be a second implementation of
        // hand valuation living on the screen, which is exactly the trap the bingo card avoids. It simply
        // waits.
        if (total > from) setBjSettled(false);
        timers.current.push(setTimeout(() => setBjSettled(true), Math.max(0, total - from) * DEAL_MS + 240));
        for (let i = from; i < total; i += 1) {
            timers.current.push(setTimeout(() => { Cas.card(); Haptic.hit(0.12); }, (i - from) * DEAL_MS));
        }
        // ── AND THE TURN ─────────────────────────────────────────────────────────────────────────────
        // The hole card going face up is the table answering, and it is the whole reason anybody is still
        // looking at the screen. It gets its own sound, its own animation and a heavier tap than a deal.
        const turned = bjHidden.current && !hand.dealerHidden;
        bjHidden.current = Boolean(hand.dealerHidden);
        if (turned) {
            setBjFlip(true);
            timers.current.push(setTimeout(() => Cas.turn(), 40));
            timers.current.push(setTimeout(() => Haptic.hit(0.45), 240));
            timers.current.push(setTimeout(() => setBjFlip(false), 700));
        }
        bjSeen.current = total;
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hand, bjView, at?.id]);

    // ── DOUBLE OR NOTHING ────────────────────────────────────────────────────────────────────────────────
    // The amount is not sent — the server gambles what its own meter says the last paid pull won. All this
    // does is say yes.
    const gamble = useCallback(async () => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setBurst(null);
        // A coin genuinely spinning in the air. The wobble is a detune that widens as it slows, which is
        // the one sound in the building that is a physical object rather than a machine.
        Cas.flip(700);
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "gamble", machine: at?.id }),
        }).then((x2) => x2.json()).catch(() => null);
        setBusy(false);
        if (!r?.ok) { setErr("That didn't go through."); return; }
        setSt((p) => ({ ...p, gold: r.gold }));
        setMeters((p) => ({ ...p, [r.machine]: { ...(p[r.machine] || {}), pending: 0 } }));
        setFx({ gambled: { won: r.won, amount: r.staked, payout: r.payout } });
        if (r.won) {
            setFlash("win"); Cas.coins(0.6); Haptic.crit(); throwBurst("coin", ACCENT[at?.id] || "#ffd75e");
            timers.current.push(setTimeout(() => setFlash(null), 1400));
        } else { Cas.bust(); Haptic.hit(0.5); }
    }, [busy, at]);

    // Standing at the rope, on the same rule as standing at a cabinet.
    const vipNear = Math.abs(x - VIP_X) <= REACH;

    // ── GOING IN ─────────────────────────────────────────────────────────────
    // The SERVER decides, every time, even though the button only renders for somebody the state already said
    // is allowed. That is not belt and braces for its own sake: the standing is derived from lifetime spend
    // and can change between the page loading and the rope being touched, and the room on the other side is a
    // private chat. The refusal is a real answer rather than a disabled button, so somebody who has fallen
    // below the line is told what happened instead of finding a control that does nothing.
    const enterVip = useCallback(async () => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null);
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "vip_enter" }),
        }).then((x2) => x2.json()).catch(() => null);
        setBusy(false);
        if (!r?.ok) {
            setErr(r?.error === "not_vip" ? "The rope stays where it is." : "That didn't go through.");
            return;
        }
        Cas.jackpot(); Haptic.crit();
        setVip(r);
    }, [busy]);

    const toggleNumber = useCallback((n) => {
        setTicket((p) => (p.includes(n) ? p.filter((v) => v !== n) : p.length >= 5 ? p : [...p, n]));
    }, []);

    // Every timer this component starts is cleared on unmount — walking out mid-spin must not leave a
    // callback firing into a component that is gone.
    useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

    // ── TWO ROOMS, ONE SCREEN ──────────────────────────────────────────────────────────
    // Returning early rather than rendering the lounge inside the floor. They are two rooms and you are only
    // ever standing in one — leaving the floor mounted underneath would keep its poll running, its music
    // playing and its presence writing the casino zone, which would put you in two rooms at once as far as
    // everybody else is concerned.
    if (vip) {
        return (
            <VipLounge state={vip} chips={st?.chips} me={st?.me}
                onChips={(n) => setSt((p) => ({ ...p, chips: n }))}
                onClose={() => setVip(null)} />
        );
    }

    return (
        <section className="cas">
            <header className="cas-top">
                <a className="cas-out" href="/marketplace/town">← Town</a>
                <b className="cas-name">The Casino</b>
                <span className="cas-purse">{money(st?.gold)}<i>gold</i></span>
            </header>

            {/* ── WHO IS WORKING THE FLOOR FOR YOU ────────────────────────────────────────────────────────
                The five casino pets do nothing you can see at the moment they fire — a stake quietly comes
                back, a prize rolls off a better shelf. A perk you cannot point at is a perk nobody believes
                they have, so the ones you own sit at the top of the room by name. Nothing here when you own
                none: an empty rail advertising five pets you have never seen is a nag, not a feature. */}
            {(st?.perks?.pets || []).length ? (
                <div className="cas-pets">
                    {st.perks.pets.map((p) => <span key={p.id} className="cas-pet" title={p.perk || ""}>{p.name}</span>)}
                </div>
            ) : null}

            {/* ── THE ROOM ────────────────────────────────────────────────────────────────────────────────
                Positioned in percentages so the floor is the same room on any screen: a machine at 50 is in
                the middle of a phone and the middle of a desktop, rather than drifting with the viewport. */}
            {/* This wrapper exists only so the vignette has something to hang on that does NOT scroll: put
                it on `.cas-room` and it joins the scrollable area and slides off to the left. It was called
                `.cas-hall` for about a day, which is the bingo hall's class — two unrelated things answering
                to one selector, waiting to collide the next time either got a rule. */}
            <div className="cas-roomwrap">
            <div className="cas-room" ref={roomRef}
                onPointerDown={panDown} onPointerMove={panMove}
                onPointerUp={panUp} onPointerCancel={panUp}>
              {/* ── TAP THE FLOOR AND WALK THERE ────────────────────────────────────────────────
                  The most direct way to move in a room you are looking at. It sits UNDER the cabinets in
                  the stacking order, so tapping a machine still opens the machine — this only ever catches
                  the taps that landed on nothing. */}
              {/* ── TAP THE FLOOR AND WALK THERE ────────────────────────────────────────────────
                  The floor is the control: tap it and you walk there, and walking re-centres the camera on
                  you. It sits under the cabinets in the stacking order, so tapping a machine still opens
                  the machine; this only catches taps that landed on nothing.

                  There used to be an "edge tap travels a screen" branch here, because with the camera
                  locked to the hero most of the floor was never on screen to be tapped. You can drag the
                  floor now, so it was solving a problem that no longer exists — and it meant a mis-tap near
                  the edge flung you across the room for no reason. Gone.

                  A DRAG IS NOT A TAP. A swipe that finishes over the floor would otherwise also walk you
                  there, which makes free look feel like it fights you. See draggedJustNow. */}
              <div className="cas-world" onClick={(e) => {
                  if (draggedJustNow()) return;
                  if (e.target !== e.currentTarget && !e.target.classList?.contains("cas-floor")) return;
                  const b = e.currentTarget.getBoundingClientRect();
                  walkTo(((e.clientX - b.left) / b.width) * 100);
              }}>
                <div className="cas-floor" aria-hidden="true" />

                {/* The lights, and the stuff you cannot play. Both inert — see DECOR and LAMPS. */}
                {LAMPS.map((lx) => (
                    <div key={`lamp${lx}`} className="cas-lamp" style={{ left: `${lx}%` }} aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/casino/decor_lamp.webp" alt="" draggable="false" />
                    </div>
                ))}
                {DECOR.map((d, i) => (
                    <div key={`d${i}`} className={`cas-decor${d.back ? " is-back" : ""}`}
                        style={{ left: `${d.x}%` }} aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/casino/decor_${d.id}.webp`} alt="" draggable="false" />
                    </div>
                ))}
                {/* ── THE ROPE, AND THE PEOPLE BEHIND IT ──────────────────────────────────
                    Luke, on the first cut: "the VIP room should not be janky — you made it look like double
                    arches. We already have arches in the background, why can't you just put all the VIPs
                    walking around in there? And the VIPs should be the actual hero sprites, not just some
                    random black looking things. They need to be masked properly so you can see them back
                    there, kind of darkened out so it looks like they're further away and back in the room,
                    but they don't clip through the walls — we only want to see them in the archway."

                    Every word of that is a correction to something I did wrong, and they are all one mistake:
                    I DREW A DOOR INSTEAD OF USING THE ONE THAT WAS THERE. The casino wall is a repeating
                    frieze of gold arches with dark recesses behind red drapes — it has been since the floor
                    was painted — and I generated a second gold arch and stood it in front of one. Two arches,
                    one inside the other, which is exactly as bad as it sounds.

                    So there is no door sprite any more. The VIP entrance IS one of the wall's own arches:
                    the alcove below is positioned onto a real one, the people are drawn inside its recess,
                    and the only things added are the rope across the front and the sign above.

                    HOW THE ARCH IS FOUND is the part that had to be made honest. The wall is `repeat-x` at
                    `auto 122%`, so a tile is exactly `3 x 1.22 x --room` wide (it is a 3:1 image) and its
                    arches sit at fixed fractions of it. That is deterministic ONLY if the world is also
                    sized off `--room`, which is why the media queries on .cas-world are gone — see the note
                    there. With both tied to one variable, arch N lands at the same place at every size.

                    THE MASK IS THE RECESS. `overflow: hidden` on an arch-shaped box means a sprite can walk
                    behind the pillar and be cut off by it, which is the "don't clip through the walls" half
                    of the note. And they are darkened and shrunk rather than drawn plain, because the point
                    is that they are further away, in another room, behind a rope. */}
                <button type="button"
                    className={`cas-vipdoor${vipNear ? " is-near" : ""}${st?.vip?.allowed ? " is-open" : ""}`}
                    aria-label={st?.vip?.allowed ? "The VIP lounge" : "The VIP lounge \u2014 members only"}
                    onClick={() => {
                        if (draggedJustNow()) return;
                        // Walk over first, go in second \u2014 the same two-step every cabinet on this floor
                        // uses, so the rope is not a special case you have to learn.
                        if (!vipNear) { setX(VIP_X); return; }
                        if (st?.vip?.allowed) { enterVip(); return; }
                        setErr("Members only. The rope stays where it is.");
                    }}>
                    {/* Inside the arch. The people are real \u2014 their own avatars, at their own positions in
                        the lounge \u2014 pushed back with a dark wash and a little scale so they read as being
                        in a room beyond this one. */}
                    <span className="cas-vipdoor-in" aria-hidden="true">
                        {(st?.vip?.shadows || []).slice(0, 3).map((sh) => (
                            <span key={sh.i} className="cas-vipwho"
                                style={{ left: `${18 + sh.i * 26 + (sh.x % 10)}%`, "--i": sh.i }}>
                                {sh.sprite
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={sh.sprite} alt="" draggable="false" />
                                    : <i />}
                            </span>
                        ))}
                    </span>
                    {/* The rope across the front, and the sign above. The only two things this adds to the
                        wall \u2014 the arch was already there. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cas-vipsign" src="/images/casino/vip-sign.webp" alt="" draggable="false" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="cas-viprope" src="/images/casino/decor_rope.webp" alt="" draggable="false" />
                    <b>{vipNear ? (st?.vip?.allowed ? "Go in" : "Members only") : "The Lounge"}</b>
                </button>

                {MACHINES.map((m) => (
                    <button key={m.id} type="button"
                        className={`cas-mach${m.live ? " is-live" : ""}${at?.id === m.id ? " is-near" : ""}`}
                        style={{ left: `${m.x}%` }}
                        aria-label={`${m.label} — ${m.live ? m.kind : "not built yet"}`}
                        onClick={() => {
                            if (draggedJustNow()) return;
                            setX(m.x);
                            if (!m.live) return;
                            // ── SITTING DOWN IS AN EVENT ───────────────────────────────────────
                            // check:feel, pressing the floor's main action: "never buzzed the phone." It was
                            // right — the most consequential tap on the floor, the one that takes over the
                            // whole screen, did it in silence and without the phone moving. Every other
                            // machine in this room answers a press; the room itself did not.
                            unlock();
                            Cas.chips();
                            Haptic.hit(0.4);
                            setSeated(true);
                        }}>
                        {/* The cabinet, drawn rather than approximated. It was a gradient and a border for
                            as long as the floor plan was still being argued about, which was the right order
                            to do it in — art costs money to get wrong, and the plan changed three times. */}
                        <span className="cas-mach-body">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/images/casino/${m.id}.webp`} alt="" draggable="false" />
                        </span>
                        <b>{m.label}</b>
                        {/* Only when there is something to warn about. On a working machine this repeated
                            what the card directly underneath already says, and it was the line holding
                            every cabinet up off the carpet — the caption hangs below the feet, so the feet
                            can never come lower than the caption is tall. */}
                        {!m.live ? <em>soon</em> : null}
                    </button>
                ))}

                {/* Everybody else, really here. Drawn behind you so your own hero is never hidden by a crowd. */}
                {(st?.others || []).map((o) => (
                    <div key={o.id} className="cas-other" style={{ left: `${o.x}%` }} title={o.name}>
                        {o.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.sprite} alt="" draggable="false" style={{ transform: `scaleX(${o.facing})` }} />
                        ) : <span className="cas-blank" />}
                        <b>{o.name}</b>
                    </div>
                ))}

                {/* YOU. Everybody else in the room has been drawn with their own avatar since the floor
                    opened; your own hero was a plain circle, which made the one person you are actually
                    looking at the only one who was not there. */}
                <div className={`cas-you${goal != null ? " is-walking" : ""}`}
                    style={{ left: `${x}%`, "--face": facing }}>
                    {/* WHICH WAY HE FACES LIVES ON THE WRAPPER, not on the sprite. The walk animation sets
                        `transform` on the sprite, and an animation wins against an inline style — so with the
                        flip on the sprite he snapped to facing right the instant he started moving, which is
                        the only time it matters. */}
                    {st?.me?.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={st.me.sprite} alt="" draggable="false" />
                    ) : <span className="cas-blank is-you" />}
                </div>
              </div>
            </div>
            <div className="cas-vignette" aria-hidden="true" />
            {/* The floor has a tune: procedural, like every other scene in the Den. It mounts INSIDE the
                hall because its toggle positions itself absolutely — hung off `.cas`, which is not a
                positioned box, the button would have escaped to the corner of the page. In the corner of
                the room is where it belongs anyway. Silenced while you are sat at a machine: the machine
                has its own sounds and those are the point. */}
            {/* -- THE ROOM YOU ARE IN, NOT THE ROOM YOU CAME FROM ----------------------------------
                This was `{!seated ? <SceneMusic vibe="casino" /> : null}`, on the reasoning that a
                machine has its own sounds and those are the point. The sounds were the point; the
                SILENCE was not. Sitting at a cabinet turned the music off and left you with a room tone
                and a button, which is the opposite way round from how a floor works -- the floor is the
                corridor and the cabinet is the room you went there to be in.

                One mount, kept alive across sitting down and standing up, with the vibe following the
                machine. It stays mounted on purpose: SceneMusic swaps its loop when `vibe` changes
                (fading out and back in), whereas unmounting and remounting would tear down the whole
                AudioContext and re-ask for the autoplay gesture every single time you sat down. */}
            {/* -- AND A MUTE YOU CAN ACTUALLY REACH ------------------------------------------------
                SceneMusic positions its own toggle absolutely against the nearest positioned ancestor,
                at z-index 9. That was fine while the music only played on the floor. It is not fine now
                the music follows you into a cabinet: `.cas-stage` is `position: fixed` at z-index 60, so
                the button was buried under the machine the moment you sat down — music playing, with no
                way to turn it off. A mute control that disappears exactly when the sound starts is worse
                than no music.

                A fixed wrapper above the stage, with the toggle `inline` inside it so SceneMusic does not
                also try to place itself. It only MOVES, it never remounts: remounting would tear down the
                AudioContext and re-ask for the autoplay gesture every time you sat down or stood up.
                Seated it drops below the header (64px of it: 40px button, 12px padding either side) so it
                does not sit on the gold; on the floor it is exactly where it has always been. */}
            {/* ── MOUNTED ALWAYS, SHOWN ONLY ON THE FLOOR ─────────────────────────────────────────────
                SceneMusic stays mounted at a machine so the cabinet's tune keeps playing — unmounting it
                would tear down its AudioContext and re-ask for the autoplay gesture every time you sat
                down. It is CONTROLLED here, so it draws no button; the switch below is the only one.

                And the switch itself goes away once you are inside a machine. A cabinet is a full-screen
                thing you are playing, and a floating control over it is clutter in the one place there is
                least room for it — you are two taps from the floor if you want it. */}
            {/* THE COUNTER IS NOT A CABINET, so it keeps the floor's tune rather than asking for one of
                its own — and asking for one it does not have is how it ended up playing the TOWN folk loop,
                which check:casino caught before anybody heard it. */}
            <SceneMusic vibe={seated && at && at.id !== "store" ? at.id : "casino"} place="inline" muted={soundOff} />
            {!seated ? (
                <div className="cas-audiobar">
                    <SoundToggle off={soundOff} onToggle={toggleSound} />
                </div>
            ) : null}
            </div>

            {/* ── WHAT YOU ARE STANDING AT ────────────────────────────────────────────────────────────
                The whole of the movement UI used to live here: two arrows, then an arrows-plus-hint
                arrangement, then a hint on its own. All of it is gone. Tapping the floor is how you move
                and dragging it is how you look around — both are what a person tries first on a scene
                like this, and a room that has to explain itself in a pill is a room that has not earned
                the gesture. What is left is the one thing this row was ever for: a way into the machine
                you are standing in front of. */}
            {/* ── AND THE BUTTON IS GONE TOO ──────────────────────────────────────────────────────
                Luke: "you can remove the play button."

                It was the last survivor of the movement rail, and it had already been made redundant by the
                thing that replaced the rail: TAPPING A CABINET WALKS YOU TO IT AND SITS YOU DOWN (see the
                machine's own onClick above). So the floor had two ways in — the object itself, and a bar
                underneath restating the object's name — and the bar was costing about sixty pixels of a
                phone screen on a page whose whole problem is that the room wants to be bigger.

                Nothing renders here now. The room got the height. */}

            {/* ── THE MACHINE YOU ARE SAT AT ──────────────────────────────────────────────────────────────
                Luke: "we dont need to show the info under the button."

                Walking up to a cabinet used to print a card underneath the room — its name, the Pot, the
                odds and every bonus it has. That card existed because moving play into the modal had left
                the floor with nothing under it, and it turned out to be an answer to a question nobody was
                asking: you are looking at the machine, the button says which one it is, and everything the
                card listed is on the machine's own screen the moment you sit down. What it actually did was
                push the floor's bounties below the fold.

                So there is no panel any more, only the stage. Nothing renders here until you sit.

                ── AND THE ROOM TAKES THE MACHINE'S OWN PAINTING ────────────────────────────────────────
                Luke: "the custom background for the Menagerie can be used instead of all the dead black
                space around the frames." The black is HERE, not on the cabinet — the stage is a flat
                #0d0913 with a faint accent wash, and the cabinet only ever showed its scene as a 50px
                strip across the top. Every machine on this floor already has a painted scene; sitting at
                one now puts it behind the whole screen. (The comment lives up here because a JSX comment
                in an expression position is a parse error, which this file has now made twice.) */}
            {seated && at ? (
                <div className={`cas-stage${at.live ? "" : " is-dark"}`}
                    style={{ "--acc": ACCENT[at.id] || "#ffd75e",
                        "--mast": `url(/images/casino/mast/${at.id}.webp)`,
                        "--room": `url(/images/casino/room/${at.id}.webp)` }}
                    role="dialog" aria-modal="true" aria-label={at.label}>
                    <div className="cas-panel-head">
                        {/* A WORD, NOT AN ARROW. An arrow in the corner of a full-screen game is browser
                            furniture — it reads as "go back a page", which on a machine you have money in is
                            the one thing you want to be sure about before you tap it. */}
                        <button type="button" className="cas-leave" onClick={() => setSeated(false)}
                            aria-label="Leave this machine">Leave</button>
                        <b>{st?.slots?.[at.id]?.label || at.label}</b>
                        {/* ── BOTH PURSES, WITH THEIR OWN COINS ────────────────────────────────────
                            Luke: "since we already showed coins at the top, just show the coin amount with
                            the coin sprite and the chip amount with the chip sprite... that way we can free
                            up that entire row." The machine below had a whole strip spending 86px on two
                            numbers already half-shown up here. Two 15px sprites say which is which without
                            the words, and the strip is gone. */}
                        <span className="cas-purse-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/casino/hud-coin.webp" alt="" width={15} height={15} />
                            {money(st?.gold)}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/casino/hud-chip.webp" alt="" width={15} height={15} />
                            <b className="cas-purse-chips">{money(st?.chips)}</b>
                        </span>
                    </div>

                    {/* ── STANDING AT A MACHINE IS NOT PLAYING IT ──────────────────────────────────
                        Luke: "id rather we only show the interaction with the games in a full screen modal."

                        Every play surface below — the reels, the ticket, the card, the table, the
                        stake row and the button — is gated on `seated`. Walking up to a cabinet gives you the
                        CARD: what it is, what it pays, how often, and what its features do. Playing it is a
                        thing you sit down for.

                        The two used to be the same markup in two wrappers, which meant a phone rendered a
                        full working slot machine inline, under a room, above a bounty list — and then the
                        same one again, larger, the moment you pressed Play. One of them was always the wrong
                        size, and neither was the one you were looking at.

                        A dead cabinet keeps its one line and gets no card, because there is nothing to
                        describe yet.

                        ── WHICH MACHINE IS THIS ───────────────────────────────────────────────────────
                        Three slot cabinets are only worth the floor space if the difference between them
                        is legible BEFORE you spend anything. The two numbers that describe a slot machine
                        are how often it pays and how much it pays at the top — so both are printed, and
                        the return is printed beside them because a floor that hides its own odds is a
                        floor that has something to hide. All three return within a point of each other,
                        which is exactly the thing worth being able to check. */}
                    {/* ── THE POT IS NOT ON THIS SCREEN ANY MORE ──────────────────────────────────────
                        It sat above the reels, a large number and a caption, and it was the first thing on a
                        machine you had just sat down at — before the reels, before the bet, before anything
                        you can act on. Luke: "you can remove the pot." A jackpot you cannot see is not the
                        thing that makes somebody pull the handle; the reels are.

                        The MECHANIC is untouched — every three-reel bet still feeds it and any pull can still
                        take it, and taking it still announces itself over the reels (see cas-fx below). Only
                        the standing display is gone. */}

                    {/* ── WHAT THIS CABINET REMEMBERS ─────────────────────────────────────────────────
                        The tray, the multiplier and any banked free pulls. Shown ALWAYS rather than only
                        when they are non-zero: a meter you only see once it has something in it is a meter
                        nobody knows they are filling. */}
                    {/* NOT ON A FIVE-REEL CABINET, which has none of these. It was rendering anyway, as an
                        empty element of zero height — invisible, but still a flex item, so it took HALF the
                        auto margin meant to centre the machine and left the whole cabinet sitting low with a
                        screen of void above it. An element that draws nothing and still occupies layout is
                        the hardest kind to find by looking. */}
                    {SLOTS.has(at.id) && !SLOTS5[at.id] && meters[at.id] ? (
                        <div className="cas-meters">
                            {(st?.slots?.[at.id]?.bonuses || []).some((b) => b.id === "tray") ? (
                                <span className={`cas-meter${meters[at.id].tray > 0 ? " is-full" : ""}`}>
                                    <i>{(st?.slots?.[at.id]?.bonuses || []).find((b) => b.id === "tray")?.label || "The Tray"}</i>
                                    <b>{(meters[at.id].tray || 0).toFixed(2)}x</b>
                                </span>
                            ) : null}
                            {(st?.slots?.[at.id]?.bonuses || []).some((b) => b.id === "moonstruck") ? (
                                <span className={`cas-meter${(meters[at.id].mult || 1) > 1 ? " is-full" : ""}`}>
                                    {/* The bonus's own name, not a hard-coded one — the machine it lives on
                                        is themed now, and a fish cabinet reading "Moonstruck" is a label
                                        left behind by a rename. */}
                                    <i>{(st?.slots?.[at.id]?.bonuses || []).find((b) => b.id === "moonstruck")?.label || "Multiplier"}</i>
                                    <b>{(meters[at.id].mult || 1).toFixed(2)}x</b>
                                </span>
                            ) : null}
                            {meters[at.id].freePulls > 0 ? (
                                <span className="cas-meter is-free">
                                    <i>Free pulls</i><b>{meters[at.id].freePulls}{meters[at.id].freeMult > 1 ? ` · ${meters[at.id].freeMult}x` : ""}</b>
                                </span>
                            ) : null}
                        </div>
                    ) : null}

                    {/* Luke: "we dont have to show the odds on each." The hit rate, the top multiple and the
                        return used to print under the blurb. It was there because a floor that hides its own
                        odds is a floor with something to hide — but three percentages above the reels is a
                        spec sheet, and the machine is right there to be played. The numbers have not gone
                        anywhere: check:casino prints every one of them and refuses the build if any cabinet
                        drifts. */}
                    {/* The cabinet's blurb used to print here, under the Pot. Luke: "yiu can remove the
                        description below the pot as well." Both were text above the game explaining the
                        game, on a screen whose entire job is the game — and the machine's name is already
                        in the header and on its own marquee. */}

                    {/* Each machine draws its own game. The slot's ceremony is three landings; the ticket
                        resolves in one, so it gets a result and a celebration and no theatre. */}
                    {at.live && at.id === "keno" ? (
                        <div className="cas-keno">
                            {/* ── THE BOARD, WHICH IS THE WHOLE GAME ───────────────────
                                Luke: "we need a huge huge huge polish pass on keno — go look up how keno
                                works and actually make it look amazing."

                                What was here was forty white form buttons in a rectangle, a countdown rail
                                and a line of text. That is a number picker, not a keno lounge. What a real
                                board actually has, and what this now has:

                                  A LIT BOARD. Keno boards are backlit lamps in a dark cabinet, not paper.
                                  Every number is a lamp: off, yours, drawn, or yours-and-drawn — and the
                                  last of those is the only one that glows, because that is the one you are
                                  hunting and everything else is context.

                                  THE BALLS COMING OUT. Ten of them, one at a time, in the order drawn, over
                                  the board rather than beside it. The draw is the show; it used to be a
                                  sentence printed after the fact.

                                  THE PAYTABLE, ON THE MACHINE. Keno is unreadable without it — nobody has
                                  an instinct for what four-of-five is worth — and it lights the rung you
                                  are on as the balls land, so the table teaches itself while you watch.

                                  A QUICK PICK. Every keno lounge on earth has one, and picking five numbers
                                  by hand on a phone before every single ticket is the friction that stops
                                  people playing a second one. */}
                            <div className="cas-keno-head">
                                <span className="cas-keno-title">Pick five of forty. Ten come out.</span>
                                <span className="cas-keno-tools">
                                    <button type="button" className="cas-keno-tool" disabled={busy}
                                        onClick={() => { unlock(); Cas.chips(); setTicket(quickPick()); }}>Quick pick</button>
                                    <button type="button" className="cas-keno-tool" disabled={busy || !ticket.length}
                                        onClick={() => { unlock(); setTicket([]); }}>Clear</button>
                                </span>
                            </div>

                            {/* ── THE HOPPER ────────────────────────────────────
                                Ten slots, always drawn, filling as the balls come out — so the row does not
                                reflow ten times while you are trying to read it, and so an empty hopper says
                                "ten of these are coming" before the first one lands. A ball that is one of
                                yours arrives gold and larger; that is the entire feedback loop of keno. */}
                            <div className="cas-keno-hopper" aria-live="polite">
                                {Array.from({ length: st?.keno?.drawn || 10 }, (_, i) => {
                                    const n = keno?.drawn?.[i];
                                    const out = keno ? i < kenoOut : false;
                                    const mine = out && ticket.includes(n);
                                    return (
                                        <span key={i}
                                            className={`cas-kball${out ? " is-out" : ""}${mine ? " is-mine" : ""}${out && i === kenoOut - 1 ? " is-new" : ""}`}>
                                            {out ? n : ""}
                                        </span>
                                    );
                                })}
                            </div>

                            <div className="cas-grid">
                                {Array.from({ length: st?.keno?.pool || 40 }, (_, i) => i + 1).map((n) => {
                                    const mine = ticket.includes(n);
                                    {/* Only the balls that have actually come OUT are on the board — the
                                        draw is already banked, and lighting all ten at once would hand over
                                        the answer before the hopper has shown it. */}
                                    const drew = Boolean(keno && keno.drawn.slice(0, kenoOut).includes(n));
                                    return (
                                        <button key={n} type="button" disabled={busy}
                                            className={`cas-num${mine ? " is-mine" : ""}${drew ? " is-drawn" : ""}${mine && drew ? " is-hit" : ""}`}
                                            onClick={() => toggleNumber(n)}>{n}</button>
                                    );
                                })}
                            </div>

                            {/* ── WHAT IT PAYS, AND WHERE YOU ARE ON IT ────────────────────
                                The rung you are standing on lights as the balls land, so the ladder is being
                                taught while it is being climbed rather than printed somewhere to be studied.
                                Read off the server's own table — a hand-typed copy here is a paytable that
                                lies the day somebody retunes the real one. */}
                            <div className="cas-keno-pays">
                                {[2, 3, 4, 5].map((k) => {
                                    const pays = st?.keno?.pays?.[k];
                                    if (!pays) return null;
                                    const here = Boolean(keno && !busy && keno.hits.length === k);
                                    return (
                                        <span key={k} className={`cas-keno-rung${here ? " is-here" : ""}`}>
                                            <i>{k} of 5</i><b>{pays}x</b>
                                        </span>
                                    );
                                })}
                            </div>

                            <p className={`cas-result${keno?.won > 0 ? " is-win" : ""}`}>
                                {keno && !busy
                                    ? `${keno.hits.length} of 5 — ${keno.won > 0 ? `${money(keno.won)} chips` : "nothing"}`
                                    : keno ? `${kenoOut} of ${keno.drawn.length} drawn…`
                                        : `${ticket.length} of 5 picked`}
                            </p>
                        </div>
                    ) : null}

                    {/* ── THE CABINET THAT HAS BEEN REBUILT ───────────────────────────────────────────
                        A machine with an entry in SLOTS5 is a five-reel, twenty-line machine and renders
                        the new screen; everything else is still the three-reel cabinet below. Keyed off the
                        TABLE rather than a flag, so a cabinet becomes new the moment its maths does and
                        there is no state in which the screen and the paytable disagree about which game
                        this is. */}
                    {at.live && at.id === "store" ? (
                        <ChipStore chips={st?.chips} onBuy={buyChip} onRefresh={shelf} />
                    ) : at.live && SLOTS5[at.id] ? (
                        <Slot5
                            machineId={at.id}
                            lines={SLOT5_LINES}
                            onSpin={spin5}
                            gold={st?.gold}
                            chips={st?.chips}
                            bet={bet}
                            onBet={setBet}
                            rate={st?.chipRate}
                            owner={st?.owner}
                            art={st?.art}
                            busy={busy} />
                    ) : at.live && SLOTS.has(at.id) ? (
                        <>
                            {/* ── THE MACHINE, NOT THREE BOXES ────────────────────────────────────
                                Luke: "make it really look like a slot machine screen not just 3 boxes."
                                It was three rounded cards floating on a dark page with gaps between them,
                                which is a form with pictures in it. A slot machine is one object: a lit
                                marquee with the machine's name on it, a single recessed glass panel with
                                three WINDOWS cut into it rather than three separate cards, a payline drawn
                                across the middle with a marker at each edge, and curved glass over the
                                whole thing. Every part of that is CSS and takes its colour from the
                                cabinet you are sat at, so The Vault is blued steel and The Deep is cold
                                water without a second asset.
                                The tray at the bottom is where the piggy banks live, which is where a coin
                                tray is on a real machine. */}
                            {/* Same button, same place, on the cabinets that have not been rebuilt yet —
                                see the note in Paytable. A floor where one machine tells you what it pays
                                and the next does not is worse than one where none of them do. */}
                            <button type="button" className="cas-pays" onClick={() => setPays(true)}>
                                What it pays
                            </button>
                            {pays ? (
                                <Paytable kind="three" machineId={at.id} table={st?.slots?.[at.id]}
                                    art={st?.art} bet={bet} onClose={() => setPays(false)} />
                            ) : null}
                            <div className="cas-cab">
                                <span className="cas-cab-top" aria-hidden="true">
                                    <i />{st?.slots?.[at.id]?.label || at.label}<i />
                                </span>
                                <div className="cas-glass">
                            <div className={`cas-reels${flash ? ` is-${flash}` : ""}${tease ? " is-tease" : ""}`}>
                                {/* IDLE, the reels show three of THIS cabinet's own symbols. They were
                                    hard-coded to moon/bone/doubloon, which is fine on the machine that has
                                    those and a lie on the two that do not — Moonrise sat there displaying a
                                    doubloon it cannot roll. A machine teasing a symbol that is not on its
                                    reels is the one thing a paytable must never do. */}
                                {[0, 1, 2].map((i) => (
                                    <Reel key={i} index={i} machineId={at.id} art={st?.art}
                                        symbols={(st?.slots?.[at.id]?.symbols || []).map((x) => x.id)}
                                        result={spinning ? null : (spin?.reels?.[i] ?? idleReels[i])}
                                        spinning={spinning}
                                        // The winning frames light when the LAST reel is down, not when the
                                        // first one is. Lighting them the moment the request came back lit a
                                        // paying line while two reels were still turning.
                                        won={Boolean(landed >= 3 && spin?.won > 0)} />
                                ))}
                                {/* The celebration sits OVER the reels rather than beside them, so the win
                                    happens where you were already looking. */}
                                {flash ? (
                                    <span className={`cas-pop is-${flash}`} aria-hidden="true">
                                        {flash === "big" ? "JACKPOT" : "WIN"}
                                    </span>
                                ) : null}
                                {/* Something actually comes out of the machine. Keyed on the burst id so a
                                    second win REMOUNTS it — see the note in Burst.js on why a burst seeds
                                    its scatter exactly once. */}
                                {burst ? <Burst key={burst.id} kind={burst.kind} tone={burst.tone} /> : null}
                            </div>
                                    {/* The payline. On a real cabinet it is painted on the glass, which is
                                        why it sits OVER the reels rather than between them, and why it has
                                        a marker at each edge — the markers are what tell you which row is
                                        the one being paid. */}
                                    <span className="cas-payline" aria-hidden="true"><i /><i /></span>
                                    <span className="cas-gloss" aria-hidden="true" />
                                </div>
                            {/* ── THE PIGGY BANKS ─────────────────────────────────────────────────────
                                Three of them, one under each reel, and which reel a chest lands on is which
                                bank it feeds. They GROW as they fill — the same pig, scaled — because "it
                                gets bigger and bigger until it bursts" is the whole idea, and a progress bar
                                is not that. */}
                            {/* Only on the cabinet that HAS them. This checked that bank shapes existed at
                                all — which they always do, they are a floor-wide constant — so three empty
                                pigs appeared under Wolf's Luck and Moonrise, advertising a feature those
                                machines do not have and can never fill. */}
                            {(st?.slots?.[at.id]?.bonuses || []).some((b) => b.id === "banks") && meters[at.id]?.banks ? (
                                <div className="cas-banks">
                                    {st.banks.map((bank) => {
                                        const held = meters[at.id].banks[bank.id] || { coins: 0 };
                                        const fill = Math.min(1, (held.coins || 0) / bank.holds);
                                        const justFed = fx?.fed?.includes(bank.id);
                                        const justBurst = fx?.burst?.find((b) => b.id === bank.id);
                                        return (
                                            <div key={bank.id}
                                                className={`cas-bank${justFed ? " is-fed" : ""}${justBurst ? " is-burst" : ""}`}
                                                style={{ "--tone": bank.tone, "--fill": fill }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={`/images/casino/bank_${bank.id}.webp`} alt={bank.label} draggable="false" />
                                                <span className="cas-bank-n">{held.coins || 0}<i>/{bank.holds}</i></span>
                                                {justBurst ? <span className="cas-bank-pop">+{money(Math.round(justBurst.paid * bet))}</span> : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                            </div>

                            {/* ── WHAT THE FEATURES JUST DID ──────────────────────────────────────────
                                Each one gets a line, because a feature that fires silently is a feature the
                                player experiences as the numbers behaving oddly. */}
                            {fx?.nudged ? (
                                <p className={`cas-fx${fx.nudged.hit ? " is-big" : ""}`}>
                                    {fx.nudged.hit ? "THE NUDGE — and it lands." : "The Nudge: the third reel goes again…"}
                                </p>
                            ) : null}
                            {fx?.struck > 1 ? <p className="cas-fx">Moonstruck — paid at {fx.struck.toFixed(2)}x.</p> : null}
                            {fx?.tipped ? <p className="cas-fx is-big">The tray tips out — {fx.tipped.toFixed(2)}x.</p> : null}
                            {fx?.burst?.length ? (
                                <p className="cas-fx is-big">
                                    The {fx.burst.map((b) => b.id).join(" and ")} bank bursts!
                                </p>
                            ) : null}
                            {fx?.potWon ? <p className="cas-fx is-big">THE POT — {money(fx.potWon)} gold.</p> : null}
                            {fx?.awarded ? (
                                <p className="cas-fx is-big">
                                    {fx.awarded.id === "pack" ? "PACK CALL" : "MOONRISE"} — {fx.awarded.pulls} free pulls
                                    {fx.awarded.mult > 1 ? `, everything doubled` : ""}.
                                </p>
                            ) : null}
                            {fx?.gambled ? (
                                <p className={`cas-fx${fx.gambled.won ? " is-big" : ""}`}>
                                    {fx.gambled.won ? `Doubled — ${money(fx.gambled.payout)} gold.` : `Gone. ${money(fx.gambled.amount)} gold on the flip.`}
                                </p>
                            ) : null}

                            {/* ── THE MACHINE DOES NOT ANSWER EARLY ───────────────────────────────────
                                This read straight off `spin`, which is set the instant the server replies —
                                so "Nothing. Again?" appeared 180ms in, with two reels still turning. On film
                                that is unmistakable: the machine tells you the answer and then spends another
                                second pretending to decide, which throws away the near-miss, the riser and
                                the third reel all at once.
                                `landed` counts the reels that have actually come to rest. Nothing is said
                                until all three have. */}
                            {spin && landed >= 3 ? (
                                <p className={`cas-result${spin.won > 0 ? " is-win" : ""}`}>
                                    {spin.won > 0
                                        ? `${money(spin.won)} gold — ${spin.mult}x`
                                        : "Nothing. Again?"}
                                </p>
                            ) : (
                                // A non-breaking space rather than nothing, so the reels do not jump upward
                                // for a second every single pull.
                                <p className="cas-result">{spinning || landed > 0 ? " " : "Pick a stake and pull."}</p>
                            )}

                        </>
                    ) : null}

                    {/* ── THE CARD ───────────────────────────────────────────────────────────────────
                        Five columns under B-I-N-G-O, daubed as the balls land. The winning lines are sent
                        down with the result rather than worked out here — the server already knows which
                        ones paid, and a screen that recomputes them is a second implementation of the rules
                        that can disagree with the one that paid the money. */}
                    {at.live && at.id === "bingo" ? (
                        <div className="cas-hall">
                            {/* ── THE HALL DOES NOT KEEP A ROOM WAITING ANY MORE ──────
                                This said "Everyone who buys in this round plays the same forty numbers"
                                over a player list that read "nobody yet", above a countdown. All three are
                                gone with the shared round — see bingo-kit.js. What stands in the same space
                                is what the game is actually about now: forty balls, a line gets your card
                                back, and something might come over the roof. */}
                            <div className="cas-hall-top">
                                <span>Forty balls. A line gets your card back{card?.dragon ? " — and something is circling" : ""}.</span>
                            </div>

                            <div className="cas-bhead" aria-hidden="true">
                                {["B", "I", "N", "G", "O"].map((L) => <b key={L}>{L}</b>)}
                            </div>
                            {/* The card is `position: relative` so the dragon can fly OVER it in its own
                                layer — the flight is in the card's coordinates, not the page's. */}
                            <div className={`cas-bcard${dragon ? " is-burning" : ""}`}>
                                {[0, 1, 2, 3, 4].map((row) => (
                                    [0, 1, 2, 3, 4].map((col) => {
                                        const n = card?.card?.[col]?.[row];
                                        const hit = n === 0 || (card && card.drawn.slice(0, called).includes(n));
                                        {/* ── A SQUARE THE DRAGON HAS ALREADY REACHED ──── */}
                                        const burnAt = (card?.dragon?.burnt || []).indexOf(col * 5 + row);
                                        const burning = burnAt >= 0 && burnAt < dragonLit;
                                        const won = Boolean(card && !busy && (
                                            card.lines?.some((l) => (l.kind === "row" && l.i === row)
                                                || (l.kind === "col" && l.i === col)
                                                || (l.kind === "diag" && l.i === 0 && row === col)
                                                || (l.kind === "diag" && l.i === 1 && row + col === 4))
                                            || (card.corners && card.lines?.length === 0
                                                && (row === 0 || row === 4) && (col === 0 || col === 4))
                                        ));
                                        return (
                                            <span key={`${row}-${col}`}
                                                className={`cas-bcell${hit || burning ? " is-hit" : ""}${burning ? " is-burnt" : ""}${won ? " is-line" : ""}${n === 0 ? " is-free" : ""}`}>
                                                {/* The number is wrapped so it can sit ABOVE the flame.
                                                    A bare text node cannot take a z-index, and the flame
                                                    is absolutely positioned and later in the DOM, so it
                                                    would paint straight over the digit it is lighting. */}
                                                <b className="cas-bnum">{card ? (n === 0 ? "★" : n) : ""}</b>
                                                {burning ? <i className="cas-flame" aria-hidden="true" /> : null}
                                            </span>
                                        );
                                    })
                                ))}

                                {/* ── THE PASS ────────────────────────────
                                    The sprite travels the line it burned, in the card's own grid space, so
                                    a row flight crosses left to right and a column flight dives top to
                                    bottom. The endpoints are percentages of the card computed off the
                                    path's first and last cell — which means one keyframe serves all twelve
                                    possible flights instead of twelve of them.

                                    Mirrored for a right-to-left pass, because a dragon flying backwards is
                                    the single most noticeable thing a sprite can do wrong. */}
                                {dragon ? (() => {
                                    const cells = dragon.cells || [];
                                    const first = cells[0] ?? 0;
                                    const last = cells[cells.length - 1] ?? 24;
                                    const pos = (k) => ({ x: (Math.floor(k / 5) + 0.5) * 20, y: ((k % 5) + 0.5) * 20 });
                                    const a = pos(first);
                                    const b = pos(last);
                                    return (
                                        <i className="cas-dragon" aria-hidden="true"
                                            style={{
                                                "--x1": `${a.x}%`, "--y1": `${a.y}%`,
                                                "--x2": `${b.x}%`, "--y2": `${b.y}%`,
                                                "--flip": b.x < a.x ? -1 : 1,
                                            }} />
                                    );
                                })() : null}
                            </div>

                            {/* The balls, in the order they came out. The newest one is the loud one. */}
                            <div className="cas-balls">
                                {(card?.drawn || []).slice(0, called).map((n, i) => (
                                    <span key={`${n}-${i}`} className={`cas-ball${i === called - 1 ? " is-new" : ""}`}>{n}</span>
                                ))}
                                {!card ? <span className="cas-balls-idle">Forty balls from seventy-five.</span> : null}
                            </div>

                            <p className={`cas-result${card && !busy && card.won > 0 ? " is-win" : ""}`}>
                                {!card ? `Two lines pays ${st?.bingo?.pays?.[2] ?? 1.5}x · six pays ${money(st?.bingo?.pays?.[6] ?? 200)}x`
                                    : dragon && busy
                                        ? (dragon.burnt?.length
                                            ? `The dragon burns ${dragonLit} of ${dragon.burnt.length}…`
                                            : "The dragon passes — every square was already yours.")
                                        : busy ? `${called} of ${card.drawn.length} called…`
                                            : card.label
                                                ? `${card.label} — ${card.won > 0 ? `${money(card.won)} chips` : "no pay"}`
                                                : "Not this time."}
                            </p>
                        </div>
                    ) : null}

                    {/* ── THE FELT ────────────────────────────────────────────────────────────────────
                        Dealer on top, you below, the way a table is laid out — and the face-down card is
                        drawn face-down rather than left out, because the shape of the hand is the whole
                        thing you are reading. It is genuinely not in the payload while the hand is open. */}
                    {at.live && at.id === "blackjack" ? (
                        <div className="cas-felt">
                            {/* ── THE TABLE ITSELF ────────────────────────────────────────────────
                                The felt was a rounded rectangle with a green gradient on it, which is why
                                the whole game read as a form. A real table tells you the rules before you
                                sit down — they are printed on the baize — and it has an arc, a rail and a
                                shoe for the cards to come from. All of it inert and aria-hidden: it is
                                furniture, and the deal animation now flies cards out of something that is
                                actually there. */}
                            <span className="cas-felt-arc" aria-hidden="true" />
                            <span className="cas-felt-rules" aria-hidden="true">
                                <b>BLACKJACK PAYS 3 TO 2</b>
                                <i>Dealer must stand on 17</i>
                            </span>
                            <span className="cas-shoe" aria-hidden="true" />

                            <div className="cas-seat">
                                <span className="cas-seat-who">Dealer{hand && !hand.dealerHidden && bjSettled ? ` · ${hand.dealerValue.total}` : ""}</span>
                                <div className="cas-cards">
                                    {(hand?.dealer || []).map((c, i) => (
                                        <Card key={`d${i}${c}`} card={c}
                                            delay={Math.max(0, (bjView?.dealerAt?.[i] ?? 0) - bjFrom) * DEAL_MS}
                                            // Index 1 is the hole card — the only one that ever turns.
                                            flip={bjFlip && i === 1} />
                                    ))}
                                    {hand?.dealerHidden ? <span className="cas-card is-down" aria-label="face down"
                                        style={{ "--d": `${Math.max(0, (bjView?.holeAt ?? 0) - bjFrom) * DEAL_MS}ms` }} /> : null}
                                    {!hand ? <span className="cas-card is-empty" /> : null}
                                </div>
                            </div>
                            {/* YOUR HANDS — plural, because a split makes two of them and they are played in
                                order. One hand is a list of length one, so there is no separate un-split
                                layout to keep in step with this one. The hand in play is the lit one; the
                                other is dimmed rather than hidden, because knowing what is waiting is half
                                of why you split. */}
                            {(hand?.hands || [null]).map((h, i) => (
                                <div key={i} className={`cas-seat is-you${h && hand.hands.length > 1 ? " is-multi" : ""}${h?.isActive ? " is-turn" : ""}${h?.outcome === "bust" ? " is-bust" : ""}${h?.outcome === "blackjack" ? " is-blackjack" : ""}`}>
                                    <span className="cas-seat-who">
                                        {hand?.hands?.length > 1 ? `Hand ${i + 1}` : "You"}
                                        {h && bjSettled ? ` · ${h.value.total}${h.value.soft && h.value.total <= 21 ? " soft" : ""}` : ""}
                                        {h?.doubled ? " · doubled" : ""}
                                        {h && !hand.open && h.outcome ? ` · ${OUTCOME_SHORT[h.outcome] || h.outcome}` : ""}
                                    </span>
                                    <div className="cas-cards">
                                        {(h?.cards || []).map((c, j) => (
                                            <Card key={`p${i}-${j}${c}`} card={c}
                                                delay={Math.max(0, (bjView?.handsAt?.[i]?.[j] ?? 0) - bjFrom) * DEAL_MS}
                                                dead={h?.outcome === "bust"} />
                                        ))}
                                        {!h ? <span className="cas-card is-empty" /> : null}
                                    </div>
                                </div>
                            ))}
                            {/* ── WHAT IS ACTUALLY ON THE TABLE ──────────────────────────────────
                                The stake was a number inside a button at the bottom of the screen, which is
                                the one place on a blackjack table money never is. It sits in the betting
                                spot now, as chips, and it doubles when you double — so the thing you stand
                                to lose is on the felt in front of you rather than in the UI. */}
                            <div className={`cas-spot${hand?.open ? " is-live" : ""}`} aria-hidden="true">
                                <span className="cas-spot-ring" />
                                <span className="cas-stack">
                                    {[0, 1, 2].map((i) => <span key={i} className="cas-chip" style={{ "--i": i }} />)}
                                    <em>{money(hand?.hands?.[0]?.doubled ? bet * 2 : bet)}</em>
                                </span>
                            </div>

                            <p className={`cas-result${hand && !hand.open && hand.won > 0 ? " is-win" : ""}`}>
                                {/* ── NO RAKE TO DECLARE ─────────────────────────────────────────
                                    This used to say what share of a win the house kept, and the "(rake 40)"
                                    on the end of every payout was the same fact again at the worst possible
                                    moment — on the line announcing that you had won. Luke: "remove rake from
                                    this, we don't want to rake anything." Both are gone because the rake is
                                    gone; what stands in its place is the thing that IS true now, which is
                                    that the table pays chips. */}
                                {!hand ? "Blackjack pays 3:2. Dealer stands on all 17. The table takes no rake."
                                    : hand.open ? (hand.hands?.[hand.active]?.canSplit ? "Hit, stand, double, or split." : "Hit, stand, or double.")
                                        : hand.outcome === "split" ? "Both hands played."
                                            : OUTCOME[hand.outcome] || "Hand over."}
                                {hand && !hand.open && hand.won > 0 ? ` +${money(hand.won)} chips` : ""}
                            </p>
                        </div>
                    ) : null}

                    {/* ── WHAT YOU WON THAT WAS NOT GOLD ──────────────────────────────────────────────
                        Shared by every machine, because a prize is a prize wherever it came from — and it
                        sits ABOVE the stake row so it is the last thing you read before deciding to go
                        again. That placement is the whole reason it is worth showing. */}
                    {/* ── THE PET TURNED UP ───────────────────────────────────────────────────────────
                        The rarest thing on this floor: 1 in 455 plays at the kindest and 1 in 5,556 at the
                        worst. It gets its own banner above everything else, and it says what the pet DOES —
                        a prestige drop whose effect you have to go and look up is a drop that lands flat. */}
                    {wonPet ? (
                        <div className="cas-newpet">
                            <b>{wonPet.name}</b>
                            <em>{wonPet.hint || "Joins your collection"}</em>
                            <i>{wonPet.perk || "works the floor from now on"}</i>
                        </div>
                    ) : null}

                    {/* The quiet ones — a free play, a refund. One line, no ceremony. */}
                    {note ? <p className={`cas-note is-${note.kind}`}>{note.text}</p> : null}

                    {prize ? (
                        <div className={`cas-prize${prize.jackpot ? " is-jackpot" : ""}`}>
                            {prize.spriteUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={prize.spriteUrl} alt="" draggable="false" />
                            ) : null}
                            <span>
                                <b>{prize.label || prize.kind}</b>
                                <em>{prize.where || "Added to your things"}</em>
                            </span>
                        </div>
                    ) : null}

                    {/* ONE STAKE ROW AND ONE BUTTON for every machine, because the stake is the same decision
                        wherever you are standing and a floor where each cabinet invents its own controls is a
                        floor you have to learn three times. */}
                    {/* ── EXCEPT THE ONE THAT BRINGS ITS OWN ──────────────────────────────────────
                        A five-reel cabinet has its own stake and its own Spin inside its own frame, so the
                        shared row underneath it is a SECOND spin button — and the wrong one: it plays the
                        three-reel game, on the three-reel table, for gold. Shot on the deployed page and
                        there they both were, "Spin · 100" above and "Pull · 100" below, forty pixels apart.
                        One machine, one button. */}
                    {at.live && !SLOTS5[at.id] && at.id !== "store" ? (
                        <div className="cas-controls">
                            {/* The stake row goes away mid-hand. The bet is already placed and the chips are
                                already gone — leaving four stake buttons live under a hand in progress asks
                                a question that has no answer until the hand is over.
                                NOT the `hidden` attribute: it works by the user-agent rule
                                `[hidden] { display: none }`, which ANY display in a stylesheet outranks —
                                and .cas-bets sets `display: flex`. It looked hidden in every screenshot that
                                happened to catch a finished hand, and was there the whole time in an open
                                one. Rendering nothing cannot be overridden by a stylesheet. */}
                            {at.id === "blackjack" && hand?.open ? null : (
                            <div className="cas-bets">
                                {[25, 100, 500, 2500].map((v) => (
                                    <button key={v} type="button"
                                        className={`cas-bet${bet === v ? " is-on" : ""}`}
                                        onClick={() => setBet(v)}>{money(v)}</button>
                                ))}
                            </div>
                            )}
                            {at.id === "blackjack" && hand?.open ? (
                                // MID-HAND the stake is already placed, so the stake row above is dead and
                                // these three are the only decision on the screen.
                                // Every button's legality comes from the SERVER's flags on the active hand,
                                // never from the client working the rules out again. A Split button that
                                // appears on a hand the table will refuse is worse than no button.
                                <div className={`cas-acts${hand.hands?.[hand.active]?.canSplit ? " is-four" : ""}`}>
                                    <button type="button" className="cas-act" disabled={busy} onClick={() => table("bj_hit")}>Hit</button>
                                    <button type="button" className="cas-act is-stand" disabled={busy} onClick={() => table("bj_stand")}>Stand</button>
                                    <button type="button" className="cas-act is-double"
                                        disabled={busy || !hand.hands?.[hand.active]?.canDouble || (st?.gold || 0) < hand.stake}
                                        onClick={() => table("bj_double")}>Double</button>
                                    {hand.hands?.[hand.active]?.canSplit ? (
                                        <button type="button" className="cas-act is-split"
                                            disabled={busy || (st?.gold || 0) < hand.stake}
                                            onClick={() => table("bj_split")}>Split</button>
                                    ) : null}
                                </div>
                            ) : null}
                            {/* Double or Nothing goes ABOVE the pull button, because it is a decision about
                                the money you just won and it has to be answered before the next pull — so it
                                sits where the next pull would be. */}
                            {SLOTS.has(at.id) && (meters[at.id]?.pending || 0) > 0 ? (
                                <button type="button" className="cas-act is-split cas-gamble" disabled={busy} onClick={gamble}>
                                    Double or nothing · {money(meters[at.id].pending)}
                                </button>
                            ) : null}
                            {at.id === "blackjack" && hand?.open ? null : (
                            <button type="button" className="cas-pull"
                                disabled={busy || (st?.gold || 0) < bet || (at.id === "keno" && ticket.length !== 5)}
                                onClick={() => {
                                    if (SLOTS.has(at.id)) return pull();
                                    if (at.id === "blackjack") return table("bj_deal", { bet });
                                    if (at.id === "bingo") return buyCard();
                                    // The ticket resolves in one answer now — there is no round to place it
                                    // into. The ten balls that follow are the ceremony over it.
                                    return play({ action: "keno", bet, picks: ticket }, setKeno);
                                }}>
                                {busy ? "…"
                                    : SLOTS.has(at.id) && (meters[at.id]?.freePulls || 0) > 0
                                        ? `Free pull · ${meters[at.id].freePulls} left`
                                        : (st?.gold || 0) < bet ? "Not enough gold"
                                        : at.id === "keno" && ticket.length !== 5 ? "Pick five numbers"
                                            : `${SLOTS.has(at.id) ? "Pull" : at.id === "blackjack" ? "Deal" : at.id === "bingo" ? "Buy a card" : "Play"} · ${money(bet)}`}
                            </button>
                            )}
                            {/* ── THE OWNER'S DRAGON ─────────────────────────────────────
                                Luke: "also need an admin button to trigger that in bingo."

                                It buys a REAL card at the real stake and makes the pass certain — it does not
                                fabricate a demonstration. That distinction is the whole value of the button:
                                what gets tested is the feature every other player will get, including the
                                case that matters most and is hardest to catch by waiting, which is a pass
                                that burns nothing because every square on the line was already yours.

                                Gated on the server too (see the route). A button that is only hidden on the
                                screen is not a gate — the same rule the whole floor is built on. */}
                            {at.id === "bingo" && st?.owner ? (
                                <div className="cas-owner">
                                    <span>Owner</span>
                                    <button type="button" disabled={busy || (st?.gold || 0) < bet}
                                        onClick={() => buyCard("dragon")}>Force the dragon</button>
                                </div>
                            ) : null}
                            {err ? <p className="cas-err">{err}</p> : null}
                        </div>
                    ) : at.live ? null : (
                        <p className="cas-soon">The lights are on and nothing is inside yet.</p>
                    )}
                </div>
            ) : null}

            {/* THE DAY'S THREE, at the very bottom. This sat between the room and the walk controls for
                exactly one screenshot: it is tall enough on a phone that it pushed the ◀ ▶ buttons off the
                bottom of the screen, so the floor became a room you could not walk around. Anything that
                is not the room or the machine goes below both.

                ── AND IT IS NOT PRESSED UP AGAINST THE GLASS ───────────────────────────────────────
                Luke: "you can have the quests have more margin top so they're not so close to the
                animation frame." With the Play button removed there was nothing between the bottom edge of
                the room and the bounty card at all, so the card read as part of the room rather than as the
                next thing down the page. The gap is on the wrapper rather than on FeatureDailies itself,
                because that component is mounted on eight other screens and none of them has this problem. */}
            <div className="cas-dailies">
                <FeatureDailies feature="casino" />
            </div>

        </section>
    );
}
