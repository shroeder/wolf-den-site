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
const known = [];
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

// ── AND A WHOLE FILE NOBODY IMPORTS ──────────────────────────────────────────────────────────────────────────
// The check above only ever looked INSIDE a file, so a component that no module imports at all sailed past it.
// MarketplaceMessagingDock did exactly that for six weeks: SocialHub replaced it on 2026-07-15, the file stayed,
// and a fortnight later a commit carefully added tab-visibility gating to a poll in a component that nothing
// renders. Dead code that looks alive attracts maintenance, and reading the invocation list you cannot tell
// which of two components polling the same endpoint is the real one.
const componentFiles = files.filter((f) => f.split(path.sep).includes("components"));
const everythingSrc = files.map((f) => fs.readFileSync(f, "utf8"));

// Every module path this codebase imports, anywhere, by its basename. Collected by matching the path in the
// quotes rather than guessing at substrings: the imports here carry a ".js" extension
// ("@/components/casino/VipLounge.js"), and a check looking for "/VipLounge\"" finds none of them — which is
// how the first version of this rule declared ten live casino screens dead.
const importedNames = new Set();
for (const src of everythingSrc) {
    for (const m of src.matchAll(/(?:from|import|require)\s*\(?\s*["'`]([^"'`]+)["'`]/g)) {
        const base = m[1].split("/").pop().replace(/\.(js|jsx)$/, "");
        if (base) importedNames.add(base);
    }
}

// ── KNOWN, NAMED, AND NOT QUIETLY ACCEPTED ───────────────────────────────────────────────────────────────────
// An orphan that is a BUG rather than leftovers. Deleting it would remove a feature somebody asked for, and
// restoring it is visual work that has to be filmed before anybody can say it looks right — so it is named
// here with the reason, rather than deleted, exempted silently, or left to make this gate red forever.
// An entry without a reason is not an entry. Empty this list, do not grow it.
const KNOWN_ORPHANS = {
    // Empty, and it should stay that way. SpriteFx lived here for exactly as long as it took to restore the
    // wiring 78242120 removed; an exemption that outlives its bug is just a gate with a hole in it.
};

for (const file of componentFiles) {
    const name = path.basename(file).replace(/\.(js|jsx)$/, "");
    if (!importedNames.has(name)) {
        if (KNOWN_ORPHANS[name]) { known.push(`${name}: ${KNOWN_ORPHANS[name]}`); continue; }
        problems.push(`${file}: nothing imports this file — it is a whole component that never runs`);
    }
}

if (problems.length) {
    console.error(`\ncheck:dead-components — ${problems.length} unmounted component(s):\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\nFix: render it, or delete it. A component nothing mounts is a feature that silently does not exist.\n");
    process.exit(1);
}
for (const k of known) console.log(`check:dead-components — KNOWN ORPHAN, still not rendering:
  ! ${k}`);
console.log(`check:dead-components — ${files.length} files, every local component is actually rendered.`);
