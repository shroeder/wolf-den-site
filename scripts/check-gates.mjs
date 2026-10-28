// ── FEATURE GATES COME IN PAIRS ──────────────────────────────────────────────────────────────────────────────
// A dimmed menu tile whose URL still serves the page is not locked. This repo has shipped that exact shape
// before, which is why the rule gets a gate of its own rather than a comment: for every feature towns.js says
// is gated, the page behind it must call gatePage().
//
// It also checks the reverse — a page that guards itself against a feature nobody gates is a guard that will
// never fire, which is the other way a pair comes apart.
//
//   npm run check:gates
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);
const { TOWNS, FEATURE_TOWN, NEVER_GATED } = await import("@/lib/marketplace/towns.js");

const PAGES = "src/app/(public)/marketplace";
// Features whose page lives somewhere other than /marketplace/<feature>.
const ALIAS = { tavern: "friends" };

const fail = [];
const ok = [];
const freebie = [];

for (const t of TOWNS) {
    for (const feature of t.features) {
        // Town 1 is open to every account that exists, so its pages have nothing to guard against and
        // gatePage short-circuits before any read. Not a failure — just not a gate.
        if (t.n <= 1 || NEVER_GATED.has(feature)) { freebie.push(feature); continue; }
        const dir = ALIAS[feature] || feature;
        const file = path.join(PAGES, dir, "page.js");
        if (!fs.existsSync(file)) { fail.push(`${feature}: no page at ${file}`); continue; }
        const src = fs.readFileSync(file, "utf8");
        if (!src.includes(`gatePage("${feature}")`)) {
            fail.push(`${feature}: ${file} does not call gatePage("${feature}") — the menu dims it and the URL still serves it`);
            continue;
        }
        ok.push(feature);
    }
}

// The reverse: a page guarding a feature that is not in any town.
for (const dir of fs.readdirSync(PAGES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = path.join(PAGES, dir.name, "page.js");
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, "utf8").match(/gatePage\("([^"]+)"\)/);
    if (m && !FEATURE_TOWN[m[1]] && !NEVER_GATED.has(m[1])) {
        fail.push(`${dir.name}: guards "${m[1]}", which no town unlocks — the guard can never fire`);
    }
}

console.log("── THE TOWN GATE ────────────────────────────────────────────────────────────");
console.log(`  towns           ${TOWNS.length}, gating ${Object.keys(FEATURE_TOWN).length} features`);
console.log(`  guarded pages   ${ok.length} call gatePage()`);
console.log(`  open by design  ${freebie.length} (town 1 + the till — gatePage returns before any read)`);

if (fail.length) {
    console.log(`\n── ${fail.length} PROBLEM(S) ──────────────────────────────────────────────────`);
    for (const f of fail) console.log("  ·", f);
    process.exit(1);
}
console.log("\nOK — every gated feature's page guards itself, and no guard is pointed at nothing.");
