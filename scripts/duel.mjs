// ── TWO REAL MEMBERS, THE REAL RING, MOVE BY MOVE ────────────────────────────────────────────────────────────
// Luke: "we have real players with real nodes... use me and jt", and "use strategy on both sides, using skills
// off cooldown and using the best skill for the situation. actually waiting for turns and letting all the code
// run normally but you get to control both players."
//
// Nothing is invented here. Both fighters are built by kitFor() — real gear, real tree nodes, real badges, real
// pets — and both decks are their REAL purchased skills, filtered by class exactly as arena.js does. The ring
// is autoRing, the one the game runs. Both sides are played by housePick, which is not a rotation: it skips
// every skill still on cooldown, scores the rest against the live state of the fight (own hp, foe hp, shield,
// whether they are bleeding or burning) and takes the best one. Turns advance on the ATB bar, as they do in a
// real bout.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/duel.mjs "JT" "The Wolf Den" [bouts]
import { db } from "../src/lib/db.js";
import { kitFor } from "../src/lib/marketplace/arena.js";
import { autoRing } from "../src/lib/marketplace/arena-ring.js";
import { skillsForClass } from "../src/lib/marketplace/arena-skills.js";

const A_NAME = process.argv[2] || "JT";
const B_NAME = process.argv[3] || "The Wolf Den";
const BOUTS = Number(process.argv[4]) || 500;
const seeded = (n) => { let x = n >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

const find = async (nm) => {
    const r = await db.queryOne(
        `SELECT a.buyer_id, a.arena_class, a.skill_tree, a.skills, COALESCE(b.display_name, b.alias) AS name
           FROM mkt_arena a JOIN mkt_buyer b ON b.id = a.buyer_id
          WHERE LOWER(COALESCE(b.display_name, b.alias)) LIKE LOWER($1)
          ORDER BY a.vp DESC NULLS LAST LIMIT 1`, [`%${nm}%`]);
    if (!r) { console.error(`duel: nobody matches "${nm}"`); process.exit(1); }
    return r;
};

// Their real deck, filtered to their class — arena.js:1022, field for field.
const realDeck = (cls, stored) => {
    const mine = new Set(skillsForClass(cls || "").map((x) => x.id));
    const out = {};
    for (const [id, nodes] of Object.entries(stored || {})) if (mine.has(id) && Array.isArray(nodes)) out[id] = nodes;
    return out;
};

const a = await find(A_NAME);
const b = await find(B_NAME);
const [aKit, bKit] = [await kitFor(a.buyer_id), await kitFor(b.buyer_id)];
const [aDeck, bDeck] = [realDeck(a.arena_class, a.skills), realDeck(b.arena_class, b.skills)];

const sk = (d) => Object.entries(d).map(([id, n]) => `${id}${n.length ? `+${n.length}` : ""}`).join(", ") || "(none bought)";
const tree = (t) => Object.entries(t || {}).filter(([, v]) => v).map(([k, v]) => `${k}x${v}`).join(", ") || "(none)";
for (const [p, kit, deck] of [[a, aKit, aDeck], [b, bKit, bDeck]]) {
    console.log(`\n  ${p.name} — ${p.arena_class}`);
    console.log(`    dmg ${Math.round(kit.damage)}  hp ${Math.round(kit.health)}  armour ${Math.round(kit.armor)}  tempo ${(kit.tempo || 0).toFixed(2)}`);
    console.log(`    tree  : ${tree(p.skill_tree)}`);
    console.log(`    skills: ${sk(deck)}`);
}

// ── ONE BOUT, EVERY BEAT ─────────────────────────────────────────────────────────────────────────────────────
const show = Number(process.env.DUEL_SHOW || 1);
for (let i = 0; i < show; i += 1) {
    const r = autoRing({ ...aKit }, { ...bKit }, { rng: seeded(4241 + i * 7919), mySkills: aDeck, foeSkills: bDeck, foeName: b.name });
    console.log(`\n  ── BOUT ${i + 1}: ${a.name} vs ${b.name} — ${r.won ? a.name : b.name} wins in ${r.beat} beats ──`);
    for (const l of r.log) {
        const who = l.who === "me" ? a.name : b.name;
        const bits = [];
        if (l.text) bits.push(l.text);
        if (l.skill?.name) bits.push(`[${l.skill.name}]`);
        if (l.dealt != null) bits.push(`${l.dealt} dmg`);
        if (l.bleedTick) bits.push("bleed tick");
        if (l.burnTick) bits.push("burn tick");
        if (l.stunnedSkip) bits.push("STUNNED — beat lost");
        if (l.chilledSkip) bits.push("CHILLED — beat lost");
        if (!bits.length) continue;
        console.log(`     ${String(who).slice(0, 12).padEnd(13)} ${bits.join("  ")}`
            + `   (${a.name.slice(0, 6)} ${Math.round(l.meHp ?? 0)} / ${b.name.slice(0, 6)} ${Math.round(l.foeHp ?? 0)})`);
    }
}

let w = 0;
let beats = 0;
for (let s = 0; s < BOUTS; s += 1) {
    const r = autoRing({ ...aKit }, { ...bKit }, { rng: seeded(4241 + s * 7919), mySkills: aDeck, foeSkills: bDeck, foeName: b.name });
    if (r.won) w += 1;
    beats += r.beat;
}
console.log(`\n  ${BOUTS} bouts, both sides playing their real skills off cooldown:`);
console.log(`    ${a.name}  ${((w / BOUTS) * 100).toFixed(1)}%`);
console.log(`    ${b.name}  ${(((BOUTS - w) / BOUTS) * 100).toFixed(1)}%`);
console.log(`    average ${Math.round(beats / BOUTS)} beats a bout\n`);
