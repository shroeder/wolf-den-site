"use client";

import { useMemo } from "react";

// ── SOMETHING ACTUALLY COMES OUT OF THE MACHINE ──────────────────────────────────────────────────────────────
// A win was a number changing colour. This throws coins.
//
// WHY THE ARCS ARE COMPUTED IN JS. The obvious way to scatter particles is `cos()`/`sin()` inside a CSS
// `calc()`, which is genuinely supported now — and would silently produce a pile of coins stacked on one spot
// on any browser a shop customer might still be carrying. The trig happens here, once, and CSS is handed plain
// pixel values it has understood forever.
//
// WHY IT IS SEEDED PER MOUNT AND NOT PER RENDER. The parent re-renders on a one-second countdown tick. Rolling
// fresh angles in the render body would teleport every coin mid-flight, once a second, forever — the same
// class of bug that made the reels reshuffle under a landed result. `useMemo` with an empty dependency list
// pins the scatter to the mount, and the caller replays a burst by changing the `key`.
//
// It is inert: aria-hidden, no pointer events. A coin you can tap is a button that does nothing.

const TAU = Math.PI * 2;

const SHAPES = {
    // Coins: thrown up and out, then pulled down past where they started, because that is what falling
    // money does and a particle that only flies outward reads as an explosion instead.
    coin: { n: 14, spread: 0.62, dist: [46, 128], rise: 0.85, fall: [90, 190], size: [7, 13], spin: 900 },
    // Shards: a piggy bank giving way. Flatter, faster, and they do not come back — they go sideways and
    // stop, which is the difference between something breaking and something being paid out.
    shard: { n: 12, spread: 1, dist: [30, 92], rise: 0.35, fall: [40, 90], size: [4, 9], spin: 1400 },
    // A single fat spray for the Pot: more of everything, thrown wider and higher.
    hoard: { n: 34, spread: 0.72, dist: [60, 210], rise: 1.05, fall: [140, 300], size: [8, 17], spin: 1100 },
};

/**
 * @param {"coin"|"shard"|"hoard"} kind  which scatter to throw
 * @param {string} tone                  the colour of the thing being thrown
 * @param {number} n                     override the particle count
 */
export default function Burst({ kind = "coin", tone = "#ffd75e", n = null }) {
    const shape = SHAPES[kind] || SHAPES.coin;
    const bits = useMemo(() => {
        const count = n || shape.n;
        const [dLo, dHi] = shape.dist;
        const [fLo, fHi] = shape.fall;
        const [sLo, sHi] = shape.size;
        const rand = (lo, hi) => lo + Math.random() * (hi - lo);
        return Array.from({ length: count }, (_, i) => {
            // Angles are spread across the TOP half only. Coins coming out of the bottom of a slot machine
            // and travelling downward look like the machine is leaking.
            const a = -TAU / 4 + (((i + Math.random() * 0.8) / count) - 0.5) * TAU * shape.spread;
            const d = rand(dLo, dHi);
            return {
                x: Math.cos(a) * d,
                y: Math.sin(a) * d * shape.rise,
                f: rand(fLo, fHi),
                s: rand(sLo, sHi),
                r: (Math.random() < 0.5 ? -1 : 1) * rand(shape.spin * 0.5, shape.spin),
                t: Math.random() * 170,
                life: rand(700, 1180),
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <span className={`cas-burst is-${kind}`} aria-hidden="true">
            {bits.map((b, i) => (
                <i key={i} style={{
                    "--x": `${b.x.toFixed(1)}px`,
                    "--y": `${b.y.toFixed(1)}px`,
                    "--f": `${b.f.toFixed(1)}px`,
                    "--s": `${b.s.toFixed(1)}px`,
                    "--r": `${b.r.toFixed(0)}deg`,
                    "--t": `${b.t.toFixed(0)}ms`,
                    "--life": `${b.life.toFixed(0)}ms`,
                    "--tone": tone,
                }} />
            ))}
        </span>
    );
}
