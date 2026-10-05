// ── HOW OFTEN DOES THE CHAIN ACTUALLY REACH THE TRIGGER? ─────────────────────────────────────────────────────
// Luke, on The Vault: "This feels like its pre-programmed to never win it again. It goes 4 but never 5 cascades."
//
// A player cannot tell a long tail from a wall. Both look like "it never happens", and the only difference is a
// number nobody can see from the chair. So this counts it: every cascade depth the engine actually produces,
// over enough spins that the tail is real, straight through playSpin — the same function the cabinet calls.
//
// ⚠️ A SIMULATION IS THE RIGHT TOOL *HERE* AND IS THE WRONG TOOL FOR THE ARENA. Arena balance has to come off
// real bouts because the inputs are members' gear and choices, which no sim models. A slot has no inputs: the
// grid is the machine's own RNG and this calls the real one, so the distribution it prints IS the machine's.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/casino-cascades.mjs [--spins 200000] [--machine vault]
import { SLOTS5, playSpin } from "@/lib/marketplace/casino-slot5.js";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
const SPINS = Number(arg("--spins", 200000));
const ONLY = arg("--machine", null);

const ids = ONLY ? [ONLY] : Object.keys(SLOTS5).filter((k) => SLOTS5[k].winAgain);

for (const id of ids) {
    const m = SLOTS5[id];
    if (!m?.winAgain) { console.log(`${id}: no WIN IT AGAIN on this cabinet`); continue; }
    const need = m.winAgain.need;
    const depth = new Map();
    let fired = 0;
    for (let i = 0; i < SPINS; i += 1) {
        const r = playSpin(id, 100);
        const c = r?.chain?.cascades || 0;
        depth.set(c, (depth.get(c) || 0) + 1);
        if (r?.winAgain) fired += 1;
    }
    const keys = [...depth.keys()].sort((a, b) => a - b);
    const max = Math.max(...keys);
    console.log(`\n── ${m.name || id} ──  needs ${need} cascades  ·  ${SPINS.toLocaleString()} spins`);
    for (const k of keys) {
        const n = depth.get(k);
        const pct = (n / SPINS) * 100;
        const bar = "#".repeat(Math.max(0, Math.round(pct / 2)));
        console.log(`   ${String(k).padStart(2)} cascades  ${String(n).padStart(8)}  ${pct.toFixed(4).padStart(9)}%  ${bar}`);
    }
    const atOrOver = keys.filter((k) => k >= need).reduce((n, k) => n + depth.get(k), 0);
    console.log(`   deepest chain seen: ${max}`);
    console.log(`   reached ${need}+: ${atOrOver} of ${SPINS} = ${((atOrOver / SPINS) * 100).toFixed(4)}%`);
    console.log(`   WIN IT AGAIN fired: ${fired}  (about 1 in ${fired ? Math.round(SPINS / fired).toLocaleString() : "∞"} spins)`);
}
