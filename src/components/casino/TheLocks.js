"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";

// ── THE THRESHING FLOOR ──────────────────────────────────────────────────────────────────────────────────────
// Luke, with Pharaoh's Fortune in hand: "before you start the free spins there's this beautiful section where
// you have to pick all these tiles, and the tiles can either be plus one spin or plus one multiplier... it's a
// dopamine-inducing reveal though when you click the tiles — that's the key to this one. You present them with
// the tiles and as they click, they slowly rotate to reveal what you got, and then whatever you revealed flies
// up into the top category."
//
// THERE IS NO BAD TILE, and that is the whole mechanic. Every one is a gift — another spin, another
// multiplier — and the one that ends it does not take anything away, it starts the thing you were building.
// The tension is entirely "how much more dare I stack", and the answer is never a punishment.
//
// THREE BEATS PER TAP, and the middle one is the one that was missing before:
//   1. the tile TURNS — a real rotation, not a fade, because a card turning over is a promise being kept
//   2. what was under it FLIES to the counter it belongs to
//   3. the counter takes the hit and jumps
//
// Without the flight, a grid changes and a number changes and nothing on screen says those are the same fact.
// The counters are the point of the screen: they have to feel like they are YOURS, they jump every time you
// add to them, and the last thing that happens is both being read back to you.
const TURN_MS = 460;        // the tile rotating
const FLY_MS = 620;         // the chip travelling up to its counter
const BUMP_MS = 420;        // the counter taking it
const REST_MS = 900;        // the rest of the board turned over, so you see what was left
const OUT_MS = 1700;        // both numbers read back before the round starts

export default function TheLocks({ built, onDone }) {
    const tiles = built?.tiles || built?.board?.length || 36;
    const picked = built?.picked || [];

    // The round's starting point, before a single tile is turned. Derived from the server's own totals minus
    // what the walk added, so the screen cannot drift from what the round will actually be handed. Computed
    // BEFORE the state that seeds off it — an effect calling setState on mount is a cascading render for a
    // value that was knowable at first paint.
    const baseSpins = (built?.spins || 0) - picked.filter((t) => t.kind === "spins").reduce((a, t) => a + t.value, 0);
    const baseMult = (built?.mult || 1) - picked.filter((t) => t.kind === "mult").reduce((a, t) => a + t.value, 0);

    const [turned, setTurned] = useState({});     // tile index -> the thing under it
    const [spins, setSpins] = useState(baseSpins);
    const [mult, setMult] = useState(baseMult);
    const [flying, setFlying] = useState(null);   // { kind, from }
    const [bump, setBump] = useState(null);       // "spins" | "mult"
    const [rest, setRest] = useState(null);       // tile index -> what was left under it
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const cursor = useRef(0);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const wait = (ms) => new Promise((r) => timers.current.push(setTimeout(r, ms)));

    const turn = useCallback(async (i) => {
        if (busy || done || turned[i] != null) return;
        unlock();
        setBusy(true);

        // The next tile in the server's order, not the one "under" this square — the server chose an ORDER
        // and this maps the square a finger landed on to the next thing in it. Same honesty as the Warren.
        const tile = picked[cursor.current];
        cursor.current += 1;
        if (!tile) { setBusy(false); return; }

        setTurned((p) => ({ ...p, [i]: tile }));
        Cas.reelStop(2, 0.5);
        Haptic.hit(0.3);
        await wait(TURN_MS);

        if (tile.kind === "launch") {
            // ── THE LAST TILE ────────────────────────────────────────────────────────────────────────────
            // It ends the picking and starts the round, so it gets the flourish rather than a fade — and
            // then the rest of the board turns over dim, because "what else was under there" is the thing
            // you want to know the second it stops.
            Cas.jackpot();
            Haptic.crit();
            await wait(400);
            const left = {};
            const remaining = (built?.board || []).slice(cursor.current);
            let r = 0;
            for (let t = 0; t < tiles; t += 1) {
                if (turned[t] != null || t === i) continue;
                if (r < remaining.length) { left[t] = remaining[r]; r += 1; }
            }
            setRest(left);
            await wait(REST_MS);
            setDone(true);
            await wait(OUT_MS);
            onDone?.();
            return;
        }

        // ── IT FLIES TO ITS COUNTER ──────────────────────────────────────────────────────────────────────
        setFlying({ kind: tile.kind, from: i });
        Cas.coin(1);
        await wait(FLY_MS);
        setFlying(null);

        if (tile.kind === "spins") setSpins((n) => n + tile.value);
        else setMult((n) => n + tile.value);
        setBump(tile.kind);
        Haptic.hit(0.4);
        await wait(BUMP_MS);
        setBump(null);
        setBusy(false);
    }, [busy, done, turned, picked, built, tiles, onDone]);

    const label = (t) => (t.kind === "launch" ? "BEGIN" : t.kind === "spins" ? "+1 SPIN" : "+1 MULT");

    return (
        <div className="thf">
            {/* ── THE BEAM ─────────────────────────────────────────────────────────────────────────────
                A carved oak beam with wheat bolted to each end, across the top of the room. The title sits
                on it rather than floating in the dark. */}
            <div className="thf-beam"><b>The Threshing Floor</b></div>

            {/* ── THE TWO COUNTERS, IN CARVED PLAQUES ──────────────────────────────────────────────────
                Everything below exists to move these, so they are not rounded rectangles any more — they
                are drawn oak cartouches with a brass plate, and the number sits ON the plate. */}
            <div className="thf-top">
                <div className={`thf-count is-spins${bump === "spins" ? " is-bump" : ""}`}>
                    <b>{spins}</b><em>free spins</em>
                </div>
                <div className={`thf-count is-mult${bump === "mult" ? " is-bump" : ""}`}>
                    <b>&times;{mult}</b><em>multiplier</em>
                </div>
            </div>

            <p className="thf-say">
                {done ? "The floor is swept. Take it to the reels."
                    : rest ? "And what was still out there…"
                    : busy ? " " : "Turn a sheaf. One of them starts the round."}
            </p>

            {/* Hung either side of the board — the reference's torches, in a barn. */}
            <i className="thf-lamp is-l" aria-hidden="true" />
            <i className="thf-lamp is-r" aria-hidden="true" />

            <div className="thf-boardwrap">
                {/* One drawn bracket, four times, mirrored. A frame made of border-radius is the thing he
                    called plain; a frame made of carved corners is furniture. */}
                <i className="thf-cnr is-tl" aria-hidden="true" />
                <i className="thf-cnr is-tr" aria-hidden="true" />
                <i className="thf-cnr is-bl" aria-hidden="true" />
                <i className="thf-cnr is-br" aria-hidden="true" />
            <div className="thf-board">
                {Array.from({ length: tiles }).map((_, i) => {
                    const t = turned[i];
                    const miss = !t && rest ? rest[i] : null;
                    const shown = t || miss;
                    return (
                        <button key={i} type="button"
                            className={`thf-tile${shown ? " is-turned" : ""}${miss ? " is-rest" : ""}`
                                + `${shown?.kind === "launch" ? " is-launch" : ""}`
                                + `${flying?.from === i ? " is-flying" : ""}`}
                            style={{ "--i": i % 6 }}
                            disabled={busy || done || Boolean(shown)}
                            onClick={() => turn(i)}
                            aria-label={shown ? label(shown) : "Turn this sheaf"}>
                            <span className="thf-face">
                                {shown
                                    ? <i className={`thf-tok is-${shown.kind}`} aria-hidden="true" />
                                    : <i className="thf-sheaf" aria-hidden="true" />}
                                {shown && shown.kind !== "launch" ? <u>+1</u> : null}
                            </span>
                        </button>
                    );
                })}
            </div>
            </div>

            {/* The chip in flight. One element moved by a class — a per-tile animation would put thirty-six
                of them in the DOM doing nothing. */}
            {flying ? (
                <i className={`thf-fly is-${flying.kind}`} aria-hidden="true"><u>+1</u></i>
            ) : null}

            {done ? (
                <div className="thf-out">
                    <span className="thf-out-kick">The round you built</span>
                    <b className="thf-out-n">{spins} <s>&times;</s> {mult}</b>
                    <span className="thf-out-sub">free spins, every one at {mult}&times;</span>
                </div>
            ) : null}
        </div>
    );
}
