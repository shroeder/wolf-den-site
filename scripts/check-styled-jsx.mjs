// ── A STYLE RULE AIMED AT A CUSTOM COMPONENT MATCHES NOTHING ─────────────────────────────────────────────────
// styled-jsx scopes by appending a `jsx-<hash>` class to every DOM element in a component's JSX. It does NOT
// add it to a CUSTOM component — <Link>, <Image>, or a local <Img> helper. So this:
//
//     <Link className="gs" …>            .gs { display: grid; padding: 12px; border: 1px solid … }
//
// compiles the markup to class="gs" and the rule to `.gs.jsx-abc123{…}`, which can never match. There is no
// error, no warning and no build failure — the element simply renders with none of its styles.
//
// It has bitten this codebase three times: the delve screens (a local `Img` wrapper, which unstyled every
// backdrop and every upgrade icon), the Pathfinder's play-page strip (the whole card was a <Link>, so it
// rendered as a line of naked text), and the shared UpgCard's icon (`.mine-upg-ico` lived in MiningClient's
// scoped block and aimed at a custom <Img>, so it was dead in all six screens that use that card).
//
// The fix is always one of: use a DOM element, or declare that rule in `<style jsx global>`.
//
// Usage:  node scripts/check-styled-jsx.mjs
import fs from "node:fs";
import path from "node:path";

const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.jsx?$/.test(e.name)) files.push(p);
    }
})("src");

// Strip <style jsx global> blocks and return what's left of the scoped ones.
function scopedCss(src) {
    let out = "";
    const re = /<style\s+jsx(\s+global)?\s*>\{`/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
        const start = m.index + m[0].length;
        const end = src.indexOf("`}", start);
        if (end < 0) continue;
        if (!m[1]) out += src.slice(start, end) + "\n";  // no `global` → scoped
    }
    return out;
}

const problems = [];
for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!/<style\s+jsx/.test(src)) continue;

    const css = scopedCss(src);
    if (!css.trim()) continue;
    // Class selectors declared in the SCOPED blocks.
    const declared = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    if (!declared.size) continue;

    // Classes handed to a CUSTOM component — a JSX tag whose name starts with a capital, or is dotted.
    // (`<Foo className="a b">` and `<Foo className={`a ${x}`}>` both count; the literal part is what matters.)
    const onCustom = new Map();
    const tag = /<([A-Z][\w.]*)\b([^>]*?)\/?>/gs;
    for (let m = tag.exec(src); m; m = tag.exec(src)) {
        const [, name, attrs] = m;
        for (const cn of attrs.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
            const literal = (cn[1] || cn[2] || "").replace(/\$\{[^}]*\}/g, " ");
            for (const cls of literal.split(/\s+/).filter(Boolean)) {
                if (declared.has(cls)) {
                    if (!onCustom.has(cls)) onCustom.set(cls, new Set());
                    onCustom.get(cls).add(name);
                }
            }
        }
    }
    for (const [cls, tags] of onCustom) {
        problems.push(`${file}: .${cls} is styled in a scoped <style jsx> but used on <${[...tags].join("/")}> — it will not apply`);
    }
}

if (problems.length) {
    console.error(`check:styled-jsx — ${problems.length} dead rule(s):\n`);
    for (const p of problems) console.error("  ✗ " + p);
    console.error("\nFix: put the class on a DOM element, or move that rule into <style jsx global>.");
    process.exit(1);
}
console.log(`check:styled-jsx — ${files.length} files, no style rule aimed at a custom component.`);
