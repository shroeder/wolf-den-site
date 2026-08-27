// ── HOW MANY REQUESTS DOES THE CHROME MAKE? ──────────────────────────────────────────────────────────────────
// A component mounted in a layout runs on EVERY page under that layout. GameNav sat in the marketplace layout
// and fetched FOURTEEN endpoints, each re-running on `pathname`, so walking three screens billed 42 function
// invocations to draw a menu. Four of those fourteen called a whole feature's state builder — the casino floor,
// the jeweller's bench, the arena board with seventy members' kits — to read one boolean off the reply. The
// arena one alone was 74 database round trips and 2 seconds for two numbers.
//
// Nothing about that is visible in a diff. Adding one more `fetch` to the nav is a one-line change that looks
// free and costs a request on every navigation by every member forever. So the count is checked.
//
// The rule: a component mounted in a layout reads from AT MOST ONE endpoint. If it needs more, it needs a
// batched endpoint (see /api/marketplace/hud and /api/marketplace/nudges) or the shared client feed
// (src/lib/nudge-feed.js) — not another fetch. Writes are exempt: acknowledging a badge is that component's
// own job and happens once, on an action, not on every page load.
//
//   node scripts/check-chrome-fanout.mjs     (or npm run check:chrome)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// Written this way because a backslash-n does not survive every layer this file gets edited through.
const NL = String.fromCharCode(10);

const layouts = [];
(function walk(d) {
    for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "layout.js") layouts.push(p);
    }
}("src/app"));

// Which components each layout actually MOUNTS (imported but never rendered does not run).
const mounted = new Map();   // component name -> layout that mounts it
for (const f of layouts) {
    const src = readFileSync(f, "utf8");
    const imports = new Map();
    for (const m of src.matchAll(/import\s+(\w+)\s+from\s+"@\/components\/([\w/]+)"/g)) imports.set(m[1], m[2]);
    for (const [name, path] of imports) {
        // Rendered, not merely imported. Done by hand rather than with a regex: the escape for "any
        // whitespace" does not survive every layer this file has been written through, and a mount test
        // that silently matches nothing makes the whole gate pass vacuously — which it did, once.
        const tag = "<" + name;
        const at = src.indexOf(tag);
        const after = at < 0 ? "" : (src[at + tag.length] || "");
        if (at >= 0 && (after === "/" || after === ">" || after.trim() === "")) {
            mounted.set(path, f.split(sep).join("/"));
        }
    }
}

// From the "(" after fetch, walk to its matching close paren, so the options object comes with the URL.
function callAt(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i += 1) {
        const c = s[i];
        if (c === "(" || c === "[" || c === "{") depth += 1;
        else if (c === ")" || c === "]" || c === "}") { depth -= 1; if (depth === 0) return s.slice(open + 1, i); }
    }
    return null;
}

const problems = [];
let checked = 0;
for (const [comp, layout] of mounted) {
    let src;
    try { src = readFileSync(join("src", "components", `${comp}.js`), "utf8"); } catch { continue; }
    checked += 1;
    const reads = new Set();
    let i = 0;
    for (;;) {
        const at = src.indexOf("fetch(", i);
        if (at < 0) break;
        i = at + 6;
        // `casFetch(` / `myFetch(` are their own thing; only a bare fetch call counts.
        if (/[\w$.]/.test(src[at - 1] || "")) continue;
        const call = callAt(src, at + "fetch".length);
        if (call == null) continue;
        if (/method:\s*["'](POST|PUT|PATCH|DELETE)["']/i.test(call)) continue;   // a write, not a page-load read
        // A read that only happens when somebody DOES something — opens the dock, expands a thread — or that
        // sits behind a flag that is off, costs nothing per page load and says so. Same convention as
        // check-polls' `poll-gate: local`, and the same trade: a marker is cheaper than teaching a regex to
        // tell a useCallback fired on click from one fired in a mount effect.
        if (/chrome-fanout:\s*on-demand/.test(src.slice(Math.max(0, at - 300), at))) continue;
        const url = call.match(/["'`](\/[^"'`]+)["'`]/);
        if (url) reads.add(url[1].split("?")[0]);
    }
    if (reads.size > 1) {
        problems.push(`${comp} is mounted in ${layout} and reads ${reads.size} endpoints on every page:\n`
            + [...reads].map((u) => `        ${u}`).join("\n")
            + NL + "      Batch them into one endpoint, or share one reply the way lib/nudge-feed.js does."
            + NL + "      A read that only fires on an interaction can say so with: chrome-fanout: on-demand");
    }
}

if (problems.length) {
    console.error(`check:chrome — ${problems.length} of ${checked} layout-mounted components fan out:\n`);
    for (const p of problems) console.error(`  x ${p}\n`);
    process.exit(1);
}
console.log(`check:chrome — ${checked} layout-mounted components, none reads more than one endpoint per page.`);
