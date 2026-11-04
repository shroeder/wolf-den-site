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
import { fill } from "@/lib/marketplace/grove-quest-text.js";

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
            const zoneN = step.zone || (step.kind === "delve" ? step.need : null);
            const names = { foe: foeName(step.foe), part: partName(step.part),
                zone: zoneN ? (zoneByN(zoneN)?.name || null) : null };
            const f = (x) => fill(x, step, names);
            // The zone this step is really about, in the same local terms the ask uses.
            const localZone = step.kind === "delve"
                ? step.need
                : step.zone ? ((step.zone - 1) % 12) + 1 : null;

            // ⚠️ ONLY THE TITLE IS LEFT TO CHECK. The dialogue is gone, so the step's own name is the
            // whole of its authored text -- and it is still a template, so it can still ship a brace or
            // name a room by number.
            const text = { title: f(step.title || "") };

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
                // ⚠️ THE ASK IS BUILT NOW, NOT AUTHORED. This used to require the step's own PROSE to
                // contain the zone's name, which was right when a writer typed the ask by hand. With the
                // dialogue gone the screens compose it from fields — so what has to be true is that the
                // step RESOLVES to a real place for them to name. A delve whose zone does not resolve
                // renders "Reach the far room", which is the old defect wearing a fallback.
                if (!names.zone) {
                    problems.push(`has no resolvable destination — the card can only say "the far room"`);
                }
                for (const [where, v] of Object.entries(text)) {
                    const hits = ordinalsIn(v);
                    if (hits.length) {
                        problems.push(`${where}: calls it "${hits[0].w}" — no screen in the game names a room by number`);
                    }
                }
            }

            // ⚠️ 3. DID ANYTHING SHIP A RAW TEMPLATE? Luke: "I see make noise in brackets zone name
            // bracket." The title is a template and there were THREE ways out of grove-quests.js —
            // questBoard filled its copy, and the in-play toast and the hand-in result did not. A token
            // that reaches a screen is the most visible possible bug and the cheapest possible check.
            for (const [where, v] of Object.entries(text)) {
                const left = String(v).match(/\{[a-zA-Z_]+\}/g);
                if (left) problems.push(`${where}: shipped an unfilled template — ${left.join(", ")}`);
            }

            // ⚠️ THE PLURAL CHECK WENT WITH THE ASK. It read the authored "ask" line, which no longer
            // exists — the screens build that sentence from kind + need + the creature's name now, so
            // there is no hand-written plural left to get wrong.

            rows.push({ map, npc: npc.id, id: step.id, kind: step.kind, need: step.need,
                zone: step.zone ?? null, localZone, text, problems });
        }
    }
}

const bad = rows.filter((r) => r.problems.length);
// Givers now include the seven Coliseum marshals, which GROVE_NPCS does not list.
const givers = new Set(rows.map((r) => r.npc));
console.log(`${rows.length} steps across ${givers.size} givers.`);
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
