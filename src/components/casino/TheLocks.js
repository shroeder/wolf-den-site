"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    // Memoised because two callbacks depend on it: `built?.picked || []` is a fresh array on every render,
    // which would rebuild the reveal loop each time and give the drainer a moving target.
    const picked = useMemo(() => built?.picked || [], [built]);

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
    const [queued, setQueued] = useState([]);     // squares tapped and waiting their turn
    const [done, setDone] = useState(false);
    const cursor = useRef(0);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const wait = (ms) => new Promise((r) => timers.current.push(setTimeout(r, ms)));

    // ── TAP AHEAD; THE BOARD REVEALS AT ITS OWN PACE ─────────────────────────────────────────────────────
    // Luke: "the picking should let you pick ahead and reveal them at its own pace, but not halting the pick
    // — reveal one by one at its own pace."
    //
    // Every tap used to lock the whole board for a second and a half while its reveal played, which turns a
    // pick screen into a queue at a counter: you know what you want to press next and the game will not let
    // you. Worse, it made the good part — the reveal — feel like the thing standing between you and the game.
    //
    // So a tap goes into a QUEUE and returns immediately. The square darkens as "taken" the instant it is
    // pressed, so a finger always gets a response, and a drainer walks the queue one at a time at the pace
    // the animation wants. You can lay down six taps in two seconds and then watch six reveals play out.
    //
    // The queue is state and the drainer is a ref-guarded loop rather than an effect per item: two reveals
    // running at once would fight over `flying`, which is a single element by design.
    const draining = useRef(false);
    const qRef = useRef([]);

    const reveal = useCallback(async (i) => {
        // The next tile in the server's order, not the one "under" this square — the server chose an ORDER
        // and this maps the square a finger landed on to the next thing in it. Same honesty as the Warren.
        const tile = picked[cursor.current];
        cursor.current += 1;
        if (!tile) return false;

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
            return true;
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
        return false;
    }, [turned, picked, built, tiles, onDone]);

    // One reveal at a time, in the order the squares were pressed, until the queue runs dry — and it can be
    // refilled while it is running, which is the whole point.
    const drain = useCallback(async () => {
        if (draining.current) return;
        draining.current = true;
        while (qRef.current.length) {
            const i = qRef.current[0];
            const ended = await reveal(i);
            qRef.current = qRef.current.slice(1);
            setQueued(qRef.current);
            if (ended) break;
        }
        draining.current = false;
    }, [reveal]);

    const turn = useCallback((i) => {
        // Only "already spoken for" is refused — never "something else is playing". `picked.length` is the
        // hard stop: queueing more taps than there are tiles left would walk the cursor off the end.
        if (done || turned[i] != null || qRef.current.includes(i)) return;
        if (cursor.current + qRef.current.length >= picked.length) return;
        unlock();
        qRef.current = [...qRef.current, i];
        setQueued(qRef.current);
        Cas.coin(2);
        Haptic.hit(0.18);
        drain();
    }, [done, turned, picked, drain]);

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
                {done ? "The floor is swept — take it to the reels"
                    : rest ? "And what was still out there…"
                    : queued.length > 1 ? `${queued.length} sheaves waiting`
                    : "Turn a sheaf — one of them starts the round"}
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
                                + `${flying?.from === i ? " is-flying" : ""}`
                                + `${!shown && queued.includes(i) ? " is-queued" : ""}`}
                            style={{ "--i": i % 6, "--q": queued.indexOf(i) }}
                            disabled={done || Boolean(shown) || queued.includes(i)}
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
