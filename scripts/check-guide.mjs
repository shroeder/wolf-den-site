// ── DOES THE GUIDE ACTUALLY WORK? ────────────────────────────────────────────────────────────────────────────
// The Pathfinder tells a new member "do this, here" and then waits for an event to prove they did it. Two ways
// that silently breaks, and both of them shipped:
//
//   1. The href points somewhere the action isn't. "Open the forge" linked to /marketplace/forge, which is a
//      404 — the route is /marketplace/blacksmith. "See the boss" linked to /marketplace/play, which never
//      fires view_boss. Following the guide's own instruction did not complete the guide's own step.
//   2. The event is a name nothing emits. `town_merchant` and `tavern_barkeep` came from the old onboarding
//      list and appear NOWHERE in the codebase, so that step could only ever be satisfied by the unrelated
//      events sitting beside them.
//
// Neither shows up in a build, a lint or a page load — the step just never ticks, and the member is stuck on it
// forever with no error anywhere. So it is checked here instead.
//
// Usage:  node scripts/check-guide.mjs      (exits non-zero on any broken step)
import fs from "node:fs";
import path from "node:path";

const SRC = "src";
const CATALOG = "src/lib/marketplace/guide-chapters.js";

// The catalog is pure data with no imports we care about, so it can be read as text and evaluated — cheaper and
// more robust than standing up the "@/" alias just to import one array.
const raw = fs.readFileSync(CATALOG, "utf8");
// Slice the array by BRACKET DEPTH, not by lastIndexOf("];"). The first cut did the latter and broke the
// moment a second `export const … = [...]` was added below the chapters: it swallowed everything to the end of
// the file and tried to eval an `export`. Counting depth means anything can be added after it.
const start = raw.indexOf("[", raw.indexOf("export const GUIDE_CHAPTERS ="));
let depth = 0, end = start;
for (let i = start; i < raw.length; i += 1) {
    if (raw[i] === "[") depth += 1;
    else if (raw[i] === "]") { depth -= 1; if (depth === 0) { end = i + 1; break; } }
}
// eslint-disable-next-line no-new-func
const CHAPTERS = new Function(`return ${raw.slice(start, end)}`)();

// ── every file under src, once ──
const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
    }
})(SRC);
const CODE = files
    .filter((f) => !f.endsWith("guide-chapters.js"))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");

// ── 1. does the route exist? ──
// App Router: a page at /a/b is src/app/**/a/b/page.js, with (group) segments that don't appear in the URL.
const PAGES = files.filter((f) => /[\\/]page\.jsx?$/.test(f));
const routeOf = (file) =>
    "/" + file
        .replace(/\\/g, "/")
        .replace(/^src\/app\//, "")
        .replace(/\/page\.jsx?$/, "")
        .split("/")
        .filter((seg) => seg && !/^\(.*\)$/.test(seg))
        .join("/");
const ROUTES = new Set(PAGES.map(routeOf));

// ── 2. is the event ever emitted? ──
// trackActivity(x, "name") and ViewPing event="name" are the two ways an event reaches mkt_activity_event.
// The first cut of this matched `trackActivity(x, "name")` and nothing else, and immediately produced two
// FALSE alarms on steps that work fine: pet_other is emitted as `trackActivity(id, own ? "pet_farm" :
// "pet_other", …)` — a ternary, not a literal in slot two — and inspect_item goes through trackClient() from
// the browser. A checker that cries wolf gets switched off, so instead of an allowlist it now reads the whole
// argument list of every emit call and takes every string literal out of it.
const emitted = new Set();
const CALL = /(?:trackActivity|trackClient|trackVisitor)\s*\(/g;
for (let m = CALL.exec(CODE); m; m = CALL.exec(CODE)) {
    // Walk to the matching close paren so a ternary, a template or a multi-line call is all one chunk.
    let depth = 1, i = m.index + m[0].length;
    for (; i < CODE.length && depth > 0; i += 1) {
        if (CODE[i] === "(") depth += 1;
        else if (CODE[i] === ")") depth -= 1;
    }
    const args = CODE.slice(m.index + m[0].length, i);
    for (const lit of args.matchAll(/["'`]([a-z][a-z0-9_]{2,})["'`]/g)) emitted.add(lit[1]);
}
for (const m of CODE.matchAll(/ViewPing[^>]*?event=["'`]([a-z0-9_]+)["'`]/g)) emitted.add(m[1]);

const problems = [];
for (const ch of CHAPTERS) {
    for (const s of ch.steps) {
        if (!s.href) problems.push(`${ch.id}/${s.key}: no href`);
        else if (!ROUTES.has(s.href)) problems.push(`${ch.id}/${s.key}: href ${s.href} is not a route`);

        if (s.events) {
            const dead = s.events.filter((e) => !emitted.has(e));
            // EVERY listed event must be real. Checking "at least one is real" is precisely the hole that let
            // town_merchant and tavern_barkeep survive: their live neighbours covered for them.
            if (dead.length) problems.push(`${ch.id}/${s.key}: event(s) never emitted — ${dead.join(", ")}`);
        } else if (!s.verify && s.claim !== "client") {
            problems.push(`${ch.id}/${s.key}: no events, no verify, not client-claimed — can never complete`);
        }
        if (!s.why || s.why.length < 40) problems.push(`${ch.id}/${s.key}: 'why' is too thin to teach anything`);
        if (!(s.gold > 0)) problems.push(`${ch.id}/${s.key}: pays nothing`);
    }
    if (!ch.reward?.gold) problems.push(`${ch.id}: chapter has no purse`);
    // The emblem is the chapter's whole visual identity in the path; a missing one is a broken image in the
    // middle of the guide, which is exactly the sort of thing nobody notices until a member screenshots it.
    if (!ch.icon) problems.push(`${ch.id}: no emblem`);
    else if (!fs.existsSync(path.join("public", ch.icon.replace(/^\//, "")))) problems.push(`${ch.id}: emblem ${ch.icon} is not on disk`);
}

const steps = CHAPTERS.flatMap((c) => c.steps).length;
if (problems.length) {
    console.error(`check:guide — ${problems.length} problem(s) across ${CHAPTERS.length} chapters / ${steps} steps:\n`);
    for (const p of problems) console.error("  ✗ " + p);
    process.exit(1);
}
console.log(`check:guide — ${CHAPTERS.length} chapters, ${steps} steps, every href a real route and every event really emitted.`);
