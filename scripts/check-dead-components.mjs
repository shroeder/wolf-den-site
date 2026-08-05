// A component that is defined, styled, wired to an API action — and never actually rendered.
//
// This is what happened to the Arena's result modal. `Recap` existed, `useScrollLock` was in it, the dismiss
// action existed, `clearBout` existed on the server. A big rewrite of the render block dropped the single line
// that mounted it. Nothing complained: it is not undefined, it is not a bad import, and eslint does not flag an
// unused function declaration. So every bout for four commits ended on a dead screen with no way off it except
// reloading the page.
//
// The rule here is deliberately conservative to stay quiet: a local, non-exported, capitalised component is
// dead only if its name appears EXACTLY once in the whole file — its own declaration. Anything that mentions it
// again (JSX, a map, a ternary, a prop) is treated as used.
import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
    }
})(ROOT);

const problems = [];
for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    // Local component declarations only — `export function Foo` is part of the module's surface and may well be
    // rendered somewhere else entirely.
    for (const m of src.matchAll(/^(?!export\s)(?:\s*)function ([A-Z][A-Za-z0-9_]*)\s*\(/gm)) {
        const name = m[1];
        const uses = src.match(new RegExp(`\\b${name}\\b`, "g")) || [];
        if (uses.length <= 1) problems.push(`${file}: <${name}> is defined but never rendered anywhere in the file`);
    }
}

if (problems.length) {
    console.error(`\ncheck:dead-components — ${problems.length} unmounted component(s):\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\nFix: render it, or delete it. A component nothing mounts is a feature that silently does not exist.\n");
    process.exit(1);
}
console.log(`check:dead-components — ${files.length} files, every local component is actually rendered.`);
