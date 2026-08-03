// Every /images/… path written in the source must exist in public/.
//
// A missing sprite is invisible to `next build` AND to eslint: it's just a string. It surfaces as a blank box
// on a member's screen, or — worse — as whatever emoji fallback used to sit behind it. Moving the mine's four
// shared icons into public/images/ui/ is exactly the change that breaks this quietly, so it gets a check.
//
//   npm run check:art
//
// Paths built at runtime (`/images/fish/${id}.png`) can't be verified as literals, so the directory they point
// at is checked for being non-empty instead — enough to catch a whole folder going missing.
import fs from "node:fs";
import path from "node:path";

const SRC = "src";
const PUBLIC = "public";

const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx|mjs)$/.test(e.name)) files.push(p);
    }
})(SRC);

const LITERAL = /["'`](\/images\/[A-Za-z0-9_\-/.]+\.(?:png|jpg|jpeg|svg|webp|gif))["'`]/g;
const TEMPLATE = /`(\/images\/[A-Za-z0-9_\-/]*)\$\{/g;

const missing = [];
const emptyDirs = new Set();
const seen = new Set();

for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(LITERAL)) {
        const rel = m[1];
        if (seen.has(rel + f)) continue;
        seen.add(rel + f);
        if (!fs.existsSync(path.join(PUBLIC, rel))) missing.push(`${f}  ->  ${rel}`);
    }
    for (const m of src.matchAll(TEMPLATE)) {
        const dir = m[1].replace(/\/[^/]*$/, "");
        if (!dir || emptyDirs.has(dir)) continue;
        const abs = path.join(PUBLIC, dir);
        if (!fs.existsSync(abs) || fs.readdirSync(abs).length === 0) {
            emptyDirs.add(dir);
            missing.push(`${f}  ->  ${dir}/  (built at runtime; directory missing or empty)`);
        }
    }
}

if (missing.length) {
    console.error(`\n${missing.length} image path(s) referenced in source but not present in public/:\n`);
    for (const m of missing) console.error("  " + m);
    console.error("");
    process.exit(1);
}
console.log(`check:art — ${seen.size} image paths, all present.`);
