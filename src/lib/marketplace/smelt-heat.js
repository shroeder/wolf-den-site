import { bandTable } from "@/lib/marketplace/timing.js";

// ── THE SMELT ────────────────────────────────────────────────────────────────────────────────────────────────
// The forge, the kitchen, the mine and the raid all play the SAME bar: a marker sweeping across nested bands,
// graded on how close to dead centre you stopped it. The smelt did not — it was a fill creeping from cold to
// burnt with two lit zones, one slow tap, and no PIXEL to chase. A different, easier game wearing the same hat.
//
// It plays the real bar now, off the same cut-points as everything else (lib/marketplace/timing.js), so the
// skill you have everywhere else transfers and dead centre means what it always means.
//
// What is ours: the names and the multipliers. A pour is judged on how clean it was, and that multiplier is
// what the draw is built from.
export const SMELT_GRADES = bandTable({
    pixel: { mult: 2.0, label: "FLAWLESS POUR" },
    perfect: { mult: 1.6, label: "PERFECT" },
    great: { mult: 1.25, label: "CLEAN" },
    good: { mult: 0.95, label: "SERVICEABLE" },
});
export const SMELT_MISS = { key: "miss", mult: 0.5, label: "SPILLED", color: "#ff8f9a" };
export const smeltGrade = (dist) =>
    SMELT_GRADES.find((g) => dist <= g.max) || SMELT_MISS;

// ── THE PHASES ───────────────────────────────────────────────────────────────────────────────────────────────
// Three pours, and the bar is FASTER every time. One slow pass was the whole reason it felt like nothing: the
// kitchen speeds up per step, the mine tightens per swing, and the smelt now does the same across its chain.
//
// A full sweep in milliseconds. By the third the marker crosses in just over half a second, so the PIXEL band —
// 4.4% of the bar — goes past in about 27ms and is a genuine reflex test rather than a formality.
export const SMELT_PHASES = 3;
export const PHASE_LABELS = ["Charge", "Melt", "Pour"];
export const PHASE_SWEEP_MS = [1100, 820, 600];

/** How long the tightest band is actually on screen for, per phase — the honest measure of difficulty. */
export const pixelWindowMs = (phase) => Math.round(PHASE_SWEEP_MS[Math.min(phase, PHASE_SWEEP_MS.length - 1)] * 0.044);
