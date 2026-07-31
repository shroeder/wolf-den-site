// Find STATIC import cycles.
//
// ESM resolves a cycle to `undefined` at call time rather than failing at import, so a cycle passes the build,
// passes type-check, and then throws the first time a real user hits the code path. That exact failure has taken
// the Kitchen down three times now, each time announcing itself as "the menu item is missing" rather than as an
// error, because the nav swallows a failed unlock check.
//
// Dynamic `await import()` is the fix for a cycle, so it deliberately does NOT count as an edge here.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const files = [];
(function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
    }
})("src");

const norm = (p) => p.split(path.sep).join("/");

function resolve(spec, from) {
    let base;
    if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
    else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
    else return null;
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js")];
    for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return norm(c);
    return null;
}

const graph = {};
for (const f of files) {
    const src = readFileSync(f, "utf8");
    const deps = new Set();
    for (const m of src.matchAll(/^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
        const r = resolve(m[1], f);
        if (r) deps.add(r);
    }
    graph[norm(f)] = [...deps];
}

const cycles = [];
const state = {};
function dfs(node, stack) {
    if (state[node] === "done") return;
    if (state[node] === "open") {
        cycles.push([...stack.slice(stack.indexOf(node)), node]);
        return;
    }
    state[node] = "open";
    stack.push(node);
    for (const d of graph[node] || []) dfs(d, stack);
    stack.pop();
    state[node] = "done";
}
for (const n of Object.keys(graph)) dfs(n, []);

const seen = new Set();
const unique = cycles.filter((c) => {
    const key = [...c].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
});

const short = (p) => p.replace("src/lib/marketplace/", "mk/").replace("src/lib/", "lib/").replace("src/", "");
console.log(`STATIC import cycles: ${unique.length}`);
for (const c of unique) console.log("  " + c.map(short).join(" -> "));
process.exit(unique.length ? 1 : 0);
