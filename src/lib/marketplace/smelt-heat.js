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
// FIVE pours, and the bar is FASTER every time. One slow pass was the whole reason it felt like nothing; three
// was still over before it built any tension. Five matches the kitchen's five steps, and the names follow what
// a smelt actually is, start to finish.
//
// A full sweep in milliseconds. By the last one the marker crosses in well under a second, so the FLAWLESS
// band — 4.4% of the bar — goes past in about 26ms and is a genuine reflex test rather than a formality.
export const SMELT_PHASES = 5;
// How many batches one pour may cover. Shared so the button, the server clamp and the ore maths cannot
// disagree about what "smelt everything" means.
//
// This was TEN, and ten is a number somebody standing on 94 mythril has to press ten times. Luke: "instead of
// smelt 10 make it smelt all". So it is no longer a limit on the button — the button offers the whole stack —
// and what is left here is purely a runaway guard: a ceiling high enough that no real pack reaches it, low
// enough that one request cannot ask the server for ten thousand batches of per-batch work.
export const SMELT_MAX_BATCHES = 200;
export const PHASE_LABELS = ["Charge", "Stoke", "Melt", "Skim", "Pour"];
export const PHASE_SWEEP_MS = [1200, 1000, 820, 690, 580];

/** How long the tightest band is actually on screen for, per phase — the honest measure of difficulty. */
export const pixelWindowMs = (phase) => Math.round(PHASE_SWEEP_MS[Math.min(phase, PHASE_SWEEP_MS.length - 1)] * 0.044);
