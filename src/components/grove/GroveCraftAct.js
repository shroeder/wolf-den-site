"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    HEAT_MS, HEAT_TARGET, HAND_OFF_MS, heatScore, STRIKES, STRIKE_MS, STRIKE_HIT, STRIKE_PERFECT,
    strikeGrade, actScore, rackFor, scatterFor, oddsForAim, PEG_ROWS, RACK_MIDDLE, PHASES,
} from "@/lib/marketplace/grove-craft-act.js";
import { QUALITY_BANDS, bandTint, bandInk } from "@/lib/marketplace/grove-forge.js";
import { recipeArt, toolArt } from "@/lib/marketplace/grove-catalog.js";
// ⚠️ THE SOUND IS THE KIT THE GROVE ALREADY HAS. grove-sfx.js synthesises every note from an oscillator —
// nothing to host, nothing to preload, nothing to 404 on one bar of signal — and every call is already
// wrapped, so a blocked AudioContext is a silent craft rather than a broken screen.
import { playHit, playPickup, playDrop, celebrateUnlock } from "@/components/grove/grove-sfx.js";
// ⚠️ THE HAPTICS ARE THE ARENA'S, NOT A SECOND SET. Luke: "every stage should let you know how you did with
// like colorful text and vibrations and stuff." Haptic.fire already swallows the unsupported case — iOS
// Safari and every desktop are no-ops — so a pattern here is best-effort everywhere and never a thrown error.
import { Haptic } from "@/components/arena/arena-audio.js";
import GroveMini from "@/components/grove/GroveMinis.js";
import { drawPhases } from "@/lib/marketplace/grove-minigames.js";

// ── THE THREE STAGES ─────────────────────────────────────────────────────────────────────────────────────────
// Luke: "its 3 separate stages with immersive background and sprite decorations, you seem to have combined it
// all?"
//
// ⚠️ HE WAS LOOKING AT A WIDGET WITH THREE MODES. The first build was one panel with the plinko rack bolted
// to the top and the controls swapping underneath — so every beat happened in the same place, in front of the
// same furniture, and the only thing that changed was which row of buttons was lit. Three stages means three
// PLACES:
//
//   THE FIRE      bg-forge   coals, bellows, tongs. Pump it up to temperature.
//   THE SHAPING   bg-anvil   the anvil on its stump, hammers on the wall. Three blows.
//   THE SETTING   bg-rack    the cooling rack and its bins. Aim, release, watch it fall.
//
// Each is full-bleed behind its own painted backdrop with the piece you are making as the hero of the scene,
// and the move between them is a dissolve rather than a re-render.
//
// ⚠️ AND THE RACK IS NOT ON SCREEN UNTIL THE THIRD STAGE. It used to be visible throughout, and there was a
// reason for that: back when the skill beats WIDENED the buckets, the player had to watch them grow. That
// mechanic is gone — skill tightens the scatter now, which does not move the rack at all — so showing it
// early had stopped buying anything and was only crowding the first two stages. A justification that expired
// is worth deleting the thing it was justifying.
//
// ⚠️ THE FALL IS STILL NOT PLAYED LOCALLY. Releasing POSTS the craft; the server picks the landing and hands
// back a rattle that provably ends on it. A client bouncing its own piece and reporting where it stopped is a
// client deciding its own loot, which this game does nowhere.

// ⚠️ `playing` IS A THIRD STATE AND IT EXISTS TO STARVE THE OLD ONE. The hardcoded bellows and anvil are
// gone from the screen, but their clocks were still in this file guarding on `stage !== STAGE.fire` — and a
// phase that left `stage` at fire would have armed the old 2.6s heat clock, which ends by calling
// setStage(STAGE.shaping) and would have fought the phase machine for control of the act.
// Nothing is ever set to fire or shaping now, so every one of those guards returns immediately.
// ⚠️ `fire` AND `shaping` ARE KEPT AS NUMBERS AND NOTHING SETS THEM. STAGE_BG and STAGE_ANCHOR are
// indexed arrays whose 0 and 1 entries are the forge and the anvil paintings, and a drawn game's `room`
// indexes straight into them — so renumbering here would silently repaint every phase. The names stay as
// the documentation of what 0 and 1 mean.
const STAGE = { fire: 0, shaping: 1, setting: 2, playing: 3 };
const STAGE_NAME = ["The fire", "The shaping", "The setting"];
const STAGE_BG = ["bg-forge", "bg-anvil", "bg-rack"];
// ── ⚠️ WHERE THE WORK HAPPENS IN EACH ROOM ───────────────────────────────────────────────────────────────
// Luke: "I still think the crafting needs more work visually. Its still lacking."
//
// It was: the piece hung in the dead centre of the panel while the coals sat a third of the way across the
// painting and the anvil face sat lower still. A sprite floating in front of a picture is a sprite and a
// picture; a sprite sitting IN the coals is a forge. These are the hot spot of each backdrop as a percentage
// of the plate, measured off the art, and the piece is positioned there rather than in the middle of a box.
//
// ⚠️ THEY BELONG TO THE PAINTINGS AND MUST BE RE-MEASURED IF THE ART IS REDRAWN. There is no way for code to
// find the fire in a .webp, so this is the one place in the feature where a number is pinned to a picture.
// The stage is skipped for the rack, where the piece belongs to the plinko board instead.
const STAGE_ANCHOR = [
    { x: 25, y: 62 },   // bg-forge — the coal bed
    { x: 45, y: 58 },   // bg-anvil — the face of the anvil
    null,               // bg-rack  — the piece lives in the rack itself
];
// ⚠️ A DIFFERENT WORD PER BAND. "It sets" for every outcome taught the player there was nothing to read.
const SET_WORD = {
    masterwork: "MASTERWORK",
    pristine: "Beautiful work",
    fine: "That will do nicely",
    sound: "Sound enough",
    rough: "Rough, but it holds",
};

export default function GroveCraftAct({ recipe, level, onCommit, onClose, forceGames = null, startAtRack = false }) {
    // ── ⚠️ DRAWN ONCE, ON MOUNT, AND NEVER AGAIN ────────────────────────────────────────────────
    // useMemo with no dependencies rather than useState(drawPhases()): the latter re-runs the draw on
    // every render in React's strict double-invoke, which in development silently reshuffles the
    // line-up between the banner and the game. Three fixed games for the life of this act.
    // ⚠️ forceGames IS THE LAB'S DOOR AND NOTHING ELSE PASSES IT. Ten games dealt at random cannot be
    // reviewed by reloading until the one you need comes up, and "it looked fine in the three I saw" is how
    // seven of them ship unwatched. Nothing in the app supplies this prop; GroveCraftLab is the only caller,
    // and that page 404s outside development.
    const games = useMemo(() => (forceGames?.length ? forceGames : drawPhases()), [forceGames]);
    // ⚠️ startAtRack IS THE LAB'S OTHER DOOR, AND IT EXISTS BECAUSE THE RACK IS UNREACHABLE. Getting to
    // the plinko stage means actually playing three timed games, which no screenshot rig can do — synthetic
    // taps either miss the windows or run the act past the end into a restart, and I burned several takes
    // proving it. So the stage that decides the item's QUALITY was the one stage nobody could photograph.
    // Three middling scores, because a rack opened on a perfect act would not show the honest board.
    const [scores, setScores] = useState(startAtRack ? [0.62, 0.58, 0.66] : []);
    const phase = scores.length;                       // 0,1,2 play a game; 3 is the rack
    const [stage, setStage] = useState(startAtRack ? STAGE.setting : STAGE.playing);
    const [heatLeft, setHeatLeft] = useState(HEAT_MS);
    const [flash, setFlash] = useState(null);
    // When the anvil starts accepting blows. Set on entering the shaping stage; see HAND_OFF_MS.
    const [aim, setAim] = useState(RACK_MIDDLE);
    const [result, setResult] = useState(null);
    const [fallRow, setFallRow] = useState(-1);
    const [settled, setSettled] = useState(false);
    const [burst, setBurst] = useState(false);
    const [shake, setShake] = useState(false);
    // ── THE COUNT-IN ────────────────────────────────────────────────────────────────────────────
    // Luke: "the tapping mini game needs to have a little like countdown before it starts to let you
    // know you need to tap super fast."
    //
    // The bellows clock used to start the instant the stage did, so the first thing a player learned
    // about the fastest beat in the game was that a second of it had already gone. 3-2-1 is the oldest
    // fix there is and the only honest one: the thing you are about to be judged on is announced before
    // the judging starts. null means the count is over and the coals are live.
    // What the stage you just finished was worth, said out loud. Cleared when the next one begins.
    const [stageSay, setStageSay] = useState(null);

    const raf = useRef(0);
    const posted = useRef(false);
    const rackRef = useRef(null);
    const rang = useRef(-1);

    // What the act carries to the server. One number per phase; the old {heat, strikes} pair is gone
    // from this screen entirely, though actScore still reads it for a client that has not reloaded yet.
    const act = useMemo(() => ({ phases: scores }), [scores]);
    // Which painting is on. The rack is the finale's room and the fallback, so an unknown game can never
    // leave the act with no backdrop at all.
    const room = phase < PHASES && games[phase] ? (games[phase].room ?? 2) : 2;
    // The running quality of the craft so far, which is what the work-piece glows with. It used to be
    // the bellows' heat, which no longer exists as a concept here.
    const heat = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : 0;

    // ⚠️ ONE PLACE TAKES A SCORE, AND IT ADVANCES THE ROOM WITH IT. A phase reports exactly once (see
    // useMini), so appending is safe; the stage follows the count rather than being set separately,
    // because two sources of truth for "which phase are we on" is how a craft ends up on the rack with
    // two scores in hand.
    const takePhase = useCallback((score) => {
        setScores((prev) => {
            const next = [...prev, Math.max(0, Math.min(1, Number(score) || 0))];
            const g = games[prev.length];
            const graded = score >= 0.92 ? { id: "perfect", word: "CLEAN" }
                : score >= 0.7 ? { id: "hit", word: "GOOD" }
                : score >= 0.4 ? { id: "ok", word: "ROUGH" }
                : { id: "miss", word: "POOR" };
            setStageSay({ ...graded, sub: g?.name || "", at: "phase" });
            Haptic.fire(graded.id === "perfect" ? [0, 26, 40, 26, 40, 60] : graded.id === "miss" ? [0, 90] : [0, 30, 50, 20]);
            setStage(next.length >= PHASES ? STAGE.setting : STAGE.playing);
            return next;
        });
    }, [games]);
    const score = actScore(act);
    const rack = useMemo(() => rackFor(level), [level]);
    const scatter = scatterFor(act);
    const odds = useMemo(() => oddsForAim(rack, aim, scatter), [rack, aim, scatter]);
    // ── ⚠️ recipeArt, NOT groveArt. THE ACT WAS ASKING THE WRONG FUNCTION ───────────────────────────
    // groveArt answers "what does this LOOSE ITEM look like" — a part, an emblem, a food — and returns null
    // for everything else. recipeArt answers "what does this RECIPE look like" and has known about packs,
    // vaults, plots, decorations and charms since it was written. The act asked the first one, so forging a
    // Backpack III or a Rootwood Seeking ran the whole three-stage ceremony around an EMPTY FRAME, while the
    // workbench row that launched it showed the sprite correctly two inches away.
    //
    // Found by auditing art coverage with groveArt and getting 23 false positives: the audit was asking the
    // same wrong question this line was, which is the only reason it surfaced.
    const art = recipe?.kind === "tool" ? toolArt(recipe.slot, recipe.tier) : recipeArt(recipe);

    // ── THE HEAT CLOCK ──────────────────────────────────────────────────────────────────────────────
    // ⚠️ rAF with the elapsed time read from the CLOCK, never counted in ticks. A backgrounded tab would
    // leave the bellows running, and the first frame can predate the start — see
    // [[negative-dt-first-frame]], which dropped every body in the Grove through the floor for a day.
    // The stage word says its piece and goes. ⚠️ CLEARED ON A TIMER rather than an animation event: an
    // animationend never fires if the element is not painted, and a verdict that never clears would sit
    // across the anvil for the rest of the craft. Same reason the Grove's herald does it this way.
    useEffect(() => {
        if (!stageSay) return undefined;
        const t = setTimeout(() => setStageSay(null), 1700);
        return () => clearTimeout(t);
    }, [stageSay]);

    // ── ⚠️ THE OLD BELLOWS AND ANVIL CLOCKS LIVED HERE, AND THEY ARE GONE ───────────────────────────
    // Three effects stood here: a 3-2-1 count-in, a 2.6s heat clock that ended by advancing the stage,
    // and a marker sweep for the hammer. All three were machinery for two hardcoded beats that are now
    // two of ten drawn games (see GroveMinis), each carrying its own clock in the shared harness.
    //
    // ⚠️ THEY WERE STARVED BEFORE THEY WERE CUT, deliberately and in a separate commit: a fourth stage
    // value meant nothing ever set `fire` or `shaping`, so every guard returned immediately and the
    // feature could be proven end to end with the dead code inert but present. Deleting live wiring and
    // changing behaviour in one move is how the batch-craft regression shipped this morning.

    // ── THE FALL ────────────────────────────────────────────────────────────────────────────────────
    // Stepped a peg row at a time rather than transitioned to the floor: the rattle is the drama, and a
    // piece that slides smoothly into its bin has not bounced off anything.
    useEffect(() => {
        if (!result?.set?.path) return undefined;
        let row = 0;
        setFallRow(0);
        const id = setInterval(() => {
            row += 1;
            if (row >= result.set.path.length) {
                clearInterval(id);
                setFallRow(result.set.path.length - 1);
                // ⚠️ SCALED TO THE RESULT. A Rough gets a thud; the top two bands get the burst, the jolt
                // and the full chime. A celebration that fires identically for every outcome teaches the
                // player to stop reading it.
                const band = result.set.band;
                const big = band === "masterwork" || band === "pristine";
                setBurst(true);
                if (big) { setShake(true); setTimeout(() => setShake(false), 480); }
                if (band === "masterwork") celebrateUnlock(); else playPickup(big);
                setTimeout(() => setSettled(true), 520);
                return;
            }
            if (rang.current !== row) { rang.current = row; playDrop(); }
            setFallRow(row);
        }, 110);
        return () => clearInterval(id);
    }, [result]);

    // ⚠️ POSTED ONCE, EVER. Release can fire from a tap and a pointer-up in the same frame.
    const release = useCallback(async () => {
        if (posted.current) return;
        posted.current = true;
        const d = await onCommit(act, aim);
        if (!d?.ok) { onClose(d); return; }
        // ⚠️ A BATCH CLOSES, IT DOES NOT DEAL A CARD. The result card is built around ONE landing in ONE
        // band, and a batch has as many of each as it made — the bench writes the summary note instead.
        // Closing on a successful batch is the finish line here, not a failure path.
        if (d.batched) { onClose(d); return; }
        setResult(d);
    }, [act, aim, onCommit, onClose]);
    // ⚠️ tapHeat AND strike WERE HERE. They were the two hardcoded beats' input handlers; the games own
    // their own input now. Removed with their clocks above.

    // ── AIMING ──────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ NO setPointerCapture. It is the obvious way to track a drag and it breaks MOUSE clicks outright —
    // see [[pointer-capture-kills-desktop-clicks]].
    const dragging = useRef(false);
    const aimAt = useCallback((clientX) => {
        const box = rackRef.current?.getBoundingClientRect();
        if (!box || !box.width) return;
        setAim(Math.max(0, Math.min(1, (clientX - box.left) / box.width)));
    }, []);
    const canAim = stage === STAGE.setting && !result;
    const onDown = (e) => { if (!canAim) return; dragging.current = true; aimAt(e.clientX); };
    const onMove = (e) => { if (canAim && dragging.current) aimAt(e.clientX); };
    const onUp = () => { dragging.current = false; };

    useEffect(() => {
        const key = (e) => {
            if (canAim) {
                if (e.key === "ArrowLeft") { e.preventDefault(); setAim((a) => Math.max(0, a - 0.02)); }
                if (e.key === "ArrowRight") { e.preventDefault(); setAim((a) => Math.min(1, a + 0.02)); }
                if (e.key === " " || e.key === "Enter") { e.preventDefault(); release(); }
                return;
            }
            // ⚠️ NO KEYBOARD PATH INTO A PHASE ANY MORE, AND THAT IS NOT AN OVERSIGHT I AM HIDING. The old
            // two beats were both "press a button", so space worked for them. The ten are a dial, a drag, a
            // scrub and a traced path — there is no one key that means all of those, and wiring space to
            // whichever game happens to be up would work for three of them and silently do nothing for the
            // rest. The rack below still takes arrows and space, because aiming genuinely is one axis.
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [stage, canAim, release]);

    const pieceX = fallRow >= 0 && result?.set?.path ? result.set.path[fallRow] : aim;
    const landedBand = settled ? result?.set?.band : null;

    return (
        // ⚠️ `is-playing` HANDS THE SCREEN TO THE GAME. Luke: "all the new minigames need to be like, they
        // need to take up a majority of the screen." They were a 32vh card pinned under a full-bleed
        // painting — the scene was the feature and the thing you actually DO was a strip at the bottom.
        // While a phase is running the panel takes the room and the forge becomes the wall behind it.
        <div className={`gv-act${shake ? " is-shook" : ""}${phase < PHASES ? " is-playing" : ""}`}
            role="dialog" aria-label={`Crafting ${recipe?.name || ""}`}>
            {/* ⚠️ ONE LAYER PER STAGE, CROSS-FADED, rather than swapping a background-image url. Swapping
                the url makes the next scene pop in unpainted; three stacked layers let the move between
                places be a dissolve, and all three are decoded from the first frame. */}
            <div className="gv-act-scenes" aria-hidden="true">
                {/* ⚠️ THE ROOM COMES FROM THE GAME, NOT THE STAGE NUMBER. Three paintings, ten games — so a
                    drawn phase says which room it happens in: heat work in the forge, metal work at the
                    anvil, finishing at the rack. Keying to the stage index would have put The Polish in a
                    coal fire. */}
                {STAGE_BG.map((bg, i) => (
                    <i key={bg} className={`gv-act-scene${i === room ? " is-on" : ""}`}
                        style={{ backgroundImage: `url(/images/grove/${bg}.webp)` }} />
                ))}
            </div>

            {/* ── THE WORK, STANDING IN THE ROOM ─────────────────────────────────────────────────
                Positioned over the SCENE at that room's hot spot, not inside the control panel —
                so the piece is in the coal bed and on the anvil face rather than hovering in front
                of them. The panel sits below it and no longer covers what you are looking at. */}
            {STAGE_ANCHOR[room] ? (
                <div className="gv-act-work-at"
                    style={{ left: `${STAGE_ANCHOR[room].x}%`, top: `${STAGE_ANCHOR[room].y}%` }}>
                    {/* ⚠️ THE AMBIENT COALS, THE 3-2-1 AND THE "TAP!" WERE DRAWN HERE and are gone with
                        the bellows that owned them. A game that needs a count-in now carries one itself. */}
                    {art ? (
                        <img className={`gv-act-work-piece${flash ? ` is-struck is-${flash.id}` : ""}`}
                            src={art} alt="" width={104} height={104}
                            style={stage === STAGE.fire ? {
                                filter: `drop-shadow(0 0 ${8 + heat * 34}px rgba(255,${Math.round(165 - heat * 75)},45,${0.4 + heat * 0.6})) brightness(${1 + heat * 0.5}) saturate(${1 + heat * 0.4})`,
                            } : undefined} />
                    ) : null}
                    {flash ? <em className={`gv-act-flash is-${flash.id}`}>{flash.label}</em> : null}
                    {/* How the stage you just left went. Keyed so a repeat grade still re-animates. */}
                    {stageSay ? (
                        <em key={`${stageSay.at}-${stageSay.word}`} className={`gv-act-stageword is-${stageSay.id}`}>
                            {stageSay.word}<i>{stageSay.sub}</i>
                        </em>
                    ) : null}
                    {/* Sparks off the anvil on every blow, in the colour the blow earned. */}
                    {stage === STAGE.shaping && flash ? (
                        <span className={`gv-act-sparks is-${flash.id}`} aria-hidden="true">
                            {Array.from({ length: 10 }, (_, i) => (
                                <i key={i} style={{ "--a": `${-20 - i * 14}deg`, "--d": `${26 + (i % 3) * 14}px` }} />
                            ))}
                        </span>
                    ) : null}
                </div>
            ) : null}

            <div className="gv-act-in">
                <h4 className="gv-act-plank">
                    {art ? <img className="gv-act-ico" src={art} alt="" width={34} height={34} /> : null}
                    {recipe?.name}
                    {/* The phase's own name — "The fire" is a lie when the phase is The Polish. */}
                    <i>{phase < PHASES && games[phase] ? games[phase].name : STAGE_NAME[2]}</i>
                </h4>

                <div className="gv-act-beats" aria-hidden="true">
                    {games.map((g, i) => (
                        <span key={g.id} className={i === phase ? "is-now" : i < phase ? "is-done" : ""} />
                    ))}
                </div>

                {/* ── THE THREE DRAWN PHASES ────────────────────────────────────────────────────
                    Luke: "it should pull from, like, let's say 10 different kind of mini games... it'll
                    pull three of them, and there's clearly three phases." And then: "Wire it all up dont
                    do fake demo stuff."

                    The act used to hardcode two beats -- a bellows and three hammer blows -- written
                    inline here. They are two of ten now and they are drawn, so this renders whichever
                    three came up and knows nothing else about them. Every game reports one number and the
                    act keeps three; see actScore.

                    ⚠️ KEYED ON THE PHASE INDEX so each game mounts fresh. Without the key React would
                    reuse the previous game's component instance when two phases happen to share a type,
                    and the second would inherit the first's clock and score. */}
                {phase < PHASES && games[phase] ? (
                    <GroveMini key={`p${phase}`} game={games[phase]} onDone={takePhase} />
                ) : null}

                {/* ── STAGE THREE: THE SETTING ──────────────────────────────────────────────────── */}
                {stage === STAGE.setting ? (
                    <div className="gv-act-stage">
                        <div className="gv-act-rack" ref={rackRef}
                            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
                            <div className="gv-act-pegs">
                                {Array.from({ length: PEG_ROWS }, (_, r) => (
                                    <span key={r} className={`gv-act-pegrow${fallRow === r ? " is-struck" : ""}`} aria-hidden="true">
                                        {Array.from({ length: 8 + (r % 2) }, (_, c) => <i key={c} />)}
                                    </span>
                                ))}
                                {/* ── ⚠️ A BALL, NOT THE ITEM ────────────────────────────────────────
                                    Luke: "I don't want it to be the item that Plinkos. I want it to
                                    just be like a colorful ball or something, but like it has to have
                                    way more dopamine as it bounces around, and then a massive dopamine
                                    burst when it splashes at the bottom."

                                    The thing falling was the recipe's own sprite — a 32px pickaxe
                                    tumbling down a peg board, which reads as the object being dropped
                                    and damaged rather than as a game being played. A ball has no such
                                    baggage and can be as loud as it likes.

                                    --n rises 0 -> 1 as it falls and the CSS rides it: the hue travels
                                    the spectrum, the glow grows, and the trail lengthens. */}
                                <span className={`gv-act-piece${settled ? " is-set" : ""}`}
                                    style={{
                                        left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                        top: fallRow >= 0 ? `${((fallRow + 1) / PEG_ROWS) * 100}%` : "0%",
                                        "--n": fallRow >= 0 ? ((fallRow + 1) / PEG_ROWS).toFixed(3) : "0",
                                    }}>
                                    <b className="gv-act-orb" aria-hidden="true" />
                                </span>
                                {burst ? (
                                    <span className={`gv-act-burst is-${result?.set?.band}`}
                                        style={{ left: `${Math.max(0, Math.min(100, pieceX * 100))}%`,
                                            "--band": bandTint(result?.set?.band) }} aria-hidden="true">
                                        {/* Twelve shards over 18-45px was a polite puff. Twenty-four over
                                            three times the throw, with the band's own colour, is the
                                            "massive dopamine burst when it splashes" Luke asked for. */}
                                        {Array.from({ length: 24 }, (_, i) => (
                                            <i key={i} style={{
                                                "--a": `${i * 15 + (i % 3) * 5}deg`,
                                                "--d": `${46 + (i % 5) * 22}px`,
                                                "--t": `${(i % 4) * 26}ms`,
                                            }} />
                                        ))}
                                    </span>
                                ) : null}
                            </div>

                            <div className="gv-act-buckets">
                                {rack.map((s, i) => {
                                    const w = s.to - s.from;
                                    return (
                                        <span key={`${s.id}-${i}`}
                                            className={`gv-act-bucket is-${s.id}${landedBand === s.id && settled ? " is-hit" : ""}`}
                                            style={{ width: `${w * 100}%`, "--band": bandTint(s.id) }}>
                                            {/* A bin too thin to read is left to its colour — a label in
                                                every one put three numbers on top of each other in the
                                                narrow middle. */}
                                            {s.id !== "masterwork" && w > 0.085 ? <b>×{s.mult.toFixed(2)}</b> : null}
                                        </span>
                                    );
                                })}
                            </div>

                            <span className="gv-act-jack" style={{ left: `${RACK_MIDDLE * 100}%` }} aria-hidden="true">
                                <b>×{QUALITY_BANDS[0].mult.toFixed(2)}</b>
                            </span>
                            {canAim ? (
                                <span className="gv-act-aim" style={{ left: `${aim * 100}%` }} aria-hidden="true" />
                            ) : null}
                        </div>

                        <ul className="gv-act-odds">
                            {odds.bands.filter((o) => o.share > 0.004).map((o) => (
                                <li key={o.id} className={`is-${o.id}`} style={{ "--band": bandTint(o.id) }}>
                                    <b>{Math.round(o.share * 100)}%</b>
                                    <span>{o.name}</span>
                                </li>
                            ))}
                        </ul>

                        <p className="gv-act-say">
                            {settled ? SET_WORD[result?.set?.band] || "It sets"
                                : result ? "Let it fall" : "Pick your spot"}
                        </p>

                        {settled && result ? (
                            // ── ⚠️ THE PAYOFF, AND IT USED TO BE A BUTTON WITH A WORD ON IT ─────────
                            // Luke: "here you can see like it rolled pristine, but I have no idea what
                            // that means. Like there's, this is the moment you're missing where it's a
                            // huge, should be like a huge dopamine reveal of like what all of your
                            // efforts mounted up to."
                            //
                            // Three beats of a craft -- a flurry on the bellows, three timed blows, an
                            // aimed drop -- all landed on the word "Pristine" in a yellow pill, and
                            // "Pristine" is an adjective. It never said the one number that makes it
                            // worth wanting: a band is a MULTIPLIER on the piece's stats, and x1.60 is
                            // a sentence anybody can read.
                            //
                            // So the reveal states the multiplier as the hero, names the band under it,
                            // and shows the three beats that produced it -- because the question after a
                            // good roll is "what did I do right", and after a bad one it is "what do I
                            // fix", and both answers are the same three marks.
                            <div className={`gv-act-reveal is-${result.set.band}`}
                                style={{ "--band": bandTint(result.set.band), "--band-ink": bandInk(result.set.band) }}>
                                <b className="gv-act-reveal-mult">
                                    x{(QUALITY_BANDS.find((b) => b.id === result.set.band)?.mult || 1).toFixed(2)}
                                </b>
                                <span className="gv-act-reveal-band">
                                    {QUALITY_BANDS.find((b) => b.id === result.set.band)?.name || "Done"}
                                </span>
                                <span className="gv-act-reveal-sub">to every stat on it</span>
                                {/* ── ⚠️ THE RUN, REPORTED IN THE UNITS THE RUN WAS ACTUALLY PLAYED IN ──────
                                    This read "18 pumps" and a row of hammer dots, which was the whole truth
                                    when every craft was a bellows and three strikes. With three games drawn
                                    from ten it was a lie on seven of them — a Polish and an Inlay reported
                                    as pumps. It names what was drawn and how each one went instead. */}
                                <span className="gv-act-reveal-run" aria-hidden="true">
                                    {games.map((g, i) => (
                                        <i key={g.id}>{g.name.replace(/^The /, "")}
                                            <b>{scores[i] == null ? "—" : `${Math.round(scores[i] * 100)}%`}</b>
                                        </i>
                                    ))}
                                    <i>{Math.round(score * 100)}% work</i>
                                </span>
                                <button type="button"
                                    className={`gv-act-hit is-band is-${result.set.band}`}
                                    style={{ "--band": bandTint(result.set.band), "--band-ink": bandInk(result.set.band) }}
                                    onPointerDown={() => onClose(result)}>
                                    Take it
                                </button>
                            </div>
                        ) : result ? (
                            <span className="gv-act-work">the work is {Math.round(score * 100)}%</span>
                        ) : (
                            <button type="button" className="gv-act-hit is-release" onPointerDown={release}>
                                LET IT GO
                            </button>
                        )}
                    </div>
                ) : null}

                <span className="gv-act-trim" aria-hidden="true" />
            </div>
        </div>
    );
}
