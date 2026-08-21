// ── DOES EVERYTHING THE ENGINE READS ACTUALLY SURVIVE THE TRIP INTO bout_json? ────────────────────────────────
// A fighter is built by fighterFrom, written into bout_json by buildBout, and read back by sideOf. buildBout
// used to name the fields it carried BY HAND, in a different file from the function that decides what a swing
// needs — and it named twenty of the thirty-five. The other twenty-seven were computed, printed on the card,
// and thrown away on the way into the fight. Armour did nothing. Every Warden node did nothing. It had been
// that way for as long as the current engine has existed and no test could see it, because every test called
// autoBout directly with a whole fighter and never went through the allowlist that production goes through.
//
// So this does not trust either list. It hands sideOf a PROXY that records every property it touches, and
// compares that against COMBAT_FIELDS — the list buildBout actually spreads. A new mechanic added to sideOf
// without adding it here fails this check instead of quietly doing nothing in production for a month.
//
//   npm run check:bout
import { COMBAT_FIELDS, sideOf } from "@/lib/marketplace/arena-engine.js";

const touched = new Set();
const probe = new Proxy({}, {
    get(_t, key) {
        if (typeof key !== "string") return undefined;
        touched.add(key);
        // A number keeps sideOf on its arithmetic paths; every field it reads is numeric.
        return 1;
    },
    has(_t, key) { if (typeof key === "string") touched.add(key); return true; },
});
sideOf(probe);

const declared = new Set(COMBAT_FIELDS);
const missing = [...touched].filter((k) => !declared.has(k)).sort();
// Not an error, but worth printing: a declared field nothing reads is dead weight in every bout row.
const unread = COMBAT_FIELDS.filter((k) => !touched.has(k)).sort();

if (unread.length) {
    console.log(`note: ${unread.length} field(s) in COMBAT_FIELDS that sideOf never reads — ${unread.join(", ")}`);
}

if (missing.length) {
    console.error("");
    console.error(`check:bout FAILED — sideOf resolves a swing from ${missing.length} field(s) that buildBout does not carry:`);
    console.error("");
    for (const k of missing) console.error(`  ${k}`);
    console.error("");
    console.error("Every one of these is computed by fighterFrom, shown on the fighter card, and then dropped");
    console.error("on the way into bout_json — so it does nothing in a real fight while appearing to work.");
    console.error("Add them to COMBAT_FIELDS in src/lib/marketplace/arena-engine.js.");
    process.exit(1);
}

console.log(`check:bout — all ${touched.size} fields sideOf reads are carried into the bout.`);
