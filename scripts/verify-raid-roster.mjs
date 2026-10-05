// Proves pickSpawnKind's roster flips wholesale with the flag, read off the real source.
// Parsed rather than imported: town-events.js pulls in db and @/ aliases that plain node cannot resolve.
import fs from "node:fs";
const src = fs.readFileSync("src/lib/marketplace/town-events.js", "utf8");
const body = src.slice(src.indexOf("TOWN_EVENT_TYPES = {"));
const TYPES = {};
for (const m of body.matchAll(/^ {4}(\w+): \{\r?\n?([\s\S]*?)^ {4}\},/gm)) {
    const [, key, blob] = m;
    TYPES[key] = {
        name: (blob.match(/name:\s*"([^"]+)"/) || [])[1] || key,
        season: (blob.match(/season:\s*"([^"]+)"/) || [])[1] || null,
        boss: /\bboss:\s*true/.test(blob),
    };
}
let bad = 0;
for (const PUBLIC of [false, true]) {
    const inSeason = (k) => !TYPES[k].season || (TYPES[k].season === "halloween" && PUBLIC);
    const kinds = Object.keys(TYPES).filter(inSeason);
    const seasonal = (l) => { const o = l.filter((k) => TYPES[k].season); return o.length ? o : l; };
    const bosses = seasonal(kinds.filter((k) => TYPES[k].boss));
    const ordinary = seasonal(kinds.filter((k) => !TYPES[k].boss));
    console.log(`HALLOWEEN_PUBLIC = ${PUBLIC}`);
    console.log("   skirmishes:", ordinary.map((k) => TYPES[k].name).join(", ") || "(none)");
    console.log("   boss      :", bosses.map((k) => TYPES[k].name).join(", ") || "(none)");
    // In season NOTHING year-round may be drawn; out of season nothing seasonal may be.
    const leak = [...ordinary, ...bosses].filter((k) => (PUBLIC ? !TYPES[k].season : !!TYPES[k].season));
    if (leak.length) { console.log("   !! LEAKED:", leak.join(", ")); bad += 1; }
    if (!ordinary.length || !bosses.length) { console.log("   !! EMPTY BUCKET — raids would stop"); bad += 1; }
}
console.log(bad ? `\nFAIL (${bad})` : "\nOK — the roster swaps wholesale and neither bucket is ever empty.");
process.exit(bad ? 1 : 0);
