"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";
import { GiCombinationLock, GiOpenGate } from "react-icons/gi";

// ── THE LOCKS ────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "you reveal tiles that give you extra spins and extra multiplier going into a free spins, and then if
// you pick the wrong one, it begins the free spin bonus."
//
// THE REASON THIS IS THE BEST MECHANIC ON THE FLOOR is not obvious until you play it: there is no bad outcome.
// Every lock is a gift — more spins, a bigger multiplier — and the one that ends the picking does not take
// anything away, it starts the thing you have been building. So the tension is entirely "how much more dare I
// stack", and the answer is never a punishment.
//
// Which is the opposite of the pick this replaced, where one tile ended the round and took the board with it.
// Same interaction, same number of taps, completely different feeling — one is nerve under threat, the other
// is greed with no downside, and only the second one gets replayed.
//
// So the screen's whole job is to make the two counters feel like they are YOURS. They sit above the board,
// they jump every time you add to them, and the last thing that happens before the round is both of them
// being read back to you.

export default function TheLocks({ built, onDone }) {
    const [turned, setTurned] = useState([]);
    const [pop, setPop] = useState(null);
    const [bump, setBump] = useState(-1);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const tiles = built?.picked || [];
    const opened = turned.some((i) => tiles[i]?.kind === "launch");

    // Counted from what has actually been turned, not from the server's final numbers — the totals must not
    // run ahead of the taps that earned them.
    let spins = built?.base ?? 8;
    let mult = 1;
    for (const i of turned) {
        const t = tiles[i];
        if (!t) continue;
        if (t.kind === "spins") spins += t.value;
        else if (t.kind === "mult") mult += t.value;
    }

    const turn = useCallback((i) => {
        if (opened || turned.includes(i)) return;
        unlock();
        const t = tiles[i];
        if (!t) return;
        setTurned((p) => [...p, i]);
        setBump(i);
        timers.current.push(setTimeout(() => setBump(-1), 460));

        if (t.kind === "launch") {
            setPop({ i, kind: "launch", text: "the door" });
            Cas.jackpot();
            Haptic.crit();
            timers.current.push(setTimeout(() => onDone(), 2000));
            return;
        }
        if (t.kind === "spins") {
            setPop({ i, kind: "spins", text: `+${t.value} spins` });
            Cas.coin(t.value);
        } else {
            setPop({ i, kind: "mult", text: `+${t.value}x` });
            Cas.multUp(t.value);
        }
        Haptic.hit(0.45);
    }, [opened, turned, tiles, onDone]);

    return (
        <div className="lk">
            <div className="lk-head">
                <i>{built?.label || "The Locks"}</i>
                <p>{opened ? "The door is open." : "Every lock adds to the round. One of them opens the door."}</p>
            </div>

            {/* ── WHAT YOU HAVE BUILT ─────────────────────────────────────────────────────────────────
                The two things being stacked, above the board and larger than it. They are the point — the
                locks are just how you get at them — and each jumps as it grows so the gain is felt rather
                than read. */}
            <div className="lk-built">
                <span className={bump >= 0 && tiles[bump]?.kind === "spins" ? "is-up" : ""}>
                    <b>{spins}</b><i>free spins</i>
                </span>
                <span className={bump >= 0 && tiles[bump]?.kind === "mult" ? "is-up" : ""}>
                    <b>&times;{mult}</b><i>on everything</i>
                </span>
            </div>

            {/* ── THE BOARD SHAPES ITSELF TO THE ROUND ────────────────────────────────────────────────
                A round is as long as it took to find the door — anything from one lock to ten — and a
                fixed five columns made a six-lock round render as five and then a lonely one, with the
                whole board floating in the middle of an empty stage. Columns come off the count so it
                is always a block: 3x2 for six, 4x2 for eight, 5x2 for ten. */}
            <div className="lk-board" style={{ "--cols": tiles.length <= 3 ? tiles.length : Math.ceil(tiles.length / 2) }}>
                {tiles.map((t, i) => {
                    const done = turned.includes(i);
                    return (
                        <button key={i} type="button"
                            className={`lk-tile${done ? ` is-done is-${t.kind}` : ""}${bump === i ? " is-bump" : ""}${opened && !done ? " is-out" : ""}`}
                            disabled={opened || done}
                            onClick={() => turn(i)}
                            aria-label={done ? "Turned" : "Turn this lock"}>
                            {pop?.i === i ? <span className={`lk-pop is-${pop.kind}`}>{pop.text}</span> : null}
                            {/* A GLYPH, NOT AN EMOJI — 🔒 renders in the operating system's own colours,
                                which on a gold-and-steel vault is a blue-grey padlock immune to the colour
                                set right above it. Same reason nothing else in this app uses emoji. */}
                            <span className="lk-face">
                                {done
                                    // A MULTIPLIER TILE ADDS TO THE MULTIPLIER, it does not set it. This
                                    // read "x1", which says "times one" — no change at all — on a tile
                                    // that had just taken the round from x1 to x2.
                                    ? (t.kind === "launch" ? <GiOpenGate aria-hidden="true" />
                                        : t.kind === "spins" ? `+${t.value}` : `+${t.value}×`)
                                    : <GiCombinationLock aria-hidden="true" />}
                            </span>
                        </button>
                    );
                })}
            </div>

            {opened ? (
                <button type="button" className="lk-go" onClick={onDone}>
                    Open it — {spins} spins at &times;{mult}
                </button>
            ) : null}
        </div>
    );
}
