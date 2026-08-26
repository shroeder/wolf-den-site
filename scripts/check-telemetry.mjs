// ── DOES THE TELEMETRY REGISTRY STILL DESCRIBE THE GAME? ─────────────────────────────────────────────────────
// telemetry-coverage.js declares every system in the game and the activity events that prove it is alive, and
// the admin app draws a coverage screen from it. That screen is only worth looking at if the registry is true.
//
// A hand-maintained list rots in two directions and both are silent:
//
//   1. A new feature fires a new event and nobody adds it to the registry. Coverage reads 100% while the
//      screen simply never mentions the feature — the exact failure the screen exists to prevent.
//   2. A registry entry names an event no code fires any more. The system shows as "silent" forever and gets
//      read as a dead feature when it is really a dead line in a list.
//
// So this diffs both directions: every trackActivity key in the source must be declared, and every declared
// key must exist in the source.
//
// ── WHY THE EVENT ARGUMENT IS PARSED AND NOT GREPPED ─────────────────────────────────────────────────────────
// The first version of this matched /trackActivity\(\s*[^,]+,\s*"(\w+)"/ and passed clean — while EIGHT events
// were firing in production that it never saw, including arena_win at 2,487 rows in thirty days. They are
// written as ternaries:
//
//     await trackActivity(buyerId, won ? "arena_win" : "arena_loss", {...})
//
// A regex looking for a quote straight after the comma skips those silently, which makes a green gate worse
// than no gate. So the second argument is located by walking brackets to the top-level comma and EVERY string
// literal inside it counts.
//
// The registry is read as TEXT, not imported — telemetry-coverage.js pulls in `server-only`, which throws
// outside a Next runtime, and this has to run as a bare script.
//
// Run:  npm run check:telemetry
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Given the text after "trackActivity(", return every string literal in the SECOND argument.
function eventLiterals(seg) {
    const skipArg = (s) => {
        let depth = 0;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if ("([{".includes(ch)) depth++;
            else if (")]}".includes(ch)) { if (depth === 0) return { arg: s.slice(0, i), rest: null }; depth--; }
            else if (ch === "," && depth === 0) return { arg: s.slice(0, i), rest: s.slice(i + 1) };
        }
        return { arg: s, rest: null };
    };
    const first = skipArg(seg);
    if (first.rest === null) return [];
    const second = skipArg(first.rest);
    return [...second.arg.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

// ── EVERY EVENT THE CODE ACTUALLY FIRES ──────────────────────────────────────────────────────────────────────
const fired = new Map(); // event -> [file, ...]
const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith(".js") && !e.name.endsWith(".jsx")) continue;
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/trackActivity\(/g)) {
            const rel = p.slice(root.length + 1).split(sep).join("/");
            for (const ev of eventLiterals(src.slice(m.index + m[0].length, m.index + m[0].length + 300))) {
                if (!fired.has(ev)) fired.set(ev, []);
                if (!fired.get(ev).includes(rel)) fired.get(ev).push(rel);
            }
        }
    }
};
walk(join(root, "src"));

// ── EVERY EVENT THE REGISTRY DECLARES ────────────────────────────────────────────────────────────────────────
const registry = readFileSync(join(root, "src/lib/marketplace/telemetry-coverage.js"), "utf8");
const declared = new Map(); // event -> system key
for (const m of registry.matchAll(/\{\s*key:\s*"([a-z0-9_]+)",[^}]*?events:\s*\[([^\]]*)\]/g)) {
    for (const e of m[2].matchAll(/"([a-z0-9_]+)"/g)) declared.set(e[1], m[1]);
}
if (declared.size === 0) {
    console.error("check:telemetry — could not parse any events out of the registry. Did its shape change?");
    process.exit(1);
}

// Events fired from the CLIENT go through /api/marketplace/track rather than a trackActivity call in a module,
// so they have no call site to find. activity.js is the authority on which those are.
const activity = readFileSync(join(root, "src/lib/marketplace/activity.js"), "utf8");
const clientBlock = activity.match(/export const CLIENT_EVENTS = new Set\(\[([\s\S]*?)\]\);/);
const clientEvents = new Set([...(clientBlock?.[1] || "").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

const undeclared = [...fired.keys()].filter((e) => !declared.has(e)).sort();
const unfired = [...declared.keys()].filter((e) => !fired.has(e) && !clientEvents.has(e)).sort();

let bad = false;
if (undeclared.length) {
    bad = true;
    console.error(`\n✗ ${undeclared.length} event${undeclared.length === 1 ? "" : "s"} fired but NOT in the registry.`);
    console.error("  The coverage screen cannot show a system it has never been told about.\n");
    for (const e of undeclared) console.error(`    ${e.padEnd(24)} ${fired.get(e).join(", ")}`);
    console.error("\n  Add each to a system's `events` in src/lib/marketplace/telemetry-coverage.js.");
}
if (unfired.length) {
    bad = true;
    console.error(`\n✗ ${unfired.length} event${unfired.length === 1 ? "" : "s"} declared but fired from NOWHERE.`);
    console.error("  These show as permanently silent on the screen and read as dead features.\n");
    for (const e of unfired) console.error(`    ${e.padEnd(24)} declared by system "${declared.get(e)}"`);
    console.error("\n  Either wire the call site or drop the entry.");
}

if (bad) process.exit(1);
console.log(`check:telemetry — ${declared.size} events declared, all matched to real call sites across ${fired.size} fired keys (${clientEvents.size} client-fired). ✓`);
