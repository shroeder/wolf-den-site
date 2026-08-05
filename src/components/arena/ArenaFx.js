"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// ── THE SPELL LAYER ──────────────────────────────────────────────────────────────────────────────────────────
// A full-screen additive canvas over the ring. This is the Final Fantasy VI model, and it is a different idea
// from what the arena had before.
//
// The old approach put a ~210px picture on top of a ~190px character and tried to make it read as an impact.
// FF6 never does that. In FF6 the sprites stay small and largely still, and the SCREEN does the work: Fire3
// sweeps the whole battlefield, Bolt3 is screen-wide lightning over two frames of white flash, Ultima is a
// sphere that fills the view. The spectacle lives in the overlay, not on the body — which is also, usefully,
// far easier to do convincingly than per-sprite animation, because nothing has to line up with a drawing.
//
// WHY CANVAS AND NOT MORE DOM. Hundreds of additive particles is exactly what DOM is worst at: every span is a
// layout and composite node, and `mix-blend-mode` does not survive the stacking contexts this panel already
// has. One canvas with `globalCompositeOperation = "lighter"` gives real additive glow — the thing that makes
// 16-bit magic look hot — for one element and one rAF loop.
//
// The engine is deliberately plain: an array of particles, a spawn table per effect, and a draw step. No
// physics library, no scene graph. Everything is tuned in ms and pixels-per-second so the numbers read.

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Element palettes. Two or three hues each so a burst has depth rather than being one flat colour.
const PALETTE = {
    fire: ["#fff0b0", "#ffb43c", "#ff6b2c", "#e03a12"],
    water: ["#dff4ff", "#7fd4ff", "#3aa0ff", "#1a5fd0"],
    earth: ["#ffe9b8", "#c9a24a", "#8a6b2e", "#5d4a24"],
    storm: ["#ffffff", "#fff6a8", "#ffe14a", "#c9a020"],
    light: ["#ffffff", "#fff6d0", "#ffe89a", "#ffd75e"],
    shadow: ["#e8d0ff", "#b061ff", "#6a2fb0", "#2e1050"],
    neutral: ["#ffffff", "#ffe9b8", "#ffc978", "#ff9a3c"],
};
const paletteFor = (el) => PALETTE[el] || PALETTE.neutral;

// ── THE ENGINE ───────────────────────────────────────────────────────────────────────────────────────────────
class Fx {
    constructor(canvas) {
        this.c = canvas;
        this.ctx = canvas.getContext("2d");
        this.parts = [];
        this.bolts = [];      // lightning polylines, drawn as strokes rather than particles
        this.rings = [];      // expanding rings / shockwaves
        this.flash = null;    // { color, a, decay } — the FF6 palette flash
        this.shake = 0;
        this.last = 0;
        this.raf = 0;
        this.dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
        this.running = false;
    }

    resize() {
        const r = this.c.getBoundingClientRect();
        this.w = Math.max(1, Math.round(r.width));
        this.h = Math.max(1, Math.round(r.height));
        this.c.width = Math.round(this.w * this.dpr);
        this.c.height = Math.round(this.h * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        const loop = (t) => {
            if (!this.running) return;
            const dt = Math.min(48, t - this.last);
            this.last = t;
            this.step(dt / 1000);
            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    }

    stop() { this.running = false; cancelAnimationFrame(this.raf); }

    // Anchor points. The stage is two fighters on a ground line; effects are aimed at one of them or at the
    // whole field, which is all FF6 ever needs.
    anchor(side) {
        // Party on the RIGHT, enemies on the LEFT — the FF6 arrangement.
        const x = side === "you" ? this.w * 0.72 : this.w * 0.28;
        return { x, y: this.h * 0.62 };
    }

    add(p) { if (this.parts.length < 900) this.parts.push(p); }

    // ── SPAWN TABLE ──────────────────────────────────────────────────────────────────────────────────────
    // One entry per visual idea. `at` is the target anchor, `col` the element palette.
    burst(at, col, n = 60, speed = 320, opts = {}) {
        for (let i = 0; i < n; i += 1) {
            const a = rnd(0, TAU);
            const s = rnd(speed * 0.25, speed);
            this.add({
                x: at.x, y: at.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.lift || 0),
                life: 0, max: rnd(0.35, 0.8), r: rnd(1.6, 4.4), col: pick(col),
                grav: opts.grav ?? 420, drag: opts.drag ?? 1.4, glow: true,
            });
        }
    }

    // Columns of flame rising off the ground — Fire2/Fire3.
    column(at, col, n = 90, spread = 120) {
        for (let i = 0; i < n; i += 1) {
            const x = at.x + rnd(-spread, spread);
            this.add({
                x, y: at.y + rnd(-6, 26), vx: rnd(-26, 26), vy: rnd(-380, -170),
                life: 0, max: rnd(0.45, 1.0), r: rnd(2.2, 6.2), col: pick(col),
                grav: -60, drag: 0.7, glow: true,
            });
        }
    }

    // Shards falling in — ice.
    rain(at, col, n = 70, spread = 150) {
        for (let i = 0; i < n; i += 1) {
            this.add({
                x: at.x + rnd(-spread, spread), y: rnd(-40, this.h * 0.2),
                vx: rnd(-30, 30), vy: rnd(320, 640),
                life: 0, max: rnd(0.4, 0.85), r: rnd(1.6, 3.6), col: pick(col),
                grav: 260, drag: 0.2, glow: true, streak: 9,
            });
        }
    }

    // Rocks erupting upward off the ground line — earth.
    erupt(at, col, n = 46, spread = 130) {
        for (let i = 0; i < n; i += 1) {
            this.add({
                x: at.x + rnd(-spread, spread), y: at.y + rnd(0, 20),
                vx: rnd(-120, 120), vy: rnd(-620, -300),
                life: 0, max: rnd(0.5, 1.0), r: rnd(2.4, 6.6), col: pick(col),
                grav: 900, drag: 0.1, glow: false, box: true,
            });
        }
    }

    // Jagged lightning from the top of the screen — Bolt.
    bolt(at, col, n = 3) {
        for (let k = 0; k < n; k += 1) {
            const pts = [];
            let x = at.x + rnd(-70, 70);
            let y = -10;
            while (y < at.y) {
                pts.push([x, y]);
                y += rnd(18, 42);
                x += rnd(-34, 34);
            }
            pts.push([at.x + rnd(-14, 14), at.y]);
            this.bolts.push({ pts, life: 0, max: rnd(0.16, 0.3), col: pick(col), w: rnd(2, 5) });
        }
    }

    ring(at, col, opts = {}) {
        this.rings.push({
            x: at.x, y: at.y, r: opts.from ?? 12, to: opts.to ?? 240,
            life: 0, max: opts.max ?? 0.5, col, w: opts.w ?? 5, back: Boolean(opts.back),
        });
    }

    // Particles streaming FROM a point TO another — drain.
    siphon(from, to, col, n = 60) {
        for (let i = 0; i < n; i += 1) {
            const a = rnd(0, TAU), d = rnd(30, 150);
            this.add({
                x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d,
                vx: 0, vy: 0, toX: to.x, toY: to.y, pull: rnd(4, 9),
                life: 0, max: rnd(0.45, 0.8), r: rnd(1.8, 4), col: pick(col), grav: 0, drag: 0, glow: true,
            });
        }
    }

    // Blades — a few long thin arcs across the target.
    slash(at, col, n = 3) {
        for (let k = 0; k < n; k += 1) {
            this.rings.push({
                x: at.x + rnd(-30, 30), y: at.y + rnd(-40, 20), r: 30, to: rnd(120, 190),
                life: -k * 0.07, max: 0.3, col, w: 3, arc: rnd(0.5, 1.1), rot: rnd(-0.9, 0.9),
            });
        }
    }

    // ── THE PALETTE FLASH ────────────────────────────────────────────────────────────────────────────
    // Short and ADDITIVE. The first cut held 0.85 alpha in source-over for ~250ms, which whited the panel
    // out completely — you could not see the effect it was supposed to be punctuating. An FF6 flash is a
    // couple of frames: it BRIGHTENS the scene hard and is gone before you can study it.
    hit(strength = 1, color = "#ffffff") {
        this.flash = { color, a: Math.min(0.55, 0.18 + strength * 0.3), decay: 9 };
        this.shake = Math.max(this.shake, 5 + strength * 11);
    }

    // ── THE PROGRAMS ─────────────────────────────────────────────────────────────────────────────────────
    // What each move looks like. `side` is who it HAPPENS TO.
    play({ kind = "hit", element = null, side = "them", power = 1, crit = false }) {
        const at = this.anchor(side);
        const me = this.anchor(side === "you" ? "them" : "you");
        const col = paletteFor(element);
        const p = Math.max(0.6, Math.min(2, power));
        const big = crit ? 1.6 : 1;

        switch (kind) {
            case "rend":
                this.column(at, PALETTE.fire, Math.round(110 * p * big), 130);
                this.ring(at, PALETTE.fire, { to: 180, max: 0.45, w: 4 });
                this.hit(0.5 * big, "#ff8a3c");
                break;
            case "flurry":
                this.slash(at, col, 3);
                this.burst(at, col, Math.round(40 * big), 300);
                this.hit(0.45 * big, "#dff4ff");
                break;
            case "spell":
                this.elemental(at, element, p * big);
                break;
            case "execute":
                this.ring(at, PALETTE.shadow, { from: 320, to: 20, max: 0.34, w: 8, back: true });
                this.burst(at, PALETTE.shadow, Math.round(70 * big), 420);
                this.hit(0.8 * big, "#b061ff");
                break;
            case "drain":
                this.siphon(at, me, PALETTE.shadow, Math.round(70 * big));
                this.ring(at, PALETTE.shadow, { to: 150, max: 0.5, w: 3 });
                this.hit(0.4 * big, "#8a3cff");
                break;
            case "sunder":
                this.erupt(at, PALETTE.earth, Math.round(56 * big), 120);
                this.ring(at, PALETTE.earth, { to: 220, max: 0.42, w: 6 });
                this.hit(0.6 * big, "#ffd08a");
                break;
            case "ward":
            case "guard":
                this.ring(at, PALETTE.water, { from: 200, to: 70, max: 0.55, w: 7, back: true });
                this.burst(at, PALETTE.water, 34, 160, { grav: -40, lift: 90 });
                break;
            case "surge":
                this.column(at, PALETTE.light, 70, 60);
                this.ring(at, PALETTE.light, { to: 150, max: 0.5, w: 4 });
                break;
            case "riposte":
                this.ring(at, PALETTE.water, { to: 240, max: 0.32, w: 5 });
                this.ring(at, PALETTE.water, { from: 240, to: 30, max: 0.42, w: 4, back: true });
                break;
            case "gamble":
                this.burst(at, PALETTE.light, 60, 360, { grav: 900, lift: 320 });
                break;
            case "heal":
                this.column(at, PALETTE.light, 60, 70);
                this.ring(at, ["#8bf0b4", "#dfffe8"], { from: 160, to: 40, max: 0.6, w: 4, back: true });
                break;
            default:
                // A plain blow. Small, sharp, and it shakes.
                this.burst(at, col, Math.round(46 * p * big), 340 * big);
                this.ring(at, col, { to: 130 * big, max: 0.3, w: 4 });
                this.hit(0.5 * big * p, crit ? "#fff6cc" : "#ffd9a0");
                break;
        }
    }

    // The six affinities, each unmistakable — the whole point of an element wheel you can see.
    elemental(at, element, p = 1) {
        switch (element) {
            case "fire":
                this.column(at, PALETTE.fire, Math.round(130 * p), 150);
                this.hit(0.7 * p, "#ff7a2c");
                break;
            case "water":
                this.rain(at, PALETTE.water, Math.round(90 * p), 170);
                this.ring(at, PALETTE.water, { to: 220, max: 0.5, w: 5 });
                this.hit(0.55 * p, "#7fd4ff");
                break;
            case "earth":
                this.erupt(at, PALETTE.earth, Math.round(64 * p), 150);
                this.hit(0.7 * p, "#ffd08a");
                break;
            case "storm":
                this.bolt(at, PALETTE.storm, 4);
                this.burst(at, PALETTE.storm, Math.round(50 * p), 380);
                this.hit(0.95 * p, "#ffffff");
                break;
            case "light":
                this.ring(at, PALETTE.light, { to: 300, max: 0.45, w: 9 });
                this.burst(at, PALETTE.light, Math.round(80 * p), 300, { grav: 60 });
                this.hit(1 * p, "#ffffff");
                break;
            case "shadow":
                this.ring(at, PALETTE.shadow, { from: 300, to: 24, max: 0.42, w: 10, back: true });
                this.burst(at, PALETTE.shadow, Math.round(70 * p), 260, { grav: -80 });
                this.hit(0.7 * p, "#8a3cff");
                break;
            default:
                this.burst(at, PALETTE.neutral, Math.round(60 * p), 320);
                this.hit(0.5 * p, "#ffe9b8");
        }
    }

    // ── STEP ─────────────────────────────────────────────────────────────────────────────────────────────
    step(dt) {
        const { ctx, w, h } = this;
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";

        // particles
        for (let i = this.parts.length - 1; i >= 0; i -= 1) {
            const p = this.parts[i];
            p.life += dt;
            if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
            if (p.toX !== undefined) {
                // siphon: accelerate toward the destination
                p.vx += (p.toX - p.x) * p.pull * dt;
                p.vy += (p.toY - p.y) * p.pull * dt;
            } else {
                p.vy += p.grav * dt;
                p.vx -= p.vx * p.drag * dt;
                p.vy -= p.vy * p.drag * dt * 0.4;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const k = 1 - p.life / p.max;
            ctx.globalAlpha = Math.max(0, k);
            ctx.fillStyle = p.col;
            if (p.streak) {
                ctx.fillRect(p.x, p.y, Math.max(1, p.r * 0.5), p.r * p.streak * k);
            } else if (p.box) {
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 6);
                ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2); ctx.restore();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.4, p.r * k), 0, TAU); ctx.fill();
            }
        }

        // rings + slash arcs
        for (let i = this.rings.length - 1; i >= 0; i -= 1) {
            const r = this.rings[i];
            r.life += dt;
            if (r.life < 0) continue;
            if (r.life >= r.max) { this.rings.splice(i, 1); continue; }
            const t = r.life / r.max;
            const rad = r.back ? r.r + (r.to - r.r) * t : r.r + (r.to - r.r) * t;
            ctx.globalAlpha = Math.max(0, 1 - t);
            ctx.strokeStyle = Array.isArray(r.col) ? r.col[0] : r.col;
            ctx.lineWidth = r.w * (1 - t * 0.5);
            ctx.beginPath();
            if (r.arc) ctx.arc(r.x, r.y, rad, r.rot, r.rot + r.arc);
            else ctx.arc(r.x, r.y, Math.max(1, rad), 0, TAU);
            ctx.stroke();
        }

        // lightning
        for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
            const b = this.bolts[i];
            b.life += dt;
            if (b.life >= b.max) { this.bolts.splice(i, 1); continue; }
            ctx.globalAlpha = Math.max(0, 1 - b.life / b.max);
            ctx.strokeStyle = b.col;
            ctx.lineWidth = b.w;
            ctx.beginPath();
            ctx.moveTo(b.pts[0][0], b.pts[0][1]);
            for (const [x, y] of b.pts.slice(1)) ctx.lineTo(x, y);
            ctx.stroke();
        }

        // ── THE PALETTE FLASH ── the most FF6 thing in here: on a real hit the whole screen goes.
        if (this.flash) {
            this.flash.a -= this.flash.decay * dt;
            if (this.flash.a <= 0) this.flash = null;
            else {
                // `lighter`, not `source-over` — it adds light to the scene instead of painting over it.
                ctx.globalCompositeOperation = "lighter";
                ctx.globalAlpha = this.flash.a;
                ctx.fillStyle = this.flash.color;
                ctx.fillRect(0, 0, w, h);
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";

        // shake is applied to the PANEL, not the canvas, so the fighters and the HUD move with it
        if (this.shake > 0.2) {
            this.shake *= Math.pow(0.0016, dt);
            const s = this.shake;
            this.onShake?.(rnd(-s, s), rnd(-s, s));
        } else if (this.shake) {
            this.shake = 0;
            this.onShake?.(0, 0);
        }
    }
}

// ── THE COMPONENT ────────────────────────────────────────────────────────────────────────────────────────────
const ArenaFx = forwardRef(function ArenaFx({ onShake }, ref) {
    const canvasRef = useRef(null);
    const fxRef = useRef(null);

    useEffect(() => {
        const fx = new Fx(canvasRef.current);
        fx.onShake = onShake;
        fx.resize();
        fx.start();
        fxRef.current = fx;
        const ro = new ResizeObserver(() => fx.resize());
        ro.observe(canvasRef.current);
        return () => { ro.disconnect(); fx.stop(); fxRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
        play: (spec) => fxRef.current?.play(spec),
        flash: (a, c) => fxRef.current?.hit(a, c),
    }), []);

    return (
        <canvas ref={canvasRef} className="ar-fx" aria-hidden="true">
            <style jsx>{`
                /* Above the fighters, below the HUD and the command deck — magic happens in front of the
                   people and behind the things you have to read. */
                .ar-fx { position: absolute; inset: 0; width: 100%; height: 100%;
                    z-index: 12; pointer-events: none; }
            `}</style>
        </canvas>
    );
});

export default ArenaFx;
