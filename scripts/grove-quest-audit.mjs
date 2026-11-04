// ── DOES EVERY QUEST STEP SAY THE SAME THING TO ITSELF? ─────────────────────────────────────────────────────
// Luke, on the Blind Cartographer: "Yo this makes zero sense. How many quests are nonsense like this"
//
//   title   Make Noise at the Fourth
//   ask     "Go to the 6th chamber and make noise."
//   bar     0/6
//   nudge   "I've heard nothing from the fourth. You're not there."
//
// Three numbers for one instruction. The ask is TEMPLATED -- "{n_zone}th chamber" -- and resolves off the
// step's real zone; the title and the nudge have the ordinal TYPED INTO THEM. So the moment the generated
// zone is not the one the writer had in mind, the step argues with itself, and nothing can catch it because
// both halves are individually valid strings.
//
// This renders all 71 steps the way the game does and flags:
//   · an ordinal written into the title/problem/nudge/done that is not the step's own zone
//   · {n} used where a PLACE is meant (the count standing in for the chamber number)
//   · a need of 1 rendered as a plural, and other small lies the templating can tell
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-quest-audit.mjs
import { GROVE_NPCS, questsFor, npcsOnMap, foeName, partName } from "@/lib/marketplace/grove-npcs.js";
import { stepLines, fill } from "@/lib/marketplace/grove-npc-dialogue.js";

const ORD = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
    seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};
const ORD_RE = new RegExp(`\\b(${Object.keys(ORD).join("|")})\\b`, "gi");
const NUM_ORD_RE = /\b(\d{1,2})(?:st|nd|rd|th)\b/g;

const rows = [];
for (let map = 1; map <= 7; map += 1) {
    for (const npc of npcsOnMap(map)) {
        for (const step of questsFor(npc.id)) {
            const l = stepLines(step.id, npc.id, npc.line);
            const names = { foe: foeName(step.foe), part: partName(step.part) };
            const f = (x) => fill(x, step, names);
            // The zone this step is really about, in the same local terms the ask uses.
            const localZone = step.kind === "delve"
                ? step.need
                : step.zone ? ((step.zone - 1) % 12) + 1 : null;

            const text = {
                title: f(step.title || ""),
                problem: (l.problem || []).map(f).join(" "),
                ask: f(l.ask),
                nudge: f(l.nudge),
                done: (l.done || []).map(f).join(" "),
            };

            const problems = [];
            // 1. An ordinal that is not this step's zone, anywhere in the step's own words.
            for (const [where, s] of Object.entries(text)) {
                const found = [];
                for (const m of String(s).matchAll(ORD_RE)) {
                    // ⚠️ "second" IS ALSO A UNIT AND HALF AN IDIOM. "Twelve-second return" and "the second
                    // half is the job" are both correct English about something that is not a chamber, and
                    // they were the last two entries standing after the real four were fixed.
                    const before = String(s).slice(Math.max(0, m.index - 14), m.index);
                    const after = String(s).slice(m.index + m[1].length, m.index + m[1].length + 8);
                    if (/\b(\w+-|\d+\s*)$/.test(before) || /^\s*(half|time|hand|thought)/i.test(after)) continue;
                    found.push({ n: ORD[m[1].toLowerCase()], w: m[1] });
                }
                for (const m of String(s).matchAll(NUM_ORD_RE)) found.push({ n: Number(m[1]), w: m[0] });
                // ⚠️ ONLY A STEP THAT HAS A ZONE CAN CONTRADICT ITSELF ABOUT ONE. Everything else is
                // narrative — "a second tide", "the first time I asked", "raise it a tenth time" — and
                // flagging those made the report fifteen long when the real defect was four. A sweep that
                // cries wolf is a sweep nobody runs twice.
                if (localZone != null) {
                    for (const g of found) {
                        if (g.n !== localZone) problems.push(`${where}: says "${g.w}" but the zone is ${localZone}`);
                    }
                }
            }
            // 2. The raw template using {n} where a place is meant.
            const raw = [l.ask, l.nudge, ...(l.problem || []), ...(l.done || [])].filter(Boolean).join(" ");
            if (/\{n\}\s*(th|st|nd|rd)?\s*(chamber|room|zone|level|deep|hollow)/i.test(raw)) {
                problems.push(`template: {n} used where {n_zone} is meant`);
            }
            // 3. "1" asked for in the plural.
            if (step.need === 1 && /\b(them all|each of|every)\b/i.test(text.ask)) {
                problems.push(`ask: plural wording for a need of 1`);
            }

            rows.push({ map, npc: npc.id, id: step.id, kind: step.kind, need: step.need,
                zone: step.zone ?? null, localZone, text, problems });
        }
    }
}

const bad = rows.filter((r) => r.problems.length);
console.log(`${rows.length} steps across ${GROVE_NPCS.length} givers.`);
console.log(`${bad.length} say something that contradicts the step itself.\n`);

const byKind = {};
for (const r of bad) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log("by kind:", Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join("  ") || "none");
console.log();

for (const r of bad) {
    console.log(`── ${r.id}  (map ${r.map}, ${r.kind}, need ${r.need}, zone ${r.zone} = local ${r.localZone})`);
    console.log(`   title : ${r.text.title}`);
    console.log(`   ask   : ${r.text.ask}`);
    if (r.text.nudge) console.log(`   nudge : ${r.text.nudge}`);
    for (const p of r.problems) console.log(`   ✗ ${p}`);
    console.log();
}
