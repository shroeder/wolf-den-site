// ── AN OVERLAY MUST BE IN THE INERT REGISTRY ────────────────────────────────────────────────────────────────
// Luke, after tapping through quest dialogue and watching his hero walk about underneath it: "This is the
// kind of thing that you should be catching, not exposing to me and letting me discover for myself... I'm
// talking about a flaw in the process you use to create features."
//
// The defect was never "the quest dialogue forgot". TownClient decides whether the street is inert from a
// hand-written list of booleans, and the file had THIRTEEN overlays in a list of ten. The three that were
// missing — actOpen, bossOpen, voteOpen — all let taps through to the scene underneath. The comment beside
// that list describes the same bug being fixed once already, for whichever overlays existed that day.
//
// A list like that cannot tell you it has stopped covering things. This can.
//
//   npm run check:overlays
//
// ⚠️ IT IS STATIC ON PURPOSE. The runtime proof is scripts/qa-overlay-inert.mjs, which opens each overlay in
// a browser and checks the hero does not move — but two of the thirteen need a live election or a live raid
// to exist at all, so a runtime pass can never cover the whole set. This covers all of them, in a second,
// before the code is ever run.
import { readFileSync } from "node:fs";

const TARGETS = [
    {
        file: "src/components/TownClient.js",
        // The record whose values decide whether the scene ignores pointers.
        registry: /const TOWN_OVERLAYS = \{([\s\S]*?)\};/,
        // Every piece of state in the file that represents "something is covering the scene".
        states: /const \[([a-zA-Z]+(?:Open|Reveal))\s*,\s*set/g,
        // Declared overlays that genuinely do not cover the scene, with the reason. Anything not listed
        // here must be in the registry.
        exempt: {
            // (none today — every *Open in this file is a real overlay)
        },
    },
];

let bad = 0;
for (const t of TARGETS) {
    const src = readFileSync(t.file, "utf8");
    const m = src.match(t.registry);
    if (!m) {
        console.log(`  ✗ ${t.file}: no overlay registry found — did it get renamed?`);
        bad += 1;
        continue;
    }
    const listed = new Set(m[1].split(/[,\s]+/).map((x) => x.trim()).filter(Boolean));
    const declared = [...src.matchAll(t.states)].map((x) => x[1]);
    const missing = [...new Set(declared)].filter((d) => !listed.has(d) && !(d in t.exempt));

    console.log(`  ${t.file}: ${declared.length} overlay states, ${listed.size} in the registry`);
    for (const d of missing) {
        console.log(`  ✗ "${d}" is an overlay but is not in TOWN_OVERLAYS — taps will reach the street under it`);
        bad += 1;
    }
    // And the reverse: a name left in the registry after its state was deleted is a silent no-op that
    // makes the list look more complete than it is.
    for (const l of listed) {
        if (!declared.includes(l) && !/^(roster|menuFor|fight)$/.test(l)) {
            console.log(`  ✗ "${l}" is in the registry but no longer exists in the file`);
            bad += 1;
        }
    }
}

console.log(bad
    ? `\ncheck:overlays — ${bad} problem(s). An overlay that is not registered lets taps through to what is under it.`
    : "\ncheck:overlays — every overlay makes the scene beneath it inert.");
process.exit(bad ? 1 : 0);
