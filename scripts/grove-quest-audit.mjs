// ── CAN A PLAYER ACT ON WHAT EVERY QUEST STEP SAYS? ─────────────────────────────────────────────────────────
// Luke, twice. First: "Yo this makes zero sense. How many quests are nonsense like this" — a step whose
// title said "the Fourth", whose ask said "the 6th chamber" and whose bar said 0/6. Then, after I made
// those three numbers agree: "I don't understand what go to the sixth chamber means."
//
// ⚠️ THE SECOND COMPLAINT IS THE REAL ONE AND I FIXED THE FIRST. Making the ordinals agree left the step
// perfectly consistent and still unusable, because NOTHING IN THE GAME CALLS A ZONE BY A NUMBER. The atlas,
// the zone strip and the quest log's travel buttons all say The Spore Hall. The number was an index into a
// list the player has never been shown.
//
// So this renders all 71 steps the way the game does and asks two questions:
//
//   DOES IT AGREE WITH ITSELF?   no ordinal anywhere in the step may name a room that is not its own
//   CAN IT BE FOLLOWED?          a step that sends you somewhere must NAME the somewhere, and must not
//                                name it by number — whether or not the number is right
//
// ⚠️ AND IT MUST NOT CRY WOLF. The first cut flagged fifteen by catching every ordinal anywhere, which
// swept up "a second tide", "the first time I asked" and "raise it a tenth time" — all narrative, all
// correct. ordinalsIn() below knows that "second" is also a unit and half an idiom. A sweep nobody trusts
// is a sweep nobody runs twice.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-quest-audit.mjs
import { GROVE_NPCS, questsFor, npcsOnMap, foeName, partName, zoneByN } from "@/lib/marketplace/grove-npcs.js";
import { stepLines, fill } from "@/lib/marketplace/grove-npc-dialogue.js";

const ORD = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
    seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};
const ORD_RE = new RegExp(`\\b(${Object.keys(ORD).join("|")})\\b`, "gi");
const NUM_ORD_RE = /\b(\d{1,2})(?:st|nd|rd|th)\b/g;

/**
 * Every ordinal in a line that is actually ABOUT A ROOM.
 *
 * ⚠️ "second" IS ALSO A UNIT AND HALF AN IDIOM. "Twelve-second return" and "the second half is the job"
 * are both correct English about something that is not a chamber, and they were the last two entries
 * standing after the real defects were fixed. Shared by both rules below, because the first rule learned
 * this and then the second one re-flagged the identical two lines.
 */
function ordinalsIn(line) {
    const s = String(line);
    const out = [];
    for (const m of s.matchAll(ORD_RE)) {
        const before = s.slice(Math.max(0, m.index - 14), m.index);
        const after = s.slice(m.index + m[1].length, m.index + m[1].length + 8);
        if (/\b(\w+-|\d+\s*)$/.test(before) || /^\s*(half|time|hand|thought)/i.test(after)) continue;
        out.push({ n: ORD[m[1].toLowerCase()], w: m[1] });
    }
    for (const m of s.matchAll(NUM_ORD_RE)) out.push({ n: Number(m[1]), w: m[0] });
    return out;
}

const rows = [];
for (let map = 1; map <= 7; map += 1) {
    for (const npc of npcsOnMap(map)) {
        for (const step of questsFor(npc.id)) {
            const l = stepLines(step.id, npc.id, npc.line);
            const zoneN = step.zone || (step.kind === "delve" ? step.need : null);
            const names = { foe: foeName(step.foe), part: partName(step.part),
                zone: zoneN ? (zoneByN(zoneN)?.name || null) : null };
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
                const found = ordinalsIn(s);
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
            // ⚠️ 2. CAN A PLAYER ACT ON IT? Luke: "I don't understand what go to the sixth chamber
            // means." The step was internally consistent by then -- it said "sixth" in all four places --
            // and still unusable, because nothing in the game calls a zone by a number. The atlas, the
            // zone strip and the log's travel buttons all say The Spore Hall.
            //
            // So a step that sends you somewhere must NAME the somewhere. An ordinal or a bare index in
            // the prose of a delve/survive step is the defect, whether or not it agrees with itself.
            if (["delve", "survive"].includes(step.kind)) {
                const all = Object.values(text).join(" ");
                if (names.zone && !all.includes(names.zone)) {
                    problems.push(`never names its destination (${names.zone})`);
                }
                for (const [where, v] of Object.entries(text)) {
                    const hits = ordinalsIn(v);
                    if (hits.length) {
                        problems.push(`${where}: calls it "${hits[0].w}" — no screen in the game names a room by number`);
                    }
                }
            }

            // 3. The raw template using {n} where a place is meant.
            const raw = [l.ask, l.nudge, ...(l.problem || []), ...(l.done || [])].filter(Boolean).join(" ");
            if (/\{n\}\s*(th|st|nd|rd)?\s*(chamber|room|zone|level|deep|hollow)/i.test(raw)) {
                problems.push(`template: {n} used where {n_zone} is meant`);
            }
            // ⚠️ 4. DID ANYTHING SHIP A RAW TEMPLATE? Luke: "I see make noise in brackets zone name
            // bracket." The title is a template and there were THREE ways out of grove-quests.js —
            // questBoard filled its copy, and the in-play toast and the hand-in result did not. A token
            // that reaches a screen is the most visible possible bug and the cheapest possible check.
            for (const [where, v] of Object.entries(text)) {
                const left = String(v).match(/\{[a-zA-Z_]+\}/g);
                if (left) problems.push(`${where}: shipped an unfilled template — ${left.join(", ")}`);
            }

            // 5. "1" asked for in the plural.
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
console.log(`${bad.length} say something a player cannot act on.\n`);

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
