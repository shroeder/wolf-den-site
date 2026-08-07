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
// THE SECOND WAY IT FAILS, which this check missed until the sailing boards shipped broken: the rule can aim
// at a perfectly ordinary lowercase <div> and STILL match nothing, if that markup lives in a DIFFERENT
// FUNCTION in the same file. styled-jsx only scopes JSX written inside the component that owns the block, so
// moving rows into a `function Row()` helper kills every rule aimed at them at once. The boards rendered rows
// as run-together text and a boat <img> at its natural size — a full-screen ship — and this script passed the
// whole time, because it only looked for capitalised tags.
//
// The fix is always one of: use a DOM element inside the owning component, or declare that rule in
// `<style jsx global>` (or globals.css, which is where anything shared belongs).
//
// THERE IS A THIRD CASE THIS SCRIPT DELIBERATELY DOES NOT CHECK: the same class name declared in one file's
// scoped block and used in ANOTHER file (it is dead there too — scoping cannot cross a file). It was tried and
// removed. Modifier names like `is-on` and `is-spent` are a convention half the app follows independently, and
// telling class names apart from ordinary identifiers inside `className={...}` expressions needs a real JSX
// parser, not a regex — the attempt reported `.fx` as a dead rule because a ternary mentioned a variable
// called fx. A gate that cries wolf gets ignored, and then it is not a gate. Shared classes go in globals.css.
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

    // ── The sibling-component trap ───────────────────────────────────────────────────────────────────────
    // Split the file into top-level function/const component bodies, find which one owns the <style jsx>, and
    // flag any class it declares that is used ONLY in some other component in the same file.
    const owner = ownerBody(src);
    if (owner) {
        const outside = src.slice(0, owner.start) + src.slice(owner.end);
        // Does this class appear as a whole word in a chunk of source? Deliberately a plain token scan rather
        // than a regex: class names contain dashes, which a naive \b boundary treats as a word break, and the
        // escaping needed to do it properly is exactly the sort of thing that produces a silent false positive
        // in a gate everybody has to run.
        const usedIn = (body, cls) => {
            const ownJsx = body.replace(/<style\s+jsx[\s\S]*?`\}<\/style>/g, " "); // the CSS itself is not usage
            for (const m of ownJsx.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
                const text = m[1] || m[2] || "";
                for (const token of text.split(/[^\w-]+/)) if (token === cls) return true;
            }
            return false;
        };
        for (const cls of declared) {
            if (onCustom.has(cls)) continue;                 // already reported above
            if (!usedIn(owner.body, cls) && usedIn(outside, cls)) {
                problems.push(`${file}: .${cls} is styled in a scoped <style jsx> but only used in a SIBLING component in the same file — scoping never reaches it`);
            }
        }
    }
}

// The body of the component that owns the (first) scoped <style jsx> block: from its `function X(`/`const X =`
// back to the matching close. Approximate on purpose — it only has to be good enough to tell "in this
// component" from "in another one in the same file".
function ownerBody(src) {
    // Blank out comments FIRST. Half the files that have been bitten by this now carry a doc block explaining
    // the trap — and those blocks say "<style jsx>", which the search happily found, putting the owning
    // component at the top of the file and flagging every class in it. A checker that fires on its own
    // documentation is worse than no checker.
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
    const at = bare.search(/<style\s+jsx(?!\s+global)/);
    if (at < 0) return null;
    const heads = [...src.matchAll(/^(?:export\s+default\s+)?(?:export\s+)?(?:function|const)\s+([A-Z][\w]*)\s*[({=]/gm)];
    let start = 0, next = src.length;
    for (const h of heads) {
        if (h.index <= at) start = Math.max(start, h.index);
        else next = Math.min(next, h.index);
    }
    return { start, end: next, body: src.slice(start, next) };
}

if (problems.length) {
    console.error(`check:styled-jsx — ${problems.length} dead rule(s):\n`);
    for (const p of problems) console.error("  ✗ " + p);
    console.error("\nFix: put the class on a DOM element, or move that rule into <style jsx global>.");
    process.exit(1);
}
console.log(`check:styled-jsx — ${files.length} files, no style rule aimed at a custom component.`);
