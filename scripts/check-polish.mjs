// ── THE POLISH GATE ─────────────────────────────────────────────────────────────────────────────────────────
//
// Luke has told me the same handful of things over and over across the casino work, and they stopped being
// preferences somewhere around the third time. This is that feedback written down as checks, so a cabinet
// cannot ship having broken one of them again and I cannot rediscover them one screenshot at a time.
//
// Every rule below cites the thing that produced it, because a gate whose reasoning is lost gets deleted the
// first time it is inconvenient. They fall into two families.
//
//   THINGS THAT ARE NAILED SHUT. A feature declared in one file and dropped in another — the single most
//   expensive class of bug in this whole system, because everything compiles, every gate passes, and the
//   feature silently is not there. The Deep alone had four in one go: a trigger that could never fire
//   because the symbol was not on the reels the line walks, an offer builder that hardcoded `sticky: false`,
//   a payload that dropped `mult`/`held`/`justHeld`/`pearls`, and a symbol with no art. The engine collected
//   4.9 pearls a round and the screen drew x1 with an empty board. Checks 1-5.
//
//   THINGS THAT ARE UNFINISHED. A symbol drawn as text, a round with no ending, a feature with no build-up.
//   "The multipliers have no sprite." "There is no build up or visibility." "We need a recap modal with
//   dopamine and sprites and motion." Checks 6-8.
//
// WHAT THIS CANNOT DO, said plainly so nobody trusts it further than it goes: it does not open a browser. It
// cannot tell you a button is off the bottom of a phone, that a readout covers the reels, or that a reel
// spins upward — all of which Luke has had to report by hand. Those need the film rig and an actual look.
// A green run here means "nothing is nailed shut", not "this is finished".
//
// Run:  npm run check:polish
import fs from "node:fs";
import path from "node:path";

import { SLOTS5, MACHINE_LOOKS } from "../src/lib/marketplace/casino-slot5.js";
import { SLOT_THEMES } from "../src/lib/marketplace/casino.js";

const REELS = 5;
const ART_DIR = path.join(process.cwd(), "public", "images", "casino", "reels");
const ENGINE = fs.readFileSync("src/lib/marketplace/casino-slot5.js", "utf8");
const PLAY = fs.readFileSync("src/lib/marketplace/casino-slot5-play.js", "utf8");
const CLIENT = fs.readFileSync("src/components/casino/Slot5.js", "utf8")
    + fs.readFileSync("src/components/casino/ColossalReels.js", "utf8");

const problems = [];
const notes = [];
const fail = (machine, rule, msg) => problems.push({ machine, rule, msg });

// Emoji, for check 8. The Den's rule is a sprite or a react-icons glyph, never the operating system's art.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

for (const [id, m] of Object.entries(SLOTS5)) {
    const look = MACHINE_LOOKS[id] || {};
    // SLOT_THEMES, not SLOT_MACHINES — the `art:` blocks live on the THEME and are what reelArt() resolves
    // into the map the client hands artFor(). Reading the wrong export made this gate's first run report
    // twelve symbols as undrawable that are on the screen right now, which is precisely the false confidence
    // a gate is supposed to remove. A check that lies is worse than no check.
    const over = SLOT_THEMES[id]?.art || {};
    // Every symbol this cabinet can actually land, from every source that can put one on the glass.
    const onReels = new Set();
    for (const strip of m.strips || []) {
        for (const [sym, w] of Object.entries(strip)) if (w > 0) onReels.add(sym);
    }
    for (const strip of m.colossal?.strips || []) {
        for (const [sym, w] of Object.entries(strip)) if (w > 0) onReels.add(sym);
    }
    if (m.free?.plus?.sym) onReels.add(m.free.plus.sym);
    for (const g of m.colossal?.giants || []) onReels.add(g);

    // ── 1. A SYMBOL THAT CAN LAND MUST BE DRAWABLE ───────────────────────────────────────────────────────
    // "The multipliers have no sprite." A symbol with no art renders as a hole, and nothing anywhere fails.
    for (const sym of onReels) {
        const drawn = fs.existsSync(path.join(ART_DIR, `${id}-${sym}.webp`));
        if (!drawn && !over[sym]) {
            fail(id, "no art", `"${sym}" can land and has neither ${id}-${sym}.webp nor an art: override`);
        }
    }

    // ── 2. A SYMBOL THAT CAN LAND MUST HAVE A JOB ────────────────────────────────────────────────────────
    // Luke, three times on three boards: "not a payline for both blues and the orange?" A symbol with no pay
    // and no role is a symbol that lines up and does nothing, and nothing tells the player that.
    const roleOf = (sym) => look[sym]?.role || null;
    for (const sym of onReels) {
        const pays = Boolean(m.pays?.[sym]);
        const role = roleOf(sym);
        const excused = role === "scatter" || role === "wild" || role === "mult";
        if (!pays && !excused) {
            fail(id, "pays nothing", `"${sym}" is on the reels with no pay table and no special role`);
        }
        if (pays && !m.pays[sym][3]) {
            fail(id, "no three-of-a-kind", `"${sym}" pays at 4 or 5 but not at 3 — the commonest line on the reel pays nothing`);
        }
    }

    // ── 3. A LINE TRIGGER MUST BE REACHABLE ──────────────────────────────────────────────────────────────
    // The one that cost the most. Three on a payline walks reels one, two and three; The Deep's starfish sat
    // on one, three and five, so reel two could never show one. The bonus fired ZERO times in 200,000 spins
    // and the cabinet ran at 50% RTP. The trap is documented on evaluate()'s lineTrigger and I walked into it
    // anyway, which is exactly why it belongs in a gate rather than in a comment.
    if (m.lineTrigger && m.scatter && m.strips) {
        const need = 3;
        for (let r = 0; r < need && r < REELS; r += 1) {
            if (!(m.strips[r]?.[m.scatter] > 0)) {
                fail(id, "trigger impossible", `lineTrigger needs ${m.scatter} on reels 1-${need}, but reel ${r + 1} has none — the bonus can never fire`);
            }
        }
    }

    // ── 4. A ROUND'S SHAPE MUST SURVIVE THE HAND-OFF ─────────────────────────────────────────────────────
    // The cabinet declares its round; a builder in the engine turns that into an `offer`; the play file maps
    // the result for the screen. Anything one of those forgets is a feature that exists only in the config.
    // `sticky` was written `false` outright in the builder and the payload never sent `mult`, `held`,
    // `justHeld` or `pearls` — so The Deep asked for locking wilds and a growing multiplier and got neither.
    const ROUND_KEYS = ["sticky", "plus", "mult"];
    for (const key of ROUND_KEYS) {
        if (m.free?.[key] === undefined) continue;
        // A WINDOW, NOT THE REST OF THE FILE. Slicing from the builder to the end of the file passed
        // `sticky` on a word that appears two hundred lines later on a DIFFERENT round — a false negative,
        // which is the only kind of gate bug that matters. Found by deliberately re-breaking the builder
        // and watching this report the wrong key. A gate has to be tested by breaking the thing it guards.
        const builderAt = ENGINE.indexOf("offer = { id: m.free.kind");
        const builder = builderAt < 0 ? "" : ENGINE.slice(builderAt, builderAt + 320);
                // `\\b` and not `\b`: inside a template literal a single backslash-b is the
        // BACKSPACE character, so the pattern matched nothing and the check passed on everything. It was
        // reporting a real break correctly by accident (empty window) and a healthy builder as broken.
        if (!new RegExp(`\\b${key}\\b`).test(builder)) {
            fail(id, "dropped in builder", `free.${key} is declared but the offer builder does not carry it`);
        }
    }
    // The per-spin fields the screen needs to animate a round that CHANGES as it runs. Checked once rather
    // than per cabinet — they are one mapper.
    if (m.free?.sticky && !/justHeld:\s*sp\.justHeld/.test(PLAY)) {
        fail(id, "dropped in payload", "free.sticky is declared but the free-spin payload does not send justHeld");
    }
    if (m.free?.plus && !/pearls:\s*sp\.pearls/.test(PLAY)) {
        fail(id, "dropped in payload", "free.plus is declared but the free-spin payload does not send pearls");
    }
    if (m.free?.plus && !/mult:\s*sp\.mult/.test(PLAY)) {
        fail(id, "dropped in payload", "a collecting round's multiplier changes per spin but the payload does not send mult");
    }

    // ── 5. AND THE SCREEN MUST ACTUALLY DRAW IT ──────────────────────────────────────────────────────────
    // "Declared but never mounted." A payload field nothing renders is the same bug one layer along.
    if (m.free?.plus?.sym && !CLIENT.includes("plusSym")) {
        fail(id, "never drawn", "free.plus declares a collector symbol and no cabinet component renders it");
    }

    // ── 6. A ROUND HAS TO END ON SOMETHING ───────────────────────────────────────────────────────────────
    // "When finishing the free spins we need a recap modal with dopamine and sprites and motion and sounds
    // and particle effects." Every free round on the floor ends on the same screen or it ends on nothing.
    if (m.free && !/s5-tally/.test(CLIENT)) {
        fail(id, "no ending", "this cabinet has a free round and no component renders the round recap");
    }

    // ── 7. A BONUS HAS TO BE WATCHED ARRIVING ────────────────────────────────────────────────────────────
    // "I keep getting the bonus and there is no build up or visibility." A cabinet whose bonus can be
    // approached must hold the reel that could complete it — the tease is not decoration, it is the feature.
    if (m.free && !/is-teased|is-held/.test(CLIENT)) {
        fail(id, "no build-up", "this cabinet has a free round and nothing holds the reel that could open it");
    }

    // ── 8. NO OPERATING-SYSTEM ART IN A CABINET'S OWN WORDS ──────────────────────────────────────────────
    // The Den's standing rule: a sprite or a react-icons glyph, never an emoji. It renders differently on
    // every device and carries no house style.
    for (const [field, text] of [["label", m.label], ["blurb", m.blurb], ["free label", m.free?.label]]) {
        if (text && EMOJI.test(text)) fail(id, "emoji", `${field} contains an emoji — draw it or use a glyph`);
    }

    // Not a failure, but worth printing: a cabinet whose money is all in the base game is a cabinet with
    // nothing to wait for. Luke's whole direction has been the opposite of that.
    if (!m.free && !m.second && !m.colossal) notes.push(`${id} has no feature round at all`);
}

// ── REPORT ──────────────────────────────────────────────────────────────────────────────────────────────────
const label = (id) => SLOTS5[id]?.label || id;
if (problems.length) {
    const byMachine = {};
    for (const p of problems) (byMachine[p.machine] ||= []).push(p);
    for (const [id, list] of Object.entries(byMachine)) {
        console.log(`\n  ${label(id)}`);
        for (const p of list) console.log(`    ✗ ${p.rule.padEnd(20)} ${p.msg}`);
    }
}
for (const n of notes) console.log(`\n  · ${n}`);

console.log("");
if (problems.length) {
    console.log(`check:polish — ${problems.length} problem(s). Every one of these is a feature that exists in`);
    console.log("  the config and not on the screen. None of them would fail a build.");
    process.exit(1);
}
console.log("check:polish — nothing is nailed shut: every symbol that can land is drawable and has a job,");
console.log("  every trigger is reachable, and every round's shape survives the hand-off to the screen.");
console.log("  It has not LOOKED at anything — a button off the bottom of a phone still needs the film rig.");
