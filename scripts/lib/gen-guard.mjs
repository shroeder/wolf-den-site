// ── THE MONEY GUARD ──────────────────────────────────────────────────────────────────────────────────────────
// Import this in any generator that can make more than a handful of images:
//
//     import { quality, priceRun, requirePreview } from "./lib/gen-guard.mjs";
//
// It exists because of 2026-08-10, when a level-6 pet run cost $65 across three attempts and nobody knew until
// the invoice was read. Three separate failures stacked, and each one is a rule here:
//
//   1. THE QUALITY WAS `high` AND NOBODY CHOSE IT. It was copied from regen-pet-levels.mjs, which is one of
//      only four scripts in the repo using it — 26 use `low` and 21 use `medium`. `high` is 4x medium and it
//      was never a decision, it was an inherited default.
//   2. THE PRICE WAS NEVER PRINTED, and the one estimate that was printed used the MEDIUM rate for a HIGH run,
//      under-quoting the set by 4.5x. A number nobody checks is worse than no number, because it gets quoted.
//   3. THE FULL SET RAN BEFORE ANYONE LOOKED AT A CONTACT SHEET. Two pets were previewed and looked great; the
//      failure — every dark form collapsing into the same black mass — was only visible across many. Twice.
//
// So: medium unless you argue otherwise, the bill printed before a single call, and a big run refuses to start
// without --yes so the number has to be read.
import process from "node:process";

// Output-token counts per image, from OpenAI's own table, at $40/1M.
const IMG_TOKENS = {
    "1024x1024": { low: 272, medium: 1056, high: 4160 },
    "1024x1536": { low: 408, medium: 1584, high: 6240 },
    "1536x1024": { low: 400, medium: 1568, high: 6208 },
};
const PER_1M = 40;

/** What one image actually costs. `edit` adds the reference image it was handed. */
export function imagePrice({ size = "1024x1024", quality: q = "medium", edit = false } = {}) {
    const t = IMG_TOKENS[size] || IMG_TOKENS["1024x1024"];
    return ((t[q] ?? t.medium) + (edit ? t.low : 0)) * (PER_1M / 1e6);
}

/**
 * The quality for this run. MEDIUM unless --high or --low is passed, so the expensive one is always a choice
 * somebody made on the command line rather than a constant somebody inherited.
 */
export function quality(argv = process.argv) {
    if (argv.includes("--high")) return "high";
    if (argv.includes("--low")) return "low";
    return "medium";
}

/** Print the bill. Always, before anything is spent. */
export function priceRun({ count, size = "1024x1024", quality: q = "medium", edit = false }) {
    const each = imagePrice({ size, quality: q, edit });
    const total = each * count;
    console.log(`${count} image(s) at ${q}${edit ? " (edit)" : ""} — $${each.toFixed(4)} each, $${total.toFixed(2)} total`);
    if (q === "high") console.log(`  at medium this would be $${(imagePrice({ size, quality: "medium", edit }) * count).toFixed(2)}`);
    return total;
}

/**
 * Refuse to start a big run without --yes, and say what to do first.
 *
 * The threshold is low on purpose. Anything past a dozen images is past the point where a contact sheet would
 * have caught what a single preview did not, and that is the mistake this is here to stop — not the money on
 * its own, but spending it before looking.
 */
export function requirePreview({ count, total, threshold = 12, argv = process.argv }) {
    if (count <= threshold || argv.includes("--yes")) return;
    console.log(`\nSTOP. ${count} images is $${total.toFixed(2)}.`);
    console.log("  1. Generate 3-6 subjects that differ as much as possible (colour, size, silhouette).");
    console.log("  2. Put them in ONE contact sheet and look at it. A single preview cannot show you that");
    console.log("     everything came out the same — that is only visible across many.");
    console.log("  3. Then re-run with --yes.\n");
    process.exit(1);
}
