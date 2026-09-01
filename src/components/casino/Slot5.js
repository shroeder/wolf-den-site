"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import WinTally, { isBigWin, tierFor } from "@/components/casino/WinTally";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";
import { symbolTone, symbolRole, symbolName, slot5, LINES } from "@/lib/marketplace/casino-slot5.js";
import Paytable from "@/components/casino/Paytable.js";
import HoldAndSpin from "@/components/casino/HoldAndSpin.js";
import TheLocks from "@/components/casino/TheLocks.js";
import TheWarren from "@/components/casino/TheWarren.js";
import GemVault from "@/components/casino/GemVault.js";
import WinAgainBar from "@/components/casino/WinAgainBar.js";
import ColossalReels from "@/components/casino/ColossalReels.js";

// ── THE FIVE-REEL MACHINE ────────────────────────────────────────────────────────────────────────────────────
// Five reels, three rows, twenty lines. The maths is entirely server-side (casino-slot5.js) and this screen
// computes nothing: it is handed a finished grid, the lines that paid and what the features did, and its whole
// job is to reveal that in an order that is worth watching.
//
// THE ORDER IS THE GAME. A slot machine is a reveal with a spreadsheet behind it, and the reveal is the part
// people come for: reels land left to right so the last one decides, matching symbols on reels one and two
// make the third reel matter, and the money is counted UP rather than stated. None of that changes a single
// payout — it is all pacing — and it is the difference between a machine and a receipt printer.

const REELS = 5;
const ROWS = 3;
// Per-reel release, then the settle. Same shape as the three-reel cabinet next door, and the same rule: the
// sound is timed off THESE numbers rather than a second copy of them, because that drift cost us 620ms once
// already. See the reel clock in CasinoClient.
// ── THE GAPS BETWEEN REELS ARE THE GAME ─────────────────────────────────────────────────────────────────────
// These were 150ms apart, which is not five reels stopping one at a time — it is five reels stopping at once
// with a stutter on it. Every cabinet on a real floor leaves a real beat between reels, and the reason is not
// decoration: the gap is the ONLY place anticipation can live. You cannot be told you are one scatter away if
// the reel that would deliver it has already stopped.
//
// 320ms apart, so a plain spin lands over about a second and a quarter — long enough to watch, short enough
// that the ninety-two losing spins between bonuses are not a chore.
const STOP_AT = [0, 320, 640, 960, 1280];
const SETTLE_MS = 340;
const LANDS_AT = STOP_AT.map((t) => t + SETTLE_MS);
// How long each winning line is drawn before the next one, when several paid.
const LINE_MS = 620;
// ── A FREE SPIN IS A SPIN ────────────────────────────────────────────────────────────────────────────────────
// Luke: "free spins basically tries to speedrun instead of truly let the user experience them, it doesnt do
// anything of the juice we usually have on spins."
//
// The first cut ran them at a quarter of the base pace with no lines drawn, no win called and no anticipation
// — ten grids flickering past under a running total. That was an argument about real cabinets ("free spins are
// fast") applied to the wrong thing: what is fast on a real machine is the DEAD time between spins, not the
// spin. Every landing still gets its reel stops, every win still lights its line, and a big one still stops
// the room. The round is the payoff for a one-in-ninety-three event; rushing it is throwing the payoff away.
//
// So a free spin is the base spin at about three quarters speed, which is quicker without being a different
// thing, and the round can be skipped by anybody who has seen it (see the Skip button) rather than by
// everybody automatically.
const FREE_STOP_AT = [0, 230, 460, 690, 920];
const FREE_SETTLE_MS = 300;
const FREE_LINE_MS = 470;
const FREE_HOLD_MS = 420;   // how long a finished free spin sits before the next one goes
// Below this a win is not celebrated — see CELEBRATE_AT in casino-slot5-play.js. Seven wins in ten on a
// twenty-line machine pay back less than the stake; that is what twenty lines buys, and a machine that
// throws a fanfare at every one of them is doing the exact thing this rework existed to stop.
// How long a celebration can possibly own the button, plus a second. A backstop, never the normal path —
// WinTally's own onDone is what releases it in every ordinary case. See the note on the flag.
const holdCeiling = (multiple) => { const t = tierFor(multiple); return t.ms + t.hold + 1000; };
const CELEBRATE_AT = 1;
const BIG_WIN_AT = 10;

// Same resolver as the reels on the three-reel cabinets and the paytable — see the note in Paytable.js.
// Several machines draw their symbols from the Den's own sprites, which live on Blob under unpredictable
// names, so a path built from the machine id only works for the cabinets that happen to have a generic set.
const artFor = (art, machineId, sym) => art?.[machineId]?.[sym] || `/images/casino/reels/${machineId}-${sym}.webp`;

// ── A SPRITE THAT DOES NOT LOAD MUST NOT BECOME A BROKEN-IMAGE ICON ──────────────────────────────────────────
// Luke, with a photo of The Harvest: "dead images?" — two cells in the bottom row drawn as the browser's grey
// torn-photo placeholder, in the middle of a paying board.
//
// The cause on that board was a sprite that failed to fetch on a phone, and the cause is not really the point:
// the reel resolver builds a URL from the machine id and the symbol id, and there are FOUR different places a
// cabinet's art can come from (a drawn set in public/, a gem path, a pet on Blob, a fish sprite). Any of them
// can 404 after a rename, and every one of them fails the same way — as a torn photo where a symbol should be.
// While auditing this I found /images/casino/reels/slot3-doubloon.webp genuinely missing on production; it
// happens to be unreachable because The Deep overrides its art to /images/fish/, but nothing about the code
// GUARANTEED that, and the next rename gets it.
//
// So a sprite that fails is remembered and simply not drawn again. The cell keeps its coloured wash, its ring
// and its frame — every cell already carries the symbol's own hue behind it (see SYMBOL_LOOK) — so the worst a
// dead sprite can do now is read as a plain coloured tile, which is a machine missing a picture rather than a
// machine that is broken.
//
// Module-level, because a 404 is a fact about a URL and not about one mounted component: the second cabinet to
// ask for the same dead sprite should not have to discover it again. `bump` is only there to repaint the cells
// already on screen at the moment it fails.
const DEAD_SPRITES = new Set();

function ReelImg({ src, className }) {
    const [, bump] = useState(0);
    if (DEAD_SPRITES.has(src)) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable="false" className={className}
            onError={() => { DEAD_SPRITES.add(src); bump((n) => n + 1); }} />
    );
}

// ── THE NUMBER IS COUNTED, NOT PRINTED ───────────────────────────────────────────────────────────────────────
// A total that appears is a receipt. A total that RUNS is the machine paying you, and the two are the same
// number — the only difference is the ~1.4s of climbing, which is the part worth sitting through. Eased out,
// so it sprints and then savours the last few hundred, and it ticks a coin every fourth frame on the way.
function Tally({ n, ms = 1500 }) {
    const [at, setAt] = useState(0);
    useEffect(() => {
        // No reset on the zero path: `at` is already 0 and a synchronous setState in an effect is a
        // cascading render for a value that was right at first paint.
        if (!n) return undefined;
        let raf = 0, t0 = 0, tick = 0;
        const step = (t) => {
            if (!t0) t0 = t;
            const k = Math.min(1, (t - t0) / ms);
            const e = 1 - Math.pow(1 - k, 3);
            setAt(Math.round(n * e));
            tick += 1;
            if (tick % 4 === 0 && k < 1) Cas.coin(Math.round(k * 8) - 2);
            if (k < 1) raf = requestAnimationFrame(step); else Cas.coins(0.6);
            };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [n, ms]);
    return <>{at.toLocaleString()}</>;
}

// The strip a reel runs before it stops: filler, then the three symbols it is actually going to show.
//
// THE FILLER COMES FROM THAT REEL'S OWN STRIP, not from the machine's symbol list. On The Hunt the wild is
// weighted 0 on reels one and five — that is what makes five-of-a-kind affordable — so a generic filler
// showed wolves spinning past in columns they can never land in, and stood one at the top of reel one while
// the machine sat idle. The cabinet next door already has this written on it: a machine teasing a symbol
// that is not on its reels is the one thing a paytable must never do.
//
// Weighted, too, so the blur is made of the symbols this reel is actually full of.
function stripFor(bag, land) {
    const keys = Object.keys(bag).filter((k) => bag[k] > 0);
    const total = keys.reduce((a, k) => a + bag[k], 0);
    const draw = () => {
        let r = Math.random() * total;
        for (const k of keys) { r -= bag[k]; if (r <= 0) return k; }
        return keys[keys.length - 1];
    };
    return [...Array.from({ length: 9 }, draw), ...land];
}

// ── WHAT THE RUN IS DOING, IN NUMBERS ────────────────────────────────────────────────────────────────────────
// These MUST match `@keyframes s5Run` in globals.css (.33s, -9 cells to -3 cells = six cells a cycle). The
// brake is derived from the run's own pace, so if that keyframe is ever retuned, retune these with it.
const RUN_MS = 330;
const RUN_CELLS = 6;
// Milliseconds per pixel of travel, as a multiple of what the run would take. Higher = a gentler stop. See
// the note in measureBrake for why this is above 1.
const BRAKE = 1.45;

export default function Slot5({ machineId = "slot", lines, onSpin, onSettled, chips, bet, onBet, rate = 0.25, stakes = [25, 100, 500, 2500], owner, art, busy }) {
    const [grid, setGrid] = useState(null);        // what is on screen now
    const [spinning, setSpinning] = useState(false);
    const [landed, setLanded] = useState(0);       // how many reels have come to rest
    // ── THE STOP CONTINUES THE RUN, IT DOES NOT RESTART IT ───────────────────────────────────────────
    // `s5Run` loops the strip between -9 and -3 cells; `s5Settle` used to start from a FIXED -3. The class
    // flips on a timer, so whenever it flipped mid-loop the strip SNAPPED to -3 to begin settling. Traced on
    // the real page: the last reel jumped 116.6px in a single frame against a ~31px run frame. That is a
    // visible jolt on every reel of every spin, and it is what check:feel means by "it kicks, it does not
    // brake".
    //
    // Two numbers, both measured rather than assumed:
    //
    //   --s5from   where the run actually was on the stopping frame. No jump, because the settle begins
    //              exactly where the run left off.
    //   --settle   how long to cover that distance. DERIVED, because the distance now varies from 3 to 9
    //              cells depending on where the loop was caught — a fixed duration with a variable distance
    //              is the same bug wearing a different hat.
    const [brake, setBrake] = useState({});
    const reelEls = useRef([]);
    const measureBrake = useCallback((k) => {
        const el = reelEls.current[k];
        const strip = el?.querySelector(".s5-strip");
        if (!strip) return null;
        // FROM LAYOUT, not from --s5cell. getComputedStyle hands back the raw token stream for an
        // UNREGISTERED custom property — --s5cell reads back as the literal string "clamp(46px, 17vw, 74px)"
        // and parseFloat of that is NaN. Verified on the page. The reel is exactly three cells tall.
        const cell = el.getBoundingClientRect().height / 3;
        if (!(cell > 0)) return null;
        const from = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42;
        const dist = Math.abs(from);
        if (!dist) return null;
        const runPerMs = (RUN_CELLS * cell) / RUN_MS;
        // BRAKE opens the stop BELOW the run rather than level with it. A stop that begins at exactly the
        // running speed still reads as a kick, because the curve's opening slope multiplies the average and
        // the average is what the duration sets. 1.45 puts the first instant of the settle at roughly
        // seven-tenths of the run and every instant after it slower — which is what braking looks like.
        const ms = Math.round((dist / runPerMs) * BRAKE);
        return { from, ms: Math.max(220, Math.min(900, ms)) };
    }, []);
    const [result, setResult] = useState(null);    // the whole server response
    const [showLine, setShowLine] = useState(-1);  // which winning line is being drawn
    // ── THE LOCK FOLLOWS THE CELEBRATION ─────────────────────────────────────────────────────────────────
    // Luke, earlier: "you shouldn't be able to spin while it's spinning or counting up after the spin." That
    // was enforced by comparing a locally-ticked counter against the total — which was fine while the count
    // was always ~880ms and wrong the moment WinTally made it depend on the size of the win. A COLOSSAL WIN
    // holds the screen for six seconds; the button would have come back after one, over the top of it.
    //
    // So there is one flag and the celebration owns it: raised when the reels finish on a paying spin, and
    // dropped by WinTally itself when the number has landed and its held beat is over. Whatever the tiers do
    // to the timing from now on, the button agrees with the screen.
    const [celebrating, setCelebrating] = useState(false);
    // What the colossal cabinet wants shown on its panel — see ColossalReels' onReadout.
    const [colReadout, setColReadout] = useState(null);
    const [phase, setPhase] = useState("idle");    // idle | spin | lines | free | pick | gems | done

    // Win It Again: the payout the row is currently counting out, and what to do once it has. See the note
    // beside `rest` in the spin handler.
    const [meterFire, setMeterFire] = useState(null);
    // ── THE ROW ONLY MOVES WHEN THE SPIN IS OVER ─────────────────────────────────────────────────────
    // Luke: "what the heck is Win It Again tracking — I'd expect 21 to have been pushed into the top left
    // box." He was watching a cascade two breaks in with 21 chips on the counter, and the row already read
    // 82 in slot one: the spin's FINAL reel total, printed before the reels had finished paying it.
    //
    // Same leak as the gem bonus had. The server settles the whole spin the instant you press the button,
    // and anything on screen drawn straight off that response is the machine telling you the answer while
    // it is still pretending to work it out. The row is held at what it said before the pull and advances
    // in `after()`, when the last cascade has been paid and the number on the counter is the number that
    // went into the slot.
    const [shownMeter, setShownMeter] = useState(null);
    const afterMeter = useRef(null);
    const [pays, setPays] = useState(false);       // is the paytable open
    const [freeIdx, setFreeIdx] = useState(-1);    // which free spin is on screen
    // ── MUSIC UNDER THE BONUS ────────────────────────────────────────────────────────────────────────────
    // Luke: "there's different music that plays during the bonus picker and the actual bonus spins."
    //
    // The two beds are opposite on purpose — the picker is slow and suspended because nothing has been
    // decided yet, the round is driving because it is happening to you — so walking from one screen into
    // the next is audible with your eyes shut. Every other phase is silent: a base spin is over in two
    // seconds and does not want a soundtrack, and music that never stops stops being an event.
    //
    // Derived from `phase` rather than started and stopped by hand at each site. Every path out of a bonus
    // — finishing it, a retrigger, closing the modal mid-round — already sets a phase, so a phase-derived
    // bed cannot be left playing behind a screen that has gone. `music()` no-ops when the bed is unchanged,
    // so this effect re-running is free.
    // ── AND IT MUST NOT FLICKER ──────────────────────────────────────────────────────────────────────
    // A cascading free spin walks free -> tumble -> free several times a spin, and the first cut restarted
    // the bed on every one of those — which is what put two tracks on top of each other before the bus fix,
    // and would still restart the tune from bar one four times a round after it. `freeIdx >= 0` is only
    // true while a round is actually being played, so a base-game tumble cannot start bonus music.
    const musicBed = phase === "pick" || phase === "build" || phase === "warren" || phase === "gems" ? "pick"
        : phase === "free" || phase === "freeIntro" || (phase === "tumble" && freeIdx >= 0) ? "free"
        : null;
    useEffect(() => { Cas.music(musicBed); }, [musicBed]);
    useEffect(() => () => Cas.music(null), []);
    const [freeWon, setFreeWon] = useState(0);     // chips taken so far in the round
    // Whichever win list is currently being drawn — the base spin's, or the free spin on screen. `lit` reads
    // this rather than the base result, which is what lets a free spin light its own lines.
    const [activeWins, setActiveWins] = useState([]);
    // The symbol currently being flashed because it just triggered something — the scatter before the free
    // round, the chest before the pick. Null the rest of the time.
    const [flashSym, setFlashSym] = useState(null);
    // ── THE TUMBLE ───────────────────────────────────────────────────────────────────────────────────
    // `breaking` is the cells mid-shatter; `dropping` is the cells that have just fallen in and want their
    // entrance animation. Both are cleared as the chain advances — a cascade is a sequence of short states
    // rather than one long one, which is what lets each break read as its own event.
    const [breaking, setBreaking] = useState([]);
    const [dropping, setDropping] = useState([]);
    const [chainAt, setChainAt] = useState(-1);
    // The chain being played inside a FREE spin, if any — so the multiplier badge and the break counter
    // work in the free round exactly as they do in the base game.
    const [freeChain, setFreeChain] = useState(null);
    // The retrigger being shouted about, or null. Its own state rather than a phase, because the round is
    // still running underneath it — this is a beat inside the free spins, not a screen instead of them.
    const [gotMore, setGotMore] = useState(null);
    // The reel being held and the symbol it is held for, or null. Drives the glow on the reel that is still
    // running and the pulse on the symbols that got you this far.
    const [tease, setTease] = useState(null);
    // Which round is on screen — "free" (the scatter round) or "locked" (the ten spins where wilds weld).
    const [round, setRound] = useState("free");
    // The cells holding a locked wild, so the grid can draw them as welded rather than as landed.
    const [lockedAt, setLockedAt] = useState([]);
    const [pearlAt, setPearlAt] = useState([]);   // cells where a collector landed, marked for the whole spin
    // What the pearls on THIS spin just added, so the medallion can show the step arriving rather than
    // silently being a different number than it was. Zero means nothing is in flight.
    const [pearlFlew, setPearlFlew] = useState(0);
    // ── THE PEARL ITSELF FLIES INTO THE MULTIPLIER ─────────────────────────────────────
    // Luke: "pearls should animate a shiny pearl into the multiplier."
    //
    // It was a "+1" text badge popping onto the medallion, which says the same thing and shows nothing. The
    // pearl is a DRAWN OBJECT and it is sitting on the reel a few inches away, so the honest version is that
    // the object travels: it lifts off the cell it landed on and lands in the number it is about to raise.
    //
    // Measured rather than guessed. Both ends are real elements at spin time, so the flight is computed from
    // their bounding rects and handed to CSS as a delta — which is the only way to get it right on a grid
    // that resizes with the cabinet, and it means one keyframe serves a pearl landing anywhere on either
    // outside reel.
    const [fliers, setFliers] = useState([]);
    const multRef = useRef(null);
    const gridRef = useRef(null);
    // The free round's collector symbol, if this cabinet has one. Null everywhere but The Deep.
    const plusSym = useMemo(() => slot5(machineId).free?.plus?.sym || null, [machineId]);
    // Which reels a collector can land on — The Deep's two outside reels. Marked on the glass for the whole
    // round rather than only at the instant something lands on them; see the note on `.s5-reel.is-collector`.
    const plusReels = useMemo(() => slot5(machineId).free?.plus?.reels || [], [machineId]);
    const [chainWon, setChainWon] = useState(0);
    const timers = useRef([]);

    // ── WHAT THE OVERLAY DRAWS, AND EXACTLY HOW LONG FOR ────────────────────────────────────────────────
    // The held wilds are furniture for the duration of the round and then they are gone — "floating there the
    // whole time until they're dismissed by the game after the free spins". `freeDone` is the tally, which is
    // still the round, so the board is still bolted down behind it; anything after that is the base game and
    // the board must be ordinary again. Derived rather than stored so there is exactly one rule about when
    // they exist, instead of a second piece of state that can disagree with `lockedAt`.
    const inRound = phase === "free" || phase === "freeIntro" || phase === "freeDone";
    const heldWilds = inRound ? lockedAt : [];

    // Where this bet sits in the ladder, so the stepper can move along it. Derived rather than stored: the
    // bet is owned by the room (every cabinet shares it) and a second copy here would drift from it.
    const betIndex = Math.max(0, stakes.indexOf(bet));
    // ── AND YOU CANNOT PULL WHAT YOU CANNOT PAY FOR ──────────────────────────────────────────────────────
    // The server has always refused an unaffordable spin, but the button did not, so pressing it did
    // NOTHING: the reels sat still, no sound, no message, and the only way to work out why was to look at
    // the balance and do the arithmetic yourself. A control that is live and does nothing is worse than one
    // that is plainly off — the second tells you something, the first reads as a broken machine.
    // ── AFFORDABILITY IS A CHIP QUESTION ─────────────────────────────────────────────────────────────────
    // This read GOLD, and the machine charges CHIPS. On a chips-only floor that is not a cosmetic mismatch:
    // `locked` includes `broke`, so the spin button went disabled and said NOT ENOUGH to anybody whose gold
    // had run down, no matter how many chips they were holding. Brecken22 was sitting on 4,114 chips and 92
    // gold — the floor's heaviest player that day, locked out of every machine on it.
    // The number the button asks about must be the number the server subtracts.
    const broke = Number(chips ?? 0) < Number(bet ?? 0);
    // ── AND NOT WHILE ANYTHING IS STILL PLAYING ──────────────────────────────────────────────────────────
    // Luke: "You shouldn't be able to spin while it's spinning or counting up after the spin."
    //
    // This listed the phases it wanted to block, and so it blocked the ones somebody had remembered:
    // "pick" was in the list, and "lines", "tumble", "free", "freeIntro", "freeDone", "build", "warren" and
    // "trigger" were not. Pressing SPIN mid-round cut a bonus off at the knees and started a new spin over
    // the top of it. And the count-up was not covered at all — the reels had stopped, the number was still
    // climbing, and a second pull threw away the end of the win the member was watching arrive.
    //
    // Stated the other way round now: the machine is only free when nothing is happening. A new phase added
    // tomorrow is locked by default instead of being unlocked by omission, which is the difference between
    // a rule and a list.
    // `atRest`, not `idle` — `idle` is already the reels' resting faces further down this file, and a
    // second one would shadow it.
    const counting = celebrating;
    const atRest = phase === "idle" || (phase === "done" && !counting);
    const locked = busy || spinning || !atRest || broke;
    // ── BEING BROKE MUST NOT FREEZE THE STEPPER ──────────────────────────────────────────────────────────
    // `locked` disabled the − and + as well as SPIN, so a player short of chips could not step DOWN to a
    // stake they COULD afford — while the message directly above the panel said "or step the bet down".
    // The stepper is the way out of the state; locking it makes the machine's own advice impossible to take.
    // Mid-spin still freezes it: changing the stake while the reels are turning changes what is being paid.
    const stepLocked = busy || spinning || !atRest;

    // ── AND THE PURSE IS TOLD WHEN THE MACHINE HAS FINISHED TALKING ──────────────────────────────────────
    // The five-reel cabinets do their whole reveal in here — reels landing one at a time, then a bonus round,
    // then a payout counting up — so the page above cannot know when it is over. It held the win back and had
    // nothing to release it. `atRest` is already the exact condition (idle, or done and no longer counting),
    // and it is the same flag the spin button waits on, so the balance can never arrive before the machine
    // will let you pull again. Only fires on the way BACK to rest, not on the first mount.
    const wasSpinning = useRef(false);
    useEffect(() => {
        if (!atRest) { wasSpinning.current = true; return; }
        if (!wasSpinning.current) return;
        wasSpinning.current = false;
        onSettled?.();
    }, [atRest, onSettled]);
    const step = (d) => {
        const next = stakes[Math.min(stakes.length - 1, Math.max(0, betIndex + d))];
        if (next !== bet) { onBet?.(next); Cas.chips(); }
    };

    const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
    useEffect(() => () => clearTimers(), [clearTimers]);

    // One bag per reel, off the machine's real strips — see stripFor.
    const strips = useMemo(() => slot5(machineId).strips, [machineId]);
    // Does this cabinet tumble? Decides whether the owner row offers a forced chain.
    const cascades = useMemo(() => Boolean(slot5(machineId).cascade), [machineId]);
    // The multiplier the chain has climbed to. Read straight off the step on screen rather than kept in its
    // own state, so it can never disagree with the grid it is sitting on top of.
    // ── AND IT STAYS UP FOR THE PAYOUT ───────────────────────────────────────────────────────────────
    // Both of these used to be tied to `phase === "tumble"` and so vanished on the frame the chain ended,
    // which is the frame the payout starts counting. The ladder climbed to x20, the x20 disappeared, and
    // then a number arrived with nothing on screen explaining where it came from. A multiplier is the
    // REASON for the payout; it has to still be there when the payout lands.
    // A chain can now be running in either place — the base spin, or a free spin — so both the badge and
    // the counter read whichever one is live rather than only the base result's.
    // ── HOW LONG THE ROUND IS, AS FAR AS THE PLAYER KNOWS ────────────────────────────────────────────────
    // The server sends the finished round, so `spins.length` is the length AFTER every retrigger — and the
    // bar read "1 / 56 +42" on the first spin of a round that had not retriggered yet. Three retriggers
    // spoiled before one of them happened, which is the same mistake as the hold showing its final total
    // from frame one and the free round's payout printing before the round: the ending laid over the
    // beginning.
    //
    // Counted from the spins ALREADY PLAYED instead, so the number grows when the shout says it does.
    const roundGrew = (result?.[round]?.spins || [])
        .slice(0, Math.max(0, freeIdx + 1))
        .reduce((a, sp) => a + (sp.retrigger?.spins || 0), 0);
    const roundLen = (result?.[round]?.base || result?.[round]?.spins?.length || 0) + roundGrew;
    // The same sum over the WHOLE round rather than the walked prefix — the bar counts up as you go, the
    // tally at the end reports what the round finally was.
    const tallyGrew = (result?.[round]?.spins || []).reduce((a, sp) => a + (sp.retrigger?.spins || 0), 0);

    const liveChain = freeChain || ((phase === "tumble" || phase === "done") ? result?.chain : null);
    const chaining = Boolean(liveChain) && (phase === "tumble" || phase === "free" || phase === "done");
    const mult = (chaining && liveChain?.steps[Math.max(0, chainAt)]?.mult) || 1;

    // ── A MACHINE NOBODY IS PLAYING SITS STILL ───────────────────────────────────────────────────────
    // Luke: "dont have this screen iterate over random symbols when you arent playing it."
    //
    // It did, and it was not an animation — it was a bug that looked like one. `stripFor` was being called
    // INSIDE the render, so every re-render drew a fresh set of random symbols, and this screen re-renders
    // for reasons that have nothing to do with the reels: the Pot ticking up, the purse changing, a message
    // arriving. The machine appeared to be idly playing itself in front of you, which is both wrong and a
    // small lie about what a reel does when it is not moving.
    //
    // Both faces are drawn ONCE and held. `idle` is what the machine shows before its first spin and never
    // changes; `filler` is the blur a reel runs during a spin, regenerated in pull() so two spins in a row
    // do not run the same picture past you — but regenerated on a TAP, not on a render.
    const [idle] = useState(() => slot5(machineId).strips.map((bag) => stripFor(bag, []).slice(0, ROWS)));
    const [filler, setFiller] = useState(() => slot5(machineId).strips.map((bag) => stripFor(bag, [])));

    // ── THE SYMBOLS THAT DID IT, BEFORE THE THING THEY DID ───────────────────────────────────────────────
    // Luke: "the payline triggering a bonus should be glowing and flashing before the bonus triggers."
    //
    // The moons landed and then a card appeared. Nothing on the machine ever connected the two, so the bonus
    // arrived as an announcement rather than as a consequence — and the three symbols that had just done the
    // rarest thing on the reels sat there looking like every other symbol.
    //
    // A slot's whole grammar is that the reels tell you and the screen confirms it. So the triggering symbols
    // pulse, one sound each in rising pitch as they light, everything else dims, and only then does the round
    // begin. It is a beat and a half, and it is the difference between being told you won a bonus and
    // watching yourself win one.
    const flashTrigger = useCallback((sym, then) => {
        setPhase("trigger");
        setFlashSym(sym);
        // One ding per symbol, climbing. Three moons is three notes going up — the oldest trick there is for
        // "something is being counted, and it is not finished yet".
        for (let i = 0; i < 5; i += 1) {
            timers.current.push(setTimeout(() => Cas.coin(i * 2), 120 + i * 190));
        }
        Haptic.hit(0.4);
        timers.current.push(setTimeout(() => { setFlashSym(null); then(); }, 1450));
    }, []);

    // ── PLAYING ONE GRID ─────────────────────────────────────────────────────────────────────────────────
    // Reels in from the left, then every winning line drawn in turn. The base spin and every free spin go
    // through this, on different clocks, which is the only reason they feel like the same machine — the
    // alternative is two playback routines that drift apart, and the free one had already drifted into
    // having no lines at all.
    // ── WHICH REELS ARE ONE SYMBOL SHORT ─────────────────────────────────────────────────────────────────
    // Luke: "if you almost hit a bonus or a scatter... we should highlight the icons that give you the bonus
    // that are already set and then have an effect... it's definitely also like a sound that plays to let you
    // know you're getting close. And it does that for each reel until it's out of reels."
    //
    // This is the most important thing a slot machine does and we had a stub of it: one riser, fired only if
    // reel three happened to have landed two scatters, with nothing on screen at all.
    //
    // Walked reel by reel BEFORE anything moves, off the grid the server already sent. For each reel, count
    // what landed in the reels before it; if that count is exactly one short of opening something, this reel
    // is live and the machine holds its breath. It stays live on every following reel until the symbol lands
    // or the reels run out — which is exactly "for each reel until it's out of reels", and it is why a
    // two-scatter spin can hold you three separate times.
    const teaseFor = useCallback((g) => {
        const m = slot5(machineId);
        const targets = [
            { sym: m.scatter, need: 3, line: Boolean(m.lineTrigger) },
            m.second?.kind === "hold"
                ? { sym: m.second.trigger, need: m.second.need || 6 }
                : { sym: m.bonus, need: 5 },
        ].filter((t) => t.sym);
        const out = [];
        for (let k = 0; k < REELS; k += 1) {
            let live = null;
            for (const t of targets) {
                // ── A TEASE MUST BE A PROMISE THE MACHINE CAN KEEP ───────────────────────────────────
                // Luke: "it's slow rolling like I can get the bonus when I can't." Dead right, and it was
                // this: the tease counted scatters ANYWHERE on the reels so far, which is the correct rule
                // for a scatter-anywhere trigger and the wrong one for The Harvest, whose bonus needs three
                // moons on a PAYLINE from reel one. Two moons on rows that share no line can never be
                // completed by a third, and the machine was slow-rolling the reel anyway — the single most
                // dishonest thing a slot can do, because the whole point of a held reel is that it means
                // something.
                //
                // For a line trigger, a reel is live only if some line still has the scatter on EVERY reel
                // behind it. That is the same walk `evaluate` does to decide the trigger, so the tease and
                // the payout can no longer disagree about what is possible.
                if (t.line) {
                    if (k !== t.need - 1) continue;
                    const open = LINES.some((line) => {
                        for (let r = 0; r < k; r += 1) if (g[r][line[r]] !== t.sym) return false;
                        return true;
                    });
                    if (open) { live = t.sym; break; }
                    continue;
                }
                let soFar = 0;
                for (let r = 0; r < k; r += 1) soFar += g[r].filter((x) => x === t.sym).length;
                if (soFar === t.need - 1) { live = t.sym; break; }
            }
            out.push(live);
        }
        return out;
    }, [machineId]);

    const playGrid = useCallback((g, wins, opts) => {
        const { stopAt, settle, lineMs, onDone, onLanded } = opts;
        setGrid(g);
        setLanded(0); setBrake({});
        setShowLine(-1);
        setActiveWins(wins);
        setTease(null);

        // ── AND A HELD REEL RUNS LONGER ──────────────────────────────────────────────────────────────────
        // A reel that could open something does not stop on time, and everything after it is pushed back by
        // the same amount — so the hold is added to the clock rather than stolen from the next reel. Each
        // successive hold is longer than the last, because a second hold the same length as the first reads
        // as the machine repeating itself instead of as the tension climbing.
        const tease = teaseFor(g);
        const landsAt = [];
        let extra = 0;
        let held = 0;
        for (let k = 0; k < REELS; k += 1) {
            if (tease[k]) { held += 1; extra += 950 + (held - 1) * 420; }
            landsAt.push(stopAt[k] + settle + extra);
        }

        const allDown = (after) => timers.current.push(setTimeout(() => {
            // The instant every reel is down and before any line is drawn — where a wild welds itself to
            // the board, so the clamp reads as part of the landing rather than as part of the payout.
            if (onLanded) onLanded();
            if (!wins.length) { onDone(); return; }
            wins.forEach((_, i) => {
                timers.current.push(setTimeout(() => { setShowLine(i); Cas.coin(i % 5); }, i * lineMs));
            });
            timers.current.push(setTimeout(() => { setShowLine(-1); onDone(); }, wins.length * lineMs));
        }, after));

        for (let k = 0; k < REELS; k += 1) {
            const at = landsAt[k];
            // The hold begins when the PREVIOUS reel lands — the first moment the player can see they are one
            // short — and the riser is handed the exact gap remaining, so it resolves on the beat the reel
            // stops rather than finishing early and leaving a hole.
            if (tease[k]) {
                const from = k === 0 ? 0 : landsAt[k - 1];
                timers.current.push(setTimeout(() => {
                    setTease({ reel: k, sym: tease[k] });
                    Cas.anticipate(at - from);
                    Haptic.hit(0.25);
                }, from));
            }
            timers.current.push(setTimeout(() => {
                // MEASURED FIRST. This runs before React re-renders, so the strip is still mid-run and the
                // transform is the live one — read it after the class flips and it is already the settle's.
                const b = measureBrake(k);
                if (b) setBrake((prev) => ({ ...prev, [k]: b }));
                // ── AND THE PAYOUT WAITS FOR THE LAST REEL, NOT FOR A CONSTANT ───────────────────────
                // The brake's LENGTH is derived now (see measureBrake), so it runs anywhere from 240ms to
                // 900ms depending on where the loop was caught. The lines used to be drawn at a fixed
                // offset from this timer, which was only correct while every settle was exactly 340ms —
                // against a measured one they can start half a second before the last reel has stopped
                // moving. So the whole "everything is down" beat is scheduled from HERE, off the number
                // that was actually measured, and still lands the same 230ms after the reel truly rests.
                if (k === REELS - 1) allDown((b?.ms ?? settle) + 230);
                setLanded(k + 1);
                // ── THE CLUNK BELONGS AT REST, NOT AT THE START OF THE BRAKE ─────────────────────────
                // This timer fires when the reel BEGINS to settle. The settle itself is measured (see
                // measureBrake) and runs anywhere from 220ms to 900ms depending where the loop was caught,
                // so playing the stop here put the sound up to nine-tenths of a second before the reel
                // actually came to rest — the reel was still visibly moving when you heard it land.
                // Luke: "the slots sound of the reel stopping isnt synced with the real stopping."
                //
                // Same number the payout already waits on. The brake's length was measured for exactly
                // this reason and the audio was the one thing still reading from the old constant.
                const rest = b?.ms ?? settle;
                const atRest = (fn) => timers.current.push(setTimeout(fn, rest));
                if (!tease[k]) {
                    atRest(() => {
                        Cas.reelStop(k, k === REELS - 1 ? 0.85 : 0.4);
                        Haptic.hit(k === REELS - 1 ? 0.5 : 0.3);
                    });
                    return;
                }
                // Did it come? Both answers are loud — a hold that resolves quietly either way was not a
                // hold, it was a pause. The miss is deliberately short and soft though: most of them miss,
                // and a machine that mourns every one of them is exhausting by the tenth.
                //
                // The TEASE clears now — that is the reel arriving, and the held symbol has to stop
                // flashing the moment it does — but the verdict still lands with the reel.
                setTease(null);
                if (g[k].includes(tease[k])) atRest(() => { Cas.reelStop(k, 1); Haptic.crit(); });
                else atRest(() => { Cas.nearMiss(); Haptic.hit(0.5); });
            }, at));
        }
    }, [teaseFor, measureBrake]);

    // ── PLAYING A CASCADE ────────────────────────────────────────────────────────────────────────────────
    // Press once and the machine argues with itself. Each break is four beats, and they are separately
    // timed on purpose — a tumble where everything happens at the same speed is an animation, and a tumble
    // where the shatter is sharp and the fall has weight is a machine:
    //
    //   land   the grid arrives and its wins light
    //   break  the winning cells shatter (fast — it should feel like something snapping)
    //   fall   the next grid replaces it and the new symbols drop in from above
    //   hold   a beat to read the multiplier before the next one starts
    //
    // Recursive rather than a queue of timers, so a new spin cuts it cleanly instead of leaving six queued
    // breaks to land on top of the next game.
    const runChain = useCallback((chain, i) => {
        if (!chain || i >= chain.steps.length) {
            setBreaking([]); setDropping([]);
            return Promise.resolve();
        }
        const st = chain.steps[i];
        setChainAt(i);
        setGrid(st.grid);
        setActiveWins(st.wins);
        setDropping(i === 0 ? [] : (chain.steps[i - 1].broken || []));
        setBreaking([]);
        // A RUNNING TOTAL, SET NOT ADDED. Each step carries what the whole spin is worth so far (see the
        // note on the server side), so adding them would count every break as many times as breaks remain.
        setChainWon(st.chips);

        // ── AND IT ACCELERATES ───────────────────────────────────────────────────────────────────────
        // The first version held every break for 920ms and the chain read as a slideshow: a line lit, sat
        // there for two-thirds of a second saying "4 Syrup Cake — 2 chips", and only then broke. Nobody
        // reads that line. They are watching the multiplier.
        //
        // Real cascade cabinets SPEED UP as the chain deepens, and it is the single cheapest piece of drama
        // available — the machine sounding more urgent the longer it goes is the same information as the
        // multiplier, delivered by tempo instead of by a number. Six breaks now costs what four used to.
        const rush = Math.max(0.52, 1 - i * 0.13);
        return new Promise((done) => {
            // Light the wins on this grid.
            timers.current.push(setTimeout(() => {
                if (!st.broken.length) { setActiveWins([]); done(); return; }
                setShowLine(0);
                Cas.coin(Math.min(4, i));
                // Then break them.
                timers.current.push(setTimeout(() => {
                    setShowLine(-1);
                    setBreaking(st.broken);
                    Cas.reelStop(Math.min(4, i), 0.5);
                    Haptic.hit(0.3 + Math.min(0.5, i * 0.08));
                    // And let the next grid fall into the hole.
                    timers.current.push(setTimeout(() => {
                        runChain(chain, i + 1).then(done);
                    }, 230 * rush));
                }, 330 * rush));
            }, (i === 0 ? 120 : 190) * rush));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── PULLING ──────────────────────────────────────────────────────────────────────────────────────────
    const pull = useCallback(async (force) => {
        if (busy || spinning) return;
        unlock();
        clearTimers();
        setResult(null); setShowLine(-1); setCelebrating(false); setLanded(0); setBrake({});
        setFreeIdx(-1); setFreeWon(0);
        setChainAt(-1); setChainWon(0); setBreaking([]); setDropping([]);
        setPhase("spin"); setSpinning(true);
        setFiller(strips.map((bag) => stripFor(bag, [])));
        Cas.pull();

        // The middle deal, always — see the note where the chooser used to be.
        const r = await onSpin("mid", typeof force === "string" ? force : null);
        if (!r?.ok) { setSpinning(false); setPhase("idle"); return; }

        setResult(r);
        setGrid(r.grid);
        setSpinning(false);

        // ── WHAT HAPPENS AFTER THE REELS STOP ────────────────────────────────────────────────────────
        // Lines first, then the free round if there is one, then the pick. Sequenced here so a spin that
        // pays lines AND triggers both features still plays them in an order somebody can follow.
        // ── THE METER GOES FIRST, THEN WHATEVER ELSE THE SPIN OPENED ─────────────────────────────────
        // Three tumbles in one spin is what fires the row, so the row has to be paid before the screen moves
        // on to a scatter bonus that happened on the same pull. `rest` is held on a ref and called by the
        // bar when its lights have finished walking — a callback rather than a timer, because the animation
        // owns how long it takes and this code should not be holding a second opinion about that.
        const rest = () => {
            const m = slot5(machineId);
            if (r.built) { flashTrigger(m.scatter, () => setPhase("build")); return; }
            // The Vault's scatter opens a collection rather than a round — see runGems.
            if (r.gems) { flashTrigger(m.scatter, () => setPhase("gems")); return; }
            if (r.free) { flashTrigger(r.free.byCascade ? null : m.scatter, () => announceFree(r)); return; }
            if (r.hold) { flashTrigger(r.hold.trigger, () => setPhase("pick")); return; }
            if (r.warren) { flashTrigger(m.bonus, () => setPhase("warren")); return; }
            if (r.locked) { flashTrigger(m.bonus, () => announceFree(r, "locked")); return; }
            setPhase("done");
        };
        const after = () => {
            // The reels have finished paying, so the row may now say what they paid — see shownMeter.
            if (r.meter) setShownMeter(r.meter);
            if (r.meter?.fired) { afterMeter.current = rest; setMeterFire(r.meter.fired); return; }
            rest();
        };

        // A CASCADING MACHINE TUMBLES INSTEAD OF DRAWING LINES. The reels still land the same way; what
        // follows is a chain rather than a list of lines to light one at a time.
        if (r.chain) {
            playGrid(r.grid, [], {
                stopAt: STOP_AT, settle: SETTLE_MS, lineMs: LINE_MS,
                onDone: () => { setPhase("tumble"); runChain(r.chain, 0).then(after); },
            });
            return;
        }

        playGrid(r.grid, r.lines, {
            stopAt: STOP_AT, settle: SETTLE_MS, lineMs: LINE_MS,
            onDone: () => {
                const m = slot5(machineId);
                if (r.built) { flashTrigger(m.scatter, () => setPhase("build")); return; }
                if (r.gems) { flashTrigger(m.scatter, () => setPhase("gems")); return; }
                if (r.free) { flashTrigger(m.scatter, () => announceFree(r)); return; }
                // The symbol that opened it — a hold's coin, or the bonus symbol for the locking round.
                // Flashing the wrong one is worse than flashing none.
                if (r.hold) { flashTrigger(r.hold.trigger, () => setPhase("pick")); return; }
                if (r.warren) { flashTrigger(m.bonus, () => setPhase("warren")); return; }
                if (r.locked) { flashTrigger(m.bonus, () => announceFree(r, "locked")); return; }
                setPhase("done");
            },
        });
    // `announceFree` is deliberately NOT in this list. It is declared BELOW this hook, and a dependency
    // array is evaluated during render rather than when the callback runs — so naming it here throws a TDZ
    // error on the first paint, while calling it from inside the body (a closure, evaluated later) is fine.
    // This file has made that exact mistake before; `npm run lint:undef` is what catches it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busy, spinning, onSpin, clearTimers, playGrid, flashTrigger, machineId, runChain]);

    // ── THE MOON IS UP ───────────────────────────────────────────────────────────────────────────────────
    // Luke: "i didn't even know that I got the free Spin bonus because there was nothing, nothing popped off
    // in like celebrated for me."
    //
    // He is right and it was the worst omission on the machine. Free spins arrive once in ninety-three spins;
    // it is the rarest thing that happens here and it was being delivered as a small brown card with a
    // sentence on it. A bonus round that does not announce itself is a bonus round nobody knows they had.
    //
    // So the room stops. A full-cabinet card, the fanfare, a hard haptic, and a beat of nothing else — and
    // then the round runs, rather than the round having already run somewhere off screen.
    // `which` is "free" or "locked" — the scatter round or the ten locking spins. Both are the same shape
    // and both play through the same runner, because they ARE the same thing: a round of spins watched one
    // at a time. A spin that triggers both plays them back to back.
    const announceFree = useCallback((r, which = "free") => {
        setRound(which);
        setPhase("freeIntro");
        setFreeWon(0);
        setFreeIdx(-1);
        setLockedAt([]);
        // The board starts the round bare. Without these a round opening straight after another one would
        // begin with the previous round's pearls still marked on the glass.
        setPearlAt([]);
        setPearlFlew(0);
        Cas.jackpot();
        Haptic.crit();
        timers.current.push(setTimeout(() => runFree(r, 0, which), 2100));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── AND THEN YOU WATCH IT ────────────────────────────────────────────────────────────────────────────
    // One spin at a time, on the fast clock, with the total climbing. Recursive rather than a loop of timers
    // so a round can be cut short cleanly — clearTimers on a new pull stops it wherever it is instead of
    // leaving eight queued spins to land on top of the next game.
    const runFree = useCallback((r, i, which = "free") => {
        const round = r[which];
        if (!round || i >= round.spins.length) {
            setActiveWins([]);
            // A spin that opened BOTH rounds plays the scatter one and then the locking one, rather than
            // the second silently vanishing into the total.
            if (which === "free" && r.locked) { announceFree(r, "locked"); return; }
            // The tally is the curtain call, so it gets the fanfare rather than arriving in silence.
            Cas.signature(); Haptic.crit();
            setPhase("freeDone");
            return;
        }
        const sp = round.spins[i];
        setPhase("free");
        setFreeIdx(i);
        // The wilds already welded to the board when this spin starts. Set BEFORE the reels move so they
        // are drawn locked from the first frame — a held wild that only reveals itself after the reels
        // stop is not held, it just landed again.
        setLockedAt(sp.held || []);

        // What happens once this spin has finished playing: credit it, sound it, and — if it bought more
        // spins — stop and SAY SO before moving on.
        const settle = () => {
            if (sp.chips > 0) {
                setFreeWon((n) => n + sp.chips);
                // A big one inside the round gets the horns, the same as it would in the base game. A
                // round where every spin sounds identical is a round with no shape to it.
                if (sp.multiple >= BIG_WIN_AT) { Cas.jackpot(); Haptic.crit(); }
                else { Cas.coins(Math.min(1, sp.chips / 400)); Haptic.hit(0.35); }
            }
            // ── AND MORE SPINS, IF IT BOUGHT THEM ────────────────────────────────────────────────────
            // Luke, on the free round arriving with no fanfare: "I didn't even know that I got the free
            // Spin bonus because there was nothing... popped off." A retrigger has exactly that problem
            // and worse — the counter quietly changes from 6/14 to 6/28 and the best thing that can
            // happen inside a bonus passes without a sound. It gets its own beat.
            if (sp.retrigger) {
                setGotMore(sp.retrigger);
                Cas.jackpot();
                Haptic.crit();
                timers.current.push(setTimeout(() => {
                    setGotMore(null);
                    runFree(r, i + 1, which);
                }, 1750));
                return;
            }
            timers.current.push(setTimeout(() => runFree(r, i + 1, which), FREE_HOLD_MS));
        };

        // A CASCADING MACHINE TUMBLES IN ITS FREE ROUND TOO. Same chain player as the base game — the
        // reels land, then the grid argues with itself, and the round multiplier rides on the ladder.
        if (sp.chain) {
            setChainAt(-1); setChainWon(0);
            playGrid(sp.grid, [], {
                stopAt: FREE_STOP_AT, settle: FREE_SETTLE_MS, lineMs: FREE_LINE_MS,
                onDone: () => { setFreeChain(sp.chain); runChain(sp.chain, 0).then(() => { setFreeChain(null); settle(); }); },
            });
            return;
        }

        playGrid(sp.grid, sp.wins, {
            stopAt: FREE_STOP_AT, settle: FREE_SETTLE_MS, lineMs: FREE_LINE_MS,
            // ── AND THE NEW ONES CLAMP SHUT ──────────────────────────────────────────────────────────
            // On the frame the reels finish, any wild that landed this spin welds itself to the board with
            // its own sound. This is the beat the whole feature is made of: the board is permanently
            // better than it was a second ago, and you watched it happen.
            onLanded: () => {
                // ── AND A PEARL IS WORTH HEARING ─────────────────────────────────────────────────────
                // It landed in silence. The multiplier on the bar went up by one and nothing marked the
                // moment — which is the same complaint as a bonus with no build-up, one layer down: the
                // best thing that happens in this round happened and the machine did not react.
                // ── AND IT STAYS MARKED FOR THE WHOLE SPIN ───────────────────────────────────────────
                // It used to clear itself after 900ms, which is less than half of FREE_HOLD_MS — so on most
                // spins the pearl had already stopped being special before the spin it landed on was over,
                // and what was left on screen was an oyster nobody had any reason to look at. It is marked
                // now until the next spin clears it, which is the honest length of "this spin had a pearl".
                //
                // The counter is told a pearl is inbound at the same moment, so the +1 that lands and the
                // number that changes are one event rather than two things that happened near each other.
                if (sp.pearls?.length) {
                    setPearlAt(sp.pearls);
                    setPearlFlew(sp.pearls.length * (slot5(machineId).free?.plus?.step || 1));
                    Cas.signature();
                    Haptic.crit();
                    // One pearl per cell, each measured from where it actually landed to where the number
                    // actually is. Next frame, so the cells have been painted and their rects are real.
                    requestAnimationFrame(() => {
                        const to = multRef.current?.getBoundingClientRect();
                        const box = gridRef.current?.getBoundingClientRect();
                        if (!to || !box) return;
                        setFliers(sp.pearls.map((at, i) => {
                            const cell = gridRef.current.querySelector(`[data-cell="${at}"]`);
                            const from = cell?.getBoundingClientRect();
                            if (!from) return null;
                            return {
                                id: `${freeIdx}-${at}-${i}`,
                                // Positioned inside the grid, so the numbers stay right when the page scrolls.
                                x: from.left - box.left + from.width / 2,
                                y: from.top - box.top + from.height / 2,
                                dx: (to.left + to.width / 2) - (from.left + from.width / 2),
                                dy: (to.top + to.height / 2) - (from.top + from.height / 2),
                                size: from.width * 0.62,
                            };
                        }).filter(Boolean));
                    });
                    timers.current.push(setTimeout(() => { setPearlFlew(0); setFliers([]); }, 1100));
                } else {
                    setPearlAt([]);
                }
                if (!sp.justHeld?.length) return;
                setLockedAt((p) => [...p, ...sp.justHeld]);
                Cas.reelStop(4, 0.8);
                Haptic.crit();
            },
            onDone: settle,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playGrid, runChain, announceFree, machineId]);


    // ── THE FLAG, AND WHY IT CANNOT BE ALLOWED TO STICK ──────────────────────────────────────────────────
    // Luke: "after spin, can no longer spin again." I did that, on this cabinet only, and the shape of the
    // mistake is worth keeping.
    //
    // The counting lives in WinTally, which drops this flag when the celebration is over. But the colossal
    // cabinet RETURNS EARLY, several hundred lines above the two places WinTally is mounted — so on the
    // Menagerie the flag went up on every winning spin and there was nothing on the page that could ever put
    // it down. SPIN stayed disabled until a reload. It passed every test I ran because the tests that won
    // were on a five-reel cabinet and the colossal spins I filmed did not pay.
    //
    // Two fixes, because one of them is the cause and the other is the class.
    //
    //   THE CAUSE: the colossal cabinet runs its own celebration inside ColossalReels and only reports
    //   "done" once that has finished, so by the time this effect could fire the count is already over.
    //   It must never raise the flag at all.
    //
    //   THE CLASS: a lock whose only release is a component somewhere else is a lock that bricks the machine
    //   the day that component does not render — and there is a second way in, because the readout below
    //   prefers a lit payline over the counter. So the flag now expires on its own. The ceiling is generous
    //   (the longest celebration plus a second), it never fires in normal play, and it means the worst this
    //   can ever do again is hold the button a moment too long instead of forever.
    const isColossal = useMemo(() => Boolean(slot5(machineId).colossal), [machineId]);
    useEffect(() => {
        if (isColossal) return undefined;
        if (phase !== "done" || !(Number(result?.wonChips || 0) > 0)) return undefined;
        setCelebrating(true);
        const t = setTimeout(() => setCelebrating(false), holdCeiling(result?.multiple || 0));
        return () => clearTimeout(t);
    }, [result, phase, isColossal]);

    // The horns, once, and only for a win that actually beat the stake.
    const celebrated = useRef(false);
    useEffect(() => {
        if (!result || phase === "spin") { return; }
        if (celebrated.current) return;
        const x = result.multiple || 0;
        if (x >= BIG_WIN_AT) { celebrated.current = true; Cas.jackpot(); Haptic.crit(); }
        else if (x >= CELEBRATE_AT) { celebrated.current = true; Cas.coins(Math.min(1, x / 20)); }
    }, [result, phase]);
    useEffect(() => { if (phase === "spin") { celebrated.current = false; setCelebrating(false); } }, [phase]);

    const lit = useMemo(() => {
        if (showLine < 0 || !activeWins.length) return null;
        const w = activeWins[showLine];
        if (!w) return null;
        return { line: lines[w.line], count: w.count, symbol: w.symbol, chips: w.chips };
    }, [showLine, activeWins, lines]);

    // ── THE BONUS TAKES THE WHOLE BOARD ──────────────────────────────────────────────────────────────────
    // Before the cabinet, the readout, the panel and the owner row — all of it. A bonus round that plays in a
    // strip under the reels is a bonus round competing with the machine it came from.
    // ── THE LOCKS COME BEFORE THE ROUND THEY BUILD ───────────────────────────────────────────────────────
    // Its own phase, ahead of the free spins, because the whole mechanic is that the picking DECIDES the
    // round. Announcing free spins first and then asking you to build them is the same information in the
    // wrong order.
    if (phase === "build" && result?.built) {
        return (
            <div className="s5 is-bonus">
                <TheLocks built={result.built} onDone={() => { Cas.bonus(); announceFree(result); }} />
            </div>
        );
    }

    // ── THE WARREN TAKES THE WHOLE SCREEN ────────────────────────────────────────────────────────────────
    // Five rooms deep, its own backgrounds, its own animals. It cannot share a stage with a slot cabinet and
    // it does not try to.
    if (phase === "warren" && result?.warren) {
        return (
            <div className="s5 is-bonus">
                <TheWarren warren={result.warren} owner={owner} onDone={() => setPhase("done")} />
            </div>
        );
    }

    // ── THE GEM VAULT TAKES THE WHOLE SCREEN ─────────────────────────────────────────────────────────────
    // Four collections, twenty-four covers and its own trays along the bottom — the same argument as the
    // Warren. It cannot share a stage with a slot cabinet and it does not try to.
    if (phase === "gems" && result?.gems) {
        return (
            <div className="s5 is-bonus">
                <GemVault gems={result.gems} bet={bet} onDone={() => setPhase("done")} />
            </div>
        );
    }

    // ── THE COLOSSAL CABINET RENDERS ITSELF ──────────────────────────────────────────────────────────────
    // Two boards, a hundred lines, a transfer that falls from one into the other and a bonus that changes the
    // last reel of the big one. None of that is a variation on the five-reel window below — it is a different
    // machine that happens to live on the same floor — so it draws its own screen and hands back when the
    // press is finished, the way the Warren and the Threshing Floor do.
    if (slot5(machineId).colossal) {
        return (
            <div className="s5 is-colossal-stack">
                {/* ── IT IS A CABINET, NOT A PAGE ──────────────────────────────────────────────────────
                    The first cut drew two bare grids stacked on a dark page, and Luke: "this doesn't even
                    remotely resemble the image I sent you. It's super jank." He is right — count what the
                    reference actually has and none of it was there: a painted masthead with the machine's
                    name across it, a brass cabinet around the glass, five visible REEL STRIPS you can point
                    at, symbols on a lit ground rather than floating in the dark, and a payline drawn over
                    the win. It was a spreadsheet of icons.

                    So it takes the same `.s5-cab` every other machine on this floor is built from — the
                    masthead, the marquee, the gold — and the two reel sets become windows inside it. */}
                {/* THE MASTHEAD KEEPS ITS ART AND LOSES ITS CAPTION. The machine's name is already across
                    the top of the page in letters twice this size — printing it again inside the cabinet
                    spent 40px of a screen that has none to spare on saying the same thing twice. The
                    painted scene stays, at half the height, because that is what makes it a cabinet. */}
                <div className="s5-cab is-colossal"
                    style={{ "--mast": `url(/images/casino/mast/${machineId}.webp)`,
                        "--room": `url(/images/casino/room/${machineId}.webp)` }}>
                    <ColossalReels machineId={machineId} art={art} bet={bet} data={result?.colossal}
                        chips={chips}
                        playing={Boolean(result?.colossal)} pressed={phase === "spin"}
                        onReadout={setColReadout} onDone={() => setPhase("done")} />
                </div>

                {pays ? <Paytable kind="five" machineId={machineId} art={art} bet={bet} rate={rate} onClose={() => setPays(false)} /> : null}

                {/* NO SEPARATE READOUT. Balance and chips moved onto the cabinet's own ribbon — they were
                    a two-column panel of their own under the machine, which is 86px spent on two numbers
                    you glance at. What is left below the glass is the one control anybody presses. */}
                {/* ── PAYS IS A BUTTON IN THE ROW, NOT A STICKER ON THE GLASS ──────────────────────────
                    Luke: "the pays symbol should be a button that isn't overlaid or underlaid and has a
                    background colour to it." It was floating in the cabinet's top frame band, which is
                    nineteen pixels tall against a twenty-three pixel button — so it hung over the top of
                    the colossal board no matter what I did to its offset. There is no version of that which
                    is not overlaid; it needed to stop being an overlay.

                    It sits in the control row now, beside the stepper and the disc, with its own ground and
                    rim. Nothing under it, nothing over it, and no vertical cost — the row was already there
                    and the stepper had width to spare. */}
                <div className="s5-panel is-colossal">
                    <button type="button" className="s5-pays is-tile" onClick={() => setPays(true)}
                        aria-label="What this machine pays">PAYS</button>
                    <div className="s5-stepper">
                        <button type="button" aria-label="Lower the bet" disabled={stepLocked || betIndex <= 0}
                            onClick={() => step(-1)}>−</button>
                        {/* ── BET DOES NOT MOVE OVER FOR THE WIN ───────────────────────────────────────
                            "I can't even see the bet amount now that you shoved one in there." Fair — the
                            first cut REPLACED the stake with the payout, which is fine reasoning about what
                            matters in the moment and useless when you want to change your bet and cannot
                            read what it is. They sit side by side; the row had the width the whole time. */}
                        <span className="s5-meters">
                            <span className="s5-meter"><i>Bet</i><b>{bet.toLocaleString()}</b></span>
                            {colReadout ? (
                                <span className="s5-meter is-win" aria-live="polite">
                                    <i>{colReadout.kind === "free"
                                        ? `Free ${colReadout.at + 1}/${colReadout.of}${colReadout.mult > 1 ? ` ×${colReadout.mult}` : ""}`
                                        : "Won"}</i>
                                    {/* WinTally renders its own <b>, so it is dropped in rather than wrapped. */}
                                    {colReadout.kind === "paid"
                                        ? <WinTally key={colReadout.k} chips={colReadout.chips}
                                            multiple={colReadout.multiple} tone={symbolTone(slot5(machineId).wild, machineId)} />
                                        : <b>{(colReadout.chips || 0).toLocaleString()}</b>}
                                </span>
                            ) : null}
                        </span>
                        <button type="button" aria-label="Raise the bet" disabled={stepLocked || betIndex >= stakes.length - 1}
                            onClick={() => step(1)}>+</button>
                    </div>
                    <button type="button" className={`s5-spin${broke ? " is-broke" : ""}`}
                        onClick={() => pull(null)} disabled={locked}>
                        {spinning ? <span className="s5-spin-wait" aria-hidden="true" />
                            : broke ? <span className="s5-spin-broke">NOT<br />ENOUGH</span>
                            : "SPIN"}
                    </button>
                </div>

                {/* ⚠ OWNER ONLY — REMOVE BEFORE THE FLOOR OPENS. This screen shipped without one, which made
                    the most elaborate bonus on the floor the one nobody could look at: it opens one spin in
                    thirty-six, and its two best moments — a wild column crossing from the small board to the
                    big one, and five of a giant down a line — are rarer again. Forcing re-rolls a REAL spin
                    until it lands what was asked for, the same as every other cabinet: no special-case code
                    anywhere near the money, and the gate is server-side. */}
                {owner ? (
                    <div className="s5-owner">
                        <i>owner</i>
                        <button type="button" className="s5-f-free" disabled={locked} onClick={() => pull("free")}>Force free spins</button>
                        <button type="button" className="s5-f-again" disabled={locked} onClick={() => pull("send")}>Force wild transfer</button>
                        <button type="button" className="s5-f-hoard" disabled={locked} onClick={() => pull("giant")}>Force giant line</button>
                    </div>
                ) : null}
            </div>
        );
    }

    if (phase === "pick" && result?.hold) {
        return (
            <div className="s5 is-bonus">
                {result.hold
                    ? <HoldAndSpin hold={result.hold} onDone={() => setPhase("done")} />
                    : null}
            </div>
        );
    }

    return (
        <div className="s5">
            {/* ── THE ROW ACROSS THE TOP ───────────────────────────────────────────────────────────────
                Only on a cabinet that has one. It draws even when empty, because a meter that appears once
                it already has something in it never teaches anybody it is there — and its whole trick is
                that it is filling while you are looking at something else. */}
            {slot5(machineId).winAgain ? (
                <WinAgainBar meter={shownMeter || { slots: slot5(machineId).winAgain.slots, recent: [], label: slot5(machineId).winAgain.label }}
                    firing={meterFire}
                    onFired={() => { setMeterFire(null); const go = afterMeter.current; afterMeter.current = null; go?.(); }} />
            ) : null}
            {pays ? <Paytable kind="five" machineId={machineId} art={art} bet={bet} rate={rate} onClose={() => setPays(false)} /> : null}
            {/* ── THE GRID ────────────────────────────────────────────────────────────────────────────── */}
            {/* ── A MACHINE, NOT A GRID ON A PAGE ─────────────────────────────────────────────────────
                Luke: "setting the slot machine screen apart from the background." It was a dark grid on a
                dark page with a hairline border, which reads as a table. A real cabinet is an OBJECT: a
                brass frame with weight to it, a recessed glass panel that is visibly deeper than the
                surface around it, and a lit marquee saying which machine you are at. */}
            {/* ── THE MASTHEAD ────────────────────────────────────────────────────────────────────────
                Every cabinet on a real floor has a painted scene above the glass; ours had a gold gradient
                with the name set in it, which is the difference between a machine and a screen with reels
                on it. Painted per cabinet — the wolf and the moon here, a kraken's eye on The Deep, the
                vault door on The Vault — so five machines feel like five machines rather than one
                component rendered five times. Dark at both ends by design, so the name sits over it. */}
            {/* ── AND THE RIBBONS GET THEIR OWN STRIP ─────────────────────────────────────────────────
                Pinned over the glass they covered the bottom row of symbols, which on a three-row machine
                is a third of the board — the fix for "polluted underneath" cannot be "hidden behind". The
                cabinet grows a strip for whichever ribbon is up, so the reels stay whole and the page below
                still never moves. */}
            <div className={`s5-cab${phase === "free" ? " has-foot" : ""}${chaining && liveChain ? " has-head" : ""}`}
                style={{ "--mast": `url(/images/casino/mast/${machineId}.webp)` }}>
                {/* ── AND A WAY TO READ THE MACHINE ───────────────────────────────────────────────
                    On the marquee, right-hand end, which is where a real cabinet puts it. A slot is the
                    only game in the building whose rules are invisible while you play it: you can watch a
                    blackjack hand and work out what happened, but nobody can watch a reel and deduce that
                    four bones beat three laurels or that the moon does not pay on a line at all. */}
                <span className="s5-marquee"><i aria-hidden="true" />{slot5(machineId).label.toUpperCase()}<i aria-hidden="true" />
                    <button type="button" className="s5-pays" onClick={() => setPays(true)}
                        aria-label="What this machine pays">PAYS</button>
                </span>
            {/* ── WHAT THE WINDOW IS DOING ────────────────────────────────────────────────────────────
                On the WINDOW rather than as a sibling selector. The dimming used to be written
                `.s5-lines ~ .s5-grid .s5-cell img:not(.is-lit)`, and the grid comes BEFORE the svg in this
                markup — so `~` never matched and nothing has ever dimmed behind a winning line. A state
                class on the container cannot be defeated by the order of two elements. */}
            <div className={`s5-window${lit ? " is-lining" : ""}${flashSym ? " is-flashing" : ""}${mult >= 5 ? " is-hot" : ""}`}>
                <div className="s5-grid" ref={gridRef}>
                    {Array.from({ length: REELS }, (_, reel) => (
                        // ── AND THESE TWO REELS ARE THE ONES THAT PAY THE MULTIPLIER ─────────────
                        // Luke: "I'm not seeing the multipliers in reels 1 and 5 — did you even do that?"
                        //
                        // It WAS done, and the sweep says so: a pearl lands 0.44 times a spin and a round
                        // finishes on about x5.8. What was missing is that nothing ever said WHERE to look.
                        // A pearl arrived on an outer reel, flashed for under a second and was replaced by
                        // the next spin, so the mechanic he described from his reference machine — "there's
                        // a chance for a +1 multiplier on reels 1 and 5" — was invisible as a RULE. You
                        // cannot notice a pattern on two specific reels if the two reels are never marked.
                        //
                        // So for the whole collecting round the two outside reels are lit as what they are:
                        // a cold aqua rail down each edge of the glass, in the pearl's own colour. It costs
                        // nothing, it is on screen before anything lands, and it turns eight spins of "a
                        // thing sometimes flashes" into eight spins of watching two particular reels.
                        <div key={reel} className={`s5-reel${landed > reel ? " is-stop" : spinning || result ? " is-spin" : ""}${tease && tease.reel === reel ? " is-teasing" : ""}${inRound && plusReels.includes(reel) ? " is-collector" : ""}`}
                            ref={(el) => { reelEls.current[reel] = el; }}
                            style={{
                                "--settle": `${brake[reel]?.ms ?? (phase === "free" ? FREE_SETTLE_MS : SETTLE_MS)}ms`,
                                ...(brake[reel] ? { "--s5from": `${brake[reel].from}px` } : null),
                            }}>
                            <div className="s5-strip">
                                {/* ── ONE STRIP, ALWAYS: NO SWAP AT THE END ───────────────────────────
                                    Luke, of the colossal cabinet and then of these: "a big part of the slot
                                    is seeing what goes by and what comes into view — the near-miss effect
                                    is a lot of dopamine we are throwing away."

                                    This already BUILT the right thing — nine filler symbols and then the
                                    real column, in one strip — and then threw it away at the last moment by
                                    swapping to the bare grid the instant the reel landed. So the symbols
                                    never arrived; they were replaced. A wild sliding to a stop one row
                                    short of a line never happened here either.

                                    The strip is the same every time now and the reel is a window over it:
                                    running cycles the top of the filler, stopping travels the rest so the
                                    real column rises up through the window. The `idle` tail is what a
                                    machine at rest shows, so the same expression serves both. */}
                                {/* ── AND THESE REELS FALL TOO ────────────────────────────────────────
                                    The colossal cabinet was fixed when Luke said "reels go down, not up",
                                    because that is the machine he had open. These four were not, and they
                                    kept scrolling upward for days — found by check:feel measuring the strip
                                    transform rather than by anyone looking, which is the entire argument
                                    for that gate.

                                    Same fix: the REAL column is written first and the filler after it, so
                                    the resting position is zero and every offset that hides the answer is
                                    negative. Stopping then walks the strip back toward zero, which moves
                                    the tape downward past the window. See s5Run. */}
                                {[...(grid?.[reel] || idle[reel]), ...filler[reel]].map((sym, i, all) => {
                                    // Which row of the REAL column this cell is, or -1 for a filler cell.
                                    // Everything that marks a cell — locked, breaking, teased, on the drawn
                                    // line — has to be gated on this, or the filler scrolling past picks up
                                    // the last spin's state.
                                    const row = i < ROWS ? i : -1;
                                    const real = row >= 0 && landed > reel;
                                    return (
                                    // EVERY CELL CARRIES ITS SYMBOL'S COLOUR. The wash behind the symbol is
                                    // the same hue the symbol was drawn in — one map, see SYMBOL_LOOK — so a
                                    // violet glow means a wild before you have focused on the picture. The
                                    // wild and the scatter get a stronger one than the paying symbols,
                                    // because those two are the ones you are actually hunting for.
                                    <span className={`s5-cell is-${symbolRole(sym, machineId)}${real && flashSym && sym === flashSym ? " is-flash" : ""}${real && breaking.includes(reel * ROWS + row) ? " is-breaking" : ""}${real && dropping.includes(reel * ROWS + row) ? " is-dropping" : ""}${real && !inRound && lockedAt.includes(reel * ROWS + row) ? " is-locked" : ""}${real && pearlAt.includes(reel * ROWS + row) ? " is-pearled" : ""}${real && tease ? (sym === tease.sym ? " is-teased" : " is-hushed") : ""}`}
                                        key={i} data-cell={row >= 0 ? reel * ROWS + row : undefined}
                                        style={{ "--tone": symbolTone(sym, machineId), "--drop": `${Math.max(0, row) * 40}ms` }}>
                                        {/* The wild's travelling shine. Its own element because the cell
                                            has already spent ::before on the plate and ::after on the
                                            frame, and a shine needs to clip separately from both. */}
                                        {symbolRole(sym, machineId) === "wild" ? <i className="s5-shine" aria-hidden="true" /> : null}
                                        {/* ── THE PEARL SAYS WHAT IT IS WORTH ─────────────────────────
                                            The sprite is drawn without a numeral on purpose — an image
                                            model cannot be trusted with one, and the multiplier plates
                                            already went through this. The step is read off the cabinet so
                                            a pearl worth two would say so without anyone editing this. */}
                                        {plusSym && sym === plusSym
                                            ? <b className="s5-plus">+{slot5(machineId).free?.plus?.step || 1}</b> : null}
                                        <ReelImg src={artFor(art, machineId, sym)}
                                            className={`${real && lit && lit.line[reel] === row && reel < lit.count ? "is-lit" : ""}${real && flashSym && sym === flashSym ? " is-flash-img" : ""}`.trim()} />
                                    </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                {/* ── THE HELD WILDS DO NOT LEAVE. NOT EVEN FOR THE SPIN. ─────────────────────────────
                    Luke: "walking wild should be locked all the time — the way it works right now is they
                    lock but then the spin animation happens and they disappear and then show back up again.
                    They should truly be locked, floating there the whole time until they're dismissed by the
                    game after the free spins."

                    He is exactly right and the reason is structural, not cosmetic. A held wild was a CELL IN
                    THE STRIP, and the strip is the thing that moves: a reel spins by translating twelve cells
                    past a three-cell window, so anything drawn in the strip is carried away with it by
                    definition. The wild came back at the end because the next grid put it back — which is not
                    a wild that stayed, it is a wild that landed again in the same place, and that is precisely
                    what the player was seeing.

                    A thing that does not move cannot live in the thing that moves. So the held wilds are their
                    own layer over the glass, in the window's coordinates rather than the strip's, and the
                    reels spin UNDERNEATH them. The board is genuinely better than it was a second ago and it
                    stays that way while the reels run, which is the whole feeling the mechanic is for.

                    Three details that matter:
                      • Keyed by CELL, so React keeps a wild that was already held and mounts only the ones
                        that just welded — which is what makes the clamp animation fire on the new ones and
                        only the new ones. Re-keying them all would re-weld the whole board every spin.
                      • Opaque plate, matching the reel's own gradient, so the filler scrolling past behind
                        cannot show through a symbol that is supposed to be bolted down.
                      • Still carries `is-lit` when a payline runs through it, because a held wild is on more
                        winning lines than anything else on the board and it would be absurd for the one
                        symbol that is always paying to be the one that never lights. */}
                {heldWilds.length ? (
                    <div className="s5-held" aria-hidden="true">
                        {heldWilds.map((at) => {
                            const reel = Math.floor(at / ROWS);
                            const row = at % ROWS;
                            const sym = slot5(machineId).wild;
                            return (
                                <span key={at} className="s5-cell is-wild is-locked"
                                    style={{ "--tone": symbolTone(sym, machineId), gridColumn: reel + 1, gridRow: row + 1 }}>
                                    <i className="s5-shine" aria-hidden="true" />
                                    <ReelImg src={artFor(art, machineId, sym)}
                                        className={lit && lit.line[reel] === row && reel < lit.count ? "is-lit" : ""} />
                                </span>
                            );
                        })}
                    </div>
                ) : null}

                {/* ── THE PEARLS, IN FLIGHT ───────────────────────────────────────────
                    Above everything, because a pearl travelling to the counter must not be clipped by the
                    window it is leaving. Each one carries its own start and its own delta — see the launch
                    in runFree — so the same keyframe flies a pearl from either outside reel, at any row, at
                    any cabinet size. */}
                {fliers.map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={f.id} className="s5-pearlfly" alt="" aria-hidden="true" draggable="false"
                        src={artFor(art, machineId, plusSym)}
                        style={{
                            left: `${f.x}px`, top: `${f.y}px`, width: `${f.size}px`,
                            "--dx": `${f.dx}px`, "--dy": `${f.dy}px`, "--i": i,
                        }} />
                ))}

                {/* The winning line, drawn across the window. One at a time — five lines flashing at once is
                    a light show nobody can read, and reading it is the entire point. */}
                {lit ? (
                    <svg className="s5-lines" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
                        <polyline points={lit.line.map((row, reel) => `${reel * 20 + 10},${row * 20 + 10}`).join(" ")} />
                    </svg>
                ) : null}

                {/* ── THE MULTIPLIER, ON THE GLASS ────────────────────────────────────────────────
                    It was a 14px number in the strip under the cabinet, beside the balance — which is to
                    say the most exciting thing on a cascading machine was set in the same size as the
                    thing it is least like. A climbing multiplier is the whole reason to watch a tumble,
                    so it goes ON the reels at display size and SLAMS each time it moves.

                    Keyed by its own value, which is what makes it re-mount and replay the slam on every
                    step instead of animating once and then silently updating its text. */}
                {chaining && mult > 1 ? (
                    <div className="s5-bigmult" key={mult} aria-hidden="true"><b>&times;{mult}</b></div>
                ) : null}
            </div>

            {/* ── EVERYTHING THAT HAPPENS, HAPPENS ON THE MACHINE ─────────────────────────────────
                Luke: "things like this recap should consume the animated spin area, not polluted
                underneath."

                All five of these used to be siblings of the cabinet, stacked down the page under it —
                so a free round pushed the reels up, the tally arrived as a fifth panel in a column of
                panels, and the screen grew and shrank as the spin went through its phases. That is a
                form reporting on a game rather than a game.

                They live INSIDE the cabinet now and are positioned over the glass. `.s5-cab` is already
                `position: relative; overflow: hidden`, so an overlay is clipped to the machine and the
                page below it never moves at all.
            */}
            {/* ── HOW CLOSE THE CHAIN IS ──────────────────────────────────────────────────────────────
                Breaks so far against the number that opens the free round, and what the spin has taken. The
                multiplier used to live here too and has moved onto the glass; what is left is the pair of
                numbers you check rather than watch, which is what this strip is for. */}
            {chaining && liveChain ? (
                <div className={`s5-tumble${liveChain.trigger && chainAt + 1 >= liveChain.trigger - 2 ? " is-close" : ""}`}>
                    <span><i>Breaks</i><b>{chainAt + 1}{liveChain.trigger ? ` / ${liveChain.trigger}` : ""}</b></span>
                    <span><i>This spin</i><b>{chainWon.toLocaleString()}</b></span>
                </div>
            ) : null}
            {/* ── THE ROUND, WHILE IT RUNS ────────────────────────────────────────────────────────────
                Luke: "the info box under the free spins is ghetto and lacking all dopamine and polish."

                It was a dark rounded rectangle with three label-over-number stacks in it — the right
                information built out of the vocabulary of a settings panel, sitting on the glass during the
                best sixty seconds the machine has. The Win It Again rack next door is drawn windows in a
                rack and reads as part of a cabinet; this is the same problem, so it gets the same answer.

                Three drawn instrument windows, the multiplier in a gold medallion that beats while the
                round runs, and a fill creeping along the rack behind them so how far through you are is
                something you SEE rather than divide. The total counts up instead of being restated.

                AND NO SKIP. Luke: "don't allow skipping, remove that button as well." The argument for it
                was the twentieth round rather than the first — but a bonus is one spin in forty here, the
                round IS the product, and a button offering to not watch it is the machine agreeing that
                watching is a chore. `skipFree` went with it rather than being left dangling. */}
            {phase === "free" ? (
                <div className="s5-freebar">
                    <i className="s5-fb-fill" aria-hidden="true"
                        style={{ "--p": `${roundLen ? Math.min(100, ((freeIdx + 1) / roundLen) * 100) : 0}%` }} />
                    {/* ── THE NUMBERS CANNOT BE ALLOWED TO OUTGROW THEIR PLATES ───────────────────
                        Luke: "I see a problem with the numbers in those little boxes — I feel like it's
                        pretty easy for those numbers to bound outside and become illegible."

                        He is reading the construction correctly. Every one of these windows is a DRAWN
                        bezel with a fixed type size inside it: the medallion is a 52px disc with a 1.25rem
                        numeral in the middle, and the two rectangles are 16px tabular figures on a
                        background image, all of it `white-space: nowrap` inside a bar that is
                        `overflow: hidden`. So none of it wraps and none of it shrinks — it simply grows
                        past the edge of the picture it is supposed to be sitting in and then gets sliced
                        off by the bar. `x12` already overflows the disc, and this round pays in chips off
                        a 2,500 stake, so "THIS ROUND" reaches six and seven figures on a real bonus.

                        Nothing here can be solved by picking a smaller size, because the whole range from
                        "6/8" to "1,284,300" has to be legible in the same box. So every number states how
                        many characters it is and the type fits itself to that — see `--len` in globals.
                        A short number keeps the size it has today and a long one steps down exactly as far
                        as it has to, which is the only version of this that is right at both ends. */}
                    <span className="s5-fb-cell">
                        <i>Spin</i>
                        <b style={{ "--len": String(freeIdx + 1).length + 1 + String(roundLen).length }}>
                            {freeIdx + 1}<s>/</s>{roundLen}</b>
                        {roundGrew ? <u>+{roundGrew}</u> : null}
                    </span>
                    {/* On a locking round the multiplier is always 1 and the number that matters is how many
                        wilds are welded to the board — which is the whole mechanic, and is the thing that
                        makes the last spins worth more than the first. */}
                    {/* ── A COLLECTING ROUND HAS TWO NUMBERS AND BOTH ARE THE POINT ────────────────
                        Wilds welding themselves to the board AND a multiplier that grows every time a pearl
                        lands. `free.mult` is the OFFER's flat multiplier and on this round it is always 1 —
                        the live one is on the spin being played, because it changes underneath you. */}
                    {round === "locked"
                        ? <span className="s5-fb-mult is-held">
                            <b style={{ "--len": String(lockedAt.length).length }}>{lockedAt.length}</b>
                            <em>held</em></span>
                        : result?.free?.kind === "collect" ? (
                            <>
                                <span className="s5-fb-mult is-held">
                                    <b style={{ "--len": String(lockedAt.length).length }}>{lockedAt.length}</b>
                                    <em>held</em></span>
                                {/* ── AND THE PEARL PUTS THE NUMBER UP, VISIBLY ───────────────────
                                    The multiplier used to just BE a different number on the spin after a
                                    pearl landed — the single best event in the round, delivered as a
                                    quiet substitution. The step now flies onto the medallion at the
                                    moment the pearl lands, which is the same fix as the retrigger beat
                                    one layer down: a number that changes because you watched something
                                    hit it is an event, and a number that has simply changed is not. */}
                                <span ref={multRef} className={`s5-fb-mult is-grown${pearlFlew ? " is-collecting" : ""}`}>
                                    <b style={{ "--len": 1 + String(result.free.spins?.[Math.max(0, freeIdx)]?.mult || 1).length }}>
                                        &times;{result.free.spins?.[Math.max(0, freeIdx)]?.mult || 1}</b>
                                    {/* The "+1" text badge lived here. The pearl itself does the job now —
                                        see the fliers below — and a number popping on at the same moment as
                                        the thing that caused it is the same fact told twice. */}
                                </span>
                            </>
                        ) : <span className="s5-fb-mult">
                            <b style={{ "--len": 1 + String(result?.free?.mult ?? 1).length }}>
                                &times;{result?.free?.mult}</b></span>}
                    <span className="s5-fb-cell is-won">
                        <i>This round</i>
                        <b style={{ "--len": Math.max(1, Number(freeWon || 0).toLocaleString().length) }}>
                            <Tally n={freeWon} ms={520} /></b>
                    </span>
                </div>
            ) : null}
            {/* ── THE ANNOUNCEMENT ────────────────────────────────────────────────────────────────────
                Over the cabinet, because the cabinet is what it happened on. It holds for two seconds with
                nothing else moving, which is the whole point: the rarest event on the machine gets the one
                thing the base game never does, which is the screen's undivided attention. */}
            {phase === "freeIntro" && result?.[round] ? (
                <div className="s5-shout" role="status">
                    {/* ── SAY WHAT WAS BUILT, NOT WHAT THE CABINET USUALLY GIVES ──────────────────
                        On The Vault the round is not the machine's — the member just spent six taps
                        stacking it, and the fanfare announced "Ten spins" and dropped the multiplier
                        they had been watching climb. The one line that must name the round is the one
                        that named it wrong. */}
                    <i>{round === "locked" ? "They will not leave"
                        : result.built ? "You built it" : "The moon is up"}</i>
                    <b>{round === "locked" ? "LOCKING WILDS" : "FREE SPINS"}</b>
                    <em>{result.built && round === "free"
                        ? `${result.free.spins.length} spins at ×${result.free.mult}`
                        : result[round].label}</em>
                </div>
            ) : null}
            {/* ── AND THE ROUND, WHILE IT RUNS ────────────────────────────────────────────────────────
                A counter of where you are and what the round has paid so far. It sits under the reels
                rather than over them — during a free round the reels are the thing you are watching, and
                this is the score. */}
            {/* ── MORE SPINS ──────────────────────────────────────────────────────────────────────────
                The best thing that can happen inside a bonus, and it used to be a counter quietly going
                from 6/14 to 6/28. It stops the round, says what it bought and what bought it, and then
                the round carries on — a beat inside the free spins rather than a screen instead of them. */}
            {gotMore ? (
                <div className="s5-more" role="status">
                    <b>+{gotMore.spins}</b>
                    <i>more free spins</i>
                    <em>{gotMore.by === "chain" ? "the threshing would not stop" : "three more scatters"}</em>
                </div>
            ) : null}
            {/* ── AND AT THE END, IT TALLIES UP ───────────────────────────────────────────────────────
                Luke: "at the very end, once you're completely done with your free spins, it tallies it all
                up for you and shows like a dancing [character]."

                This was one line of text and a Go on button — the flattest possible end to the best thing
                the machine does. A round is a story with a total at the end of it, so the total is counted
                UP rather than printed, the parts that made it are listed under it, and the cabinet's own
                wild comes out and dances the way the Warren's Elder does. `freeDone` is only ever reached
                after the LAST round a spin opened, so this is genuinely the end. */}
            {phase === "freeDone" && result?.[round] ? (
                <div className="s5-tally">
                    <i className="s5-tally-rays" aria-hidden="true" />
                    <span className="s5-tally-burst" aria-hidden="true">
                        {Array.from({ length: 14 }, (_, k) => <b key={k} style={{ "--k": k }} />)}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="s5-tally-star" src={artFor(art, machineId, slot5(machineId).wild)} alt=""
                        draggable="false" />
                    <span className="s5-tally-kick">{round === "locked" ? "The locking round is done" : "The round is done"}</span>
                    <b className="s5-tally-n"><Tally n={freeWon} /></b>
                    <span className="s5-tally-sub">chips</span>
                    <div className="s5-tally-rows">
                        <span><i>Spins</i><b>{result[round].spins.length}</b></span>
                        {/* ── THE ROUND'S OWN NUMBERS, NOT THE OFFER'S ─────────────────────────────────
                            `mult` on the round object is the OFFER's flat multiplier, which on a collecting
                            round is 1 for ever — so a Deep round that climbed to x6 by gathering pearls
                            would have ended on a card that never mentioned the multiplier, which is the
                            entire thing the round is about. The live number lives on the SPINS. Same for
                            the wilds welded to the board: it is what a sticky round IS. */}
                        {(() => {
                            const sp = result[round].spins || [];
                            const top = Math.max(1, ...sp.map((x) => x.mult || 1));
                            const held = Math.max(0, ...sp.map((x) => (x.held || []).length + (x.justHeld || []).length));
                            const pearls = sp.reduce((n, x) => n + (x.pearls || []).length, 0);
                            return (<>
                                {top > 1 ? <span><i>Top multiplier</i><b>&times;{top}</b></span> : null}
                                {pearls > 0 ? <span><i>Pearls</i><b>{pearls}</b></span> : null}
                                {held > 0 ? <span><i>Wilds held</i><b>{held}</b></span> : null}
                            </>);
                        })()}
                        {tallyGrew > 0 ? <span><i>Retriggered</i><b>+{tallyGrew}</b></span> : null}
                        <span><i>Best spin</i><b>{Math.max(0, ...result[round].spins.map((x) => x.chips || 0)).toLocaleString()}</b></span>
                    </div>
                    <button type="button" className="s5-go" onClick={() => setPhase(result.hold ? "pick" : result.warren ? "warren" : "done")}>Collect</button>
                </div>
            ) : null}

            {/* ── A BIG ONE TAKES THE CABINET ─────────────────────────────────────────────────────────
                Luke: "add a splash screen that says big win", and coins with it. Ten times the stake and
                up, on every machine on the floor — see WinTally for what the tiers are and why the count
                is timed off the multiple rather than off the chips. Inside `.s5-cab` on purpose: the same
                rule the tumble bar and the shout already follow, so it covers the glass rather than
                shoving the panel down the page. */}
            {phase === "done" && celebrating && result?.wonChips && isBigWin(result.multiple) ? (
                <WinTally key={`b${result.id || result.wonChips}`} chips={result.wonChips}
                    multiple={result.multiple || 0} tone={symbolTone(slot5(machineId).wild, machineId)}
                    onDone={() => setCelebrating(false)} />
            ) : null}
            </div>

            {/* ── WHAT JUST HAPPENED ──────────────────────────────────────────────────────────────────── */}
            {/* NOT UNTIL THE WHOLE SPIN HAS FINISHED PLAYING. `wonChips` is the total including the free
                round and the pick, so showing it the moment the reels stopped printed the answer above a
                bonus round that had not been watched yet — the ten spins would then run with their own
                outcome already on screen. It waits for "done".

                The comment lives HERE rather than inside the ternary below, because a JSX comment in an
                expression position is a parse error, and it is one this file has already made once. */}
            <div className="s5-say">
                {phase === "spin" ? <span className="s5-dim">…</span>
                    : lit ? <span><b>{lit.count}</b> {symbolName(lit.symbol, machineId)} — <b>{lit.chips.toLocaleString()}</b> chips</span>
                    : result?.wonChips && phase === "done" && !isBigWin(result.multiple)
                        ? <WinTally key={`w${result.id || result.wonChips}`} chips={result.wonChips}
                            multiple={result.multiple || 0} tone={symbolTone(slot5(machineId).wild, machineId)}
                            onDone={() => setCelebrating(false)} />
                    : result && phase === "done" ? <span className="s5-dim">No line this time.</span>
                    : result ? <span className="s5-dim" />
                    : <span className="s5-dim">Twenty lines.</span>}
            </div>

            {/* ── THE DEAL CHOOSER IS GONE ────────────────────────────────────────────────────────────
                Three buttons offering twenty spins at 2x, ten at 4x or seven with sticky wilds. Luke: "remove
                the spins buttons, its too complicated." He is right about the placement even though the
                mechanic is sound: it was a question about a bonus round that arrives once in ninety-three
                spins, asked permanently, on the main screen, above the button you actually came to press.
                Ninety-two times out of ninety-three it was three buttons that did nothing.

                The round still runs — it takes the middle deal, ten spins at four times, which is the one
                that was selected by default anyway. The choice is worth having back one day, but INSIDE the
                round it belongs to, at the moment it triggers, where it is a moment rather than a setting. */}











            {/* ── THE PICK IS ITS OWN GAME NOW ────────────────────────────────────────────────────────
                Rendered above, as a full takeover — see the early return at the top of this component. It
                used to be a row of grey boxes UNDER the reels, which is a form asking you to press it four
                times. A bonus round is one spin in two hundred and thirty-three; it should be the moment
                the slot machine stops being a slot machine. */}


            {/* Says how far short, because "not enough" without a number is a dead end — the member has to
                either lower the bet or go and earn, and both need the size of the gap. */}
            {broke ? (
                <p className="s5-short">
                    {(Number(bet) - Number(chips ?? 0)).toLocaleString()} more chips for a {Number(bet).toLocaleString()} spin
                    {bet > (stakes[0] ?? 0) ? <> — or step the bet down</> : null}
                </p>
            ) : null}

            {/* ── THE CONTROL PANEL ───────────────────────────────────────────────────────────────────
                Luke: "proffesionalize the wager buttons and spin button."

                They were four fat yellow rectangles and a fifth fatter one, which is a form. Every real
                cabinet has the same two-part panel instead, and it is the same on a machine in a casino as it
                is in a video slot on a phone:

                  A READOUT — balance, bet, and what the last spin paid — in one strip of small caps and
                  tabular figures, because these are numbers you glance at rather than read.

                  A BET STEPPER AND ONE BIG BUTTON. A stepper is one control instead of four, it scales to any
                  number of stakes without growing, and it puts the amount itself on screen as a value rather
                  than as the selected one of a row. The spin button is then the only large thing in the
                  panel, which is exactly the hierarchy — there is one thing you press over and over. */}
            {/* ── ONE NUMBER, AND IT IS THE ONE THE MACHINE SPENDS ────────────────────────────────────
                Luke: "balance still showing coin for many slots when it isnt relevant."
                This was two cells, Balance and Chips, and Balance was GOLD — which the floor stopped taking
                when every machine moved to chips. A second figure beside the one that matters is not extra
                information, it is a question about which of them the bet comes out of, asked on every spin.
                BET IS STILL NOT HERE: the stepper below prints it, larger, next to the controls that change
                it, and the same number twice on one screen is one of them being ignored. */}
            <div className="s5-readout is-one">
                <span className="s5-ro-chips"><i>Chips</i><b>{Number(chips || 0).toLocaleString()}</b></span>
            </div>

            <div className="s5-panel">
                <div className="s5-stepper">
                    <button type="button" aria-label="Lower the bet" disabled={stepLocked || betIndex <= 0}
                        onClick={() => step(-1)}>−</button>
                    <span><i>Bet</i><b>{bet.toLocaleString()}</b></span>
                    <button type="button" aria-label="Raise the bet" disabled={stepLocked || betIndex >= stakes.length - 1}
                        onClick={() => step(1)}>+</button>
                </div>
                <button type="button" className={`s5-spin${broke ? " is-broke" : ""}`}
                    onClick={() => pull(null)} disabled={locked}>
                    {spinning ? <span className="s5-spin-wait" aria-hidden="true" />
                        : broke ? <span className="s5-spin-broke">NOT<br />ENOUGH</span>
                        : "SPIN"}
                </button>
            </div>

            {/* ── ⚠ OWNER ONLY — REMOVE BEFORE THE FLOOR OPENS ────────────────────────────────────────
                LAST IN THE CABINET, under the spin panel. Luke: "can you move these red controls down
                beneath the spin button please." It was sitting between the readout and the balance, which
                pushed BET and SPIN — the two things anybody came here to touch — most of a screen further
                down, on a cabinet that already carries a meter bar above it. A test control has to be
                reachable and must never be in the way of the game.
                On the master "remove before launch" checklist with the server half. Free spins come once in
                ninety-three spins and the pick once in two hundred and thirty-three, which makes both of them
                nearly impossible to LOOK at — the first time the free round was seen on screen it had to be
                faked, and a fake only proves the half that was already fine.

                The server re-rolls whole spins until one triggers naturally and plays that, so what appears
                here is a real spin with a real payout and no special-case code near the money. The gate is
                server-side; this row being hidden is not the permission check. */}
            {owner ? (
                <div className="s5-owner">
                    <i>owner</i>
                    <button type="button" className="s5-f-free" disabled={locked} onClick={() => pull("free")}>Force free spins</button>
                    <button type="button" className="s5-f-pick" disabled={locked} onClick={() => pull("pick")}>Force pick</button>
                    <button type="button" className="s5-f-again" disabled={locked} onClick={() => pull("again")}>Force retrigger</button>
                    <button type="button" className="s5-f-tease" disabled={locked} onClick={() => pull("tease")}>Force hold</button>
                    <button type="button" className="s5-f-hoard" disabled={locked} onClick={() => pull("hoard")}>Force hoard</button>
                    {/* The Vault's two. Only on the Vault: a button that spins forty thousand times looking
                        for a feature this cabinet does not have is a button that quietly does nothing. */}
                    {slot5(machineId).second?.kind === "gems" ? (
                        <button type="button" className="s5-f-gems" disabled={locked} onClick={() => pull("gems")}>Force gems</button>
                    ) : null}
                    {slot5(machineId).winAgain ? (
                        <button type="button" className="s5-f-again2" disabled={locked} onClick={() => pull("winagain")}>Force win again</button>
                    ) : null}
                    {cascades ? (
                        <button type="button" className="s5-f-chain" disabled={locked} onClick={() => pull("chain")}>Force tumble</button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
