// ── THE HOOK-DEPENDENCY TEMPORAL DEAD ZONE ───────────────────────────────────────────────────────────────────
// "Cannot access 'parts' before initialization" took the Forge down for four members, and nothing in the repo
// could have caught it:
//
//   • `next build` compiles it happily — the identifier exists and the module is valid
//   • `no-undef` has nothing to say — it IS defined, just later
//   • `react-hooks/exhaustive-deps` checks that deps are COMPLETE, never that they are REACHABLE
//   • `no-use-before-define` does catch it, but it also flags 73 module-scope helpers in this codebase that are
//     declared after their callers and are perfectly safe, because they are only CALLED at runtime. A gate that
//     reports 74 problems to find 1 is a gate people stop running — that lesson is already written into
//     check-styled-jsx.mjs.
//
// So this checks the one thing that is always a bug: a useCallback / useMemo / useEffect DEPENDENCY ARRAY that
// names a `const` declared further down the same component. A dependency array is evaluated during render, so
// the const is still in its temporal dead zone and the component throws on every single render.
//
//   node scripts/check-hook-deps.mjs
import fs from "node:fs";
import path from "node:path";

const roots = ["src/components", "src/app", "src/lib"];
const files = [];
const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(js|jsx)$/.test(e.name)) files.push(full);
    }
};
for (const r of roots) if (fs.existsSync(r)) walk(r);

const problems = [];
for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!/use(Callback|Memo|Effect)\(/.test(src)) continue;
    const lines = src.split("\n");

    // TOP-LEVEL BLOCKS. A file holds several components, and a hook in one of them has nothing to do with a
    // const in another — comparing across the whole file reported five components that work fine in production.
    // Anything at zero indentation that opens a function starts a new block.
    const starts = [];
    lines.forEach((line, i) => { if (/^(export\s+)?(default\s+)?(async\s+)?function\s|^(export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*(async\s*)?\(/.test(line)) starts.push(i + 1); });
    const blockOf = (ln) => { let s = 0; for (const st of starts) { if (st <= ln) s = st; else break; } return s; };

    // Where each const/let is declared. Destructuring included, so `const [a, setA] = useState()` counts.
    const declaredAt = new Map();
    lines.forEach((line, i) => {
        const m = line.match(/^\s*(?:const|let)\s+(?:\[([^\]]*)\]|\{([^}]*)\}|([A-Za-z_$][\w$]*))\s*=/);
        if (!m) return;
        const names = (m[1] || m[2] || m[3] || "")
            .split(",")
            .map((x) => x.split(":").pop().replace(/\.\.\./, "").trim())
            .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x));
        for (const n of names) if (!declaredAt.has(n)) declaredAt.set(n, i + 1);
    });

    // Every hook's dependency array, and the line it sits on.
    const re = /use(?:Callback|Memo|Effect)\(/g;
    let m;
    while ((m = re.exec(src))) {
        // Walk to the matching close paren so a nested array/object inside the body cannot fool us.
        let depth = 0, end = -1;
        for (let i = m.index + m[0].length - 1; i < src.length; i += 1) {
            if (src[i] === "(") depth += 1;
            else if (src[i] === ")") { depth -= 1; if (depth === 0) { end = i; break; } }
        }
        if (end < 0) continue;
        const call = src.slice(m.index, end);
        const dep = call.match(/,\s*\[([^\]]*)\]\s*$/);
        if (!dep) continue;
        const hookLine = src.slice(0, m.index).split("\n").length;
        for (const raw of dep[1].split(",")) {
            const name = raw.trim().split(/[.?[]/)[0];
            if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
            const d = declaredAt.get(name);
            // Same component only — a later declaration in a DIFFERENT function is not a dead zone.
            if (d && d > hookLine && blockOf(d) === blockOf(hookLine)) {
                problems.push(`${file}:${hookLine}  dependency "${name}" is declared at line ${d} — evaluated during render, so this throws every time`);
            }
        }
    }
}

if (problems.length) {
    console.error(`check-hook-deps — ${problems.length} temporal-dead-zone dependency error(s):\n`);
    for (const p of problems) console.error("  " + p);
    process.exit(1);
}
console.log(`check-hook-deps — ${files.length} files, no hook depends on a value declared below it.`);
