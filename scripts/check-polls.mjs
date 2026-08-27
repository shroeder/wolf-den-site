// ── EVERY TIMER THAT TALKS TO THE SERVER MUST STOP WHEN NOBODY IS LOOKING ────────────────────────────────────
// A polling loop is one line in a component, it runs forever, and on a plan billed by invocation a member who
// leaves a tab open overnight invoices for every tick of it. Nothing about that is visible from anywhere: not
// the build, not a code review of the diff that added it, not the usage page until the bill arrives.
//
// This bug class has now been fixed three separate times in this repo — the tavern, the VIP lounge, and the
// casino floor — and the casino one was shipped the same week it was found. The floor posted the member's
// position every 2.5 seconds unconditionally: not gated on the tab, and not gated on having MOVED, so a member
// standing still at a machine sent 1,440 writes an hour saying nothing had changed.
//
// So it is checked. Two rules, both of which that bug broke:
//
//   1. A timer that makes a request must be gated on `document.visibilityState`.
//   2. A timer that PUSHES state (a POST) must also compare against what it last sent, so a player who has
//      not moved sends nothing. A visibility gate alone still bills 1,440/hr for an open, idle tab.
//
// A loop that is genuinely local — a walk animation, a countdown repaint — declares itself with
// `// poll-gate: local` on the line above, which is cheaper than teaching a regex the difference.
//
//   node scripts/check-polls.mjs     (or npm run check:polls)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const files = [];
(function walk(d) {
    for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".js")) files.push(p);
    }
}("src/components"));

// Names this codebase actually uses to leave the browser. Deliberately generous: a false positive costs
// somebody one `visibilityState` check, and a false negative costs money every hour for months.
const NET = /\bfetch\s*\(|casFetch\s*\(|casPost\s*\(|\bPOST\s*\(|\bpost\s*\(|Post\s*\(|\bload\s*\(|\bping\s*\(|\brefreshUnread\s*\(|\bcheck\s*\(/;
const PUSHES = /casPost\s*\(|\bPOST\s*\(|Post\s*\(|\bpost\s*\(|method:\s*["']POST["']/;

// From the "(" after setInterval, walk to its matching close paren.
function argsAt(s, open) {
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
for (const f of files) {
    const src = readFileSync(f, "utf8");
    let i = 0;
    for (;;) {
        const at = src.indexOf("setInterval(", i);
        if (at < 0) break;
        i = at + 12;
        const args = argsAt(src, at + "setInterval".length);
        if (args == null) continue;
        if (!NET.test(args)) continue;
        checked += 1;
        const line = src.slice(0, at).split("\n").length;
        const before = src.slice(Math.max(0, at - 400), at);
        if (/poll-gate:\s*local/.test(before)) continue;
        const where = `${f.split(sep).join("/").replace("src/components/", "")}:${line}`;
        if (!/visibilityState/.test(args)) {
            problems.push(`${where} polls the server on a timer with no visibilityState gate — it bills the same whether anybody is looking`);
        } else if (PUSHES.test(args) && !/(sentRef|lastSent|prevSent)/.test(args)) {
            problems.push(`${where} PUSHES on a timer with no "did it change" check — a member standing still still sends every tick`);
        }
    }
}

if (problems.length) {
    console.error(`check:polls — ${problems.length} of ${checked} network timers are unguarded:\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\nGate it on document.visibilityState, and for a push compare against what you last sent.");
    console.error("A genuinely local timer can say so with `// poll-gate: local` on the line above.");
    process.exit(1);
}
console.log(`check:polls — ${checked} network timers, every one stops when the tab is hidden.`);
