"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import FeatureDailies from "@/components/FeatureDailies";
import SceneMusic from "@/components/SceneMusic";
import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio.js";
import Burst from "@/components/casino/Burst";
import { Cas } from "@/components/casino/casino-audio.js";

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
const MACHINES = [
    { id: "slot", x: 8, label: "The Hunt", kind: "Slots", live: true },
    { id: "slot2", x: 19, label: "The Harvest", kind: "Slots", live: true },
    { id: "slot3", x: 30, label: "The Deep", kind: "Slots", live: true },
    { id: "slot4", x: 41, label: "The Menagerie", kind: "Slots", live: true },
    { id: "slot5", x: 52, label: "The Vault", kind: "Slots", live: true },
    { id: "roulette", x: 63, label: "The Wheel", kind: "Roulette", live: true },
    { id: "keno", x: 74, label: "Keno", kind: "Keno", live: true },
    { id: "bingo", x: 85, label: "The Hall", kind: "Bingo", live: true },
    { id: "blackjack", x: 96, label: "The Table", kind: "Blackjack", live: true },
];

// How close you have to stand for a machine to be usable. Wide enough that walking to something feels like
// arriving rather than threading a needle.
// How close you have to stand for a machine to be usable, as a share of the floor. It was 9 against a
// spacing of 11, which meant there was almost nowhere on the whole floor you were NOT at a cabinet — every
// machine's reach very nearly touched its neighbour's, so spacing them out would have bought nothing. At 6
// there is real room between them to stand in, which is the point of a room.
const REACH = 6;

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
const DECOR = [
    { id: "rope", x: 2.5 },
    { id: "plant", x: 13.5, back: true },
    { id: "stool", x: 24.5 },
    { id: "plant", x: 35.5 },
    { id: "rope", x: 46.5, back: true },
    { id: "stool", x: 57.5 },
    { id: "plant", x: 68.5, back: true },
    { id: "stool", x: 79.5 },
    { id: "plant", x: 90.5 },
];

// ── THE LIGHTING ────────────────────────────────────────────────────────────────────────────────────────
// Chandeliers, hung at a wider spacing than anything on the floor so the two rhythms do not line up and turn
// the room into wallpaper. Each one is a sprite plus a cone of light thrown down onto the carpet — the cone
// is what actually does the work, because a lamp that does not light anything is just a picture of a lamp.
const LAMPS = [6, 25, 44, 63, 82, 99];

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
    roulette: "#c9a3ff",    // violet, off the wheel's own pockets
    keno: "#67e3d0",        // the lamps on the ticket board
    bingo: "#ff9ec0",       // the caller's baize is green, so the card is not
    blackjack: "#6fd39a",   // felt
};

// Which cabinets are slot machines. Three of them now, and they are not one machine in three paint jobs —
// see SLOT_MACHINES in casino.js. The client does not decide anything about them: it sends which cabinet
// you are standing at and draws whatever came back.
const SLOTS = new Set(["slot", "slot2", "slot3", "slot4", "slot5"]);

// The one sentence that decides whether you sit down at each of the four that are not slot machines. Slots
// describe themselves out of their own paytable (hit rate, top multiple, return); these cannot, because the
// interesting thing about them is not a number — it is that somebody else is playing the same one.
const KIND_BLURB = {
    roulette: "One wheel for the whole floor. Everybody who bets inside the window rides the same pocket.",
    keno: "Pick five of forty. Everyone holding a ticket this round plays the same ten balls.",
    bingo: "Forty balls and one card, and the whole hall plays the same forty. A line gets your card back.",
    blackjack: "You against the house, one hand at a time. The hole card is not on this screen until it turns.",
};

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
    const stopAt = [0, 220, 560][index] || 0;
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
                    ? { transform: `translateY(calc(var(--cell) * ${-steps}))`, transition: "transform 520ms cubic-bezier(.14,.86,.28,1.04)" }
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

const money = (n) => Math.round(Number(n) || 0).toLocaleString();

// Seconds left on a round, from the end time the server sent. Recomputed on a local tick rather than polled:
// the clock is the same for everybody and asking a server what time it is would be a request per second.
const secsLeft = (closesAt) => Math.max(0, Math.ceil((closesAt - Date.now()) / 1000));

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

// ── A SHARED ROUND, ON THE MACHINE'S FACE ────────────────────────────────────────────────────────────────────
// The clock, who else is in it, and what you already have riding. All three matter: a countdown with nobody
// named on it is just a wait, and the whole reason these two games became shared is that somebody else is
// playing the same numbers.
function Round({ game, st, tick, verb }) {
    const r = st?.rounds?.[game];
    if (!r) return null;
    const left = secsLeft(r.closesAt ?? (Date.now() + (r.msLeft || 0)));
    const mine = r.mine || [];
    const others = (r.players || []).length;
    return (
        <div className="cas-round" data-tick={tick}>
            <span className="cas-round-clock">{verb} in {left}s</span>
            <span className="cas-round-who">
                {others > 1 ? `${others} in this round` : others === 1 ? "you, so far" : "nobody yet"}
                {mine.length ? ` · ${mine.length} of yours riding` : ""}
            </span>
        </div>
    );
}

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
    const [x, setX] = useState(14);
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
    // The wheel: which bet is on the felt, and where it landed.
    const [wheelBet, setWheelBet] = useState("gold");
    const [wheel, setWheel] = useState(null);
    // The ticket: five numbers of forty, and the last draw.
    const [ticket, setTicket] = useState([]);
    const [keno, setKeno] = useState(null);
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
    const [fx, setFx] = useState(null);      // what the features did on the last pull
    // The two shared games: what settled for you last, and a ticking clock for the round now open.
    const [settled, setSettled] = useState({});
    const [tick, setTick] = useState(0);
    const rakeRate = initial?.blackjack?.rakeRate ?? 0.2;

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

    // The countdown. One second of arithmetic, no requests — the round's end time came down with the state
    // and the clock is the same for everybody, so there is nothing to ask anyone about.
    useEffect(() => {
        const id = setInterval(() => setTick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, []);

    // Keep the window centred on you. Written imperatively rather than as a transform because scrollLeft
    // needs no arithmetic about percentages of percentages, and the browser smooths it for free.
    useEffect(() => {
        const el = roomRef.current;
        if (!el) return;
        const world = el.scrollWidth;
        // INSTANT, not smooth. `x` now changes sixteen times a second while you walk, and a smooth scroll
        // restarted that often never finishes one — the camera lurched and lagged behind the hero. It moves
        // in the same small increments he does, which is smooth without being animated.
        el.scrollTo({ left: (world * x) / 100 - el.clientWidth / 2, behavior: "auto" });
    }, [x]);

    // ── DEPTH ────────────────────────────────────────────────────────────────────────────────────────────
    // The wall is painted on the scroll container itself, which means it did not move AT ALL: walking the
    // floor slid nine cabinets across a completely static backdrop, and a backdrop that never moves reads as
    // a photograph behind the furniture rather than a room you are in.
    //
    // Shifting its background-position by a fraction of the scroll is the whole fix. It moves at 45% of the
    // speed of the things standing in front of it, which is what parallax is, and because the wall tiles
    // there is no edge to run off no matter how far the floor is walked.
    useEffect(() => {
        const el = roomRef.current;
        if (!el) return undefined;
        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty("--par", `${el.scrollLeft}px`); });
        };
        onScroll();
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
    }, []);

    // ...and the walk to it. Runs once: after this the position is yours, and a link should not be able to
    // yank you back across the floor on a later render.
    useEffect(() => {
        const want = new URLSearchParams(window.location.search).get("at");
        // Arriving from a link puts you AT the machine rather than walking you the length of the floor to it:
        // a link is a door, not a stroll.
        const m = MACHINES.find((mm) => mm.id === want);
        if (m) setX(m.x);
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

    const walkTo = useCallback((to) => {
        unlock();
        setErr(null);
        // Read the position from the ref, not from inside a setX updater — an updater can be called twice
        // and setting other state from within one is a side effect in a place React is allowed to repeat.
        setFacing(to < xRef.current ? -1 : 1);
        setGoal(Math.max(4, Math.min(96, to)));
    }, []);

    // Hold an arrow and you keep going until you let go or reach the wall. A tap still moves you a sensible
    // amount, because the goal is only cleared on release and the loop has already run a few ticks by then.
    // ── A TAP AND A HOLD ARE THE SAME GESTURE, MEASURED ──────────────────────────────────────────────────
    // Holding walks until you let go. But releasing simply cleared the goal, so a TAP moved you one tick —
    // about a pixel and a half of floor — where the old arrow moved you 6% of it. Free movement is not much
    // use if the ordinary gesture stopped working.
    // So a release that comes quickly is read as a step rather than as a stop: you get a proper stride, in
    // the same continuous motion, and a long press still runs to the wall.
    const heldAt = useRef(0);
    const hold = useCallback((dir) => {
        unlock(); setFacing(dir); heldAt.current = Date.now(); setGoal(dir < 0 ? 4 : 96);
    }, []);
    const release = useCallback((dir) => {
        // Three handlers hang off each button (up, leave, cancel) and a real release fires more than one of
        // them. Without this guard the second call reads heldAt as 0, decides the press was not quick, and
        // cancels the step the first call just started.
        if (!heldAt.current) return;
        const quick = Date.now() - heldAt.current < 220;
        heldAt.current = 0;
        setGoal(quick ? Math.max(4, Math.min(96, xRef.current + (dir < 0 ? -9 : 9))) : null);
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
    // wheel is a floor that has to be learned twice.
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
            const REEL_AT = [640, 860, 1200];
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
        setBurst(null);
        // Chips going down on the felt, not a UI blip — and never a wheel sound, because a bet on a shared
        // round does not spin anything. The wheel turns when the round closes, for everybody at once.
        Cas.chips();
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((x2) => x2.json()).catch(() => null);
        setBusy(false);
        if (!r?.ok) {
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet."
                : r?.error === "bad_ticket" ? "Pick five numbers first."
                    : "That didn't go through.");
            return;
        }
        onResult(r);
        setSt((p) => ({ ...p, gold: r.gold }));
        // A bet PLACED is not a result. The wheel and keno hand back a round to wait for, and celebrating
        // at that moment would be the machine cheering for taking your money.
        if (r.placed) {
            setSt((p) => ({ ...p, rounds: { ...(p.rounds || {}), [r.round != null && body.action === "wheel" ? "wheel" : "keno"]: { ...(p.rounds?.[body.action] || {}), msLeft: Math.max(0, (r.closesAt || 0) - Date.now()), closesAt: r.closesAt } } }));
            setSettled((p) => ({ ...p, [body.action]: null }));
            // The chips already said it. A second sound here would be the machine congratulating you for
            // handing over a stake.
            return;
        }
        absorb(r);
        const acc = ACCENT[body.action === "wheel" ? "roulette" : "keno"];
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
            // A shared game needs no channel of its own: the wheel spinning is something the floor learns
            // the next time it looks, which is at most six seconds and usually less.
            if (r?.open) {
                setSt((p) => ({ ...p, others: r.others, gold: r.gold, rounds: r.rounds }));
                if (r.pot) setPot(r.pot.amount);
                // Anything that settled while you were away is announced rather than quietly banked.
                for (const game of ["wheel", "keno"]) {
                    const done = r.rounds?.[game]?.settled || [];
                    if (done.length) setSettled((p) => ({ ...p, [game]: done }));
                    const first = done.find((d) => d.prize || d.pet);
                    if (first) absorb(first);
                }
            }
        }, 6000);
        return () => clearInterval(id);
    }, [absorb]);

    const buyCard = useCallback(async () => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setPrize(null); setNote(null); setWonPet(null);
        setCard(null); setCalled(0); setBurst(null);
        Cas.chips();
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "bingo", bet }),
        }).then((x2) => x2.json()).catch(() => null);
        if (!r?.ok) {
            setBusy(false);
            setErr(r?.error === "no_gold" ? "Not enough gold for that card." : "That didn't go through.");
            return;
        }
        setCard(r);
        setSt((p) => ({ ...p, gold: r.gold }));

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
        const total = (r.drawn?.length || 0) * BALL_MS + 5 * 220 + 260;
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

    const toggleNumber = useCallback((n) => {
        setTicket((p) => (p.includes(n) ? p.filter((v) => v !== n) : p.length >= 5 ? p : [...p, n]));
    }, []);

    // Every timer this component starts is cleared on unmount — walking out mid-spin must not leave a
    // callback firing into a component that is gone.
    useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

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
            <div className="cas-room" ref={roomRef}>
              {/* ── TAP THE FLOOR AND WALK THERE ────────────────────────────────────────────────
                  The most direct way to move in a room you are looking at. It sits UNDER the cabinets in
                  the stacking order, so tapping a machine still opens the machine — this only ever catches
                  the taps that landed on nothing. */}
              <div className="cas-world" onClick={(e) => {
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
                {MACHINES.map((m) => (
                    <button key={m.id} type="button"
                        className={`cas-mach${m.live ? " is-live" : ""}${at?.id === m.id ? " is-near" : ""}`}
                        style={{ left: `${m.x}%` }}
                        aria-label={`${m.label} — ${m.live ? m.kind : "not built yet"}`}
                        onClick={() => { setX(m.x); if (m.live) setSeated(true); }}>
                        {/* The cabinet, drawn rather than approximated. It was a gradient and a border for
                            as long as the floor plan was still being argued about, which was the right order
                            to do it in — art costs money to get wrong, and the plan changed three times. */}
                        <span className="cas-mach-body">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/images/casino/${m.id}.webp`} alt="" draggable="false" />
                        </span>
                        <b>{m.label}</b>
                        <em>{m.live ? m.kind : "soon"}</em>
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
            {!seated ? <SceneMusic vibe="casino" /> : null}
            </div>

            <div className="cas-walk">
                {/* Pointer events rather than click, so a press that is HELD keeps walking. onPointerLeave
                    and onPointerCancel matter as much as onPointerUp: a thumb that slides off the button
                    mid-walk would otherwise leave you walking into the wall forever. */}
                <button type="button" aria-label="Walk left"
                    onPointerDown={() => hold(-1)} onPointerUp={() => release(-1)}
                    onPointerLeave={() => release(-1)} onPointerCancel={() => release(-1)}>◀</button>
                {at?.live ? (
                    <button type="button" className="cas-sit" onClick={() => setSeated(true)}>
                        Play {at.label}
                    </button>
                ) : <span>{at ? at.label : "walk to a machine"}</span>}
                <button type="button" aria-label="Walk right"
                    onPointerDown={() => hold(1)} onPointerUp={() => release(1)}
                    onPointerLeave={() => release(1)} onPointerCancel={() => release(1)}>▶</button>
            </div>

            {/* ── THE MACHINE YOU ARE AT ──────────────────────────────────────────────────────────────────
                Only rendered when you are standing at one, so the room is the screen and the game is
                something you walk up to rather than a panel that is always there. */}
            {at ? (
                <div className={`${seated ? "cas-stage" : "cas-panel"}${at.live ? "" : " is-dark"}`}
                    style={{ "--acc": ACCENT[at.id] || "#ffd75e" }}
                    role={seated ? "dialog" : undefined} aria-modal={seated ? "true" : undefined}
                    aria-label={seated ? at.label : undefined}>
                    <div className="cas-panel-head">
                        {seated ? (
                            <button type="button" className="cas-leave" onClick={() => setSeated(false)}
                                aria-label="Back to the floor">←</button>
                        ) : null}
                        <b>{st?.slots?.[at.id]?.label || at.label}</b>
                        {seated ? <span className="cas-purse-sm">{money(st?.gold)}<i>gold</i></span>
                            : <em>{at.live ? at.kind : "not built yet"}</em>}
                    </div>

                    {/* ── STANDING AT A MACHINE IS NOT PLAYING IT ──────────────────────────────────
                        Luke: "id rather we only show the interaction with the games in a full screen modal."

                        Every play surface below — the reels, the wheel, the ticket, the card, the table, the
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
                    {/* ── THE POT ─────────────────────────────────────────────────────────────────────
                        One number for the whole floor, fed by every bet on every cabinet, and any pull can
                        take it. It sits ABOVE the reels because it is the reason to be at this machine
                        rather than a footnote about it — and it climbs while you watch, because everybody
                        else's pulls are feeding it too. */}
                    {SLOTS.has(at.id) ? (
                        <div className={`cas-pot${fx?.potWon ? " is-won" : ""}`}>
                            <i>The Pot</i>
                            <b>{money(fx?.potWon || pot)}</b>
                            <em>{fx?.potWon ? "YOU TOOK IT" : "every cabinet feeds it"}</em>
                        </div>
                    ) : null}

                    {/* ── WHAT THIS CABINET REMEMBERS ─────────────────────────────────────────────────
                        The tray, the multiplier and any banked free pulls. Shown ALWAYS rather than only
                        when they are non-zero: a meter you only see once it has something in it is a meter
                        nobody knows they are filling. */}
                    {SLOTS.has(at.id) && meters[at.id] ? (
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

                    {/* ── AND THE FOUR THAT ARE NOT SLOTS ──────────────────────────────────────────────
                        The pot, the meters and the volatility line above are all slot-only, so with the play
                        surfaces moved into the modal these four cabinets had a card with nothing on it but
                        their own name. Each gets the one sentence that actually decides whether you sit
                        down — for three of them that is "you are not playing alone", which is the whole
                        reason they were built as shared rounds. */}
                    {!SLOTS.has(at.id) && at.live && !seated ? (
                        <p className="cas-vol">
                            <span>{KIND_BLURB[at.id]}</span>
                            {at.id === "bingo" && st?.bingo?.pays ? (
                                <i>a line pays {st.bingo.pays[1] ?? 1}x · six pays {money(st.bingo.pays[6] ?? 300)}x</i>
                            ) : at.id === "roulette" && st?.wheel?.bets ? (
                                <i>{Object.values(st.wheel.bets).map((b) => `${b.label} ${b.pays}x`).join(" · ")}</i>
                            ) : at.id === "keno" && st?.keno ? (
                                <i>five of {st.keno.pool || 40} · all five is the one worth waiting for</i>
                            ) : at.id === "blackjack" ? (
                                <i>blackjack pays 3:2 · dealer stands on 17 · split once</i>
                            ) : null}
                        </p>
                    ) : null}

                    {SLOTS.has(at.id) && st?.slots?.[at.id] ? (
                        <p className="cas-vol">
                            <span>{st.slots[at.id].blurb}</span>
                            <i>
                                pays on {Math.round(st.slots[at.id].hitRate * 100)}% of pulls
                                {" · "}top {money(Math.max(...Object.values(st.slots[at.id].pays.three)))}x
                                {" · "}returns {(st.slots[at.id].rtp * 100).toFixed(1)}%
                            </i>
                            {/* The features, named on the machine — a bonus nobody knows about is a bonus
                                that fires and reads as the game glitching. Folded away once you are SAT at
                                it, because by then you have read it and the screen is needed for the game:
                                a phone cannot show three paragraphs and three reels and a button. */}
                            {!seated ? (st.slots[at.id].bonuses || []).map((b) => (
                                <em key={b.id}><b>{b.label}</b> {b.blurb}</em>
                            )) : null}
                        </p>
                    ) : null}

                    {/* Each machine draws its own game. The slot's ceremony is three landings; the wheel and
                        the ticket resolve in one, so they get a result and a celebration and no theatre. */}
                    {seated && at.live && at.id === "roulette" ? (
                        <>
                            {/* ── THE ROUND ───────────────────────────────────────────────────────────
                                One wheel for the whole floor. Everybody betting inside the window is on the
                                same pocket, which is what roulette IS — and it is also why the result cannot
                                arrive with the bet: you choose your pocket, so a spin you could see before
                                betting again would be an unlimited payout. */}
                            <Round game="wheel" st={st} tick={tick} verb="Spins" />

                            <div className="cas-wheel">
                                {(st?.wheel?.segments || []).map((seg) => (
                                    <span key={seg.i}
                                        className={`cas-seg is-${seg.kind}${settled.wheel?.[0]?.outcome?.seg?.i === seg.i ? " is-hit" : ""}`} />
                                ))}
                                {settled.wheel?.length ? (
                                    <b className={`cas-wheel-out${settled.wheel.some((d) => d.won > 0) ? " is-win" : ""}`}>
                                        {settled.wheel.some((d) => d.won > 0)
                                            ? `${money(settled.wheel.reduce((n, d) => n + d.won, 0))} gold`
                                            : "The house takes it"}
                                    </b>
                                ) : <b className="cas-wheel-out">Place a bet</b>}
                            </div>
                            <div className="cas-picks">
                                {Object.entries(st?.wheel?.bets || {}).map(([id, b2]) => (
                                    <button key={id} type="button"
                                        className={`cas-pick${wheelBet === id ? " is-on" : ""}`}
                                        onClick={() => setWheelBet(id)}>
                                        {b2.label}<i>{b2.pays}x</i>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : null}

                    {seated && at.live && at.id === "keno" ? (
                        <>
                            {/* Ten balls for the whole lounge — see the note on the wheel for why the draw
                                cannot arrive with the ticket. */}
                            <Round game="keno" st={st} tick={tick} verb="Drawn" />
                            {settled.keno?.length ? (
                                <p className={`cas-fx${settled.keno.some((d) => d.won > 0) ? " is-big" : ""}`}>
                                    Drawn: {(settled.keno[0].outcome?.drawn || []).join(" · ")}
                                    {settled.keno.some((d) => d.won > 0)
                                        ? ` — ${money(settled.keno.reduce((n, d) => n + d.won, 0))} gold`
                                        : " — nothing this time"}
                                </p>
                            ) : null}
                            <div className="cas-grid">
                                {Array.from({ length: st?.keno?.pool || 40 }, (_, i) => i + 1).map((n) => {
                                    const mine = ticket.includes(n);
                                    const drew = keno?.drawn?.includes(n);
                                    return (
                                        <button key={n} type="button"
                                            className={`cas-num${mine ? " is-mine" : ""}${drew ? " is-drawn" : ""}${mine && drew ? " is-hit" : ""}`}
                                            onClick={() => toggleNumber(n)}>{n}</button>
                                    );
                                })}
                            </div>
                            <p className={`cas-result${keno?.won > 0 ? " is-win" : ""}`}>
                                {keno
                                    ? `${keno.hits.length} of 5 — ${keno.won > 0 ? `${money(keno.won)} gold` : "nothing"}`
                                    : `${ticket.length} of 5 picked`}
                            </p>
                        </>
                    ) : null}

                    {seated && at.live && SLOTS.has(at.id) ? (
                        <>
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
                    {seated && at.live && at.id === "bingo" ? (
                        <div className="cas-hall">
                            <div className="cas-hall-top">
                                <span>{st?.bingo?.players?.length
                                    ? `${st.bingo.players.length} in this round — same forty numbers`
                                    : "Everyone who buys in this round plays the same forty numbers"}</span>
                            </div>

                            <div className="cas-bhead" aria-hidden="true">
                                {["B", "I", "N", "G", "O"].map((L) => <b key={L}>{L}</b>)}
                            </div>
                            <div className="cas-bcard">
                                {[0, 1, 2, 3, 4].map((row) => (
                                    [0, 1, 2, 3, 4].map((col) => {
                                        const n = card?.card?.[col]?.[row];
                                        const hit = n === 0 || (card && card.drawn.slice(0, called).includes(n));
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
                                                className={`cas-bcell${hit ? " is-hit" : ""}${won ? " is-line" : ""}${n === 0 ? " is-free" : ""}`}>
                                                {card ? (n === 0 ? "★" : n) : ""}
                                            </span>
                                        );
                                    })
                                ))}
                            </div>

                            {/* The balls, in the order they came out. The newest one is the loud one. */}
                            <div className="cas-balls">
                                {(card?.drawn || []).slice(0, called).map((n, i) => (
                                    <span key={`${n}-${i}`} className={`cas-ball${i === called - 1 ? " is-new" : ""}`}>{n}</span>
                                ))}
                                {!card ? <span className="cas-balls-idle">Forty balls. A line gets your card back.</span> : null}
                            </div>

                            <p className={`cas-result${card && !busy && card.won > 0 ? " is-win" : ""}`}>
                                {!card ? `Two lines pays ${st?.bingo?.pays?.[2] ?? 2.5}x · six pays ${money(st?.bingo?.pays?.[6] ?? 300)}x`
                                    : busy ? `${called} of ${card.drawn.length} called…`
                                        : card.label
                                            ? `${card.label} — ${card.won > 0 ? `${money(card.won)} gold` : "no pay"}`
                                            : "Not this time."}
                            </p>
                        </div>
                    ) : null}

                    {/* ── THE FELT ────────────────────────────────────────────────────────────────────
                        Dealer on top, you below, the way a table is laid out — and the face-down card is
                        drawn face-down rather than left out, because the shape of the hand is the whole
                        thing you are reading. It is genuinely not in the payload while the hand is open. */}
                    {seated && at.live && at.id === "blackjack" ? (
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
                                {!hand ? `Blackjack pays 3:2. The house rakes ${Math.round(rakeRate * 100)}% of what you win — never your stake.`
                                    : hand.open ? (hand.hands?.[hand.active]?.canSplit ? "Hit, stand, double, or split." : "Hit, stand, or double.")
                                        : hand.outcome === "split" ? "Both hands played."
                                            : OUTCOME[hand.outcome] || "Hand over."}
                                {hand && !hand.open && hand.won > 0 ? ` +${money(hand.won)} gold` : ""}
                                {hand && !hand.open && hand.rake > 0 ? ` (rake ${money(hand.rake)})` : ""}
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
                    {seated && wonPet ? (
                        <div className="cas-newpet">
                            <b>{wonPet.name}</b>
                            <em>{wonPet.hint || "Joins your collection"}</em>
                            <i>{wonPet.perk || "works the floor from now on"}</i>
                        </div>
                    ) : null}

                    {/* The quiet ones — a free play, a refund. One line, no ceremony. */}
                    {seated && note ? <p className={`cas-note is-${note.kind}`}>{note.text}</p> : null}

                    {seated && prize ? (
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
                    {at.live && seated ? (
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
                                    // Both of these now PLACE a bet on the open round rather than resolving
                                    // one. The answer says when it closes; the result arrives on the poll.
                                    if (at.id === "roulette") return play({ action: "wheel", bet, choice: wheelBet }, setWheel);
                                    return play({ action: "keno", bet, picks: ticket }, setKeno);
                                }}>
                                {busy ? "…"
                                    : SLOTS.has(at.id) && (meters[at.id]?.freePulls || 0) > 0
                                        ? `Free pull · ${meters[at.id].freePulls} left`
                                        : (st?.gold || 0) < bet ? "Not enough gold"
                                        : at.id === "keno" && ticket.length !== 5 ? "Pick five numbers"
                                            : `${SLOTS.has(at.id) ? "Pull" : at.id === "blackjack" ? "Deal" : at.id === "roulette" ? "Put chips down" : at.id === "bingo" ? "Buy a card" : "Play"} · ${money(bet)}`}
                            </button>
                            )}
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
                is not the room or the machine goes below both. */}
            <FeatureDailies feature="casino" />

        </section>
    );
}
