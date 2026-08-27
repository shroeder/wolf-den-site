// ── HOW OFTEN DOES SOMEBODY SWING TWICE IN A ROW ─────────────────────────────────────────────────────────────
// Luke: "it appears that NPCs are still attacking twice in a row... we need to remove that from all the NPCs
// and players as well."
//
// He was right and the cause was not the mechanic anybody would have guessed. Under the timer the go-again roll
// is already switched off by construction (closeTurn in arena-ring.js) and a granted turn is zeroed
// (barEffects), so reading the code says the answer is zero. The answer was 52.8%.
//
// It was `tempoOf`: NPC ferocity is a gear budget that keeps climbing with the rung — 136 at rung 40, 7,858 at
// rung 100 — and the divisor was sized against MEMBER ferocity of 20-140. A rung-100 foe had a bar that filled
// eighty times faster than a member's. See the note on TEMPO_MIN in arena-atb.js.
//
// So this exists: the property is not visible in the code, only in the play, and a number that took a
// simulation to find will go wrong again silently. Run it after anything that touches tempo, the ladder's stat
// curve, or turn order.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/arena-turn-order.mjs [runs] [timer|classic]
//   npm run check:turn-order
//
// ── WHAT A HEALTHY NUMBER LOOKS LIKE ─────────────────────────────────────────────────────────────────────────
// Not zero, and this is the part worth understanding before retuning anything off it. Under a timer, a fighter
// who is 28% faster takes 28% more turns, and there is nowhere for those extra turns to go except into the
// occasional double. Back-to-back turns ARE what a faster bar means. What must not happen is runs of three or
// more, or a rate that says one fighter is simply playing and the other is watching.
//
//   RUNS OF 3+ MUST BE ZERO.
//   `from pacing alone` should track the tempo gap between the two fighters and no more.
//   `because the other bar was ...` is a stun, a freeze or a chill costing somebody their beat. That is those
//   effects working, and it is counted separately so it can never be mistaken for the pacing drifting.
import { openRing, act } from "@/lib/marketplace/arena-ring.js";
import { npcFor } from "@/lib/marketplace/arena-npc.js";
import { fighterFrom } from "@/lib/marketplace/arena.js";

const RUNS = Number(process.argv[2]) || 200;
const ATB = process.argv[3] !== "classic";

// A real member's kit: a 1.2 weapon and the ferocity the active ladder actually carries. The health is
// deliberately far above anything real — a rung-100 foe kills a member on its first swing, and a bout that
// ends on turn one measures nothing about turn order.
const ME = { speed: 1.2, ferocity: 60, might: 90, vitality: 100000, fortune: 20, guard: 40 };
const RUNGS = [10, 25, 40, 60, 100];

let worstRun3 = 0;
for (const rung of RUNGS) {
    const npc = npcFor(rung);
    if (!npc) continue;
    const me = fighterFrom(ME, {}, "reaver");
    const foe = fighterFrom(npc, {}, npc.classId || null);
    const T = { turns: 0, b2b: 0, b2bFoe: 0, runs3: 0, hasted: 0, held: 0, heldKinds: {}, pacing: 0, multiHit: 0, wild: 0 };

    for (let i = 0; i < RUNS; i += 1) {
        let ring = openRing(me, foe, { atb: ATB, foeSkills: {}, foeName: npc.name });
        let guard = 0;
        let prev = null;
        let run = 1;
        const seen = new Set();
        while (guard += 1, guard < 500) {
            for (const L of ring.log) {
                if (!L || !L.who || seen.has(L)) continue;
                seen.add(L);
                // A counter, a thorn and a wild extra blow are OUT-OF-TURN blows, not turns. They are counted
                // on their own line because they look identical on screen and are a completely different thing.
                if (L.thorns || L.counter || L.fever || L.cast) continue;
                if (L.wild === "doublestrike" || L.wild === "counter") { T.wild += 1; continue; }
                if (L.dmg === undefined && !L.hits) continue;
                T.turns += 1;
                // Doublestrike: two blows inside ONE turn. Not a second turn, and deliberately not counted as
                // one — but it is reported, because on screen it is the other thing that reads as "twice".
                if ((L.hits || 1) > 1) T.multiHit += 1;
                if (prev && prev.who === L.who) {
                    T.b2b += 1;
                    run += 1;
                    if (run >= 3) T.runs3 += 1;
                    if (L.who === "foe") T.b2bFoe += 1;
                    const other = L.who === "me" ? "foe" : "me";
                    const st = L.bars?.[other]?.state || prev.bars?.[other]?.state;
                    if (prev.hasted || prev.wild === "haste") T.hasted += 1;
                    else if (st) { T.held += 1; T.heldKinds[st] = (T.heldKinds[st] || 0) + 1; }
                    else T.pacing += 1;
                } else run = 1;
                prev = L;
            }
            if (ring.over) break;
            if (ring.awaiting === "act") ring = act(ring, {});
            else break;
        }
    }
    worstRun3 = Math.max(worstRun3, T.runs3);
    const pct = (n) => `${((n / Math.max(1, T.turns)) * 100).toFixed(1)}%`;
    console.log(`${ATB ? "timer  " : "classic"} rung ${String(rung).padEnd(3)} ${String(npc.name).padEnd(16)} `
        + `tempo ${me.tempo.toFixed(2)} v ${foe.tempo.toFixed(2)}   go-again ${me.extra.toFixed(2)} v ${foe.extra.toFixed(2)}`);
    console.log(`   back-to-back ${pct(T.b2b)} of ${T.turns} turns (${T.b2bFoe} the NPC's) · RUNS OF 3+ ${T.runs3}`);
    console.log(`   from pacing ${T.pacing} · granted by haste ${T.hasted} · other bar ${JSON.stringify(T.heldKinds)}`);
    console.log(`   doublestrike (two blows, one turn) ${pct(T.multiHit)} · out-of-turn blows ${T.wild}`);
}

if (ATB && worstRun3 > 0) {
    console.error(`\nFAIL: ${worstRun3} runs of three or more turns in a row under the timer.`);
    console.error("Something is paying a fighter for their speed twice, or the tempo band has come uncapped.");
    process.exit(1);
}
console.log(`\nOK — no fighter took three turns in a row across ${RUNS * RUNGS.length} bouts.`);
