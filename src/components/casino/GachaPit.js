"use client";

import { useEffect, useRef } from "react";

// ── WHAT IS ACTUALLY IN THE GLOBE ────────────────────────────────────────────────────────────────────────
// Luke: "It looks like just a shitty circle with a bunch of circles in it. I was envisioning actually seeing
// what's in there, like all the different sprites for all the things bouncing around in there."
//
// So the things in the globe are the THINGS. The Capsule Imp, the Lantern Moth, the Ghost Chest, the Prize
// Pumpkin — their real sprites, the same ones the prize screen shows, piled in the bottom of the glass and
// jostling. A machine full of abstract coloured dots is a diagram of a gachapon; a machine you can look into
// and recognise the pet you are chasing is the reason to put a coin in.
//
// ⚠️ THE PHYSICS RUNS ON ONE rAF AND WRITES TRANSFORMS DIRECTLY, never React state. Twelve sprites at 60fps
// is 720 state updates a second, which would re-render the whole panel — including the machine, the crank and
// the prize list — twelve times a frame. The positions live in a ref and are pushed onto the DOM nodes; React
// renders the sprites once and never touches them again.
//
// ⚠️ AND IT STOPS WHEN NOBODY IS LOOKING. document.hidden kills the loop — a physics sim running in a
// background tab is the exact shape check:polls exists to catch, and this one would run for ever.

// How bouncy the glass is. 0.55 is a plastic capsule on glass: it comes back up, but not far.
const BOUNCE = 0.55;
const GRAVITY = 0.0016;
const DRAG = 0.992;
// They never go completely still. A real machine hums and the capsules settle and re-settle for ever, and a
// pile that freezes reads as a paused animation rather than as a thing sitting in a bowl.
const FIDGET = 0.00022;

export default function GachaPit({ prizes, churn = 0 }) {
    const host = useRef(null);
    const bits = useRef([]);
    const churnRef = useRef(0);

    useEffect(() => { churnRef.current = churn; }, [churn]);

    useEffect(() => {
        const el = host.current;
        if (!el) return undefined;
        const nodes = [...el.querySelectorAll("[data-ball]")];
        if (!nodes.length) return undefined;

        // Positions are in UNIT CIRCLE space (-1..1), so the sim is resolution-independent and the same
        // numbers work whether the machine is 180px wide on a phone or 320 on a desktop.
        bits.current = nodes.map((node, i) => ({
            node,
            // Dropped in from random heights so the pile settles differently every time the panel opens.
            x: (Math.random() * 2 - 1) * 0.55,
            y: -0.6 + Math.random() * 0.5,
            vx: (Math.random() - 0.5) * 0.012,
            vy: Math.random() * 0.004,
            r: 0.17 + (i % 3) * 0.015,
            spin: Math.random() * 360,
            vs: (Math.random() - 0.5) * 2.2,
        }));

        let raf = 0;
        let last = performance.now();
        const step = (t) => {
            // Clamped, so a tab that was backgrounded does not resume with a 4-second frame and fire every
            // capsule through the glass.
            const dt = Math.min(34, t - last) / 16.67;
            last = t;
            const b = bits.current;
            const kick = churnRef.current;

            for (const p of b) {
                p.vy += GRAVITY * dt;
                if (kick) {
                    // The crank. Capsules get thrown upward and sideways — this is the churn you can see
                    // through the glass while the handle is turning, and it is the whole reason the handle
                    // is a drag rather than a button.
                    p.vy -= (0.0052 + Math.random() * 0.004) * kick * dt;
                    p.vx += (Math.random() - 0.5) * 0.009 * kick * dt;
                    p.vs += (Math.random() - 0.5) * 1.6 * kick;
                } else {
                    p.vx += (Math.random() - 0.5) * FIDGET * dt;
                    p.vy += (Math.random() - 0.5) * FIDGET * dt;
                }
                p.vx *= DRAG; p.vy *= DRAG;
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.spin += p.vs * dt;

                // The glass. Reflect off the wall along the normal, which for a circle is just the position
                // vector — the cheapest correct bounce there is.
                const d = Math.hypot(p.x, p.y);
                const lim = 1 - p.r;
                if (d > lim) {
                    const nx = p.x / d; const ny = p.y / d;
                    p.x = nx * lim; p.y = ny * lim;
                    const dot = p.vx * nx + p.vy * ny;
                    p.vx = (p.vx - 2 * dot * nx) * BOUNCE;
                    p.vy = (p.vy - 2 * dot * ny) * BOUNCE;
                    p.vs *= 0.7;
                }
            }

            // And they push each other apart. Not a real collision solve — one separation pass, which at
            // twelve bodies is 66 checks and is enough to stop them occupying the same spot. A proper
            // impulse solver would be more correct and nobody looking at a toy machine would be able to tell.
            for (let i = 0; i < b.length; i += 1) {
                for (let j = i + 1; j < b.length; j += 1) {
                    const a = b[i]; const c = b[j];
                    const dx = c.x - a.x; const dy = c.y - a.y;
                    const dd = Math.hypot(dx, dy) || 0.0001;
                    const min = a.r + c.r;
                    if (dd < min) {
                        const push = (min - dd) / 2;
                        const nx = dx / dd; const ny = dy / dd;
                        a.x -= nx * push; a.y -= ny * push;
                        c.x += nx * push; c.y += ny * push;
                        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
                        if (rel < 0) {
                            a.vx += nx * rel * 0.5; a.vy += ny * rel * 0.5;
                            c.vx -= nx * rel * 0.5; c.vy -= ny * rel * 0.5;
                        }
                    }
                }
            }

            for (const p of b) {
                // 50% + half the unit position: the pit is a square box clipped to a circle, so unit (0,0)
                // is its centre and unit 1 is its edge.
                p.node.style.transform =
                    `translate(-50%, -50%) rotate(${p.spin.toFixed(1)}deg)`;
                p.node.style.left = `${50 + p.x * 50}%`;
                p.node.style.top = `${50 + p.y * 50}%`;
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);

        const onVis = () => {
            if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
            else if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
        };
        document.addEventListener("visibilitychange", onVis);
        return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
    }, [prizes]);

    return (
        <span className="gx-pit" ref={host} aria-hidden="true">
            {prizes.map((p) => (
                <span key={p.id} data-ball className="gx-ball" style={{ "--t": p.tone }}>
                    {p.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.sprite} alt="" draggable={false} />
                    ) : <i />}
                </span>
            ))}
        </span>
    );
}
