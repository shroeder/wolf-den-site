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
 * The quality for this run. MEDIUM, or LOW if --low is passed.
 *
 * ── ⚠️ `high` IS GONE AND IS NOT COMING BACK. DO NOT RE-ADD IT. ─────────────────────────────────────────────
 * Luke, 2026-10-21: "Dont use high to generate ever... Remove the abikity to generate at high entirely. Never
 * use high." And: "if you generate another one at high, I'm gonna lose my shit."
 *
 * `--high` used to be accepted here. It has now cost real money twice:
 *
 *   · 2026-08-10 — a pet run INHERITED high and cost $65 across three attempts. This whole file exists
 *     because of that, and the lesson was written at the top of it, and it did not hold.
 *   · 2026-10-21 — $10.73 regenerating 43 Grove sprites at high, every one reverted, nothing shipped. Then
 *     $0.75 more on three, during the conversation where Luke was telling me to stop.
 *
 * regen-pet-levels.mjs had already measured it: "$1.10 at medium and $4.28 at high; the difference dies in
 * the downscale." A flag that is only ever wrong is not a choice, it is a trap, so it is deleted rather than
 * discouraged. Passing --high now gets you medium and a line saying so.
 *
 * ⚠️ AND QUALITY IS ALMOST NEVER THE VARIABLE. The defect behind the $10.73 was a CANVAS ASPECT bug —
 * creatures drawn into a square plate lose their crowns — and a portrait canvas fixed it completely at
 * medium, 44 clipped sprites to 0. If medium output looks wrong, the PROMPT or the PIPELINE is wrong.
 */
export function quality(argv = process.argv) {
    if (argv.includes("--high")) {
        console.log("  --high is not a thing any more. Running at medium. See the note in gen-guard.mjs.");
    }
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

// ── ⚠️ 2026-10-21: --yes BOUGHT THE SAME THREE FAILURES AGAIN, FOR $13.70 ────────────────────────────────────
// Everything at the top of this file happened a second time, in one session, because requirePreview can be
// waved through with a flag and was — twice. Luke: "You ran all 43 at high? What the fuck are you doing?
// Don't you understand I had to pay for this shit?"
//
// He had asked for one thing: the Harvestman's head is cut off, fix it and any others like it. What happened
// instead:
//
//   · A SCANNER REPLACED A JUDGEMENT. "40+ opaque pixels on the top row" returned 44 sprites. An antler tip
//     grazing the canvas edge is not a cut-off head — about FOUR actually read as broken. The contact sheets
//     said so, in a triage that literally wrote "severe" and "mild, antler tips only", and all 44 were
//     regenerated anyway.
//   · THE JOB WAS ALREADY DONE. The cause was a square canvas; one line in gen-grove-art fixed it, at medium,
//     44 clipped to 0. Everything after that was repainting a bestiary nobody asked to have repainted.
//   · `high` AGAIN, ON ONE SAMPLE. A single high test came back near-identical to its original, which looked
//     like proof. It was variance — the same creature in the batch came back a flat green tree. $10.73.
//
// So the two numbers below are HARD. There is no flag, because a flag is what failed.
//
// ⚠️ AND RUN IT IN THE FOREGROUND. Luke: "I fucking hate that... I can't just tell you to stop. I have to
// tell you to stop and then I have to wait for you to stop this asynchronous runaway train." A generation
// batch must never be backgrounded. He has to be able to kill it with one word.

/** A run bigger than this is Luke's call, and he makes it by looking at three. */
export const BATCH_MAX = 3;

/**
 * Refuse any batch past BATCH_MAX. NOT overridable — that is the entire point.
 *
 * Luke: "generate one and show me. Right? One or two or three, like, not 40."
 */
export function requireSmallBatch({ count, total, what = "images" }) {
    if (count <= BATCH_MAX) return;
    console.log(`\nSTOP. ${count} ${what} is $${total.toFixed(2)}; ${BATCH_MAX} is the ceiling.`);
    console.log("  There is no flag for this. Draw three, contact-sheet them, show Luke, let him choose.");
    process.exit(1);
}

/**
 * `high` is not the house setting, and "the medium output looked a bit flat" is not a reason to reach for it.
 *
 * ⚠️ THE REPO HAD ALREADY PAID FOR THIS ANSWER TWICE and written it in two script headers: gen-pet-level6
 * says "this script is the reason gen-guard.mjs exists: it inherited high", and regen-pet-levels says
 * "$1.10 at medium and $4.28 at high; the difference dies in the downscale". Overridden anyway, for $10.73.
 *
 * Quality is also almost never the variable. The defect that started all this was a CANVAS ASPECT bug and
 * medium fixed it completely. If medium looks wrong, the prompt or the pipeline is wrong.
 */
export function requireHighIsJustified({ quality: q, count, total, reason = null }) {
    if (q !== "high") return;
    if (reason && count <= BATCH_MAX) return;
    console.log(`\nSTOP. high x${count} is $${total.toFixed(2)}; medium is the house setting.`);
    console.log("  The repo has twice found high is not worth it — gen-pet-level6, regen-pet-levels.");
    console.log("  If medium looks wrong the PROMPT is wrong, not the quality.");
    console.log(`  At most ${BATCH_MAX} at high, and only with an explicit reason passed in.\n`);
    process.exit(1);
}
