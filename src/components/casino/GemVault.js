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
const REVEAL_MS = 330;      // the lid coming off
const FLY_MS = 620;         // the stone travelling down to its set
const FILL_MS = 700;        // the set lighting up when its last slot lands
const WIN_MS = 2600;        // the prize on screen before it hands back

export default function GemVault({ gems, bet, onDone }) {
    const sets = useMemo(() => gems?.sets || [], [gems]);
    const order = useMemo(() => gems?.order || [], [gems]);

    // How many covers are on the board, and in what arrangement. A LAZY INITIALISER, not a ref filled during
    // render: shuffling in the render body both touches a ref and calls Math.random() while React is drawing,
    // and the rule against that is not pedantry — under a re-render the board would reshuffle underneath a
    // half-finished pick, which is the one bug this screen cannot have. Run once, by construction.
    const [layout] = useState(() => {
        const slots = order.map((key, i) => ({ key, i }));
        for (let i = slots.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [slots[i], slots[j]] = [slots[j], slots[i]];
        }
        return slots;
    });

    const [turned, setTurned] = useState({});     // tile index -> stone key
    const [have, setHave] = useState(() => Object.fromEntries(sets.map((s) => [s.key, 0])));
    const [flying, setFlying] = useState(null);   // { key, from } — a stone on its way to its set
    const [filled, setFilled] = useState(null);   // the set that just completed
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

        setTurned((p) => ({ ...p, [tile]: key }));
        Cas.reelStop(2, 0.5);
        Haptic.hit(0.3);
        await wait(REVEAL_MS);

        // ── AND IT GOES SOMEWHERE ────────────────────────────────────────────────────────────────────────
        // The stone flies out of the tile and down into its set's tray. Without the flight it is a grid that
        // changes colour and a counter that changes number, and nothing on screen says those two facts are
        // the same fact.
        setFlying({ key, from: tile });
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
            setDone(true);
            await wait(WIN_MS);
            onDone?.();
            return;
        }
        setBusy(false);
    }, [busy, done, turned, order, sets, have, onDone]);

    const winner = filled;

    return (
        <div className="gv">
            <div className="gv-head">
                <span className="gv-kick">The Gem Vault</span>
                <b className="gv-title">{done ? "Set complete" : "Turn a stone"}</b>
            </div>

            {/* ── THE BOARD ────────────────────────────────────────────────────────────────────────────
                Twenty-four covers, four across. A turned one keeps its stone on it rather than emptying,
                so the board itself is a record of how the run went — which is what makes being one short
                legible at a glance instead of only in the trays. */}
            <div className="gv-board" aria-label="Pick a stone">
                {layout.map((slot, i) => {
                    const key = turned[i];
                    const set = key ? sets.find((s) => s.key === key) : null;
                    return (
                        <button key={i} type="button"
                            className={`gv-tile${key ? " is-turned" : ""}${flying?.from === i ? " is-flying" : ""}`}
                            disabled={busy || done || Boolean(key)}
                            style={set ? { "--gem": set.color } : undefined}
                            onClick={() => pick(i)}
                            aria-label={key ? set?.name : "Turn this stone"}>
                            {key ? (
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
                <img className="gv-fly" src={sets.find((s) => s.key === flying.key)?.art} alt="" draggable="false" />
            ) : null}

            {done && winner ? (
                <div className="gv-won" style={{ "--gem": winner.color }}>
                    <span className="gv-won-kick">{winner.name} set complete</span>
                    <b className="gv-won-n">{(winner.pay * (bet || 0)).toLocaleString()}</b>
                    <span className="gv-won-sub">chips</span>
                </div>
            ) : null}
        </div>
    );
}
