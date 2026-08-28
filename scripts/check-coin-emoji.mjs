// ── THE CURRENCY IS A SPRITE, NOT A FONT GLYPH ───────────────────────────────────────────────────────────────
// Luke, from an iPad: "ipad shows a quarter instead of the desired gold coin sprite?" The coin emoji is drawn
// by whatever font the device ships. Google's is gold. APPLE'S IS A SILVER QUARTER WITH AN EAGLE ON IT — so on
// every iPhone and iPad the game's currency was a different coin from the one in the HUD, the shop cards and
// every sprite. 164 of them had spread across 28 components and a dozen data tables.
//
// They are gone, and this keeps them gone. It is a one-line change to type the emoji again and nothing about
// the result looks wrong on the machine it was typed on, which is exactly why a person cannot be the check.
//
// Three ways to say "coin" that are all fine:
//   <Coin />                      in JSX                        (src/components/Coin.js)
//   COIN_ICON                     in a data table               (src/lib/coin-icon.js, drawn by <Glyph />)
//   the word "gold"               inside a string, where neither of the above can go
//
// EXEMPT, deliberately:
//   - push notification titles: the OS draws them, an <img> is not an option there
//   - the admin ledger's reason labels, which are an emoji-keyed set on an internal screen
//   - comments, which are allowed to quote the bug they describe
//
//   node scripts/check-coin-emoji.mjs     (or npm run check:coin)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const COIN = "\u{1FA99}";
const EXEMPT = [
    "src/app/api/admin/",              // push titles + admin-only ledger labels
    "src/lib/marketplace/coin-economy.js",
    "src/components/Coin.js",
    "src/components/Glyph.js",
    "scripts/",
];

const files = [];
(function walk(d) {
    for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".js") || name.endsWith(".jsx")) files.push(p);
    }
}("src"));

const problems = [];
let scanned = 0;
for (const f of files) {
    const rel = f.split(sep).join("/");
    if (EXEMPT.some((e) => rel.startsWith(e) || rel.includes(e))) continue;
    const src = readFileSync(f, "utf8");
    if (!src.includes(COIN)) { scanned += 1; continue; }
    scanned += 1;
    src.split("\n").forEach((line, i) => {
        if (!line.includes(COIN)) return;
        // A comment may quote it — that is how the bug gets explained.
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        problems.push(`${rel}:${i + 1}  ${trimmed.slice(0, 90)}`);
    });
}

if (problems.length) {
    console.error(`check:coin — ${problems.length} coin emoji back in the UI; Apple draws these as a silver quarter:\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\nUse <Coin /> in JSX, COIN_ICON in a data table (drawn by <Glyph />), or the word \"gold\" in a string.");
    process.exit(1);
}
console.log(`check:coin — ${scanned} files, no coin emoji in the UI. The currency is one sprite everywhere.`);
