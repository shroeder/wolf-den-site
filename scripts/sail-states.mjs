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
    // those two things and a banner blocking the page until you had done it — both are gone,
    // so what is left to check is that the chart shows up and the sea is not shut.
    charted: {
        why: "a chart in hand: the helm offers a charted island and nothing is blocked",
        // ⚠️ THE DOOR IS `.sail-chart-cta`, NOT A VOYAGE OPTION. This read `.sail-embark-opt.is-charted`
        // until 2026-09-18 — a class that stopped existing when the chart came OUT of the duration picker
        // and became its own row above it (see SailingClient). So this check had been reporting a problem
        // about a thing that was working, on every run, for days. Another [[checks-that-cannot-fail]], in
        // the failing direction: a rig that cries wolf is a rig nobody reads.
        // PRESENT, not `watch`: the row sits under the boat by design, so "below the fold" is not a fault
        // here — "not there at all" is. Three strengths, and picking the wrong one is how a check starts
        // failing for a thing that is working.
        present: [".sail-chart-cta"],
        absent: [".sail-capblock"],
        make: () => { const s = clone(); s.chartsReady = 2; s.status = "idle"; return s; },
    },
    clear: {
        why: "no chart: the charted option must not be there at all",
        watch: [],
        soft: [".sail-stations"],
        absent: [".sail-chart-cta", ".sail-capblock"],
        make: () => { const s = clone(); s.chartsReady = 0; s.status = "idle"; return s; },
    },
    // The town's Halloween flag raised. Everything about the dressing is cosmetic, so what this state is
    // really checking is that the costume did not COST anything: the stations still reach the screen and the
    // helm still works with a moon, bats, mist and pumpkins layered over the same scene.
    halloween: {
        why: "the flag is up: the sea is dressed and nothing it added is in the way",
        watch: [],
        soft: [".sail-stations"],
        // ⚠️ THE WITCH IS NOT CHECKED, ON PURPOSE. She is opacity:0 for most of a 22s loop by design, so a
        // single sampled frame reports her "HIDDEN by css" nearly every run — a check that fails while the
        // feature works is a check nobody reads twice. Everything else here is always on screen.
        // The risers (serpent, tentacle) are NOT asserted for the same reason the witch is not: they are hidden for
        // most of a long loop by design, so a sampled frame reports them missing on nearly every run.
        present: [".sail-hw-moon", ".sail-hw-bat", ".sail-hw-fog", ".sail-hw-moonpath"],
        make: () => { const s = clone(); s.halloween = true; s.chartsReady = 0; s.status = "idle"; return s; },
    },
    // ── THE PIT, WITH THE FLAG UP ────────────────────────────────────────────────────────────────────────
    // Digging is the OTHER half of this screen and had no state here at all, which is exactly how a costume
    // ships for the sea and not for the ground you land on. The board is hand-built to boardView()'s shape
    // (see sailing.js) rather than generated, because newBoard needs a member row and a DB — and the point of
    // this file is to photograph a screen without touching anybody's account.
    //
    // MID-DIG ON PURPOSE: scans spent so the instruction line reads "tap to dig", a few tiles already down to
    // bare floor, and one corner of the chest showing. A fresh board is all one texture and would photograph
    // as "the backdrop changed" while telling me nothing about whether the TILES came along with it.
    dighaunted: {
        why: "landed and digging with the flag up: grave dirt, not a tinted mine",
        // The pit and its tiles have to be the haunted ones — `is-halloween` is what carries the swap down
        // past the backdrop, and a backdrop that changed while the tiles stayed amber is the failure here.
        present: [".dig-wrap.is-halloween", ".dig-grid", ".dig-tile"],
        make: () => {
            const s = clone();
            s.halloween = true;
            s.chartsReady = 0;
            s.status = "digging";
            const tier = 3, size = 7, maxDepth = 4;
            // A 2x2 chest at rows 3-4, cols 2-3, with its top-left cell already bottomed out.
            const chest = { "3,2": "tl", "3,3": "tr", "4,2": "bl", "4,3": "br" };
            const scanned = new Set(["2,2", "0,6", "5,4"]);   // hot, cold, cool — one of each to read
            const tiles = [];
            for (let r = 0; r < size; r++) {
                const row = [];
                for (let c = 0; c < size; c++) {
                    const pos = chest[`${r},${c}`] || null;
                    // Deterministic, so two runs are comparable — Math.random() here would mean every frame
                    // photographed a different board and no change could be read against the last shot.
                    const churn = (r * 7 + c * 3) % 5;
                    const bottomed = (r === 3 && c === 2) || churn === 0;
                    const depth = bottomed ? 0 : Math.max(1, maxDepth - (churn % maxDepth));
                    row.push({
                        depth, maxDepth, dug: depth < maxDepth, found: Boolean(pos) && depth === 0,
                        chestPos: pos,
                        item: r === 1 && c === 5 ? { id: "sail_lucky_lure", emoji: "🪝", name: "Lucky Lure" } : null,
                        // ⚠️ ONLY THE THREE TILES A SCAN WAS ACTUALLY SPENT ON. The first version gave
                        // every tile a heat reading, which is not a board that can exist — maxSenses is 3 —
                        // and the chips covered the whole grid, so the photo showed a wall of blue ice
                        // cubes and none of the grave dirt the flag is here to change.
                        sense: depth > 0 && scanned.has(`${r},${c}`)
                            ? Math.max(0, 3 - (Math.abs(r - 3) + Math.abs(c - 2)))
                            : null,
                    });
                }
                tiles.push(row);
            }
            s.dig = {
                cols: size, rows: size, maxDepth, tier, chestTier: "golden", shape: null,
                stamina: 9, maxStamina: 16, senses: 0, maxSenses: 3, status: "active",
                tiles, buried: 4, found: 1, bonus: 0, toolProc: null, chestDone: false, itemsLeft: 1,
                twinChest: true,
            };
            return s;
        },
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
