// ── A QUERY MUST USE EVERY PARAMETER IT IS HANDED ───────────────────────────────────────────────────────────
// Luke: "The question pop up says 6 of 6 complete, the npc says 0 of 6."
//
// The NPC was right. bumpQuests ran:
//
//     UPDATE mkt_grove_quest SET progress = LEAST($5, GREATEST(progress, $5)) ...
//       WHERE buyer_id = $1 AND step_id = $2 AND claimed_at IS NULL
//     [buyerId, s.id, npc.id, map, next]
//
// Five parameters, three referenced. Postgres cannot infer a type for $3 or $4, so it refuses the whole
// statement with "could not determine data type of parameter $3" -- and a `.catch(() => {})` threw the
// error away. NO QUEST PROGRESS WAS EVER WRITTEN, for the entire life of the feature, and the toast
// announced the number the code MEANT to store so nothing ever looked wrong.
//
// ⚠️ THE DEFECT IS INVISIBLE AT EVERY OTHER LAYER. It is valid JavaScript, the SQL reads correctly, the
// params look like they belong to the statement, and the swallow means no log line anywhere. The only
// thing that can see it is counting.
//
// So: every $1..$max referenced by a statement must actually appear in it. A gap means a parameter with
// nothing to infer a type from, which Postgres refuses outright.
//
// ⚠️ IT DELIBERATELY DOES NOT COUNT THE ARGUMENTS. The first cut did, by splitting the literal array on
// commas, and reported 91 "mismatches" that were all its own parser losing track of a trailing comma or a
// nested call. Counting arguments needs a real JS parse to be right; the gap test needs only the SQL
// string, and it caught the one real defect in 1,978 queries with nothing else to wade through.
//
//   node scripts/check-sql-params.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["src", "scripts"];
const files = [];
const walk = (dir) => {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (name === "node_modules" || name === ".next") continue;
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(js|mjs)$/.test(name)) files.push(full);
    }
};
for (const r of ROOTS) { try { walk(r); } catch { /* absent */ } }

// db.query(`...`, [ ... ]) / db.queryOne(`...`, [ ... ]) / sql.query(`...`, [ ... ])
//
// ⚠️ THE SQL CAPTURE MUST NOT CROSS A BACKTICK. With [\s\S]*? it ran from one call's opening backtick to
// a LATER call's closing one, inventing a statement that referenced $1..$20 out of two real ones and
// reporting it as the worst defect in the repo. A template literal cannot contain an unescaped backtick,
// so [^`]* is both correct and self-limiting.
const CALL = /\b(?:db|sql)\.(?:query|queryOne)\(\s*`([^`]*)`\s*,\s*\[/g;

let problems = 0, checked = 0;
for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(CALL)) {
        const [, sqlText] = m;
        // Template interpolation means the param list is not literal; skip rather than guess.
        if (/\$\{/.test(sqlText)) continue;
        const used = new Set([...sqlText.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
        if (!used.size) continue;
        checked += 1;
        const max = Math.max(...used);
        const missing = [];
        for (let i = 1; i <= max; i += 1) if (!used.has(i)) missing.push(`$${i}`);
        const line = src.slice(0, m.index).split("\n").length;
        if (missing.length) {
            problems += 1;
            console.log(`\n${file}:${line}`);
            console.log(`  SQL references ${[...used].sort((a, b) => a - b).map((i) => `$${i}`).join(", ")}`
                + ` but never ${missing.join(", ")} — Postgres cannot infer a type and REFUSES the statement`);
            console.log(`  ${sqlText.trim().split("\n")[0].trim().slice(0, 92)}`);
        }
    }
}

console.log(`\n${checked} parameterised queries checked.`);
if (problems) {
    console.log(`${problems} would be REFUSED by Postgres at runtime.`);
    process.exit(1);
}
console.log("Every query uses every parameter it is handed.");
