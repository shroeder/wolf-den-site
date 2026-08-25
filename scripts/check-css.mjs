// ── IS ANY OF THIS STYLESHEET SECRETLY A COMMENT? ────────────────────────────────────────────────────────────
// On 2026-08-25 the entire keno number board turned out to have been dead for an unknown length of time. A
// comment block describing a feature that no longer exists — "── THE WHEEL ──" — had lost its closing marker
// when the feature's rules were deleted, so everything after it was swallowed until the next `*/` thirteen
// lines later. `.cas-grid` and `.cas-num` never reached the browser at all.
//
// WHAT MAKES THIS WORTH A GATE is how it fails. There is no error, no warning, no missing file and no broken
// page: the rules are simply absent, the browser falls back to user-agent defaults, and the screen still
// renders — just wrong. Forty native <button> elements at their default styling look enough like "a plain
// design" that it was reported as a styling opinion rather than as a bug, and I agreed with that reading
// until I went looking in the built bundle.
//
// So this looks for the signature rather than for the syntax. An unterminated comment is not itself an error
// in CSS, and a stylesheet with one still parses — what it does is EAT RULES. So the question this asks is
// not "is every comment closed" (they always are, eventually, by the next one) but:
//
//     IS THERE ANYTHING INSIDE A COMMENT THAT LOOKS LIKE A RULE?
//
// which is exactly what a swallowed block looks like and almost never what real prose looks like. Every
// comment in this repo is prose; a line inside one that starts with a selector and opens a brace is a line
// that somebody meant the browser to read.
//
// Run:  node scripts/check-css.mjs   (or npm run check:css)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = [path.join(HERE, "..", "src", "app", "globals.css")];

const problems = [];

// A line that is a CSS rule opening: a selector (class, id, element, &, *, [attr]) then a `{`.
// Deliberately narrow — `@media`, `@keyframes` and bare `{` are excluded because prose can contain braces
// and the false positives are what make a gate get switched off.
const RULE = /^\s*(?:[.#][A-Za-z_][\w-]*|@keyframes\s+[\w-]+|@media\b)[^{}]*\{/;

for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    const rel = path.relative(path.join(HERE, ".."), file).replace(/\\/g, "/");

    // Walk the file tracking comment state exactly as a CSS parser does, and remember where each comment
    // started so the report can name the line that ate the rules rather than the line that noticed.
    let inComment = false;
    let openedAt = 0;
    let swallowed = [];

    for (let n = 0; n < lines.length; n += 1) {
        const line = lines[n];
        let i = 0;
        let codeOnThisLine = "";

        while (i < line.length) {
            if (inComment) {
                const close = line.indexOf("*/", i);
                if (close === -1) {
                    // The whole rest of the line is inside the comment. If it looks like a rule, it is one.
                    if (RULE.test(line.slice(i))) swallowed.push({ n: n + 1, text: line.trim() });
                    break;
                }
                inComment = false;
                i = close + 2;
            } else {
                const open = line.indexOf("/*", i);
                if (open === -1) { codeOnThisLine += line.slice(i); break; }
                codeOnThisLine += line.slice(i, open);
                inComment = true;
                openedAt = n + 1;
                i = open + 2;
            }
        }

        // A comment that has just closed, having eaten rules on the way, is the bug.
        if (!inComment && swallowed.length) {
            problems.push(
                `${rel}: the comment opened at line ${openedAt} swallowed ${swallowed.length} rule(s) — `
                + `it is missing its closing marker.\n`
                + swallowed.slice(0, 6).map((s) => `      line ${s.n}: ${s.text.slice(0, 88)}`).join("\n")
                + (swallowed.length > 6 ? `\n      …and ${swallowed.length - 6} more` : ""),
            );
            swallowed = [];
        }
    }

    if (inComment) {
        problems.push(`${rel}: the comment opened at line ${openedAt} is never closed — everything after it is dead.`);
        if (swallowed.length) {
            problems.push(`      it has already swallowed ${swallowed.length} rule(s), first at line ${swallowed[0].n}`);
        }
    }

    console.log(`  ${rel}  ${lines.length.toLocaleString()} lines, ${(src.length / 1024).toFixed(0)}kb`);
}

console.log("");
if (problems.length) {
    console.log(`check:css FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log("\nA rule inside a comment is a rule the browser never sees. The page still renders — with");
    console.log("user-agent defaults where your design was — which is why nothing else catches this.");
    process.exit(1);
}
console.log("check:css — no rules are hiding inside comments.");
