"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";

// ── THE GEM VAULT ────────────────────────────────────────────────────────────────────────────────────────────
// Luke, describing the machine he wants the Vault to be: "there's a bonus game where there's these three spy
// glasses — if you get three scattered you initiate the bonus where you pick a bunch of different gems and it
// reveals what's behind them, and it shows you on the bottom the different prizes associated with the gems...
// it's fully animated, has all the noises and music and awesomeness and super dopamine, and then when you
// finally get the slots all filled that gives you that prize and it goes back to the regular game."
//
// So the ladder is not a ladder — it is FOUR COLLECTIONS, filling at once. Every tile you turn is a stone
// going into one of four sets, the first set to fill pays, and the bonus ends there. Which makes every pick
// good for somebody: the tension is which of the four gets home, and you can be one ruby short when the
// topazes fill and it is over.
//
// THE SERVER DECIDED THE ORDER, not the tile. Same as the Warren: the tile a finger lands on is mapped to the
// next stone in the server's list. Pretending the chosen tile decides the outcome would be a lie; pretending
// it does not matter which one you touched would look broken.
// ── THE BEAT OF ONE PICK ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "instead of the gold lock boxes I wanted the diamonds that you touch, and then in the top right it
// does this animation where it cracks apart and reveals what it is."
//
// So a pick is no longer one event, it is four, and they happen in a STAGE rather than on the tile. The tile
// is small — a stone cracking open at 55px is a flicker — and the whole point of the moment is that you get
// to watch it. The crystal you touched flies up to the stage at full size, shakes, breaks in half, and what
// was inside is standing there when the halves clear.
const SHAKE_MS = 380;       // the crystal rocking, deciding whether to go
const CRACK_MS = 460;       // the two halves parting
const SHOW_MS = 520;        // the stone standing in the wreckage
const FLY_MS = 620;         // ...and travelling down to its set
const FILL_MS = 700;        // the set lighting up when its last slot lands
const MISSED_MS = 2400;     // the rest of the board turned over, so you see what you walked past
const WIN_MS = 2600;        // the prize on screen before it hands back

export default function GemVault({ gems, bet, onDone }) {
    const sets = useMemo(() => gems?.sets || [], [gems]);
    const order = useMemo(() => gems?.order || [], [gems]);

    // How many covers are on the board, and in what arrangement. A LAZY INITIALISER, not a ref filled during
    // render: shuffling in the render body both touches a ref and calls Math.random() while React is drawing,
    // and the rule against that is not pedantry — under a re-render the board would reshuffle underneath a
    // half-finished pick, which is the one bug this screen cannot have. Run once, by construction.
    // THE WHOLE BOARD, not the number of stones that happened to be drawn. `order` is only as long as the run
    // took, so building covers from it gave a seven-tile board on a seven-pick run — the bonus looked nearly
    // finished before a finger touched it, and the shape of the thing (24 covers, four sets in a race) was
    // invisible. `tiles` is the bag.
    const [layout] = useState(() => Array.from({ length: gems?.tiles || order.length || 24 }, (_, i) => i));

    const [turned, setTurned] = useState({});     // tile index -> stone key
    const [have, setHave] = useState(() => Object.fromEntries(sets.map((s) => [s.key, 0])));
    const [flying, setFlying] = useState(null);   // { key, from } — a stone on its way to its set
    // What the reveal stage is doing: "shake" | "crack" | "show", and which stone is inside.
    const [stage, setStage] = useState(null);
    const [filled, setFilled] = useState(null);   // the set that just completed
    // ── AND WHAT WAS UNDER EVERYTHING ELSE ───────────────────────────────────────────────────────────────
    // Luke: "whenever you reveal and get the prize, we also want to show for a little while everything else
    // that you didn't pick — we're going to reveal that so that you know what you missed."
    //
    // Which is the best part of a pick bonus and the reason you want another one immediately: the ruby that
    // was one cover away. `board` is the whole shuffled bag and `order` is only the prefix that was drawn, so
    // the leftovers are everything past the cursor, laid onto the covers nobody touched.
    const [missed, setMissed] = useState(null);   // tile index -> the stone that was under it
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const cursor = useRef(0);
    const timers = useRef([]);
    const wait = (ms) => new Promise((r) => timers.current.push(setTimeout(r, ms)));

    const pick = useCallback(async (tile) => {
        if (busy || done || turned[tile] != null) return;
        unlock();
        setBusy(true);

        // The next stone in the server's order, not the one "under" this tile — see the note above.
        const key = order[cursor.current];
        cursor.current += 1;
        const set = sets.find((s) => s.key === key);

        // The tile empties immediately — the crystal has left the board and is up on the stage.
        setTurned((p) => ({ ...p, [tile]: key }));

        setStage({ phase: "shake", key });
        Cas.reelStop(2, 0.5);
        Haptic.hit(0.3);
        await wait(SHAKE_MS);

        // ── IT BREAKS ────────────────────────────────────────────────────────────────────────────────────
        // Two halves of the same sprite, clipped down the middle and thrown apart — see .gvs-half. One
        // drawing rather than two, because a left half and a right half generated separately would never
        // line up along the break, and the seam is the one thing this animation is about.
        setStage({ phase: "crack", key });
        Cas.jackpot();
        Haptic.crit();
        await wait(CRACK_MS);

        setStage({ phase: "show", key });
        await wait(SHOW_MS);

        // ── AND IT GOES SOMEWHERE ────────────────────────────────────────────────────────────────────────
        // The stone flies out of the tile and down into its set's tray. Without the flight it is a grid that
        // changes colour and a counter that changes number, and nothing on screen says those two facts are
        // the same fact.
        setFlying({ key, from: tile });
        setStage(null);
        Cas.coin(1);
        await wait(FLY_MS);
        setFlying(null);

        const next = (have[key] || 0) + 1;
        setHave((p) => ({ ...p, [key]: next }));
        Haptic.hit(0.35);

        if (set && next >= set.need) {
            // ── THE SET FILLS, AND THAT IS THE BONUS ─────────────────────────────────────────────────
            setFilled(set);
            Cas.jackpot();
            Haptic.crit();
            await wait(FILL_MS);

            // Everything past the cursor, dealt onto the covers still face down — in tile order, which is as
            // arbitrary as the shuffle that produced it and reads as "this is what was there".
            const rest = (gems?.board || []).slice(cursor.current);
            const left = {};
            let r = 0;
            for (let t = 0; t < (gems?.tiles || 0); t += 1) {
                if (turned[t] != null || t === tile) continue;
                if (r < rest.length) { left[t] = rest[r]; r += 1; }
            }
            setMissed(left);
            Cas.reelStop(0, 0.4);
            await wait(MISSED_MS);

            setDone(true);
            await wait(WIN_MS);
            onDone?.();
            return;
        }
        setBusy(false);
    }, [busy, done, turned, order, sets, have, onDone, gems]);

    const winner = filled;

    return (
        <div className="gv">
            {/* ── THE HEAD, AND THE STAGE IN THE TOP RIGHT ────────────────────────────────────────────
                Title on the left, the reveal on the right, exactly where Luke put it. The stage holds its
                size whether or not anything is in it: a panel that appears on the first pick would shove the
                board down mid-tap, and a board that moves under a finger is the one thing a pick screen
                cannot do. */}
            <div className="gv-head">
                <span className="gv-headtext">
                    <span className="gv-kick">The Gem Vault</span>
                    <b className="gv-title">{missed ? "What you left behind" : done ? "Set complete" : "Turn a stone"}</b>
                </span>
                <span className={`gvs${stage ? ` is-${stage.phase}` : ""}`} aria-hidden="true">
                    {stage ? (
                        <>
                            {/* TWO HALVES OF ONE DRAWING. Clipped down the middle and thrown apart, so the
                                break line is exactly where the two pieces meet — which two separately drawn
                                halves could never promise. */}
                            {/* eslint-disable @next/next/no-img-element */}
                            <img className="gvs-half is-l" src="/images/casino/vault/gv-gem.png" alt="" draggable="false" />
                            <img className="gvs-half is-r" src="/images/casino/vault/gv-gem.png" alt="" draggable="false" />
                            {stage.phase === "crack" || stage.phase === "show" ? (
                                <i className="gvs-burst">
                                    {Array.from({ length: 10 }, (_, k) => <b key={k} style={{ "--k": k }} />)}
                                </i>
                            ) : null}
                            {stage.phase === "show" ? (
                                <img className="gvs-prize" src={sets.find((x) => x.key === stage.key)?.art} alt=""
                                    draggable="false" style={{ "--gem": sets.find((x) => x.key === stage.key)?.color }} />
                            ) : null}
                            {/* eslint-enable @next/next/no-img-element */}
                        </>
                    ) : null}
                </span>
            </div>

            {/* ── THE BOARD ────────────────────────────────────────────────────────────────────────────
                Twenty-four covers, four across. A turned one keeps its stone on it rather than emptying,
                so the board itself is a record of how the run went — which is what makes being one short
                legible at a glance instead of only in the trays. */}
            <div className="gv-board" aria-label="Pick a stone">
                {layout.map((_, i) => {
                    const key = turned[i];
                    // A cover you never opened, turned over at the end. Drawn the same way but held back —
                    // see `.gv-tile.is-missed` — because it has to read as "what was there" and never as a
                    // stone you collected.
                    const miss = !key && missed ? missed[i] : null;
                    const set = (key || miss) ? sets.find((s) => s.key === (key || miss)) : null;
                    return (
                        <button key={i} type="button"
                            className={`gv-tile${key ? " is-turned" : ""}${miss ? " is-turned is-missed" : ""}${flying?.from === i ? " is-flying" : ""}`}
                            disabled={busy || done || Boolean(key)}
                            /* `--i` staggers the sheen so it crosses the board as a WAVE rather than
                               twenty-four doors flashing in unison, which reads as a glitch. */
                            style={{ "--i": i % 6, ...(set ? { "--gem": set.color } : {}) }}
                            onClick={() => pick(i)}
                            aria-label={key || miss ? set?.name : "Break this crystal"}>
                            {key || miss ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={set?.art} alt="" draggable="false" />
                            ) : <i className="gv-lid" aria-hidden="true" />}
                        </button>
                    );
                })}
            </div>

            {/* ── THE FOUR SETS, ALONG THE BOTTOM ──────────────────────────────────────────────────────
                Exactly what Luke asked for: "it shows you on the bottom the different prizes associated
                with the gems". Each one shows its stone, what it pays, and how many slots are still empty —
                so "two more sapphires" is something you can read rather than count. */}
            <div className="gv-sets">
                {sets.map((s) => {
                    const n = have[s.key] || 0;
                    return (
                        <div key={s.key}
                            className={`gv-set${winner?.key === s.key ? " is-won" : ""}${n > 0 ? " is-live" : ""}`}
                            style={{ "--gem": s.color }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="gv-set-art" src={s.art} alt="" draggable="false" />
                            <span className="gv-set-pay">{(s.pay * (bet || 0)).toLocaleString()}</span>
                            <span className="gv-set-slots" aria-label={`${n} of ${s.need}`}>
                                {Array.from({ length: s.need }).map((_, k) => (
                                    <i key={k} className={k < n ? "is-in" : undefined} />
                                ))}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* The stone in flight. One element, moved by a class — a per-tile animation would mean
                twenty-four of them sitting in the DOM doing nothing. */}
            {flying ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gv-fly" src={sets.find((s) => s.key === flying.key)?.art} alt="" draggable="false"
                    style={{ filter: `drop-shadow(0 0 16px ${sets.find((s) => s.key === flying.key)?.color || "#fff"})` }} />
            ) : null}

            {done && winner ? (
                <div className="gv-won" style={{ "--gem": winner.color }}>
                    {/* The stone you actually filled, big. A number on its own is a receipt. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="gv-won-art" src={winner.art} alt="" draggable="false" />
                    <span className="gv-won-kick">{winner.name} set complete</span>
                    <b className="gv-won-n">{(winner.pay * (bet || 0)).toLocaleString()}</b>
                    <span className="gv-won-sub">chips</span>
                </div>
            ) : null}
        </div>
    );
}
