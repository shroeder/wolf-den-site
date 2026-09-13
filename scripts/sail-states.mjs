// ── THE SAILING SCREEN, IN EVERY STATE THAT MATTERS, WITHOUT TOUCHING ANYBODY'S ACCOUNT ──────────────────────
// The reason a blocking banner shipped two screens below the fold: driving the page into a state meant writing
// that state into Neon on a live account, so it got done once and every other state went unphotographed. The
// one I checked read correctly in the DOM and I never looked at where it was.
//
//   node scripts/sail-states.mjs                 films every state at a phone and a desktop size
//   node scripts/sail-states.mjs captain clear   just those
//
// Each state is derived from scripts/fixtures/sailing.base.json — a real captured response, scrubbed — so the
// shape is the server's, not mine. `watch` names the selectors that have to be ON SCREEN for that state to be
// playable, and film.mjs --fold measures them at the filmed viewport. An element that exists, reads right and
// sits below the fold is reported as OFF SCREEN, which is the failure this file exists for.
//
// ⚠️ THE DEV SERVER HAS TO BE UP (npm run dev) and SHOT_COOKIE set — the page still renders server-side before
// the client refresh replaces the state, so an unauthenticated run films a sign-in page.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const OUT = `${process.env.TEMP}/sail-states`;
const LIVE = "scripts/fixtures/.live";
mkdirSync(OUT, { recursive: true });
mkdirSync(LIVE, { recursive: true });
const base = JSON.parse(readFileSync("scripts/fixtures/sailing.base.json", "utf8"));
const clone = () => JSON.parse(JSON.stringify(base));

const STATES = {
    // A chart in hand. This is what a captain is FOR: beat her, he gives up the anchorage, and the helm grows a
    // fourth voyage option that is not one of the three durations. ⚠️ There used to be an interrogation between
    // those two things and a banner blocking the page until you had done it — both are gone (see captains.js),
    // so what is left to check is that the chart shows up and the sea is not shut.
    charted: {
        why: "a chart in hand: the helm offers a charted island and nothing is blocked",
        // PRESENT, not `watch`: the embark picker sits under the boat by design, so "below the fold" is not a
        // fault here — "not there at all" is. Three strengths, and picking the wrong one is how a check starts
        // failing for a thing that is working.
        present: [".sail-embark-opt.is-charted"],
        absent: [".sail-capblock"],
        make: () => { const s = clone(); s.chartsReady = 2; s.status = "idle"; return s; },
    },
    clear: {
        why: "no chart: the charted option must not be there at all",
        watch: [],
        soft: [".sail-stations"],
        absent: [".sail-embark-opt.is-charted", ".sail-capblock"],
        make: () => { const s = clone(); s.chartsReady = 0; s.status = "idle"; return s; },
    },
    // Mid-voyage, which is what most members see most of the time.
    sailing: {
        why: "ship is out: the clock is the screen",
        watch: [],
        soft: [".sail-stations"],
        make: () => {
            const s = clone(); s.chartsReady = 0; s.status = "sailing";
            s.departedAt = new Date(Date.now() - 60_000).toISOString();
            s.arrivesAt = new Date(Date.now() + 20 * 60_000).toISOString();
            return s;
        },
    },
};

const SIZES = [
    // ⚠️ 375x667 WITH THE CHROME TAKEN OFF. A real phone spends ~226px on the browser's own furniture, and a
    // banner that clears the fold on a bare 667 can still be under the keyboard bar on the actual device.
    { name: "phone", w: 375, h: 441, dpr: 2 },
    { name: "wide", w: 1200, h: 900, dpr: 1 },
];

// ── FILM A RETURNING PLAYER, NOT A FIRST-TIMER ───────────────────────────────────────────────────────────────
// HowToPlay hides itself once you have dismissed it, in localStorage — so a fresh browser profile films a page
// with a tall explainer card wedged into the top of it, and everything below reads as "off screen" when for
// almost every member it is not. Dismissed at document-start so the measurements are the ones players get.
const RETURNING = "try { localStorage.setItem('wolfden-howto-sailing', '1'); } catch {}";

const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const names = want.length ? want : Object.keys(STATES);
let bad = 0;

for (const name of names) {
    const st = STATES[name];
    if (!st) { console.log(`no such state: ${name} (have ${Object.keys(STATES).join(", ")})`); continue; }
    // Written where the SERVER can read it: this page renders its state and hands it over as a prop, so the
    // swap has to happen before the HTML exists. --mock is for the screens that fetch theirs.
    const made = st.make();
    writeFileSync(`${LIVE}/sailing.${name}.json`, JSON.stringify(made));
    console.log(`\n── ${name} — ${st.why}`);
    for (const z of SIZES) {
        const out = `${OUT}/${name}-${z.name}`;
        const r = spawnSync(process.execPath, [
            "scripts/film.mjs", "http://localhost:3000/marketplace/sailing", out,
            "--fixture", name, "--pre", RETURNING, "--fold", [...(st.watch || []), ...(st.present || []), ...(st.soft || []), ...(st.absent || [])].join(","),
            "--settle", "9000", "--frames", "1", "--every", "200",
            "--w", String(z.w), "--h", String(z.h), "--dpr", String(z.dpr),
        ], { encoding: "utf8", env: { ...process.env, SHOT_QUIET: "1" } });
        const lines = (r.stdout || "").split("\n").filter((l) => /fold|mock|frames over/.test(l));
        console.log(`   ${z.name} ${z.w}x${z.h}`);
        for (const l of lines) {
            // An `absent` selector is SUPPOSED to be missing, so invert the reading rather than printing a
            // scary line for the thing working correctly.
            const isAbsent = (st.absent || []).some((sel) => l.includes(sel));
            if (isAbsent) {
                const gone = /NOT IN THE DOCUMENT/.test(l);
                console.log(`     ${gone ? "ok  " : "⚠️  "} ${l.trim().replace(/^fold\s+/, "")}${gone ? "  (correct — it should not be here)" : "  ← SHOULD NOT BE HERE"}`);
                if (!gone) bad += 1;
                continue;
            }
            const isPresent = (st.present || []).some((sel) => l.includes(sel));
            if (isPresent) {
                const there = !/NOT IN THE DOCUMENT|HIDDEN by css/.test(l);
                if (!there) bad += 1;
                console.log(`     ${there ? "ok  " : "⚠️  "} ${l.trim().replace(/^fold\s+/, "")}${there ? "" : "  ← MUST BE HERE"}`);
                continue;
            }
            const isSoft = (st.soft || []).some((sel) => l.includes(sel));
            if (isSoft) { console.log(`     note ${l.trim().replace(/^fold\s+/, "")}`); continue; }
            if (/OFF SCREEN|NOT IN THE DOCUMENT|HIDDEN by css|never matched/.test(l)) { bad += 1; console.log(`     ⚠️  ${l.trim()}`); }
            else console.log(`     ${l.trim()}`);
        }
        if (r.status !== 0) { bad += 1; console.log(`     ⚠️  film failed: ${(r.stderr || "").split("\n").slice(-3).join(" ")}`); }
    }
}
console.log(bad ? `\n${bad} problem(s). Sheets: ${OUT}` : `\nevery watched element is on the screen in every state. Sheets: ${OUT}`);
process.exit(0);
